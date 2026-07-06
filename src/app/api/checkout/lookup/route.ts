import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize server-side Supabase client with admin privileges if needed or normal client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function maskText(str: string): string {
    if (!str) return '';
    const parts = str.split(' ');
    return parts.map(part => {
        if (part.length <= 2) return part;
        return part[0] + '*'.repeat(part.length - 2) + part[part.length - 1];
    }).join(' ');
}

const cleanPhone = (p: string) => (p || '').replace(/\D/g, '');

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, nit, phone } = body;

        if (!email || !nit) {
            return NextResponse.json({ error: 'Email and identification (nit) are required' }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const normalizedNit = nit.toLowerCase().trim();

        // 1. Query the B2C client from profiles
        const { data: profilesList, error } = await supabase
            .from('profiles')
            .select('id, contact_name, address, phone')
            .eq('role', 'b2c_client')
            .eq('email', normalizedEmail)
            .eq('nit', normalizedNit)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error || !profilesList || profilesList.length === 0) {
            console.log(`Lookup not found for email: ${normalizedEmail}, nit: ${normalizedNit}`);
            if (error) console.error('DB error during lookup:', error);
            return NextResponse.json({ found: false });
        }

        const profile = profilesList[0];

        // STEP 2: If phone is provided, run verification and return unmasked data
        if (phone !== undefined) {
            const clientEnteredPhone = cleanPhone(phone);
            const dbPhone = cleanPhone(profile.phone);

            if (clientEnteredPhone && dbPhone && clientEnteredPhone === dbPhone) {
                console.log(`Successfully verified and unlocked profile for: ${normalizedEmail}`);
                return NextResponse.json({
                    verified: true,
                    name: profile.contact_name,
                    address: profile.address,
                    phone: profile.phone
                });
            } else {
                console.log(`Phone verification failed for: ${normalizedEmail}`);
                return NextResponse.json({ verified: false, error: 'El número de celular no coincide con el registrado.' });
            }
        }

        // STEP 1: No phone provided, return masked data safely
        console.log(`Profile found for: ${normalizedEmail}. Returning masked preview.`);
        return NextResponse.json({
            found: true,
            name: maskText(profile.contact_name),
            address: maskText(profile.address)
        });

    } catch (e: any) {
        console.error('Error in checkout lookup API:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
