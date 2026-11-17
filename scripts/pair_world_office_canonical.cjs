require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const WO_EXCEL_PATH = 'C:\\Users\\German Higuera\\OneDrive\\Desktop\\CLIENTES INVESTMENTS NOMBRE Y NIT O CC.xlsx';
const SQL_OUTPUT_PATH = path.join(__dirname, '..', 'src', 'lib', 'migration_worldoffice_canonical_pairing.sql');

// Correcciones comprobadas de NITs/Cédulas contra el maestro oficial de World Office
const NIT_TYPO_FIXES = {
  '59eaffaa-fec1-4b2e-a57c-f291ad0aa3b2': { newNit: '52453404', reason: 'PAOLA SOLER: cédula errada 123465879 -> 52453404 (WO)' },
  '0195b02e-7213-439f-a374-295b4b82e16b': { newNit: '52969094', reason: 'MONICA BELEÑO: cédula truncada 5296909 -> 52969094 (WO)' },
  '8e433e3d-e91c-488b-a030-058a3e9ecee6': { newNit: '52695710', reason: 'DIANA HIGUERA: cédula truncada 5214265 -> 52695710 (WO)' },
  '9e08e229-0476-4842-84e9-1fb79a346e07': { newNit: '51959925', reason: 'CLAUDIA VARGAS: cédula errada 52227594 -> 51959925 (WO)' },
  '327d3723-68c6-4fa4-90ab-46407ba2d48c': { newNit: '860007336', reason: 'Colsubsidio: NIT "No detectado" -> 860007336 (WO)' }
};

// Correcciones de overrides defectuosos en logistics_data.world_office_branch
const BRANCH_OVERRIDE_FIXES = {
  'c40e6c07-f2e1-43f7-898c-df9ccbb6c0a9': {
    newBranch: 'EL CORRAL CAFAM l 3° Piso',
    reason: 'EL CORRAL CAFAM L 3° PISO -> EL CORRAL CAFAM l 3° Piso (case exacto WO)'
  },
  '0f1f4f31-9102-464b-807d-bb6ca7f017e9': {
    newBranch: 'ALDIMARK-ABRASIVOS',
    reason: 'ALDIMARK ABRASIVOS -> ALDIMARK-ABRASIVOS (guion exacto WO)'
  }
};

function cleanNitDigits(raw) {
  if (!raw) return '';
  const base = String(raw).trim().split('-')[0];
  return base.replace(/\D/g, '');
}

