import { NextResponse } from 'next/server';
import { z } from 'zod';

const GeocodeQuerySchema = z.object({
    address: z.string().trim().min(1).optional(),
    city: z.string().trim().optional(),
    latlng: z.string().trim().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'Formato de latlng inválido (ej: 4.6097,-74.0817)').optional()
}).refine(data => Boolean(data.address || data.latlng), {
    message: 'Se requiere el parámetro address o latlng para la geocodificación'
});

export async function GET(request: Request) {
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
    const { searchParams } = new URL(request.url);
    
    const parsed = GeocodeQuerySchema.safeParse({
        address: searchParams.get('address') || undefined,
        city: searchParams.get('city') || undefined,
        latlng: searchParams.get('latlng') || undefined
    });

    if (!parsed.success) {
        return NextResponse.json({
            status: 'REQUEST_DENIED',
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Parámetros de geocodificación inválidos',
                details: parsed.error.issues.map(i => ({ field: i.path.join('.'), issue: i.message }))
            },
            requestId
        }, { status: 400 });
    }

    const { address, city, latlng } = parsed.data;
    const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        return NextResponse.json({
            status: 'REQUEST_DENIED',
            error: { code: 'API_KEY_MISSING', message: 'Google Maps API Key no configurada en el servidor' },
            requestId
        }, { status: 500 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
        let url = `https://maps.googleapis.com/maps/api/geocode/json?key=${apiKey}`;
        
        if (address) {
            url += `&address=${encodeURIComponent(address)}`;
            if (city) {
                url += `&components=country:CO|locality:${encodeURIComponent(city)}`;
            } else {
                url += `&components=country:CO`;
            }
        } else if (latlng) {
            url += `&latlng=${encodeURIComponent(latlng)}`;
        }

        const response = await fetch(url, { signal: controller.signal });
        const data = await response.json();

        return NextResponse.json(data, {
            headers: { 'x-request-id': requestId }
        });
    } catch (error: any) {
        const isTimeout = error.name === 'AbortError';
        return NextResponse.json({
            status: isTimeout ? 'TIMEOUT' : 'ERROR',
            error: {
                code: isTimeout ? 'GATEWAY_TIMEOUT' : 'GEOCODING_FETCH_ERROR',
                message: isTimeout ? 'La consulta a Google Geocoding excedió el timeout de 5000ms' : (error.message || 'Error al conectar con Google Geocoding')
            },
            requestId
        }, { status: isTimeout ? 504 : 502 });
    } finally {
        clearTimeout(timeoutId);
    }
}
