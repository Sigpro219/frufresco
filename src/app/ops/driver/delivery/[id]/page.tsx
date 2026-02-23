'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import { useParams, useRouter } from 'next/navigation';

interface DeliverableItem {
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    picked_quantity: number;
    returned_qty: number;
    unit: string;
    return_reason?: string;
    return_evidence_url?: string;
}

export default function DeliveryConfirmationPage() {
    const { id } = useParams(); // stop_id
    const router = useRouter();
    const [stop, setStop] = useState<any>(null);
    const [items, setItems] = useState<DeliverableItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form States
    const [hasNovedad, setHasNovedad] = useState(false);
    const [novedadReason, setNovedadReason] = useState('');
    const [canastillasDelivered, setCanastillasDelivered] = useState(0);
    const [canastillasReceived, setCanastillasReceived] = useState(0);
    const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);

    const RETURN_REASONS = [
        "Producto en mal estado",
        "Calidad no aceptable",
        "Error en cantidad",
        "Maduración inadecuada",
        "Precio incorrecto",
        "Otro"
    ];

    const TOTAL_CANCELLATION_REASONS = [
        "Cliente no estaba en casa",
        "Local cerrado",
        "Dirección incorrecta",
        "Cliente rechaza pedido completo",
        "Cancelado por central"
    ];

    const fetchStopData = useCallback(async () => {
        try {
            setLoading(true);

            // Handle Mock Stop IDs for Demo Mode
            if (typeof id === 'string' && id.startsWith('ms')) {
                const mockStops: Record<string, any> = {
                    'ms1': { 
                        id: 'ms1', 
                        route_id: 'mock-1', 
                        orders: { 
                            id: 'mo1', 
                            customer_name: 'Minimercado La 80 (Mock)', 
                            shipping_address: 'Carrera 80 #45-12',
                            order_items: [
                                { id: 'item1', product_id: 'p1', quantity: 20, picked_quantity: 20, products: { name: 'Aguacate Hass', unit_of_measure: 'kg' } },
                                { id: 'item2', product_id: 'p2', quantity: 15, picked_quantity: 15, products: { name: 'Tomate Chonto', unit_of_measure: 'kg' } }
                            ]
                        } 
                    },
                    'ms2': { id: 'ms2', route_id: 'mock-1', orders: { id: 'mo2', customer_name: 'Restaurante Central (Mock)', shipping_address: 'Calle 50 #10-20', order_items: [] } },
                    'ms3': { id: 'ms3', route_id: 'mock-1', orders: { id: 'mo3', customer_name: 'Panadería El Girasol (Mock)', shipping_address: 'Transversal 5 #8-15', order_items: [] } }
                };
                const data = mockStops[id];
                setStop(data);
                
                // Populate items for mock data
                if (data.orders?.order_items) {
                    const formatted = data.orders.order_items.map((item: any) => ({
                        id: item.id,
                        product_id: item.product_id,
                        product_name: item.products.name,
                        quantity: item.quantity,
                        picked_quantity: item.picked_quantity,
                        returned_qty: 0,
                        unit: item.products.unit_of_measure
                    }));
                    setItems(formatted);
                }
                return;
            }

            const { data, error } = await supabase
                .from('route_stops')
                .select(`
                    id, route_id, status,
                    orders:order_id (
                        id, customer_name, shipping_address,
                        order_items (
                            id, product_id, quantity, picked_quantity,
                            products (id, name, unit_of_measure)
                        )
                    )
                `)
                .eq('id', id)
                .single();

            if (error) throw error;
            setStop(data);
            
            // Initialize items with 0 returned_qty
            const order = (data as any).orders;
            if (order?.order_items) {
                const formattedItems = (order.order_items as any[]).map(item => ({
                    id: item.id,
                    product_id: item.product_id || item.products?.id,
                    product_name: item.products?.name || 'Producto',
                    quantity: item.quantity,
                    picked_quantity: item.picked_quantity || item.quantity,
                    returned_qty: 0,
                    unit: item.products?.unit_of_measure || 'un'
                }));
                setItems(formattedItems);
            }
        } catch (err) {
            if (isAbortError(err)) return;
            console.error('Error fetching stop:', err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) fetchStopData();
    }, [id, fetchStopData]);

    const handleReturnQtyChange = (itemId: string, val: number) => {
        setItems(prev => prev.map(item => 
            item.id === itemId ? { ...item, returned_qty: val } : item
        ));
    };

    const handleItemReasonChange = (itemId: string, reason: string) => {
        setItems(prev => prev.map(item => 
            item.id === itemId ? { ...item, return_reason: reason } : item
        ));
    };

    const handleItemPhotoUpload = async (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setSaving(true);
            let url = '';
            
            if (typeof id === 'string' && id.startsWith('ms')) {
                url = URL.createObjectURL(file);
            } else {
                const fileExt = file.name.split('.').pop();
                const fileName = `ret_${itemId}_${Date.now()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage
                    .from('delivery-evidence')
                    .upload(fileName, file);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('delivery-evidence')
                    .getPublicUrl(fileName);
                url = publicUrl;
            }

            setItems(prev => prev.map(item => 
                item.id === itemId ? { ...item, return_evidence_url: url } : item
            ));
        } catch (err) {
            console.error('Error uploading item photo:', err);
            alert('Error al subir foto del producto');
        } finally {
            setSaving(false);
        }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setSaving(true);

            // SIMULATE UPLOAD FOR MOCK DATA
            if (typeof id === 'string' && id.startsWith('ms')) {
                // Return a local blob URL for immediate preview
                const localUrl = URL.createObjectURL(file);
                setEvidenceUrl(localUrl);
                return;
            }

            const fileExt = file.name.split('.').pop();
            const fileName = `${id}_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
                .from('delivery-evidence')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('delivery-evidence')
                .getPublicUrl(fileName);

            setEvidenceUrl(publicUrl);
        } catch (err) {
            console.error('Error uploading photo:', err);
            alert('Error al subir foto: ' + (err instanceof Error ? err.message : 'Verifica conexión o permisos del bucket.'));
        } finally {
            setSaving(false);
        }
    };

    const handleFinalize = async () => {
        if (!evidenceUrl && !hasNovedad) {
            if (!confirm('¿Deseas finalizar sin foto de evidencia?')) return;
        }

        try {
            setSaving(true);

            const isTotalCancellation = hasNovedad && TOTAL_CANCELLATION_REASONS.includes(novedadReason);

            // BYPASS DB UPDATES FOR MOCK DATA
            if (typeof id === 'string' && id.startsWith('ms')) {
                await new Promise(r => setTimeout(r, 1000)); // Simulate network
                window.showToast?.(`MODO DEMO: Entrega ${isTotalCancellation ? 'CANCELADA' : 'FINALIZADA'} con éxito`, 'success');
                router.push(`/ops/driver/route-map/${stop?.route_id || 'mock-1'}`);
                return;
            }
            
            // 1. Update stop status
            await supabase.from('route_stops').update({
                status: isTotalCancellation ? 'failed' : 'delivered',
                completion_time: new Date().toISOString()
            }).eq('id', id);

            // 2. Record Events
            if (isTotalCancellation) {
                // Single event for total cancellation
                await supabase.from('delivery_events').insert({
                    stop_id: id,
                    order_id: stop.orders.id,
                    event_type: 'cancellation',
                    description: novedadReason,
                    evidence_url: evidenceUrl
                });
            } else if (hasNovedad) {
                // Multiple events for partial returns
                const partialReturns = items.filter(i => i.returned_qty > 0);
                for (const item of partialReturns) {
                    await supabase.from('delivery_events').insert({
                        stop_id: id,
                        order_id: stop.orders.id,
                        event_type: 'partial_rejection',
                        description: `PRODUCTO: ${item.product_name} | MOTIVO: ${item.return_reason || 'No especificado'} | CANT: ${item.returned_qty}`,
                        evidence_url: item.return_evidence_url || evidenceUrl // Use item photo or fall back to order photo
                    });
                }
            }

            // 3. Inventory Integration (Returns)
            const returns = items.filter(i => i.returned_qty > 0 || isTotalCancellation);
            if (returns.length > 0) {
                const { data: warehouseData } = await supabase.from('warehouses').select('id').limit(1).single();
                if (warehouseData) {
                    const movementPromises = returns.map(item => {
                        const qtyToReturn = isTotalCancellation ? item.picked_quantity : item.returned_qty;
                        return supabase.from('inventory_movements').insert([{
                            product_id: item.product_id,
                            warehouse_id: warehouseData.id,
                            quantity: qtyToReturn,
                            type: 'adjustment',
                            status_to: 'returned',
                            notes: `Devolución en entrega: ${novedadReason || 'Novedad parcial'}`,
                            reference_type: 'delivery_return',
                            reference_id: id as string
                        }]);
                    });
                    await Promise.all(movementPromises);
                }
            }

            // 4. Record Canastillas movement
            if (canastillasDelivered > 0 || canastillasReceived > 0) {
                await supabase.from('asset_movements').insert({
                    route_id: stop.route_id,
                    type: 'adjustment',
                    quantity: canastillasDelivered - canastillasReceived,
                    notes: `Entrega a ${stop.orders.customer_name}`
                });
            }

            window.showToast?.('Entrega finalizada e inventario sincronizado', 'success');
            router.push(`/ops/driver/route-map/${stop.route_id}`);
        } catch (err: unknown) {
            console.error('Error finalizing delivery:', err);
            const message = err instanceof Error ? err.message : 'Error desconocido';
            alert('Error al guardar reporte: ' + message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#9CA3AF' }}>Preparando remisión...</div>;

    return (
        <div style={{ padding: '1rem', paddingBottom: '7rem', maxWidth: '600px', margin: '0 auto', color: 'white' }}>
             <header style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={() => router.back()} style={{ background: '#1F2937', border: 'none', color: 'white', padding: '0.5rem', borderRadius: '10px' }}>←</button>
                <h1 style={{ fontSize: '1.4rem', fontWeight: '900', margin: 0 }}>Cierre de <span style={{ color: '#10B981' }}>Entrega</span></h1>
            </header>

            <div style={{ backgroundColor: '#1F2937', borderRadius: '24px', padding: '1.5rem', border: '1px solid #374151', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'white' }}>{stop?.orders?.customer_name || 'Cargando cliente...'}</div>
                <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginBottom: '1.5rem' }}>📍 {stop?.orders?.shipping_address || 'Sin dirección'}</div>

                {/* Photo Evidence Section */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: '900', color: '#10B981', marginBottom: '0.5rem' }}>EVIDENCIA (FOTO)</div>
                    {evidenceUrl ? (
                        <div style={{ position: 'relative' }}>
                             <img src={evidenceUrl} alt="Evidence" style={{ width: '100%', borderRadius: '15px', height: '200px', objectFit: 'cover' }} />
                             <button onClick={() => setEvidenceUrl(null)} style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(239, 68, 68, 0.8)', border: 'none', color: 'white', borderRadius: '50%', width: '30px', height: '30px' }}>✕</button>
                        </div>
                    ) : (
                        <label style={{ 
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                            padding: '2rem', border: '2px dashed #4B5563', borderRadius: '15px', cursor: 'pointer'
                        }}>
                            <span style={{ fontSize: '2rem' }}>📸</span>
                            <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>Subir foto de la planilla recibida</span>
                            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                        </label>
                    )}
                </div>

                {/* Canastillas Control */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: '900', color: '#9CA3AF', marginBottom: '0.4rem' }}>CANASTILLAS ENTREGADAS</div>
                        <input 
                            type="number" 
                            className="input-op" 
                            value={canastillasDelivered}
                            onChange={(e) => setCanastillasDelivered(parseInt(e.target.value) || 0)}
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #374151', backgroundColor: '#111827', color: 'white' }}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: '900', color: '#9CA3AF', marginBottom: '0.4rem' }}>CANASTILLAS RECIBIDAS</div>
                        <input 
                            type="number" 
                            className="input-op" 
                            value={canastillasReceived}
                            onChange={(e) => setCanastillasReceived(parseInt(e.target.value) || 0)}
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #374151', backgroundColor: '#111827', color: 'white' }}
                        />
                    </div>
                </div>

                {/* Novedades Switch */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'white', fontWeight: '700' }}>
                        <input type="checkbox" checked={hasNovedad} onChange={(e) => setHasNovedad(e.target.checked)} />
                        ¿Reportar Novedad / Devolución?
                    </label>
                    
                    {hasNovedad && (
                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid #374151', paddingTop: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#F59E0B', fontWeight: '800', marginBottom: '0.4rem' }}>TIPO DE NOVEDAD</div>
                                <select 
                                    value={novedadReason}
                                    onChange={(e) => {
                                        setNovedadReason(e.target.value);
                                        // If total cancellation, clear individual returns
                                        if (TOTAL_CANCELLATION_REASONS.includes(e.target.value)) {
                                            setItems(prev => prev.map(i => ({ ...i, returned_qty: 0 })));
                                        }
                                    }}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #F59E0B', backgroundColor: '#111827', color: 'white' }}
                                >
                                    <option value="">Selecciona tipo de reporte...</option>
                                    <optgroup label="CANCELACIÓN TOTAL" style={{ color: '#EF4444' }}>
                                        {TOTAL_CANCELLATION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                    </optgroup>
                                    <optgroup label="DEVOLUCIÓN PARCIAL / SKU" style={{ color: '#10B981' }}>
                                        <option value="devolucion_parcial">Reportar daños o faltantes por producto</option>
                                    </optgroup>
                                </select>
                            </div>

                            {/* Granular Partial Return UI */}
                            {novedadReason === 'devolucion_parcial' && (
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: '800', marginBottom: '0.8rem' }}>DETALLE DE PRODUCTOS DEVUELTOS</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                        {items.map(item => (
                                            <div key={item.id} style={{ backgroundColor: '#111827', padding: '1rem', borderRadius: '16px', border: item.returned_qty > 0 ? '1px solid #10B981' : '1px solid #374151' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: item.returned_qty > 0 ? '1rem' : 0 }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: '700' }}>{item.product_name}</div>
                                                        <div style={{ fontSize: '0.65rem', color: '#9CA3AF' }}>Pedido: {item.picked_quantity} {item.unit}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '0.7rem', color: '#EF4444', fontWeight: '900' }}>DV:</span>
                                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                            <input 
                                                                type="number"
                                                                min="0"
                                                                max={item.picked_quantity}
                                                                value={item.returned_qty}
                                                                onChange={(e) => handleReturnQtyChange(item.id, parseFloat(e.target.value) || 0)}
                                                                style={{ width: '80px', padding: '0.4rem', paddingRight: '2.2rem', borderRadius: '8px', border: '1px solid #4B5563', backgroundColor: 'black', color: 'white', textAlign: 'center' }}
                                                            />
                                                            <button 
                                                                onClick={() => handleReturnQtyChange(item.id, item.picked_quantity)}
                                                                style={{ 
                                                                    position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)',
                                                                    backgroundColor: '#EF4444', color: 'white', border: 'none', borderRadius: '5px',
                                                                    fontSize: '0.55rem', fontWeight: '900', padding: '4px 6px', cursor: 'pointer'
                                                                }}
                                                            >
                                                                TODO
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {item.returned_qty > 0 && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', borderTop: '1px dotted #374151', paddingTop: '0.8rem' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px', gap: '0.5rem' }}>
                                                            <select 
                                                                value={item.return_reason || ''}
                                                                onChange={(e) => handleItemReasonChange(item.id, e.target.value)}
                                                                style={{ padding: '0.6rem', borderRadius: '10px', backgroundColor: '#1F2937', color: 'white', border: '1px solid #4B5563', fontSize: '0.75rem' }}
                                                            >
                                                                <option value="">Motivo devolución...</option>
                                                                {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                                            </select>
                                                            
                                                            <label style={{ 
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                                backgroundColor: item.return_evidence_url ? '#10B981' : '#374151',
                                                                borderRadius: '10px', cursor: 'pointer', height: '36px'
                                                            }}>
                                                                {item.return_evidence_url ? '✅' : '📷'}
                                                                <input type="file" accept="image/*" capture="environment" onChange={(e) => handleItemPhotoUpload(item.id, e)} style={{ display: 'none' }} />
                                                            </label>
                                                        </div>
                                                        {item.return_evidence_url && (
                                                            <img src={item.return_evidence_url} alt="Item evidence" style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '8px' }} />
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <button 
                onClick={handleFinalize}
                disabled={saving}
                style={{ 
                    width: '100%', 
                    padding: '1.2rem', 
                    borderRadius: '20px', 
                    border: 'none', 
                    backgroundColor: '#10B981', 
                    color: 'white', 
                    fontWeight: '900', 
                    fontSize: '1.1rem',
                    boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.4)',
                    cursor: saving ? 'not-allowed' : 'pointer'
                }}>
                {saving ? 'GUARDANDO...' : 'FINALIZAR ENTREGA ✅'}
            </button>
        </div>
    );
}
