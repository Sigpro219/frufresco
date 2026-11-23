import 'dotenv/config';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
});

const ORDER_1992_ID = 'c3643ec8-ffe4-4b00-8a2d-aa0a1e23dc93';
const INVOICE_69847_ID = '708ba5e2-b946-43fe-8b6a-ba426e49dd9b';
const RETURN_1992_ID = '11281413-440c-42b6-a28f-dfeae1657d01';

const isApply = process.argv.includes('--apply');

function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function classifyLegacySource(ret) {
    const reason = (ret.reason || '').toLowerCase();
    const hasNcNum = typeof ret.credit_note_number === 'string' && ret.credit_note_number.trim().length > 0;
    if (hasNcNum || reason.includes('nota crédito') || reason.includes('nota credito') || reason.includes('fac-imp')) {
        return 'pqr_nota_credito';
    }
    if (reason.includes('muelle') || reason.includes('rectific')) {
        return 'rectificacion_muelle';
    }
    if (
        reason.includes('ajuste factura') ||
        reason.includes('ajuste de factura') ||
        reason.includes('ajuste en factura') ||
        reason.includes('sustracci') ||
        ret.id === RETURN_1992_ID
    ) {
        return 'pqr_ajuste_factura_legacy_deducted';
    }
    return 'driver_app';
}

