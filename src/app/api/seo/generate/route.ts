import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const GEMINI_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

export async function POST(req: Request) {
    try {
        const { zone_key, poly } = await req.json();

        if (!zone_key || !poly || !Array.isArray(poly) || poly.length === 0) {
            return NextResponse.json({ error: 'Faltan datos de geocerca' }, { status: 400 });
        }

        console.log(`🚀 [SEO Engine] Iniciando generación para zona: ${zone_key}`);

        // 1. Obtener nombre del municipio usando Reverse Geocoding del centro del polígono
        const refPoint = poly[0];
        let municipality = "Zona de Cobertura";

        try {
            const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${refPoint.lat},${refPoint.lng}&key=${MAPS_KEY}`);
            const geoData = await geoRes.json();
            if (geoData.status === 'OK' && geoData.results.length > 0) {
                const components = geoData.results[0].address_components;
                const cityComp = components.find((c: any) => 
                    c.types.includes('locality') || 
                    c.types.includes('administrative_area_level_2')
                );
                if (cityComp) municipality = cityComp.long_name;
            }
        } catch (err) {
            console.warn('[SEO Engine] Error en geocodificación, usando fallback:', err);
        }

        // 2. Generar Estrategia con Gemini (Llamada Directa a v1 para evitar errores 404 del SDK)
        if (!GEMINI_KEY) throw new Error("Falta la clave de Gemini en el servidor");
 
        const isB2B = zone_key.includes('b2b');
        const targetAudience = isB2B ? "restaurantes, hoteles y casinos (HORECA)" : "hogares y familias";
        
        const prompt = `Eres un experto en SEO Local para Colombia. 
        Genera una estrategia de metadatos para FruFresco, un proveedor de frutas y verduras frescas de alta calidad.
        
        Zona geográfica: ${municipality}
        Público objetivo: ${targetAudience}
        
        Responde estrictamente en formato JSON con la siguiente estructura:
        {
          "meta_title": "Título de máximo 60 caracteres optimizado para SEO local",
          "meta_description": "Descripción de máximo 160 caracteres que incite al clic",
          "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
        }
        
        Incluye el nombre de la zona "${municipality}" en el título y descripción.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error de Google API: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const responseText = result.candidates[0].content.parts[0].text.trim().replace(/```json|```/g, '');
        const seoData = JSON.parse(responseText);

        // 3. Persistir en Supabase
        const { data, error } = await supabase
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

        console.log(`✅ [SEO Engine] Estrategia generada y guardada para ${municipality}`);

        return NextResponse.json({
            success: true,
            municipality,
            strategy: data
        });

    } catch (error: any) {
        console.error('❌ [SEO Engine] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
