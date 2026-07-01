const XLSX = require('C:\\Users\\German Higuera\\OneDrive\\Documentos\\Projects\\frufresco\\node_modules\\xlsx');
const { createClient } = require('C:\\Users\\German Higuera\\OneDrive\\Documentos\\Projects\\frufresco\\node_modules\\@supabase\\supabase-js');
const dotenv = require('C:\\Users\\German Higuera\\OneDrive\\Documentos\\Projects\\frufresco\\node_modules\\dotenv');

dotenv.config({ path: 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Projects\\frufresco\\.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const filePath = "C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\BD CARACTERISTICAS_PRODUCTO-FRUFRESCO.xlsx";

// Spanish stemmer helper
function getSpanishStem(word) {
  if (!word) return '';
  let norm = word.toLowerCase().trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^a-z0-9]/g, "");     // remove special chars
  
  if (norm.length <= 2) return norm;

  if (norm.endsWith('s')) {
    norm = norm.slice(0, -1);
  }
  if (norm.endsWith('a') || norm.endsWith('o') || norm.endsWith('e')) {
    norm = norm.slice(0, -1);
  }
  return norm;
}

// Check if characteristic text matches a variant option value
function matchVariantOption(charText, optionValue) {
  const optLower = String(optionValue).toLowerCase().trim();
  if (!optLower) return false;
  const optStem = getSpanishStem(optLower);
  if (!optStem) return false;

  const words = charText.toLowerCase().split(/[^a-zA-Z0-9\u00C0-\u017F]+/);
  for (const w of words) {
    const wStem = getSpanishStem(w);
    if (wStem === optStem && wStem.length >= 2) {
      return true;
    }
  }
  return false;
}

// Manual branch mapping overrides for discrepancies
const branchOverrides = {
  '931': '783',   // Club Bellavista (931 -> 783)
  '1066': '1065', // San Gregorio (1066 -> 1065)
  '1138': '1189'  // Rancho MX (1138 -> 1189)
};

