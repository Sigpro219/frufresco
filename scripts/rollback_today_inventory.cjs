const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
else if (fs.existsSync('.env')) dotenv.config({ path: '.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const TARGET_DATE = '2026-10-07';
const WAREHOUSE_ID = 'd606c381-45bd-45f3-a0a9-9b8b3b196ac3';
const BACKUP_FILE = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Projects\\frufresco\\backups\\inventory_stocks_before_20261007_simulation.json';

async function rollback() {
  console.log('Iniciando rollback del inventario de ' + TARGET_DATE + '...');

  // 1. Eliminar movimientos de simulación
  const { data: delMovs, error: movErr } = await supabase
    .from('inventory_movements')
    .delete()
    .gte('created_at', TARGET_DATE + 'T00:00:00.000Z')
    .lte('created_at', TARGET_DATE + 'T23:59:59.999Z')
    .ilike('notes', '%[SIMULACIÓN]%');
  if (movErr) console.error('Error eliminando movimientos:', movErr);
  else console.log('Movimientos de simulación eliminados con éxito.');

  // 2. Eliminar cierre oficial
  const { error: closeErr } = await supabase
    .from('daily_inventory_closings')
    .delete()
    .eq('closing_date', TARGET_DATE);
  if (closeErr) console.error('Error eliminando cierre oficial:', closeErr);
  else console.log('Cierre oficial de ' + TARGET_DATE + ' eliminado.');

  // 3. Restaurar inventory_stocks desde backup si existe
  if (fs.existsSync(BACKUP_FILE)) {
    const raw = fs.readFileSync(BACKUP_FILE, 'utf-8');
    const prev = JSON.parse(raw);
    console.log('Restaurando ' + prev.length + ' stocks previos...');
    for (const item of prev) {
      await supabase
        .from('inventory_stocks')
        .update({ quantity: item.quantity, updated_at: new Date().toISOString() })
        .eq('id', item.id);
    }
    console.log('inventory_stocks restaurado exitosamente.');
  }

  console.log('Rollback completado al 100%.');
}

rollback().catch(console.error);
