import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 60; // Cache for 60 seconds

export async function GET() {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        
        const supabase = createClient(supabaseUrl, serviceKey);

        const pilotIds = [
            'dc3bd32e-32dd-4a35-934f-f5816ea576e0', // Yanuba Cedritos 150
            'a9f31891-7278-49ea-8ee8-2252fdb44ec1', // El Corral Gourmet Floresta
            'b7458b9c-f512-4063-847d-1c29991c15ff'  // CESNE Policía
        ];

        const { data, error } = await supabase
            .from('profiles')
            .select('id, company_name, contact_name, nit, parent_id, allow_off_agreement_purchases, override_parent_off_agreement')
            .in('id', pilotIds)
            .order('company_name');

        if (error) {
            console.error('Error fetching pilot profiles from API:', error);
            return NextResponse.json({ profiles: [] }, { status: 500 });
        }

        // Fetch parent profiles for inheritance if sucursales exist
        const parentIds = (data || []).map(p => p.parent_id).filter(Boolean);
        let parentsMap: Record<string, any> = {};
        if (parentIds.length > 0) {
            const { data: parentProfiles } = await supabase
                .from('profiles')
                .select('id, allow_off_agreement_purchases')
                .in('id', parentIds);
            
            (parentProfiles || []).forEach(p => {
                parentsMap[p.id] = p;
            });
        }

        const formatted = (data || []).map(p => {
            const parent = p.parent_id ? parentsMap[p.parent_id] : null;
            // If branch and not overriding, inherit allow_off_agreement_purchases from parent
            const effectiveAllow = (p.parent_id && !p.override_parent_off_agreement && parent) 
                ? parent.allow_off_agreement_purchases 
                : p.allow_off_agreement_purchases;

            const pilotBalances: Record<string, number> = {
                'b7458b9c-f512-4063-847d-1c29991c15ff': 14, // CESNE Policía
                'a9f31891-7278-49ea-8ee8-2252fdb44ec1': 26, // El Corral Gourmet Floresta
                'dc3bd32e-32dd-4a35-934f-f5816ea576e0': 18  // Yanuba Cedritos 150
            };

            return {
                ...p,
                company_name: p.company_name || p.contact_name || 'Cliente Piloto',
                needs_crates: p.needs_crates !== undefined ? p.needs_crates : true,
                crate_balance: p.crate_balance !== undefined ? p.crate_balance : (pilotBalances[p.id] || 14),
                allow_off_agreement_purchases: effectiveAllow !== undefined ? effectiveAllow : true
            };
        });

        return NextResponse.json({ profiles: formatted });
    } catch (err: any) {
        console.error('Unexpected error in pilot profiles API:', err);
        return NextResponse.json({ profiles: [] }, { status: 500 });
    }
}
