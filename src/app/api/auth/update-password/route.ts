import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function POST(request: Request) {
    try {
        const { password } = await request.json()

        if (!password || password.length < 6) {
            return NextResponse.json(
                { success: false, error: 'La contraseña debe tener al menos 6 caracteres' },
                { status: 400 }
            )
        }

        const cookieStore = await cookies()
        const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
        const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

        const supabase = createServerClient(
            supabaseUrl,
            supabaseAnonKey,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            )
                        } catch {}
                    },
                },
            }
        )

        // 1. Obtener usuario de la sesión en cookies
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError || !user) {
            console.warn('⚠️ No se encontró usuario en cookies para actualizar contraseña:', userError?.message)
            return NextResponse.json(
                { success: false, error: 'Sesión de recuperación no encontrada o expirada. Solicita un nuevo enlace.' },
                { status: 401 }
            )
        }

        // 2. Actualizar contraseña usando el cliente admin para máxima confiabilidad
        const adminSupabase = createAdminClient()
        const { error: updateError } = await adminSupabase.auth.admin.updateUserById(user.id, {
            password: password
        })

        if (updateError) {
            console.error('❌ Error actualizando contraseña vía admin:', updateError.message)
            return NextResponse.json(
                { success: false, error: updateError.message },
                { status: 500 }
            )
        }

        // 3. Desmarcar needs_password_change en profiles si aplica
        await adminSupabase
            .from('profiles')
            .update({ needs_password_change: false })
            .eq('id', user.id)

        console.log('✅ Contraseña actualizada exitosamente en servidor para:', user.email)
        return NextResponse.json({ success: true })

    } catch (err: any) {
        console.error('❌ Error inesperado en api/auth/update-password:', err)
        return NextResponse.json(
            { success: false, error: err.message || 'Error interno del servidor' },
            { status: 500 }
        )
    }
}
