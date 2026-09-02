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

const VALID_PROVIDER_COLUMNS = new Set([
    'name', 'is_specialized_credit', 'category', 'is_active',
    'world_office_id', 'credit_terms_days', 'is_credit_line', 'tax_id',
    'email', 'phone', 'address', 'city', 'type', 'is_archived', 'is_deleted',
    'bank_name', 'bank_account_number', 'bank_account_type', 'payment_terms_days',
    'product', 'payment_condition', 'billing_type', 'observations', 'rut_url',
    'additional_docs_url', 'contact_name', 'document_type', 'location',
    'contact_phone', 'warehouse_location', 'puesto'
]);

function sanitizeProviderData(raw: any) {
    if (!raw || typeof raw !== 'object') return {};
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(raw)) {
        if (VALID_PROVIDER_COLUMNS.has(k)) {
            clean[k] = v;
        }
    }

    // Pack or preserve documents in additional_docs_url
    const bankDoc = raw.bank_certificate_url;
    const qualDoc = raw.quality_certifications_url;
    const addDoc = raw.additional_docs_url;

    if (bankDoc || qualDoc) {
        clean.additional_docs_url = JSON.stringify({
            bank: bankDoc || null,
            quality: qualDoc || null,
            docs: addDoc || null
        });
    } else if (addDoc !== undefined) {
        clean.additional_docs_url = addDoc;
    }

    return clean;
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
        const { action, providerData: rawProviderData, providerId, is_archived } = body;
        const providerData = sanitizeProviderData(rawProviderData);

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

            const updatePayload: any = { is_archived };
            if (typeof body.is_active === 'boolean') {
                updatePayload.is_active = body.is_active;
            } else {
                updatePayload.is_active = !is_archived;
            }

            const { data, error } = await adminSupabase
                .from('providers')
                .update(updatePayload)
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
                
                for (const item of chunk) {
                    try {
                        let existing: any = null;
                        if (item.id) {
                            const { data } = await adminSupabase
                                .from('providers')
                                .select('id')
                                .eq('id', item.id)
                                .maybeSingle();
                            existing = data;
                        }
                        if (!existing && item.tax_id) {
                            const { data } = await adminSupabase
                                .from('providers')
                                .select('id')
                                .eq('tax_id', item.tax_id)
                                .maybeSingle();
                            existing = data;
                        }

                        if (existing) {
                            const updatePayload = { ...item };
                            delete updatePayload.id; // Evitar mutación de ID
                            const { error: uErr } = await adminSupabase
                                .from('providers')
                                .update(updatePayload)
                                .eq('id', existing.id);
                            if (uErr) throw uErr;
                            updatedCount++;
                        } else {
                            const { error: iErr } = await adminSupabase
                                .from('providers')
                                .insert([item]);
                            if (iErr) throw iErr;
                            createdCount++;
                        }
                    } catch (singleErr: any) {
                        errors.push({ tax_id: item.tax_id, name: item.name, error: singleErr.message });
                    }
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
