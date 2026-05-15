import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const city = searchParams.get('city');
    const latlng = searchParams.get('latlng');
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ error: 'API Key not configured' }, { status: 500 });
    }

    try {
        let url = `https://maps.googleapis.com/maps/api/geocode/json?key=${apiKey}`;
        
        if (address) {
            url += `&address=${encodeURIComponent(address)}`;
            if (city) {
                // Imperative filtering: force search within Colombia and the specific city
                url += `&components=country:CO|locality:${encodeURIComponent(city)}`;
            } else {
                url += `&components=country:CO`;
            }
        } else if (latlng) {
            url += `&latlng=${encodeURIComponent(latlng)}`;
        } else {
            return NextResponse.json({ error: 'Address or LatLng is required' }, { status: 400 });
        }

        const response = await fetch(url);
        const data = await response.json();

        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch geocoding data' }, { status: 500 });
    }
}
