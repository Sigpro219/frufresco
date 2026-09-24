'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId, formatStructuredSpecification, cleanPhysicalInstruction } from '@/lib/orderUtils';
import { Printer, ShieldAlert, ArrowLeft, Download, Truck } from 'lucide-react';
import Letterhead from '@/components/Letterhead';
import { formatSpaceLabel } from '@/lib/stagingSpaceAllocator';
import { printViaNewWindow, PrintDocumentSwitcher, getBogotaDate } from '@/components/print';
import { formatTimeWindow } from '@/lib/logistics-parser';

interface OrderItem {
    id: string;
    quantity: number;
    unit?: string;
    unit_price?: number;
    nickname?: string;
    variant_label?: string;
    selected_options?: Record<string, any> | null;
    products?: {
        id?: string;
        name: string;
        sku?: string;
        unit_of_measure?: string;
        weight_kg?: number;
    };
}

interface OrderData {
    id: string;
    sequence_id?: number;
    warehouse_spaces?: number[];
    created_at: string;
    delivery_date: string;
    delivery_slot?: string;
    total: number;
    subtotal?: number;
    tax?: number;
    total_weight_kg?: number;
    crates_count?: number;
    is_manual_delivery?: boolean;
    manual_delivery_time?: string;
    manual_delivery_margin?: number;
    manual_delivery_note?: string;
    logistics_data?: any;
    latitude?: number;
    longitude?: number;
    shipping_address?: string;
    customer_name?: string;
    customer_phone?: string;
    admin_notes?: string;
    special_notes?: string;
    profiles?: {
        id?: string;
        company_name?: string;
        contact_name?: string;
        contact_phone?: string;
        phone?: string;
        address?: string;
        city?: string;
        municipality?: string;
        latitude?: number;
        longitude?: number;
        delivery_restrictions?: string | any[];
        logistics_data?: any;
        nit?: string;
        role?: string;
    };
    order_items: OrderItem[];
}

/**
 * Extrae y normaliza ÚNICAMENTE la sucursal o sede operativa,
 * descartando duplicados como "AMA TU MASCOTA SAS - AMA TU MASCOTA" o la razón social de la casa matriz.
 */
function extractBranchOnly(order: OrderData): string {
    const profile = order.profiles || {};
    const company = (profile.company_name || '').trim();
    const contact = (profile.contact_name || '').trim();
    const customer = (order.customer_name || '').trim();
    const raw = company || contact || customer || 'CLIENTE';

    // 1. Colsubsidio
    if (raw.toUpperCase().includes('COLSUBSIDIO')) {
        const parts = raw.split(/[-–—]/).map(p => p.trim()).filter(Boolean);
        if (parts.length > 1) {
            const branch = parts.slice(1).join(' - ');
            const clean = branch.replace(/^RESTAURANTE\s+/i, '').replace(/^VIP\s*-\s*/i, '').trim();
            return `COLSUBSIDIO - ${clean.toUpperCase()}`;
        }
        if (contact && !contact.toUpperCase().includes('COLSUBSIDIO')) {
            return `COLSUBSIDIO - ${contact.toUpperCase()}`;
        }
        return 'COLSUBSIDIO';
    }

    // 2. Puerto Peñalisa
    if (raw.toUpperCase().includes('PENALISA') || raw.toUpperCase().includes('PEÑALISA')) {
        if (raw.toUpperCase().includes('FUNDACION') || raw.toUpperCase().includes('FUNDACIÓN')) return 'PUERTO PEÑALISA (FUNDACIÓN)';
        if (raw.toUpperCase().includes('MONJE')) return 'PUERTO PEÑALISA (MONJE)';
        if (raw.toUpperCase().includes('SEDE')) return 'PUERTO PEÑALISA (SEDE)';
        return 'PUERTO PEÑALISA';
    }

    // 3. Estructuras con guión (ej: "AMATU - AMA TU MASCOTA SAS - AMA TU MASCOTA" o "LAO KAO S.A. - WOK FAMILIA")
    const parts = raw.split(/[-–—]/).map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
        const last = parts[parts.length - 1];
        const cleanLast = last.replace(/\s+(?:S\.?A\.?S\.?|S\.?A\.?|LTDA\.?)\s*$/i, '').trim();
        const cleanPrev = parts.slice(0, -1).map(p => p.replace(/\s+(?:S\.?A\.?S\.?|S\.?A\.?|LTDA\.?)\s*$/i, '').trim());

        // Si la última parte es un duplicado o subcadena de las partes previas
        if (cleanPrev.some(p => p.toUpperCase().includes(cleanLast.toUpperCase()) || cleanLast.toUpperCase().includes(p.toUpperCase()))) {
            return cleanLast.toUpperCase();
        }

        // Si la última parte es la sucursal específica (ej. WOK FAMILIA)
        return last.toUpperCase().replace(/\s+(?:S\.?A\.?S\.?|S\.?A\.?|LTDA\.?)\s*$/i, '');
    }

    return raw.toUpperCase().replace(/\s+(?:S\.?A\.?S\.?|S\.?A\.?|LTDA\.?)\s*$/i, '');
}

/**
 * Limpia la dirección eliminando colas redundantes como ", Bogotá, Cundinamarca"
 * o repeticiones múltiples concatenadas ("Bogotá, Cundinamarca, Bogotá, Cundinamarca")
 */
function cleanAddress(rawAddress?: string): string {
    if (!rawAddress) return 'Dirección no registrada';
    let addr = rawAddress.trim();
    // 1. Eliminar repeticiones consecutivas o colas de Bogotá / Cundinamarca / Colombia
    addr = addr.replace(/(?:,\s*(?:Bogot[aá](?:\s*D\.?C\.?)?|Cundinamarca|Colombia))+\s*$/gi, '');
    addr = addr.replace(/(?:,\s*(?:Bogot[aá](?:\s*D\.?C\.?)?|Cundinamarca|Colombia)){2,}/gi, '');
    // 2. Limpiar coma final huérfana
    addr = addr.replace(/,\s*$/, '').trim();
    return addr || rawAddress;
}

/**
 * Sanitiza números telefónicos descartando valores nulos o "No detectado"
 */
function cleanPhoneNumber(rawPhone?: string | null): string {
    if (!rawPhone) return '';
    const clean = String(rawPhone).trim();
    if (!clean || ['null', 'undefined', 'n/a', 'na', 'no detectado', '0', 'none'].includes(clean.toLowerCase())) {
        return '';
    }
    return clean;
}

