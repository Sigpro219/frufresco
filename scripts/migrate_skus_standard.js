const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Leer de .env.local de forma dinámica
let NEXT_PUBLIC_SUPABASE_URL = "";
let NEXT_PUBLIC_SUPABASE_ANON_KEY = "";

try {
    const envPath = path.join(__dirname, '../.env.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const parts = trimmed.split('=');
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, ''); // Quitar comillas si las hay
            if (key === 'NEXT_PUBLIC_SUPABASE_URL') {
                NEXT_PUBLIC_SUPABASE_URL = val;
            } else if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
                NEXT_PUBLIC_SUPABASE_ANON_KEY = val;
            }
        }
        console.log('✅ Configuración cargada desde .env.local');
    }
} catch (e) {
    console.error('⚠️ Error leyendo .env.local:', e.message);
}

// Fallback por si acaso no se pudieron leer las variables
if (!NEXT_PUBLIC_SUPABASE_URL) {
    console.log('⚠️ No se encontró .env.local o variables vacías. Usando valores por defecto.');
    NEXT_PUBLIC_SUPABASE_URL = "https://csqurhdykbalvlnpowcz.supabase.co";
    NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzY5NjEsImV4cCI6MjA4ODI1Mjk2MX0.abZSNz1sQI0jGOFXopBOSRj1Hw3coU1sTR7LeuFpn5M";
}

console.log('Utilizando Supabase URL:', NEXT_PUBLIC_SUPABASE_URL);

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);

const generateSKU = (name, category, unit) => {
    if (!name) return 'UNK';
    // Mapeo adaptado a los códigos reales de 2 letras de la BD
    const catMap = {
        'FR': 'F',
        'HO': 'V',
        'VE': 'V',
        'TU': 'T',
        'DE': 'D',
        'LA': 'L',
        'CO': 'C',
        'NO': 'N'
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

    const usedSkus = new Set();

    for (const p of products) {
        const baseSku = generateSKU(p.name, p.category, p.unit_of_measure);
        let finalSku = baseSku;
        let suffix = 1;

        // Resolución de colisiones: si el SKU ya existe, añadir sufijo numérico
        while (usedSkus.has(finalSku)) {
            suffix++;
            finalSku = `${baseSku}${suffix}`;
        }
        
        usedSkus.add(finalSku);
        
        // Procesar variantes
        let newVariants = null;
        if (p.variants && Array.isArray(p.variants)) {
            newVariants = p.variants.map(v => {
                const attrValues = Object.values(v.options).map(val => val.toString().substring(0, 1).toUpperCase()).join('');
                return {
                    ...v,
                    sku: `${finalSku}.${attrValues}`
                };
            });
        }

        console.log(`Bautizando: [${p.name}] -> Master: ${finalSku}${newVariants ? ` (${newVariants.length} hijos)` : ''}`);

        const { error: updateError } = await supabase.from('products')
            .update({ 
                sku: finalSku,
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
