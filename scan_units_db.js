const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function scan() {
  console.log("=== INICIANDO AGENTE ANALIZADOR DE CATÁLOGO ===");
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, unit_of_measure, is_active');
    
    if (error) {
      console.error("Error al consultar productos:", error);
      return;
    }
    
    console.log(`Productos activos/totales analizados: ${products.length}\n`);
    
    const anomalies = [];
    
    products.forEach(p => {
      const name = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const unit = (p.unit_of_measure || '').toLowerCase().trim();
      
      // Regla 1: Huevos no deberían venderse en Kg
      if (name.includes('huevo') && unit === 'kg') {
        anomalies.push({
          id: p.id,
          name: p.name,
          unit_of_measure: p.unit_of_measure,
          reason: "Huevos configurados en 'Kg' en lugar de 'Unidad' o 'Cubeta'."
        });
      }
      
      // Regla 2: Leches, bebidas, jugos, yogures o aceites no deberían venderse en Kg
      if ((name.includes('leche') || name.includes('jugo') || name.includes('yogurt') || name.includes('aceite') || name.includes('bebida')) && unit === 'kg') {
        anomalies.push({
          id: p.id,
          name: p.name,
          unit_of_measure: p.unit_of_measure,
          reason: "Bebida/líquido configurado en 'Kg' en lugar de 'Litro' o 'Unidad'."
        });
      }
      
      // Regla 3: Panadería o arepas no deberían venderse en Kg
      if ((name.includes('pan ') || name.includes('panes') || name.includes('tajado') || name.includes('tostada') || name.includes('arepa') || name.includes('galleta')) && unit === 'kg') {
        anomalies.push({
          id: p.id,
          name: p.name,
          unit_of_measure: p.unit_of_measure,
          reason: "Producto de panadería/arepa configurado en 'Kg' en lugar de 'Unidad' o 'Paquete'."
        });
      }
      
      // Regla 4: Productos con unidad nula o vacía
      if (!p.unit_of_measure) {
        anomalies.push({
          id: p.id,
          name: p.name,
          unit_of_measure: 'NULA',
          reason: "El producto no tiene ninguna unidad de medida configurada en la base de datos."
        });
      }
    });
    
    if (anomalies.length === 0) {
      console.log("✅ ¡Felicidades! No se detectaron fallas de lógica en el catálogo.");
    } else {
      console.log(`⚠️ Se encontraron ${anomalies.length} anomalías de lógica en el catálogo:\n`);
      anomalies.forEach((a, i) => {
        console.log(`${i + 1}. Producto: "${a.name}"`);
        console.log(`   Unidad en DB: "${a.unit_of_measure}"`);
        console.log(`   Detalle de Falla: ${a.reason}`);
        console.log(`   ID: ${a.id}\n`);
      });
    }
  } catch (e) {
    console.error("Excepción en el escaneo:", e);
  }
  console.log("=== FIN DEL ANÁLISIS ===");
}

scan();
