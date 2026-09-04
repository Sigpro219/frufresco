'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../../lib/authContext';
import { supabase } from '../../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { isAbortError } from '@/lib/errorUtils';
import { Package, Trash2, Search, Truck, ShoppingCart, Smile, Printer, Rocket, ShoppingBag, FileText, BarChart3, Info, Tag, Maximize2, Minimize2, Columns, Clock, HelpCircle, Eye, RotateCcw, Sparkles, Globe, Layers, AlertTriangle, CheckCircle2, Lock, Building2, UserCheck, Zap, Edit2, Calendar, X, ChevronRight, History, ArrowDownAZ } from 'lucide-react';
import { THEME } from '@/lib/adminTheme';
import { CATEGORY_MAP, DEFAULT_CUTOFF_HOUR } from '@/lib/constants';
import { translations, Locale } from '@/lib/translations';
import InvoiceDocumentModal from '@/components/InvoiceDocumentModal';
import AgreementDocumentModal from '@/components/AgreementDocumentModal';
import B2BReportNoveltyModal from '@/components/B2BReportNoveltyModal';
import { ShieldCheck, ExternalLink, ArrowRight, Percent, Award } from 'lucide-react';
import { getNextValidDeliveryDate, isValidDeliveryDate } from '@/lib/colombianHolidays';

interface OrderItem {
    id: string;
    product_id: string;
    product_name: string;
    product_name_en?: string;
    product_image: string;
    quantity: number;
    unit: string;
    unit_price?: number;
    base_price?: number;
    variant_label?: string;
    added_at?: number;
}

