import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 0; // Dynamic route

const getBogotaDateStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const clientId = searchParams.get('clientId');

        if (!clientId) {
            return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const supabase = createClient(supabaseUrl, serviceKey);

        const todayBogota = getBogotaDateStr();

        // 1. Fetch Client Profile to identify parent_id and active_master_agreement_id
        const { data: currentProfile } = await supabase
            .from('profiles')
            .select('id, parent_id, logistics_data')
            .eq('id', clientId)
            .maybeSingle();

        const parentId = currentProfile?.parent_id || null;
        let parentProfile: { id: string; parent_id?: string | null; logistics_data?: any } | null = null;
        if (parentId) {
            const { data: pData } = await supabase
                .from('profiles')
                .select('id, parent_id, logistics_data')
                .eq('id', parentId)
                .maybeSingle();
            parentProfile = pData;
        }

        // Helper to query quotes with products
        const fetchQuoteWithItems = async (filterCol: string, filterVal: string) => {
            const { data: quotesData } = await supabase
                .from('quotes')
                .select(`
                    *,
                    quote_items(
                        *,
                        products(id, name, name_en, unit_of_measure, image_url, sku, category, is_active)
                    )
                `)
                .eq(filterCol, filterVal)
                .eq('status', 'agreement')
                .order('created_at', { ascending: false });
            return quotesData || [];
        };

        // Level 1: Individual branch/client agreement
        let activeQuotes = await fetchQuoteWithItems('client_id', clientId);

        // Level 2: Parent matrix agreement (if no individual agreement exists)
        if (activeQuotes.length === 0 && parentId) {
            activeQuotes = await fetchQuoteWithItems('client_id', parentId);
        }

        // Level 3: Master shared agreement (Nutresa, Colsubsidio, General Quincenal, General Mensual)
        if (activeQuotes.length === 0) {
            let masterId = currentProfile?.logistics_data?.active_master_agreement_id
                        || parentProfile?.logistics_data?.active_master_agreement_id;

            // Check special_agreement_model_clients
            if (!masterId) {
                const targetIds = [clientId, parentId].filter(Boolean);
                const { data: modelRow } = await supabase
                    .from('special_agreement_model_clients')
                    .select('model_id')
                    .in('client_id', targetIds)
                    .limit(1)
                    .maybeSingle();

                if (modelRow?.model_id) {
                    const { data: sam } = await supabase
                        .from('special_agreement_models')
                        .select('master_quote_id')
                        .eq('id', modelRow.model_id)
                        .maybeSingle();
                    if (sam?.master_quote_id) {
                        masterId = sam.master_quote_id;
                    }
                }
            }

            // Check app_settings agreement_clients fallback
            if (!masterId) {
                const { data: sharedSettings } = await supabase
                    .from('app_settings')
                    .select('key, value')
                    .ilike('key', 'agreement_clients:%');

                if (sharedSettings) {
                    for (const item of sharedSettings) {
                        try {
                            const linkedIds: string[] = JSON.parse(item.value || '[]');
                            if (linkedIds.includes(clientId) || (parentId && linkedIds.includes(parentId))) {
                                masterId = item.key.replace('agreement_clients:', '');
                                break;
                            }
                        } catch {
                            // ignore json error
                        }
                    }
                }
            }

            if (masterId) {
                const masterQuotes = await fetchQuoteWithItems('id', masterId);
                if (masterQuotes.length > 0) {
                    // Enrich master quote with dates & metadata from special_agreement_models
                    const { data: specialModel } = await supabase
                        .from('special_agreement_models')
                        .select('name, start_date, valid_until')
                        .eq('master_quote_id', masterId)
                        .maybeSingle();

                    activeQuotes = masterQuotes.map(mq => ({
                        ...mq,
                        start_date: specialModel?.start_date || mq.start_date,
                        valid_until: specialModel?.valid_until || mq.valid_until,
                        model_snapshot_name: mq.model_snapshot_name || specialModel?.name || `Acuerdo ${mq.quote_number}`
                    }));
                }
            }
        }

        const pricesMap: Record<string, number> = {};
        if (activeQuotes.length > 0 && activeQuotes[0].quote_items) {
            activeQuotes[0].quote_items.forEach((qi: any) => {
                if (qi.product_id && Number(qi.unit_price) > 0) {
                    pricesMap[qi.product_id] = Number(qi.unit_price);
                }
            });
        }

        return NextResponse.json({
            agreements: activeQuotes,
            pricesMap,
            todayBogota,
            isMasterAgreement: Boolean(activeQuotes.length > 0 && !activeQuotes[0].client_id)
        });
    } catch (err: any) {
        console.error('Unexpected error in B2B agreements API:', err);
        return NextResponse.json({ agreements: [], pricesMap: {} }, { status: 500 });
    }
}
