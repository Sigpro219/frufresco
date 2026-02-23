'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function OrderDetailPage() {
    const { id } = useParams();

    // Data States
    const [order, setOrder] = useState<Order | null>(null);
    const [items, setItems] = useState<OrderItem[]>([]);
    const [userEmail, setUserEmail] = useState('');

    interface Order {
        id: string;
        created_at: string;
        total: number;
        status: string;
        delivery_date: string;
        delivery_slot: string;
        shipping_address: string;
        latitude?: number;
        longitude?: number;
        admin_notes: string;
        total_weight_kg: number;
        profile?: {
            company_name: string;
            contact_name: string;
            contact_phone: string;
            address: string;
            latitude?: number;
            longitude?: number;
        };
    }

    interface OrderItem {
        id: string | null; // Changed to allow null for new items
        order_id: string;
        product_id: string;
        quantity: number;
        unit_price: number;
        variant_label?: string;
        selected_options?: Record<string, string>;
        product?: {
            id: string;
            name: string;
            unit_of_measure: string;
            image_url: string;
            base_price: number;
            options_config?: any;
            weight_kg?: number;
        };
    }

    // UI States
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Edit States
    const [editForm, setEditForm] = useState<Partial<Order>>({});
    const [editItems, setEditItems] = useState<OrderItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);

    // VARIANT MODAL STATES
    const [selectedProductForModal, setSelectedProductForModal] = useState<any>(null);
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
    const [modalQuantity, setModalQuantity] = useState(1);

    const fetchCurrentUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.email) setUserEmail(user.email);
    };

    const fetchOrderDetails = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch Order
            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .select(`
                    *,
                    profile:profiles!profile_id (
                        id, company_name, contact_name, contact_phone, address, nit, latitude, longitude
                    )
                `)
                .eq('id', id)
                .single();

            if (orderError) throw orderError;
            setOrder(orderData);
            if (orderData) {
                setEditForm(orderData);
            }


            // 2. Fetch Items
            const { data: itemsData, error: itemsError } = await supabase
                .from('order_items')
                .select(`
                    *,
                    product:products (
                        id, name, unit_of_measure, image_url, base_price, variants, weight_kg
                    )
                `)
                .eq('order_id', id);

            if (itemsError) throw itemsError;
            setItems(itemsData || []);
            setEditItems(itemsData || []);

            // 3. Update Weight if it's 0 but items exist (Initial logic)
            if (orderData && (!orderData.total_weight_kg || orderData.total_weight_kg === 0) && itemsData?.length) {
                const autoWeight = (itemsData as any[]).reduce((acc: number, item: any) => {
                    const w = item.product?.weight_kg || 0;
                    return acc + (item.quantity * w);
                }, 0);
                if (autoWeight > 0) {
                    setEditForm(prev => ({ ...prev, total_weight_kg: autoWeight }));
                }
            }

        } catch (e) {
            console.error(e);
            alert('Error cargando el pedido.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) {
            fetchOrderDetails();
            fetchCurrentUser();
        }
    }, [id, fetchOrderDetails]); // Added fetchOrderDetails to dependencies

    // --- PERMISSIONS LOGIC (BOGOTA AWARE) ---
    const checkIsEditable = useCallback(async () => {
        if (!order) return false;

        // 0. Locked statuses
        if (['shipped', 'in_transit', 'delivered', 'cancelled'].includes(order.status)) {
            return false;
        }

        // 1. Check Global Switch
        const { data: settings } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'enable_cutoff_rules')
            .single();
        
        const cutoffEnabled = settings?.value !== 'false';
        if (!cutoffEnabled) return true;

        // 2. Bogota Time logic
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const bogotaNow = new Date(utc + (3600000 * -5));
        
        const deliveryDate = new Date(order.delivery_date + 'T00:00:00');
        const cutoffDate = new Date(deliveryDate);
        cutoffDate.setDate(deliveryDate.getDate() - 1);
        cutoffDate.setHours(20, 0, 0, 0); // 8 PM of the day before

        // If it's already the delivery day or past 8 PM of the day before
        return bogotaNow.getTime() < cutoffDate.getTime();
    }, [order]);

    const [isEditable, setIsEditable] = useState(false);

    useEffect(() => {
        if (order) {
            checkIsEditable().then(setIsEditable);
        }
    }, [order, checkIsEditable]); // Added checkIsEditable to dependencies

    // --- EDIT LOGIC ---

    const handleEditToggle = () => {
        if (isEditing) {
            // Cancel
            if (order) {
                const resetForm: Partial<Order> = { ...order };
                setEditForm(resetForm);
                setEditItems(items);
            }
            setIsEditing(false);
        } else {
            setIsEditing(true);
        }
    };

    const handleItemChange = (index: number, field: string, value: any) => {
        const newItems = [...editItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setEditItems(newItems);
        
        // Auto Update Weight
        if (field === 'quantity') {
            recalculateWeight(newItems);
        }
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...editItems];
        newItems.splice(index, 1);
        setEditItems(newItems);
        recalculateWeight(newItems);
    };

    const recalculateWeight = (currentItems: OrderItem[]) => {
        const total = currentItems.reduce((acc, item) => {
            const w = item.product?.weight_kg || 0;
            return acc + (item.quantity * w);
        }, 0);
        setEditForm(prev => ({ ...prev, total_weight_kg: Number(total.toFixed(2)) }));
    };

    // --- PRODUCT SEARCH & VARIANT LOGIC ---

    const handleSearch = async (term: string) => {
        setSearchTerm(term);
        if (term.length < 2) {
            setSearchResults([]);
            return;
        }
        // Select 'base_price' and 'variants'
        const { data } = await supabase
            .from('products')
            .select('id, name, image_url, unit_of_measure, base_price, options_config, variants')
            .ilike('name', `%${term}%`)
            .limit(5);
        setSearchResults(data || []);
    };

    const handleProductResultClick = (product: any) => {
        // 1. Check if it has variants
        if (product.variants && product.variants.length > 0) {
            // Open Modal
            setSelectedProductForModal(product);
            setSelectedOptions({});
            setModalQuantity(1);
        } else {
            // Add Directly
            addProductToEditList(product, 1, null, null);
        }
        setSearchTerm('');
        setSearchResults([]);
    };

    const handleConfirmModal = () => {
        if (!selectedProductForModal) return;

        // Construct Variant Label (e.g. "Verde, Grande")
        const variantLabel = Object.values(selectedOptions).join(', ');

        addProductToEditList(
            selectedProductForModal,
            modalQuantity,
            selectedOptions,
            variantLabel
        );

        setSelectedProductForModal(null);
    };

    const addProductToEditList = (product: any, qty: number, options: any, label: any) => {
        const price = product.base_price || 0;

        const newItem: OrderItem = {
            id: null, // New items don't have an ID yet
            order_id: id as string, // Ensure id is string
            product_id: product.id,
            quantity: qty,
            unit_price: price, // Use Correct Price
            product: product, // For display
            selected_options: options, // Store options json
            variant_label: label,
        };

        // Append
        const updatedList = [...editItems, newItem];
        setEditItems(updatedList);
        recalculateWeight(updatedList);
    };

    // --- SAVE CHANGES ---

    const handleSaveChanges = async () => {
        setSaving(true);
        try {
            const newTotal = editItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

            // Update Order
            const { error: orderUpdateError } = await supabase
                .from('orders')
                .update({
                    delivery_date: editForm.delivery_date,
                    delivery_slot: editForm.delivery_slot,
                    shipping_address: editForm.shipping_address,
                    total: newTotal,
                    total_weight_kg: editForm.total_weight_kg,
                    status: editForm.status
                })
                .eq('id', id);

            if (orderUpdateError) throw orderUpdateError;

            // Sync Items
            const originalIds = items.map(i => i.id).filter((item_id): item_id is string => item_id !== null);
            const currentIds = editItems.map(i => i.id).filter((item_id): item_id is string => item_id !== null);
            const toDelete = originalIds.filter(id => !currentIds.includes(id));

            if (toDelete.length > 0) {
                await supabase.from('order_items').delete().in('id', toDelete);
            }

            const upsertPayload = editItems.map(item => ({
                id: item.id,
                order_id: id as string, // Ensure id is string
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                selected_options: item.selected_options, // Save Variants!
                variant_label: item.variant_label || formatVariantLabel(item.selected_options)
            }));

            // Split
            const toUpdate = upsertPayload.filter(i => i.id);
            const toInsert = upsertPayload.filter(i => !i.id).map(({ id, ...rest }) => rest);

            if (toUpdate.length > 0) await supabase.from('order_items').upsert(toUpdate);
            if (toInsert.length > 0) await supabase.from('order_items').insert(toInsert);

            alert(`✅ Cambios guardados exitosamente por ${userEmail || 'Usuario'}`);

            setIsEditing(false);
            fetchOrderDetails();

        } catch (e: any) {
            console.error(e);
            alert('Error guardando cambios: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const updateStatus = async (newStatus: string) => {
        try {
            await supabase.from('orders').update({ status: newStatus }).eq('id', id as string);
            setOrder(prev => prev ? { ...prev, status: newStatus } : null);
        } catch (e) { console.error(e); }
    };

    // --- RENDER HELPERS ---

    const formatVariantLabel = (options: Record<string, string> | null | undefined) => {
        if (!options) return '';
        return Object.values(options).join(', ');
    };

    const getDisplayStatus = (status: string) => {
        const map: any = { 'pending_approval': 'Pendiente', 'approved': 'Pendiente', 'shipped': 'En Transporte', 'delivered': 'Entregado', 'cancelled': 'Cancelado' };
        return map[status] || status;
    };
    const getStatusColor = (status: string) => {
        const s = getDisplayStatus(status);
        if (s === 'Pendiente') return '#F59E0B';
        if (s === 'En Transporte') return '#3B82F6';
        if (s === 'Entregado') return '#10B981';
        return '#6B7280';
    };

    if (loading || !order) return <div style={{ padding: '2rem' }}>Cargando...</div>;

    const totalToDisplay = isEditing
        ? editItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
        : order.total;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', fontFamily: 'Inter, sans-serif' }}>
            <Navbar />
            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>
                <Link href="/admin/orders/loading" style={{ color: '#6B7280', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                    ← Volver al Listado
                </Link>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', margin: 0 }}>
                            #{getFriendlyOrderId(order)}
                        </h1>
                        <p style={{ color: '#6B7280', marginTop: '0.5rem' }}>
                            Creado el {new Date(order.created_at).toLocaleString()}
                        </p>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>

                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            {isEditable ? (
                                <button
                                    onClick={handleEditToggle}
                                    disabled={saving}
                                    style={{
                                        backgroundColor: isEditing ? '#EF4444' : '#111827',
                                        color: 'white', border: 'none', borderRadius: '8px',
                                        padding: '0.5rem 1rem', fontWeight: 'bold', cursor: 'pointer'
                                    }}
                                >
                                    {isEditing ? 'Cancelar Edición' : '✏️ Editar Pedido'}
                                </button>
                            ) : (
                                <div style={{
                                    padding: '0.5rem 1rem', borderRadius: '8px',
                                    backgroundColor: '#E5E7EB', color: '#6B7280',
                                    fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    border: '1px solid #D1D5DB'
                                }} title="La ventana de edición (8 PM) ha cerrado para este pedido.">
                                    🔒 Edición Cerrada
                                </div>
                            )}

                            {!isEditing && (
                                <div style={{ padding: '0.5rem 1rem', borderRadius: '8px', backgroundColor: getStatusColor(order.status), color: 'white', fontWeight: 'bold' }}>
                                    {getDisplayStatus(order.status)}
                                </div>
                            )}
                        </div>

                        {!isEditing && getDisplayStatus(order.status) === 'En Transporte' && (
                            <button onClick={() => updateStatus('delivered')} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', backgroundColor: '#10B981', color: 'white', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                ✅ Marcar Entregado
                            </button>
                        )}
                        {isEditing && (
                            <select 
                                value={editForm.status} 
                                onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: 'bold' }}
                            >
                                <option value="pending_approval">Pendiente</option>
                                <option value="para_compra">Para Compra</option>
                                <option value="approved">Aprobado</option>
                                <option value="shipped">En Transporte</option>
                                <option value="delivered">Entregado</option>
                                <option value="cancelled">Cancelado</option>
                            </select>
                        )}
                    </div>
                </div>

                {isEditing && (
                    <div style={{ backgroundColor: '#FFFBEB', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #FCD34D', color: '#92400E', fontWeight: 'bold' }}>
                        ⚠️ Modo Edición Activo. Recuerda guardar los cambios.
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>

                    {/* LEFT: ITEMS */}
                    <div>
                        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                            <div style={{ padding: '1rem', borderBottom: '1px solid #F3F4F6', fontWeight: '800', backgroundColor: '#F9FAFB' }}>
                                Productos
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {(isEditing ? editItems : items).map((item, i) => {
                                        // Display Label: Either item.variant_label OR format(item.selected_options)
                                        const label = item.variant_label || formatVariantLabel(item.selected_options);

                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                <td style={{ padding: '1rem', width: '60px' }}>
                                                     <img
                                                          src={item.product?.image_url || 'https://via.placeholder.com/64'}
                                                          alt={item.product?.name || 'Producto'}
                                                          style={{ width: '64px', height: '64px', borderRadius: '8px', objectFit: 'cover' }}
                                                      />
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ fontWeight: '600', color: '#1F2937' }}>
                                                        {item.product?.name}
                                                        {label && (
                                                            <span style={{ fontSize: '0.8rem', backgroundColor: '#FEF3C7', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#D97706' }}>
                                                                {label}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>${item.unit_price} / {item.product?.unit_of_measure}</div>
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                    {isEditing ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={item.quantity}
                                                                onChange={(e) => handleItemChange(i, 'quantity', parseFloat(e.target.value))}
                                                                style={{ width: '60px', padding: '0.3rem', border: '1px solid #D1D5DB', borderRadius: '4px' }}
                                                            />
                                                            <button onClick={() => handleRemoveItem(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>🗑️</button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ fontWeight: '700' }}>{item.quantity} {item.product?.unit_of_measure}</div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    ${(item.unit_price * item.quantity).toLocaleString()}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan={3} style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>TOTAL</td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '900', fontSize: '1.2rem' }}>
                                            ${totalToDisplay?.toLocaleString()}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>

                            {/* SEARCH ADD PRODUCT */}
                            {isEditing && (
                                <div style={{ padding: '1rem', borderTop: '1px solid #F3F4F6', backgroundColor: '#F9FAFB' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '700', marginBottom: '0.5rem', color: '#6B7280' }}>AGREGAR PRODUCTO</div>
                                    <input
                                        placeholder="Buscar producto..."
                                        value={searchTerm}
                                        onChange={(e) => handleSearch(e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                                    />
                                    {searchResults.length > 0 && (
                                        <div style={{ marginTop: '0.5rem', backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                                            {searchResults.map(p => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => handleProductResultClick(p)}
                                                    style={{ padding: '0.5rem', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                                                >
                                                    <div>
                                                        <div style={{ fontWeight: '600' }}>{p.name}</div>
                                                        {p.options_config && p.options_config.length > 0 && <span style={{ fontSize: '0.7rem', color: '#D97706' }}>⚙️ Variantes</span>}
                                                    </div>
                                                    <span style={{ fontWeight: 'bold' }}>+</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* SAVE BUTTON FOR EDITING */}
                        {isEditing && (
                            <div style={{ marginTop: '2rem' }}>
                                <button
                                    onClick={handleSaveChanges}
                                    disabled={saving}
                                    style={{
                                        width: '100%', padding: '1rem', backgroundColor: '#10B981', color: 'white',
                                        border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold',
                                        cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                                    }}
                                >
                                    {saving ? 'Guardando...' : '💾 Guardar Cambios'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: INFO */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                        {/* DELIVERY INFO */}
                        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '1rem' }}>Entrega {isEditing && '✏️'}</h3>

                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Fecha Programada</div>
                                {isEditing ? (
                                    <input
                                        type="date"
                                        value={editForm.delivery_date}
                                        onChange={e => setEditForm({ ...editForm, delivery_date: e.target.value })}
                                        style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                                    />
                                ) : (
                                    <div style={{ fontWeight: '700' }}>{order.delivery_date}</div>
                                )}
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Franja Horaria</div>
                                {isEditing ? (
                                    <select
                                        value={editForm.delivery_slot || 'AM'}
                                        onChange={e => setEditForm({ ...editForm, delivery_slot: e.target.value })}
                                        style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                                    >
                                        <option value="AM">Mañana</option>
                                        <option value="PM">Tarde</option>
                                    </select>
                                ) : (
                                    <div style={{ fontWeight: '700' }}>
                                        {order.delivery_slot === 'AM' ? '☀️ Mañana' : order.delivery_slot === 'PM' ? '🌙 Tarde' : order.delivery_slot}
                                    </div>
                                )}
                            </div>

                            <div>
                                <div style={{ fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Dirección de Envío</div>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={editForm.shipping_address || ''}
                                        onChange={e => setEditForm({ ...editForm, shipping_address: e.target.value })}
                                        style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                                    />
                                ) : (
                                    <>
                                        <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{order.shipping_address || 'Misma del cliente'}</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '0.5rem' }}>
                                            <div style={{ 
                                                fontSize: '0.7rem', fontWeight: '800', padding: '3px 8px', borderRadius: '4px',
                                                backgroundColor: (order.latitude || order.profile?.latitude) ? '#F0FDF4' : '#FFF1F2',
                                                color: (order.latitude || order.profile?.latitude) ? '#16A34A' : '#E11D48',
                                                border: `1px solid ${(order.latitude || order.profile?.latitude) ? '#DCFCE7' : '#FFE4E6'}`,
                                                alignSelf: 'flex-start'
                                            }}>
                                                LAT: {order.latitude ? order.latitude.toFixed(6) : (order.profile?.latitude ? `(P) ${order.profile.latitude.toFixed(6)}` : '--')}
                                            </div>
                                            <div style={{ 
                                                fontSize: '0.7rem', fontWeight: '800', padding: '3px 8px', borderRadius: '4px',
                                                backgroundColor: (order.longitude || order.profile?.longitude) ? '#F0FDF4' : '#FFF1F2',
                                                color: (order.longitude || order.profile?.longitude) ? '#16A34A' : '#E11D48',
                                                border: `1px solid ${(order.longitude || order.profile?.longitude) ? '#DCFCE7' : '#FFE4E6'}`,
                                                alignSelf: 'flex-start'
                                            }}>
                                                LON: {order.longitude ? order.longitude.toFixed(6) : (order.profile?.longitude ? `(P) ${order.profile.longitude.toFixed(6)}` : '--')}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div style={{ marginTop: '1rem' }}>
                                <div style={{ fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.4rem', fontWeight: '800', textTransform: 'uppercase' }}>
                                    ⚖️ Peso de Carga
                                </div>
                                {isEditing ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={editForm.total_weight_kg || 0}
                                            onChange={e => setEditForm({ ...editForm, total_weight_kg: parseFloat(e.target.value) || 0 })}
                                            style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '900', color: '#0D9488' }}
                                        />
                                        <span style={{ fontWeight: 'bold', color: '#6B7280' }}>kg</span>
                                    </div>
                                ) : (
                                    <div style={{ 
                                        fontWeight: '900', color: '#0D9488', fontSize: '1.2rem',
                                        backgroundColor: '#F0FDFA', padding: '0.8rem', borderRadius: '10px',
                                        border: '1px solid #CCFBF1', display: 'flex', alignItems: 'center', gap: '8px'
                                    }}>
                                        <span>{order.total_weight_kg || 0}</span>
                                        <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>kg</span>
                                    </div>
                                )}
                                {isEditing && (
                                    <p style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '4px' }}>
                                        * Se recalcula automáticamente al cambiar productos.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #E5E7EB', opacity: isEditing ? 0.7 : 1 }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '1rem' }}>Cliente</h3>
                            {order.profile ? (
                                <>
                                    <div style={{ fontWeight: '800', fontSize: '1.1rem', marginBottom: '0.2rem' }}>{order.profile.company_name}</div>
                                    <div style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{order.profile.contact_name}</div>
                                    <div style={{ fontSize: '0.9rem' }}>📞 {order.profile.contact_phone || 'Sin teléfono'}</div>
                                </>
                            ) : (
                                <div style={{ color: '#6B7280', fontStyle: 'italic' }}>Invitado / Sin Perfil</div>
                            )}
                        </div>

                    </div>
                </div>
            </div>

            {/* --- VARIANT SELECTION MODAL --- */}
            {selectedProductForModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, backdropFilter: 'blur(3px)'
                }} onClick={() => setSelectedProductForModal(null)}>

                    <div
                        style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '16px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', textAlign: 'center' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {selectedProductForModal.image_url && (
                             <img
                                 src={selectedProductForModal.image_url}
                                 alt={selectedProductForModal.name}
                                 style={{ width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover', marginBottom: '1rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
                             />
                        )}
                        <h3 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '0.5rem' }}>{selectedProductForModal.name}</h3>
                        <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Personaliza tu producto:</p>

                        {/* RENDER OPTIONS */}
                        {selectedProductForModal.options_config && selectedProductForModal.options_config.map((opt: any) => (
                            <div key={opt.name} style={{ marginBottom: '1rem', textAlign: 'left' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#4B5563', marginBottom: '0.3rem', textTransform: 'uppercase' }}>
                                    {opt.name}
                                </label>
                                <select
                                    value={selectedOptions[opt.name] || ''}
                                    onChange={(e) => setSelectedOptions((prev: any) => ({ ...prev, [opt.name]: e.target.value }))}
                                    style={{ width: '100%', padding: '0.7rem', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '0.95rem', backgroundColor: '#F9FAFB' }}
                                >
                                    <option value="">Seleccionar {opt.name}...</option>
                                    {opt.values?.map((val: string) => (
                                        <option key={val} value={val}>{val}</option>
                                    ))}
                                </select>
                            </div>
                        ))}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', margin: '2rem 0' }}>
                            <button
                                onClick={() => setModalQuantity(Math.max(1, modalQuantity - 1))}
                                style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #D1D5DB', backgroundColor: 'white', fontSize: '1.2rem', cursor: 'pointer' }}
                            >−</button>
                            <span style={{ fontSize: '1.4rem', fontWeight: '800', minWidth: '60px' }}>
                                {modalQuantity} {selectedProductForModal.unit_of_measure}
                            </span>
                            <button
                                onClick={() => setModalQuantity(modalQuantity + 1)}
                                style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', backgroundColor: '#10B981', color: 'white', fontSize: '1.2rem', cursor: 'pointer' }}
                            >+</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <button
                                onClick={() => setSelectedProductForModal(null)}
                                style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: 'white', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmModal}
                                style={{ padding: '0.8rem', borderRadius: '8px', backgroundColor: '#111827', color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                            >
                                Agregar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