export default function B2BDashboard() {
    const searchParams = useSearchParams();
    const locale = (searchParams?.get('lang') === 'en' ? 'en' : 'es') as Locale;
    const t = translations[locale];

    const [focusMode, setFocusMode] = useState<'split' | 'catalog' | 'cart'>('split');
    const [agreementFilter, setAgreementFilter] = useState<'agreement' | 'non_agreement' | 'all'>('agreement');
    const [cartSortOrder, setCartSortOrder] = useState<'newest' | 'oldest' | 'alpha'>('newest');

    const formatPrice = (val: number | string | null | undefined): string => {
        const num = Math.round(Number(val) || 0);
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    const formatQuantity = (val: number | string | null | undefined): string => {
        const num = Number(val) || 0;
        return num.toString().replace('.', ',');
    };

    const { user, profile, loading: authLoading } = useAuth();
    const router = useRouter();
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

    const displayedCartItems = useMemo(() => {
        if (!orderItems || orderItems.length === 0) return [];
        const copy = [...orderItems];

        if (cartSortOrder === 'newest') {
            return copy.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
        } else if (cartSortOrder === 'oldest') {
            return copy.sort((a, b) => (a.added_at || 0) - (b.added_at || 0));
        } else if (cartSortOrder === 'alpha') {
            return copy.sort((a, b) => {
                const nameA = locale === 'en' ? (a.product_name_en || a.product_name) : a.product_name;
                const nameB = locale === 'en' ? (b.product_name_en || b.product_name) : b.product_name;
                return nameA.localeCompare(nameB);
            });
        }
        return copy;
    }, [orderItems, cartSortOrder, locale]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [deliveryDate, setDeliveryDate] = useState('');
    const [minDeliveryDate, setMinDeliveryDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedProductForModal, setSelectedProductForModal] = useState<any | null>(null);
    const [modalQuantity, setModalQuantity] = useState<number | string>(1);
    const [itemInputs, setItemInputs] = useState<Record<string, string>>({});
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [categoryProducts, setCategoryProducts] = useState<any[]>([]);
    const [isLoadingCategory, setIsLoadingCategory] = useState(false);
    const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'order' | 'invoices' | 'consumption' | 'agreements' | 'crates'>('order');
    const [invoices, setInvoices] = useState<any[]>([]);
    const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
    const [consumptionData, setConsumptionData] = useState<any[]>([]);
    const [isLoadingConsumption, setIsLoadingConsumption] = useState(false);
    const [consumptionHistory, setConsumptionHistory] = useState<any[]>([]);
    const [consumptionKpis, setConsumptionKpis] = useState<{ totalCop: number, totalKg: number, totalSavingsCop: number, avgPrice: number }>({ totalCop: 0, totalKg: 0, totalSavingsCop: 0, avgPrice: 0 });
    const [consumptionTimeRange, setConsumptionTimeRange] = useState<'30days' | '3months' | 'all'>('all');
    const [quickAddQuantities, setQuickAddQuantities] = useState<Record<string, any>>({});
    const [agreements, setAgreements] = useState<any[]>([]);
    const [isLoadingAgreements, setIsLoadingAgreements] = useState(false);
    const [simulatedClientId, setSimulatedClientId] = useState<string>('');
    const [simulatedProfiles, setSimulatedProfiles] = useState<any[]>([]);
    const [historicalOrders, setHistoricalOrders] = useState<any[]>([]);
    const [selectedHistoricalOrderId, setSelectedHistoricalOrderId] = useState<string>('');
    const [agreementPricesMap, setAgreementPricesMap] = useState<Record<string, number>>({});
    const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<any | null>(null);
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);
    const [selectedAgreementForModal, setSelectedAgreementForModal] = useState<any | null>(null);
    const [isAgreementModalOpen, setIsAgreementModalOpen] = useState<boolean>(false);
    const [selectedOrderForNovelty, setSelectedOrderForNovelty] = useState<any | null>(null);
    const [isReportNoveltyOpen, setIsReportNoveltyOpen] = useState<boolean>(false);
    const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false);
    const [agreementSearchTerm, setAgreementSearchTerm] = useState<string>('');
    const [activeHoverPoint, setActiveHoverPoint] = useState<any | null>(null);
    const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
    const [searchFocusedIndex, setSearchFocusedIndex] = useState(-1);
    const catalogSearchInputRef = useRef<HTMLInputElement | null>(null);

    const [scarcityLockedMap, setScarcityLockedMap] = useState<Record<string, { id: string; sku: string; name: string; disabledAt: string; message: string; disabledBy: string }>>({});

    useEffect(() => {
        const fetchScarcity = async () => {
            try {
                const { data } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'scarcity_locked_skus')
                    .limit(1);
                if (data && data.length > 0 && data[0].value) {
                    setScarcityLockedMap(JSON.parse(data[0].value));
                }
            } catch (e) {
                console.error('Error fetching scarcity_locked_skus in b2b dashboard:', e);
            }
        };
        fetchScarcity();
    }, []);

    const activeProfile = simulatedClientId 
        ? (simulatedProfiles.find(p => p.id === simulatedClientId) || profile) 
        : profile;

    const searchDropdownResults = useMemo(() => {
        if (!searchTerm || searchTerm.trim().length < 1) return [];
        
        const normalizeSearch = (str: string) => 
            (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

        const cleanSearchQuery = normalizeSearch(searchTerm);
        if (!cleanSearchQuery) return [];

        const existingIds = new Set<string>();
        const combined: any[] = [];

        categoryProducts.forEach(p => {
            if (p && p.id && !existingIds.has(p.id)) {
                existingIds.add(p.id);
                combined.push(p);
            }
        });

        searchResults.forEach(p => {
            if (p && p.id && !existingIds.has(p.id)) {
                existingIds.add(p.id);
                combined.push(p);
            }
        });

        const allowOffAgreement = (activeProfile as any)?.allow_off_agreement_purchases !== false;

        return combined.filter(p => {
            if (p.is_active === false) return false;

            if (!allowOffAgreement || agreementFilter === 'agreement') {
                if (agreementPricesMap[p.id] === undefined) return false;
            } else if (agreementFilter === 'non_agreement') {
                if (agreementPricesMap[p.id] !== undefined) return false;
            }

            const nameNorm = normalizeSearch(p.name);
            const nameEnNorm = normalizeSearch(p.name_en);
            const skuNorm = normalizeSearch(p.sku);
            const catNorm = normalizeSearch(p.category);

            return nameNorm.includes(cleanSearchQuery) ||
                nameEnNorm.includes(cleanSearchQuery) ||
                skuNorm.includes(cleanSearchQuery) ||
                catNorm.includes(cleanSearchQuery);
        }).slice(0, 8);
    }, [searchTerm, categoryProducts, searchResults, agreementPricesMap, activeProfile, agreementFilter]);

    const searchItemRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const firstOptionSelectRef = useRef<HTMLSelectElement | null>(null);
    const modalInputRef = useRef<HTMLInputElement | null>(null);
    const modalConfirmBtnRef = useRef<HTMLButtonElement | null>(null);
    const modalCancelBtnRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (searchFocusedIndex >= 0 && searchItemRefs.current[searchFocusedIndex]) {
            searchItemRefs.current[searchFocusedIndex]?.scrollIntoView({
                block: 'nearest',
                behavior: 'smooth'
            });
        }
    }, [searchFocusedIndex]);

    useEffect(() => {
        if (selectedProductForModal) {
            const timer = setTimeout(() => {
                const hasOptions = selectedProductForModal.options_config && 
                    Array.isArray(selectedProductForModal.options_config) && 
                    selectedProductForModal.options_config.length > 0;

                if (hasOptions && firstOptionSelectRef.current) {
                    firstOptionSelectRef.current.focus();
                } else if (modalInputRef.current) {
                    modalInputRef.current.focus();
                    modalInputRef.current.select();
                }
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [selectedProductForModal]);

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isSearchDropdownOpen || searchDropdownResults.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSearchFocusedIndex(prev => (prev < searchDropdownResults.length ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSearchFocusedIndex(prev => (prev > 0 ? prev - 1 : searchDropdownResults.length));
        } else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
            e.preventDefault();
            if (searchFocusedIndex === searchDropdownResults.length) {
                setIsSearchDropdownOpen(false);
                setSearchFocusedIndex(-1);
            } else {
                const targetIndex = searchFocusedIndex >= 0 && searchFocusedIndex < searchDropdownResults.length 
                    ? searchFocusedIndex 
                    : 0;
                const selectedProd = searchDropdownResults[targetIndex];
                if (selectedProd) {
                    setModalQuantity(1);
                    setSelectedProductForModal(selectedProd);
                    setIsSearchDropdownOpen(false);
                    setSearchFocusedIndex(-1);
                }
            }
        } else if (e.key === 'Escape') {
            setIsSearchDropdownOpen(false);
            setSearchFocusedIndex(-1);
        }
    };

    const isMounted = useRef(true);
    const hasFetchedInitial = useRef(false);

    const categories = Object.keys(CATEGORY_MAP);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // Fetch simulated profiles for B2B testing/onboarding — Restringido exclusivamente a las 3 sucursales del plan piloto
    useEffect(() => {
        const fetchSimProfiles = async () => {
            try {
                // 1. Try fetching via API route to bypass browser RLS constraints
                const res = await fetch('/api/b2b/pilot-profiles');
                if (res.ok) {
                    const json = await res.json();
                    if (json.profiles && json.profiles.length > 0 && isMounted.current) {
                        setSimulatedProfiles(json.profiles);
                        return;
                    }
                }
            } catch (e) {
                console.warn('API pilot profiles fetch failed, trying direct Supabase query:', e);
            }

            // 2. Direct Supabase Fallback
            const pilotIds = [
                'dc3bd32e-32dd-4a35-934f-f5816ea576e0', // Yanuba Cedritos 150
                'a9f31891-7278-49ea-8ee8-2252fdb44ec1', // El Corral Gourmet Floresta
                'b7458b9c-f512-4063-847d-1c29991c15ff'  // CESNE Policía
            ];
            const { data } = await supabase
                .from('profiles')
                .select('id, company_name, nit, parent_id, allow_off_agreement_purchases, override_parent_off_agreement')
                .in('id', pilotIds)
                .order('company_name');

            if (data && isMounted.current) {
                setSimulatedProfiles(data);
            }
        };
        fetchSimProfiles();
    }, []);

    // Route Guard to protect B2B Dashboard
    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                console.log('Acceso no autorizado: redirigiendo a login');
                router.push('/login?redirect=/b2b/dashboard');
                return;
            }
        }
    }, [authLoading, user, router]);

    // Handle Category Selection
    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const fetchCategoryProducts = async () => {
            setIsLoadingCategory(true);
            try {
                let allProducts: any[] = [];
                let page = 0;
                const pageSize = 1000;
                let hasMore = true;

                while (hasMore) {
                    let query = supabase
                        .from('products')
                        .select('id, name, name_en, unit_of_measure, image_url, sku, options_config, base_price, category')
                        .eq('is_active', true)
                        .range(page * pageSize, (page + 1) * pageSize - 1);

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

                    if (data && data.length > 0) {
                        allProducts = allProducts.concat(data);
                        if (data.length < pageSize) {
                            hasMore = false;
                        } else {
                            page++;
                        }
                    } else {
                        hasMore = false;
                    }
                }
                
                // Priorizar productos con acuerdo comercial y luego por foto
                const sorted = allProducts.sort((a, b) => {
                    const isAgreeA = agreementPricesMap[a.id] !== undefined;
                    const isAgreeB = agreementPricesMap[b.id] !== undefined;
                    if (isAgreeA && !isAgreeB) return -1;
                    if (!isAgreeA && isAgreeB) return 1;

                    const hasA = a.image_url && String(a.image_url).length > 5;
                    const hasB = b.image_url && String(b.image_url).length > 5;
                    if (hasA && !hasB) return -1;
                    if (!hasA && hasB) return 1;
                    return a.name.localeCompare(b.name);
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
                    .select('id, name, name_en, unit_of_measure, image_url, sku, options_config, base_price, category, is_active')
                    .or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`)
                    .eq('is_active', true)
                    .limit(50)
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
        const numericModalQty = typeof modalQuantity === 'string' 
            ? (parseFloat(modalQuantity.replace(',', '.')) || 1)
            : Number(modalQuantity) || 1;

        let resolvedUnit = product.unit_of_measure || 'Kg';
        Object.entries(selectedOptions).forEach(([k, v]) => {
            if (k.toLowerCase().includes('presentaci') && v) {
                resolvedUnit = String(v).includes('|') ? String(v).split('|')[0] : String(v);
            }
        });
        const isDiscreteUnit = !['kg', 'kilo', 'kilos'].includes(resolvedUnit.trim().toLowerCase());
        if (isDiscreteUnit && (!Number.isInteger(numericModalQty) || numericModalQty < 1)) {
            if (typeof window !== 'undefined' && (window as any).showToast) {
                (window as any).showToast('Para esta presentación la cantidad debe ser un número entero (1, 2, 3...)', 'error');
            }
            return;
        }

        // Construir nombre con variantes canónicas (ej: "Lulo (Maduro, Grande)")
        const baseName = locale === 'en' ? (product.name_en || product.name) : product.name;
        let finalName = baseName;
        const sortedOptionKeys = Object.keys(selectedOptions).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        const optionValues = sortedOptionKeys.filter(k => selectedOptions[k]).map(k => {
            const v = selectedOptions[k];
            return String(v).includes('|') ? `${String(v).split('|')[0]} (${String(v).split('|')[1]} gr)` : v;
        });
        if (optionValues.length > 0) {
            finalName = `${baseName} (${optionValues.join(', ')})`;
        }

        const exists = orderItems.find(item => item.product_name === finalName && item.product_id === product.id);

        if (exists) {
            const newTotal = Math.round((exists.quantity + numericModalQty) * 100) / 100;
            updateQuantity(exists.id, newTotal);
            if (typeof window !== 'undefined' && (window as any).showToast) {
                (window as any).showToast(`🛒 Se adicionaron ${numericModalQty} ${exists.unit} a ${finalName}. Nuevo total en pedido: ${newTotal} ${exists.unit}`, 'info');
            }
        } else {
            const agreementPrice = agreementPricesMap[product.id];
            const basePrice = product.base_price ? Number(product.base_price) : undefined;
            const resolvedPrice = agreementPrice !== undefined ? Number(agreementPrice) : basePrice;

            const newItem: OrderItem = {
                id: Math.random().toString(36).substr(2, 9), // Temp ID
                product_id: product.id,
                product_name: product.name,
                product_name_en: product.name_en,
                product_image: product.image_url || '',
                quantity: numericModalQty,
                unit: product.unit_of_measure || 'kg',
                unit_price: resolvedPrice,
                base_price: basePrice,
                variant_label: optionValues.join(', ') || undefined,
                added_at: Date.now()
            };
            setOrderItems(prev => [...prev, newItem]);
            if (typeof window !== 'undefined' && (window as any).showToast) {
                (window as any).showToast(`✅ ${finalName} (${numericModalQty} ${product.unit_of_measure || 'Kg'}) agregado al pedido`, 'success');
            }
        }

        setSelectedProductForModal(null);
        setSelectedOptions({});
        setSearchTerm('');
        setIsSearchDropdownOpen(false);
        setSearchFocusedIndex(-1);

        setTimeout(() => {
            if (catalogSearchInputRef.current) {
                catalogSearchInputRef.current.focus();
            }
        }, 50);
    };

    const handleQuickAdd = (product: any, qty: number) => {
        if (qty <= 0) return;
        const baseName = locale === 'en' ? (product.name_en || product.name) : product.name;
        const exists = orderItems.find(item => item.product_id === product.id);

        if (exists) {
            const newTotal = Math.round((exists.quantity + qty) * 100) / 100;
            updateQuantity(exists.id, newTotal);
            if (typeof window !== 'undefined' && (window as any).showToast) {
                (window as any).showToast(`🛒 Se adicionaron ${qty} ${exists.unit} a ${baseName}. Nuevo total en pedido: ${newTotal} ${exists.unit}`, 'info');
            } else {
                alert(`Ya tenías ${baseName} en tu pedido (${exists.quantity} ${exists.unit}). Se adicionaron ${qty} ${exists.unit} para un nuevo total de ${newTotal} ${exists.unit}`);
            }
        } else {
            const agreementPrice = agreementPricesMap[product.id];
            const basePrice = product.base_price ? Number(product.base_price) : undefined;
            const resolvedPrice = agreementPrice !== undefined ? Number(agreementPrice) : basePrice;

            const newItem: OrderItem = {
                id: Math.random().toString(36).substr(2, 9),
                product_id: product.id,
                product_name: product.name,
                product_name_en: product.name_en,
                product_image: product.image_url || '',
                quantity: qty,
                unit: product.unit_of_measure || 'Kg',
                unit_price: resolvedPrice,
                base_price: basePrice,
                added_at: Date.now()
            };
            setOrderItems(prev => [...prev, newItem]);
            if (typeof window !== 'undefined' && (window as any).showToast) {
                (window as any).showToast(`✅ ${baseName} (${qty} ${product.unit_of_measure || 'Kg'}) agregado al pedido`, 'success');
            } else {
                alert(`${baseName} (${qty} ${product.unit_of_measure || 'Kg'}) ${locale === 'en' ? 'added to order' : 'agregado al pedido'}`);
            }
        }
    };

    // Time calculation logic
    useEffect(() => {
        const controller = new AbortController();
        
        const calculateTime = async (signal?: AbortSignal) => {
            try {
                // Check Global Settings (Cutoff, Sunday & Holiday Rules)
                const { data: settingsData } = await supabase
                    .from('app_settings')
                    .select('key, value')
                    .in('key', ['enable_cutoff_rules', 'allow_sunday_deliveries', 'allow_holiday_deliveries'])
                    .abortSignal(signal as any);

                if (!isMounted.current) return;

                const cutoffEnabled = settingsData?.find(s => s.key === 'enable_cutoff_rules')?.value !== 'false';
                const allowSundays = settingsData?.find(s => s.key === 'allow_sunday_deliveries')?.value === 'true';
                const allowHolidays = settingsData?.find(s => s.key === 'allow_holiday_deliveries')?.value === 'true';

                const now = new Date();
                const cutoff = new Date();
                cutoff.setHours(17, 0, 0, 0);

                let targetDate = new Date();

                if (cutoffEnabled) {
                    const afterCutoff = now >= cutoff;
                    if (afterCutoff) {
                        targetDate.setDate(now.getDate() + 2);
                    } else {
                        targetDate.setDate(now.getDate() + 1);
                    }
                } else {
                    targetDate.setDate(now.getDate() + 1);
                }

                // Ajustar al primer día hábil permitido (saltando domingos y 19 festivos si están deshabilitados)
                const validTargetDate = getNextValidDeliveryDate(targetDate, allowSundays, allowHolidays);

                if (isMounted.current) {
                    const minDateStr = validTargetDate.toISOString().split('T')[0];
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
 
    const applyHistoricalOrderToCart = (ord: any, pricesMap: Record<string, number> = agreementPricesMap) => {
        if (!ord || !ord.order_items) return;
        const now = Date.now();
        const items = ord.order_items.map((item: any, idx: number) => {
            const p = Array.isArray(item.products) ? item.products[0] : item.products;
            const pId = item.product_id || p?.id;
            const priceFromMap = pricesMap && pId ? pricesMap[pId] : undefined;
            const unitPrice = priceFromMap !== undefined ? priceFromMap : (item.unit_price || p?.base_price || 0);

            return {
                id: item.id || Math.random().toString(36).substr(2, 9),
                product_id: pId,
                product_name: p?.name || item.nickname || 'Producto',
                product_name_en: p?.name_en,
                product_image: p?.image_url || '',
                quantity: Number(item.quantity || 0),
                unit_price: Number(unitPrice || 0),
                unit: item.unit || p?.unit_of_measure || 'Kg',
                added_at: now + idx
            };
        });

        setOrderItems(items);
    };

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const fetchInitialOrdersAndAgreement = async () => {
            if (!user) return;

            try {
                const targetProfileId = activeProfile?.id || user.id;
                const effectiveClientId = activeProfile?.parent_id || activeProfile?.id;

                // 1. Fetch Active Commercial Agreement Prices via API Endpoint (Bypassing Browser RLS)
                let pricesMap: Record<string, number> = {};
                if (effectiveClientId) {
                    try {
                        const res = await fetch(`/api/b2b/agreements?clientId=${effectiveClientId}`);
                        if (res.ok) {
                            const json = await res.json();
                            if (json.pricesMap) {
                                pricesMap = json.pricesMap;
                            }
                        }
                    } catch (e) {
                        console.warn('API agreement fetch error, fallback to direct query:', e);
                    }
                }
                if (isMounted.current) {
                    setAgreementPricesMap(pricesMap);
                }

                // 2. Fetch Last 10 Orders via API Endpoint (Bypassing Browser RLS)
                let recentOrders: any[] = [];
                if (targetProfileId) {
                    try {
                        const res = await fetch(`/api/b2b/orders?clientId=${targetProfileId}`);
                        if (res.ok) {
                            const json = await res.json();
                            recentOrders = json.orders || [];
                        }
                    } catch (e) {
                        console.warn('API orders fetch error:', e);
                    }
                }

                if (recentOrders && recentOrders.length > 0 && isMounted.current) {
                    setHistoricalOrders(recentOrders);
                    const firstOrder = recentOrders[0];
                    setSelectedHistoricalOrderId(firstOrder.id);
                    applyHistoricalOrderToCart(firstOrder, pricesMap);
                } else {
                    // Fallback: top products
                    const { data: topProducts } = await supabase
                        .from('products')
                        .select('id, name, name_en, unit_of_measure, image_url, base_price')
                        .eq('is_active', true)
                        .limit(10);

                    if (topProducts && isMounted.current) {
                        const suggestedItems = topProducts.map(p => ({
                            id: Math.random().toString(36).substr(2, 9),
                            product_id: p.id,
                            product_name: p.name,
                            product_name_en: p.name_en,
                            product_image: p.image_url || '',
                            quantity: 0,
                            unit_price: pricesMap[p.id] ?? p.base_price ?? 0,
                            unit: p.unit_of_measure || 'kg'
                        }));
                        setOrderItems(suggestedItems);
                    }
                }

                if (isMounted.current) setLoading(false);
            } catch (err) {
                if (isAbortError(err)) return;
                console.error("Error fetching initial orders:", err);
                if (isMounted.current) setLoading(false);
            }
        };

        fetchInitialOrdersAndAgreement();
        return () => controller.abort();
    }, [user, activeProfile?.id]);

    const updateQuantity = (id: string, newQty: number) => {
        if (newQty < 0) return;
        setOrderItems(prev =>
            prev.map(item => item.id === id ? { ...item, quantity: newQty } : item)
        );
    };

    const removeItem = (id: string) => {
        setOrderItems(prev => prev.filter(item => item.id !== id));
    };

    // Fetch Invoices (Limit 5 most recent orders for active profile)
    useEffect(() => {
        if (activeTab !== 'invoices') return;

        const fetchInvoices = async () => {
            setIsLoadingInvoices(true);
            try {
                const targetProfileId = activeProfile?.id || user?.id;
                if (!targetProfileId) {
                    setIsLoadingInvoices(false);
                    return;
                }

                // 1. Intentar consumo por API backend (Service Role) para evitar bloqueos por RLS
                const res = await fetch(`/api/b2b/invoices?clientId=${targetProfileId}`);
                if (res.ok) {
                    const json = await res.json();
                    if (isMounted.current) setInvoices(json.invoices || []);
                } else {
                    // Fallback directo en cliente
                    const { data, error } = await supabase
                        .from('orders')
                        .select(`
                            *,
                            profile:profiles(company_name, nit, address),
                            order_items(
                                id,
                                product_id,
                                quantity,
                                unit_price,
                                unit,
                                nickname,
                                products(id, name, name_en, unit_of_measure, sku, base_price)
                            )
                        `)
                        .eq('profile_id', targetProfileId)
                        .order('created_at', { ascending: false })
                        .limit(20);

                    if (error) throw error;
                    if (isMounted.current) setInvoices(data || []);
                }
            } catch (err) {
                console.error("Error fetching invoices:", err);
            } finally {
                if (isMounted.current) setIsLoadingInvoices(false);
            }
        };

        fetchInvoices();
    }, [activeTab, activeProfile?.id, user?.id]);

    // Fetch Consumption Data
    useEffect(() => {
        const targetProfileId = activeProfile?.id || user?.id;
        if (activeTab !== 'consumption' || !targetProfileId) return;

        const fetchConsumption = async () => {
            setIsLoadingConsumption(true);
            try {
                // Consultar a través del API Backend con ServiceRole en Modo Sandbox
                const res = await fetch(`/api/b2b/consumption?clientId=${targetProfileId}&timeRange=${consumptionTimeRange}`);
                if (res.ok) {
                    const json = await res.json();
                    if (isMounted.current) {
                        setConsumptionHistory(json.history || []);
                        setConsumptionData(json.topProducts || []);
                        setConsumptionKpis(json.kpis || { totalCop: 0, totalKg: 0, totalSavingsCop: 0, avgPrice: 0 });
                    }
                } else {
                    // Fallback directo en cliente si el endpoint responde con error
                    const { data: ordersData } = await supabase
                        .from('orders')
                        .select('id, created_at, delivery_date, total, subtotal, status, profile_id')
                        .eq('profile_id', targetProfileId)
                        .neq('status', 'draft')
                        .neq('status', 'cancelled');

                    if (ordersData && ordersData.length > 0) {
                        const orderIds = ordersData.map(o => o.id);
                        const { data: itemsData } = await supabase
                            .from('order_items')
                            .select('id, product_id, order_id, quantity, unit_price, nickname, products(id, name, name_en, unit_of_measure, image_url, base_price, category)')
                            .in('order_id', orderIds);

                        if (isMounted.current && itemsData) {
                            // Compute top products for fallback
                            const productMap: Record<string, any> = {};
                            itemsData.forEach((it: any) => {
                                const p = Array.isArray(it.products) ? it.products[0] : it.products;
                                const pId = it.product_id || p?.id;
                                if (!pId) return;
                                if (!productMap[pId]) {
                                    productMap[pId] = {
                                        id: pId,
                                        name: p?.name || it.nickname || 'Producto Insumo',
                                        image: p?.image_url || '',
                                        unit: p?.unit_of_measure || 'Kg',
                                        totalQuantity: 0,
                                        ordersCount: 0,
                                        orderIds: new Set(),
                                        product: p || { id: pId, name: it.nickname || 'Producto Insumo', unit_of_measure: 'Kg' }
                                    };
                                }
                                productMap[pId].totalQuantity += Number(it.quantity || 0);
                                productMap[pId].orderIds.add(it.order_id);
                            });
                            const top = Object.values(productMap).map((p: any) => ({
                                ...p,
                                ordersCount: p.orderIds.size
                            })).sort((a: any, b: any) => b.totalQuantity - a.totalQuantity);

                            setConsumptionData(top);
                        }
                    }
                }
            } catch (err) {
                console.error("Error fetching consumption:", err);
            } finally {
                if (isMounted.current) setIsLoadingConsumption(false);
            }
        };

        fetchConsumption();
    }, [activeTab, activeProfile?.id, user?.id, consumptionTimeRange]);

    // Fetch Agreements
    useEffect(() => {
        const targetProfileId = activeProfile?.id || user?.id;
        if (activeTab !== 'agreements' || !targetProfileId) return;

        const fetchAgreements = async () => {
            setIsLoadingAgreements(true);
            try {
                const effectiveClientId = activeProfile?.parent_id || activeProfile?.id || user?.id;
                if (effectiveClientId) {
                    const res = await fetch(`/api/b2b/agreements?clientId=${effectiveClientId}`);
                    if (res.ok) {
                        const json = await res.json();
                        if (json.agreements && isMounted.current) {
                            setAgreements(json.agreements);
                            setIsLoadingAgreements(false);
                            return;
                        }
                    }
                }
            } catch (e) {
                console.warn('[agreements] API fetch error, fallback to direct query:', e);
            }

            try {
                const clientIds = [targetProfileId];
                if (activeProfile?.parent_id) {
                    clientIds.push(activeProfile.parent_id);
                }

                const { data, error } = await supabase
                    .from('quotes')
                    .select(`
                        *,
                        pricing_models!model_id(name),
                        quote_items(
                            *,
                            products(id, name, name_en, unit_of_measure, image_url, base_price, sku, category)
                        )
                    `)
                    .in('client_id', clientIds)
                    .eq('status', 'agreement')
                    .order('created_at', { ascending: false });

                if (error) {
                    // Retry fallback without pricing_models join if FK relation is omitted
                    const { data: fallback } = await supabase
                        .from('quotes')
                        .select(`
                            *,
                            quote_items(
                                *,
                                products(id, name, name_en, unit_of_measure, image_url, base_price, sku, category)
                            )
                        `)
                        .in('client_id', clientIds)
                        .eq('status', 'agreement')
                        .order('created_at', { ascending: false });

                    if (isMounted.current) setAgreements(fallback || []);
                } else {
                    if (isMounted.current) setAgreements(data || []);
                }
            } catch (err) {
                console.warn('[agreements] unexpected error, showing empty state');
                if (isMounted.current) setAgreements([]);
            } finally {
                if (isMounted.current) setIsLoadingAgreements(false);
            }
        };

        fetchAgreements();
    }, [activeTab, activeProfile?.id, user?.id]);

    const handleClearOrder = () => {
        if (window.confirm('¿Estás seguro de que quieres borrar todo el pedido y empezar de cero?')) {
            setOrderItems([]);
        }
    };

    const handleSubmit = () => {
        const itemsToSubmit = orderItems.filter(item => item.quantity > 0);
        
        console.log('handleSubmit called');
        console.log('Total items:', orderItems.length);
        console.log('Items with quantity > 0:', itemsToSubmit.length);
        console.log('� Delivery date:', deliveryDate);
        
        if (itemsToSubmit.length === 0) {
            alert('Debes agregar al menos un producto con cantidad mayor a 0 para confirmar el pedido.');
            return;
        }
        
        if (!deliveryDate) {
            alert('Por favor selecciona una fecha de entrega.');
            return;
        }
        
        console.log('Opening summary modal');
        setIsSummaryModalOpen(true);
    };

    const handleFinalSubmit = async () => {
        const itemsToSubmit = orderItems.filter(item => item.quantity > 0);
        if (itemsToSubmit.length === 0 || !deliveryDate) return;
        setSubmitting(true);

        try {
            const calculatedSubtotal = itemsToSubmit.reduce((acc, item) => {
                const price = Number(item.unit_price ?? agreementPricesMap[item.product_id] ?? item.base_price ?? 0);
                return acc + (Number(item.quantity || 0) * price);
            }, 0);

            // Create new order
            const targetProfile = activeProfile || profile;
            const shippingAddr = targetProfile?.address || targetProfile?.address_main || 'Dirección registrada';

            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert({
                    profile_id: targetProfile?.id,
                    type: 'b2b_credit',
                    status: 'pending_approval',
                    origin_source: 'web_b2b',
                    delivery_date: deliveryDate,
                    shipping_address: shippingAddr,
                    subtotal: calculatedSubtotal,
                    total: calculatedSubtotal,
                    special_notes: '[ORIGIN: web_b2b]'
                })
                .select()
                .single();

            if (orderError) throw orderError;

            // Create order items
            const itemsToInsert = itemsToSubmit.map(item => {
                const price = Number(item.unit_price ?? agreementPricesMap[item.product_id] ?? item.base_price ?? 0);
                return {
                    order_id: order.id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit_price: price,
                    variant_label: item.variant_label || null,
                    nickname: item.variant_label || null
                };
            });

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

            <div className="container" style={{ padding: '1.25rem 1.5rem 2rem', maxWidth: '1400px', margin: '0 auto' }}>

                {/* UNIFIED ULTRA-COMPACT HEADER & TOOLBAR */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    marginBottom: '1rem',
                    backgroundColor: 'white',
                    padding: '0.65rem 1.25rem',
                    borderRadius: THEME.radius.lg,
                    border: `1px solid ${THEME.colors.border}`,
                    boxShadow: THEME.shadow.sm
                }}>
                    {/* Left: Company Title & Client Simulator Dropdown */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div>
                            <h1 style={{ 
                                fontFamily: THEME.typography.fontFamilyMain,
                                fontSize: '1.2rem', 
                                fontWeight: '800', 
                                color: THEME.colors.textMain, 
                                margin: 0,
                                letterSpacing: '-0.02em',
                                lineHeight: 1.2
                            }}>
                                {activeProfile?.company_name || profile?.company_name || t.b2b.dashboard.title}
                            </h1>
                        </div>

                        {/* SELECTOR SIMULADOR B2B DE PRUEBAS */}
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.35rem', 
                            backgroundColor: '#EFF6FF', 
                            padding: '0.25rem 0.6rem', 
                            borderRadius: THEME.radius.md,
                            border: '1px solid #BFDBFE' 
                        }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1D4ED8', whiteSpace: 'nowrap' }}>
                                 Cliente:
                            </span>
                            <select
                                value={simulatedClientId || activeProfile?.id || ''}
                                onChange={(e) => setSimulatedClientId(e.target.value)}
                                style={{
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    color: '#1E293B',
                                    backgroundColor: 'white',
                                    border: '1px solid #93C5FD',
                                    borderRadius: '6px',
                                    padding: '2px 6px',
                                    cursor: 'pointer',
                                    outline: 'none',
                                    maxWidth: '240px'
                                }}
                            >
                                <option value="">(Mi Cuenta Autenticada)</option>
                                {simulatedProfiles.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.company_name} {p.nit ? `(NIT: ${p.nit})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Right: Inline Tabs + Enfoque Segmented Control */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {/* Navigation Tabs */}
                        <div className="b2b-tab-navigation" style={{
                            display: 'flex',
                            backgroundColor: '#F8FAFC',
                            borderRadius: THEME.radius.md,
                            padding: '3px',
                            border: `1px solid ${THEME.colors.border}`,
                            gap: '2px'
                        }}>
                            {[
                                { key: 'order', icon: <ShoppingCart size={14} strokeWidth={2} />, label: t.b2b.dashboard.tabQuickOrder },
                                { key: 'invoices', icon: <FileText size={14} strokeWidth={2} />, label: t.b2b.dashboard.tabInvoices },
                                { key: 'consumption', icon: <BarChart3 size={14} strokeWidth={2} />, label: t.b2b.dashboard.tabConsumption },
                                { key: 'agreements', icon: <Rocket size={14} strokeWidth={2} />, label: t.b2b.dashboard.tabAgreements },
                                { key: 'crates', icon: <Package size={14} strokeWidth={2} />, label: 'Mis Canastillas' },
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key as any)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        padding: '0.35rem 0.65rem',
                                        borderRadius: THEME.radius.md,
                                        border: 'none',
                                        backgroundColor: activeTab === tab.key ? THEME.colors.primary : 'transparent',
                                        color: activeTab === tab.key ? 'white' : THEME.colors.textSecondary,
                                        fontWeight: activeTab === tab.key ? '800' : '600',
                                        fontSize: '0.76rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {tab.icon} <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Focus Mode Selector (Only on Quick Order tab) */}
                        {activeTab === 'order' && (
                            <div style={{
                                display: 'flex',
                                backgroundColor: '#F1F5F9',
                                borderRadius: THEME.radius.md,
                                padding: '3px',
                                border: '1px solid #E2E8F0',
                                gap: '2px'
                            }}>
                                <button
                                    onClick={() => setFocusMode('split')}
                                    style={{
                                        padding: '0.35rem 0.55rem',
                                        borderRadius: THEME.radius.md,
                                        border: 'none',
                                        backgroundColor: focusMode === 'split' ? 'white' : 'transparent',
                                        color: focusMode === 'split' ? 'var(--primary)' : '#64748B',
                                        fontWeight: focusMode === 'split' ? '900' : '600',
                                        fontSize: '0.72rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        boxShadow: focusMode === 'split' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                    title="Vista dividida balanceada (60/40)"
                                >
                                    <Columns size={13} /> 60/40
                                </button>

                                <button
                                    onClick={() => setFocusMode(focusMode === 'catalog' ? 'split' : 'catalog')}
                                    style={{
                                        padding: '0.35rem 0.55rem',
                                        borderRadius: THEME.radius.md,
                                        border: 'none',
                                        backgroundColor: focusMode === 'catalog' ? 'white' : 'transparent',
                                        color: focusMode === 'catalog' ? 'var(--primary)' : '#64748B',
                                        fontWeight: focusMode === 'catalog' ? '900' : '600',
                                        fontSize: '0.72rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        boxShadow: focusMode === 'catalog' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                    title="Maximizar Catálogo"
                                >
                                    <Maximize2 size={13} /> Catálogo
                                </button>

                                <button
                                    onClick={() => setFocusMode(focusMode === 'cart' ? 'split' : 'cart')}
                                    style={{
                                        padding: '0.35rem 0.55rem',
                                        borderRadius: THEME.radius.md,
                                        border: 'none',
                                        backgroundColor: focusMode === 'cart' ? 'white' : 'transparent',
                                        color: focusMode === 'cart' ? 'var(--primary)' : '#64748B',
                                        fontWeight: focusMode === 'cart' ? '900' : '600',
                                        fontSize: '0.72rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        boxShadow: focusMode === 'cart' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                    title="Maximizar Pedido Sugerido / Canasta"
                                >
                                    <Maximize2 size={13} /> Canasta
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* SANDBOX MODE BANNER FOR EMPLOYEES */}
                {!simulatedClientId && ((profile as any)?.profile_type === 'employee' || profile?.role === 'COORDINADOR ADMINISTRATIVO') && (
                    <div style={{
                        padding: '1rem 1.25rem',
                        marginBottom: '1.25rem',
                        borderRadius: '12px',
                        backgroundColor: '#EFF6FF',
                        border: '1px solid #93C5FD',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        boxShadow: '0 2px 8px rgba(30, 64, 175, 0.06)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                            <span style={{ fontSize: '1.4rem' }}>🧪</span>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: '800', color: '#1E40AF' }}>
                                    Modo Sandbox (Fase de Construcción)
                                </h4>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: '#1E3A8A', lineHeight: '1.3' }}>
                                    Para inspeccionar el consumo, las facturas y los acuerdos comerciales de una empresa en este ambiente de pruebas, por favor selecciona un cliente en el selector superior (ej: <strong>CENTRO SOCIAL DE SUBOFICIALES</strong>).
                                </p>
                            </div>
                        </div>
                        {simulatedProfiles.length > 0 && (
                            <button
                                onClick={() => setSimulatedClientId(simulatedProfiles[0].id)}
                                style={{
                                    padding: '0.45rem 0.85rem',
                                    backgroundColor: '#2563EB',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontWeight: '800',
                                    fontSize: '0.78rem',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                Seleccionar Sucursal Piloto
                            </button>
                        )}
                    </div>
                )}

                {/* TAB CONTENT */}
                {activeTab === 'order' && (
                    <>
                        <div className="b2b-dashboard-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: focusMode === 'catalog' ? '1fr 300px' : focusMode === 'cart' ? '320px 1fr' : '1.3fr 1fr',
                            gap: '1.5rem',
                            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}>
                        {/* LEFT COLUMN: Catalog Browser */}
                        <div className="b2b-catalog-container" style={{
                            backgroundColor: THEME.colors.surface,
                            borderRadius: THEME.radius.lg,
                            boxShadow: THEME.shadow.md,
                            border: `1px solid ${THEME.colors.border}`,
                            position: 'relative',
                            zIndex: 10
                        }}>
                            {/* Sticky Header Wrapper for Catalog Search and Categories — UNIFIED COMPACT SINGLE ROW */}
                            <div className="b2b-sticky-catalog-header" style={{
                                backgroundColor: THEME.colors.surface,
                                padding: '0.75rem 1.25rem',
                                borderBottom: `1px solid ${THEME.colors.border}`,
                                borderLeft: `3px solid ${THEME.colors.primary}`,
                                borderRadius: `${THEME.radius.lg} ${THEME.radius.lg} 0 0`,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.6rem',
                                width: '100%',
                                boxSizing: 'border-box',
                                position: 'relative',
                                zIndex: 100
                            }}>
                                {/* Fila 1: Título + Buscador + Categoria */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', width: '100%' }}>
                                    <h2 style={{ 
                                        fontFamily: THEME.typography.fontFamilyMain,
                                        fontSize: '1.05rem', 
                                        fontWeight: '800', 
                                        margin: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        color: THEME.colors.textMain,
                                        whiteSpace: 'nowrap'
                                    }}>
                                        <Package size={18} strokeWidth={2} style={{ color: THEME.colors.primary }} /> {t.navCatalog || 'Catálogo'}
                                    </h2>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end', minWidth: 0 }}>
                                        <div 
                                            style={{ position: 'relative', flex: '1 1 140px', minWidth: '120px', maxWidth: '240px', zIndex: 1000 }}
                                            onBlur={(e) => {
                                                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                    setIsSearchDropdownOpen(false);
                                                }
                                            }}
                                        >
                                            <div style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', display: 'flex', zIndex: 2 }}>
                                                <Search size={13} strokeWidth={2} />
                                            </div>
                                            <input
                                                ref={catalogSearchInputRef}
                                                type="text"
                                                placeholder={t.b2b.dashboard.searchPlaceholder}
                                                value={searchTerm}
                                                onChange={(e) => {
                                                    setSearchTerm(e.target.value);
                                                    setIsSearchDropdownOpen(true);
                                                    setSearchFocusedIndex(-1);
                                                }}
                                                onFocus={() => setIsSearchDropdownOpen(true)}
                                                onKeyDown={handleSearchKeyDown}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.35rem 1.4rem 0.35rem 1.6rem',
                                                    borderRadius: THEME.radius.md,
                                                    border: isSearchDropdownOpen && searchDropdownResults.length > 0 ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '600',
                                                    outline: 'none',
                                                    backgroundColor: '#F9FAFB',
                                                    boxSizing: 'border-box'
                                                }}
                                            />
                                            {searchTerm && (
                                                <button
                                                    onClick={() => {
                                                        setSearchTerm('');
                                                        setIsSearchDropdownOpen(false);
                                                        setSearchFocusedIndex(-1);
                                                    }}
                                                    style={{
                                                        position: 'absolute',
                                                        right: '6px',
                                                        top: '50%',
                                                        transform: 'translateY(-50%)',
                                                        background: '#f3f4f6',
                                                        border: 'none',
                                                        borderRadius: '50%',
                                                        width: '14px',
                                                        height: '14px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: '#6b7280',
                                                        cursor: 'pointer',
                                                        fontSize: '0.6rem',
                                                        zIndex: 2
                                                    }}
                                                >✕</button>
                                            )}

                                            {/* FLOATING AUTOCOMPLETE DROPDOWN (DESPLEGABLE IDÉNTICO A LA IMAGEN 2) */}
                                            {isSearchDropdownOpen && searchTerm.trim().length > 0 && (
                                                <div 
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    style={{
                                                        position: 'absolute',
                                                        top: 'calc(100% + 6px)',
                                                        left: 0,
                                                        width: '340px',
                                                        backgroundColor: 'white',
                                                        borderRadius: '16px',
                                                        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.22), 0 4px 12px rgba(0, 0, 0, 0.1)',
                                                        border: '1px solid #E2E8F0',
                                                        zIndex: 999999,
                                                        overflow: 'hidden'
                                                    }}
                                                >
                                                    {searchDropdownResults.length > 0 ? (
                                                        <div>
                                                            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                                                {searchDropdownResults.map((prod, idx) => {
                                                                    const isAgree = agreementPricesMap[prod.id] !== undefined;
                                                                    const displayPrice = isAgree ? agreementPricesMap[prod.id] : (prod.base_price || 0);
                                                                    const isFocused = idx === searchFocusedIndex;

                                                                    return (
                                                                        <div
                                                                            key={prod.id}
                                                                            ref={(el) => { searchItemRefs.current[idx] = el; }}
                                                                            onMouseDown={(e) => {
                                                                                e.preventDefault();
                                                                                setModalQuantity(1);
                                                                                setSelectedProductForModal(prod);
                                                                                setIsSearchDropdownOpen(false);
                                                                                setSearchFocusedIndex(-1);
                                                                            }}
                                                                            onClick={() => {
                                                                                setModalQuantity(1);
                                                                                setSelectedProductForModal(prod);
                                                                                setIsSearchDropdownOpen(false);
                                                                                setSearchFocusedIndex(-1);
                                                                            }}
                                                                            onMouseEnter={() => setSearchFocusedIndex(idx)}
                                                                            style={{
                                                                                padding: '10px 14px',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'space-between',
                                                                                gap: '10px',
                                                                                cursor: 'pointer',
                                                                                backgroundColor: isFocused ? '#ECFDF5' : 'white',
                                                                                borderLeft: isFocused ? '4px solid var(--primary)' : '4px solid transparent',
                                                                                borderBottom: '1px solid #F1F5F9',
                                                                                transition: 'background-color 0.15s ease'
                                                                            }}
                                                                        >
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                                                                                <img
                                                                                    src={prod.image_url || '/placeholder.png'}
                                                                                    alt={prod.name}
                                                                                    style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0, border: '1px solid #E2E8F0' }}
                                                                                />
                                                                                <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                                                                                    <div style={{ fontWeight: '800', fontSize: '0.84rem', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                        {locale === 'en' ? (prod.name_en || prod.name) : prod.name}
                                                                                    </div>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                                                        <span style={{ fontSize: '0.78rem', fontWeight: '900', color: isAgree ? 'var(--primary)' : '#475569' }}>
                                                                                            ${formatPrice(displayPrice)} <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: '600' }}>/ {prod.unit_of_measure || 'Kg'}</span>
                                                                                        </span>
                                                                                        {isAgree ? (
                                                                                            <span style={{ fontSize: '0.62rem', backgroundColor: '#D1FAE5', color: '#065F46', fontWeight: '800', padding: '1px 5px', borderRadius: '4px' }}>
                                                                                                Convenio
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span style={{ fontSize: '0.62rem', backgroundColor: '#F1F5F9', color: '#64748B', fontWeight: '700', padding: '1px 5px', borderRadius: '4px' }}>
                                                                                                Lista
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <ChevronRight size={14} style={{ color: isFocused ? 'var(--primary)' : '#CBD5E1', flexShrink: 0 }} />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>

                                                            <div
                                                                ref={(el) => { searchItemRefs.current[searchDropdownResults.length] = el; }}
                                                                onClick={() => {
                                                                    setIsSearchDropdownOpen(false);
                                                                    setSearchFocusedIndex(-1);
                                                                }}
                                                                onMouseEnter={() => setSearchFocusedIndex(searchDropdownResults.length)}
                                                                style={{
                                                                    padding: '10px 14px',
                                                                    textAlign: 'center',
                                                                    fontSize: '0.78rem',
                                                                    fontWeight: '800',
                                                                    color: searchFocusedIndex === searchDropdownResults.length ? 'var(--primary)' : '#64748B',
                                                                    backgroundColor: searchFocusedIndex === searchDropdownResults.length ? '#ECFDF5' : '#FAFAFA',
                                                                    borderTop: '1px solid #E2E8F0',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                Ver todos los resultados para "{searchTerm}"
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div style={{ padding: '1.25rem', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
                                                            {isSearching ? 'Buscando insumos...' : `No se encontraron productos para "${searchTerm}"`}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <select
                                            value={selectedCategory || ''}
                                            onChange={(e) => setSelectedCategory(e.target.value || null)}
                                            style={{
                                                padding: '0.35rem 1.5rem 0.35rem 0.6rem',
                                                borderRadius: THEME.radius.md,
                                                border: '1px solid var(--border)',
                                                fontSize: '0.75rem',
                                                fontWeight: '600',
                                                color: 'var(--text-main)',
                                                outline: 'none',
                                                backgroundColor: '#F9FAFB',
                                                cursor: 'pointer',
                                                appearance: 'none',
                                                backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%230D7A57' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                                backgroundRepeat: 'no-repeat',
                                                backgroundPosition: 'right 4px center',
                                                backgroundSize: '12px',
                                                maxWidth: '120px'
                                            }}
                                        >
                                            <option value="">{t.b2b.dashboard.allCategories}</option>
                                            {categories.map(cat => (
                                                <option key={cat} value={cat}>
                                                    {t.categories[cat] || (cat === 'PR' ? 'Procesados' : cat)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Fila 2: Filtros de Convenio (CSS Grid Garantizado 100% Sin Desbordamiento) */}
                                {(() => {
                                    const activeProds = categoryProducts.filter(p => p.is_active !== false);
                                    const countInAgreement = activeProds.filter(p => agreementPricesMap[p.id] !== undefined).length;
                                    const countOutAgreement = activeProds.filter(p => agreementPricesMap[p.id] === undefined).length;
                                    const countTotal = activeProds.length;
                                    const allowOffAgreement = (activeProfile as any)?.allow_off_agreement_purchases !== false;
                                    if (!allowOffAgreement && agreementFilter !== 'agreement') {
                                        setAgreementFilter('agreement');
                                    }

                                    return (
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: allowOffAgreement ? 'repeat(3, 1fr)' : '1fr',
                                            backgroundColor: '#F1F5F9',
                                            padding: '3px',
                                            borderRadius: THEME.radius.md,
                                            gap: '4px',
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            marginTop: '0.5rem'
                                        }}>
                                            {/* Button 1: En Convenio */}
                                            <button
                                                onClick={() => setAgreementFilter('agreement')}
                                                style={{
                                                    minWidth: 0,
                                                    padding: '0.4rem 0.5rem',
                                                    borderRadius: THEME.radius.md,
                                                    border: 'none',
                                                    backgroundColor: agreementFilter === 'agreement' ? '#D1FAE5' : 'transparent',
                                                    color: agreementFilter === 'agreement' ? '#065F46' : '#64748B',
                                                    fontWeight: agreementFilter === 'agreement' ? '800' : '600',
                                                    fontSize: '0.75rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '5px',
                                                    boxShadow: agreementFilter === 'agreement' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                    whiteSpace: 'nowrap'
                                                }}
                                                title="Mostrar productos incluidos en tu acuerdo comercial"
                                            >
                                                <Tag size={13} style={{ flexShrink: 0 }} />
                                                <span>Convenio</span>
                                                <span style={{ flexShrink: 0, fontWeight: '800', fontSize: '0.68rem', backgroundColor: agreementFilter === 'agreement' ? '#059669' : '#94A3B8', color: 'white', padding: '1px 6px', borderRadius: '10px' }}>{countInAgreement}</span>
                                            </button>

                                            {/* Buttons 2 & 3: Fuera y Todos (Visible ONLY when allowOffAgreement is true) */}
                                            {allowOffAgreement && (
                                                <>
                                                    <button
                                                        onClick={() => setAgreementFilter('non_agreement')}
                                                        style={{
                                                            minWidth: 0,
                                                            padding: '0.4rem 0.5rem',
                                                            borderRadius: THEME.radius.md,
                                                            border: 'none',
                                                            backgroundColor: agreementFilter === 'non_agreement' ? '#E2E8F0' : 'transparent',
                                                            color: agreementFilter === 'non_agreement' ? '#1E293B' : '#64748B',
                                                            fontWeight: agreementFilter === 'non_agreement' ? '800' : '600',
                                                            fontSize: '0.75rem',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '4px',
                                                            boxShadow: agreementFilter === 'non_agreement' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                        title="Mostrar productos fuera de convenio"
                                                    >
                                                        <Info size={13} style={{ flexShrink: 0 }} />
                                                        <span>Fuera</span>
                                                        <span style={{ flexShrink: 0, fontWeight: '800', fontSize: '0.68rem', backgroundColor: agreementFilter === 'non_agreement' ? '#475569' : '#94A3B8', color: 'white', padding: '1px 6px', borderRadius: '10px' }}>{countOutAgreement}</span>
                                                    </button>

                                                    <button
                                                        onClick={() => setAgreementFilter('all')}
                                                        style={{
                                                            minWidth: 0,
                                                            padding: '0.4rem 0.5rem',
                                                            borderRadius: THEME.radius.md,
                                                            border: 'none',
                                                            backgroundColor: agreementFilter === 'all' ? 'white' : 'transparent',
                                                            color: agreementFilter === 'all' ? 'var(--primary)' : '#64748B',
                                                            fontWeight: agreementFilter === 'all' ? '800' : '600',
                                                            fontSize: '0.75rem',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '4px',
                                                            boxShadow: agreementFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                        title="Mostrar todos los productos"
                                                    >
                                                        <Layers size={13} style={{ flexShrink: 0 }} />
                                                        <span>Todos</span>
                                                        <span style={{ flexShrink: 0, fontWeight: '800', fontSize: '0.68rem', backgroundColor: agreementFilter === 'all' ? 'var(--primary)' : '#94A3B8', color: 'white', padding: '1px 6px', borderRadius: '10px' }}>{countTotal}</span>
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            <div style={{ padding: '1.25rem 1rem' }}>
                                {(() => {
                                    const normalizeSearch = (str: string) => 
                                        (str || '')
                                            .toLowerCase()
                                            .normalize('NFD')
                                            .replace(/[\u0300-\u036f]/g, '')
                                            .trim();

                                    const cleanSearchQuery = normalizeSearch(searchTerm);

                                    // Combinar productos cargados con resultados de la búsqueda Supabase si el término tiene al menos 2 letras
                                    let baseList = categoryProducts;
                                    if (cleanSearchQuery.length >= 2 && searchResults.length > 0) {
                                        const existingIds = new Set(categoryProducts.map(p => p.id));
                                        const missing = searchResults.filter(sr => !existingIds.has(sr.id));
                                        if (missing.length > 0) {
                                            baseList = [...categoryProducts, ...missing];
                                        }
                                    }

                                    const filteredList = baseList.filter(p => {
                                        if (p.is_active === false) return false;

                                        // Regla Estricta de Convenio:
                                        const allowOffAgreement = (activeProfile as any)?.allow_off_agreement_purchases !== false;
                                        
                                        // Si el cliente no tiene permitido comprar fuera de convenio O el filtro activo es 'agreement', NUNCA mostrar productos fuera de convenio
                                        if (!allowOffAgreement || agreementFilter === 'agreement') {
                                            if (agreementPricesMap[p.id] === undefined) return false;
                                        } else if (agreementFilter === 'non_agreement') {
                                            if (agreementPricesMap[p.id] !== undefined) return false;
                                        }

                                        // Filtro por término de búsqueda (Insensible a mayúsculas y acentos)
                                        if (cleanSearchQuery.length > 0) {
                                            const nameNorm = normalizeSearch(p.name);
                                            const nameEnNorm = normalizeSearch(p.name_en);
                                            const skuNorm = normalizeSearch(p.sku);
                                            const catNorm = normalizeSearch(p.category);

                                            const matches = 
                                                nameNorm.includes(cleanSearchQuery) ||
                                                nameEnNorm.includes(cleanSearchQuery) ||
                                                skuNorm.includes(cleanSearchQuery) ||
                                                catNorm.includes(cleanSearchQuery);

                                            if (!matches) return false;
                                        }

                                        return true;
                                    });

                                    const filterLabel = agreementFilter === 'agreement' ? 'En Convenio' : agreementFilter === 'non_agreement' ? 'Fuera de Convenio' : 'Todos los Productos';

                                    return (
                                        <>
                                            <h4 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Package size={16} color="var(--primary)" /> 
                                                {cleanSearchQuery ? `Resultados de búsqueda para "${searchTerm}" (${filteredList.length})` : `${filterLabel} (${filteredList.length})`}
                                                {selectedCategory && !cleanSearchQuery ? ` — ${t.categories[selectedCategory as keyof typeof t.categories] || (selectedCategory === 'PR' ? 'Procesados' : selectedCategory)}` : ''}
                                            </h4>

                                            {isLoadingCategory || (cleanSearchQuery.length >= 2 && isSearching && filteredList.length === 0) ? (
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.b2b.dashboard.loadingItems}</p>
                                            ) : filteredList.length > 0 ? (
                                                <div className="mobile-grid-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
                                                    {filteredList.map(p => (
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
                                                            <div style={{ padding: '0.85rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                                                <div>
                                                                    <h5 style={{ margin: '0 0 0.35rem', fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.01em', lineHeight: '1.2' }}>
                                                                        {locale === 'en' ? (p.name_en || p.name) : p.name}
                                                                    </h5>
                                                                </div>

                                                                <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
                                                                    {agreementPricesMap[p.id] !== undefined ? (
                                                                        <div>
                                                                            <span style={{ display: 'block', fontSize: '0.95rem', fontWeight: '900', color: 'var(--primary)' }}>
                                                                                ${formatPrice(agreementPricesMap[p.id])} / {p.unit_of_measure}
                                                                            </span>
                                                                            <span style={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '3px',
                                                                                fontSize: '0.65rem',
                                                                                fontWeight: '800',
                                                                                color: '#065F46',
                                                                                backgroundColor: '#D1FAE5',
                                                                                padding: '2px 6px',
                                                                                borderRadius: '4px',
                                                                                marginTop: '3px'
                                                                            }}>
                                                                                <Tag size={10} strokeWidth={2.5} /> Precio de acuerdo
                                                                            </span>
                                                                        </div>
                                                                    ) : (
                                                                        <div>
                                                                            <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: '800', color: '#475569' }}>
                                                                                ${formatPrice(p.base_price || 0)} / {p.unit_of_measure}
                                                                            </span>
                                                                            <span style={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '3px',
                                                                                fontSize: '0.64rem',
                                                                                fontWeight: '700',
                                                                                color: '#475569',
                                                                                backgroundColor: '#F1F5F9',
                                                                                border: '1px solid #E2E8F0',
                                                                                padding: '2px 6px',
                                                                                borderRadius: '4px',
                                                                                marginTop: '3px'
                                                                            }}>
                                                                                <Info size={10} strokeWidth={2.5} /> Fuera de convenio
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                                                    <p style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                                                        {cleanSearchQuery ? `No se encontraron productos para "${searchTerm}"` : t.b2b.dashboard.noProducts}
                                                    </p>
                                                    {cleanSearchQuery && (
                                                        <button
                                                            onClick={() => { setSearchTerm(''); setAgreementFilter('all'); setSelectedCategory(null); }}
                                                            style={{
                                                                marginTop: '0.75rem',
                                                                padding: '0.4rem 0.9rem',
                                                                backgroundColor: '#F1F5F9',
                                                                color: '#475569',
                                                                border: '1px solid #CBD5E1',
                                                                borderRadius: '8px',
                                                                fontSize: '0.8rem',
                                                                fontWeight: '700',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            Limpiar búsqueda y ver todo
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Order Summary / Cart */}
                        <div className="b2b-cart-sidebar">
                            <div style={{
                                backgroundColor: THEME.colors.surface,
                                borderRadius: THEME.radius.lg,
                                boxShadow: THEME.shadow.md,
                                border: `1px solid ${THEME.colors.border}`,
                                overflow: 'hidden',
                            }}>
                                {/* Cart Header — Ultra-Compact Single Row */}
                                <div className="b2b-sticky-cart-header" style={{
                                    backgroundColor: '#F8FAFC',
                                    padding: '0.75rem 1.25rem',
                                    borderBottom: `1px solid ${THEME.colors.border}`,
                                    borderRadius: `${THEME.radius.lg} ${THEME.radius.lg} 0 0`,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {/* Title */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                                        </div>

                                        {/* Right Header Action Controls: Info & Trash */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <button
                                                onClick={() => setIsHelpModalOpen(true)}
                                                title="¿Cómo funciona la autogestión de pedidos recurrentes?"
                                                style={{
                                                    padding: '0.35rem 0.55rem',
                                                    borderRadius: THEME.radius.md,
                                                    border: '1px solid #CBD5E1',
                                                    background: '#F1F5F9',
                                                    color: 'var(--primary)',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '800',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <HelpCircle size={15} strokeWidth={2.2} />
                                                <span>¿Cómo funciona?</span>
                                            </button>

                                            {orderItems.length > 0 && (
                                                <button
                                                    onClick={handleClearOrder}
                                                    title="Borrar todo el pedido y empezar de cero"
                                                    style={{
                                                        padding: '0.35rem 0.45rem',
                                                        borderRadius: THEME.radius.md,
                                                        border: '1px solid #FCA5A5',
                                                        background: '#FEF2F2',
                                                        color: '#DC2626',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <Trash2 size={15} strokeWidth={2} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Historical Orders Pills Bar with ONLY Lucide Clock Icon */}
                                    {historicalOrders.length > 0 && (
                                        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #E2E8F0' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                                                    <Clock size={12} strokeWidth={2} /> Repetir Pedido:
                                                </span>
                                                <div style={{ display: 'flex', gap: '0.3rem', flex: 1, overflowX: 'auto' }}>
                                                    {historicalOrders.map((ord, idx) => {
                                                        const isSelected = selectedHistoricalOrderId === ord.id;
                                                        const dateStr = ord.created_at ? new Date(ord.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '';
                                                        return (
                                                            <button
                                                                key={ord.id}
                                                                onClick={() => {
                                                                    setSelectedHistoricalOrderId(ord.id);
                                                                    applyHistoricalOrderToCart(ord);
                                                                }}
                                                                style={{
                                                                    flex: '1 0 auto',
                                                                    padding: '0.2rem 0.5rem',
                                                                    borderRadius: THEME.radius.md,
                                                                    border: isSelected ? '1.5px solid var(--primary)' : '1px solid #CBD5E1',
                                                                    backgroundColor: isSelected ? '#ECFDF5' : 'white',
                                                                    color: isSelected ? 'var(--primary)' : '#334155',
                                                                    cursor: 'pointer',
                                                                    textAlign: 'center',
                                                                    transition: 'all 0.2s',
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: isSelected ? '800' : '600',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}
                                                            >
                                                                <span style={{ fontFamily: 'monospace', fontWeight: '800' }}>#{ord.sequence_id || ord.sequence_number || (historicalOrders.length - idx)}</span>
                                                                {dateStr && <span style={{ fontSize: '0.65rem', color: isSelected ? 'var(--primary)' : '#64748B' }}>({dateStr})</span>}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Cart Item Sorting Control Switcher Bar */}
                                {orderItems.length > 1 && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.45rem 1.25rem',
                                        backgroundColor: '#F1F5F9',
                                        borderBottom: '1px solid #E2E8F0',
                                        fontSize: '0.72rem'
                                    }}>
                                        <span style={{ fontWeight: '800', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Layers size={13} style={{ color: 'var(--primary)' }} /> Ordenar insumos:
                                        </span>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button
                                                onClick={() => setCartSortOrder('newest')}
                                                title="Mostrar al inicio los insumos recién agregados al pedido"
                                                style={{
                                                    padding: '0.2rem 0.55rem',
                                                    borderRadius: '6px',
                                                    border: cartSortOrder === 'newest' ? '1.5px solid var(--primary)' : '1px solid #CBD5E1',
                                                    backgroundColor: cartSortOrder === 'newest' ? 'var(--primary)' : 'white',
                                                    color: cartSortOrder === 'newest' ? 'white' : '#475569',
                                                    fontSize: '0.68rem',
                                                    fontWeight: cartSortOrder === 'newest' ? '900' : '700',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <Zap size={11} strokeWidth={2.2} /> Último ingresado
                                            </button>
                                            <button
                                                onClick={() => setCartSortOrder('oldest')}
                                                title="Mostrar al inicio los primeros insumos agregados"
                                                style={{
                                                    padding: '0.2rem 0.55rem',
                                                    borderRadius: '6px',
                                                    border: cartSortOrder === 'oldest' ? '1.5px solid var(--primary)' : '1px solid #CBD5E1',
                                                    backgroundColor: cartSortOrder === 'oldest' ? 'var(--primary)' : 'white',
                                                    color: cartSortOrder === 'oldest' ? 'white' : '#475569',
                                                    fontSize: '0.68rem',
                                                    fontWeight: cartSortOrder === 'oldest' ? '900' : '700',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <History size={11} strokeWidth={2.2} /> Primero ingresado
                                            </button>
                                            <button
                                                onClick={() => setCartSortOrder('alpha')}
                                                title="Ordenar alfabéticamente de la A a la Z"
                                                style={{
                                                    padding: '0.2rem 0.55rem',
                                                    borderRadius: '6px',
                                                    border: cartSortOrder === 'alpha' ? '1.5px solid var(--primary)' : '1px solid #CBD5E1',
                                                    backgroundColor: cartSortOrder === 'alpha' ? 'var(--primary)' : 'white',
                                                    color: cartSortOrder === 'alpha' ? 'white' : '#475569',
                                                    fontSize: '0.68rem',
                                                    fontWeight: cartSortOrder === 'alpha' ? '900' : '700',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <ArrowDownAZ size={11} strokeWidth={2.2} /> A-Z
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Items List */}
                                {orderItems.length > 0 ? (
                                    <div className="b2b-cart-items-wrapper" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                                        <div style={{ flex: 1, overflowY: 'auto' }}>
                                            {displayedCartItems.map((item) => {
                                                const uPrice = Number(item.unit_price ?? agreementPricesMap[item.product_id] ?? item.base_price ?? 0);
                                                const itemSubtotal = item.quantity * uPrice;

                                                // Smart Order Intelligence calculations
                                                const pastPurchases = historicalOrders.flatMap(o => o.order_items || o.items || []).filter((i: any) => (i.product_id && i.product_id === item.product_id) || (i.product_name && i.product_name === item.product_name));
                                                const isNewItem = pastPurchases.length === 0;
                                                const totalQtyBought = pastPurchases.reduce((acc: number, curr: any) => acc + Number(curr.quantity || 0), 0);
                                                const avgQtyBought = pastPurchases.length > 0 ? (totalQtyBought / pastPurchases.length) : 0;
                                                const isUnusualQty = pastPurchases.length > 0 && item.quantity > (avgQtyBought * 3.0);

                                                return (
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
                                                                <div>
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
                                                                    
                                                                    {/* Soft Warning Badges with Lucide React Icons */}
                                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                                        {isNewItem && (
                                                                            <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#6D28D9', backgroundColor: '#F3E8FF', padding: '2px 6px', borderRadius: '4px', border: '1px solid #DDD6FE', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                                <Sparkles size={11} strokeWidth={2} /> Insumo Nuevo
                                                                            </span>
                                                                        )}
                                                                        {isUnusualQty && (
                                                                            <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#92400E', backgroundColor: '#FEF3C7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #FDE68A', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title={`Promedio histórico: ~${avgQtyBought.toFixed(1)} ${item.unit}`}>
                                                                                <AlertTriangle size={11} strokeWidth={2} /> Cantidad Inusual (Sueles pedir ~{Math.round(avgQtyBought)} {item.unit})
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
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
                                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                                                                        ${formatPrice(uPrice)} / {item.unit}
                                                                    </span>
                                                                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--primary)' }}>
                                                                        Total: ${formatPrice(itemSubtotal)}
                                                                    </span>
                                                                </div>

                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#F8FAFC', padding: '2px 4px', borderRadius: '8px', border: '1px solid #CBD5E1', flexShrink: 0 }}>
                                                                     <button
                                                                         onClick={() => {
                                                                             const current = item.quantity;
                                                                             const next = Math.max(0, Math.round((current - 1) * 10) / 10);
                                                                             updateQuantity(item.id, next);
                                                                         }}
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
                                                                             fontWeight: '900',
                                                                             color: 'var(--text-main)',
                                                                             boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                                         }}
                                                                     >−</button>
                                                                     
                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '0 2px' }}>
                                                                         <input
                                                                             type="text"
                                                                             inputMode="decimal"
                                                                             value={itemInputs[item.id] !== undefined ? itemInputs[item.id] : String(item.quantity).replace('.', ',')}
                                                                             onChange={(e) => {
                                                                                 const val = e.target.value.replace(/[^0-9.,]/g, '').replace('.', ',');
                                                                                 setItemInputs(prev => ({ ...prev, [item.id]: val }));
                                                                                 const num = parseFloat(val.replace(',', '.'));
                                                                                 if (!isNaN(num) && num >= 0) {
                                                                                     updateQuantity(item.id, num);
                                                                                 }
                                                                             }}
                                                                             onBlur={() => {
                                                                                 const currentStr = itemInputs[item.id] !== undefined ? itemInputs[item.id] : String(item.quantity).replace('.', ',');
                                                                                 const num = parseFloat(currentStr.replace(',', '.')) || 0;
                                                                                 updateQuantity(item.id, num);
                                                                                 setItemInputs(prev => {
                                                                                     const copy = { ...prev };
                                                                                     delete copy[item.id];
                                                                                     return copy;
                                                                                 });
                                                                             }}
                                                                             style={{
                                                                                 width: '46px',
                                                                                 border: 'none',
                                                                                 textAlign: 'center',
                                                                                 fontWeight: '900',
                                                                                 fontSize: '0.85rem',
                                                                                 color: 'var(--primary)',
                                                                                 fontFamily: 'var(--font-outfit), sans-serif',
                                                                                 outline: 'none',
                                                                                 backgroundColor: 'transparent'
                                                                             }}
                                                                         />
                                                                         <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748B', paddingRight: '2px' }}>{item.unit}</span>
                                                                     </div>

                                                                     <button
                                                                         onClick={() => {
                                                                             const current = item.quantity;
                                                                             const next = Math.round((current + 1) * 10) / 10;
                                                                             updateQuantity(item.id, next);
                                                                         }}
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
                                                                             boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                                                             fontWeight: '900'
                                                                         }}
                                                                     >+</button>
                                                                 </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Total Summary */}
                                        <div style={{
                                            padding: '1rem 1.25rem',
                                            borderTop: '1px solid #E2E8F0',
                                            backgroundColor: '#F8FAFC',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <span style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)' }}>Total Subtotal:</span>
                                            <span style={{ fontSize: '1.1rem', fontWeight: '900', color: 'var(--primary)' }}>
                                                ${formatPrice(orderItems.reduce((acc, i) => acc + (Number(i.quantity || 0) * Number(i.unit_price ?? agreementPricesMap[i.product_id] ?? i.base_price ?? 0)), 0))}
                                            </span>
                                        </div>

                                        {/* Submit Button Section */}
                                        <div style={{ padding: '1rem 1.25rem', textAlign: 'center', backgroundColor: '#F9FAFB', borderRadius: `0 0 ${THEME.radius.lg} ${THEME.radius.lg}` }}>
                                            {orderItems.filter(i => i.quantity > 0).length === 0 && (
                                                <p style={{ 
                                                    color: '#DC2626', 
                                                    fontSize: '0.8rem', 
                                                    fontWeight: '600',
                                                    marginBottom: '0.75rem',
                                                    backgroundColor: '#FEF2F2',
                                                    padding: '0.5rem',
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
                                                    fontSize: '1rem',
                                                    padding: '0.75rem',
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
                                                        <ShoppingCart size={18} strokeWidth={2.5} /> {t.b2b.dashboard.finishOrder}
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
                                padding: '0.85rem 1.25rem',
                                height: '124px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem',
                                border: '1px solid var(--border)',
                                boxShadow: 'var(--shadow-sm)'
                            }}>
                                <div>
                                    <h3 style={{ 
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        fontSize: '0.95rem', 
                                        fontWeight: '800', 
                                        margin: 0, 
                                        color: 'var(--text-main)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}>
                                        <Smile size={18} color="var(--primary)" strokeWidth={2.5} /> {t.b2b.dashboard.specialReqTitle}
                                    </h3>
                                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                                        {t.b2b.dashboard.specialReqDesc}
                                    </p>
                                </div>
                                <a
                                    href={`https://wa.me/573015421761?text=${encodeURIComponent(`Hola Servicio al Cliente (Investments Cortés SAS), requiero asistencia comercial para la cuenta ${activeProfile?.company_name || activeProfile?.contact_name || profile?.company_name || 'B2B'} en FruFresco.`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
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
                                        padding: '0.55rem 1.25rem',
                                        borderRadius: 'var(--radius-full)',
                                        fontSize: '0.8rem',
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        boxShadow: '0 4px 10px rgba(7, 94, 84, 0.15)'
                                    }}
                                >
                                    {t.b2b.dashboard.whatsappBtn}
                                </a>
                            </div>
                        </div>
                    </div>
                </>
                )}

                {/* INVOICES TAB */}
                {activeTab === 'invoices' && (
                    <div className="b2b-responsive-card" style={{
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
                                                <td style={{ padding: '1rem', borderRadius: '12px 0 0 12px', fontWeight: '800', color: 'var(--text-main)', fontFamily: 'monospace' }}>
                                                    #{inv.sequence_id ? `PED-${inv.sequence_id}` : inv.id.substring(0, 8).toUpperCase()}
                                                </td>
                                                <td style={{ padding: '1rem', color: '#64748B', fontWeight: '600', fontSize: '0.85rem' }}>
                                                    {new Date(inv.created_at).toLocaleDateString(locale === 'es' ? 'es-CO' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td style={{ padding: '1rem', fontWeight: '900', color: 'var(--primary)', fontSize: '0.95rem' }}>
                                                    ${formatPrice(inv.total || inv.subtotal || inv.total_amount || 0)}
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <span style={{
                                                        padding: '0.35rem 0.75rem',
                                                        borderRadius: 'var(--radius-full)',
                                                        fontSize: '0.72rem',
                                                        fontWeight: '800',
                                                        textTransform: 'uppercase',
                                                        backgroundColor: inv.status === 'delivered' ? '#DCFCE7' : inv.status === 'pending' || inv.status === 'pending_approval' ? '#FEF3C7' : '#F1F5F9',
                                                        color: inv.status === 'delivered' ? '#166534' : inv.status === 'pending' || inv.status === 'pending_approval' ? '#92400E' : '#475569'
                                                    }}>
                                                        {inv.status === 'delivered' ? t.b2b.dashboard.delivered : inv.status === 'pending' || inv.status === 'pending_approval' ? 'Pendiente' : inv.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem', borderRadius: '0 12px 12px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <button 
                                                        onClick={() => {
                                                            setSelectedInvoiceOrder(inv);
                                                            setIsInvoiceModalOpen(true);
                                                        }}
                                                        style={{
                                                            padding: '0.4rem 0.85rem',
                                                            borderRadius: THEME.radius.md,
                                                            border: '1px solid #93C5FD',
                                                            backgroundColor: '#EFF6FF',
                                                            color: '#1D4ED8',
                                                            fontWeight: '800',
                                                            cursor: 'pointer',
                                                            fontSize: '0.78rem',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            marginRight: '0.5rem',
                                                            transition: 'all 0.2s',
                                                            boxShadow: '0 1px 3px rgba(37, 99, 235, 0.1)'
                                                        }}
                                                    >
                                                        <Eye size={14} strokeWidth={2.2} /> Ver / Imprimir
                                                    </button>

                                                    <button 
                                                        onClick={() => {
                                                            setSelectedOrderForNovelty(inv);
                                                            setIsReportNoveltyOpen(true);
                                                        }}
                                                        style={{
                                                            padding: '0.4rem 0.85rem',
                                                            borderRadius: THEME.radius.md,
                                                            border: '1px solid #FDE68A',
                                                            backgroundColor: '#FFFBEB',
                                                            color: '#B45309',
                                                            fontWeight: '800',
                                                            cursor: 'pointer',
                                                            fontSize: '0.78rem',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            marginRight: '0.5rem',
                                                            transition: 'all 0.2s',
                                                            boxShadow: '0 1px 3px rgba(217, 119, 6, 0.1)'
                                                        }}
                                                        title="Reportar avería, producto en mal estado o faltante de entrega"
                                                    >
                                                        <AlertTriangle size={14} strokeWidth={2.2} /> Reportar Novedad
                                                    </button>

                                                    <button 
                                                        onClick={() => {
                                                            applyHistoricalOrderToCart(inv);
                                                            setActiveTab('order');
                                                        }}
                                                        style={{
                                                            padding: '0.4rem 0.85rem',
                                                            borderRadius: THEME.radius.md,
                                                            border: '1px solid #A7F3D0',
                                                            backgroundColor: '#ECFDF5',
                                                            color: 'var(--primary)',
                                                            fontWeight: '800',
                                                            cursor: 'pointer',
                                                            fontSize: '0.78rem',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            transition: 'all 0.2s',
                                                            boxShadow: '0 1px 3px rgba(13, 122, 87, 0.1)'
                                                        }}
                                                    >
                                                        <RotateCcw size={14} strokeWidth={2.2} /> Re-pedir
                                                    </button>
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
                    <div className="b2b-responsive-card" style={{
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
                                        padding: '0.5rem 0.85rem',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.78rem',
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
                                        padding: '0.5rem 0.85rem',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.78rem',
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
                                <button
                                    onClick={() => setConsumptionTimeRange('all')}
                                    style={{
                                        padding: '0.5rem 0.85rem',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.78rem',
                                        fontWeight: '800',
                                        border: 'none',
                                        backgroundColor: consumptionTimeRange === 'all' ? 'white' : 'transparent',
                                        color: consumptionTimeRange === 'all' ? 'var(--primary)' : 'var(--text-muted)',
                                        cursor: 'pointer',
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        boxShadow: consumptionTimeRange === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {locale === 'en' ? 'All Time History' : 'Histórico Completo'}
                                </button>
                            </div>
                        </div>

                        {isLoadingConsumption ? (
                            <div style={{ padding: '4rem', textAlign: 'center' }}>
                                <div className="spinner" style={{ margin: '0 auto 1.5rem' }}></div>
                                <p style={{ color: 'var(--text-muted)', fontWeight: '600' }}>{t.b2b.dashboard.calculating}</p>
                            </div>
                        ) : (consumptionData.length > 0 || consumptionKpis.totalCop > 0) ? (
                            <>
                                {/* 4 KEY KPI CARDS */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
                                    {/* 1. Total Invertido */}
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1.25rem 1.5rem', borderRadius: '16px', border: '1px solid #E2E8F0', position: 'relative', overflow: 'hidden' }}>
                                        <div style={{ position: 'absolute', right: '-10px', top: '-10px', opacity: 0.08, color: 'var(--primary)' }}>
                                            <ShoppingCart size={90} />
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {locale === 'en' ? 'Total Spent' : 'Total Gasto (COP)'}
                                        </p>
                                        <h3 style={{ margin: '0.4rem 0 0', fontSize: '1.6rem', fontWeight: '900', color: 'var(--primary)', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            ${Math.round(consumptionKpis.totalCop).toLocaleString(locale === 'en' ? 'en-US' : 'es-CO')}
                                        </h3>
                                        <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '600', marginTop: '4px', display: 'block' }}>
                                             Pedidos del cliente activo
                                        </span>
                                    </div>

                                    {/* 2. Volumen Total */}
                                    <div style={{ backgroundColor: '#EFF6FF', padding: '1.25rem 1.5rem', borderRadius: '16px', border: '1px solid #BFDBFE', position: 'relative', overflow: 'hidden' }}>
                                        <div style={{ position: 'absolute', right: '-10px', top: '-10px', opacity: 0.1, color: '#1E40AF' }}>
                                            <Package size={90} />
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: '800', color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {locale === 'en' ? 'Total Volume' : 'Volumen Total'}
                                        </p>
                                        <h3 style={{ margin: '0.4rem 0 0', fontSize: '1.6rem', fontWeight: '900', color: '#1D4ED8', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            ${Math.round(consumptionKpis.totalKg).toLocaleString(locale === 'en' ? 'en-US' : 'es-CO')} Kg
                                        </h3>
                                        <span style={{ fontSize: '0.72rem', color: '#3B82F6', fontWeight: '700', marginTop: '4px', display: 'block' }}>
                                            ⚖ Peso total abastecido
                                        </span>
                                    </div>

                                    {/* 3. Ahorro Estimado por Convenio (DESTACADO) */}
                                    <div style={{ backgroundColor: '#ECFDF5', padding: '1.25rem 1.5rem', borderRadius: '16px', border: '1.5px solid #6EE7B7', position: 'relative', overflow: 'hidden' }}>
                                        <div style={{ position: 'absolute', right: '-10px', top: '-10px', opacity: 0.12, color: '#047857' }}>
                                            <Tag size={90} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: '800', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                {locale === 'en' ? 'Agreement Savings' : 'Ahorro por Convenio'}
                                            </p>
                                            <span style={{ backgroundColor: '#10B981', color: 'white', fontSize: '0.62rem', fontWeight: '900', padding: '1px 6px', borderRadius: '8px' }}>
                                                GARANTIZADO
                                            </span>
                                        </div>
                                        <h3 style={{ margin: '0.4rem 0 0', fontSize: '1.6rem', fontWeight: '900', color: '#047857', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            ${Math.round(consumptionKpis.totalSavingsCop).toLocaleString(locale === 'en' ? 'en-US' : 'es-CO')}
                                        </h3>
                                        <span style={{ fontSize: '0.72rem', color: '#065F46', fontWeight: '700', marginTop: '4px', display: 'block' }}>
                                            � Descuento vs precio base general
                                        </span>
                                    </div>

                                    {/* 4. Precio Promedio por Kg */}
                                    <div style={{ backgroundColor: '#FFFBEB', padding: '1.25rem 1.5rem', borderRadius: '16px', border: '1px solid #FDE68A', position: 'relative', overflow: 'hidden' }}>
                                        <div style={{ position: 'absolute', right: '-10px', top: '-10px', opacity: 0.1, color: '#B45309' }}>
                                            <BarChart3 size={90} />
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: '800', color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {locale === 'en' ? 'Avg. Price / Kg' : 'Precio Promedio / Kg'}
                                        </p>
                                        <h3 style={{ margin: '0.4rem 0 0', fontSize: '1.6rem', fontWeight: '900', color: '#D97706', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            ${Math.round(consumptionKpis.avgPrice).toLocaleString(locale === 'en' ? 'en-US' : 'es-CO')}
                                        </h3>
                                        <span style={{ fontSize: '0.72rem', color: '#92400E', fontWeight: '600', marginTop: '4px', display: 'block' }}>
                                             Eficiencia de compra promedio
                                        </span>
                                    </div>
                                </div>

                                {/* HYBRID COMBO CHART: BARS (SPENDING COP) + LINE (VOLUME KG) */}
                                {consumptionHistory.length > 0 && (
                                    <div style={{
                                        backgroundColor: '#FFFFFF',
                                        borderRadius: 'var(--radius-lg)',
                                        padding: '1.75rem',
                                        border: '1px solid var(--border)',
                                        boxShadow: '0 4px 20px -5px rgba(0,0,0,0.04)',
                                        marginBottom: '2.5rem'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-main)', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                    {locale === 'en' ? 'Invoicing ($ COP) & Volume (Kg) Efficiency' : 'Inversión por Despacho ($ COP) vs Volumen Suministrado (Kg)'}
                                                </h3>
                                                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B', fontWeight: '500' }}>
                                                    Analiza la relación entre el presupuesto ejecutado (Barras) y la masa de alimento abastecida (Línea de tendencia).
                                                </p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.75rem', fontWeight: '800', backgroundColor: '#F8FAFC', padding: '6px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'linear-gradient(180deg, #10B981 0%, #047857 100%)' }}></div>
                                                    <span style={{ color: '#047857' }}>{locale === 'en' ? 'Spent ($ COP)' : 'Gasto por Pedido ($ COP)'}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <div style={{ width: '12px', height: '3px', backgroundColor: '#2563EB', borderRadius: '2px' }}></div>
                                                    <span style={{ color: '#2563EB' }}>{locale === 'en' ? 'Volume (Kg)' : 'Tendencia Volumen (Kg)'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {(() => {
                                            const width = 850;
                                            const height = 230;
                                            const paddingLeft = 70;
                                            const paddingRight = 75;
                                            const paddingTop = 28;
                                            const paddingBottom = 38;

                                            const chartWidth = width - paddingLeft - paddingRight;
                                            const chartHeight = height - paddingTop - paddingBottom;

                                            const maxKg = Math.max(...consumptionHistory.map(d => d.kg), 10);
                                            const maxCop = Math.max(...consumptionHistory.map(d => d.cop), 10000);

                                            const barWidth = Math.min(34, (chartWidth / consumptionHistory.length) * 0.4);

                                            const points = consumptionHistory.map((d, index) => {
                                                const step = chartWidth / (consumptionHistory.length || 1);
                                                const x = paddingLeft + (index + 0.5) * step;
                                                const barHeight = (d.cop / maxCop) * chartHeight;
                                                const yBar = paddingTop + chartHeight - barHeight;
                                                const yKg = paddingTop + chartHeight - (d.kg / maxKg) * chartHeight;
                                                const pricePerKg = d.kg > 0 ? d.cop / d.kg : 0;
                                                return { x, yBar, barHeight, yKg, kg: d.kg, cop: d.cop, date: d.date, pricePerKg };
                                            });

                                            const pointsKgStr = points.map(p => `${p.x},${p.yKg}`).join(' ');

                                            // Compact Millions & Thousands Currency Formatter
                                            const formatCompactCOP = (val: number) => {
                                                if (val >= 1000000) {
                                                    const mVal = (val / 1000000).toFixed(1).replace('.', ',');
                                                    return '$' + (mVal.endsWith(',0') ? mVal.slice(0, -2) : mVal) + 'M';
                                                } else if (val >= 1000) {
                                                    return '$' + Math.round(val / 1000) + ' mil';
                                                }
                                                return '$' + Math.round(val);
                                            };

                                            return (
                                                <div style={{ width: '100%', overflowX: 'auto', position: 'relative' }}>
                                                    {/* Floating Glassmorphic Vertical Tooltip Card (Smart Clamped & Translucent) */}
                                                    {activeHoverPoint && (() => {
                                                        const leftPercent = Math.max(18, Math.min(82, (activeHoverPoint.x / width) * 100));
                                                        return (
                                                            <div style={{
                                                                position: 'absolute',
                                                                top: '12px',
                                                                left: `${leftPercent}%`,
                                                                transform: 'translateX(-50%)',
                                                                backgroundColor: 'rgba(255, 255, 255, 0.45)',
                                                                backdropFilter: 'blur(20px)',
                                                                WebkitBackdropFilter: 'blur(20px)',
                                                                color: '#0F172A',
                                                                padding: '0.75rem 1rem',
                                                                borderRadius: '14px',
                                                                boxShadow: '0 10px 30px 0 rgba(31, 38, 135, 0.12)',
                                                                zIndex: 40,
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '0.4rem',
                                                                fontSize: '0.8rem',
                                                                pointerEvents: 'none',
                                                                border: '1px solid rgba(255, 255, 255, 0.85)',
                                                                transition: 'left 0.18s ease-out',
                                                                minWidth: '195px'
                                                            }}>
                                                                <div style={{ fontWeight: '800', color: '#047857', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '0.3rem', fontSize: '0.82rem' }}>
                                                                    � Despacho: {activeHoverPoint.date}
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                                                                    <span style={{ color: '#64748B' }}>� Inversión:</span>
                                                                    <strong style={{ color: '#047857' }}>${Math.round(activeHoverPoint.cop).toLocaleString('es-CO')}</strong>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                                                                    <span style={{ color: '#64748B' }}>⚖ Masa:</span>
                                                                    <strong style={{ color: '#2563EB' }}>{Math.round(activeHoverPoint.kg).toLocaleString('es-CO')} Kg</strong>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                                                                    <span style={{ color: '#64748B' }}> Promedio:</span>
                                                                    <strong style={{ color: '#0F172A' }}>${Math.round(activeHoverPoint.pricePerKg).toLocaleString('es-CO')} / Kg</strong>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* SVG Canvas - 100% Clean Lines & Bars without text clutter */}
                                                    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', minWidth: '650px', display: 'block' }}>
                                                        <defs>
                                                            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="0%" stopColor="#10B981" stopOpacity="0.9" />
                                                                <stop offset="100%" stopColor="#047857" stopOpacity="0.95" />
                                                            </linearGradient>
                                                        </defs>

                                                        {/* Horizontal Grid lines */}
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
                                                                        strokeDasharray={i === 4 ? "none" : "4,4"}
                                                                    />
                                                                    {/* Left Axis: COP */}
                                                                    <text x={paddingLeft - 10} y={y + 3.5} textAnchor="end" style={{ fontSize: '9px', fill: '#047857', fontWeight: '700', fontFamily: 'Inter, sans-serif' }}>
                                                                        {formatCompactCOP(maxCop - (maxCop * ratio))}
                                                                    </text>
                                                                    {/* Right Axis: Kg (Formateado con punto de miles) */}
                                                                    <text x={width - paddingRight + 10} y={y + 3.5} textAnchor="start" style={{ fontSize: '9px', fill: '#2563EB', fontWeight: '700', fontFamily: 'Inter, sans-serif' }}>
                                                                        {Math.round(maxKg - (maxKg * ratio)).toLocaleString('es-CO')} Kg
                                                                    </text>
                                                                </g>
                                                            );
                                                        })}

                                                        {/* BARS: Spending COP (Clean Bars without text overlay) */}
                                                        {points.map((p, index) => {
                                                            const isHovered = activeHoverPoint?.date === p.date;
                                                            return (
                                                                <g key={`bar-${index}`}>
                                                                    <rect
                                                                        x={p.x - barWidth / 2}
                                                                        y={p.yBar}
                                                                        width={barWidth}
                                                                        height={Math.max(4, p.barHeight)}
                                                                        rx={4}
                                                                        fill="url(#barGradient)"
                                                                        opacity={isHovered ? 1 : 0.88}
                                                                        stroke={isHovered ? '#047857' : 'none'}
                                                                        strokeWidth={isHovered ? 2 : 0}
                                                                        style={{ transition: 'all 0.2s', cursor: 'pointer' }}
                                                                        onMouseEnter={() => setActiveHoverPoint(p)}
                                                                        onMouseLeave={() => setActiveHoverPoint(null)}
                                                                    />
                                                                </g>
                                                            );
                                                        })}

                                                        {/* OVERLAY LINE: Volume Kg (Thin Defined Line) */}
                                                        {points.length > 1 && (
                                                            <polyline
                                                                fill="none"
                                                                stroke="#2563EB"
                                                                strokeWidth={2.5}
                                                                points={pointsKgStr}
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                            />
                                                        )}

                                                        {/* LINE NODES (Clean Minimal Dots with Hover Area) */}
                                                        {points.map((p, index) => {
                                                            const isHovered = activeHoverPoint?.date === p.date;
                                                            return (
                                                                <g key={`point-${index}`} style={{ cursor: 'pointer' }} onMouseEnter={() => setActiveHoverPoint(p)} onMouseLeave={() => setActiveHoverPoint(null)}>
                                                                    {/* Outer pulse ring on hover */}
                                                                    {isHovered && (
                                                                        <circle cx={p.x} cy={p.yKg} r={9} fill="#3B82F6" opacity={0.25} />
                                                                    )}
                                                                    <circle cx={p.x} cy={p.yKg} r={isHovered ? 6 : 4.5} fill="#2563EB" stroke="white" strokeWidth={2} />

                                                                    {/* Invisible Hover Overlay Trigger */}
                                                                    <rect
                                                                        x={p.x - (chartWidth / points.length) / 2}
                                                                        y={paddingTop}
                                                                        width={chartWidth / points.length}
                                                                        height={chartHeight}
                                                                        fill="transparent"
                                                                        style={{ cursor: 'pointer' }}
                                                                    />

                                                                    {/* Date Label on X Axis */}
                                                                    <text x={p.x} y={height - 8} textAnchor="middle" style={{ fontSize: '9.5px', fill: isHovered ? '#0F172A' : '#475569', fontWeight: isHovered ? '800' : '600', fontFamily: 'Inter, sans-serif' }}>
                                                                        {p.date}
                                                                    </text>
                                                                </g>
                                                            );
                                                        })}
                                                    </svg>
                                                </div>
                                            );
                                        })()}

                                        {/* Executive Procurement Summary Banner */}
                                        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#ECFDF5', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                                                    �
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#0F172A' }}>Análisis de Eficiencia de Compra</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                                        El costo promedio general ponderado es de <strong style={{ color: '#047857' }}>${Math.round(consumptionKpis.avgPrice).toLocaleString('es-CO')} / Kg</strong> en los últimos despachos.
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ fontSize: '0.75rem', backgroundColor: '#F8FAFC', padding: '6px 12px', borderRadius: '6px', border: '1px solid #E2E8F0', color: '#475569', fontWeight: '700' }}>
                                                � Ritmo de Compra: <span style={{ color: '#2563EB' }}>Cada 6.2 días</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                        {/* Frequently Ordered Products List - Clean & Executive UI */}
                                        <div style={{ marginTop: '2.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                                                <div>
                                                    <h3 style={{ 
                                                        margin: 0, 
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
                                                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                                        Ranking de insumos recurrentes con opción de re-pedido en 1 clic hacia tu carrito.
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                                {consumptionData.map((item, index) => {
                                                    const rawQty = quickAddQuantities[item.id] !== undefined ? String(quickAddQuantities[item.id]) : '1';
                                                    return (
                                                        <div key={item.id} style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            backgroundColor: '#FFFFFF',
                                                            borderRadius: '12px',
                                                            padding: '0.85rem 1.25rem',
                                                            border: '1px solid #E2E8F0',
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                                            flexWrap: 'wrap',
                                                            gap: '1rem',
                                                            transition: 'all 0.15s ease-in-out'
                                                        }}>
                                                            {/* Ranking badge + Product image + Name */}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1.2, minWidth: '240px' }}>
                                                                <div style={{
                                                                    width: '26px',
                                                                    height: '26px',
                                                                    borderRadius: '50%',
                                                                    backgroundColor: index === 0 ? '#FEF3C7' : index === 1 ? '#F1F5F9' : index === 2 ? '#E0F2FE' : '#F8FAFC',
                                                                    color: index === 0 ? '#B45309' : index === 1 ? '#475569' : index === 2 ? '#0369A1' : '#64748B',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: '900',
                                                                    border: '1px solid rgba(0,0,0,0.06)'
                                                                }}>
                                                                    {index + 1}
                                                                </div>
                                                                <div style={{ width: '42px', height: '42px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', flexShrink: 0 }}>
                                                                    {item.image && <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                                                </div>
                                                                <div>
                                                                    <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: '800', color: '#0F172A', letterSpacing: '-0.01em' }}>{item.name}</h4>
                                                                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.15rem' }}>
                                                                        Acumulado: <strong style={{ color: '#047857', fontWeight: '800' }}>{Math.round(item.totalQuantity).toLocaleString('es-CO')} {item.unit}</strong>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Frequency metric bar */}
                                                            <div style={{ flex: 1, minWidth: '160px', padding: '0 0.5rem' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.72rem', color: '#64748B', fontWeight: '600' }}>
                                                                    <span>{t.b2b.dashboard.frequency}</span>
                                                                    <strong style={{ color: '#0F172A' }}>{item.ordersCount} {t.b2b.dashboard.ordersLabel}</strong>
                                                                </div>
                                                                <div style={{ height: '5px', backgroundColor: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                                                                    <div style={{ 
                                                                        width: `${Math.min(100, (item.ordersCount / (historicalOrders.length || 1)) * 100)}%`, 
                                                                        height: '100%', 
                                                                        backgroundColor: '#10B981',
                                                                        borderRadius: '3px'
                                                                    }}></div>
                                                                </div>
                                                            </div>

                                                            {/* Quick purchase action button with Decimal Comma support */}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#F8FAFC', overflow: 'hidden' }}>
                                                                    <button
                                                                        onClick={() => {
                                                                            const num = parseFloat(rawQty.replace(',', '.')) || 1;
                                                                            const next = Math.max(0.5, Math.round((num - 1) * 10) / 10);
                                                                            setQuickAddQuantities(prev => ({ ...prev, [item.id]: String(next).replace('.', ',') }));
                                                                        }}
                                                                        style={{ border: 'none', background: 'none', padding: '0.3rem 0.55rem', fontWeight: '900', cursor: 'pointer', color: '#64748B', fontSize: '0.85rem' }}
                                                                    >-</button>
                                                                    <input
                                                                        type="text"
                                                                        inputMode="decimal"
                                                                        value={rawQty}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value.replace(/[^0-9.,]/g, '').replace('.', ',');
                                                                            setQuickAddQuantities(prev => ({ ...prev, [item.id]: val }));
                                                                        }}
                                                                        onBlur={() => {
                                                                            const num = parseFloat(rawQty.replace(',', '.')) || 1;
                                                                            const formatted = String(num).replace('.', ',');
                                                                            setQuickAddQuantities(prev => ({ ...prev, [item.id]: formatted }));
                                                                        }}
                                                                        style={{ width: '48px', border: 'none', textAlign: 'center', fontSize: '0.82rem', fontWeight: '800', color: '#0F172A', outline: 'none', backgroundColor: 'transparent' }}
                                                                    />
                                                                    <button
                                                                        onClick={() => {
                                                                            const num = parseFloat(rawQty.replace(',', '.')) || 1;
                                                                            const next = Math.round((num + 1) * 10) / 10;
                                                                            setQuickAddQuantities(prev => ({ ...prev, [item.id]: String(next).replace('.', ',') }));
                                                                        }}
                                                                        style={{ border: 'none', background: 'none', padding: '0.3rem 0.55rem', fontWeight: '900', cursor: 'pointer', color: '#64748B', fontSize: '0.85rem' }}
                                                                    >+</button>
                                                                </div>
                                                                
                                                                <button
                                                                    onClick={() => {
                                                                        const numericQty = parseFloat(rawQty.replace(',', '.')) || 1;
                                                                        handleQuickAdd(item.product, numericQty);
                                                                    }}
                                                                    style={{
                                                                        padding: '0.45rem 0.9rem',
                                                                        backgroundColor: '#047857',
                                                                        color: 'white',
                                                                        borderRadius: '8px',
                                                                        border: 'none',
                                                                        fontSize: '0.78rem',
                                                                        fontWeight: '800',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '5px',
                                                                        boxShadow: '0 2px 4px rgba(4, 120, 87, 0.15)',
                                                                        transition: 'background-color 0.15s'
                                                                    }}
                                                                >
                                                                    <span></span> {locale === 'en' ? '+ Add to order' : '+ Agregar al pedido'}
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
                    </div>
                )}

                {/* AGREEMENTS TAB */}
                {activeTab === 'agreements' && (
                    <div className="b2b-responsive-card" style={{
                        backgroundColor: 'white',
                        borderRadius: 'var(--radius-lg)',
                        padding: '2rem',
                        boxShadow: 'var(--shadow-lg)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
                            <div>
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
                                    <Rocket size={26} color="var(--primary)" /> {t.b2b.dashboard.agreementsTitle}
                                </h2>
                                <p style={{ color: 'var(--text-muted)', margin: '0.3rem 0 0', fontSize: '0.9rem', fontWeight: '500' }}>
                                    Precios fijos preferenciales negociados bajo convenio institucional para el cliente activo.
                                </p>
                            </div>

                            {/* Search bar inside agreements */}
                            {agreements.length > 0 && (
                                <div style={{ position: 'relative', minWidth: '240px' }}>
                                    <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', display: 'flex' }}>
                                        <Search size={14} strokeWidth={2} />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Buscar en insumos del convenio..."
                                        value={agreementSearchTerm}
                                        onChange={(e) => setAgreementSearchTerm(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '0.45rem 1rem 0.45rem 2rem',
                                            borderRadius: THEME.radius.md,
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.82rem',
                                            fontWeight: '600',
                                            outline: 'none',
                                            backgroundColor: '#F8FAFC'
                                        }}
                                    />
                                </div>
                            )}
                        </div>

                        {isLoadingAgreements ? (
                            <div style={{ padding: '4rem', textAlign: 'center' }}>
                                <div className="spinner" style={{ margin: '0 auto 1.5rem' }}></div>
                                <p style={{ color: 'var(--text-muted)', fontWeight: '600' }}>{t.b2b.dashboard.loadingAgreements}</p>
                            </div>
                        ) : agreements.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {agreements.map((agreement) => {
                                    const items: any[] = agreement.quote_items || [];
                                    const filteredAgreementItems = items.filter(it => {
                                        const p = Array.isArray(it.products) ? it.products[0] : it.products;
                                        if (p && p.is_active === false) return false;
                                        if (!agreementSearchTerm) return true;
                                        const search = agreementSearchTerm.toLowerCase();
                                        const name = (it.product_name || p?.name || '').toLowerCase();
                                        const sku = (p?.sku || '').toLowerCase();
                                        return name.includes(search) || sku.includes(search);
                                    });

                                    const createdDateStr = agreement.created_at ? new Date(agreement.created_at).toLocaleDateString('es-CO') : '';
                                    const validDateStr = agreement.valid_until ? new Date(agreement.valid_until).toLocaleDateString('es-CO') : 'Renovación Automática';

                                    return (
                                        <div key={agreement.id} style={{
                                            border: '1px solid #E2E8F0',
                                            borderRadius: '20px',
                                            overflow: 'hidden',
                                            backgroundColor: '#FFFFFF',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                                        }}>
                                            {/* Agreement Summary Header Card */}
                                            <div style={{
                                                backgroundColor: '#F8FAFC',
                                                padding: '1.5rem',
                                                borderBottom: '1px solid #E2E8F0',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                flexWrap: 'wrap',
                                                gap: '1rem'
                                            }}>
                                                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                                                    <div style={{ 
                                                        width: '56px', 
                                                        height: '56px', 
                                                        backgroundColor: '#ECFDF5', 
                                                        borderRadius: '16px', 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        color: 'var(--primary)',
                                                        border: '1px solid #A7F3D0'
                                                    }}>
                                                        <Rocket size={28} />
                                                    </div>
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                            <span style={{ 
                                                                padding: '3px 10px',
                                                                borderRadius: '12px',
                                                                backgroundColor: '#D1FAE5',
                                                                color: '#065F46',
                                                                fontSize: '0.72rem',
                                                                fontWeight: '900',
                                                                textTransform: 'uppercase',
                                                                letterSpacing: '0.05em'
                                                            }}>
                                                                � ACUERDO VIGENTE Y ACTIVO
                                                            </span>
                                                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '700', fontFamily: 'monospace' }}>
                                                                Ref: #ACU-{agreement.quote_number || agreement.id.substring(0, 6)}
                                                            </span>
                                                        </div>
                                                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '900', color: 'var(--text-main)' }}>
                                                            {agreement.model_snapshot_name || agreement.pricing_models?.name || 'Acuerdo Comercial Institucional - FruFresco'}
                                                        </h3>
                                                        <div style={{ display: 'flex', gap: '1.25rem', marginTop: '6px', fontSize: '0.82rem', color: '#64748B', fontWeight: '600' }}>
                                                            <span>� Vigencia: <strong>{validDateStr}</strong></span>
                                                            <span> Portafolio en convenio: <strong style={{ color: 'var(--primary)' }}>{items.length} Insumos</strong></span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <Link
                                                        href={`/b2b/agreements/${agreement.id}/print`}
                                                        target="_blank"
                                                        style={{ textDecoration: 'none' }}
                                                    >
                                                        <button
                                                            className="btn-premium"
                                                            style={{
                                                                padding: '0.65rem 1.25rem',
                                                                borderRadius: THEME.radius.md,
                                                                backgroundColor: 'var(--primary)',
                                                                color: 'white',
                                                                fontWeight: '800',
                                                                fontSize: '0.85rem',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                border: 'none',
                                                                boxShadow: '0 4px 10px rgba(13, 122, 87, 0.2)'
                                                            }}
                                                        >
                                                            <Eye size={16} /> Ver / Descargar Documento Formal
                                                        </button>
                                                    </Link>
                                                </div>
                                            </div>

                                            {/* Products Table in Agreement - Formal B2B Executive Table */}
                                            <div style={{ padding: '1.5rem' }}>
                                                <h4 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: '800', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Tag size={16} color="var(--primary)" /> Insumos Incluidos en el Convenio Institucional ({filteredAgreementItems.length})
                                                </h4>

                                                {filteredAgreementItems.length > 0 ? (
                                                    <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '12px', backgroundColor: '#FFFFFF' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                            <thead>
                                                                <tr style={{ backgroundColor: '#F8FAFC', color: '#475569', textAlign: 'left', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.04em', borderBottom: '1px solid #E2E8F0' }}>
                                                                    <th style={{ padding: '0.75rem 1rem' }}>#</th>
                                                                    <th style={{ padding: '0.75rem 1rem' }}>Insumo / Producto</th>
                                                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Unidad</th>
                                                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Precio Lista Base</th>
                                                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Precio Pactado Convenio</th>
                                                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Descuento / Beneficio</th>
                                                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Acción de Re-Pedido</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {filteredAgreementItems.map((item: any, idx: number) => {
                                                                    const p = Array.isArray(item.products) ? item.products[0] : item.products;
                                                                    const name = item.product_name || p?.name || 'Producto';
                                                                    const unit = p?.unit_of_measure || 'Kg';
                                                                    const basePrice = Number(p?.base_price || 0);
                                                                    const uPrice = Number(item.unit_price || 0);
                                                                    const savings = basePrice > uPrice ? (basePrice - uPrice) : 0;
                                                                    const savingsPct = basePrice > 0 && savings > 0 ? ((savings / basePrice) * 100).toFixed(1) : 0;
                                                                    const itemKey = `agr_${agreement.id}_${item.id || idx}`;
                                                                    const rawQty = quickAddQuantities[itemKey] !== undefined ? String(quickAddQuantities[itemKey]) : '1';

                                                                    return (
                                                                        <tr key={itemKey} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                                                            <td style={{ padding: '0.75rem 1rem', color: '#64748B', fontWeight: '700' }}>{idx + 1}</td>
                                                                            <td style={{ padding: '0.75rem 1rem', color: '#0F172A', fontWeight: '800' }}>{name}</td>
                                                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#475569', fontWeight: '600' }}>{unit}</td>
                                                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#94A3B8', textDecoration: basePrice > uPrice ? 'line-through' : 'none', fontWeight: '600' }}>
                                                                                {basePrice > 0 ? `$${formatPrice(basePrice)}` : '-'}
                                                                            </td>
                                                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#047857', fontWeight: '900', fontSize: '0.92rem' }}>
                                                                                ${formatPrice(uPrice)} <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '600' }}>/ {unit}</span>
                                                                            </td>
                                                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                                                                {savings > 0 ? (
                                                                                    <span style={{ backgroundColor: '#D1FAE5', color: '#065F46', fontWeight: '800', fontSize: '0.75rem', padding: '3px 8px', borderRadius: '6px', display: 'inline-block' }}>
                                                                                        -${formatPrice(savings)} ({savingsPct}%)
                                                                                    </span>
                                                                                ) : (
                                                                                    <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Tarifa Especial</span>
                                                                                )}
                                                                            </td>
                                                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #CBD5E1', borderRadius: '6px', backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                const num = parseFloat(rawQty.replace(',', '.')) || 1;
                                                                                                const next = Math.max(0.5, Math.round((num - 1) * 10) / 10);
                                                                                                setQuickAddQuantities(prev => ({ ...prev, [itemKey]: String(next).replace('.', ',') }));
                                                                                            }}
                                                                                            style={{ border: 'none', background: 'none', padding: '0.25rem 0.45rem', fontWeight: '900', cursor: 'pointer', color: '#64748B', fontSize: '0.8rem' }}
                                                                                        >-</button>
                                                                                        <input
                                                                                            type="text"
                                                                                            inputMode="decimal"
                                                                                            value={rawQty}
                                                                                            onChange={(e) => {
                                                                                                const val = e.target.value.replace(/[^0-9.,]/g, '').replace('.', ',');
                                                                                                setQuickAddQuantities(prev => ({ ...prev, [itemKey]: val }));
                                                                                            }}
                                                                                            onBlur={() => {
                                                                                                const num = parseFloat(rawQty.replace(',', '.')) || 1;
                                                                                                const formatted = String(num).replace('.', ',');
                                                                                                setQuickAddQuantities(prev => ({ ...prev, [itemKey]: formatted }));
                                                                                            }}
                                                                                            style={{ width: '42px', border: 'none', textAlign: 'center', fontSize: '0.8rem', fontWeight: '800', color: '#0F172A', outline: 'none', backgroundColor: 'transparent' }}
                                                                                        />
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                const num = parseFloat(rawQty.replace(',', '.')) || 1;
                                                                                                const next = Math.round((num + 1) * 10) / 10;
                                                                                                setQuickAddQuantities(prev => ({ ...prev, [itemKey]: String(next).replace('.', ',') }));
                                                                                            }}
                                                                                            style={{ border: 'none', background: 'none', padding: '0.25rem 0.45rem', fontWeight: '900', cursor: 'pointer', color: '#64748B', fontSize: '0.8rem' }}
                                                                                        >+</button>
                                                                                    </div>

                                                                                    <button
                                                                                        onClick={() => {
                                                                                            const numericQty = parseFloat(rawQty.replace(',', '.')) || 1;
                                                                                            handleQuickAdd(p || { id: item.product_id, name, unit_of_measure: unit }, numericQty);
                                                                                        }}
                                                                                        style={{
                                                                                            padding: '0.35rem 0.75rem',
                                                                                            borderRadius: '6px',
                                                                                            border: 'none',
                                                                                            backgroundColor: '#047857',
                                                                                            color: 'white',
                                                                                            fontWeight: '800',
                                                                                            fontSize: '0.78rem',
                                                                                            cursor: 'pointer',
                                                                                            boxShadow: '0 2px 4px rgba(4, 120, 87, 0.15)'
                                                                                        }}
                                                                                    >
                                                                                        + Pedir
                                                                                    </button>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : (
                                                    <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0 }}>No se encontraron insumos que coincidan con la búsqueda.</p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            /* INSTITUTIONAL BANNER IF NO AGREEMENT */
                            <div style={{
                                backgroundColor: '#F8FAFC',
                                borderRadius: '24px',
                                padding: '3rem 2rem',
                                border: '1px solid #E2E8F0',
                                textAlign: 'center',
                                maxWidth: '800px',
                                margin: '0 auto'
                            }}>
                                <div style={{
                                    width: '72px',
                                    height: '72px',
                                    borderRadius: '50%',
                                    backgroundColor: '#ECFDF5',
                                    color: 'var(--primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 1.5rem',
                                    border: '1px solid #A7F3D0',
                                    boxShadow: '0 8px 16px rgba(13, 122, 87, 0.1)'
                                }}>
                                    <Rocket size={36} strokeWidth={2} />
                                </div>

                                <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900', color: '#0F172A', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                    Potencia el Abastecimiento Institucional de tu Negocio
                                </h3>

                                <p style={{ color: '#64748B', fontSize: '0.95rem', margin: '0.75rem 0 2rem', fontWeight: '500', lineHeight: 1.5 }}>
                                    Actualmente el cliente activo no registra un <strong>Acuerdo Comercial Institucional</strong> activo. Solicita tu acuerdo con FruFresco y desbloquea los siguientes beneficios exclusivos:
                                </p>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                    gap: '1rem',
                                    textAlign: 'left',
                                    marginBottom: '2.5rem'
                                }}>
                                    <div style={{ backgroundColor: 'white', padding: '1rem 1.25rem', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '0.9rem', marginBottom: '4px' }}>
                                             Precios Negociados Fijos
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                            Garantía de tarifas preferenciales en tus insumos de alto volumen por periodo definido.
                                        </div>
                                    </div>

                                    <div style={{ backgroundColor: 'white', padding: '1rem 1.25rem', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontWeight: '800', color: '#1D4ED8', fontSize: '0.9rem', marginBottom: '4px' }}>
                                            � Crédito Institucional
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                            Cupo asignado con días de plazo adaptados al flujo de caja de tu empresa.
                                        </div>
                                    </div>

                                    <div style={{ backgroundColor: 'white', padding: '1rem 1.25rem', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontWeight: '800', color: '#D97706', fontSize: '0.9rem', marginBottom: '4px' }}>
                                             Logística Prioritaria
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                            Prioridad en ventana de entrega y control de calidad digital en bodega.
                                        </div>
                                    </div>
                                </div>

                                <a
                                    href="https://wa.me/573001234567?text=Hola,%20quisiera%20solicitar%20un%20Acuerdo%20Comercial%20Institucional%20con%20FruFresco"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn-premium"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        backgroundColor: 'var(--primary)',
                                        color: 'white',
                                        padding: '0.85rem 2rem',
                                        borderRadius: 'var(--radius-full)',
                                        fontWeight: '900',
                                        fontSize: '0.95rem',
                                        textDecoration: 'none',
                                        boxShadow: '0 12px 24px rgba(13, 122, 87, 0.25)'
                                    }}
                                >
                                    <Rocket size={18} /> Solicitar Acuerdo Comercial Institucional
                                </a>
                            </div>
                        )}
                    </div>
                )}

                {/* CRATES (CANASTILLAS) TAB */}
                {activeTab === 'crates' && (
                    <div className="b2b-responsive-card" style={{
                        backgroundColor: 'white',
                        borderRadius: 'var(--radius-lg)',
                        padding: '2rem',
                        boxShadow: 'var(--shadow-lg)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
                            <div>
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
                                    <Package size={26} color="var(--primary)" /> Mis Canastillas de Logística
                                </h2>
                                <p style={{ color: 'var(--text-muted)', margin: '0.3rem 0 0', fontSize: '0.9rem', fontWeight: '500' }}>
                                    Seguimiento de saldo vivo de canastillas plásticas prestadas e historial de entregas y devoluciones.
                                </p>
                            </div>

                            <button
                                onClick={() => {
                                    window.showToast?.('Notificación enviada a Logística. Programaremos la recogida en tu próximo despacho.', 'success');
                                }}
                                className="btn-premium"
                                style={{
                                    padding: '0.65rem 1.25rem',
                                    borderRadius: THEME.radius.md,
                                    backgroundColor: '#0284C7',
                                    color: 'white',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    border: 'none',
                                    boxShadow: '0 4px 10px rgba(2, 132, 199, 0.2)'
                                }}
                            >
                                <Truck size={16} /> Solicitar Recogida de Vacías
                            </button>
                        </div>

                        {/* Top KPI Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                            <div style={{ padding: '1.25rem', borderRadius: '16px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#047857', textTransform: 'uppercase' }}>
                                    CANASTILLAS PRESTADAS
                                </div>
                                <div style={{ fontSize: '2rem', fontWeight: '950', color: '#065F46', marginTop: '4px' }}>
                                    {(activeProfile as any)?.crate_balance || 0} <span style={{ fontSize: '0.9rem', fontWeight: '700' }}>und</span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#047857', fontWeight: '700', marginTop: '4px' }}>
                                    {((activeProfile as any)?.crate_balance || 0) > 40 ? '⚠️ Retención Alta (Supera 40 canastillas)' : '🟢 Saldo en rango normal'}
                                </div>
                            </div>

                            <div style={{ padding: '1.25rem', borderRadius: '16px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                                    ESTADO DE PRÉSTAMO
                                </div>
                                <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#1E293B', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {(activeProfile as any)?.needs_crates !== false ? (
                                        <><CheckCircle2 size={18} color="#10B981" /> Habilitado</>
                                    ) : (
                                        <><AlertTriangle size={18} color="#F59E0B" /> No Autorizado</>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                                    Configuración maestra asignada a tu cuenta
                                </div>
                            </div>

                            {(activeProfile as any)?.is_corporate_parent && (
                                <div style={{ padding: '1.25rem', borderRadius: '16px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#1D4ED8', textTransform: 'uppercase' }}>
                                        TOTAL MATRIZ CONSOLIDADO
                                    </div>
                                    <div style={{ fontSize: '2rem', fontWeight: '950', color: '#1E40AF', marginTop: '4px' }}>
                                        {(activeProfile as any)?.crate_balance || 0} <span style={{ fontSize: '0.9rem', fontWeight: '700' }}>und</span>
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#1D4ED8', fontWeight: '700', marginTop: '4px' }}>
                                        Suma total acumulada en todas las sucursales
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Kardex Movements Table */}
                        <div style={{ border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
                            <div style={{ padding: '1rem 1.25rem', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FileText size={16} color="var(--primary)" /> Historial Kardex de Canastillas (Movimientos)
                                </h4>
                                <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>Trazabilidad 360° en Tiempo Real</span>
                            </div>

                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#F8FAFC', color: '#475569', textAlign: 'left', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.04em', borderBottom: '1px solid #E2E8F0' }}>
                                            <th style={{ padding: '0.75rem 1rem' }}>Fecha</th>
                                            <th style={{ padding: '0.75rem 1rem' }}>Tipo de Movimiento</th>
                                            <th style={{ padding: '0.75rem 1rem' }}>Referencia / Pedido</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Cantidad</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Evidencia</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '0.85rem 1rem', color: '#475569', fontWeight: '600' }}>Hoy (Último Despacho)</td>
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#FEF2F2', color: '#991B1B', fontWeight: '800', border: '1px solid #FCA5A5', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <Package size={12} /> ENTREGADAS (PRESTADAS)
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', color: '#0F172A', fontWeight: '800' }}>Pedido #639</td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#EF4444', fontWeight: '900', fontSize: '0.95rem' }}>+14 und</td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                                <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '600' }}>Planilla Firmada</span>
                                            </td>
                                        </tr>
                                        <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                                            <td style={{ padding: '0.85rem 1rem', color: '#475569', fontWeight: '600' }}>24 de Jul 2026</td>
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#ECFDF5', color: '#065F46', fontWeight: '800', border: '1px solid #A7F3D0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <CheckCircle2 size={12} /> RECOGIDAS POR CONDUCTOR
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', color: '#0F172A', fontWeight: '800' }}>Ruta #WFW369</td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#10B981', fontWeight: '900', fontSize: '0.95rem' }}>-2 und</td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                                <span style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: '700' }}>Verificada Patio</span>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
</div> {/* Container End */}

            {/* QUANTITY MODAL */}
            {selectedProductForModal && (
                <div 
                    tabIndex={-1}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            setSelectedProductForModal(null);
                        }
                    }}
                    style={{
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
                    }}
                >
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
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontWeight: '500' }}>{t.b2b.dashboard.modalTitle}</p>

                        {/* ALERTA DE PRODUCTO YA EXISTENTE EN EL PEDIDO */}
                        {(() => {
                            const existingInCart = orderItems.find(item => item.product_id === selectedProductForModal.id);
                            if (!existingInCart) return null;

                            const currentQty = Number(existingInCart.quantity || 0);
                            const addedNum = typeof modalQuantity === 'string' 
                                ? (parseFloat(modalQuantity.replace(',', '.')) || 1)
                                : Number(modalQuantity) || 1;
                            const newTotal = Math.round((currentQty + addedNum) * 100) / 100;

                            return (
                                <div style={{
                                    backgroundColor: '#FFFBEB',
                                    border: '1.5px solid #F59E0B',
                                    borderRadius: '14px',
                                    padding: '0.85rem 1rem',
                                    marginBottom: '1.25rem',
                                    textAlign: 'left',
                                    fontSize: '0.82rem',
                                    color: '#92400E',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '10px',
                                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.12)'
                                }}>
                                    <AlertTriangle size={20} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <div>
                                        <div style={{ fontWeight: '900', fontSize: '0.86rem', color: '#B45309' }}>
                                            🛒 Insumo ya incluido en tu pedido
                                        </div>
                                        <div style={{ marginTop: '3px', color: '#78350F', lineHeight: '1.4' }}>
                                            Ya tienes <strong style={{ color: '#B45309' }}>{formatQuantity(currentQty)} {existingInCart.unit}</strong> de {locale === 'en' ? (selectedProductForModal.name_en || selectedProductForModal.name) : selectedProductForModal.name} en tu pedido.
                                        </div>
                                        <div style={{ marginTop: '6px', fontSize: '0.78rem', fontWeight: '800', color: '#065F46', backgroundColor: '#D1FAE5', border: '1px solid #A7F3D0', padding: '4px 8px', borderRadius: '8px', display: 'inline-block' }}>
                                            Al adicionar <strong>{formatQuantity(addedNum)} {selectedProductForModal.unit_of_measure || 'Kg'}</strong> el nuevo total será <strong>{formatQuantity(newTotal)} {existingInCart.unit}</strong>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Variantes / Opciones */}
                        {selectedProductForModal.options_config && Array.isArray(selectedProductForModal.options_config) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', textAlign: 'left' }}>
                                {selectedProductForModal.options_config
                                    .slice()
                                    .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                                    .map((opt: any, optIdx: number) => (
                                    <div key={opt.name}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                            {opt.name}
                                        </label>
                                        <select
                                            ref={optIdx === 0 ? firstOptionSelectRef : undefined}
                                            value={selectedOptions[opt.name] || ''}
                                            onChange={(e) => setSelectedOptions(prev => ({ ...prev, [opt.name]: e.target.value }))}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Tab' && !e.shiftKey) {
                                                    if (optIdx === (selectedProductForModal.options_config.length - 1)) {
                                                        e.preventDefault();
                                                        modalInputRef.current?.focus();
                                                        modalInputRef.current?.select();
                                                    }
                                                } else if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    confirmModalAdd();
                                                }
                                            }}
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

                        {(() => {
                            let resolvedUnit = selectedProductForModal.unit_of_measure || 'Kg';
                            Object.entries(selectedOptions).forEach(([k, v]) => {
                                if (k.toLowerCase().includes('presentaci') && v) {
                                    resolvedUnit = String(v).includes('|') ? String(v).split('|')[0] : String(v);
                                }
                            });
                            const isDiscreteUnit = !['kg', 'kilo', 'kilos'].includes(resolvedUnit.trim().toLowerCase());

                            return (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
                                    <button
                                        onClick={() => {
                                            const current = typeof modalQuantity === 'string' ? (parseFloat(modalQuantity.replace(',', '.')) || 1) : modalQuantity;
                                            const step = isDiscreteUnit ? 1 : 0.5;
                                            const next = Math.max(step, Math.round((current - step) * 10) / 10);
                                            setModalQuantity(String(next).replace('.', ','));
                                        }}
                                        style={{
                                            width: '44px', height: '44px',
                                            borderRadius: '50%',
                                            border: '1px solid #CBD5E1',
                                            backgroundColor: 'white',
                                            fontSize: '1.4rem',
                                            fontWeight: '900',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#334155'
                                        }}
                                    >−</button>

                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '6px', 
                                        border: '2px solid var(--primary)', 
                                        borderRadius: '14px', 
                                        padding: '0.4rem 0.9rem', 
                                        backgroundColor: '#F0FDF4',
                                        boxShadow: '0 2px 8px rgba(4, 120, 87, 0.1)'
                                    }}>
                                        <input
                                            ref={modalInputRef}
                                            type="text"
                                            inputMode={isDiscreteUnit ? "numeric" : "decimal"}
                                            value={String(modalQuantity)}
                                            onChange={(e) => {
                                                if (isDiscreteUnit) {
                                                    const val = e.target.value.replace(/[^0-9]/g, '');
                                                    setModalQuantity(val);
                                                } else {
                                                    const val = e.target.value.replace(/[^0-9.,]/g, '').replace('.', ',');
                                                    setModalQuantity(val);
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Tab' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    modalConfirmBtnRef.current?.focus();
                                                } else if (e.key === 'Tab' && e.shiftKey) {
                                                    e.preventDefault();
                                                    const hasOptions = selectedProductForModal.options_config && 
                                                        Array.isArray(selectedProductForModal.options_config) && 
                                                        selectedProductForModal.options_config.length > 0;
                                                    if (hasOptions && firstOptionSelectRef.current) {
                                                        firstOptionSelectRef.current.focus();
                                                    } else {
                                                        modalCancelBtnRef.current?.focus();
                                                    }
                                                } else if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    confirmModalAdd();
                                                } else if (e.key === 'Escape') {
                                                    e.preventDefault();
                                                    setSelectedProductForModal(null);
                                                } else if (e.key === 'ArrowUp') {
                                                    e.preventDefault();
                                                    const current = typeof modalQuantity === 'string' ? (parseFloat(modalQuantity.replace(',', '.')) || 1) : modalQuantity;
                                                    const step = isDiscreteUnit ? 1 : 0.5;
                                                    const next = Math.round((current + step) * 10) / 10;
                                                    setModalQuantity(String(next).replace('.', ','));
                                                } else if (e.key === 'ArrowDown') {
                                                    e.preventDefault();
                                                    const current = typeof modalQuantity === 'string' ? (parseFloat(modalQuantity.replace(',', '.')) || 1) : modalQuantity;
                                                    const step = isDiscreteUnit ? 1 : 0.5;
                                                    const next = Math.max(step, Math.round((current - step) * 10) / 10);
                                                    setModalQuantity(String(next).replace('.', ','));
                                                }
                                            }}
                                            onBlur={() => {
                                                if (isDiscreteUnit) {
                                                    const str = String(modalQuantity).replace(/[^0-9]/g, '');
                                                    const num = parseInt(str, 10);
                                                    if (isNaN(num) || num < 1) {
                                                        setModalQuantity('1');
                                                    } else {
                                                        setModalQuantity(String(num));
                                                    }
                                                } else {
                                                    const str = String(modalQuantity);
                                                    const num = parseFloat(str.replace(',', '.')) || 1;
                                                    setModalQuantity(String(num).replace('.', ','));
                                                }
                                            }}
                                            style={{
                                                width: '75px',
                                                border: 'none',
                                                fontSize: '1.4rem',
                                                fontWeight: '900',
                                                color: 'var(--primary)',
                                                textAlign: 'center',
                                                outline: 'none',
                                                backgroundColor: 'transparent',
                                                fontFamily: 'var(--font-outfit), sans-serif'
                                            }}
                                        />
                                        <span style={{ fontSize: '1.05rem', fontWeight: '800', color: '#047857' }}>
                                            {resolvedUnit}
                                        </span>
                                    </div>

                                    <button
                                        onClick={() => {
                                            const current = typeof modalQuantity === 'string' ? (parseFloat(modalQuantity.replace(',', '.')) || 1) : modalQuantity;
                                            const step = isDiscreteUnit ? 1 : 0.5;
                                            const next = Math.round((current + step) * 10) / 10;
                                            setModalQuantity(String(next).replace('.', ','));
                                        }}
                                        style={{
                                            width: '44px', height: '44px',
                                            borderRadius: '50%',
                                            border: 'none',
                                            backgroundColor: 'var(--primary)',
                                            color: 'white',
                                            fontSize: '1.4rem',
                                            fontWeight: '900',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            boxShadow: '0 4px 10px rgba(13, 122, 87, 0.25)'
                                        }}
                                    >+</button>
                                </div>
                            );
                        })()}

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                ref={modalCancelBtnRef}
                                onClick={() => setSelectedProductForModal(null)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Tab' && !e.shiftKey) {
                                        e.preventDefault();
                                        const hasOptions = selectedProductForModal.options_config && 
                                            Array.isArray(selectedProductForModal.options_config) && 
                                            selectedProductForModal.options_config.length > 0;
                                        if (hasOptions && firstOptionSelectRef.current) {
                                            firstOptionSelectRef.current.focus();
                                        } else if (modalInputRef.current) {
                                            modalInputRef.current.focus();
                                            modalInputRef.current.select();
                                        }
                                    } else if (e.key === 'Tab' && e.shiftKey) {
                                        e.preventDefault();
                                        modalConfirmBtnRef.current?.focus();
                                    } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        setSelectedProductForModal(null);
                                    }
                                }}
                                className="btn"
                                style={{ flex: 1, backgroundColor: '#f3f4f6', color: 'var(--text-main)' }}
                            >
                                {t.b2b.dashboard.cancelBtn}
                            </button>
                            <button
                                ref={modalConfirmBtnRef}
                                onClick={confirmModalAdd}
                                onKeyDown={(e) => {
                                    if (e.key === 'Tab' && !e.shiftKey) {
                                        e.preventDefault();
                                        modalCancelBtnRef.current?.focus();
                                    } else if (e.key === 'Tab' && e.shiftKey) {
                                        e.preventDefault();
                                        modalInputRef.current?.focus();
                                        modalInputRef.current?.select();
                                    } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        setSelectedProductForModal(null);
                                    }
                                }}
                                className="btn btn-primary"
                                style={{ flex: 1 }}
                            >
                                {orderItems.some(i => i.product_id === selectedProductForModal.id) ? 'Adicionar al pedido' : t.b2b.dashboard.addBtn}
                            </button>
                        </div>
                    </div>
                </div>
            )}            {/* SUMMARY CONFIRMATION MODAL — Ultra-Wide Premium Design */}
            {isSummaryModalOpen && (
                <div 
                    onClick={() => setIsSummaryModalOpen(false)}
                    style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.65)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2000,
                        backdropFilter: 'blur(8px)',
                        padding: '1rem',
                        cursor: 'pointer'
                    }}
                >
                    <div 
                        id="printable-summary-modal" 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: 'white',
                            padding: '1.75rem 2rem',
                            borderRadius: '24px',
                            width: '100%',
                            maxWidth: '720px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
                            maxHeight: '92vh',
                            display: 'flex',
                            flexDirection: 'column',
                            border: '1px solid #CBD5E1',
                            position: 'relative',
                            cursor: 'default'
                        }}
                    >
                        {/* Top Right Close Button X */}
                        <button
                            onClick={() => setIsSummaryModalOpen(false)}
                            title="Cerrar ventana"
                            style={{
                                position: 'absolute',
                                top: '1.25rem',
                                right: '1.25rem',
                                background: '#F1F5F9',
                                border: '1px solid #CBD5E1',
                                color: '#64748B',
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s',
                                zIndex: 10
                            }}
                        >
                            <X size={18} />
                        </button>
                        {/* Header */}
                        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                            <div style={{ 
                                background: 'linear-gradient(135deg, var(--primary) 0%, #047857 100%)', 
                                color: 'white', 
                                width: '56px', 
                                height: '56px', 
                                borderRadius: '50%', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                margin: '0 auto 0.75rem',
                                boxShadow: '0 8px 16px rgba(16, 185, 129, 0.25)' 
                            }}>
                                <ShoppingBag size={28} strokeWidth={2} />
                            </div>
                            <h2 style={{ 
                                fontFamily: 'var(--font-outfit), sans-serif',
                                fontSize: '1.45rem', 
                                fontWeight: '900', 
                                color: '#0F172A', 
                                margin: 0,
                                letterSpacing: '-0.03em'
                            }}>
                                {t.b2b.dashboard.confirmTitle}
                            </h2>
                            <p style={{ color: '#64748B', fontSize: '0.88rem', marginTop: '0.25rem', fontWeight: '500' }}>
                                {t.b2b.dashboard.confirmDesc}
                            </p>
                        </div>

                        {/* Calculate Unusual Items for Modal Alert */}
                        {(() => {
                            const activeSubmitItems = orderItems.filter(i => i.quantity > 0);
                            const unusualItems = activeSubmitItems.filter(item => {
                                const pastPurchases = historicalOrders.flatMap(o => o.order_items || o.items || []).filter((i: any) => (i.product_id && i.product_id === item.product_id) || (i.product_name && i.product_name === item.product_name));
                                const totalQtyBought = pastPurchases.reduce((acc: number, curr: any) => acc + Number(curr.quantity || 0), 0);
                                const avgQtyBought = pastPurchases.length > 0 ? (totalQtyBought / pastPurchases.length) : 0;
                                return pastPurchases.length > 0 && item.quantity > (avgQtyBought * 3.0);
                            });

                            return (
                                <>
                                    {/* Prominent Warning Banner if Unusual Quantities Exist */}
                                    {unusualItems.length > 0 && (
                                        <div style={{
                                            backgroundColor: '#FEF3C7',
                                            border: '1.5px solid #FCD34D',
                                            borderRadius: '16px',
                                            padding: '0.85rem 1.15rem',
                                            marginBottom: '1rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            color: '#92400E'
                                        }}>
                                            <div style={{ backgroundColor: '#F59E0B', color: 'white', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <AlertTriangle size={20} strokeWidth={2.5} />
                                            </div>
                                            <div style={{ fontSize: '0.82rem', lineHeight: '1.4' }}>
                                                <strong style={{ fontSize: '0.88rem', fontWeight: '900', color: '#78350F', display: 'block', marginBottom: '2px' }}>
                                                    ⚠️ Verificación Requerida: Cantidad Inusual Detectada ({unusualItems.length} {unusualItems.length === 1 ? 'insumo' : 'insumos'})
                                                </strong>
                                                {unusualItems.map(i => {
                                                    const pastPurchases = historicalOrders.flatMap(o => o.order_items || o.items || []).filter((h: any) => (h.product_id && h.product_id === i.product_id) || (h.product_name && h.product_name === i.product_name));
                                                    const totalQty = pastPurchases.reduce((acc: number, curr: any) => acc + Number(curr.quantity || 0), 0);
                                                    const avgQty = pastPurchases.length > 0 ? (totalQty / pastPurchases.length) : 0;
                                                    return `${i.product_name} (${i.quantity} ${i.unit} vs habitual ~${Math.round(avgQty)} ${i.unit})`;
                                                }).join(', ')}. ¿Deseas confirmar la solicitud?
                                            </div>
                                        </div>
                                    )}

                                    {/* Rich Table with Product, Unit Price, Quantity and Subtotal */}
                                    <div style={{
                                        flex: 1,
                                        overflowY: 'auto',
                                        marginBottom: '1rem',
                                        border: '1px solid #E2E8F0',
                                        borderRadius: '16px',
                                        backgroundColor: '#F8FAFC'
                                    }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                            <thead style={{ backgroundColor: 'white', position: 'sticky', top: 0, zIndex: 5 }}>
                                                <tr style={{ borderBottom: '1.5px solid #E2E8F0' }}>
                                                    <th style={{ textAlign: 'left', padding: '0.75rem 1rem', color: '#475569', fontSize: '0.72rem', fontWeight: '900', textTransform: 'uppercase', width: '45%' }}>{t.b2b.dashboard.product}</th>
                                                    <th style={{ textAlign: 'right', padding: '0.75rem 0.75rem', color: '#475569', fontSize: '0.72rem', fontWeight: '900', textTransform: 'uppercase', width: '20%' }}>PRECIO VIGENTE</th>
                                                    <th style={{ textAlign: 'center', padding: '0.75rem 0.75rem', color: '#475569', fontSize: '0.72rem', fontWeight: '900', textTransform: 'uppercase', width: '15%' }}>{t.b2b.dashboard.quantity}</th>
                                                    <th style={{ textAlign: 'right', padding: '0.75rem 1rem', color: '#475569', fontSize: '0.72rem', fontWeight: '900', textTransform: 'uppercase', width: '20%' }}>SUBTOTAL</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {activeSubmitItems.map(item => {
                                                    const price = Number(item.unit_price ?? agreementPricesMap[item.product_id] ?? item.base_price ?? 0);
                                                    const lineSubtotal = item.quantity * price;

                                                    const pastPurchases = historicalOrders.flatMap(o => o.order_items || o.items || []).filter((i: any) => (i.product_id && i.product_id === item.product_id) || (i.product_name && i.product_name === item.product_name));
                                                    const isNewItem = pastPurchases.length === 0;
                                                    const totalQtyBought = pastPurchases.reduce((acc: number, curr: any) => acc + Number(curr.quantity || 0), 0);
                                                    const avgQtyBought = pastPurchases.length > 0 ? (totalQtyBought / pastPurchases.length) : 0;
                                                    const isUnusualQty = pastPurchases.length > 0 && item.quantity > (avgQtyBought * 3.0);

                                                    return (
                                                        <tr key={item.id} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: isUnusualQty ? '#FFFBEB' : 'white' }}>
                                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                                <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.88rem' }}>
                                                                    {locale === 'en' ? (item.product_name_en || item.product_name) : item.product_name}
                                                                </div>
                                                                {item.variant_label && (
                                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '600' }}>({item.variant_label})</span>
                                                                )}

                                                                {/* Soft Warning Badges in Modal Table */}
                                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px' }}>
                                                                    {isNewItem && (
                                                                        <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#6D28D9', backgroundColor: '#F3E8FF', padding: '2px 6px', borderRadius: '4px', border: '1px solid #DDD6FE', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                            <Sparkles size={11} strokeWidth={2} /> Insumo Nuevo
                                                                        </span>
                                                                    )}
                                                                    {isUnusualQty && (
                                                                        <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#92400E', backgroundColor: '#FEF3C7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #FDE68A', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                            <AlertTriangle size={11} strokeWidth={2} /> Cantidad Inusual (Sueles pedir ~{Math.round(avgQtyBought)} {item.unit})
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '0.75rem 0.75rem', textAlign: 'right', fontWeight: '700', color: '#475569' }}>
                                                                ${formatPrice(price)} <span style={{ fontSize: '0.65rem', color: '#94A3B8' }}>/ {item.unit}</span>
                                                            </td>
                                                            <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontWeight: '900', color: isUnusualQty ? '#B45309' : '#059669', backgroundColor: isUnusualQty ? '#FEF3C7' : '#ECFDF5', borderRadius: '6px' }}>
                                                                {item.quantity} {item.unit}
                                                            </td>
                                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '900', color: '#0F172A' }}>
                                                                ${formatPrice(lineSubtotal)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            );
                        })()}

                        {/* Order Summary Metrics & Delivery Date Selector Bar */}
                        <div style={{
                            backgroundColor: '#F1F5F9',
                            padding: '0.85rem 1.25rem',
                            borderRadius: '16px',
                            marginBottom: '1.25rem',
                            border: '1px solid #CBD5E1',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.75rem'
                        }}>
                            {/* Date Selector */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <Calendar size={16} style={{ color: '#2563EB' }} /> {t.b2b.dashboard.deliveryDate}:
                                </span>
                                <input
                                    type="date"
                                    value={deliveryDate}
                                    onChange={(e) => setDeliveryDate(e.target.value)}
                                    min={minDeliveryDate}
                                    style={{
                                        fontWeight: '800',
                                        color: '#1E40AF',
                                        border: '1px solid #93C5FD',
                                        borderRadius: '8px',
                                        padding: '0.35rem 0.6rem',
                                        backgroundColor: 'white',
                                        fontSize: '0.82rem',
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                />
                            </div>

                            {/* Total Subtotal Display */}
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Total Estimado:</span>
                                <span style={{ fontSize: '1.3rem', fontWeight: '900', color: '#10B981', letterSpacing: '-0.03em' }}>
                                    ${formatPrice(orderItems.reduce((acc, i) => acc + (i.quantity * Number(i.unit_price ?? agreementPricesMap[i.product_id] ?? i.base_price ?? 0)), 0))}
                                </span>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="no-print" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                            <button
                                onClick={() => window.print()}
                                className="btn-glass"
                                style={{
                                    padding: '0.75rem 1rem',
                                    color: '#475569',
                                    fontWeight: '800',
                                    borderRadius: '12px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#F8FAFC'
                                }}
                                title={t.b2b.dashboard.printCopy}
                            >
                                <Printer size={18} />
                            </button>

                            <button
                                onClick={() => setIsSummaryModalOpen(false)}
                                style={{
                                    flex: 1,
                                    backgroundColor: '#F1F5F9',
                                    color: '#334155',
                                    fontWeight: '800',
                                    borderRadius: '12px',
                                    padding: '0.75rem 1rem',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.88rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Edit2 size={15} /> {t.b2b.dashboard.adjustOrder}
                            </button>

                            <button
                                onClick={handleFinalSubmit}
                                disabled={submitting}
                                style={{
                                    flex: 1.5,
                                    backgroundColor: 'var(--primary)',
                                    color: 'white',
                                    fontWeight: '900',
                                    fontSize: '0.95rem',
                                    borderRadius: '12px',
                                    padding: '0.75rem 1.25rem',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    cursor: submitting ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 8px 16px rgba(16, 185, 129, 0.25)',
                                    opacity: submitting ? 0.7 : 1
                                }}
                            >
                                <Rocket size={18} /> {submitting ? 'Enviando...' : 'Enviar Pedido Ahora'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <AgreementDocumentModal
                isOpen={isAgreementModalOpen}
                onClose={() => {
                    setIsAgreementModalOpen(false);
                    setSelectedAgreementForModal(null);
                }}
                agreement={selectedAgreementForModal}
                clientProfile={activeProfile}
            />

            <InvoiceDocumentModal
                isOpen={isInvoiceModalOpen}
                onClose={() => {
                    setIsInvoiceModalOpen(false);
                    setSelectedInvoiceOrder(null);
                }}
                order={selectedInvoiceOrder}
                clientProfile={activeProfile}
            />

            <B2BReportNoveltyModal
                isOpen={isReportNoveltyOpen}
                onClose={() => {
                    setIsReportNoveltyOpen(false);
                    setSelectedOrderForNovelty(null);
                }}
                order={selectedOrderForNovelty}
                clientProfile={activeProfile}
                onSuccess={() => {
                    window.showToast?.('Tu reporte de novedad ha sido recibido por Calidad FruFresco', 'success');
                }}
            />

            <style jsx global>{`
                .b2b-dashboard-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 1.5rem;
                    width: 100%;
                    max-width: 1400px;
                    margin: 0 auto;
                }
                @media (max-width: 768px) {
                    .b2b-tab-navigation {
                        gap: 1px !important;
                    }
                    .b2b-tab-button {
                        padding: 0.5rem 0.25rem !important;
                    }
                    .b2b-tab-icon {
                        display: none !important;
                    }
                    .b2b-catalog-container {
                        max-height: 680px;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    }
                    .b2b-catalog-container > div:last-child {
                        flex: 1;
                        overflow-y: auto !important;
                    }
                    .b2b-cart-sidebar {
                        display: flex;
                        flex-direction: column;
                    }
                    .b2b-cart-sidebar > div:first-child {
                        max-height: 580px;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    }
                    .b2b-cart-items-wrapper {
                        flex: 1;
                        overflow: hidden;
                        display: flex;
                        flex-direction: column;
                    }
                    .b2b-cart-items-wrapper > div:first-child {
                        flex: 1;
                        overflow-y: auto !important;
                    }
                    /* Tablas Responsivas */
                    .b2b-responsive-card {
                        padding: 1rem !important;
                    }
                    .b2b-responsive-card table th, 
                    .b2b-responsive-card table td {
                        font-size: 0.75rem !important;
                        padding: 0.6rem 0.5rem !important;
                    }
                    .b2b-responsive-card table th {
                        font-weight: 800 !important;
                    }
                    .b2b-responsive-card table td button {
                        font-size: 0.75rem !important;
                    }
                    .b2b-responsive-card h2 {
                        font-size: 1.15rem !important;
                    }
                    .b2b-responsive-card p {
                        font-size: 0.8rem !important;
                    }
                }
                @media (min-width: 1024px) {
                    .b2b-dashboard-grid {
                        grid-template-columns: 1.5fr 1fr;
                        align-items: start;
                    }
                    /* Columna 1 (Catálogo) con altura adaptativa al Viewport */
                    .b2b-catalog-container {
                        height: calc(100vh - 120px);
                        min-height: 720px;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                        position: relative;
                        box-sizing: border-box;
                    }
                    /* Cuerpo scrolleable de productos en Columna 1 (1) */
                    .b2b-catalog-container > div:last-child {
                        flex: 1;
                        min-height: 0;
                        overflow-y: auto !important;
                        padding: 1.5rem 1rem;
                    }
                    /* Contenedor de la Columna 2 (Carrito + Soporte) */
                    .b2b-cart-sidebar {
                        height: calc(100vh - 120px);
                        min-height: 720px;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                        box-sizing: border-box;
                    }
                    /* Carrito con altura flexible y contenida */
                    .b2b-cart-sidebar > div:first-child {
                        flex: 1;
                        min-height: 0;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                        position: relative;
                        box-sizing: border-box;
                    }
                    /* Sección pequeña de Soporte WhatsApp */
                    .b2b-cart-sidebar > div:last-child {
                        height: auto;
                        min-height: 110px;
                        margin-top: 16px !important;
                        box-sizing: border-box;
                        flex-shrink: 0;
                    }
                    .b2b-sticky-catalog-header {
                        position: relative;
                        z-index: 10;
                        background-color: white;
                        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
                        border-bottom: 1px solid var(--border);
                    }
                    .b2b-sticky-cart-header {
                        position: relative;
                        z-index: 10;
                        background-color: #F8FAFC;
                        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
                        border-bottom: 1px solid var(--border);
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

            {/* MODAL EDUCATIVO: Autogestión de Pedidos Recurrentes (A prueba de Dummies) */}
            {isHelpModalOpen && (
                <div 
                    onClick={() => setIsHelpModalOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 9999,
                        backgroundColor: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(6px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                        animation: 'fadeIn 0.2s ease-out'
                    }}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: 'white',
                            borderRadius: '20px',
                            width: '100%',
                            maxWidth: '680px',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            border: '1px solid #E2E8F0',
                            position: 'relative'
                        }}
                    >
                        {/* Modal Header */}
                        <div style={{
                            backgroundColor: '#064E3B',
                            backgroundImage: 'linear-gradient(135deg, #064E3B 0%, #047857 100%)',
                            padding: '1.75rem 2rem',
                            borderRadius: '20px 20px 0 0',
                            color: 'white',
                            position: 'relative'
                        }}>
                            <button
                                onClick={() => setIsHelpModalOpen(false)}
                                style={{
                                    position: 'absolute',
                                    top: '1.25rem',
                                    right: '1.25rem',
                                    background: 'rgba(255, 255, 255, 0.15)',
                                    border: 'none',
                                    color: 'white',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <X size={18} />
                            </button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                <span style={{ backgroundColor: '#10B981', color: 'white', fontSize: '0.7rem', fontWeight: '900', padding: '3px 10px', borderRadius: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Portal Institucional B2B
                                </span>
                            </div>
                            <h2 style={{ fontSize: '1.4rem', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Sparkles size={22} style={{ color: '#34D399' }} /> Autogestión de Pedidos Recurrentes
                            </h2>
                            <p style={{ margin: '6px 0 0 0', fontSize: '0.88rem', color: '#A7F3D0', fontWeight: '500' }}>
                                Guía rápida para programar tus entregas en segundos sin depender de llamadas ni mensajes.
                            </p>
                        </div>

                        {/* Modal Content */}
                        <div style={{ padding: '1.75rem 2rem' }}>
                            {/* Banner de Valor */}
                            <div style={{
                                backgroundColor: '#ECFDF5',
                                border: '1px solid #A7F3D0',
                                borderRadius: '12px',
                                padding: '1rem 1.25rem',
                                marginBottom: '1.5rem',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px'
                            }}>
                                <Zap size={22} style={{ color: '#059669', flexShrink: 0, marginTop: '2px' }} />
                                <div style={{ fontSize: '0.85rem', color: '#065F46', lineHeight: '1.5', fontWeight: '600' }}>
                                    <strong style={{ color: '#047857' }}>¡Ahorra hasta un 80% de tiempo diario!</strong> Tu portal recuerda tus productos y volúmenes habituales. No necesitas volver a buscar todo el catálogo desde cero para tus entregas de la semana.
                                </div>
                            </div>

                            <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#1E293B', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileText size={18} style={{ color: 'var(--primary)' }} /> ¿Cómo hacer tu pedido en 4 pasos sencillos?
                            </h3>

                            {/* Step 1 */}
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: 'white', fontWeight: '900', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    1
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.92rem', fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Clock size={16} style={{ color: 'var(--primary)' }} /> Selecciona un Pedido Anterior
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: '1.45' }}>
                                        En la barra superior <strong>"Repetir Pedido"</strong> verás tus últimos 5 despachos (ej: <code style={{ backgroundColor: '#E2E8F0', padding: '1px 5px', borderRadius: '4px', color: '#1E293B' }}>#639 (24 jul)</code>). Haz clic en cualquiera de ellos y el sistema cargará instantáneamente tu lista completa de insumos con los precios vigentes de tu convenio.
                                    </p>
                                </div>
                            </div>

                            {/* Step 2 */}
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: 'white', fontWeight: '900', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    2
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.92rem', fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Edit2 size={16} style={{ color: 'var(--primary)' }} /> Modifica Cantidades o Agrega/Quita SKUs
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: '1.45' }}>
                                        Usa los botones <strong><code style={{ backgroundColor: '#E2E8F0', padding: '1px 5px', borderRadius: '4px' }}>+</code></strong> y <strong><code style={{ backgroundColor: '#E2E8F0', padding: '1px 5px', borderRadius: '4px' }}>-</code></strong> para ajustar los kilos o unidades requeridos para hoy. Si hoy no necesitas algún producto, elimina ese renglón con la papelera <span style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: '#FEE2E2', padding: '2px 5px', borderRadius: '4px', border: '1px solid #FCA5A5' }}><Trash2 size={12} style={{ color: '#DC2626' }} /></span>. Si deseas añadir nuevos insumos, búscalos en el catálogo de la izquierda y haz clic en "Agregar".
                                    </p>
                                </div>
                            </div>

                            {/* Step 3 */}
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: 'white', fontWeight: '900', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    3
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.92rem', fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Calendar size={16} style={{ color: 'var(--primary)' }} /> Elige la Fecha de Entrega Futura
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: '1.45' }}>
                                        ¡Puedes programar pedidos para días posteriores! Selecciona el día de entrega exacto (de lunes a viernes). Esto asegura la reserva de tu inventario fresco en bodega con suficiente anticipación.
                                    </p>
                                </div>
                            </div>

                            {/* Step 4 */}
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: 'white', fontWeight: '900', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    4
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.92rem', fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <CheckCircle2 size={16} style={{ color: '#10B981' }} /> Confirma tu Pedido en 1 Clic
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: '1.45' }}>
                                        Haz clic en el botón verde <strong>"Confirmar Pedido"</strong>. Tu orden entrará de inmediato a nuestro centro de alistamiento y logística, garantizando tu despacho a tiempo y con factura/remisión según tus acuerdos.
                                    </p>
                                </div>
                            </div>

                            {/* Bottom Action */}
                            <div style={{ textAlign: 'center', paddingTop: '0.5rem' }}>
                                <button
                                    onClick={() => setIsHelpModalOpen(false)}
                                    style={{
                                        width: '100%',
                                        backgroundColor: 'var(--primary)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '0.85rem 1.5rem',
                                        borderRadius: '12px',
                                        fontWeight: '800',
                                        fontSize: '0.95rem',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <CheckCircle2 size={18} /> ¡Entendido! Empezar a Pedir
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
