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
            .select('id, company_name, contact_name, nit, parent_id')
            .in('id', pilotIds)
            .order('company_name');

        if (error) {
            console.error('Error fetching pilot profiles from API:', error);
            return NextResponse.json({ profiles: [] }, { status: 500 });
        }

        const formatted = (data || []).map(p => ({
            ...p,
            company_name: p.company_name || p.contact_name || 'Cliente Piloto'
        }));

        return NextResponse.json({ profiles: formatted });
    } catch (err: any) {
        console.error('Unexpected error in pilot profiles API:', err);
        return NextResponse.json({ profiles: [] }, { status: 500 });
    }
}
