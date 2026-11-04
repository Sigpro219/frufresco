const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectHierarchies() {
  const targets = ['ALDIMARK', 'WOK', 'TEQUENDAMA', 'PENALISA', 'PEÑALISA', 'ANGLO', 'OXO', 'CARNICOLAS', 'CARNAL', 'YANUBA', 'MILSEN', 'TACOCARDIA'];

  for (const t of targets) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, company_name, razon_social, parent_id, pricing_model_id, is_corporate_parent, branch_id')
      .or(`company_name.ilike.%${t}%,razon_social.ilike.%${t}%`);

    if (profs && profs.length > 0) {
      console.log(`\n=== TARGET: ${t} (Total profiles: ${profs.length}) ===`);
      const parents = profs.filter(p => p.is_corporate_parent || !p.parent_id);
      const branches = profs.filter(p => p.parent_id);
      console.log(`  Padres / Matrices (${parents.length}):`);
      parents.forEach(p => {
        console.log(`    - ID: ${p.id} | ${p.company_name || p.razon_social} | ModelID: ${p.pricing_model_id || 'null'}`);
      });
      console.log(`  Sedes / Sucursales (${branches.length}):`);
      branches.forEach(b => {
        console.log(`    - ID: ${b.id} | ${b.company_name || b.razon_social} | ParentID: ${b.parent_id} | ModelID: ${b.pricing_model_id || 'null'}`);
      });
    }
  }
}

inspectHierarchies().catch(console.error);
