import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') || '/login?mode=recovery'
    const errorParam = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    if (errorParam || errorDescription) {
        console.warn('⚠️ Error en callback de autenticación:', errorParam, errorDescription)
        const errorMsg = errorDescription || errorParam || 'Error en autenticación'
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorMsg)}`)
    }

    if (code) {
        const cookieStore = await cookies()
        const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
        const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

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

    return NextResponse.redirect(`${origin}/login?error=invalid_link`)
}
