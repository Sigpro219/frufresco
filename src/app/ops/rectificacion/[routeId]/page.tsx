'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import { 
  ArrowLeft, 
  Info, 
  CheckCircle2, 
  Circle, 
  Camera, 
  FileText, 
  X, 
  PackageCheck,
  Truck, 
  Check, 
  UserCheck, 
  ShieldCheck, 
  Lock, 
  AlertTriangle,
  AlertCircle,
  Printer,
  RotateCcw,
  Edit3
} from 'lucide-react';

interface MerchandiseItem {
    id: string;
    product_id?: string;
    product_name: string;
    quantity: number;
    unit: string;
    unit_price?: number;
    checked: boolean;
    is_shortage?: boolean;
    actual_quantity?: number;
    shortage_reason?: string;
}

interface OrderStop {
    id: string;
    order_id: string;
    sequence_id?: number | string;
    client_id?: string;
    customer_name: string;
    stop_number: number;
    location: string;
    crates_count: number;
    items: MerchandiseItem[];
    is_validated: boolean;
    has_shortages?: boolean;
}

export default function RouteRectificationDetailPage() {
    const { routeId } = useParams();
    const router = useRouter();
    const { profile } = useAuth();

    const [loading, setLoading] = useState(true);
    const [vehiclePlate, setVehiclePlate] = useState('NHP287');
    const [driverName, setDriverName] = useState('GARCIA HENRY');
    const [stops, setStops] = useState<OrderStop[]>([]);
    
    // Modal Chequeo Manual por Papel
    const [showPaperModal, setShowPaperModal] = useState(false);
    const [checkerName, setCheckerName] = useState('');
    const [paperPhotoUrl, setPaperPhotoUrl] = useState<string | null>(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Modal Declaración de Faltante en Muelle por Escasez / Agotado
    const [showShortageModal, setShowShortageModal] = useState(false);
    const [selectedShortageItem, setSelectedShortageItem] = useState<{
        stopId: string;
        item: MerchandiseItem;
        customerName: string;
        orderId: string;
    } | null>(null);
    const [shortageLoadedQty, setShortageLoadedQty] = useState<string>('0');
    const [shortageReason, setShortageReason] = useState<string>('Desabastecimiento en Plaza / Agotado Corabastos');

    // Modal Certificación de Salida Completa
    const [showCertificationModal, setShowCertificationModal] = useState(false);
    const [certifiedAgreed, setCertifiedAgreed] = useState(false);
    const [submittingCertification, setSubmittingCertification] = useState(false);

    // Autocompletar nombre de usuario desde la sesión activa
    useEffect(() => {
        if (profile) {
            const activeUserDisplayName = profile.contact_name || profile.company_name || (profile as any).email || '';
            if (activeUserDisplayName && (!checkerName || checkerName.trim() === '')) {
                setCheckerName(activeUserDisplayName);
            }
        }
    }, [profile]);

    useEffect(() => {
        fetchRouteDetail();
    }, [routeId]);

    const fetchRouteDetail = async () => {
        setLoading(true);
        try {
            // 1. Cargar metadatos de la ruta
            const { data: routeData } = await supabase
                .from('routes')
                .select('*')
                .eq('id', routeId)
                .single();

            if (routeData) {
                setVehiclePlate(routeData.vehicle_plate || 'NHP287');
                setDriverName(routeData.driver_name || 'GARCIA HENRY');
            } else if (typeof routeId === 'string') {
                if (routeId.includes('pmw071')) {
                    setVehiclePlate('PMW071');
                    setDriverName('ALARCÓN JORGE');
                } else if (routeId.includes('wfw369')) {
                    setVehiclePlate('WFW369');
                    setDriverName('TRUJILLO MANUEL');
                } else {
                    setVehiclePlate('NHP287');
                    setDriverName('GARCIA HENRY');
                }
            }

            // 2. Intentar cargar paradas reales desde route_stops
            let loadedStops: OrderStop[] = [];
            try {
                const { data: routeStopsData, error: stopsError } = await supabase
                    .from('route_stops')
                    .select(`
                        id, sequence_number, status,
                        orders:order_id (
                            id, sequence_id, shipping_address, warehouse_spaces, crates_count, total, subtotal, tax, profile_id,
                            profiles:profile_id (
                                id, company_name, contact_name, role
                            ),
                            order_items (
                                id, product_id, quantity, picked_quantity, unit, unit_price,
                                products (id, name, unit_of_measure, sku, base_price)
                            )
                        )
                    `)
                    .eq('route_id', routeId)
                    .order('sequence_number', { ascending: false });

                if (!stopsError && routeStopsData && routeStopsData.length > 0) {
                    loadedStops = routeStopsData.map((rs: any, idx: number) => {
                        const ord = rs.orders || {};
                        const prof = ord.profiles || {};
                        const custName = prof.role === 'b2b_client'
                            ? (prof.company_name || 'Cliente B2B')
                            : (prof.contact_name || prof.company_name || 'Cliente Hogar');
                        
                        const rawItems = ord.order_items || [];
                        const mappedItems: MerchandiseItem[] = rawItems.map((itm: any) => ({
                            id: itm.id,
                            product_id: itm.product_id,
                            product_name: itm.products?.name || 'Producto',
                            quantity: Number(itm.quantity) || 1,
                            unit: itm.unit || itm.products?.unit_of_measure || 'Kg',
                            unit_price: Number(itm.unit_price || itm.products?.base_price) || 0,
                            checked: false,
                            is_shortage: false,
                            actual_quantity: Number(itm.quantity) || 1,
                            shortage_reason: ''
                        }));

                        const spaces = ord.warehouse_spaces;
                        const spaceLabel = Array.isArray(spaces) && spaces.length > 0 ? `ESP ${spaces.join(', ')}` : `ESP ${String(idx + 1).padStart(2, '0')}`;

                        return {
                            id: rs.id,
                            order_id: ord.id || `ord-${idx}`,
                            sequence_id: ord.sequence_id,
                            client_id: ord.profile_id,
                            customer_name: custName,
                            stop_number: rs.sequence_number || (routeStopsData.length - idx),
                            location: spaceLabel,
                            crates_count: ord.crates_count || 10,
                            is_validated: false,
                            has_shortages: false,
                            items: mappedItems
                        };
                    });
                }
            } catch (stopsErr) {
                console.warn('Could not load real route_stops, falling back to mock stops:', stopsErr);
            }

            if (loadedStops.length > 0) {
                setStops(loadedStops);
            } else {
                // Mock Data LIFO ordered (Reverse stop numbers 25 to 1) para rutas demo o offline
                const mockStops: OrderStop[] = [
                    {
                        id: 'stop-25',
                        order_id: 'ord-25',
                        sequence_id: 1045,
                        customer_name: 'ADR WORK SAS - HOTEL SPOT CENTRO',
                        stop_number: 25,
                        location: 'ESP 32',
                        crates_count: 14,
                        is_validated: false,
                        has_shortages: false,
                        items: [
                            { id: 'i1', product_id: 'prod-ciruela', product_name: 'Ciruela nacional', quantity: 24, unit: 'Kg', unit_price: 12000, checked: false, is_shortage: false, actual_quantity: 24 },
                            { id: 'i2', product_id: 'prod-esparragos', product_name: 'Esparragos', quantity: 47, unit: 'Kg', unit_price: 18000, checked: false, is_shortage: false, actual_quantity: 47 },
                            { id: 'i3', product_id: 'prod-lechuga', product_name: 'Lechuga romana', quantity: 49, unit: 'Kg', unit_price: 4500, checked: false, is_shortage: false, actual_quantity: 49 },
                            { id: 'i4', product_id: 'prod-perejil', product_name: 'Perejil crespo', quantity: 53, unit: 'Kg', unit_price: 3800, checked: false, is_shortage: false, actual_quantity: 53 },
                            { id: 'i5', product_id: 'prod-naranja', product_name: 'Naranja extra', quantity: 56, unit: 'Kg', unit_price: 3200, checked: false, is_shortage: false, actual_quantity: 56 },
                            { id: 'i6', product_id: 'prod-ruibarbo', product_name: 'Ruibarbo', quantity: 30, unit: 'Kg', unit_price: 8000, checked: false, is_shortage: false, actual_quantity: 30 }
                        ]
                    },
                    {
                        id: 'stop-24',
                        order_id: 'ord-24',
                        sequence_id: 1044,
                        customer_name: 'PEÑA INVESTMENTS S.A.S - LA MAR',
                        stop_number: 24,
                        location: 'ESP 18',
                        crates_count: 8,
                        is_validated: false,
                        has_shortages: false,
                        items: [
                            { id: 'i7', product_id: 'prod-aguacate', product_name: 'Aguacate papelillo', quantity: 37, unit: 'Kg', unit_price: 9500, checked: false, is_shortage: false, actual_quantity: 37 },
                            { id: 'i8', product_id: 'prod-platano', product_name: 'Platano verde institucional', quantity: 38, unit: 'Kg', unit_price: 4200, checked: false, is_shortage: false, actual_quantity: 38 },
                            { id: 'i9', product_id: 'prod-tomate', product_name: 'Tomate chonto', quantity: 25, unit: 'Kg', unit_price: 4000, checked: false, is_shortage: false, actual_quantity: 25 }
                        ]
                    },
                    {
                        id: 'stop-23',
                        order_id: 'ord-23',
                        sequence_id: 1043,
                        customer_name: 'INDUSTRIA DE RESTAURANTES CASUALES',
                        stop_number: 23,
                        location: 'ESP 05',
                        crates_count: 22,
                        is_validated: false,
                        has_shortages: false,
                        items: [
                            { id: 'i10', product_id: 'prod-limon', product_name: 'Limon Tahiti extra', quantity: 60, unit: 'Kg', unit_price: 5200, checked: false, is_shortage: false, actual_quantity: 60 },
                            { id: 'i11', product_id: 'prod-cebolla', product_name: 'Cebolla cabezona blanca', quantity: 100, unit: 'Kg', unit_price: 2800, checked: false, is_shortage: false, actual_quantity: 100 },
                            { id: 'i12', product_id: 'prod-papa', product_name: 'Papa sabanera seleccionada', quantity: 150, unit: 'Kg', unit_price: 3600, checked: false, is_shortage: false, actual_quantity: 150 }
                        ]
                    }
                ];

                setStops(mockStops);
            }
        } catch (e) {
            console.error('Error loading route rectification details:', e);
        } finally {
            setLoading(false);
        }
    };

    // Alternar ítem individual (Conforme vs Desmarcado)
    const toggleItem = (stopId: string, itemId: string) => {
        setStops(prev => prev.map(stop => {
            if (stop.id !== stopId) return stop;

            const updatedItems = stop.items.map(item => {
                if (item.id === itemId) {
                    // Si estaba como faltante, pulsar el checkbox lo pasa a verificado completo
                    if (item.is_shortage) {
                        return { 
                            ...item, 
                            checked: true, 
                            is_shortage: false, 
                            actual_quantity: item.quantity, 
                            shortage_reason: '' 
                        };
                    }
                    const newChecked = !item.checked;
                    return { 
                        ...item, 
                        checked: newChecked,
                        actual_quantity: newChecked ? item.quantity : 0 
                    };
                }
                return item;
            });

            // Una parada está validada si todos sus ítems están chequeados O declarados como faltante
            const allResolved = updatedItems.every(i => i.checked || i.is_shortage);
            const hasAnyShortage = updatedItems.some(i => i.is_shortage);
            return {
                ...stop,
                items: updatedItems,
                is_validated: allResolved,
                has_shortages: hasAnyShortage
            };
        }));
    };

    // Abrir modal para declarar faltante por agotado/escasez en muelle
    const openShortageModal = (stop: OrderStop, item: MerchandiseItem) => {
        setSelectedShortageItem({
            stopId: stop.id,
            item,
            customerName: stop.customer_name,
            orderId: stop.order_id
        });
        setShortageLoadedQty(String(item.is_shortage ? (item.actual_quantity || 0) : 0));
        setShortageReason(item.shortage_reason || 'Desabastecimiento en Plaza / Agotado Corabastos');
        setShowShortageModal(true);
    };

    // Confirmar declaración de faltante
    const confirmShortage = () => {
        if (!selectedShortageItem) return;
        const { stopId, item } = selectedShortageItem;
        const loaded = Math.max(0, Math.min(item.quantity, Number(shortageLoadedQty) || 0));

        setStops(prev => prev.map(stop => {
            if (stop.id !== stopId) return stop;
            const updatedItems = stop.items.map(i => {
                if (i.id === item.id) {
                    return {
                        ...i,
                        checked: false,
                        is_shortage: true,
                        actual_quantity: loaded,
                        shortage_reason: shortageReason
                    };
                }
                return i;
            });

            const allResolved = updatedItems.every(i => i.checked || i.is_shortage);
            const hasAnyShortage = updatedItems.some(i => i.is_shortage);

            return {
                ...stop,
                items: updatedItems,
                is_validated: allResolved,
                has_shortages: hasAnyShortage
            };
        }));

        setShowShortageModal(false);
        setSelectedShortageItem(null);
    };

    // Restaurar ítem a pedido original completo
    const restoreItem = (stopId: string, itemId: string) => {
        setStops(prev => prev.map(stop => {
            if (stop.id !== stopId) return stop;
            const updatedItems = stop.items.map(i => {
                if (i.id === itemId) {
                    return {
                        ...i,
                        checked: false,
                        is_shortage: false,
                        actual_quantity: i.quantity,
                        shortage_reason: ''
                    };
                }
                return i;
            });

            const allResolved = updatedItems.every(i => i.checked || i.is_shortage);
            const hasAnyShortage = updatedItems.some(i => i.is_shortage);

            return {
                ...stop,
                items: updatedItems,
                is_validated: allResolved,
                has_shortages: hasAnyShortage
            };
        }));
    };

    // Validar pedido completo digitalmente (100% conforme)
    const validateWholeOrder = (stopId: string) => {
        setStops(prev => prev.map(stop => {
            if (stop.id !== stopId) return stop;
            const newStatus = !stop.is_validated;
            return {
                ...stop,
                is_validated: newStatus,
                has_shortages: false,
                items: stop.items.map(i => ({ 
                    ...i, 
                    checked: newStatus,
                    is_shortage: false,
                    actual_quantity: i.quantity,
                    shortage_reason: ''
                }))
            };
        }));
    };

    // Reimprimir remisión física neta en caliente
    const handlePrintRemision = (orderId: string) => {
        const url = `/admin/orders/contingency-print?mode=remissions&orderIds=${orderId}`;
        window.open(url, '_blank');
    };

    // Subir foto de la planilla física en papel
    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingPhoto(true);
        const reader = new FileReader();
        reader.onloadend = () => {
            setPaperPhotoUrl(reader.result as string);
            setUploadingPhoto(false);
        };
        reader.readAsDataURL(file);
    };

    // Paso 1: Confirmar Anexo de Foto en Papel -> Pasar a Pantalla de Certificación
    const proceedToCertificationFromPaper = () => {
        if (!checkerName.trim()) {
            alert('Por favor confirma el nombre de la persona responsable.');
            return;
        }
        if (!paperPhotoUrl) {
            alert('Por favor adjunta una foto de la planilla física de cargue.');
            return;
        }

        // Marcar todos los pedidos como validados por planilla
        setStops(prev => prev.map(s => ({
            ...s,
            is_validated: true,
            items: s.items.map(i => ({ ...i, checked: true }))
        })));

        setShowPaperModal(false);
        setCertifiedAgreed(false);
        setShowCertificationModal(true);
    };

    // Paso 1b: Iniciar Certificación desde el flujo digital (Checklist en pantalla)
    const proceedToCertificationDigital = () => {
        setCertifiedAgreed(false);
        setShowCertificationModal(true);
    };

    // Recopilar todos los faltantes detectados en la ruta
    const allShortages = stops.flatMap(s => 
        s.items
            .filter(i => i.is_shortage)
            .map(i => ({
                stop_id: s.id,
                stop_number: s.stop_number,
                customer_name: s.customer_name,
                order_id: s.order_id,
                sequence_id: s.sequence_id,
                client_id: s.client_id,
                item_id: i.id,
                product_id: i.product_id,
                product_name: i.product_name,
                original_quantity: i.quantity,
                actual_quantity: i.actual_quantity ?? 0,
                missing_quantity: i.quantity - (i.actual_quantity ?? 0),
                unit: i.unit,
                unit_price: i.unit_price || 0,
                reason: i.shortage_reason || 'Desabastecimiento en Plaza / Agotado Corabastos'
            }))
    );

    // Paso 2: Finalizar Certificación en Base de Datos y Liberar a Transporte
    const finalizeCertification = async () => {
        if (!certifiedAgreed) {
            alert('Debes marcar la casilla de certificación formal para liberar la ruta.');
            return;
        }

        setSubmittingCertification(true);
        try {
            const now = new Date().toISOString();
            const mode = paperPhotoUrl ? 'paper' : 'digital';

            // 1. Radicación de Novedades de Escasez en Gestión de Calidad (Shift-Left)
            if (allShortages.length > 0) {
                for (const shortage of allShortages) {
                    try {
                        // a. Inserción en billing_returns
                        await supabase.from('billing_returns').insert({
                            order_id: shortage.order_id,
                            product_id: shortage.product_id || null,
                            quantity_returned: shortage.missing_quantity,
                            reason: `[Faltante Cargue en Muelle - Escasez]: ${shortage.reason} | Parada #${shortage.stop_number} | Ruta ${vehiclePlate}`,
                            defect_category_l1: 'comercial_cliente',
                            defect_subtype_l2: 'producto_agotado_plaza',
                            imputed_responsible: 'proveedor',
                            status: 'pending_review'
                        });

                        // b. Inserción en customer_service_pqrs
                        await supabase.from('customer_service_pqrs').insert({
                            client_id: shortage.client_id || null,
                            order_id: shortage.order_id,
                            type: 'reclamo',
                            category: 'producto',
                            priority: 'high',
                            subject: `[Escasez Muelle] Faltante por Agotado: ${shortage.product_name} - Pedido #${shortage.sequence_id || shortage.order_id.substring(0, 8)}`,
                            description: `En la rectificación de cargue de la ruta ${vehiclePlate} (Parada #${shortage.stop_number} - ${shortage.customer_name}) se detectó faltante de ${shortage.missing_quantity} ${shortage.unit} de ${shortage.product_name} por desabastecimiento en plaza mayorista. Cantidad efectivamente cargada: ${shortage.actual_quantity} ${shortage.unit}.`,
                            defect_category_l1: 'comercial_cliente',
                            defect_subtype_l2: 'producto_agotado_plaza',
                            imputed_responsible: 'proveedor',
                            status: 'pending'
                        });

                        // c. Ajustar order_items en base de datos si es UUID real
                        if (shortage.item_id && !shortage.item_id.startsWith('i')) {
                            await supabase.from('order_items').update({
                                picked_quantity: shortage.actual_quantity,
                                quantity: shortage.actual_quantity
                            }).eq('id', shortage.item_id);
                        }
                    } catch (shortageErr) {
                        console.warn('Aviso registrando novedad de escasez en muelle:', shortageErr);
                    }
                }
            }

            // 2. Actualizar la ruta en Supabase con auditoría, estado de rectificación y bandera de faltantes
            await supabase
                .from('routes')
                .update({ 
                    status: 'rectified',
                    check_evidence_url: paperPhotoUrl || null,
                    check_mode: mode,
                    rectified_by_id: profile?.id || null,
                    rectified_by_name: checkerName || profile?.contact_name || 'Usuario Activo',
                    rectified_at: now,
                    is_certified_complete: true,
                    has_shortages: allShortages.length > 0,
                    shortages_summary: allShortages.length > 0 ? allShortages : null
                })
                .eq('id', routeId);

            // 3. Actualizar sistemáticamente los pedidos de la ruta a 'ready_for_dispatch'
            const { data: routeStops } = await supabase
                .from('route_stops')
                .select('order_id')
                .eq('route_id', routeId);

            if (routeStops && routeStops.length > 0) {
                const orderIds = routeStops.map((s: any) => s.order_id).filter(Boolean);
                if (orderIds.length > 0) {
                    await supabase
                        .from('orders')
                        .update({ status: 'ready_for_dispatch' })
                        .in('id', orderIds);
                }
            }

            setShowCertificationModal(false);
            
            const shortageMsg = allShortages.length > 0
                ? `\n\n⚠️ Se radicaron automáticamente ${allShortages.length} novedades de escasez en Gestión de Calidad (RCA: Agotado en Plaza) y se ajustaron las remisiones para facturación neta.`
                : '';

            alert(`🛡️ ¡CERTIFICACIÓN EXITOSA!\n\nLa ruta ${vehiclePlate} ha sido validada por ${checkerName || 'el usuario'} y liberada a Transporte.${shortageMsg}`);
            router.push('/ops/driver');
        } catch (e) {
            console.error('Error finalizando certificación de ruta:', e);
            router.push('/ops/driver');
        } finally {
            setSubmittingCertification(false);
        }
    };

    const validatedCount = stops.filter(s => s.is_validated).length;
    const totalStops = stops.length;
    const remainingStops = totalStops - validatedCount;
    const isFullyValidated = totalStops > 0 && validatedCount === totalStops;
    const totalShortagesCount = allShortages.length;

    return (
        <div style={{ minHeight: '100vh', backgroundColor: 'var(--ops-bg)', color: 'var(--ops-text)', paddingBottom: '160px' }}>
            {/* Header Flotante */}
            <div style={{ 
                position: 'sticky', 
                top: 0, 
                backgroundColor: 'var(--ops-surface)', 
                zIndex: 90, 
                borderBottom: '1px solid var(--ops-border)',
                padding: '0.75rem 1rem'
            }}>
                <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Link href="/ops/rectificacion" style={{ textDecoration: 'none', color: 'var(--ops-text)' }}>
                        <button style={{ background: 'none', border: 'none', color: 'var(--ops-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ArrowLeft size={20} />
                        </button>
                    </Link>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: 'var(--ops-text)' }}>
                        Validación de <span style={{ color: 'var(--ops-primary)' }}>Cargue</span> ({vehiclePlate})
                    </h2>
                    <button 
                        onClick={() => setShowPaperModal(true)}
                        style={{
                            padding: '0.4rem 0.8rem',
                            borderRadius: '10px',
                            backgroundColor: 'rgba(245, 158, 11, 0.15)',
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                            color: '#F59E0B',
                            fontWeight: '800',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Camera size={14} /> Planilla Papel
                    </button>
                </div>
            </div>

            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
                {/* Info Card LIFO */}
                <div style={{ 
                    backgroundColor: '#0c1a29', 
                    borderRadius: '18px', 
                    border: '1px solid #1e3a5f', 
                    padding: '1rem',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px'
                }}>
                    <Info size={22} color="#38bdf8" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                        <div style={{ fontWeight: '900', fontSize: '0.85rem', color: '#38bdf8', letterSpacing: '0.04em' }}>
                            LÓGICA DE CARGUE (LIFO)
                        </div>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#93c5fd', lineHeight: '1.4' }}>
                            Carga primero lo que entregarás al final para que quede al fondo del camión. Si algún producto no se alistó por escasez o merma, márcalo como <strong>[Agotado]</strong> para regenerar la remisión limpia y radicar la novedad en Calidad.
                        </p>
                    </div>
                </div>

                {/* Counter Pill Badges */}
                <div style={{ marginBottom: '1.25rem', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        padding: '0.4rem 1rem', 
                        borderRadius: '20px', 
                        backgroundColor: 'rgba(16, 185, 129, 0.12)', 
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: 'var(--ops-primary)',
                        fontWeight: '900',
                        fontSize: '0.8rem',
                        letterSpacing: '0.04em'
                    }}>
                        <PackageCheck size={16} />
                        {validatedCount} / {totalStops} PEDIDOS VALIDADOS
                    </div>

                    {totalShortagesCount > 0 && (
                        <div style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            padding: '0.4rem 0.9rem', 
                            borderRadius: '20px', 
                            backgroundColor: 'rgba(245, 158, 11, 0.15)', 
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                            color: '#F59E0B',
                            fontWeight: '900',
                            fontSize: '0.8rem'
                        }}>
                            <AlertTriangle size={15} color="#F59E0B" />
                            {totalShortagesCount} NOVEDAD(ES) DE ESCASEZ
                        </div>
                    )}
                </div>

                {/* Lista de Tarjetas LIFO */}
                {stops.map(stop => (
                    <div 
                        key={stop.id}
                        style={{
                            backgroundColor: 'var(--ops-surface)',
                            borderRadius: '20px',
                            border: `1px solid ${stop.has_shortages ? 'rgba(245, 158, 11, 0.5)' : (stop.is_validated ? 'rgba(16, 185, 129, 0.4)' : 'var(--ops-border)')}`,
                            padding: '1.25rem',
                            marginBottom: '1rem',
                            boxShadow: stop.is_validated ? '0 4px 20px rgba(16, 185, 129, 0.08)' : '0 4px 15px rgba(0,0,0,0.06)',
                            transition: 'all 0.2s'
                        }}
                    >
                        {/* Cabecera del Pedido */}
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '1rem' }}>
                            <button
                                onClick={() => validateWholeOrder(stop.id)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: 0,
                                    color: stop.is_validated ? (stop.has_shortages ? '#F59E0B' : 'var(--ops-primary)') : 'var(--ops-text-muted)',
                                    marginTop: '2px'
                                }}
                                title="Marcar todo el pedido como validado conforme"
                            >
                                {stop.is_validated ? (
                                    <CheckCircle2 size={26} fill={stop.has_shortages ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'} />
                                ) : (
                                    <Circle size={26} />
                                )}
                            </button>

                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                                    <div>
                                        <div style={{ fontWeight: '900', fontSize: '1.05rem', color: 'var(--ops-text)', letterSpacing: '-0.01em' }}>
                                            {stop.customer_name}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--ops-text-muted)', marginTop: '2px' }}>
                                            Parada #{stop.stop_number} de la ruta {stop.sequence_id ? `· Pedido #${stop.sequence_id}` : ''}
                                        </div>
                                    </div>

                                    {/* Botón Reimpresión Directa si hay novedades */}
                                    {stop.has_shortages && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePrintRemision(stop.order_id);
                                            }}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                padding: '5px 10px',
                                                borderRadius: '8px',
                                                backgroundColor: '#0F172A',
                                                border: '1px solid #0284C7',
                                                color: '#38BDF8',
                                                fontSize: '0.72rem',
                                                fontWeight: '900',
                                                cursor: 'pointer',
                                                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                                whiteSpace: 'nowrap'
                                            }}
                                            title="Reimprimir remisión duplicada con las cantidades netas cargadas en camión"
                                        >
                                            <Printer size={13} /> Reimprimir Remisión
                                        </button>
                                    )}
                                </div>

                                {/* Badges de Ubicación y Canastillas */}
                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ 
                                        backgroundColor: '#064e3b', 
                                        color: '#34d399', 
                                        fontSize: '0.68rem', 
                                        fontWeight: '900', 
                                        padding: '4px 10px', 
                                        borderRadius: '8px',
                                        letterSpacing: '0.04em'
                                    }}>
                                        UBICACIÓN: {stop.location}
                                    </span>
                                    <span style={{ 
                                        backgroundColor: '#451a03', 
                                        color: '#fb923c', 
                                        fontSize: '0.68rem', 
                                        fontWeight: '900', 
                                        padding: '4px 10px', 
                                        borderRadius: '8px',
                                        letterSpacing: '0.04em'
                                    }}>
                                        📦 CANASTILLAS: {stop.crates_count}
                                    </span>

                                    {stop.has_shortages && (
                                        <span style={{ 
                                            backgroundColor: '#78350f', 
                                            color: '#fde68a', 
                                            fontSize: '0.68rem', 
                                            fontWeight: '900', 
                                            padding: '4px 10px', 
                                            borderRadius: '8px',
                                            letterSpacing: '0.04em',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            <AlertTriangle size={11} color="#fde68a" /> FALTANTES EN MUELLE
                                        </span>
                                    )}
                                </div>

                                {/* Alerta Banner si hay faltantes */}
                                {stop.has_shortages && (
                                    <div style={{
                                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                                        border: '1px dashed rgba(245, 158, 11, 0.4)',
                                        borderRadius: '10px',
                                        padding: '0.5rem 0.75rem',
                                        marginTop: '10px',
                                        fontSize: '0.75rem',
                                        color: '#FCD34D',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '8px'
                                    }}>
                                        <span>⚠️ Este pedido contiene producto(s) no alistados por escasez. La remisión viajará con el valor neto ajustado.</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Contenido / Mercancía a Cargar */}
                        <div style={{ 
                            backgroundColor: 'var(--ops-bg)', 
                            borderRadius: '14px', 
                            padding: '1rem',
                            border: '1px solid var(--ops-border)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: '900', color: 'var(--ops-text-muted)', letterSpacing: '0.06em' }}>
                                    MERCANCÍA A CARGAR
                                </div>
                                <div style={{ fontSize: '0.68rem', fontWeight: '700', color: 'var(--ops-text-muted)' }}>
                                    {stop.items.filter(i => i.checked).length} cargados · {stop.items.filter(i => i.is_shortage).length} agotados
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                {stop.items.map(item => (
                                    <div 
                                        key={item.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.55rem 0.75rem',
                                            borderRadius: '12px',
                                            backgroundColor: item.is_shortage 
                                                ? 'rgba(245, 158, 11, 0.1)' 
                                                : (item.checked ? 'rgba(16, 185, 129, 0.08)' : 'transparent'),
                                            border: `1px solid ${item.is_shortage 
                                                ? 'rgba(245, 158, 11, 0.35)' 
                                                : (item.checked ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.06)')}`,
                                            transition: 'all 0.15s',
                                            gap: '10px'
                                        }}
                                    >
                                        {/* Izquierda: Checkbox y Nombre */}
                                        <div 
                                            onClick={() => toggleItem(stop.id, item.id)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}
                                        >
                                            <div style={{ 
                                                width: '20px', 
                                                height: '20px', 
                                                borderRadius: '5px', 
                                                border: `1.5px solid ${item.is_shortage ? '#F59E0B' : (item.checked ? 'var(--ops-primary)' : 'var(--ops-text-muted)')}`,
                                                backgroundColor: item.is_shortage ? '#78350F' : (item.checked ? 'var(--ops-primary)' : 'transparent'),
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center', 
                                                color: 'white',
                                                flexShrink: 0
                                            }}>
                                                {item.is_shortage ? (
                                                    <AlertTriangle size={13} color="#FDE68A" />
                                                ) : (
                                                    item.checked && <Check size={13} strokeWidth={3} />
                                                )}
                                            </div>

                                            <div>
                                                <span style={{ 
                                                    fontSize: '0.85rem', 
                                                    fontWeight: '800', 
                                                    color: item.is_shortage ? '#FBBF24' : (item.checked ? 'var(--ops-primary)' : 'var(--ops-text)'),
                                                    textDecoration: item.checked ? 'line-through' : 'none',
                                                    opacity: item.checked ? 0.85 : 1
                                                }}>
                                                    {item.product_name}
                                                </span>

                                                {/* Detalle si es faltante */}
                                                {item.is_shortage && (
                                                    <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#FCD34D', marginTop: '1px' }}>
                                                        ⚠️ Agotado en Plaza · Cargado: {item.actual_quantity} {item.unit} (Faltante: {item.quantity - (item.actual_quantity || 0)} {item.unit})
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Derecha: Cantidad y Botones de Acción */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ 
                                                fontSize: '0.85rem', 
                                                fontWeight: '900', 
                                                color: item.is_shortage ? '#FBBF24' : (item.checked ? 'var(--ops-primary)' : 'var(--ops-text)'),
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {item.is_shortage ? item.actual_quantity : (item.checked ? item.quantity : 0)} / {item.quantity} {item.unit}
                                            </span>

                                            {/* Si NO es faltante: Botón Declarar Agotado */}
                                            {!item.is_shortage ? (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openShortageModal(stop, item);
                                                    }}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid rgba(245, 158, 11, 0.4)',
                                                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                                                        color: '#F59E0B',
                                                        fontSize: '0.68rem',
                                                        fontWeight: '800',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                    title="Declarar faltante por escasez o no alistamiento"
                                                >
                                                    <AlertTriangle size={11} /> Agotado
                                                </button>
                                            ) : (
                                                /* Si ES faltante: Botón Editar y Restaurar */
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openShortageModal(stop, item);
                                                        }}
                                                        style={{
                                                            padding: '4px 6px',
                                                            borderRadius: '6px',
                                                            border: '1px solid rgba(245, 158, 11, 0.4)',
                                                            backgroundColor: 'rgba(245, 158, 11, 0.2)',
                                                            color: '#FCD34D',
                                                            fontSize: '0.68rem',
                                                            fontWeight: '800',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '3px'
                                                        }}
                                                        title="Editar cantidad cargada"
                                                    >
                                                        <Edit3 size={11} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            restoreItem(stop.id, item.id);
                                                        }}
                                                        style={{
                                                            padding: '4px 6px',
                                                            borderRadius: '6px',
                                                            border: '1px solid var(--ops-border)',
                                                            backgroundColor: 'transparent',
                                                            color: 'var(--ops-text-muted)',
                                                            fontSize: '0.68rem',
                                                            fontWeight: '800',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '3px'
                                                        }}
                                                        title="Restaurar a pedido original"
                                                    >
                                                        <RotateCcw size={11} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Floating Action Capsule */}
            <div style={{ 
                position: 'fixed', 
                bottom: 'calc(66px + env(safe-area-inset-bottom, 0px))', 
                left: '50%',
                transform: 'translateX(-50%)',
                maxWidth: '780px',
                width: 'calc(100% - 32px)',
                backgroundColor: isFullyValidated ? (totalShortagesCount > 0 ? '#1E293B' : '#065F46') : '#121d2d',
                borderRadius: '16px',
                border: `1px solid ${isFullyValidated ? (totalShortagesCount > 0 ? '#F59E0B' : '#10B981') : 'rgba(245, 158, 11, 0.4)'}`,
                padding: '0.75rem 1.25rem',
                zIndex: 95,
                boxShadow: isFullyValidated ? '0 8px 30px rgba(0, 0, 0, 0.4)' : '0 8px 30px rgba(0, 0, 0, 0.4)',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isFullyValidated ? 'space-between' : 'center',
                gap: '1rem',
                flexWrap: 'wrap'
            }}>
                <div style={{ 
                    fontWeight: '800', 
                    fontSize: '0.88rem', 
                    color: isFullyValidated ? (totalShortagesCount > 0 ? '#FCD34D' : '#ECFDF5') : '#FBBF24', 
                    letterSpacing: '0.03em',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: isFullyValidated ? 'auto' : '100%',
                    textAlign: 'center'
                }}>
                    {isFullyValidated ? (
                        totalShortagesCount > 0 ? (
                            <>
                                <AlertTriangle size={18} color="#F59E0B" />
                                <span>¡CARGUE RECTIFICADO CON {totalShortagesCount} NOVEDAD(ES)!</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={20} color="#34D399" />
                                <span>¡CARGUE 100% RECTIFICADO!</span>
                            </>
                        )
                    ) : (
                        <>
                            <AlertTriangle size={18} color="#FBBF24" />
                            <span>FALTAN {remainingStops} {remainingStops === 1 ? 'PEDIDO' : 'PEDIDOS'} POR VALIDAR</span>
                        </>
                    )}
                </div>

                {isFullyValidated && (
                    <button
                        onClick={proceedToCertificationDigital}
                        style={{
                            padding: '0.6rem 1.25rem',
                            borderRadius: '12px',
                            border: 'none',
                            backgroundColor: totalShortagesCount > 0 ? '#D97706' : '#10B981',
                            color: 'white',
                            fontWeight: '900',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
                            transition: 'all 0.2s',
                            whiteSpace: 'nowrap',
                            margin: '0 auto'
                        }}
                    >
                        <ShieldCheck size={18} /> PASAR A CERTIFICACIÓN Y TRANSPORTE
                    </button>
                )}
            </div>

            {/* MODAL: DECLARACIÓN DE FALTANTE POR ESCASEZ EN MUELLE */}
            {showShortageModal && selectedShortageItem && (
                <div style={{ 
                    position: 'fixed', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    bottom: 0, 
                    backgroundColor: 'rgba(0,0,0,0.8)', 
                    backdropFilter: 'blur(6px)',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    zIndex: 250,
                    padding: '1rem'
                }}>
                    <div style={{ 
                        backgroundColor: 'var(--ops-surface)', 
                        borderRadius: '24px', 
                        border: '1px solid #F59E0B', 
                        padding: '1.5rem',
                        maxWidth: '480px',
                        width: '100%',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                        position: 'relative'
                    }}>
                        <button 
                            onClick={() => setShowShortageModal(false)}
                            style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--ops-text-muted)', cursor: 'pointer' }}
                        >
                            <X size={20} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#F59E0B', fontWeight: '900', fontSize: '0.8rem', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>
                            <AlertTriangle size={18} />
                            COMPUERTA SHIFT-LEFT · NOVEDAD EN MUELLE
                        </div>
                        <h3 style={{ margin: '0 0 0.3rem 0', fontSize: '1.25rem', fontWeight: '900', color: 'var(--ops-text)' }}>
                            Declarar Faltante por Escasez
                        </h3>
                        <div style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--ops-primary)', marginBottom: '1rem' }}>
                            {selectedShortageItem.customerName}
                        </div>

                        {/* Tarjeta de Producto */}
                        <div style={{ 
                            backgroundColor: 'var(--ops-bg)', 
                            borderRadius: '14px', 
                            padding: '1rem', 
                            border: '1px solid var(--ops-border)',
                            marginBottom: '1rem'
                        }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: '900', color: 'var(--ops-text)', marginBottom: '4px' }}>
                                {selectedShortageItem.item.product_name}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>
                                Cantidad Original Solicitada: <strong style={{ color: 'var(--ops-text)' }}>{selectedShortageItem.item.quantity} {selectedShortageItem.item.unit}</strong>
                            </div>
                        </div>

                        {/* Input Cantidad Realmente Cargada */}
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                                Cantidad Efectivamente Cargada en Camión ({selectedShortageItem.item.unit}) *
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input 
                                    type="number" 
                                    min="0"
                                    max={selectedShortageItem.item.quantity}
                                    step="0.1"
                                    value={shortageLoadedQty}
                                    onChange={e => setShortageLoadedQty(e.target.value)}
                                    style={{
                                        flex: 1,
                                        padding: '0.65rem 0.85rem',
                                        borderRadius: '12px',
                                        border: '1px solid #F59E0B',
                                        backgroundColor: 'var(--ops-bg)',
                                        color: 'var(--ops-text)',
                                        fontSize: '1rem',
                                        fontWeight: '900',
                                        outline: 'none'
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShortageLoadedQty('0')}
                                    style={{
                                        padding: '0.65rem 1rem',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(245, 158, 11, 0.4)',
                                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                        color: '#F59E0B',
                                        fontWeight: '900',
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    0 Kg (Agotado Total)
                                </button>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#FCD34D', marginTop: '4px', fontWeight: '700' }}>
                                Faltante no despachado: {Math.max(0, selectedShortageItem.item.quantity - (Number(shortageLoadedQty) || 0))} {selectedShortageItem.item.unit}
                            </div>
                        </div>

                        {/* Selector de Causa RCA */}
                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                                Causa Raíz de la Novedad (RCA) *
                            </label>
                            <select
                                value={shortageReason}
                                onChange={e => setShortageReason(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.65rem 0.85rem',
                                    borderRadius: '12px',
                                    border: '1px solid var(--ops-border)',
                                    backgroundColor: 'var(--ops-bg)',
                                    color: 'var(--ops-text)',
                                    fontSize: '0.8rem',
                                    fontWeight: '800',
                                    outline: 'none'
                                }}
                            >
                                <option value="Desabastecimiento en Plaza / Agotado Corabastos">Desabastecimiento en Plaza / Agotado Corabastos (Subtipo: producto_agotado_plaza)</option>
                                <option value="Rechazo en mesa de selección por no conformidad">Rechazo en mesa de selección por calidad / merma</option>
                                <option value="Faltante de inventario en bodega">Faltante físico en bodega de alistamiento</option>
                            </select>
                        </div>

                        {/* Nota Explicativa Shift-Left */}
                        <div style={{ 
                            backgroundColor: 'rgba(56, 189, 248, 0.08)', 
                            border: '1px solid rgba(56, 189, 248, 0.25)', 
                            padding: '0.75rem', 
                            borderRadius: '12px', 
                            marginBottom: '1.25rem',
                            fontSize: '0.74rem',
                            color: '#BAE6FD',
                            lineHeight: '1.35'
                        }}>
                            💡 <strong>Garantía de Facturación Exacta:</strong> Al confirmar, la remisión física se recalculará por las cantidades reales despachadas para su reimpresión inmediata en bodega, y se radicará automáticamente la novedad en Gestión de Calidad imputada a Compras.
                        </div>

                        {/* Botones de Acción */}
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                type="button"
                                onClick={() => setShowShortageModal(false)}
                                style={{
                                    flex: 1,
                                    padding: '0.75rem',
                                    borderRadius: '12px',
                                    border: '1px solid var(--ops-border)',
                                    backgroundColor: 'transparent',
                                    color: 'var(--ops-text-muted)',
                                    fontWeight: '800',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmShortage}
                                style={{
                                    flex: 2,
                                    padding: '0.75rem',
                                    borderRadius: '12px',
                                    border: 'none',
                                    backgroundColor: '#F59E0B',
                                    color: 'black',
                                    fontWeight: '900',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)'
                                }}
                            >
                                <Check size={16} /> Confirmar Faltante & Ajustar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 1: PLANILLA EN PAPEL CON FOTO */}
            {showPaperModal && (
                <div style={{ 
                    position: 'fixed', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    bottom: 0, 
                    backgroundColor: 'rgba(0,0,0,0.75)', 
                    backdropFilter: 'blur(6px)',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    zIndex: 200,
                    padding: '1rem'
                }}>
                    <div style={{ 
                        backgroundColor: 'var(--ops-surface)', 
                        borderRadius: '24px', 
                        border: '1px solid var(--ops-border)', 
                        padding: '1.5rem',
                        maxWidth: '480px',
                        width: '100%',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                        position: 'relative'
                    }}>
                        <button 
                            onClick={() => setShowPaperModal(false)}
                            style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--ops-text-muted)', cursor: 'pointer' }}
                        >
                            <X size={20} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#F59E0B', fontWeight: '900', fontSize: '0.8rem', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>
                            <FileText size={18} />
                            CHEQUEO MANUAL EN PAPEL
                        </div>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem', fontWeight: '900', color: 'var(--ops-text)' }}>
                            Anexar Planilla Física
                        </h3>
                        <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.8rem', color: 'var(--ops-text-muted)', lineHeight: '1.4' }}>
                            Registra la persona responsable del conteo y sube una fotografía legible de la planilla física de cargue.
                        </p>

                        {/* Nombre de Responsable (Autocompletado de Sesión) */}
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--ops-text-muted)' }}>
                                    Responsable del Chequeo *
                                </label>
                                <span style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--ops-primary)', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '6px' }}>
                                    ✓ Sesión Activa
                                </span>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <UserCheck size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ops-primary)' }} />
                                <input 
                                    type="text" 
                                    placeholder="Cargando nombre del usuario..."
                                    value={checkerName}
                                    onChange={e => setCheckerName(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.65rem 0.75rem 0.65rem 2.4rem',
                                        borderRadius: '12px',
                                        border: '1px solid var(--ops-primary)',
                                        backgroundColor: 'var(--ops-bg)',
                                        color: 'var(--ops-text)',
                                        fontSize: '0.85rem',
                                        fontWeight: '800',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Cargar Fotografía */}
                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                                Foto de la Planilla Física *
                            </label>
                            
                            <input 
                                type="file" 
                                accept="image/*" 
                                capture="environment"
                                ref={fileInputRef}
                                onChange={handlePhotoUpload}
                                style={{ display: 'none' }}
                            />

                            {paperPhotoUrl ? (
                                <div style={{ position: 'relative', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--ops-primary)', maxHeight: '200px' }}>
                                    <img src={paperPhotoUrl} alt="Planilla física" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    <button 
                                        onClick={() => setPaperPhotoUrl(null)}
                                        style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', padding: '4px', cursor: 'pointer' }}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        width: '100%',
                                        padding: '1.5rem',
                                        borderRadius: '14px',
                                        border: '2px dashed var(--ops-border)',
                                        backgroundColor: 'var(--ops-bg)',
                                        color: 'var(--ops-text-muted)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '8px',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Camera size={24} color="#F59E0B" />
                                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--ops-text)' }}>
                                        {uploadingPhoto ? 'Procesando imagen...' : 'Tomar Foto o Cargar Imagen'}
                                    </span>
                                </button>
                            )}
                        </div>

                        {/* Botón de Paso a Certificación */}
                        <button
                            onClick={proceedToCertificationFromPaper}
                            disabled={!checkerName.trim() || !paperPhotoUrl}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '12px',
                                border: 'none',
                                backgroundColor: checkerName.trim() && paperPhotoUrl ? '#F59E0B' : 'var(--ops-border)',
                                color: checkerName.trim() && paperPhotoUrl ? 'black' : 'var(--ops-text-muted)',
                                fontWeight: '900',
                                fontSize: '0.85rem',
                                cursor: checkerName.trim() && paperPhotoUrl ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                        >
                            <ShieldCheck size={16} /> CONTINUAR A CERTIFICACIÓN DE RUTA
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL 2: CERTIFICACIÓN Y DECLARACIÓN DE SALIDA DE RUTA COMPLETA */}
            {showCertificationModal && (
                <div style={{ 
                    position: 'fixed', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    bottom: 0, 
                    backgroundColor: 'rgba(0,0,0,0.85)', 
                    backdropFilter: 'blur(8px)',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    zIndex: 220,
                    padding: '1rem'
                }}>
                    <div style={{ 
                        backgroundColor: 'var(--ops-surface)', 
                        borderRadius: '24px', 
                        border: `1px solid ${totalShortagesCount > 0 ? '#F59E0B' : '#10B981'}`, 
                        padding: '1.75rem',
                        maxWidth: '560px',
                        width: '100%',
                        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                        position: 'relative',
                        maxHeight: '90vh',
                        overflowY: 'auto'
                    }}>
                        <button 
                            onClick={() => setShowCertificationModal(false)}
                            style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--ops-text-muted)', cursor: 'pointer' }}
                        >
                            <X size={20} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: totalShortagesCount > 0 ? '#F59E0B' : '#10B981', fontWeight: '900', fontSize: '0.8rem', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                            <ShieldCheck size={20} />
                            COMPUERTA SHIFT-LEFT · CERTIFICACIÓN Y SALIDA
                        </div>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.4rem', fontWeight: '900', color: 'var(--ops-text)', letterSpacing: '-0.02em' }}>
                            Certificación de Salida a Transporte
                        </h3>
                        <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.82rem', color: 'var(--ops-text-muted)', lineHeight: '1.4' }}>
                            Revisa el balance final de cargue antes de autorizar la salida del vehículo <strong style={{ color: 'var(--ops-text)' }}>{vehiclePlate}</strong>.
                        </p>

                        {/* Tarjeta Resumen de Auditoría */}
                        <div style={{ 
                            backgroundColor: 'var(--ops-bg)', 
                            borderRadius: '16px', 
                            border: '1px solid var(--ops-border)', 
                            padding: '1rem',
                            marginBottom: '1.25rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.65rem'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                <span style={{ color: 'var(--ops-text-muted)', fontWeight: '700' }}>👤 AUDITOR EN MUELLE:</span>
                                <span style={{ color: 'var(--ops-primary)', fontWeight: '900' }}>{checkerName || 'Usuario en Sesión'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                <span style={{ color: 'var(--ops-text-muted)', fontWeight: '700' }}>🚚 VEHÍCULO Y CONDUCTOR:</span>
                                <span style={{ color: 'var(--ops-text)', fontWeight: '900' }}>{vehiclePlate} ({driverName})</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                <span style={{ color: 'var(--ops-text-muted)', fontWeight: '700' }}>📷 MÉTODO DE CHEQUEO:</span>
                                <span style={{ color: paperPhotoUrl ? '#F59E0B' : '#10B981', fontWeight: '900' }}>
                                    {paperPhotoUrl ? 'Planilla Física (Foto Adjunta)' : 'Checklist Digital en Muelle'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                <span style={{ color: 'var(--ops-text-muted)', fontWeight: '700' }}>📦 PEDIDOS RECTIFICADOS:</span>
                                <span style={{ color: 'var(--ops-primary)', fontWeight: '900' }}>{stops.length} de {stops.length} Paradas</span>
                            </div>
                        </div>

                        {/* Resumen de Novedades de Escasez Detectadas */}
                        {allShortages.length > 0 && (
                            <div style={{ 
                                backgroundColor: 'rgba(245, 158, 11, 0.08)', 
                                border: '1px solid rgba(245, 158, 11, 0.35)', 
                                borderRadius: '16px', 
                                padding: '1rem', 
                                marginBottom: '1.25rem' 
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#F59E0B', fontWeight: '900', fontSize: '0.8rem' }}>
                                        <AlertTriangle size={16} />
                                        <span>Novedades a Radicar en Gestión de Calidad ({allShortages.length}):</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const affectedOrderIds = Array.from(new Set(allShortages.map(s => s.order_id)));
                                            window.open(`/admin/orders/contingency-print?mode=remissions&orderIds=${affectedOrderIds.join(',')}`, '_blank');
                                        }}
                                        style={{
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            backgroundColor: '#0F172A',
                                            border: '1px solid #38BDF8',
                                            color: '#38BDF8',
                                            fontSize: '0.72rem',
                                            fontWeight: '800',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                        title="Abrir remisiones corregidas para impresión física"
                                    >
                                        <Printer size={12} /> Imprimir Remisiones Corregidas
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                                    {allShortages.map((sh, idx) => (
                                        <div key={idx} style={{ 
                                            backgroundColor: 'rgba(0,0,0,0.25)', 
                                            borderRadius: '8px', 
                                            padding: '0.45rem 0.65rem', 
                                            fontSize: '0.74rem',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div>
                                                <strong style={{ color: '#FCD34D' }}>{sh.product_name}</strong>
                                                <span style={{ color: 'var(--ops-text-muted)', marginLeft: '6px' }}>({sh.customer_name})</span>
                                            </div>
                                            <div style={{ color: '#F59E0B', fontWeight: '900' }}>
                                                -{sh.missing_quantity} {sh.unit} (Cargó {sh.actual_quantity})
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ fontSize: '0.7rem', color: '#FCD34D', marginTop: '0.6rem', lineHeight: '1.3' }}>
                                    ✓ Se insertará ticket en Calidad (RCA: <em>Desabastecimiento en Plaza</em>) imputado a Compras.<br/>
                                    ✓ La facturación se generará por el valor neto exacto sin requerir notas crédito posteriores.
                                </div>
                            </div>
                        )}

                        {/* Declaración de Responsabilidad (Checkbox obligatorio) */}
                        <label style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            backgroundColor: totalShortagesCount > 0 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                            border: `1px solid ${totalShortagesCount > 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                            padding: '0.85rem',
                            borderRadius: '14px',
                            cursor: 'pointer',
                            marginBottom: '1.5rem'
                        }}>
                            <input 
                                type="checkbox" 
                                checked={certifiedAgreed} 
                                onChange={e => setCertifiedAgreed(e.target.checked)}
                                style={{ marginTop: '3px', cursor: 'pointer', accentColor: totalShortagesCount > 0 ? '#F59E0B' : '#10B981', width: '18px', height: '18px' }}
                            />
                            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--ops-text)', lineHeight: '1.35' }}>
                                Certifico formalmente que he auditado el cargue del camión <strong style={{ color: totalShortagesCount > 0 ? '#F59E0B' : 'var(--ops-primary)' }}>{vehiclePlate}</strong>, confirmo que las cantidades declaradas coinciden con el furgón y autorizo la salida a reparto.
                            </span>
                        </label>

                        {/* Botones de Acción */}
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                type="button"
                                onClick={() => setShowCertificationModal(false)}
                                style={{
                                    flex: 1,
                                    padding: '0.75rem',
                                    borderRadius: '12px',
                                    border: '1px solid var(--ops-border)',
                                    backgroundColor: 'transparent',
                                    color: 'var(--ops-text-muted)',
                                    fontWeight: '800',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Volver a Revisar
                            </button>

                            <button
                                type="button"
                                onClick={finalizeCertification}
                                disabled={!certifiedAgreed || submittingCertification}
                                style={{
                                    flex: 2,
                                    padding: '0.75rem',
                                    borderRadius: '12px',
                                    border: 'none',
                                    backgroundColor: certifiedAgreed ? (totalShortagesCount > 0 ? '#D97706' : '#10B981') : 'var(--ops-border)',
                                    color: certifiedAgreed ? 'white' : 'var(--ops-text-muted)',
                                    fontWeight: '900',
                                    fontSize: '0.85rem',
                                    cursor: certifiedAgreed && !submittingCertification ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    boxShadow: certifiedAgreed ? '0 4px 14px rgba(0,0,0,0.4)' : 'none'
                                }}
                            >
                                <Truck size={16} /> {submittingCertification ? 'CERTIFICANDO Y RADICANDO...' : '✓ CONFIRMAR Y ENVIAR A TRANSPORTE'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
