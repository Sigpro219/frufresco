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
        } else if (action === 'bulk-upsert') {
            const { items } = body;
            if (!Array.isArray(items) || items.length === 0) {
                return NextResponse.json({ error: 'La lista de proveedores a importar está vacía' }, { status: 400 });
            }

            let createdCount = 0;
            let updatedCount = 0;
            const errors: any[] = [];

            // Process in chunks of 50
            const CHUNK_SIZE = 50;
            for (let i = 0; i < items.length; i += CHUNK_SIZE) {
                const chunk = items.slice(i, i + CHUNK_SIZE);
                
                const { data, error } = await adminSupabase
                    .from('providers')
                    .upsert(chunk, { onConflict: 'tax_id', ignoreDuplicates: false })
                    .select('id, tax_id');

                if (error) {
                    console.warn('Bulk upsert chunk warning, processing item by item:', error.message);
                    for (const item of chunk) {
                        try {
                            const { data: existing } = await adminSupabase
                                .from('providers')
                                .select('id')
                                .eq('tax_id', item.tax_id)
                                .maybeSingle();

                            if (existing) {
                                const { error: uErr } = await adminSupabase.from('providers').update(item).eq('id', existing.id);
                                if (uErr) throw uErr;
                                updatedCount++;
                            } else {
                                const { error: iErr } = await adminSupabase.from('providers').insert([item]);
                                if (iErr) throw iErr;
                                createdCount++;
                            }
                        } catch (singleErr: any) {
                            errors.push({ tax_id: item.tax_id, name: item.name, error: singleErr.message });
                        }
                    }
                } else {
                    createdCount += (data?.length || chunk.length);
                }
            }

            return NextResponse.json({
                success: true,
                created: createdCount,
                updated: updatedCount,
                total: items.length,
                errors
            }, { status: 200 });
        }

        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    } catch (err: any) {
        console.error('Exception in POST /api/providers:', err.message);
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}
