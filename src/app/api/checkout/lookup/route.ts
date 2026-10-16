import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
    const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
    const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
    const supabaseKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Credenciales de Supabase no configuradas en el entorno');
    }
    return createClient(supabaseUrl, supabaseKey);
}

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
        const supabase = getSupabase();
        const body = await request.json();
        const { email, nit, phone } = body;

        const normalizedEmail = (email || '').toLowerCase().trim();
        const normalizedNit = (nit || '').toLowerCase().trim();
        const rawPhone = cleanPhone(phone);

        if (!normalizedEmail && !rawPhone && !normalizedNit) {
            return NextResponse.json({ error: 'Phone, email or identification is required' }, { status: 400 });
        }

        let clientRecord: {
            id?: string;
            name: string;
            address: string;
            phone: string;
            email?: string;
            latitude: number | null;
            longitude: number | null;
        } | null = null;

        let matchedProfile: any = null;
        let matchedCollaborator: any = null;

        // 0. Reconocimiento de Colaborador FruFresco (Escenario 229 SDD)
        try {
            let collabQuery = supabase
                .from('collaborators')
                .select('id, contact_name, document_id, role, phone, email, is_active')
                .eq('is_active', true);

            if (rawPhone && rawPhone.length >= 7) {
                collabQuery = collabQuery.ilike('phone', '%' + rawPhone.slice(-7) + '%');
            } else if (normalizedEmail) {
                collabQuery = collabQuery.eq('email', normalizedEmail);
            } else if (normalizedNit) {
                collabQuery = collabQuery.eq('document_id', normalizedNit);
            }

            const { data: collabData } = await collabQuery.limit(1);
            if (collabData && collabData.length > 0) {
                matchedCollaborator = collabData[0];
                if (!clientRecord) {
                    clientRecord = {
                        id: matchedCollaborator.id,
                        name: matchedCollaborator.contact_name || '',
                        address: '',
                        phone: matchedCollaborator.phone || rawPhone,
                        email: matchedCollaborator.email || undefined,
                        latitude: null,
                        longitude: null
                    };
                }
            }
        } catch (collabErr) {
            console.warn('Error checking collaborator in lookup:', collabErr);
        }

        // 1. Direct phone lookup (B2C primary fast-track)
        if (rawPhone && rawPhone.length >= 10) {
            const { data: profByPhone } = await supabase
                .from('profiles')
                .select('id, contact_name, address, phone, contact_phone, email, latitude, longitude, logistics_data')
                .or(`phone.eq.${rawPhone},contact_phone.eq.${rawPhone}`)
                .order('created_at', { ascending: false })
                .limit(1);

            if (profByPhone && profByPhone.length > 0) {
                matchedProfile = profByPhone[0];
                clientRecord = {
                    id: matchedProfile.id,
                    name: matchedProfile.contact_name || '',
                    address: matchedProfile.address || '',
                    phone: matchedProfile.contact_phone || matchedProfile.phone || rawPhone,
                    email: matchedProfile.email || undefined,
                    latitude: matchedProfile.latitude ? parseFloat(matchedProfile.latitude) : null,
                    longitude: matchedProfile.longitude ? parseFloat(matchedProfile.longitude) : null
                };
            }
        }

        // 2. Query client profile by Email and NIT if phone didn't match or wasn't provided
        if (!clientRecord && normalizedEmail && normalizedNit) {
            const { data: profilesList } = await supabase
                .from('profiles')
                .select('id, contact_name, address, phone, contact_phone, email, latitude, longitude, logistics_data')
                .eq('role', 'b2c_client')
                .eq('email', normalizedEmail)
                .eq('nit', normalizedNit)
                .order('created_at', { ascending: false })
                .limit(1);

            if (profilesList && profilesList.length > 0) {
                matchedProfile = profilesList[0];
                clientRecord = {
                    id: matchedProfile.id,
                    name: matchedProfile.contact_name || '',
                    address: matchedProfile.address || '',
                    phone: matchedProfile.contact_phone || matchedProfile.phone || '',
                    email: matchedProfile.email || undefined,
                    latitude: matchedProfile.latitude ? parseFloat(matchedProfile.latitude) : null,
                    longitude: matchedProfile.longitude ? parseFloat(matchedProfile.longitude) : null
                };
            }
        }

        // 3. Fallback: Query historical approved B2C orders
        if (!clientRecord || !clientRecord.latitude || !clientRecord.longitude) {
            let orderQuery = supabase
                .from('orders')
                .select('id, shipping_address, latitude, longitude, special_notes, created_at')
                .not('latitude', 'is', null)
                .not('longitude', 'is', null)
                .in('type', ['b2c_client', 'b2c_guest', 'b2c_wompi']);

            if (rawPhone && rawPhone.length >= 10) {
                orderQuery = orderQuery.ilike('special_notes', `%Tel: ${rawPhone}%`);
            } else if (normalizedNit && normalizedEmail) {
                orderQuery = orderQuery.ilike('special_notes', `%ID: ${normalizedNit}%`).ilike('special_notes', `%Email: ${normalizedEmail}%`);
            } else if (normalizedEmail) {
                orderQuery = orderQuery.ilike('special_notes', `%Email: ${normalizedEmail}%`);
            }

            const { data: orderList } = await orderQuery.order('created_at', { ascending: false }).limit(1);

            if (orderList && orderList.length > 0) {
                const ord = orderList[0];
                const notes = ord.special_notes || '';
                const nameMatch = notes.match(/\[CLIENTE:\s*([^|]+)\|/i) || notes.match(/\[COMPRADOR[^:]*:\s*([^|]+)\|/i);
                const telMatch = notes.match(/Tel:\s*([^|]+)\|/i);

                clientRecord = {
                    id: ord.id,
                    name: nameMatch?.[1]?.trim() || clientRecord?.name || '',
                    address: ord.shipping_address || clientRecord?.address || '',
                    phone: telMatch?.[1]?.trim() || clientRecord?.phone || rawPhone,
                    latitude: ord.latitude ? parseFloat(ord.latitude) : null,
                    longitude: ord.longitude ? parseFloat(ord.longitude) : null
                };
            }
        }

        if (!clientRecord || (!clientRecord.name && !clientRecord.address)) {
            console.log(`Lookup not found for email: ${normalizedEmail}, phone: ${rawPhone}, nit: ${normalizedNit}`);
            return NextResponse.json({ found: false });
        }

        // STEP 2: If phone is provided, run verification and return unmasked data with GPS coordinates
        if (phone !== undefined || (rawPhone && rawPhone.length >= 10)) {
            const clientEnteredPhone = cleanPhone(phone || rawPhone);
            const dbPhone = cleanPhone(clientRecord.phone);

            const isPhoneMatch = !dbPhone || !clientEnteredPhone || clientEnteredPhone === dbPhone || (dbPhone.includes(clientEnteredPhone) || clientEnteredPhone.includes(dbPhone));

            if (isPhoneMatch) {
                console.log(`Successfully verified and unlocked profile/history for phone: ${clientEnteredPhone}, email: ${normalizedEmail}`);

                // Fetch or compile gift beneficiaries from profile and historical orders
                const beneficiariesMap = new Map<string, any>();

                // From profile logistics_data / beneficiaries if present
                if (matchedProfile) {
                    const savedBeneficiaries = matchedProfile.beneficiaries || matchedProfile.logistics_data?.beneficiaries || [];
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
                    const orderOrConditions: string[] = [];
                    if (clientRecord.id) orderOrConditions.push(`profile_id.eq.${clientRecord.id}`);
                    if (clientEnteredPhone) orderOrConditions.push(`special_notes.ilike.%${clientEnteredPhone}%`);
                    if (normalizedEmail) orderOrConditions.push(`special_notes.ilike.%${normalizedEmail}%`);
                    if (normalizedNit) orderOrConditions.push(`special_notes.ilike.%${normalizedNit}%`);

                    const { data: pastGiftOrders } = await supabase
                        .from('orders')
                        .select('shipping_address, latitude, longitude, special_notes, created_at')
                        .or(orderOrConditions.join(','))
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
                    email: clientRecord.email,
                    latitude: clientRecord.latitude,
                    longitude: clientRecord.longitude,
                    beneficiaries: compiledBeneficiaries,
                    is_collaborator: !!matchedCollaborator,
                    collaborator_info: matchedCollaborator ? {
                        id: matchedCollaborator.id,
                        contact_name: matchedCollaborator.contact_name,
                        document_id: matchedCollaborator.document_id,
                        role: matchedCollaborator.role
                    } : null
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
