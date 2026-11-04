const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const adicionalesDir = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Adicionales';

async function deepInspect() {
  const files = fs.readdirSync(adicionalesDir).filter(f => f.endsWith('.xlsx'));

  const { data: templates } = await supabase.from('quote_templates').select('id, name, description');
  const { data: profiles } = await supabase.from('profiles').select('id, company_name, razon_social, nit').eq('role', 'b2b_client');

  function norm(str) {
    return (str || '')
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, " ");
  }

  // Claves manuales o alias para cada archivo
  const fileSearchKeywords = {
    'aldimar mensual.xlsx': ['aldimark', 'servicios alimenticios aldimark'],
    'ama tu mascota semanal.xlsx': ['amatu', 'mascota'],
    'anglo colombiano mensual.xlsx': ['anglo'],
    'capital mensual.xlsx': ['capital'],
    'carnal semanal.xlsx': ['carnal'],
    'carnicolas quincenal.xlsx': ['carnicolas'],
    'cesap mensual.xlsx': ['cesap', 'patrulleros', 'policia'],
    'cesne contrato.xlsx': ['cesne'],
    'corferias mensual.xlsx': ['corferias'],
    'crepes mensual.xlsx': ['crepes'],
    'diplomat semestral.xlsx': ['diplomat', 'wyndham'],
    'gim montaña semanal.xlsx': ['montana', 'gimnasio'],
    'inverleoka mensual.xlsx': ['inverleoka'],
    'oxo quincenal.xlsx': ['oxo'],
    'puerto peñalisa mensual.xlsx': ['penalisa', 'puerto'],
    'san jorge semanal.xlsx': ['san jorge'],
    'tacocardia semanal.xlsx': ['tacocardia'],
    'tequendama mensual.xlsx': ['tequendama'],
    'termocity semanal.xlsx': ['termocity'],
    'wok familia mensual.xlsx': ['wok', 'lao kao'],
    'wok restaurante mensual.xlsx': ['wok', 'lao kao'],
    'yanuba semanal.xlsx': ['yanuba', 'milsen']
  };

  const results = [];

  for (const f of files) {
    const keywords = fileSearchKeywords[f] || [f.split(' ')[0]];

    // Buscar en templates
    const matchedTpls = (templates || []).filter(t => {
      const tn = norm(t.name);
      return keywords.some(k => tn.includes(norm(k)));
    });

    // Buscar en profiles
    const matchedProfs = (profiles || []).filter(p => {
      const pn = norm(p.company_name + ' ' + (p.razon_social || ''));
      return keywords.some(k => pn.includes(norm(k)));
    });

    // Leer el archivo para ver qué productos no hicieron match
    const filePath = path.join(adicionalesDir, f);
    const wb = xlsx.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    const header = raw[0] || [];
    const rows = raw.slice(1).filter(r => r && r[0] !== undefined);

    results.push({
      archivo: f,
      totalSKUs: rows.length,
      templatesDisponibles: matchedTpls.map(t => ({ id: t.id, name: t.name })),
      perfilesB2B: matchedProfs.slice(0, 3).map(p => ({ id: p.id, name: p.company_name || p.razon_social, nit: p.nit }))
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

deepInspect().catch(err => console.error(err));
