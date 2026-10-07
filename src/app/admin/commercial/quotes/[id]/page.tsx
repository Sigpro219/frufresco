'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { THEME } from '@/lib/adminTheme';
import { useParams, useRouter } from 'next/navigation';
import { 
    ArrowLeft, 
    Edit3, 
    Rocket, 
    FileSpreadsheet, 
    MessageCircle, 
    Printer, 
    CheckCircle, 
    Handshake,
    AlertTriangle,
    Flame,
    Sparkles,
    ShoppingBag,
    FileText,
    Building2,
    Calendar,
    Clock,
    UserCheck,
    Search,
    X,
    Check,
    ChevronRight,
    HelpCircle,
    MapPin,
    Navigation,
    Sliders,
    Cpu,
    ExternalLink,
    Loader2
} from 'lucide-react';
import { parseLogisticsText, formatTimeWindow, LogisticsData } from '@/lib/logistics-parser';

// Helper de extracción de coordenadas GPS desde texto libre o notas del lead
const extractCoordsFromText = (text?: string): { lat: number; lng: number } | null => {
    if (!text) return null;
    const match = text.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
    if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
    return null;
};

const formatCategoryTitle = (cat?: string) => {
    if (!cat) return 'Otros Productos';
    const c = cat.toUpperCase().trim();
    if (c === 'FR' || c.startsWith('FRUT')) return 'Frutas';
    if (c === 'VE' || c.startsWith('VERD')) return 'Verduras';
    if (c === 'HO' || c.startsWith('HORT')) return 'Hortalizas';
    if (c === 'TU' || c.startsWith('TUBER') || c.startsWith('TUBÉR')) return 'Tubérculos y Plátanos';
    if (c === 'DE' || c.startsWith('DESP') || c.startsWith('ABARR')) return 'Despensa y Abarrotes';
    if (c === 'LA' || c.startsWith('LACT') || c.startsWith('LÁCT')) return 'Lácteos y Derivados';
    if (c === 'CO' || c.startsWith('CONG') || c.startsWith('PULP')) return 'Congelados y Pulpas';
    if (c === 'PR' || c.startsWith('PROC') || c.startsWith('PELAD')) return 'Procesados y Pelados';
    if (c === 'HI' || c.startsWith('HIER')) return 'Hierbas Aromáticas';
    return cat;
};

// 1. Verduras, 2. Frutas, 3. Hortalizas, 4. Tubérculos y Plátanos, luego las demás
const CATEGORY_PRIORITY = [
    'Verduras',
    'Frutas',
    'Hortalizas',
    'Tubérculos y Plátanos',
    'Despensa y Abarrotes',
    'Lácteos y Derivados',
    'Congelados y Pulpas',
    'Procesados y Pelados',
    'Hierbas Aromáticas',
    'Otros Productos'
];

