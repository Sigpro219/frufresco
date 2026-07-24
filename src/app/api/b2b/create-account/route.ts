import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
const supabaseKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');

const isUrlValid = supabaseUrl.startsWith('http');
const supabase = isUrlValid ? createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
}) : null as any;

export async function GET(request: Request) {
    try {
        if (!supabase) {
            return NextResponse.json({ error: 'Base de datos no disponible' }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        const profileId = searchParams.get('profileId');

        if (!profileId) {
            return NextResponse.json({ error: 'Falta profileId' }, { status: 400 });
        }

        // Validar Token de Autorización del Administrador
        const authHeader = request.headers.get('Authorization');
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

        if (!token) {
            return NextResponse.json({ error: 'Acceso no autorizado' }, { status: 401 });
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return NextResponse.json({ error: 'Sesión inválida o expirada' }, { status: 401 });
        }

        const { data: callerProfile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileError || !callerProfile) {
            return NextResponse.json({ error: 'Error al comprobar rol' }, { status: 403 });
        }

        const staffRoles = ['admin', 'sys_admin'];
        if (!staffRoles.includes(callerProfile.role)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        // Consultar el usuario en Supabase Auth
        const { data: { user: targetUser }, error: getError } = await supabase.auth.admin.getUserById(profileId);

        if (getError || !targetUser) {
            return NextResponse.json({ hasAccess: false });
        }

        return NextResponse.json({
            hasAccess: true,
            email: targetUser.email,
            createdAt: targetUser.created_at
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        if (!supabase) {
            return NextResponse.json({ error: 'Base de datos no disponible' }, { status: 500 });
        }

        // 1. Validar Token de Autorización del Administrador
        const authHeader = request.headers.get('Authorization');
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

        if (!token) {
            return NextResponse.json({ error: 'Acceso no autorizado: falta token Bearer' }, { status: 401 });
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return NextResponse.json({ error: 'Sesión inválida o expirada' }, { status: 401 });
        }

        // 2. Validar que el usuario sea administrador
        const { data: callerProfile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileError || !callerProfile) {
            return NextResponse.json({ error: 'Error al comprobar rol de administrador' }, { status: 403 });
        }

        const staffRoles = ['admin', 'sys_admin'];
        if (!staffRoles.includes(callerProfile.role)) {
            return NextResponse.json({ error: 'No tienes permisos para realizar esta operación' }, { status: 403 });
        }

        // 3. Obtener Payload
        const body = await request.json();
        const { profileId, email, password } = body;

        if (!profileId || !email || !password) {
            return NextResponse.json({ error: 'Faltan campos obligatorios (profileId, email, password)' }, { status: 400 });
        }

        // 4. Validar existencia del perfil de destino
        const { data: targetProfile, error: targetError } = await supabase
            .from('profiles')
            .select('id, role, company_name')
            .eq('id', profileId)
            .single();

        if (targetError || !targetProfile) {
            return NextResponse.json({ error: 'El perfil de cliente especificado no existe' }, { status: 404 });
        }

        if (targetProfile.role !== 'b2b_client') {
            return NextResponse.json({ error: 'El perfil especificado no pertenece a un cliente institucional (B2B)' }, { status: 400 });
        }

        console.log(`[API B2B Access] Otorgando acceso a: ${targetProfile.company_name} (${email})`);

        // 5. Crear el usuario en Supabase Auth pasándole el mismo ID del perfil
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            id: profileId,
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: { role: 'b2b_client' }
        });

        if (createError) {
            console.error('Error creando usuario en Auth:', createError);
            return NextResponse.json({ error: `Falla en Supabase Auth: ${createError.message}` }, { status: 500 });
        }

        // 6. Actualizar el perfil con el correo e indicando cambio de contraseña obligatorio
        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                email: email,
                needs_password_change: true
            })
            .eq('id', profileId);

        if (updateError) {
            console.error('Error al actualizar tabla profiles:', updateError);
            return NextResponse.json({ error: `Usuario creado, pero no se pudo actualizar el perfil: ${updateError.message}` }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: `Acceso institucional otorgado exitosamente para ${targetProfile.company_name}`,
            userId: newUser.user.id
        });

    } catch (err: any) {
        console.error('Error inesperado en create-account API:', err);
        return NextResponse.json({ error: `Error interno del servidor: ${err.message}` }, { status: 500 });
    }
}
