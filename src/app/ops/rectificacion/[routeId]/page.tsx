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
  AlertTriangle
} from 'lucide-react';

interface MerchandiseItem {
    id: string;
    product_name: string;
    quantity: number;
    unit: string;
    checked: boolean;
}

interface OrderStop {
    id: string;
    order_id: string;
    customer_name: string;
    stop_number: number;
    location: string;
    crates_count: number;
    items: MerchandiseItem[];
    is_validated: boolean;
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

    // Modal Certificación de Salida Completa
    const [showCertificationModal, setShowCertificationModal] = useState(false);
    const [certifiedAgreed, setCertifiedAgreed] = useState(false);
    const [submittingCertification, setSubmittingCertification] = useState(false);

    // Autocompletar nombre de usuario desde la sesión activa
    useEffect(() => {
        if (profile) {
            const activeUserDisplayName = profile.contact_name || profile.company_name || profile.email || '';
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
            // Attempt to load from Supabase
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

            // Mock Data LIFO ordered (Reverse stop numbers 25 to 1)
            const mockStops: OrderStop[] = [
                {
                    id: 'stop-25',
                    order_id: 'ord-25',
                    customer_name: 'ADR WORK SAS - HOTEL SPOT CENTRO',
                    stop_number: 25,
                    location: 'ESP 32',
                    crates_count: 14,
                    is_validated: false,
                    items: [
                        { id: 'i1', product_name: 'Ciruela nacional', quantity: 24, unit: 'Kg', checked: false },
                        { id: 'i2', product_name: 'Esparragos', quantity: 47, unit: 'Kg', checked: false },
                        { id: 'i3', product_name: 'Lechuga romana', quantity: 49, unit: 'Kg', checked: false },
                        { id: 'i4', product_name: 'Perejil crespo', quantity: 53, unit: 'Kg', checked: false },
                        { id: 'i5', product_name: 'Naranja extra', quantity: 56, unit: 'Kg', checked: false },
                        { id: 'i6', product_name: 'Ruibarbo', quantity: 30, unit: 'Kg', checked: false }
                    ]
                },
                {
                    id: 'stop-24',
                    order_id: 'ord-24',
                    customer_name: 'PEÑA INVESTMENTS S.A.S - LA MAR',
                    stop_number: 24,
                    location: 'ESP 18',
                    crates_count: 8,
                    is_validated: false,
                    items: [
                        { id: 'i7', product_name: 'Aguacate papelillo', quantity: 37, unit: 'Kg', checked: false },
                        { id: 'i8', product_name: 'Platano verde institucional', quantity: 38, unit: 'Kg', checked: false },
                        { id: 'i9', product_name: 'Tomate chonto', quantity: 25, unit: 'Kg', checked: false }
                    ]
                },
                {
                    id: 'stop-23',
                    order_id: 'ord-23',
                    customer_name: 'INDUSTRIA DE RESTAURANTES CASUALES',
                    stop_number: 23,
                    location: 'ESP 05',
                    crates_count: 22,
                    is_validated: false,
                    items: [
                        { id: 'i10', product_name: 'Limon Tahiti extra', quantity: 60, unit: 'Kg', checked: false },
                        { id: 'i11', product_name: 'Cebolla cabezona blanca', quantity: 100, unit: 'Kg', checked: false },
                        { id: 'i12', product_name: 'Papa sabanera seleccionada', quantity: 150, unit: 'Kg', checked: false }
                    ]
                }
            ];

            setStops(mockStops);
        } catch (e) {
            console.error('Error loading route rectification details:', e);
        } finally {
            setLoading(false);
        }
    };

    // Alternar ítem individual
    const toggleItem = (stopId: string, itemId: string) => {
        setStops(prev => prev.map(stop => {
            if (stop.id !== stopId) return stop;

            const updatedItems = stop.items.map(item => {
                if (item.id === itemId) {
                    return { ...item, checked: !item.checked };
                }
                return item;
            });

            const allChecked = updatedItems.every(i => i.checked);
            return {
                ...stop,
                items: updatedItems,
                is_validated: allChecked
            };
        }));
    };

    // Validar pedido completo digitalmente
    const validateWholeOrder = (stopId: string) => {
        setStops(prev => prev.map(stop => {
            if (stop.id !== stopId) return stop;
            const newStatus = !stop.is_validated;
            return {
                ...stop,
                is_validated: newStatus,
                items: stop.items.map(i => ({ ...i, checked: newStatus }))
            };
        }));
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

            // 1. Actualizar la ruta en Supabase con auditoría y nuevo estado de rectificación
            await supabase
                .from('routes')
                .update({ 
                    status: 'rectified',
                    check_evidence_url: paperPhotoUrl || null,
                    check_mode: mode,
                    rectified_by_id: profile?.id || null,
                    rectified_by_name: checkerName || profile?.contact_name || 'Usuario Activo',
                    rectified_at: now,
                    is_certified_complete: true
                })
                .eq('id', routeId);

            // 2. Actualizar sistemáticamente los pedidos de la ruta a 'ready_for_dispatch' en la base de datos
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
            alert(`🛡️ ¡CERTIFICACIÓN EXITOSA!\n\nLa ruta ${vehiclePlate} ha sido validada por ${checkerName || 'el usuario'} y liberada a Transporte.`);
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
                            Carga primero lo que entregarás al final para que quede al fondo del camión.
                        </p>
                    </div>
                </div>

                {/* Counter Pill Badge */}
                <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'flex-start' }}>
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
                </div>