const NEIGHBORHOOD_TO_LOCALITY: Record<string, string> = {
    // Usaquén
    'cedritos': 'Usaquén', 'santa bárbara': 'Usaquén', 'santa barbara': 'Usaquén', 'unillanos': 'Usaquén',
    'san patricio': 'Usaquén', 'country': 'Usaquén', 'santa ana': 'Usaquén', 'pepe sierra': 'Usaquén',
    'toberín': 'Usaquén', 'toberin': 'Usaquén', 'la carolina': 'Usaquén', 'unicentro': 'Usaquén',
    // Chapinero
    'chicó': 'Chapinero', 'chico': 'Chapinero', 'rosales': 'Chapinero', 'zona g': 'Chapinero',
    'lourdes': 'Chapinero', 'antiguo country': 'Chapinero', 'el retiro': 'Chapinero', 'nogal': 'Chapinero',
    'porciúncula': 'Chapinero', 'quinta camacho': 'Chapinero',
    // Suba
    'pontevedra': 'Suba', 'floresta': 'Suba', 'niza': 'Suba', 'colina': 'Suba', 'alhambra': 'Suba',
    'paso ancho': 'Suba', 'san josé de bavaria': 'Suba', 'prado veraniego': 'Suba', 'mazurén': 'Suba',
    'gratamira': 'Suba',
    // Teusaquillo
    'salitre': 'Teusaquillo', 'galerías': 'Teusaquillo', 'galerias': 'Teusaquillo', 'palermo': 'Teusaquillo',
    'la soledad': 'Teusaquillo', 'santa sofía': 'Teusaquillo',
    // Kennedy
    'castilla': 'Kennedy', 'tintal': 'Kennedy', 'américas': 'Kennedy', 'americas': 'Kennedy', 'corabastos': 'Kennedy',
    'plaza de las américas': 'Kennedy', 'banderas': 'Kennedy', 'timiza': 'Kennedy',
    // Engativá
    'álamos': 'Engativá', 'alamos': 'Engativá', 'normandía': 'Engativá', 'normandia': 'Engativá',
    'villas de granada': 'Engativá', 'minuto de dios': 'Engativá', 'quirigua': 'Engativá',
    // Fontibón
    'modelia': 'Fontibón', 'hayuelos': 'Fontibón', 'zona franca': 'Fontibón', 'capellanía': 'Fontibón',
    // Puente Aranda
    'centenario': 'Puente Aranda', 'industrial': 'Puente Aranda', 'ciudad montes': 'Puente Aranda',
    // Barrios Unidos
    'polo': 'Barrios Unidos', 'alcázares': 'Barrios Unidos', 'alcazares': 'Barrios Unidos', 'rio negro': 'Barrios Unidos'
};

/**
 * Cruza coordenadas GPS o dirección con la localidad de Bogotá (Suba, Kennedy, Usaquén, etc.)
 */
function resolveLocalityAndCity(order: OrderData): { locality: string; municipality: string; fullLocationText: string } {
    const lat = Number(order.latitude || order.profiles?.latitude);
    const lng = Number(order.longitude || order.profiles?.longitude);
    const profile = order.profiles;
    const addr = ((order.shipping_address || profile?.address || '') + ' ' + (profile?.city || '')).toLowerCase();

    let loc = '';

    // 1. Geolocalización por Coordenadas GPS de la Sucursal
    if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        if (lat > 4.83) loc = 'Chía / Cota';
        else if (lng < -74.19 && lat > 4.68) loc = 'Funza / Mosquera';
        else if (lng < -74.18 && lat < 4.62) loc = 'Soacha';
        else if (lat >= 4.695) loc = lng > -74.055 ? 'Usaquén' : 'Suba';
        else if (lat >= 4.635 && lat < 4.695 && lng > -74.065) loc = 'Chapinero';
        else if (lat >= 4.65 && lat < 4.695) {
            if (lng > -74.09) loc = 'Barrios Unidos';
            else if (lng > -74.13) loc = 'Engativá';
            else loc = 'Fontibón';
        } else if (lat >= 4.615 && lat < 4.65) {
            if (lng > -74.09) loc = 'Teusaquillo';
            else if (lng > -74.13) loc = 'Puente Aranda';
            else loc = 'Fontibón';
        } else if (lat >= 4.585 && lat < 4.615) {
            if (lng > -74.08) loc = 'Santa Fe / La Candelaria';
            else if (lng > -74.11) loc = 'Los Mártires';
            else if (lng > -74.14) loc = 'Puente Aranda';
            else loc = 'Kennedy';
        } else if (lat >= 4.55 && lat < 4.585) {
            if (lng > -74.10) loc = 'Antonio Nariño / San Cristóbal';
            else if (lng > -74.15) loc = 'Tunjuelito / Rafael Uribe';
            else loc = 'Bosa';
        } else if (lat < 4.55) {
            loc = lng > -74.12 ? 'Usme' : 'Ciudad Bolívar';
        }
    }

    // 2. Fallback por barrios y palabras clave
    if (!loc) {
        for (const [neigh, l] of Object.entries(NEIGHBORHOOD_TO_LOCALITY)) {
            if (addr.includes(neigh)) {
                loc = l;
                break;
            }
        }
    }

    if (!loc) {
        const knownLocalities = [
            'usaquén', 'usaquen', 'chapinero', 'santa fe', 'san cristóbal', 'san cristobal',
            'usme', 'tunjuelito', 'bosa', 'kennedy', 'fontibón', 'fontibon', 'engativá', 'engativa',
            'suba', 'barrios unidos', 'teusaquillo', 'los mártires', 'los martires',
            'antonio nariño', 'antonio narino', 'puente aranda', 'la candelaria',
            'rafael uribe', 'ciudad bolívar', 'ciudad bolivar'
        ];
        for (const kl of knownLocalities) {
            if (addr.includes(kl)) {
                loc = kl.charAt(0).toUpperCase() + kl.slice(1);
                break;
            }
        }
    }

    // Detectar municipio
    let mun = (profile?.municipality || profile?.city || 'Bogotá').trim();
    if (mun.toUpperCase().includes('BOGOTA') || mun.toUpperCase().includes('BOGOTÁ')) {
        mun = 'Bogotá D.C.';
    }

    if (!loc) {
        loc = mun !== 'Bogotá D.C.' ? mun : 'Bogotá D.C.';
    }

    const fullLocationText = loc.toUpperCase() !== mun.toUpperCase() && mun === 'Bogotá D.C.'
        ? `Loc. ${loc}`
        : loc;

    return { locality: loc, municipality: mun, fullLocationText };
}

