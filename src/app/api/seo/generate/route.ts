import { NextResponse } from 'next/server';
import { supabase, createAdminClient } from '@/lib/supabase';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const GEMINI_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

export async function POST(req: Request) {
    try {
        const { zone_key, poly } = await req.json();

        if (!zone_key || !poly || !Array.isArray(poly) || poly.length === 0) {
            return NextResponse.json({ error: 'Faltan datos de geocerca' }, { status: 400 });
        }

        console.log(`🚀 [SEO Engine] Iniciando generación HÍBRIDA para zona: ${zone_key}`);

        // 1. Obtener nombre del municipio usando Reverse Geocoding (Esto funciona perfecto siempre)
        const refPoint = poly[0];
        let municipality = "Zona de Cobertura";

        try {
            const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${refPoint.lat},${refPoint.lng}&key=${MAPS_KEY}&language=es`);
            const geoData = await geoRes.json();
            if (geoData.status === 'OK' && geoData.results.length > 0) {
                const components = geoData.results[0].address_components;
                
                // Buscar el componente más específico: barrio o localidad
                const neighborhood = components.find((c: any) => c.types.includes('neighborhood'));
                const sublocality = components.find((c: any) => c.types.includes('sublocality_level_1'));
                const city = components.find((c: any) => c.types.includes('locality') || c.types.includes('administrative_area_level_2'));
                
                if (neighborhood) {
                    municipality = neighborhood.long_name;
                } else if (sublocality) {
                    municipality = sublocality.long_name;
                } else if (city) {
                    municipality = city.long_name;
                }
                
                // Si tenemos ciudad y es diferente al barrio/localidad, podemos combinar
                if (city && municipality !== city.long_name) {
                    municipality = `${municipality}, ${city.long_name}`;
                }
            }
        } catch (err) {
            console.warn('[SEO Engine] Geocoding Fallback:', err);
        }

        // 2. Definir Estrategia Base (Modelo Híbrido / Fallback)
        const isB2B = zone_key.includes('b2b');
        const audience = isB2B ? "Negocios y Restaurantes" : "Hogares y Familias";
        
        let seoData = {
            meta_title: `Frutas y Verduras Frescas en ${municipality} | FruFresco ${isB2B ? 'B2B' : ''}`,
            meta_description: `Compra las mejores frutas y verduras frescas en ${municipality}. Calidad gourmet del campo a tu mesa para ${audience.toLowerCase()}. ¡Haz tu pedido hoy!`,
            keywords: ["frutas frescas", "verduras", municipality, "domicilio frutas", "frufresco", isB2B ? "proveedor horeca" : "mercado saludable"]
        };

        // 3. Intentar mejorar con IA (Opcional, si falla usamos la base de arriba)
        if (GEMINI_KEY) {
            try {
                console.log(`📡 Intentando optimización con IA (Gemini 2.5)...`);
                const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {

                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: `Eres experto en SEO. Genera JSON con: meta_title (max 60 car), meta_description (max 160 car) y keywords (array 5) para FruFresco en ${municipality} para ${audience}.` }] }]
                    }),
                    signal: AbortSignal.timeout(5000) // No esperar más de 5 segundos
                });

                if (aiResponse.ok) {
                    const result = await aiResponse.json();
                    const text = result.candidates[0].content.parts[0].text.trim().replace(/```json|```/g, '');
                    const aiData = JSON.parse(text);
                    seoData = { ...seoData, ...aiData };
                    console.log(`✅ IA optimizó los metadatos exitosamente.`);
                } else {
                    console.warn(`⚠️ IA saturada. Usando plantilla híbrida de alta calidad.`);
                }
            } catch (aiErr) {
                console.warn(`⚠️ Error de IA ignorado. Usando motor híbrido de seguridad.`);
            }
        }

        // 4. Persistir en Supabase (Usando Admin Client para saltar RLS)
        const adminSupabase = createAdminClient();
        const { data, error } = await adminSupabase
            .from('seo_strategies')
            .upsert({
                zone_key,
                municipality_name: municipality,
                meta_title: seoData.meta_title,
                meta_description: seoData.meta_description,
                keywords: seoData.keywords,
                last_generated_at: new Date().toISOString()
            }, { onConflict: 'zone_key' })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            success: true,
            municipality,
            strategy: data,
            method: 'hybrid'
        });

    } catch (error: any) {
        console.error('❌ [SEO Engine] Error Final:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
