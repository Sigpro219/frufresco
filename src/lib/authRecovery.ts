/**
 * FruFresco - 6-Digit OTP Password Recovery Engine
 * 
 * Provides robust, cross-browser, cross-device password recovery
 * without relying on client-side PKCE code verifiers in localStorage.
 */

export interface RecoveryValidationResult {
    isValid: boolean;
    error?: string;
}

/**
 * Validates OTP code, new password and confirmation input according to business rules:
 * - 6 numeric digits
 * - Minimum 6 characters for password
 * - Matching password confirmation
 */
export function validateRecoveryInput(
    otpCode: string,
    newPassword: string,
    confirmPassword: string
): RecoveryValidationResult {
    const rawOtp = (otpCode || '').trim();
    if (/[^\d\s-]/.test(rawOtp)) {
        return {
            isValid: false,
            error: '⚠️ El código de verificación solo debe contener números.',
        };
    }

    const cleanOtp = rawOtp.replace(/\D/g, '');
    const cleanPassword = (newPassword || '').trim();
    const cleanConfirm = (confirmPassword || '').trim();

    if (cleanOtp.length !== 6) {
        return {
            isValid: false,
            error: '⚠️ El código de verificación debe tener exactamente 6 dígitos.',
        };
    }

    if (cleanPassword.length < 6) {
        return {
            isValid: false,
            error: '⚠️ La nueva contraseña debe tener al menos 6 caracteres.',
        };
    }

    if (cleanPassword !== cleanConfirm) {
        return {
            isValid: false,
            error: '⚠️ Las contraseñas ingresadas no coinciden.',
        };
    }

    return { isValid: true };
}

/**
 * Translates raw Supabase/auth errors into user-friendly, descriptive Spanish messages.
 */
export function mapRecoveryErrorMessage(rawError: any): string {
    if (!rawError) return '⚠️ Ocurrió un error inesperado. Por favor intenta nuevamente.';

    const rawMsg = typeof rawError === 'string'
        ? rawError
        : (rawError.message || rawError.error_description || rawError.error || '');
    const code = typeof rawError === 'object' ? (rawError.code || rawError.error_code || '') : '';
    const lower = (rawMsg + ' ' + (code || '')).toLowerCase();

    if (lower.includes('expired') || code === 'otp_expired' || lower.includes('expirado') || lower.includes('invalid_link')) {
        return '⚠️ El código de verificación ha expirado o ya fue utilizado. Por favor solicita uno nuevo.';
    }

    if (lower.includes('email_address_invalid') || lower.includes('invalid email') || lower.includes('email format')) {
        return '⚠️ El formato de correo electrónico ingresado no es válido.';
    }

    if (
        lower.includes('rate limit') ||
        lower.includes('too many requests') ||
        lower.includes('over_email_send_rate_limit')
    ) {
        return '⚠️ Has solicitado varios códigos recientemente o alcanzado el límite de intentos. Por favor espera unos minutos antes de reintentar.';
    }

    if (
        lower.includes('session missing') ||
        lower.includes('session_missing') ||
        lower.includes('pkce') ||
        lower.includes('not authenticated')
    ) {
        return '⚠️ La sesión de recuperación no está activa o el código expiró. Por favor solicita un nuevo código.';
    }

    if (lower.includes('same password') || lower.includes('should be different')) {
        return '⚠️ La nueva contraseña debe ser diferente a la contraseña anterior.';
    }

    if (lower.includes('at least 6') || lower.includes('password should be at least')) {
        return '⚠️ La nueva contraseña debe tener al menos 6 caracteres.';
    }

    if (
        lower.includes('user not found') ||
        lower.includes('signups not allowed')
    ) {
        return '⚠️ No se encontró una cuenta asociada a este correo electrónico.';
    }

    if (lower.includes('network') || lower.includes('fetch failed') || lower.includes('failed to fetch')) {
        return '⚠️ Error de conexión de red. Por favor verifica tu conexión a internet e intenta nuevamente.';
    }

    if (
        lower.includes('invalid') ||
        lower.includes('token is invalid') ||
        lower.includes('token has expired or is invalid') ||
        lower.includes('incorrecto')
    ) {
        return '⚠️ El código de 6 dígitos ingresado es incorrecto o inválido. Por favor verifica tu correo.';
    }

    return rawMsg ? `⚠️ ${rawMsg}` : '⚠️ Error al procesar la solicitud.';
}

