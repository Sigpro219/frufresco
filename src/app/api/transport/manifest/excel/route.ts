import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { verifySessionAndPermission } from '@/lib/auth';
import { getOperationalTargetDate } from '@/lib/ops/operationalCells';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { getOrderSpaceDisplayLabel } from '@/lib/stagingSpaceAllocator';
import { resolveCanonicalDocType } from '@/lib/commercial/billingOrderUtils';

export const dynamic = 'force-dynamic';

function parseClientBranchInfo(clientName: string, razonSocial?: string): { branchName: string; parentName: string | null } {
    const raw = (clientName || '').trim();
    if (!raw) return { branchName: 'Cliente Institucional', parentName: null };
    const parts = raw.split(/\s+[-–—]\s+/);
    if (parts.length >= 2) {
        const parent = parts[0].trim();
        const branch = parts.slice(1).join(' - ').trim();
        if (parent.toLowerCase() === branch.toLowerCase()) {
            return { branchName: branch, parentName: null };
        }
        return { branchName: branch, parentName: parent };
    }
    if (razonSocial && razonSocial.trim().toLowerCase() !== raw.toLowerCase()) {
        return { branchName: raw, parentName: razonSocial.trim() };
    }
    return { branchName: raw, parentName: null };
}

export async function GET(request: Request) {
    try {
        const auth = await verifySessionAndPermission(request, 'admin.transport.view');
        if (!auth.authorized) {
            return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const tomorrowDefault = getOperationalTargetDate(20);
        const date = searchParams.get('date') || tomorrowDefault;

        const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
        const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Obtener órdenes de la fecha
        const { data: orders, error: ordErr } = await supabase
            .from('orders')
            .select(`
                id,
                sequence_id,
                created_at,
                purchase_order_number,
                delivery_date,
                status,
                type,
                origin_source,
                total,
                total_weight_kg,
                crates_count,
                shipping_address,
                logistics_data,
                assigned_route_id,
                warehouse_spaces,
                payment_method,
                special_notes,
                admin_notes,
                profile_id
            `)
            .eq('delivery_date', date)
            .not('status', 'in', '(cancelled,billing_only)')
            .order('sequence_id', { ascending: true });

        if (ordErr) {
            return NextResponse.json({ error: ordErr.message }, { status: 500 });
        }

        const ordersList = orders || [];
        const profileIds = [...new Set(ordersList.map(o => o.profile_id).filter(Boolean))];

        const { data: profiles } = profileIds.length > 0
            ? await supabase
                .from('profiles')
                .select('id, company_name, contact_name, razon_social, nit, address, contact_phone, phone, needs_crates, crate_balance, document_type, role, parent_id, is_corporate_parent, remission_with_prices')
                .in('id', profileIds)
            : { data: [] };
        const profileMap = new Map((profiles || []).map(p => [p.id, p]));

        const parentIds = [...new Set((profiles || []).map((p: any) => p.parent_id).filter(Boolean))];
        const { data: parentProfiles } = parentIds.length > 0
            ? await supabase
                .from('profiles')
                .select('id, role, company_name, razon_social, document_type, print_invoice, remission_with_prices, logistics_data')
                .in('id', parentIds)
            : { data: [] };
        const parentsMap = new Map((parentProfiles || []).map((p: any) => [p.id, p]));

        const { data: routes } = await supabase.from('routes').select('*');
        const routeMap = new Map((routes || []).map(r => [r.id, r]));

        const AVG_KG_PER_CRATE = 12.5;

        // Hoja 1: Manifiesto Detallado
        const manifestRows = ordersList.map((o, idx) => {
            const p: any = profileMap.get(o.profile_id) || {};
            const rawClient = p.company_name || p.razon_social || p.contact_name || 'Cliente';
            const { branchName, parentName } = parseClientBranchInfo(rawClient, p.razon_social);

            const kg = Number(o.total_weight_kg || 0);
            const crates = (o.crates_count && o.crates_count > 1) ? o.crates_count : (Math.ceil(kg / AVG_KG_PER_CRATE) || 1);

            const canonicalDoc = resolveCanonicalDocType({ ...o, profiles: p }, parentsMap);
            const clientType = canonicalDoc.isB2B ? 'B2B Institucional' : 'B2C Hogar';
            const docType = canonicalDoc.rawDocType === 'invoice'
                ? 'Factura'
                : canonicalDoc.rawDocType === 'gift_remission'
                    ? 'Remisión Obsequio'
                    : (o.origin_source === 'customer_service' || o.logistics_data?.is_replacement)
                        ? 'Reposición'
                        : 'Remisión';
            const phone = p.contact_phone || p.phone || 'Sin registrar';
            const address = o.shipping_address || p.address || 'Entrega en sede';
            const zone = o.logistics_data?.zone_name || (address.split(',')[1] ? address.split(',')[1].trim() : 'Bogotá Principal');

            const routeInfo = o.assigned_route_id ? routeMap.get(o.assigned_route_id) : null;
            const routeStr = routeInfo 
                ? `${routeInfo.vehicle_plate || 'S/P'} - ${routeInfo.driver_name || 'Conductor'}` 
                : 'Sin asignar';

            const spacesStr = getOrderSpaceDisplayLabel(o) || 'Sin bahía';
            const friendlyConsec = getFriendlyOrderId({ id: o.id, sequence_id: o.sequence_id, created_at: o.created_at });

            return {
                'No.': idx + 1,
                'Consecutivo': friendlyConsec,
                'ID Pedido': o.id.slice(0, 8),
                'Cliente / Matriz': parentName || rawClient,
                'Sucursal Receptora': branchName,
                'NIT': p.nit || 'Sin NIT',
                'Canal': clientType,
                'Documento': docType,
                'Orden de Compra (OC)': o.purchase_order_number || 'N/A',
                'Dirección de Entrega': address,
                'Zona Logística': zone,
                'Teléfono Contacto': phone,
                'Peso Estimado (Kg)': Math.round(kg * 10) / 10,
                'Canastillas a Despachar': crates,
                'Saldo Canastillas en Sucursal': p.crate_balance ?? 0,
                'Préstamo Canastillas': p.needs_crates ? 'SÍ' : 'NO',
                'Espacio en Bodega': spacesStr,
                'Ruta Asignada': routeStr,
                'Valor Pedido ($)': Number(o.total || 0),
                'Forma de Pago': o.payment_method || 'Crédito',
                'Notas Especiales': o.special_notes || o.admin_notes || ''
            };
        });

        // Hoja 2: Control Canastillas por Cliente
        const clientAgg = new Map<string, any>();
        manifestRows.forEach(row => {
            const key = `${row['Cliente / Matriz']} - ${row['Sucursal Receptora']}`;
            if (!clientAgg.has(key)) {
                clientAgg.set(key, {
                    cliente: row['Cliente / Matriz'],
                    sucursal: row['Sucursal Receptora'],
                    nit: row['NIT'],
                    canal: row['Canal'],
                    pedidosCount: 0,
                    totalKg: 0,
                    canastillasDespacho: 0,
                    saldoActualCanastillas: row['Saldo Canastillas en Sucursal'],
                    zona: row['Zona Logística'],
                    pedidosList: []
                });
            }
            const item = clientAgg.get(key)!;
            item.pedidosCount += 1;
            item.totalKg += row['Peso Estimado (Kg)'];
            item.canastillasDespacho += row['Canastillas a Despachar'];
            item.pedidosList.push(row['Consecutivo']);
        });

        const clientCrateSummary = Array.from(clientAgg.values())
            .sort((a, b) => b.canastillasDespacho - a.canastillasDespacho)
            .map((c, idx) => ({
                'No.': idx + 1,
                'Cliente / Matriz': c.cliente,
                'Sucursal Receptora': c.sucursal,
                'NIT': c.nit,
                'Canal': c.canal,
                'No. Pedidos': c.pedidosCount,
                'Pedidos Consecutivos': c.pedidosList.join(', '),
                'Kilos Totales (Kg)': Math.round(c.totalKg * 10) / 10,
                'Canastillas a Entregar': c.canastillasDespacho,
                'Canastillas en Custodia (Saldo Actual)': c.saldoActualCanastillas,
                'Canastillas Esperadas a Retornar': c.saldoActualCanastillas > 0 ? c.saldoActualCanastillas : c.canastillasDespacho,
                'Zona Logística': c.zona
            }));

        // Hoja 3: Consolidado Zonas
        const zoneAgg = new Map<string, any>();
        manifestRows.forEach(row => {
            const z = row['Zona Logística'];
            if (!zoneAgg.has(z)) {
                zoneAgg.set(z, { zona: z, pedidosCount: 0, totalKg: 0, totalCanastillas: 0, totalVenta: 0 });
            }
            const zItem = zoneAgg.get(z)!;
            zItem.pedidosCount += 1;
            zItem.totalKg += row['Peso Estimado (Kg)'];
            zItem.totalCanastillas += row['Canastillas a Despachar'];
            zItem.totalVenta += row['Valor Pedido ($)'];
        });

        const zoneSummary = Array.from(zoneAgg.values())
            .sort((a, b) => b.totalKg - a.totalKg)
            .map((z, idx) => ({
                'No.': idx + 1,
                'Zona Logística': z.zona,
                'Total Pedidos': z.pedidosCount,
                'Kilos Totales (Kg)': Math.round(z.totalKg * 10) / 10,
                'Canastillas Estimadas': z.totalCanastillas,
                'Venta Facturada ($)': z.totalVenta
            }));

        // Generar Buffer XLSX
        const wb = XLSX.utils.book_new();
        const wsManifest = XLSX.utils.json_to_sheet(manifestRows);
        const wsCrates = XLSX.utils.json_to_sheet(clientCrateSummary);
        const wsZones = XLSX.utils.json_to_sheet(zoneSummary);

        const setCols = (ws: any, widths: number[]) => {
            ws['!cols'] = widths.map(w => ({ wch: w }));
        };

        setCols(wsManifest, [6, 14, 12, 32, 28, 14, 18, 12, 16, 40, 20, 16, 16, 20, 24, 18, 18, 26, 16, 16, 30]);
        setCols(wsCrates, [6, 32, 28, 14, 18, 12, 30, 16, 20, 26, 30, 20]);
        setCols(wsZones, [6, 26, 14, 18, 20, 20]);

        XLSX.utils.book_append_sheet(wb, wsManifest, 'Manifiesto_Rutas_Despacho');
        XLSX.utils.book_append_sheet(wb, wsCrates, 'Control_Canastillas_Clientes');
        XLSX.utils.book_append_sheet(wb, wsZones, 'Consolidado_Zonas_Logistica');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="Manifiesto_Rutas_Canastillas_${date}.xlsx"`
            }
        });
    } catch (err: any) {
        console.error('Error generando manifiesto Excel:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
