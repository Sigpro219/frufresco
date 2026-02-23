'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface Purchase {
    id: string;
    quantity: number;
    purchase_unit: string;
    pickup_location: string;
    estimated_pickup_time: string;
    status: string;
    voucher_image_url?: string;
    picked_up_quantity?: number;
    product?: {
        name: string;
        unit_of_measure: string;
        category: string;
    };
    provider?: {
        name: string;
    };
}

export default function RecogidaPage() {
    const [loading, setLoading] = useState(true);
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [sections] = useState<string[]>(['Frutas', 'Verduras', 'Lácteos', 'Abarrotes', 'Carnes']);
    const [selectedSection, setSelectedSection] = useState<string>('Frutas');
    const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);

    // Pickup Form State
    const [receivedQty, setReceivedQty] = useState<string>('');
    const [quality, setQuality] = useState<'green' | 'yellow' | 'red' | null>(null);
    const [notes, setNotes] = useState('');
    const [processing, setProcessing] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [showRejectionOptions, setShowRejectionOptions] = useState(false);

    const router = useRouter();

    const fetchPurchases = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch pending pickups
            const now = new Date().toISOString();

            const { data, error } = await supabase
                .from('purchases')
                .select(`
                    *,
                    product:products (
                        name,
                        unit_of_measure,
                        category
                    ),
                    provider:providers (
                        name
                    )
                `)
                .or('status.eq.pending_pickup,status.eq.partial_pickup,status.eq.picked_up,status.eq.rejected') // Only active tasks
                .lte('estimated_pickup_time', now) // Time filter
                .order('estimated_pickup_time', { ascending: true });

            if (error) throw error;

            // Client-side filter by Section
            const filtered = (data || []).filter((p: Purchase) =>
                p.product?.category?.toLowerCase() === selectedSection.toLowerCase() ||
                (selectedSection === 'Todos')
            );

            // Sort: Partial (Urgent) first, then Pending, then Done, then Rejected (Last)
            filtered.sort((a: Purchase, b: Purchase) => {
                const score = (s: string) => {
                    if (s === 'partial_pickup') return 0; // Top priority (Yellow)
                    if (s === 'pending_pickup') return 1;
                    if (s === 'picked_up') return 2;
                    return 3; // Rejected (Red) - Last
                };
                return score(a.status) - score(b.status);
            });

            setPurchases(filtered);
        } catch (err: unknown) {
            console.error('Error fetching pickups:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedSection]);

    useEffect(() => {
        fetchPurchases();
        const interval = setInterval(fetchPurchases, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, [fetchPurchases]);

    const handlePickupSubmit = async (status: 'picked_up' | 'partial_pickup' | 'rejected', rejectionReason?: string) => {
        if (!selectedPurchase) return;
        setFormError(null);

        // For rejection, we don't need quality check unless manually required, but let's clear validation if rejected
        // If status is NOT rejected, quality is mandatory
        if (status !== 'rejected' && !quality) {
            setFormError('Debes indicar la calidad del producto antes de confirmar.');
            return;
        }

        setProcessing(true);

        try {
            // Auto-detect Partial Status
            let finalStatus = status;
            const enteredQty = parseFloat(receivedQty || '0');

            // If user clicked standard confirm but quantity is less than requested, force partial
            if (status === 'picked_up' && enteredQty < selectedPurchase.quantity) {
                finalStatus = 'partial_pickup';
            }

            const updatePayload: Record<string, any> = {
                status: finalStatus,
                picked_up_quantity: enteredQty,
                quality_status: quality,
                quality_notes: notes,
                rejection_reason: rejectionReason || null,
            };

            const { error } = await supabase
                .from('purchases')
                .update(updatePayload)
                .eq('id', selectedPurchase.id);

            if (error) throw error;

            alert(status === 'rejected' ? 'Producto marcado como NO RECIBIDO.' : 'Recogida registrada correctamente.');
            setSelectedPurchase(null);
            fetchPurchases();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error desconocido';
            alert('Error al guardar recogida: ' + message);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div style={{ padding: '1rem', paddingBottom: '5rem', backgroundColor: 'var(--ops-bg)', minHeight: '100vh' }}>
            {/* Título y Botón */}
            <div style={{
                backgroundColor: '#1F2937',
                margin: '-1rem -1rem 1rem -1rem',
                padding: '1.5rem 1rem',
                borderRadius: '0 0 24px 24px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h1
                    onClick={() => router.push('/ops')}
                    style={{ fontSize: '1.8rem', fontWeight: '900', color: 'white', margin: 0, cursor: 'pointer' }}
                >
                    🛒 Interno <span style={{ opacity: 0.7, fontWeight: '400' }}>/</span> Recogidas
                </h1>
                <button
                    onClick={fetchPurchases}
                    disabled={loading}
                    style={{
                        backgroundColor: 'var(--ops-primary)',
                        color: 'white',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: '800',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                        cursor: 'pointer',
                        opacity: loading ? 0.7 : 1
                    }}
                >
                    {loading ? '...' : '🔄 REFRESCAR'}
                </button>
            </div>

            {/* General Progress Bar */}
            {purchases.length > 0 && (() => {
                const total = purchases.length;
                const completed = purchases.filter(p => p.status === 'picked_up' || p.status === 'rejected').length;
                const progress = Math.round((completed / total) * 100);

                return (
                    <div style={{ width: '100%', marginBottom: '1.5rem', padding: '0 0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: '700', color: '#4B5563' }}>
                            <span>Avance del Turno</span>
                            <span>{progress}%</span>
                        </div>
                        <div style={{ width: '100%', height: '10px', backgroundColor: '#E5E7EB', borderRadius: '5px', overflow: 'hidden', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                            <div style={{
                                width: `${progress}%`,
                                height: '100%',
                                backgroundImage: progress === 100
                                    ? 'linear-gradient(90deg, #10B981, #34D399)'
                                    : 'linear-gradient(90deg, #3B82F6, #06B6D4)',
                                borderRadius: '5px',
                                transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                            }} />
                        </div>
                    </div>
                );
            })()}

            {/* Dashboard Setback */}
            {purchases.length > 0 && (() => {
                const pending = purchases.filter(p => p.status === 'pending_pickup').length;
                const partial = purchases.filter(p => p.status === 'partial_pickup').length;
                const done = purchases.filter(p => p.status === 'picked_up' || p.status === 'rejected').length;

                return (
                    <div style={{
                        backgroundColor: 'white',
                        padding: '0.8rem',
                        borderRadius: '16px',
                        marginBottom: '1.5rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                        display: 'flex',
                        justifyContent: 'space-around',
                        alignItems: 'center'
                    }}>
                        {/* Pendientes */}
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#9CA3AF' }}>{pending}</div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase' }}>Pendientes</div>
                        </div>

                        {/* En Proceso */}
                        <div style={{ textAlign: 'center', position: 'relative' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#F59E0B' }}>{partial}</div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#F59E0B', textTransform: 'uppercase' }}>En Proceso</div>
                        </div>

                        {/* Completados */}
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#10B981' }}>{done}</div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#10B981', textTransform: 'uppercase' }}>Listos</div>
                        </div>
                    </div>
                );
            })()}

            {/* Section Filter */}
            <div style={{ marginBottom: '1.5rem', overflowX: 'auto', display: 'flex', gap: '0.5rem', paddingBottom: '0.5rem' }}>
                {sections.map(sec => (
                    <button
                        key={sec}
                        onClick={() => setSelectedSection(sec)}
                        style={{
                            padding: '0.6rem 1.2rem',
                            borderRadius: '20px',
                            border: 'none',
                            fontWeight: '700',
                            backgroundColor: selectedSection === sec ? '#3B82F6' : 'white',
                            color: selectedSection === sec ? 'white' : '#6B7280',
                            whiteSpace: 'nowrap',
                            boxShadow: selectedSection === sec ? '0 4px 6px rgba(59, 130, 246, 0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
                            transition: 'all 0.2s'
                        }}
                    >
                        {sec}
                    </button>
                ))}
            </div>

            {/* Tasks List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6B7280' }}>Cargando recogidas...</div>
            ) : purchases.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', backgroundColor: 'white', borderRadius: '16px' }}>
                    <div style={{ fontSize: '3rem' }}>👌</div>
                    <p style={{ fontWeight: '600', color: '#374151' }}>Todo al día en {selectedSection}</p>
                    <p style={{ fontSize: '0.9rem', color: '#9CA3AF' }}>No hay recogidas pendientes por ahora.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {purchases.map(p => {
                        const isDone = p.status === 'picked_up';
                        const isPartial = p.status === 'partial_pickup';
                        const isRejected = p.status === 'rejected';

                        let borderColor = '#E5E7EB'; // Default for pending_pickup
                        let statusText = 'PENDIENTE';
                        let statusColor = '#9CA3AF';

                        if (isDone) {
                            borderColor = '#10B981'; // Green (Emerald-500)
                            statusText = 'COMPLETADO';
                            statusColor = '#10B981';
                        } else if (isPartial) {
                            borderColor = '#F59E0B'; // Yellow
                            statusText = 'PARCIAL';
                            statusColor = '#F59E0B';
                        } else if (isRejected) {
                            borderColor = '#EF4444'; // Red
                            statusText = 'NO RECIBIDO';
                            statusColor = '#EF4444';
                        }

                        return (
                            <div
                                key={p.id}
                                onClick={() => {
                                    setSelectedPurchase(p);
                                    setReceivedQty(p.quantity.toString());
                                    setQuality(null);
                                    setNotes('');
                                    setProcessing(false);
                                    setShowRejectionOptions(false);
                                    setFormError(null);
                                }}
                                style={{
                                    backgroundColor: 'white',
                                    borderRadius: '16px',
                                    padding: '1rem',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                    display: 'grid',
                                    gridTemplateColumns: '80px 1fr',
                                    gap: '1rem',
                                    borderLeft: `6px solid ${borderColor}`,
                                    opacity: (isDone || isRejected) ? 0.85 : 1,
                                    cursor: 'pointer', // Always pointer
                                    position: 'relative', // For potential overlay
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {/* Voucher Thumb */}
                                <div style={{
                                    width: '80px', height: '80px',
                                    borderRadius: '12px', overflow: 'hidden',
                                    backgroundColor: '#F3F4F6',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {p.voucher_image_url ? (
                                        <img src={p.voucher_image_url} alt="Vale" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <span style={{ fontSize: '1.5rem' }}>📄</span>
                                    )}
                                </div>

                                {/* Info */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#1F2937' }}>
                                            {p.product?.name}
                                        </h3>
                                        <span style={{ fontSize: '0.7rem', fontWeight: '900', color: statusColor }}>{statusText}</span>
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: '#4B5563', marginBottom: '0.5rem' }}>
                                        <span style={{ fontWeight: '800', color: '#111827' }}>
                                            {p.status === 'picked_up' ? p.picked_up_quantity : p.quantity} {p.purchase_unit}
                                        </span>
                                        {isPartial && <span style={{ marginLeft: '0.5rem', color: '#F59E0B', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                            (Faltan {parseFloat((p.quantity - (p.picked_up_quantity || 0)).toFixed(2))})
                                        </span>}
                                    </div>

                                    {/* Progress Bar */}
                                    {(isPartial || isDone) && (
                                        <div style={{ marginBottom: '0.5rem' }}>
                                            <div style={{ width: '100%', height: '8px', backgroundColor: '#E5E7EB', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{
                                                    width: `${Math.min(100, ((p.picked_up_quantity || 0) / p.quantity) * 100)}%`,
                                                    height: '100%',
                                                    backgroundColor: isDone ? '#10B981' : '#F59E0B',
                                                    borderRadius: '4px',
                                                    transition: 'width 0.3s ease'
                                                }} />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.7rem', color: '#6B7280', marginTop: '0.2rem' }}>
                                                <span>{Math.round(((p.picked_up_quantity || 0) / p.quantity) * 100)}%</span>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ fontSize: '0.9rem', color: '#4B5563', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.3rem' }}>
                                        🏢 <span>{p.provider?.name || 'Proveedor desconocido'}</span>
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: '#4B5563', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.3rem' }}>
                                        📍 <span>{p.pickup_location || 'Ubicación desconocida'}</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#6B7280', marginTop: '0.3rem', fontWeight: '500' }}>
                                        🕒 Disponible hace {Math.floor((new Date().getTime() - new Date(p.estimated_pickup_time).getTime()) / 60000)} min
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Modal de Recogida */}
            {selectedPurchase && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        width: '100%', maxWidth: '600px',
                        borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
                        padding: '1.5rem',
                        animation: 'slideUp 0.3s ease-out',
                        maxHeight: '90vh', overflowY: 'auto'
                    }}>
                        {selectedPurchase.status === 'picked_up' || selectedPurchase.status === 'rejected' ? (
                            <div style={{
                                padding: '2rem 1.5rem',
                                textAlign: 'center',
                                backgroundColor: selectedPurchase.status === 'picked_up' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                border: `1px solid ${selectedPurchase.status === 'picked_up' ? '#10B981' : '#EF4444'}`,
                                borderRadius: '16px'
                            }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
                                    {selectedPurchase.status === 'picked_up' ? '✅' : '🚫'}
                                </div>
                                <h3 style={{
                                    color: selectedPurchase.status === 'picked_up' ? '#10B981' : '#EF4444',
                                    margin: '0 0 0.5rem 0',
                                    fontWeight: '900'
                                }}>
                                    {selectedPurchase.status === 'picked_up' ? '¡Recogida Finalizada!' : '¡Producto Rechazado!'}
                                </h3>
                                <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: 0 }}>
                                    {selectedPurchase.status === 'picked_up'
                                        ? `Ya se recogieron las ${selectedPurchase.picked_up_quantity} ${selectedPurchase.purchase_unit}. Tarea cerrada.`
                                        : 'El producto fue marcado como NO RECIBIDO.'
                                    }
                                </p>
                                <button
                                    onClick={() => setSelectedPurchase(null)}
                                    style={{
                                        marginTop: '1.5rem', width: '100%', padding: '1rem',
                                        borderRadius: '12px',
                                        backgroundColor: selectedPurchase.status === 'picked_up' ? '#10B981' : '#EF4444',
                                        color: 'white', border: 'none', fontWeight: 'bold'
                                    }}
                                >
                                    VOLVER A LA LISTA
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Header Modal */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                    <div>
                                        <h2 style={{ fontSize: '1.4rem', fontWeight: '900', margin: 0, color: '#1F2937' }}>Validar Recogida</h2>
                                        <p style={{ color: '#6B7280', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>{selectedPurchase.product?.name}</p>

                                        {/* Info Diferencia Cantidades */}
                                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
                                            <p style={{ margin: 0, color: '#4B5563' }}>
                                                Pedido: <span style={{ fontWeight: '800', color: '#1F2937' }}>{selectedPurchase.quantity} {selectedPurchase.purchase_unit}</span>
                                            </p>
                                            {(parseFloat(receivedQty || '0') < selectedPurchase.quantity) && (
                                                <p style={{ margin: 0, color: '#F59E0B' }}>
                                                    Faltan: <span style={{ fontWeight: '800' }}>{parseFloat((selectedPurchase.quantity - parseFloat(receivedQty || '0')).toFixed(2))} {selectedPurchase.purchase_unit}</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedPurchase(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#9CA3AF' }}>✕</button>
                                </div>

                                {/* Voucher Full */}
                                {selectedPurchase.voucher_image_url && (
                                    <div style={{ marginBottom: '1.5rem', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                                        <img src={selectedPurchase.voucher_image_url} alt="Vale" style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', backgroundColor: '#F9FAFB' }} />
                                        <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.8rem', color: '#6B7280', backgroundColor: '#F9FAFB' }}>
                                            Foto del Vale/Recibo
                                        </div>
                                    </div>
                                )}

                                {/* Form */}
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.5rem', color: '#374151' }}>Cantidad Recibida ({selectedPurchase.purchase_unit})</label>
                                    <input
                                        type="number"
                                        value={receivedQty}
                                        onChange={e => setReceivedQty(e.target.value)}
                                        style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', borderRadius: '12px', border: '2px solid #E5E7EB', fontWeight: 'bold', color: '#1F2937' }}
                                    />
                                </div>

                                {/* Semáforo Calidad */}
                                <div style={{ marginBottom: '2rem' }}>
                                    <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.8rem', color: '#374151', textAlign: 'center' }}>Calidad del Producto</label>
                                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                        <button
                                            onClick={() => {
                                                setQuality('green');
                                                setShowRejectionOptions(false);
                                            }}
                                            style={{
                                                width: '60px', height: '60px', borderRadius: '50%',
                                                backgroundColor: quality === 'green' ? '#10B981' : '#E5E7EB',
                                                border: quality === 'green' ? '4px solid #D1FAE5' : 'none',
                                                fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'all 0.2s', transform: quality === 'green' ? 'scale(1.1)' : 'scale(1)'
                                            }}
                                        >
                                            ✔
                                        </button>
                                        <button
                                            onClick={() => {
                                                setQuality('yellow');
                                                setShowRejectionOptions(false);
                                            }}
                                            style={{
                                                width: '60px', height: '60px', borderRadius: '50%',
                                                backgroundColor: quality === 'yellow' ? '#F59E0B' : '#E5E7EB',
                                                border: quality === 'yellow' ? '4px solid #FEF3C7' : 'none',
                                                fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'all 0.2s', transform: quality === 'yellow' ? 'scale(1.1)' : 'scale(1)'
                                            }}
                                        >
                                            ⚠
                                        </button>
                                        <button
                                            onClick={() => setQuality('red')}
                                            style={{
                                                width: '60px', height: '60px', borderRadius: '50%',
                                                backgroundColor: quality === 'red' ? '#EF4444' : '#E5E7EB',
                                                border: quality === 'red' ? '4px solid #FEE2E2' : 'none',
                                                fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'all 0.2s', transform: quality === 'red' ? 'scale(1.1)' : 'scale(1)'
                                            }}
                                        >
                                            ✖
                                        </button>
                                    </div>
                                    <div style={{ textAlign: 'center', marginTop: '0.5rem', fontWeight: '600', color: quality === 'green' ? '#10B981' : quality === 'yellow' ? '#F59E0B' : '#EF4444' }}>
                                        {quality === 'green' ? 'Conforme' : quality === 'yellow' ? 'Para Revisión' : quality === 'red' ? 'No Conforme' : ''}
                                    </div>

                                    {/* UX Improvement: Link Red Quality to Rejection */}
                                    {quality === 'red' && (
                                        <div style={{ textAlign: 'center', marginTop: '1rem', animation: 'fadeIn 0.3s' }}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowRejectionOptions(true); // Open rejection options directly
                                                }}
                                                style={{
                                                    background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C',
                                                    padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
                                                    fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem'
                                                }}
                                            >
                                                ⚠️ ¿Quieres rechazar el pedido?
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Form Error */}
                                {formError && (
                                    <div style={{
                                        padding: '1rem', backgroundColor: '#FEF2F2', borderRadius: '12px', border: '1px solid #FECACA',
                                        color: '#B91C1C', fontWeight: 'bold', textAlign: 'center', marginBottom: '1rem',
                                        fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                    }}>
                                        <span>⚠</span> {formError}
                                    </div>
                                )}

                                {/* Actions */}
                                {!showRejectionOptions ? (
                                    <div style={{ display: 'grid', gap: '1rem' }}>
                                        <button
                                            onClick={() => handlePickupSubmit('picked_up')}
                                            disabled={processing || !receivedQty || !quality}
                                            style={{
                                                width: '100%', padding: '1.2rem', borderRadius: '14px',
                                                backgroundColor: 'var(--ops-primary)', color: 'white', border: 'none',
                                                fontWeight: '900', fontSize: '1.1rem',
                                                opacity: (processing || !receivedQty || !quality) ? 0.5 : 1
                                            }}
                                        >
                                            {processing ? 'Guardando...' : 'Confirmar Recogida Total'}
                                        </button>

                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <button
                                                onClick={() => handlePickupSubmit('partial_pickup')}
                                                disabled={processing || !receivedQty || !quality}
                                                style={{
                                                    flex: 1, padding: '1rem', borderRadius: '12px',
                                                    backgroundColor: '#FEF3C7', color: '#D97706', border: 'none',
                                                    fontWeight: '700',
                                                    opacity: (processing || !receivedQty || !quality) ? 0.5 : 1
                                                }}
                                            >
                                                Parcial (Volveré)
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowRejectionOptions(true);
                                                }}
                                                disabled={processing}
                                                style={{
                                                    flex: 1, padding: '1rem', borderRadius: '12px',
                                                    backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none',
                                                    fontWeight: '700'
                                                }}
                                            >
                                                Rechazar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ animation: 'fadeIn 0.3s' }}>
                                        <h3 style={{ textAlign: 'center', color: '#DC2626', marginBottom: '1rem' }}>¿Por qué no se recibió?</h3>
                                        <div style={{ display: 'grid', gap: '0.8rem' }}>
                                            <button
                                                onClick={() => handlePickupSubmit('rejected', 'Sin Stock')}
                                                style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', fontWeight: 'bold' }}
                                            >
                                                📦 Proveedor Sin Stock
                                            </button>
                                            <button
                                                onClick={() => handlePickupSubmit('rejected', 'Mala Calidad')}
                                                style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', fontWeight: 'bold' }}
                                            >
                                                🥀 Mala Calidad / Feo
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const reason = prompt("Describe el motivo:");
                                                    if (reason) handlePickupSubmit('rejected', reason);
                                                }}
                                                style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#F3F4F6', color: '#4B5563', border: 'none', fontWeight: 'bold' }}
                                            >
                                                ✏️ Otro Motivo...
                                            </button>
                                            <button
                                                onClick={() => setShowRejectionOptions(false)}
                                                style={{ marginTop: '0.5rem', padding: '0.8rem', background: 'none', border: 'none', color: '#6B7280', textDecoration: 'underline' }}
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
            <style jsx global>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
}
