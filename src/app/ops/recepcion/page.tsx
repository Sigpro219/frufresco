'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { isAbortError } from '@/lib/errorUtils';

// Interfaces
interface Product {
    name: string;
    unit_of_measure: string;
    category: string;
}

interface Purchase {
    id: string;
    product_id: string;
    product: Product;
    quantity: number; // Cantidad original comprada
    picked_quantity?: number; // Cantidad recogida (si aplica)
    status: string;
    cost_center_id?: string;
    rejection_reason?: string;
    voucher_image_url?: string;
    provider?: {
        name: string;
    };
}

export default function ReceptionPage() {
    const [loading, setLoading] = useState(true);
    const [incomingItems, setIncomingItems] = useState<Purchase[]>([]);
    const [selectedItem, setSelectedItem] = useState<Purchase | null>(null);

    // Form States
    const [inputQty, setInputQty] = useState<string>('');
    const [attemptCount, setAttemptCount] = useState(0);
    const [attemptHistory, setAttemptHistory] = useState<{ value: number, status: 'valid' | 'invalid' }[]>([]);
    const [validationMessage, setValidationMessage] = useState<string | null>(null);
    const [qualityStatus, setQualityStatus] = useState<'green' | 'yellow' | 'red' | null>(null);
    const [showRejectionOptions, setShowRejectionOptions] = useState(false);
    const [processing, setProcessing] = useState(false);

    // Filter/Tab State
    const [activeTab, setActiveTab] = useState<'transport' | 'received'>('transport');
    const [activeCategory, setActiveCategory] = useState<string>('Todas');
    const router = useRouter();

    useEffect(() => {
        fetchIncoming();
        const interval = setInterval(fetchIncoming, 30000);
        return () => clearInterval(interval);
    }, [activeTab]);

    const fetchIncoming = async () => {
        setLoading(true);
        try {
            // Fetch ALL relevant statuses for Reception context to calculate global progress
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
                .in('status', [
                    'picked_up', 'partial_pickup', 'receiving',
                    'received_ok', 'received_review', 'received_rejected', 'received_partial'
                ])
                .order('created_at', { ascending: false });

            if (error) throw error;
            setIncomingItems(data || []);
        } catch (err) {
            if (isAbortError(err)) return;
            console.error('Error fetching incoming items:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleStartReception = async (item: Purchase) => {
        // Al hacer click, lo pasamos a "En Recepción" y abrimos modal
        try {
            if (item.status !== 'receiving') {
                await supabase
                    .from('purchases')
                    .update({ status: 'receiving' })
                    .eq('id', item.id);
                item.status = 'receiving'; // Update local
            }
            setSelectedItem(item);
            setInputQty('');
            setAttemptCount(0);
            setAttemptHistory([]);
            setValidationMessage(null);
            setQualityStatus(null);
            setShowRejectionOptions(false);
        } catch (err: unknown) {
            if (isAbortError(err)) return;
            console.error(err);
            alert('Error al iniciar recepción');
        }
    };

    const handleValidateQuantity = () => {
        if (!selectedItem || !inputQty) return;

        const measured = parseFloat(inputQty);
        // La "Verdad" es lo que recogió el transportador (si existe) o lo comprado
        const expected = selectedItem.picked_quantity || selectedItem.quantity;

        // Tolerancia pequeña por decimales
        const isValid = Math.abs(measured - expected) < 0.05 || measured > expected;

        // Registrar intento
        setAttemptHistory(prev => [...prev, { value: measured, status: isValid ? 'valid' : 'invalid' }]);

        if (isValid) {
            // Caso: Exacto o Exceso (Aceptable)
            // Pasar a Calidad
            setValidationMessage(null);
            setAttemptCount(0); // Reset
            // Aquí podríamos pasar directo a una vista de "Calidad",
            // por ahora usamos un flag o estado visual en el modal
            setValidationMessage('✅ Cantidad Correcta. Verifique Calidad.');
        } else {
            // Caso: Déficit (Falta mercancía)
            if (attemptCount === 0) {
                setAttemptCount(1);
                setValidationMessage('⚠️ Diferencia detectada. Por favor, pese nuevamente.');
                setInputQty(''); // Limpiar para obligar a re-escribir
            } else {
                // Segundo fallo
                setValidationMessage('🛑 Diferencia confirmada. Proceda con validación de excepción.');
            }
        }
    };

    const handleSubmitResult = async (finalStatus: string, finalReason?: string) => {
        if (!selectedItem) return;
        setProcessing(true);
        try {
            const updateData: Record<string, string> = { status: finalStatus };
            if (finalReason) updateData.rejection_reason = finalReason;

            // Use inputQty if available (as a number), otherwise fallback to the expected quantity
            const receivedQty = inputQty ? parseFloat(inputQty) : (selectedItem.picked_quantity || selectedItem.quantity);

            // 1. Update purchase status
            const { error: purchaseError } = await supabase
                .from('purchases')
                .update(updateData)
                .eq('id', selectedItem.id);

            if (purchaseError) throw purchaseError;

            // 2. Inventory Integration
            // If it's OK or Partial, add to available. If it's review, add to in_process.
            if (finalStatus !== 'received_rejected') {
                const { data: warehouseData } = await supabase.from('warehouses').select('id').limit(1).single();
                
                if (warehouseData) {
                    const statusTo = (finalStatus === 'received_ok') ? 'available' : 'in_process';
                    
                    await supabase.from('inventory_movements').insert([{
                        product_id: selectedItem.product_id,
                        warehouse_id: warehouseData.id,
                        quantity: receivedQty,
                        type: 'entry',
                        status_to: statusTo,
                        notes: `Ingreso por recepción: ${finalReason || 'OK'}`,
                        reference_type: 'purchase_reception',
                        reference_id: selectedItem.id
                    }]);
                }
            }

            window.showToast?.('Recepción registrada e inventario actualizado', 'success');
            setSelectedItem(null);
            fetchIncoming();
        } catch (err: unknown) {
            console.error('Error in handleSubmitResult:', err);
            const message = err instanceof Error ? err.message : 'Error desconocido';
            alert('Error al guardar recepción: ' + message);
        } finally {
            setProcessing(false);
        }
    };

    const handleCloseModal = async () => {
        if (!selectedItem) return;

        // Si el usuario cierra sin finalizar, devolvemos el item a "picked_up" (pendiente)
        // para que no quede bloqueado en "En Recepción"
        if (selectedItem.status === 'receiving') {
            await supabase
                .from('purchases')
                .update({ status: 'picked_up' })
                .eq('id', selectedItem.id);

            // Actualizar UI inmediatamente
            setIncomingItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, status: 'picked_up' } : i));
        }

        setShowRejectionOptions(false);
        setSelectedItem(null);
    };

    // Derived State
    const categories = ['Todas', ...Array.from(new Set(incomingItems.map(i => i.product.category))), 'Rechazados'];

    const visibleItems = incomingItems.filter(item => {
        // Special Filter: Rejecteds (Global)
        if (activeCategory === 'Rechazados') return item.status === 'received_rejected';

        // Category Filter
        if (activeCategory !== 'Todas' && item.product.category !== activeCategory) return false;

        // Tab Filter
        if (activeTab === 'transport') return ['picked_up', 'partial_pickup', 'receiving', 'received_partial'].includes(item.status);
        // 'received' tab
        return ['received_ok', 'received_review', 'received_rejected'].some(s => item.status.includes(s));
    }).sort((a, b) => {
        if (a.status === 'received_partial' && b.status !== 'received_partial') return -1;
        if (a.status !== 'received_partial' && b.status === 'received_partial') return 1;
        return 0;
    });

    // PENDIENTES: Lo que viene en camino (completo) o se está recibiendo ahora
    const pendingCount = incomingItems.filter(p => ['picked_up', 'receiving'].includes(p.status)).length;
    
    // PARCIALES: Lo que llegó incompleto del mercado O lo que recibió incompleto la bodega
    const partialCount = incomingItems.filter(p => ['partial_pickup', 'received_partial'].includes(p.status)).length;

    // ÉXITO: Recibido conforme
    const successCount = incomingItems.filter(p => ['received_ok', 'received_review'].includes(p.status)).length;
    
    // RECHAZO: No recibido en bodega
    const rejectedCount = incomingItems.filter(p => p.status === 'received_rejected').length;

    const completedCount = successCount + partialCount; // Definimos progreso como lo que ya entró (aunque sea parcial)
    const totalCount = incomingItems.length;
    
    // El progreso real hacia la meta de bodega (sin contar rechazados como "avance exitoso")
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    
    const successPct = totalCount > 0 ? (successCount / totalCount) * 100 : 0;
    const partialPct = totalCount > 0 ? (partialCount / totalCount) * 100 : 0;
    // El porcentaje restante es lo que falta (Transito + Rechazo)


    return (
        <div style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#F3F4F6', minHeight: '100vh' }}>

            {/* DARK HEADER SECTION */}
            <div style={{
                backgroundColor: '#111827',
                padding: '2rem 2rem 3rem 2rem',
                borderBottomLeftRadius: '32px',
                borderBottomRightRadius: '32px',
                color: 'white',
                marginBottom: '-2rem', // Overlap effect
                position: 'relative',
                zIndex: 10
            }}>
                {/* Title Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                    <div>
                        <h1
                            onClick={() => router.push('/ops')}
                            style={{ fontSize: '2.2rem', fontWeight: '900', margin: 0, cursor: 'pointer', letterSpacing: '-1px' }}
                        >
                            Recepción <span style={{ color: '#10B981' }}>Bodega</span>
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', opacity: 0.8, fontSize: '0.9rem' }}>
                            <span>📅</span>
                            <span>Entregas: <strong>Hoy</strong></span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        {/* Tabs as Pills */}
                        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', padding: '4px', borderRadius: '12px' }}>
                            <button
                                onClick={() => setActiveTab('transport')}
                                style={{
                                    padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', fontWeight: '700', cursor: 'pointer',
                                    background: activeTab === 'transport' ? '#10B981' : 'transparent',
                                    color: activeTab === 'transport' ? 'white' : '#9CA3AF',
                                    transition: 'all 0.2s'
                                }}
                            >
                                🚛 Tránsito
                            </button>
                            <button
                                onClick={() => setActiveTab('received')}
                                style={{
                                    padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', fontWeight: '700', cursor: 'pointer',
                                    background: activeTab === 'received' ? '#10B981' : 'transparent',
                                    color: activeTab === 'received' ? 'white' : '#9CA3AF',
                                    transition: 'all 0.2s'
                                }}
                            >
                                ✅ Historial
                            </button>
                        </div>

                        <button
                            onClick={fetchIncoming}
                            style={{
                                backgroundColor: '#374151', color: '#10B981', border: '1px solid #10B981',
                                padding: '0.5rem 1rem', borderRadius: '12px', fontWeight: '800', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}
                        >
                            🔄 REFRESCAR
                        </button>
                    </div>
                </div>

                {/* Progress Bar (Dark Theme) */}
                {totalCount > 0 && (
                    <div style={{ marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '700', color: '#D1D5DB' }}>
                            <span>AVANCE DEL TURNO</span>
                            <span style={{ color: '#10B981' }}>{progress}%</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', backgroundColor: '#374151', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                            {/* Success Segment */}
                            <div style={{
                                width: `${successPct}%`,
                                height: '100%',
                                backgroundImage: 'linear-gradient(90deg, #10B981, #34D399)',
                                transition: 'width 0.5s ease-out'
                            }} />
                            {/* Partial Segment */}
                            <div style={{
                                width: `${partialPct}%`,
                                height: '100%',
                                backgroundColor: '#F59E0B',
                                transition: 'width 0.5s ease-out'
                            }} />
                             {/* Rejected Segment (Fondo oscuro, no suma al progreso visual de la bodega) */}
                             <div style={{
                                 width: `${(rejectedCount / totalCount) * 100}%`,
                                 height: '100%',
                                 backgroundColor: 'rgba(239, 68, 68, 0.3)',
                                 transition: 'width 0.5s ease-out'
                             }} />
                         </div>
                     </div>
                )}

                {/* Counters (Dark Cards) */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '2rem'
                }}>
                    {[
                        { label: 'PENDIENTES', count: pendingCount, color: '#9CA3AF' },
                        { label: 'PARCIALES', count: partialCount, color: '#F59E0B' },
                        { label: 'RECIBIDOS', count: successCount, color: '#10B981' },
                        { label: 'RECHAZADOS', count: rejectedCount, color: '#EF4444', smaller: true },
                        { label: 'TOTAL', count: totalCount, color: 'white' }
                    ].map((stat, idx) => (
                        <div key={idx} style={{
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '16px', padding: stat.smaller ? '0.5rem 1rem' : '1rem', 
                            textAlign: 'center',
                            opacity: stat.smaller ? 0.6 : 1,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center'
                        }}>
                            <div style={{ fontSize: stat.smaller ? '1.2rem' : '1.8rem', fontWeight: '900', color: stat.color, marginBottom: '0.2rem' }}>{stat.count}</div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#9CA3AF', letterSpacing: '0.05em' }}>{stat.label}</div>
                        </div>
                    ))}
                </div>

                {/* Filters (Dark Pills) */}
                <div style={{
                    display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem',
                    scrollbarWidth: 'none', msOverflowStyle: 'none'
                }}>
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            style={{
                                padding: '0.5rem 1.2rem',
                                borderRadius: '999px',
                                border: activeCategory === cat ? (cat === 'Rechazados' ? '1px solid #EF4444' : '1px solid #10B981') : (cat === 'Rechazados' ? '1px solid #7F1D1D' : '1px solid #374151'),
                                backgroundColor: activeCategory === cat ? (cat === 'Rechazados' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)') : 'transparent',
                                color: activeCategory === cat ? (cat === 'Rechazados' ? '#EF4444' : '#10B981') : (cat === 'Rechazados' ? '#F87171' : '#9CA3AF'),
                                fontWeight: '700',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.2s'
                            }}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* MAIN GRID */}
            <div style={{ padding: '4rem 2rem 2rem 2rem', maxWidth: '1400px', margin: '0 auto' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#9CA3AF' }}>Cargando entradas...</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                        {visibleItems.length === 0 && (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', backgroundColor: 'white', borderRadius: '16px', color: '#6B7280', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                <p style={{ fontSize: '1.2rem', fontWeight: '500' }}>No hay mercancía en esta sección.</p>
                            </div>
                        )}

                        {visibleItems.map(item => (
                            <div
                                key={item.id}
                                onClick={() => activeTab === 'transport' ? handleStartReception(item) : null}
                                style={{
                                    backgroundColor: item.status === 'received_rejected' ? '#FEF2F2' : item.status === 'received_partial' ? '#FFFBEB' : 'white', borderRadius: '16px', padding: '1.5rem',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',

                                    // Safe Border Implementation (Width/Style/Color)
                                    borderStyle: 'solid',
                                    borderWidth: (item.status === 'receiving' || item.status === 'received_partial') ? '1px 1px 1px 5px' : '1px',
                                    borderColor: item.status === 'receiving' ? '#F3F4F6 #F3F4F6 #F3F4F6 #3B82F6' : // Top Right Bottom Left
                                        item.status === 'received_partial' ? '#FCD34D #FCD34D #FCD34D #F59E0B' :
                                            item.status === 'received_rejected' ? '#FCA5A5' :
                                                '#F3F4F6',

                                    cursor: activeTab === 'transport' ? 'pointer' : 'default',
                                    transition: 'transform 0.2s',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <span style={{
                                        backgroundColor: '#EFF6FF', color: '#1D4ED8', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '700'
                                    }}>
                                        {item.product.category}
                                    </span>
                                    {item.status === 'receiving' && <span style={{ color: '#2563EB', fontWeight: 'bold', fontSize: '0.8rem' }}>En Proceso...</span>}
                                    {item.status === 'received_partial' && <span style={{ color: '#D97706', fontWeight: 'bold', fontSize: '0.8rem' }}>⚠️ Parcial (Faltante)</span>}
                                </div>

                                <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#111827', margin: '0 0 0.5rem 0' }}>
                                    {item.product.name}
                                </h3>

                                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6B7280', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                                    <span>Unidad:</span>
                                    <strong style={{ color: '#374151' }}>{item.product.unit_of_measure}</strong>
                                </div>

                                {item.provider && (
                                    <div style={{ fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.5rem' }}>
                                        <span>🛒 Proveedor: </span>
                                        <strong style={{ color: '#111827' }}>{item.provider.name}</strong>
                                    </div>
                                )}

                                {item.voucher_image_url && (
                                    <div style={{ 
                                        width: '100%', height: '80px', borderRadius: '12px', overflow: 'hidden', 
                                        marginTop: '1rem', border: '1px solid #E5E7EB', cursor: 'pointer'
                                    }} onClick={(e) => { e.stopPropagation(); window.open(item.voucher_image_url, '_blank'); }}>
                                        <Image 
                                            src={item.voucher_image_url} 
                                            alt="Voucher" 
                                            width={500}
                                            height={80}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        />
                                    </div>
                                )}

                                {activeTab === 'received' && (
                                    <div style={{ marginTop: '1rem', paddingTop: '0.5rem', borderTop: '1px dashed #E5E7EB' }}>
                                        Estado: <strong>{item.status}</strong>
                                    </div>
                                )}

                                {item.status === 'received_rejected' && (
                                    <div style={{ marginTop: '0.8rem', padding: '0.5rem', backgroundColor: '#FEE2E2', borderRadius: '8px', color: '#991B1B', fontSize: '0.85rem' }}>
                                        <strong>Rechazado por:</strong> {item.rejection_reason || 'Sin motivo especificado'}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>


            {/* MODAL DE RECEPCIÓN */}
            {
                selectedItem && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                    }}>
                        <div style={{
                            position: 'relative',
                            backgroundColor: 'white', width: '90%', maxWidth: '500px', borderRadius: '24px', padding: '2rem',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                        }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#111827', marginBottom: '0.2rem' }}>
                                Validar Entrada ⚖️
                            </h2>
                            <button
                                onClick={() => { setQualityStatus(null); setShowRejectionOptions(true); }}
                                style={{
                                    display: 'block', background: 'none', border: 'none', color: '#DC2626',
                                    fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline',
                                    marginBottom: '1rem', padding: 0
                                }}
                            >
                                ¿Rechazar Entrada?
                            </button>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                                <div style={{ backgroundColor: '#F3F4F6', padding: '0.5rem 1rem', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '0.85rem', color: '#6B7280', display: 'block' }}>Producto</span>
                                    <strong style={{ color: '#111827' }}>{selectedItem.product.name}</strong>
                                </div>
                                <div style={{ backgroundColor: '#F3F4F6', padding: '0.5rem 1rem', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '0.85rem', color: '#6B7280', display: 'block' }}>Unidad</span>
                                    <strong style={{ color: '#111827' }}>{selectedItem.product.unit_of_measure}</strong>
                                </div>

                                {/* Intentos Dinámicos */}
                                {attemptHistory.map((attempt, idx) => (
                                    <div key={idx} style={{
                                        backgroundColor: attempt.status === 'valid' ? '#D1FAE5' : '#FEE2E2',
                                        padding: '0.5rem 1rem', borderRadius: '8px',
                                        border: attempt.status === 'valid' ? '1px solid #10B981' : '1px solid #EF4444'
                                    }}>
                                        <span style={{ fontSize: '0.85rem', color: attempt.status === 'valid' ? '#065F46' : '#991B1B', display: 'block' }}>
                                            {idx === 0 ? '1er' : '2do'} intento
                                        </span>
                                        <strong style={{ color: attempt.status === 'valid' ? '#065F46' : '#991B1B', fontSize: '1.2rem' }}>
                                            {attempt.value}
                                        </strong>
                                    </div>
                                ))}
                            </div>

                            {showRejectionOptions ? (
                                <div style={{ animation: 'fadeIn 0.3s' }}>
                                    <h3 style={{ textAlign: 'center', color: '#DC2626', marginBottom: '1rem', fontSize: '1.2rem', fontWeight: '800' }}>¿Por qué se rechaza?</h3>
                                    <div style={{ display: 'grid', gap: '0.8rem' }}>
                                        <button
                                            onClick={() => handleSubmitResult('received_rejected', 'Mala Calidad / Feo')}
                                            style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
                                        >
                                            🥀 Mala Calidad / Feo
                                        </button>
                                        <button
                                            onClick={() => handleSubmitResult('received_rejected', 'Producto Equivocado')}
                                            style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
                                        >
                                            ❌ Producto Equivocado
                                        </button>
                                        <button
                                            onClick={() => handleSubmitResult('received_rejected', 'Averiado / Roto')}
                                            style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
                                        >
                                            🔨 Averiado / Roto
                                        </button>
                                        <button
                                            onClick={() => {
                                                const reason = prompt("Describe el motivo:");
                                                if (reason) handleSubmitResult('received_rejected', reason);
                                            }}
                                            style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#F3F4F6', color: '#4B5563', border: 'none', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
                                        >
                                            ✏️ Otro Motivo...
                                        </button>
                                        <button
                                            onClick={handleCloseModal}
                                            style={{ marginTop: '0.5rem', background: 'none', border: 'none', textDecoration: 'underline', color: '#6B7280', cursor: 'pointer', fontSize: '0.9rem' }}
                                        >
                                            Cancelar y Volver
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                !validationMessage || validationMessage.includes('Diferencia') ? (
                                    // FASE 1: INGRESO CIEGO
                                    <div style={{ marginBottom: '2rem' }}>
                                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: '#374151' }}>
                                            Ingrese Cantidad Recibida
                                        </label>
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <input
                                                type="number"
                                                value={inputQty}
                                                onChange={e => setInputQty(e.target.value)}
                                                placeholder="0.00"
                                                autoFocus
                                                style={{
                                                    flex: 1, padding: '1rem', fontSize: '1.5rem', fontWeight: 'bold',
                                                    borderRadius: '12px', border: '2px solid #E5E7EB', outline: 'none'
                                                }}
                                            />
                                            <button
                                                onClick={handleValidateQuantity}
                                                disabled={!inputQty}
                                                style={{
                                                    padding: '0 1.5rem', borderRadius: '12px', backgroundColor: '#2563EB', color: 'white',
                                                    border: 'none', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer'
                                                }}
                                            >
                                                Validar
                                            </button>
                                        </div>

                                        {validationMessage && (
                                            <div style={{ animation: 'fadeIn 0.3s' }}>
                                                <div style={{ marginTop: '1rem', padding: '0.8rem', backgroundColor: '#FEF2F2', color: '#DC2626', borderRadius: '8px', fontWeight: 'bold' }}>
                                                    {validationMessage}
                                                </div>

                                                {/* Opción de Parcial Anticipado */}
                                                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '1rem', backgroundColor: '#FFFBEB', borderRadius: '12px', border: '1px dashed #FCD34D' }}>
                                                    <span style={{ fontSize: '0.85rem', color: '#B45309', fontWeight: 'bold' }}>¿Es una entrega parcial conocida?</span>
                                                    <button
                                                        onClick={() => handleSubmitResult('received_partial', 'Parcial confirmado por operador (Diferencia)')}
                                                        style={{
                                                            padding: '0.8rem 1.2rem', borderRadius: '8px',
                                                            backgroundColor: '#F59E0B', color: 'white', border: 'none',
                                                            fontWeight: 'bold', cursor: 'pointer', fontSize: '0.95rem',
                                                            boxShadow: '0 2px 4px rgba(245, 158, 11, 0.2)'
                                                        }}
                                                    >
                                                        ⚠️ Confirmar como PARCIAL
                                                    </button>
                                                </div>
                                            </div>
                                        )}



                                        {/* Si falló 2 veces... */}
                                        {attemptCount > 1 && (
                                            <div style={{ marginTop: '1.5rem', borderTop: '1px solid #E5E7EB', paddingTop: '1.5rem' }}>
                                                <p style={{ fontWeight: 'bold', marginBottom: '1rem' }}>¿Cómo desea proceder?</p>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                                    <button
                                                        onClick={() => handleSubmitResult('received_partial', 'Déficit confirmado en recepción')}
                                                        style={{ padding: '1rem', backgroundColor: '#FEF3C7', color: '#D97706', border: 'none', borderRadius: '10px', fontWeight: 'bold' }}>
                                                        ⚠️ Recibir como PARCIAL
                                                    </button>
                                                    <button
                                                        onClick={() => setShowRejectionOptions(true)}
                                                        style={{ padding: '1rem', backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: '10px', fontWeight: 'bold' }}>
                                                        🛑 RECHAZAR TODO
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    // FASE 2: CALIDAD
                                    <div style={{ animation: 'fadeIn 0.3s' }}>
                                        <div style={{ backgroundColor: '#ECFDF5', color: '#059669', padding: '1rem', borderRadius: '12px', fontWeight: 'bold', marginBottom: '2rem', textAlign: 'center' }}>
                                            ✅ Cantidad Correcta
                                        </div>

                                        <h3 style={{ textAlign: 'center', marginBottom: '1rem', color: '#374151' }}>Validar Calidad</h3>
                                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '2rem' }}>
                                            <button
                                                onClick={() => { setQualityStatus('green'); setShowRejectionOptions(false); }}
                                                style={{
                                                    width: '70px', height: '70px', borderRadius: '50%',
                                                    backgroundColor: qualityStatus === 'green' ? '#10B981' : '#E5E7EB',
                                                    border: qualityStatus === 'green' ? '4px solid #D1FAE5' : 'none',
                                                    fontSize: '1.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                                                    transform: qualityStatus === 'green' ? 'scale(1.1)' : 'scale(1)'
                                                }}
                                            >✔</button>
                                            <button
                                                onClick={() => { setQualityStatus('yellow'); setShowRejectionOptions(false); }}
                                                style={{
                                                    width: '70px', height: '70px', borderRadius: '50%',
                                                    backgroundColor: qualityStatus === 'yellow' ? '#F59E0B' : '#E5E7EB',
                                                    border: qualityStatus === 'yellow' ? '4px solid #FEF3C7' : 'none',
                                                    fontSize: '1.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                                                    transform: qualityStatus === 'yellow' ? 'scale(1.1)' : 'scale(1)'
                                                }}
                                            >⚠</button>
                                            <button
                                                onClick={() => { setQualityStatus('red'); setShowRejectionOptions(false); }}
                                                style={{
                                                    width: '70px', height: '70px', borderRadius: '50%',
                                                    backgroundColor: qualityStatus === 'red' ? '#EF4444' : '#E5E7EB',
                                                    border: qualityStatus === 'red' ? '4px solid #FEE2E2' : 'none',
                                                    fontSize: '1.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                                                    transform: qualityStatus === 'red' ? 'scale(1.1)' : 'scale(1)'
                                                }}
                                            >✖</button>
                                        </div>

                                        <div style={{ textAlign: 'center', marginTop: '-1rem', marginBottom: '1.5rem', fontWeight: '600', color: qualityStatus === 'green' ? '#10B981' : qualityStatus === 'yellow' ? '#F59E0B' : '#EF4444' }}>
                                            {qualityStatus === 'green' ? 'Conforme' : qualityStatus === 'yellow' ? 'Para Revisión' : qualityStatus === 'red' ? 'No Conforme' : ''}
                                        </div>

                                        {/* Intermediate Reject Prompt (Solo si Red y NO showOptions, pero showOptions está arriba) */}
                                        {qualityStatus === 'red' && (
                                            <div style={{ textAlign: 'center', marginBottom: '1.5rem', animation: 'fadeIn 0.3s' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowRejectionOptions(true);
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

                                        {/* Actions */}
                                        <button
                                            disabled={!qualityStatus || processing}
                                            onClick={() => {
                                                let finalStatus = 'received_ok';
                                                if (qualityStatus === 'yellow' || qualityStatus === 'red') finalStatus = 'received_review';
                                                handleSubmitResult(finalStatus);
                                            }}
                                            style={{
                                                width: '100%', padding: '1.2rem', borderRadius: '14px',
                                                backgroundColor: '#111827', color: 'white', border: 'none',
                                                fontWeight: '900', fontSize: '1.1rem',
                                                opacity: (!qualityStatus || processing) ? 0.5 : 1
                                            }}
                                        >
                                            {processing ? 'Guardando...' : 'FINALIZAR RECEPCIÓN'}
                                        </button>
                                    </div>
                                )
                            )}

                            <button
                                onClick={handleCloseModal}
                                style={{
                                    position: 'absolute', top: '1.2rem', right: '1.2rem',
                                    backgroundColor: '#F3F4F6', color: '#4B5563',
                                    borderRadius: '50%', width: '40px', height: '40px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: 'none', fontSize: '1.2rem', cursor: 'pointer',
                                    transition: 'background-color 0.2s'
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )
            }
        </div>
    );
}
