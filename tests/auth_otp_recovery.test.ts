import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateRecoveryInput,
    mapRecoveryErrorMessage,
    performOtpPasswordReset,
    isSafeRedirectPath,
} from '../src/lib/authRecovery';

test('validateRecoveryInput: validaciones estrictas de OTP de 6 dígitos y contraseña', () => {
    // 1. Código OTP incompleto o vacío
    const emptyOtp = validateRecoveryInput('', 'Pass1234', 'Pass1234');
    assert.equal(emptyOtp.isValid, false);
    assert.match(emptyOtp.error || '', /6 dígitos/i);

    const shortOtp = validateRecoveryInput('12345', 'Pass1234', 'Pass1234');
    assert.equal(shortOtp.isValid, false);
    assert.match(shortOtp.error || '', /6 dígitos/i);

    // Caracteres alfabéticos o inválidos
    const nonDigitOtp = validateRecoveryInput('abc-12', 'Pass1234', 'Pass1234');
    assert.equal(nonDigitOtp.isValid, false);
    assert.match(nonDigitOtp.error || '', /solo debe contener números/i);

    const trailingAlphaOtp = validateRecoveryInput('123456a', 'Pass1234', 'Pass1234');
    assert.equal(trailingAlphaOtp.isValid, false);
    assert.match(trailingAlphaOtp.error || '', /solo debe contener números/i);

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

    // 5. Código formateado con guiones o espacios (ej. "839-201" o "839 201")
    const validFormatted = validateRecoveryInput('839-201', 'Segura#2026', 'Segura#2026');
    assert.equal(validFormatted.isValid, true);

    const validSpaced = validateRecoveryInput('839 201', 'Segura#2026', 'Segura#2026');
    assert.equal(validSpaced.isValid, true);
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

    // Session missing / PKCE
    assert.match(mapRecoveryErrorMessage({ message: 'Auth session missing!' }), /sesión de recuperación no está activa/i);
    assert.match(mapRecoveryErrorMessage({ message: 'PKCE code verifier not found' }), /sesión de recuperación no está activa/i);

    // Signups not allowed / User not found
    assert.match(mapRecoveryErrorMessage({ message: 'Signups not allowed for otp' }), /no se encontró una cuenta/i);
    assert.match(mapRecoveryErrorMessage({ message: 'User not found' }), /no se encontró una cuenta/i);

    // Network error
    assert.match(mapRecoveryErrorMessage({ message: 'Failed to fetch' }), /conexión de red/i);

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

test('performOtpPasswordReset: valida presencia de correo electrónico', async () => {
    const mockSupabase = {
        auth: {
            verifyOtp: async () => ({ data: { user: null }, error: null }),
            updateUser: async () => ({ data: { user: null }, error: null }),
        },
    };

    const result = await performOtpPasswordReset({
        supabaseClient: mockSupabase,
        email: '   ',
        otpCode: '123456',
        newPassword: 'NuevaPassword1',
        confirmPassword: 'NuevaPassword1',
    });

    assert.equal(result.success, false);
    assert.match(result.error || '', /correo electrónico/i);
});

test('performOtpPasswordReset: propaga error en español si updateUser falla tras OTP exitoso', async () => {
    const mockSupabase = {
        auth: {
            verifyOtp: async () => ({
                data: {
                    user: { id: 'usr-123', email: 'test@frufresco.com' },
                    session: { access_token: 'fake' },
                },
                error: null,
            }),
            updateUser: async () => ({
                data: { user: null },
                error: { message: 'New password should be different from old password' },
            }),
        },
    };

    const result = await performOtpPasswordReset({
        supabaseClient: mockSupabase,
        email: 'test@frufresco.com',
        otpCode: '123456',
        newPassword: 'MismaPassword1',
        confirmPassword: 'MismaPassword1',
    });

    assert.equal(result.success, false);
    assert.match(result.error || '', /diferente a la contraseña anterior/i);
});

test('performOtpPasswordReset: mantiene éxito de recuperación si profiles.update retorna error no fatal', async () => {
    let warningLogged = false;
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
        warningLogged = true;
        originalWarn(...args);
    };

    try {
        const mockSupabase = {
            auth: {
                verifyOtp: async () => ({
                    data: {
                        user: { id: 'usr-prof-err', email: 'test@frufresco.com' },
                        session: { access_token: 'fake' },
                    },
                    error: null,
                }),
                updateUser: async () => ({
                    data: { user: { id: 'usr-prof-err' } },
                    error: null,
                }),
            },
            from: () => ({
                update: () => ({
                    eq: async () => ({ error: { message: 'RLS row violation' } }),
                }),
            }),
        };

        const result = await performOtpPasswordReset({
            supabaseClient: mockSupabase,
            email: 'test@frufresco.com',
            otpCode: '123456',
            newPassword: 'NuevaSegura2026',
            confirmPassword: 'NuevaSegura2026',
        });

        assert.equal(result.success, true);
        assert.equal(result.userId, 'usr-prof-err');
        assert.equal(warningLogged, true);
    } finally {
        console.warn = originalWarn;
    }
});

test('performOtpPasswordReset: rechaza código con caracteres alfanuméricos sin llamar a verifyOtp', async () => {
    let verifyOtpCalled = false;
    const mockSupabase = {
        auth: {
            verifyOtp: async () => {
                verifyOtpCalled = true;
                return { data: { user: null }, error: null };
            },
            updateUser: async () => ({ data: { user: null }, error: null }),
        },
    };

    const result = await performOtpPasswordReset({
        supabaseClient: mockSupabase,
        email: 'test@frufresco.com',
        otpCode: '123456a',
        newPassword: 'NuevaPassword1',
        confirmPassword: 'NuevaPassword1',
    });

    assert.equal(result.success, false);
    assert.match(result.error || '', /solo debe contener números/i);
    assert.equal(verifyOtpCalled, false, 'verifyOtp no debe ser invocado si el código contiene letras');
});

test('performOtpPasswordReset: valida formato de correo con arroba', async () => {
    let verifyOtpCalled = false;
    const mockSupabase = {
        auth: {
            verifyOtp: async () => {
                verifyOtpCalled = true;
                return { data: { user: null }, error: null };
            },
            updateUser: async () => ({ data: { user: null }, error: null }),
        },
    };

    const result = await performOtpPasswordReset({
        supabaseClient: mockSupabase,
        email: 'correo_sin_arroba.com',
        otpCode: '123456',
        newPassword: 'NuevaPassword1',
        confirmPassword: 'NuevaPassword1',
    });

    assert.equal(result.success, false);
    assert.match(result.error || '', /correo electrónico válido/i);
    assert.equal(verifyOtpCalled, false, 'verifyOtp no debe ser invocado si el correo no tiene formato válido');
});

test('performOtpPasswordReset: extrae userId desde session.user cuando data.user es nulo', async () => {
    let profileUpdateId: string | null = null;
    const mockSupabase = {
        auth: {
            verifyOtp: async () => ({
                data: {
                    user: null,
                    session: { access_token: 'jwt', user: { id: 'usr-nested-session' } },
                },
                error: null,
            }),
            updateUser: async () => ({
                data: { user: null },
                error: null,
            }),
        },
        from: (table: string) => {
            assert.equal(table, 'profiles');
            return {
                update: () => ({
                    eq: async (_field: string, val: any) => {
                        profileUpdateId = val;
                        return { error: null };
                    },
                }),
            };
        },
    };

    const result = await performOtpPasswordReset({
        supabaseClient: mockSupabase,
        email: 'nested@frufresco.com',
        otpCode: '654321',
        newPassword: 'ClaveNested123',
        confirmPassword: 'ClaveNested123',
    });

    assert.equal(result.success, true);
    assert.equal(result.userId, 'usr-nested-session');
    assert.equal(profileUpdateId, 'usr-nested-session');
});

test('performOtpPasswordReset: resuelve userId mediante fallback a getUser si ni verifyOtp ni updateUser lo entregan', async () => {
    let getUserCalled = false;
    let profileUpdateId: string | null = null;

    const mockSupabase = {
        auth: {
            verifyOtp: async () => ({
                data: { user: null, session: null },
                error: null,
            }),
            updateUser: async () => ({
                data: { user: null },
                error: null,
            }),
            getUser: async () => {
                getUserCalled = true;
                return {
                    data: { user: { id: 'usr-from-get-user' } },
                    error: null,
                };
            },
        },
        from: () => ({
            update: () => ({
                eq: async (_f: string, val: any) => {
                    profileUpdateId = val;
                    return { error: null };
                },
            }),
        }),
    };

    const result = await performOtpPasswordReset({
        supabaseClient: mockSupabase,
        email: 'fallback-getuser@frufresco.com',
        otpCode: '999888',
        newPassword: 'ClaveGetUser1',
        confirmPassword: 'ClaveGetUser1',
    });

    assert.equal(result.success, true);
    assert.equal(getUserCalled, true);
    assert.equal(result.userId, 'usr-from-get-user');
    assert.equal(profileUpdateId, 'usr-from-get-user');
});

test('mapRecoveryErrorMessage: soporta objetos con error_description y error_code', () => {
    assert.match(
        mapRecoveryErrorMessage({ error_description: 'Token has expired or is invalid' }),
        /expirado/i
    );
    assert.match(
        mapRecoveryErrorMessage({ error_code: 'otp_expired' }),
        /expirado/i
    );
    assert.match(
        mapRecoveryErrorMessage({ error: 'invalid email format' }),
        /formato de correo electrónico/i
    );
});

// =========================================================================
// PRUEBAS ADVERSARIALES ROUND 3: SEGURIDAD, REDIRECTS, ERRORES DE RED Y CLIENTE
// =========================================================================

test('isSafeRedirectPath: mitiga vectores de open redirect, evasión de backslash y CRLF', () => {
    // Rutas relativas válidas
    assert.equal(isSafeRedirectPath('/dashboard'), true);
    assert.equal(isSafeRedirectPath('/login?mode=recovery'), true);
    assert.equal(isSafeRedirectPath('/perfil/editar?tab=seguridad'), true);

    // Intentos de redirección abierta (Open Redirect)
    assert.equal(isSafeRedirectPath('https://evil.com'), false);
    assert.equal(isSafeRedirectPath('http://malicious.org/phish'), false);
    assert.equal(isSafeRedirectPath('//evil.com'), false);
    assert.equal(isSafeRedirectPath('///evil.com'), false);
    assert.equal(isSafeRedirectPath('/\\evil.com'), false);
    assert.equal(isSafeRedirectPath('/path\\evil.com'), false);
    assert.equal(isSafeRedirectPath('javascript:alert(1)'), false);
    assert.equal(isSafeRedirectPath('data:text/html,<script>alert(1)</script>'), false);

    // CRLF Injection (inyección de cabeceras HTTP)
    assert.equal(isSafeRedirectPath('/login\r\nLocation: https://evil.com'), false);
    assert.equal(isSafeRedirectPath('/login\nSet-Cookie: session=pwned'), false);

    // Entradas nulas, vacías o de tipo incorrecto
    assert.equal(isSafeRedirectPath(''), false);
    assert.equal(isSafeRedirectPath(null), false);
    assert.equal(isSafeRedirectPath(undefined), false);
    assert.equal(isSafeRedirectPath(123 as any), false);
});

test('mapRecoveryErrorMessage: traduce estados HTTP 429 y variedad de fallos de red', () => {
    // HTTP status 429
    assert.match(mapRecoveryErrorMessage({ status: 429 }), /límite de intentos|solicitado varios códigos/i);
    assert.match(mapRecoveryErrorMessage({ status: '429' }), /límite de intentos|solicitado varios códigos/i);

    // Variaciones de error de red
    assert.match(mapRecoveryErrorMessage(new TypeError('fetch failed')), /conexión de red/i);
    assert.match(mapRecoveryErrorMessage({ message: 'ECONNREFUSED' }), /conexión de red/i);
    assert.match(mapRecoveryErrorMessage({ message: 'ETIMEDOUT' }), /conexión de red/i);
    assert.match(mapRecoveryErrorMessage({ message: 'The user aborted a request.' }), /conexión de red/i);

    // Mensaje de usuario que ya tiene emoji de advertencia (evita duplicación de emojis)
    const formatted = mapRecoveryErrorMessage('⚠️ Clave no válida');
    assert.equal(formatted, '⚠️ Clave no válida');
});

test('performOtpPasswordReset: maneja cliente Supabase no configurado o corrupto', async () => {
    // Cliente nulo
    const resNull = await performOtpPasswordReset({
        supabaseClient: null,
        email: 'test@frufresco.com',
        otpCode: '123456',
        newPassword: 'NuevaPassword1',
        confirmPassword: 'NuevaPassword1',
    });
    assert.equal(resNull.success, false);
    assert.match(resNull.error || '', /cliente de autenticación no disponible/i);

    // Cliente sin métodos auth requeridos
    const resCorrupt = await performOtpPasswordReset({
        supabaseClient: { auth: {} },
        email: 'test@frufresco.com',
        otpCode: '123456',
        newPassword: 'NuevaPassword1',
        confirmPassword: 'NuevaPassword1',
    });
    assert.equal(resCorrupt.success, false);
    assert.match(resCorrupt.error || '', /cliente de autenticación no disponible/i);
});

test('performOtpPasswordReset: maneja excepción de red lanzada por verifyOtp', async () => {
    const mockSupabase = {
        auth: {
            verifyOtp: async () => {
                throw new TypeError('fetch failed');
            },
            updateUser: async () => ({ data: { user: null }, error: null }),
        },
    };

    const result = await performOtpPasswordReset({
        supabaseClient: mockSupabase,
        email: 'network-err@frufresco.com',
        otpCode: '654321',
        newPassword: 'ClaveNetwork1',
        confirmPassword: 'ClaveNetwork1',
    });

    assert.equal(result.success, false);
    assert.match(result.error || '', /conexión de red/i);
});

test('performOtpPasswordReset: procesa código OTP con guiones y correo con espacios y mayúsculas', async () => {
    let capturedParams: any = null;
    const mockSupabase = {
        auth: {
            verifyOtp: async (params: any) => {
                capturedParams = params;
                return {
                    data: { user: { id: 'usr-hyphen-clean' } },
                    error: null,
                };
            },
            updateUser: async () => ({
                data: { user: { id: 'usr-hyphen-clean' } },
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
        email: '   USUARIO.LIMPIO@FRUFRESCO.COM   ',
        otpCode: '  456-789  ',
        newPassword: 'ClaveSegura2026',
        confirmPassword: 'ClaveSegura2026',
    });

    assert.equal(result.success, true);
    assert.equal(capturedParams.email, 'usuario.limpio@frufresco.com');
    assert.equal(capturedParams.token, '456789');
});

test('performOtpPasswordReset: tiene éxito incluso si el cliente carece de método .from() (auth-only)', async () => {
    const mockSupabase = {
        auth: {
            verifyOtp: async () => ({
                data: { user: { id: 'usr-auth-only' } },
                error: null,
            }),
            updateUser: async () => ({
                data: { user: { id: 'usr-auth-only' } },
                error: null,
            }),
        },
        // from() NO existe en este cliente auth-only
    };

    const result = await performOtpPasswordReset({
        supabaseClient: mockSupabase,
        email: 'authonly@frufresco.com',
        otpCode: '123456',
        newPassword: 'ClaveAuthOnly1',
        confirmPassword: 'ClaveAuthOnly1',
    });

    assert.equal(result.success, true);
    assert.equal(result.userId, 'usr-auth-only');
});