export interface PerformOtpPasswordResetParams {
    supabaseClient: any;
    email: string;
    otpCode: string;
    newPassword: string;
    confirmPassword: string;
}

export interface PerformOtpPasswordResetResult {
    success: boolean;
    error?: string;
    userId?: string;
}

/**
 * Executes the complete 6-digit OTP verification and password update sequence:
 * 1. Validates inputs (6 digits, min 6 chars, match)
 * 2. Authenticates recovery session with supabase.auth.verifyOtp (fallback to email type)
 * 3. Updates password via supabase.auth.updateUser
 * 4. Clears needs_password_change in profiles table
 */
export async function performOtpPasswordReset({
    supabaseClient,
    email,
    otpCode,
    newPassword,
    confirmPassword,
}: PerformOtpPasswordResetParams): Promise<PerformOtpPasswordResetResult> {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (newPassword || '').trim();
    const cleanConfirm = (confirmPassword || '').trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
        return {
            success: false,
            error: '⚠️ Por favor ingresa un correo electrónico válido.',
        };
    }

    const validation = validateRecoveryInput(otpCode, cleanPassword, cleanConfirm);
    if (!validation.isValid) {
        return {
            success: false,
            error: validation.error,
        };
    }

    const cleanOtp = (otpCode || '').trim().replace(/\D/g, '');

    try {
        // 1. Verificar OTP con type: 'recovery' (con fallback a type: 'email')
        let verifyRes = await supabaseClient.auth.verifyOtp({
            email: cleanEmail,
            token: cleanOtp,
            type: 'recovery',
        });

        if (verifyRes.error) {
            console.warn('⚠️ verifyOtp con type: recovery falló, intentando fallback type: email...', verifyRes.error.message);
            const fallbackRes = await supabaseClient.auth.verifyOtp({
                email: cleanEmail,
                token: cleanOtp,
                type: 'email',
            });

            if (!fallbackRes.error && (fallbackRes.data?.session || fallbackRes.data?.user)) {
                console.log('✅ Fallback type: email verificado con éxito');
                verifyRes = fallbackRes;
            } else {
                throw verifyRes.error;
            }
        }

        // 2. Actualizar contraseña mediante updateUser
        const { data: updateData, error: updateError } = await supabaseClient.auth.updateUser({
            password: cleanPassword,
        });

        if (updateError) {
            throw updateError;
        }

        let userId = verifyRes.data?.user?.id || verifyRes.data?.session?.user?.id || updateData?.user?.id;
        if (!userId && typeof supabaseClient?.auth?.getUser === 'function') {
            try {
                const { data: userData } = await supabaseClient.auth.getUser();
                userId = userData?.user?.id;
            } catch (_) {}
        }

        // 3. Limpiar needs_password_change en tabla profiles
        if (userId) {
            try {
                const { error: profErr } = await supabaseClient
                    .from('profiles')
                    .update({ needs_password_change: false })
                    .eq('id', userId);
                if (profErr) {
                    console.warn('⚠️ Error al actualizar profiles.needs_password_change:', profErr.message || profErr);
                }
            } catch (profErr: any) {
                console.warn('⚠️ Excepción al actualizar profiles.needs_password_change:', profErr?.message || profErr);
            }
        }

        return {
            success: true,
            userId,
        };
    } catch (err: any) {
        return {
            success: false,
            error: mapRecoveryErrorMessage(err),
        };
    }
}
