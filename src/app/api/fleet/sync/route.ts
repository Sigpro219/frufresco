import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface SyncResult {
    name: string;
    success: boolean;
    error?: string;
    logs: { key: string; status: string; message?: string }[];
}

export async function POST(req: Request) {
    try {
        const { selectedIds } = await req.json();
        
        const CORE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const CORE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabaseCore = createClient(CORE_URL, CORE_KEY);

        const { data: fleet, error: fleetError } = await supabaseCore
            .from('fleet_tenants')
            .select('*')
            .in('id', selectedIds);

        if (fleetError) throw fleetError;
        if (!fleet || fleet.length === 0) {
            return NextResponse.json({ success: false, message: 'No se seleccionaron tenantes válidos.' }, { status: 400 });
        }

        const results: SyncResult[] = [];
        const now = new Date().toISOString();

        for (const tenant of fleet) {
            const tenantResults: SyncResult = { name: tenant.tenant_name, success: true, logs: [] };
            try {
                const supabaseTenant = createClient(tenant.supabase_url, tenant.service_role_key);
                
                // 1. Fetch official units from CORE
                const { data: unitsRow } = await supabaseCore.from('app_settings').select('value').eq('key', 'standard_units').single();
                const coreUnits = unitsRow?.value || '';
                
                const { data: suspendedRow } = await supabaseCore.from('app_settings').select('value').eq('key', 'suspended_units').single();
                const coreSuspended = suspendedRow?.value || '';

                const updates = [
                    { key: 'last_core_sync', value: now },
                    { key: 'app_name', value: tenant.branding_config?.app_name || '' },
                    { key: 'app_logo_url', value: tenant.branding_config?.app_logo_url || '' },
                    { key: 'system_status', value: tenant.status },
                    { key: 'standard_units', value: coreUnits },
                    { key: 'suspended_units', value: coreSuspended }
                ];

                for (const item of updates) {
                    const { error } = await supabaseTenant
                        .from('app_settings')
                        .upsert({ key: item.key, value: item.value }, { onConflict: 'key' });
                    
                    if (error) {
                        tenantResults.logs.push({ key: item.key, status: 'error', message: error.message });
                        tenantResults.success = false;
                    } else {
                        tenantResults.logs.push({ key: item.key, status: 'ok' });
                    }
                }

                if (tenantResults.success) {
                    await supabaseCore
                        .from('fleet_tenants')
                        .update({ last_sync: now })
                        .eq('id', tenant.id);
                }

            } catch (err: unknown) {
                tenantResults.success = false;
                tenantResults.error = err instanceof Error ? err.message : String(err);
            }
            results.push(tenantResults);
        }

        return NextResponse.json({ success: true, results });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('API Fleet Sync Error:', message);
        return NextResponse.json({ success: false, message }, { status: 500 });
    }
}
