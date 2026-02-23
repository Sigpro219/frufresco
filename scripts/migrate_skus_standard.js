const { createClient } = require('@supabase/supabase-js');

// Configuración manual sin depender de dotenv para evitar errores de entorno
const NEXT_PUBLIC_SUPABASE_URL = "https://kuxnixwoacwsotcilhuz.supabase.co";
const NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo";

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);

const generateSKU = (name, category, unit) => {
    if (!name) return 'UNK';
    const catMap = {
        'Frutas': 'F', 'Hortalizas': 'H', 'Verduras': 'V', 'Tubérculos': 'T', 'Despensa': 'D', 'Lácteos': 'L'
    };
    const catPrefix = catMap[category] || 'X';
    
    const consonantes = name.toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar tildes
        .replace(/[^BCDFGHJKLMNPQRSTVWXYZ ]/g, ''); // Solo consonantes y espacios
    
    // Extraer 3 consonantes del nombre (ignorando espacios)
    const rawCons = consonantes.replace(/\s/g, '');
    const namePart = rawCons.substring(0, 3).padEnd(3, 'X');
    const unitSuffix = (unit || 'K').substring(0, 1).toUpperCase();
    
    return `${catPrefix}-${namePart}-${unitSuffix}`;
};

const migrateSKUs = async () => {
    console.log('--- 🚀 Iniciando Migración Técnica de SKUs ---');
    
    const { data: products, error } = await supabase.from('products').select('*');
    if (error) {
        console.error('Error fetching products:', error);
        return;
    }

    console.log(`Detectados ${products.length} productos. Procesando...`);

    for (const p of products) {
        const newMasterSku = generateSKU(p.name, p.category, p.unit_of_measure);
        
        // Procesar variantes
        let newVariants = null;
        if (p.variants && Array.isArray(p.variants)) {
            newVariants = p.variants.map(v => {
                const attrValues = Object.values(v.options).map(val => val.toString().substring(0, 1).toUpperCase()).join('');
                return {
                    ...v,
                    sku: `${newMasterSku}.${attrValues}`
                };
            });
        }

        console.log(`Bautizando: [${p.name}] -> Master: ${newMasterSku}${newVariants ? ` (${newVariants.length} hijos)` : ''}`);

        const { error: updateError } = await supabase.from('products')
            .update({ 
                sku: newMasterSku,
                variants: newVariants
            })
            .eq('id', p.id);

        if (updateError) {
            console.error(`❌ Error actualizando ${p.name}:`, updateError.message);
        }
    }

    console.log('--- ✅ Migración Finalizada ---');
};

migrateSKUs();
