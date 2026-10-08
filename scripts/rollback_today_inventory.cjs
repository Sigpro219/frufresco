const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
else if (fs.existsSync('.env')) dotenv.config({ path: '.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function rollback() {
  console.log('Iniciando rollback del inventario de simulación...');

  // 1. Eliminar movimientos de simulación
  const { error: movErr } = await supabase
    .from('inventory_movements')
    .delete()
    .gte('created_at', '2026-10-07T00:00:00.000Z')
    .lte('created_at', '2026-10-07T23:59:59.999Z')
    .ilike('notes', '%[SIMULACIÓN]%');
  if (movErr) console.error('Error eliminando movimientos:', movErr);
  else console.log('Movimientos de simulación eliminados.');

  // 2. Eliminar cierres oficiales creados
  const { error: c1 } = await supabase.from('daily_inventory_closings').delete().in('closing_date', ['2026-10-06', '2026-10-07']);
  if (c1) console.error('Error eliminando cierres:', c1);
  else console.log('Cierres oficiales de 2026-10-06 y 2026-10-07 eliminados.');

  console.log('Rollback completado.');
}

rollback().catch(console.error);
