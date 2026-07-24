import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { verifySessionAndPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const auth = await verifySessionAndPermission(request, 'admin.procurement');
        if (!auth.authorized) {
            // Also allow admin.procurement.providers
            const auth2 = await verifySessionAndPermission(request, 'admin.procurement.providers');
            if (!auth2.authorized) {
                return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
            }
        }

        const adminSupabase = createAdminClient();

        let allProviders: any[] = [];
        let from = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await adminSupabase
                .from('providers')
                .select('*')
                .order('name', { ascending: true })
                .range(from, from + limit - 1);

            if (error) {
                console.error('Error fetching providers in API:', error.message);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            if (data && data.length > 0) {
                allProviders = [...allProviders, ...data];
                from += limit;
                if (data.length < limit) hasMore = false;
            } else {
                hasMore = false;
            }
        }

        return NextResponse.json({ providers: allProviders, count: allProviders.length }, { status: 200 });
    } catch (err: any) {
        console.error('Exception in GET /api/providers:', err.message);
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const auth = await verifySessionAndPermission(request, 'admin.procurement');
        if (!auth.authorized) {
            const auth2 = await verifySessionAndPermission(request, 'admin.procurement.providers');
            if (!auth2.authorized) {
                return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
            }
        }

        const body = await request.json();
        const { action, providerData, providerId, is_archived } = body;

        const adminSupabase = createAdminClient();

        if (action === 'create') {
            const { data, error } = await adminSupabase
                .from('providers')
                .insert([providerData])
                .select()
                .single();

            if (error) {
                console.error('Error creating provider in API:', error.message);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ provider: data }, { status: 201 });
        } else if (action === 'update') {
            if (!providerId) {
                return NextResponse.json({ error: 'Falta el providerId' }, { status: 400 });
            }

            const { data, error } = await adminSupabase
                .from('providers')
                .update(providerData)
                .eq('id', providerId)
                .select()
                .single();

            if (error) {
                console.error('Error updating provider in API:', error.message);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ provider: data }, { status: 200 });
        } else if (action === 'toggle-archive') {
            if (!providerId) {
                return NextResponse.json({ error: 'Falta el providerId' }, { status: 400 });
            }

            const { data, error } = await adminSupabase
                .from('providers')
                .update({ is_archived })
                .eq('id', providerId)
                .select()
                .single();

            if (error) {
                console.error('Error toggling provider archive status in API:', error.message);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ provider: data }, { status: 200 });
        }

        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    } catch (err: any) {
        console.error('Exception in POST /api/providers:', err.message);
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}
