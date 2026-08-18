import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const supabase = createClient(supabaseUrl, supabaseKey);

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

        let clientRecord: {
            id?: string;
            name: string;
            address: string;
            phone: string;
            latitude: number | null;
            longitude: number | null;
        } | null = null;

        // 1. Query client profile strictly from profiles table where role is 'b2c_client'
        const { data: profilesList } = await supabase
            .from('profiles')
            .select('id, contact_name, address, phone, contact_phone, latitude, longitude')
            .eq('role', 'b2c_client')
            .eq('email', normalizedEmail)
            .eq('nit', normalizedNit)
            .order('created_at', { ascending: false })
            .limit(1);

        if (profilesList && profilesList.length > 0) {
            const prof = profilesList[0];
            clientRecord = {
                id: prof.id,
                name: prof.contact_name || '',
                address: prof.address || '',
                phone: prof.contact_phone || prof.phone || '',
                latitude: prof.latitude ? parseFloat(prof.latitude) : null,
                longitude: prof.longitude ? parseFloat(prof.longitude) : null
            };
        }

        // 2. Fallback: Query historical approved B2C orders matching BOTH Email AND NIT strictly
        if (!clientRecord || !clientRecord.latitude || !clientRecord.longitude) {
            const { data: orderList } = await supabase
                .from('orders')
                .select('id, shipping_address, latitude, longitude, special_notes, created_at')
                .not('latitude', 'is', null)
                .not('longitude', 'is', null)
                .in('type', ['b2c_client', 'b2c_guest', 'b2c_wompi'])
                .ilike('special_notes', `%ID: ${normalizedNit}%`)
                .ilike('special_notes', `%Email: ${normalizedEmail}%`)
                .order('created_at', { ascending: false })
                .limit(1);

            if (orderList && orderList.length > 0) {
                const ord = orderList[0];
                const notes = ord.special_notes || '';
                const nameMatch = notes.match(/\[CLIENTE:\s*([^|]+)\|/i);
                const telMatch = notes.match(/Tel:\s*([^|]+)\|/i);

                clientRecord = {
                    id: ord.id,
                    name: nameMatch?.[1]?.trim() || clientRecord?.name || '',
                    address: ord.shipping_address || clientRecord?.address || '',
                    phone: telMatch?.[1]?.trim() || clientRecord?.phone || '',
                    latitude: ord.latitude ? parseFloat(ord.latitude) : null,
                    longitude: ord.longitude ? parseFloat(ord.longitude) : null
                };
            }
        }

        if (!clientRecord || (!clientRecord.name && !clientRecord.address)) {
            console.log(`Lookup not found for email: ${normalizedEmail}, nit: ${normalizedNit}`);
            return NextResponse.json({ found: false });
        }

        // STEP 2: If phone is provided, run verification and return unmasked data with GPS coordinates
        if (phone !== undefined) {
            const clientEnteredPhone = cleanPhone(phone);
            const dbPhone = cleanPhone(clientRecord.phone);

            if (clientEnteredPhone && dbPhone && clientEnteredPhone === dbPhone) {
                console.log(`Successfully verified and unlocked profile/history for: ${normalizedEmail}`);

                // Fetch or compile gift beneficiaries from profile and historical orders
                const beneficiariesMap = new Map<string, any>();

                // From profile logistics_data / beneficiaries if present
                if (profilesList && profilesList.length > 0) {
                    const prof = profilesList[0] as any;
                    const savedBeneficiaries = prof.beneficiaries || prof.logistics_data?.beneficiaries || [];
                    if (Array.isArray(savedBeneficiaries)) {
                        savedBeneficiaries.forEach((b: any) => {
                            if (b && b.name) {
                                const key = `${b.name.toLowerCase().trim()}_${(b.phone || '').replace(/\D/g, '')}`;
                                beneficiariesMap.set(key, b);
                            }
                        });
                    }
                }

                // From historical orders
                try {
                    const { data: pastGiftOrders } = await supabase
                        .from('orders')
                        .select('shipping_address, latitude, longitude, special_notes, created_at')
                        .or(`profile_id.eq.${clientRecord.id},special_notes.ilike.%Email: ${normalizedEmail}%,special_notes.ilike.%ID: ${normalizedNit}%`)
                        .ilike('special_notes', '%DESTINATARIO / RECIBE EN PUERTA%')
                        .order('created_at', { ascending: false })
                        .limit(20);

                    if (pastGiftOrders) {
                        for (const ord of pastGiftOrders) {
                            const notes = ord.special_notes || '';
                            const recNameMatch = notes.match(/\[DESTINATARIO\s*\/\s*RECIBE\s*EN\s*PUERTA:\s*([^|]+)\|/i);
                            const recPhoneMatch = notes.match(/\[DESTINATARIO[^\]]*?Tel:\s*([^\]\n|]+)/i);

                            if (recNameMatch) {
                                const rName = recNameMatch[1].trim();
                                const rPhone = recPhoneMatch ? recPhoneMatch[1].trim() : '';
                                const key = `${rName.toLowerCase()}_${rPhone.replace(/\D/g, '')}`;

                                if (!beneficiariesMap.has(key)) {
                                    beneficiariesMap.set(key, {
                                        name: rName,
                                        phone: rPhone,
                                        address: ord.shipping_address || '',
                                        latitude: ord.latitude ? parseFloat(ord.latitude) : null,
                                        longitude: ord.longitude ? parseFloat(ord.longitude) : null,
                                        last_order_date: ord.created_at
                                    });
                                }
                            }
                        }
                    }
                } catch (bErr) {
                    console.warn('Error fetching past beneficiaries in lookup:', bErr);
                }

                const compiledBeneficiaries = Array.from(beneficiariesMap.values());

                return NextResponse.json({
                    verified: true,
                    profile_id: clientRecord.id,
                    name: clientRecord.name,
                    address: clientRecord.address,
                    phone: clientRecord.phone,
                    latitude: clientRecord.latitude,
                    longitude: clientRecord.longitude,
                    beneficiaries: compiledBeneficiaries
                });
            } else {
                console.log(`Phone verification failed for: ${normalizedEmail}. Entered: ${clientEnteredPhone}, DB: ${dbPhone}`);
                return NextResponse.json({ verified: false, error: 'El número de celular no coincide con el registrado.' });
            }
        }

        // STEP 1: No phone provided, return masked data safely
        console.log(`Profile/History found for: ${normalizedEmail}. Returning masked preview.`);
        return NextResponse.json({
            found: true,
            name: maskText(clientRecord.name),
            address: maskText(clientRecord.address)
        });

    } catch (e: any) {
        console.error('Error in checkout lookup API:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
