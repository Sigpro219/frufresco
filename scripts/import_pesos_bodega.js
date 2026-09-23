/**
 * Script de Ingesta Automatizada de Pesos Reales de Bodega
 * FruFresco ERP - Saneamiento de Unidades Discretas y Pesos Logísticos
 * 
 * Uso:
 *   node scripts/import_pesos_bodega.js                 # Importa solo registros con PESO_REAL_BASCULA_BODEGA_KG
 *   node scripts/import_pesos_bodega.js --use-nominal   # Si no hay peso de báscula, usa el nominal de etiqueta
 *   node scripts/import_pesos_bodega.js --dry-run       # Modo simulación (no escribe en base de datos)
 *   node scripts/import_pesos_bodega.js --sheet=all     # Procesa pestaña 2 y pestaña 3
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const dotenv = require('dotenv');

// Cargar credenciales de entorno
const envConfig = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env.local')));
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  envConfig.NEXT_PUBLIC_SUPABASE_URL,
  envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const isDryRun = process.argv.includes('--dry-run');
const useNominal = process.argv.includes('--use-nominal');
const sheetArg = process.argv.find(arg => arg.startsWith('--sheet='));
const targetSheet = sheetArg ? sheetArg.split('=')[1] : '2';

async function runImport() {
  const filePath = path.resolve(process.cwd(), 'Auditoria_Pesos_Bodega_FruFresco.xlsx');
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ No se encontró el archivo Excel en: ${filePath}`);
    return;
  }

  console.log(`========================================================================`);
  console.log(`⚖️  FRUFRESCO - INGESTA DE PESOS DE BODEGA & SANEAMIENTO DE UNIDADES`);
  console.log(`📁 Archivo: ${filePath}`);
  console.log(`⚙️  Modo Dry-Run: ${isDryRun ? 'ACTIVADO (Sin escritura en DB)' : 'DESACTIVADO (Escritura real)'}`);
  console.log(`🏷️  Fallback Nominal: ${useNominal ? 'PERMITIDO' : 'SOLO PESO REAL EN BÁSCULA'}`);
  console.log(`========================================================================\n`);

  const wb = XLSX.readFile(filePath);

  let sheetsToProcess = [];
  if (targetSheet === 'all') {
    sheetsToProcess = ['2_PRIORIDAD_FRASCOS_Y_CUBETAS', '3_DESPENSA_Y_LACTEOS_ACTIVOS'];
  } else if (targetSheet === '3') {
    sheetsToProcess = ['3_DESPENSA_Y_LACTEOS_ACTIVOS'];
  } else {
    sheetsToProcess = ['2_PRIORIDAD_FRASCOS_Y_CUBETAS'];
  }

  let totalUpdated = 0;
  let totalPendingWeighing = 0;
  let totalErrors = 0;

  for (const sheetName of sheetsToProcess) {
    if (!wb.Sheets[sheetName]) {
      console.warn(`⚠️ Pestaña "${sheetName}" no encontrada en el archivo. Omitiendo.`);
      continue;
    }

    console.log(`\n📄 Procesando pestaña: [${sheetName}]`);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
    console.log(`📊 Total registros en hoja: ${rows.length}`);

    for (const row of rows) {
      const productId = row['UUID_PRODUCTO'];
      const sku = row['SKU'] || 'SIN-SKU';
      const name = row['NOMBRE_PRODUCTO'] || 'Sin Nombre';
      
      const realWeightStr = row['PESO_REAL_BASCULA_BODEGA_KG'];
      const nominalWeightStr = row['PESO_NOMINAL_ETIQUETA_KG'];
      const proposedUnit = row['UNIDAD_NUEVA_PROPUESTA'] || 'Unidad';

      let chosenWeight = null;
      let weightSource = '';

      if (realWeightStr !== undefined && realWeightStr !== null && realWeightStr !== '' && !isNaN(parseFloat(realWeightStr)) && parseFloat(realWeightStr) > 0) {
        chosenWeight = parseFloat(parseFloat(realWeightStr).toFixed(3));
        weightSource = 'BÁSCULA BODEGA';
      } else if (useNominal && nominalWeightStr !== undefined && nominalWeightStr !== null && nominalWeightStr !== '' && !isNaN(parseFloat(nominalWeightStr)) && parseFloat(nominalWeightStr) > 0) {
        chosenWeight = parseFloat(parseFloat(nominalWeightStr).toFixed(3));
        weightSource = 'NOMINAL ETIQUETA';
      }

      if (!chosenWeight) {
        totalPendingWeighing++;
        // console.log(`   ⏳ [${sku}] ${name} -> Pendiente pesaje en báscula.`);
        continue;
      }

      if (isDryRun) {
        totalUpdated++;
        console.log(`   [DRY-RUN] [${sku}] ${name} -> UoM: ${proposedUnit} | Peso: ${chosenWeight} kg (${weightSource})`);
      } else {
        const { error } = await supabase
          .from('products')
          .update({
            unit_of_measure: proposedUnit,
            weight_kg: chosenWeight
          })
          .eq('id', productId);

        if (error) {
          totalErrors++;
          console.error(`   ❌ [${sku}] Error al actualizar: ${error.message}`);
        } else {
          totalUpdated++;
          console.log(`   ✅ [${sku}] ${name} -> UoM: ${proposedUnit} | Peso: ${chosenWeight} kg (${weightSource})`);
        }
      }
    }
  }

  console.log(`\n========================================================================`);
  console.log(`📋 RESUMEN DE LA INGESTA:`);
  console.log(`- Registros procesados con éxito: ${totalUpdated} ${isDryRun ? '(Simulados)' : '(Actualizados en Supabase)'}`);
  console.log(`- Registros pendientes por pesar en bodega: ${totalPendingWeighing}`);
  if (totalErrors > 0) console.log(`- Errores de base de datos: ${totalErrors}`);
  console.log(`========================================================================\n`);
}

runImport();
