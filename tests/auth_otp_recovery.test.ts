import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateRecoveryInput,
    mapRecoveryErrorMessage,
    performOtpPasswordReset,
} from '../src/lib/authRecovery';

test('validateRecoveryInput: validaciones estrictas de OTP de 6 dígitos y contraseña', () => {
    // 1. Código OTP incompleto o vacío
    const emptyOtp = validateRecoveryInput('', 'Pass1234', 'Pass1234');
    assert.equal(emptyOtp.isValid, false);
    assert.match(emptyOtp.error || '', /6 dígitos/i);

    const shortOtp = validateRecoveryInput('12345', 'Pass1234', 'Pass1234');
    assert.equal(shortOtp.isValid, false);
    assert.match(shortOtp.error || '', /6 dígitos/i);

    const nonDigitOtp = validateRecoveryInput('abc-12', 'Pass1234', 'Pass1234');
    assert.equal(nonDigitOtp.isValid, false);
    assert.match(nonDigitOtp.error || '', /6 dígitos/i);

    // 2. Contraseña corta (< 6 caracteres)
    const shortPass = validateRecoveryInput('123456', '12345', '12345');
    assert.equal(shortPass.isValid, false);
    assert.match(shortPass.error || '', /al menos 6 caracteres/i);

    // 3. Contraseñas no coinciden
    const mismatchPass = validateRecoveryInput('123456', 'Pass1234', 'Pass5678');
    assert.equal(mismatchPass.isValid, false);
    assert.match(mismatchPass.error || '', /no coinciden/i);

    // 4. Caso válido
    const valid = validateRecoveryInput(' 839201 ', 'NuevaClave123', 'NuevaClave123');
    assert.equal(valid.isValid, true);
    assert.equal(valid.error, undefined);

    // 5. Código formateado con guiones o espacios (ej. "839-201")
    const validFormatted = validateRecoveryInput('839-201', 'Segura#2026', 'Segura#2026');
    assert.equal(validFormatted.isValid, true);
});

test('mapRecoveryErrorMessage: mapeo claro a mensajes en español amigables', () => {
    // Expired
    assert.match(mapRecoveryErrorMessage({ message: 'Token has expired or is invalid' }), /expirado/i);
    assert.match(mapRecoveryErrorMessage({ code: 'otp_expired' }), /expirado/i);
    assert.match(mapRecoveryErrorMessage('invalid_link'), /expirado|no es válido/i);

    // Invalid code
    assert.match(mapRecoveryErrorMessage({ message: 'Token is invalid' }), /incorrecto|inválido/i);
    assert.match(mapRecoveryErrorMessage('El token ingresado es incorrecto'), /incorrecto|inválido/i);

    // Rate limit
    assert.match(mapRecoveryErrorMessage({ message: 'Email rate limit exceeded' }), /límite de intentos|solicitado varios códigos/i);
    assert.match(mapRecoveryErrorMessage({ message: 'over_email_send_rate_limit' }), /límite de intentos|solicitado varios códigos/i);

    // Password requirements
    assert.match(mapRecoveryErrorMessage({ message: 'New password should be different from old password' }), /diferente/i);
    assert.match(mapRecoveryErrorMessage({ message: 'Password should be at least 6 characters' }), /al menos 6 caracteres/i);

    // Fallback genérico
    assert.match(mapRecoveryErrorMessage(null), /error inesperado/i);
});

test('performOtpPasswordReset: flujo exitoso con verifyOtp(recovery), updateUser y perfil actualizado', async () => {
    let verifyOtpCalledWith: any = null;
    let updateUserCalledWith: any = null;
    let profileUpdateCalledWith: any = null;

    const mockSupabase = {
        auth: {
            verifyOtp: async (params: any) => {
                verifyOtpCalledWith = params;
                return {
                    data: {
                        user: { id: 'usr-recovery-123', email: 'test@frufresco.com' },
                        session: { access_token: 'fake-jwt', user: { id: 'usr-recovery-123' } },
                    },
                    error: null,
                };
            },
            updateUser: async (params: any) => {
                updateUserCalledWith = params;
                return {
                    data: { user: { id: 'usr-recovery-123' } },
                    error: null,
                };
            },
        },
        from: (table: string) => {
            assert.equal(table, 'profiles');
            return {
                update: (fields: any) => ({
                    eq: async (field: string, val: any) => {
                        profileUpdateCalledWith = { fields, field, val };
                        return { error: null };
                    },
                }),
            };
        },
    };

    const result = await performOtpPasswordReset({
        supabaseClient: mockSupabase,
        email: '  test@frufresco.com  ',
        otpCode: '123456',
        newPassword: 'NuevaClaveSegura2026',
        confirmPassword: 'NuevaClaveSegura2026',
    });

    assert.equal(result.success, true);
    assert.equal(result.userId, 'usr-recovery-123');

    // Comprobar parámetros enviados a verifyOtp
    assert.equal(verifyOtpCalledWith.email, 'test@frufresco.com');
    assert.equal(verifyOtpCalledWith.token, '123456');
    assert.equal(verifyOtpCalledWith.type, 'recovery');

    // Comprobar que updateUser recibió la nueva clave
    assert.equal(updateUserCalledWith.password, 'NuevaClaveSegura2026');

    // Comprobar que needs_password_change se limpió en profiles
    assert.deepEqual(profileUpdateCalledWith, {
        fields: { needs_password_change: false },
        field: 'id',
        val: 'usr-recovery-123',
    });
});

test('performOtpPasswordReset: fallback automático a type: email cuando recovery falla', async () => {
    const attempts: string[] = [];

    const mockSupabase = {
        auth: {
            verifyOtp: async (params: any) => {
                attempts.push(params.type);
                if (params.type === 'recovery') {
                    return { data: { user: null, session: null }, error: { message: 'Invalid token' } };
                }
                if (params.type === 'email') {
                    return {
                        data: {
                            user: { id: 'usr-fallback-456', email: 'fallback@frufresco.com' },
                            session: { access_token: 'fake-jwt' },
                        },
                        error: null,
                    };
                }
                return { data: { user: null }, error: { message: 'Unexpected' } };
            },
            updateUser: async () => ({
                data: { user: { id: 'usr-fallback-456' } },
                error: null,
            }),
        },
        from: () => ({
            update: () => ({
                eq: async () => ({ error: null }),
            }),
        }),
    };

    const result = await performOtpPasswordReset({
        supabaseClient: mockSupabase,
        email: 'fallback@frufresco.com',
        otpCode: '654321',
        newPassword: 'ClaveFallback123',
        confirmPassword: 'ClaveFallback123',
    });

    assert.equal(result.success, true);
    assert.equal(result.userId, 'usr-fallback-456');
    assert.deepEqual(attempts, ['recovery', 'email'], 'Debe intentar primero recovery y luego fallback email');
});

test('performOtpPasswordReset: devuelve error en español cuando ambos tipos de verifyOtp fallan', async () => {
    const mockSupabase = {
        auth: {
            verifyOtp: async () => ({
                data: { user: null, session: null },
                error: { message: 'Token has expired or is invalid', code: 'otp_expired' },
            }),
            updateUser: async () => ({ data: { user: null }, error: null }),
        },
        from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
    };

    const result = await performOtpPasswordReset({
        supabaseClient: mockSupabase,
        email: 'expired@frufresco.com',
        otpCode: '111222',
        newPassword: 'NuevaPassword1',
        confirmPassword: 'NuevaPassword1',
    });

    assert.equal(result.success, false);
    assert.match(result.error || '', /expirado/i);
});
