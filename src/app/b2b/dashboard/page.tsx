'use client';

import { useRef, useEffect, useState } from 'react';
import { useAuth } from '../../../lib/authContext';
import { supabase } from '../../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { isAbortError } from '@/lib/errorUtils';
import { Package, Trash2, Search, Truck, ShoppingCart, Smile, Printer, Rocket, ShoppingBag, FileText, BarChart3, Info } from 'lucide-react';
import { THEME } from '@/lib/adminTheme';
import { CATEGORY_MAP, DEFAULT_CUTOFF_HOUR } from '@/lib/constants';
import { translations, Locale } from '@/lib/translations';

interface OrderItem {
    id: string;
    product_id: string;
    product_name: string;
    product_name_en?: string;
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
    const [activeTab, setActiveTab] = useState<'order' | 'invoices' | 'consumption' | 'agreements'>('order');
    const [invoices, setInvoices] = useState<any[]>([]);
    const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
    const [consumptionData, setConsumptionData] = useState<any[]>([]);
    const [isLoadingConsumption, setIsLoadingConsumption] = useState(false);
    const [consumptionHistory, setConsumptionHistory] = useState<any[]>([]);
    const [consumptionKpis, setConsumptionKpis] = useState<{ totalCop: number, totalKg: number, avgPrice: number }>({ totalCop: 0, totalKg: 0, avgPrice: 0 });
    const [consumptionTimeRange, setConsumptionTimeRange] = useState<'30days' | '3months'>('30days');
    const [quickAddQuantities, setQuickAddQuantities] = useState<Record<string, number>>({});
    const [agreements, setAgreements] = useState<any[]>([]);
    const [isLoadingAgreements, setIsLoadingAgreements] = useState(false);
    const isMounted = useRef(true);
    const hasFetchedInitial = useRef(false);
    const searchParams = useSearchParams();
    const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
    const t = translations[locale];