async function runImport() {
  try {
    console.log("=== STARTING PRODUCT CHARACTERISTICS IMPORT ===");
    console.log("Reading file:", filePath);
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets['novedades (1)'];
    const rows = XLSX.utils.sheet_to_json(worksheet);
    console.log(`Total rows in Excel: ${rows.length}`);

    // 1. Fetch DB Products
    console.log("Fetching products from Supabase...");
    let dbProducts = [];
    let page = 0;
    let done = false;
    while (!done) {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, accounting_id, options_config')
        .range(page * 1000, (page + 1) * 1000 - 1);
      
      if (error) throw error;
      if (data && data.length > 0) {
        dbProducts = [...dbProducts, ...data];
        if (data.length < 1000) done = true;
        else page++;
      } else {
        done = true;
      }
    }
    console.log(`Loaded ${dbProducts.length} products from database.`);

    // 2. Fetch DB Profiles
    console.log("Fetching B2B profiles from Supabase...");
    let dbProfiles = [];
    page = 0;
    done = false;
    while (!done) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, company_name, branch_id')
        .range(page * 1000, (page + 1) * 1000 - 1);
      
      if (error) throw error;
      if (data && data.length > 0) {
        dbProfiles = [...dbProfiles, ...data];
        if (data.length < 1000) done = true;
        else page++;
      } else {
        done = true;
      }
    }
    console.log(`Loaded ${dbProfiles.length} profiles from database.`);

    // Map helpers
    const productMap = new Map();
    dbProducts.forEach(p => {
      if (p.accounting_id !== null && p.accounting_id !== undefined) {
        productMap.set(String(p.accounting_id), p);
      }
    });

    const profileMap = new Map();
    dbProfiles.forEach(p => {
      if (p.branch_id !== null && p.branch_id !== undefined) {
        profileMap.set(String(p.branch_id), p);
      }
    });

    const skippedRows = [];
    const groupedPayloads = new Map(); // Unique key = `${customer_id}-${product_id}`
    let matchedProducts = 0;
    let matchedProfiles = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const excelProdId = String(row.IDPRODUCTO).trim();
      let excelBranchId = String(row.IDSUCURSAL).trim();
      const rawChar = String(row.CARACTERISTICA || '').trim();

      // Apply branch override if configured
      if (branchOverrides[excelBranchId]) {
        excelBranchId = branchOverrides[excelBranchId];
      }

      const product = productMap.get(excelProdId);
      const profile = profileMap.get(excelBranchId);

      if (!product) {
        skippedRows.push({
          row: i + 2,
          reason: `Producto no encontrado en DB (accounting_id: ${excelProdId})`,
          data: row
        });
        continue;
      }
      matchedProducts++;

      if (!profile) {
        skippedRows.push({
          row: i + 2,
          reason: `Sucursal no encontrada en DB (branch_id: ${excelBranchId})`,
          data: row
        });
        continue;
      }
      matchedProfiles++;

      // Analyze characteristic to categorize it
      let substitution_product_id = null;
      let preferred_options = {};
      let picking_note = '';
      let delivery_note = '';

      const charLower = rawChar.toLowerCase();

      // 1. Is it a substitution rule?
      if (charLower.includes('cambiar') || charLower.includes('reemplazar')) {
        let targetTerm = '';
        if (charLower.includes('zukini') || charLower.includes('zucchin')) {
          targetTerm = 'zukini';
        } else if (charLower.includes('larga vida')) {
          targetTerm = 'larga vida';
        } else if (charLower.includes('seco')) {
          targetTerm = 'seco';
        } else if (charLower.includes('cero')) {
          targetTerm = 'cero';
        }

        if (targetTerm) {
          const matchedSubProduct = dbProducts.find(p => p.name.toLowerCase().includes(targetTerm));
          if (matchedSubProduct) {
            substitution_product_id = matchedSubProduct.id;
            picking_note = `Sustitución: ${rawChar}`;
          }
        }
      }

      // 2. Is it a variant option?
      if (!substitution_product_id && product.options_config && Array.isArray(product.options_config)) {
        product.options_config.forEach(opt => {
          if (opt.values && Array.isArray(opt.values)) {
            opt.values.forEach(val => {
              if (matchVariantOption(rawChar, val)) {
                preferred_options[opt.name] = val;
              }
            });
          }
        });
      }

      // 3. Is it a logistics / picking note?
      if (!substitution_product_id) {
        if (charLower.includes('entregar') || charLower.includes('recibir') || charLower.includes('horario') || charLower.includes('sotano') || charLower.includes('bodega')) {
          delivery_note = rawChar;
        } else {
          picking_note = rawChar;
        }
      }

      const key = `${profile.id}-${product.id}`;
      if (groupedPayloads.has(key)) {
        // Merge with existing record to avoid unique constraints violation
        const existing = groupedPayloads.get(key);
        existing.preferred_options = { ...existing.preferred_options, ...preferred_options };
        
        if (picking_note) {
          existing.picking_note = existing.picking_note 
            ? `${existing.picking_note}, ${picking_note}` 
            : picking_note;
        }
        if (delivery_note) {
          existing.delivery_note = existing.delivery_note 
            ? `${existing.delivery_note}, ${delivery_note}` 
            : delivery_note;
        }
        if (substitution_product_id) {
          existing.substitution_product_id = substitution_product_id;
        }
      } else {
        groupedPayloads.set(key, {
          customer_id: profile.id,
          product_id: product.id,
          nickname: product.name,
          picking_note: picking_note || '',
          delivery_note: delivery_note || '',
          substitution_product_id: substitution_product_id,
          preferred_options: preferred_options
        });
      }
    }

    const payloadList = Array.from(groupedPayloads.values());

    console.log(`\n=== MIGRATION PREVIEW ===`);
    console.log(`Excel Rows analyzed: ${rows.length}`);
    console.log(`Matched Products: ${matchedProducts}`);
    console.log(`Matched Profiles: ${matchedProfiles}`);
    console.log(`Consolidated unique payloads to insert: ${payloadList.length}`);
    console.log(`Skipped rows (with reasons): ${skippedRows.length}`);

    // Perform DB upload
    if (payloadList.length > 0) {
      console.log(`\n⚡ Upserting ${payloadList.length} exceptions into product_nicknames...`);
      
      const chunkSize = 150;
      let successCount = 0;

      for (let i = 0; i < payloadList.length; i += chunkSize) {
        const chunk = payloadList.slice(i, i + chunkSize);
        
        // Match by unique constraint (customer_id, product_id)
        const { error } = await supabase
          .from('product_nicknames')
          .upsert(chunk, { onConflict: 'customer_id,product_id' });

        if (error) {
          console.error(`❌ Error in upsert chunk starting at index ${i}:`, error.message);
          throw error;
        }
        successCount += chunk.length;
        console.log(`  - Upserted ${successCount} / ${payloadList.length} rows...`);
      }

      console.log(`\n✅ SUCCESSFULLY IMPORTED ${successCount} UNIQUE CHARACTERISTICS!`);
    }

    // Save detailed execution report to a text file
    const fs = require('fs');
    const reportPath = "C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\651c25df-e46d-4e28-984a-ca0d145deb1e\\skipped_characteristics_report.json";
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      excel_path: filePath,
      total_rows: rows.length,
      imported_unique_payloads: payloadList.length,
      skipped_rows_count: skippedRows.length,
      skipped_rows: skippedRows
    }, null, 2));
    console.log(`Detailed skipped rows report saved to: ${reportPath}`);

  } catch (err) {
    console.error("❌ Migration failed:", err);
  }
}

runImport();
