const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
let env = {};
const data = fs.readFileSync(envPath, 'utf8');
data.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2 && !line.trim().startsWith('#')) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        env[key] = val;
    }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function rollbackToOct6() {
    console.log('=== ROLLBACK: RESTAURANDO LOS 78 PEDIDOS A 2026-10-06 ===\n');

    const snapshotPath = path.resolve(__dirname, '../backups/orders_78_oct6_snapshot.json');
    if (!fs.existsSync(snapshotPath)) {
        console.error('No se encontró el archivo de respaldo:', snapshotPath);
        return;
    }

    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    const orderIds = snapshot.orders.map(o => o.id);

    console.log(`Leídos ${orderIds.length} pedidos del respaldo.`);

    const { data: updated, error } = await supabase
        .from('orders')
        .update({ delivery_date: '2026-10-06' })
        .in('id', orderIds)
        .select('id, sequence_id');

    if (error) {
        console.error('Error en rollback:', error);
        return;
    }

    console.log(`✅ Rollback exitoso: ${updated.length} pedidos devueltos a delivery_date = 2026-10-06.`);
}

rollbackToOct6();
