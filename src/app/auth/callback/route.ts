import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
    const url = new URL(request.url)
    const rawHost = request.headers.get('x-forwarded-host')
    const rawProto = request.headers.get('x-forwarded-proto')
    const forwardedHost = rawHost ? rawHost.split(',')[0].trim() : null
    const forwardedProto = rawProto ? rawProto.split(',')[0].trim() : 'https'
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin
    const { searchParams } = url

    const code = searchParams.get('code')
    const token_hash = searchParams.get('token_hash')
    const type = (searchParams.get('type') || 'recovery') as EmailOtpType
    const rawNext = searchParams.get('next') || '/login?mode=recovery'
    const next = (rawNext.startsWith('/') && !rawNext.startsWith('//')) ? rawNext : '/login?mode=recovery'
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
    if (token_hash) {
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

        let { data, error } = await supabase.auth.verifyOtp({
            type,
            token_hash,
        })

        // Fallback si type fue 'recovery' pero el enlace se generó con 'email'
        if (error && type === 'recovery') {
            const fallbackRes = await supabase.auth.verifyOtp({
                type: 'email' as EmailOtpType,
                token_hash,
            })
            if (!fallbackRes.error && (fallbackRes.data?.session || fallbackRes.data?.user)) {
                data = fallbackRes.data
                error = null
            }
        }

        if (!error && (data?.session || data?.user)) {
            const userEmail = data.session?.user?.email || data.user?.email || 'usuario'
            console.log('✅ Sesión canjeada con éxito en servidor vía token_hash para:', userEmail)
            return response
        } else if (error) {
            console.error('❌ Error canjeando token_hash en servidor:', error.message)
            return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
        }
    }

    return NextResponse.redirect(`${origin}/login?error=invalid_link`)
}