                {/* Lista de Tarjetas LIFO */}
                {stops.map(stop => (
                    <div 
                        key={stop.id}
                        style={{
                            backgroundColor: 'var(--ops-surface)',
                            borderRadius: '20px',
                            border: `1px solid ${stop.is_validated ? 'rgba(16, 185, 129, 0.4)' : 'var(--ops-border)'}`,
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
                                    color: stop.is_validated ? 'var(--ops-primary)' : 'var(--ops-text-muted)',
                                    marginTop: '2px'
                                }}
                                title="Marcar todo el pedido como validado"
                            >
                                {stop.is_validated ? (
                                    <CheckCircle2 size={26} fill="rgba(16, 185, 129, 0.2)" />
                                ) : (
                                    <Circle size={26} />
                                )}
                            </button>

                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '900', fontSize: '1.05rem', color: 'var(--ops-text)', letterSpacing: '-0.01em' }}>
                                    {stop.customer_name}
                                </div>
                                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--ops-text-muted)', marginTop: '2px' }}>
                                    Parada #{stop.stop_number} de la ruta
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
                                </div>
                            </div>
                        </div>

                        {/* Contenido / Mercancía a Cargar */}
                        <div style={{ 
                            backgroundColor: 'var(--ops-bg)', 
                            borderRadius: '14px', 
                            padding: '1rem',
                            border: '1px solid var(--ops-border)'
                        }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: '900', color: 'var(--ops-text-muted)', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                                MERCANCÍA A CARGAR
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                {stop.items.map(item => (
                                    <div 
                                        key={item.id}
                                        onClick={() => toggleItem(stop.id, item.id)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.5rem 0.75rem',
                                            borderRadius: '10px',
                                            backgroundColor: item.checked ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                                            border: `1px solid ${item.checked ? 'rgba(16, 185, 129, 0.25)' : 'transparent'}`,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ 
                                                width: '18px', 
                                                height: '18px', 
                                                borderRadius: '4px', 
                                                border: `1.5px solid ${item.checked ? 'var(--ops-primary)' : 'var(--ops-text-muted)'}`,
                                                backgroundColor: item.checked ? 'var(--ops-primary)' : 'transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white'
                                            }}>
                                                {item.checked && <Check size={12} strokeWidth={3} />}
                                            </div>
                                            <span style={{ 
                                                fontSize: '0.85rem', 
                                                fontWeight: '800', 
                                                color: item.checked ? 'var(--ops-primary)' : 'var(--ops-text)',
                                                textDecoration: item.checked ? 'line-through' : 'none',
                                                opacity: item.checked ? 0.85 : 1
                                            }}>
                                                {item.product_name}
                                            </span>
                                        </div>

                                        <span style={{ 
                                            fontSize: '0.85rem', 
                                            fontWeight: '900', 
                                            color: item.checked ? 'var(--ops-primary)' : 'var(--ops-text)' 
                                        }}>
                                            {item.checked ? item.quantity : 0} / {item.quantity} {item.unit}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Sticky Bottom Bar (Posicionada por encima del nav footer) */}
            <div style={{ 
                position: 'fixed', 
                bottom: 'calc(54px + env(safe-area-inset-bottom, 0px))', 
                left: 0, 
                right: 0, 
                backgroundColor: isFullyValidated ? '#065F46' : '#111827',
                borderTop: '1px solid var(--ops-border)',
                borderBottom: '1px solid rgba(0,0,0,0.5)',
                padding: '0.75rem 1rem',
                textAlign: 'center',
                zIndex: 95,
                boxShadow: '0 -6px 25px rgba(0,0,0,0.35)',
                transition: 'background-color 0.3s'
            }}>
                <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ fontWeight: '900', fontSize: '0.9rem', color: 'white', letterSpacing: '0.04em' }}>
                        {isFullyValidated ? '¡CARGUE 100% RECTIFICADO!' : `FALTAN ${remainingStops} PEDIDOS POR VALIDAR`}
                    </div>

