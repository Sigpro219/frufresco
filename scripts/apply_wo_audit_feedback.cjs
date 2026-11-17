require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const INPUT_EXCEL = 'C:\\Users\\German Higuera\\OneDrive\\Desktop\\2Auditoria_Apareamiento_WorldOffice_FruFresco.xlsx';

async function run() {
  const wb = XLSX.readFile(INPUT_EXCEL, { cellStyles: true });
  const ws = wb.Sheets['Faltantes_Crear_En_WO'];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  let deletedCount = 0;
  let deactivatedCount = 0;
  let updatedCount = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const excelRow = idx + 2;
    const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
    const isYellow = cols.some(c => {
      const fg = ws[c + excelRow]?.s?.fgColor?.rgb || '';
      return fg.includes('FFFF00');
    });

    const id = String(r.ID || '').trim();
    const woName = String(r.Nombre_FruFresco || '').trim();
    const cleanNit = String(r.NIT_o_Cedula_Actual || '').trim().split('-')[0].replace(/\D/g, '');

    if (!id) continue;

    if (isYellow) {
      const { count: ordCount } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', id);
      const { count: childCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', id);

      if ((ordCount || 0) === 0 && (childCount || 0) === 0) {
        const { error: delErr } = await supabase.from('profiles').delete().eq('id', id);
        if (!delErr) {
          console.log(`[ELIMINADO] ${id} | ${woName} (${cleanNit})`);
          deletedCount++;
          continue;
        }
        console.log(`[FK AL ELIMINAR -> DESACTIVANDO] ${id} | ${woName}: ${delErr.message}`);
      }

      const { data: existing } = await supabase.from('profiles').select('logistics_data').eq('id', id).single();
      const { error: deactErr } = await supabase
        .from('profiles')
        .update({
          is_active: false,
          logistics_data: {
            ...(existing?.logistics_data || {}),
            world_office_verified: false,
            archived_reason: 'Marcado en amarillo para eliminación en auditoría WO (conservado inactivo por integridad referencial)'
          }
        })
        .eq('id', id);

      if (deactErr) {
        console.error(`Error desactivando ${id}:`, deactErr.message);
      } else {
        console.log(`[DESACTIVADO POR INTEGRIDAD] ${id} | ${woName} (orders=${ordCount}, children=${childCount})`);
        deactivatedCount++;
      }
    } else {
      const { data: existing, error: fetchErr } = await supabase
        .from('profiles')
        .select('logistics_data')
        .eq('id', id)
        .single();

      if (fetchErr) {
        console.error(`Error leyendo ${id}:`, fetchErr.message);
        continue;
      }

      const nextLogistics = {
        ...(existing?.logistics_data || {}),
        world_office_branch: woName,
        world_office_tercero_name: woName,
        world_office_nit: cleanNit,
        world_office_verified: true
      };

      const { error: updErr } = await supabase
        .from('profiles')
        .update({
          billing_nit: cleanNit,
          billing_razon_social: woName,
          logistics_data: nextLogistics
        })
        .eq('id', id);

      if (updErr) {
        console.error(`Error actualizando ${id} (${woName}):`, updErr.message);
      } else {
        console.log(`[ACTUALIZADO Y VERIFICADO WO] ${id} | ${woName} (${cleanNit})`);
        updatedCount++;
      }
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log({ deletedCount, deactivatedCount, updatedCount });
}

run().catch(err => {
  console.error('Fallo fatal:', err);
  process.exit(1);
});
