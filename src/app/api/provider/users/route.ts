import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const adminSupabase = createAdminClient();

        // 1. Fetch all collaborators
        const { data: collaborators, error: cError } = await adminSupabase
            .from('collaborators')
            .select('*');

        if (cError) {
            console.error('Error fetching collaborators:', cError.message);
            return NextResponse.json({ error: cError.message }, { status: 500 });
        }

        // 2. Fetch all profiles
        const { data: profiles, error: pError } = await adminSupabase
            .from('profiles')
            .select('id, collaborator_id, email, role, is_active, created_at');

        if (pError) {
            console.error('Error fetching profiles:', pError.message);
            return NextResponse.json({ error: pError.message }, { status: 500 });
        }

        // Map profiles by collaborator_id for quick lookups
        const profileMap = new Map<string, any>();
        profiles?.forEach(p => {
            if (p.collaborator_id) {
                profileMap.set(p.collaborator_id, p);
            }
        });

        // 3. Separate into pending and active
        const pending: any[] = [];
        const active: any[] = [];

        collaborators?.forEach(col => {
            const hasProfile = profileMap.get(col.id);

            if (col.login_requested && !hasProfile) {
                pending.push({
                    id: col.id,
                    contact_name: col.contact_name,
                    role: col.role,
                    specialty: col.specialty,
                    phone: col.phone,
                    email: col.email,
                    document_id: col.document_id,
                    is_active: col.is_active,
                    qr_token: col.qr_token
                });
            } else if (hasProfile) {
                active.push({
                    profile_id: hasProfile.id,
                    collaborator_id: col.id,
                    contact_name: col.contact_name,
                    role: col.role,
                    specialty: col.specialty,
                    phone: col.phone,
                    email: hasProfile.email || col.email,
                    document_id: col.document_id,
                    is_active: hasProfile.is_active,
                    profile_role: hasProfile.role,
                    qr_token: col.qr_token,
                    created_at: hasProfile.created_at
                });
            }
        });

        return NextResponse.json({ pending, active }, { status: 200 });
    } catch (err: any) {
        console.error('Exception in GET users governance:', err.message);
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action } = body;

        const adminSupabase = createAdminClient();

        if (action === 'approve') {
            const { collaboratorId, email, password } = body;
            if (!collaboratorId || !email) {
                return NextResponse.json({ error: 'Faltan campos obligatorios (collaboratorId, email)' }, { status: 400 });
            }

            // 1. Fetch collaborator details
            const { data: collaborator, error: cError } = await adminSupabase
                .from('collaborators')
                .select('*')
                .eq('id', collaboratorId)
                .single();

            if (cError || !collaborator) {
                return NextResponse.json({ error: 'Colaborador no encontrado' }, { status: 404 });
            }

            // 2. Check if a profile already exists for this collaborator
            const { data: existingProfile, error: pError } = await adminSupabase
                .from('profiles')
                .select('id')
                .eq('collaborator_id', collaboratorId)
                .maybeSingle();

            if (existingProfile) {
                return NextResponse.json({ error: 'Este colaborador ya tiene una cuenta activa asociada' }, { status: 400 });
            }

            // 3. Generate a secure random password if not provided
            const finalPassword = password || Math.random().toString(36).substring(2, 12) + 'aA1!';

            // 4. Create user in Supabase Auth
            const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
                email,
                password: finalPassword,
                email_confirm: true,
                user_metadata: { collaborator_id: collaboratorId }
            });

            if (authError || !authData.user) {
                console.error('Error creating auth user:', authError);
                return NextResponse.json({ error: authError?.message || 'Error al crear usuario de autenticación' }, { status: 500 });
            }

            // 4b. Dynamically fetch roles from database to match the collaborator's role
            const { data: roles } = await adminSupabase.from('roles').select('id, name');
            const matchedRole = roles?.find(r => r.name.toLowerCase() === (collaborator.role || '').toLowerCase());
            const matchedRoleId = matchedRole ? matchedRole.id : null;

            // 5. Insert profile record linked to the collaborator
            const { error: profileError } = await adminSupabase
                .from('profiles')
                .insert([{
                    id: authData.user.id,
                    collaborator_id: collaboratorId,
                    role_id: matchedRoleId,
                    email: email,
                    contact_name: collaborator.contact_name,
                    phone: collaborator.phone,
                    role: collaborator.role || 'employee',
                    is_active: true
                }]);

            if (profileError) {
                console.error('Error creating profile record:', profileError.message);
                // Attempt cleanup of the created auth user
                await adminSupabase.auth.admin.deleteUser(authData.user.id);
                return NextResponse.json({ error: `Error al crear el perfil: ${profileError.message}` }, { status: 500 });
            }

            // 6. Ensure collaborator.login_requested is marked true
            if (!collaborator.login_requested) {
                await adminSupabase
                    .from('collaborators')
                    .update({ login_requested: true })
                    .eq('id', collaboratorId);
            }

            // 7. Prepare onboarding WhatsApp message
            const host = request.headers.get('host') || 'localhost:3001';
            const protocol = host.includes('localhost') ? 'http' : 'https';
            const origin = `${protocol}://${host}`;
            const messageText = `Hola ${collaborator.contact_name}! Tu acceso digital a FruFresco ha sido creado.\n\nUsuario: ${email}\nContraseña: ${finalPassword}\n\nIngresa aquí: ${origin}/login`;

            return NextResponse.json({
                success: true,
                email,
                password: finalPassword,
                messageText,
                userId: authData.user.id
            }, { status: 200 });

        } else if (action === 'toggle-status') {
            const { collaboratorId, profileId, is_active } = body;
            if (!collaboratorId || !profileId) {
                return NextResponse.json({ error: 'Faltan campos obligatorios (collaboratorId, profileId)' }, { status: 400 });
            }

            // Update both collaborator and profile to keep them in sync
            // The sync trigger also syncs collaborators -> profiles, but manual sync guarantees consistency
            const { error: cError } = await adminSupabase
                .from('collaborators')
                .update({ is_active })
                .eq('id', collaboratorId);

            if (cError) {
                console.error('Error updating collaborator status:', cError.message);
                return NextResponse.json({ error: cError.message }, { status: 500 });
            }

            const { error: pError } = await adminSupabase
                .from('profiles')
                .update({ is_active })
                .eq('id', profileId);

            if (pError) {
                console.error('Error updating profile status:', pError.message);
                return NextResponse.json({ error: pError.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, is_active }, { status: 200 });

        } else if (action === 'delete') {
            const { collaboratorId, profileId } = body;
            if (!collaboratorId || !profileId) {
                return NextResponse.json({ error: 'Faltan campos obligatorios (collaboratorId, profileId)' }, { status: 400 });
            }

            // 1. Delete auth user (will cascade delete profile if cascade is set, or we do it manually)
            const { error: authError } = await adminSupabase.auth.admin.deleteUser(profileId);

            if (authError) {
                console.error('Error deleting auth user:', authError.message);
                return NextResponse.json({ error: authError.message }, { status: 500 });
            }

            // 2. Delete profile record manually just in case cascade is not set
            await adminSupabase
                .from('profiles')
                .delete()
                .eq('id', profileId);

            // 3. Reset collaborator login_requested to false
            const { error: cError } = await adminSupabase
                .from('collaborators')
                .update({ login_requested: false })
                .eq('id', collaboratorId);

            if (cError) {
                console.error('Error resetting collaborator login_requested:', cError.message);
                return NextResponse.json({ error: cError.message }, { status: 500 });
            }

            return NextResponse.json({ success: true }, { status: 200 });
        }

        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

    } catch (err: any) {
        console.error('Exception in POST users governance:', err.message);
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}