                    {isFullyValidated && (
                        <button
                            onClick={proceedToCertificationDigital}
                            style={{
                                padding: '0.6rem 1.25rem',
                                borderRadius: '12px',
                                border: 'none',
                                backgroundColor: '#10B981',
                                color: 'white',
                                fontWeight: '900',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)'
                            }}
                        >
                            <ShieldCheck size={16} /> PASAR A CERTIFICACIÓN Y TRANSPORTE
                        </button>
                    )}
                </div>
            </div>

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
                    backgroundColor: 'rgba(0,0,0,0.82)', 
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
                        border: '1px solid #10B981', 
                        padding: '1.75rem',
                        maxWidth: '520px',
                        width: '100%',
                        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                        position: 'relative'
                    }}>
                        <button 
                            onClick={() => setShowCertificationModal(false)}
                            style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--ops-text-muted)', cursor: 'pointer' }}
                        >
                            <X size={20} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10B981', fontWeight: '900', fontSize: '0.8rem', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                            <ShieldCheck size={20} />
                            SEGUNDA VERIFICACIÓN - DECLARACIÓN FORMAL
                        </div>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.4rem', fontWeight: '900', color: 'var(--ops-text)', letterSpacing: '-0.02em' }}>
                            Certificación de Ruta Completa
                        </h3>
                        <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.85rem', color: 'var(--ops-text-muted)', lineHeight: '1.4' }}>
                            Por favor revisa y confirma que la mercancía sale 100% verificada antes de liberar el camión al módulo de Transporte.
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
                                <span style={{ color: 'var(--ops-text-muted)', fontWeight: '700' }}>👤 REVISADO Y CERTIFICADO POR:</span>
                                <span style={{ color: 'var(--ops-primary)', fontWeight: '900' }}>{checkerName || 'Usuario en Sesión'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                <span style={{ color: 'var(--ops-text-muted)', fontWeight: '700' }}>🚚 VEHÍCULO Y CONDUCTOR:</span>
                                <span style={{ color: 'var(--ops-text)', fontWeight: '900' }}>{vehiclePlate} ({driverName})</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                <span style={{ color: 'var(--ops-text-muted)', fontWeight: '700' }}>📷 EVIDENCIA ADJUNTA:</span>
                                <span style={{ color: paperPhotoUrl ? '#F59E0B' : '#10B981', fontWeight: '900' }}>
                                    {paperPhotoUrl ? 'Planilla Física (Foto Adjunta)' : 'Checklist Digital de Pantalla'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                <span style={{ color: 'var(--ops-text-muted)', fontWeight: '700' }}>🕒 FECHA Y HORA DE REGISTRO:</span>
                                <span style={{ color: 'var(--ops-text-muted)', fontWeight: '700' }}>{new Date().toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Declaración de Responsabilidad (Checkbox obligatorio) */}
                        <label style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            backgroundColor: 'rgba(16, 185, 129, 0.08)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            padding: '0.85rem',
                            borderRadius: '14px',
                            cursor: 'pointer',
                            marginBottom: '1.5rem'
                        }}>
                            <input 
                                type="checkbox" 
                                checked={certifiedAgreed} 
                                onChange={e => setCertifiedAgreed(e.target.checked)}
                                style={{ marginTop: '3px', cursor: 'pointer', accentColor: '#10B981', width: '18px', height: '18px' }}
                            />
                            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--ops-text)', lineHeight: '1.35' }}>
                                Certifico formalmente que he auditado el cargue del camión <strong style={{ color: 'var(--ops-primary)' }}>{vehiclePlate}</strong> y confirmo que la ruta sale completa según especificación.
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
                                    backgroundColor: certifiedAgreed ? '#10B981' : 'var(--ops-border)',
                                    color: certifiedAgreed ? 'white' : 'var(--ops-text-muted)',
                                    fontWeight: '900',
                                    fontSize: '0.85rem',
                                    cursor: certifiedAgreed && !submittingCertification ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    boxShadow: certifiedAgreed ? '0 4px 14px rgba(16, 185, 129, 0.4)' : 'none'
                                }}
                            >
                                <Truck size={16} /> {submittingCertification ? 'CERTIFICANDO...' : '✓ CONFIRMAR Y ENVIAR A TRANSPORTE'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