function sqlEscape(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function extractBranchFallback(profile, parentProfile) {
  const fullName = (profile?.company_name || profile?.razon_social || profile?.contact_name || '').trim();
  const legalName = (profile?.razon_social || profile?.company_name || profile?.contact_name || parentProfile?.razon_social || parentProfile?.company_name || '').trim();
  if (!fullName && !legalName) return '';

  const isBranch = Boolean(profile?.parent_id) || Boolean(profile?.branch_id);
  const parentCandidates = [
    parentProfile?.company_name,
    parentProfile?.razon_social,
    isBranch ? profile?.razon_social : null
  ]
    .map(c => (typeof c === 'string' ? c.trim() : ''))
    .filter(Boolean);

  for (const pName of parentCandidates) {
    if (fullName && fullName.toLowerCase() !== pName.toLowerCase() && fullName.toLowerCase().startsWith(pName.toLowerCase())) {
      const sub = fullName.slice(pName.length).trim().replace(/^[-–—:]+\s*/, '');
      if (sub) return sub;
    }
  }

  if (isBranch && fullName.includes(' - ')) {
    const parts = fullName.split(' - ');
    const candidate = parts.slice(1).join(' - ').trim();
    if (candidate) return candidate;
  }

  if (isBranch && fullName) {
    return fullName;
  }

  return legalName || fullName;
}

async function run() {
  if (!fs.existsSync(WO_EXCEL_PATH)) {
    console.error('No se encontró el archivo de World Office:', WO_EXCEL_PATH);
    process.exit(1);
  }

  // 1. Leer Maestro de Terceros de World Office
  const wb = XLSX.readFile(WO_EXCEL_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const woByNit = new Map();
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    const nombreRaw = String(r[1] || '');
    const nombre = nombreRaw.trim();
    const clasif = String(r[2] || '').trim();
    const cleanId = cleanNitDigits(r[3]);
    const dv = String(r[4] || '').trim();
    if (!nombre && !cleanId) continue;
    woByNit.set(cleanId, { row: i + 1, nombreRaw, nombre, clasif, cleanId, dv });
  }
  console.log(`Terceros cargados de World Office Excel: ${woByNit.size}`);

  // 2. Leer todos los perfiles de public.profiles
  const { data: allProfiles, error: fetchErr } = await supabase
    .from('profiles')
    .select('id, nit, company_name, razon_social, contact_name, role, parent_id, is_corporate_parent, branch_id, is_active, billing_nit, billing_razon_social, logistics_data');

  if (fetchErr) {
    console.error('Error leyendo profiles:', fetchErr);
    process.exit(1);
  }

  const profilesMap = new Map(allProfiles.map(p => [p.id, p]));
  const clientProfiles = allProfiles.filter(
    p => p.role === 'b2b_client' || p.role === 'b2c_client' || Boolean(p.parent_id) || Boolean(p.is_corporate_parent)
  );
  const childrenByParent = new Map();
  for (const p of clientProfiles) {
    if (p.parent_id) {
      if (!childrenByParent.has(p.parent_id)) childrenByParent.set(p.parent_id, []);
      childrenByParent.get(p.parent_id).push(p);
    }
  }

  console.log(`Perfiles cliente a procesar: ${clientProfiles.length} (Activos: ${clientProfiles.filter(p => p.is_active !== false).length}, Inactivos: ${clientProfiles.filter(p => p.is_active === false).length})`);

  const sqlStatements = [
    '-- MIGRATION: CANONICAL WORLD OFFICE PAIRING (1-TO-1)',
    `-- Generated at: ${new Date().toISOString()}`,
    `-- Source Excel: CLIENTES INVESTMENTS NOMBRE Y NIT O CC.xlsx (${woByNit.size} terceros)`,
    'BEGIN;',
    ''
  ];

  let updatedCount = 0;
  let errorCount = 0;
  let verifiedCount = 0;
  let unverifiedActive = [];
  const auditChanges = [];

  for (const p of clientProfiles) {
    const parent = p.parent_id ? profilesMap.get(p.parent_id) : null;
    const typoFix = NIT_TYPO_FIXES[p.id];
    const branchFix = BRANCH_OVERRIDE_FIXES[p.id];

    // NIT efectivo del perfil o de su Casa Matriz
    const ownNitClean = typoFix ? typoFix.newNit : cleanNitDigits(p.nit);
    const parentNitClean = parent
      ? (NIT_TYPO_FIXES[parent.id] ? NIT_TYPO_FIXES[parent.id].newNit : cleanNitDigits(parent.nit))
      : '';
    const canonicalNit = (p.parent_id && parentNitClean) ? parentNitClean : (ownNitClean || parentNitClean || '222222222222');

    const woMatch = woByNit.get(canonicalNit);
    const woTerceroNombre = woMatch ? woMatch.nombreRaw : '';
    const fallbackClientName = (parent?.razon_social || parent?.company_name || p.razon_social || p.company_name || p.contact_name || 'Cliente General').trim();

    const hasChildren = (childrenByParent.get(p.id) || []).length > 0;
    const isBranch = Boolean(p.parent_id) || Boolean(p.branch_id);
    const isCorporateContainer = Boolean(p.is_corporate_parent) || hasChildren;

    // Determinar canonicalSucursal (Columna AD: Encab: Sucursal)
    let canonicalSucursal = '';
    const existingExplicit = p.logistics_data?.world_office_branch;

    if (branchFix) {
      canonicalSucursal = branchFix.newBranch;
    } else if (typeof existingExplicit === 'string' && existingExplicit.trim().length > 0) {
      canonicalSucursal = existingExplicit;
    } else if (isBranch) {
      // Caso A: Sucursal B2B con parent_id
      canonicalSucursal = extractBranchFallback(p, parent);
    } else if (isCorporateContainer) {
      // Casa Matriz B2B
      canonicalSucursal = woTerceroNombre || (p.razon_social || p.company_name || '').trim();
    } else {
      // Caso B: Cliente Individual B2C o B2B sin sucursales
      canonicalSucursal = woTerceroNombre || (p.razon_social || p.company_name || p.contact_name || '').trim();
    }

    if (!canonicalSucursal) {
      canonicalSucursal = woTerceroNombre || fallbackClientName || 'CLIENTE GENERAL';
    }

    const effectiveTerceroName = woTerceroNombre || fallbackClientName;
    const isVerified = Boolean(woMatch);
    if (isVerified) verifiedCount++;
    else if (p.is_active !== false) {
      unverifiedActive.push({
        id: p.id,
        company_name: p.company_name,
        canonicalNit,
        canonicalSucursal,
        role: p.role
      });
    }

    const nextLogistics = {
      ...(p.logistics_data && typeof p.logistics_data === 'object' ? p.logistics_data : {}),
      world_office_branch: canonicalSucursal,
      world_office_tercero_name: effectiveTerceroName,
      world_office_nit: canonicalNit,
      world_office_verified: isVerified
    };

    const updatePayload = {
      billing_nit: canonicalNit,
      billing_razon_social: canonicalSucursal,
      logistics_data: nextLogistics
    };
    if (typoFix) {
      updatePayload.nit = typoFix.newNit;
    }

    const { error: updErr } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', p.id);

    if (updErr) {
      console.error(`Error actualizando ${p.id} (${p.company_name}):`, updErr.message);
      errorCount++;
    } else {
      updatedCount++;
    }

    // Agregar sentencia SQL al archivo auditable
    const woFragmentJson = JSON.stringify({
      world_office_branch: canonicalSucursal,
      world_office_tercero_name: effectiveTerceroName,
      world_office_nit: canonicalNit,
      world_office_verified: isVerified
    });

    const setClauses = [
      typoFix ? `nit = ${sqlEscape(typoFix.newNit)}` : null,
      `billing_nit = ${sqlEscape(canonicalNit)}`,
      `billing_razon_social = ${sqlEscape(canonicalSucursal)}`,
      `logistics_data = COALESCE(logistics_data, '{}'::jsonb) || ${sqlEscape(woFragmentJson)}::jsonb`
    ].filter(Boolean);

    sqlStatements.push(
      `-- ${(p.company_name || p.contact_name || p.id).replace(/[\r\n]+/g, ' ')} (${p.role}, active=${p.is_active !== false})`
    );
    sqlStatements.push(
      `UPDATE public.profiles SET ${setClauses.join(', ')} WHERE id = ${sqlEscape(p.id)};`
    );

    if (typoFix || branchFix || (woMatch && !isBranch && canonicalSucursal !== (p.company_name || '').trim())) {
      auditChanges.push({
        id: p.id,
        company_name: p.company_name,
        oldNit: p.nit,
        canonicalNit,
        canonicalSucursal,
        woTerceroNombre,
        reason: typoFix?.reason || branchFix?.reason || 'Homologado nombre individual contra Maestro WO'
      });
    }
  }

  sqlStatements.push('', 'COMMIT;', '');
  fs.writeFileSync(SQL_OUTPUT_PATH, sqlStatements.join('\n'), 'utf8');

  console.log('\n=== RESUMEN DE APAREAMIENTO CANONICO ===');
  console.log(`Perfiles actualizados en Supabase: ${updatedCount} / ${clientProfiles.length}`);
  console.log(`Errores de actualización: ${errorCount}`);
  console.log(`Perfiles verificados contra NIT/CC del Excel WO: ${verifiedCount}`);
  console.log(`Perfiles activos sin match NIT en Excel WO: ${unverifiedActive.length}`);
  console.log(`Archivo SQL generado: ${SQL_OUTPUT_PATH}`);
  console.log(`Cambios especiales / correcciones aplicadas: ${auditChanges.length}`);
}

run().catch(err => {
  console.error('Fallo fatal:', err);
  process.exit(1);
});
