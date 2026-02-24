'use client';

import { useRef, useEffect, useState } from 'react';
import { useAuth } from '../../../lib/authContext';
import { supabase } from '../../../lib/supabase';
import Navbar from '../../../components/Navbar';
import { useRouter } from 'next/navigation';
import { isAbortError } from '@/lib/errorUtils';
import { Package, Trash2, Search, Truck, ShoppingCart, Smile, Printer, Rocket, ShoppingBag, FileText, BarChart3 } from 'lucide-react';

interface OrderItem {
    id: string;
    product_id: string;
    product_name: string;
    product_image: string;
    quantity: number;
    unit: string;
    variant_label?: string;
}

export default function B2BDashboard() {
    const { user, profile, loading: authLoading } = useAuth();
    const router = useRouter();
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [deliveryDate, setDeliveryDate] = useState('');
    const [minDeliveryDate, setMinDeliveryDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedProductForModal, setSelectedProductForModal] = useState<any | null>(null);
    const [modalQuantity, setModalQuantity] = useState(1);
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [categoryProducts, setCategoryProducts] = useState<any[]>([]);
    const [isLoadingCategory, setIsLoadingCategory] = useState(false);
    const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'order' | 'invoices' | 'consumption'>('order');
    const [invoices, setInvoices] = useState<any[]>([]);
    const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
    const [consumptionData, setConsumptionData] = useState<any[]>([]);
    const [isLoadingConsumption, setIsLoadingConsumption] = useState(false);
    const isMounted = useRef(true);

    const categories = ['Frutas', 'Verduras', 'Lácteos'];

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // Handle Category Selection
    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const fetchCategoryProducts = async () => {
            if (!selectedCategory) {
                if (isMounted.current) setCategoryProducts([]);
                return;
            }
            setIsLoadingCategory(true);
            try {
                const { data, error } = await supabase
                    .from('products')
                    .select('id, name, unit_of_measure, image_url, sku, options_config')
                    .eq('category', selectedCategory)
                    .eq('is_active', true)
                    .order('name')
                    .abortSignal(signal as any);

                if (error) {
                    if (isAbortError(error)) return;
                    throw error;
                }
                if (isMounted.current) setCategoryProducts(data || []);
            } catch (err) {
                console.error("Error fetching category products:", err);
            } finally {
                if (isMounted.current) setIsLoadingCategory(false);
            }
        };

        fetchCategoryProducts();
        return () => controller.abort();
    }, [selectedCategory]);

    // Handle Search
    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const performSearch = async () => {
            if (searchTerm.length < 2) {
                if (isMounted.current) setSearchResults([]);
                return;
            }
            setIsSearching(true);
            try {
                const { data, error } = await supabase
                    .from('products')
                    .select('id, name, unit_of_measure, image_url, sku, options_config')
                    .ilike('name', `%${searchTerm}%`)
                    .eq('is_active', true)
                    .limit(5)
                    .abortSignal(signal as any);

                if (error) {
                    if (isAbortError(error)) return;
                    throw error;
                }
                if (isMounted.current) setSearchResults(data || []);
            } catch (err) {
                console.error("Search error:", err);
            } finally {
                if (isMounted.current) setIsSearching(false);
            }
        };

        const debounce = setTimeout(performSearch, 300);
        return () => {
            clearTimeout(debounce);
            controller.abort();
        };
    }, [searchTerm]);

    const addFromSearch = (product: any) => {
        setModalQuantity(1);
        setSelectedProductForModal(product);
        setSearchTerm('');
        setSearchResults([]);
    };

    const confirmModalAdd = () => {
        if (!selectedProductForModal) return;

        const product = selectedProductForModal;

        // Construir nombre con variantes (ej: "Lulo (Maduro, Grande)")
        let finalName = product.name;
        const optionValues = Object.values(selectedOptions).filter(v => v);
        if (optionValues.length > 0) {
            finalName = `${product.name} (${optionValues.join(', ')})`;
        }

        const exists = orderItems.find(item => item.product_name === finalName && item.product_id === product.id);

        if (exists) {
            updateQuantity(exists.id, exists.quantity + modalQuantity);
        } else {
            const newItem: OrderItem = {
                id: Math.random().toString(36).substr(2, 9), // Temp ID
                product_id: product.id,
                product_name: finalName,
                product_image: product.image_url || '',
                quantity: modalQuantity,
                unit: product.unit_of_measure || 'kg',
                variant_label: optionValues.join(', ') || undefined
            };
            setOrderItems(prev => [...prev, newItem].sort((a, b) => a.product_name.localeCompare(b.product_name)));
        }

        setSelectedProductForModal(null);
        setSelectedOptions({});
    };

    // Time calculation logic
    useEffect(() => {
        const controller = new AbortController();
        
        const calculateTime = async (signal?: AbortSignal) => {
            try {
                // Check Global Cutoff Switch
                const { data: cutoffSetting } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'enable_cutoff_rules')
                    .abortSignal(signal as any)
                    .single();

                if (!isMounted.current) return;

                const cutoffEnabled = cutoffSetting?.value !== 'false';
                const now = new Date();
                const cutoff = new Date();
                cutoff.setHours(17, 0, 0, 0);

                const nextDeliveryDate = new Date();

                if (cutoffEnabled) {
                    const afterCutoff = now >= cutoff;
                    if (afterCutoff) {
                        nextDeliveryDate.setDate(now.getDate() + 2);
                    } else {
                        nextDeliveryDate.setDate(now.getDate() + 1);
                    }
                    console.log('⏱️ Cutoff Rules ENABLED');
                } else {
                    nextDeliveryDate.setDate(now.getDate() + 1);
                    console.log('🛑 Cutoff Rules DISABLED');
                }

                if (isMounted.current) {
                    const minDateStr = nextDeliveryDate.toISOString().split('T')[0];
                    setDeliveryDate(minDateStr);
                    setMinDeliveryDate(minDateStr);
                }
            } catch (err) {
                if (isAbortError(err)) return;
                console.error("Error calculating time:", err);
            }
        };

        calculateTime(controller.signal);
        const timer = setInterval(() => calculateTime(controller.signal), 60000);
        return () => {
            clearInterval(timer);
            controller.abort();
        };
    }, []);

    // Fetch last order items or fallback to Top 10 for new clients
    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const fetchInitialOrder = async () => {
            if (!user) return;

            try {
                // 1. Try to fetch last order
                const { data: lastOrder } = await supabase
                    .from('orders')
                    .select(`
                        id,
                        order_items (
                            id,
                            product_id,
                            quantity,
                            products (name, unit_of_measure, image_url)
                        )
                    `)
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .abortSignal(signal as any)
                    .single();

            if (lastOrder?.order_items && lastOrder.order_items.length > 0) {
                // Return previous order items
                const items = lastOrder.order_items.map((item: any) => {
                    const p = Array.isArray(item.products) ? item.products[0] : item.products;
                    return {
                        id: item.id,
                        product_id: item.product_id,
                        product_name: p?.name || 'Producto',
                        product_image: p?.image_url || '',
                        quantity: item.quantity,
                        unit: p?.unit_of_measure || 'kg'
                    };
                }).sort((a: any, b: any) => a.product_name.localeCompare(b.product_name));
                setOrderItems(items);
            } else {
                // 2. Fallback: New Client - Load Top 10 products
                const { data: topProducts } = await supabase
                    .from('products')
                    .select('id, name, unit_of_measure, image_url')
                    .eq('is_active', true)
                    .limit(10);

                if (topProducts) {
                    const suggestedItems = topProducts.map(p => ({
                        id: Math.random().toString(36).substr(2, 9),
                        product_id: p.id,
                        product_name: p.name,
                        product_image: p.image_url || '',
                        quantity: 0, // Iniciar en 0 para que el cliente decida
                        unit: p.unit_of_measure || 'kg'
                    }));
                    setOrderItems(suggestedItems);
                }
                    if (isMounted.current) setLoading(false);
                }
            } catch (err) {
                if (isAbortError(err)) return;
                console.error("Error in fetchInitialOrder:", err);
                if (isMounted.current) setLoading(false);
            }
        };

        if (!authLoading && user) {
            fetchInitialOrder();
        }

        return () => controller.abort();
    }, [authLoading, user]);

    const updateQuantity = (id: string, newQty: number) => {
        if (newQty < 0) return;
        setOrderItems(prev =>
            prev.map(item => item.id === id ? { ...item, quantity: newQty } : item)
        );
    };

    const removeItem = (id: string) => {
        setOrderItems(prev => prev.filter(item => item.id !== id));
    };

    // Fetch Invoices
    useEffect(() => {
        if (activeTab !== 'invoices' || !profile?.company_name) return;

        const fetchInvoices = async () => {
            setIsLoadingInvoices(true);
            try {
                const { data, error } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('customer_name', profile.company_name)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                if (isMounted.current) setInvoices(data || []);
            } catch (err) {
                console.error("Error fetching invoices:", err);
            } finally {
                if (isMounted.current) setIsLoadingInvoices(false);
            }
        };

        fetchInvoices();
    }, [activeTab, profile?.company_name]);

    // Fetch Consumption Data
    useEffect(() => {
        if (activeTab !== 'consumption' || !profile?.company_name) return;

        const fetchConsumption = async () => {
            setIsLoadingConsumption(true);
            try {
                // Fetch all orders to get their IDs
                const { data: ordersData, error: ordersError } = await supabase
                    .from('orders')
                    .select('id')
                    .eq('customer_name', profile.company_name);

                if (ordersError) throw ordersError;
                
                if (ordersData && ordersData.length > 0) {
                    const orderIds = ordersData.map(o => o.id);
                    
                    // Fetch all items from those orders
                    const { data: itemsData, error: itemsError } = await supabase
                        .from('order_items')
                        .select('product_name, quantity, unit, product_image')
                        .in('order_id', orderIds);

                    if (itemsError) throw itemsError;

                    // Aggregate
                    const aggregation: Record<string, any> = {};
                    itemsData?.forEach(item => {
                        if (!aggregation[item.product_name]) {
                            aggregation[item.product_name] = {
                                name: item.product_name,
                                totalQuantity: 0,
                                unit: item.unit,
                                image: item.product_image,
                                ordersCount: 0
                            };
                        }
                        aggregation[item.product_name].totalQuantity += Number(item.quantity || 0);
                        aggregation[item.product_name].ordersCount += 1;
                    });

                    const sorted = Object.values(aggregation)
                        .sort((a: any, b: any) => b.totalQuantity - a.totalQuantity);
                    
                    if (isMounted.current) setConsumptionData(sorted);
                }
            } catch (err) {
                console.error("Error fetching consumption:", err);
            } finally {
                if (isMounted.current) setIsLoadingConsumption(false);
            }
        };

        fetchConsumption();
    }, [activeTab, profile?.company_name]);

    const handleClearOrder = () => {
        if (window.confirm('¿Estás seguro de que quieres borrar todo el pedido y empezar de cero?')) {
            setOrderItems([]);
        }
    };

    const handleSubmit = () => {
        const itemsToSubmit = orderItems.filter(item => item.quantity > 0);
        
        console.log('🔍 handleSubmit called');
        console.log('📦 Total items:', orderItems.length);
        console.log('✅ Items with quantity > 0:', itemsToSubmit.length);
        console.log('📅 Delivery date:', deliveryDate);
        
        if (itemsToSubmit.length === 0) {
            alert('⚠️ Debes agregar al menos un producto con cantidad mayor a 0 para confirmar el pedido.');
            return;
        }
        
        if (!deliveryDate) {
            alert('⚠️ Por favor selecciona una fecha de entrega.');
            return;
        }
        
        console.log('✅ Opening summary modal');
        setIsSummaryModalOpen(true);
    };

    const handleFinalSubmit = async () => {
        const itemsToSubmit = orderItems.filter(item => item.quantity > 0);
        if (itemsToSubmit.length === 0 || !deliveryDate) return;
        setSubmitting(true);

        try {
            // Create new order
            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert({
                    user_id: user?.id,
                    profile_id: profile?.id,
                    type: 'b2b_credit',
                    status: 'pending_approval',
                    delivery_date: deliveryDate,
                    shipping_address: profile?.address_main || 'Dirección registrada',
                    subtotal: 0,
                    total: 0,
                    origin_source: 'web'
                })
                .select()
                .single();

            if (orderError) throw orderError;

            // Create order items
            const itemsToInsert = itemsToSubmit.map(item => ({
                order_id: order.id,
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: 0,
                variant_label: item.variant_label
            }));

            await supabase.from('order_items').insert(itemsToInsert);

            alert('✅ ¡Pedido recibido con éxito! Tu entrega ha sido programada.');
            setIsSummaryModalOpen(false);
            router.push('/');
        } catch (error: any) {
            alert('Error: ' + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || loading) {
        return (
            <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
                <Navbar />
                <div className="container" style={{ padding: '4rem', textAlign: 'center' }}>
                    <p>Cargando tu pedido...</p>
                </div>
            </main>
        );
    }

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
            <Navbar />

            <div className="container" style={{ padding: '2rem 1rem', maxWidth: '800px' }}>

                {/* HEADER */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 style={{ 
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontSize: '2.2rem', 
                        fontWeight: '900', 
                        color: 'var(--text-main)', 
                        marginBottom: '0.75rem',
                        letterSpacing: '-0.04em'
                    }}>
                        {profile?.company_name || 'Panel Institucional'}
                    </h1>

                </div>

                {/* TAB NAVIGATION */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '1rem',
                    marginBottom: '2rem'
                }}>
                    <button 
                        onClick={() => setActiveTab('order')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.8rem 1.5rem',
                            borderRadius: 'var(--radius-full)',
                            border: 'none',
                            backgroundColor: activeTab === 'order' ? 'var(--primary)' : 'rgba(255,255,255,0.7)',
                            color: activeTab === 'order' ? 'white' : 'var(--text-main)',
                            fontWeight: '800',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: activeTab === 'order' ? '0 4px 12px rgba(26, 77, 46, 0.2)' : '0 2px 8px rgba(0,0,0,0.05)',
                            backdropFilter: 'blur(8px)'
                        }}
                    >
                        <ShoppingCart size={18} strokeWidth={2.5} /> Pedido Rápido
                    </button>
                    <button 
                        onClick={() => setActiveTab('invoices')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.8rem 1.5rem',
                            borderRadius: 'var(--radius-full)',
                            border: 'none',
                            backgroundColor: activeTab === 'invoices' ? 'var(--primary)' : 'rgba(255,255,255,0.7)',
                            color: activeTab === 'invoices' ? 'white' : 'var(--text-main)',
                            fontWeight: '800',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: activeTab === 'invoices' ? '0 4px 12px rgba(26, 77, 46, 0.2)' : '0 2px 8px rgba(0,0,0,0.05)',
                            backdropFilter: 'blur(8px)'
                        }}
                    >
                        <FileText size={18} strokeWidth={2.5} /> Mis Facturas
                    </button>
                    <button 
                        onClick={() => setActiveTab('consumption')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.8rem 1.5rem',
                            borderRadius: 'var(--radius-full)',
                            border: 'none',
                            backgroundColor: activeTab === 'consumption' ? 'var(--primary)' : 'rgba(255,255,255,0.7)',
                            color: activeTab === 'consumption' ? 'white' : 'var(--text-main)',
                            fontWeight: '800',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: activeTab === 'consumption' ? '0 4px 12px rgba(26, 77, 46, 0.2)' : '0 2px 8px rgba(0,0,0,0.05)',
                            backdropFilter: 'blur(8px)'
                        }}
                    >
                        <BarChart3 size={18} strokeWidth={2.5} /> Mi Consumo
                    </button>
                </div>

                {/* ORDER CARD */}
                {/* TAB CONTENT */}
                {activeTab === 'order' && (
                    <>
                        {/* Order Card */}
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: 'var(--radius-lg)',
                            boxShadow: 'var(--shadow-lg)',
                            overflow: 'visible',
                            position: 'relative'
                        }}>
                            {/* Header */}
                            <div style={{
                                backgroundColor: 'var(--primary)',
                                color: 'white',
                                padding: '1.5rem 2rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                                boxShadow: '0 4px 20px rgba(26, 77, 46, 0.15)',
                                zIndex: 5
                            }}>
                                <div>
                                    <h2 style={{ 
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        fontSize: '1.3rem', 
                                        fontWeight: '900', 
                                        margin: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        letterSpacing: '-0.02em'
                                    }}>
                                        <Package size={22} strokeWidth={2.5} /> Pedido Sugerido
                                    </h2>
                                    <p style={{ margin: '0.25rem 0 0', opacity: 0.8, fontSize: '0.85rem', fontWeight: '500' }}>
                                        Personaliza cantidades o añade nuevos productos
                                    </p>
                                </div>
                                {orderItems.length > 0 && (
                                    <button
                                        onClick={handleClearOrder}
                                        title="Borrar todo y empezar de cero"
                                        className="btn-glass"
                                        style={{
                                            padding: '0.5rem 1rem',
                                            borderRadius: 'var(--radius-full)',
                                            fontSize: '0.8rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            color: 'white',
                                            fontWeight: '800',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Trash2 size={16} /> Borrar Todo
                                    </button>
                                )}
                            </div>

                            {/* Search Bar Inside Card */}
                            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', position: 'relative' }}>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', display: 'flex' }}>
                                        <Search size={20} strokeWidth={2.5} />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Buscar productos por nombre o SKU..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '0.85rem 3rem 0.85rem 2.8rem',
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border)',
                                            fontSize: '1rem',
                                            fontWeight: '500',
                                            outline: 'none',
                                            transition: 'all 0.2s',
                                            backgroundColor: '#F9FAFB'
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = 'var(--primary)';
                                            e.target.style.backgroundColor = 'white';
                                            e.target.style.boxShadow = '0 0 0 4px rgba(26, 77, 46, 0.05)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = 'var(--border)';
                                            e.target.style.backgroundColor = '#F9FAFB';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                    {searchTerm && (
                                        <button
                                            onClick={() => setSearchTerm('')}
                                            style={{
                                                position: 'absolute',
                                                right: '12px',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                background: '#f3f4f6',
                                                border: 'none',
                                                borderRadius: '50%',
                                                width: '24px',
                                                height: '24px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#6b7280',
                                                cursor: 'pointer',
                                                fontSize: '0.8rem',
                                                fontWeight: 'bold',
                                                zIndex: 5
                                            }}
                                            title="Limpiar búsqueda"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                {/* Search Results Dropdown */}
                                {(searchResults.length > 0 || isSearching) && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        right: 0,
                                        backgroundColor: 'white',
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                                        borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                                        zIndex: 100,
                                        marginTop: '2px',
                                        maxHeight: '300px',
                                        overflowY: 'auto',
                                        border: '1px solid var(--border)'
                                    }}>
                                        {isSearching ? (
                                            <p style={{ padding: '1rem', margin: 0, color: 'var(--text-muted)' }}>Buscando...</p>
                                        ) : (
                                            searchResults.map(p => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => addFromSearch(p)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '1rem',
                                                        padding: '0.75rem 1rem',
                                                        cursor: 'pointer',
                                                        borderBottom: '1px solid #f0f0f0'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                                >
                                                    <img src={p.image_url} alt={p.name} style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />
                                                    <div style={{ flex: 1 }}>
                                                        <p style={{ margin: 0, fontWeight: '600', fontSize: '0.9rem' }}>{p.name}</p>
                                                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>SKU: {p.sku}</p>
                                                    </div>
                                                    <span style={{ color: 'var(--primary)', fontWeight: '700' }}>+ Agregar</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Category Selector */}
                            <div style={{ 
                                display: 'flex', 
                                gap: '0.75rem', 
                                overflowX: 'auto', 
                                padding: '0.5rem 1rem 1rem', 
                                borderBottom: '1px solid var(--border)' 
                            }}>
                                <button
                                    onClick={() => setSelectedCategory(null)}
                                    className="category-pill"
                                    style={{
                                        padding: '0.55rem 1.25rem',
                                        borderRadius: 'var(--radius-full)',
                                        border: selectedCategory === null ? 'none' : '1px solid var(--border)',
                                        backgroundColor: selectedCategory === null ? 'var(--primary)' : 'white',
                                        color: selectedCategory === null ? 'white' : 'var(--text-main)',
                                        fontSize: '0.85rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                    }}
                                >Todos</button>
                                {categories.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className="category-pill"
                                        style={{
                                            padding: '0.55rem 1.25rem',
                                            borderRadius: 'var(--radius-full)',
                                            border: selectedCategory === cat ? 'none' : '1px solid var(--border)',
                                            backgroundColor: selectedCategory === cat ? 'var(--primary)' : 'white',
                                            color: selectedCategory === cat ? 'white' : 'var(--text-main)',
                                            fontSize: '0.85rem',
                                            fontWeight: '800',
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >{cat}</button>
                                ))}
                            </div>

                            {/* Category Products Results */}
                            {selectedCategory && (
                                <div style={{ marginTop: '1rem', borderTop: '1px solid #f0f0f0', paddingTop: '1rem', padding: '0 1rem 1rem' }}>
                                    <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Catálogo: {selectedCategory}</h4>
                                    {isLoadingCategory ? (
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Cargando articulos...</p>
                                    ) : categoryProducts.length > 0 ? (
                                        <div className="mobile-grid-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
                                            {categoryProducts.map(p => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => {
                                                        setModalQuantity(1);
                                                        setSelectedProductForModal(p);
                                                    }}
                                                    style={{
                                                        padding: '0.75rem',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: 'var(--radius-md)',
                                                        cursor: 'pointer',
                                                        textAlign: 'center',
                                                        backgroundColor: '#fff',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                                                        e.currentTarget.style.borderColor = 'var(--primary)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.boxShadow = 'none';
                                                        e.currentTarget.style.borderColor = 'var(--border)';
                                                    }}
                                                >
                                                    <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px', marginBottom: '0.5rem' }} />
                                                    <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: '700', lineHeight: '1.2', color: 'var(--text-main)' }}>{p.name}</p>
                                                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.unit_of_measure}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No hay productos disponibles por ahora.</p>
                                    )}
                                </div>
                            )}

                            {/* Items List - Inside Card for better grouping */}
                            {orderItems.length > 0 ? (
                                <div style={{ borderTop: '4px solid #F9FAFB' }}>
                                    {orderItems.map((item) => (
                                        <div key={item.id} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '1.25rem 2rem',
                                            borderBottom: '1px solid #F3F4F6'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1 }}>
                                                <div style={{ width: '64px', height: '64px', backgroundColor: '#f0f0f0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                                    {item.product_image && <img src={item.product_image} alt={item.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                                </div>
                                                <div>
                                                    <p style={{ 
                                                        fontFamily: 'var(--font-outfit), sans-serif',
                                                        fontWeight: '800', 
                                                        fontSize: '1.1rem',
                                                        margin: 0,
                                                        color: 'var(--text-main)',
                                                        letterSpacing: '-0.02em'
                                                    }}>{item.product_name}</p>
                                                    {item.variant_label && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>{item.variant_label}</span>}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <button
                                                    onClick={() => updateQuantity(item.id, Math.max(0, item.quantity - 1))}
                                                    style={{
                                                        width: '38px', height: '38px',
                                                        borderRadius: '12px',
                                                        border: '1px solid var(--border)',
                                                        backgroundColor: 'white',
                                                        cursor: 'pointer',
                                                        fontSize: '1.2rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        transition: 'all 0.2s',
                                                        fontWeight: '600',
                                                        color: 'var(--text-main)'
                                                    }}
                                                >−</button>
                                                
                                                <div style={{ minWidth: '70px', textAlign: 'center' }}>
                                                    <div style={{ fontWeight: '900', fontSize: '1.2rem', color: 'var(--primary)', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                        {item.quantity}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' }}>
                                                        {item.unit}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                                    style={{
                                                        width: '38px', height: '38px',
                                                        borderRadius: '12px',
                                                        border: 'none',
                                                        backgroundColor: 'var(--primary)',
                                                        color: 'white',
                                                        cursor: 'pointer',
                                                        fontSize: '1.2rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        transition: 'all 0.2s',
                                                        boxShadow: '0 4px 10px rgba(26, 77, 46, 0.2)'
                                                    }}
                                                >+</button>

                                                <button
                                                    onClick={() => removeItem(item.id)}
                                                    style={{
                                                        marginLeft: '1.5rem',
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#94A3B8',
                                                        cursor: 'pointer',
                                                        fontSize: '0.8rem',
                                                        fontWeight: '700',
                                                        textTransform: 'uppercase'
                                                    }}
                                                >Quitar</button>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Submit Button Section */}
                                    <div style={{ padding: '2.5rem', textAlign: 'center', backgroundColor: '#F9FAFB', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
                                        {orderItems.filter(i => i.quantity > 0).length === 0 && (
                                            <p style={{ 
                                                color: '#DC2626', 
                                                fontSize: '0.95rem', 
                                                fontWeight: '600',
                                                marginBottom: '1.5rem',
                                                backgroundColor: '#FEF2F2',
                                                padding: '1rem',
                                                borderRadius: '12px',
                                                border: '1px solid #FEE2E2',
                                                display: 'inline-block'
                                            }}>
                                                ⚠️ Agrega cantidades mayores a 0 para continuar
                                            </p>
                                        )}
                                        <button
                                            onClick={handleSubmit}
                                            disabled={submitting || orderItems.filter(i => i.quantity > 0).length === 0}
                                            className="btn-premium"
                                            style={{
                                                width: '100%',
                                                maxWidth: '400px',
                                                fontSize: '1.3rem',
                                                padding: '1.2rem',
                                                backgroundColor: submitting || orderItems.filter(i => i.quantity > 0).length === 0 ? '#cbd5e1' : 'var(--primary)',
                                                color: 'white',
                                                cursor: orderItems.filter(i => i.quantity > 0).length === 0 ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '15px',
                                                border: 'none',
                                                borderRadius: 'var(--radius-full)',
                                                fontFamily: 'var(--font-outfit), sans-serif',
                                                fontWeight: '900',
                                                boxShadow: '0 12px 24px rgba(26, 77, 46, 0.3)',
                                                margin: '0 auto'
                                            }}
                                        >
                                            {submitting ? 'Emitiendo...' : (
                                                <>
                                                    <ShoppingCart size={26} strokeWidth={2.5} /> Finalizar Pedido
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                                    <div style={{ backgroundColor: '#F3F4F6', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                        <Package size={40} color="#94A3B8" />
                                    </div>
                                    <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', marginBottom: '2rem', fontWeight: '500' }}>
                                        No hay productos seleccionados para hoy.
                                    </p>
                                    <button 
                                        onClick={() => setSelectedCategory('Frutas')}
                                        className="btn btn-primary"
                                        style={{ padding: '0.8rem 2rem' }}
                                    >Explorar Catálogo</button>
                                </div>
                            )}
                        </div>

                        {/* Support Section - Below the card for cleaner look */}
                        <div className="mobile-stack" style={{
                            marginTop: '2.5rem',
                            backgroundColor: 'white',
                            borderRadius: 'var(--radius-lg)',
                            padding: '1.5rem 2rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            border: '1px solid var(--border)',
                            boxShadow: 'var(--shadow-sm)'
                        }}>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ 
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    fontSize: '1.1rem', 
                                    fontWeight: '800', 
                                    margin: 0, 
                                    color: 'var(--text-main)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px'
                                }}>
                                    <Smile size={22} color="var(--primary)" strokeWidth={2.5} /> ¿Necesitas un requerimiento especial?
                                </h3>
                                <p style={{ margin: '0.4rem 0 0', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                                    Tu ejecutivo de cuenta FruFresco está disponible para asistirte.
                                </p>
                            </div>
                            <a
                                href="https://wa.me/573001234567?text=Hola,%20necesito%20ayuda%20con%20mi%20pedido%20institucional"
                                target="_blank"
                                className="btn-premium"
                                style={{
                                    backgroundColor: '#075e54',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    fontWeight: '900',
                                    textDecoration: 'none',
                                    padding: '0.75rem 1.5rem',
                                    borderRadius: 'var(--radius-full)',
                                    whiteSpace: 'nowrap',
                                    fontSize: '0.9rem',
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    boxShadow: '0 6px 12px rgba(7, 94, 84, 0.15)'
                                }}
                            >
                                WhatsApp Directo
                            </a>
                        </div>
                    </>
                )}

                {/* INVOICES TAB */}
                {activeTab === 'invoices' && (
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: 'var(--radius-lg)',
                        padding: '2.5rem',
                        boxShadow: 'var(--shadow-lg)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <div>
                                <h2 style={{ 
                                    fontFamily: 'var(--font-outfit), sans-serif', 
                                    fontWeight: 900, 
                                    fontSize: '1.5rem',
                                    margin: 0,
                                    color: 'var(--text-main)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}>
                                    <FileText size={28} color="var(--primary)" strokeWidth={2.5} /> Historial de Facturas
                                </h2>
                                <p style={{ color: 'var(--text-muted)', margin: '0.4rem 0 0', fontSize: '0.95rem', fontWeight: '500' }}>
                                    Gestiona tus pedidos anteriores y descarga comprobantes.
                                </p>
                            </div>
                        </div>

                        {isLoadingInvoices ? (
                            <div style={{ padding: '3rem', textAlign: 'center' }}>
                                <div className="spinner" style={{ margin: '0 auto 1.5rem' }}></div>
                                <p style={{ color: 'var(--text-muted)', fontWeight: '600' }}>Cargando facturas...</p>
                            </div>
                        ) : invoices.length > 0 ? (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0.75rem' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: '#64748B', fontSize: '0.85rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            <th style={{ padding: '0 1rem' }}>ID Pedido</th>
                                            <th style={{ padding: '0 1rem' }}>Fecha</th>
                                            <th style={{ padding: '0 1rem' }}>Monto</th>
                                            <th style={{ padding: '0 1rem' }}>Estado</th>
                                            <th style={{ padding: '0 1rem', textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.map((inv) => (
                                            <tr key={inv.id} style={{ 
                                                backgroundColor: '#F8FAFC', 
                                                transition: 'all 0.2s',
                                                cursor: 'pointer'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                            >
                                                <td style={{ padding: '1rem', borderRadius: '12px 0 0 12px', fontWeight: '700', color: 'var(--text-main)' }}>
                                                    #{inv.id.substring(0, 8)}
                                                </td>
                                                <td style={{ padding: '1rem', color: '#64748B', fontWeight: '500' }}>
                                                    {new Date(inv.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td style={{ padding: '1rem', fontWeight: '800', color: 'var(--primary)' }}>
                                                    ${Number(inv.total_amount || 0).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <span style={{
                                                        padding: '0.35rem 0.75rem',
                                                        borderRadius: 'var(--radius-full)',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '800',
                                                        textTransform: 'uppercase',
                                                        backgroundColor: inv.status === 'delivered' ? '#DCFCE7' : inv.status === 'pending' ? '#FEF3C7' : '#F1F5F9',
                                                        color: inv.status === 'delivered' ? '#166534' : inv.status === 'pending' ? '#92400E' : '#475569'
                                                    }}>
                                                        {inv.status === 'delivered' ? 'Entregado' : inv.status === 'pending' ? 'Pendiente' : inv.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem', borderRadius: '0 12px 12px 0', textAlign: 'right' }}>
                                                    <button 
                                                        onClick={() => {
                                                            alert('Función de re-pedir disponible pronto.');
                                                        }}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            color: 'var(--primary)',
                                                            fontWeight: '800',
                                                            cursor: 'pointer',
                                                            fontSize: '0.85rem',
                                                            textDecoration: 'underline'
                                                        }}
                                                    >Re-pedir</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ padding: '4rem 2rem', textAlign: 'center', backgroundColor: '#F9FAFB', borderRadius: 'var(--radius-lg)' }}>
                                <div style={{ backgroundColor: '#F1F5F9', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                    <ShoppingCart size={32} color="#94A3B8" />
                                </div>
                                <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: '800' }}>Sin facturas todavía</h3>
                                <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 1.5rem', fontWeight: '500' }}>Cuando realices tu primer pedido institucional, aparecerá aquí.</p>
                                <button onClick={() => setActiveTab('order')} className="btn btn-primary">Hacer un Pedido</button>
                            </div>
                        )}
                    </div>
                )}

                {/* CONSUMPTION TAB */}
                {activeTab === 'consumption' && (
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: 'var(--radius-lg)',
                        padding: '2.5rem',
                        boxShadow: 'var(--shadow-lg)',
                    }}>
                        <div style={{ marginBottom: '2.5rem' }}>
                            <h2 style={{ 
                                fontFamily: 'var(--font-outfit), sans-serif', 
                                fontWeight: 900, 
                                fontSize: '1.5rem',
                                margin: 0,
                                color: 'var(--text-main)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <BarChart3 size={28} color="var(--primary)" strokeWidth={2.5} /> Mi Consumo Habitual
                            </h2>
                            <p style={{ color: 'var(--text-muted)', margin: '0.4rem 0 0', fontSize: '0.95rem', fontWeight: '500' }}>
                                Analiza tus hábitos de compra y optimiza tus pedidos.
                            </p>
                        </div>

                        {isLoadingConsumption ? (
                            <div style={{ padding: '3rem', textAlign: 'center' }}>
                                <div className="spinner" style={{ margin: '0 auto 1.5rem' }}></div>
                                <p style={{ color: 'var(--text-muted)', fontWeight: '600' }}>Calculando analíticas...</p>
                            </div>
                        ) : consumptionData.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                                {consumptionData.slice(0, 6).map((item, index) => (
                                    <div key={item.name} style={{
                                        backgroundColor: '#F8FAFC',
                                        borderRadius: 'var(--radius-lg)',
                                        padding: '1.25rem',
                                        border: '1px solid var(--border)',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}>
                                        {index < 3 && (
                                            <div style={{ 
                                                position: 'absolute', 
                                                top: 10, 
                                                right: 10, 
                                                backgroundColor: index === 0 ? '#FEF3C7' : '#F1F5F9',
                                                color: index === 0 ? '#92400E' : '#475569',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.65rem',
                                                fontWeight: '900'
                                            }}>
                                                TOP {index + 1}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ width: '56px', height: '56px', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#e2e8f0' }}>
                                                {item.image && <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{item.name}</h4>
                                                <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>Total: {item.totalQuantity} {item.unit}</p>
                                            </div>
                                        </div>
                                        
                                        <div style={{ marginTop: '1.25rem' }}>
                                            <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ 
                                                    width: `${Math.min(100, (item.ordersCount / invoices.length) * 100)}%`, 
                                                    height: '100%', 
                                                    backgroundColor: 'var(--primary)',
                                                    borderRadius: '3px'
                                                }}></div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.7rem', color: '#94A3B8', fontWeight: '700' }}>
                                                <span>Frecuencia</span>
                                                <span>{item.ordersCount} pedidos</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ padding: '4rem 2rem', textAlign: 'center', backgroundColor: '#F9FAFB', borderRadius: 'var(--radius-lg)' }}>
                                <div style={{ backgroundColor: '#F1F5F9', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                    <BarChart3 size={32} color="#94A3B8" />
                                </div>
                                <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: '800' }}>Sin datos de consumo</h3>
                                <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 1.5rem', fontWeight: '500' }}>Realiza pedidos para generar analíticas personalizadas.</p>
                                <button onClick={() => setActiveTab('order')} className="btn btn-primary">Hacer un Pedido</button>
                            </div>
                        )}
                        
                        {consumptionData.length > 0 && (
                            <div style={{ 
                                marginTop: '2.5rem', 
                                paddingTop: '2rem', 
                                borderTop: '1px solid #F1F5F9',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div style={{ opacity: 0.7, fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)' }}>
                                    * Basado en tus últimos {invoices.length} pedidos institucionales.
                                </div>
                                <button onClick={() => alert('Pronto: Reporte en PDF')} style={{
                                    backgroundColor: '#EFF6FF',
                                    color: '#1D4ED8',
                                    padding: '0.6rem 1.25rem',
                                    borderRadius: 'var(--radius-md)',
                                    border: 'none',
                                    fontSize: '0.85rem',
                                    fontWeight: '800',
                                    cursor: 'pointer'
                                }}>Exportar Reporte</button>
                            </div>
                        )}
                    </div>
                )}

            </div> {/* Container End */}

            {/* QUANTITY MODAL */}
            {selectedProductForModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        padding: '2rem',
                        borderRadius: 'var(--radius-lg)',
                        width: '90%',
                        maxWidth: '400px',
                        boxShadow: 'var(--shadow-lg)',
                        textAlign: 'center'
                    }}>
                        <img
                            src={selectedProductForModal.image_url}
                            alt={selectedProductForModal.name}
                            style={{ width: '120px', height: '120px', borderRadius: '20px', objectFit: 'cover', marginBottom: '1.25rem', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }}
                        />
                        <h3 style={{ 
                            fontFamily: 'var(--font-outfit), sans-serif',
                            margin: '0 0 0.5rem', 
                            fontSize: '1.5rem',
                            fontWeight: '900',
                            letterSpacing: '-0.02em',
                            color: 'var(--text-main)'
                        }}>{selectedProductForModal.name}</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontWeight: '500' }}>Personaliza tu selección:</p>

                        {/* Variantes / Opciones */}
                        {selectedProductForModal.options_config && Array.isArray(selectedProductForModal.options_config) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', textAlign: 'left' }}>
                                {selectedProductForModal.options_config.map((opt: any) => (
                                    <div key={opt.name}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                            {opt.name}
                                        </label>
                                        <select
                                            value={selectedOptions[opt.name] || ''}
                                            onChange={(e) => setSelectedOptions(prev => ({ ...prev, [opt.name]: e.target.value }))}
                                            style={{
                                                width: '100%',
                                                padding: '0.6rem',
                                                border: '1px solid #D1D5DB',
                                                borderRadius: '8px',
                                                fontSize: '0.9rem',
                                                backgroundColor: '#F9FAFB'
                                            }}
                                        >
                                            <option value="">Seleccionar {opt.name}...</option>
                                            {opt.values?.map((val: string) => (
                                                <option key={val} value={val}>{val}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '2rem' }}>
                            <button
                                onClick={() => setModalQuantity(Math.max(1, modalQuantity - 1))}
                                style={{
                                    width: '48px', height: '48px',
                                    borderRadius: '50%',
                                    border: '1px solid var(--border)',
                                    backgroundColor: 'white',
                                    fontSize: '1.5rem',
                                    cursor: 'pointer'
                                }}
                            >−</button>
                            <span style={{ fontSize: '1.5rem', fontWeight: '700', minWidth: '80px' }}>
                                {modalQuantity} {selectedProductForModal.unit_of_measure || 'kg'}
                            </span>
                            <button
                                onClick={() => setModalQuantity(modalQuantity + 1)}
                                style={{
                                    width: '48px', height: '48px',
                                    borderRadius: '50%',
                                    border: '1px solid var(--primary)',
                                    backgroundColor: 'var(--primary)',
                                    color: 'white',
                                    fontSize: '1.5rem',
                                    cursor: 'pointer'
                                }}
                            >+</button>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={() => setSelectedProductForModal(null)}
                                className="btn"
                                style={{ flex: 1, backgroundColor: '#f3f4f6', color: 'var(--text-main)' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmModalAdd}
                                className="btn btn-primary"
                                style={{ flex: 1 }}
                            >
                                Agregar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* SUMMARY CONFIRMATION MODAL */}
            {isSummaryModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2000,
                    backdropFilter: 'blur(5px)',
                    padding: '1rem'
                }}>
                    <div id="printable-summary-modal" style={{
                        backgroundColor: 'white',
                        padding: '2.5rem',
                        borderRadius: '24px',
                        width: '100%',
                        maxWidth: '500px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                            <div style={{ 
                                background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)', 
                                color: 'white', 
                                width: '72px', 
                                height: '72px', 
                                borderRadius: '50%', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                margin: '0 auto 1.5rem',
                                boxShadow: '0 8px 16px rgba(26, 77, 46, 0.2)' 
                            }}>
                                <ShoppingBag size={34} strokeWidth={2} />
                            </div>
                            <h2 style={{ 
                                fontFamily: 'var(--font-outfit), sans-serif',
                                fontSize: '1.6rem', 
                                fontWeight: '900', 
                                color: 'var(--text-main)', 
                                margin: 0,
                                letterSpacing: '-0.04em'
                            }}>
                                Confirmación de Pedido
                            </h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '0.5rem', fontWeight: '500' }}>
                                Revisa los detalles finales antes de enviar.
                            </p>
                        </div>

                        {/* Textual List (No Photos) */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            marginBottom: '2rem',
                            border: '1px solid #F3F4F6',
                            borderRadius: '16px',
                            backgroundColor: '#F9FAFB'
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
                                <thead style={{ backgroundColor: 'white', position: 'sticky', top: 0 }}>
                                    <tr>
                                        <th style={{ textAlign: 'left', padding: '1rem', borderBottom: '1px solid #E5E7EB', color: '#6B7280', fontSize: '0.75rem', textTransform: 'uppercase' }}>Producto</th>
                                        <th style={{ textAlign: 'right', padding: '1rem', borderBottom: '1px solid #E5E7EB', color: '#6B7280', fontSize: '0.75rem', textTransform: 'uppercase' }}>Cantidad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orderItems.filter(i => i.quantity > 0).map(item => (
                                        <tr key={item.id}>
                                            <td style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: '600' }}>
                                                {item.product_name}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #E5E7EB', textAlign: 'right', color: 'var(--primary-dark)', fontWeight: '800' }}>
                                                {item.quantity} {item.unit}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer Info */}
                        <div style={{
                            backgroundColor: 'rgba(59, 130, 246, 0.05)',
                            padding: '1.25rem',
                            borderRadius: '16px',
                            marginBottom: '2rem',
                            border: '1px solid rgba(59, 130, 246, 0.1)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.95rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3B82F6', fontWeight: '800' }}>
                                    <Truck size={18} /> Fecha requerida:
                                </div>
                                <input
                                    type="date"
                                    value={deliveryDate}
                                    onChange={(e) => setDeliveryDate(e.target.value)}
                                    min={minDeliveryDate}
                                    style={{
                                        fontWeight: '800',
                                        color: '#1E40AF',
                                        border: '1px solid #93C5FD',
                                        borderRadius: '10px',
                                        padding: '0.4rem 0.75rem',
                                        backgroundColor: 'white',
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        outline: 'none',
                                        boxShadow: '0 2px 4px rgba(59, 130, 246, 0.1)'
                                    }}
                                />
                            </div>
                        </div>

                        <div className="no-print" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {/* Print Button */}
                            <button
                                onClick={() => window.print()}
                                className="btn-glass"
                                style={{
                                    flex: 0.4,
                                    color: 'var(--text-main)',
                                    fontWeight: '800',
                                    borderRadius: 'var(--radius-lg)',
                                    padding: '1rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: '1px solid var(--border)'
                                }}
                                title="Imprimir copia"
                            >
                                <Printer size={20} />
                            </button>

                            <button
                                onClick={() => setIsSummaryModalOpen(false)}
                                className="btn"
                                style={{
                                    flex: 1,
                                    backgroundColor: '#F3F4F6',
                                    color: '#4B5563',
                                    fontWeight: '800',
                                    borderRadius: 'var(--radius-lg)',
                                    padding: '1rem',
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    fontSize: '0.95rem'
                                }}
                            >
                                Ajustar Pedido
                            </button>
                            <button
                                onClick={handleFinalSubmit}
                                disabled={submitting}
                                className="btn-premium"
                                style={{
                                    flex: 1.5,
                                    backgroundColor: 'var(--primary)',
                                    color: 'white',
                                    fontWeight: '900',
                                    fontSize: '1rem',
                                    borderRadius: 'var(--radius-full)',
                                    padding: '1rem',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px',
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    boxShadow: '0 12px 24px rgba(26, 77, 46, 0.2)'
                                }}
                            >
                                {submitting ? 'Enviando...' : (
                                    <>
                                        <Rocket size={20} strokeWidth={2.5} /> Enviar Ahora
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #printable-summary-modal, #printable-summary-modal * {
                        visibility: visible;
                    }
                    #printable-summary-modal {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        max-width: 100% !important;
                        box-shadow: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        background: white !important;
                    }
                    .no-print, .btn {
                        display: none !important;
                    }
                     /* Force table scroll area to expand */
                    #printable-summary-modal > div:nth-child(2) {
                        overflow: visible !important;
                        border: none !important;
                    }
                }
            `}</style>
        </main>
    );
}
