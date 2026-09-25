import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type') as EmailOtpType | null
    const next = searchParams.get('next') || '/login?mode=recovery'
    const errorParam = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    if (errorParam || errorDescription) {
        console.warn('⚠️ Error en callback de autenticación:', errorParam, errorDescription)
        const errorMsg = errorDescription || errorParam || 'Error en autenticación'
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorMsg)}`)
    }

    const cookieStore = await cookies()
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
    const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

    // 1. Manejar PKCE exchange con code
    if (code) {
        const response = NextResponse.redirect(`${origin}${next}`)

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
                            cookiesToSet.forEach(({ name, value, options }) => {
                                cookieStore.set(name, value, options)
                                response.cookies.set(name, value, options)
                            })
                        } catch (err) {
                            console.error('Error setting auth cookies:', err)
                        }
                    },
                },
            }
        )

        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error && data.session) {
            console.log('✅ Sesión canjeada con éxito en servidor para:', data.session.user.email)
            return response
        } else if (error) {
            console.error('❌ Error canjeando código en servidor:', error.message)
            return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
        }
    }

    // 2. Manejar token_hash exchange (enlace mágico / token hash recovery)
    if (token_hash && type) {
        const response = NextResponse.redirect(`${origin}${next}`)

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
                            cookiesToSet.forEach(({ name, value, options }) => {
                                cookieStore.set(name, value, options)
                                response.cookies.set(name, value, options)
                            })
                        } catch (err) {
                            console.error('Error setting auth cookies:', err)
                        }
                    },
                },
            }
        )

        const { data, error } = await supabase.auth.verifyOtp({
            type,
            token_hash,
        })

        if (!error && data.session) {
            console.log('✅ Sesión canjeada con éxito en servidor vía token_hash para:', data.session.user.email)
            return response
        } else if (error) {
            console.error('❌ Error canjeando token_hash en servidor:', error.message)
            return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
        }
    }

    return NextResponse.redirect(`${origin}/login?error=invalid_link`)
}