    const categories = Object.keys(CATEGORY_MAP);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // Handle Category Selection
    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const fetchCategoryProducts = async () => {
            setIsLoadingCategory(true);
            try {
                let query = supabase
                    .from('products')
                    .select('id, name, name_en, unit_of_measure, image_url, sku, options_config')
                    .eq('is_active', true);

                if (selectedCategory) {
                    query = query.eq('category', selectedCategory);
                }

                const { data, error } = await query
                    .order('name')
                    .abortSignal(signal as any);

                if (error) {
                    if (isAbortError(error)) return;
                    throw error;
                }
                
                // Priorizar con foto
                const sorted = (data || []).sort((a, b) => {
                    const hasA = a.image_url && String(a.image_url).length > 5;
                    const hasB = b.image_url && String(b.image_url).length > 5;
                    if (hasA && !hasB) return -1;
                    if (!hasA && hasB) return 1;
                    return 0;
                });

                if (isMounted.current) setCategoryProducts(sorted);
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
                    .select('id, name, name_en, unit_of_measure, image_url, sku, options_config')
                    .or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%`)
                    .eq('is_active', true)
                    .limit(5)
                    .abortSignal(signal as any);

                if (error) {
                    if (isAbortError(error)) return;
                    throw error;
                }

                // Priorizar con foto
                const sorted = (data || []).sort((a, b) => {
                    const hasA = a.image_url && String(a.image_url).length > 5;
                    const hasB = b.image_url && String(b.image_url).length > 5;
                    if (hasA && !hasB) return -1;
                    if (!hasA && hasB) return 1;
                    return 0;
                });

                if (isMounted.current) setSearchResults(sorted);
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
        const baseName = locale === 'en' ? (product.name_en || product.name) : product.name;
        let finalName = baseName;
        const optionValues = Object.values(selectedOptions).filter(v => v);
        if (optionValues.length > 0) {
            finalName = `${baseName} (${optionValues.join(', ')})`;
        }

        const exists = orderItems.find(item => item.product_name === finalName && item.product_id === product.id);

        if (exists) {
            updateQuantity(exists.id, exists.quantity + modalQuantity);
        } else {
            const newItem: OrderItem = {
                id: Math.random().toString(36).substr(2, 9), // Temp ID
                product_id: product.id,
                product_name: product.name,
                product_name_en: product.name_en,
                product_image: product.image_url || '',
                quantity: modalQuantity,
                unit: product.unit_of_measure || 'kg',
                variant_label: optionValues.join(', ') || undefined
            };
            setOrderItems(prev => [...prev, newItem].sort((a, b) => {
                const nameA = locale === 'en' ? (a.product_name_en || a.product_name) : a.product_name;
                const nameB = locale === 'en' ? (b.product_name_en || b.product_name) : b.product_name;
                return nameA.localeCompare(nameB);
            }));
        }

        setSelectedProductForModal(null);
        setSelectedOptions({});
    };

    const handleQuickAdd = (product: any, qty: number) => {
        if (qty <= 0) return;
        const baseName = locale === 'en' ? (product.name_en || product.name) : product.name;
        const exists = orderItems.find(item => item.product_id === product.id);

        if (exists) {
            updateQuantity(exists.id, exists.quantity + qty);
        } else {
            const newItem: OrderItem = {
                id: Math.random().toString(36).substr(2, 9),
                product_id: product.id,
                product_name: product.name,
                product_name_en: product.name_en,
                product_image: product.image_url || '',
                quantity: qty,
                unit: product.unit_of_measure || 'Kg'
            };
            setOrderItems(prev => [...prev, newItem].sort((a, b) => {
                const nameA = locale === 'en' ? (a.product_name_en || a.product_name) : a.product_name;
                const nameB = locale === 'en' ? (b.product_name_en || b.product_name) : b.product_name;
                return nameA.localeCompare(nameB);
            }));
        }
        alert(`✅ ${baseName} (${qty} ${product.unit_of_measure || 'Kg'}) ${locale === 'en' ? 'added to order' : 'agregado al pedido'}`);
    };

    // Time calculation logic
    useEffect(() => {
        const controller = new AbortController();
        
        const calculateTime = async (signal?: AbortSignal) => {
            try {
                // Check Global Cutoff Switch
                const { data: cutoffData } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'enable_cutoff_rules')
                    .abortSignal(signal as any)
                    .limit(1);

                const cutoffSetting = (cutoffData && cutoffData.length > 0) ? cutoffData[0] : null;

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
                } else {
                    nextDeliveryDate.setDate(now.getDate() + 1);
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

    const lastFetchedLocale = useRef<string | null>(null);
 
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
                        order_items(
                            id,
                            product_id,
                            quantity,
                            products(name, name_en, unit_of_measure, image_url)
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
                        product_name_en: p?.name_en,
                        product_image: p?.image_url || '',
                        quantity: item.quantity,
                        unit: p?.unit_of_measure || 'kg'
                    };
                }).sort((a: any, b: any) => {
                    const nameA = locale === 'en' ? (a.product_name_en || a.product_name) : a.product_name;
                    const nameB = locale === 'en' ? (b.product_name_en || b.product_name) : b.product_name;
                    return nameA.localeCompare(nameB);
                });
                setOrderItems(items);
            } else {
                // 2. Fallback: New Client - Load Top 10 products
                const { data: topProducts } = await supabase
                    .from('products')
                    .select('id, name, name_en, unit_of_measure, image_url')
                    .eq('is_active', true)
                    .limit(10);

                if (topProducts) {
                    const prioritizedTop = [...topProducts].sort((a, b) => {
                        const hasA = a.image_url && String(a.image_url).length > 5;
                        const hasB = b.image_url && String(b.image_url).length > 5;
                        if (hasA && !hasB) return -1;
                        if (!hasA && hasB) return 1;
                        return 0;
                    });

                    const suggestedItems = prioritizedTop.map(p => ({
                        id: Math.random().toString(36).substr(2, 9),
                        product_id: p.id,
                        product_name: p.name,
                        product_name_en: p.name_en,
                        product_image: p.image_url || '',
                        quantity: 0,
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

        if (!authLoading && user && (!hasFetchedInitial.current || lastFetchedLocale.current !== locale)) {
            hasFetchedInitial.current = true;
            lastFetchedLocale.current = locale;
            fetchInitialOrder();
        }
 
        return () => controller.abort();
    }, [authLoading, user, locale]);

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
                    .eq('profile_id', profile.id)
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
                // Fetch all orders with created_at, delivery_date, total, status
                const { data: ordersData, error: ordersError } = await supabase
                    .from('orders')
                    .select('id, created_at, delivery_date, total, status')
                    .eq('profile_id', profile.id)
                    .neq('status', 'draft')
                    .neq('status', 'cancelled')
                    .order('delivery_date', { ascending: true });

                if (ordersError) throw ordersError;
                
                if (ordersData && ordersData.length > 0) {
                    const orderIds = ordersData.map(o => o.id);
                    
                    // Fetch all items from those orders joining with products
                    const { data: itemsData, error: itemsError } = await supabase
                        .from('order_items')
                        .select('product_id, order_id, quantity, products(id, name, name_en, unit_of_measure, image_url, base_price)')
                        .in('order_id', orderIds);

                    if (itemsError) throw itemsError;

                    // Filter based on consumptionTimeRange (client-side)
                    const now = new Date();
                    const daysLimit = consumptionTimeRange === '30days' ? 30 : 90;
                    const cutoffDate = new Date(now.getTime() - daysLimit * 24 * 60 * 60 * 1000);

                    const filteredOrders = (ordersData || []).filter(o => {
                        const dateVal = new Date(o.delivery_date || o.created_at);
                        return dateVal >= cutoffDate;
                    });

                    const filteredOrderIds = new Set(filteredOrders.map(o => o.id));
                    const filteredItems = (itemsData || []).filter(item => filteredOrderIds.has(item.order_id));

                    // 1. KPI calculations
                    const totalCop = filteredOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
                    const totalKg = filteredItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                    const avgPrice = totalKg > 0 ? (totalCop / totalKg) : 0;
                    if (isMounted.current) {
                        setConsumptionKpis({ totalCop, totalKg, avgPrice });
                    }

                    // 2. Aggregate top products
                    const aggregation: Record<string, any> = {};
                    filteredItems.forEach(item => {
                        const p = Array.isArray(item.products) ? item.products[0] : item.products;
                        if (!p) return;
                        const pName = locale === 'en' ? (p.name_en || p.name) : p.name;
                        const pId = p.id;
                        if (!aggregation[pId]) {
                            aggregation[pId] = {
                                id: pId,
                                name: pName,
                                totalQuantity: 0,
                                unit: p.unit_of_measure || 'Kg',
                                image: p.image_url || '',
                                ordersCount: 0,
                                product: p
                            };
                        }
                        aggregation[pId].totalQuantity += Number(item.quantity || 0);
                        aggregation[pId].ordersCount += 1;
                    });

                    const sorted = Object.values(aggregation)
                        .sort((a: any, b: any) => b.totalQuantity - a.totalQuantity);
                    
                    if (isMounted.current) {
                        setConsumptionData(sorted);
                    }

                    // 3. History timeline for line graph
                    const historyMap: Record<string, { date: string, cop: number, kg: number }> = {};
                    // Initialize each order as a plot point to make sure we show all orders chronologically
                    filteredOrders.forEach(o => {
                        const rawDate = new Date(o.delivery_date || o.created_at);
                        const dateStr = rawDate.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-CO', {
                            month: 'short',
                            day: 'numeric'
                        });
                        if (!historyMap[dateStr]) {
                            historyMap[dateStr] = { date: dateStr, cop: 0, kg: 0 };
                        }
                        historyMap[dateStr].cop += Number(o.total || 0);
                    });

                    filteredItems.forEach(item => {
                        const order = filteredOrders.find(o => o.id === item.order_id);
                        if (!order) return;
                        const rawDate = new Date(order.delivery_date || order.created_at);
                        const dateStr = rawDate.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-CO', {
                            month: 'short',
                            day: 'numeric'
                        });
                        if (historyMap[dateStr]) {
                            historyMap[dateStr].kg += Number(item.quantity || 0);
                        }
                    });

                    const historyList = Object.values(historyMap);
                    if (isMounted.current) {
                        setConsumptionHistory(historyList);
                    }
                } else {
                    if (isMounted.current) {
                        setConsumptionData([]);
                        setConsumptionHistory([]);
                        setConsumptionKpis({ totalCop: 0, totalKg: 0, avgPrice: 0 });
                    }
                }
            } catch (err) {
                console.error("Error fetching consumption:", err);
            } finally {
                if (isMounted.current) setIsLoadingConsumption(false);
            }
        };

        fetchConsumption();
    }, [activeTab, profile?.company_name, consumptionTimeRange]);

    // Fetch Agreements
    useEffect(() => {
        if (activeTab !== 'agreements' || !profile?.id) return;

        const fetchAgreements = async () => {
            setIsLoadingAgreements(true);
            try {
                // Try with join first; fall back to simple query if FK not configured
                const { data, error } = await supabase
                    .from('quotes')
                    .select('*, pricing_models!model_id(name)')
                    .eq('client_id', profile.id)
                    .eq('status', 'agreement')
                    .order('created_at', { ascending: false });

                if (error) {
                    // FK join may not exist — retry without it
                    const { data: fallback, error: fallbackError } = await supabase
                        .from('quotes')
                        .select('*')
                        .eq('client_id', profile.id)
                        .eq('status', 'agreement')
                        .order('created_at', { ascending: false });

                    if (fallbackError) {
                        // Non-critical: show empty state silently
                        console.warn('[agreements] fetch failed, showing empty state');
                        if (isMounted.current) setAgreements([]);
                    } else {
                        if (isMounted.current) setAgreements(fallback || []);
                    }
                } else {
                    if (isMounted.current) setAgreements(data || []);
                }
            } catch (err) {
                // Unexpected error — degrade gracefully, do not propagate to global handler
                console.warn('[agreements] unexpected error, showing empty state');
                if (isMounted.current) setAgreements([]);
            } finally {
                if (isMounted.current) setIsLoadingAgreements(false);
            }
        };

        fetchAgreements();
    }, [activeTab, profile?.id]);

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
                    profile_id: profile?.id,
                    type: 'b2b_credit',
                    status: 'pending_approval',
                    delivery_date: deliveryDate,
                    shipping_address: profile?.address_main || 'Dirección registrada',
                    subtotal: 0,
                    total: 0,
                    special_notes: '[ORIGIN: web]'
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
                variant_label: item.variant_label || null,
                nickname: item.variant_label || null
            }));

            await supabase.from('order_items').insert(itemsToInsert);

            alert(t.b2b.dashboard.successMsg);
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
                <div className="container" style={{ padding: '4rem', textAlign: 'center' }}>
                    <p>{t.b2b.dashboard.loadingOrder}</p>
                </div>
            </main>
        );
    }

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography.fontFamilySecondary }}>

            <div className="container" style={{ padding: '2rem 1.5rem', maxWidth: '1400px', margin: '0 auto' }}>

                {/* HEADER */}
                <div style={{ marginBottom: '2rem' }}>
                    <h1 style={{ 
                        fontFamily: THEME.typography.fontFamilyMain,
                        fontSize: '1.75rem', 
                        fontWeight: '600', 
                        color: THEME.colors.textMain, 
                        marginBottom: '0',
                        letterSpacing: '-0.02em'
                    }}>
                        {profile?.company_name || t.b2b.dashboard.title}
                    </h1>
                    <p style={{ margin: '0.25rem 0 0', color: THEME.colors.textSecondary, fontSize: '0.875rem' }}>Portal institucional</p>
                </div>

                {/* TAB NAVIGATION — segmented control */}
                <div style={{
                    display: 'flex',
                    backgroundColor: THEME.colors.background,
                    borderRadius: THEME.radius.lg,
                    padding: '4px',
                    marginBottom: '1.5rem',
                    border: `1px solid ${THEME.colors.border}`,
                    gap: '2px',
                }}>
                    {[
                        { key: 'order', icon: <ShoppingCart size={16} strokeWidth={1.5} />, label: t.b2b.dashboard.tabQuickOrder },
                        { key: 'invoices', icon: <FileText size={16} strokeWidth={1.5} />, label: t.b2b.dashboard.tabInvoices },
                        { key: 'consumption', icon: <BarChart3 size={16} strokeWidth={1.5} />, label: t.b2b.dashboard.tabConsumption },
                        { key: 'agreements', icon: <Rocket size={16} strokeWidth={1.5} />, label: t.b2b.dashboard.tabAgreements },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key as any)}
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                padding: '0.6rem 0.75rem',
                                borderRadius: THEME.radius.md,
                                border: 'none',
                                backgroundColor: activeTab === tab.key ? THEME.colors.primary : 'transparent',
                                color: activeTab === tab.key ? 'white' : THEME.colors.textSecondary,
                                fontWeight: activeTab === tab.key ? '600' : '500',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                whiteSpace: 'nowrap',
                                fontFamily: THEME.typography.fontFamilySecondary,
                                boxShadow: activeTab === tab.key ? '0 1px 4px rgba(13,122,87,0.25)' : 'none',
                            }}
                            onMouseEnter={(e) => { if (activeTab !== tab.key) e.currentTarget.style.backgroundColor = THEME.colors.primaryLight; }}
                            onMouseLeave={(e) => { if (activeTab !== tab.key) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                            {tab.icon} <span className="tab-label">{tab.label}</span>
                        </button>
                    ))}
                </div>

                      {/* TAB CONTENT */}
                {activeTab === 'order' && (
                    <div className="b2b-dashboard-grid">
                        {/* LEFT COLUMN: Catalog Browser */}
                        <div style={{
                            backgroundColor: THEME.colors.surface,
                            borderRadius: THEME.radius.lg,
                            boxShadow: THEME.shadow.md,
                            border: `1px solid ${THEME.colors.border}`,
                            overflow: 'visible',
                            position: 'relative'
                        }}>
                            {/* Sticky Header Wrapper for Catalog Search and Categories */}
                            <div className="b2b-sticky-catalog-header">
                                {/* Header — neutral flat */}
                                <div style={{
                                    backgroundColor: THEME.colors.surface,
                                    padding: '1.25rem 1.5rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    borderBottom: `1px solid ${THEME.colors.border}`,
                                    borderLeft: `3px solid ${THEME.colors.primary}`,
                                    borderRadius: `${THEME.radius.lg} ${THEME.radius.lg} 0 0`,
                                }}>
                                    <div>
                                        <h2 style={{ 
                                            fontFamily: THEME.typography.fontFamilyMain,
                                            fontSize: '1.1rem', 
                                            fontWeight: '600', 
                                            margin: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            color: THEME.colors.textMain,
                                        }}>
                                            <Search size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> {t.navCatalog || 'Buscar Productos'}
                                        </h2>
                                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '400' }}>
                                            {t.b2b.dashboard.cardDesc}
                                        </p>
                                    </div>
                                </div>

                                {/* Search Bar & Category Dropdown Container */}
                                <div style={{ 
                                    padding: '1rem', 
                                    borderBottom: '1px solid var(--border)', 
                                    display: 'flex',
                                    gap: '1rem',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    backgroundColor: '#fff'
                                }}>
                                    {/* Search Input (Takes main space) */}
                                    <div style={{ flex: '2 1 300px', position: 'relative' }}>
                                        <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', display: 'flex' }}>
                                            <Search size={18} strokeWidth={2.5} />
                                        </div>
                                        <input
                                            type="text"
                                            placeholder={t.b2b.dashboard.searchPlaceholder}
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '0.7rem 2.5rem 0.7rem 2.4rem',
                                                borderRadius: 'var(--radius-md)',
                                                border: '1px solid var(--border)',
                                                fontSize: '0.9rem',
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
                                                    width: '20px',
                                                    height: '20px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: '#6b7280',
                                                    cursor: 'pointer',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 'bold',
                                                    zIndex: 5
                                                }}
                                                title="Limpiar búsqueda"
                                            >
                                                ✕
                                            </button>
                                        )}

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
                                                    <p style={{ padding: '1rem', margin: 0, color: 'var(--text-muted)' }}>{t.b2b.dashboard.searching}</p>
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
                                                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                                                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; }}
                                                        >
                                                            <img src={p.image_url} alt={p.name} style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />
                                                            <div style={{ flex: 1 }}>
                                                                <p style={{ margin: 0, fontWeight: '600', fontSize: '0.9rem' }}>{locale === 'en' ? (p.name_en || p.name) : p.name}</p>
                                                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.unit_of_measure}</p>
                                                            </div>
                                                            <span style={{ color: 'var(--primary)', fontWeight: '700' }}>+ {t.b2b.dashboard.add}</span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Category Combobox Selector */}
                                    <div style={{ flex: '1 1 180px', position: 'relative' }}>
                                        <select
                                            value={selectedCategory || ''}
                                            onChange={(e) => setSelectedCategory(e.target.value || null)}
                                            style={{
                                                width: '100%',
                                                padding: '0.7rem 2.2rem 0.7rem 1rem',
                                                borderRadius: 'var(--radius-md)',
                                                border: '1px solid var(--border)',
                                                fontSize: '0.9rem',
                                                fontWeight: '600',
                                                color: 'var(--text-main)',
                                                outline: 'none',
                                                transition: 'all 0.2s',
                                                backgroundColor: '#F9FAFB',
                                                cursor: 'pointer',
                                                appearance: 'none',
                                                backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%230D7A57' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                                backgroundRepeat: 'no-repeat',
                                                backgroundPosition: 'right 8px center',
                                                backgroundSize: '16px'
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
                                        >
                                            <option value="">{t.b2b.dashboard.allCategories}</option>
                                            {categories.map(cat => (
                                                <option key={cat} value={cat}>
                                                    {t.categories[cat as keyof typeof t.categories] || cat}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Category Products Results */}
                            <div style={{ padding: '1.5rem 1rem' }}>
                                <h4 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Package size={16} /> {selectedCategory ? (t.categories[selectedCategory as keyof typeof t.categories] || selectedCategory) : t.b2b.dashboard.allCategories}
                                </h4>
                                {isLoadingCategory ? (
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.b2b.dashboard.loadingItems}</p>
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
                                                    padding: '0',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 'var(--radius-md)',
                                                    cursor: 'pointer',
                                                    textAlign: 'center',
                                                    backgroundColor: '#fff',
                                                    transition: 'all 0.2s',
                                                    display: 'flex',
                                                    flexDirection: 'column'
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
                                                <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px 4px 0 0' }} />
                                                <div style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                                    <h5 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.01em', lineHeight: '1.2' }}>
                                                        {locale === 'en' ? (p.name_en || p.name) : p.name}
                                                    </h5>
                                                    <p style={{ margin: 'auto 0 0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                                                        {p.unit_of_measure}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                                        <p style={{ fontSize: '0.9rem', fontWeight: '500' }}>{t.b2b.dashboard.noProducts}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Order Summary / Cart */}
                        <div className="b2b-cart-sidebar">
                            <div style={{
                                backgroundColor: THEME.colors.surface,
                                borderRadius: THEME.radius.lg,
                                boxShadow: THEME.shadow.md,
                                border: `1px solid ${THEME.colors.border}`,
                                overflow: 'visible',
                            }}>
                                {/* Cart Header */}
                                <div className="b2b-sticky-cart-header" style={{
                                    backgroundColor: '#F8FAFC',
                                    padding: '1.25rem 1.5rem',
                                    borderBottom: `1px solid ${THEME.colors.border}`,
                                    borderRadius: `${THEME.radius.lg} ${THEME.radius.lg} 0 0`,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h3 style={{ 
                                                fontFamily: THEME.typography.fontFamilyMain,
                                                fontSize: '1.05rem', 
                                                fontWeight: '800', 
                                                margin: 0,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                color: THEME.colors.textMain,
                                            }}>
                                                <ShoppingCart size={18} strokeWidth={2} style={{ color: THEME.colors.primary }} /> {t.b2b.dashboard.cardTitle}
                                            </h3>
                                            <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                                                de acuerdo a tu última compra
                                            </p>
                                        </div>
                                        {orderItems.length > 0 && (
                                            <button
                                                onClick={handleClearOrder}
                                                title="Borrar todo y empezar de cero"
                                                style={{
                                                    padding: '0.35rem 0.75rem',
                                                    borderRadius: THEME.radius.md,
                                                    border: `1px solid ${THEME.colors.border}`,
                                                    background: 'white',
                                                    color: '#EF4444',
                                                    fontSize: '0.75rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    fontWeight: '800',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FEF2F2'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; }}
                                            >
                                                <Trash2 size={13} strokeWidth={2} /> {t.b2b.dashboard.btnClear}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Items List */}
                                {orderItems.length > 0 ? (
                                    <div>
                                        <div style={{ maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
                                            {orderItems.map((item) => (
                                                <div key={item.id} className="cart-item-row" style={{
                                                    display: 'flex',
                                                    gap: '0.75rem',
                                                    padding: '1rem 1.25rem',
                                                    borderBottom: '1px solid #F3F4F6',
                                                    alignItems: 'flex-start'
                                                }}>
                                                    <div style={{ width: '52px', height: '52px', backgroundColor: '#f0f0f0', borderRadius: '12px', overflow: 'hidden', flexShrink: 0 }}>
                                                        {item.product_image && <img src={item.product_image} alt={item.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                                    </div>
                                                    
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.35rem' }}>
                                                            <h4 style={{ 
                                                                fontFamily: 'var(--font-outfit), sans-serif',
                                                                fontWeight: '800', 
                                                                fontSize: '0.95rem',
                                                                margin: 0,
                                                                color: 'var(--text-main)',
                                                                letterSpacing: '-0.01em',
                                                                lineHeight: '1.25',
                                                                wordBreak: 'break-word'
                                                            }}>{locale === 'en' ? (item.product_name_en || item.product_name) : item.product_name}
                                                                {item.variant_label && <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600', marginTop: '0.15rem' }}>{item.variant_label}</span>}
                                                            </h4>
                                                            <button
                                                                onClick={() => removeItem(item.id)}
                                                                style={{
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    color: '#EF4444',
                                                                    cursor: 'pointer',
                                                                    padding: '2px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    flexShrink: 0
                                                                }}
                                                                title={t.b2b.dashboard.remove}
                                                            >
                                                                <Trash2 size={16} strokeWidth={2} />
                                                            </button>
                                                        </div>
                                                        
                                                        {/* Unit Price, Subtotal display and Quantity Controls */}
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', gap: '0.5rem' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                                                                    $0 / {item.unit}
                                                                </span>
                                                                <span style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--primary)' }}>
                                                                    Total: $0
                                                                </span>
                                                            </div>

                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#F8FAFC', padding: '2px', borderRadius: '8px', border: '1px solid #E2E8F0', flexShrink: 0 }}>
                                                                <button
                                                                    onClick={() => updateQuantity(item.id, Math.max(0, item.quantity - 1))}
                                                                    style={{
                                                                        width: '26px', height: '26px',
                                                                        borderRadius: '6px',
                                                                        border: 'none',
                                                                        backgroundColor: 'white',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.85rem',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        transition: 'all 0.2s',
                                                                        fontWeight: '700',
                                                                        color: 'var(--text-main)',
                                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                                    }}
                                                                >−</button>
                                                                
                                                                <div style={{ minWidth: '32px', textAlign: 'center' }}>
                                                                    <span style={{ fontWeight: '900', fontSize: '0.9rem', color: 'var(--primary)', fontFamily: 'var(--font-outfit), sans-serif', display: 'block' }}>
                                                                        {item.quantity}
                                                                    </span>
                                                                </div>

                                                                <button
                                                                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                                                    style={{
                                                                        width: '26px', height: '26px',
                                                                        borderRadius: '6px',
                                                                        border: 'none',
                                                                        backgroundColor: 'var(--primary)',
                                                                        color: 'white',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.85rem',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        transition: 'all 0.2s',
                                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                                                    }}
                                                                >+</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Total Summary */}
                                        <div style={{
                                            padding: '1.25rem 1.5rem',
                                            borderTop: '1px solid #E2E8F0',
                                            backgroundColor: '#F8FAFC',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <span style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-main)' }}>Total:</span>
                                            <span style={{ fontSize: '1.2rem', fontWeight: '900', color: 'var(--primary)' }}>
                                                $0
                                            </span>
                                        </div>

                                        {/* Submit Button Section */}
                                        <div style={{ padding: '1.5rem', textAlign: 'center', backgroundColor: '#F9FAFB', borderRadius: `0 0 ${THEME.radius.lg} ${THEME.radius.lg}` }}>
                                            {orderItems.filter(i => i.quantity > 0).length === 0 && (
                                                <p style={{ 
                                                    color: '#DC2626', 
                                                    fontSize: '0.85rem', 
                                                    fontWeight: '600',
                                                    marginBottom: '1rem',
                                                    backgroundColor: '#FEF2F2',
                                                    padding: '0.75rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #FEE2E2',
                                                    display: 'inline-block'
                                                }}>
                                                    {t.b2b.dashboard.minQtyWarning}
                                                </p>
                                            )}
                                            <button
                                                onClick={handleSubmit}
                                                disabled={submitting || orderItems.filter(i => i.quantity > 0).length === 0}
                                                className="btn-premium"
                                                style={{
                                                    width: '100%',
                                                    fontSize: '1.1rem',
                                                    padding: '0.9rem',
                                                    backgroundColor: submitting || orderItems.filter(i => i.quantity > 0).length === 0 ? '#cbd5e1' : 'var(--primary)',
                                                    color: 'white',
                                                    cursor: orderItems.filter(i => i.quantity > 0).length === 0 ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '10px',
                                                    border: 'none',
                                                    borderRadius: 'var(--radius-full)',
                                                    fontFamily: 'var(--font-outfit), sans-serif',
                                                    fontWeight: '900',
                                                    boxShadow: '0 8px 16px rgba(26, 77, 46, 0.2)',
                                                }}
                                            >
                                                {submitting ? t.b2b.dashboard.submitting : (
                                                    <>
                                                        <ShoppingCart size={20} strokeWidth={2.5} /> {t.b2b.dashboard.finishOrder}
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                                        <div style={{ backgroundColor: '#F3F4F6', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                            <Package size={32} color="#94A3B8" />
                                        </div>
                                        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '1.5rem', fontWeight: '500' }}>
                                            {t.b2b.dashboard.emptyOrder}
                                        </p>
                                        <button 
                                            onClick={() => setSelectedCategory('FR')}
                                            className="btn btn-primary"
                                            style={{ padding: '0.6rem 1.5rem', fontSize: '0.85rem' }}
                                        >{t.b2b.dashboard.exploreCatalog}</button>
                                    </div>
                                )}
                            </div>

                            {/* Support Section - Below the card for cleaner look */}
                            <div style={{
                                marginTop: '1.5rem',
                                backgroundColor: 'white',
                                borderRadius: 'var(--radius-lg)',
                                padding: '1.25rem 1.5rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1rem',
                                border: '1px solid var(--border)',
                                boxShadow: 'var(--shadow-sm)'
                            }}>
                                <div>
                                    <h3 style={{ 
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        fontSize: '1rem', 
                                        fontWeight: '800', 
                                        margin: 0, 
                                        color: 'var(--text-main)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}>
                                        <Smile size={20} color="var(--primary)" strokeWidth={2.5} /> {t.b2b.dashboard.specialReqTitle}
                                    </h3>
                                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                                        {t.b2b.dashboard.specialReqDesc}
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
                                        justifyContent: 'center',
                                        gap: '0.5rem',
                                        fontWeight: '900',
                                        textDecoration: 'none',
                                        padding: '0.65rem 1.25rem',
                                        borderRadius: 'var(--radius-full)',
                                        fontSize: '0.85rem',
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        boxShadow: '0 4px 10px rgba(7, 94, 84, 0.15)'
                                    }}
                                >
                                    {t.b2b.dashboard.whatsappBtn}
                                </a>
                            </div>
                        </div>
                    </div>
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
                                    <FileText size={28} color="var(--primary)" strokeWidth={2.5} /> {t.b2b.dashboard.invoiceHistory}
                                </h2>
                                <p style={{ color: 'var(--text-muted)', margin: '0.4rem 0 0', fontSize: '0.95rem', fontWeight: '500' }}>
                                    {t.b2b.dashboard.invoiceDesc}
                                </p>
                            </div>
                        </div>

                        {isLoadingInvoices ? (
                            <div style={{ padding: '3rem', textAlign: 'center' }}>
                                <div className="spinner" style={{ margin: '0 auto 1.5rem' }}></div>
                                <p style={{ color: 'var(--text-muted)', fontWeight: '600' }}>{t.b2b.dashboard.loadingInvoices}</p>
                            </div>
                        ) : invoices.length > 0 ? (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0.75rem' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: '#64748B', fontSize: '0.85rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            <th style={{ padding: '0 1rem' }}>{t.b2b.dashboard.orderId}</th>
                                            <th style={{ padding: '0 1rem' }}>{t.b2b.dashboard.date}</th>
                                            <th style={{ padding: '0 1rem' }}>{t.b2b.dashboard.amount}</th>
                                            <th style={{ padding: '0 1rem' }}>{t.b2b.dashboard.status}</th>
                                            <th style={{ padding: '0 1rem', textAlign: 'right' }}>{t.b2b.dashboard.actions}</th>
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
                                                    {new Date(inv.created_at).toLocaleDateString(locale === 'es' ? 'es-CO' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td style={{ padding: '1rem', fontWeight: '800', color: 'var(--primary)' }}>
                                                    ${Number(inv.total_amount || 0).toLocaleString(locale === 'es' ? 'es-CO' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
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
                                                        {inv.status === 'delivered' ? t.b2b.dashboard.delivered : inv.status === 'pending' ? t.b2b.dashboard.pending : inv.status}
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
                                                    >{t.b2b.dashboard.reorder}</button>
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
                                <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: '800' }}>{t.b2b.dashboard.noInvoices}</h3>
                                <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 1.5rem', fontWeight: '500' }}>{t.b2b.dashboard.noInvoicesDesc}</p>
                                <button onClick={() => setActiveTab('order')} className="btn btn-primary">{t.b2b.dashboard.makeOrder}</button>
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '2.5rem' }}>
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
                                    <BarChart3 size={28} color="var(--primary)" strokeWidth={2.5} /> {t.b2b.dashboard.consumptionTitle}
                                </h2>
                                <p style={{ color: 'var(--text-muted)', margin: '0.4rem 0 0', fontSize: '0.95rem', fontWeight: '500' }}>
                                    {t.b2b.dashboard.consumptionDesc}
                                </p>
                            </div>

                            {/* Range Selector */}
                            <div style={{ display: 'flex', backgroundColor: '#F1F5F9', padding: '4px', borderRadius: 'var(--radius-md)', gap: '2px' }}>
                                <button
                                    onClick={() => setConsumptionTimeRange('30days')}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.8rem',
                                        fontWeight: '800',
                                        border: 'none',
                                        backgroundColor: consumptionTimeRange === '30days' ? 'white' : 'transparent',
                                        color: consumptionTimeRange === '30days' ? 'var(--primary)' : 'var(--text-muted)',
                                        cursor: 'pointer',
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        boxShadow: consumptionTimeRange === '30days' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {locale === 'en' ? 'Last 30 Days' : 'Últimos 30 días'}
                                </button>
                                <button
                                    onClick={() => setConsumptionTimeRange('3months')}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.8rem',
                                        fontWeight: '800',
                                        border: 'none',
                                        backgroundColor: consumptionTimeRange === '3months' ? 'white' : 'transparent',
                                        color: consumptionTimeRange === '3months' ? 'var(--primary)' : 'var(--text-muted)',
                                        cursor: 'pointer',
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        boxShadow: consumptionTimeRange === '3months' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {locale === 'en' ? 'Last 3 Months' : 'Últimos 3 meses'}
                                </button>
                            </div>
                        </div>

                        {isLoadingConsumption ? (
                            <div style={{ padding: '4rem', textAlign: 'center' }}>
                                <div className="spinner" style={{ margin: '0 auto 1.5rem' }}></div>
                                <p style={{ color: 'var(--text-muted)', fontWeight: '600' }}>{t.b2b.dashboard.calculating}</p>
                            </div>
                        ) : consumptionData.length > 0 ? (
                            <>
                                {/* KPIs Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {locale === 'en' ? 'Total Spent' : 'Total Gasto (COP)'}
                                        </p>
                                        <h3 style={{ margin: '0.4rem 0 0', fontSize: '1.6rem', fontWeight: '900', color: 'var(--primary)', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            ${Math.round(consumptionKpis.totalCop).toLocaleString(locale === 'en' ? 'en-US' : 'es-CO')}
                                        </h3>
                                    </div>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {locale === 'en' ? 'Total Volume' : 'Volumen Total'}
                                        </p>
                                        <h3 style={{ margin: '0.4rem 0 0', fontSize: '1.6rem', fontWeight: '900', color: '#1E40AF', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            {Math.round(consumptionKpis.totalKg).toLocaleString(locale === 'en' ? 'en-US' : 'es-CO')} Kg
                                        </h3>
                                    </div>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {locale === 'en' ? 'Avg. Price / Kg' : 'Precio Promedio / Kg'}
                                        </p>
                                        <h3 style={{ margin: '0.4rem 0 0', fontSize: '1.6rem', fontWeight: '900', color: '#D97706', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            ${Math.round(consumptionKpis.avgPrice).toLocaleString(locale === 'en' ? 'en-US' : 'es-CO')}
                                        </h3>
                                    </div>
                                </div>

                                {/* Historical Dual Line Chart */}
                                {consumptionHistory.length > 0 && (
                                    <div style={{
                                        backgroundColor: '#FFFFFF',
                                        borderRadius: 'var(--radius-lg)',
                                        padding: '1.5rem',
                                        border: '1px solid var(--border)',
                                        marginBottom: '2.5rem'
                                    }}>
                                        <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-main)', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            {locale === 'en' ? 'Volume (Kg) vs Value (COP) Evolution' : 'Evolución de Volumen (Kg) vs Gasto (COP)'}
                                        </h3>
                                        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', fontSize: '0.75rem', fontWeight: '800' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <div style={{ width: '12px', height: '3px', backgroundColor: 'var(--primary)', borderRadius: '1.5px' }}></div>
                                                <span style={{ color: 'var(--primary)' }}>{locale === 'en' ? 'Volume (Kg)' : 'Volumen (Kg)'}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <div style={{ width: '12px', height: '3px', backgroundColor: '#3B82F6', borderRadius: '1.5px' }}></div>
                                                <span style={{ color: '#3B82F6' }}>{locale === 'en' ? 'Gasto (COP)' : 'Gasto (COP)'}</span>
                                            </div>
                                        </div>

                                        {(() => {
                                            const width = 800;
                                            const height = 220;
                                            const paddingLeft = 50;
                                            const paddingRight = 80;
                                            const paddingTop = 20;
                                            const paddingBottom = 30;

                                            const chartWidth = width - paddingLeft - paddingRight;
                                            const chartHeight = height - paddingTop - paddingBottom;

                                            const maxKg = Math.max(...consumptionHistory.map(d => d.kg), 10);
                                            const maxCop = Math.max(...consumptionHistory.map(d => d.cop), 10000);

                                            const points = consumptionHistory.map((d, index) => {
                                                const x = paddingLeft + (index / (consumptionHistory.length - 1 || 1)) * chartWidth;
                                                const yKg = paddingTop + chartHeight - (d.kg / maxKg) * chartHeight;
                                                const yCop = paddingTop + chartHeight - (d.cop / maxCop) * chartHeight;
                                                return { x, yKg, yCop, kg: d.kg, cop: d.cop, date: d.date };
                                            });

                                            const pointsKgStr = points.map(p => `${p.x},${p.yKg}`).join(' ');
                                            const pointsCopStr = points.map(p => `${p.x},${p.yCop}`).join(' ');

                                            const areaKgPath = points.length > 0
                                                ? `M ${points[0].x} ${paddingTop + chartHeight} ` +
                                                  points.map(p => `L ${p.x} ${p.yKg}`).join(' ') +
                                                  ` L ${points[points.length - 1].x} ${paddingTop + chartHeight} Z`
                                                : '';

                                            const areaCopPath = points.length > 0
                                                ? `M ${points[0].x} ${paddingTop + chartHeight} ` +
                                                  points.map(p => `L ${p.x} ${p.yCop}`).join(' ') +
                                                  ` L ${points[points.length - 1].x} ${paddingTop + chartHeight} Z`
                                                : '';

                                            const formatCOP = (val: number) => {
                                                const formatted = Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, locale === 'en' ? "," : ".");
                                                return '$' + formatted;
                                            };

                                            return (
                                                <div style={{ width: '100%', overflowX: 'auto' }}>
                                                    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', minWidth: '600px', display: 'block' }}>
                                                        {/* Definitions for gradients */}
                                                        <defs>
                                                            <linearGradient id="gradKg" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.15" />
                                                                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                                                            </linearGradient>
                                                            <linearGradient id="gradCop" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.15" />
                                                                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
                                                            </linearGradient>
                                                        </defs>

                                                        {/* Grid & Axis Lines */}
                                                        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                                                            const y = paddingTop + chartHeight * ratio;
                                                            return (
                                                                <g key={i}>
                                                                    <line
                                                                        x1={paddingLeft}
                                                                        y1={y}
                                                                        x2={width - paddingRight}
                                                                        y2={y}
                                                                        stroke="#F1F5F9"
                                                                        strokeWidth={1}
                                                                    />
                                                                    {/* Left axis (Kg) */}
                                                                    <text x={paddingLeft - 10} y={y + 4} textAnchor="end" style={{ fontSize: '9px', fill: 'var(--text-muted)', fontWeight: 'bold' }}>
                                                                        {Math.round(maxKg - (maxKg * ratio))}
                                                                    </text>
                                                                    {/* Right axis (COP) */}
                                                                    <text x={width - paddingRight + 10} y={y + 4} textAnchor="start" style={{ fontSize: '9px', fill: '#3B82F6', fontWeight: 'bold' }}>
                                                                        {formatCOP(maxCop - (maxCop * ratio))}
                                                                    </text>
                                                                </g>
                                                            );
                                                        })}

                                                        {/* Area Paths (Gradients) */}
                                                        {points.length > 1 && (
                                                            <>
                                                                <path d={areaKgPath} fill="url(#gradKg)" />
                                                                <path d={areaCopPath} fill="url(#gradCop)" />
                                                            </>
                                                        )}

                                                        {/* Polyline paths */}
                                                        {points.length > 1 && (
                                                            <>
                                                                <polyline
                                                                    fill="none"
                                                                    stroke="var(--primary)"
                                                                    strokeWidth={3.5}
                                                                    points={pointsKgStr}
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                />
                                                                <polyline
                                                                    fill="none"
                                                                    stroke="#3B82F6"
                                                                    strokeWidth={3.5}
                                                                    points={pointsCopStr}
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                />
                                                            </>
                                                        )}

                                                        {/* Graph Dots, Data labels, and X Axis labels */}
                                                        {points.map((p, index) => {
                                                            return (
                                                                <g key={index}>
                                                                    {/* Dots */}
                                                                    <circle cx={p.x} cy={p.yKg} r={4.5} fill="var(--primary)" stroke="white" strokeWidth={1.5} />
                                                                    <circle cx={p.x} cy={p.yCop} r={4.5} fill="#3B82F6" stroke="white" strokeWidth={1.5} />
                                                                    
                                                                    {/* Floating values above dots */}
                                                                    <text x={p.x} y={p.yKg - 10} textAnchor="middle" style={{ fontSize: '9px', fill: 'var(--primary)', fontWeight: '800' }}>
                                                                        {Math.round(p.kg)} Kg
                                                                    </text>
                                                                    <text x={p.x} y={p.yCop - 10} textAnchor="middle" style={{ fontSize: '9px', fill: '#3B82F6', fontWeight: '800' }}>
                                                                        {formatCOP(p.cop)}
                                                                    </text>

                                                                    {/* X Axis Label */}
                                                                    <text x={p.x} y={height - 8} textAnchor="middle" style={{ fontSize: '9px', fill: 'var(--text-muted)', fontWeight: 'bold' }}>
                                                                        {p.date}
                                                                    </text>
                                                                </g>
                                                            );
                                                        })}
                                                    </svg>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}

                                {/* Frequently Ordered Products List */}
                                <div style={{ marginTop: '2.5rem' }}>
                                    <h3 style={{ 
                                        margin: '0 0 1.25rem', 
                                        fontSize: '1.05rem', 
                                        fontWeight: '800', 
                                        color: 'var(--text-main)', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '8px',
                                        fontFamily: 'var(--font-outfit), sans-serif'
                                    }}>
                                        <Smile size={20} color="var(--primary)" strokeWidth={2.5} /> {locale === 'en' ? 'Frequently Consumed Products' : 'Productos Más Consumidos'}
                                    </h3>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                                        {consumptionData.map((item, index) => {
                                            const qtyValue = quickAddQuantities[item.id] ?? 1;
                                            return (
                                                <div key={item.id} style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    backgroundColor: '#F8FAFC',
                                                    borderRadius: 'var(--radius-lg)',
                                                    padding: '1rem 1.25rem',
                                                    border: '1px solid var(--border)',
                                                    flexWrap: 'wrap',
                                                    gap: '1rem'
                                                }}>
                                                    {/* Ranking badge + Product image + Name */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: '250px' }}>
                                                        <div style={{
                                                            width: '28px',
                                                            height: '28px',
                                                            borderRadius: '50%',
                                                            backgroundColor: index === 0 ? '#FEF3C7' : index === 1 ? '#F1F5F9' : index === 2 ? '#E0F2FE' : '#F1F5F9',
                                                            color: index === 0 ? '#B45309' : index === 1 ? '#475569' : index === 2 ? '#0369A1' : '#64748B',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '0.85rem',
                                                            fontWeight: '900'
                                                        }}>
                                                            {index + 1}
                                                        </div>
                                                        <div style={{ width: '48px', height: '48px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#e2e8f0', border: '1px solid #E2E8F0' }}>
                                                            {item.image && <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                                        </div>
                                                        <div>
                                                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>{item.name}</h4>
                                                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>
                                                                {locale === 'en' ? 'Total consumed' : 'Consumo total'}: <strong style={{ color: 'var(--primary)' }}>{item.totalQuantity} {item.unit}</strong>
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Bar metric */}
                                                    <div style={{ flex: 1, minWidth: '150px' }}>
                                                        <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                                                            <div style={{ 
                                                                width: `${Math.min(100, (item.ordersCount / (invoices.length || 1)) * 100)}%`, 
                                                                height: '100%', 
                                                                backgroundColor: 'var(--primary)',
                                                                borderRadius: '3px'
                                                            }}></div>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.7rem', color: '#94A3B8', fontWeight: '700' }}>
                                                            <span>{t.b2b.dashboard.frequency}</span>
                                                            <span>{item.ordersCount} {t.b2b.dashboard.ordersLabel}</span>
                                                        </div>
                                                    </div>

                                                    {/* Quick purchase action */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', backgroundColor: 'white', overflow: 'hidden' }}>
                                                            <button
                                                                onClick={() => setQuickAddQuantities(prev => ({ ...prev, [item.id]: Math.max(1, qtyValue - 1) }))}
                                                                style={{ border: 'none', background: 'none', padding: '0.35rem 0.6rem', fontWeight: '900', cursor: 'pointer', color: 'var(--text-muted)' }}
                                                            >-</button>
                                                            <input
                                                                type="number"
                                                                value={qtyValue}
                                                                onChange={(e) => setQuickAddQuantities(prev => ({ ...prev, [item.id]: Math.max(1, Number(e.target.value)) }))}
                                                                style={{ width: '40px', border: 'none', textAlign: 'center', fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-main)', outline: 'none' }}
                                                            />
                                                            <button
                                                                onClick={() => setQuickAddQuantities(prev => ({ ...prev, [item.id]: qtyValue + 1 }))}
                                                                style={{ border: 'none', background: 'none', padding: '0.35rem 0.6rem', fontWeight: '900', cursor: 'pointer', color: 'var(--text-muted)' }}
                                                            >+</button>
                                                        </div>
                                                        
                                                        <button
                                                            onClick={() => handleQuickAdd(item.product, qtyValue)}
                                                            className="btn-premium"
                                                            style={{
                                                                padding: '0.45rem 1rem',
                                                                backgroundColor: 'var(--primary)',
                                                                color: 'white',
                                                                borderRadius: 'var(--radius-md)',
                                                                border: 'none',
                                                                fontSize: '0.8rem',
                                                                fontWeight: '800',
                                                                cursor: 'pointer',
                                                                boxShadow: '0 2px 4px rgba(13,122,87,0.15)'
                                                            }}
                                                        >
                                                            {locale === 'en' ? 'Add' : 'Agregar'}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div style={{ padding: '4rem 2rem', textAlign: 'center', backgroundColor: '#F9FAFB', borderRadius: 'var(--radius-lg)' }}>
                                <div style={{ backgroundColor: '#F1F5F9', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                    <BarChart3 size={32} color="#94A3B8" />
                                </div>
                                <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: '800' }}>{t.b2b.dashboard.noConsumption}</h3>
                                <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 1.5rem', fontWeight: '500' }}>{t.b2b.dashboard.noConsumptionDesc}</p>
                                <button onClick={() => setActiveTab('order')} className="btn btn-primary">{t.b2b.dashboard.makeOrder}</button>
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
                                    * {t.b2b.dashboard.basedOn.replace('{count}', (invoices.length || 0).toString())}
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
                                }}>{t.b2b.dashboard.exportReport}</button>
                            </div>
                        )}
                    </div>
                )}

                {/* AGREEMENTS TAB */}
                {activeTab === 'agreements' && (
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: 'var(--radius-lg)',
                        padding: '2rem',
                        boxShadow: 'var(--shadow-lg)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ 
                                margin: 0, 
                                fontSize: '1.5rem', 
                                fontWeight: '900', 
                                fontFamily: 'var(--font-outfit), sans-serif',
                                color: 'var(--text-main)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <Rocket size={24} color="var(--primary)" /> {t.b2b.dashboard.agreementsTitle}
                            </h2>
                        </div>

                        {isLoadingAgreements ? (
                            <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{t.b2b.dashboard.loadingAgreements}</p>
                        ) : agreements.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                                {agreements.map((agreement) => (
                                    <div key={agreement.id} style={{
                                        border: '1px solid #F1F5F9',
                                        borderRadius: '16px',
                                        padding: '1.5rem',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        transition: 'all 0.2s',
                                        backgroundColor: '#fff'
                                    }}>
                                        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                                            <div style={{ 
                                                width: '56px', 
                                                height: '56px', 
                                                backgroundColor: '#F0FDF4', 
                                                borderRadius: '12px', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                color: 'var(--primary)',
                                                border: '1px solid #DCFCE7'
                                            }}>
                                                <FileText size={28} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.05em' }}>
                                                    {t.b2b.dashboard.activeModel}
                                                </div>
                                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: 'var(--text-main)' }}>
                                                    {agreement.pricing_models?.name || 'Acuerdo de Precios Personalizado'}
                                                </h3>
                                                <div style={{ display: 'flex', gap: '1rem', marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        📅 {t.b2b.dashboard.validUntil} <strong>{new Date(agreement.valid_until).toLocaleDateString(locale === 'es' ? 'es-CO' : 'en-US')}</strong>
                                                    </span>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        🏷️ Ref: <strong>{agreement.quote_number || 'N/A'}</strong>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ 
                                                display: 'inline-block',
                                                padding: '6px 14px',
                                                borderRadius: 'var(--radius-full)',
                                                backgroundColor: '#D1FAE5',
                                                color: '#065F46',
                                                fontSize: '0.75rem',
                                                fontWeight: '900',
                                                textTransform: 'uppercase'
                                            }}>
                                                {t.b2b.dashboard.statusActive}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ padding: '4rem 2rem', textAlign: 'center', backgroundColor: '#F9FAFB', borderRadius: 'var(--radius-lg)' }}>
                                <div style={{ backgroundColor: '#F1F5F9', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                    <Rocket size={32} color="#94A3B8" />
                                </div>
                                <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: '800' }}>{t.b2b.dashboard.noAgreements}</h3>
                                <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0', fontWeight: '500' }}>{t.b2b.dashboard.noAgreementsDesc}</p>
                                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>{t.b2b.dashboard.contactAdvisor}</p>
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
                        }}>{locale === 'en' ? (selectedProductForModal.name_en || selectedProductForModal.name) : selectedProductForModal.name}</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontWeight: '500' }}>{t.b2b.dashboard.modalTitle}</p>

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
                                            <option value="">{t.b2b.dashboard.selectOption.replace('{name}', opt.name)}</option>
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
                                {t.b2b.dashboard.cancelBtn}
                            </button>
                            <button
                                onClick={confirmModalAdd}
                                className="btn btn-primary"
                                style={{ flex: 1 }}
                            >
                                {t.b2b.dashboard.addBtn}
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
                                {t.b2b.dashboard.confirmTitle}
                            </h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '0.5rem', fontWeight: '500' }}>
                                {t.b2b.dashboard.confirmDesc}
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
                                        <th style={{ textAlign: 'left', padding: '1rem', borderBottom: '1px solid #E5E7EB', color: '#6B7280', fontSize: '0.75rem', textTransform: 'uppercase' }}>{t.b2b.dashboard.product}</th>
                                        <th style={{ textAlign: 'right', padding: '1rem', borderBottom: '1px solid #E5E7EB', color: '#6B7280', fontSize: '0.75rem', textTransform: 'uppercase' }}>{t.b2b.dashboard.quantity}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orderItems.filter(i => i.quantity > 0).map(item => (
                                        <tr key={item.id}>
                                            <td style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #E5E7EB' }}>
                                                <p style={{ margin: 0, fontWeight: '800', color: 'var(--text-main)', fontSize: '1rem', letterSpacing: '-0.02em' }}>
                                                    {locale === 'en' ? (item.product_name_en || item.product_name) : item.product_name}
                                                    {item.variant_label && <span style={{ fontWeight: '500', color: 'var(--text-muted)', marginLeft: '6px', fontSize: '0.9rem' }}>({item.variant_label})</span>}
                                                </p>
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
                                    <Truck size={18} /> {t.b2b.dashboard.deliveryDate}:
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
                                title={t.b2b.dashboard.printCopy}
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
                                {t.b2b.dashboard.adjustOrder}
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
                                {submitting ? t.b2b.dashboard.sending : (
                                    <>
                                        <Rocket size={20} strokeWidth={2.5} /> {t.b2b.dashboard.sendNow}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                .b2b-dashboard-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 1.5rem;
                    width: 100%;
                    max-width: 1400px;
                    margin: 0 auto;
                }
                @media (min-width: 1024px) {
                    .b2b-dashboard-grid {
                        grid-template-columns: 1.5fr 1fr;
                    }
                    .b2b-sticky-catalog-header {
                        position: sticky;
                        top: 80px;
                        z-index: 10;
                        background-color: white;
                        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                    }
                    .b2b-sticky-cart-header {
                        position: sticky;
                        top: 80px;
                        z-index: 10;
                        background-color: #F8FAFC;
                        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                    }
                    .b2b-cart-sidebar {
                        position: sticky;
                        top: 80px;
                        align-self: start;
                    }
                }
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