/**
 * Resuelve el peso real o calculado y las canastillas estimadas por pedido
 */
function getOrderWeightAndCrates(order: OrderData): { weightKg: number; crates: number } {
    let weight = Number(order.total_weight_kg) || 0;
    if (weight <= 0 && order.order_items && order.order_items.length > 0) {
        weight = order.order_items.reduce((acc, item) => {
            const q = Number(item.quantity) || 0;
            const pw = Number(item.products?.weight_kg) || 1;
            return acc + (q * pw);
        }, 0);
    }
    const safeWeight = Math.round(weight * 10) / 10;
    // FruFresco estándar: 12.5 kg por canastilla redondeado al alza
    const crates = Math.max(1, Math.ceil(safeWeight / 12.5));
    return { weightKg: safeWeight, crates };
}

interface DeliverySlotResult {
    isExceptional: boolean;
    slot: string;
    windows?: string[];
    subtext?: string;
    note?: string;
}

/**
 * Discrimina entre el horario fijo de la sucursal (por defecto)
 * y el horario excepcional autorizado (override manual prioritario).
 * Resume las franjas horarias al rango de horas operativo, omitiendo
 * días redundantes y subtextos repetitivos para máxima claridad física en ruta.
 */
function resolveDeliverySlotInfo(order: OrderData): DeliverySlotResult {
    // 1. Caso Excepcional: Override manual activo
    const isExcep = Boolean(order.is_manual_delivery || order.manual_delivery_time);
    if (isExcep) {
        const time = order.manual_delivery_time || '08:00';
        const margin = order.manual_delivery_margin ? ` (±${order.manual_delivery_margin}m)` : '';
        return {
            isExceptional: true,
            slot: `${time}${margin}`,
            note: order.manual_delivery_note || undefined
        };
    }

    // 2. Horario de la Sucursal en logistics_data (extraer ventanas horarias directas)
    const logData = order.profiles?.logistics_data || order.logistics_data;
    if (logData && typeof logData === 'object') {
        if (Array.isArray(logData.windows) && logData.windows.length > 0) {
            const validWindows = logData.windows
                .filter((w: any) => w && w.startTime && w.endTime)
                .map((w: any) => `${w.startTime} - ${w.endTime}`);
            if (validWindows.length > 0) {
                return {
                    isExceptional: false,
                    slot: validWindows.join(' / '),
                    windows: validWindows
                };
            }
        }
        if (logData.start_time && logData.end_time) {
            return {
                isExceptional: false,
                slot: `${logData.start_time} - ${logData.end_time}`,
                windows: [`${logData.start_time} - ${logData.end_time}`]
            };
        }
    }

    // 3. Fallback en delivery_restrictions de profiles
    const restrictions = order.profiles?.delivery_restrictions;
    if (typeof restrictions === 'string' && restrictions.trim().length > 0) {
        const match = restrictions.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.\s*m\.|p\.\s*m\.)?\s*(?:-|a|hasta)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.\s*m\.|p\.\s*m\.)?)/i);
        if (match) {
            return {
                isExceptional: false,
                slot: match[1].trim(),
                windows: [match[1].trim()]
            };
        }
        if (restrictions.length < 35 && !restrictions.toLowerCase().includes('ningun')) {
            return {
                isExceptional: false,
                slot: restrictions.trim(),
                windows: [restrictions.trim()]
            };
        }
    }

    // 4. Franja por defecto estándar de FruFresco para sucursales
    return {
        isExceptional: false,
        slot: '06:30 - 11:00',
        windows: ['06:30 - 11:00']
    };
}