export default function QuoteDetailPage() {
    const formatPrice = (value: number) => {
        return new Intl.NumberFormat('es-CO', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(value);
    };

    const formatQuoteNumber = (seq: number, status?: string, dateStr?: string) => {
        const date = dateStr ? new Date(dateStr) : new Date();
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const paddedSeq = String(seq || 1).padStart(4, '0');
        const prefix = status === 'agreement' ? 'ACI' : 'COT';
        return `${prefix} ${day}${month} ${paddedSeq}`;
    };

    const formatMinQty = (item: any) => {
        const uom = (item.products?.unit_of_measure || item.unit || 'Kg').trim();
        const webFactor = item.products?.web_conversion_factor;

        if (uom.toLowerCase() === 'kg') {
            if (webFactor && webFactor > 0 && webFactor < 1) {
                return `${String(webFactor).replace('.', ',')} Kg`;
            }
            if (webFactor && webFactor > 1) {
                return `${String(webFactor).replace('.', ',')} Kg`;
            }
            return '1 Kg';
        }

        return `1 ${uom}`;
    };

    const params = useParams();
    const router = useRouter();
    const [quote, setQuote] = useState<any>(null);
    const [lead, setLead] = useState<any>(null);
    const [clientProfile, setClientProfile] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    // MODAL DE FORMALIZACIÓN Y ACUERDO COMERCIAL
    const [showFormalizeModal, setShowFormalizeModal] = useState(false);
    const [clientSelectionMode, setClientSelectionMode] = useState<'formalize_new' | 'select_existing'>('formalize_new');
    const [clientSearch, setClientSearch] = useState('');
    const [clientResults, setClientResults] = useState<any[]>([]);
    const [selectedExistingClient, setSelectedExistingClient] = useState<any>(null);

    // FORMULARIO COMPLETO DE FORMALIZACIÓN B2B CON LOGÍSTICA Y GPS
    const [formalForm, setFormalForm] = useState({
        razon_social: '',
        company_name: '',
        nit: '',
        contact_name: '',
        phone: '',
        email: '',
        address: '',
        municipality: 'Bogotá D.C.',
        payment_days: 30,
        document_type: 'invoice' as 'invoice' | 'remission',
        remission_with_prices: true,
        // Georreferenciación Satelital GPS
        latitude: '' as string | number,
        longitude: '' as string | number,
        geocoding_status: 'pending' as 'pending' | 'verified' | 'manual',
        // Operación Logística y Franja Horaria de Entrega
        delivery_restrictions: '',
        delivery_start_time: '06:30',
        delivery_end_time: '09:30',
        allowed_delivery_days: [1, 2, 3, 4, 5, 6] as number[],
        logistics_data: null as LogisticsData | null
    });
    const [locatingGps, setLocatingGps] = useState(false);

    // PARÁMETROS DEL ACUERDO
    const [validityDaysPreset, setValidityDaysPreset] = useState<number>(180);
    const [validUntilDate, setValidUntilDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 180);
        return d.toISOString().split('T')[0];
    });

    // MODAL PARA PEDIDO SPOT PUNTUAL
    const [showSpotOrderModal, setShowSpotOrderModal] = useState(false);
    const [spotDeliveryDate, setSpotDeliveryDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    });

    useEffect(() => {
        if (params.id) fetchQuoteDetails();
    }, [params.id]);

    const fetchQuoteDetails = async () => {
        setLoading(true);
        try {
            // 1. Cargar Cotización
            const { data: qData, error: qErr } = await supabase
                .from('quotes')
                .select('*')
                .eq('id', params.id)
                .single();

            if (qErr) throw qErr;
            setQuote(qData);

            // 2. Cargar Lead si existe
            if (qData.lead_id) {
                const { data: lData } = await supabase
                    .from('leads')
                    .select('*')
                    .eq('id', qData.lead_id)
                    .single();
                if (lData) setLead(lData);
            }

            // 3. Cargar Perfil de cliente si ya está vinculado
            if (qData.client_id) {
                const { data: pData } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', qData.client_id)
                    .single();
                if (pData) setClientProfile(pData);
            }

            // 4. Cargar Ítems de la Cotización
            const { data: iData, error: iErr } = await supabase
                .from('quote_items')
                .select('*, products(name, unit_of_measure, sku, category, web_conversion_factor, web_unit, iva_rate)')
                .eq('quote_id', params.id);

            if (iErr) throw iErr;
            if (iData) setItems(iData);
        } catch (err: any) {
            console.error('Error fetching quote details:', err);
            alert('Error cargando cotización: ' + (err.message || err));
        } finally {
            setLoading(false);
        }
    };

    // Agrupación jerárquica y orden alfabético
    const groupedCategories = useMemo(() => {
        const catMap = new Map<string, any[]>();

        items.forEach(item => {
            const rawCat = item.products?.category || item.category || 'Otros Productos';
            const catTitle = formatCategoryTitle(rawCat);
            if (!catMap.has(catTitle)) {
                catMap.set(catTitle, []);
            }
            catMap.get(catTitle)!.push(item);
        });

        const groups: { category: string; items: any[] }[] = [];

        catMap.forEach((groupItems, category) => {
            groupItems.sort((a, b) => {
                const nameA = (a.product_name || a.products?.name || '').toString().toLowerCase();
                const nameB = (b.product_name || b.products?.name || '').toString().toLowerCase();
                return nameA.localeCompare(nameB, 'es', { numeric: true, sensitivity: 'base' });
            });
            groups.push({ category, items: groupItems });
        });

        groups.sort((a, b) => {
            const idxA = CATEGORY_PRIORITY.indexOf(a.category);
            const idxB = CATEGORY_PRIORITY.indexOf(b.category);
            const prioA = idxA !== -1 ? idxA : 999;
            const prioB = idxB !== -1 ? idxB : 999;
            if (prioA !== prioB) return prioA - prioB;
            return a.category.localeCompare(b.category, 'es');
        });

        return groups;
    }, [items]);

    // Búsqueda de clientes preexistentes
    const handleSearchExistingClients = async (term: string) => {
        setClientSearch(term);
        if (term.length < 2) {
            setClientResults([]);
            return;
        }
        const { data } = await supabase
            .from('profiles')
            .select('id, company_name, razon_social, contact_name, nit, phone, contact_phone, email, address, municipality, payment_days, document_type, remission_with_prices, latitude, longitude, geocoding_status, delivery_restrictions, logistics_data')
            .in('role', ['b2b_client', 'b2c_client'])
            .or(`company_name.ilike.%${term}%,razon_social.ilike.%${term}%,nit.ilike.%${term}%,contact_name.ilike.%${term}%`)
            .limit(6);
        if (data) setClientResults(data);
    };

    // Captura satelital GPS en tiempo real (móvil/terreno)
    const handleGetCurrentLocation = () => {
        if (typeof window === 'undefined' || !navigator.geolocation) {
            alert('Tu navegador o dispositivo no soporta geolocalización GPS.');
            return;
        }
        setLocatingGps(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = Number(pos.coords.latitude.toFixed(7));
                const lng = Number(pos.coords.longitude.toFixed(7));
                setFormalForm(prev => ({
                    ...prev,
                    latitude: lat,
                    longitude: lng,
                    geocoding_status: 'verified'
                }));
                setLocatingGps(false);
            },
            (err) => {
                console.error('Error GPS:', err);
                alert(`No se pudo obtener la ubicación GPS: ${err.message}`);
                setLocatingGps(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    // Autodiagnóstico IA y extracción algorítmica de franja de entrega
    const handleApplyLogisticsAiParser = () => {
        const text = formalForm.delivery_restrictions.trim();
        if (!text) {
            alert('Escribe primero alguna indicación o franja horaria en las notas de entrega.');
            return;
        }
        const parsed = parseLogisticsText(text);
        const start = parsed.windows?.[0]?.startTime || formalForm.delivery_start_time || '06:30';
        const end = parsed.windows?.[0]?.endTime || formalForm.delivery_end_time || '09:30';
        const days = parsed.allowed_days?.length > 0 ? parsed.allowed_days : [1, 2, 3, 4, 5, 6];
        
        setFormalForm(prev => ({
            ...prev,
            delivery_start_time: start,
            delivery_end_time: end,
            allowed_delivery_days: days,
            logistics_data: {
                ...parsed,
                start_time: start,
                end_time: end,
                allowed_days: days,
                windows: [{ startTime: start, endTime: end }]
            }
        }));
    };

    // Toggle de días de entrega habilitados
    const toggleAllowedDay = (dayNum: number) => {
        setFormalForm(prev => {
            let updatedDays: number[];
            if (prev.allowed_delivery_days.includes(dayNum)) {
                updatedDays = prev.allowed_delivery_days.filter(d => d !== dayNum);
            } else {
                updatedDays = [...prev.allowed_delivery_days, dayNum].sort((a, b) => a - b);
            }
            if (updatedDays.length === 0) updatedDays = [dayNum]; // Al menos 1 día
            
            const updatedLogistics: LogisticsData = {
                ...(prev.logistics_data || {}),
                windows: [{ startTime: prev.delivery_start_time, endTime: prev.delivery_end_time }],
                days: updatedDays.map(d => d === 7 ? 0 : d),
                allowed_days: updatedDays,
                start_time: prev.delivery_start_time,
                end_time: prev.delivery_end_time,
                special_notes: prev.delivery_restrictions,
                parsing_date: new Date().toISOString()
            };
            return {
                ...prev,
                allowed_delivery_days: updatedDays,
                logistics_data: updatedLogistics
            };
        });
    };

    // Apertura del modal de Formalización y Acuerdo
    const handleOpenFormalizeAgreement = () => {
        if (quote.status === 'converted') return alert('Esta cotización ya fue convertida a pedido.');
        if (quote.status === 'agreement') return alert('Esta cotización ya es un Acuerdo Comercial activo.');

        if (clientProfile) {
            // Ya tiene cliente formalizado
            setSelectedExistingClient(clientProfile);
            setClientSelectionMode('select_existing');
            const clientLogistics = clientProfile.logistics_data;
            const startTime = clientLogistics?.start_time || clientLogistics?.windows?.[0]?.startTime || '06:30';
            const endTime = clientLogistics?.end_time || clientLogistics?.windows?.[0]?.endTime || '09:30';
            const allowedDays = clientLogistics?.allowed_days || [1, 2, 3, 4, 5, 6];

            setFormalForm({
                razon_social: clientProfile.razon_social || clientProfile.company_name || quote.client_name || '',
                company_name: clientProfile.company_name || quote.client_name || '',
                nit: clientProfile.nit || '',
                contact_name: clientProfile.contact_name || '',
                phone: clientProfile.contact_phone || clientProfile.phone || '',
                email: clientProfile.email || '',
                address: clientProfile.address || '',
                municipality: clientProfile.municipality || 'Bogotá D.C.',
                payment_days: quote.payment_terms_days || clientProfile.payment_days || 30,
                document_type: clientProfile.document_type || 'invoice',
                remission_with_prices: clientProfile.remission_with_prices ?? true,
                latitude: clientProfile.latitude || '',
                longitude: clientProfile.longitude || '',
                geocoding_status: clientProfile.geocoding_status || (clientProfile.latitude ? 'verified' : 'pending'),
                delivery_restrictions: clientProfile.delivery_restrictions || '',
                delivery_start_time: startTime,
                delivery_end_time: endTime,
                allowed_delivery_days: allowedDays,
                logistics_data: clientLogistics || null
            });
        } else {
            // Viene de lead o cliente no formalizado
            setClientSelectionMode('formalize_new');
            
            // Extraer GPS si está en lead.notes o en campos específicos
            const leadNotes = lead?.notes || '';
            const coordsFromNotes = extractCoordsFromText(leadNotes);
            const initialLat = (lead as any)?.latitude || coordsFromNotes?.lat || '';
            const initialLng = (lead as any)?.longitude || coordsFromNotes?.lng || '';

            // Extraer restricciones del lead
            const initialRestrictions = (lead as any)?.delivery_restrictions || (lead as any)?.preferred_delivery_time || 'Entregar de lunes a sábado entre 06:30 AM y 09:30 AM en muelle o recepción.';
            const parsedLogistics = parseLogisticsText(initialRestrictions);

            setFormalForm({
                razon_social: lead?.company_name || quote.client_name || '',
                company_name: lead?.company_name || quote.client_name || '',
                nit: lead?.nit || '',
                contact_name: lead?.contact_name || '',
                phone: lead?.phone || '',
                email: lead?.email || '',
                address: lead?.address || '',
                municipality: lead?.municipality || 'Bogotá D.C.',
                payment_days: quote.payment_terms_days || 30,
                document_type: 'invoice',
                remission_with_prices: true,
                latitude: initialLat,
                longitude: initialLng,
                geocoding_status: initialLat && initialLng ? 'verified' : 'pending',
                delivery_restrictions: initialRestrictions,
                delivery_start_time: parsedLogistics.start_time || '06:30',
                delivery_end_time: parsedLogistics.end_time || '09:30',
                allowed_delivery_days: parsedLogistics.allowed_days || [1, 2, 3, 4, 5, 6],
                logistics_data: parsedLogistics
            });
        }

        // Preset inicial pactado (ej. 180 días / 6 meses)
        setValidityDaysPreset(180);
        const d = new Date();
        d.setDate(d.getDate() + 180);
        setValidUntilDate(d.toISOString().split('T')[0]);

        setShowFormalizeModal(true);
    };

    const handleSelectValidityPreset = (days: number) => {
        setValidityDaysPreset(days);
        const d = new Date();
        d.setDate(d.getDate() + days);
        setValidUntilDate(d.toISOString().split('T')[0]);
    };

    // FORMALIZAR CLIENTE Y ACTIVAR ACUERDO COMERCIAL (CONEXIÓN AL PIPELINE)
    const submitFormalizeAgreement = async () => {
        setProcessing(true);
        try {
            let finalClientId = quote.client_id;
            let finalClientName = quote.client_name;

            // Validación de coordenadas GPS (requeridas para enrutamiento algorítmico)
            const numLat = formalForm.latitude !== '' ? parseFloat(String(formalForm.latitude)) : null;
            const numLng = formalForm.longitude !== '' ? parseFloat(String(formalForm.longitude)) : null;

            // 1. Si es formalización de nuevo cliente
            if (clientSelectionMode === 'formalize_new') {
                if (!formalForm.razon_social.trim()) throw new Error('Ingresa la Razón Social formal del cliente.');
                if (!formalForm.company_name.trim()) throw new Error('Ingresa el Nombre Comercial del establecimiento.');
                if (!formalForm.nit.trim()) throw new Error('Ingresa el NIT o Cédula del cliente.');
                if (!formalForm.contact_name.trim()) throw new Error('Ingresa el nombre de la persona de contacto.');
                if (!formalForm.phone.trim()) throw new Error('Ingresa el teléfono o WhatsApp de contacto.');
                if (!formalForm.address.trim()) throw new Error('Ingresa la dirección de despacho del cliente.');
                if (!formalForm.municipality.trim()) throw new Error('Ingresa el municipio de despacho.');

                // Validación estricta GPS
                if (numLat === null || numLng === null || isNaN(numLat) || isNaN(numLng)) {
                    throw new Error('La Georreferenciación GPS (Latitud y Longitud) es obligatoria para habilitar el despacho y optimización de rutas. Usa el botón "Detectar GPS Actual" o ingresa las coordenadas manualmente.');
                }

                // Validación de franja horaria / instrucciones
                if (!formalForm.delivery_restrictions.trim()) {
                    throw new Error('Ingresa las restricciones de entrega u horario de recibo del establecimiento.');
                }

                const finalLogisticsData: LogisticsData = formalForm.logistics_data || {
                    windows: [{ startTime: formalForm.delivery_start_time, endTime: formalForm.delivery_end_time }],
                    days: formalForm.allowed_delivery_days.map(d => d === 7 ? 0 : d),
                    allowed_days: formalForm.allowed_delivery_days,
                    start_time: formalForm.delivery_start_time,
                    end_time: formalForm.delivery_end_time,
                    special_notes: formalForm.delivery_restrictions.trim(),
                    parsing_date: new Date().toISOString()
                };

                // Insertar perfil formalizado en profiles
                const { data: newProfile, error: profErr } = await supabase
                    .from('profiles')
                    .insert([{
                        role: 'b2b_client',
                        company_name: formalForm.company_name.trim(),
                        razon_social: formalForm.razon_social.trim(),
                        nit: formalForm.nit.trim(),
                        contact_name: formalForm.contact_name.trim(),
                        phone: formalForm.phone.trim(),
                        contact_phone: formalForm.phone.trim(),
                        email: formalForm.email.trim() || null,
                        address: formalForm.address.trim(),
                        city: formalForm.municipality.trim(),
                        municipality: formalForm.municipality.trim(),
                        latitude: numLat,
                        longitude: numLng,
                        geocoding_status: 'verified',
                        delivery_restrictions: formalForm.delivery_restrictions.trim(),
                        logistics_data: finalLogisticsData,
                        payment_days: formalForm.payment_days,
                        document_type: formalForm.document_type,
                        remission_with_prices: formalForm.remission_with_prices,
                        pricing_model_id: quote.model_id,
                        is_active: true
                    }])
                    .select()
                    .single();

                if (profErr) throw profErr;

                finalClientId = newProfile.id;
                finalClientName = newProfile.company_name || newProfile.razon_social;

                // Si viene de un lead, vincular y actualizar el lead
                if (quote.lead_id) {
                    try {
                        await supabase
                            .from('leads')
                            .update({
                                status: 'converted',
                                notes: (lead?.notes || '') + `\n[CONVERTIDO A CLIENTE B2B ID: ${newProfile.id} CON GPS (${numLat}, ${numLng})]`
                            })
                            .eq('id', quote.lead_id);
                    } catch (lErr) {
                        console.warn('Notice: Could not update lead status:', lErr);
                    }
                }
            } else {
                // Cliente preexistente seleccionado
                if (!selectedExistingClient) {
                    throw new Error('Debes seleccionar un cliente preexistente del listado.');
                }
                finalClientId = selectedExistingClient.id;
                finalClientName = selectedExistingClient.company_name || selectedExistingClient.razon_social || selectedExistingClient.contact_name;

                // Sincronizar días de crédito acordados y datos logísticos/GPS si se completaron
                const profileUpdates: any = { payment_days: formalForm.payment_days };
                if (numLat !== null && numLng !== null && !isNaN(numLat) && !isNaN(numLng)) {
                    profileUpdates.latitude = numLat;
                    profileUpdates.longitude = numLng;
                    profileUpdates.geocoding_status = 'verified';
                }
                if (formalForm.delivery_restrictions?.trim()) {
                    profileUpdates.delivery_restrictions = formalForm.delivery_restrictions.trim();
                    profileUpdates.logistics_data = formalForm.logistics_data || {
                        windows: [{ startTime: formalForm.delivery_start_time, endTime: formalForm.delivery_end_time }],
                        days: formalForm.allowed_delivery_days.map(d => d === 7 ? 0 : d),
                        allowed_days: formalForm.allowed_delivery_days,
                        start_time: formalForm.delivery_start_time,
                        end_time: formalForm.delivery_end_time,
                        special_notes: formalForm.delivery_restrictions.trim(),
                        parsing_date: new Date().toISOString()
                    };
                }

                try {
                    await supabase
                        .from('profiles')
                        .update(profileUpdates)
                        .eq('id', finalClientId);
                } catch (pErr) {
                    console.warn('Notice: Could not sync payment_days / logistics:', pErr);
                }
            }

            // 2. Formalizar Cotización a Acuerdo Comercial (status = 'agreement')
            const [y, m, d] = new Date().toISOString().split('T')[0].split('-');
            const formattedDate = `${d}-${m}-${y.slice(-2)}`;
            const canonicalSnapshotName = `${finalClientName} - Acuerdo ${formattedDate}`;

            const { error: quoteErr } = await supabase
                .from('quotes')
                .update({
                    status: 'agreement',
                    client_id: finalClientId,
                    client_name: finalClientName,
                    valid_until: new Date(validUntilDate).toISOString(),
                    start_date: new Date().toISOString().split('T')[0],
                    payment_terms_days: formalForm.payment_days,
                    model_snapshot_name: canonicalSnapshotName,
                    notes: (quote.notes || '') + '\n[CONVERTIDO Y FORMALIZADO A ACUERDO COMERCIAL]'
                })
                .eq('id', quote.id);

            if (quoteErr) throw quoteErr;

            // 3. Registrar auditoría inmutable
            try {
                const { data: authData } = await supabase.auth.getUser();
                const authUser = authData?.user;
                await supabase.from('audit_logs').insert({
                    action: 'ACTIVATE_commercial_agreement',
                    module: 'COMMERCIAL',
                    collaborator_id: authUser?.id || null,
                    collaborator_name: authUser?.email || 'Comercial FruFresco',
                    details: {
                        quote_id: quote.id,
                        quote_number: quote.quote_number,
                        client_id: finalClientId,
                        client_name: finalClientName,
                        valid_until: validUntilDate,
                        payment_days: formalForm.payment_days,
                        items_count: items.length,
                        total_amount: quote.total_amount,
                        timestamp: new Date().toISOString()
                    }
                });
            } catch (auditErr) {
                console.warn('Notice: Could not log agreement activation:', auditErr);
            }

            setShowFormalizeModal(false);
            const validityMsg = validityDaysPreset === 180 ? '6 meses' : (validityDaysPreset > 0 ? `${validityDaysPreset} días` : 'el periodo pactado');
            alert(`¡Cliente Institucional ${finalClientName} creado exitosamente y Acuerdo Comercial activado por ${validityMsg}! Precios congelados hasta el ${new Date(validUntilDate).toLocaleDateString('es-CO')}.\n\nRedirigiendo a la pantalla de Acuerdos Institucionales...`);
            
            // REDIRECCIÓN DIRECTA AL PIPELINE DE ACUERDOS INSTITUCIONALES
            router.push('/admin/commercial?tab=clients&clientTab=agreements');
        } catch (err: any) {
            console.error('Error formalizing agreement:', err);
            alert('Error al formalizar acuerdo: ' + (err.message || err));
        } finally {
            setProcessing(false);
        }
    };

    // CREACIÓN DE PEDIDO SPOT PUNTUAL
    const submitSpotOrder = async () => {
        if (!quote.client_id && !clientProfile && !selectedExistingClient) {
            alert('Para generar un pedido, primero debes seleccionar o formalizar el cliente.');
            return;
        }

        setProcessing(true);
        try {
            const targetClient = clientProfile || selectedExistingClient;
            const targetClientId = quote.client_id || targetClient?.id;

            const { data: order, error: oErr } = await supabase
                .from('orders')
                .insert({
                    profile_id: targetClientId,
                    customer_name: targetClient?.company_name || targetClient?.contact_name || quote.client_name,
                    customer_phone: targetClient?.phone || targetClient?.contact_phone || '',
                    status: 'pending_approval',
                    delivery_date: spotDeliveryDate,
                    subtotal: quote.subtotal_amount || 0,
                    total: quote.total_amount || 0,
                    type: targetClient?.role === 'b2c_client' ? 'b2c_wompi' : 'b2b_credit',
                    origin_source: 'web',
                    shipping_address: targetClient?.address || 'Dirección no especificada'
                })
                .select()
                .single();

            if (oErr) throw oErr;

            try {
                const itemsData = items.map(qi => {
                    const priceWithTax = Math.round((qi.unit_price || 0) * (1 + ((qi.iva_rate || 0) / 100)));
                    const itemTotal = priceWithTax * (qi.quantity || 1);
                    const rate = qi.iva_rate || 0;
                    return {
                        order_id: order.id,
                        product_id: qi.product_id,
                        quantity: qi.quantity || 1,
                        unit_price: priceWithTax,
                        variant_label: '',
                        nickname: qi.product_name || (qi.products?.name || ''),
                        unit: qi.products?.unit_of_measure || 'Kg'
                    };
                });

                const { error: iErr } = await supabase.from('order_items').insert(itemsData);
                if (iErr) throw iErr;

                // Marcar cotización como convertida a pedido
                await supabase
                    .from('quotes')
                    .update({ status: 'converted', order_id: order.id })
                    .eq('id', quote.id);

                alert('¡Pedido Spot creado exitosamente!');
                setShowSpotOrderModal(false);
                router.push(`/admin/orders/${order.id}`);
            } catch (innerErr) {
                console.error('Error inserting order items, rolling back order:', innerErr);
                await supabase.from('orders').delete().eq('id', order.id);
                throw innerErr;
            }
        } catch (err: any) {
            console.error('Error creating spot order:', err);
            alert('Error al crear pedido spot: ' + (err.message || err));
        } finally {
            setProcessing(false);
        }
    };

    const getDaysRemaining = (dateStr: string) => {
        if (!dateStr) return null;
        const diff = new Date(dateStr).getTime() - Date.now();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>Cargando cotización...</div>;
    if (!quote) return <div style={{ padding: '2rem', textAlign: 'center', color: '#EF4444' }}>Cotización no encontrada.</div>;

    const daysRemaining = quote.status === 'agreement' ? getDaysRemaining(quote.valid_until) : null;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <div style={{ width: '96%', maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 1rem' }}>
                <div style={{ marginBottom: '1.2rem' }}>
                    <Link href="/admin/commercial/quotes" style={{ textDecoration: 'none', color: THEME.colors.textSecondary, fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem' }}>
                        <ArrowLeft size={16} strokeWidth={2} /> Volver a Cotizaciones
                    </Link>
                </div>

                {/* ALERTA DE SEMÁFORO DE VIGENCIA SI YA ES ACUERDO */}
                {quote.status === 'agreement' && daysRemaining !== null && (
                    <div style={{ 
                        backgroundColor: daysRemaining < 0 ? '#FEF2F2' : (daysRemaining <= 5 ? '#FFFBEB' : '#ECFDF5'), 
                        border: `1.5px solid ${daysRemaining < 0 ? '#FECACA' : (daysRemaining <= 5 ? '#F59E0B' : '#10B981')}`, 
                        padding: '1rem 1.25rem', 
                        borderRadius: '14px', 
                        marginBottom: '1.5rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        gap: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Handshake size={24} color={daysRemaining < 0 ? '#DC2626' : (daysRemaining <= 5 ? '#D97706' : '#059669')} strokeWidth={2} />
                            <div>
                                <div style={{ fontWeight: '800', color: daysRemaining < 0 ? '#991B1B' : (daysRemaining <= 5 ? '#92400E' : '#065F46'), fontSize: '0.95rem' }}>
                                    {daysRemaining < 0 
                                        ? 'Este Acuerdo Comercial ha expirado' 
                                        : daysRemaining === 0 
                                            ? '¡Este Acuerdo Comercial vence hoy!' 
                                            : `Acuerdo Comercial Activo &bull; Vigente por ${daysRemaining} días más`}
                                </div>
                                <div style={{ fontSize: '0.82rem', color: daysRemaining < 0 ? '#B91C1C' : (daysRemaining <= 5 ? '#B45309' : '#047857') }}>
                                    Fecha límite de precios congelados: {new Date(quote.valid_until).toLocaleDateString('es-CO')}. Plazo de pago pactado: {quote.payment_terms_days || 30} días de crédito.
                                </div>
                            </div>
                        </div>

                        <Link href="/admin/commercial?tab=clients&clientTab=agreements" style={{ textDecoration: 'none' }}>
                            <button style={{
                                backgroundColor: '#0D7A57',
                                color: 'white',
                                border: 'none',
                                padding: '0.55rem 1.1rem',
                                borderRadius: '8px',
                                fontWeight: '800',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                Gestionar en Acuerdos <ChevronRight size={14} />
                            </button>
                        </Link>
                    </div>
                )}

                {/* HEADER CARD */}
                <div style={{ 
                    backgroundColor: 'white', 
                    padding: '1.75rem 2rem', 
                    borderRadius: '16px', 
                    boxShadow: '0 4px 20px rgba(0,0,0,0.03)', 
                    border: '1px solid #E5E7EB',
                    marginBottom: '1.5rem', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1.5rem'
                }}>
                    <div>
                        <div style={{ textTransform: 'uppercase', fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '700', letterSpacing: '0.05em' }}>
                            {formatQuoteNumber(quote.quote_number, quote.status, quote.created_at)}
                        </div>
                        <h1 style={{ fontSize: '1.8rem', margin: '0.3rem 0 0.5rem 0', fontWeight: '800', color: THEME.colors.textMain }}>
                            {quote.client_name}
                        </h1>
                        <div style={{ display: 'flex', gap: '1.2rem', color: THEME.colors.textSecondary, fontSize: '0.85rem' }}>
                            <span>Modelo: <strong style={{ color: THEME.colors.textMain }}>{quote.model_snapshot_name || 'Estándar'}</strong></span>
                            <span>•</span>
                            <span>Emisión: <strong style={{ color: THEME.colors.textMain }}>{new Date(quote.created_at).toLocaleDateString('es-CO')}</strong></span>
                            <span>•</span>
                            <span>Plazo Pago: <strong style={{ color: '#0D7A57' }}>{quote.payment_terms_days || clientProfile?.payment_days || 30} Días Crédito</strong></span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1rem' }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Ofertado</div>
                            <div style={{ fontSize: '2.2rem', fontWeight: '800', color: THEME.colors.primary, lineHeight: 1.1 }}>${formatPrice(quote.total_amount || 0)}</div>
                        </div>

                        {/* ACCIONES COMERCIALES Y CONEXIÓN AL PIPELINE */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            {quote.status === 'converted' ? (
                                <Link href={quote.order_id ? `/admin/orders/${quote.order_id}` : '/admin/orders'} style={{ textDecoration: 'none' }}>
                                    <button style={{ 
                                        backgroundColor: '#ECFDF5', 
                                        color: '#047857', 
                                        border: '1px solid #A7F3D0', 
                                        padding: '0.6rem 1.1rem', 
                                        borderRadius: '10px', 
                                        fontWeight: '700', 
                                        fontSize: '0.82rem', 
                                        cursor: 'pointer', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.4rem' 
                                    }}>
                                        <CheckCircle size={15} strokeWidth={2} />
                                        <span>CONVERTIDA A PEDIDO</span>
                                    </button>
                                </Link>
                            ) : quote.status === 'agreement' ? (
                                <Link href="/admin/commercial?tab=clients&clientTab=agreements" style={{ textDecoration: 'none' }}>
                                    <button style={{ 
                                        backgroundColor: '#ECFDF5', 
                                        color: '#065F46', 
                                        border: '1.5px solid #10B981', 
                                        padding: '0.6rem 1.2rem', 
                                        borderRadius: '10px', 
                                        fontWeight: '800', 
                                        fontSize: '0.82rem', 
                                        cursor: 'pointer', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.5rem',
                                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)'
                                    }}>
                                        <Handshake size={16} strokeWidth={2} />
                                        <span>ACUERDO VIGENTE &bull; VER EN ACUERDOS →</span>
                                    </button>
                                </Link>
                            ) : (
                                <>
                                    {/* 1. ACCIÓN PRINCIPAL: FORMALIZAR Y ACTIVAR ACUERDO */}
                                    <button
                                        onClick={handleOpenFormalizeAgreement}
                                        disabled={processing}
                                        style={{ 
                                            backgroundColor: '#0D7A57', 
                                            color: 'white', 
                                            border: 'none', 
                                            padding: '0.6rem 1.25rem', 
                                            borderRadius: '10px', 
                                            fontWeight: '800', 
                                            fontSize: '0.82rem', 
                                            cursor: 'pointer', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '0.5rem',
                                            boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)',
                                            transition: 'all 0.15s ease-in-out'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0A5F43'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0D7A57'}
                                    >
                                        <Handshake size={16} strokeWidth={2} />
                                        <span>Cerrar Negociación: Alta de Cliente B2B y Cargar Acuerdo</span>
                                    </button>

                                    {/* 2. AJUSTAR PRECIOS (NEGOCIACIÓN V2, V3...) */}
                                    <Link href={`/admin/commercial/quotes/create?duplicate_from=${quote.id}`} style={{ textDecoration: 'none' }}>
                                        <button
                                            style={{ 
                                                backgroundColor: 'white', 
                                                color: THEME.colors.textMain, 
                                                border: '1px solid #D1D5DB', 
                                                padding: '0.6rem 1.1rem', 
                                                borderRadius: '10px', 
                                                fontWeight: '600', 
                                                fontSize: '0.82rem', 
                                                cursor: 'pointer', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '0.4rem',
                                                transition: 'all 0.15s ease-in-out'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAF9'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                            title="Genera una nueva versión de la cotización para continuar la conversación de precios con el cliente"
                                        >
                                            <Edit3 size={15} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                                            <span>Ajustar Precios (Nueva Versión v2, v3...)</span>
                                        </button>
                                    </Link>

                                    {/* 3. PEDIDO SPOT (VENTA PUNTUAL SIN ACUERDO) */}
                                    <button
                                        onClick={() => setShowSpotOrderModal(true)}
                                        disabled={processing}
                                        style={{ 
                                            backgroundColor: '#F8FAFC', 
                                            color: '#334155', 
                                            border: '1px solid #CBD5E1', 
                                            padding: '0.6rem 1rem', 
                                            borderRadius: '10px', 
                                            fontWeight: '700', 
                                            fontSize: '0.82rem', 
                                            cursor: 'pointer', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '0.4rem',
                                            transition: 'all 0.15s ease-in-out'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                    >
                                        <ShoppingBag size={15} strokeWidth={1.5} />
                                        <span>Pedido Spot</span>
                                    </button>
                                </>
                            )}

                            {/* EXPORTAR EXCEL */}
                            <a
                                href={`/api/quotes/${quote.id}/excel`}
                                download
                                style={{ textDecoration: 'none' }}
                            >
                                <button
                                    style={{ 
                                        backgroundColor: '#F0FDF4', 
                                        color: '#15803D', 
                                        border: '1px solid #BBF7D0', 
                                        padding: '0.6rem 1rem', 
                                        borderRadius: '10px', 
                                        fontWeight: '700', 
                                        fontSize: '0.82rem', 
                                        cursor: 'pointer', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.4rem', 
                                        transition: 'all 0.15s ease-in-out' 
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#DCFCE7'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F0FDF4'}
                                    title="Descargar versión Excel (.xlsx)"
                                >
                                    <FileSpreadsheet size={15} strokeWidth={1.5} style={{ color: '#16A34A' }} />
                                    <span>Excel</span>
                                </button>
                            </a>

                            {/* COMPARTIR WHATSAPP */}
                            <button
                                onClick={() => {
                                    const origin = typeof window !== 'undefined' ? window.location.origin : '';
                                    const pdfUrl = `${origin}/quotes/${quote.id}/print`;
                                    const excelUrl = `${origin}/api/quotes/${quote.id}/excel`;
                                    const text = encodeURIComponent(
                                        `Hola *${quote.client_name || 'Cliente'}*, te compartimos tu propuesta comercial oficial de FruFresco:\n\n` +
                                        `• *Documento Oficial (Formato Membrete):* ${pdfUrl}\n` +
                                        `• *Archivo Excel:* ${excelUrl}\n\n` +
                                        `Quedamos a tu entera disposición para formalizar el acuerdo de precios.`
                                    );
                                    const phone = (clientProfile?.contact_phone || clientProfile?.phone || lead?.phone || '').replace(/\D/g, '');
                                    const waUrl = phone ? `https://wa.me/57${phone}?text=${text}` : `https://wa.me/?text=${text}`;
                                    window.open(waUrl, '_blank');
                                }}
                                style={{ 
                                    backgroundColor: '#ECFDF5', 
                                    color: '#047857', 
                                    border: '1px solid #A7F3D0', 
                                    padding: '0.6rem 1rem', 
                                    borderRadius: '10px', 
                                    fontWeight: '700', 
                                    fontSize: '0.82rem', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.4rem',
                                    transition: 'all 0.15s ease-in-out'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#D1FAE5'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ECFDF5'}
                                title="Compartir propuesta por WhatsApp"
                            >
                                <MessageCircle size={15} strokeWidth={1.5} style={{ color: '#059669' }} />
                                <span>WhatsApp</span>
                            </button>

                            {/* IMPRIMIR EN FORMATO ESTANDARIZADO DE REMISIÓN */}
                            <button
                                onClick={() => window.open(`/admin/commercial/quotes/${quote.id}/print`, '_blank')}
                                style={{ 
                                    backgroundColor: 'white', 
                                    color: THEME.colors.textMain, 
                                    border: '1px solid #D1D5DB', 
                                    padding: '0.6rem 1rem', 
                                    borderRadius: '10px', 
                                    fontWeight: '600', 
                                    fontSize: '0.82rem', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.4rem',
                                    transition: 'all 0.15s ease-in-out'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAF9'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                title="Ver e imprimir en formato estandarizado oficial (Letterhead)"
                            >
                                <Printer size={15} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                                <span>Imprimir</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* TARJETA DEL PROSPECTO SI PROVIENE DE LEAD */}
                {lead && (
                    <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', padding: '1rem 1.5rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                        <div style={{ fontSize: '0.7rem', color: '#16A34A', fontWeight: '900', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Flame size={13} color="#EA580C" /> Prospecto Vinculado (CRM Lead #{lead.id})
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.85rem', color: '#374151', marginTop: '6px' }}>
                            <div><strong>Contacto:</strong> {lead.contact_name || lead.company_name}</div>
                            {lead.nit && <div><strong>NIT:</strong> {lead.nit}</div>}
                            {lead.phone && <div><strong>Teléfono:</strong> {lead.phone}</div>}
                            {lead.email && <div><strong>Email:</strong> {lead.email}</div>}
                            {(lead.address || lead.municipality) && (
                                <div style={{ gridColumn: 'span 2' }}><strong>Dirección Declarada:</strong> {lead.address || ''}{lead.municipality ? ` - ${lead.municipality}` : ''}</div>
                            )}
                            {lead.business_type && <div><strong>Tipo Negocio:</strong> {lead.business_type}</div>}
                            {lead.business_size && <div><strong>Tamaño:</strong> {lead.business_size}</div>}
                        </div>
                    </div>
                )}

                {/* TABLA DE PRODUCTOS OFERTADOS */}
                <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                                <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.74rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', width: '4%', textAlign: 'center' }}>#</th>
                                <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.74rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Producto</th>
                                <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.74rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>U.M.</th>
                                <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.74rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Cant. Mínima</th>
                                <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.74rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Costo Base</th>
                                <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.74rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Margen</th>
                                <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.74rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>IVA</th>
                                <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.74rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Precio Unit.</th>
                                <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.74rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                let counter = 0;
                                return groupedCategories.map(group => (
                                    <React.Fragment key={group.category}>
                                        <tr style={{ backgroundColor: '#F8FAFC' }}>
                                            <td colSpan={9} style={{ 
                                                padding: '0.45rem 0.85rem', 
                                                borderLeft: '3.5px solid #10B981',
                                                borderTop: '1px solid #E2E8F0',
                                                borderBottom: '1px solid #E2E8F0'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <span style={{ fontWeight: '800', fontSize: '0.78rem', color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                        {group.category}
                                                    </span>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748B', backgroundColor: '#E2E8F0', padding: '2px 8px', borderRadius: '6px' }}>
                                                        {group.items.length} {group.items.length === 1 ? 'ítem' : 'ítems'}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>

                                        {group.items.map(item => {
                                            counter++;
                                            const unitPrice = item.unit_price || 0;
                                            const qty = item.quantity || 1;
                                            const totalPrice = item.total_price || (unitPrice * qty);
                                            const unitLabel = item.products?.unit_of_measure || item.unit || 'Kg';
                                            const minQtyLabel = formatMinQty(item);

                                            return (
                                                <tr key={item.id || counter} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                    <td style={{ padding: '0.45rem 0.85rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '700', color: '#94A3B8' }}>
                                                        {String(counter).padStart(2, '0')}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.85rem', fontWeight: '600', color: '#1E293B', fontSize: '0.84rem' }}>
                                                        {item.product_name || item.products?.name || 'Producto'}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.85rem', textAlign: 'center', color: '#475569', fontSize: '0.8rem' }}>
                                                        {unitLabel}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.85rem', textAlign: 'center', fontWeight: '700', color: '#0D7A57', fontSize: '0.8rem', backgroundColor: '#F0FDF4' }}>
                                                        {minQtyLabel}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.85rem', textAlign: 'right', color: '#64748B', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                                                        ${formatPrice(item.cost_basis || 0)}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.85rem', textAlign: 'center', color: '#2563EB', fontWeight: '700', fontSize: '0.8rem' }}>
                                                        {Math.round((item.margin_percent || 0) * 10) / 10}%
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.85rem', textAlign: 'center', color: '#64748B', fontSize: '0.78rem' }}>
                                                        {item.iva_rate || item.products?.iva_rate || 0}%
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.85rem', textAlign: 'right', fontWeight: '700', color: '#0F172A', fontSize: '0.84rem', fontVariantNumeric: 'tabular-nums' }}>
                                                        ${formatPrice(unitPrice)}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.85rem', textAlign: 'right', fontWeight: '800', color: '#0F172A', fontSize: '0.84rem', fontVariantNumeric: 'tabular-nums' }}>
                                                        ${formatPrice(totalPrice)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                ));
                            })()}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid #E5E7EB', color: '#475569' }}>
                                <td colSpan={6}></td>
                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: '700', fontSize: '0.85rem' }}>Subtotal</td>
                                <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: '700', fontSize: '0.95rem', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                    ${formatPrice(quote?.subtotal_amount || items.reduce((sum, i) => sum + ((i.quantity || 1) * (i.unit_price || 0)), 0))}
                                </td>
                            </tr>
                            <tr style={{ color: '#64748B' }}>
                                <td colSpan={6}></td>
                                <td style={{ padding: '0.4rem 0.85rem', textAlign: 'right', fontWeight: '600', fontSize: '0.8rem' }}>Impuestos (IVA)</td>
                                <td style={{ padding: '0.4rem 0.85rem', textAlign: 'right', fontWeight: '600', fontSize: '0.88rem', fontVariantNumeric: 'tabular-nums' }}>
                                    ${formatPrice(quote?.total_tax_amount || items.reduce((sum, i) => sum + ((i.quantity || 1) * (i.unit_price || 0)) * ((i.iva_rate || 0) / 100), 0))}
                                </td>
                            </tr>
                            <tr style={{ backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
                                <td colSpan={6}></td>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', fontWeight: '900', fontSize: '0.95rem', color: '#0F172A' }}>Total Cotización</td>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', fontWeight: '900', fontSize: '1.25rem', color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
                                    ${formatPrice(quote?.total_amount || 0)} COP
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* MODAL MAESTRO: FORMALIZACIÓN DE CLIENTE Y ACTIVACIÓN DE ACUERDO COMERCIAL */}
            {/* ========================================================================= */}
            {showFormalizeModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', maxWidth: '780px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #E2E8F0' }}>
                        
                        {/* HEADER DEL MODAL */}
                        <div style={{ padding: '1.5rem 1.75rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ backgroundColor: '#ECFDF5', color: '#0D7A57', width: '42px', height: '42px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Handshake size={22} strokeWidth={2.2} />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#0F172A' }}>
                                        Cierre de Negociación: Alta de Cliente B2B y Carga de Acuerdo
                                    </h2>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                                        El cliente ha aceptado la propuesta comercial. Ingresa los datos del kit de vinculación (Copia del RUT, dirección física y restricciones de entrega) para dar de alta al nuevo cliente institucional y asignarle este acuerdo comercial.
                                    </p>
                                </div>
                            </div>

                            <button 
                                onClick={() => setShowFormalizeModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ padding: '1.75rem' }}>
                            {/* PESTAÑAS DE SELECCIÓN DE CLIENTE */}
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', backgroundColor: '#F1F5F9', padding: '4px', borderRadius: '10px' }}>
                                <button
                                    onClick={() => setClientSelectionMode('formalize_new')}
                                    style={{
                                        flex: 1,
                                        padding: '0.6rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: '800',
                                        fontSize: '0.82rem',
                                        backgroundColor: clientSelectionMode === 'formalize_new' ? 'white' : 'transparent',
                                        color: clientSelectionMode === 'formalize_new' ? '#0D7A57' : '#64748B',
                                        boxShadow: clientSelectionMode === 'formalize_new' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'
                                    }}
                                >
                                    {lead ? '1. Alta de Nuevo Cliente (RUT, Despacho y Recibo)' : '1. Crear Nuevo Cliente Institucional (RUT y Despacho)'}
                                </button>
                                <button
                                    onClick={() => setClientSelectionMode('select_existing')}
                                    style={{
                                        flex: 1,
                                        padding: '0.6rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: '800',
                                        fontSize: '0.82rem',
                                        backgroundColor: clientSelectionMode === 'select_existing' ? 'white' : 'transparent',
                                        color: clientSelectionMode === 'select_existing' ? '#0D7A57' : '#64748B',
                                        boxShadow: clientSelectionMode === 'select_existing' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'
                                    }}
                                >
                                    2. Cargar Acuerdo a Cliente Preexistente
                                </button>
                            </div>

                            {/* CASO A: FORMULARIO DE FORMALIZACIÓN COMPLETA */}
                            {clientSelectionMode === 'formalize_new' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
                                    
                                    {/* BLOQUE 1: DATOS JURÍDICOS Y DE CONTACTO */}
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0D7A57', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Building2 size={16} /> 1. Datos Jurídicos y Tributarios (Extraídos de la Copia del RUT)
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                                    Razón Social Formal (Según RUT) *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formalForm.razon_social}
                                                    onChange={e => setFormalForm({ ...formalForm, razon_social: e.target.value })}
                                                    placeholder="Ej. Operadora Gastronómica S.A.S."
                                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', outline: 'none' }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                                    Nombre Comercial / Establecimiento *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formalForm.company_name}
                                                    onChange={e => setFormalForm({ ...formalForm, company_name: e.target.value })}
                                                    placeholder="Ej. Restaurante El Nogal"
                                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', outline: 'none' }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                                    NIT con Dígito de Verificación (Según RUT) *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formalForm.nit}
                                                    onChange={e => setFormalForm({ ...formalForm, nit: e.target.value })}
                                                    placeholder="Ej. 901.345.678-1"
                                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', outline: 'none' }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                                    Contacto Principal (Chef / Comprador / Administrador) *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formalForm.contact_name}
                                                    onChange={e => setFormalForm({ ...formalForm, contact_name: e.target.value })}
                                                    placeholder="Ej. Carlos Mendoza"
                                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', outline: 'none' }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                                    Teléfono Celular / WhatsApp de Pedidos *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formalForm.phone}
                                                    onChange={e => setFormalForm({ ...formalForm, phone: e.target.value })}
                                                    placeholder="Ej. 3101234567"
                                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', outline: 'none' }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                                    Correo Facturación Electrónica (Según RUT) *
                                                </label>
                                                <input
                                                    type="email"
                                                    value={formalForm.email}
                                                    onChange={e => setFormalForm({ ...formalForm, email: e.target.value })}
                                                    placeholder="Ej. facturas@elnogal.com"
                                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', outline: 'none' }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* BLOQUE 2: DIRECCIÓN FÍSICA Y GEORREFERENCIACIÓN SATELITAL GPS */}
                                    <div style={{ backgroundColor: '#F0FDF4', padding: '1.25rem', borderRadius: '12px', border: '1.5px solid #BBF7D0' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <MapPin size={16} /> 2. Ubicación y Georreferenciación GPS (Despacho)
                                            </div>

                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button
                                                    type="button"
                                                    onClick={handleGetCurrentLocation}
                                                    disabled={locatingGps}
                                                    style={{
                                                        backgroundColor: 'white',
                                                        color: '#065F46',
                                                        border: '1px solid #A7F3D0',
                                                        padding: '0.4rem 0.75rem',
                                                        borderRadius: '6px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        cursor: locatingGps ? 'wait' : 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    {locatingGps ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />}
                                                    <span>{locatingGps ? 'Capturando...' : 'Detectar GPS Actual'}</span>
                                                </button>

                                                {formalForm.latitude && formalForm.longitude && (
                                                    <a
                                                        href={`https://www.google.com/maps/search/?api=1&query=${formalForm.latitude},${formalForm.longitude}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{
                                                            backgroundColor: 'white',
                                                            color: '#047857',
                                                            border: '1px solid #A7F3D0',
                                                            padding: '0.4rem 0.75rem',
                                                            borderRadius: '6px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 700,
                                                            textDecoration: 'none',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <ExternalLink size={13} /> Maps
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1rem', marginBottom: '0.85rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#166534', marginBottom: '4px' }}>
                                                    Dirección Física de Despacho (Cocina / Bodega) *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formalForm.address}
                                                    onChange={e => setFormalForm({ ...formalForm, address: e.target.value })}
                                                    placeholder="Ej. Calle 127 # 15 - 40 Local 102"
                                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #86EFAC', fontSize: '0.82rem', outline: 'none', backgroundColor: 'white' }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#166534', marginBottom: '4px' }}>
                                                    Municipio / Ciudad *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formalForm.municipality}
                                                    onChange={e => setFormalForm({ ...formalForm, municipality: e.target.value })}
                                                    placeholder="Ej. Bogotá D.C."
                                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #86EFAC', fontSize: '0.82rem', outline: 'none', backgroundColor: 'white' }}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', backgroundColor: 'white', padding: '0.85rem', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#166534', marginBottom: '4px' }}>
                                                    Latitud GPS *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formalForm.latitude}
                                                    onChange={e => setFormalForm({ ...formalForm, latitude: e.target.value, geocoding_status: 'manual' })}
                                                    placeholder="Ej. 4.678912"
                                                    style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#166534', marginBottom: '4px' }}>
                                                    Longitud GPS *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formalForm.longitude}
                                                    onChange={e => setFormalForm({ ...formalForm, longitude: e.target.value, geocoding_status: 'manual' })}
                                                    placeholder="Ej. -74.056789"
                                                    style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}
                                                />
                                            </div>

                                            <div style={{ gridColumn: 'span 2', fontSize: '0.72rem', color: formalForm.latitude && formalForm.longitude ? '#059669' : '#D97706', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {formalForm.latitude && formalForm.longitude ? (
                                                    <>
                                                        <Check size={14} color="#059669" />
                                                        <span>Georreferenciado satelitalmente para optimizador de flota (Fleet Engine).</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <AlertTriangle size={14} color="#D97706" />
                                                        <span>Coordenadas pendientes. El enrutador logístico requiere latitud y longitud válidas.</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* BLOQUE 3: FRANJA HORARIA Y RESTRICCIONES LOGÍSTICAS */}
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0D7A57', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Clock size={16} /> 3. Restricciones y Franjas Horarias de Entrega
                                            </div>

                                            <button
                                                type="button"
                                                onClick={handleApplyLogisticsAiParser}
                                                style={{
                                                    backgroundColor: 'white',
                                                    color: '#0D7A57',
                                                    border: '1px solid #CBD5E1',
                                                    padding: '0.4rem 0.75rem',
                                                    borderRadius: '6px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                <Sparkles size={13} color="#0D7A57" /> Autodiagnóstico IA
                                            </button>
                                        </div>

                                        <div style={{ marginBottom: '0.85rem' }}>
                                            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                                Instrucciones Naturales de Recibo (Texto o Voz) *
                                            </label>
                                            <textarea
                                                value={formalForm.delivery_restrictions}
                                                onChange={e => setFormalForm({ ...formalForm, delivery_restrictions: e.target.value })}
                                                placeholder="Ej: Entregar de lunes a sábado entre 06:30 AM y 09:30 AM por el muelle del sótano 1. No recibir domingos."
                                                style={{ width: '100%', minHeight: '65px', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem', resize: 'vertical', outline: 'none' }}
                                            />
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '1rem', alignItems: 'flex-end', marginBottom: '0.85rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                                    Hora Inicio Recibo
                                                </label>
                                                <input
                                                    type="time"
                                                    value={formalForm.delivery_start_time}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        setFormalForm(prev => ({
                                                            ...prev,
                                                            delivery_start_time: val,
                                                            logistics_data: prev.logistics_data ? {
                                                                ...prev.logistics_data,
                                                                start_time: val,
                                                                windows: [{ startTime: val, endTime: prev.delivery_end_time }]
                                                            } : null
                                                        }));
                                                    }}
                                                    style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: 700 }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                                    Hora Límite Recibo
                                                </label>
                                                <input
                                                    type="time"
                                                    value={formalForm.delivery_end_time}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        setFormalForm(prev => ({
                                                            ...prev,
                                                            delivery_end_time: val,
                                                            logistics_data: prev.logistics_data ? {
                                                                ...prev.logistics_data,
                                                                end_time: val,
                                                                windows: [{ startTime: prev.delivery_start_time, endTime: val }]
                                                            } : null
                                                        }));
                                                    }}
                                                    style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: 700 }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                                    Días Habilitados de Entrega:
                                                </label>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {[
                                                        { num: 1, label: 'Lun' },
                                                        { num: 2, label: 'Mar' },
                                                        { num: 3, label: 'Mié' },
                                                        { num: 4, label: 'Jue' },
                                                        { num: 5, label: 'Vie' },
                                                        { num: 6, label: 'Sáb' },
                                                        { num: 7, label: 'Dom' }
                                                    ].map(d => {
                                                        const active = formalForm.allowed_delivery_days.includes(d.num);
                                                        return (
                                                            <button
                                                                key={d.num}
                                                                type="button"
                                                                onClick={() => toggleAllowedDay(d.num)}
                                                                style={{
                                                                    padding: '0.35rem 0.55rem',
                                                                    borderRadius: '6px',
                                                                    border: active ? '1.5px solid #0D7A57' : '1px solid #CBD5E1',
                                                                    backgroundColor: active ? '#ECFDF5' : 'white',
                                                                    color: active ? '#065F46' : '#64748B',
                                                                    fontWeight: active ? 800 : 500,
                                                                    fontSize: '0.72rem',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                {d.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        {/* BANNER CANÓNICO RESUMEN FRANJA LOGÍSTICA */}
                                        <div style={{ backgroundColor: '#ECFDF5', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Cpu size={16} color="#0D7A57" />
                                            <div>
                                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#047857', textTransform: 'uppercase' }}>
                                                    Franja Canónica Activa (Motor de Rutas):
                                                </div>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#065F46' }}>
                                                    {formatTimeWindow(formalForm.logistics_data || {
                                                        windows: [{ startTime: formalForm.delivery_start_time, endTime: formalForm.delivery_end_time }],
                                                        days: formalForm.allowed_delivery_days.map(d => d === 7 ? 0 : d),
                                                        allowed_days: formalForm.allowed_delivery_days,
                                                        start_time: formalForm.delivery_start_time,
                                                        end_time: formalForm.delivery_end_time,
                                                        parsing_date: new Date().toISOString()
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* BLOQUE 4: CONDICIONES COMERCIALES Y DOCUMENTALES */}
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0D7A57', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <FileText size={16} /> 4. Condiciones Comerciales y Tributarias
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                                    Condición de Pago (Crédito Acordado)
                                                </label>
                                                <select
                                                    value={formalForm.payment_days}
                                                    onChange={e => setFormalForm({ ...formalForm, payment_days: Number(e.target.value) })}
                                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', backgroundColor: 'white' }}
                                                >
                                                    <option value={0}>Contado contra entrega (0 días)</option>
                                                    <option value={8}>8 días calendario</option>
                                                    <option value={15}>15 días (Quincenal)</option>
                                                    <option value={30}>30 días (Estándar B2B)</option>
                                                    <option value={45}>45 días crédito</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                                    Tipo de Documento Tributario
                                                </label>
                                                <select
                                                    value={formalForm.document_type}
                                                    onChange={e => setFormalForm({ ...formalForm, document_type: e.target.value as any })}
                                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', backgroundColor: 'white' }}
                                                >
                                                    <option value="invoice">Factura Electrónica (DIAN)</option>
                                                    <option value="remission">Remisión de Entrega</option>
                                                </select>
                                            </div>

                                            <div style={{ gridColumn: 'span 2' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#334155', cursor: 'pointer' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={formalForm.remission_with_prices}
                                                        onChange={e => setFormalForm({ ...formalForm, remission_with_prices: e.target.checked })}
                                                    />
                                                    <span>Imprimir precios unitarios e importes en la Remisión física de entrega</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* CASO B: BUSCADOR DE CLIENTE PREEXISTENTE CON VALIDACIÓN LOGÍSTICA */
                                <div style={{ marginBottom: '1.5rem', backgroundColor: '#F8FAFC', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                        Buscar Cliente Registrado:
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                        <input
                                            type="text"
                                            value={clientSearch}
                                            onChange={e => handleSearchExistingClients(e.target.value)}
                                            placeholder="Buscar por razón social, nombre comercial o NIT..."
                                            style={{ width: '100%', padding: '0.65rem 0.75rem 0.65rem 34px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                                        />
                                    </div>

                                    {clientResults.length > 0 && (
                                        <div style={{ marginTop: '8px', border: '1px solid #CBD5E1', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto', backgroundColor: 'white' }}>
                                            {clientResults.map(c => (
                                                <div
                                                    key={c.id}
                                                    onClick={() => {
                                                        setSelectedExistingClient(c);
                                                        const cLogistics = c.logistics_data;
                                                        const cStartTime = cLogistics?.start_time || cLogistics?.windows?.[0]?.startTime || '06:30';
                                                        const cEndTime = cLogistics?.end_time || cLogistics?.windows?.[0]?.endTime || '09:30';
                                                        const cAllowedDays = cLogistics?.allowed_days || [1, 2, 3, 4, 5, 6];

                                                        setFormalForm(prev => ({
                                                            ...prev,
                                                            razon_social: c.razon_social || c.company_name || prev.razon_social,
                                                            company_name: c.company_name || prev.company_name,
                                                            nit: c.nit || prev.nit,
                                                            contact_name: c.contact_name || prev.contact_name,
                                                            phone: c.contact_phone || c.phone || prev.phone,
                                                            email: c.email || prev.email,
                                                            address: c.address || prev.address,
                                                            municipality: c.municipality || prev.municipality,
                                                            payment_days: c.payment_days || prev.payment_days,
                                                            document_type: c.document_type || prev.document_type,
                                                            remission_with_prices: c.remission_with_prices ?? prev.remission_with_prices,
                                                            latitude: c.latitude || prev.latitude,
                                                            longitude: c.longitude || prev.longitude,
                                                            geocoding_status: c.geocoding_status || prev.geocoding_status,
                                                            delivery_restrictions: c.delivery_restrictions || prev.delivery_restrictions,
                                                            delivery_start_time: cStartTime,
                                                            delivery_end_time: cEndTime,
                                                            allowed_delivery_days: cAllowedDays,
                                                            logistics_data: cLogistics || prev.logistics_data
                                                        }));
                                                        setClientResults([]);
                                                        setClientSearch('');
                                                    }}
                                                    style={{ 
                                                        padding: '0.65rem 0.85rem', 
                                                        borderBottom: '1px solid #F1F5F9', 
                                                        cursor: 'pointer',
                                                        backgroundColor: selectedExistingClient?.id === c.id ? '#ECFDF5' : 'white',
                                                        transition: 'background 0.15s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAF9'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedExistingClient?.id === c.id ? '#ECFDF5' : 'white'}
                                                >
                                                    <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.85rem' }}>{c.company_name || c.razon_social}</div>
                                                    <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                                        NIT: {c.nit || 'Sin NIT'} &bull; {c.contact_name} &bull; {c.phone} {c.latitude && c.longitude ? '📍 Con GPS' : '⚠️ Sin GPS'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {selectedExistingClient && (
                                        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div style={{ padding: '0.85rem 1rem', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '8px' }}>
                                                <div style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 800, textTransform: 'uppercase' }}>Cliente Seleccionado:</div>
                                                <div style={{ fontWeight: 900, color: '#065F46', fontSize: '0.95rem' }}>{selectedExistingClient.company_name || selectedExistingClient.razon_social}</div>
                                                <div style={{ fontSize: '0.78rem', color: '#047857', marginTop: '2px' }}>
                                                    NIT: {selectedExistingClient.nit} &bull; Contacto: {selectedExistingClient.contact_name} &bull; {selectedExistingClient.address}
                                                </div>
                                            </div>

                                            {/* VALIDACIÓN Y ENRIQUECIMIENTO LOGÍSTICO/GPS DE CLIENTE EXISTENTE */}
                                            <div style={{ padding: '0.85rem 1rem', backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <MapPin size={15} color="#0D7A57" /> Georreferenciación y Franja Logística Registrada
                                                    </span>

                                                    <button
                                                        type="button"
                                                        onClick={handleGetCurrentLocation}
                                                        disabled={locatingGps}
                                                        style={{
                                                            backgroundColor: '#F0FDF4',
                                                            color: '#065F46',
                                                            border: '1px solid #BBF7D0',
                                                            padding: '0.3rem 0.65rem',
                                                            borderRadius: '6px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 700,
                                                            cursor: locatingGps ? 'wait' : 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        {locatingGps ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />}
                                                        <span>Actualizar GPS</span>
                                                    </button>
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                                    <div>
                                                        <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', display: 'block' }}>Latitud</label>
                                                        <input
                                                            type="text"
                                                            value={formalForm.latitude}
                                                            onChange={e => setFormalForm({ ...formalForm, latitude: e.target.value })}
                                                            placeholder="Ej. 4.678912"
                                                            style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', display: 'block' }}>Longitud</label>
                                                        <input
                                                            type="text"
                                                            value={formalForm.longitude}
                                                            onChange={e => setFormalForm({ ...formalForm, longitude: e.target.value })}
                                                            placeholder="Ej. -74.056789"
                                                            style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem' }}
                                                        />
                                                    </div>
                                                </div>

                                                <div>
                                                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '2px' }}>Restricciones de Entrega</label>
                                                    <input
                                                        type="text"
                                                        value={formalForm.delivery_restrictions}
                                                        onChange={e => setFormalForm({ ...formalForm, delivery_restrictions: e.target.value })}
                                                        placeholder="Instrucciones u horario de muelle..."
                                                        style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* CONFIGURACIÓN DE VIGENCIA DEL ACUERDO INSTITUCIONAL */}
                            <div style={{ backgroundColor: '#FFFBEB', border: '1.5px solid #FCD34D', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <Clock size={18} color="#D97706" />
                                    <div style={{ fontWeight: 800, color: '#92400E', fontSize: '0.88rem' }}>
                                        Vigencia de Precios Congelados del Acuerdo
                                    </div>
                                </div>
                                <p style={{ fontSize: '0.76rem', color: '#B45309', margin: '0 0 10px 0', lineHeight: 1.35 }}>
                                    Define el periodo pactado con el cliente (ej. 6 meses). Durante esta vigencia, todos sus pedidos aplicarán automáticamente estas tarifas congeladas.
                                </p>

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                    {[
                                        { days: 30, label: '1 Mes (30 Días)' },
                                        { days: 90, label: '3 Meses (Trimestral)' },
                                        { days: 180, label: '6 Meses (Semestral - Estándar)' },
                                        { days: 365, label: '1 Año (Anual)' }
                                    ].map(preset => (
                                        <button
                                            key={preset.days}
                                            type="button"
                                            onClick={() => handleSelectValidityPreset(preset.days)}
                                            style={{
                                                padding: '0.45rem 0.85rem',
                                                borderRadius: '7px',
                                                border: validityDaysPreset === preset.days ? '2px solid #D97706' : '1px solid #CBD5E1',
                                                backgroundColor: validityDaysPreset === preset.days ? '#FEF3C7' : 'white',
                                                color: validityDaysPreset === preset.days ? '#92400E' : '#334155',
                                                fontWeight: validityDaysPreset === preset.days ? '800' : '600',
                                                fontSize: '0.78rem',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#92400E', whiteSpace: 'nowrap' }}>
                                        Fecha límite exacta:
                                    </label>
                                    <input
                                        type="date"
                                        value={validUntilDate}
                                        onChange={e => {
                                            setValidUntilDate(e.target.value);
                                            setValidityDaysPreset(0);
                                        }}
                                        style={{ padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid #FCD34D', fontWeight: 800, fontSize: '0.82rem', backgroundColor: 'white' }}
                                    />
                                </div>
                            </div>

                            {/* BOTONES DE ACCIÓN */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowFormalizeModal(false)}
                                    style={{
                                        padding: '0.65rem 1.25rem',
                                        backgroundColor: '#F1F5F9',
                                        color: '#475569',
                                        border: '1px solid #CBD5E1',
                                        borderRadius: '8px',
                                        fontWeight: 700,
                                        fontSize: '0.82rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={submitFormalizeAgreement}
                                    disabled={processing}
                                    style={{
                                        padding: '0.65rem 1.5rem',
                                        backgroundColor: '#0D7A57',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontWeight: 800,
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)'
                                    }}
                                >
                                    <Check size={16} strokeWidth={2.5} />
                                    {processing 
                                        ? 'Creando Cliente y Activando Acuerdo...' 
                                        : clientSelectionMode === 'formalize_new' 
                                            ? `Crear Cliente Institucional y Cargar Acuerdo (${validityDaysPreset === 180 ? '6 Meses' : (validityDaysPreset > 0 ? `${validityDaysPreset} Días` : 'Vigencia Pactada')})`
                                            : 'Cargar Acuerdo Comercial al Cliente'
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL SECUNDARIO: CREAR PEDIDO SPOT PUNTUAL                               */}
            {/* ========================================================================= */}
            {showSpotOrderModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
                    <div style={{ backgroundColor: 'white', padding: '1.75rem', borderRadius: '16px', maxWidth: '480px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                            <div style={{ backgroundColor: '#F1F5F9', width: '38px', height: '38px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ShoppingBag size={20} color="#0F172A" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>Crear Pedido Spot</h3>
                                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B' }}>Emisión de orden puntual para entrega inmediata.</p>
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                Fecha de Entrega Deseada:
                            </label>
                            <input
                                type="date"
                                value={spotDeliveryDate}
                                onChange={e => setSpotDeliveryDate(e.target.value)}
                                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 700 }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                                onClick={() => setShowSpotOrderModal(false)}
                                style={{ padding: '0.6rem 1rem', backgroundColor: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={submitSpotOrder}
                                disabled={processing}
                                style={{ padding: '0.6rem 1.25rem', backgroundColor: '#0F172A', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Rocket size={14} />
                                {processing ? 'Creando...' : 'Confirmar Pedido Spot'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
