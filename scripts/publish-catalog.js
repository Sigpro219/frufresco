const { createClient } = require('@supabase/supabase-js');

/**
 * 🚀 PUBLICACIÓN MAESTRA DE PRECIOS OPTIMIZADA (PPP)
 * Este script calcula el costo promedio de las últimas 3 compras y publica
 * el precio final en el catálogo basándose en el modelo B2C.
 */

const SOURCE_URL = 'https://csqurhdykbalvlnpowcz.supabase.co'; // Tenant 1
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';

const supabase = createClient(SOURCE_URL, SERVICE_KEY);

async function publishOptimizedPrices() {
    console.log('--- 🛰️ INICIANDO PUBLICACIÓN OPTIMIZADA DE CATÁLOGO ---');

    try {
        // 1. Obtener Modelo "Clientes B2C" (ID y Margen Base)
        const { data: model } = await supabase.from('pricing_models').select('*').eq('name', 'Clientes B2C').single();
        if (!model) throw new Error('No se encontró el modelo \"Clientes B2C\"');

        // 2. Obtener Reglas de Excepción
        const { data: rules } = await supabase.from('pricing_rules').select('*').eq('model_id', model.id);
        const rulesMap = {};
        rules?.forEach(r => rulesMap[r.product_id] = r.margin_adjustment);

        // 3. Obtener Productos Activos
        const { data: products } = await supabase.from('products').select('id, name, iva_rate, unit_of_measure').eq('is_active', true);
        
        // 4. Obtener Historial de Compras (todas para promediar)
        const { data: purchases } = await supabase.from('purchases').select('product_id, unit_price, created_at').order('created_at', { ascending: false });

        // Agrupar compras por producto (últimas 3)
        const costMap = {};
        purchases.forEach(p => {
            if (!costMap[p.product_id]) costMap[p.product_id] = [];
            if (costMap[p.product_id].length < 3) costMap[p.product_id].push(p.unit_price);
        });

        // 5. Calcular Precio Final
        const updates = products.map(prod => {
            const lastPrices = costMap[prod.id];
            if (!lastPrices || lastPrices.length === 0) return null;

            // --- EL ALGORITMO: COSTO PROMEDIO ---
            const avgCost = lastPrices.reduce((a, b) => a + b, 0) / lastPrices.length;

            const baseMargin = model.base_margin_percent;
            const adjustment = rulesMap[prod.id] || 0;
            const finalMargin = (baseMargin + adjustment) / 100;
            
            // Lógica: (Promedio * (1 + Margen)) * (1 + IVA)
            const priceBeforeTax = avgCost * (1 + finalMargin);
            const ivaRate = (prod.iva_rate || 0) / 100;
            const finalPrice = Math.round(priceBeforeTax * (1 + ivaRate));

            return {
                id: prod.id,
                base_price: finalPrice
            };
        }).filter(Boolean);

        console.log(`📊 Procesando publicación para ${updates.length} productos...`);

        // 6. Publicar al catálogo (Actualización por Lote Seguro)
        if (updates.length > 0) {
            console.log(`📊 Actualizando precios para ${updates.length} productos...`);
            
            for (const upd of updates) {
                const { error: upError } = await supabase
                    .from('products')
                    .update({ base_price: upd.base_price })
                    .eq('id', upd.id);
                
                if (upError) console.error(`⚠️ Error en SKU ${upd.id}:`, upError.message);
            }
            console.log(`✅ ¡ÉXITO! Catálogo publicado con precios promedio del mercado.`);
        } else {
            console.log('⚠️ No hay productos con historial de costos para publicar.');
        }

    } catch (err) {
        console.error('❌ Error en publicación:', err.message);
    }
}

publishOptimizedPrices();
