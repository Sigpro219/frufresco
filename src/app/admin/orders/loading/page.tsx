'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { getFriendlyOrderId } from '@/lib/orderUtils';

export default function OrderLoadingPage() {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(() => {
        const now = new Date();
        const bogota = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
        return bogota.toISOString().split('T')[0];
    });
    const [filterSource, setFilterSource] = useState('all');

    const [filterStatus, setFilterStatus] = useState('all');
    const [refreshTrigger, setRefreshTrigger] = useState(0); // Forcing refresh

    // Modal States
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [orderItems, setOrderItems] = useState<any[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [updateLoading, setUpdateLoading] = useState(false);
    
    // Bulk Selection State
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

    const toggleSelectAll = () => {
        if (selectedOrders.size === orders.length && orders.length > 0) {
            setSelectedOrders(new Set());
        } else {
            setSelectedOrders(new Set(orders.map(o => o.id)));
        }
    };

    const toggleSelectOrder = (id: string) => {
        const newSet = new Set(selectedOrders);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedOrders(newSet);
    };

    // Edit Fields
    const [editStatus, setEditStatus] = useState('');
    const [editDeliveryDate, setEditDeliveryDate] = useState('');
    
    // Product Search for adding new items
    const [productSearch, setProductSearch] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);

    // Variant Selection Modal States (For products with options)
    const [selectedProductForVariant, setSelectedProductForVariant] = useState<any | null>(null);
    const [variantQuantity, setVariantQuantity] = useState(1);
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

    const handleOrderClick = async (order: any) => {
        setSelectedOrder(order);
        setEditStatus(order.status);
        setEditDeliveryDate(order.delivery_date);
        setEditMode(false);
        setLoadingItems(true);
        setOrderItems([]);
        setProductSearch('');
        setSearchResults([]);
        
        try {
            if (!order?.id) {
                alert('Error: ID de pedido no encontrado');
                return;
            }

            // Explicit select to avoid RLS issues with unneeded columns and improve performance
            const { data, error } = await supabase
                .from('order_items')
                .select(`
                    id,
                    order_id,
                    product_id,
                    quantity,
                    unit_price,
                    variant_label,
                    selected_options,
                    products (
                        name,
                        sku,
                        unit_of_measure,
                        weight_kg,
                        image_url
                    )
                `)
                .eq('order_id', order.id);
            
            if (error) {
                console.error('Supabase Error:', error);
                alert(`Error cargando productos: ${error.message}`);
                throw error;
            }

            if (!data || data.length === 0) {
                console.warn('⚠️ No se encontraron items para el pedido:', order.id);
            } else {
                console.log('✅ Items cargados:', data.length);
            }

            setOrderItems(data || []);
        } catch (err: any) {
            console.error('Error fetching order items:', err);
            // Alert already shown if Supabase error, otherwise generic
            if (!err.message?.includes('Error cargando productos')) {
                 alert(`Error inesperado: ${err.message || 'Desconocido'}`);
            }
        } finally {
            setLoadingItems(false);
        }
    };

    // Real-time calculations
    const currentTotal = orderItems.reduce((acc, item) => acc + ((item.unit_price || 0) * item.quantity), 0);
    const currentWeight = orderItems.reduce((acc, item) => {
        const weight = item.products?.weight_kg || 0;
        return acc + (weight * item.quantity);
    }, 0);

    const handleSearchProducts = async (term: string) => {
        setProductSearch(term);
        if (term.length < 3) {
            setSearchResults([]);
            return;
        }
        
        setSearching(true);
        console.log('🔍 Buscando productos:', term);
        try {
            // Corregido: La columna real es 'base_price', no 'price'. Incluimos options_config para variantes.
            const { data, error } = await supabase
                .from('products')
                .select('id, name, sku, base_price, unit_of_measure, weight_kg, options_config, image_url')
                .or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
                .limit(8);
            
            if (error) {
                console.error('❌ Error de Supabase:', error.message, error.details, error.hint, error.code);
                throw error;
            }
            
            console.log('✅ Resultados encontrados:', data?.length || 0);
            setSearchResults(data || []);
        } catch (err: any) {
            console.error('💥 Excepción en búsqueda:', err);
            const msg = err.message || JSON.stringify(err);
            
            if (err.code === '42501' || msg.includes('permission denied')) {
                alert('⚠️ Error de Permisos (RLS): No tienes permiso para buscar en la tabla "products". Por favor, ejecuta el script SQL de permisos.');
            } else if (err.code === '42703') {
                console.error('Columna no encontrada. Verificando esquema...');
            }
        } finally {
            setSearching(false);
        }
    };

    const addProductToOrder = (product: any) => {
        // Reset sub-modal states
        setVariantQuantity(1);
        setSelectedOptions({});

        // Check if product has variants/options
        if (product.options_config && Array.isArray(product.options_config) && product.options_config.length > 0) {
            setSelectedProductForVariant(product);
            setProductSearch('');
            setSearchResults([]);
            return;
        }

        // Direct add if no variants
        addOrUpdateItemInState(product, 1);
        setProductSearch('');
        setSearchResults([]);
    };

    const confirmVariantAdd = () => {
        if (!selectedProductForVariant) return;
        const optionValues = Object.values(selectedOptions).filter(v => v);
        const variantLabel = optionValues.length > 0 ? optionValues.join(', ') : undefined;
        
        addOrUpdateItemInState(selectedProductForVariant, variantQuantity, variantLabel, selectedOptions);
        setSelectedProductForVariant(null);
    };

    const addOrUpdateItemInState = (product: any, qty: number, variantLabel?: string, optionsRaw?: any) => {
        // Check if item with same product_id AND variant_label exists
        const existsIndex = orderItems.findIndex(item => 
            item.product_id === product.id && item.variant_label === variantLabel
        );

        if (existsIndex >= 0) {
            const newOrderItems = [...orderItems];
            newOrderItems[existsIndex] = {
                ...newOrderItems[existsIndex],
                quantity: newOrderItems[existsIndex].quantity + qty,
                isModified: true
            };
            setOrderItems(newOrderItems);
        } else {
            const newItem = {
                order_id: selectedOrder.id,
                product_id: product.id,
                quantity: qty,
                unit_price: product.base_price,
                variant_label: variantLabel,
                selected_options: optionsRaw,
                products: {
                    name: product.name,
                    sku: product.sku,
                    unit_of_measure: product.unit_of_measure,
                    weight_kg: product.weight_kg
                },
                isNew: true
            };
            setOrderItems([...orderItems, newItem]);
        }
    };

    const updateItemQuantity = (idx: number, newQty: number) => {
        if (newQty <= 0) return;
        const newOrderItems = [...orderItems];
        newOrderItems[idx] = { ...newOrderItems[idx], quantity: newQty, isModified: true };
        setOrderItems(newOrderItems);
    };

    const removeItemFromOrder = (idx: number) => {
        const newOrderItems = [...orderItems];
        newOrderItems.splice(idx, 1);
        setOrderItems(newOrderItems);
    };

    const handleUpdateOrder = async () => {
        if (!selectedOrder) return;
        setUpdateLoading(true);
        console.log('📦 Iniciando actualización del pedido:', selectedOrder.id);
        
        try {
            // 1. Actualizar cabecera del pedido
            const { error: orderError } = await supabase
                .from('orders')
                .update({
                    status: editStatus,
                    delivery_date: editDeliveryDate,
                    total: currentTotal,
                    total_weight_kg: currentWeight
                })
                .eq('id', selectedOrder.id);

            if (orderError) {
                console.error('❌ Error actualizando cabecera:', orderError);
                throw new Error(`Error en orders: ${orderError.message}`);
            }

            // 2. Sincronizar ítems
            const { data: originalItems, error: fetchErr } = await supabase
                .from('order_items')
                .select('id')
                .eq('order_id', selectedOrder.id);
            
            if (fetchErr) throw fetchErr;
            
            const originalIds = originalItems?.map(item => item.id) || [];
            const currentIds = orderItems.filter(item => !item.isNew).map(item => item.id);
            const idsToDelete = originalIds.filter(id => !currentIds.includes(id));

            // Operaciones en paralelo para mayor velocidad
            const operations = [];

            // Eliminaciones
            if (idsToDelete.length > 0) {
                console.log('🗑️ Eliminando ítems:', idsToDelete.length);
                operations.push(supabase.from('order_items').delete().in('id', idsToDelete));
            }

            // Nuevos ítems (Insertar)
            const itemsToInsert = orderItems.filter(item => item.isNew).map(item => ({
                order_id: selectedOrder.id,
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                variant_label: item.variant_label,
                selected_options: item.selected_options
            }));

            if (itemsToInsert.length > 0) {
                console.log('➕ Insertando nuevos ítems:', itemsToInsert.length);
                operations.push(supabase.from('order_items').insert(itemsToInsert));
            }

            // Ítems existentes (Actualizar cantidades)
            const itemsToUpdate = orderItems.filter(item => !item.isNew && item.isModified);
            for (const item of itemsToUpdate) {
                console.log('🔄 Actualizando ítem:', item.id);
                operations.push(
                    supabase.from('order_items')
                        .update({ 
                            quantity: item.quantity, 
                            unit_price: item.unit_price,
                            variant_label: item.variant_label,
                            selected_options: item.selected_options
                        })
                        .eq('id', item.id)
                );
            }

            if (operations.length > 0) {
                const results = await Promise.all(operations);
                const errors = results.filter(r => r.error).map(r => r.error?.message);
                if (errors.length > 0) {
                    console.error('❌ Errores en operaciones de ítems:', errors);
                    throw new Error(`Error en ítems: ${errors.join(', ')}`);
                }
            }
            
            // Refrescar estado local
            setOrders(orders.map(o => o.id === selectedOrder.id ? { 
                ...o, 
                status: editStatus, 
                delivery_date: editDeliveryDate, 
                total: currentTotal,
                total_weight_kg: currentWeight
            } : o));
            
            setSelectedOrder({ 
                ...selectedOrder, 
                status: editStatus, 
                delivery_date: editDeliveryDate,
                total: currentTotal,
                total_weight_kg: currentWeight
            });
            
            setEditMode(false);
            alert('✅ Pedido actualizado correctamente');
        } catch (err: any) {
            console.error('💥 Error crítico actualizando pedido:', err);
            alert(`❌ Error al actualizar el pedido: ${err.message || 'Error desconocido'}`);
        } finally {
            setUpdateLoading(false);
        }
    };

    const handleBulkAction = async (targetStatus: string) => {
        if (selectedOrders.size === 0) return;
        const confirmMsg = targetStatus === 'para_compra' 
            ? `¿Estás seguro de enviar ${selectedOrders.size} pedidos a COMPRAS?` 
            : `¿Cambiar estado de ${selectedOrders.size} pedidos a ${targetStatus}?`;
        
        if (!confirm(confirmMsg)) return;

        setUpdateLoading(true);
        try {
            const { error } = await supabase
                .from('orders')
                .update({ status: targetStatus }) 
                .in('id', Array.from(selectedOrders));

            if (error) throw error;

            alert('✅ Pedidos actualizados correctamente');
            setSelectedOrders(new Set());
            setRefreshTrigger(prev => prev + 1); // Trigger refresh
        } catch (err: any) {
            console.error('Error in bulk update:', err);
            alert(`❌ Error al actualizar: ${err.message}`);
        } finally {
            setUpdateLoading(false);
        }
    };

    const resetFilters = () => {
        const now = new Date();
        const bogota = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
        setSelectedDate(bogota.toISOString().split('T')[0]);
        setFilterSource('all');
        setFilterStatus('all');
    };

    useEffect(() => {
        let active = true;

        const fetchOrders = async () => {
            setLoading(true);
            try {
                let query = supabase
                    .from('orders')
                    .select('*, profiles:profiles(role, contact_phone, latitude, longitude, company_name, contact_name, nit, email)')
                    .eq('delivery_date', selectedDate)
                    .order('created_at', { ascending: false });

                if (filterSource !== 'all') {
                    query = query.eq('origin_source', filterSource);
                }
                if (filterStatus !== 'all') {
                    query = query.eq('status', filterStatus);
                }

                const { data, error } = await query;

                if (error) {
                    console.error('Error fetching orders:', error);
                    return;
                }

                if (active) {
                    const processedData = (data || []).map(order => {
                        let name = 'Cliente Desconocido';
                        let phone = 'Sin Teléfono';

                        if (order.profiles) {
                            // Unified Profile Logic
                            if (order.profiles.role === 'b2b_client') {
                                name = order.profiles.company_name || 'Sin Razón Social';
                            } else {
                                // Assume B2C or mixed
                                name = order.profiles.contact_name || order.profiles.company_name || 'Cliente Registrado';
                            }
                            phone = order.profiles.contact_phone || 'Sin Teléfono';
                        } else if (order.admin_notes && order.admin_notes.includes('CLIENTE HOGAR')) {
                            // Manual B2C Parsing Logic (Fallback)
                            const nameMatch = order.admin_notes.match(/Nombre: (.*?) \|/);
                            const phoneMatch = order.admin_notes.match(/Tel: (.*?) \|/);
                            if (nameMatch) name = nameMatch[1];
                            if (phoneMatch) phone = phoneMatch[1];
                        }

                        return {
                            ...order,
                            customer_name: name,
                            customer_phone: phone,
                            customer_nit: order.profiles?.nit || null,
                            paymentMethod: order.admin_notes && order.admin_notes.includes('[PAGO:') ? 
                                           order.admin_notes.match(/\[PAGO: (.*?)\]/)?.[1] : null
                        };
                    });
                    setOrders(processedData);
                    // Reset selection on data refresh
                    setSelectedOrders(new Set());
                }
            } catch (err) {
                console.error('Exception:', err);
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        fetchOrders();

        return () => {
            active = false;
        };
        return () => {
            active = false;
        };
    }, [selectedDate, filterSource, filterStatus, refreshTrigger]);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
            <Navbar />
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', marginBottom: '0.2rem', color: '#0F172A' }}>
                            Cargue de Pedidos
                        </h1>
                        <p style={{ color: '#64748B', fontSize: '0.9rem', margin: 0 }}>Gestión y monitoreo de la demanda diaria</p>
                    </div>
                    
                    {/* Acciones Secundarias (Menos protagonismo) */}
                    <div style={{ display: 'flex', gap: '8px' }}>



                        
                        <Link href="/admin/orders/create" style={{
                            textDecoration: 'none',
                            padding: '8px 16px',
                            backgroundColor: '#2563EB',
                            color: 'white',
                            borderRadius: '10px',
                            border: '1px solid #1D4ED8',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 4px rgba(37, 99, 235, 0.1)'
                        }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1D4ED8'}>
                            <span>➕</span> NUEVO PEDIDO
                        </Link>
                    </div>
                    </div>
                    
                    {/* Bulk Action Floating Bar (Placeholder for now) */}
                    {selectedOrders.size > 0 && (
                        <div style={{ 
                            position: 'fixed', 
                            bottom: '2rem', 
                            left: '50%', 
                            transform: 'translateX(-50%)', 
                            backgroundColor: '#1E293B', 
                            color: 'white', 
                            padding: '1rem 2rem', 
                            borderRadius: '50px', 
                            boxShadow: '0 10px 25px rgba(0,0,0,0.2)', 
                            zIndex: 1000,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1.5rem',
                            animation: 'slideUp 0.3s ease-out'
                        }}>
                            <div style={{ fontWeight: '700', borderRight: '1px solid #475569', paddingRight: '1.5rem' }}>
                                {selectedOrders.size} Seleccionados
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button 
                                    onClick={() => handleBulkAction('para_compra')}
                                    disabled={updateLoading}
                                    style={{
                                        backgroundColor: '#10B981',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        padding: '0.5rem 1rem',
                                        fontWeight: '700',
                                        cursor: updateLoading ? 'wait' : 'pointer',
                                        boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)',
                                        opacity: updateLoading ? 0.7 : 1
                                    }}
                                >
                                    {updateLoading ? 'Procesando...' : 'Enviar a Compras'}
                                </button>
                                <button 
                                    onClick={() => setSelectedOrders(new Set())}
                                    style={{
                                        backgroundColor: 'transparent',
                                        color: '#94A3B8',
                                        border: '1px solid #475569',
                                        borderRadius: '8px',
                                        padding: '0.5rem 1rem',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                            </div>
                            <style>{`
                                @keyframes slideUp {
                                    from { transform: translate(-50%, 100%); opacity: 0; }
                                    to { transform: translate(-50%, 0); opacity: 1; }
                                }
                            `}</style>
                        </div>
                    )}


                {/* Filtros */}
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(4, 1fr)', 
                    gap: '1rem', 
                    marginBottom: '2rem',
                    backgroundColor: 'white',
                    padding: '1.5rem',
                    borderRadius: '12px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    alignItems: 'end'
                }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#64748B', marginBottom: '0.5rem' }}>
                            FECHA DE ENTREGA
                        </label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                fontSize: '0.875rem'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#64748B', marginBottom: '0.5rem' }}>
                            CANAL
                        </label>
                        <select
                            value={filterSource}
                            onChange={(e) => setFilterSource(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                fontSize: '0.875rem'
                            }}
                        >
                            <option value="all">Todos</option>
                            <option value="web">Web</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="phone">Teléfono</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#64748B', marginBottom: '0.5rem' }}>
                            ESTADO
                        </label>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                fontSize: '0.875rem'
                            }}
                        >
                            <option value="all">Todos</option>
                            <option value="pending_approval">Pendiente</option>
                            <option value="para_compra">Para Compra</option>
                            <option value="approved">Aprobado</option>
                            <option value="shipped">Enviado</option>
                            <option value="delivered">Entregado</option>
                        </select>
                    </div>
                    <button
                        onClick={resetFilters}
                        style={{
                            padding: '0.625rem 1rem',
                            backgroundColor: '#F1F5F9',
                            color: '#475569',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#E2E8F0';
                            e.currentTarget.style.color = '#1E293B';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#F1F5F9';
                            e.currentTarget.style.color = '#475569';
                        }}
                    >
                        <span>🧹</span> Limpiar Filtros
                    </button>
                </div>

                {/* Loading */}
                {loading && (
                    <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'white', borderRadius: '12px' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
                        <div style={{ color: '#64748B' }}>Cargando pedidos...</div>
                    </div>
                )}

                {/* Empty */}
                {!loading && orders.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'white', borderRadius: '12px' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                        <div style={{ color: '#64748B', fontWeight: '600' }}>No hay pedidos para esta fecha</div>
                    </div>
                )}

                {/* List View (Table) */}
                {!loading && orders.length > 0 && (
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)', border: '1px solid #F1F5F9' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                                    <th style={{ padding: '1.25rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        ID / TIPO
                                    </th>
                                    <th style={{ padding: '1.25rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        CLIENTE
                                    </th>
                                    <th style={{ padding: '1.25rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        DIRECCIÓN / GPS
                                    </th>
                                    <th style={{ padding: '1.25rem 1rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        ORIGEN
                                    </th>
                                    <th style={{ padding: '1.25rem 1rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        PESO
                                    </th>
                                    <th style={{ padding: '1.25rem 1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        VALOR TOTAL
                                    </th>
                                    <th style={{ padding: '1.25rem 1rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        ESTADO
                                    </th>
                                    <th style={{ padding: '1.25rem 1rem', width: '40px', textAlign: 'center' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={orders.length > 0 && selectedOrders.size === orders.length}
                                            onChange={toggleSelectAll}
                                            style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                                        />
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((order) => {
                                    const isB2B = order.type?.startsWith('b2b') || order.profile?.role === 'b2b';
                                    const hasGPS = (order.latitude && order.longitude) || (order.profiles?.latitude && order.profiles?.longitude);
                                    const friendlyId = getFriendlyOrderId(order);

                                    return (
                                        <tr key={order.id} 
                                            onClick={() => handleOrderClick(order)}
                                            style={{ borderBottom: '1px solid #F1F5F9', transition: 'background-color 0.2s', cursor: 'pointer' }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <td style={{ padding: '1rem' }}>
                                                <div style={{ fontFamily: 'monospace', fontWeight: '800', fontSize: '1rem', color: '#1E293B' }}>
                                                    {friendlyId}
                                                </div>
                                                <div style={{ 
                                                    display: 'inline-block',
                                                    marginTop: '4px',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.6rem',
                                                    fontWeight: '800',
                                                    backgroundColor: isB2B ? '#F5F3FF' : '#FDF2F8',
                                                    color: isB2B ? '#7C3AED' : '#EC4899',
                                                    border: `1px solid ${isB2B ? '#DDD6FE' : '#FBCFE8'}`
                                                }}>
                                                    {isB2B ? '🏢 B2B' : '🏠 B2C'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#0F172A' }}>{order.customer_name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600', marginTop: '2px' }}>
                                                    🆔 {order.customer_nit || <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Sin NIT</span>}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                    <span>📞</span> {order.customer_phone || order.profiles?.contact_phone || 'Sin tel.'}
                                                </div>
                                                <div style={{ 
                                                    marginTop: '4px', 
                                                    display: 'inline-block', 
                                                    padding: '2px 6px', 
                                                    backgroundColor: order.paymentMethod ? '#ECFCCB' : '#F1F5F9', 
                                                    color: order.paymentMethod ? '#365314' : '#64748B', 
                                                    borderRadius: '4px', 
                                                    fontSize: '0.7rem', 
                                                    fontWeight: '700', 
                                                    border: `1px solid ${order.paymentMethod ? '#D9F99D' : '#E2E8F0'}` 
                                                }}>
                                                    💳 {order.paymentMethod || 'Método no especificado'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                <div style={{ fontSize: '0.875rem', color: '#334155', fontWeight: '500' }}>{order.shipping_address}</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                    {hasGPS ? (
                                                        <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: '700', backgroundColor: '#D1FAE5', padding: '1px 6px', borderRadius: '4px' }}>
                                                            📍 COORDENADAS OK
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: '700', backgroundColor: '#F1F5F9', padding: '1px 6px', borderRadius: '4px' }}>
                                                            ⚠ SIN COORDENADAS
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem', textAlign: 'center', fontSize: '1.5rem' }}>
                                                {order.origin_source === 'web' ? <span title="Web / B2B">🛒</span> :
                                                 order.origin_source === 'whatsapp' ? <span title="WhatsApp">💬</span> :
                                                 order.origin_source === 'flat_file' ? <span title="Archivo Plano">📁</span> :
                                                 <span title="Teléfono / Otro">📞</span>}
                                            </td>
                                            <td style={{ padding: '1rem', textAlign: 'center' }}>
                                                <div style={{ fontWeight: '800', color: '#475569', fontSize: '0.9rem' }}>
                                                    {order.total_weight_kg ? `${order.total_weight_kg.toFixed(1)} kg` : '0 kg'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                <div style={{ fontWeight: '900', color: '#059669', fontSize: '1.125rem' }}>
                                                    ${order.total.toLocaleString()}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem', textAlign: 'center' }}>
                                                <div style={{
                                                    display: 'inline-block',
                                                    padding: '4px 12px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: '800',
                                                    backgroundColor: 
                                                        order.status === 'pending_approval' ? '#FEF3C7' : 
                                                        order.status === 'approved' ? '#D1FAE5' :
                                                        order.status === 'shipped' ? '#DBEAFE' : '#F1F5F9',
                                                    color: 
                                                        order.status === 'pending_approval' ? '#92400E' : 
                                                        order.status === 'approved' ? '#065F46' :
                                                        order.status === 'shipped' ? '#1E40AF' : '#475569'
                                                }}>
                                                    {order.status.replace('_', ' ').toUpperCase()}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedOrders.has(order.id)}
                                                    onChange={(e) => { e.stopPropagation(); toggleSelectOrder(order.id); }}
                                                    style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <div style={{ textAlign: 'center', marginTop: '1.5rem', color: '#94A3B8', fontSize: '0.875rem' }}>
                    {orders.length} pedido(s) encontrado(s)
                </div>

                {/* Order Details Modal */}
                {selectedOrder && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.75)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2000,
                        backdropFilter: 'blur(8px)',
                        padding: '1rem'
                    }} onClick={() => setSelectedOrder(null)}>
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: '24px',
                            width: '95%',
                            maxWidth: '900px',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                            overflow: 'hidden',
                            border: '1px solid rgba(255,255,255,0.2)'
                        }} onClick={e => e.stopPropagation()}>
                            {/* Modal Header */}
                            <div style={{ 
                                padding: '2rem', 
                                borderBottom: '1px solid #F1F5F9', 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'flex-start',
                                background: 'linear-gradient(to right, #F8FAFC, #FFFFFF)'
                            }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0F172A', fontWeight: '900' }}>
                                            Pedido {getFriendlyOrderId(selectedOrder)}
                                        </h2>
                                        {editMode ? (
                                            <select 
                                                value={editStatus}
                                                onChange={(e) => setEditStatus(e.target.value)}
                                                style={{
                                                    padding: '4px 12px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '800',
                                                    border: '1px solid #CBD5E1',
                                                    backgroundColor: '#F8FAFC'
                                                }}
                                            >
                                                <option value="pending_approval">PENDIENTE APROBACIÓN</option>
                                                <option value="para_compra">PARA COMPRA</option>
                                                <option value="approved">APROBADO</option>
                                                <option value="shipped">ENVIADO</option>
                                                <option value="delivered">ENTREGADO</option>
                                                <option value="cancelled">CANCELADO</option>
                                            </select>
                                        ) : (
                                            <span style={{
                                                padding: '4px 12px',
                                                borderRadius: '20px',
                                                fontSize: '0.75rem',
                                                fontWeight: '800',
                                                backgroundColor: 
                                                    selectedOrder.status === 'pending_approval' ? '#FEF3C7' : 
                                                    selectedOrder.status === 'approved' ? '#D1FAE5' :
                                                    selectedOrder.status === 'shipped' ? '#DBEAFE' : '#F1F5F9',
                                                color: 
                                                    selectedOrder.status === 'pending_approval' ? '#92400E' : 
                                                    selectedOrder.status === 'approved' ? '#065F46' :
                                                    selectedOrder.status === 'shipped' ? '#1E40AF' : '#475569'
                                            }}>
                                                {selectedOrder.status.replace('_', ' ').toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ fontWeight: '700', color: '#334155', fontSize: '1rem' }}>
                                            {selectedOrder.customer_name}
                                            {selectedOrder.customer_nit && (
                                                <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: '500', marginLeft: '8px' }}>
                                                    (NIT: {selectedOrder.customer_nit})
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ color: '#64748B', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>📍</span> {selectedOrder.shipping_address}
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: '#475569', alignItems: 'center' }}>
                                            <div>📞 {selectedOrder.customer_phone || 'Sin tel.'}</div>
                                            {selectedOrder.paymentMethod && (
                                                <div style={{ fontWeight: '700', color: '#166534', backgroundColor: '#DCFCE7', padding: '2px 6px', borderRadius: '4px' }}>
                                                    💳 {selectedOrder.paymentMethod}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    {!editMode ? (
                                        <button 
                                            onClick={() => setEditMode(true)}
                                            style={{
                                                backgroundColor: '#0891B2',
                                                color: 'white',
                                                border: 'none',
                                                padding: '8px 16px',
                                                borderRadius: '12px',
                                                fontSize: '0.875rem',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 6px -1px rgba(8, 145, 178, 0.4)'
                                            }}
                                        >
                                            ✏️ Modificar
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={handleUpdateOrder}
                                            disabled={updateLoading}
                                            style={{
                                                backgroundColor: '#059669',
                                                color: 'white',
                                                border: 'none',
                                                padding: '8px 16px',
                                                borderRadius: '12px',
                                                fontSize: '0.875rem',
                                                fontWeight: '700',
                                                cursor: updateLoading ? 'not-allowed' : 'pointer',
                                                opacity: updateLoading ? 0.7 : 1,
                                                boxShadow: '0 4px 6px -1px rgba(5, 150, 105, 0.4)'
                                            }}
                                        >
                                            {updateLoading ? '⏳ Guardando...' : '💾 Guardar Cambios'}
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => setSelectedOrder(null)}
                                        style={{ 
                                            background: '#F1F5F9', 
                                            border: 'none', 
                                            width: '40px', 
                                            height: '40px', 
                                            borderRadius: '12px', 
                                            fontSize: '1.25rem', 
                                            cursor: 'pointer', 
                                            color: '#64748B',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div style={{ padding: '0', overflowY: 'auto', flex: 1, position: 'relative' }}>
                                {editMode && (
                                    <div style={{ padding: '1.5rem 2rem', backgroundColor: '#F0FDFA', borderBottom: '1px solid #D1FAE5' }}>
                                        <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem' }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#065F46', marginBottom: '6px' }}>FECHA DE ENTREGA</label>
                                                <input 
                                                    type="date"
                                                    value={editDeliveryDate}
                                                    onChange={(e) => setEditDeliveryDate(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px',
                                                        borderRadius: '8px',
                                                        border: '1px solid #A7F3D0',
                                                        fontSize: '0.9rem'
                                                    }}
                                                />
                                            </div>
                                            <div style={{ flex: 2, display: 'flex', alignItems: 'flex-end' }}>
                                                <p style={{ margin: 0, fontSize: '0.875rem', color: '#047857', fontStyle: 'italic' }}>
                                                    💡 Al modificar la fecha, el pedido se moverá a la programación del día seleccionado.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Product Search */}
                                        <div style={{ position: 'relative' }}>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#065F46', marginBottom: '6px' }}>AGREGAR PRODUCTO (NOMBRE O SKU)</label>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <div style={{ position: 'relative', flex: 1 }}>
                                                    <input 
                                                        type="text"
                                                        placeholder="Buscar productos para agregar..."
                                                        value={productSearch}
                                                        onChange={(e) => handleSearchProducts(e.target.value)}
                                                        style={{
                                                            width: '100%',
                                                            padding: '12px 16px',
                                                            borderRadius: '12px',
                                                            border: '2px solid #A7F3D0',
                                                            fontSize: '1rem',
                                                            outline: 'none',
                                                            transition: 'border-color 0.2s'
                                                        }}
                                                        onFocus={(e) => e.target.style.borderColor = '#059669'}
                                                        onBlur={(e) => e.target.style.borderColor = '#A7F3D0'}
                                                    />
                                                    {searching && (
                                                        <div style={{ position: 'absolute', right: '12px', top: '12px', fontSize: '0.9rem' }}>🔍</div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Search Results Dropdown */}
                                            {searchResults.length > 0 && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '100%',
                                                    left: 0,
                                                    right: 0,
                                                    backgroundColor: 'white',
                                                    borderRadius: '12px',
                                                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                                                    zIndex: 10,
                                                    marginTop: '8px',
                                                    border: '1px solid #E2E8F0',
                                                    overflow: 'hidden'
                                                }}>
                                                    {searchResults.map(prod => (
                                                        <div 
                                                            key={prod.id}
                                                            onClick={() => addProductToOrder(prod)}
                                                            className="search-item"
                                                            style={{
                                                                padding: '12px 16px',
                                                                cursor: 'pointer',
                                                                borderBottom: '1px solid #F1F5F9',
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                transition: 'background-color 0.2s'
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                        >
                                                            <div>
                                                                <div style={{ fontWeight: '700', color: '#1E293B' }}>{prod.name}</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>SKU: {prod.sku} | {prod.unit_of_measure}</div>
                                                            </div>
                                                            <div style={{ fontWeight: '800', color: '#059669' }}>
                                                                ${(prod.base_price || 0).toLocaleString()}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {loadingItems ? (
                                    <div style={{ textAlign: 'center', padding: '5rem' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>🍳</div>
                                        <p style={{ color: '#64748B', fontWeight: '600', fontSize: '1.125rem' }}>Preparando el detalle de los productos...</p>
                                    </div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ textAlign: 'left', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                                <th style={{ padding: '1rem 2rem', fontSize: '0.7rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>PRODUCTO / SKU</th>
                                                <th style={{ padding: '1rem', fontSize: '0.7rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', textAlign: 'center' }}>CANTIDAD</th>
                                                <th style={{ padding: '1rem', fontSize: '0.7rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', textAlign: 'right' }}>PRECIO U.</th>
                                                <th style={{ padding: '1rem 2rem', fontSize: '0.7rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', textAlign: 'right' }}>SUBTOTAL</th>
                                                {editMode && <th style={{ width: '50px' }}></th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orderItems.map((item, idx) => (
                                                <tr key={idx} style={{ 
                                                    borderBottom: '1px solid #F1F5F9',
                                                    backgroundColor: item.isNew ? '#F0F9FF' : 'transparent'
                                                }}>
                                                    <td style={{ padding: '1.25rem 2rem' }}>
                                                        <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '1rem' }}>
                                                            {item.products?.name}
                                                            {item.isNew && <span style={{ marginLeft: '8px', fontSize: '0.6rem', backgroundColor: '#0EA5E9', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>NUEVO</span>}
                                                        </div>
                                                        {item.variant_label && (
                                                            <div style={{ fontSize: '0.75rem', color: '#0369A1', fontWeight: '700', backgroundColor: '#E0F2FE', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                                                                ✨ {item.variant_label}
                                                            </div>
                                                        )}
                                                        <div style={{ fontSize: '0.75rem', color: '#94A3B8', fontFamily: 'monospace', marginTop: '2px' }}>
                                                            REF: {item.products?.sku}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '1.25rem 1rem', textAlign: 'center' }}>
                                                        {editMode ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                                <button 
                                                                    onClick={() => updateItemQuantity(idx, item.quantity - 1)}
                                                                    style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: 'white', cursor: 'pointer' }}
                                                                >-</button>
                                                                <input 
                                                                    type="number"
                                                                    value={item.quantity}
                                                                    onChange={(e) => updateItemQuantity(idx, parseInt(e.target.value) || 1)}
                                                                    style={{ width: '50px', textAlign: 'center', padding: '4px', borderRadius: '6px', border: '1px solid #CBD5E1', fontWeight: '800' }}
                                                                />
                                                                <button 
                                                                    onClick={() => updateItemQuantity(idx, item.quantity + 1)}
                                                                    style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: 'white', cursor: 'pointer' }}
                                                                >+</button>
                                                                <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>{item.products?.unit_of_measure}</span>
                                                            </div>
                                                        ) : (
                                                            <span style={{ 
                                                                padding: '6px 12px', 
                                                                backgroundColor: '#F1F5F9', 
                                                                borderRadius: '8px',
                                                                fontWeight: '800', 
                                                                color: '#334155',
                                                                fontSize: '1rem'
                                                            }}>
                                                                {item.quantity} 
                                                                <span style={{ fontSize: '0.75rem', color: '#64748B', marginLeft: '4px', fontWeight: '600' }}>
                                                                    {item.products?.unit_of_measure}
                                                                </span>
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '1.25rem 1rem', textAlign: 'right', color: '#475569', fontWeight: '600' }}>
                                                        ${(item.unit_price || 0).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '1.25rem 2rem', textAlign: 'right', fontWeight: '900', color: '#059669', fontSize: '1.125rem' }}>
                                                        ${((item.unit_price || 0) * item.quantity).toLocaleString()}
                                                    </td>
                                                    {editMode && (
                                                        <td style={{ paddingRight: '1rem' }}>
                                                            <button 
                                                                onClick={() => removeItemFromOrder(idx)}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#EF4444' }}
                                                                title="Eliminar de la orden"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                            {orderItems.length === 0 && (
                                                <tr>
                                                    <td colSpan={editMode ? 5 : 4} style={{ padding: '4rem', textAlign: 'center', color: '#94A3B8' }}>
                                                        No se encontraron productos en este pedido
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div style={{ 
                                padding: '2rem', 
                                borderTop: '1px solid #F1F5F9', 
                                backgroundColor: '#F8FAFC', 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center' 
                            }}>
                                <div style={{ display: 'flex', gap: '3rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ fontSize: '2rem' }}>⚖️</div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase' }}>PESO TOTAL</div>
                                            <div style={{ fontWeight: '900', color: '#1E293B', fontSize: '1.125rem' }}>
                                                {currentWeight.toFixed(1)} kg
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ fontSize: '2rem' }}>🌐</div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase' }}>CANAL</div>
                                            <div style={{ fontWeight: '900', color: '#1E293B', fontSize: '1.125rem' }}>{selectedOrder.origin_source?.toUpperCase()}</div>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.875rem', color: '#64748B', fontWeight: '700', marginBottom: '4px' }}>TOTAL CONSOLIDADO</div>
                                    <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#059669', lineHeight: '1' }}>
                                        ${currentTotal.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- VARIANT SELECTION MODAL (SUB-MODAL) --- */}
                {selectedProductForVariant && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 3000, 
                        backdropFilter: 'blur(4px)',
                        padding: '1rem'
                    }} onClick={() => setSelectedProductForVariant(null)}>
                        <div 
                            style={{ 
                                backgroundColor: 'white', 
                                padding: '2.5rem', 
                                borderRadius: '32px', 
                                width: '95%', 
                                maxWidth: '420px', 
                                boxShadow: '0 30px 60px -12px rgba(0,0,0,0.3)', 
                                border: '1px solid rgba(255,255,255,0.3)',
                                position: 'relative'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <button 
                                onClick={() => setSelectedProductForVariant(null)}
                                style={{
                                    position: 'absolute',
                                    top: '1.5rem',
                                    right: '1.5rem',
                                    border: 'none',
                                    background: '#F1F5F9',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    color: '#64748B',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold'
                                }}
                            >✕</button>
                            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                {selectedProductForVariant.image_url && (
                                    <img 
                                        src={selectedProductForVariant.image_url} 
                                        alt={selectedProductForVariant.name}
                                        style={{ width: '100px', height: '100px', borderRadius: '20px', objectFit: 'cover', marginBottom: '1rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                    />
                                )}
                                <h3 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#1E293B', marginBottom: '0.25rem' }}>{selectedProductForVariant.name}</h3>
                                <p style={{ color: '#64748B', fontSize: '0.875rem' }}>Personaliza las opciones del producto</p>
                            </div>

                            {/* Options Rendering */}
                            {selectedProductForVariant.options_config?.map((opt: any) => (
                                <div key={opt.name} style={{ marginBottom: '1.25rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {opt.name}
                                    </label>
                                    <select
                                        value={selectedOptions[opt.name] || ''}
                                        onChange={(e) => setSelectedOptions(prev => ({ ...prev, [opt.name]: e.target.value }))}
                                        style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '1rem', backgroundColor: '#F8FAFC', outline: 'none' }}
                                    >
                                        <option value="">Seleccionar {opt.name}...</option>
                                        {opt.values?.map((val: string) => (
                                            <option key={val} value={val}>{val}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}

                            {/* Quantity in Sub-Modal */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', margin: '2rem 0' }}>
                                <button 
                                    onClick={() => setVariantQuantity(Math.max(1, variantQuantity - 1))}
                                    style={{ width: '45px', height: '45px', borderRadius: '15px', border: '1px solid #CBD5E1', backgroundColor: 'white', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >-</button>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#0F172A' }}>{variantQuantity}</div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B' }}>{selectedProductForVariant.unit_of_measure}</div>
                                </div>
                                <button 
                                    onClick={() => setVariantQuantity(variantQuantity + 1)}
                                    style={{ width: '45px', height: '45px', borderRadius: '15px', border: 'none', backgroundColor: '#059669', color: 'white', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >+</button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <button 
                                    onClick={() => setSelectedProductForVariant(null)}
                                    style={{ padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', backgroundColor: 'white', fontWeight: '700', color: '#64748B', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={confirmVariantAdd}
                                    style={{ padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: '#059669', color: 'white', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(5, 150, 105, 0.2)' }}
                                >
                                    Agregar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