export default function ContingencyPrintPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const rawOrderIds = searchParams.get('orderIds') || searchParams.get('ids') || '';
    const paramDate = searchParams.get('date');
    const mode = searchParams.get('mode') || 'all'; // 'all' | 'picking' | 'remissions' | 'dispatch' | 'purchases'

    const [selectedDate, setSelectedDate] = useState<string>(() => paramDate || getBogotaDate(0));

    const [orders, setOrders] = useState<OrderData[]>([]);
    const [loading, setLoading] = useState(true);
    const printDocRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchOrdersData = async () => {
            setLoading(true);
            try {
                let query = supabase
                    .from('orders')
                    .select(`
                        id, sequence_id, created_at, delivery_date, delivery_slot, total, subtotal, tax,
                        total_weight_kg, crates_count, is_manual_delivery, manual_delivery_time, manual_delivery_margin, manual_delivery_note, logistics_data,
                        latitude, longitude, shipping_address, admin_notes, special_notes, warehouse_spaces,
                        profiles:profiles(id, company_name, contact_name, contact_phone, phone, address, city, municipality, latitude, longitude, delivery_restrictions, logistics_data, nit, role),
                        order_items(id, quantity, unit, unit_price, nickname, variant_label, selected_options, products(id, name, sku, unit_of_measure, weight_kg, accounting_id, category, purchase_sublist, inventory_group))
                    `);

                if (rawOrderIds) {
                    const ids = rawOrderIds.split(',').map(id => id.trim()).filter(Boolean);
                    if (ids.length === 0) {
                        setLoading(false);
                        return;
                    }
                    query = query.in('id', ids);
                } else if (selectedDate) {
                    const OPERATIONAL_STATUSES = ['para_compra', 'approved', 'picking', 'shipped', 'delivered', 'completed'];
                    query = query.eq('delivery_date', selectedDate).in('status', OPERATIONAL_STATUSES);
                } else {
                    setLoading(false);
                    return;
                }

                const { data, error } = await query.order('created_at', { ascending: true });

                if (error) {
                    console.error('Error cargando pedidos para contingencia:', error);
                } else {
                    setOrders((data as any) || []);
                }
            } catch (err) {
                console.error('Excepción cargando datos de contingencia:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchOrdersData();
    }, [rawOrderIds, selectedDate]);

    // Consolidado de compras Corabastos
    const consolidatedPurchases = useMemo(() => {
        const map = new Map<string, { name: string; sku: string; unit: string; totalQty: number; ordersCount: number }>();
        orders.forEach(order => {
            (order.order_items || []).forEach(item => {
                const prodName = item.products?.name || item.nickname || 'Producto Sin Nombre';
                const sku = item.products?.sku || 'N/A';
                const unit = item.unit || item.products?.unit_of_measure || 'Kg';
                const qty = Number(item.quantity || 0);

                const key = `${prodName}_${unit}`.toLowerCase();
                if (!map.has(key)) {
                    map.set(key, { name: prodName, sku, unit, totalQty: 0, ordersCount: 0 });
                }
                const record = map.get(key)!;
                record.totalQty += qty;
                record.ordersCount += 1;
            });
        });
        return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
    }, [orders]);

    const formatMoney = (amount: number) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount || 0);
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0F172A', marginBottom: '8px' }}>
                    Generando Kit de Contingencia de Piso...
                </div>
                <div style={{ color: '#64748B', fontSize: '0.9rem' }}>
                    Compilando planillas de báscula, remisiones y manifiestos de despacho.
                </div>
            </div>
        );
    }

    const showAll = mode === 'all';
    const showPurchases = showAll || mode === 'purchases';
    const showPicking = showAll || mode === 'picking';
    const showRemissions = showAll || mode === 'remissions';
    const showDispatch = showAll || mode === 'dispatch';

    return (
        <div style={{ backgroundColor: '#F8FAFC', minHeight: '100vh', padding: '20px 0', color: '#000', fontFamily: 'Arial, Helvetica, sans-serif' }}>
            {/* CSS Print Rules */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; padding: 0 !important; margin: 0 !important; color: black !important; }
                    .page-break { page-break-after: always; break-after: page; }
                    .avoid-break { page-break-inside: avoid; break-inside: avoid; }
                    .print-sheet {
                        box-shadow: none !important;
                        border: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                    }
                }
                @page {
                    size: ${mode === 'dispatch' ? 'legal portrait' : 'letter portrait'};
                    margin: ${mode === 'dispatch' ? '8mm 10mm' : '8mm'};
                }
            ` }} />

            {/* Top Control Bar (Non-printable) - 100% Sticky */}
            <div className="no-print" style={{
                position: 'sticky',
                top: 0,
                zIndex: 9999,
                backgroundColor: '#FFFFFF',
                borderBottom: '1px solid #CBD5E1',
                padding: '0.35rem 1rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        onClick={() => router.back()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.74rem',
                            fontWeight: '700',
                            color: '#334155'
                        }}
                    >
                        <ArrowLeft size={13} /> Volver
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <h1 style={{ margin: 0, fontSize: '0.88rem', fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                            {mode === 'dispatch' ? (
                                <>
                                    <Truck size={16} color="#0D7A57" />
                                    Manifiesto de Ruta & Canastillas
                                </>
                            ) : (
                                <>
                                    <ShieldAlert size={16} color="#0D7A57" />
                                    Kit de Contingencia
                                </>
                            )}
                        </h1>
                        <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#0D7A57', backgroundColor: '#ECFDF5', padding: '1px 6px', borderRadius: '12px', border: '1px solid #A7F3D0', whiteSpace: 'nowrap' }}>
                            {orders.length} {mode === 'dispatch' ? 'paradas' : 'ped.'}
                        </span>
                        <span style={{ fontSize: '0.68rem', fontWeight: '700', color: mode === 'dispatch' ? '#065F46' : '#92400E', backgroundColor: mode === 'dispatch' ? '#ECFDF5' : '#FEF3C7', padding: '1px 6px', borderRadius: '12px', border: mode === 'dispatch' ? '1px solid #A7F3D0' : '1px solid #FCD34D', whiteSpace: 'nowrap' }}>
                            {mode === 'dispatch' ? 'Despacho y Ruta' : 'Emergencia'}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {/* Selector de Documento Imprimible & Fecha con Persistencia */}
                    <PrintDocumentSwitcher
                        currentDoc={mode === 'dispatch' ? 'manifest' : 'contingency'}
                        selectedDate={selectedDate}
                        onDateChange={(newDate) => {
                            setSelectedDate(newDate);
                            const params = new URLSearchParams();
                            params.set('date', newDate);
                            if (mode && mode !== 'all') params.set('mode', mode);
                            if (rawOrderIds) params.set('orderIds', rawOrderIds);
                            router.replace(`/admin/orders/contingency-print?${params.toString()}`);
                        }}
                        orderIds={rawOrderIds || undefined}
                    />



                    {/* Botón Descargar PDF */}
                    <button
                        onClick={() => {
                            const docName = mode === 'purchases' 
                                ? `Planilla_Compras_${orders[0]?.delivery_date || selectedDate}`
                                : mode === 'picking'
                                ? `Recibo_A_Ciegas_${orders[0]?.delivery_date || selectedDate}`
                                : mode === 'remissions'
                                ? `Remisiones_Duplicadas_${orders[0]?.delivery_date || selectedDate}`
                                : mode === 'dispatch'
                                ? `Manifiesto_Flota_${orders[0]?.delivery_date || selectedDate}`
                                : `Kit_Contingencia_${orders[0]?.delivery_date || selectedDate}`;

                            printViaNewWindow({
                                element: printDocRef.current,
                                title: docName,
                                paperSize: mode === 'dispatch' ? 'oficio' : 'letter',
                                orientation: 'portrait'
                            });
                        }}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 10px',
                            backgroundColor: '#FFFFFF',
                            color: '#0369A1',
                            border: '1px solid #0284C7',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.76rem',
                            fontWeight: '800',
                            boxShadow: '0 1px 3px rgba(2, 132, 199, 0.1)',
                            whiteSpace: 'nowrap'
                        }}
                        title="Abre la vista limpia oficial para guardar como archivo PDF"
                    >
                        <Download size={14} /> PDF
                    </button>

                    {/* Botón Imprimir Físico */}
                    <button
                        onClick={() => {
                            printViaNewWindow({
                                element: printDocRef.current,
                                title: mode === 'dispatch' 
                                    ? `Manifiesto de Ruta - ${orders.length} Paradas`
                                    : `Kit de Contingencia - ${orders.length} Pedidos (${mode.toUpperCase()})`,
                                paperSize: mode === 'dispatch' ? 'oficio' : 'letter',
                                orientation: 'portrait'
                            });
                        }}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 12px',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.76rem',
                            fontWeight: '800',
                            boxShadow: '0 1px 4px rgba(13, 122, 87, 0.25)',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <Printer size={14} /> Imprimir Kit ({orders.length} Ped.)
                    </button>
                </div>
            </div>

            {/* Printable Container (Attached ref for clean new-window printing) */}
            <div ref={printDocRef} style={{ maxWidth: '850px', margin: '0.75rem auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {orders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3.5rem 2rem', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #CBD5E1', maxWidth: '650px', margin: '2rem auto', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        <ShieldAlert size={44} color="#64748B" style={{ margin: '0 auto 1rem' }} />
                        <h3 style={{ margin: '0 0 0.5rem', fontWeight: '800', fontSize: '1.1rem', color: '#0F172A' }}>No hay pedidos para el Kit de Contingencia en esta fecha</h3>
                        <p style={{ margin: 0, color: '#64748B', fontSize: '0.85rem' }}>Selecciona otra fecha con pedidos operacionales o utiliza el selector de fecha superior.</p>
                    </div>
                ) : (
                    <>
                        {/* ========================================================= */}
                        {/* 1. PLANILLA DE COMPRAS CORABASTOS (FÍSICA DE PISO)        */}
                        {/* ========================================================= */}
                        {showPurchases && (
                    <Letterhead
                        title="Planilla Maestra de Compras (Corabastos)"
                        subtitle="INVESTMENTS CORTES S.A.S. · Central de Abastos Corabastos · Operación de Contingencia"
                        date={orders[0]?.delivery_date || new Date().toISOString().split('T')[0]}
                        reference={`SKUs: ${consolidatedPurchases.length}`}
                        badge="COMPRAS CORABASTOS"
                        badgeVariant="dark"
                        className="page-break"
                        showWatermark={false}
                    >
                        <div style={{ backgroundColor: '#F8FAFC', padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', fontSize: '0.64rem', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                            <span><strong>Instrucciones para Plaza:</strong> Registre el precio pactado por kilo/bulto y el puesto o bodega en Corabastos.</span>
                            <span><strong>Pedidos amparados:</strong> {orders.length}</span>
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: '4%', textAlign: 'center' }}>#</th>
                                    <th style={{ width: '40%' }}>Producto / Descripción</th>
                                    <th style={{ width: '7%', textAlign: 'center' }}>Und</th>
                                    <th style={{ width: '12%', textAlign: 'right' }}>Demanda Neta</th>
                                    <th style={{ width: '13%', textAlign: 'right' }}>+Merma (5%)</th>
                                    <th style={{ width: '12%', textAlign: 'center' }}>Precio $/Kg</th>
                                    <th style={{ width: '12%', textAlign: 'center' }}>Comprado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {consolidatedPurchases.map((p, idx) => {
                                    const withMerma = (p.totalQty * 1.05).toFixed(1);
                                    return (
                                        <tr key={idx}>
                                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                                            <td>
                                                <strong>{p.name}</strong> {p.sku !== 'N/A' && <span style={{ fontSize: '0.60rem', color: '#64748B' }}>({p.sku})</span>}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>{p.unit}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                {p.totalQty.toLocaleString('es-CO')}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: '900', color: '#0F172A' }}>
                                                {withMerma}
                                            </td>
                                            <td style={{ textAlign: 'center', borderBottom: '1px dashed #CBD5E1' }}>$ ________</td>
                                            <td style={{ textAlign: 'center', borderBottom: '1px dashed #CBD5E1' }}>________</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', paddingTop: '8px', borderTop: '1px solid #E2E8F0' }}>
                            <div>Firma Comprador en Corabastos: ___________________________</div>
                            <div>Firma Recibido en Bodega Central: ___________________________</div>
                        </div>
                    </Letterhead>
                )}


                {/* ========================================================= */}
                {/* 2. HOJAS DE PICKING DE BODEGA Y PESAJE EN BÁSCULA         */}
                {/* ========================================================= */}
                {showPicking && orders.map((order, orderIdx) => {
                    const clientName = order.profiles?.company_name || order.profiles?.contact_name || order.customer_name || 'Cliente';
                    const orderNum = getFriendlyOrderId(order);
                    const espacioNum = (order.warehouse_spaces && order.warehouse_spaces.length > 0)
                        ? formatSpaceLabel(order.warehouse_spaces)
                        : (order.sequence_id ? `${order.sequence_id}` : `${orderIdx + 1}`);

                    return (
                        <Letterhead
                            key={`picking-${order.id}`}
                            title="Hoja de Picking & Pesaje en Báscula"
                            subtitle={`CLIENTE: ${clientName.toUpperCase()}`}
                            date={order.delivery_date}
                            reference={`PEDIDO #${orderNum}`}
                            espacioNum={espacioNum}
                            badge="BÁSCULA Y ALISTAMIENTO"
                            badgeVariant="amber"
                            className="page-break"
                            showWatermark={false}
                        >
                            {/* Metadata cliente compacta */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', backgroundColor: '#F8FAFC', padding: '5px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', fontSize: '0.66rem', marginBottom: '5px' }}>
                                <div>
                                    <div><strong>Dirección:</strong> {order.shipping_address || order.profiles?.address || 'Bogotá'}</div>
                                    <div><strong>Contacto:</strong> {cleanPhoneNumber(order.profiles?.contact_phone || order.profiles?.phone || order.customer_phone) || 'Sin registrar'}</div>
                                </div>
                                <div>
                                    <div><strong>Franja Horaria:</strong> {resolveDeliverySlotInfo(order).slot}</div>
                                    <div><strong>Líneas Solicitadas:</strong> {(order.order_items || []).length} ítems</div>
                                </div>
                            </div>

                            {order.admin_notes && (
                                <div style={{ backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', padding: '3px 8px', borderRadius: '4px', fontSize: '0.64rem', marginBottom: '5px', color: '#92400E' }}>
                                    <strong>Instrucciones Especiales:</strong> {order.admin_notes}
                                </div>
                            )}

                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '4%', textAlign: 'center' }}>[✓]</th>
                                        <th style={{ width: '46%' }}>Producto / Especificación</th>
                                        <th style={{ width: '12%', textAlign: 'right' }}>Cant. Pedida</th>
                                        <th style={{ width: '8%', textAlign: 'center' }}>Und</th>
                                        <th style={{ width: '15%', textAlign: 'center', backgroundColor: '#1E293B' }}>Peso Real Báscula</th>
                                        <th style={{ width: '15%', textAlign: 'center' }}>Lote / Novedad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(order.order_items || []).map((itm, itmIdx) => {
                                        const pName = itm.nickname || itm.products?.name || 'Producto';
                                        const unit = itm.unit || itm.products?.unit_of_measure || 'Kg';
                                        return (
                                            <tr key={itmIdx}>
                                                <td style={{ textAlign: 'center', fontSize: '0.75rem' }}>&#9633;</td>
                                                <td>
                                                    <strong>{pName}</strong>
                                                    {(() => {
                                                        const spec = formatStructuredSpecification({
                                                            quantity: itm.quantity,
                                                            unit: itm.unit || itm.products?.unit_of_measure,
                                                            variant_label: itm.variant_label,
                                                            nickname: itm.nickname,
                                                            selected_options: itm.selected_options
                                                        }) || cleanPhysicalInstruction(itm.variant_label);
                                                        if (!spec) return null;
                                                        return <div style={{ fontSize: '0.62rem', color: '#047857', fontWeight: 600 }}>{spec}</div>;
                                                    })()}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                    {Number(itm.quantity || 0).toLocaleString('es-CO')}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>{unit}</td>
                                                <td style={{ textAlign: 'center', borderLeft: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0', fontWeight: 'bold', backgroundColor: '#FFFFFF' }}>
                                                    ______ kg
                                                </td>
                                                <td style={{ textAlign: 'center', color: '#64748B' }}>
                                                    ________________
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            <div style={{ marginTop: 'auto', borderTop: '1px solid #E2E8F0', paddingTop: '6px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '0.64rem' }}>
                                <div>
                                    <div><strong>Alistador / Pesador:</strong></div>
                                    <div style={{ marginTop: '8px' }}>Firma: ___________________________</div>
                                </div>
                                <div>
                                    <div><strong>Auditor de Calidad:</strong></div>
                                    <div style={{ marginTop: '8px' }}>Firma: ___________________________</div>
                                </div>
                                <div>
                                    <div><strong>Total Canastillas Usadas:</strong></div>
                                    <div style={{ marginTop: '8px' }}>[ _____ ] Canastillas Plásticas</div>
                                </div>
                            </div>
                        </Letterhead>
                    );
                })}


                {/* ========================================================= */}
                {/* 3. REMISIONES DE ENTREGA FÍSICAS DE CONTINGENCIA          */}
                {/*    (Regla de Duplicado Consecutivo: Original + Copia)     */}
                {/* ========================================================= */}
                {showRemissions && orders.flatMap((order, orderIdx) => {
                    const clientName = order.profiles?.company_name || order.profiles?.contact_name || order.customer_name || 'Cliente';
                    const orderNum = getFriendlyOrderId(order);
                    const subtotal = order.subtotal || order.total || 0;
                    const isHogar = order.profiles?.role === 'hogar' || order.profiles?.role === 'b2c';
                    const isReposicion = (order.admin_notes || '').toLowerCase().includes('reposici') || (order.special_notes || '').toLowerCase().includes('reposici');
                    const remissionPrefix = isReposicion ? 'REPOSICIÓN' : (isHogar ? 'REMISION H' : 'REMISION I');
                    const espacioNum = (order.warehouse_spaces && order.warehouse_spaces.length > 0)
                        ? formatSpaceLabel(order.warehouse_spaces)
                        : (order.sequence_id ? `${order.sequence_id}` : `${orderIdx + 1}`);
                    const itemsCount = (order.order_items || []).length;

                    // Cada pedido genera 2 hojas consecutivas: Original y Copia
                    return [
                        { copyType: 'ORIGINAL - CLIENTE', isCopy: false },
                        { copyType: 'COPIA - TRANSPORTADOR / CONTABILIDAD', isCopy: true }
                    ].map((copyInfo, copyIdx) => (
                        <Letterhead
                            key={`remission-${order.id}-copy-${copyIdx}`}
                            title={`${remissionPrefix} #${orderNum}`}
                            subtitle={`CLIENTE: ${clientName.toUpperCase()}`}
                            date={order.delivery_date}
                            reference={`ORDEN: ${orderNum}`}
                            badge={copyInfo.copyType}
                            badgeVariant={copyInfo.isCopy ? 'light' : 'dark'}
                            espacioNum={espacioNum}
                            className="page-break"
                            showWatermark={false}
                        >
                            {/* Poka-Yoke Banner Reposición si aplica */}
                            {isReposicion && (
                                <div style={{ backgroundColor: '#FEF2F2', border: '1.2px solid #EF4444', padding: '4px 8px', borderRadius: '4px', marginBottom: '5px', fontSize: '0.64rem', color: '#991B1B', fontWeight: 'bold' }}>
                                    RECUERDE: Los productos en este documento NO TIENEN COBRO (Reposición de Calidad autorizada por Servicio al Cliente).
                                </div>
                            )}

                            {/* Client & Route Micro-Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '8px', backgroundColor: '#F8FAFC', padding: '5px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', fontSize: '0.66rem', marginBottom: '5px' }}>
                                <div>
                                    <div><strong>CLIENTE:</strong> {clientName}</div>
                                    <div><strong>NIT / C.C.:</strong> {order.profiles?.nit || 'N/A'}</div>
                                    <div><strong>DIRECCIÓN:</strong> {order.shipping_address || order.profiles?.address || 'Bogotá'}</div>
                                    <div><strong>TELÉFONO:</strong> {cleanPhoneNumber(order.profiles?.contact_phone || order.profiles?.phone || order.customer_phone) || 'Sin registrar'}</div>
                                </div>
                                <div>
                                    <div><strong>FECHA DESPACHO:</strong> {order.delivery_date}</div>
                                    <div><strong>FRANJA HORARIA:</strong> {resolveDeliverySlotInfo(order).slot}</div>
                                    <div><strong>LÍNEAS DE PEDIDO:</strong> {itemsCount} productos solicitados</div>
                                    {order.special_notes && <div><strong>OBSERVACIÓN:</strong> {order.special_notes}</div>}
                                </div>
                            </div>

                            {/* Products Table con columna KG-UN recibe compacta */}
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '4%', textAlign: 'center' }}>P</th>
                                        <th style={{ width: '42%' }}>Descripción del Producto</th>
                                        <th style={{ width: '9%', textAlign: 'right' }}>Cant.</th>
                                        <th style={{ width: '7%', textAlign: 'center' }}>UM</th>
                                        <th style={{ width: '12%', textAlign: 'right' }}>Valor/UM</th>
                                        <th style={{ width: '12%', textAlign: 'right' }}>Total</th>
                                        <th style={{ width: '14%', textAlign: 'center', backgroundColor: '#1E293B', color: '#FFFFFF' }}>KG-UN recibe</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(order.order_items || []).map((itm, idx) => {
                                        const pName = itm.nickname || itm.products?.name || 'Producto';
                                        const unit = itm.unit || itm.products?.unit_of_measure || 'KG';
                                        const qty = Number(itm.quantity || 0);
                                        const price = isReposicion ? 0 : Number(itm.unit_price || 0);
                                        const lineTotal = qty * price;
                                        return (
                                            <tr key={idx}>
                                                <td style={{ textAlign: 'center', fontSize: '0.75rem' }}>&#9633;</td>
                                                <td>
                                                    <strong>{pName}</strong>
                                                    {(() => {
                                                        const spec = formatStructuredSpecification({
                                                            quantity: itm.quantity,
                                                            unit: itm.unit || itm.products?.unit_of_measure,
                                                            variant_label: itm.variant_label,
                                                            nickname: itm.nickname,
                                                            selected_options: itm.selected_options
                                                        }) || cleanPhysicalInstruction(itm.variant_label);
                                                        if (!spec) return null;
                                                        return <div style={{ fontSize: '0.62rem', color: '#047857', fontWeight: 600 }}>{spec}</div>;
                                                    })()}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{qty.toLocaleString('es-CO')}</td>
                                                <td style={{ textAlign: 'center' }}>{unit}</td>
                                                <td style={{ textAlign: 'right' }}>{price > 0 ? formatMoney(price) : '$0'}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{lineTotal > 0 ? formatMoney(lineTotal) : '$0'}</td>
                                                <td style={{ textAlign: 'center', borderLeft: '1px solid #CBD5E1', borderRight: '1px solid #CBD5E1', fontWeight: 'bold', backgroundColor: '#FFFFFF' }}>
                                                    __________
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* Summary & Canastillas Control Compact */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                <div style={{ width: '56%', fontSize: '0.64rem', color: '#334155' }}>
                                    <div style={{ fontWeight: 'bold', color: '#0F172A', marginBottom: '2px' }}>Control de Canastillas Plásticas:</div>
                                    <div style={{ display: 'flex', gap: '10px', border: '1px dashed #94A3B8', padding: '3px 6px', borderRadius: '4px', backgroundColor: '#F8FAFC' }}>
                                        <div>Entregadas: <strong>[ _____ ]</strong></div>
                                        <div>Recogidas: <strong>[ _____ ]</strong></div>
                                    </div>
                                    <div style={{ marginTop: '2px', fontSize: '0.56rem', color: '#64748B' }}>
                                        * Activos en comodato propiedad exclusiva de FruFresco. Retorne al conductor igual cantidad recibida.
                                    </div>
                                </div>

                                <div style={{ width: '38%', backgroundColor: '#F8FAFC', padding: '3px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', fontSize: '0.68rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px' }}>
                                        <span>Subtotal:</span>
                                        <span style={{ fontWeight: 'bold' }}>{isReposicion ? '$0' : formatMoney(subtotal)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px' }}>
                                        <span>IVA:</span>
                                        <span>{isReposicion ? '$0' : formatMoney(order.tax || 0)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #0F172A', paddingTop: '2px', fontSize: '0.82rem', fontWeight: '900' }}>
                                        <span>TOTAL:</span>
                                        <span style={{ color: '#0D7A57' }}>{isReposicion ? '$0' : formatMoney(order.total || subtotal)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Signatures Block Compact */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', border: '1px solid #0F172A', padding: '5px 8px', borderRadius: '4px', fontSize: '0.62rem', marginTop: 'auto' }}>
                                <div>
                                    <div style={{ fontWeight: '900', marginBottom: '2px' }}>FIRMA Y CÉDULA DE QUIEN RECIBE A CONFORMIDAD:</div>
                                    <div style={{ marginTop: '12px', borderBottom: '1px solid #0F172A', width: '85%' }}></div>
                                    <div style={{ marginTop: '2px' }}>Nombre Legible: ____________________________________</div>
                                    <div style={{ marginTop: '2px' }}>C.C. / Cargo: _______________________________________</div>
                                </div>
                                <div>
                                    <div style={{ fontWeight: '900', marginBottom: '2px' }}>SELLO / NOVEDADES EN SITIO:</div>
                                    <div style={{ height: '32px', border: '1px dashed #CBD5E1', borderRadius: '3px', padding: '2px', color: '#94A3B8', fontSize: '0.56rem' }}>
                                        Sello húmedo del establecimiento o relación de devoluciones/faltantes firmados.
                                    </div>
                                </div>
                            </div>
                        </Letterhead>
                    ));
                })}


                {/* ========================================================= */}
                {/* 4. MANIFIESTO DE RUTA & CONTROL DE CANASTILLAS            */}
                {/* ========================================================= */}
                {showDispatch && (() => {
                    const CHUNK_SIZE = 18;
                    const manifestPages: OrderData[][] = [];
                    for (let i = 0; i < orders.length; i += CHUNK_SIZE) {
                        manifestPages.push(orders.slice(i, i + CHUNK_SIZE));
                    }
                    if (manifestPages.length === 0) manifestPages.push([]);

                    return manifestPages.map((pageOrders, pageIdx) => {
                        const isLastPage = pageIdx === manifestPages.length - 1;
                        return (
                            <Letterhead
                                key={`manifest-page-${pageIdx}`}
                                title="Manifiesto de Ruta & Control de Canastillas"
                                subtitle={`DESPACHO Y CONTROL LOGÍSTICO DE RUTA · SALIDA DE PLANTA${manifestPages.length > 1 ? ` · HOJA ${pageIdx + 1} DE ${manifestPages.length}` : ''}`}
                                date={orders[0]?.delivery_date || new Date().toISOString().split('T')[0]}
                                reference={`TOTAL PARADAS: ${orders.length}`}
                                badge="DESPACHO Y RUTA"
                                badgeVariant="emerald"
                                className="page-break"
                                paperSize="oficio"
                                showWatermark={false}
                            >
                                <table>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '3.5%', textAlign: 'center', fontSize: '8.2pt' }}>#</th>
                                            <th style={{ width: '9.5%', fontSize: '8.2pt' }}>Pedido</th>
                                            <th style={{ width: '26%', fontSize: '8.2pt' }}>Sucursal / Punto de Entrega</th>
                                            <th style={{ width: '24%', fontSize: '8.2pt' }}>Dirección, Localidad & Contacto</th>
                                            <th style={{ width: '11%', textAlign: 'center', fontSize: '8.2pt' }}>Carga / Canastillas</th>
                                            <th style={{ width: '11%', textAlign: 'center', fontSize: '8.2pt' }}>Franja Horaria</th>
                                            <th style={{ width: '15%', fontSize: '8.2pt' }}>Notas / Novedades de Ruta</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pageOrders.map((order, orderIdx) => {
                                            const globalIdx = pageIdx * CHUNK_SIZE + orderIdx + 1;
                                            const branchName = extractBranchOnly(order);
                                            const orderNum = getFriendlyOrderId(order);
                                            const { weightKg, crates } = getOrderWeightAndCrates(order);
                                            const slotInfo = resolveDeliverySlotInfo(order);
                                            const locInfo = resolveLocalityAndCity(order);

                                            const addressClean = cleanAddress(order.shipping_address || order.profiles?.address);
                                            const phone = cleanPhoneNumber(order.profiles?.contact_phone || order.profiles?.phone || order.customer_phone);

                                            return (
                                                <tr key={order.id || orderIdx}>
                                                    <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '7.8pt' }}>{globalIdx}</td>
                                                    <td style={{ fontWeight: '800', whiteSpace: 'nowrap', fontSize: '7.8pt' }}>
                                                        #{orderNum}
                                                        {order.warehouse_spaces && order.warehouse_spaces.length > 0 && (
                                                            <div style={{ fontSize: '6.8pt', color: '#0369A1', fontWeight: '700' }}>
                                                                Bahía {formatSpaceLabel(order.warehouse_spaces)}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <strong style={{ fontSize: '8.2pt', color: '#0F172A', display: 'block', lineHeight: 1.2 }}>
                                                            {branchName}
                                                        </strong>
                                                    </td>
                                                    <td style={{ wordBreak: 'break-word', overflowWrap: 'break-word', paddingRight: '8px' }}>
                                                        <div style={{ fontWeight: '700', color: '#0F172A', fontSize: '7.8pt', lineHeight: 1.2, wordBreak: 'break-word' }}>
                                                            {addressClean}
                                                        </div>
                                                        <div style={{ fontSize: '7pt', color: '#475569', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                            <span style={{
                                                                backgroundColor: '#F1F5F9',
                                                                color: '#0F172A',
                                                                padding: '1px 4px',
                                                                borderRadius: '3px',
                                                                fontWeight: '700',
                                                                border: '1px solid #CBD5E1',
                                                                fontSize: '6.8pt'
                                                            }}>
                                                                {locInfo.fullLocationText}
                                                            </span>
                                                            {locInfo.municipality && locInfo.municipality !== 'Bogotá D.C.' && (
                                                                <span style={{ color: '#475569', fontWeight: '600' }}>• {locInfo.municipality}</span>
                                                            )}
                                                            {phone ? (
                                                                <span style={{ color: '#0369A1', fontWeight: '700' }}>Tel: {phone}</span>
                                                            ) : (
                                                                <span style={{ color: '#94A3B8', fontStyle: 'italic', fontSize: '6.5pt' }}>Tel: Sin registrar</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap', paddingLeft: '4px' }}>
                                                        <div style={{
                                                            display: 'inline-block',
                                                            backgroundColor: '#ECFDF5',
                                                            border: '1px solid #A7F3D0',
                                                            borderRadius: '4px',
                                                            padding: '2px 5px',
                                                            fontWeight: '800',
                                                            color: '#065F46',
                                                            fontSize: '7.8pt',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {crates} {crates === 1 ? 'Canastilla' : 'Canastillas'}
                                                        </div>
                                                        <div style={{ fontSize: '7pt', color: '#475569', fontWeight: '700', marginTop: '1px', whiteSpace: 'nowrap' }}>
                                                            {weightKg.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
                                                        </div>
                                                    </td>
                                                    <td style={{ textAlign: 'center', backgroundColor: slotInfo.isExceptional ? '#FFFBEB' : 'transparent', verticalAlign: 'middle', padding: '3px 4px' }}>
                                                        {slotInfo.isExceptional ? (
                                                            <div style={{
                                                                backgroundColor: '#FEF3C7',
                                                                border: '1.5px solid #D97706',
                                                                borderRadius: '4px',
                                                                padding: '3px 4px',
                                                                textAlign: 'center'
                                                            }}>
                                                                <div style={{
                                                                    fontSize: '6.5pt',
                                                                    fontWeight: '900',
                                                                    backgroundColor: '#D97706',
                                                                    color: '#FFFFFF',
                                                                    borderRadius: '3px',
                                                                    padding: '1px 5px',
                                                                    display: 'inline-block',
                                                                    textTransform: 'uppercase',
                                                                    letterSpacing: '0.03em',
                                                                    marginBottom: '2px'
                                                                }}>
                                                                    ★ Excepcional
                                                                </div>
                                                                <div style={{ fontSize: '8.2pt', fontWeight: '900', color: '#78350F', lineHeight: 1.15 }}>
                                                                    {slotInfo.slot}
                                                                </div>
                                                                {slotInfo.note && (
                                                                    <div style={{ fontSize: '6.5pt', color: '#92400E', marginTop: '2px', lineHeight: 1.1, fontStyle: 'italic', fontWeight: '600' }}>
                                                                        «{slotInfo.note}»
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div style={{ padding: '2px 4px' }}>
                                                                {slotInfo.windows && slotInfo.windows.length > 1 ? (
                                                                    slotInfo.windows.map((w, idx) => (
                                                                        <div key={idx} style={{ fontSize: '7.6pt', fontWeight: '800', color: '#0F172A', lineHeight: 1.25 }}>
                                                                            {w}
                                                                        </div>
                                                                    ))
                                                                ) : (
                                                                    <div style={{ fontSize: '7.8pt', fontWeight: '800', color: '#0F172A', lineHeight: 1.2 }}>
                                                                        {slotInfo.slot}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ verticalAlign: 'top', padding: '4px 6px' }}>
                                                        {order.special_notes && (
                                                            <div style={{ fontSize: '6.5pt', color: '#0369A1', fontWeight: '600', lineHeight: 1.15, marginBottom: '3px' }}>
                                                                Nota: {order.special_notes}
                                                            </div>
                                                        )}
                                                        <div style={{
                                                            minHeight: '22px',
                                                            borderBottom: '1px dashed #CBD5E1',
                                                            width: '100%',
                                                            marginTop: order.special_notes ? '1px' : '4px'
                                                        }}></div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                {/* Footer de continuidad entre páginas (sin recuadro innecesario de firmas) */}
                                {!isLastPage && (
                                    <div style={{ marginTop: 'auto', textAlign: 'right', fontSize: '7pt', fontWeight: '700', color: '#64748B', paddingTop: '6px' }}>
                                        Continúa en la siguiente hoja (Hoja {pageIdx + 2} de {manifestPages.length}) →
                                    </div>
                                )}
                            </Letterhead>
                        );
                    });
                })()}
                </>
            )}

            </div>
        </div>
    );
}
