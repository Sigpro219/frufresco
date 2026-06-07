'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError, diagnoseStorageError } from '@/lib/errorUtils';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Camera, X, Check, AlertTriangle, Package } from 'lucide-react';

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
                        id, shipping_address,
                        profiles:profile_id (
                            id, company_name, contact_name, role
                        ),
                        order_items (
                            id, product_id, quantity, picked_quantity, nickname, variant_label,
                            products (id, name, unit_of_measure)
                        )
                    )
                `)
                .eq('id', id)
                .single();

            if (error) throw error;

            if (data && data.orders) {
                const orderAny = data.orders as any;
                const p = orderAny.profiles;
                let name = 'Cliente';
                if (p) {
                    name = p.role === 'b2b_client' 
                        ? (p.company_name || 'Sin Razón Social') 
                        : (p.contact_name || p.company_name || 'Cliente B2C');
                }
                orderAny.customer_name = name;
            }

            setStop(data);
            
            // Initialize items with 0 returned_qty
            const order = (data as any).orders;
            if (order?.order_items) {
                const formattedItems = (order.order_items as any[]).map(item => {
                    const variant = item.variant_label || item.nickname || '';
                    const dispName = variant ? `${item.products?.name || 'Producto'} (${variant})` : (item.products?.name || 'Producto');
                    return {
                        id: item.id,
                        product_id: item.product_id || item.products?.id,
                        product_name: dispName,
                        quantity: item.quantity,
                        picked_quantity: item.picked_quantity || item.quantity,
                        returned_qty: 0,
                        unit: item.products?.unit_of_measure || 'un'
                    };
                });
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

                if (uploadError) {
                    diagnoseStorageError(uploadError, 'delivery-evidence');
                    throw uploadError;
                }

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

            if (uploadError) {
                diagnoseStorageError(uploadError, 'delivery-evidence');
                throw uploadError;
            }

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

            // Check if this was the last pending stop on this route to complete the route
            const { data: remainingStops } = await supabase
                .from('route_stops')
                .select('id, status')
                .eq('route_id', stop.route_id);

            const hasPending = remainingStops?.some(s => s.id !== id && s.status === 'pending');
            if (!hasPending) {
                await supabase
                    .from('routes')
                    .update({ status: 'completed' })
                    .eq('id', stop.route_id);
            }

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
                            reference_id: id as string,
                            evidence_url: item.return_evidence_url || evidenceUrl // Link photo to movement
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
        <div style={{ padding: '1rem', paddingBottom: '7rem', maxWidth: '600px', margin: '0 auto', color: 'white', minHeight: '100vh', backgroundColor: '#090D16' }}>
             <header style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button 
                    onClick={() => router.back()} 
                    style={{ 
                        background: 'rgba(255, 255, 255, 0.05)', 
                        border: '1px solid rgba(255, 255, 255, 0.08)', 
                        color: 'white', 
                        padding: '0.6rem', 
                        borderRadius: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <ArrowLeft size={18} />
                </button>
                <h1 style={{ fontSize: '1.4rem', fontWeight: '900', margin: 0, letterSpacing: '-0.3px' }}>
                    Cierre de <span style={{ color: '#059669' }}>Entrega</span>
                </h1>
            </header>

            <div className="premium-card" style={{ 
                padding: '1.5rem', 
                marginBottom: '1.5rem' 
            }}>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'white' }}>{stop?.orders?.customer_name || 'Cargando cliente...'}</div>
                <div style={{ fontSize: '0.8rem', color: '#9CA3AF', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    <MapPin size={14} style={{ color: '#059669' }} /> 
                    <span>{stop?.orders?.shipping_address || 'Sin dirección'}</span>
                </div>

                {/* Photo Evidence Section */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#059669', marginBottom: '0.6rem', letterSpacing: '0.5px' }}>EVIDENCIA (FOTO)</div>
                    {evidenceUrl ? (
                        <div style={{ position: 'relative' }}>
                             <img src={evidenceUrl} alt="Evidence" style={{ width: '100%', borderRadius: '12px', height: '200px', objectFit: 'cover' }} />
                             <button 
                                onClick={() => setEvidenceUrl(null)} 
                                style={{ 
                                    position: 'absolute', 
                                    top: 10, 
                                    right: 10, 
                                    background: 'rgba(239, 68, 68, 0.85)', 
                                    border: 'none', 
                                    color: 'white', 
                                    borderRadius: '50%', 
                                    width: '30px', 
                                    height: '30px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer'
                                }}
                             >
                                <X size={16} />
                             </button>
                        </div>
                    ) : (
                        <label style={{ 
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                            padding: '2rem 1.5rem', border: '1px dashed rgba(255, 255, 255, 0.15)', borderRadius: '12px', cursor: 'pointer',
                            backgroundColor: 'rgba(9, 13, 22, 0.3)', transition: 'all 0.2s ease'
                        }} className="upload-label">
                            <Camera size={32} style={{ color: '#059669' }} />
                            <span style={{ fontSize: '0.8rem', color: '#9CA3AF', fontWeight: '500' }}>Subir foto de la planilla recibida</span>
                            <input type="file" onChange={handlePhotoUpload} style={{ position: 'absolute', width: '1px', height: '1px', padding: '0', margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', border: '0', whiteSpace: 'nowrap' }} />
                        </label>
                    )}
                </div>

                {/* Canastillas Control */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#9CA3AF', marginBottom: '0.4rem', letterSpacing: '0.3px' }}>CANASTILLAS ENTREGADAS</div>
                        <input 
                            type="number" 
                            className="input-op" 
                            value={canastillasDelivered}
                            onChange={(e) => setCanastillasDelivered(parseInt(e.target.value) || 0)}
                            style={{ 
                                width: '100%', 
                                padding: '0.8rem', 
                                borderRadius: '12px', 
                                border: '1px solid rgba(255, 255, 255, 0.08)', 
                                backgroundColor: 'rgba(9, 13, 22, 0.5)', 
                                color: 'white',
                                outline: 'none'
                            }}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#9CA3AF', marginBottom: '0.4rem', letterSpacing: '0.3px' }}>CANASTILLAS RECIBIDAS</div>
                        <input 
                            type="number" 
                            className="input-op" 
                            value={canastillasReceived}
                            onChange={(e) => setCanastillasReceived(parseInt(e.target.value) || 0)}
                            style={{ 
                                width: '100%', 
                                padding: '0.8rem', 
                                borderRadius: '12px', 
                                border: '1px solid rgba(255, 255, 255, 0.08)', 
                                backgroundColor: 'rgba(9, 13, 22, 0.5)', 
                                color: 'white',
                                outline: 'none'
                            }}
                        />
                    </div>
                </div>

                {/* Novedades Switch */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'white', fontWeight: '600', fontSize: '0.95rem', cursor: 'pointer' }}>
                        <input 
                            type="checkbox" 
                            checked={hasNovedad} 
                            onChange={(e) => setHasNovedad(e.target.checked)} 
                            style={{ 
                                accentColor: '#059669', 
                                width: '16px', 
                                height: '16px' 
                            }} 
                        />
                        ¿Reportar Novedad / Devolución?
                    </label>
                    
                    {hasNovedad && (
                        <div style={{ marginTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1.2rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1.2rem' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#F59E0B', fontWeight: '800', marginBottom: '0.4rem', letterSpacing: '0.5px' }}>TIPO DE NOVEDAD</div>
                                <select 
                                    value={novedadReason}
                                    onChange={(e) => {
                                        setNovedadReason(e.target.value);
                                        // If total cancellation, clear individual returns
                                        if (TOTAL_CANCELLATION_REASONS.includes(e.target.value)) {
                                            setItems(prev => prev.map(i => ({ ...i, returned_qty: 0 })));
                                        }
                                    }}
                                    style={{ 
                                        width: '100%', 
                                        padding: '0.8rem', 
                                        borderRadius: '12px', 
                                        border: '1px solid rgba(245, 158, 11, 0.4)', 
                                        backgroundColor: 'rgba(9, 13, 22, 0.7)', 
                                        color: 'white',
                                        outline: 'none'
                                    }}
                                >
                                    <option value="" style={{ backgroundColor: '#090D16' }}>Selecciona tipo de reporte...</option>
                                    <optgroup label="CANCELACIÓN TOTAL" style={{ color: '#EF4444', backgroundColor: '#090D16' }}>
                                        {TOTAL_CANCELLATION_REASONS.map(r => <option key={r} value={r} style={{ backgroundColor: '#090D16', color: 'white' }}>{r}</option>)}
                                    </optgroup>
                                    <optgroup label="DEVOLUCIÓN PARCIAL / SKU" style={{ color: '#059669', backgroundColor: '#090D16' }}>
                                        <option value="devolucion_parcial" style={{ backgroundColor: '#090D16', color: 'white' }}>Reportar daños o faltantes por producto</option>
                                    </optgroup>
                                </select>
                            </div>

                            {/* Granular Partial Return UI */}
                            {novedadReason === 'devolucion_parcial' && (
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: '800', marginBottom: '0.8rem', letterSpacing: '0.5px' }}>DETALLE DE PRODUCTOS DEVUELTOS</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                        {items.map(item => (
                                            <div key={item.id} style={{ 
                                                backgroundColor: 'rgba(9, 13, 22, 0.4)', 
                                                padding: '1rem', 
                                                borderRadius: '12px', 
                                                border: item.returned_qty > 0 ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)' 
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: item.returned_qty > 0 ? '1rem' : 0 }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: '700' }}>{item.product_name}</div>
                                                        <div style={{ fontSize: '0.65rem', color: '#9CA3AF', marginTop: '2px' }}>Pedido: {item.picked_quantity} {item.unit}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '0.7rem', color: '#EF4444', fontWeight: '800' }}>DV:</span>
                                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                            <input 
                                                                type="number"
                                                                min="0"
                                                                max={item.picked_quantity}
                                                                value={item.returned_qty}
                                                                onChange={(e) => handleReturnQtyChange(item.id, parseFloat(e.target.value) || 0)}
                                                                style={{ 
                                                                    width: '85px', 
                                                                    padding: '0.4rem', 
                                                                    paddingRight: '2.4rem', 
                                                                    borderRadius: '8px', 
                                                                    border: '1px solid rgba(255, 255, 255, 0.08)', 
                                                                    backgroundColor: 'rgba(0,0,0,0.3)', 
                                                                    color: 'white', 
                                                                    textAlign: 'center',
                                                                    outline: 'none'
                                                                }}
                                                            />
                                                            <button 
                                                                onClick={() => handleReturnQtyChange(item.id, item.picked_quantity)}
                                                                style={{ 
                                                                    position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)',
                                                                    backgroundColor: 'rgba(239, 68, 68, 0.2)', 
                                                                    color: '#EF4444', 
                                                                    border: '1px solid rgba(239, 68, 68, 0.3)', 
                                                                    borderRadius: '5px',
                                                                    fontSize: '0.55rem', 
                                                                    fontWeight: '800', 
                                                                    padding: '3px 5px', 
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                TODO
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {item.returned_qty > 0 && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', borderTop: '1px dashed rgba(255, 255, 255, 0.05)', paddingTop: '0.8rem' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px', gap: '0.5rem' }}>
                                                            <select 
                                                                value={item.return_reason || ''}
                                                                onChange={(e) => handleItemReasonChange(item.id, e.target.value)}
                                                                style={{ padding: '0.6rem', borderRadius: '8px', backgroundColor: 'rgba(30, 41, 59, 0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.75rem', outline: 'none' }}
                                                            >
                                                                <option value="" style={{ backgroundColor: '#090D16' }}>Motivo devolución...</option>
                                                                {RETURN_REASONS.map(r => <option key={r} value={r} style={{ backgroundColor: '#090D16' }}>{r}</option>)}
                                                            </select>
                                                            
                                                            <label style={{ 
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                                backgroundColor: item.return_evidence_url ? 'rgba(5, 150, 105, 0.2)' : 'rgba(255,255,255,0.05)',
                                                                border: item.return_evidence_url ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(255,255,255,0.08)',
                                                                borderRadius: '8px', cursor: 'pointer', height: '36px',
                                                                color: item.return_evidence_url ? '#059669' : '#9CA3AF'
                                                            }}>
                                                                {item.return_evidence_url ? <Check size={16} /> : <Camera size={16} />}
                                                                <input type="file" onChange={(e) => handleItemPhotoUpload(item.id, e)} style={{ position: 'absolute', width: '1px', height: '1px', padding: '0', margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', border: '0', whiteSpace: 'nowrap' }} />
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
                    borderRadius: '16px', 
                    border: 'none', 
                    backgroundColor: '#059669', 
                    color: 'white', 
                    fontWeight: '800', 
                    fontSize: '1.1rem',
                    boxShadow: '0 4px 20px rgba(5, 150, 105, 0.25)',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease'
                }}>
                {saving ? 'GUARDANDO...' : (
                    <>
                        <span>FINALIZAR ENTREGA</span>
                        <Check size={18} />
                    </>
                )}
            </button>

            <style jsx>{`
                .premium-card {
                    background: rgba(30, 41, 59, 0.45);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 16px;
                    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
                }
                .upload-label:hover {
                    background-color: rgba(9, 13, 22, 0.4) !important;
                    border-color: rgba(5, 150, 105, 0.3) !important;
                }
            `}</style>
        </div>
    );
}