async function main() {
    console.log(`=== Sanitize PQR Ajuste Factura (${isApply ? 'APPLY' : 'DRY-RUN'}) ===`);

    // 1. Check FV-69847 sync guard
    const { data: fvRow, error: fvErr } = await supabase
        .from('billing_invoices')
        .select('id, invoice_number, order_id, total_base, total_tax, total_final, worldoffice_sync_status, is_credit_note')
        .eq('id', INVOICE_69847_ID)
        .single();
    if (fvErr) throw fvErr;

    if (fvRow.worldoffice_sync_status === 'synced') {
        console.error(`ABORT: ${fvRow.invoice_number} (${fvRow.id}) already has worldoffice_sync_status = 'synced'.`);
        process.exit(1);
    }

    // 2. Fetch order_items for #1911_1992 to compute exact IVA-included totals (with Mango tommy restored to 50 - 5 net = 45)
    const { data: order1992, error: ordErr } = await supabase
        .from('orders')
        .select('id, sequence_id, total, subtotal, tax')
        .eq('id', ORDER_1992_ID)
        .single();
    if (ordErr) throw ordErr;

    const { data: items1992, error: itemsErr } = await supabase
        .from('order_items')
        .select('id, product_id, quantity, unit_price, products(name, accounting_id, iva_rate)')
        .eq('order_id', ORDER_1992_ID);
    if (itemsErr) throw itemsErr;

    const mangoItem = (items1992 || []).find(
        (it) => String(it.products?.accounting_id) === '264' || /mango\s*tommy/i.test(it.products?.name || '')
    );

    let expectedSubtotal = 0;
    let expectedTax = 0;
    let expectedTotal = 0;
    for (const it of items1992 || []) {
        const netQty = mangoItem && it.id === mangoItem.id ? 45 : (Number(it.quantity) || 0);
        const lineGross = round2(netQty * (Number(it.unit_price) || 0));
        const rate = Number(it.products?.iva_rate) || 0;
        const lineBase = rate > 0 ? round2(lineGross / (1 + rate / 100)) : lineGross;
        const lineTax = round2(lineGross - lineBase);
        expectedSubtotal = round2(expectedSubtotal + lineBase);
        expectedTax = round2(expectedTax + lineTax);
        expectedTotal = round2(expectedTotal + lineGross);
    }

    console.log('\n[1] Order #1911_1992 & FV-69847 Check:');
    console.log('  Current order:', { total: order1992.total, subtotal: order1992.subtotal, tax: order1992.tax });
    console.log('  Current FV-69847:', { total_final: fvRow.total_final, total_base: fvRow.total_base, sync: fvRow.worldoffice_sync_status });
    console.log('  Expected sanitized:', { total: expectedTotal, subtotal: expectedSubtotal, tax: expectedTax });

    // 3. Backfill billing_returns where source IS NULL
    const { data: nullSourceReturns, error: retErr } = await supabase
        .from('billing_returns')
        .select('id, order_id, product_id, quantity_returned, reason, status, source, credit_note_number')
        .is('source', null);
    if (retErr) throw retErr;

    const buckets = {
        pqr_ajuste_factura_legacy_deducted: [],
        pqr_nota_credito: [],
        rectificacion_muelle: [],
        driver_app: []
    };

    for (const ret of nullSourceReturns || []) {
        const cls = classifyLegacySource(ret);
        buckets[cls].push(ret.id);
    }

    console.log('\n[2] billing_returns with source IS NULL:', (nullSourceReturns || []).length);
    for (const [src, ids] of Object.entries(buckets)) {
        console.log(`  - ${src}: ${ids.length}`);
    }

    if (!isApply) {
        console.log('\nDry-run complete. Re-run with --apply to execute.');
        return;
    }

    // Apply backfill by bucket
    for (const [src, ids] of Object.entries(buckets)) {
        if (ids.length === 0) continue;
        const { error: updRetErr } = await supabase
            .from('billing_returns')
            .update({ source: src })
            .in('id', ids);
        if (updRetErr) throw updRetErr;
    }

    // Apply #1911_1992 order_items restoration (Mango tommy #264 -> quantity 50), billing_returns (pqr_ajuste_factura_net, 54950), order & FV-69847 sanitization
    if (mangoItem) {
        const { error: updMangoErr } = await supabase
            .from('order_items')
            .update({ quantity: 50 })
            .eq('id', mangoItem.id);
        if (updMangoErr) throw updMangoErr;
    }

    const { error: upd1992RetErr } = await supabase
        .from('billing_returns')
        .update({
            source: 'pqr_ajuste_factura_net',
            calculated_amount: 54950
        })
        .eq('id', RETURN_1992_ID);
    if (upd1992RetErr) throw upd1992RetErr;

    const { error: updOrdErr } = await supabase
        .from('orders')
        .update({
            total: expectedTotal,
            subtotal: expectedSubtotal,
            tax: expectedTax
        })
        .eq('id', ORDER_1992_ID);
    if (updOrdErr) throw updOrdErr;

    const { error: updFvErr } = await supabase
        .from('billing_invoices')
        .update({
            total_base: expectedSubtotal,
            total_tax: expectedTax,
            total_final: expectedTotal
        })
        .eq('id', INVOICE_69847_ID);
    if (updFvErr) throw updFvErr;

    // Post-execution verification snapshot
    const [postOrd, postFv, postRet, postMango, postNulls] = await Promise.all([
        supabase.from('orders').select('id, sequence_id, total, subtotal, tax').eq('id', ORDER_1992_ID).single(),
        supabase.from('billing_invoices').select('id, invoice_number, total_base, total_tax, total_final').eq('id', INVOICE_69847_ID).single(),
        supabase.from('billing_returns').select('id, source, calculated_amount, status').eq('id', RETURN_1992_ID).single(),
        mangoItem ? supabase.from('order_items').select('id, quantity').eq('id', mangoItem.id).single() : Promise.resolve({ data: null }),
        supabase.from('billing_returns').select('id', { count: 'exact', head: true }).is('source', null)
    ]);

    console.log('\n[3] Post-execution Snapshot:');
    console.log('  Order #1911_1992:', postOrd.data);
    console.log('  Mango tommy item:', postMango.data);
    console.log('  Invoice FV-69847:', postFv.data);
    console.log('  Return 11281413:', postRet.data);
    console.log('  Remaining source IS NULL count:', postNulls.count);
}

main().catch((err) => {
    console.error('Sanitization failed:', err);
    process.exit(1);
});
