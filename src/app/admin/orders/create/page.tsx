'use client';

import { useState, useEffect, Suspense, useRef, useMemo } from 'react';
import { isInsidePolygon, Point } from '@/lib/geoUtils';
import { translations, Locale } from '@/lib/translations';
import { supabase } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { sanitizeDocText, resolveClientProfile, findBestProductMatch, findBestProductMatchDetails, recordLearningMemory } from '@/lib/orders/order-parser-engine';
import { GENERAL_INSTITUCIONAL_ID, CLIENTES_HOGAR_ID } from '@/lib/pricingUtils';
import { formatTimeWindow, LogisticsData } from '@/lib/logistics-parser';
import Link from 'next/link';
import { resolvePhysicalInstruction, buildDualUnitMetadata, cleanPhysicalInstruction, getStructuredSpecKey } from '@/lib/orderUtils';
import { Map as GoogleMapComponent, Marker } from '@vis.gl/react-google-maps';
import { 
    MapPin, 
    X, 
    CheckCircle2, 
    Map as MapIcon, 
    Loader2,
    FileText,
    Building2,
    Home,
    RefreshCw,
    RotateCcw,
    AlertTriangle,
    Info,
    Calculator,
    FolderOpen,
    Sparkles,
    Settings,
    ChevronLeft,
    ChevronDown,
    ArrowLeft,
    Trash2,
    Plus,
    Check,
    MessageSquare,
    Phone,
    Mail,
    Globe,
    Coins,
    Scale,
    User,
    UploadCloud,
    Maximize2,
    Minimize2,
    Pencil,
    PackageX,
    ShieldCheck,
    Tag,
    Zap,
    AlertCircle,
    FileCheck,
    ShoppingCart,
    Pin,
    Search,
    Truck,
    Eye,
    ExternalLink,
    Link2
} from 'lucide-react';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import VariantModal from '@/components/VariantModal';
import PdfCanvasViewer from '@/components/PdfCanvasViewer';
import ExcelTableViewer from '@/components/ExcelTableViewer';
import { getNextValidDeliveryDate, isValidDeliveryDate } from '@/lib/colombianHolidays';

export const normalizeDocUnit = (unitStr: string): string => {
    if (!unitStr) return '';
    const u = unitStr.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    
    // Kilos / Kilogramos (KL, KLS, KG, KGS, KILO, KILOS, KILOGRAMO, KILOGRAMOS)
    if (u === 'kl' || u === 'kls' || u === 'kg' || u === 'kgs' || u.startsWith('kilo') || u.startsWith('kilogram')) {
        return 'Kg';
    }
    
    // Gramos (GR, GRS, G, GRAMO, GRAMOS)
    if (u === 'gr' || u === 'grs' || u === 'g' || u.startsWith('gram')) {
        return 'g';
    }
    
    // Libras (LB, LBS, LIBRA, LIBRAS)
    if (u === 'lb' || u === 'lbs' || u.startsWith('libra')) {
        return 'Libra';
    }
    
    // Unidades (UN, UND, UNDS, UD, UDS, UNI, UNIDAD, UNIDADES, PZA, PZAS, PIEZA)
    if (u === 'un' || u === 'und' || u === 'unds' || u === 'ud' || u === 'uds' || u === 'uni' || u.startsWith('unidad') || u.startsWith('pieza') || u === 'pza' || u === 'pzas') {
        return 'Unidad';
    }
    
    // Cubetas / Panales
    if (u.startsWith('cubeta') || u === 'cub' || u.startsWith('panal')) {
        return 'Cubeta';
    }
    
    // Paquetes / Atados / Manojo
    if (u.startsWith('paquet') || u === 'paq' || u === 'pqt' || u === 'pq' || u.startsWith('atado') || u.startsWith('manojo')) {
        return 'Paquete';
    }
    
    // Bolsas / Mallas
    if (u.startsWith('bolsa') || u === 'bol' || u.startsWith('malla')) {
        return 'Bolsa';
    }
    
    // Cajas / Canastillas
    if (u.startsWith('caja') || u === 'caj' || u.startsWith('canast')) {
        return 'Caja';
    }
    
    // Litros
    if (u === 'lt' || u === 'lts' || u === 'l' || u.startsWith('litro')) {
        return 'Litro';
    }
    
    // Docenas
    if (u.startsWith('docena') || u === 'doc') {
        return 'Docena';
    }
    
    return unitStr.trim();
};

const formatDetectedUnit = (qty: number, unit: string) => {
    const norm = normalizeDocUnit(unit);
    let cleanUnit = norm.toLowerCase();
    let suffix = qty === 1 ? 'detectado' : 'detectados';
    
    if (norm === 'Kg') {
        cleanUnit = qty === 1 ? 'kilo' : 'kilos';
        suffix = qty === 1 ? 'detectado' : 'detectados';
    } else if (norm === 'Unidad') {
        cleanUnit = qty === 1 ? 'unidad' : 'unidades';
        suffix = qty === 1 ? 'detectada' : 'detectadas';
    } else if (norm === 'Cubeta') {
        cleanUnit = qty === 1 ? 'cubeta' : 'cubetas';
        suffix = qty === 1 ? 'detectada' : 'detectadas';
    } else if (norm === 'Libra') {
        cleanUnit = qty === 1 ? 'libra' : 'libras';
        suffix = qty === 1 ? 'detectada' : 'detectadas';
    } else if (norm === 'g') {
        cleanUnit = qty === 1 ? 'gramo' : 'gramos';
        suffix = qty === 1 ? 'detectado' : 'detectados';
    } else if (norm === 'Paquete') {
        cleanUnit = qty === 1 ? 'paquete' : 'paquetes';
        suffix = qty === 1 ? 'detectado' : 'detectados';
    } else if (norm === 'Bolsa') {
        cleanUnit = qty === 1 ? 'bolsa' : 'bolsas';
        suffix = qty === 1 ? 'detectada' : 'detectadas';
    } else if (norm === 'Caja') {
        cleanUnit = qty === 1 ? 'caja' : 'cajas';
        suffix = qty === 1 ? 'detectada' : 'detectadas';
    } else if (norm === 'Litro') {
        cleanUnit = qty === 1 ? 'litro' : 'litros';
        suffix = qty === 1 ? 'detectado' : 'detectados';
    } else if (norm === 'Docena') {
        cleanUnit = qty === 1 ? 'docena' : 'docenas';
        suffix = qty === 1 ? 'detectada' : 'detectadas';
    } else {
        cleanUnit = cleanUnit || (qty === 1 ? 'unidad' : 'unidades');
        suffix = qty === 1 ? 'detectada' : 'detectadas';
    }
    
    return `${qty} ${cleanUnit} ${suffix}`;
};

const getAccountingIdDisplay = (product: any) => {
    if (!product) return '';
    if (product.accounting_id) {
        if (typeof product.accounting_id === 'number') {
            return product.accounting_id.toString();
        }
        const match = String(product.accounting_id).match(/\d+/);
        if (match) {
            return parseInt(match[0], 10).toString();
        }
        return String(product.accounting_id);
    }
    if (product.sku) {
        const skuMatch = product.sku.match(/^[A-Z]{2}-(\d+)/i);
        if (skuMatch) {
            return parseInt(skuMatch[1], 10).toString();
        }
    }
    return product.id || '';
};

const getParsedWeight = (text: string): number | null => {
    if (!text) return null;
    if (text.includes('|')) {
        const parts = text.split('|');
        const grams = parseFloat(parts[1]);
        if (!isNaN(grams) && grams > 0) return grams / 1000;
    }
    const clean = text.toLowerCase();
    const kgMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilos)/);
    if (kgMatch) {
        const val = parseFloat(kgMatch[1]);
        if (!isNaN(val) && val > 0) return val;
    }
    const gMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:g|gr|grs|gramos|grams|gramo|gram)/);
    if (gMatch) {
        const val = parseFloat(gMatch[1]);
        if (!isNaN(val) && val > 0) return val / 1000;
    }
    if (clean.includes('libra') || clean.includes('lb')) return 0.5;
    return null;
};

export const formatWeightKg = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return '0';
    const num = Number(val);
    const rounded = Math.round(num * 100) / 100;
    return rounded.toLocaleString('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
};

const getProductMinSaleKg = (product: any): number | null => {
    if (!product) return null;
    const isWeightProd = (product.unit_of_measure || 'Kg').toLowerCase() === 'kg';
    if (!isWeightProd) return null;

    let minKg = product.weight_kg !== undefined && product.weight_kg !== null && Number(product.weight_kg) > 0
        ? Number(product.weight_kg)
        : 0.1;

    const presentationWeights: number[] = [];

    // Also check product name for discrete weight specification (e.g., "Arandano extra bandeja x125 gr" -> 0.125 kg)
    const nameWeight = getParsedWeight(product.name);
    if (nameWeight !== null && nameWeight > 0) {
        presentationWeights.push(nameWeight);
    }

    if (Array.isArray(product.options_config)) {
        product.options_config.forEach((opt: any) => {
            if (opt.name && (opt.name.toLowerCase().includes('presentaci') || opt.name.toLowerCase().includes('unidad') || opt.name.toLowerCase().includes('tamaño') || opt.name.toLowerCase().includes('gramaje'))) {
                (opt.values || []).forEach((val: string) => {
                    const pw = getParsedWeight(val);
                    if (pw !== null && pw > 0) {
                        presentationWeights.push(pw);
                    }
                });
            }
        });
    }

    if (presentationWeights.length > 0) {
        const minVariantWeight = Math.min(...presentationWeights);
        if (minVariantWeight > minKg) {
            minKg = minVariantWeight;
        }
    }

    return minKg;
};

function CreateOrderContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [isConfirmingImport, setIsConfirmingImport] = useState(false);
    const [isDirectConfirming, setIsDirectConfirming] = useState(false);
    const [showFormulaTooltip, setShowFormulaTooltip] = useState(false);

    // Safe math expression evaluator for Excel-style formulas (+900/24, =900/24, 15*12, etc.)
    const evaluateMathExpression = (val: string | number | null | undefined): number => {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        
        let str = String(val).trim();
        if (!str) return 0;

        if (str.startsWith('=') || str.startsWith('+')) {
            str = str.substring(1).trim();
        }

        str = str.replace(/,/g, '.').replace(/x/gi, '*');

        if (!/^[\d\s.+\-*/()]+$/.test(str)) {
            const fallback = parseFloat(str.replace(/[^0-9.]/g, ''));
            return isNaN(fallback) ? 0 : fallback;
        }

        try {
            const result = new Function(`'use strict'; return (${str});`)();
            if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
                return parseFloat(result.toFixed(4));
            }
        } catch {
            const sanitized = str.replace(/[+\-*/]+$/, '');
            try {
                const result = new Function(`'use strict'; return (${sanitized});`)();
                if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
                    return parseFloat(result.toFixed(4));
                }
            } catch {
                const fallback = parseFloat(str);
                return isNaN(fallback) ? 0 : fallback;
            }
        }

        const fallback = parseFloat(str);
        return isNaN(fallback) ? 0 : fallback;
    };

    // Helpers to format inputs with thousands separator (.) and decimal (,)
    const formatQuantityDisplay = (qtyStr: string | number | undefined | null): string => {
        if (qtyStr === undefined || qtyStr === null || qtyStr === '') return '';
        
        let num: number;
        if (typeof qtyStr === 'number') {
            num = qtyStr;
        } else {
            const cleanStr = String(qtyStr).replace(/\./g, '').replace(',', '.');
            num = parseFloat(cleanStr);
        }

        if (isNaN(num)) return String(qtyStr);

        // Strict 2-decimal constraint: maximum 2 digits after comma
        const rounded = Math.round(num * 100) / 100;
        return rounded.toLocaleString('es-CO', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    };

    const formatPriceDisplay = (price: number | string | undefined | null): string => {
        if (price === undefined || price === null || price === '') return '';
        
        if (typeof price === 'number') {
            const parts = price.toString().split('.');
            const integerPart = parts[0];
            const decimalPart = parts[1];
            const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            return decimalPart !== undefined ? `${formattedInteger},${decimalPart}` : formattedInteger;
        }

        const str = price.toString();
        const hasComma = str.includes(',');
        const hasDot = str.includes('.');

        if (hasComma) {
            const parts = str.replace(/\./g, '').split(',');
            const integerPart = parts[0];
            const decimalPart = parts[1];
            const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            return decimalPart !== undefined ? `${formattedInteger},${decimalPart}` : formattedInteger;
        } else if (hasDot) {
            const parts = str.split('.');
            const integerPart = parts[0];
            const decimalPart = parts[1];
            const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            return decimalPart !== undefined ? `${formattedInteger},${decimalPart}` : formattedInteger;
        } else {
            return str.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        }
    };

    // Data Sources
    const [clients, setClients] = useState<any[]>([]); // B2B Profiles
    const [b2cClients, setB2cClients] = useState<any[]>([]); // B2C Profiles
    const [products, setProducts] = useState<any[]>([]);
    const [conversions, setConversions] = useState<any[]>([]);
    const [contractPrices, setContractPrices] = useState<Record<string, number>>({});
    const [customPriceIds, setCustomPriceIds] = useState<Set<string>>(new Set());
    const [campaignPrices, setCampaignPrices] = useState<Record<string, { value: number; type: string; name: string }>>({});
    const [activePricingModel, setActivePricingModel] = useState<any>(null);
    const [isB2CDefault, setIsB2CDefault] = useState(false);
    const [isContractExpired, setIsContractExpired] = useState(false);
    const [activeEquivalenceRow, setActiveEquivalenceRow] = useState<number | null>(null);

    // Form State
    const [clientType, setClientType] = useState(searchParams.get('type')?.toUpperCase() === 'B2C' ? 'B2C' : 'B2B');
    
    // B2B State
    const [selectedClient, setSelectedClient] = useState('');
    const [clientSearch, setClientSearch] = useState('');
    const [focusedClientIndex, setFocusedClientIndex] = useState(-1);
    const [branchFilterQuery, setBranchFilterQuery] = useState('');
    const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);

    // B2C State
    const [b2cMode, setB2CMode] = useState<'search' | 'new'>('new');
    const [clientSearchB2C, setClientSearchB2C] = useState('');
    const [selectedClientB2C, setSelectedClientB2C] = useState('');
    const [loadingLastOrderB2C, setLoadingLastOrderB2C] = useState(false);
    const [focusedClientIndexB2C, setFocusedClientIndexB2C] = useState<number>(-1);
    const [guestInfo, setGuestInfo] = useState({ name: '', phone: '', address: '', city: 'Bogotá', email: '', nit: '', saveToDirectory: true }); // For B2C New

    // Client Exceptions (Product Nicknames & Notes) and Frequent Demand History
    const [clientExceptions, setClientExceptions] = useState<any[]>([]);
    const [clientFrequentProductMap, setClientFrequentProductMap] = useState<Record<string, { count: number; totalQty: number; nickname?: string }>>({});
    const [clientFrequentProductIds, setClientFrequentProductIds] = useState<string[]>([]);

    const activeCustomerId = selectedClient || (clientType === 'B2C' && selectedClientB2C ? selectedClientB2C : null);

    useEffect(() => {
        if (!activeCustomerId) {
            setClientExceptions([]);
            setClientFrequentProductMap({});
            setClientFrequentProductIds([]);
            return;
        }
        async function fetchClientData() {
            try {
                // 1. Fetch exceptions/nicknames
                const { data: nicknames } = await supabase
                    .from('product_nicknames')
                    .select('*')
                    .eq('customer_id', activeCustomerId);
                if (nicknames) setClientExceptions(nicknames);

                // 2. Fetch purchase history stats for this client
                const { data: clientOrders } = await supabase
                    .from('orders')
                    .select('id')
                    .eq('profile_id', activeCustomerId)
                    .order('created_at', { ascending: false })
                    .limit(50);
                
                if (clientOrders && clientOrders.length > 0) {
                    const orderIds = clientOrders.map(o => o.id);
                    const { data: items } = await supabase
                        .from('order_items')
                        .select('product_id, quantity, nickname')
                        .in('order_id', orderIds);
                    
                    if (items) {
                        const freqMap: Record<string, { count: number; totalQty: number; nickname?: string }> = {};
                        items.forEach(it => {
                            if (!it.product_id) return;
                            if (!freqMap[it.product_id]) {
                                freqMap[it.product_id] = { count: 0, totalQty: 0, nickname: it.nickname || undefined };
                            }
                            freqMap[it.product_id].count += 1;
                            freqMap[it.product_id].totalQty += (Number(it.quantity) || 0);
                        });
                        setClientFrequentProductMap(freqMap);
                        const sortedIds = Object.keys(freqMap).sort((a, b) => freqMap[b].count - freqMap[a].count);
                        setClientFrequentProductIds(sortedIds);
                    }
                } else {
                    setClientFrequentProductMap({});
                    setClientFrequentProductIds([]);
                }
            } catch (err) {
                console.warn('Error loading client purchase history frequency:', err);
                setClientFrequentProductMap({});
                setClientFrequentProductIds([]);
            }
        }
        fetchClientData();
    }, [activeCustomerId]);

    // --- CUSTOMER STRUCTURED PREFERENCES (PINNED COMBINATIONS) ---
    const [savingPreference, setSavingPreference] = useState(false);

    const handleSaveCustomerOptionPreference = async (productId: string, optionsToSave: Record<string, string>, clear: boolean = false) => {
        if (!activeCustomerId) {
            alert('Debe seleccionar un cliente antes de fijar una preferencia.');
            return;
        }
        setSavingPreference(true);
        try {
            const exc = clientExceptions.find(e => e.product_id === productId);
            const optionsPayload = clear ? {} : optionsToSave;
            
            let newRecord: any = null;
            if (exc?.id) {
                const { data, error } = await supabase
                    .from('product_nicknames')
                    .update({ preferred_options: optionsPayload })
                    .eq('id', exc.id)
                    .select()
                    .single();
                if (error) throw error;
                newRecord = data;
            } else {
                const { data, error } = await supabase
                    .from('product_nicknames')
                    .insert({
                        customer_id: activeCustomerId,
                        product_id: productId,
                        preferred_options: optionsPayload,
                        nickname: selectedProductForModal?.name || 'Producto',
                        picking_note: null
                    })
                    .select()
                    .single();
                if (error) throw error;
                newRecord = data;
            }

            // Update local React state immediately
            setClientExceptions(prev => {
                const idx = prev.findIndex(e => e.product_id === productId);
                if (idx >= 0) {
                    const copy = [...prev];
                    copy[idx] = newRecord || { ...copy[idx], preferred_options: optionsPayload };
                    return copy;
                }
                return [...prev, newRecord];
            });

            if (clear) {
                // If cleared, inform operator
            }
        } catch (err: any) {
            console.error('Error saving customer preference:', err);
            alert('Error al guardar preferencia de cliente: ' + (err.message || err));
        } finally {
            setSavingPreference(false);
        }
    };

    const [focusedProductIndex, setFocusedProductIndex] = useState(-1);
    const productSuggestionsListRef = useRef<HTMLDivElement>(null);

    // Auto-scroll the suggestions list so the keyboard-focused item is always in view
    useEffect(() => {
        if (focusedProductIndex >= 0 && productSuggestionsListRef.current) {
            const container = productSuggestionsListRef.current;
            const targetItem = container.children[focusedProductIndex] as HTMLElement;
            if (targetItem) {
                targetItem.scrollIntoView({
                    block: 'nearest',
                    behavior: 'smooth'
                });
            }
        }
    }, [focusedProductIndex]);

    const [latitude, setLatitude] = useState<number | null>(null);
    const [longitude, setLongitude] = useState<number | null>(null);
    const [isGettingLocation, setIsGettingLocation] = useState(false);
    const [showMapPicker, setShowMapPicker] = useState(false);
    const [lastGeocodedAddress, setLastGeocodedAddress] = useState('');
    const [hasCoverageOverride, setHasCoverageOverride] = useState(false);
    const [coverageOverrideReason, setCoverageOverrideReason] = useState('');
    const [isOverrideMode, setIsOverrideMode] = useState(false);
    const [createdB2CProfileId, setCreatedB2CProfileId] = useState<string | null>(null);
    const [draftClientType, setDraftClientType] = useState('b2c_client');


    // Scarcity Locked SKUs State
    const [scarcityLockedMap, setScarcityLockedMap] = useState<Record<string, any>>({});

    useEffect(() => {
        const fetchScarcityMap = async () => {
            try {
                const { data } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'scarcity_locked_skus')
                    .single();
                if (data?.value) {
                    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
                    setScarcityLockedMap(parsed || {});
                }
            } catch (err) {
                console.error('Error fetching scarcity map in orders create:', err);
            }
        };
        fetchScarcityMap();
    }, []);

    // Payment Method State
    const [paymentMethod, setPaymentMethod] = useState('contra_entrega');

    // Search States
    const [productSearch, setProductSearch] = useState('');

    const [originSource, setOriginSource] = useState(searchParams.get('source') || 'phone'); // phone, whatsapp, email
    const [minDeliveryDate, setMinDeliveryDate] = useState(() => {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const bogotaNow = new Date(utc + (3600000 * -5));
        const currentHour = bogotaNow.getHours();
        const daysToAdd = currentHour >= 17 ? 2 : 1;
        const result = new Date(bogotaNow);
        result.setDate(bogotaNow.getDate() + daysToAdd);
        return getNextValidDeliveryDate(result, false, false).toISOString().split('T')[0];
    });
    const [deliveryDate, setDeliveryDate] = useState(minDeliveryDate);

    useEffect(() => {
        async function fetchDeliverySettings() {
            try {
                const { data: settingsData } = await supabase
                    .from('app_settings')
                    .select('key, value')
                    .in('key', ['enable_cutoff_rules', 'allow_sunday_deliveries', 'allow_holiday_deliveries']);

                const cutoffEnabled = settingsData?.find(s => s.key === 'enable_cutoff_rules')?.value !== 'false';
                const allowSundays = settingsData?.find(s => s.key === 'allow_sunday_deliveries')?.value === 'true';
                const allowHolidays = settingsData?.find(s => s.key === 'allow_holiday_deliveries')?.value === 'true';

                const now = new Date();
                const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
                const bogotaNow = new Date(utc + (3600000 * -5));
                const currentHour = bogotaNow.getHours();
                const daysToAdd = (cutoffEnabled && currentHour >= 17) ? 2 : 1;

                const baseTarget = new Date(bogotaNow);
                baseTarget.setDate(bogotaNow.getDate() + daysToAdd);

                const validDate = getNextValidDeliveryDate(baseTarget, allowSundays, allowHolidays);
                const dateStr = validDate.toISOString().split('T')[0];

                setMinDeliveryDate(dateStr);
                setDeliveryDate(dateStr);
            } catch (err) {
                console.error("Error fetching delivery settings in manual orders:", err);
            }
        }
        fetchDeliverySettings();
    }, []);
    const [deliverySlot, setDeliverySlot] = useState('AM'); // AM or PM
    const [isManualDelivery, setIsManualDelivery] = useState(false);
    const [manualDeliveryTime, setManualDeliveryTime] = useState('');
    const [manualDeliveryMargin, setManualDeliveryMargin] = useState(15);
    const [manualDeliveryNote, setManualDeliveryNote] = useState('');

    // Estilos para ocultar flechas del input number
    const hideSpinnersStyle = `
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { 
            -webkit-appearance: none; 
            margin: 0; 
        }
        input[type=number] {
            -moz-appearance: textfield;
        }
    `;
    const [adminNotes, setAdminNotes] = useState('');

    // MODAL STATE (For Product Variants)
    const [selectedProductForModal, setSelectedProductForModal] = useState<any | null>(null);
    const [manageConversionsProduct, setManageConversionsProduct] = useState<any | null>(null);
    const [variantConfigProduct, setVariantConfigProduct] = useState<any | null>(null);
    const [modalQuantity, setModalQuantity] = useState<string | number>(1);
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
    const [modalUnit, setModalUnit] = useState('Kg');
    const [modalFactor, setModalFactor] = useState(1);
    const [editingCartIndex, setEditingCartIndex] = useState<number | null>(null);
    const [editingStagedItemId, setEditingStagedItemId] = useState<string | null>(null);
    const [editingStagedItemIdx, setEditingStagedItemIdx] = useState<number | null>(null);
    const firstSelectRef = useRef<HTMLSelectElement | null>(null);
    const productSearchInputRef = useRef<HTMLInputElement | null>(null);

    // Staging Pareto Dropdown States
    const [activeDropdownRowIndex, setActiveDropdownRowIndex] = useState<number | null>(null);
    const [focusedDropdownItemIndex, setFocusedDropdownItemIndex] = useState(0);
    const [activeRowSearchQuery, setActiveRowSearchQuery] = useState<string | null>(null);
    const searchQueryCacheRef = useRef<Map<string, any[]>>(new Map());
    const stagedProductInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const getScoredProductsForQuery = (query: string) => {
        let raw = (query || '').trim();
        let extractedId = '';
        const idMatch = raw.match(/\(([^)]+)\)$/);
        if (idMatch) {
            extractedId = idMatch[1].trim().toLowerCase();
        }
        const cleanQuery = raw.replace(/\s*\([^)]*\)$/, '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

        const cacheKey = `${cleanQuery}_${extractedId}_${products.length}_${clientExceptions.length}`;
        if (searchQueryCacheRef.current.has(cacheKey)) {
            return searchQueryCacheRef.current.get(cacheKey)!;
        }

        if (!cleanQuery && !extractedId) {
            const defaultResults = [...products].sort((a, b) => {
                const freqA = clientFrequentProductMap[a.id]?.count || 0;
                const freqB = clientFrequentProductMap[b.id]?.count || 0;
                if (freqB !== freqA) return freqB - freqA;
                return (a.name || '').localeCompare(b.name || '');
            }).slice(0, 12);
            searchQueryCacheRef.current.set(cacheKey, defaultResults);
            return defaultResults;
        }

        const matched = products.filter(p => {
            const normName = (p.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const normSku = (p.sku || '').toLowerCase();
            const normAcc = (getAccountingIdDisplay(p) || '').toLowerCase();
            const exc = clientExceptions.find(e => e.product_id === p.id);
            const normNickname = exc?.nickname ? exc.nickname.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';

            if (extractedId && (normAcc === extractedId || normSku === extractedId)) {
                return true;
            }

            if (!cleanQuery) return false;

            return normName.includes(cleanQuery) ||
                   normSku.includes(cleanQuery) ||
                   normAcc.includes(cleanQuery) ||
                   normNickname.includes(cleanQuery);
        });

        if (matched.length === 0) {
            return [];
        }

        const finalResults = matched.sort((a, b) => {
            const excA = clientExceptions.find(e => e.product_id === a.id);
            const excB = clientExceptions.find(e => e.product_id === b.id);
            const freqA = clientFrequentProductMap[a.id];
            const freqB = clientFrequentProductMap[b.id];

            let scoreA = 0;
            let scoreB = 0;

            const normNameA = (a.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const normNameB = (b.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            const wordsA = normNameA.split(/\s+/).filter(Boolean);
            const wordsB = normNameB.split(/\s+/).filter(Boolean);
            const queryWords = cleanQuery.split(/\s+/).filter(Boolean);

            if (queryWords.length > 0) {
                const hasAllWordsA = queryWords.every(qw => wordsA.includes(qw));
                const hasAllWordsB = queryWords.every(qw => wordsB.includes(qw));
                if (hasAllWordsA) scoreA += 10000;
                if (hasAllWordsB) scoreB += 10000;

                if (wordsA[0] === queryWords[0]) scoreA += 5000;
                if (wordsB[0] === queryWords[0]) scoreB += 5000;
            }

            if (extractedId) {
                if ((getAccountingIdDisplay(a) || '').toLowerCase() === extractedId || (a.sku || '').toLowerCase() === extractedId) scoreA += 8000;
                if ((getAccountingIdDisplay(b) || '').toLowerCase() === extractedId || (b.sku || '').toLowerCase() === extractedId) scoreB += 8000;
            }

            if (cleanQuery && normNameA === cleanQuery) scoreA += 3000;
            if (cleanQuery && normNameB === cleanQuery) scoreB += 3000;

            if (cleanQuery && normNameA.startsWith(cleanQuery)) scoreA += 1000;
            if (cleanQuery && normNameB.startsWith(cleanQuery)) scoreB += 1000;

            if (excA) scoreA += 500;
            if (excB) scoreB += 500;

            if (freqA) scoreA += Math.min(freqA.count * 20, 300) + Math.min(freqA.totalQty, 100);
            if (freqB) scoreB += Math.min(freqB.count * 20, 300) + Math.min(freqB.totalQty, 100);

            if (scoreB !== scoreA) {
                return scoreB - scoreA;
            }
            return normNameA.localeCompare(normNameB);
        }).slice(0, 12);

        searchQueryCacheRef.current.set(cacheKey, finalResults);
        return finalResults;
    };

    useEffect(() => {
        if (focusedClientIndexB2C >= 0) {
            const el = document.getElementById(`b2c-client-item-${focusedClientIndexB2C}`);
            if (el) {
                el.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [focusedClientIndexB2C]);

    // Auto-scroll para el dropdown flotante de SKUs en la Mesa de Trabajo
    useEffect(() => {
        if (activeDropdownRowIndex !== null && focusedDropdownItemIndex >= 0) {
            const el = document.getElementById(`dropdown-item-${activeDropdownRowIndex}-${focusedDropdownItemIndex}`);
            if (el) {
                el.scrollIntoView({
                    block: 'nearest',
                    behavior: 'smooth'
                });
            }
        }
    }, [activeDropdownRowIndex, focusedDropdownItemIndex]);

    useEffect(() => {
        if (manageConversionsProduct) {
            setTimeout(() => {
                const qty1 = document.getElementById('new-conv-qty-1') as HTMLInputElement | null;
                if (qty1) {
                    qty1.focus();
                    qty1.select();
                }
            }, 100);
        }
    }, [manageConversionsProduct]);

    useEffect(() => {
        if (selectedProductForModal) {
            // Re-fetch latest conversions for this product to prevent stale cache
            supabase
                .from('product_conversions')
                .select('*')
                .eq('product_id', selectedProductForModal.id)
                .then(({ data, error }) => {
                    if (!error && data) {
                        setConversions(prev => {
                            const filtered = prev.filter(c => c.product_id !== selectedProductForModal.id);
                            return [...filtered, ...data];
                        });
                    }
                });

            // Auto-focus the first select or the quantity input
            setTimeout(() => {
                if (firstSelectRef.current) {
                    firstSelectRef.current.focus();
                } else {
                    const qtyInput = document.getElementById('modal-qty-input');
                    if (qtyInput) {
                        qtyInput.focus();
                        (qtyInput as HTMLInputElement).select();
                    }
                }
            }, 80);

            // Only reset modal states to defaults if we are NOT in editing mode or staging mode!
            if (editingCartIndex !== null || editingStagedItemId !== null) {
                return;
            }

            setModalQuantity('1');

            const baseUnit = selectedProductForModal.unit_of_measure || 'Kg';
            const isKgProduct = baseUnit.toLowerCase() === 'kg' || baseUnit.toLowerCase() === 'kilo' || baseUnit.toLowerCase() === 'kilogramo';
            setModalUnit(baseUnit);
            setModalFactor(1);

            const initialOptions: Record<string, string> = {};
            if (selectedProductForModal.options_config) {
                selectedProductForModal.options_config.forEach((opt: any) => {
                    const isPresentation = opt.name.toLowerCase().includes('presentaci') || opt.name.toLowerCase().includes('unidad');
                    if (isPresentation) {
                        let matchedValue = opt.values?.find((v: string) => {
                            const clean = (v.includes('|') ? v.split('|')[0] : v).trim().toLowerCase();
                            return clean === baseUnit.toLowerCase() || (isKgProduct && (clean === 'kg' || clean === 'kilo' || clean === 'kilogramo'));
                        });

                        if (!matchedValue && isKgProduct) {
                            matchedValue = 'Kg';
                        }

                        if (!matchedValue) {
                            matchedValue = opt.values?.filter((v: string) => {
                                const clean = v.toLowerCase();
                                return !clean.includes('libra') && !clean.includes('pound') && !clean.includes('unidad web');
                            })[0] || '';
                        }
                        if (matchedValue) initialOptions[opt.name] = matchedValue;
                    }
                });
            }
            // 💡 Pre-populate with customer's structured preferred options if exist!
            const exc = clientExceptions.find(e => e.product_id === selectedProductForModal.id);
            if (exc?.preferred_options && typeof exc.preferred_options === 'object') {
                Object.entries(exc.preferred_options).forEach(([k, v]) => {
                    if (v) initialOptions[k] = String(v);
                });
            }

            setSelectedOptions(initialOptions);
        }
    }, [selectedProductForModal, editingCartIndex, editingStagedItemId, clientExceptions]);

    // Cart Logic
    const [cart, setCart] = useState<{
        product: any;
        qty: any;
        variant_label?: string;
        selected_options?: any;
        price?: number;
        originalQty?: number;
        originalUnit?: string;
        conversion_factor?: number;
        nickname?: string;
        picking_note?: string;
        delivery_note?: string;
        is_from_last_order?: boolean;
        observations?: string;
        deliverySchedule?: string;
    }[]>([]);
    const [deleteConfirm, setDeleteConfirm] = useState<{
        isOpen: boolean;
        productName: string;
        onConfirm: () => void;
    } | null>(null);

    const [duplicateConfirm, setDuplicateConfirm] = useState<{
        isOpen: boolean;
        product: any;
        qty: number;
        existingQty?: number;
        variantLabel?: string;
        optionsRaw?: any;
        unit?: string;
        factor?: number;
        existingIndex: number;
    } | null>(null);

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => { setToast({ message, type }); };
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    // --- STAGING AREA STATE (Mesa de Trabajo) ---
    const [isStaging, setIsStaging] = useState(false);
    const [stagedItems, setStagedItems] = useState<any[]>([]);
    const [sortStagedAlpha, setSortStagedAlpha] = useState(false);
    const [duplicateStagedMatchConfirm, setDuplicateStagedMatchConfirm] = useState<{
        isOpen: boolean;
        product: any;
        stagedItemId: string;
        rowIndex: number;
        duplicateIndex: number;
        pendingOptions?: any;
        pendingQty?: number;
        pendingUnit?: string;
        pendingFactor?: number;
        pendingVariantLabel?: string;
        openModalAfterKeep?: boolean;
    } | null>(null);
    const [selectedStagedIds, setSelectedStagedIds] = useState<string[]>([]);
    useEffect(() => {
        setSelectedStagedIds([]);
    }, [isStaging, stagedItems.length]);
    const [b2cGeofence, setB2cGeofence] = useState<Point[]>([]);
    const [outOfZone, setOutOfZone] = useState(false);
    const [parsingFile, setParsingFile] = useState(false);
    const [importValidation, setImportValidation] = useState<{
        clientInDocument: string,
        isMatch: boolean,
        documentType: 'PDF' | 'EXCEL' | 'CSV' | null,
        poNumber?: string | null,
        solpedNumber?: string | null,
        orderTypeLabel?: string | null,
        referencedCodes?: string[],
        deliveryDateInDocument?: string | null
    }>({ clientInDocument: '', isMatch: true, documentType: null });
    const [duplicateOrderMatch, setDuplicateOrderMatch] = useState<{
        order: any;
        matchedCode: string;
        matchType: 'OC' | 'SOLPED' | 'REFERENCE';
    } | null>(null);
    const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
    const [isLinkingDuplicate, setIsLinkingDuplicate] = useState(false);
    const [showMultiOrderModal, setShowMultiOrderModal] = useState(false);
    const [multiOrderDate1, setMultiOrderDate1] = useState('');
    const [multiOrderDate2, setMultiOrderDate2] = useState('');
    const [isCreatingMultiOrders, setIsCreatingMultiOrders] = useState(false);
    const [multiOrderSuccess, setMultiOrderSuccess] = useState<{ order1Id: string; order2Id: string } | null>(null);
    const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [permanentDocumentUrl, setPermanentDocumentUrl] = useState<string | null>(null);
    const [showSideDocPreview, setShowSideDocPreview] = useState(true);
    const [showFloatingDoc, setShowFloatingDoc] = useState(false);
    const [isFloatingDocExpanded, setIsFloatingDocExpanded] = useState(false);
    const [digestionDuration, setDigestionDuration] = useState<string | null>(null);
    const [digestionModel, setDigestionModel] = useState<string | null>(null);

    // Global keyboard shortcuts: Alt+E → Editar Equivalencias, Alt+V → Editar Variantes, ESC → cerrar modales
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // ── ESC: cierra modales en orden de prioridad (más específico → más general) ──
            if (e.key === 'Escape') {
                if (variantConfigProduct) { setVariantConfigProduct(null); return; }
                if (manageConversionsProduct) { setManageConversionsProduct(null); return; }
                if (selectedProductForModal) { setSelectedProductForModal(null); return; }
                if (showMapPicker) { setShowMapPicker(false); return; }
                if (showFloatingDoc) { setShowFloatingDoc(false); return; }
                if (deleteConfirm) { setDeleteConfirm(null); return; }
                if (duplicateConfirm) { setDuplicateConfirm(null); return; }
                if (duplicateStagedMatchConfirm) { setDuplicateStagedMatchConfirm(null); return; }
                return;
            }

            // Los atajos Alt solo aplican cuando el modal de producto está abierto
            if (!selectedProductForModal) return;

            // Alt+V → Editar Variantes
            if (e.altKey && (e.code === 'KeyV' || e.key === 'v' || e.key === 'V')) {
                if (!variantConfigProduct && !manageConversionsProduct) {
                    e.preventDefault();
                    setVariantConfigProduct(selectedProductForModal);
                }
                return;
            }

            // Alt+E → Editar Equivalencias
            if (e.altKey && (e.code === 'KeyE' || e.key === 'e' || e.key === 'E')) {
                if (!variantConfigProduct && !manageConversionsProduct) {
                    e.preventDefault();
                    setManageConversionsProduct(selectedProductForModal);
                }
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedProductForModal, variantConfigProduct, manageConversionsProduct, showMapPicker, showFloatingDoc, deleteConfirm, duplicateConfirm, duplicateStagedMatchConfirm]);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        async function fetchGeofence() {
            const { data } = await supabase.from('app_settings').select('value').eq('key', 'geofence_b2c_poly').single();
            if (data) setB2cGeofence(JSON.parse(data.value));
        }
        fetchGeofence();
    }, []);

    // Perform validation whenever coordinates change
    useEffect(() => {
        if (latitude && longitude && b2cGeofence.length > 0) {
            const inside = isInsidePolygon({ lat: latitude, lng: longitude }, b2cGeofence);
            setOutOfZone(!inside);
            if (inside) {
                setHasCoverageOverride(false);
                setCoverageOverrideReason('');
                setIsOverrideMode(false);
            }
        }
    }, [latitude, longitude, b2cGeofence]);

    // Resolve Contract / Pricing Model reactively
    useEffect(() => {
        async function resolveContract() {
            let modelId: string | null = null;
            let currentProfile: any = null;

            const isB2B = clientType === 'B2B' || Boolean(selectedClient);

            if (selectedClient) {
                currentProfile = clients.find(c => c.id === selectedClient);
                if (!currentProfile) {
                    const { data } = await supabase
                        .from('profiles')
                        .select('id, company_name, pricing_model_id, parent_id, role, payment_days, logistics_data')
                        .eq('id', selectedClient)
                        .maybeSingle();
                    if (data) currentProfile = data;
                }
            } else if (selectedClientB2C) {
                currentProfile = b2cClients.find(c => c.id === selectedClientB2C);
            }

            if (currentProfile) {
                let resolvedModelId = currentProfile.pricing_model_id;
                if (!resolvedModelId && currentProfile.parent_id) {
                    const parent = clients.find(c => c.id === currentProfile.parent_id);
                    if (parent) {
                        resolvedModelId = parent.pricing_model_id;
                    }
                }
                modelId = resolvedModelId || null;
            }

            let resolvedModel: any = null;
            let expired = false;
            let b2cFallback = false;
            let activeAgreement: any = null;

            // SPEC.md Secc. 7.2: Jerarquía Canónica (Nivel 1: Sucursal > Nivel 2: Matriz)
            if (isB2B && (selectedClient || currentProfile)) {
                const checkDate = deliveryDate ? deliveryDate.split('T')[0] : new Date().toISOString().split('T')[0];
                const branchId = currentProfile?.id || selectedClient;
                const parentId = currentProfile?.parent_id || null;

                // Nivel 1: Prevalencia Máxima - Acuerdo asignado directamente a la Sucursal
                let candidateAgreement: any = null;
                if (branchId) {
                    const { data: branchAgreement } = await supabase
                        .from('quotes')
                        .select('id, quote_number, start_date, valid_until')
                        .eq('client_id', branchId)
                        .eq('status', 'agreement')
                        .maybeSingle();
                    if (branchAgreement) {
                        candidateAgreement = branchAgreement;
                    }
                }

                // Nivel 2: Fallback - Acuerdo asignado a la empresa matriz
                if (!candidateAgreement && parentId) {
                    const { data: matrixAgreement } = await supabase
                        .from('quotes')
                        .select('id, quote_number, start_date, valid_until')
                        .eq('client_id', parentId)
                        .eq('status', 'agreement')
                        .maybeSingle();
                    if (matrixAgreement) {
                        candidateAgreement = matrixAgreement;
                    }
                }
                
                if (candidateAgreement) {
                    const start = candidateAgreement.start_date?.split('T')[0];
                    const end = candidateAgreement.valid_until?.split('T')[0];
                    let isValid = true;
                    if (start && start > checkDate) isValid = false;
                    if (end && end < checkDate) isValid = false;

                    if (isValid) {
                        activeAgreement = candidateAgreement;
                    } else {
                        expired = true;
                    }
                }
            }

            if (activeAgreement) {
                resolvedModel = {
                    id: activeAgreement.id,
                    name: `Acuerdo ${activeAgreement.quote_number}`,
                    is_agreement: true
                };
            } else {
                // 1. Fetch current pricing model if defined
                if (modelId) {
                    const { data: pm } = await supabase
                        .from('pricing_models')
                        .select('*')
                        .eq('id', modelId)
                        .single();
                    
                    if (pm) {
                        resolvedModel = pm;
                        // Validate expiration against deliveryDate
                        if (deliveryDate) {
                            const delivery = deliveryDate.split('T')[0];
                            const start = pm.start_date?.split('T')[0];
                            const end = pm.end_date?.split('T')[0];
                            if (start && start > delivery) {
                                expired = true;
                            }
                            if (end && end < delivery) {
                                expired = true;
                            }
                        }
                    }
                }

                // 2. Fallback to General Institucional (B2B) or Clientes Hogar (B2C) if no model or if expired
                if (!resolvedModel || expired) {
                    b2cFallback = true;
                    const defaultTargetId = isB2B ? GENERAL_INSTITUCIONAL_ID : CLIENTES_HOGAR_ID;

                    const { data: defaultModel } = await supabase
                        .from('pricing_models')
                        .select('*')
                        .eq('id', defaultTargetId)
                        .maybeSingle();

                    if (defaultModel) {
                        resolvedModel = defaultModel;
                    } else {
                        const targetNames = isB2B 
                            ? ['General Institucional', 'Clientes Institucionales', 'B2B General']
                            : ['Clientes Hogar', 'Clientes B2C'];

                        const { data: fallbackByName } = await supabase
                            .from('pricing_models')
                            .select('*')
                            .in('name', targetNames)
                            .maybeSingle();
                        if (fallbackByName) {
                            resolvedModel = fallbackByName;
                        }
                    }
                }
            }

            setActivePricingModel(resolvedModel);
            setIsB2CDefault(b2cFallback);
            setIsContractExpired(expired);

            // 3. Load prices for the resolved contract/model
            if (resolvedModel) {
                const map: Record<string, number> = {};
                const customIds = new Set<string>();

                // Fetch model prices
                const { data: activePrices } = await supabase
                    .from('pricing_model_prices')
                    .select('product_id, price')
                    .eq('model_id', resolvedModel.id);
                
                activePrices?.forEach((p: any) => {
                    map[p.product_id] = p.price;
                    if (resolvedModel.name !== 'Clientes Hogar' && resolvedModel.name !== 'Clientes B2C' && resolvedModel.name !== 'General Institucional' && !resolvedModel.is_base_model && !resolvedModel.is_agreement) {
                        customIds.add(p.product_id);
                    }
                });

                const agreementProductIds = new Set<string>();
                if (activeAgreement) {
                    const { data: qItems } = await supabase
                        .from('quote_items')
                        .select('product_id, unit_price')
                        .eq('quote_id', activeAgreement.id);
                    
                    qItems?.forEach((p: any) => {
                        map[p.product_id] = p.unit_price;
                        customIds.add(p.product_id);
                        agreementProductIds.add(p.product_id);
                    });
                }

                // Fallback institucional: precargar precios de General Institucional para productos sin tarifa específica
                if (isB2B && resolvedModel && resolvedModel.id !== GENERAL_INSTITUCIONAL_ID) {
                    const { data: genPrices } = await supabase
                        .from('pricing_model_prices')
                        .select('product_id, price')
                        .eq('model_id', GENERAL_INSTITUCIONAL_ID);
                    
                    genPrices?.forEach((p: any) => {
                        if (!map[p.product_id] && p.price > 0) {
                            map[p.product_id] = p.price;
                        }
                    });
                }

                // Fetch active campaigns targeting this B2B client
                const campMap: Record<string, { value: number; type: string; name: string }> = {};
                const effectiveClientId = selectedClient;
                if (clientType === 'B2B' && effectiveClientId) {
                    const { data: targetCampaigns } = await supabase
                        .from('campaign_targets')
                        .select('campaign_id')
                        .eq('profile_id', effectiveClientId);

                    if (targetCampaigns && targetCampaigns.length > 0) {
                        const campIds = targetCampaigns.map((tc: any) => tc.campaign_id);
                        const nowIso = new Date().toISOString();
                        const { data: activeCamps } = await supabase
                            .from('commercial_campaigns')
                            .select('*')
                            .in('id', campIds)
                            .eq('status', 'active')
                            .lte('start_date', nowIso)
                            .gte('end_date', nowIso);

                        if (activeCamps && activeCamps.length > 0) {
                            const activeCampIds = activeCamps.map((c: any) => c.id);
                            const { data: items } = await supabase
                                .from('campaign_items')
                                .select('campaign_id, product_id, adjustment_value')
                                .in('campaign_id', activeCampIds);

                            items?.forEach((item: any) => {
                                const camp = activeCamps.find((c: any) => c.id === item.campaign_id);
                                if (camp) {
                                    campMap[item.product_id] = {
                                        value: item.adjustment_value,
                                        type: camp.type,
                                        name: camp.name
                                    };
                                }
                            });
                        }
                    }
                }

                // SPEC.md Secc. 7.2: Inmunidad Contractual - Campañas aplican a productos de catálogo/modelo, NO a SKUs congelados en Acuerdo Comercial
                Object.keys(campMap).forEach((productId) => {
                    if (agreementProductIds.has(productId)) {
                        return; // Blindado por contrato vigente
                    }
                    const basePrice = map[productId] || 0;
                    if (basePrice > 0) {
                        const campaign = campMap[productId];
                        if (campaign.type === 'fixed_price') {
                            map[productId] = campaign.value;
                        } else if (campaign.type === 'margin_adjustment') {
                            map[productId] = basePrice * (1 + campaign.value / 100);
                        }
                    }
                });

                setCampaignPrices(campMap);
                setContractPrices(map);
                setCustomPriceIds(customIds);
            } else {
                setContractPrices({});
                setCustomPriceIds(new Set());
                setCampaignPrices({});
            }
        }

        resolveContract();
    }, [clientType, selectedClient, selectedClientB2C, deliveryDate, clients, b2cClients]);

    // Reactively update prices in cart when contractPrices change
    useEffect(() => {
        if (Object.keys(contractPrices).length > 0) {
            setCart(prev => prev.map(item => {
                const resolvedPrice = (contractPrices[item.product.id] !== undefined && contractPrices[item.product.id] !== null && contractPrices[item.product.id] > 0)
                    ? contractPrices[item.product.id]
                    : (item.product.base_price || 0);
                return {
                    ...item,
                    price: resolvedPrice
                };
            }));
        }
    }, [contractPrices]);

    const loadData = async () => {
        try {
            console.log("Iniciando carga de datos Maestro...");

            // 1. Clientes B2B & B2C (Parallel Fetch)
            const fetchB2B = supabase
                .from('profiles')
                .select('id, company_name, contact_name, nit, address, contact_phone, latitude, longitude, email, city, municipality, parent_id, logistics_data, delivery_restrictions, document_type, remission_with_prices, pricing_model_id, payment_days')
                .eq('role', 'b2b_client')
                .eq('is_active', true)
                .order('company_name', { ascending: true });

            const fetchB2C = supabase
                .from('profiles')
                .select('id, company_name, contact_name, nit, address, contact_phone, phone, latitude, longitude, email, city, municipality, delivery_restrictions, geocoding_status, document_type, remission_with_prices, pricing_model_id')
                .eq('role', 'b2c_client') // Matched with Admin Drivers Core
                .eq('is_active', true)
                .order('contact_name', { ascending: true });

            const fetchConversions = (async () => {
                let allConvs: any[] = [];
                let hasMore = true;
                let from = 0;
                const limit = 1000;
                while (hasMore) {
                    const { data, error } = await supabase
                        .from('product_conversions')
                        .select('*')
                        .range(from, from + limit - 1);
                    if (error) return { data: null, error };
                    if (data && data.length > 0) {
                        allConvs = [...allConvs, ...data];
                        from += limit;
                        if (data.length < limit) hasMore = false;
                    } else {
                        hasMore = false;
                    }
                }
                return { data: allConvs, error: null };
            })();

            const [resB2B, resB2C, resConvs] = await Promise.all([fetchB2B, fetchB2C, fetchConversions]);

            if (resB2B.error) console.error("Error B2B:", resB2B.error);
            else if (resB2B.data) setClients(resB2B.data);

            if (resB2C.error) console.error("Error B2C:", resB2C.error);
            else if (resB2C.data) setB2cClients(resB2C.data);

            if (resConvs.error) console.error("Error Conversions:", resConvs.error);
            else if (resConvs.data) setConversions(resConvs.data);

            // 2. Productos
            const { data: prods, error: errorProds } = await supabase
                .from('products')
                .select('id, accounting_id, sku, name, base_price, unit_of_measure, image_url, options_config, weight_kg, web_unit, web_conversion_factor, iva_rate')
                .eq('is_active', true)
                .order('name');

            if (errorProds) console.error("Error cargando productos:", errorProds);
            if (prods) setProducts(prods);

            // 3. Cargar Borrador de Correo si viene draft_id
            const draftId = searchParams.get('draft_id');
            if (draftId && prods) {
                console.log("Cargando borrador de pedido:", draftId);
                const { data: draft, error: draftErr } = await supabase
                    .from('order_drafts')
                    .select('*')
                    .eq('id', draftId)
                    .single();
                
                if (draftErr) {
                    console.error("Error cargando borrador:", draftErr);
                } else if (draft) {
                    // Cargar observaciones
                    if (draft.email_subject || draft.email_body) {
                        setAdminNotes(`[PEDIDO CORREO] Asunto: ${draft.email_subject || ''}\n---\n${draft.email_body || ''}\n---\n`);
                    }
                    
                    // Cargar fecha de entrega si viene en la metadata del borrador
                    const items = draft.extracted_items || [];
                    const metadataItem = items.find((i: any) => i.isMetadata);
                    if (metadataItem?.deliveryDate) {
                        setDeliveryDate(metadataItem.deliveryDate);
                    }
                    
                    // Asociar cliente si existe
                    if (draft.profile_id) {
                        const b2bMatch = (resB2B.data || []).find(c => c.id === draft.profile_id);
                        if (b2bMatch) {
                            setClientType('B2B');
                            setSelectedClient(b2bMatch.id);
                            if (b2bMatch.latitude && b2bMatch.longitude) {
                                setLatitude(b2bMatch.latitude);
                                setLongitude(b2bMatch.longitude);
                            }
                        } else {
                            const b2cMatch = (resB2C.data || []).find(c => c.id === draft.profile_id);
                            const detectedName = draft.client_detected_name || '';
                            const namesMatch = (detName: string, profName: string): boolean => {
                                if (!detName || !profName) return false;
                                const norm1 = detName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                const norm2 = profName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                const words1 = norm1.split(/\s+/).filter(w => w.length > 2);
                                const words2 = norm2.split(/\s+/).filter(w => w.length > 2);
                                return words1.some(w => words2.includes(w));
                            };
                            
                            const shouldMatch = b2cMatch && (!detectedName || namesMatch(detectedName, b2cMatch.contact_name || '') || namesMatch(detectedName, b2cMatch.company_name || ''));

                            if (shouldMatch && b2cMatch) {
                                setClientType('B2C');
                                setB2CMode('search');
                                setSelectedClientB2C(b2cMatch.id);
                                setGuestInfo({
                                    name: b2cMatch.contact_name || b2cMatch.company_name || '',
                                    phone: b2cMatch.phone || b2cMatch.contact_phone || '',
                                    address: b2cMatch.address || '',
                                    city: b2cMatch.city || 'Bogotá',
                                    email: b2cMatch.email || '',
                                    nit: b2cMatch.nit || '',
                                    saveToDirectory: true
                                });
                                if (b2cMatch.latitude && b2cMatch.longitude) {
                                    setLatitude(b2cMatch.latitude);
                                    setLongitude(b2cMatch.longitude);
                                }
                            } else {
                                const items = draft.extracted_items || [];
                                const metadataItem = items.find((i: any) => i.isMetadata);
                                const extractedAddress = metadataItem?.address || draft.extracted_address || '';
                                const extractedPhone = metadataItem?.phone || draft.extracted_phone || '';
                                const extractedNit = metadataItem?.nit || draft.extracted_nit || '';
                                const draftClientTypeVal = metadataItem?.clientType || 'b2c_client';
                                setDraftClientType(draftClientTypeVal);

                                if (draftClientTypeVal === 'b2b_client') {
                                    setClientType('B2B');
                                } else {
                                    setClientType('B2C');
                                    setB2CMode('new');
                                }
                                setGuestInfo(prev => ({
                                    ...prev,
                                    name: draft.client_detected_name || '',
                                    email: draft.source_email || '',
                                    address: extractedAddress,
                                    phone: extractedPhone,
                                    nit: extractedNit,
                                    saveToDirectory: true
                                }));
                            }
                        }
                    } else {
                        // Extraer metadata si existe (para evitar errores SQL, los guardamos en el primer item)
                        const items = draft.extracted_items || [];
                        const metadataItem = items.find((i: any) => i.isMetadata);
                        const actualItems = items.filter((i: any) => !i.isMetadata);
                        
                        const extractedAddress = metadataItem?.address || draft.extracted_address || '';
                        const extractedPhone = metadataItem?.phone || draft.extracted_phone || '';
                        const extractedNit = metadataItem?.nit || draft.extracted_nit || '';
                        const draftClientTypeVal = metadataItem?.clientType || 'b2c_client';
                        setDraftClientType(draftClientTypeVal);

                        if (draftClientTypeVal === 'b2b_client') {
                            setClientType('B2B');
                        } else {
                            setClientType('B2C');
                            setB2CMode('new');
                        }
                        setGuestInfo(prev => ({
                            ...prev,
                            name: draft.client_detected_name || '',
                            email: draft.source_email || '',
                            address: extractedAddress,
                            phone: extractedPhone,
                            nit: extractedNit
                        }));
                        if (extractedAddress) {
                            handleGeocode(extractedAddress, 'Bogotá');
                        }

                        // Cargar productos al carrito
                        if (actualItems && actualItems.length > 0) {
                            setLoading(true);
                            const { data: dbProducts } = await supabase
                                .from('products')
                                .select('*')
                                .eq('is_active', true);
                            
                            if (dbProducts) {
                                const newCartItems: any[] = [];
                                actualItems.forEach((item: any) => {
                                    const matchedProd = dbProducts.find((p: any) => {
                                        if (item.matched_product_id) return p.id === item.matched_product_id;
                                        return item.originalName.toLowerCase().includes(p.name.toLowerCase()) ||
                                               p.name.toLowerCase().includes(item.originalName.toLowerCase().split(' ')[0]);
                                    });
                                    if (matchedProd) {
                                        newCartItems.push({
                                            product: matchedProd,
                                            qty: item.quantity || 1,
                                            variant_label: undefined,
                                            selected_options: undefined
                                        });
                                    }
                                });
                                setCart(newCartItems);
                            }
                        }
                    }
                }
            }

            // 4. Cargar Parámetros de Reposición / PQR (si viene clientId o pqrId o replacement)
            const paramClientId = searchParams.get('clientId') || searchParams.get('profile_id') || searchParams.get('client_id');
            const paramPqrId = searchParams.get('pqrId');
            const paramProductId = searchParams.get('productId');
            const paramProductQuery = searchParams.get('productQuery');
            const paramQty = searchParams.get('quantity');
            const paramNotes = searchParams.get('notes');
            const isReplacement = searchParams.get('replacement') === 'true' || searchParams.get('isReplacement') === 'true';

            if (paramClientId) {
                const b2bMatch = (resB2B.data || []).find(c => c.id === paramClientId);
                if (b2bMatch) {
                    setClientType('B2B');
                    setSelectedClient(b2bMatch.id);
                    if (b2bMatch.latitude && b2bMatch.longitude) {
                        setLatitude(b2bMatch.latitude);
                        setLongitude(b2bMatch.longitude);
                    }
                } else {
                    const b2cMatch = (resB2C.data || []).find(c => c.id === paramClientId);
                    if (b2cMatch) {
                        setClientType('B2C');
                        setB2CMode('search');
                        setSelectedClientB2C(b2cMatch.id);
                        setGuestInfo({
                            name: b2cMatch.contact_name || b2cMatch.company_name || '',
                            phone: b2cMatch.phone || b2cMatch.contact_phone || '',
                            address: b2cMatch.address || '',
                            city: b2cMatch.city || 'Bogotá',
                            email: b2cMatch.email || '',
                            nit: b2cMatch.nit || '',
                            saveToDirectory: true
                        });
                        if (b2cMatch.latitude && b2cMatch.longitude) {
                            setLatitude(b2cMatch.latitude);
                            setLongitude(b2cMatch.longitude);
                        }
                    }
                }
            }

            if (paramNotes) {
                setAdminNotes(prev => prev ? `${prev}\n${paramNotes}` : paramNotes);
            }

            if (isReplacement) {
                setOriginSource('phone');
            }

            // Auto-sugerir / precargar producto a reponer en el carrito
            if (prods && prods.length > 0 && (paramProductId || paramProductQuery)) {
                let matchedProd = null;
                if (paramProductId) {
                    matchedProd = prods.find(p => p.id === paramProductId);
                }
                if (!matchedProd && paramProductQuery) {
                    const cleanQ = paramProductQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                    const queryTokens = cleanQ.split(/\s+/).filter(Boolean);
                    matchedProd = prods.find(p => {
                        const n = (p.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        return queryTokens.every(tok => n.includes(tok));
                    });
                    if (!matchedProd) {
                        matchedProd = prods.find(p => {
                            const n = (p.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                            return queryTokens.some(tok => n.includes(tok));
                        });
                    }
                }

                if (matchedProd) {
                    const qtyNum = paramQty ? parseFloat(paramQty) || 1 : 1;
                    const baseUnit = matchedProd.unit_of_measure || 'Kg';
                    setCart(prev => {
                        if (prev.some(item => item.product.id === matchedProd.id)) return prev;
                        return [...prev, {
                            product: matchedProd,
                            qty: qtyNum,
                            originalQty: qtyNum,
                            originalUnit: baseUnit,
                            conversion_factor: 1,
                            price: isReplacement ? 0 : (matchedProd.base_price || 0),
                            observations: isReplacement ? `Reposición por PQR #${paramPqrId ? paramPqrId.substring(0, 8) : ''}` : ''
                        }];
                    });
                }
            }
        } catch (e) {
            console.error("Excepción en loadData:", e);
        }
    };

    // --- PRODUCT SEARCH & ADD FLOW ---

    // B2C HELPERS
    const getSelectedB2CDetails = () => b2cClients.find(c => c.id === selectedClientB2C);

    const selectClientB2C = (client: any) => {
        setSelectedClientB2C(client.id);
        setGuestInfo({
            name: client.contact_name || client.company_name || '',
            phone: client.phone || client.contact_phone || '',
            address: client.address || '',
            city: client.city || 'Bogotá',
            email: client.email || '',
            nit: client.nit || '',
            saveToDirectory: true
        });
        if (client.latitude && client.longitude) {
            setLatitude(client.latitude);
            setLongitude(client.longitude);
            setLastGeocodedAddress(client.address || '');
            if (client.geocoding_status === 'OVERRIDE' || (client.delivery_restrictions && client.delivery_restrictions.includes('EXCEPCIÓN'))) {
                setOutOfZone(true);
                setHasCoverageOverride(true);
                setCoverageOverrideReason(client.delivery_restrictions ? client.delivery_restrictions.replace('EXCEPCIÓN AUTORIZADA: ', '') : 'Excepción Guardada en BD');
            } else {
                setOutOfZone(false);
                setHasCoverageOverride(false);
                setCoverageOverrideReason('');
            }
        }
        setClientSearchB2C('');
    };

    const filteredClientsB2C = clientSearchB2C.length < 2 ? [] : b2cClients.filter(c => {
        const term = clientSearchB2C.toLowerCase();
        return (
            (c.company_name && c.company_name.toLowerCase().includes(term)) ||
            (c.contact_name && c.contact_name.toLowerCase().includes(term)) ||
            (c.contact_phone && c.contact_phone.includes(term))
        );
    });

    const handleProductClick = (product: any) => {
        if (scarcityLockedMap[product.id]) {
            showToast(`🚫 "${product.name}" no se puede agregar al pedido: Insumo bloqueado por escasez en el mercado.`, 'error');
            return;
        }

        // Reset modal state
        setModalQuantity(1);
        setSelectedOptions({});

        // 1. Check for product substitution exception
        const exc = clientExceptions.find(e => e.product_id === product.id);
        if (exc && exc.substitution_product_id) {
            const subProduct = products.find(p => p.id === exc.substitution_product_id);
            if (subProduct) {
                const confirmSwap = window.confirm(`El cliente prefiere sustituir "${product.name}" por "${subProduct.name}". ¿Desea aplicar la sustitución?`);
                if (confirmSwap) {
                    handleProductClick(subProduct);
                    return;
                }
            }
        }

        // 2. Pre-populate preferred variant options (if any)
        const initialOptions: Record<string, string> = {};
        if (exc && exc.preferred_options && typeof exc.preferred_options === 'object') {
            Object.entries(exc.preferred_options).forEach(([k, v]) => {
                initialOptions[k] = String(v);
            });
        }
        setSelectedOptions(initialOptions);

        // Always open the product modal to specify quantity, unit, or options
        setSelectedProductForModal(product);
        setProductSearch('');
        setFocusedProductIndex(-1);
    };

    const addToCartDirectly = (
        product: any, 
        qty: number, 
        variantLabel?: string, 
        optionsRaw?: any,
        unit?: string,
        factor?: number,
        bypassDuplicateCheck = false
    ) => {
        const exc = clientExceptions.find(e => e.product_id === product.id);
        let finalLabel = variantLabel || '';
        let finalNickname = exc?.nickname || product.name;

        const resolvedFactor = factor || 1;
        const resolvedUnit = unit || product.unit_of_measure || 'Kg';
        const baseQty = parseFloat((qty * resolvedFactor).toFixed(3));

        // Poka-Yoke: Validar cantidad mínima de venta para productos por peso
        const minAllowedKg = getProductMinSaleKg(product);
        if (minAllowedKg !== null && baseQty < minAllowedKg - 0.0001) {
            showToast(`La cantidad mínima de venta para ${product.name} es de ${formatWeightKg(minAllowedKg)} kg`, 'error');
            return;
        }

        if (!bypassDuplicateCheck) {
            const cleanLabel = (finalLabel || '').trim().toLowerCase();
            const cleanUnit = (resolvedUnit || '').trim().toLowerCase();

            const existingIndex = cart.findIndex(item => {
                const itemLabel = (item.variant_label || '').trim().toLowerCase();
                const itemUnit = (item.originalUnit || item.product?.unit_of_measure || 'Kg').trim().toLowerCase();
                return item.product.id === product.id && itemLabel === cleanLabel && itemUnit === cleanUnit;
            });

            if (existingIndex >= 0) {
                const existingItem = cart[existingIndex];
                const existingQty = existingItem.originalQty !== undefined ? existingItem.originalQty : existingItem.qty;
                setDuplicateConfirm({
                    isOpen: true,
                    product,
                    qty,
                    existingQty,
                    variantLabel,
                    optionsRaw,
                    unit: resolvedUnit,
                    factor: resolvedFactor,
                    existingIndex
                });
                return;
            }
        }

        const resolvedPrice = (contractPrices[product.id] !== undefined && contractPrices[product.id] !== null && contractPrices[product.id] > 0)
            ? contractPrices[product.id]
            : (clientType === 'B2B' && product.base_price
                ? Math.ceil((product.base_price / 1.19) / 50) * 50
                : (product.base_price || 0));
        setCart(prev => [{ 
            product, 
            qty: baseQty, 
            price: resolvedPrice,
            originalQty: qty,
            originalUnit: resolvedUnit,
            conversion_factor: resolvedFactor,
            variant_label: finalLabel || undefined, 
            selected_options: optionsRaw || {},
            nickname: finalNickname,
            picking_note: exc?.picking_note || undefined,
            delivery_note: exc?.delivery_note || undefined
        }, ...prev]);
    };

    const handleMergeDuplicateItem = () => {
        if (!duplicateConfirm) return;
        const { existingIndex, qty, factor } = duplicateConfirm;
        const resolvedFactor = factor || 1;
        setCart(prev => {
            const newCart = [...prev];
            if (newCart[existingIndex]) {
                const item = { ...newCart[existingIndex] };
                item.originalQty = parseFloat(((item.originalQty || 0) + qty).toFixed(3));
                item.qty = parseFloat((item.originalQty * (item.conversion_factor || resolvedFactor)).toFixed(3));
                newCart[existingIndex] = item;
            }
            return newCart;
        });
        setDuplicateConfirm(null);
        showToast('Cantidad acumulada en la línea existente. ✅', 'success');
    };

    const handleKeepDuplicateAsSeparate = () => {
        if (!duplicateConfirm) return;
        const { product, qty, variantLabel, optionsRaw, unit, factor } = duplicateConfirm;
        addToCartDirectly(product, qty, variantLabel, optionsRaw, unit, factor, true);
        setDuplicateConfirm(null);
        showToast('Producto agregado como una fila separada. ✅', 'success');
    };

    const handleConsolidateAllCartDuplicates = () => {
        setCart(prev => {
            const map = new Map<string, any>();
            let mergedCount = 0;
            prev.forEach(item => {
                const cleanLabel = (item.variant_label || '').trim().toLowerCase();
                const cleanUnit = (item.originalUnit || item.product?.unit_of_measure || 'Kg').trim().toLowerCase();
                const key = `${item.product.id}_${cleanLabel}_${cleanUnit}`;

                if (map.has(key)) {
                    const existing = { ...map.get(key) };
                    const addQty = item.originalQty !== undefined ? item.originalQty : item.qty;
                    const newOrigQty = parseFloat(((existing.originalQty || 0) + addQty).toFixed(3));
                    const factor = existing.conversion_factor || item.conversion_factor || 1;
                    existing.originalQty = newOrigQty;
                    existing.qty = parseFloat((newOrigQty * factor).toFixed(3));
                    if (item.picking_note && !existing.picking_note) existing.picking_note = item.picking_note;
                    if (item.delivery_note && !existing.delivery_note) existing.delivery_note = item.delivery_note;
                    map.set(key, existing);
                    mergedCount++;
                } else {
                    map.set(key, { ...item });
                }
            });
            if (mergedCount > 0) {
                showToast(`✅ Se consolidaron ${mergedCount} filas duplicadas en el pedido.`, 'success');
            } else {
                showToast('No se encontraron líneas duplicadas para consolidar.', 'info');
            }
            return Array.from(map.values());
        });
    };

    const handleLoadLastOrderForB2C = async () => {
        const b2c = b2cClients.find(c => c.id === selectedClientB2C);
        if (!b2c) {
            showToast('Por favor selecciona un cliente B2C existente primero.', 'error');
            return;
        }

        try {
            setLoadingLastOrderB2C(true);
            const params = new URLSearchParams();
            if (b2c.id) params.set('profile_id', b2c.id);
            if (b2c.email) params.set('email', b2c.email);
            if (b2c.contact_phone || b2c.phone) params.set('phone', b2c.contact_phone || b2c.phone);
            if (b2c.nit) params.set('identification', b2c.nit);

            const res = await fetch(`/api/orders/last-purchase?${params.toString()}`);
            const data = await res.json();

            if (!res.ok || !data.success || !data.items || data.items.length === 0) {
                showToast(data.error || 'No se encontraron compras anteriores asociadas a este cliente.', 'info');
                return;
            }

            // Convert items from API into CartItems format
            const itemsToInject: any[] = [];
            for (const item of data.items) {
                const prod = products.find(p => p.id === item.id);
                if (!prod) continue;

                const resolvedUnit = item.unit || prod.unit_of_measure || 'Kg';
                // For B2C existing clients, item.price comes directly with today's B2C model price from API
                const resolvedPrice = item.price > 0 ? item.price : (contractPrices[prod.id] || prod.base_price || 0);

                itemsToInject.push({
                    product: prod,
                    qty: item.quantity || 1,
                    originalQty: item.quantity || 1,
                    originalUnit: resolvedUnit,
                    price: resolvedPrice,
                    conversion_factor: 1,
                    is_from_last_order: true
                });
            }

            if (itemsToInject.length === 0) {
                showToast('Los productos del último pedido no se encuentran activos actualmente en el catálogo.', 'info');
                return;
            }

            // Consolidate into existing cart
            let mergedCount = 0;
            setCart(prev => {
                const result = [...prev];
                for (const newItem of itemsToInject) {
                    const cleanLabel = (newItem.variant_label || '').trim().toLowerCase();
                    const cleanUnit = (newItem.originalUnit || newItem.product?.unit_of_measure || 'Kg').trim().toLowerCase();
                    const existingIdx = result.findIndex(item =>
                        item.product.id === newItem.product.id &&
                        (item.variant_label || '').trim().toLowerCase() === cleanLabel &&
                        (item.originalUnit || item.product?.unit_of_measure || 'Kg').trim().toLowerCase() === cleanUnit
                    );

                    if (existingIdx >= 0) {
                        const existingItem = { ...result[existingIdx] };
                        const addQty = newItem.originalQty !== undefined ? newItem.originalQty : newItem.qty;
                        const newOrigQty = parseFloat(((existingItem.originalQty || 0) + addQty).toFixed(3));
                        const factor = existingItem.conversion_factor || newItem.conversion_factor || 1;
                        existingItem.originalQty = newOrigQty;
                        existingItem.qty = parseFloat((newOrigQty * factor).toFixed(3));
                        existingItem.is_from_last_order = true;
                        result[existingIdx] = existingItem;
                        mergedCount++;
                    } else {
                        result.unshift(newItem);
                    }
                }
                return result;
            });

            if (mergedCount > 0) {
                showToast(`✅ Se cargaron ${itemsToInject.length - mergedCount} productos nuevos y se consolidaron ${mergedCount} cantidades del último pedido (Tarifa B2C de hoy aplicada).`, 'success');
            } else {
                showToast(`✅ Se cargaron ${itemsToInject.length} productos del último pedido (Tarifa B2C de hoy aplicada).`, 'success');
            }
        } catch (err: any) {
            console.error('Error al cargar último pedido B2C:', err);
            showToast('Error al consultar la última compra del cliente.', 'error');
        } finally {
            setLoadingLastOrderB2C(false);
        }
    };

    const handleSaveVariantsFromOrder = async (productId: string, optionsConfig: any[] | null, variants: any[] | null): Promise<boolean> => {
        try {
            const { error: prodError } = await supabase
                .from('products')
                .update({
                    options_config: optionsConfig,
                    variants: variants,
                    options: (optionsConfig || []).reduce((acc: any, opt: any) => {
                        acc[opt.name] = opt.values;
                        return acc;
                    }, {})
                })
                .eq('id', productId);

            if (prodError) throw prodError;

            // Sincronizar tabla dedicada product_variants
            if (variants && variants.length > 0) {
                await supabase
                    .from('product_variants')
                    .delete()
                    .eq('product_id', productId);

                const usedBatchSkus = new Set<string>();
                const formattedVariants = variants.map((v: any, idx: number) => {
                    let finalSku = (v.sku || `${productId}-${idx + 1}`).trim();
                    let counter = 1;
                    const baseSku = finalSku;
                    while (usedBatchSkus.has(finalSku)) {
                        counter++;
                        finalSku = `${baseSku}-${counter}`;
                    }
                    usedBatchSkus.add(finalSku);

                    return {
                        product_id: productId,
                        sku: finalSku,
                        options: v.options,
                        image_url: v.image_url,
                        price_adjustment_percent: v.price_adjustment_percent || v.price_adj_pct || 0,
                        is_active: v.is_active ?? true
                    };
                });

                const { error: variantError } = await supabase
                    .from('product_variants')
                    .insert(formattedVariants);

                if (variantError) throw variantError;
            }

            return true;
        } catch (err: any) {
            console.error('Error al guardar variantes desde pedido:', err);
            alert('Error al guardar variantes: ' + err.message);
            return false;
        }
    };

    const handleVariantImageUploadFromOrder = async (file: File): Promise<string | null> => {
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(filePath);

            return publicUrl;
        } catch (err: any) {
            console.error('Error subiendo imagen de variante:', err);
            alert('Error al subir imagen de variante: ' + err.message);
            return null;
        }
    };

    const confirmModalAdd = () => {
        if (!selectedProductForModal) return;
        const sortedOptionKeys = Object.keys(selectedOptions).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        const optionValues = sortedOptionKeys.filter(k => selectedOptions[k]).map(k => selectedOptions[k]);
        const variantLabel = optionValues.length > 0 ? optionValues.map(v => String(v).includes('|') ? `${String(v).split('|')[0]} (${String(v).split('|')[1]} gr)` : v).join(', ') : undefined;
        const qtyNum = parseFloat(String(modalQuantity).replace(',', '.')) || 1;
        
        let resolvedUnit = modalUnit || selectedProductForModal.unit_of_measure || 'Kg';
        let resolvedFactor = modalFactor || (selectedProductForModal.weight_kg ? Number(selectedProductForModal.weight_kg) : 1);
        const baseUnitLower = (selectedProductForModal.unit_of_measure || 'Kg').toLowerCase();
        const isKgProduct = baseUnitLower === 'kg' || baseUnitLower === 'kilo' || baseUnitLower === 'kilogramo';

        Object.entries(selectedOptions).forEach(([optName, optVal]) => {
            if ((optName.toLowerCase().includes('presentaci') || optName.toLowerCase().includes('unidad')) && optVal) {
                const strVal = String(optVal);
                const clean = (strVal.includes('|') ? strVal.split('|')[0] : strVal).trim().toLowerCase();
                if (clean === 'kg' || clean === 'kilo' || clean === 'kilogramo' || clean === baseUnitLower) {
                    resolvedUnit = selectedProductForModal.unit_of_measure || 'Kg';
                    resolvedFactor = 1;
                } else if (strVal.includes('|')) {
                    const [base, gr] = strVal.split('|');
                    resolvedUnit = `${base} de ${gr} gr`;
                    const pw = parseFloat(gr);
                    if (!isNaN(pw) && pw > 0) resolvedFactor = pw / 1000;
                } else {
                    resolvedUnit = strVal;
                    const pw = getParsedWeight(strVal);
                    if (pw !== null) resolvedFactor = pw;
                }
            }
        });

        const baseQty = parseFloat((qtyNum * resolvedFactor).toFixed(3));
        const isDiscreteUnit = !['kg', 'kilo', 'kilos'].includes((resolvedUnit || '').trim().toLowerCase());
        if (isDiscreteUnit && (!Number.isInteger(qtyNum) || qtyNum < 1)) {
            showToast('Para esta presentación la cantidad debe ser un número entero (1, 2, 3...)', 'error');
            const qtyInput = document.getElementById('modal-qty-input');
            if (qtyInput) {
                (qtyInput as HTMLElement).focus();
                (qtyInput as HTMLInputElement).select();
            }
            return;
        }

        // Poka-Yoke: Validar cantidad mínima de venta para productos por peso
        const minAllowedKg = getProductMinSaleKg(selectedProductForModal);

        if (minAllowedKg !== null && baseQty < minAllowedKg - 0.0001) {
            showToast(`La cantidad mínima de venta para este producto es de ${formatWeightKg(minAllowedKg)} kg`, 'error');
            const qtyInput = document.getElementById('modal-qty-input');
            if (qtyInput) {
                (qtyInput as HTMLElement).focus();
                (qtyInput as HTMLInputElement).select();
            }
            return;
        }

        // ── Dual-unit metadata: preserve physical count alongside billing Kg ──
        // When a conversion factor is applied (e.g. 30 Unidades × 550 gr = 16.5 Kg),
        // we embed the original physical instruction into selected_options so it
        // flows through to DB and surfaces in loading, alistamiento-print and picking.
        const dual = buildDualUnitMetadata({
            quantity: qtyNum,
            unit: resolvedUnit,
            selectedOptions,
            product: selectedProductForModal
        });

        const enrichedOptions = dual
            ? {
                ...selectedOptions,
                _original_qty: dual.originalQty,
                _conversion_factor: dual.conversionFactor,
                _original_unit: dual.originalUnit,
                _unit_weight_gr: dual.unitWeightGr,
                _physical_instruction: dual.physicalInstruction
            }
            : (resolvedFactor !== 1
                ? {
                    ...selectedOptions,
                    _original_qty: qtyNum,
                    _conversion_factor: resolvedFactor,
                    _original_unit: resolvedUnit,
                    _physical_instruction: cleanPhysicalInstruction(`${qtyNum} ${resolvedUnit}`) || `${qtyNum} ${resolvedUnit}`
                }
                : { ...selectedOptions });

        if (editingStagedItemId !== null) {
            const nextIdx = editingStagedItemIdx !== null ? editingStagedItemIdx + 1 : null;
            const duplicateIndex = stagedItems.findIndex((item, idx) =>
                item.id !== editingStagedItemId && item.suggestedProduct?.id === selectedProductForModal.id
            );

            if (duplicateIndex >= 0) {
                const rowIdx = editingStagedItemIdx !== null ? editingStagedItemIdx : stagedItems.findIndex(i => i.id === editingStagedItemId);
                setDuplicateStagedMatchConfirm({
                    isOpen: true,
                    product: selectedProductForModal,
                    stagedItemId: editingStagedItemId,
                    rowIndex: rowIdx,
                    duplicateIndex,
                    pendingOptions: enrichedOptions,
                    pendingQty: baseQty,
                    pendingVariantLabel: variantLabel,
                    pendingUnit: resolvedUnit,
                    pendingFactor: resolvedFactor
                });
                setSelectedProductForModal(null);
                setEditingCartIndex(null);
                setEditingStagedItemId(null);
                setEditingStagedItemIdx(null);
                return;
            }

            setStagedItems(prev => prev.map(item => {
                if (item.id === editingStagedItemId) {
                    return {
                        ...item,
                        suggestedProduct: selectedProductForModal,
                        quantity: baseQty,
                        variant_label: variantLabel,
                        selected_options: enrichedOptions,
                        originalQty: qtyNum,
                        originalUnit: resolvedUnit,
                        conversion_factor: resolvedFactor,
                        status: 'MATCH',
                        isConfirmed: true
                    };
                }
                return item;
            }));

            // Close modal by resetting state
            setSelectedProductForModal(null);
            setEditingCartIndex(null);
            setEditingStagedItemId(null);
            setEditingStagedItemIdx(null);

            // Shift focus to the next row's SKU input or to the Confirm button if it was the last row
            if (nextIdx !== null) {
                setTimeout(() => {
                    const nextInput = document.getElementById(`sku-input-${nextIdx}`);
                    if (nextInput) {
                        (nextInput as HTMLElement).focus();
                        (nextInput as HTMLInputElement).select();
                        scrollToStagedRow(nextIdx);
                    } else {
                        // Focus the confirm and inject button!
                        const confirmBtn = document.getElementById('confirm-inject-button');
                        if (confirmBtn) {
                            confirmBtn.focus();
                            confirmBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }
                }, 80);
            }
        } else if (editingCartIndex !== null) {
            const finalLabel = variantLabel || '';

            setCart(prev => prev.map((c, i) => i === editingCartIndex ? {
                ...c,
                qty: baseQty,
                originalQty: qtyNum,
                originalUnit: resolvedUnit,
                conversion_factor: resolvedFactor,
                variant_label: finalLabel || undefined,
                selected_options: enrichedOptions
            } : c));
            closeProductModal();
        } else {
            addToCartDirectly(
                selectedProductForModal, 
                qtyNum, 
                variantLabel, 
                enrichedOptions,
                resolvedUnit,
                resolvedFactor
            );
            closeProductModal();
        }
    };

    // Auto-scroll anclado: Fija siempre el SKU activo en el Renglón 2 (dejando 1 fila de contexto arriba)
    const scrollToStagedRow = (targetIdx: number) => {
        setTimeout(() => {
            const container = document.getElementById('staged-table-scroll-container');
            const row = document.getElementById(`staged-row-${targetIdx}`);
            if (!container || !row) return;

            if (targetIdx === 0) {
                container.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            const thead = container.querySelector('thead');
            const theadHeight = thead ? thead.clientHeight : 35;
            const prevRow = document.getElementById(`staged-row-${targetIdx - 1}`);
            const slotOffset = prevRow ? prevRow.offsetHeight : 68;
            const targetScroll = Math.max(0, row.offsetTop - theadHeight - slotOffset);

            container.scrollTo({
                top: targetScroll,
                behavior: 'smooth'
            });
        }, 15);
    };

    const openModalForStagedItem = (
        stagedId: string, 
        product: any, 
        qty: number,
        rowIdx: number,
        selectedOptionsMap?: any,
        originalQty?: number,
        originalUnit?: string,
        factor?: number
    ) => {
        setEditingStagedItemId(stagedId);
        setEditingStagedItemIdx(rowIdx);
        setSelectedProductForModal(product);

        const exc = clientExceptions.find(e => e.product_id === product.id);
        const mergedOptions = (selectedOptionsMap && Object.keys(selectedOptionsMap).length > 0)
            ? { ...(exc?.preferred_options && typeof exc.preferred_options === 'object' ? exc.preferred_options : {}), ...selectedOptionsMap }
            : (exc?.preferred_options && typeof exc.preferred_options === 'object' ? { ...exc.preferred_options } : {});
        setSelectedOptions(mergedOptions);
        
        const stagedItem = stagedItems.find(item => item.id === stagedId);
        const effectiveQty = stagedItem ? stagedItem.quantity : qty;

        setModalQuantity(effectiveQty);
        setModalUnit(product.unit_of_measure || 'Kg');
        setModalFactor(1);
    };

    const closeProductModal = () => {
        const currentStagedIdx = editingStagedItemIdx;
        setSelectedProductForModal(null);
        setEditingCartIndex(null);
        setEditingStagedItemId(null);
        setEditingStagedItemIdx(null);
        setTimeout(() => {
            if (currentStagedIdx !== null) {
                const currentInput = document.getElementById(`sku-input-${currentStagedIdx}`);
                if (currentInput) {
                    (currentInput as HTMLElement).focus();
                    (currentInput as HTMLInputElement).select();
                    scrollToStagedRow(currentStagedIdx);
                }
            } else if (productSearchInputRef.current) {
                productSearchInputRef.current.focus();
            }
        }, 80);
    };

    // --- MANEJO DE DUPLICADOS EN TABLA DE AUDITORÍA (STAGING) ---
    const selectStagedProduct = (
        stagedItemId: string,
        product: any,
        rowIdx: number,
        options?: any,
        qty?: number,
        openModalAfter?: boolean,
        variantLabel?: string,
        unit?: string,
        factor?: number
    ) => {
        if (!product) return;

        // Check if another active row in staged items already has this product
        const duplicateIndex = stagedItems.findIndex((item, idx) =>
            idx !== rowIdx && item.id !== stagedItemId && item.suggestedProduct?.id === product.id
        );

        if (duplicateIndex >= 0) {
            setDuplicateStagedMatchConfirm({
                isOpen: true,
                product,
                stagedItemId,
                rowIndex: rowIdx,
                duplicateIndex,
                pendingOptions: options,
                pendingQty: qty,
                pendingUnit: unit,
                pendingFactor: factor,
                pendingVariantLabel: variantLabel,
                openModalAfterKeep: openModalAfter
            });
            return;
        }

        executeSelectStagedProduct(stagedItemId, product, rowIdx, options, qty, openModalAfter, variantLabel, unit, factor);
    };

    const executeSelectStagedProduct = (
        stagedItemId: string,
        product: any,
        rowIdx: number,
        options?: any,
        qty?: number,
        openModalAfter?: boolean,
        variantLabel?: string,
        unit?: string,
        factor?: number
    ) => {
        setStagedItems(prev => prev.map((item, idx) => {
            if (item.id === stagedItemId || idx === rowIdx) {
                const resolvedUnit = unit || item.originalUnit || product.unit_of_measure || 'Kg';
                const resolvedFactor = factor !== undefined ? factor : (item.conversion_factor || 1);
                const resolvedQty = qty !== undefined ? qty : item.quantity;
                return {
                    ...item,
                    suggestedProduct: product,
                    originalUnit: resolvedUnit,
                    conversion_factor: resolvedFactor,
                    quantity: resolvedQty,
                    variant_label: variantLabel !== undefined ? variantLabel : item.variant_label,
                    selected_options: options !== undefined ? options : item.selected_options,
                    searchQuery: `${product.name} (${getAccountingIdDisplay(product)})`,
                    status: 'MATCH',
                    isConfirmed: true
                };
            }
            return item;
        }));

        setActiveRowSearchQuery(null);
        setActiveDropdownRowIndex(null);

        if (openModalAfter) {
            const item = stagedItems.find(i => i.id === stagedItemId) || stagedItems[rowIdx];
            openModalForStagedItem(
                stagedItemId,
                product,
                qty !== undefined ? qty : (item?.quantity || 1),
                rowIdx,
                options || item?.selected_options,
                item?.originalQty,
                item?.originalUnit,
                item?.conversion_factor
            );
        }
    };

    const handleMergeStagedDuplicateMatch = () => {
        if (!duplicateStagedMatchConfirm) return;
        const { stagedItemId, rowIndex, duplicateIndex, product } = duplicateStagedMatchConfirm;

        setStagedItems(prev => {
            const currentItem = prev.find(i => i.id === stagedItemId) || prev[rowIndex];
            const existingItem = prev[duplicateIndex];
            if (!existingItem || !currentItem) return prev;

            const currentOrigQtyInFile = parseFloat(currentItem.originalQtyInFile || currentItem.originalQty || currentItem.quantity || '0');
            const existingOrigQtyInFile = parseFloat(existingItem.originalQtyInFile || existingItem.originalQty || existingItem.quantity || '0');
            const sumOrigQtyInFile = parseFloat((existingOrigQtyInFile + currentOrigQtyInFile).toFixed(3));

            const currentQty = parseFloat(currentItem.quantity || '0');
            const existingQty = parseFloat(existingItem.quantity || '0');
            const sumQty = parseFloat((existingQty + currentQty).toFixed(3));

            const currentOrigQty = parseFloat(currentItem.originalQty || '0');
            const existingOrigQty = parseFloat(existingItem.originalQty || '0');
            const sumOrigQty = parseFloat((existingOrigQty + currentOrigQty).toFixed(3));

            const mergedObservations = [existingItem.observations, currentItem.observations]
                .filter(Boolean)
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(' | ');

            const mergedOptions = {
                ...(existingItem.selected_options || {}),
                ...(currentItem.selected_options || {})
            };

            const updatedExisting = {
                ...existingItem,
                suggestedProduct: existingItem.suggestedProduct || product,
                originalQtyInFile: sumOrigQtyInFile > 0 ? sumOrigQtyInFile : sumQty,
                originalQty: sumOrigQty > 0 ? sumOrigQty : sumQty,
                quantity: sumQty,
                observations: mergedObservations,
                selected_options: mergedOptions,
                isConfirmed: true,
                status: 'MATCH'
            };

            return prev
                .map((item, idx) => idx === duplicateIndex ? updatedExisting : item)
                .filter(item => item.id !== stagedItemId && item.id !== currentItem.id);
        });

        setDuplicateStagedMatchConfirm(null);
        setActiveRowSearchQuery(null);
        setActiveDropdownRowIndex(null);
        showToast('Cantidad acumulada en la línea existente y fila duplicada descartada.', 'success');
    };

    const handleKeepBothStagedMatches = () => {
        if (!duplicateStagedMatchConfirm) return;
        const { stagedItemId, product, rowIndex, pendingOptions, pendingQty, openModalAfterKeep, pendingVariantLabel, pendingUnit, pendingFactor } = duplicateStagedMatchConfirm;
        executeSelectStagedProduct(
            stagedItemId,
            product,
            rowIndex,
            pendingOptions,
            pendingQty,
            openModalAfterKeep,
            pendingVariantLabel,
            pendingUnit,
            pendingFactor
        );
        setDuplicateStagedMatchConfirm(null);
    };

    const handleCancelStagedDuplicate = () => {
        setDuplicateStagedMatchConfirm(null);
        setActiveRowSearchQuery(null);
        setActiveDropdownRowIndex(null);
    };

    const handleConsolidateAllStagedDuplicates = () => {
        setStagedItems(prev => {
            const map = new Map<string, any>();
            let mergedCount = 0;
            prev.forEach(item => {
                if (!item.suggestedProduct) {
                    map.set(item.id, { ...item });
                    return;
                }
                const cleanLabel = (item.variant_label || '').trim().toLowerCase();
                const cleanUnit = (item.originalUnit || item.suggestedProduct?.unit_of_measure || 'Kg').trim().toLowerCase();
                const schedule = (item.deliverySchedule || '').trim().toLowerCase();
                const key = `${item.suggestedProduct.id}_${cleanLabel}_${cleanUnit}_${schedule}`;

                if (map.has(key)) {
                    const existing = { ...map.get(key) };
                    const currentOrigQtyInFile = parseFloat(item.originalQtyInFile || item.originalQty || item.quantity || '0');
                    const existingOrigQtyInFile = parseFloat(existing.originalQtyInFile || existing.originalQty || existing.quantity || '0');
                    const sumOrigQtyInFile = parseFloat((existingOrigQtyInFile + currentOrigQtyInFile).toFixed(3));

                    const currentQty = parseFloat(item.quantity || '0');
                    const existingQty = parseFloat(existing.quantity || '0');
                    const sumQty = parseFloat((existingQty + currentQty).toFixed(3));

                    const currentOrigQty = parseFloat(item.originalQty || '0');
                    const existingOrigQty = parseFloat(existing.originalQty || '0');
                    const sumOrigQty = parseFloat((existingOrigQty + currentOrigQty).toFixed(3));

                    existing.originalQtyInFile = sumOrigQtyInFile > 0 ? sumOrigQtyInFile : sumQty;
                    existing.originalQty = sumOrigQty > 0 ? sumOrigQty : sumQty;
                    existing.quantity = sumQty;

                    if (item.observations && !existing.observations?.includes(item.observations)) {
                        existing.observations = [existing.observations, item.observations].filter(Boolean).join(' | ');
                    }
                    existing.isConfirmed = true;
                    map.set(key, existing);
                    mergedCount++;
                } else {
                    map.set(key, { ...item });
                }
            });
            if (mergedCount > 0) {
                showToast(`✅ Se consolidaron ${mergedCount} filas duplicadas en la tabla de auditoría.`, 'success');
            } else {
                showToast('No se encontraron filas duplicadas para consolidar en la tabla.', 'info');
            }
            return Array.from(map.values());
        });
    };

    const hasStagedDuplicates = useMemo(() => {
        const seen = new Set<string>();
        for (const item of stagedItems) {
            if (!item.suggestedProduct) continue;
            const cleanLabel = (item.variant_label || '').trim().toLowerCase();
            const cleanUnit = (item.originalUnit || item.suggestedProduct?.unit_of_measure || 'Kg').trim().toLowerCase();
            const schedule = (item.deliverySchedule || '').trim().toLowerCase();
            const key = `${item.suggestedProduct.id}_${cleanLabel}_${cleanUnit}_${schedule}`;
            if (seen.has(key)) return true;
            seen.add(key);
        }
        return false;
    }, [stagedItems]);

    const startEditingCartItem = (idx: number) => {
        const item = cart[idx];
        setEditingCartIndex(idx);
        setSelectedProductForModal(item.product);
        setModalQuantity(item.originalQty || 1);
        setModalUnit(item.originalUnit || item.product.unit_of_measure || 'Kg');
        setModalFactor(item.conversion_factor || 1);
        setSelectedOptions(item.selected_options || {});
    };

    const updateQty = (index: number, newQty: any) => {
        setCart(prev => prev.map((item, i) => {
            if (i === index) {
                const qtyVal = parseFloat(newQty.toString().replace(',', '.')) || 0;
                return {
                    ...item,
                    qty: newQty,
                    originalQty: qtyVal,
                    conversion_factor: 1,
                    originalUnit: item.product.unit_of_measure || 'Kg'
                };
            }
            return item;
        }));
    };

    const removeFromCart = (index: number) => {
        const item = cart[index];
        const productName = item?.product?.name || 'este producto';
        setDeleteConfirm({
            isOpen: true,
            productName: productName,
            onConfirm: () => {
                setCart(prev => prev.filter((_, i) => i !== index));
            }
        });
    };

    const calculateTotal = () => {
        return cart.reduce((acc, item) => {
            const qtyNum = parseFloat(item.qty.toString().replace(',', '.') || '0');
            const unitPrice = item.price !== undefined && item.price !== null ? item.price : item.product.base_price;
            return acc + (unitPrice * qtyNum);
        }, 0);
    };

    const calculateTotalWeight = () => {
        return cart.reduce((acc, item) => {
            const qtyNum = parseFloat(item.qty.toString().replace(',', '.') || '0');
            const unit = (item.originalUnit || item.product.unit_of_measure || '').toLowerCase().trim();
            const isKgUnit = ['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'kg.'].includes(unit);
            const isLibraUnit = ['libra', 'libras', 'lb', 'lbs', '500g'].includes(unit);
            
            let weightFactor = 1.0;
            if (isKgUnit) {
                weightFactor = 1.0;
            } else if (isLibraUnit) {
                weightFactor = 0.5;
            } else if (item.product.weight_kg && Number(item.product.weight_kg) > 0) {
                weightFactor = Number(item.product.weight_kg);
            } else {
                weightFactor = 1.0;
            }
            return acc + (qtyNum * weightFactor);
        }, 0);
    };

    const calculateTotalTax = () => {
        return cart.reduce((acc, item) => {
            const qtyNum = parseFloat(item.qty.toString().replace(',', '.') || '0');
            const unitPrice = item.price !== undefined && item.price !== null ? item.price : item.product.base_price;
            const rate = item.product.iva_rate !== null && item.product.iva_rate !== undefined ? Number(item.product.iva_rate) : 19;
            const itemTotal = unitPrice * qtyNum;
            return acc + (itemTotal * (rate / (100 + rate)));
        }, 0);
    };

    const calculateSubtotal = () => {
        return calculateTotal() - calculateTotalTax();
    };

    const selectClient = (client: any) => {
        setSelectedClient(client.id);
        if (client.latitude && client.longitude) {
            setLatitude(client.latitude);
            setLongitude(client.longitude);
        }
        setClientSearch('');
    };

    const handleGetLocation = () => {
        if (!navigator.geolocation) return showToast('No soportado');
        setIsGettingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLatitude(pos.coords.latitude);
                setLongitude(pos.coords.longitude);
                setIsGettingLocation(false);
            },
            () => {
                setIsGettingLocation(false);
                showToast('No se pudo obtener la ubicación');
            }
        );
    };
    // --- ORDER IMPORT LOGIC (Mesa de Trabajo) ---

    // Helper para calcular fecha de entrega destino a partir de un día de la semana (ej. 'MARTES')
    const calculateTargetDeliveryDate = (baseDateStr: string, targetDayName: string): string => {
        if (!baseDateStr) return '';
        try {
            const daysMap: Record<string, number> = {
                'domingo': 0, 'lunes': 1, 'martes': 2, 'miercoles': 3, 'miércoles': 3,
                'jueves': 4, 'viernes': 5, 'sabado': 6, 'sábado': 6
            };
            const cleanDay = (targetDayName || '').toLowerCase().trim();
            const targetDayIdx = daysMap[cleanDay];
            if (targetDayIdx === undefined) {
                return baseDateStr;
            }
            const [y, m, d] = baseDateStr.split('-').map(Number);
            const curr = new Date(y, m - 1, d, 12, 0, 0);
            const currDayIdx = curr.getDay();
            let daysToAdd = (targetDayIdx - currDayIdx + 7) % 7;
            if (daysToAdd === 0) daysToAdd = 7; // estrictamente el próximo día indicado
            curr.setDate(curr.getDate() + daysToAdd);
            const resY = curr.getFullYear();
            const resM = String(curr.getMonth() + 1).padStart(2, '0');
            const resD = String(curr.getDate()).padStart(2, '0');
            return `${resY}-${resM}-${resD}`;
        } catch {
            return baseDateStr;
        }
    };

    // Helper para extraer horario/día diferido desde el ítem o sus especificaciones
    const detectDeliveryScheduleFromItem = (item: any): string | null => {
        if (item.deliverySchedule && typeof item.deliverySchedule === 'string') {
            const upper = item.deliverySchedule.toUpperCase().trim();
            if (upper && upper !== 'NULL' && upper !== 'NORMAL' && upper !== 'PRINCIPAL') {
                return upper;
            }
        }
        const searchIn = `${item.observations || ''} ${item.presentation || ''} ${item.originalName || ''}`.toLowerCase();
        const match = searchIn.match(/para\s+(?:el\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/i);
        if (match && match[1]) {
            return match[1].toUpperCase();
        }
        return null;
    };

    // Helper para detección de duplicidad y referencias cruzadas (OC / SOLPED / OP)
    const checkForDuplicateOrders = async (
        profileId: string | null,
        poNumber: string | null,
        solpedNumber: string | null,
        referencedCodes: string[] = []
    ) => {
        try {
            const rawTokens: string[] = [];
            if (poNumber) rawTokens.push(poNumber);
            if (solpedNumber) rawTokens.push(solpedNumber);
            if (Array.isArray(referencedCodes)) {
                referencedCodes.forEach(c => { if (c) rawTokens.push(c); });
            }

            const uniqueCodes = new Set<string>();
            rawTokens.forEach(t => {
                const clean = String(t).trim();
                if (clean.length >= 3) {
                    uniqueCodes.add(clean);
                    const numMatch = clean.match(/\d{4,}/g);
                    if (numMatch) {
                        numMatch.forEach(n => uniqueCodes.add(n));
                    }
                }
            });

            if (uniqueCodes.size === 0) {
                setDuplicateOrderMatch(null);
                return;
            }

            setIsCheckingDuplicates(true);

            // Perfiles de la misma matriz o NIT
            let profileIdsToSearch: string[] = [];
            if (profileId) {
                profileIdsToSearch.push(profileId);
                const targetProfile = clients.find(c => c.id === profileId);
                if (targetProfile?.parent_id) {
                    const siblings = clients.filter(c => c.parent_id === targetProfile.parent_id || c.id === targetProfile.parent_id);
                    siblings.forEach(s => profileIdsToSearch.push(s.id));
                } else if (targetProfile?.nit) {
                    const nitMatch = clients.filter(c => c.nit && c.nit.trim() === targetProfile.nit.trim());
                    nitMatch.forEach(s => profileIdsToSearch.push(s.id));
                }
                profileIdsToSearch = Array.from(new Set(profileIdsToSearch));
            }

            const sixtyDaysAgo = new Date();
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

            let query = supabase
                .from('orders')
                .select('id, sequence_id, created_at, total, status, delivery_date, admin_notes, document_url, profile_id')
                .gte('created_at', sixtyDaysAgo.toISOString())
                .neq('status', 'cancelled')
                .order('created_at', { ascending: false })
                .limit(80);

            if (profileIdsToSearch.length > 0) {
                query = query.in('profile_id', profileIdsToSearch);
            }

            const { data: recentOrders, error } = await query;
            if (error || !recentOrders || recentOrders.length === 0) {
                setDuplicateOrderMatch(null);
                return;
            }

            const codesArray = Array.from(uniqueCodes);
            let foundMatch: { order: any; matchedCode: string; matchType: 'OC' | 'SOLPED' | 'REFERENCE' } | null = null;

            for (const ord of recentOrders) {
                const notes = (ord.admin_notes || '').toUpperCase();
                const docUrl = (ord.document_url || '').toUpperCase();
                const ordIdStr = String(ord.sequence_id || ord.id).toUpperCase();

                for (const code of codesArray) {
                    const upperCode = code.toUpperCase();
                    if (['COLSUBSIDIO', 'BOGOTA', 'PEDIDO', 'ORDEN', 'FRUFRESCO', 'CLIENTE', 'PRINCIPAL'].includes(upperCode)) continue;

                    const matchInNotes = notes.includes(upperCode);
                    const matchInUrl = docUrl.includes(upperCode);
                    const matchInId = ordIdStr.includes(upperCode);

                    if (matchInNotes || matchInUrl || matchInId) {
                        let matchType: 'OC' | 'SOLPED' | 'REFERENCE' = 'REFERENCE';
                        if (solpedNumber && (solpedNumber.toUpperCase().includes(upperCode) || upperCode.includes(solpedNumber.toUpperCase()))) {
                            matchType = 'SOLPED';
                        } else if (poNumber && (poNumber.toUpperCase().includes(upperCode) || upperCode.includes(poNumber.toUpperCase()))) {
                            matchType = 'OC';
                        }

                        foundMatch = {
                            order: ord,
                            matchedCode: code,
                            matchType
                        };
                        break;
                    }
                }
                if (foundMatch) break;
            }

            setDuplicateOrderMatch(foundMatch);
        } catch (err) {
            console.warn('Error checking order duplicates:', err);
            setDuplicateOrderMatch(null);
        } finally {
            setIsCheckingDuplicates(false);
        }
    };

    const handleLinkDuplicateOrder = async () => {
        if (!duplicateOrderMatch) return;
        const targetOrder = duplicateOrderMatch.order;
        setIsLinkingDuplicate(true);
        try {
            let finalDocUrl = permanentDocumentUrl;
            if (!finalDocUrl && uploadedFile) {
                try {
                    const cleanFileName = `${Date.now()}_${uploadedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                    const { error: uploadError } = await supabase
                        .storage
                        .from('order-attachments')
                        .upload(cleanFileName, uploadedFile, { upsert: true });

                    if (!uploadError) {
                        const { data: publicUrlData } = supabase
                            .storage
                            .from('order-attachments')
                            .getPublicUrl(cleanFileName);
                        if (publicUrlData?.publicUrl) {
                            finalDocUrl = publicUrlData.publicUrl;
                            setPermanentDocumentUrl(finalDocUrl);
                        }
                    }
                } catch (upErr) {
                    console.warn('Error subiendo adjunto:', upErr);
                }
            }

            const todayStr = new Date().toLocaleDateString('es-CO');
            const ocText = importValidation?.poNumber ? `OC: ${importValidation.poNumber}` : '';
            const solpedText = importValidation?.solpedNumber ? `SOLPED: ${importValidation.solpedNumber}` : '';
            const refDetails = [ocText, solpedText].filter(Boolean).join(' | ');

            const existingNotes = targetOrder.admin_notes || '';
            const regularizedNote = `[Regularizado con Documento ${refDetails ? `(${refDetails})` : ''} el ${todayStr}]`;
            const updatedAdminNotes = existingNotes.includes(regularizedNote) 
                ? existingNotes 
                : `${existingNotes} | ${regularizedNote}`.trim();

            const updatePayload: any = {
                admin_notes: updatedAdminNotes
            };
            if (finalDocUrl) {
                updatePayload.document_url = finalDocUrl;
            }

            const { error: updateError } = await supabase
                .from('orders')
                .update(updatePayload)
                .eq('id', targetOrder.id);

            if (updateError) throw updateError;

            showToast(`✅ ¡Pedido #${targetOrder.sequence_id || targetOrder.id.slice(0, 8)} vinculado y actualizado correctamente con la OC!`, 'success');
            
            setIsStaging(false);
            setStagedItems([]);
            setDuplicateOrderMatch(null);
            if (uploadedFileUrl) {
                URL.revokeObjectURL(uploadedFileUrl);
                setUploadedFileUrl(null);
            }
            setUploadedFile(null);
        } catch (err: any) {
            console.error('Error al vincular orden duplicada:', err);
            showToast(`❌ Error al vincular el pedido: ${err.message || err}`, 'error');
        } finally {
            setIsLinkingDuplicate(false);
        }
    };

    const parseOrderWithAI = async (file: File) => {
        setParsingFile(true);
        const startTime = performance.now();
        try {
            const url = URL.createObjectURL(file);
            setUploadedFileUrl(url);
            setUploadedFile(file);
            setShowSideDocPreview(true);
            setShowFloatingDoc(false);
            setIsFloatingDocExpanded(false);

            const formData = new FormData();
            formData.append('file', file);

            // Obtener el token de sesión activo, o intentar refrescarlo automáticamente si expiró
            let token: string | null = null;
            try {
                const { data: sessionData } = await supabase.auth.getSession();
                if (sessionData?.session?.access_token) {
                    token = sessionData.session.access_token;
                } else {
                    const { data: refreshData } = await supabase.auth.refreshSession();
                    token = refreshData?.session?.access_token || null;
                }
            } catch (authErr) {
                console.warn('Error al verificar sesión con Supabase Auth:', authErr);
            }

            // Respaldo secundario: buscar token en almacenamiento local si aún no se hidrató
            if (!token && typeof window !== 'undefined') {
                try {
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && (k.includes('sb-') || k.includes('supabase.auth.token'))) {
                            const parsed = JSON.parse(localStorage.getItem(k) || '{}');
                            const found = parsed?.access_token || parsed?.currentSession?.access_token || null;
                            if (found) {
                                token = found;
                                break;
                            }
                        }
                    }
                } catch {}
            }

            // Si definitivamente no hay sesión ni cookies de sesión
            if (!token && typeof document !== 'undefined' && !document.cookie.includes('auth-token')) {
                showToast('Tu sesión ha expirado. Por favor recarga la página o inicia sesión de nuevo.', 'error');
                setParsingFile(false);
                return;
            }

            const headers: Record<string, string> = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch('/api/ai/extract-order', {
                method: 'POST',
                headers,
                credentials: 'include',
                body: formData
            });

            const responseText = await response.text();
            let data: any = null;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                if (!response.ok) {
                    throw new Error(responseText || `Error de servidor (${response.status})`);
                }
                throw new Error('Respuesta no válida de la API de extracción');
            }

            if (!response.ok) {
                throw new Error(data.error || 'Error en la API de extracción');
            }
            
            // Helper para detectar unidad desde el texto y metadatos del item
            const detectUnitFromItem = (item: any, product: any, productConversions: any[]) => {
                const cleanName = (item.originalName || '').toLowerCase();
                const rawUnit = (item.unit || '').trim();
                const rawPres = (item.presentation || '').trim();
                const rawObs = (item.observations || '').trim();
                const docUnitNorm = normalizeDocUnit(rawUnit || rawPres);
                const fullSearchText = `${cleanName} ${rawUnit} ${rawPres} ${rawObs}`.toLowerCase();
                const baseUnitLower = (product.unit_of_measure || 'Kg').toLowerCase();
                const isKgProduct = baseUnitLower === 'kg' || baseUnitLower === 'kilo' || baseUnitLower === 'kilogramo';
                
                // 1. Obtener todas las unidades posibles para este producto
                const possibleUnits: { unit: string; factor: number }[] = [];
                
                if (product.web_unit && product.web_conversion_factor) {
                    possibleUnits.push({
                        unit: product.web_unit,
                        factor: parseFloat(product.web_conversion_factor) || 1
                    });
                }
                
                if (product.unit_of_measure) {
                    possibleUnits.push({
                        unit: product.unit_of_measure,
                        factor: 1
                    });
                }
                
                productConversions.forEach(c => {
                    if (!possibleUnits.some(u => u.unit.toLowerCase() === c.from_unit.toLowerCase())) {
                        possibleUnits.push({
                            unit: c.from_unit,
                            factor: parseFloat(c.conversion_factor) || 1
                        });
                    }
                });
                
                // También agregar variantes del options_config
                if (product.options_config) {
                    product.options_config.forEach((opt: any) => {
                        if (opt.name.toLowerCase().includes('presentaci')) {
                            opt.values?.forEach((val: string) => {
                                const cleanUnit = val.includes('|') ? val.split('|')[0] : val;
                                if (!possibleUnits.some(u => u.unit.toLowerCase() === cleanUnit.toLowerCase())) {
                                    let factor = 1;
                                    const defaultUnit = product.web_unit || product.unit_of_measure;
                                    if (cleanUnit.toLowerCase() === defaultUnit.toLowerCase()) {
                                        factor = parseFloat(product.web_conversion_factor) || 1;
                                    } else {
                                        // Intentar calcular factor dinámico usando parseWeight
                                        if (cleanUnit.includes('|')) {
                                            const grams = parseFloat(cleanUnit.split('|')[1]);
                                            if (!isNaN(grams) && grams > 0) factor = grams / 1000;
                                        } else {
                                            const clean = cleanUnit.toLowerCase();
                                            const kgMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilos)/);
                                            if (kgMatch) factor = parseFloat(kgMatch[1]);
                                            const gMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:g|gr|grs|gramos|grams|gramo|gram)/);
                                            if (gMatch) factor = parseFloat(gMatch[1]) / 1000;
                                            if (clean.includes('libra') || clean.includes('lb')) factor = 0.5;
                                        }
                                    }
                                    possibleUnits.push({ unit: cleanUnit, factor });
                                }
                            });
                        }
                    });
                }
                
                // 2. Coincidencia directa con la unidad normalizada del documento (ej. 'Kg', 'Unidad', 'Cubeta', 'Libra')
                if (docUnitNorm) {
                    for (const u of possibleUnits) {
                        const uNorm = normalizeDocUnit(u.unit);
                        if (uNorm.toLowerCase() === docUnitNorm.toLowerCase()) {
                            return u;
                        }
                    }
                }

                // 3. Buscar en texto completo (nombre + observaciones) si se detectan Libras/500g para productos en Kg
                if (docUnitNorm === 'Libra' || fullSearchText.includes('libra') || fullSearchText.includes(' lb') || fullSearchText.includes(' lbs') || fullSearchText.includes('500g') || fullSearchText.includes('500 gr')) {
                    if (isKgProduct) {
                        return { unit: 'Libra', factor: 0.5 };
                    }
                }

                // 4. Buscar en texto completo (nombre + observaciones) qué unidad coincide mejor
                for (const u of possibleUnits) {
                    const unitLower = u.unit.toLowerCase();
                    if (unitLower.length > 2) {
                        if (fullSearchText.includes(unitLower)) {
                            return u;
                        }
                    }
                }
                
                // 5. Si el documento trajo una unidad normalizada, respetarla y aplicar factor
                if (docUnitNorm) {
                    let factor = 1;
                    if (docUnitNorm === 'Libra' && isKgProduct) factor = 0.5;
                    if (docUnitNorm === 'g' && isKgProduct) factor = 0.001;
                    return { unit: docUnitNorm, factor };
                }

                return { unit: product.unit_of_measure || 'Kg', factor: 1 };
            };

            // Helper para sanitizar texto de OCR/PDF (homóglifos, espacios en blanco por kerning, tildes)
            const sanitizeDocText = (text: string) => {
                if (!text) return '';
                let str = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
                // Normalizar la Beta griega 'Β' (914) y 'β' (946) a 'B' / 'b' latina
                str = str.replace(/\u0392/g, 'B').replace(/\u03B2/g, 'b');
                let lower = str.toLowerCase().trim();
                lower = lower.replace(/\ba\s+gua\s+cates?\b/gi, 'aguacate');
                lower = lower.replace(/\barra\s+cacha\b/gi, 'arracacha');
                return lower.replace(/\s+/g, ' ');
            };



            // Resolutor Multicanal de Perfil de Cliente usando el Motor Unificado
            let autoMatchedProfile: any = null;
            if (clientType === 'B2B' && clients && clients.length > 0) {
                autoMatchedProfile = resolveClientProfile({
                    nit: data.nitInDocument,
                    name: data.clientInDocument,
                    address: data.addressInDocument
                }, clients);

                if (autoMatchedProfile) {
                    setSelectedClient(autoMatchedProfile.id);
                    setClientSearch(autoMatchedProfile.company_name || autoMatchedProfile.contact_name || '');
                    showToast(`🎯 Cliente detectado y seleccionado automáticamente: ${autoMatchedProfile.company_name || autoMatchedProfile.contact_name}`, 'success');
                }
            }

            // Auto-asignación de Fecha de Entrega detectada en el Documento (Hallazgo 1 SDD)
            if (data.deliveryDateInDocument) {
                try {
                    let parsedDelivery: string | null = null;
                    const rawDate = String(data.deliveryDateInDocument).trim();
                    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
                        parsedDelivery = rawDate;
                    } else if (/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.test(rawDate)) {
                        const parts = rawDate.split(/[\/\-]/);
                        const d = parts[0].padStart(2, '0');
                        const m = parts[1].padStart(2, '0');
                        const y = parts[2];
                        parsedDelivery = `${y}-${m}-${d}`;
                    } else {
                        const parsedTs = Date.parse(rawDate);
                        if (!isNaN(parsedTs)) {
                            parsedDelivery = new Date(parsedTs).toISOString().split('T')[0];
                        }
                    }

                    if (parsedDelivery && parsedDelivery >= minDeliveryDate) {
                        setDeliveryDate(parsedDelivery);
                        showToast(`📅 Fecha de entrega detectada en el documento: ${parsedDelivery}`, 'success');
                    }
                } catch (dateErr) {
                    console.warn('[AI Extract] Advertencia normalizando fecha de entrega:', dateErr);
                }
            }

            // 1. Cargar Memoria Histórica de Aprendizaje del cliente
            let learnedMemory: any[] = [];
            const targetClientId = autoMatchedProfile?.id || selectedClient;
            if (targetClientId) {
                try {
                    const { data: memData } = await supabase
                        .from('document_learning_memory')
                        .select('*')
                        .eq('client_id', targetClientId);
                    if (memData) learnedMemory = memData;
                } catch (e) {
                    console.log('document_learning_memory not ready yet');
                }
            }

            // Ensure data is structured correctly
            if (!data) {
                throw new Error('La respuesta de la API está vacía');
            }
            const rawItems = Array.isArray(data.items) ? data.items : [];

            // Intentamos encontrar el mejor SKU sugerido usando el Motor Unificado (Memoria + Catalog + Tokens)
            const suggested = rawItems.map((item: any) => {
                if (!item) return null;
                const originalName = item.originalName || 'Producto Desconocido';
                const quantity = typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity) || 0;

                const matchResult = findBestProductMatchDetails(originalName, products, learnedMemory);
                const match = matchResult.product;

                const productConversions = conversions.filter(c => c.product_id === (match?.id || ''));
                const detectedUnit = match 
                    ? detectUnitFromItem(item, match, productConversions) 
                    : (item.unit ? { unit: item.unit, factor: 1 } : null);
                
                const factor = detectedUnit?.factor || 1;
                const convertedQty = detectedUnit ? parseFloat((quantity * factor).toFixed(3)) : quantity;
                const rawDocUnit = item.unit || item.presentation || '';
                const docUnitNorm = normalizeDocUnit(rawDocUnit);
                const originalUnitInFile = detectedUnit?.unit || docUnitNorm || rawDocUnit || (match?.unit_of_measure || 'Kg');

                const rawObs = (item.observations || '').trim();
                const schedule = detectDeliveryScheduleFromItem(item);

                return {
                    id: crypto.randomUUID(),
                    originalName: originalName,
                    quantity: convertedQty,
                    originalQtyInFile: quantity,
                    originalUnitInFile: originalUnitInFile,
                    originalQty: convertedQty,
                    originalUnit: match?.unit_of_measure || 'Kg',
                    conversion_factor: 1,
                    suggestedProduct: match || null,
                    confidence: matchResult.confidence,
                    confidenceScore: matchResult.confidenceScore,
                    matchSource: matchResult.matchSource,
                    matchReason: matchResult.matchReason,
                    status: match ? 'MATCH' : 'PENDING',
                    observations: rawObs,
                    deliverySchedule: schedule,
                    selected_options: (() => {
                        const opts: any = {};
                        // 1. Cargar preferencias fijas del cliente si existen
                        const exc = match ? clientExceptions.find(e => e.product_id === match.id) : null;
                        if (exc?.preferred_options && typeof exc.preferred_options === 'object') {
                            Object.entries(exc.preferred_options).forEach(([k, v]) => {
                                if (v) opts[k] = String(v);
                            });
                        }
                        // 2. Mapear unidad de presentación detectada si aplica
                        if (detectedUnit && match?.options_config) {
                            match.options_config.forEach((opt: any) => {
                                if (opt.name.toLowerCase().includes('presentaci')) {
                                    const matchedVal = opt.values?.find((v: string) => {
                                        const clean = v.includes('|') ? v.split('|')[0] : v;
                                        return clean.toLowerCase() === detectedUnit.unit.toLowerCase();
                                    });
                                    if (matchedVal) opts[opt.name] = matchedVal;
                                }
                            });
                        }
                        return opts;
                    })()
                };
            }).filter(Boolean);

            // Lógica de Validación de Cliente (Auditoría)
            const selectedDetails = autoMatchedProfile || (clientType === 'B2B' ? getSelectedClientDetails() : getSelectedB2CDetails());
            const clientInFile = data.clientInDocument || 'Cliente Desconocido';
            
            // Verificamos si hay coincidencia entre el documento y el sistema
            const selectedName = (selectedDetails?.company_name || selectedDetails?.contact_name || '').toUpperCase();
            const detectedName = clientInFile.toUpperCase();
            
            const isMatch = !!autoMatchedProfile || (selectedName && detectedName && (
                selectedName.includes(detectedName.split(' ')[0]) || 
                detectedName.includes(selectedName.split(' ')[0])
            ));

            const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(1);
            setDigestionDuration(elapsedSec);
            setDigestionModel(data._modelUsed || 'gemini-2.5-flash');

            const detectedPo = data.poNumber || null;
            const detectedSolped = data.solpedNumber || null;
            const detectedOrderType = data.orderTypeLabel || null;
            const detectedCodes = Array.isArray(data.referencedCodes) ? data.referencedCodes : [];
            const detectedDate = data.deliveryDateInDocument || null;

            // Inicializar fechas para pedidos relacionados si se detecta entrega diferida
            const secondaryItem = suggested.find((i: any) => i && i.deliverySchedule);
            const baseDate = deliveryDate || new Date().toISOString().split('T')[0];
            if (secondaryItem) {
                setMultiOrderDate1(baseDate);
                const calcDate2 = calculateTargetDeliveryDate(baseDate, secondaryItem.deliverySchedule);
                setMultiOrderDate2(calcDate2);
            }

            setImportValidation({
                clientInDocument: clientInFile,
                isMatch: !!isMatch,
                documentType: data.documentType || (file.name.endsWith('.pdf') ? 'PDF' : 'Documento'),
                poNumber: detectedPo,
                solpedNumber: detectedSolped,
                orderTypeLabel: detectedOrderType,
                referencedCodes: detectedCodes,
                deliveryDateInDocument: detectedDate
            });

            // Disparar chequeo de duplicidad y referencias cruzadas en tiempo real
            const targetProfileId = autoMatchedProfile?.id || selectedClient || null;
            checkForDuplicateOrders(targetProfileId, detectedPo, detectedSolped, detectedCodes);

            setStagedItems(suggested);
            setIsStaging(true);
            showToast(`⚡ Documento procesado en ${elapsedSec}s (${suggested.length} productos detectados)`, 'success');
        } catch (error: any) {
            const isAuthErr = error.message?.includes('Auth session missing') || 
                              error.message?.includes('Unauthorized') || 
                              error.message?.includes('401') ||
                              error.message?.includes('token') ||
                              error.message?.includes('JWT');

            if (isAuthErr) {
                console.warn('AI Parsing Session Warning:', error.message);
                showToast('Tu sesión ha expirado o no es válida. Por favor recarga la página o inicia sesión de nuevo.', 'error');
            } else {
                console.error('AI Parsing Error:', error);
                const rawMsg = error.message || '';
                const isModelIssue = rawMsg.toLowerCase().includes('vigente') ||
                                     rawMsg.toLowerCase().includes('no longer available') ||
                                     rawMsg.toLowerCase().includes('deprecated') ||
                                     rawMsg.toLowerCase().includes('is not supported');

                const isFileIssue = rawMsg.toLowerCase().includes('dañado') ||
                                    rawMsg.toLowerCase().includes('no compatible') ||
                                    rawMsg.toLowerCase().includes('páginas') ||
                                    rawMsg.toLowerCase().includes('no pages') ||
                                    rawMsg.toLowerCase().includes('vacío') ||
                                    rawMsg.toLowerCase().includes('corrupto') ||
                                    rawMsg.toLowerCase().includes('bytes');

                if (isModelIssue) {
                    showToast('⚠️ El modelo de Inteligencia Artificial ya no está vigente. Debe ponerse en contacto con el servicio de soporte técnico de inmediato para actualizarlo. Por favor ingrese el pedido manualmente.', 'error');
                } else if (isFileIssue) {
                    const formatted = rawMsg.toLowerCase().includes('archivo dañado') 
                        ? rawMsg 
                        : `Archivo dañado o no compatible. ${rawMsg}`;
                    showToast(`⚠️ ${formatted}`, 'error');
                } else {
                    showToast(`⚠️ ${error.message}`, 'error');
                }
            }
        } finally {
            setParsingFile(false);
        }
    };

    const handleAddStagedRow = () => {
        const newId = `manual-staged-${Date.now()}`;
        const newRow = {
            id: newId,
            originalName: 'Nuevo Ítem Manual',
            quantity: 1,
            originalQtyInFile: 1,
            originalUnitInFile: 'Kg',
            originalQty: 1,
            originalUnit: 'Kg',
            conversion_factor: 1,
            suggestedProduct: null,
            confidence: 'MANUAL',
            confidenceScore: 100,
            matchSource: 'MANUAL',
            matchReason: 'Agregado manualmente por el usuario',
            status: 'PENDING' as const,
            observations: '',
            deliverySchedule: deliveryDate || minDeliveryDate || null,
            deliveryDate: deliveryDate || minDeliveryDate || null,
            selected_options: {},
            price: 0,
            searchQuery: ''
        };
        setStagedItems(prev => [...prev, newRow]);
        setTimeout(() => {
            const nextIdx = stagedItems.length;
            setActiveDropdownRowIndex(nextIdx);
            const input = document.getElementById(`sku-input-${nextIdx}`) as HTMLInputElement;
            input?.focus();
        }, 100);
    };

    // GAP-01: Interbloqueo de Control de Cupo de Crédito y Cartera Vencida B2B
    const checkClientCreditStatus = async (profileId: string, orderTotal: number): Promise<{ allowed: boolean; reason?: string }> => {
        try {
            const client = clients.find((c: any) => c.id === profileId);
            if (!client) return { allowed: true };

            const creditLimit = Number(client.logistics_data?.credit_limit ?? client.credit_limit) || 0;
            const paymentDays = Number(client.payment_days) || 0;
            
            // Consultar órdenes del cliente para evaluar saldo pendiente y facturas en mora
            const { data: unpaidOrders } = await supabase
                .from('orders')
                .select('id, total, payment_status, delivery_date')
                .eq('profile_id', profileId)
                .neq('payment_status', 'paid')
                .neq('status', 'cancelled');

            let pendingDebt = 0;
            let hasOverdue = false;
            let overdueCount = 0;

            if (unpaidOrders && unpaidOrders.length > 0) {
                const now = new Date();
                unpaidOrders.forEach((ord: any) => {
                    pendingDebt += Number(ord.total) || 0;
                    if (ord.delivery_date) {
                        const dueDate = new Date(ord.delivery_date);
                        dueDate.setDate(dueDate.getDate() + paymentDays);
                        if (dueDate < now) {
                            hasOverdue = true;
                            overdueCount++;
                        }
                    }
                });
            }

            const projectedDebt = pendingDebt + orderTotal;
            const exceedsLimit = creditLimit > 0 && projectedDebt > creditLimit;

            if (exceedsLimit || hasOverdue) {
                let msg = `⚠️ CONTROL DE CARTERA Y CRÉDITO - ${client.company_name || client.contact_name}:\n\n`;
                if (hasOverdue) {
                    msg += `• Facturas vencidas en mora: ${overdueCount} documento(s).\n`;
                }
                if (exceedsLimit) {
                    msg += `• Cupo de crédito autorizado: $${formatNumber(creditLimit)} COP.\n`;
                    msg += `• Cartera pendiente actual: $${formatNumber(pendingDebt)} COP.\n`;
                    msg += `• Total de este pedido: $${formatNumber(orderTotal)} COP.\n`;
                    msg += `• Saldo proyectado: $${formatNumber(projectedDebt)} COP (Excede por $${formatNumber(projectedDebt - creditLimit)} COP).\n`;
                }
                msg += `\n¿Deseas autorizar la captura de este pedido como EXCEPCIÓN COMERCIAL auditada?`;

                const proceed = window.confirm(msg);
                if (!proceed) {
                    return { allowed: false, reason: 'Operación cancelada: El pedido excede el cupo de crédito o registra cartera vencida.' };
                }

                // Registrar trazabilidad inmutable en auditoría
                fetch('/api/audit/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'CREDIT_LIMIT_EXCEPTION_AUTHORIZED',
                        module: 'COMMERCIAL',
                        collaborator_name: 'Administrador Comercial',
                        details: {
                            client_id: profileId,
                            client_name: client.company_name || client.contact_name,
                            credit_limit: creditLimit,
                            pending_debt: pendingDebt,
                            order_total: orderTotal,
                            projected_debt: projectedDebt,
                            has_overdue: hasOverdue,
                            overdue_count: overdueCount
                        }
                    })
                }).catch(e => console.warn('Audit error in credit check:', e));
            }

            return { allowed: true };
        } catch (err) {
            console.warn('Error in credit check:', err);
            return { allowed: true };
        }
    };

    const handleDirectConfirmOrder = async () => {
        if (!selectedClient) {
            showToast('⚠️ Debes seleccionar o buscar la empresa cliente en el sistema antes de confirmar el pedido.', 'error');
            return;
        }

        const clientDetails = clients.find(c => c.id === selectedClient);

        if (!importValidation?.isMatch && importValidation?.clientInDocument) {
            const confirmed = window.confirm(
                `⚠️ ALERTA DE AUDITORÍA:\n\nEl documento indica que el pedido es para:\n"${importValidation.clientInDocument}"\n\nPero en el sistema tienes seleccionada la empresa:\n"${clientDetails?.company_name || 'Cliente'}"\n\n¿Deseas continuar y crear este pedido directamente para ${clientDetails?.company_name || 'Cliente'}?`
            );
            if (!confirmed) return;
        }

        if (stagedItems.length === 0) {
            showToast('⚠️ No hay productos en la mesa de trabajo para crear el pedido.', 'error');
            return;
        }

        const unassigned = stagedItems.filter(i => !i.suggestedProduct);
        if (unassigned.length > 0) {
            showToast(`⚠️ Hay ${unassigned.length} producto(s) sin homologar en el catálogo. Asígnalos o elimínalos antes de crear el pedido directamente.`, 'error');
            return;
        }

        const targetDeliveryDate = deliveryDate || minDeliveryDate;
        if (!targetDeliveryDate) {
            showToast('⚠️ Debes seleccionar la fecha de entrega.', 'error');
            return;
        }

        setIsDirectConfirming(true);
        try {
            // 1. Subida silenciosa del archivo original al bucket order-attachments
            let finalDocUrl = permanentDocumentUrl;
            if (!finalDocUrl && uploadedFile) {
                try {
                    const cleanFileName = `${Date.now()}_${uploadedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                    const { error: uploadError } = await supabase
                        .storage
                        .from('order-attachments')
                        .upload(cleanFileName, uploadedFile, { upsert: true });

                    if (!uploadError) {
                        const { data: publicUrlData } = supabase
                            .storage
                            .from('order-attachments')
                            .getPublicUrl(cleanFileName);
                        if (publicUrlData?.publicUrl) {
                            finalDocUrl = publicUrlData.publicUrl;
                            setPermanentDocumentUrl(finalDocUrl);
                        }
                    }
                } catch (upErr) {
                    console.warn('Error subiendo adjunto a storage en creación directa:', upErr);
                }
            }

            // 2. Persistir memoria de aprendizaje histórica
            const activeClientId = selectedClient;
            if (activeClientId && stagedItems.length > 0) {
                const learningPromises = stagedItems
                    .filter(item => item.suggestedProduct && item.originalName)
                    .map(item => recordLearningMemory(
                        supabase,
                        activeClientId,
                        item.originalName,
                        item.suggestedProduct.id,
                        item.originalUnit || item.suggestedProduct.unit_of_measure
                    ));
                await Promise.allSettled(learningPromises);
            }

            // 3. Calcular totales financieros, IVA y cubicaje logístico
            let subtotal = 0;
            let tax = 0;
            let total = 0;
            let totalWeightKg = 0;

            const itemsDataForInsert = stagedItems.map(item => {
                const prod = item.suggestedProduct!;
                const prodId = prod.id;
                const unitPrice = (prodId && contractPrices[prodId] !== undefined && contractPrices[prodId] !== null && contractPrices[prodId] > 0)
                    ? contractPrices[prodId]
                    : (item.price || prod.base_price || 0);

                const qtyNum = parseFloat(item.quantity?.toString().replace(',', '.') || '1');
                const itemTotal = unitPrice * qtyNum;
                const ivaRate = prod.iva_rate !== null && prod.iva_rate !== undefined ? Number(prod.iva_rate) : 19;
                const itemTax = itemTotal * (ivaRate / (100 + ivaRate));
                const itemSubtotal = itemTotal - itemTax;

                const unit = (item.originalUnit || prod.unit_of_measure || '').toLowerCase().trim();
                const isKgUnit = ['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'kg.'].includes(unit);
                const isLibraUnit = ['libra', 'libras', 'lb', 'lbs', '500g'].includes(unit);
                let weightFactor = 1.0;
                if (isKgUnit) weightFactor = 1.0;
                else if (isLibraUnit) weightFactor = 0.5;
                else if (prod.weight_kg && Number(prod.weight_kg) > 0) weightFactor = Number(prod.weight_kg);
                else weightFactor = 1.0;

                totalWeightKg += qtyNum * weightFactor;
                subtotal += itemSubtotal;
                tax += itemTax;
                total += itemTotal;

                const structuredSpec = getStructuredSpecKey(item);
                const publicOptionValues = item.selected_options 
                    ? Object.entries(item.selected_options)
                        .filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v.trim())
                        .map(([_, v]) => (v as string).trim())
                    : [];
                const fallbackOptionLabel = publicOptionValues.length > 0 ? publicOptionValues.join(', ') : (item.observations || undefined);
                const variantLabel = structuredSpec || item.variant_label || fallbackOptionLabel;

                return {
                    product_id: prod.id,
                    quantity: qtyNum,
                    unit_price: unitPrice,
                    nickname: item.originalName || prod.name,
                    variant_label: variantLabel || null,
                    unit: item.originalUnit || prod.unit_of_measure || 'Kg',
                    selected_options: item.selected_options || {}
                };
            });

            // 4. Armar notas de orden y entrega logística
            const poTokens: string[] = [];
            if (importValidation?.poNumber) poTokens.push(`OC: ${importValidation.poNumber}`);
            if (importValidation?.solpedNumber) poTokens.push(`SOLPED: ${importValidation.solpedNumber}`);
            if (adminNotes) poTokens.push(adminNotes);
            const finalAdminNotes = poTokens.join(' | ');

            let finalDeliverySlot = deliverySlot || 'AM';
            let logisticsOverride = null;
            if (isManualDelivery && manualDeliveryTime) {
                const [h, m] = manualDeliveryTime.split(':').map(Number);
                const totalMinutes = h * 60 + m;
                const startTotal = totalMinutes - manualDeliveryMargin;
                const endTotal = totalMinutes + manualDeliveryMargin;
                const startH = Math.floor(startTotal / 60);
                const startM = startTotal % 60;
                const endH = Math.floor(endTotal / 60);
                const endM = endTotal % 60;
                const formatT = (hh: number, mm: number) => `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
                
                finalDeliverySlot = `${formatT(startH, startM)} - ${formatT(endH, endM)}`;
                logisticsOverride = {
                    is_manual: true,
                    manual_time: manualDeliveryTime,
                    manual_margin: manualDeliveryMargin,
                    manual_note: manualDeliveryNote,
                    windows: [{
                        startTime: formatT(startH, startM),
                        endTime: formatT(endH, endM)
                    }],
                    parsing_date: new Date().toISOString()
                };
            }

            // GAP-01: Interbloqueo de Crédito y Cartera
            const creditCheck = await checkClientCreditStatus(selectedClient, Math.round(total));
            if (!creditCheck.allowed) {
                showToast(creditCheck.reason || 'Operación cancelada por control de crédito.', 'error');
                return;
            }

            // 5. Inserción atómica en base de datos
            const { data: newOrder, error: orderErr } = await supabase
                .from('orders')
                .insert({
                    profile_id: selectedClient,
                    total: Math.round(total),
                    total_weight_kg: parseFloat(totalWeightKg.toFixed(2)),
                    subtotal: Math.round(subtotal),
                    tax: Math.round(tax),
                    status: 'pending_approval',
                    payment_status: 'Pendiente',
                    payment_method: paymentMethod || 'Crédito B2B',
                    origin: 'Admin Panel',
                    origin_source: 'document_upload',
                    delivery_date: targetDeliveryDate,
                    delivery_slot: finalDeliverySlot,
                    admin_notes: finalAdminNotes,
                    shipping_address: clientDetails?.address || 'Dirección Registrada',
                    latitude: clientDetails?.latitude || latitude || null,
                    longitude: clientDetails?.longitude || longitude || null,
                    is_manual_delivery: isManualDelivery,
                    manual_delivery_time: manualDeliveryTime || null,
                    manual_delivery_margin: manualDeliveryMargin,
                    manual_delivery_note: manualDeliveryNote || null,
                    logistics_data: logisticsOverride,
                    document_url: finalDocUrl || permanentDocumentUrl || null
                })
                .select()
                .single();

            if (orderErr) {
                console.error('Direct Order Insert Error:', orderErr);
                throw new Error(orderErr.message);
            }

            const itemsWithOrderId = itemsDataForInsert.map(it => ({
                ...it,
                order_id: newOrder.id
            }));

            const { error: itemsErr } = await supabase
                .from('order_items')
                .insert(itemsWithOrderId);

            if (itemsErr) {
                console.error('Direct Order Items Insert Error:', itemsErr);
                // Rollback atómico de orden huérfana
                await supabase.from('orders').delete().eq('id', newOrder.id);
                throw new Error(itemsErr.message);
            }

            // 6. Encolar notificación por correo de confirmación
            const customerEmail = clientDetails?.email || '';
            const customerName = clientDetails?.company_name || clientDetails?.contact_name || 'Cliente';
            if (customerEmail) {
                const formattedItems = stagedItems.map(item => ({
                    name: item.suggestedProduct?.name || item.originalName,
                    quantity: item.quantity,
                    unit_price: item.price || item.suggestedProduct?.base_price || 0,
                    total: (item.quantity || 1) * (item.price || item.suggestedProduct?.base_price || 0)
                }));
                fetch('/api/orders/send-confirmation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderId: newOrder.id,
                        orderSequenceId: newOrder.sequence_id,
                        customerName,
                        customerEmail,
                        deliveryDate: targetDeliveryDate,
                        deliverySlot: finalDeliverySlot,
                        items: formattedItems,
                        totalAmount: Math.round(total)
                    })
                }).catch(err => console.warn('[Outbound Mail] Error encolando correo:', err));
            }

            // 7. Limpiar estados de staging y redirigir
            setIsStaging(false);
            setStagedItems([]);
            if (uploadedFileUrl) {
                URL.revokeObjectURL(uploadedFileUrl);
                setUploadedFileUrl(null);
            }
            setUploadedFile(null);
            showToast(`⚡ ¡Pedido #${newOrder.sequence_id || newOrder.id.slice(0, 8)} creado exitosamente con el documento!`, 'success');
            router.push('/admin/orders/loading');
        } catch (err: any) {
            console.error('Error al confirmar y crear pedido directamente:', err);
            showToast(`❌ Error al crear el pedido: ${err.message || err}`, 'error');
        } finally {
            setIsDirectConfirming(false);
        }
    };

    const handleConfirmImport = async () => {
        // Validación de Seguridad: Debe haber un cliente seleccionado
        if (!selectedClient) {
            showToast('⚠️ Debes seleccionar o buscar la empresa cliente en el sistema antes de confirmar la importación.', 'error');
            return;
        }

        // Validación de Seguridad: Si el documento detectado no coincide con el cliente asignado
        if (!isAuditClientMatch && importValidation?.clientInDocument) {
            const confirmed = window.confirm(
                `⚠️ ALERTA DE AUDITORÍA:\n\nEl documento indica que el pedido es para:\n"${importValidation.clientInDocument}"\n\nPero en el sistema tienes seleccionada la empresa:\n"${selectedClientDetails?.company_name}"\n\n¿Deseas continuar e importar este pedido a ${selectedClientDetails?.company_name}?`
            );
            if (!confirmed) {
                return;
            }
        }

        setIsConfirmingImport(true);
        try {
            // 1. Subida silenciosa del archivo original al bucket order-attachments para persistencia permanente
            if (uploadedFile) {
                try {
                    const fileExt = uploadedFile.name.split('.').pop() || 'pdf';
                    const cleanFileName = `${Date.now()}_${uploadedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                    const filePath = `${cleanFileName}`;

                    const { data: uploadData, error: uploadError } = await supabase
                        .storage
                        .from('order-attachments')
                        .upload(filePath, uploadedFile, { upsert: true });

                    if (uploadError) {
                        console.warn('Silent upload warning in handleConfirmImport:', uploadError);
                    } else {
                        const { data: publicUrlData } = supabase
                            .storage
                            .from('order-attachments')
                            .getPublicUrl(filePath);
                        if (publicUrlData?.publicUrl) {
                            setPermanentDocumentUrl(publicUrlData.publicUrl);
                            console.log('Documento persistido con éxito:', publicUrlData.publicUrl);
                        }
                    }
                } catch (upErr) {
                    console.warn('Error subiendo adjunto a storage:', upErr);
                }
            }

            // Inyectamos los items validados al carrito real
            const itemsToInject = stagedItems
                .filter(item => item.suggestedProduct)
                .map(item => {
                    const structuredSpec = getStructuredSpecKey(item);
                    const publicOptionValues = item.selected_options 
                        ? Object.entries(item.selected_options)
                            .filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v.trim())
                            .map(([_, v]) => (v as string).trim())
                        : [];
                    const fallbackOptionLabel = publicOptionValues.length > 0 ? publicOptionValues.join(', ') : (item.observations || undefined);
                    const variantLabel = structuredSpec || item.variant_label || fallbackOptionLabel;
                    const prodId = item.suggestedProduct?.id;
                    const resolvedPrice = (prodId && contractPrices[prodId] !== undefined && contractPrices[prodId] !== null && contractPrices[prodId] > 0)
                        ? contractPrices[prodId]
                        : (item.price || item.suggestedProduct?.base_price || 1000);
                    return {
                        product: item.suggestedProduct,
                        qty: item.quantity,
                        variant_label: variantLabel,
                        selected_options: item.selected_options,
                        originalQty: item.originalQty !== undefined ? item.originalQty : item.quantity,
                        originalUnit: item.originalUnit || item.suggestedProduct.unit_of_measure || 'Kg',
                        conversion_factor: item.conversion_factor || 1,
                        price: resolvedPrice,
                        observations: item.observations || null,
                        deliverySchedule: item.deliverySchedule || null
                    };
                });

            // Guardar/Actualizar la memoria de aprendizaje del cliente en paralelo
            const activeClientId = selectedClient;
            if (activeClientId && stagedItems.length > 0) {
                const learningPromises = stagedItems
                    .filter(item => item.suggestedProduct && item.originalName)
                    .map(item => recordLearningMemory(
                        supabase,
                        activeClientId,
                        item.originalName,
                        item.suggestedProduct.id,
                        item.originalUnit || item.suggestedProduct.unit_of_measure
                    ));
                await Promise.allSettled(learningPromises);
            }

            let mergedCount = 0;
            setCart(prev => {
                const result = [...prev];
                for (const newItem of itemsToInject) {
                    const cleanLabel = (newItem.variant_label || '').trim().toLowerCase();
                    const cleanUnit = (newItem.originalUnit || newItem.product?.unit_of_measure || 'Kg').trim().toLowerCase();
                    const cleanSchedule = (newItem.deliverySchedule || '').trim().toLowerCase();
                    const existingIdx = result.findIndex(item =>
                        item.product.id === newItem.product.id &&
                        (item.variant_label || '').trim().toLowerCase() === cleanLabel &&
                        (item.originalUnit || item.product?.unit_of_measure || 'Kg').trim().toLowerCase() === cleanUnit &&
                        ((item.deliverySchedule || '').trim().toLowerCase() === cleanSchedule)
                    );

                    if (existingIdx >= 0) {
                        const existingItem = { ...result[existingIdx] };
                        const addQty = newItem.originalQty !== undefined ? newItem.originalQty : newItem.qty;
                        const newOrigQty = parseFloat(((existingItem.originalQty || 0) + addQty).toFixed(3));
                        const factor = existingItem.conversion_factor || newItem.conversion_factor || 1;
                        existingItem.originalQty = newOrigQty;
                        existingItem.qty = parseFloat((newOrigQty * factor).toFixed(3));
                        if (newItem.observations && !existingItem.observations?.includes(newItem.observations)) {
                            existingItem.observations = [existingItem.observations, newItem.observations].filter(Boolean).join(' | ');
                        }
                        result[existingIdx] = existingItem;
                        mergedCount++;
                    } else {
                        result.unshift(newItem);
                    }
                }
                return result;
            });

            setIsStaging(false);
            setStagedItems([]);
            if (uploadedFileUrl) {
                URL.revokeObjectURL(uploadedFileUrl);
                setUploadedFileUrl(null);
            }
            if (importValidation?.poNumber || importValidation?.solpedNumber) {
                const poTokens: string[] = [];
                if (importValidation.poNumber) poTokens.push(`OC: ${importValidation.poNumber}`);
                if (importValidation.solpedNumber) poTokens.push(`SOLPED: ${importValidation.solpedNumber}`);
                const poPrefix = poTokens.join(' | ');
                setAdminNotes(prev => {
                    if (!prev) return poPrefix;
                    if (prev.includes(poPrefix)) return prev;
                    return `${poPrefix} | ${prev}`;
                });
            }

            if (mergedCount > 0) {
                showToast(`✅ Se inyectaron ${itemsToInject.length - mergedCount} productos y se consolidaron ${mergedCount} cantidades duplicadas.`, 'success');
            } else {
                showToast(`✅ Se han inyectado ${itemsToInject.length} productos al detalle del pedido.`, 'success');
            }
        } catch (err: any) {
            console.error('Error al confirmar importación:', err);
            showToast('Hubo un error al inyectar los productos al pedido.', 'error');
        } finally {
            setIsConfirmingImport(false);
        }
    };

    // --- GESTIÓN INTELIGENTE DE PEDIDOS RELACIONADOS MULTI-ENTREGA ---
    const handleCreateMultiOrders = async () => {
        if (!selectedClient) {
            showToast('⚠️ Debes seleccionar una empresa cliente antes de crear los pedidos.', 'error');
            return;
        }

        const group1Items = stagedItems.filter(i => !i.deliverySchedule && i.suggestedProduct);
        const group2Items = stagedItems.filter(i => i.deliverySchedule && i.suggestedProduct);

        if (group1Items.length === 0 && group2Items.length === 0) {
            showToast('⚠️ No hay productos válidos con match para crear pedidos.', 'error');
            return;
        }

        if (!multiOrderDate1 || !multiOrderDate2) {
            showToast('⚠️ Debes definir las fechas de entrega para ambos pedidos.', 'error');
            return;
        }

        setIsCreatingMultiOrders(true);
        try {
            // 1. Subida silenciosa del archivo al bucket si aún no está persistido
            let docUrl = permanentDocumentUrl;
            if (!docUrl && uploadedFile) {
                try {
                    const cleanFileName = `${Date.now()}_${uploadedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                    const filePath = `${cleanFileName}`;
                    const { error: upErr } = await supabase.storage
                        .from('order-attachments')
                        .upload(filePath, uploadedFile, { upsert: true });

                    if (!upErr) {
                        const { data: publicUrlData } = supabase.storage
                            .from('order-attachments')
                            .getPublicUrl(filePath);
                        if (publicUrlData?.publicUrl) {
                            docUrl = publicUrlData.publicUrl;
                            setPermanentDocumentUrl(docUrl);
                        }
                    }
                } catch (e) {
                    console.warn('Error subiendo adjunto a storage:', e);
                }
            }

            const targetClient = getSelectedClientDetails();
            const clientName = targetClient?.company_name || targetClient?.contact_name || 'Cliente';
            const poTokens: string[] = [];
            if (importValidation?.poNumber) poTokens.push(`OC: ${importValidation.poNumber}`);
            if (importValidation?.solpedNumber) poTokens.push(`SOLPED: ${importValidation.solpedNumber}`);
            const poNum = poTokens.length > 0 ? poTokens.join(' | ') : 'OC S/N';
            const secondarySchedule = group2Items[0]?.deliverySchedule || 'Entrega Diferida';

            const buildOrderPayload = (itemsGroup: any[], targetDate: string, deliveryLabel: string) => {
                let subtotal = 0;
                let tax = 0;
                let totalWeight = 0;

                const mappedItems = itemsGroup.map(item => {
                    const prodId = item.suggestedProduct.id;
                    const unitPrice = (prodId && contractPrices[prodId] !== undefined && contractPrices[prodId] !== null && contractPrices[prodId] > 0)
                        ? contractPrices[prodId]
                        : (item.price || item.suggestedProduct.base_price || 1000);

                    const qty = item.quantity;
                    const itemSubtotal = unitPrice * qty;
                    const ivaRate = item.suggestedProduct.iva_rate || 0;
                    const itemTax = itemSubtotal * (ivaRate / 100);
                    const weightFactor = parseFloat(item.suggestedProduct.weight_kg) || 1;
                    const itemWeight = (item.originalUnit === 'Kg' || item.originalUnit === 'kg') ? qty : (qty * weightFactor);

                    subtotal += itemSubtotal;
                    tax += itemTax;
                    totalWeight += itemWeight;

                    const structuredSpec = getStructuredSpecKey(item);
                    const publicOptionValues = item.selected_options 
                        ? Object.entries(item.selected_options)
                            .filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v.trim())
                            .map(([_, v]) => (v as string).trim())
                        : [];
                    const fallbackOptionLabel = publicOptionValues.length > 0 ? publicOptionValues.join(', ') : (item.observations || undefined);
                    const variantLabel = structuredSpec || item.variant_label || fallbackOptionLabel;

                    return {
                        product_id: item.suggestedProduct.id,
                        quantity: qty,
                        unit_price: unitPrice,
                        nickname: item.originalName || null,
                        variant_label: variantLabel || null,
                        unit: item.originalUnit || item.suggestedProduct.unit_of_measure || 'Kg',
                        selected_options: item.selected_options || {}
                    };
                });

                const total = subtotal + tax;

                return {
                    orderData: {
                        profile_id: selectedClient,
                        total: parseFloat(total.toFixed(2)),
                        subtotal: parseFloat(subtotal.toFixed(2)),
                        tax: parseFloat(tax.toFixed(2)),
                        total_weight_kg: parseFloat(totalWeight.toFixed(2)),
                        status: 'pending_approval',
                        payment_status: 'Pendiente',
                        payment_method: paymentMethod,
                        origin: 'Admin Panel',
                        origin_source: 'file_upload',
                        delivery_date: targetDate,
                        delivery_slot: deliverySlot,
                        admin_notes: `${poNum} [${deliveryLabel}] - ${clientName}${adminNotes ? ` | ${adminNotes}` : ''}`,
                        shipping_address: targetClient?.address || 'Dirección Principal',
                        document_url: docUrl
                    },
                    itemsData: mappedItems
                };
            };

            const payload1 = buildOrderPayload(group1Items, multiOrderDate1, 'Entrega 1/2 - Principal');
            const payload2 = buildOrderPayload(group2Items, multiOrderDate2, `Entrega 2/2 - ${secondarySchedule}`);

            // Insertar Pedido 1
            const { data: order1, error: err1 } = await supabase
                .from('orders')
                .insert(payload1.orderData)
                .select()
                .single();

            if (err1) throw new Error(`Error creando Pedido 1: ${err1.message}`);

            const items1WithOrderId = payload1.itemsData.map(it => ({ ...it, order_id: order1.id }));
            const { error: errItems1 } = await supabase
                .from('order_items')
                .insert(items1WithOrderId);

            if (errItems1) throw new Error(`Error guardando productos de Pedido 1: ${errItems1.message}`);

            // Insertar Pedido 2
            const { data: order2, error: err2 } = await supabase
                .from('orders')
                .insert(payload2.orderData)
                .select()
                .single();

            if (err2) throw new Error(`Error creando Pedido 2: ${err2.message}`);

            const items2WithOrderId = payload2.itemsData.map(it => ({ ...it, order_id: order2.id }));
            const { error: errItems2 } = await supabase
                .from('order_items')
                .insert(items2WithOrderId);

            if (errItems2) throw new Error(`Error guardando productos de Pedido 2: ${errItems2.message}`);

            // Memorizar aprendizaje de productos
            const learningPromises = stagedItems
                .filter(item => item.suggestedProduct && item.originalName)
                .map(item => recordLearningMemory(
                    supabase,
                    selectedClient,
                    item.originalName,
                    item.suggestedProduct.id,
                    item.originalUnit || item.suggestedProduct.unit_of_measure
                ));
            await Promise.allSettled(learningPromises);

            setMultiOrderSuccess({
                order1Id: order1.id,
                order2Id: order2.id
            });
            setShowMultiOrderModal(false);

            showToast(`🎉 ¡Éxito! Creados 2 Pedidos Relacionados para ${poNum}`, 'success');

            setIsStaging(false);
            setStagedItems([]);
            if (uploadedFileUrl) {
                URL.revokeObjectURL(uploadedFileUrl);
                setUploadedFileUrl(null);
            }
        } catch (err: any) {
            console.error('Error en handleCreateMultiOrders:', err);
            showToast(err.message || 'Error creando pedidos relacionados', 'error');
        } finally {
            setIsCreatingMultiOrders(false);
        }
    };

    const updateStagedItem = (id: string, field: string, value: any, rowIdx?: number) => {
        if (field === 'product') {
            const idx = rowIdx !== undefined ? rowIdx : stagedItems.findIndex(i => i.id === id);
            selectStagedProduct(id, value, idx);
            return;
        }
        setStagedItems(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, [field]: value, isConfirmed: true };
            }
            return item;
        }));
    };

    const handleGeocode = async (directAddress?: string, directCity?: string) => {
        const addr = directAddress || guestInfo.address;
        const cty = directCity || guestInfo.city;
        if (!addr || !cty) {
            showToast("Por favor ingrese dirección y ciudad para validar coordenadas.");
            return;
        }
        setIsGettingLocation(true);
        try {
            const response = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}&city=${encodeURIComponent(cty)}`);
            const text = await response.text();
            let data: any = {};
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(text || `Error de geocodificación (${response.status})`);
            }

            if (data.status === 'OK' && data.results && data.results.length > 0) {
                const location = data.results[0].geometry.location;
                const lat = location.lat;
                const lon = location.lng;
                setLatitude(lat);
                setLongitude(lon);
                setLastGeocodedAddress(addr);

                // Validar Geocerca
                if (b2cGeofence.length > 0) {
                    const inside = isInsidePolygon({ lat, lng: lon }, b2cGeofence);
                    setOutOfZone(!inside);
                } else {
                    setOutOfZone(false);
                }
            } else {
                showToast('❌ No se encontraron coordenadas para esta dirección en ' + guestInfo.city + '. Intente verificar la nomenclatura (ej: Cra 100 Sur # 100-21).', 'error');
                setLatitude(null);
                setLongitude(null);
            }
        } catch (error) {
            console.error("Geocoding error:", error);
            showToast('Error al validar dirección con Google Maps.', 'error');
        } finally {
            setIsGettingLocation(false);
        }
    };

    const handleOpenMap = async () => {
        if (guestInfo.address && guestInfo.address !== lastGeocodedAddress) {
            setIsGettingLocation(true);
            try {
                const response = await fetch(`/api/geocode?address=${encodeURIComponent(guestInfo.address)}&city=${encodeURIComponent(guestInfo.city || 'Bogotá')}`);
                const text = await response.text();
                let data: any = {};
                try {
                    data = JSON.parse(text);
                } catch {
                    console.error("Geocoding failed to parse response:", text);
                }

                if (data.status === 'OK' && data.results && data.results.length > 0) {
                    const location = data.results[0].geometry.location;
                    const lat = location.lat;
                    const lon = location.lng;
                    setLatitude(lat);
                    setLongitude(lon);
                    setLastGeocodedAddress(guestInfo.address);
                }
            } catch (error) {
                console.error("Geocoding error in handleOpenMap:", error);
            } finally {
                setIsGettingLocation(false);
                setShowMapPicker(true);
            }
        } else {
            setShowMapPicker(true);
        }
    };




    const handleSubmit = async () => {
        if (clientType === 'B2B' && !selectedClient) return showToast('Debes seleccionar un cliente Institucional.');
        
        // B2C Validation
        if (clientType === 'B2C') {
            if (b2cMode === 'new') {
                if (!guestInfo.name || !guestInfo.phone) return showToast('Debes ingresar al menos Nombre y Teléfono para cliente nuevo.');
                if (outOfZone && !hasCoverageOverride) return showToast('No se puede crear el pedido: La dirección está fuera de la zona de cobertura y no cuenta con Excepción Administrativa.');
                if (!latitude) return showToast('Debes validar la dirección con el botón "Validar" antes de continuar.');

            } else {
                if (!selectedClientB2C) return showToast('Debes buscar y seleccionar un cliente B2C existente.');
            }
        }

        if (cart.length === 0) return showToast('El pedido debe tener al menos un producto');

        // Block Zero Margin / Zero Price
        const zeroPriceItem = cart.find(item => !item.price || parseFloat(item.price.toString()) === 0);
        if (zeroPriceItem) {
            return showToast(`❌ No se puede guardar: El producto "${zeroPriceItem.product.name}" tiene precio $0 (sin tarifa en contrato ni B2C). Por favor ingrese un precio manual.`, 'error');
        }

        // Manual Delivery Validation
        if (isManualDelivery && !manualDeliveryTime) {
            return showToast('Si activas entrega manual, debes especificar la Hora.');
        }

        setLoading(true);
        try {
            // Upload document to order-attachments bucket if present
            let documentUrl = null;
            if (uploadedFile) {
                try {
                    const fileExt = uploadedFile.name.split('.').pop();
                    const fileName = `${crypto.randomUUID()}.${fileExt}`;
                    const filePath = `${fileName}`;

                    const { data: uploadData, error: uploadError } = await supabase
                        .storage
                        .from('order-attachments')
                        .upload(filePath, uploadedFile, { upsert: true });

                    if (uploadError) {
                        console.error('Error uploading order attachment:', uploadError);
                    } else {
                        const { data: publicUrlData } = supabase
                            .storage
                            .from('order-attachments')
                            .getPublicUrl(filePath);
                        documentUrl = publicUrlData?.publicUrl || null;
                    }
                } catch (uploadErr) {
                    console.error('Upload catch error:', uploadErr);
                }
            }

            let finalProfileId = clientType === 'B2B' ? selectedClient : (b2cMode === 'search' ? selectedClientB2C : null);
            let finalAdminNotes = adminNotes;
            
            // Append Payment Method to Admin Notes if B2C
            if (clientType === 'B2C') {
                const methodLabel = paymentMethod === 'contra_entrega' ? 'Contra Entrega' 
                                  : paymentMethod === 'transferencia' ? 'Transferencia Anticipada' 
                                  : 'Wompi / Link';
                finalAdminNotes = `[PAGO: ${methodLabel}]\n${finalAdminNotes}`;
            }

            // 1. If New B2C Client -> Create Profile
            if (clientType === 'B2C' && b2cMode === 'new') {
                let newProfileId = createdB2CProfileId;
                
                if (!newProfileId) {
                    newProfileId = crypto.randomUUID();
                    const { error: profileError } = await supabase
                        .from('profiles')
                        .insert({
                            id: newProfileId,
                            role: draftClientType === 'b2b_client' ? 'b2b_client' : 'b2c_client',
                            contact_name: guestInfo.name,
                            contact_phone: guestInfo.phone,
                            phone: guestInfo.phone,
                            address: guestInfo.address,
                            city: guestInfo.city,
                            company_name: guestInfo.name, // Helper for search
                            latitude: latitude,
                            longitude: longitude,
                            delivery_restrictions: (outOfZone && hasCoverageOverride) ? `EXCEPCIÓN AUTORIZADA: ${coverageOverrideReason}` : null,
                            geocoding_status: (outOfZone && hasCoverageOverride) ? 'OVERRIDE' : 'VALID',
                            created_at: new Date().toISOString(),
                            email: guestInfo.email || null,
                            nit: guestInfo.nit || null,
                            is_active: guestInfo.saveToDirectory
                        });

                    if (profileError) {
                        console.error('Error creating B2C profile:', profileError);
                        throw new Error('No se pudo guardar el cliente nuevo.');
                    }
                }

                finalProfileId = newProfileId;
                const overrideNote = (outOfZone && hasCoverageOverride) ? ` [EXCEPCIÓN DE COBERTURA: ${coverageOverrideReason}]` : '';
                const clientCreatedLabel = draftClientType === 'b2b_client' ? 'CLIENTE INSTITUCIONAL CREADO' : 'CLIENTE HOGAR CREADO';
                finalAdminNotes = `[${clientCreatedLabel}] ID: ${newProfileId} | Nombre: ${guestInfo.name} | CC: ${guestInfo.nit} | Tel: ${guestInfo.phone} | Email: ${guestInfo.email}${overrideNote}\n\n${adminNotes}`;
            } else if (clientType === 'B2C' && b2cMode === 'search') {
                const b2cDetails = getSelectedB2CDetails();
                finalAdminNotes = `[CLIENTE HOGAR EXISTENTE] ID: ${selectedClientB2C} | Nombre: ${b2cDetails?.contact_name}\n\n${adminNotes}`;
            }

            // Determine Shipping Address
            let shippingAddress = '';
            if (clientType === 'B2B') {
                const clientDetails = clients.find(c => c.id === selectedClient);
                shippingAddress = clientDetails?.address || 'Dirección Principal';
            } else if (clientType === 'B2C') {
                 // Whether new or existing, we have address in guestInfo (if new) or details (if search)
                 if (b2cMode === 'new') {
                     shippingAddress = `${guestInfo.address}, ${guestInfo.city}`;
                 } else {
                     const b2cDetails = getSelectedB2CDetails();
                     shippingAddress = b2cDetails?.address || 'Dirección Registrada';
                 }
            } else {
                shippingAddress = 'Por definir';
            }

            // Only send delivery_slot if B2C (or send null/default if B2B)
            const finalDeliverySlot = clientType === 'B2C' ? deliverySlot : 'AM'; 

            // Construct Logistics Data Override if Manual
            let logisticsOverride = null;
            if (isManualDelivery && manualDeliveryTime) {
                const [h, m] = manualDeliveryTime.split(':').map(Number);
                const totalMinutes = h * 60 + m;
                
                const startTotal = totalMinutes - manualDeliveryMargin;
                const endTotal = totalMinutes + manualDeliveryMargin;
                
                const startH = Math.floor(startTotal / 60);
                const startM = startTotal % 60;
                const endH = Math.floor(endTotal / 60);
                const endM = endTotal % 60;

                const formatT = (hh: number, mm: number) => `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
                
                logisticsOverride = {
                    is_manual: true,
                    manual_time: manualDeliveryTime,
                    manual_margin: manualDeliveryMargin,
                    manual_note: manualDeliveryNote,
                    windows: [{
                        startTime: formatT(startH, startM),
                        endTime: formatT(endH, endM)
                    }],
                    parsing_date: new Date().toISOString()
                };
            }

            let finalDocumentType = 'invoice';
            let finalRemissionWithPrices = true;

            if (clientType === 'B2B') {
                const b2bDetails = getSelectedClientDetails();
                if (b2bDetails) {
                    finalDocumentType = (b2bDetails as any).document_type || 'invoice';
                    finalRemissionWithPrices = (b2bDetails as any).remission_with_prices !== undefined ? (b2bDetails as any).remission_with_prices : true;
                }
            } else {
                if (b2cMode !== 'new') {
                    const b2cDetails = getSelectedB2CDetails();
                    if (b2cDetails) {
                        finalDocumentType = (b2cDetails as any).document_type || 'invoice';
                        finalRemissionWithPrices = (b2cDetails as any).remission_with_prices !== undefined ? (b2cDetails as any).remission_with_prices : true;
                    }
                }
            }

            // GAP-01: Interbloqueo de Crédito y Cartera para clientes B2B
            if (clientType === 'B2B' && finalProfileId) {
                const creditCheck = await checkClientCreditStatus(finalProfileId, calculateTotal());
                if (!creditCheck.allowed) {
                    showToast(creditCheck.reason || 'Operación cancelada por control de crédito.', 'error');
                    return;
                }
            }

            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert({
                    profile_id: finalProfileId,
                    total: calculateTotal(),
                    total_weight_kg: calculateTotalWeight(),
                    subtotal: calculateSubtotal(),
                    tax: calculateTotalTax(),
                    status: 'pending_approval',
                    payment_status: 'Pendiente',
                    payment_method: paymentMethod,
                    origin: 'Admin Panel',
                    origin_source: originSource, // Enviar canal de origen
                    delivery_date: deliveryDate,
                    delivery_slot: finalDeliverySlot,
                    admin_notes: finalAdminNotes, // Guardar notas sin redundancia de origen
                    shipping_address: shippingAddress,
                    latitude: latitude,
                    longitude: longitude,
                    // New Manual Delivery Fields
                    is_manual_delivery: isManualDelivery,
                    manual_delivery_time: manualDeliveryTime || null,
                    manual_delivery_margin: manualDeliveryMargin,
                    manual_delivery_note: manualDeliveryNote || null,
                    logistics_data: logisticsOverride,
                    document_url: permanentDocumentUrl || null
                })
                .select()
                .single();

            if (orderError) {
                console.error('Order Insert Error Detail:', orderError);
                throw new Error(orderError.message);
            }

            const itemsData = cart.map(item => {
                const qtyNum = parseFloat(item.qty.toString().replace(',', '.') || '0');
                const unitPrice = item.price !== undefined && item.price !== null ? item.price : item.product.base_price;
                return {
                    order_id: order.id,
                    product_id: item.product.id,
                    quantity: qtyNum,
                    unit_price: unitPrice,
                    nickname: item.nickname || item.variant_label || null,
                    variant_label: item.variant_label || null,
                    unit: item.originalUnit || item.product.unit_of_measure || 'Kg',
                    selected_options: item.selected_options || {}
                };
            });

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(itemsData);

            if (itemsError) {
                console.error('Order Items Insert Error Detail:', itemsError);
                // Rollback atómico: eliminar la orden huérfana de inmediato si falla la inserción de items (Hallazgo 7 SDD)
                await supabase.from('orders').delete().eq('id', order.id);
                throw new Error(itemsError.message);
            }

            // 1. If processing a draft, update its status
            const draftId = searchParams.get('draft_id');
            if (draftId) {
                await supabase
                    .from('order_drafts')
                    .update({ status: 'approved' })
                    .eq('id', draftId);
            }

            // 2. Queue outbound email notification
            let customerEmail = '';
            let customerName = '';
            if (clientType === 'B2B') {
                const details = getSelectedClientDetails();
                customerEmail = details?.email || '';
                customerName = details?.company_name || details?.contact_name || 'Cliente';
            } else {
                if (b2cMode === 'new') {
                    customerEmail = guestInfo.email || '';
                    customerName = guestInfo.name || 'Cliente';
                } else {
                    const details = getSelectedB2CDetails();
                    customerEmail = details?.email || '';
                    customerName = details?.contact_name || details?.company_name || 'Cliente';
                }
            }

            if (customerEmail) {
                console.log(`[Outbound Mail] Enqueueing confirmation email to ${customerEmail}`);
                const formattedItems = cart.map(item => {
                    const qtyNum = parseFloat(item.qty.toString().replace(',', '.') || '0');
                    const unitPrice = item.price !== undefined && item.price !== null ? item.price : (item.product.base_price || 0);
                    return {
                        name: item.product.name + (item.variant_label ? ` (${item.variant_label})` : ''),
                        quantity: qtyNum,
                        price: formatNumber(unitPrice),
                        total: formatNumber(unitPrice * qtyNum)
                    };
                });

                await supabase.from('mail').insert({
                    to_email: customerEmail,
                    subject: `¡Confirmación de Pedido FruFresco N° ${order.id.slice(0, 6).toUpperCase()}!`,
                    template: {
                        name: 'order_confirmation',
                        data: {
                            client: customerName,
                            order_number: order.id.slice(0, 6).toUpperCase(),
                            total_amount: formatNumber(calculateTotal()),
                            items: formattedItems
                        }
                    }
                });
            }

            showToast('Pedido creado exitosamente ✅', 'success');
            setUploadedFile(null);
            if (uploadedFileUrl) {
                URL.revokeObjectURL(uploadedFileUrl);
                setUploadedFileUrl(null);
            }
            router.push(`/admin/orders/loading?date=${deliveryDate}`);

        } catch (e: any) {
            console.error('Submit Full Error:', e);
            const msg = e.message || JSON.stringify(e);
            showToast('Error creando pedido: ' + msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Filters & Helpers
    // Re-evaluar duplicidad si el analista cambia el cliente seleccionado mientras la Mesa de Trabajo está activa
    useEffect(() => {
        if (isStaging && selectedClient && (importValidation?.poNumber || importValidation?.solpedNumber || (importValidation?.referencedCodes && importValidation.referencedCodes.length > 0))) {
            checkForDuplicateOrders(
                selectedClient, 
                importValidation.poNumber || null, 
                importValidation.solpedNumber || null, 
                importValidation.referencedCodes || []
            );
        }
    }, [selectedClient, isStaging]);

    const filteredProducts = useMemo(() => {
        if (!productSearch || productSearch.trim().length < 2) return [];

        const normalizeStr = (s: string) => (s || '')
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

        const cleanQuery = normalizeStr(productSearch);

        // Filter products that match query by name, sku, accounting_id, or client exception nickname
        const matched = (products || []).filter(p => {
            const normName = normalizeStr(p.name);
            const normSku = normalizeStr(p.sku);
            const normAcc = normalizeStr(String(p.accounting_id || ''));
            const exc = clientExceptions.find(e => e.product_id === p.id);
            const normNickname = exc?.nickname ? normalizeStr(exc.nickname) : '';

            return normName.includes(cleanQuery) ||
                   normSku.includes(cleanQuery) ||
                   normAcc.includes(cleanQuery) ||
                   normNickname.includes(cleanQuery);
        });

        // Compute relevance / prioritization score for each product
        return matched.sort((a, b) => {
            const excA = clientExceptions.find(e => e.product_id === a.id);
            const excB = clientExceptions.find(e => e.product_id === b.id);
            const freqA = clientFrequentProductMap[a.id];
            const freqB = clientFrequentProductMap[b.id];

            let scoreA = 0;
            let scoreB = 0;

            // Prioritize client exceptions/nicknames (highest boost)
            if (excA) scoreA += 1000;
            if (excB) scoreB += 1000;

            // Prioritize historical purchase frequency and volume
            if (freqA) scoreA += (freqA.count * 100) + Math.min(freqA.totalQty, 500);
            if (freqB) scoreB += (freqB.count * 100) + Math.min(freqB.totalQty, 500);

            // Name match prefix boost
            const normNameA = normalizeStr(a.name);
            const normNameB = normalizeStr(b.name);
            if (normNameA.startsWith(cleanQuery)) scoreA += 50;
            if (normNameB.startsWith(cleanQuery)) scoreB += 50;
            if (normNameA === cleanQuery) scoreA += 100;
            if (normNameB === cleanQuery) scoreB += 100;

            if (scoreB !== scoreA) {
                return scoreB - scoreA;
            }

            // Fallback: alphabetical
            return normNameA.localeCompare(normNameB);
        }).slice(0, 12);
    }, [productSearch, products, clientExceptions, clientFrequentProductMap]);

    const handleProductSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (filteredProducts.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedProductIndex(prev => (prev < filteredProducts.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedProductIndex(prev => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            const targetIdx = (focusedProductIndex >= 0 && focusedProductIndex < filteredProducts.length) ? focusedProductIndex : 0;
            const targetProd = filteredProducts[targetIdx];
            if (targetProd) {
                e.preventDefault();
                handleProductClick(targetProd);
                setFocusedProductIndex(-1);
            }
        } else if (e.key === 'Escape') {
            setProductSearch('');
            setFocusedProductIndex(-1);
        }
    };

    // Set of profile IDs that are matrices (parents of at least one branch)
    const parentMatrixIds = useMemo(() => {
        const set = new Set<string>();
        clients.forEach(c => {
            if (c.parent_id) {
                set.add(c.parent_id);
            }
        });
        return set;
    }, [clients]);

    // Map of matrix clients by ID for quick lookup of matrix details
    const matrixClientsMap = useMemo(() => {
        const map = new Map<string, any>();
        clients.forEach(c => {
            map.set(c.id, c);
        });
        return map;
    }, [clients]);

    const filteredClients = useMemo(() => {
        if (clientSearch.length < 2) return [];
        const query = clientSearch.toLowerCase().trim();

        // 1. Identify which Parent Matrices match the search query (e.g. "CLUB DEL COMERCIO DE BOGOTA", "COLSUBSIDIO")
        const matchedParentMatrixIds = new Set<string>();
        clients.forEach(c => {
            if (parentMatrixIds.has(c.id)) {
                const nameMatch = (c.company_name?.toLowerCase() || '').includes(query);
                const nitMatch = (c.nit?.toString() || '').includes(query);
                if (nameMatch || nitMatch) {
                    matchedParentMatrixIds.add(c.id);
                }
            }
        });

        // 2. Filter out pure Casa Matriz (profiles that have child branches and are not deliverable points)
        const deliverableClients = clients.filter(c => !parentMatrixIds.has(c.id));

        // Group A: Direct Sucursales belonging to the searched matrix (MUST show [Sucursal] badge and appear at top)
        const directSearchedBranches: any[] = [];
        // Group B: Other matching deliverable clients (independent companies or branches of other matrices) -> NO badge
        const otherMatches: any[] = [];

        deliverableClients.forEach(c => {
            const isDirectBranch = Boolean(c.parent_id && matchedParentMatrixIds.has(c.parent_id));

            const nameMatch = (c.company_name?.toLowerCase() || '').includes(query);
            const nitMatch = (c.nit?.toString() || '').includes(query);
            const contactMatch = (c.contact_name?.toLowerCase() || '').includes(query);
            const addressMatch = (c.address?.toLowerCase() || '').includes(query);
            const phoneMatch = (c.contact_phone?.toString() || '').includes(query);

            if (isDirectBranch) {
                directSearchedBranches.push({ ...c, isDirectSearchedBranch: true });
            } else if (nameMatch || nitMatch || contactMatch || addressMatch || phoneMatch) {
                otherMatches.push({ ...c, isDirectSearchedBranch: false });
            }
        });

        // Sort direct branches alphabetically
        directSearchedBranches.sort((a, b) => (a.company_name || '').localeCompare(b.company_name || '', 'es', { sensitivity: 'base' }));

        // Sort other matches alphabetically
        otherMatches.sort((a, b) => (a.company_name || '').localeCompare(b.company_name || '', 'es', { sensitivity: 'base' }));

        return [...directSearchedBranches, ...otherMatches].slice(0, 10);
    }, [clients, clientSearch, parentMatrixIds]);

    const selectedClientDetails = useMemo(() => {
        return clients.find(c => c.id === selectedClient);
    }, [clients, selectedClient]);

    const getSelectedClientDetails = () => selectedClientDetails;

    // Sucursales / Sedes hermanas pertenecientes al mismo grupo empresarial (mismo NIT o mismo parent_id)
    const siblingBranches = useMemo(() => {
        if (!selectedClientDetails) return [];
        const currentNit = selectedClientDetails.nit ? selectedClientDetails.nit.trim() : null;
        const currentParentId = selectedClientDetails.parent_id;
        const currentId = selectedClientDetails.id;

        return clients.filter(c => {
            if (c.id === currentId) return false;
            // Misma matriz (sucursales hermanas)
            if (currentParentId && c.parent_id === currentParentId) return true;
            // Esta sucursal es matriz y la otra es hija
            if (c.parent_id === currentId) return true;
            // La otra es matriz de esta sucursal
            if (currentParentId && c.id === currentParentId) return true;
            // Mismo NIT no vacío
            if (currentNit && c.nit && c.nit.trim() === currentNit) return true;
            return false;
        }).sort((a, b) => (a.company_name || '').localeCompare(b.company_name || '', 'es', { sensitivity: 'base' }));
    }, [selectedClientDetails, clients]);

    // Filtro interactivo de sedes hermanas por texto escrito por el usuario
    const filteredSiblingBranches = useMemo(() => {
        if (!branchFilterQuery.trim()) return siblingBranches;
        const q = branchFilterQuery.toLowerCase().trim();
        return siblingBranches.filter(b => {
            const name = (b.company_name || '').toLowerCase();
            const addr = (b.address || '').toLowerCase();
            const contact = (b.contact_name || '').toLowerCase();
            return name.includes(q) || addr.includes(q) || contact.includes(q);
        });
    }, [siblingBranches, branchFilterQuery]);

    // Detección contextual: ¿alguna sede hermana coincide con lo detectado en el documento (ej. "Cafetería", "Girardot")?
    const docSuggestedBranchId = useMemo(() => {
        if (!importValidation?.clientInDocument || siblingBranches.length === 0) return null;
        const docText = (importValidation.clientInDocument + ' ' + (selectedClientDetails?.address || '')).toLowerCase();
        const match = siblingBranches.find(b => {
            const bName = (b.company_name || '')
                .toLowerCase()
                .replace(/caja de compensacion familiar colsubsidio|colsubsidio|sede|sucursal|sas|s\.a\.s/gi, '')
                .trim();
            if (bName.length > 3 && docText.includes(bName)) return true;
            const bAddr = (b.address || '').toLowerCase();
            if (bAddr.length > 5 && docText.includes(bAddr)) return true;
            return false;
        });
        return match ? match.id : null;
    }, [importValidation?.clientInDocument, selectedClientDetails, siblingBranches]);

    // Validación Dinámica de Auditoría: compara en vivo la empresa/sede seleccionada con el cliente detectado en el documento
    const isAuditClientMatch = useMemo(() => {
        if (!importValidation?.clientInDocument) return true;
        if (!selectedClientDetails) return false;
        const selectedName = (selectedClientDetails.company_name || selectedClientDetails.contact_name || '').toUpperCase();
        const detectedName = (importValidation.clientInDocument || '').toUpperCase();
        if (!selectedName || !detectedName) return false;

        // Regla 1: Ambas comparten Colsubsidio
        if (detectedName.includes('COLSUBSIDIO') && selectedName.includes('COLSUBSIDIO')) return true;

        // Regla 2: Coincidencia por tokens relevantes
        const stopWords = ['CAJA', 'COMPENSACION', 'FAMILIAR', 'COLSUBSIDIO', 'SAS', 'S.A.S', 'S.A.', 'LTDA', 'SEDE', 'SUCURSAL', 'RESTAURANTE', 'CLIENTE', 'DE', 'DEL', 'Y', 'LA', 'EL'];
        const detectedTokens = detectedName.split(/[\s,.-]+/).filter(w => w.length > 2 && !stopWords.includes(w));
        const selectedTokens = selectedName.split(/[\s,.-]+/).filter(w => w.length > 2 && !stopWords.includes(w));

        const hasTokenMatch = detectedTokens.some(t => selectedName.includes(t)) || selectedTokens.some(t => detectedName.includes(t));
        return hasTokenMatch || selectedName.includes(detectedName.slice(0, 6)) || detectedName.includes(selectedName.slice(0, 6));
    }, [importValidation?.clientInDocument, selectedClientDetails]);

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <style>{`
                ${hideSpinnersStyle}
                @media (max-width: 1180px) {
                    .order-create-grid {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
            <div style={{
                width: '100%',
                maxWidth: '1850px',
                margin: '0 auto',
                padding: '1rem 1.5rem 3rem 1.5rem',
                boxSizing: 'border-box'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Link href="/admin/orders/loading" style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            textDecoration: 'none',
                            color: THEME.colors.textSecondary,
                            fontWeight: '600',
                            fontSize: '0.8rem',
                            padding: '0.35rem 0.65rem',
                            borderRadius: '6px',
                            backgroundColor: 'white',
                            border: '1px solid #E2E8F0',
                            transition: 'all 0.15s'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.color = THEME.colors.primary; e.currentTarget.style.borderColor = THEME.colors.primary; }}
                        onMouseOut={(e) => { e.currentTarget.style.color = THEME.colors.textSecondary; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                        >
                            <ArrowLeft size={14} strokeWidth={2} />
                            <span>Volver a Órdenes</span>
                        </Link>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary }}>
                                <FileText size={15} strokeWidth={2} />
                            </div>
                            <h1 style={{ fontSize: '1.25rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.02em' }}>Nuevo Pedido Manual</h1>
                        </div>
                    </div>
                    
                    {/* CLIENT SEGMENTATION (SLIM COMPACT PILL) */}
                    <div style={{ display: 'flex', gap: '3px', padding: '2px', backgroundColor: '#E2E8F0', borderRadius: '8px', width: '240px' }}>
                        <button
                            onClick={() => setClientType('B2B')}
                            style={{
                                flex: 1, padding: '0.35rem 0.5rem', borderRadius: '6px', border: 'none',
                                backgroundColor: clientType === 'B2B' ? THEME.colors.primary : 'transparent',
                                color: clientType === 'B2B' ? '#ffffff' : '#64748B',
                                fontWeight: '700', cursor: 'pointer', boxShadow: clientType === 'B2B' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.15s', fontSize: '0.75rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
                            }}
                        >
                            <Building2 size={13} strokeWidth={2} />
                            <span>Institucional</span>
                        </button>
                        <button
                            onClick={() => setClientType('B2C')}
                            style={{
                                flex: 1, padding: '0.35rem 0.5rem', borderRadius: '6px', border: 'none',
                                backgroundColor: clientType === 'B2C' ? THEME.colors.primary : 'transparent',
                                color: clientType === 'B2C' ? '#ffffff' : '#64748B',
                                fontWeight: '700', cursor: 'pointer', boxShadow: clientType === 'B2C' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.15s', fontSize: '0.75rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
                            }}
                        >
                            <Home size={13} strokeWidth={2} />
                            <span>Hogar</span>
                        </button>
                    </div>
                </div>

                <div className="order-create-grid" style={{ display: 'grid', gridTemplateColumns: isStaging ? '1fr' : 'minmax(0, 1fr) 380px', gap: '1.25rem', alignItems: 'start' }}>

                    {/* LEFT COLUMN: FORM & PRODUCTS */}
                    <div style={{ backgroundColor: THEME.colors.surface, padding: '1.25rem 1.5rem', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                        
                        {/* CLIENT SELECTION SECTION */}
                        <div style={{ marginBottom: '1.25rem' }}>
                            {clientType === 'B2B' ? (
                                <div style={{ position: 'relative' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' }}>
                                        Buscar Empresa Institucional
                                    </label>

                                    {selectedClient ? (
                                        <div style={{
                                            padding: '0.85rem 1.15rem', 
                                            backgroundColor: '#F0FDF4', 
                                            border: '1.5px solid #86EFAC', 
                                            borderRadius: '12px',
                                            display: 'flex', 
                                            flexDirection: 'column',
                                            gap: '0.6rem',
                                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
                                                    <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#166534', backgroundColor: '#DCFCE7', border: '1px solid #BBF7D0', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                        SUCURSAL SELECCIONADA
                                                    </span>
                                                    <span style={{ fontWeight: '900', color: '#14532D', fontSize: '1.05rem' }}>
                                                        {selectedClientDetails?.company_name}
                                                    </span>
                                                    {activePricingModel && (
                                                        <span style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '5px',
                                                            backgroundColor: '#E0F2FE',
                                                            border: '1px solid #BAE6FD',
                                                            color: '#0369A1',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '700',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}>
                                                            <Tag size={12} strokeWidth={2} />
                                                            {activePricingModel?.is_agreement ? `Acuerdo: ${activePricingModel.name}` : `Tarifa: ${activePricingModel?.name || 'General Institucional'}`}
                                                            {isContractExpired && <span style={{ color: '#DC2626' }}>(Expirado)</span>}
                                                        </span>
                                                    )}
                                                    {selectedClientDetails?.parent_id && (
                                                        <span style={{ fontSize: '0.75rem', color: '#15803D', fontWeight: '600' }}>
                                                            (Matriz: {clients.find(c => c.id === selectedClientDetails?.parent_id)?.company_name || 'Corporativo'})
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedClient('')}
                                                    style={{ 
                                                        background: '#DCFCE7', 
                                                        border: '1px solid #86EFAC', 
                                                        color: '#166534', 
                                                        padding: '4px 10px', 
                                                        borderRadius: '6px', 
                                                        display: 'inline-flex', 
                                                        alignItems: 'center', 
                                                        gap: '5px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '700',
                                                        transition: 'all 0.15s'
                                                    }}
                                                    onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#BBF7D0'; }}
                                                    onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#DCFCE7'; }}
                                                    title="Buscar otra empresa"
                                                >
                                                    <Search size={13} />
                                                    <span>Buscar Otra Empresa</span>
                                                </button>
                                            </div>

                                            {/* BUSCADOR INTERACTIVO DE OTRAS SEDES DE LA MISMA EMPRESA */}
                                            {siblingBranches.length > 0 && (
                                                <div style={{ position: 'relative', width: '100%' }}>
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        padding: '6px 10px',
                                                        backgroundColor: '#FFFFFF',
                                                        borderRadius: '8px',
                                                        border: '1px solid #86EFAC',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                                    }}>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#15803D', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <Building2 size={14} color="#16A34A" />
                                                            Sedes de esta empresa ({siblingBranches.length}):
                                                        </span>
                                                        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                                                            <Search size={13} style={{ position: 'absolute', left: '8px', color: '#94A3B8', pointerEvents: 'none' }} />
                                                            <input
                                                                type="text"
                                                                placeholder={`Escribe para filtrar sede (ej. "${siblingBranches[0]?.company_name?.split('-')?.[1]?.trim() || 'Cafetería'}", "${siblingBranches[0]?.address?.split(' ')?.[0] || 'Calle'}")...`}
                                                                value={branchFilterQuery}
                                                                onChange={(e) => {
                                                                    setBranchFilterQuery(e.target.value);
                                                                    setIsBranchDropdownOpen(true);
                                                                }}
                                                                onFocus={() => setIsBranchDropdownOpen(true)}
                                                                style={{
                                                                    width: '100%',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: '600',
                                                                    padding: '4px 26px 4px 26px',
                                                                    borderRadius: '6px',
                                                                    border: '1px solid #CBD5E1',
                                                                    backgroundColor: '#F8FAFC',
                                                                    color: '#0F172A',
                                                                    outline: 'none'
                                                                }}
                                                            />
                                                            {branchFilterQuery && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setBranchFilterQuery('')}
                                                                    style={{ position: 'absolute', right: '6px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '2px' }}
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsBranchDropdownOpen(prev => !prev)}
                                                            style={{
                                                                backgroundColor: isBranchDropdownOpen ? '#DCFCE7' : '#F1F5F9',
                                                                border: '1px solid #CBD5E1',
                                                                borderRadius: '6px',
                                                                padding: '4px 8px',
                                                                fontSize: '0.72rem',
                                                                fontWeight: '700',
                                                                color: '#334155',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <span>{isBranchDropdownOpen ? 'Cerrar' : `Ver ${filteredSiblingBranches.length}`}</span>
                                                            <ChevronDown size={12} style={{ transform: isBranchDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                                                        </button>
                                                    </div>

                                                    {/* LISTADO FLOTANTE DE SEDES FILTRADAS */}
                                                    {isBranchDropdownOpen && (
                                                        <>
                                                            <div 
                                                                style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
                                                                onClick={() => setIsBranchDropdownOpen(false)} 
                                                            />
                                                            <div style={{
                                                                position: 'absolute',
                                                                top: 'calc(100% + 4px)',
                                                                left: 0,
                                                                right: 0,
                                                                maxHeight: '260px',
                                                                overflowY: 'auto',
                                                                backgroundColor: '#FFFFFF',
                                                                border: '1px solid #86EFAC',
                                                                borderRadius: '8px',
                                                                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
                                                                zIndex: 50
                                                            }}>
                                                                {filteredSiblingBranches.length === 0 ? (
                                                                    <div style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#64748B', textAlign: 'center' }}>
                                                                        No se encontraron sedes con "{branchFilterQuery}"
                                                                    </div>
                                                                ) : (
                                                                    filteredSiblingBranches.map(b => {
                                                                        const isSelected = b.id === selectedClient;
                                                                        const isDocSuggested = docSuggestedBranchId === b.id;
                                                                        return (
                                                                            <div
                                                                                key={b.id}
                                                                                onClick={() => {
                                                                                    selectClient(b);
                                                                                    setIsBranchDropdownOpen(false);
                                                                                    setBranchFilterQuery('');
                                                                                    showToast(`🏢 Sede cambiada a: ${b.company_name}`, 'success');
                                                                                }}
                                                                                style={{
                                                                                    padding: '0.65rem 0.85rem',
                                                                                    cursor: 'pointer',
                                                                                    borderBottom: '1px solid #F1F5F9',
                                                                                    backgroundColor: isSelected ? '#DCFCE7' : isDocSuggested ? '#FEF3C7' : '#FFFFFF',
                                                                                    display: 'flex',
                                                                                    justifyContent: 'space-between',
                                                                                    alignItems: 'center',
                                                                                    gap: '8px',
                                                                                    transition: 'background-color 0.1s'
                                                                                }}
                                                                                onMouseEnter={(e) => {
                                                                                    if (!isSelected) e.currentTarget.style.backgroundColor = isDocSuggested ? '#FDE68A' : '#F8FAFC';
                                                                                }}
                                                                                onMouseLeave={(e) => {
                                                                                    if (!isSelected) e.currentTarget.style.backgroundColor = isDocSuggested ? '#FEF3C7' : '#FFFFFF';
                                                                                }}
                                                                            >
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: isSelected ? '#166534' : '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                        <span>{b.company_name}</span>
                                                                                        {isDocSuggested && (
                                                                                            <span style={{ fontSize: '0.68rem', backgroundColor: '#F59E0B', color: '#FFFFFF', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                                                                                ⭐ Sugerida por documento
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    {b.address && (
                                                                                        <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                            <MapPin size={11} color="#94A3B8" />
                                                                                            <span>{b.address} {b.city ? `(${b.city})` : ''}</span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    style={{
                                                                                        fontSize: '0.7rem',
                                                                                        fontWeight: '700',
                                                                                        padding: '3px 8px',
                                                                                        borderRadius: '4px',
                                                                                        border: 'none',
                                                                                        backgroundColor: isSelected ? '#16A34A' : '#E2E8F0',
                                                                                        color: isSelected ? '#FFFFFF' : '#334155',
                                                                                        cursor: 'pointer',
                                                                                        whiteSpace: 'nowrap'
                                                                                    }}
                                                                                >
                                                                                    {isSelected ? 'Actual' : 'Elegir'}
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    })
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.78rem', color: '#166534', flexWrap: 'wrap', borderTop: '1px solid #DCFCE7', paddingTop: '0.45rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <MapPin size={13} strokeWidth={1.5} style={{ color: '#15803D' }} />
                                                    <span style={{ fontWeight: '700' }}>{selectedClientDetails?.address || 'Sin dirección'}</span>
                                                    <span style={{ opacity: 0.85 }}>({selectedClientDetails?.city || 'Bogotá'})</span>
                                                </div>
                                                {selectedClientDetails?.contact_name && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <User size={13} strokeWidth={1.5} style={{ color: '#15803D' }} />
                                                        <span>{selectedClientDetails?.contact_name}</span>
                                                        {selectedClientDetails?.contact_phone && (
                                                            <span style={{ opacity: 0.85 }}>• {selectedClientDetails?.contact_phone}</span>
                                                        )}
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Globe size={13} strokeWidth={1.5} style={{ color: '#15803D' }} />
                                                    <span style={{ fontWeight: '600' }}>{selectedClientDetails?.latitude ? 'GPS Confirmado' : 'GPS Pendiente'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                <div style={{ position: 'absolute', left: '10px', color: '#94A3B8', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                                                    <Search size={15} />
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Buscar por Nombre, NIT, Dirección o Teléfono..."
                                                    value={clientSearch}
                                                    onChange={(e) => {
                                                        setClientSearch(e.target.value);
                                                        setFocusedClientIndex(-1);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (filteredClients.length === 0) return;
                                                        if (e.key === 'ArrowDown') {
                                                            e.preventDefault();
                                                            setFocusedClientIndex(prev => Math.min(prev + 1, filteredClients.length - 1));
                                                        } else if (e.key === 'ArrowUp') {
                                                            e.preventDefault();
                                                            setFocusedClientIndex(prev => Math.max(prev - 1, -1));
                                                        } else if (e.key === 'Enter' || e.key === 'Tab') {
                                                            const targetIndex = focusedClientIndex >= 0 ? focusedClientIndex : 0;
                                                            if (filteredClients[targetIndex]) {
                                                                e.preventDefault();
                                                                selectClient(filteredClients[targetIndex]);
                                                                setFocusedClientIndex(-1);
                                                            }
                                                        } else if (e.key === 'Escape') {
                                                            setClientSearch('');
                                                            setFocusedClientIndex(-1);
                                                        }
                                                    }}
                                                    style={{ width: '100%', padding: '0.55rem 0.85rem 0.55rem 2.2rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.88rem', height: '38px', outline: 'none' }}
                                                    onFocus={(e) => e.target.style.borderColor = '#0D7A57'}
                                                    onBlur={(e) => e.target.style.borderColor = '#CBD5E1'}
                                                />
                                            </div>
                                            {filteredClients.length > 0 && (
                                                <div style={{
                                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                                                    backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '12px',
                                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.15)', marginTop: '0.5rem',
                                                    maxHeight: '280px', overflowY: 'auto'
                                                }}>
                                                    {filteredClients.map((c, idx) => {
                                                        const parentMatrix = c.parent_id ? matrixClientsMap.get(c.parent_id) : null;
                                                        const isFocused = idx === focusedClientIndex;
                                                        const isDirectBranch = Boolean(c.isDirectSearchedBranch && parentMatrix);

                                                        return (
                                                            <div
                                                                key={c.id}
                                                                onClick={() => selectClient(c)}
                                                                style={{
                                                                    padding: '0.85rem 1.15rem', 
                                                                    cursor: 'pointer', 
                                                                    borderBottom: '1px solid #E2E8F0',
                                                                    borderLeft: isFocused ? '6px solid #2563EB' : '6px solid transparent',
                                                                    display: 'flex', 
                                                                    justifyContent: 'space-between', 
                                                                    alignItems: 'center',
                                                                    backgroundColor: isFocused ? '#DBEAFE' : 'white',
                                                                    boxShadow: isFocused ? 'inset 0 0 0 1px #93C5FD' : 'none',
                                                                    transition: 'all 0.12s ease-in-out'
                                                                }}
                                                                onMouseEnter={() => setFocusedClientIndex(idx)}
                                                                onMouseLeave={() => setFocusedClientIndex(-1)}
                                                            >
                                                                <div>
                                                                    <div style={{ fontWeight: isFocused ? '900' : '700', color: isFocused ? '#1E3A8A' : '#1F2937', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                        <span>{c.company_name}</span>
                                                                        {isDirectBranch && (
                                                                            <span style={{ 
                                                                                fontSize: '0.7rem', 
                                                                                backgroundColor: isFocused ? '#BFDBFE' : '#FFF7ED', 
                                                                                color: isFocused ? '#1E40AF' : '#C2410C', 
                                                                                padding: '1px 6px', 
                                                                                borderRadius: '4px', 
                                                                                fontWeight: '800',
                                                                                border: `1px solid ${isFocused ? '#93C5FD' : '#FFEDD5'}` 
                                                                            }}>
                                                                                Sucursal
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.8rem', fontWeight: isFocused ? '600' : 'normal', color: isFocused ? '#2563EB' : '#6B7280', marginTop: '2px' }}>
                                                                        {isDirectBranch && parentMatrix && <span style={{ color: isFocused ? '#1D4ED8' : '#64748B', fontWeight: '600' }}>Matriz: {parentMatrix.company_name} • </span>}
                                                                        NIT: {c.nit || (isDirectBranch && parentMatrix?.nit) || 'N/A'} • {c.address || 'Sin dirección registrada'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </>
                                    )}


                                </div>

                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                                    
                                    {/* TOGGLE: EXISTING VS NEW B2C */}
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <button
                                            onClick={() => setB2CMode('search')}
                                            style={{
                                                flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB',
                                                backgroundColor: b2cMode === 'search' ? '#EFF6FF' : 'white',
                                                color: b2cMode === 'search' ? '#1D4ED8' : '#6B7280',
                                                fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem'
                                            }}
                                        >
                                            Buscar Cliente Existente
                                        </button>
                                        <button
                                            onClick={() => setB2CMode('new')}
                                            style={{
                                                flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB',
                                                backgroundColor: b2cMode === 'new' ? '#EFF6FF' : 'white',
                                                color: b2cMode === 'new' ? '#1D4ED8' : '#6B7280',
                                                fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem'
                                            }}
                                        >
                                            Cliente Nuevo
                                        </button>
                                    </div>

                                    {b2cMode === 'search' ? (
                                        <div style={{ position: 'relative' }}>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Buscar por Nombre o Teléfono</label>
                                            
                                            {selectedClientB2C ? (
                                                <div style={{
                                                    padding: '1rem 1.2rem', 
                                                    backgroundColor: '#EFF6FF', 
                                                    border: '1px solid #93C5FD', 
                                                    borderRadius: '14px',
                                                    display: 'flex', 
                                                    flexDirection: 'column',
                                                    gap: '0.75rem',
                                                    boxShadow: '0 2px 8px rgba(30, 64, 175, 0.05)'
                                                }}>
                                                    {/* Top Row: Name, Badge and Close Button */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: '800', color: '#1E40AF', fontSize: '1.15rem', lineHeight: '1.2' }}>
                                                                {getSelectedB2CDetails()?.contact_name || getSelectedB2CDetails()?.company_name}
                                                            </div>
                                                            {activePricingModel && (
                                                                <div style={{
                                                                    marginTop: '0.35rem',
                                                                    padding: '0.2rem 0.55rem',
                                                                    borderRadius: '6px',
                                                                    backgroundColor: isB2CDefault ? '#FFF7ED' : '#E0F2FE',
                                                                    border: `1px solid ${isB2CDefault ? '#FED7AA' : '#BAE6FD'}`,
                                                                    color: isB2CDefault ? '#C2410C' : '#0369A1',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 'bold',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}>
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Tag size={13} strokeWidth={2} /> {isB2CDefault ? 'Tarifa B2C (Por Defecto)' : `Modelo: ${activePricingModel.name}`}</span>
                                                                    {isContractExpired && <span style={{ color: '#DC2626' }}>(Contrato Expirado)</span>}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => { setSelectedClientB2C(''); setGuestInfo({ name: '', phone: '', address: '', city: 'Bogotá', email: '', nit: '', saveToDirectory: true }); }}
                                                            style={{ 
                                                                background: '#DBEAFE', 
                                                                border: 'none', 
                                                                color: '#1D4ED8', 
                                                                width: '26px', 
                                                                height: '26px', 
                                                                borderRadius: '50%', 
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                justifyContent: 'center', 
                                                                cursor: 'pointer',
                                                                fontSize: '0.85rem',
                                                                fontWeight: '800',
                                                                flexShrink: 0
                                                            }}
                                                            title="Cambiar Cliente"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>

                                                    {/* Data Grid with Perfect Y-Axis Alignment */}
                                                    <div style={{ 
                                                        display: 'grid', 
                                                        gridTemplateColumns: '1fr 1fr', 
                                                        gap: '0.6rem 1rem', 
                                                        paddingTop: '0.65rem', 
                                                        borderTop: '1px solid #BFDBFE',
                                                        fontSize: '0.82rem' 
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1E3A8A' }}>
                                                            <div style={{ fontWeight: '700', color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                                <Phone size={13} strokeWidth={1.5} /> Tel:
                                                            </div>
                                                            <div style={{ fontWeight: '600', color: '#1E3A8A' }}>
                                                                {getSelectedB2CDetails()?.contact_phone || 'N/A'}
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1E3A8A' }}>
                                                            <div style={{ fontWeight: '700', color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                                <FileText size={13} strokeWidth={1.5} /> CC/NIT:
                                                            </div>
                                                            <div style={{ fontWeight: '600', color: '#1E3A8A' }}>
                                                                {getSelectedB2CDetails()?.nit || 'N/A'}
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1E3A8A', gridColumn: '1 / -1' }}>
                                                            <div style={{ fontWeight: '700', color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                                <Mail size={13} strokeWidth={1.5} /> Email:
                                                            </div>
                                                            <div style={{ fontWeight: '600', color: '#1E3A8A', wordBreak: 'break-all' }}>
                                                                {getSelectedB2CDetails()?.email || 'N/A'}
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1E3A8A', gridColumn: '1 / -1', flexWrap: 'wrap' }}>
                                                            <div style={{ fontWeight: '700', color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                                <MapPin size={13} strokeWidth={1.5} /> Dir:
                                                            </div>
                                                            <div style={{ fontWeight: '600', color: '#1E3A8A' }}>
                                                                {getSelectedB2CDetails()?.address || 'Sin dirección'}
                                                                <span style={{ fontWeight: '400', opacity: 0.8, marginLeft: '4px' }}>({getSelectedB2CDetails()?.city || 'Bogotá'})</span>
                                                            </div>
                                                        </div>

                                                        <div style={{ gridColumn: '1 / -1', marginTop: '2px' }}>
                                                            {(getSelectedB2CDetails()?.latitude && getSelectedB2CDetails()?.longitude) ? (
                                                                <div style={{ color: '#15803D', fontWeight: '700', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: '#DCFCE7', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid #BBF7D0' }}>
                                                                    <CheckCircle2 size={13} strokeWidth={2} color="#16A34A" /> Georeferenciado ({getSelectedB2CDetails()?.latitude?.toFixed(4)}, {getSelectedB2CDetails()?.longitude?.toFixed(4)})
                                                                </div>
                                                            ) : (
                                                                <div style={{ color: '#B91C1C', fontWeight: '700', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: '#FEE2E2', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid #FCA5A5' }}>
                                                                    <AlertTriangle size={13} strokeWidth={2} color="#EF4444" /> Sin Georeferenciación
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Botón Repetir Último Pedido del Cliente Hogar */}
                                                        <div style={{ gridColumn: '1 / -1', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #BFDBFE' }}>
                                                            <button
                                                                type="button"
                                                                onClick={handleLoadLastOrderForB2C}
                                                                disabled={loadingLastOrderB2C}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '0.65rem 1rem',
                                                                    backgroundColor: loadingLastOrderB2C ? '#F3F4F6' : '#ECFDF5',
                                                                    border: '1.5px solid #A7F3D0',
                                                                    borderRadius: '10px',
                                                                    color: loadingLastOrderB2C ? '#9CA3AF' : '#047857',
                                                                    fontWeight: '800',
                                                                    fontSize: '0.84rem',
                                                                    cursor: loadingLastOrderB2C ? 'not-allowed' : 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '8px',
                                                                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.12)',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                {loadingLastOrderB2C ? (
                                                                    <>
                                                                        <Loader2 size={16} className="animate-spin" /> Buscando pedido anterior...
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <RotateCcw size={16} /> Repetir Último Pedido de este Cliente
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                                ) : (
                                                    <>
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <input
                                                                type="text"
                                                                placeholder="Ej: Juan Pérez o 300..."
                                                                value={clientSearchB2C}
                                                                onChange={(e) => {
                                                                    setClientSearchB2C(e.target.value);
                                                                    setFocusedClientIndexB2C(-1);
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (filteredClientsB2C.length === 0) return;
                                                                    if (e.key === 'ArrowDown') {
                                                                        e.preventDefault();
                                                                        setFocusedClientIndexB2C(prev => Math.min(prev + 1, filteredClientsB2C.length - 1));
                                                                    } else if (e.key === 'ArrowUp') {
                                                                        e.preventDefault();
                                                                        setFocusedClientIndexB2C(prev => Math.max(prev - 1, -1));
                                                                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                                                                        const targetIndex = focusedClientIndexB2C >= 0 ? focusedClientIndexB2C : 0;
                                                                        if (filteredClientsB2C[targetIndex]) {
                                                                            e.preventDefault();
                                                                            selectClientB2C(filteredClientsB2C[targetIndex]);
                                                                            setFocusedClientIndexB2C(-1);
                                                                        }
                                                                    } else if (e.key === 'Escape') {
                                                                        setClientSearchB2C('');
                                                                        setFocusedClientIndexB2C(-1);
                                                                    }
                                                                }}
                                                                style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                                            />
                                                            <button 
                                                                onClick={loadData}
                                                                style={{ 
                                                                    padding: '0 1rem', 
                                                                    backgroundColor: 'white', 
                                                                    border: '1px solid #D1D5DB', 
                                                                    borderRadius: '8px', 
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    color: THEME.colors.primary
                                                                }}
                                                                title="Actualizar Lista de Clientes"
                                                            >
                                                                <RefreshCw size={16} strokeWidth={1.5} />
                                                            </button>
                                                        </div>
                                                        {filteredClientsB2C.length > 0 && (
                                                            <div style={{
                                                                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                                                                backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '12px',
                                                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', marginTop: '0.5rem', overflow: 'hidden', maxHeight: '220px', overflowY: 'auto'
                                                            }}>
                                                                {filteredClientsB2C.map((c, idx) => (
                                                                    <div
                                                                        key={c.id}
                                                                        id={`b2c-client-item-${idx}`}
                                                                        onClick={() => {
                                                                            selectClientB2C(c);
                                                                            setFocusedClientIndexB2C(-1);
                                                                        }}
                                                                        style={{
                                                                            padding: '0.85rem 1.15rem', 
                                                                            cursor: 'pointer', 
                                                                            borderBottom: '1px solid #E2E8F0',
                                                                            borderLeft: idx === focusedClientIndexB2C ? '6px solid #2563EB' : '6px solid transparent',
                                                                            display: 'flex', 
                                                                            justifyContent: 'space-between', 
                                                                            alignItems: 'center',
                                                                            backgroundColor: idx === focusedClientIndexB2C ? '#DBEAFE' : 'white',
                                                                            boxShadow: idx === focusedClientIndexB2C ? 'inset 0 0 0 1px #93C5FD' : 'none',
                                                                            transition: 'all 0.12s ease-in-out'
                                                                        }}
                                                                        onMouseEnter={() => setFocusedClientIndexB2C(idx)}
                                                                        onMouseLeave={() => setFocusedClientIndexB2C(-1)}
                                                                    >
                                                                        <div>
                                                                            <div style={{ fontWeight: idx === focusedClientIndexB2C ? '900' : '700', color: idx === focusedClientIndexB2C ? '#1E3A8A' : '#1F2937' }}>
                                                                                {c.contact_name || c.company_name}
                                                                            </div>
                                                                            <div style={{ fontSize: '0.8rem', fontWeight: idx === focusedClientIndexB2C ? '600' : 'normal', color: idx === focusedClientIndexB2C ? '#2563EB' : '#6B7280' }}>
                                                                                {c.contact_phone} • {c.address}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div style={{ gridColumn: '1 / -1' }}>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Nombre del Cliente</label>
                                                <input
                                                    type="text"
                                                    placeholder="Ej: María Pérez"
                                                    value={guestInfo.name} onChange={e => setGuestInfo({ ...guestInfo, name: e.target.value })}
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                                />
                                            </div>
                                            
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Cédula / NIT</label>
                                                <input
                                                    type="text"
                                                    placeholder="Ej: 123456789"
                                                    value={guestInfo.nit} onChange={e => setGuestInfo({ ...guestInfo, nit: e.target.value })}
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Teléfono</label>
                                                <input
                                                    type="text"
                                                    placeholder="Ej: 300 123 4567"
                                                    value={guestInfo.phone} onChange={e => setGuestInfo({ ...guestInfo, phone: e.target.value })}
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Correo Electrónico</label>
                                                <input
                                                    type="email"
                                                    placeholder="ejemplo@email.com"
                                                    value={guestInfo.email} onChange={e => setGuestInfo({ ...guestInfo, email: e.target.value })}
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Ciudad</label>
                                                <select
                                                    value={guestInfo.city} 
                                                    onChange={e => setGuestInfo({ ...guestInfo, city: e.target.value })}
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                                >
                                                    <option value="Bogotá">Bogotá</option>
                                                    <option value="Medellín">Medellín</option>
                                                    <option value="Cali">Cali</option>
                                                    <option value="Barranquilla">Barranquilla</option>
                                                    <option value="Chía">Chía</option>
                                                    <option value="Cajicá">Cajicá</option>
                                                    <option value="Soacha">Soacha</option>
                                                </select>
                                            </div>

                                            <div style={{ gridColumn: '1 / -1' }}>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Dirección de Entrega</label>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="Ej: Cra 15 # 85 - 10"
                                                        value={guestInfo.address} onChange={e => setGuestInfo({ ...guestInfo, address: e.target.value })}
                                                        style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                                    />
                                                    <button
                                                        onClick={() => handleGeocode()}
                                                        disabled={isGettingLocation}
                                                        type="button"
                                                        style={{
                                                            backgroundColor: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '0 1rem', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px'
                                                        }}
                                                    >
                                                        {isGettingLocation ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />} Validar
                                                    </button>
                                                    <button
                                                        onClick={handleOpenMap}
                                                        type="button"
                                                        style={{
                                                            backgroundColor: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '0 1rem', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px'
                                                        }}
                                                    >
                                                        <MapIcon size={16} /> Ver en Mapa
                                                    </button>
                                                </div>
                                                {latitude && longitude && (
                                                    <div style={{ 
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                                                        padding: '0.6rem 1rem', backgroundColor: (outOfZone && !hasCoverageOverride) ? '#FEF2F2' : (outOfZone && hasCoverageOverride) ? '#FFFBEB' : '#F0FDF4', 
                                                        border: (outOfZone && !hasCoverageOverride) ? '1px solid #FECACA' : (outOfZone && hasCoverageOverride) ? '1px solid #FDE68A' : '1px solid #DCFCE7', 
                                                        borderRadius: '8px', marginTop: '8px' 
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            {(outOfZone && !hasCoverageOverride) ? (
                                                                <>
                                                                    <X size={18} color="#DC2626" />
                                                                    <span style={{ fontSize: '0.8rem', color: '#DC2626', fontWeight: '700' }}>
                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#EF4444' }}><AlertTriangle size={14} strokeWidth={1.5} /> Fuera de Cobertura ({latitude.toFixed(5)}, {longitude.toFixed(5)})</span>
                                                                    </span>
                                                                </>
                                                            ) : (outOfZone && hasCoverageOverride) ? (
                                                                <>
                                                                    <CheckCircle2 size={18} color="#D97706" />
                                                                    <span style={{ fontSize: '0.8rem', color: '#D97706', fontWeight: '700' }}>
                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#D97706' }}><Sparkles size={14} strokeWidth={1.5} /> Excepción Autorizada: {coverageOverrideReason || 'Sin motivo'} ({latitude.toFixed(5)}, {longitude.toFixed(5)})</span>
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <CheckCircle2 size={18} color="#166534" />
                                                                    <span style={{ fontSize: '0.8rem', color: '#166534', fontWeight: '700' }}>
                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16A34A' }}><CheckCircle2 size={14} strokeWidth={1.5} /> Ubicación Confirmada ({latitude.toFixed(5)}, {longitude.toFixed(5)})</span>
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={handleOpenMap}
                                                            type="button"
                                                            style={{ background: 'none', border: 'none', color: (outOfZone && !hasCoverageOverride) ? '#DC2626' : (outOfZone && hasCoverageOverride) ? '#D97706' : '#166534', fontWeight: '800', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.75rem' }}
                                                        >
                                                            Ajustar Pin
                                                        </button>
                                                    </div>
                                                )}

                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>


                        {/* PDF UPLOAD FOR SPECIFIC B2B CLIENTS */}
                        {clientType === 'B2B' && selectedClient && getSelectedClientDetails() && (
                            ['San Bartolomé', 'Hotel Estelar'].some(keyword => getSelectedClientDetails()?.company_name?.includes(keyword))
                        ) && originSource !== 'file_upload' && (
                            <div style={{ 
                                marginBottom: '2rem', 
                                padding: '1.5rem', 
                                border: '2px dashed #8B5CF6', 
                                borderRadius: '12px', 
                                backgroundColor: '#F5F3FF',
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '1rem'
                            }}>
                                <div style={{ color: THEME.colors.textSecondary }}><FileText size={36} strokeWidth={1.5} /></div>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#5B21B6', marginBottom: '0.2rem' }}>
                                        Carga Rápida de Orden de Compra (PDF)
                                    </h3>
                                    <p style={{ fontSize: '0.8rem', color: '#6D28D9' }}>
                                        Este cliente tiene un formato de orden automatizado. Sube el PDF aquí para leer los productos.
                                    </p>
                                </div>
                                <button 
                                    style={{ 
                                        padding: '0.6rem 1rem', 
                                        backgroundColor: '#7C3AED', 
                                        color: 'white', 
                                        border: 'none', 
                                        borderRadius: '8px', 
                                        fontWeight: '700', 
                                        cursor: 'pointer' 
                                    }}
                                    onClick={() => showToast('¡Funcionalidad lista para implementar con el PDF de ejemplo!')}
                                >
                                    Subir PDF
                                </button>
                            </div>
                        )}

                        {/* --- MESA DE TRABAJO (STAGING AREA) --- */}
                        {originSource === 'file_upload' && (
                            <div style={{ marginBottom: '2.5rem' }}>
                                {!isStaging ? (
                                <div 
                                    style={{ 
                                        padding: '3rem', 
                                        border: parsingFile ? '3px solid #3B82F6' : '2px dashed #CBD5E1', 
                                        borderRadius: '24px', 
                                        backgroundColor: parsingFile ? '#EFF6FF' : '#F8FAFC',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s ease',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}
                                    onClick={() => (document.getElementById('fileInput') as HTMLInputElement)?.click()}
                                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.backgroundColor = '#EFF6FF'; }}
                                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                                    onDrop={(e) => { 
                                        e.preventDefault(); 
                                        const file = e.dataTransfer.files[0];
                                        if (file) parseOrderWithAI(file);
                                    }}
                                >
                                    <input 
                                        id="fileInput"
                                        type="file" 
                                        accept=".pdf,.xlsx,.xls,.csv,application/pdf,image/*"
                                        style={{ display: 'none' }} 
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                parseOrderWithAI(file);
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                    {parsingFile ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 0' }}>
                                            <Loader2 size={56} color="#3B82F6" style={{ animation: 'spin 1s linear infinite', marginBottom: '1.5rem' }} />
                                            <h3 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#1E40AF', marginBottom: '0.5rem' }}>Procesando Documento...</h3>
                                            <p style={{ color: '#64748B', fontSize: '0.95rem' }}>La IA está extrayendo productos y validando el cliente.</p>
                                            <style>{`
                                                @keyframes spin {
                                                    0% { transform: rotate(0deg); }
                                                    100% { transform: rotate(360deg); }
                                                }
                                            `}</style>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ color: THEME.colors.textSecondary, marginBottom: '1rem' }}><UploadCloud size={48} strokeWidth={1.5} /></div>
                                            <h3 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#1E293B', marginBottom: '0.5rem' }}>
                                                Mesa de Trabajo Inteligente
                                            </h3>
                                            <p style={{ color: '#64748B', fontSize: '0.95rem', maxWidth: '400px', margin: '0 auto' }}>
                                                Arrastra una <b>Orden de Compra (PDF)</b> o <b>Excel</b> aquí. El sistema la tabulará automáticamente para tu revisión.
                                            </p>
                                        </>
                                    )}
                                </div>
) : (
                                <div style={{ 
                                    backgroundColor: 'white', 
                                    borderRadius: '24px', 
                                    border: '1px solid #E2E8F0', 
                                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' 
                                }}>
                                    {/* Mesa de Trabajo Header: Client Validation */}
                                    <div style={{ 
                                        padding: '1.25rem 2rem', 
                                        backgroundColor: isAuditClientMatch ? '#F0FDF4' : '#FFF7ED', 
                                        borderBottom: `1px solid ${isAuditClientMatch ? '#BBF7D0' : '#FFEDD5'}`,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        gap: '1rem'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                            <div style={{ color: isAuditClientMatch ? '#16A34A' : '#D97706' }}>
                                                {isAuditClientMatch ? <CheckCircle2 size={26} strokeWidth={1.7} /> : <AlertTriangle size={26} strokeWidth={1.7} />}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '900', color: isAuditClientMatch ? '#166534' : '#9A3412', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    Validación de Cliente (Auditoría en Vivo)
                                                </div>
                                                <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span>Documento detectado para:</span>
                                                    <span style={{ textDecoration: 'underline', color: isAuditClientMatch ? '#15803D' : '#C2410C' }}>
                                                        {importValidation.clientInDocument}
                                                    </span>
                                                </div>
                                                {!selectedClient ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '0.85rem', color: '#DC2626', fontWeight: '700' }}>
                                                            ⚠️ No has seleccionado la empresa en el sistema.
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setClientSearch(importValidation.clientInDocument)}
                                                            style={{
                                                                fontSize: '0.75rem',
                                                                fontWeight: '800',
                                                                backgroundColor: '#DC2626',
                                                                color: '#FFFFFF',
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                border: 'none',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            ⚡ Buscar "{importValidation.clientInDocument}"
                                                        </button>
                                                    </div>
                                                ) : !isAuditClientMatch ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '0.84rem', color: '#C2410C', fontWeight: '600' }}>
                                                            ⚠️ El documento parece ser para <b>{importValidation.clientInDocument}</b>, pero tienes seleccionada la empresa <b>{selectedClientDetails?.company_name}</b>.
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedClient('');
                                                                setClientSearch(importValidation.clientInDocument);
                                                                showToast(`🔍 Buscando cliente: ${importValidation.clientInDocument}`, 'info');
                                                            }}
                                                            style={{
                                                                fontSize: '0.75rem',
                                                                fontWeight: '800',
                                                                backgroundColor: '#EA580C',
                                                                color: '#FFFFFF',
                                                                padding: '3px 10px',
                                                                borderRadius: '6px',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                                            }}
                                                        >
                                                            <Search size={12} />
                                                            <span>Cambiar a "{importValidation.clientInDocument}"</span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: '600', marginTop: '2px' }}>
                                                        ✅ Empresa validada correctamente ({selectedClientDetails?.company_name}).
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                            {hasStagedDuplicates && (
                                                <button
                                                    type="button"
                                                    onClick={handleConsolidateAllStagedDuplicates}
                                                    style={{
                                                        padding: '6px 14px',
                                                        backgroundColor: '#FEF3C7',
                                                        color: '#92400E',
                                                        border: '1.5px solid #F59E0B',
                                                        borderRadius: '8px',
                                                        fontWeight: '800',
                                                        cursor: 'pointer',
                                                        fontSize: '0.8rem',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '5px',
                                                        boxShadow: '0 2px 4px rgba(245, 158, 11, 0.15)'
                                                    }}
                                                    title="Unificar filas con el mismo producto y variante"
                                                >
                                                    <AlertTriangle size={14} color="#D97706" /> Consolidar Duplicados
                                                </button>
                                            )}
                                            {selectedStagedIds.length > 0 && (
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`¿Estás seguro de que deseas eliminar ${selectedStagedIds.length} productos seleccionados?`)) {
                                                            setStagedItems(prev => prev.filter(item => !selectedStagedIds.includes(item.id)));
                                                            setSelectedStagedIds([]);
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '6px 14px',
                                                        backgroundColor: '#FEE2E2',
                                                        color: '#991B1B',
                                                        border: '1px solid #FCA5A5',
                                                        borderRadius: '8px',
                                                        fontWeight: '700',
                                                        cursor: 'pointer',
                                                        fontSize: '0.8rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    <Trash2 size={14} /> Eliminar Seleccionados ({selectedStagedIds.length})
                                                </button>
                                            )}
                                            {digestionDuration && (
                                                <span style={{ 
                                                    backgroundColor: '#ECFDF5', 
                                                    color: '#065F46', 
                                                    border: '1.5px solid #6EE7B7', 
                                                    padding: '5px 12px', 
                                                    borderRadius: '100px', 
                                                    fontSize: '0.78rem', 
                                                    fontWeight: '800',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    boxShadow: '0 1px 3px rgba(16, 185, 129, 0.1)'
                                                }}>
                                                    <Zap size={13} fill="#059669" color="#059669" />
                                                    <span>Digestión: <strong>{digestionDuration}s</strong></span>
                                                </span>
                                            )}
                                            {uploadedFile && (
                                                <button 
                                                    type="button"
                                                    disabled={parsingFile}
                                                    onClick={() => parseOrderWithAI(uploadedFile)}
                                                    title="Volver a ejecutar la extracción del documento con Inteligencia Artificial"
                                                    style={{ 
                                                        padding: '6px 14px', 
                                                        backgroundColor: '#F8FAFC', 
                                                        borderRadius: '100px', 
                                                        fontSize: '0.78rem', 
                                                        fontWeight: '800', 
                                                        color: '#334155',
                                                        border: '1.5px solid #CBD5E1',
                                                        cursor: parsingFile ? 'not-allowed' : 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <RefreshCw size={13} className={parsingFile ? 'animate-spin' : ''} />
                                                    <span>{parsingFile ? 'Re-analizando...' : 'Re-analizar con IA'}</span>
                                                </button>
                                            )}
                                            {uploadedFileUrl && (
                                                <button 
                                                    onClick={() => setShowSideDocPreview(prev => !prev)}
                                                    title="Alternar vista dividida del documento original"
                                                    style={{ 
                                                        padding: '6px 14px', 
                                                        backgroundColor: showSideDocPreview ? '#DBEAFE' : '#EFF6FF', 
                                                        borderRadius: '100px', 
                                                        fontSize: '0.78rem', 
                                                        fontWeight: '800', 
                                                        color: '#1D4ED8',
                                                        border: '1.5px solid #93C5FD',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <FileText size={14} /> {(() => {
                                                        const fileName = uploadedFile?.name?.toLowerCase() || '';
                                                        const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');
                                                        const isImg = fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.webp');
                                                        const label = isExcel ? 'Excel' : (isImg ? 'Imagen' : (importValidation.documentType || 'PDF'));
                                                        return showSideDocPreview ? `Ocultar Visor ${label}` : `Ver ${label} Lado a Lado`;
                                                    })()}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Banner Inteligente de Detección de Duplicidad / Regularización Institucional */}
                                    {duplicateOrderMatch && (
                                        <div style={{
                                            margin: '0.75rem 1.5rem',
                                            padding: '1.25rem 1.5rem',
                                            backgroundColor: '#FEF2F2',
                                            border: '2px solid #EF4444',
                                            borderRadius: '16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '1.25rem',
                                            flexWrap: 'wrap',
                                            boxShadow: '0 4px 16px rgba(239, 68, 68, 0.12)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 500px' }}>
                                                <div style={{ backgroundColor: '#FEE2E2', padding: '12px', borderRadius: '14px', color: '#B91C1C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <AlertTriangle size={28} strokeWidth={2.5} />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: '900', color: '#991B1B', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                        <span>🚨 Posible Duplicidad o Regularización Detectada</span>
                                                        <span style={{ backgroundColor: '#FECACA', color: '#991B1B', padding: '2px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '800' }}>
                                                            {duplicateOrderMatch.matchType}: {duplicateOrderMatch.matchedCode}
                                                        </span>
                                                        {isCheckingDuplicates && (
                                                            <span style={{ fontSize: '0.75rem', color: '#B91C1C', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Validando...
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.88rem', color: '#7F1D1D', marginTop: '4px', lineHeight: 1.4 }}>
                                                        El documento referencia el código <b>{duplicateOrderMatch.matchedCode}</b>, el cual ya fue registrado previamente en el <b>Pedido #{duplicateOrderMatch.order.sequence_id || duplicateOrderMatch.order.id.slice(0, 8)}</b> (${(duplicateOrderMatch.order.total || 0).toLocaleString('es-CO')}) creado el <b>{new Date(duplicateOrderMatch.order.created_at).toLocaleDateString('es-CO')}</b> (Estado: <i>{duplicateOrderMatch.order.status}</i>).
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                <a
                                                    href={`/admin/orders/${duplicateOrderMatch.order.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        backgroundColor: '#FFFFFF',
                                                        color: '#991B1B',
                                                        border: '1.5px solid #F87171',
                                                        borderRadius: '10px',
                                                        padding: '8px 14px',
                                                        fontSize: '0.84rem',
                                                        fontWeight: '800',
                                                        textDecoration: 'none',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                                    }}
                                                >
                                                    <Eye size={15} /> Ver Pedido #{duplicateOrderMatch.order.sequence_id || duplicateOrderMatch.order.id.slice(0, 6)}
                                                </a>
                                                <button
                                                    type="button"
                                                    disabled={isLinkingDuplicate}
                                                    onClick={handleLinkDuplicateOrder}
                                                    style={{
                                                        backgroundColor: '#DC2626',
                                                        color: '#FFFFFF',
                                                        border: 'none',
                                                        borderRadius: '10px',
                                                        padding: '8px 16px',
                                                        fontSize: '0.84rem',
                                                        fontWeight: '900',
                                                        cursor: isLinkingDuplicate ? 'not-allowed' : 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        boxShadow: '0 2px 6px rgba(220, 38, 38, 0.3)'
                                                    }}
                                                >
                                                    <Link2 size={15} /> {isLinkingDuplicate ? 'Vinculando...' : `Vincular a Pedido #${duplicateOrderMatch.order.sequence_id || duplicateOrderMatch.order.id.slice(0, 6)}`}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (window.confirm(`¿Confirmas que deseas ignorar la advertencia y crear un pedido nuevo e independiente para ${duplicateOrderMatch.matchedCode}?`)) {
                                                            setDuplicateOrderMatch(null);
                                                            showToast('Advertencia de duplicidad ignorada por el operador.', 'info');
                                                        }
                                                    }}
                                                    style={{
                                                        backgroundColor: 'transparent',
                                                        color: '#9CA3AF',
                                                        border: '1px solid #E5E7EB',
                                                        borderRadius: '10px',
                                                        padding: '8px 12px',
                                                        fontSize: '0.78rem',
                                                        fontWeight: '700',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Ignorar y Crear Nuevo
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Banner Inteligente de Detección Multi-Entrega */}
                                    {(() => {
                                        const hasMultiSchedule = stagedItems.some(i => i.deliverySchedule);
                                        if (!hasMultiSchedule) return null;

                                        const group1 = stagedItems.filter(i => !i.deliverySchedule);
                                        const group2 = stagedItems.filter(i => i.deliverySchedule);
                                        const scheduleName = group2[0]?.deliverySchedule || 'Diferida';

                                        return (
                                            <div style={{
                                                margin: '0.75rem 1.5rem',
                                                padding: '1rem 1.5rem',
                                                backgroundColor: '#FFFBEB',
                                                border: '1.5px solid #F59E0B',
                                                borderRadius: '16px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '1rem',
                                                flexWrap: 'wrap',
                                                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.08)'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                    <div style={{ backgroundColor: '#FEF3C7', padding: '10px', borderRadius: '12px', color: '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Truck size={24} strokeWidth={2} />
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: '900', color: '#92400E', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span>🚚 Orden Multi-Entrega Detectada</span>
                                                            {importValidation?.poNumber && (
                                                                <span style={{ backgroundColor: '#FDE68A', padding: '2px 8px', borderRadius: '6px', fontSize: '0.78rem', color: '#78350F' }}>
                                                                    OC: {importValidation.poNumber}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.84rem', color: '#78350F', marginTop: '3px' }}>
                                                            Se identificaron <b>{group1.length} productos</b> para <b>Entrega Principal</b> y <b>{group2.length} productos</b> para <b>Entrega diferida ({scheduleName})</b>.
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const secItem = stagedItems.find(i => i.deliverySchedule);
                                                        const baseDate = deliveryDate || new Date().toISOString().split('T')[0];
                                                        setMultiOrderDate1(baseDate);
                                                        if (secItem) {
                                                            const calcDate = calculateTargetDeliveryDate(baseDate, secItem.deliverySchedule);
                                                            setMultiOrderDate2(calcDate);
                                                        }
                                                        setShowMultiOrderModal(true);
                                                    }}
                                                    style={{
                                                        backgroundColor: '#D97706',
                                                        color: '#FFFFFF',
                                                        border: 'none',
                                                        borderRadius: '10px',
                                                        padding: '10px 20px',
                                                        fontWeight: '900',
                                                        fontSize: '0.88rem',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        boxShadow: '0 4px 6px -1px rgba(217, 119, 6, 0.3)',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#B45309'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#D97706'}
                                                >
                                                    <Sparkles size={16} />
                                                    <span>⚡ Generar 2 Pedidos Relacionados</span>
                                                </button>
                                            </div>
                                        );
                                    })()}

                                    {/* Mesa de Trabajo Body: Split Screen (Side-by-Side) */}
                                    <div style={{ display: 'flex', gap: '0', padding: '0', alignItems: 'stretch', maxHeight: '650px', overflow: 'hidden' }}>
                                        {/* Left Side: Document Preview */}
                                        {uploadedFileUrl && showSideDocPreview && (() => {
                                            const fileName = uploadedFile?.name?.toLowerCase() || '';
                                            const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');
                                            const isImg = fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.webp');

                                            return (
                                                <div style={{ 
                                                    width: '48%', 
                                                    minWidth: '420px', 
                                                    borderRight: '2px solid #E2E8F0', 
                                                    backgroundColor: '#F8FAFC', 
                                                    padding: '1rem', 
                                                    display: 'flex', 
                                                    flexDirection: 'column' 
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <FileText size={14} /> {isExcel ? 'Hoja de Cálculo Original' : (isImg ? 'Imagen Original' : 'Documento Original')}
                                                        </span>
                                                        <a href={uploadedFileUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                                                            <button style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '700', backgroundColor: 'white', border: '1px solid #CBD5E1', color: '#1E293B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <Maximize2 size={11} /> Abrir Pestaña
                                                            </button>
                                                        </a>
                                                    </div>
                                                    <div style={{ flex: 1, minHeight: '560px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
                                                        {isExcel ? (
                                                            <ExcelTableViewer file={uploadedFile} fileUrl={uploadedFileUrl} />
                                                        ) : isImg ? (
                                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: '10px' }}>
                                                                <img src={uploadedFileUrl} alt="Documento Original" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
                                                            </div>
                                                        ) : (
                                                            <PdfCanvasViewer file={uploadedFile} fileUrl={uploadedFileUrl} />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Right Side: Table Mapping */}
                                        <div 
                                            id="staged-table-scroll-container" 
                                            style={{ flex: 1, minWidth: '460px', padding: '0', overflowY: 'auto', maxHeight: '650px', position: 'relative', scrollBehavior: 'smooth' }}
                                        >
                                            <table style={{ width: '100%', borderCollapse: 'collapse', position: 'relative' }}>
                                                <thead style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #F1F5F9' }}>
                                                        <th style={{ padding: '1rem', textAlign: 'center', width: '35px' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={stagedItems.length > 0 && selectedStagedIds.length === stagedItems.length}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setSelectedStagedIds(stagedItems.map(item => item.id));
                                                                    } else {
                                                                        setSelectedStagedIds([]);
                                                                    }
                                                                }}
                                                                style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                                                            />
                                                        </th>
                                                        <th style={{ ...THEME.typography?.tableHeader, padding: '1rem 1.25rem', textAlign: 'left', width: '32%' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span>NOMBRE EN DOCUMENTO</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSortStagedAlpha(prev => !prev)}
                                                                    title={sortStagedAlpha ? 'Restaurar orden del documento original' : 'Ordenar alfabéticamente A→Z'}
                                                                    style={{
                                                                        display: 'inline-flex', alignItems: 'center', gap: '2px',
                                                                        fontSize: '0.62rem', fontWeight: '800', letterSpacing: '0.03em',
                                                                        padding: '2px 6px', borderRadius: '4px', cursor: 'pointer',
                                                                        border: sortStagedAlpha ? '1px solid #0D7A57' : '1px solid #CBD5E1',
                                                                        backgroundColor: sortStagedAlpha ? '#ECFDF5' : '#F8FAFC',
                                                                        color: sortStagedAlpha ? '#065F46' : '#64748B',
                                                                        transition: 'all 0.15s'
                                                                    }}
                                                                >
                                                                    A→Z
                                                                </button>
                                                            </div>
                                                        </th>
                                                        <th style={{ ...THEME.typography?.tableHeader, padding: '1rem', textAlign: 'left', width: '45%' }}>TU PRODUCTO (ID)</th>
                                                        <th style={{ ...THEME.typography?.tableHeader, padding: '1rem', textAlign: 'center', width: '23%' }}>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', position: 'relative' }}>
                                                                <span>CANT.</span>
                                                                <div 
                                                                    style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                                                                    onMouseEnter={() => setShowFormulaTooltip(true)}
                                                                    onMouseLeave={() => setShowFormulaTooltip(false)}
                                                                    onClick={(e) => { e.stopPropagation(); setShowFormulaTooltip(prev => !prev); }}
                                                                    title="Haz clic para ver cómo usar fórmulas matemáticas"
                                                                >
                                                                    <div style={{
                                                                        width: '16px',
                                                                        height: '16px',
                                                                        borderRadius: '50%',
                                                                        backgroundColor: '#EFF6FF',
                                                                        border: '1px solid #93C5FD',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        boxShadow: '0 1px 2px rgba(37, 99, 235, 0.1)'
                                                                    }}>
                                                                        <Info size={11} color="#2563EB" />
                                                                    </div>
                                                                    
                                                                    {showFormulaTooltip && (
                                                                        <div style={{
                                                                            position: 'absolute',
                                                                            top: '100%',
                                                                            right: '-12px',
                                                                            marginTop: '8px',
                                                                            width: '260px',
                                                                            backgroundColor: '#1E293B',
                                                                            color: '#FFFFFF',
                                                                            padding: '12px 14px',
                                                                            borderRadius: '10px',
                                                                            fontSize: '0.73rem',
                                                                            lineHeight: '1.45',
                                                                            textAlign: 'left',
                                                                            zIndex: 9999,
                                                                            boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
                                                                            border: '1px solid #334155',
                                                                            fontWeight: 'normal',
                                                                            textTransform: 'none'
                                                                        }}>
                                                                            <div style={{ fontWeight: '800', color: '#60A5FA', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem' }}>
                                                                                <Calculator size={13} color="#60A5FA" />
                                                                                <span>Fórmulas rápidas tipo Excel</span>
                                                                            </div>
                                                                            <p style={{ margin: '0 0 6px 0', color: '#E2E8F0' }}>
                                                                                Puedes escribir operaciones matemáticas directas en cualquier celda de cantidad:
                                                                            </p>
                                                                            <div style={{ backgroundColor: '#0F172A', padding: '6px 8px', borderRadius: '6px', fontFamily: 'monospace', color: '#38BDF8', fontSize: '0.72rem', lineHeight: '1.5' }}>
                                                                                <div><strong style={{ color: '#FCD34D' }}>+900/24</strong> &nbsp;→ <strong>37,5</strong> <span style={{ color: '#64748B' }}>(cubetas)</span></div>
                                                                                <div><strong style={{ color: '#FCD34D' }}>15*12</strong> &nbsp;&nbsp;&nbsp;→ <strong>180</strong> <span style={{ color: '#64748B' }}>(cajas)</span></div>
                                                                                <div><strong style={{ color: '#FCD34D' }}>10+5+2,5</strong> → <strong>17,5</strong></div>
                                                                                <div><strong style={{ color: '#FCD34D' }}>500/1000</strong> → <strong>0,5</strong> <span style={{ color: '#64748B' }}>(kg)</span></div>
                                                                            </div>
                                                                            <div style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: '6px' }}>
                                                                                Presiona <strong style={{ color: '#FFFFFF' }}>Enter</strong> o <strong style={{ color: '#FFFFFF' }}>Tab</strong> para calcular y formatear automáticamente.
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(sortStagedAlpha
                                                        ? [...stagedItems].sort((a, b) =>
                                                            (a.rawText || a.productName || '').localeCompare(
                                                                b.rawText || b.productName || '', 'es', { sensitivity: 'base' }
                                                            ))
                                                        : stagedItems
                                                    ).map((item, idx) => {
                                                        const isConfidenceHigh = item.confidence === 'HIGH' || (item.confidenceScore && item.confidenceScore >= 90);
                                                        const isConfidenceMed = item.confidence === 'MEDIUM' || (item.confidenceScore && item.confidenceScore >= 70 && item.confidenceScore < 90);
                                                        const isActiveRow = activeDropdownRowIndex === idx;

                                                        return (
                                                            <tr 
                                                                key={item.id} 
                                                                id={`staged-row-${idx}`}
                                                                style={{ 
                                                                    borderBottom: '1px solid #F1F5F9',
                                                                    backgroundColor: isActiveRow 
                                                                        ? '#FFFFFF' 
                                                                        : (item.isConfirmed ? '#F0FDF4' : (item.suggestedProduct ? (isConfidenceHigh ? 'white' : '#FEFCE8') : '#FFF7ED')),
                                                                    transform: isActiveRow ? 'scale(1.01)' : 'scale(1)',
                                                                    transformOrigin: 'left center',
                                                                    boxShadow: isActiveRow ? '0 10px 25px -4px rgba(37, 99, 235, 0.18), 0 2px 6px rgba(0, 0, 0, 0.04)' : 'none',
                                                                    borderLeft: isActiveRow ? '4px solid #2563EB' : '4px solid transparent',
                                                                    zIndex: isActiveRow ? 20 : 1,
                                                                    position: 'relative',
                                                                    transition: 'all 0.16s cubic-bezier(0.16, 1, 0.3, 1)'
                                                                }}
                                                            >
                                                                <td style={{ padding: '0.8rem 0.5rem', textAlign: 'center', width: '35px' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedStagedIds.includes(item.id)}
                                                                        onChange={(e) => {
                                                                            if (e.target.checked) {
                                                                                setSelectedStagedIds(prev => [...prev, item.id]);
                                                                            } else {
                                                                                setSelectedStagedIds(prev => prev.filter(id => id !== item.id));
                                                                            }
                                                                        }}
                                                                        style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                                                                    />
                                                                </td>
                                                                <td style={{ padding: '0.8rem 1.25rem', width: '32%' }}>
                                                                    <div 
                                                                        onClick={() => item.suggestedProduct && openModalForStagedItem(
                                                                            item.id, 
                                                                            item.suggestedProduct, 
                                                                            item.quantity, 
                                                                            idx, 
                                                                            item.selected_options, 
                                                                            item.originalQty, 
                                                                            item.originalUnit, 
                                                                            item.conversion_factor
                                                                        )}
                                                                        style={{ 
                                                                            fontSize: isActiveRow ? '0.92rem' : '0.88rem', 
                                                                            fontWeight: isActiveRow ? '800' : '700', 
                                                                            color: isActiveRow ? '#0F172A' : '#1E293B',
                                                                            cursor: item.suggestedProduct ? 'pointer' : 'default',
                                                                            transition: 'all 0.15s ease'
                                                                        }}
                                                                        title={item.suggestedProduct ? 'Clic para personalizar variantes y reglas' : undefined}
                                                                    >
                                                                        {item.originalName}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                        <span style={{ backgroundColor: '#FFFBEB', color: '#B45309', border: '1.5px solid #FBBF24', boxShadow: '0 2px 4px rgba(245, 158, 11, 0.06)', padding: '2px 7px', borderRadius: '6px', fontWeight: '900' }}>
                                                                            {formatDetectedUnit(item.originalQtyInFile || item.quantity, item.originalUnitInFile || item.originalUnit)}
                                                                        </span>
                                                                        {/* SEMÁFORO DE CONFIANZA */}
                                                                        {item.suggestedProduct ? (
                                                                            <span 
                                                                                onClick={() => openModalForStagedItem(
                                                                                    item.id, 
                                                                                    item.suggestedProduct, 
                                                                                    item.quantity, 
                                                                                    idx, 
                                                                                    item.selected_options, 
                                                                                    item.originalQty, 
                                                                                    item.originalUnit, 
                                                                                    item.conversion_factor
                                                                                )}
                                                                                style={{ 
                                                                                    backgroundColor: item.isConfirmed ? '#DCFCE7' : '#F0FDF4', 
                                                                                    color: '#15803D', 
                                                                                    border: '1px solid #86EFAC', 
                                                                                    padding: '1px 6px', 
                                                                                    borderRadius: '6px', 
                                                                                    fontSize: '0.68rem', 
                                                                                    fontWeight: '800', 
                                                                                    display: 'inline-flex', 
                                                                                    alignItems: 'center', 
                                                                                    gap: '3px',
                                                                                    cursor: 'pointer'
                                                                                }}
                                                                                title="Personalizar variantes / equivalencias"
                                                                            >
                                                                                <CheckCircle2 size={11} color="#15803D" /> {item.isConfirmed ? 'Confirmado' : `${item.confidenceScore ? `${item.confidenceScore}%` : '100%'}`}
                                                                                {clientFrequentProductIds.includes(item.suggestedProduct.id) && <span style={{ marginLeft: '2px', color: '#D97706' }}>⭐ Habitual</span>}
                                                                            </span>
                                                                        ) : (
                                                                            <span style={{ backgroundColor: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5', padding: '1px 6px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                                <AlertCircle size={11} color="#B91C1C" /> Sin Match
                                                                            </span>
                                                                        )}
                                                                        {item.variant_label && (
                                                                            <span style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', padding: '1px 6px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: '800' }}>
                                                                                {item.variant_label}
                                                                            </span>
                                                                        )}
                                                                        {item.deliverySchedule && (
                                                                            <span style={{ 
                                                                                backgroundColor: '#FEF3C7', 
                                                                                color: '#92400E', 
                                                                                border: '1.5px solid #F59E0B', 
                                                                                padding: '1px 8px', 
                                                                                borderRadius: '6px', 
                                                                                fontSize: '0.7rem', 
                                                                                fontWeight: '900',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px'
                                                                            }}>
                                                                                🗓️ Para: {item.deliverySchedule}
                                                                            </span>
                                                                        )}
                                                                        {item.observations && (
                                                                            <span 
                                                                                title={`Especificación en orden: ${item.observations}`}
                                                                                style={{ 
                                                                                    backgroundColor: '#F8FAFC', 
                                                                                    color: '#334155', 
                                                                                    border: '1px dashed #94A3B8', 
                                                                                    padding: '1px 7px', 
                                                                                    borderRadius: '6px', 
                                                                                    fontSize: '0.68rem', 
                                                                                    fontWeight: '600',
                                                                                    maxWidth: '190px',
                                                                                    overflow: 'hidden',
                                                                                    textOverflow: 'ellipsis',
                                                                                    whiteSpace: 'nowrap',
                                                                                    display: 'inline-block'
                                                                                }}
                                                                            >
                                                                                📝 {item.observations}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: '0.45rem 0.85rem', position: 'relative', width: '45%' }}>
                                                                    <input 
                                                                        ref={el => { stagedProductInputRefs.current[idx] = el; }}
                                                                        type="text"
                                                                        placeholder="Buscar ID o producto..."
                                                                        autoComplete="off"
                                                                        autoCorrect="off"
                                                                        spellCheck={false}
                                                                        data-lpignore="true"
                                                                        value={activeDropdownRowIndex === idx && activeRowSearchQuery !== null 
                                                                            ? activeRowSearchQuery 
                                                                            : (item.searchQuery !== undefined ? item.searchQuery : (item.suggestedProduct ? `${item.suggestedProduct.name} (${getAccountingIdDisplay(item.suggestedProduct)})` : ''))}
                                                                        onFocus={(e) => {
                                                                            e.target.select();
                                                                            setActiveDropdownRowIndex(idx);
                                                                            setFocusedDropdownItemIndex(0);
                                                                            setActiveRowSearchQuery(null);
                                                                            scrollToStagedRow(idx);
                                                                        }}
                                                                        onBlur={(e) => {
                                                                            const val = e.target.value;
                                                                            const exactProduct = products.find(prod => `${prod.name} (${getAccountingIdDisplay(prod)})` === val || prod.name.toLowerCase() === val.toLowerCase());
                                                                            if (exactProduct && (!item.suggestedProduct || item.suggestedProduct.id !== exactProduct.id)) {
                                                                                selectStagedProduct(item.id, exactProduct, idx);
                                                                            }
                                                                            setActiveRowSearchQuery(null);
                                                                            setTimeout(() => {
                                                                                setActiveDropdownRowIndex(prev => prev === idx ? null : prev);
                                                                            }, 250);
                                                                        }}
                                                                        className="sku-search-input"
                                                                        id={`sku-input-${idx}`}
                                                                        onKeyDown={(e) => {
                                                                            const currentQuery = activeDropdownRowIndex === idx && activeRowSearchQuery !== null 
                                                                                ? activeRowSearchQuery 
                                                                                : (item.searchQuery !== undefined ? item.searchQuery : (item.suggestedProduct ? item.suggestedProduct.name : ''));
                                                                            const scoredList = getScoredProductsForQuery(currentQuery);

                                                                            if (e.key === 'Tab') {
                                                                                const val = e.currentTarget.value;
                                                                                const p = (scoredList && scoredList[focusedDropdownItemIndex]) || products.find(prod => `${prod.name} (${getAccountingIdDisplay(prod)})` === val) || item.suggestedProduct;
                                                                                if (p) {
                                                                                    e.preventDefault(); 
                                                                                    selectStagedProduct(item.id, p, idx, undefined, undefined, true);
                                                                                }
                                                                            } else if (e.key === 'Enter') {
                                                                                e.preventDefault();
                                                                                const selectedProd = (scoredList && scoredList[focusedDropdownItemIndex]) || products.find(prod => `${prod.name} (${getAccountingIdDisplay(prod)})` === e.currentTarget.value) || item.suggestedProduct;
                                                                                if (selectedProd) {
                                                                                    selectStagedProduct(item.id, selectedProd, idx);
                                                                                }
                                                                                setActiveRowSearchQuery(null);
                                                                                setActiveDropdownRowIndex(null);

                                                                                const nextIdx = idx + 1;
                                                                                const nextInput = document.getElementById(`sku-input-${nextIdx}`) as HTMLInputElement | null;
                                                                                if (nextInput) {
                                                                                    nextInput.focus({ preventScroll: true });
                                                                                    nextInput.select();
                                                                                    scrollToStagedRow(nextIdx);
                                                                                } else {
                                                                                    const confirmBtn = document.getElementById('confirm-inject-button');
                                                                                    if (confirmBtn) {
                                                                                        confirmBtn.focus();
                                                                                        confirmBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                                                    }
                                                                                }
                                                                            } else if (e.key === 'ArrowDown') {
                                                                                e.preventDefault();
                                                                                if (activeDropdownRowIndex === idx && scoredList.length > 0) {
                                                                                    setFocusedDropdownItemIndex(prev => Math.min(prev + 1, scoredList.length - 1));
                                                                                } else {
                                                                                    const nextIdx = idx + 1;
                                                                                    const nextInput = document.getElementById(`sku-input-${nextIdx}`) as HTMLInputElement | null;
                                                                                    if (nextInput) {
                                                                                        nextInput.focus({ preventScroll: true });
                                                                                        nextInput.select();
                                                                                        scrollToStagedRow(nextIdx);
                                                                                    }
                                                                                }
                                                                            } else if (e.key === 'ArrowUp') {
                                                                                e.preventDefault();
                                                                                if (activeDropdownRowIndex === idx && focusedDropdownItemIndex > 0) {
                                                                                    setFocusedDropdownItemIndex(prev => Math.max(prev - 1, 0));
                                                                                } else {
                                                                                    const prevIdx = idx - 1;
                                                                                    if (prevIdx >= 0) {
                                                                                        const prevInput = document.getElementById(`sku-input-${prevIdx}`) as HTMLInputElement | null;
                                                                                        if (prevInput) {
                                                                                            prevInput.focus({ preventScroll: true });
                                                                                            prevInput.select();
                                                                                            scrollToStagedRow(prevIdx);
                                                                                        }
                                                                                    }
                                                                                }
                                                                            } else if (e.key === 'Escape') {
                                                                                setActiveRowSearchQuery(null);
                                                                                setActiveDropdownRowIndex(null);
                                                                            }
                                                                        }}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setActiveDropdownRowIndex(idx);
                                                                            setFocusedDropdownItemIndex(0);
                                                                            setActiveRowSearchQuery(val);
                                                                        }}
                                                                        style={{ 
                                                                            width: '100%', 
                                                                            padding: isActiveRow ? '8px 12px' : '7px 10px', 
                                                                            borderRadius: '9px', 
                                                                            border: isActiveRow 
                                                                                ? '2px solid #2563EB' 
                                                                                : (item.suggestedProduct ? (isConfidenceHigh ? '1.5px solid #E2E8F0' : '1.5px solid #FCD34D') : '1.5px solid #F97316'),
                                                                            fontSize: isActiveRow ? '0.92rem' : '0.86rem',
                                                                            fontWeight: '800',
                                                                            backgroundColor: item.suggestedProduct ? '#FFFFFF' : '#FFFBEB',
                                                                            outline: 'none',
                                                                            boxShadow: isActiveRow ? '0 0 0 3px rgba(37, 99, 235, 0.15)' : '0 1px 2px rgba(0,0,0,0.04)',
                                                                            transition: 'all 0.15s ease'
                                                                        }}
                                                                    />

                                                                    {/* Custom Pareto Floating Dropdown */}
                                                                    {activeDropdownRowIndex === idx && (() => {
                                                                        const currentQuery = (activeDropdownRowIndex === idx && activeRowSearchQuery !== null)
                                                                            ? activeRowSearchQuery 
                                                                            : (item.searchQuery !== undefined ? item.searchQuery : (item.suggestedProduct ? item.suggestedProduct.name : ''));
                                                                        const scoredList = getScoredProductsForQuery(currentQuery);

                                                                        if (scoredList.length === 0) return null;

                                                                        return (
                                                                            <div 
                                                                                id={`dropdown-container-${idx}`}
                                                                                style={{
                                                                                    position: 'absolute',
                                                                                    top: '100%',
                                                                                    marginTop: '4px',
                                                                                    right: 0,
                                                                                    minWidth: '500px',
                                                                                    maxWidth: '580px',
                                                                                    zIndex: 9999,
                                                                                    backgroundColor: 'white',
                                                                                    borderRadius: '14px',
                                                                                    boxShadow: '0 20px 40px -5px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0,0,0,0.08)',
                                                                                    border: '1px solid #CBD5E1',
                                                                                    maxHeight: '300px',
                                                                                    overflowY: 'auto'
                                                                                }}
                                                                            >
                                                                                {scoredList.map((p, pIdx) => {
                                                                                    const exc = clientExceptions.find(e => e.product_id === p.id);
                                                                                    const freq = clientFrequentProductMap[p.id];
                                                                                    const isClientHabitual = Boolean(exc || freq);
                                                                                    const isFocused = pIdx === focusedDropdownItemIndex;
                                                                                    const isScarcityLocked = Boolean(scarcityLockedMap[p.id]);
                                                                                    const resolvedPrice = (contractPrices[p.id] !== undefined && contractPrices[p.id] !== null && contractPrices[p.id] > 0)
                                                                                        ? contractPrices[p.id]
                                                                                        : (p.base_price || 0);

                                                                                    return (
                                                                                        <div
                                                                                            key={p.id}
                                                                                            id={`dropdown-item-${idx}-${pIdx}`}
                                                                                            onMouseDown={(e) => {
                                                                                                e.preventDefault();
                                                                                                if (isScarcityLocked) {
                                                                                                    showToast(`🚫 "${p.name}" no se puede agregar: Insumo bloqueado por escasez.`, 'error');
                                                                                                    return;
                                                                                                }
                                                                                                selectStagedProduct(item.id, p, idx);

                                                                                                const nextIdx = idx + 1;
                                                                                                const nextInput = document.getElementById(`sku-input-${nextIdx}`) as HTMLInputElement | null;
                                                                                                if (nextInput) {
                                                                                                    nextInput.focus({ preventScroll: true });
                                                                                                    nextInput.select();
                                                                                                    scrollToStagedRow(nextIdx);
                                                                                                }
                                                                                            }}
                                                                                            onMouseEnter={() => setFocusedDropdownItemIndex(pIdx)}
                                                                                            style={{
                                                                                                padding: '0.85rem 1.15rem',
                                                                                                cursor: isScarcityLocked ? 'not-allowed' : 'pointer',
                                                                                                borderBottom: '1px solid #F1F5F9',
                                                                                                borderLeft: isFocused ? '5px solid #2563EB' : '5px solid transparent',
                                                                                                display: 'flex',
                                                                                                justifyContent: 'space-between',
                                                                                                alignItems: 'center',
                                                                                                backgroundColor: isScarcityLocked
                                                                                                    ? (isFocused ? '#FEE2E2' : '#FEF2F2')
                                                                                                    : (isFocused ? '#DBEAFE' : (isClientHabitual ? '#F0FDF4' : 'white')),
                                                                                                transition: 'all 0.12s ease-in-out'
                                                                                            }}
                                                                                        >
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                                                                <span style={{ 
                                                                                                    fontWeight: isFocused ? '900' : '700', 
                                                                                                    color: isScarcityLocked ? '#991B1B' : (isFocused ? '#1E3A8A' : '#111827'),
                                                                                                    fontSize: '0.90rem'
                                                                                                }}>
                                                                                                    {p.name} <span style={{ fontSize: '0.82em', color: isFocused ? '#2563EB' : '#6B7280', fontWeight: '600' }}>(ID Contable: {getAccountingIdDisplay(p)})</span>
                                                                                                </span>
                                                                                                {isClientHabitual && (
                                                                                                    <span style={{ 
                                                                                                        fontSize: '0.68rem', 
                                                                                                        backgroundColor: isFocused ? '#BBF7D0' : '#DCFCE7', 
                                                                                                        color: '#15803D', 
                                                                                                        padding: '2px 8px', 
                                                                                                        borderRadius: '999px', 
                                                                                                        fontWeight: '800', 
                                                                                                        display: 'inline-flex', 
                                                                                                        alignItems: 'center', 
                                                                                                        gap: '3px',
                                                                                                        border: isFocused ? '1.5px solid #22C55E' : '1px solid #86EFAC'
                                                                                                    }}>
                                                                                                        ⭐ Habitual {exc?.nickname && exc.nickname.trim().toLowerCase() !== p.name.trim().toLowerCase() ? `(Alias: ${exc.nickname})` : ''}
                                                                                                    </span>
                                                                                                )}
                                                                                                {exc?.preferred_options && typeof exc.preferred_options === 'object' && Object.keys(exc.preferred_options).length > 0 && (
                                                                                                    <span style={{ 
                                                                                                        fontSize: '0.66rem', 
                                                                                                        backgroundColor: isFocused ? '#BBF7D0' : '#DCFCE7', 
                                                                                                        color: '#15803D', 
                                                                                                        padding: '2px 6px', 
                                                                                                        borderRadius: '6px', 
                                                                                                        fontWeight: '800', 
                                                                                                        display: 'inline-flex', 
                                                                                                        alignItems: 'center', 
                                                                                                        gap: '3px',
                                                                                                        border: isFocused ? '1.5px solid #22C55E' : '1px solid #86EFAC'
                                                                                                    }}>
                                                                                                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} /> {Object.values(exc.preferred_options).join(' • ')}
                                                                                                    </span>
                                                                                                )}
                                                                                                {isScarcityLocked && (
                                                                                                    <span style={{ fontSize: '0.66rem', backgroundColor: '#FEE2E2', color: '#DC2626', padding: '2px 7px', borderRadius: '4px', border: '1px solid #FCA5A5', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                                                        <PackageX size={11} /> AGOTADO POR ESCASEZ
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>
                                                                                            <span style={{ fontSize: '0.84rem', fontWeight: isFocused ? '800' : '700', color: isFocused ? '#1E40AF' : '#4B5563', flexShrink: 0, marginLeft: '12px' }}>
                                                                                                {formatMoney(resolvedPrice)}/{p.unit_of_measure}
                                                                                                {p.options_config?.length > 0 && (
                                                                                                    <span style={{ 
                                                                                                        marginLeft: '6px', 
                                                                                                        fontSize: '0.72em', 
                                                                                                        backgroundColor: isFocused ? '#FEF08A' : '#FEF3C7', 
                                                                                                        color: '#92400E', 
                                                                                                        padding: '2px 6px', 
                                                                                                        borderRadius: '6px', 
                                                                                                        border: isFocused ? '1px solid #EAB308' : '1px solid #FDE68A', 
                                                                                                        fontWeight: '800',
                                                                                                        display: 'inline-flex',
                                                                                                        alignItems: 'center',
                                                                                                        gap: '3px'
                                                                                                    }}>
                                                                                                        <Settings size={10} /> Opciones
                                                                                                    </span>
                                                                                                )}
                                                                                            </span>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </td>
                                                                <td style={{ padding: '0.5rem 1rem', textAlign: 'center', width: '23%' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                                        <input 
                                                                            type="text"
                                                                            id={`staged-qty-input-${idx}`}
                                                                            value={item.quantity}
                                                                            onFocus={(e) => {
                                                                                e.target.select();
                                                                                scrollToStagedRow(idx);
                                                                            }}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Enter') {
                                                                                    e.preventDefault();
                                                                                    const val = evaluateMathExpression(e.currentTarget.value);
                                                                                    updateStagedItem(item.id, 'quantity', val);
                                                                                    updateStagedItem(item.id, 'originalQty', val);
                                                                                    const nextIdx = idx + 1;
                                                                                    const nextInput = document.getElementById(`sku-input-${nextIdx}`) as HTMLInputElement | null;
                                                                                    if (nextInput) {
                                                                                        nextInput.focus();
                                                                                        nextInput.select();
                                                                                        scrollToStagedRow(nextIdx);
                                                                                    } else {
                                                                                        document.getElementById('confirm-inject-button')?.focus();
                                                                                    }
                                                                                }
                                                                            }}
                                                                            onBlur={(e) => {
                                                                                const val = evaluateMathExpression(e.currentTarget.value);
                                                                                updateStagedItem(item.id, 'quantity', val);
                                                                                updateStagedItem(item.id, 'originalQty', val);
                                                                            }}
                                                                            onChange={(e) => {
                                                                                const rawVal = e.target.value;
                                                                                const val = evaluateMathExpression(rawVal);
                                                                                updateStagedItem(item.id, 'quantity', rawVal);
                                                                                updateStagedItem(item.id, 'originalQty', val);
                                                                            }}
                                                                            style={{ 
                                                                                width: '75px', 
                                                                                padding: '9px', 
                                                                                borderRadius: '8px', 
                                                                                border: '2px solid #E2E8F0', 
                                                                                textAlign: 'center',
                                                                                fontWeight: '800',
                                                                                fontSize: '1rem',
                                                                                backgroundColor: 'white'
                                                                            }}
                                                                        />
                                                                        <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#475569', minWidth: '40px', textAlign: 'left' }}>
                                                                            {item.suggestedProduct?.unit_of_measure || item.originalUnit || 'Kg'}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>

                                            {/* Hallazgo 6: Botón para Agregar Ítem Manual en la Mesa de Trabajo */}
                                            <div style={{ padding: '0.85rem 1rem', display: 'flex', justifyContent: 'center', backgroundColor: '#F8FAFC', borderTop: '1.5px dashed #CBD5E1' }}>
                                                <button
                                                    id="add-staged-manual-item-button"
                                                    type="button"
                                                    onClick={handleAddStagedRow}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        padding: '9px 18px',
                                                        borderRadius: '10px',
                                                        border: '1.5px dashed #0D9488',
                                                        backgroundColor: '#F0FDFA',
                                                        color: '#0F766E',
                                                        fontSize: '0.88rem',
                                                        fontWeight: '800',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={e => {
                                                        e.currentTarget.style.backgroundColor = '#CCFBF1';
                                                        e.currentTarget.style.borderColor = '#0F766E';
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.backgroundColor = '#F0FDFA';
                                                        e.currentTarget.style.borderColor = '#0D9488';
                                                    }}
                                                >
                                                    <Plus size={16} strokeWidth={2.5} />
                                                    <span>+ Agregar Ítem Manual a la Mesa de Trabajo</span>
                                                </button>
                                            </div>

                                            {/* Bottom Spacer: Gives the scroll container guaranteed room to anchor any row to the top */}
                                            <div style={{ height: '380px', pointerEvents: 'none' }} />
                                        </div>
                                    </div>

                                    {/* Mesa de Trabajo Footer */}
                                    <div style={{ 
                                        padding: '1.5rem 2rem', 
                                        backgroundColor: '#F8FAFC', 
                                        borderTop: '1px solid #E2E8F0',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <button 
                                            onClick={() => { 
                                                setIsStaging(false); 
                                                setStagedItems([]); 
                                                setUploadedFile(null);
                                                if (uploadedFileUrl) {
                                                    URL.revokeObjectURL(uploadedFileUrl);
                                                    setUploadedFileUrl(null);
                                                }
                                            }}
                                            style={{ padding: '10px 20px', borderRadius: '12px', border: '1px solid #CBD5E1', backgroundColor: 'white', color: '#64748B', fontWeight: '700', cursor: 'pointer' }}
                                        >
                                            Cancelar y Limpiar
                                        </button>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <div style={{ textAlign: 'right', marginRight: '1rem' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Items Auditados</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#1E293B' }}>{stagedItems.length} productos</div>
                                            </div>
                                            {stagedItems.some(i => i.deliverySchedule) && (
                                                <button 
                                                    type="button"
                                                    onClick={() => {
                                                        const secItem = stagedItems.find(i => i.deliverySchedule);
                                                        const baseDate = deliveryDate || new Date().toISOString().split('T')[0];
                                                        setMultiOrderDate1(baseDate);
                                                        if (secItem) {
                                                            const calcDate = calculateTargetDeliveryDate(baseDate, secItem.deliverySchedule);
                                                            setMultiOrderDate2(calcDate);
                                                        }
                                                        setShowMultiOrderModal(true);
                                                    }}
                                                    style={{ 
                                                        padding: '12px 24px', 
                                                        borderRadius: '14px', 
                                                        border: 'none', 
                                                        backgroundColor: '#D97706', 
                                                        color: 'white', 
                                                        fontWeight: '900', 
                                                        fontSize: '0.95rem', 
                                                        cursor: 'pointer',
                                                        boxShadow: '0 8px 15px -3px rgba(217, 119, 6, 0.35)',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                >
                                                    <Sparkles size={16} strokeWidth={2} />
                                                    <span>⚡ Generar 2 Pedidos Relacionados</span>
                                                </button>
                                            )}
                                            {/* Hallazgo 2: Botón de Creación Inmediata Directa (1 Clic) */}
                                            <button
                                                id="direct-confirm-order-button"
                                                type="button"
                                                onClick={handleDirectConfirmOrder}
                                                disabled={isDirectConfirming || isConfirmingImport}
                                                style={{
                                                    padding: '12px 24px',
                                                    borderRadius: '14px',
                                                    border: 'none',
                                                    backgroundColor: isDirectConfirming ? '#0D9488' : '#0F766E',
                                                    color: 'white',
                                                    fontWeight: '900',
                                                    fontSize: '0.95rem',
                                                    cursor: (isDirectConfirming || isConfirmingImport) ? 'not-allowed' : 'pointer',
                                                    opacity: (isDirectConfirming || isConfirmingImport) ? 0.85 : 1,
                                                    boxShadow: '0 8px 15px -3px rgba(15, 118, 110, 0.35)',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={e => { if (!isDirectConfirming && !isConfirmingImport) e.currentTarget.style.transform = 'scale(1.02)'; }}
                                                onMouseLeave={e => { if (!isDirectConfirming && !isConfirmingImport) e.currentTarget.style.transform = 'scale(1)'; }}
                                            >
                                                {isDirectConfirming ? (
                                                    <>
                                                        <Loader2 size={16} className="animate-spin" />
                                                        <span>Creando Pedido Inmediato...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <CheckCircle2 size={16} strokeWidth={2.5} />
                                                        <span>⚡ Confirmar y Crear Pedido Inmediato</span>
                                                    </>
                                                )}
                                            </button>
                                            <button 
                                                id="confirm-inject-button"
                                                onClick={handleConfirmImport}
                                                disabled={isConfirmingImport || isDirectConfirming}
                                                style={{ 
                                                    padding: '12px 28px', 
                                                    borderRadius: '14px', 
                                                    border: 'none', 
                                                    backgroundColor: isConfirmingImport ? '#047857' : '#059669', 
                                                    color: 'white', 
                                                    fontWeight: '800', 
                                                    fontSize: '1rem', 
                                                    cursor: (isConfirmingImport || isDirectConfirming) ? 'not-allowed' : 'pointer',
                                                    opacity: (isConfirmingImport || isDirectConfirming) ? 0.85 : 1,
                                                    boxShadow: '0 10px 15px -3px rgba(5, 150, 105, 0.3)',
                                                    transition: 'all 0.2s',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}
                                                onMouseEnter={e => { if (!isConfirmingImport && !isDirectConfirming) e.currentTarget.style.transform = 'scale(1.02)'; }}
                                                onMouseLeave={e => { if (!isConfirmingImport && !isDirectConfirming) e.currentTarget.style.transform = 'scale(1)'; }}
                                            >
                                                {isConfirmingImport ? (
                                                    <>
                                                        <Loader2 size={16} className="animate-spin" />
                                                        <span>Inyectando y Procesando...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles size={16} strokeWidth={2} />
                                                        <span>Confirmar e Inyectar al Pedido</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        )}

                        {/* 2. PRODUCT SEARCH (Visible only if NOT importing a document) */}
                        {originSource !== 'file_upload' && (
                            <div style={{ marginBottom: '1.25rem', position: 'relative' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        Buscar y Agregar Productos
                                    </label>
                                    <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: '600' }}>
                                        Navega con <kbd style={{ padding: '1px 4px', backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '4px', fontSize: '0.65rem' }}>↓</kbd> <kbd style={{ padding: '1px 4px', backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '4px', fontSize: '0.65rem' }}>↑</kbd> y pulsa <kbd style={{ padding: '1px 4px', backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '4px', fontSize: '0.65rem' }}>Enter</kbd>
                                    </span>
                                </div>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <Search size={16} style={{ position: 'absolute', left: '0.75rem', color: '#94A3B8', pointerEvents: 'none' }} />
                                    <input
                                        ref={productSearchInputRef}
                                        type="text"
                                        placeholder="Escribe el nombre o código del producto (ej: Tomate Chonto, Papa, Cebolla)..."
                                        value={productSearch} 
                                        onChange={e => { setProductSearch(e.target.value); setFocusedProductIndex(-1); }}
                                        onKeyDown={handleProductSearchKeyDown}
                                        style={{
                                            width: '100%',
                                            height: '40px',
                                            padding: '0 2.2rem 0 2.3rem',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E1',
                                            backgroundColor: '#F8FAFC',
                                            fontSize: '0.88rem',
                                            color: '#1E293B',
                                            outline: 'none',
                                            transition: 'all 0.15s ease'
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = '#0D7A57';
                                            e.target.style.backgroundColor = '#FFFFFF';
                                            e.target.style.boxShadow = '0 0 0 3px rgba(13, 122, 87, 0.12)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = '#CBD5E1';
                                            e.target.style.backgroundColor = '#F8FAFC';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                    {productSearch && (
                                        <button
                                            type="button"
                                            onClick={() => { setProductSearch(''); productSearchInputRef.current?.focus(); }}
                                            style={{
                                                position: 'absolute',
                                                right: '0.65rem',
                                                background: 'none',
                                                border: 'none',
                                                color: '#94A3B8',
                                                cursor: 'pointer',
                                                padding: '3px',
                                                display: 'flex',
                                                alignItems: 'center'
                                            }}
                                            title="Limpiar búsqueda"
                                        >
                                            <X size={15} />
                                        </button>
                                    )}
                                </div>

                            {filteredProducts.length > 0 && (
                                <div 
                                    ref={productSuggestionsListRef}
                                    style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                                        backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '12px',
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.15)', marginTop: '0.5rem',
                                        maxHeight: '280px', overflowY: 'auto'
                                    }}
                                >
                                    {filteredProducts.map((p, idx) => {
                                        const isScarcityLocked = Boolean(scarcityLockedMap[p.id]);
                                        const exc = clientExceptions.find(e => e.product_id === p.id);
                                        const freq = clientFrequentProductMap[p.id];
                                        const isClientHabitual = Boolean(exc || freq);
                                        const isFocused = idx === focusedProductIndex;

                                        return (
                                            <div
                                                key={p.id}
                                                onClick={() => handleProductClick(p)}
                                                onMouseEnter={() => setFocusedProductIndex(idx)}
                                                style={{
                                                    padding: '0.9rem 1.15rem',
                                                    cursor: isScarcityLocked ? 'not-allowed' : 'pointer',
                                                    borderBottom: '1px solid #E2E8F0',
                                                    borderLeft: isFocused ? '6px solid #2563EB' : '6px solid transparent',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    backgroundColor: isScarcityLocked
                                                        ? (isFocused ? '#FEE2E2' : '#FEF2F2')
                                                        : (isFocused 
                                                            ? '#DBEAFE' 
                                                            : (isClientHabitual ? '#F0FDF4' : 'white')),
                                                    boxShadow: isFocused ? 'inset 0 0 0 1px #93C5FD, 0 2px 4px rgba(37, 99, 235, 0.08)' : 'none',
                                                    transition: 'all 0.12s ease-in-out',
                                                    opacity: isScarcityLocked ? 0.85 : 1
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{ 
                                                        fontWeight: isFocused ? '900' : '700', 
                                                        color: isScarcityLocked ? '#991B1B' : (isFocused ? '#1E3A8A' : '#111827') 
                                                    }}>
                                                        {p.name} <span style={{ fontSize: '0.8em', color: isFocused ? '#2563EB' : '#6B7280', fontWeight: '600' }}>(ID Contable: {getAccountingIdDisplay(p)})</span>
                                                    </span>
                                                    {isClientHabitual && (
                                                        <span style={{ 
                                                            fontSize: '0.7rem', 
                                                            backgroundColor: isFocused ? '#BBF7D0' : '#DCFCE7', 
                                                            color: '#15803D', 
                                                            padding: '2px 8px', 
                                                            borderRadius: '999px', 
                                                            fontWeight: '800', 
                                                            display: 'inline-flex', 
                                                            alignItems: 'center', 
                                                            gap: '4px',
                                                            border: isFocused ? '1.5px solid #22C55E' : '1px solid #86EFAC'
                                                        }}>
                                                            ⭐ Habitual {exc?.nickname && exc.nickname.trim().toLowerCase() !== p.name.trim().toLowerCase() ? `(Alias: ${exc.nickname})` : ''}
                                                        </span>
                                                    )}
                                                    {exc?.preferred_options && typeof exc.preferred_options === 'object' && Object.keys(exc.preferred_options).length > 0 && (
                                                        <span style={{ 
                                                            fontSize: '0.68rem', 
                                                            backgroundColor: isFocused ? '#BBF7D0' : '#DCFCE7', 
                                                            color: '#15803D', 
                                                            padding: '2px 7px', 
                                                            borderRadius: '6px', 
                                                            fontWeight: '800', 
                                                            display: 'inline-flex', 
                                                            alignItems: 'center', 
                                                            gap: '3px',
                                                            border: isFocused ? '1.5px solid #22C55E' : '1px solid #86EFAC'
                                                        }}>
                                                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} /> {Object.values(exc.preferred_options).join(' • ')}
                                                        </span>
                                                    )}
                                                    {isScarcityLocked && (
                                                        <span style={{ fontSize: '0.68rem', backgroundColor: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: '4px', border: '1px solid #FCA5A5', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            <PackageX size={12} /> AGOTADO POR ESCASEZ
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: '0.85rem', fontWeight: isFocused ? '800' : '600', color: isFocused ? '#1E40AF' : '#4B5563' }}>
                                                    {formatMoney(p.base_price)}/{p.unit_of_measure}
                                                    {p.options_config?.length > 0 && (
                                                        <span style={{ 
                                                            marginLeft: '6px', 
                                                            fontSize: '0.7em', 
                                                            backgroundColor: isFocused ? '#FEF08A' : '#FEF3C7', 
                                                            color: '#92400E', 
                                                            padding: '2px 6px', 
                                                            borderRadius: '6px', 
                                                            border: isFocused ? '1px solid #EAB308' : '1px solid #FDE68A',
                                                            fontWeight: '800',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px'
                                                        }}>
                                                            <Settings size={11} /> Opciones
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        )}
                        {/* 3. CART LIST WITH IMPROVED STEPPER */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0 }}>Detalle del Pedido</h3>
                            </div>

                            {/* Duplicate Products Alert Banner */}
                            {(() => {
                                const dupCounts = new Map<string, number>();
                                cart.forEach(item => {
                                    const cleanLabel = (item.variant_label || '').trim().toLowerCase();
                                    const cleanUnit = (item.originalUnit || item.product?.unit_of_measure || 'Kg').trim().toLowerCase();
                                    const key = `${item.product.id}_${cleanLabel}_${cleanUnit}`;
                                    dupCounts.set(key, (dupCounts.get(key) || 0) + 1);
                                });
                                const hasDuplicates = Array.from(dupCounts.values()).some(cnt => cnt > 1);
                                
                                if (!hasDuplicates) return null;

                                return (
                                    <div style={{
                                        backgroundColor: '#FFFBEB',
                                        border: '1.5px solid #FCD34D',
                                        borderRadius: '12px',
                                        padding: '0.85rem 1.1rem',
                                        marginBottom: '1.25rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '12px',
                                        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.12)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#92400E', fontWeight: '600' }}>
                                            <AlertTriangle size={20} color="#D97706" style={{ flexShrink: 0 }} />
                                            <div>
                                                <strong style={{ color: '#B45309', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <ShoppingCart size={15} color="#B45309" /> Productos duplicados detectados:
                                                </strong> Hay líneas repetidas del mismo producto en este pedido.
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleConsolidateAllCartDuplicates}
                                            style={{
                                                padding: '7px 16px',
                                                backgroundColor: '#D97706',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '8px',
                                                fontWeight: '800',
                                                fontSize: '0.8rem',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                boxShadow: '0 2px 6px rgba(217, 119, 6, 0.25)',
                                                flexShrink: 0
                                            }}
                                        >
                                            <Zap size={13} /> Consolidar Cantidades
                                        </button>
                                    </div>
                                );
                            })()}

                            {cart.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: '#F9FAFB', borderRadius: '12px', color: '#9CA3AF', border: '2px dashed #E5E7EB' }}>
                                    No hay productos agregados.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: '#E5E7EB', border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden' }}>
                                    {/* Table Header */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 190px 140px 110px 80px', gap: '1rem', padding: '0.8rem 1rem', backgroundColor: '#F8FAFC', color: '#64748B', fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        <div>Producto</div>
                                        <div style={{ textAlign: 'center' }}>Cantidad</div>
                                        <div style={{ textAlign: 'right' }}>Precio Unit.</div>
                                        <div style={{ textAlign: 'right' }}>Subtotal</div>
                                        <div style={{ textAlign: 'center' }}>Acciones</div>
                                    </div>

                                    {cart.map((item, idx) => {
                                        const hasPredefined = conversions.some(c => c.product_id === item.product.id);
                                        const itemConversions = conversions.filter(c => c.product_id === item.product.id);
                                        const unitPrice = item.price !== undefined && item.price !== null ? item.price : 0;
                                        const isZeroPrice = parseFloat(unitPrice.toString()) === 0;

                                        return (
                                            <div key={`${item.product.id}-${idx}`} style={{ backgroundColor: 'white', borderBottom: '1px solid #E5E7EB' }}>
                                                {/* Main Row */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 190px 140px 110px 80px', gap: '1rem', alignItems: 'center', padding: '0.8rem 1rem' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#111827', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                                            <span>{item.product.name}</span>
                                                            {item.variant_label && (
                                                                <span 
                                                                    onClick={() => startEditingCartItem(idx)}
                                                                    style={{ 
                                                                        fontWeight: '600', 
                                                                        color: '#0891B2', 
                                                                        fontSize: '0.8em', 
                                                                        backgroundColor: '#ECFEFF', 
                                                                        padding: '2px 6px', 
                                                                        borderRadius: '4px', 
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '3px',
                                                                        border: '1px solid #CFFAFE'
                                                                    }}
                                                                    title="Parametrización Operativa: Atributos y especificaciones técnicas estandarizadas para el costeo, inventario y cubicaje."
                                                                >
                                                                    <Settings size={11} strokeWidth={2} />
                                                                    {item.variant_label}
                                                                </span>
                                                            )}
                                                            {item.picking_note && (
                                                                <span 
                                                                    style={{ 
                                                                        fontWeight: '600', 
                                                                        color: '#B45309', 
                                                                        fontSize: '0.8em', 
                                                                        backgroundColor: '#FEF3C7', 
                                                                        padding: '2px 6px', 
                                                                        borderRadius: '4px', 
                                                                        border: '1px solid #FCD34D',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '3px',
                                                                        cursor: 'help'
                                                                    }}
                                                                    title="Requerimiento del Cliente: Instrucción comercial u observación de picking solicitada por el cliente."
                                                                >
                                                                    <FileText size={11} strokeWidth={2} />
                                                                    Nota: {item.picking_note}
                                                                </span>
                                                            )}
                                                            {/* Pricing Source Badge */}
                                                            {campaignPrices[item.product.id] ? (
                                                                <span style={{ fontSize: '0.75rem', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '3px', border: '1px solid #FCA5A5' }}>
                                                                    <Zap size={11} strokeWidth={2} /> {campaignPrices[item.product.id].name} ({campaignPrices[item.product.id].type === 'fixed_price' ? 'Precio Fijo' : `${campaignPrices[item.product.id].value > 0 ? '+' : ''}${campaignPrices[item.product.id].value}%`})
                                                                </span>
                                                            ) : contractPrices[item.product.id] !== undefined && contractPrices[item.product.id] !== null && contractPrices[item.product.id] > 0 ? (() => {
                                                                const isAgreement = activePricingModel?.is_agreement;
                                                                const hasCustomPrice = customPriceIds.has(item.product.id);
                                                                if (isAgreement) {
                                                                    if (hasCustomPrice) {
                                                                        return (
                                                                            <span style={{ fontSize: '0.75rem', backgroundColor: '#DCFCE7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '3px', border: '1px solid #86EFAC' }}>
                                                                                <ShieldCheck size={11} strokeWidth={2} /> Dentro de acuerdo
                                                                            </span>
                                                                        );
                                                                    } else {
                                                                        return (
                                                                            <span style={{ fontSize: '0.75rem', backgroundColor: '#F1F5F9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '3px', border: '1px solid #E2E8F0' }}>
                                                                                <Building2 size={11} strokeWidth={2} /> General Institucional
                                                                            </span>
                                                                        );
                                                                    }
                                                                } else if (isContractExpired) {
                                                                    return (
                                                                        <span style={{ fontSize: '0.75rem', backgroundColor: '#FFFBEB', color: '#B45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', border: '1px solid #FDE68A', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                            <AlertTriangle size={11} strokeWidth={2} /> General Institucional (Acuerdo Vencido)
                                                                        </span>
                                                                    );
                                                                } else if (clientType === 'B2B' || Boolean(selectedClient)) {
                                                                    if (hasCustomPrice) {
                                                                        return (
                                                                            <span style={{ fontSize: '0.75rem', backgroundColor: '#E0F2FE', color: '#0369A1', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '3px', border: '1px solid #BAE6FD' }}>
                                                                                <FileCheck size={11} strokeWidth={2} /> Tarifa Contrato
                                                                            </span>
                                                                        );
                                                                    } else {
                                                                        return (
                                                                            <span style={{ fontSize: '0.75rem', backgroundColor: '#F1F5F9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '3px', border: '1px solid #E2E8F0' }}>
                                                                                <Building2 size={11} strokeWidth={2} /> General Institucional
                                                                            </span>
                                                                        );
                                                                    }
                                                                } else {
                                                                    return (
                                                                        <span style={{ fontSize: '0.75rem', backgroundColor: '#FFF7ED', color: '#C2410C', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '3px', border: '1px solid #FED7AA' }}>
                                                                            <Tag size={11} strokeWidth={2} /> Tarifa B2C
                                                                        </span>
                                                                    );
                                                                }
                                                            })() : (item.price && item.price > 0) || (item.product?.base_price && item.product.base_price > 0) ? (
                                                                <span style={{ fontSize: '0.75rem', backgroundColor: (clientType === 'B2B' || Boolean(selectedClient)) ? (isContractExpired ? '#FFFBEB' : '#F1F5F9') : '#FFF7ED', color: (clientType === 'B2B' || Boolean(selectedClient)) ? (isContractExpired ? '#B45309' : '#475569') : '#C2410C', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', border: `1px solid ${isContractExpired ? '#FDE68A' : '#E2E8F0'}`, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                    {(clientType === 'B2B' || Boolean(selectedClient)) ? (isContractExpired ? <><AlertTriangle size={11} strokeWidth={2} /> General Institucional (Acuerdo Vencido)</> : <><Building2 size={11} strokeWidth={2} /> General Institucional</>) : <><Tag size={11} strokeWidth={2} /> Tarifa B2C</>}
                                                                </span>
                                                            ) : (
                                                                <span style={{ fontSize: '0.75rem', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '3px', border: '1px solid #FCA5A5' }}>
                                                                    <AlertCircle size={11} strokeWidth={2} /> Sin Precio
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                                            <span style={{ fontSize: '0.75rem', color: '#475569', backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0', fontWeight: '700' }}>
                                                                ID Contable: {getAccountingIdDisplay(item.product)}
                                                            </span>
                                                            <span>•</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setActiveEquivalenceRow(activeEquivalenceRow === idx ? null : idx)}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    border: 'none',
                                                                    backgroundColor: hasPredefined ? '#E8F5E9' : '#FFF9C4',
                                                                    color: hasPredefined ? '#2E7D32' : '#F57F17',
                                                                    padding: '2px 6px',
                                                                    borderRadius: '4px',
                                                                    cursor: 'pointer',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 'bold',
                                                                    transition: 'opacity 0.2s'
                                                                }}
                                                                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                                                                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                                            >
                                                                <Scale size={12} /> Conversión {item.originalUnit && `(${item.originalQty} ${item.originalUnit})`}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Cantidad Stepper */}
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#F8FAFC', height: '36px' }}>
                                                            <button
                                                                onClick={() => {
                                                                    const nextQty = Math.max(0.5, parseFloat(item.qty.toString().replace(',', '.')) - 0.5);
                                                                    setCart(prev => prev.map((c, i) => i === idx ? { ...c, qty: nextQty, originalQty: nextQty, conversion_factor: 1, originalUnit: item.product.unit_of_measure || 'Kg' } : c));
                                                                }}
                                                                style={{ width: '32px', height: '100%', border: 'none', borderRight: '1px solid #E2E8F0', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}
                                                            >−</button>
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                value={formatQuantityDisplay(item.qty)}
                                                                onFocus={(e) => e.target.select()}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === '.') {
                                                                        e.preventDefault();
                                                                        const input = e.target as HTMLInputElement;
                                                                        const start = input.selectionStart || 0;
                                                                        const end = input.selectionEnd || 0;
                                                                        const val = input.value.replace(/\./g, '');
                                                                        if (!val.includes(',')) {
                                                                            const newVal = val.substring(0, start) + ',' + val.substring(end);
                                                                            setCart(prev => prev.map((c, i) => i === idx ? { ...c, qty: newVal, originalQty: parseFloat(newVal.replace(',', '.')) || 0, conversion_factor: 1, originalUnit: item.product.unit_of_measure || 'Kg' } : c));
                                                                        }
                                                                    }
                                                                }}
                                                                onChange={(e) => {
                                                                    let val = e.target.value.replace(/[^0-9,.]/g, '');
                                                                    const rawVal = val.replace(/\./g, '');
                                                                    const parts = rawVal.split(',');
                                                                    let cleanVal = rawVal;
                                                                    if (parts.length > 2) {
                                                                        cleanVal = parts[0] + ',' + parts.slice(1).join('');
                                                                    }
                                                                    setCart(prev => prev.map((c, i) => i === idx ? { ...c, qty: cleanVal, originalQty: parseFloat(cleanVal.replace(',', '.')) || 0, conversion_factor: 1, originalUnit: item.product.unit_of_measure || 'Kg' } : c));
                                                                }}
                                                                style={{ width: '80px', height: '100%', border: 'none', textAlign: 'center', fontWeight: '800', fontSize: '0.95rem', outline: 'none', backgroundColor: 'white' }}
                                                            />
                                                            <button
                                                                onClick={() => {
                                                                    const nextQty = parseFloat(item.qty.toString().replace(',', '.')) + 0.5;
                                                                    setCart(prev => prev.map((c, i) => i === idx ? { ...c, qty: nextQty, originalQty: nextQty, conversion_factor: 1, originalUnit: item.product.unit_of_measure || 'Kg' } : c));
                                                                }}
                                                                style={{ width: '32px', height: '100%', border: 'none', borderLeft: '1px solid #E2E8F0', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}
                                                            >+</button>
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.05em', minWidth: '35px' }}>
                                                            {item.product.unit_of_measure?.toUpperCase() || 'UND'}
                                                        </div>
                                                    </div>

                                                    {/* Physical Unit Badge — shown when item was entered as discrete units (e.g. 1 Unidad 2000 gr) */}
                                                    {(() => {
                                                        const badgeText = resolvePhysicalInstruction({
                                                            quantity: Number(item.qty) || 0,
                                                            unit: item.product.unit_of_measure,
                                                            variant_label: item.variant_label,
                                                            selected_options: item.selected_options
                                                        });
                                                        if (!badgeText) return null;
                                                        return (
                                                            <div style={{ textAlign: 'center', marginTop: '-2px' }}>
                                                                <span style={{
                                                                    display: 'inline-block',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: '700',
                                                                    color: '#065F46',
                                                                    backgroundColor: '#D1FAE5',
                                                                    border: '1px solid #6EE7B7',
                                                                    borderRadius: '4px',
                                                                    padding: '1px 6px',
                                                                    letterSpacing: '0.02em'
                                                                }}>
                                                                    {badgeText}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* Price Edit Input */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${isZeroPrice ? '#EF4444' : '#E2E8F0'}`, borderRadius: '8px', overflow: 'hidden', padding: '0 8px', backgroundColor: 'white', height: '36px', transition: 'all 0.2s' }}>
                                                            <span style={{ fontSize: '0.85rem', color: '#64748B', paddingLeft: '4px', fontWeight: 'bold' }}>$</span>
                                                            <input
                                                                type="text"
                                                                value={formatPriceDisplay(item.price !== undefined && item.price !== null ? item.price : '')}
                                                                onFocus={(e) => e.target.select()}
                                                                onChange={(e) => {
                                                                    const val = e.target.value.replace(/[^0-9,.]/g, '');
                                                                    const cleanVal = val.replace(/\./g, '').replace(',', '.');
                                                                    const parsed = cleanVal === '' ? '' : (parseFloat(cleanVal) || 0);
                                                                    setCart(prev => prev.map((c, i) => i === idx ? { ...c, price: parsed as any } : c));
                                                                }}
                                                                style={{ width: '80px', height: '100%', border: 'none', outline: 'none', textAlign: 'right', fontWeight: '700', fontSize: '0.9rem', padding: '2px 4px' }}
                                                            />
                                                        </div>
                                                        {isZeroPrice && (
                                                            <span style={{ fontSize: '0.65rem', color: '#DC2626', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                <AlertCircle size={11} color="#DC2626" /> Asignar Precio
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Subtotal */}
                                                    <div style={{ textAlign: 'right', fontWeight: '800', color: '#111827', fontSize: '0.95rem' }}>
                                                        {formatMoney(unitPrice * parseFloat(item.qty.toString().replace(',', '.') || '0'))}
                                                    </div>

                                                    {/* Actions (Edit and Delete) */}
                                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
                                                        <button
                                                            onClick={() => startEditingCartItem(idx)}
                                                            style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', backgroundColor: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#DBEAFE'}
                                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#EFF6FF'}
                                                            title="Editar item (variantes, unidad, etc.)"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => removeFromCart(idx)}
                                                            style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', backgroundColor: '#FEE2E2', color: '#B91C1C', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FECACA'}
                                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                                                            title="Eliminar item"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Equivalence Expandable Sub-panel */}
                                                {activeEquivalenceRow === idx && (
                                                    <div style={{
                                                        padding: '1rem',
                                                        backgroundColor: hasPredefined ? '#F0FDF4' : '#FFFDE7',
                                                        borderTop: `1px solid ${hasPredefined ? '#DCFCE7' : '#FEF08A'}`,
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '0.75rem'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: hasPredefined ? '#15803D' : '#A16207', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                <Scale size={14} /> {hasPredefined ? 'Conversiones de Equivalencia Sugeridas' : 'Calculadora Libre de Equivalencias'}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setActiveEquivalenceRow(null)}
                                                                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
                                                            >
                                                                Cerrar
                                                            </button>
                                                        </div>

                                                        {/* Predefined conversion buttons */}
                                                        {hasPredefined && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                                {itemConversions.map(c => (
                                                                    <button
                                                                        key={c.id}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const factor = parseFloat(c.conversion_factor);
                                                                            const calculatedQty = parseFloat(((item.originalQty || 1) * factor).toFixed(3));
                                                                            setCart(prev => prev.map((itm, i) => i === idx ? {
                                                                                ...itm,
                                                                                originalUnit: c.from_unit,
                                                                                conversion_factor: factor,
                                                                                qty: calculatedQty
                                                                            } : itm));
                                                                        }}
                                                                        style={{
                                                                            backgroundColor: '#E8F5E9',
                                                                            border: `1px solid ${item.originalUnit === c.from_unit ? '#2E7D32' : '#A5D6A7'}`,
                                                                            color: '#1B5E20',
                                                                            padding: '4px 10px',
                                                                            borderRadius: '6px',
                                                                            fontSize: '0.8rem',
                                                                            fontWeight: 'bold',
                                                                            cursor: 'pointer',
                                                                            boxShadow: item.originalUnit === c.from_unit ? '0 0 0 2px #2E7D32' : 'none'
                                                                        }}
                                                                    >
                                                                        {c.from_unit} ({c.conversion_factor} {c.to_unit})
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Calculation Inputs */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.85rem', color: '#374151' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <label style={{ fontWeight: 'bold' }}>Ingresar:</label>
                                                                <input
                                                                    type="number"
                                                                    value={item.originalQty || ''}
                                                                    onChange={(e) => {
                                                                        const orig = parseFloat(e.target.value) || 0;
                                                                        const factor = item.conversion_factor || 1;
                                                                        const calculatedQty = parseFloat((orig * factor).toFixed(3));
                                                                        setCart(prev => prev.map((itm, i) => i === idx ? {
                                                                            ...itm,
                                                                            originalQty: orig,
                                                                            qty: calculatedQty
                                                                        } : itm));
                                                                    }}
                                                                    style={{ width: '70px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', textAlign: 'center' }}
                                                                />
                                                            </div>

                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <select
                                                                    value={item.originalUnit || 'Kg'}
                                                                    onChange={(e) => {
                                                                        const unit = e.target.value;
                                                                        setCart(prev => prev.map((itm, i) => i === idx ? { ...itm, originalUnit: unit } : itm));
                                                                    }}
                                                                    style={{ padding: '4px 6px', borderRadius: '4px', border: '1px solid #CBD5E1', backgroundColor: 'white' }}
                                                                >
                                                                    <option value="Bulto">Bulto</option>
                                                                    <option value="Caja">Caja</option>
                                                                    <option value="Canastilla">Canastilla</option>
                                                                    <option value="Bolsa">Bolsa</option>
                                                                    <option value="Malla">Malla</option>
                                                                    <option value="Kg">Kg</option>
                                                                    <option value="Libra">Libra</option>
                                                                    <option value="Atado">Atado</option>
                                                                    <option value="Unidad">Unidad</option>
                                                                </select>
                                                            </div>

                                                            <span>x</span>

                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <label style={{ fontWeight: 'bold' }}>Factor:</label>
                                                                <input
                                                                    type="number"
                                                                    value={item.conversion_factor || ''}
                                                                    onChange={(e) => {
                                                                        const factor = parseFloat(e.target.value) || 1;
                                                                        const orig = item.originalQty || 1;
                                                                        const calculatedQty = parseFloat((orig * factor).toFixed(2));
                                                                        setCart(prev => prev.map((itm, i) => i === idx ? {
                                                                            ...itm,
                                                                            conversion_factor: factor,
                                                                            qty: calculatedQty
                                                                        } : itm));
                                                                    }}
                                                                    style={{ width: '70px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', textAlign: 'center' }}
                                                                />
                                                            </div>

                                                            <span>=</span>

                                                            <span style={{ fontWeight: '800', color: hasPredefined ? '#1E4620' : '#713F12' }}>
                                                                {item.qty} {item.product.unit_of_measure || 'Kg'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT COLUMN: LOGISTICS, NOTES & FINANCIAL SUMMARY (STICKY) */}
                    {!isStaging && (
                        <div style={{ position: 'sticky', top: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* 1. LOGISTICS CARD */}
                            <div style={{
                                backgroundColor: THEME.colors.surface,
                                padding: '1rem 1.25rem',
                                borderRadius: THEME.radius.lg,
                                border: `1px solid ${THEME.colors.border}`,
                                boxShadow: THEME.shadow.sm
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.85rem' }}>
                                    <Truck size={16} color={THEME.colors.primary} />
                                    <h3 style={{ fontSize: '0.8rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                                        Configuración de Entrega
                                    </h3>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800', color: '#64748B', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Canal</label>
                                        <select
                                            id="origin-source-select"
                                            value={originSource} onChange={e => setOriginSource(e.target.value)}
                                            style={{ width: '100%', height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: 'white', fontSize: '0.82rem', outline: 'none' }}
                                        >
                                            <option value="phone">Teléfono</option>
                                            <option value="whatsapp">WhatsApp</option>
                                            <option value="file_upload">Documento (PDF/Excel)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800', color: '#64748B', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Fecha Entrega</label>
                                        <input
                                            type="date"
                                            value={deliveryDate}
                                            min={minDeliveryDate}
                                            onChange={e => {
                                                const newDate = e.target.value;
                                                if (newDate < minDeliveryDate) {
                                                    showToast(`La fecha mínima de entrega permitida es ${minDeliveryDate}.`, 'error');
                                                    setDeliveryDate(minDeliveryDate);
                                                    return;
                                                }
                                                setDeliveryDate(newDate);
                                            }}
                                            style={{ width: '100%', height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: 'white', fontSize: '0.82rem', outline: 'none' }}
                                        />
                                    </div>
                                </div>

                                {/* FRANJA DE ENTREGA BADGE */}
                                {(selectedClient || selectedClientB2C) && (
                                    <div style={{
                                        marginTop: '0.75rem',
                                        padding: '0.6rem 0.85rem',
                                        backgroundColor: isManualDelivery ? '#F0FDF4' : '#FFF7ED',
                                        borderRadius: '8px',
                                        border: isManualDelivery ? '1px solid #BBF7D0' : '1px solid #FFEDD5'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                            <span style={{ fontSize: '0.62rem', fontWeight: '800', color: isManualDelivery ? '#166534' : '#9A3412', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                {isManualDelivery ? 'Override Manual Activo' : 'Franja de Entrega'}
                                            </span>
                                            {isManualDelivery && (
                                                <span style={{ fontSize: '0.58rem', backgroundColor: '#10B981', color: 'white', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                                                    PRIORITARIO
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.88rem', fontWeight: '800', color: isManualDelivery ? '#14532D' : '#431407', lineHeight: '1.2' }}>
                                            {isManualDelivery ? (
                                                <span>{manualDeliveryTime || '??:??'} (±{manualDeliveryMargin} min)</span>
                                            ) : (
                                                getSelectedClientDetails()?.logistics_data?.days?.length > 0
                                                    ? formatTimeWindow(getSelectedClientDetails()?.logistics_data)
                                                    : (getSelectedClientDetails()?.delivery_restrictions || 'Sin restricciones horarias')
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* MANUAL OVERRIDE TOGGLE */}
                                <div style={{ marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid #F1F5F9' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={isManualDelivery}
                                            onChange={e => setIsManualDelivery(e.target.checked)}
                                            style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: THEME.colors.primary }}
                                        />
                                        <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>Ajuste manual de franja horaria</span>
                                    </label>

                                    {isManualDelivery && (
                                        <div style={{
                                            marginTop: '0.65rem',
                                            padding: '0.75rem',
                                            backgroundColor: '#F0FDF4',
                                            borderRadius: '8px',
                                            border: '1px solid #DCFCE7',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.5rem'
                                        }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: '800', color: '#166534', marginBottom: '0.2rem' }}>HORA</label>
                                                    <input
                                                        type="time"
                                                        value={manualDeliveryTime}
                                                        onChange={e => setManualDeliveryTime(e.target.value)}
                                                        style={{ width: '100%', height: '32px', padding: '0 0.4rem', borderRadius: '6px', border: '1px solid #BBF7D0', fontSize: '0.8rem' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: '800', color: '#166534', marginBottom: '0.2rem' }}>MARGEN</label>
                                                    <select
                                                        value={manualDeliveryMargin} onChange={e => setManualDeliveryMargin(Number(e.target.value))}
                                                        style={{ width: '100%', height: '32px', padding: '0 0.4rem', borderRadius: '6px', border: '1px solid #BBF7D0', fontSize: '0.8rem', backgroundColor: 'white' }}
                                                    >
                                                        <option value={15}>±15 min</option>
                                                        <option value={30}>±30 min</option>
                                                        <option value={45}>±45 min</option>
                                                        <option value={60}>±60 min</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: '800', color: '#166534', marginBottom: '0.2rem' }}>INSTRUCCIÓN</label>
                                                <input
                                                    type="text"
                                                    placeholder="Ej: Recibe don Carlos en bodega..."
                                                    value={manualDeliveryNote}
                                                    onChange={e => setManualDeliveryNote(e.target.value)}
                                                    style={{ width: '100%', height: '32px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid #BBF7D0', fontSize: '0.8rem' }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 2. ADMIN NOTES CARD */}
                            <div style={{
                                backgroundColor: THEME.colors.surface,
                                padding: '1rem 1.25rem',
                                borderRadius: THEME.radius.lg,
                                border: `1px solid ${THEME.colors.border}`,
                                boxShadow: THEME.shadow.sm
                            }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                                    Observaciones del Pedido
                                </label>
                                <textarea
                                    value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                                    rows={2}
                                    placeholder="Instrucciones especiales para alistamiento o entrega..."
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '6px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.82rem',
                                        color: '#334155',
                                        resize: 'vertical',
                                        minHeight: '52px',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            {/* 3. FINANCIAL SUMMARY & CONFIRM ORDER CARD */}
                            <div style={{
                                backgroundColor: THEME.colors.surface,
                                padding: '1.25rem',
                                borderRadius: THEME.radius.lg,
                                border: `1px solid ${cart.length > 0 ? '#A7D7C5' : THEME.colors.border}`,
                                boxShadow: THEME.shadow.md,
                                background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', paddingBottom: '0.75rem', borderBottom: '1px solid #F1F5F9' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: cart.length > 0 ? '#0D7A57' : '#64748B', fontWeight: '800', fontSize: '0.82rem' }}>
                                        <ShoppingCart size={15} />
                                        <span>{cart.length} {cart.length === 1 ? 'producto' : 'productos'}</span>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>Resumen de Cuenta</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                                        <span>Subtotal</span>
                                        <span style={{ fontWeight: '700', color: '#1E293B' }}>{formatMoney(calculateSubtotal())}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                                        <span>IVA Estimado</span>
                                        <span style={{ fontWeight: '700', color: '#1E293B' }}>{formatMoney(calculateTotalTax())}</span>
                                    </div>
                                    <div style={{ height: '1px', backgroundColor: '#E2E8F0', margin: '0.25rem 0' }} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0F172A' }}>Total a Pagar</span>
                                        <span style={{ fontSize: '1.45rem', fontWeight: '900', color: '#0D7A57', letterSpacing: '-0.02em' }}>
                                            {formatMoney(calculateTotal())}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={handleSubmit}
                                    disabled={loading || cart.length === 0}
                                    style={{
                                        width: '100%',
                                        height: '44px',
                                        borderRadius: '10px',
                                        backgroundColor: cart.length > 0 ? '#0D7A57' : '#94A3B8',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        fontWeight: '800',
                                        fontSize: '0.92rem',
                                        cursor: (loading || cart.length === 0) ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        boxShadow: cart.length > 0 ? '0 4px 12px rgba(13, 122, 87, 0.3)' : 'none',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onMouseOver={(e) => {
                                        if (cart.length > 0 && !loading) {
                                            e.currentTarget.style.backgroundColor = '#0A5F43';
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                        }
                                    }}
                                    onMouseOut={(e) => {
                                        if (cart.length > 0 && !loading) {
                                            e.currentTarget.style.backgroundColor = '#0D7A57';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }
                                    }}
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin" />
                                            <span>Guardando y Procesando Pedido...</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 size={17} />
                                            <span>CONFIRMAR PEDIDO</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- VARIANT SELECTION MODAL --- */}
            {selectedProductForModal && (() => {
                const exc = clientExceptions.find(e => e.product_id === selectedProductForModal.id);
                const itemConversions = conversions.filter(c => c.product_id === selectedProductForModal.id);
                const stagedItem = stagedItems.find(item => item.id === editingStagedItemId);

                // Normalizar y ordenar alfabéticamente los atributos por su nombre (A-Z)
                const normalizedOptionsConfig = (selectedProductForModal.options_config || [])
                    .slice()
                    .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                    .map((opt: any) => {
                    let values: string[] = opt.values || [];
                    const isPresentation = opt.name.toLowerCase().includes('presentaci') || opt.name.toLowerCase().includes('unidad');
                    const baseUnitLower = (selectedProductForModal.unit_of_measure || 'Kg').toLowerCase();
                    const isKgProduct = baseUnitLower === 'kg' || baseUnitLower === 'kilo' || baseUnitLower === 'kilogramo';

                    if (isPresentation) {
                        values = values.filter((v: string) => {
                            const clean = v.toLowerCase();
                            return !clean.includes('libra') && !clean.includes('pound') && !clean.includes('unidad web');
                        });
                        
                        // Si el producto se compra en KG, asegurar siempre que 'Kg' sea la primera opción
                        if (isKgProduct) {
                            const hasKg = values.some(v => {
                                const clean = (v.includes('|') ? v.split('|')[0] : v).trim().toLowerCase();
                                return clean === 'kg' || clean === 'kilo' || clean === 'kilogramo';
                            });
                            if (!hasKg) {
                                values = ['Kg', ...values];
                            }
                        } else if (values.length === 0) {
                            values = [selectedProductForModal.unit_of_measure || 'Unidad'];
                        }
                    }
                    
                    const sortedValues = values.slice().sort((valA: string, valB: string) => {
                        const cleanA = (valA.includes('|') ? valA.split('|')[0] : valA).trim().toLowerCase();
                        const cleanB = (valB.includes('|') ? valB.split('|')[0] : valB).trim().toLowerCase();
                        
                        const isKgA = cleanA === 'kg' || cleanA === 'kilo' || cleanA === 'kilogramo' || cleanA === baseUnitLower;
                        const isKgB = cleanB === 'kg' || cleanB === 'kilo' || cleanB === 'kilogramo' || cleanB === baseUnitLower;

                        // 'Kg' o unidad base siempre al inicio
                        if (isKgA && !isKgB) return -1;
                        if (!isKgA && isKgB) return 1;

                        // Ordenar numéricamente por gramaje extraído
                        const weightA = getParsedWeight(valA);
                        const weightB = getParsedWeight(valB);
                        if (weightA !== null && weightB !== null) {
                            if (weightA !== weightB) return weightA - weightB;
                        }
                        
                        return cleanA.localeCompare(cleanB, undefined, { numeric: true, sensitivity: 'base' });
                    });
                    
                    return { ...opt, values: sortedValues };
                });

                // Build options list for manual orders (strictly base units: Kg, Unidad, etc.)
                const optionsList: { unit: string; factor: number; label: string }[] = [];
                const baseUnit = selectedProductForModal.unit_of_measure || 'Kg';
                
                optionsList.push({
                    unit: baseUnit,
                    factor: 1,
                    label: `${baseUnit} (Base)`
                });
                
                itemConversions.forEach(c => {
                    const fromLower = c.from_unit.toLowerCase();
                    if (fromLower.includes('libra') || fromLower.includes('pound') || fromLower.includes('unidad web')) return;
                    const isDuplicate = optionsList.some(o => o.unit.toLowerCase() === c.from_unit.toLowerCase());
                    if (!isDuplicate) {
                        optionsList.push({
                            unit: c.from_unit,
                            factor: parseFloat(c.conversion_factor) || 1,
                            label: `${c.from_unit} (${c.conversion_factor} ${c.to_unit})`
                        });
                    }
                });

                const handleSelectKeyDown = (e: React.KeyboardEvent, index: number, totalOptions: number) => {
                    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                        e.preventDefault();
                        if (index < totalOptions - 1) {
                            const nextSelect = document.getElementById(`modal-select-${index + 1}`);
                            if (nextSelect) (nextSelect as HTMLElement).focus();
                        } else {
                            const qtyInput = document.getElementById('modal-qty-input');
                            if (qtyInput) {
                                (qtyInput as HTMLElement).focus();
                                (qtyInput as HTMLInputElement).select();
                            }
                        }
                    } else if (e.key === 'Tab' && e.shiftKey) {
                        if (index > 0) {
                            e.preventDefault();
                            const prevSelect = document.getElementById(`modal-select-${index - 1}`);
                            if (prevSelect) (prevSelect as HTMLElement).focus();
                        }
                    }
                };

                // Determine dynamic unit label and factor from presentation / selectedOptions
                let dynamicUnitLabel = modalUnit || selectedProductForModal.unit_of_measure || 'Kg';
                let dynamicUnitFactor = modalFactor || (selectedProductForModal.weight_kg ? Number(selectedProductForModal.weight_kg) : 1);
                const baseUnitLower = (selectedProductForModal.unit_of_measure || 'Kg').toLowerCase();
                const isKgProduct = baseUnitLower === 'kg' || baseUnitLower === 'kilo' || baseUnitLower === 'kilogramo';

                normalizedOptionsConfig.forEach((opt: any) => {
                    if (opt.name.toLowerCase().includes('presentaci') || opt.name.toLowerCase().includes('unidad')) {
                        const optVal = selectedOptions[opt.name] || (isKgProduct ? 'Kg' : opt.values?.[0] || '');
                        if (optVal) {
                            const strVal = String(optVal);
                            const clean = (strVal.includes('|') ? strVal.split('|')[0] : strVal).trim().toLowerCase();
                            if (clean === 'kg' || clean === 'kilo' || clean === 'kilogramo' || clean === baseUnitLower) {
                                dynamicUnitLabel = selectedProductForModal.unit_of_measure || 'Kg';
                                dynamicUnitFactor = 1;
                            } else if (strVal.includes('|')) {
                                const [base, gr] = strVal.split('|');
                                dynamicUnitLabel = `${base} de ${gr} gr`;
                                const pw = getParsedWeight(strVal);
                                if (pw !== null) dynamicUnitFactor = pw;
                            } else {
                                dynamicUnitLabel = strVal;
                                const pw = getParsedWeight(strVal);
                                if (pw !== null) dynamicUnitFactor = pw;
                            }
                        }
                    }
                });

                const isDiscreteUnit = !['kg', 'kilo', 'kilos'].includes((dynamicUnitLabel || '').trim().toLowerCase());
                const parsedModalQty = parseFloat(String(modalQuantity).replace(',', '.')) || 0;
                const calculatedTotalKg = parsedModalQty * dynamicUnitFactor;

                const minSaleLimitKg = getProductMinSaleKg(selectedProductForModal);
                const hasSpecialMinSale = minSaleLimitKg !== null && minSaleLimitKg > 0.1;

                return (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 12000, backdropFilter: 'blur(3px)'
                    }} onClick={() => closeProductModal()}>

                        <div
                            style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '24px', width: '95%', maxWidth: '820px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', textAlign: 'left' }}
                            onClick={e => e.stopPropagation()} // Prevent close
                        >
                            {/* Horizontal flex container for header */}
                            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '1rem', flexWrap: 'wrap' }}>
                                {/* Left side: Image and Title */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                                    {selectedProductForModal.image_url ? (
                                        <img
                                            src={selectedProductForModal.image_url}
                                            style={{ width: '80px', height: '80px', borderRadius: '16px', objectFit: 'cover', boxShadow: '0 4px 10px rgba(0,0,0,0.08)' }}
                                        />
                                    ) : (
                                        <div style={{
                                            width: '80px',
                                            height: '80px',
                                            borderRadius: '16px',
                                            backgroundColor: '#F3F4F6',
                                            border: '1px solid #E5E7EB',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            boxShadow: '0 4px 10px rgba(0,0,0,0.04)'
                                        }}>
                                            <PackageX size={28} color="#9CA3AF" />
                                        </div>
                                    )}
                                    <div>
                                        <h3 style={{ fontSize: '1.6rem', fontWeight: '900', color: '#111827', margin: 0 }}>{selectedProductForModal.name}</h3>
                                        <p style={{ color: '#6B7280', fontSize: '0.85rem', margin: '4px 0 0 0', fontWeight: '600' }}>
                                            {selectedProductForModal.options_config && selectedProductForModal.options_config.length > 0
                                                ? 'Personaliza tu producto:'
                                                : 'Especifica la cantidad y unidad de medida:'}
                                        </p>
                                    </div>
                                </div>

                                {/* Right side: Helper box (if open from staging) */}
                                {stagedItem && (
                                    <div style={{
                                        backgroundColor: '#F8FAFC',
                                        border: '1px dashed #CBD5E1',
                                        borderRadius: '12px',
                                        padding: '0.8rem 1.2rem',
                                        textAlign: 'left',
                                        fontSize: '0.85rem',
                                        color: '#475569',
                                        minWidth: '280px',
                                        flex: '1 1 auto',
                                        maxWidth: '360px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '8px' }}>
                                            <span style={{ fontWeight: '800', color: '#1E293B' }}>Texto detectado:</span>
                                            <span style={{ backgroundColor: '#FFFBEB', color: '#B45309', border: '1.5px solid #FBBF24', boxShadow: '0 2px 6px rgba(245, 158, 11, 0.1)', padding: '2px 8px', borderRadius: '6px', fontWeight: '900', fontSize: '0.75rem' }}>
                                                {formatDetectedUnit(stagedItem.originalQtyInFile || stagedItem.quantity, stagedItem.originalUnitInFile || stagedItem.originalUnit)}
                                            </span>
                                        </div>
                                        <div style={{ fontStyle: 'italic', color: '#64748B', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={stagedItem.originalName}>
                                            &quot;{stagedItem.originalName}&quot;
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* CLIENT CUSTOM REQUIREMENT / STRUCTURED PREFERENCES BANNER */}
                            {(() => {
                                const hasStructuredPreference = Boolean(
                                    exc?.preferred_options && 
                                    typeof exc.preferred_options === 'object' && 
                                    Object.keys(exc.preferred_options).length > 0
                                );
                                const hasClientNote = Boolean(exc?.picking_note || exc?.delivery_note);
                                const activeClientObj = clientType === 'B2B' ? getSelectedClientDetails() : getSelectedB2CDetails();
                                const clientDisplayName = activeClientObj?.company_name || activeClientObj?.contact_name || 'este cliente';

                                // SOLO mostrar si el cliente tiene Nota de cliente, Preferencia estructurada activa, o venta mínima especial
                                if (!hasStructuredPreference && !hasClientNote && !hasSpecialMinSale) return null;

                                return (
                                    <div style={{
                                        backgroundColor: hasStructuredPreference ? '#ECFDF5' : (hasClientNote ? '#FEF3C7' : '#F8FAFC'),
                                        border: `1.5px solid ${hasStructuredPreference ? '#A7F3D0' : (hasClientNote ? '#FCD34D' : '#E2E8F0')}`,
                                        borderRadius: '16px',
                                        padding: '0.9rem 1.3rem',
                                        margin: '0.5rem 0 1.2rem 0',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '1.2rem',
                                        flexWrap: 'wrap',
                                        textAlign: 'left',
                                        fontSize: '0.84rem',
                                        color: hasStructuredPreference ? '#065F46' : (hasClientNote ? '#92400E' : '#334155'),
                                        lineHeight: '1.4',
                                        boxShadow: hasStructuredPreference ? '0 4px 14px rgba(16, 185, 129, 0.1)' : 'none',
                                        transition: 'all 0.3s ease'
                                    }}>
                                        {/* Left: Requerimiento / Preferencia */}
                                        <div style={{ flex: '1 1 auto', minWidth: '240px' }}>
                                            {hasStructuredPreference ? (
                                                <div>
                                                    <div style={{ fontWeight: '900', marginBottom: '4px', textTransform: 'uppercase', fontSize: '0.72rem', color: '#047857', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <CheckCircle2 size={15} color="#059669" /> PREFERENCIA ESTRUCTURADA ACTIVA:
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                        {Object.entries(exc.preferred_options).map(([k, v]) => (
                                                            <span key={k} style={{
                                                                backgroundColor: '#D1FAE5',
                                                                color: '#065F46',
                                                                border: '1px solid #6EE7B7',
                                                                padding: '3px 9px',
                                                                borderRadius: '8px',
                                                                fontWeight: '800',
                                                                fontSize: '0.8rem',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}>
                                                                <span>{k}:</span> <strong>{String(v)}</strong>
                                                            </span>
                                                        ))}
                                                    </div>
                                                    {exc.picking_note && (
                                                        <div style={{ fontSize: '0.78rem', color: '#059669', marginTop: '4px', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <FileText size={12} color="#059669" /> Nota origen: &quot;{exc.picking_note}&quot;
                                                        </div>
                                                    )}
                                                </div>
                                            ) : hasClientNote ? (
                                                <div>
                                                    <div style={{ fontWeight: '800', marginBottom: '3px', textTransform: 'uppercase', fontSize: '0.72rem', color: '#B45309', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        <FileText size={13} strokeWidth={2.2} /> NOTA INFORMAL DEL CLIENTE (SIN ESTRUCTURAR):
                                                    </div>
                                                    {exc?.nickname && exc.nickname.trim().toLowerCase() !== selectedProductForModal.name.trim().toLowerCase() && (
                                                        <div style={{ marginBottom: '2px' }}><strong>Alias Comercial:</strong> {exc.nickname}</div>
                                                    )}
                                                    {exc?.picking_note && (
                                                        <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#78350F', backgroundColor: 'rgba(254, 243, 199, 0.7)', padding: '2px 8px', borderRadius: '6px', display: 'inline-block' }}>
                                                            Nota: &quot;{exc.picking_note}&quot;
                                                        </div>
                                                    )}
                                                </div>
                                            ) : null}
                                        </div>

                                        {/* Right: Botón para Fijar / Desfijar la combinación actual */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            {activeCustomerId && normalizedOptionsConfig && normalizedOptionsConfig.length > 0 && (
                                                hasStructuredPreference ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <button
                                                            type="button"
                                                            id="btn-update-preference"
                                                            onClick={() => handleSaveCustomerOptionPreference(selectedProductForModal.id, selectedOptions, false)}
                                                            disabled={savingPreference}
                                                            style={{
                                                                backgroundColor: '#0D7A57',
                                                                color: 'white',
                                                                border: 'none',
                                                                padding: '6px 14px',
                                                                borderRadius: '10px',
                                                                fontWeight: '800',
                                                                fontSize: '0.78rem',
                                                                cursor: savingPreference ? 'wait' : 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)',
                                                                transition: 'all 0.2s'
                                                            }}
                                                            onMouseOver={e => e.currentTarget.style.backgroundColor = '#0A5F43'}
                                                            onMouseOut={e => e.currentTarget.style.backgroundColor = '#0D7A57'}
                                                            title="Actualiza la regla fija con la combinación actualmente seleccionada"
                                                        >
                                                            <RefreshCw size={13} /> Actualizar regla fija
                                                        </button>
                                                        <button
                                                            type="button"
                                                            id="btn-clear-preference"
                                                            onClick={() => handleSaveCustomerOptionPreference(selectedProductForModal.id, {}, true)}
                                                            disabled={savingPreference}
                                                            style={{
                                                                backgroundColor: 'white',
                                                                color: '#DC2626',
                                                                border: '1px solid #FECACA',
                                                                padding: '5px 10px',
                                                                borderRadius: '10px',
                                                                fontWeight: '700',
                                                                fontSize: '0.75rem',
                                                                cursor: savingPreference ? 'wait' : 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                transition: 'all 0.2s'
                                                            }}
                                                            onMouseOver={e => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                                                            onMouseOut={e => e.currentTarget.style.backgroundColor = 'white'}
                                                            title="Eliminar regla fija para volver a la configuración estándar"
                                                        >
                                                            <X size={13} /> Desfijar
                                                        </button>
                                                    </div>
                                                ) : hasClientNote ? (
                                                    <button
                                                        type="button"
                                                        id="btn-pin-preference"
                                                        onClick={() => handleSaveCustomerOptionPreference(selectedProductForModal.id, selectedOptions, false)}
                                                        disabled={savingPreference}
                                                        style={{
                                                            backgroundColor: '#0D7A57',
                                                            color: 'white',
                                                            border: 'none',
                                                            padding: '8px 18px',
                                                            borderRadius: '12px',
                                                            fontWeight: '800',
                                                            fontSize: '0.84rem',
                                                            cursor: savingPreference ? 'wait' : 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            boxShadow: '0 4px 14px rgba(13, 122, 87, 0.35)',
                                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                                        }}
                                                        onMouseOver={e => {
                                                            e.currentTarget.style.backgroundColor = '#0A5F43';
                                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                                        }}
                                                        onMouseOut={e => {
                                                            e.currentTarget.style.backgroundColor = '#0D7A57';
                                                            e.currentTarget.style.transform = 'translateY(0)';
                                                        }}
                                                    >
                                                        <Pin size={14} /> Fijar combinación para {clientDisplayName.split(' ')[0]}
                                                    </button>
                                                ) : null
                                            )}

                                            {/* Cantidad Mínima Prominente */}
                                            {hasSpecialMinSale && (
                                                <div style={{
                                                    backgroundColor: '#FFFBEB',
                                                    color: '#92400E',
                                                    border: '1.5px solid #F59E0B',
                                                    boxShadow: '0 2px 6px rgba(245, 158, 11, 0.15)',
                                                    padding: '6px 14px',
                                                    borderRadius: '10px',
                                                    fontSize: '0.82rem',
                                                    fontWeight: '800',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}>
                                                    <Info size={16} style={{ color: '#D97706', flexShrink: 0 }} />
                                                    <span>Mínimo: <strong style={{ color: '#78350F' }}>{formatWeightKg(minSaleLimitKg)} kg</strong></span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}


                            {/* DISCRETE PRODUCT CONFIG ACTION BAR */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'center',
                                gap: '12px',
                                fontSize: '0.75rem',
                                color: '#9CA3AF',
                                marginBottom: '1.5rem',
                                fontWeight: '700'
                            }}>
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => setVariantConfigProduct(selectedProductForModal)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#4B5563',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        padding: 0,
                                        fontSize: 'inherit',
                                        textDecoration: 'underline',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Settings size={12} strokeWidth={2} /> Editar Variantes
                                </button>
                                <span>|</span>
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => setManageConversionsProduct(selectedProductForModal)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#4B5563',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        padding: 0,
                                        fontSize: 'inherit',
                                        textDecoration: 'underline',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <RefreshCw size={12} strokeWidth={2} /> Editar Equivalencias
                                </button>
                            </div>

                            {/* RENDER OPTIONS DYNAMICALLY */}
                            {normalizedOptionsConfig && normalizedOptionsConfig.map((opt: any, index: number) => {
                                const isPresentation = opt.name.toLowerCase().includes('presentaci') || opt.name.toLowerCase().includes('unidad');
                                const baseUnitLower = (selectedProductForModal.unit_of_measure || 'Kg').toLowerCase();
                                const isKg = baseUnitLower === 'kg' || baseUnitLower === 'kilo' || baseUnitLower === 'kilogramo';
                                const defaultVal = isPresentation && isKg ? 'Kg' : (isPresentation ? opt.values?.[0] || '' : '');
                                const selectVal = selectedOptions[opt.name] !== undefined && selectedOptions[opt.name] !== '' ? selectedOptions[opt.name] : defaultVal;

                                return (
                                <div key={opt.name} style={{ marginBottom: '1.2rem', textAlign: 'left' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {opt.name}
                                    </label>
                                    <select
                                        id={`modal-select-${index}`}
                                        ref={index === 0 ? firstSelectRef : undefined}
                                        value={selectVal}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setSelectedOptions(prev => ({ ...prev, [opt.name]: val }));
                                            
                                            if (opt.name.toLowerCase().includes('presentaci') || opt.name.toLowerCase().includes('unidad')) {
                                                const cleanUnit = val.includes('|') ? val.split('|')[0] : val;
                                                const defaultUnit = selectedProductForModal.unit_of_measure || 'Kg';
                                                const isKgSel = cleanUnit.toLowerCase() === 'kg' || cleanUnit.toLowerCase() === 'kilo' || cleanUnit.toLowerCase() === defaultUnit.toLowerCase();
                                                if (isKgSel) {
                                                    setModalUnit('Kg');
                                                    setModalFactor(1);
                                                } else {
                                                    const matchedUnit = optionsList.find(o => o.unit.toLowerCase() === cleanUnit.toLowerCase());
                                                    if (matchedUnit) {
                                                        setModalUnit(matchedUnit.unit);
                                                        setModalFactor(matchedUnit.factor);
                                                    } else {
                                                        const parsedWeight = getParsedWeight(cleanUnit);
                                                        if (parsedWeight !== null) {
                                                            setModalUnit(cleanUnit);
                                                            setModalFactor(parsedWeight);
                                                        }
                                                    }
                                                }
                                            }
                                        }}
                                        onKeyDown={(e) => handleSelectKeyDown(e, index, normalizedOptionsConfig.length)}
                                        style={{
                                            width: '100%',
                                            padding: '0.8rem',
                                            border: '2px solid #E2E8F0',
                                            borderRadius: '10px',
                                            fontSize: '1rem',
                                            backgroundColor: '#F9FAFB',
                                            outline: 'none',
                                            transition: 'all 0.2s ease-in-out'
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = '#3B82F6';
                                            e.target.style.backgroundColor = 'white';
                                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.15)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = '#E2E8F0';
                                            e.target.style.backgroundColor = '#F9FAFB';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    >
                                        {!isPresentation && <option value="">Seleccionar {opt.name}...</option>}
                                        {opt.values?.map((val: string) => {
                                            const displayVal = val.includes('|') 
                                                ? `${val.split('|')[0]} (${val.split('|')[1]} gr)` 
                                                : val;
                                            return (
                                                <option key={val} value={val}>{displayVal}</option>
                                            );
                                        })}
                                    </select>
                                </div>
                            );
                            })}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', margin: '1.5rem 0', textAlign: 'left' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                                            Cantidad
                                        </label>
                                        {hasSpecialMinSale && (
                                            <span style={{
                                                backgroundColor: '#FFFBEB',
                                                color: '#B45309',
                                                border: '1px solid #FDE68A',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                fontSize: '0.72rem',
                                                fontWeight: '800',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}>
                                                <Info size={12} style={{ color: '#D97706' }} />
                                                Mín. {formatWeightKg(minSaleLimitKg)} kg
                                            </span>
                                        )}
                                    </div>
                                    <input
                                        id="modal-qty-input"
                                        autoComplete="off"
                                        type="text"
                                        value={modalQuantity}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9.,+\-*/()=xX ]/g, '');
                                            setModalQuantity(val);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                const evaluated = evaluateMathExpression(modalQuantity);
                                                const finalVal = evaluated > 0 ? String(evaluated) : '1';
                                                setModalQuantity(finalVal);
                                                const unitSel = document.getElementById('modal-unit-select');
                                                if (unitSel) {
                                                    unitSel.focus();
                                                } else {
                                                    confirmModalAdd();
                                                }
                                            } else if (e.key === 'Tab' && !e.shiftKey) {
                                                e.preventDefault();
                                                const evaluated = evaluateMathExpression(modalQuantity);
                                                const finalVal = evaluated > 0 ? String(evaluated) : '1';
                                                setModalQuantity(finalVal);
                                                const unitSel = document.getElementById('modal-unit-select');
                                                if (unitSel) {
                                                    unitSel.focus();
                                                } else {
                                                    const confirmBtn = document.getElementById('modal-confirm-btn');
                                                    if (confirmBtn) confirmBtn.focus();
                                                }
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '0.7rem 0.8rem',
                                            borderRadius: '10px',
                                            border: '2px solid #E2E8F0',
                                            fontWeight: '700',
                                            fontSize: '1.1rem',
                                            textAlign: 'center',
                                            outline: 'none',
                                            transition: 'all 0.2s ease-in-out'
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = '#3B82F6';
                                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.15)';
                                            e.target.select();
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = '#E2E8F0';
                                            e.target.style.boxShadow = 'none';
                                            const evaluated = evaluateMathExpression(modalQuantity);
                                            const finalVal = evaluated > 0 ? String(evaluated) : '1';
                                            setModalQuantity(finalVal);
                                        }}
                                    />
                                </div>

                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                                            Unidad de Medida
                                        </label>
                                        {parsedModalQty > 0 && dynamicUnitFactor > 0 && (
                                            <span style={{
                                                backgroundColor: '#ECFDF5',
                                                color: '#065F46',
                                                border: '1px solid #A7F3D0',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                fontSize: '0.75rem',
                                                fontWeight: '800',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                            }}>
                                                <Scale size={13} style={{ color: '#059669' }} />
                                                <span>Total: {formatWeightKg(calculatedTotalKg)} kg</span>
                                            </span>
                                        )}
                                    </div>
                                    {optionsList.length > 1 ? (
                                        <select
                                            id="modal-unit-select"
                                            tabIndex={-1}
                                            value={modalUnit}
                                            onChange={(e) => {
                                                const selected = e.target.value;
                                                setModalUnit(selected);
                                                const matched = optionsList.find(o => o.unit === selected);
                                                if (matched) {
                                                    setModalFactor(matched.factor);
                                                }
                                                
                                                // Sincronización inversa de UNIDAD DE MEDIDA -> PRESENTACIÓN
                                                normalizedOptionsConfig.forEach((opt: any) => {
                                                    if (opt.name.toLowerCase().includes('presentaci')) {
                                                        const matchedValue = opt.values.find((val: string) => {
                                                            const cleanVal = val.includes('|') ? val.split('|')[0] : val;
                                                            return cleanVal.toLowerCase() === selected.toLowerCase();
                                                        });
                                                        if (matchedValue) {
                                                            setSelectedOptions(prev => ({ ...prev, [opt.name]: matchedValue }));
                                                        } else {
                                                            const defaultUnit = selectedProductForModal.unit_of_measure || 'Kg';
                                                            if (selected.toLowerCase() === defaultUnit.toLowerCase()) {
                                                                const matchedDefault = opt.values.find((val: string) => {
                                                                    const cleanVal = val.includes('|') ? val.split('|')[0] : val;
                                                                    return cleanVal.toLowerCase() === defaultUnit.toLowerCase();
                                                                });
                                                                if (matchedDefault) {
                                                                    setSelectedOptions(prev => ({ ...prev, [opt.name]: matchedDefault }));
                                                                }
                                                            } else {
                                                                setSelectedOptions(prev => ({ ...prev, [opt.name]: '' }));
                                                            }
                                                        }
                                                    }
                                                });
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    confirmModalAdd();
                                                }
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '0.7rem 0.8rem',
                                                borderRadius: '10px',
                                                border: '2px solid #E2E8F0',
                                                fontWeight: '700',
                                                fontSize: '1.1rem',
                                                backgroundColor: '#F9FAFB',
                                                outline: 'none',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease-in-out'
                                            }}
                                            onFocus={(e) => {
                                                e.target.style.borderColor = '#3B82F6';
                                                e.target.style.backgroundColor = 'white';
                                                e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.15)';
                                            }}
                                            onBlur={(e) => {
                                                e.target.style.borderColor = '#E2E8F0';
                                                e.target.style.backgroundColor = '#F9FAFB';
                                                e.target.style.boxShadow = 'none';
                                            }}
                                        >
                                            {optionsList.map(o => (
                                                <option key={o.unit} value={o.unit}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            readOnly
                                            tabIndex={-1}
                                            type="text"
                                            value={dynamicUnitLabel}
                                            style={{
                                                width: '100%',
                                                padding: '0.7rem 0.8rem',
                                                borderRadius: '10px',
                                                border: '2px solid #E2E8F0',
                                                fontWeight: '700',
                                                fontSize: '1.1rem',
                                                backgroundColor: '#F3F4F6',
                                                color: '#1E293B',
                                                textAlign: 'center',
                                                outline: 'none'
                                            }}
                                        />
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginTop: '2rem' }}>
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => closeProductModal()}
                                    style={{ width: '120px', padding: '0.65rem', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: 'white', fontWeight: '600', fontSize: '0.9rem', color: '#6B7280', cursor: 'pointer', outline: 'none', transition: 'all 0.2s ease-in-out' }}
                                    onFocus={(e) => {
                                        e.target.style.borderColor = '#3B82F6';
                                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.25)';
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.borderColor = '#D1D5DB';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    id="modal-confirm-btn"
                                    type="button"
                                    tabIndex={0}
                                    onClick={confirmModalAdd}
                                    style={{ flex: 1, padding: '0.9rem', borderRadius: '10px', border: 'none', backgroundColor: '#059669', color: 'white', fontWeight: '700', fontSize: '1rem', cursor: 'pointer', outline: 'none', transition: 'all 0.2s ease-in-out' }}
                                    onFocus={(e) => {
                                        e.target.style.backgroundColor = '#047857';
                                        e.target.style.boxShadow = '0 0 0 3px rgba(5, 150, 105, 0.4)';
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.backgroundColor = '#059669';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                >
                                    Agregar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* --- CONVERSIONS MANAGEMENT MODAL --- */}
            {manageConversionsProduct && (() => {
                const productConvs = conversions.filter(c => c.product_id === manageConversionsProduct.id);
                const DYNAMIC_UNITS = [
                    'Unidad', 'Lata', 'Bandeja', 'Atado', 'Malla', 'Caja', 'Bolsa', 
                    'Saco', 'Canastilla', 'Libras', 'Gramos', 'Kilos', 'Paquete', 'Bloque'
                ];

                const handleDelete = async (id: string) => {
                    const { error } = await supabase
                        .from('product_conversions')
                        .delete()
                        .eq('id', id);
                    if (!error) {
                        setConversions(prev => prev.filter(c => c.id !== id));
                    }
                };

                const handleAdd = async () => {
                    const qty1Input = document.getElementById('new-conv-qty-1') as HTMLInputElement;
                    const unit1Input = document.getElementById('new-conv-unit-1') as HTMLSelectElement;
                    const qty2Input = document.getElementById('new-conv-qty-2') as HTMLInputElement;

                    if (!qty1Input || !unit1Input || !qty2Input) return;

                    const qty1 = parseFloat(qty1Input.value);
                    const unit1 = unit1Input.value;
                    const qty2 = parseFloat(qty2Input.value);

                    if (!unit1) {
                        alert('Por favor, selecciona una unidad de origen.');
                        return;
                    }
                    if (isNaN(qty1) || qty1 <= 0 || isNaN(qty2) || qty2 <= 0) {
                        alert('Las cantidades deben ser válidas y mayores a cero.');
                        return;
                    }

                    const factor = qty2 / qty1;

                    const { data, error } = await supabase
                        .from('product_conversions')
                        .insert([{
                            product_id: manageConversionsProduct.id,
                            from_unit: unit1,
                            to_unit: manageConversionsProduct.unit_of_measure || 'Kg',
                            conversion_factor: factor
                        }])
                        .select();

                    if (!error && data && data.length > 0) {
                        setConversions(prev => [...prev, data[0]]);
                        qty1Input.value = '1';
                        unit1Input.value = '';
                        qty2Input.value = '';
                    } else {
                        alert('Ocurrió un error al guardar la equivalencia.');
                    }
                };

                return (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 25000, backdropFilter: 'blur(3px)'
                    }} onClick={() => setManageConversionsProduct(null)}>

                        <div
                            style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '24px', width: '95%', maxWidth: '550px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', textAlign: 'center' }}
                            onClick={e => e.stopPropagation()} // Prevent close
                        >
                            <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                                <div style={{ textAlign: 'left' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Scale size={20} color="#111827" /> Equivalencias y Conversiones
                                    </h3>
                                    <span style={{ fontSize: '0.85rem', color: '#6B7280', fontWeight: '600' }}>
                                        {manageConversionsProduct.name}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setManageConversionsProduct(null)}
                                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex', alignItems: 'center' }}
                                >
                                    <X size={20} />
                                </button>
                            </header>

                            {/* SECCIÓN DE UNIDAD BASE */}
                            <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid #E2E8F0', textAlign: 'left' }}>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Unidad de Inventario (Base)
                                </label>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <div style={{ 
                                        padding: '0.5rem 1.25rem', 
                                        backgroundColor: '#EFF6FF', 
                                        border: '1px solid #BFDBFE', 
                                        borderRadius: '8px', 
                                        fontSize: '0.9rem', 
                                        fontWeight: '800', 
                                        color: '#1D4ED8',
                                        minWidth: '100px',
                                        textAlign: 'center'
                                    }}>
                                        {manageConversionsProduct.unit_of_measure}
                                    </div>
                                    <div style={{ flex: 1, fontSize: '0.75rem', color: '#6B7280', lineHeight: '1.4' }}>
                                        Unidad base configurada para este SKU. Todas las equivalencias ingresadas abajo se convertirán a esta unidad base para el stock.
                                    </div>
                                </div>
                            </div>

                            {/* EQUIVALENCIAS EXISTENTES */}
                            <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
                                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '800' }}>
                                    Equivalencias de Compra
                                </h4>
                                {productConvs.length === 0 ? (
                                    <div style={{ fontSize: '0.85rem', color: '#6B7280', textAlign: 'center', padding: '1rem', border: '1px dashed #D1D5DB', borderRadius: '12px' }}>
                                        Solo se opera en {manageConversionsProduct.unit_of_measure}.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {productConvs.map(c => (
                                            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                                                    <span style={{ fontWeight: '700', color: '#1F2937' }}>1 {c.from_unit}</span>
                                                    <span style={{ color: '#9CA3AF' }}>=</span>
                                                    <span style={{ fontWeight: '700', color: '#10B981' }}>{c.conversion_factor} {manageConversionsProduct.unit_of_measure}</span>
                                                </div>
                                                <button 
                                                    onClick={() => handleDelete(c.id)} 
                                                    style={{ color: '#EF4444', background: '#FEF2F2', border: '1px solid #FECACA', padding: '4px 10px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.75rem', transition: 'all 0.15s' }}
                                                >
                                                    Eliminar
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* AGREGAR NUEVA RELACIÓN */}
                            <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '1.25rem', textAlign: 'left' }}>
                                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '800', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                    <Plus size={14} /> DEFINIR NUEVA RELACIÓN
                                </h4>
                                
                                <div style={{ 
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    gap: '8px', 
                                    backgroundColor: '#F0FDF4', 
                                    padding: '1.2rem', 
                                    borderRadius: '12px',
                                    border: '1px solid #DCFCE7'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ flex: 1 }}>
                                            <input 
                                                id="new-conv-qty-1" 
                                                type="number" 
                                                defaultValue="1" 
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                                                        e.preventDefault();
                                                        document.getElementById('new-conv-unit-1')?.focus();
                                                    }
                                                }}
                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700', textAlign: 'center', fontSize: '0.9rem' }} 
                                            />
                                        </div>
                                        <div style={{ flex: 2 }}>
                                            <select 
                                                id="new-conv-unit-1" 
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === 'ArrowRight') {
                                                        e.preventDefault();
                                                        const qty2 = document.getElementById('new-conv-qty-2');
                                                        if (qty2) {
                                                            qty2.focus();
                                                            (qty2 as HTMLInputElement).select();
                                                        }
                                                    } else if (e.key === 'ArrowLeft') {
                                                        e.preventDefault();
                                                        document.getElementById('new-conv-qty-1')?.focus();
                                                    }
                                                }}
                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700', backgroundColor: 'white', fontSize: '0.9rem' }}
                                            >
                                                <option value="">Selecciona unidad</option>
                                                {DYNAMIC_UNITS.map(u => (
                                                    <option key={u} value={u}>{u}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ textAlign: 'center', color: '#15803D', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                        EQUIVALE A
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ flex: 1 }}>
                                            <input 
                                                id="new-conv-qty-2" 
                                                type="number" 
                                                placeholder="Ej: 0.3" 
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleAdd();
                                                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                                                        e.preventDefault();
                                                        document.getElementById('new-conv-unit-1')?.focus();
                                                    }
                                                }}
                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700', textAlign: 'center', fontSize: '0.9rem' }} 
                                            />
                                        </div>
                                        <div style={{ flex: 2 }}>
                                            <div style={{ width: '100%', padding: '0.5rem', backgroundColor: '#FFFFFF', border: '1px solid #D1D5DB', borderRadius: '8px', fontWeight: '800', textAlign: 'center', color: '#15803D', fontSize: '0.9rem' }}>
                                                {manageConversionsProduct.unit_of_measure}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    onClick={handleAdd} 
                                    style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', borderRadius: '10px', border: 'none', backgroundColor: '#059669', color: 'white', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.15s' }}
                                >
                                    Vincular Unidades
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {variantConfigProduct && (
                <VariantModal
                    product={variantConfigProduct}
                    onClose={() => setVariantConfigProduct(null)}
                    onSave={async (optionsConfig, variants) => {
                        const success = await handleSaveVariantsFromOrder(variantConfigProduct.id, optionsConfig, variants);
                        if (success) {
                            setProducts(prev => prev.map(p => 
                                p.id === variantConfigProduct.id 
                                    ? { ...p, options_config: optionsConfig, variants: variants } 
                                    : p
                            ));
                            setSelectedProductForModal(prev => {
                                if (prev && prev.id === variantConfigProduct.id) {
                                    return { ...prev, options_config: optionsConfig, variants: variants };
                                }
                                return prev;
                            });
                            showToast('Variantes del producto actualizadas', 'success');
                        }
                        return success;
                    }}
                    onUploadImage={handleVariantImageUploadFromOrder}
                    readOnly={false}
                />
            )}

            {/* MAP PICKER MODAL */}
            {showMapPicker && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: 9999, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: '2rem',
                    backdropFilter: 'blur(8px)'
                }}>
                    <div style={{
                        width: '100%', maxWidth: '1000px', height: '85vh', backgroundColor: 'white',
                        borderRadius: '32px', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}>
                        <div style={{ 
                            padding: '1.5rem 2rem', 
                            borderBottom: '1px solid #E5E7EB', 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            backgroundColor: 'white'
                        }}>
                            <div>
                                <h3 style={{ 
                                    margin: 0, 
                                    fontWeight: '900', 
                                    fontSize: '1.4rem',
                                    color: '#111827',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}>
                                    <MapPin size={24} color="#10B981" /> Selecciona y Valida la Ubicación
                                </h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#6B7280', fontWeight: '500' }}>
                                    Mueve el mapa o haz clic para ajustar el pin en la dirección exacta de entrega.
                                </p>
                            </div>
                            <button 
                                onClick={() => setShowMapPicker(false)}
                                style={{ 
                                    padding: '0.5rem 1rem', 
                                    borderRadius: '12px', 
                                    cursor: 'pointer', 
                                    fontWeight: '800',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '0.85rem',
                                    background: '#F3F4F6',
                                    border: '1px solid #E5E7EB',
                                    color: '#374151'
                                }}
                            >
                                <X size={18} /> Cerrar
                            </button>
                        </div>
                        
                        <div style={{ flex: 1, position: 'relative' }}>
                            <GoogleMapComponent
                                defaultCenter={{ lat: latitude || 4.6097, lng: longitude || -74.0817 }} // Bogota o actual
                                defaultZoom={15}
                                mapId="DEMO_MAP_ID"
                                gestureHandling="greedy"
                                onClick={(e) => {
                                    const lat = e.detail?.latLng?.lat;
                                    const lng = e.detail?.latLng?.lng;
                                    if (lat && lng) {
                                        setLatitude(lat);
                                        setLongitude(lng);
                                    }
                                }}
                            >
                                {latitude && longitude && (
                                    <Marker 
                                        position={{ lat: latitude, lng: longitude }} 
                                        draggable={true}
                                        onDragEnd={(e) => {
                                            const lat = e.latLng?.lat();
                                            const lng = e.latLng?.lng();
                                            if (lat && lng) {
                                                setLatitude(lat);
                                                setLongitude(lng);
                                            }
                                        }}
                                    />
                                )}
                            </GoogleMapComponent>
                        </div>


                        <div style={{ padding: '1.5rem 2rem', backgroundColor: '#F9FAFB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E5E7EB' }}>
                            <div>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ESTADO DE COBERTURA</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                    {outOfZone ? (
                                        <>
                                            <X size={18} color="#DC2626" />
                                            <span style={{ fontSize: '0.9rem', color: '#DC2626', fontWeight: '700' }}>Fuera de Zona de Cobertura</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 size={18} color="#166534" />
                                            <span style={{ fontSize: '0.9rem', color: '#166534', fontWeight: '700' }}>Dentro de Zona Permitida</span>
                                        </>
                                    )}
                                    <span style={{ fontSize: '0.85rem', color: '#6B7280', fontFamily: 'monospace', marginLeft: '10px' }}>
                                        ({latitude?.toFixed(5)}, {longitude?.toFixed(5)})
                                    </span>
                                </div>
                            </div>

                            {/* DECISION CENTER */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                {!outOfZone ? (
                                    <button 
                                        onClick={async () => {
                                            if (clientType === 'B2C' && b2cMode === 'new') {
                                                if (!guestInfo.name || !guestInfo.phone) {
                                                    showToast('Por favor asegúrate de haber ingresado el Nombre y Teléfono del cliente en el formulario antes de confirmar la ubicación.');
                                                    return;
                                                }
                                                const newProfileId = crypto.randomUUID();
                                                const { error: profileError } = await supabase
                                                    .from('profiles')
                                                    .insert({
                                                        id: newProfileId,
                                                        role: draftClientType === 'b2b_client' ? 'b2b_client' : 'b2c_client',
                                                        contact_name: guestInfo.name,
                                                        contact_phone: guestInfo.phone,
                                                        phone: guestInfo.phone,
                                                        address: guestInfo.address,
                                                        city: guestInfo.city,
                                                        company_name: guestInfo.name,
                                                        latitude: latitude,
                                                        longitude: longitude,
                                                        delivery_restrictions: null,
                                                        geocoding_status: 'VALID',
                                                        created_at: new Date().toISOString(),
                                                        email: guestInfo.email || null,
                                                        nit: guestInfo.nit || null
                                                    });

                                                if (profileError) {
                                                    console.error('Error guardando cliente en BD:', profileError);
                                                    showToast('Hubo un error al guardar el cliente en la base de datos.', 'error');
                                                    return;
                                                }
                                                setCreatedB2CProfileId(newProfileId);
                                                showToast(`🌟 ${draftClientType === 'b2b_client' ? 'Cliente Institucional' : 'Cliente Hogar'} Creado Exitosamente. El perfil de ${guestInfo.name} se ha guardado en la base de datos con ubicación verificada. Ya puedes agregar productos y completar su pedido cuando desees.`, 'success');
                                            }
                                            setShowMapPicker(false);
                                        }}
                                        style={{ 
                                            padding: '1rem 2.5rem', 
                                            borderRadius: '99px', 
                                            fontWeight: '900',
                                            fontSize: '1rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            backgroundColor: '#10B981',
                                            color: 'white',
                                            border: 'none',
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                                        }}
                                    >
                                        <CheckCircle2 size={20} /> Confirmar Ubicación
                                    </button>
                                ) : isOverrideMode ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '6px', borderRadius: '99px', border: '1px solid #F59E0B', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)' }}>
                                        <input 
                                            type="text" 
                                            placeholder="Motivo (Ej: Cliente VIP, Flete extra)..."
                                            value={coverageOverrideReason}
                                            onChange={e => setCoverageOverrideReason(e.target.value)}
                                            autoFocus
                                            style={{ border: 'none', outline: 'none', padding: '0.5rem 1rem', fontSize: '0.9rem', width: '220px', background: 'transparent', fontWeight: '600', color: '#92400E' }}
                                        />
                                        <button 
                                            onClick={async () => {
                                                if (!coverageOverrideReason.trim()) return showToast('Por favor ingresa el motivo de la excepción.');
                                                if (clientType === 'B2C' && b2cMode === 'new') {
                                                    if (!guestInfo.name || !guestInfo.phone) {
                                                        showToast('Por favor asegúrate de haber ingresado el Nombre y Teléfono del cliente en el formulario antes de autorizar la excepción.');
                                                        return;
                                                    }
                                                    const newProfileId = crypto.randomUUID();
                                                    const { error: profileError } = await supabase
                                                        .from('profiles')
                                                        .insert({
                                                            id: newProfileId,
                                                            role: draftClientType === 'b2b_client' ? 'b2b_client' : 'b2c_client',
                                                            contact_name: guestInfo.name,
                                                            contact_phone: guestInfo.phone,
                                                            phone: guestInfo.phone,
                                                            address: guestInfo.address,
                                                            city: guestInfo.city,
                                                            company_name: guestInfo.name,
                                                            latitude: latitude,
                                                            longitude: longitude,
                                                            delivery_restrictions: `EXCEPCIÓN AUTORIZADA: ${coverageOverrideReason}`,
                                                            geocoding_status: 'OVERRIDE',
                                                            created_at: new Date().toISOString(),
                                                            email: guestInfo.email || null,
                                                            nit: guestInfo.nit || null,
                                                            is_active: guestInfo.saveToDirectory
                                                        });

                                                    if (profileError) {
                                                        console.error('Error guardando cliente en BD:', profileError);
                                                        showToast('Hubo un error al guardar el cliente en la base de datos.', 'error');
                                                        return;
                                                    }
                                                    setCreatedB2CProfileId(newProfileId);
                                                }
                                                setHasCoverageOverride(true);
                                                setShowMapPicker(false);
                                                showToast(`🌟 Excepción Autorizada y ${draftClientType === 'b2b_client' ? 'Cliente Institucional' : 'Cliente'} Guardado. El perfil de ${guestInfo.name} se ha guardado exitosamente con Excepción Permanente. Ya puedes agregar productos y completar su pedido cuando desees.`, 'success');
                                            }}
                                            style={{ padding: '0.6rem 1.5rem', borderRadius: '99px', border: 'none', background: '#F59E0B', color: 'white', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}
                                        >
                                            <CheckCircle2 size={16} /> Confirmar Excepción
                                        </button>
                                        <button 
                                            onClick={() => setIsOverrideMode(false)}
                                            style={{ padding: '0.6rem 1rem', borderRadius: '99px', border: 'none', background: '#F3F4F6', color: '#4B5563', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' }}
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <button 
                                            onClick={() => {
                                                setLatitude(null);
                                                setLongitude(null);
                                                setOutOfZone(false);
                                                setHasCoverageOverride(false);
                                                setCoverageOverrideReason('');
                                                setShowMapPicker(false);
                                                showToast('❌ Dirección Rechazada por Fuera de Cobertura. Se ha limpiado la ubicación del pedido.', 'error');
                                            }}
                                            style={{ 
                                                padding: '0.8rem 1.5rem', 
                                                borderRadius: '99px', 
                                                fontWeight: '800',
                                                fontSize: '0.9rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                backgroundColor: '#F3F4F6',
                                                color: '#DC2626',
                                                border: '1px solid #FECACA',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <X size={18} /> Rechazar Dirección
                                        </button>
                                        <button 
                                            onClick={() => setIsOverrideMode(true)}
                                            style={{ 
                                                padding: '0.8rem 1.8rem', 
                                                borderRadius: '99px', 
                                                fontWeight: '900',
                                                fontSize: '0.9rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                backgroundColor: '#F59E0B',
                                                color: 'white',
                                                border: 'none',
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)'
                                            }}
                                        >
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} strokeWidth={1.5} /> Autorizar Excepción</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {deleteConfirm && deleteConfirm.isOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 11000
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '20px',
                        padding: '2rem',
                        width: '90%',
                        maxWidth: '400px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            backgroundColor: '#FEF2F2',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1.5rem',
                            color: '#EF4444'
                        }}>
                            <AlertTriangle size={28} />
                        </div>
                        <h3 style={{
                            fontSize: '1.25rem',
                            fontWeight: 800,
                            color: '#111827',
                            margin: '0 0 0.5rem 0'
                        }}>
                            ¿Eliminar producto?
                        </h3>
                        <p style={{
                            fontSize: '0.9rem',
                            color: '#6B7280',
                            margin: '0 0 1.5rem 0',
                            lineHeight: '1.5'
                        }}>
                            ¿Estás seguro de que deseas eliminar <strong>{deleteConfirm.productName}</strong> del pedido?
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                style={{
                                    flex: 1,
                                    padding: '0.75rem 1.5rem',
                                    backgroundColor: '#F3F4F6',
                                    border: 'none',
                                    borderRadius: '12px',
                                    fontWeight: 700,
                                    color: '#4B5563',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    deleteConfirm.onConfirm();
                                    setDeleteConfirm(null);
                                }}
                                style={{
                                    flex: 1,
                                    padding: '0.75rem 1.5rem',
                                    backgroundColor: '#EF4444',
                                    border: 'none',
                                    borderRadius: '12px',
                                    fontWeight: 700,
                                    color: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {duplicateConfirm && duplicateConfirm.isOpen && (() => {
                const existingItem = cart[duplicateConfirm.existingIndex];
                const currentQty = existingItem ? (existingItem.originalQty !== undefined ? existingItem.originalQty : existingItem.qty) : (duplicateConfirm.existingQty || 0);
                const addedNum = duplicateConfirm.qty || 0;
                const newTotal = parseFloat((currentQty + addedNum).toFixed(3));
                const unitStr = duplicateConfirm.unit || duplicateConfirm.product?.unit_of_measure || 'Kg';

                return (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.45)',
                        backdropFilter: 'blur(5px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 11000
                    }}>
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: '24px',
                            padding: '2rem',
                            width: '90%',
                            maxWidth: '460px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            textAlign: 'center'
                        }}>
                            {/* Product Image / Icon */}
                            {duplicateConfirm.product.image_url ? (
                                <div style={{
                                    width: '80px',
                                    height: '80px',
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                    margin: '0 auto 1rem',
                                    boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
                                    border: '2px solid #F3F4F6'
                                }}>
                                    <img 
                                        src={duplicateConfirm.product.image_url} 
                                        alt={duplicateConfirm.product.name} 
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                </div>
                            ) : (
                                <div style={{
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '50%',
                                    backgroundColor: '#FEF3C7',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 1rem',
                                    color: '#D97706'
                                }}>
                                    <AlertTriangle size={28} />
                                </div>
                            )}

                            <h3 style={{
                                fontSize: '1.35rem',
                                fontWeight: 900,
                                color: '#111827',
                                margin: '0 0 0.25rem 0'
                            }}>
                                {duplicateConfirm.product.name}
                            </h3>
                            {duplicateConfirm.product.accounting_id && (
                                <div style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: '1.25rem', fontWeight: 600 }}>
                                    ID Contable: {duplicateConfirm.product.accounting_id}
                                </div>
                            )}

                            {/* Banner Alerta Insumo ya incluido */}
                            <div style={{
                                backgroundColor: '#FFFBEB',
                                border: '1.5px solid #FCD34D',
                                borderRadius: '14px',
                                padding: '0.9rem 1.1rem',
                                marginBottom: '1.5rem',
                                textAlign: 'left',
                                fontSize: '0.84rem',
                                color: '#92400E',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.12)'
                            }}>
                                <AlertTriangle size={20} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <div style={{ fontWeight: '900', fontSize: '0.88rem', color: '#B45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <ShoppingCart size={15} color="#B45309" /> Insumo ya incluido en tu pedido
                                    </div>
                                    <div style={{ marginTop: '4px', color: '#78350F', lineHeight: '1.4' }}>
                                        Ya tienes <strong style={{ color: '#B45309' }}>{currentQty} {unitStr}</strong> de {duplicateConfirm.product.name} en tu pedido.
                                    </div>
                                    <div style={{ marginTop: '8px', fontSize: '0.8rem', fontWeight: '800', color: '#065F46', backgroundColor: '#D1FAE5', border: '1px solid #A7F3D0', padding: '4px 10px', borderRadius: '8px', display: 'inline-block' }}>
                                        Al adicionar <strong>{addedNum} {unitStr}</strong> el nuevo total será <strong>{newTotal} {unitStr}</strong>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={handleMergeDuplicateItem}
                                    style={{
                                        width: '100%',
                                        padding: '0.85rem 1.5rem',
                                        backgroundColor: '#0D7A57',
                                        border: 'none',
                                        borderRadius: '12px',
                                        fontWeight: 800,
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    Sumar cantidad a la línea existente (Nuevo total: {newTotal} {unitStr})
                                </button>
                                <button
                                    type="button"
                                    onClick={handleKeepDuplicateAsSeparate}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem 1.5rem',
                                        backgroundColor: '#2563EB',
                                        border: 'none',
                                        borderRadius: '12px',
                                        fontWeight: 700,
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
                                    }}
                                >
                                    Agregar como una fila separada
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDuplicateConfirm(null)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem 1.5rem',
                                        backgroundColor: '#F3F4F6',
                                        border: 'none',
                                        borderRadius: '12px',
                                        fontWeight: 700,
                                        color: '#4B5563',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {duplicateStagedMatchConfirm && duplicateStagedMatchConfirm.isOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(17, 24, 39, 0.6)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 16000,
                    padding: '20px'
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        width: '90%',
                        maxWidth: '480px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                        padding: '24px',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            backgroundColor: '#FEF3C7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 16px',
                            color: '#D97706'
                        }}>
                            <AlertTriangle size={28} />
                        </div>
                        <h3 style={{
                            fontSize: '1.25rem',
                            fontWeight: 800,
                            color: '#111827',
                            margin: '0 0 8px 0'
                        }}>
                            Producto Duplicado Detectado
                        </h3>
                        <p style={{
                            fontSize: '0.9rem',
                            color: '#4B5563',
                            margin: '0 0 24px 0',
                            lineHeight: '1.6'
                        }}>
                            El producto <strong>{duplicateStagedMatchConfirm.product.name}</strong> 
                            {(() => {
                                const acctId = getAccountingIdDisplay(duplicateStagedMatchConfirm.product);
                                return acctId && acctId !== duplicateStagedMatchConfirm.product.id ? ` (ID Contable: ${acctId})` : '';
                            })()} 
                            ya está asignado a otra línea activa de este pedido. ¿Cómo deseas proceder?
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={handleMergeStagedDuplicateMatch}
                                style={{
                                    width: '100%',
                                    padding: '10px 16px',
                                    backgroundColor: '#10B981',
                                    border: 'none',
                                    borderRadius: '10px',
                                    fontWeight: 700,
                                    color: '#FFFFFF',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                                }}
                            >
                                Sumar y unificar cantidades
                            </button>
                            <button
                                type="button"
                                onClick={handleKeepBothStagedMatches}
                                style={{
                                    width: '100%',
                                    padding: '10px 16px',
                                    backgroundColor: '#2563EB',
                                    border: 'none',
                                    borderRadius: '10px',
                                    fontWeight: 700,
                                    color: '#FFFFFF',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
                                }}
                            >
                                Mantener filas separadas
                            </button>
                            <button
                                type="button"
                                onClick={handleCancelStagedDuplicate}
                                style={{
                                    width: '100%',
                                    padding: '10px 16px',
                                    backgroundColor: '#F3F4F6',
                                    border: 'none',
                                    borderRadius: '10px',
                                    fontWeight: 700,
                                    color: '#4B5563',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div style={{
                    position: 'fixed',
                    top: '20px',
                    right: '20px',
                    backgroundColor: toast.type === 'success' ? 'rgba(6, 78, 59, 0.95)' : toast.type === 'error' ? 'rgba(153, 27, 27, 0.95)' : 'rgba(30, 41, 59, 0.95)',
                    backdropFilter: 'blur(8px)',
                    color: 'white',
                    padding: '1rem 1.5rem',
                    borderRadius: '16px',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    zIndex: 99999,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    maxWidth: '400px',
                    animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                    border: `1px solid ${toast.type === 'success' ? '#059669' : toast.type === 'error' ? '#EF4444' : '#475569'}`
                }}>
                    <style>{`
                        @keyframes slideIn {
                            from { transform: translateY(-20px) scale(0.95); opacity: 0; }
                            to { transform: translateY(0) scale(1); opacity: 1; }
                        }
                    `}</style>
                    <div style={{ flexShrink: 0 }}>
                        {toast.type === 'success' && <Check size={20} />}
                        {toast.type === 'error' && <AlertTriangle size={20} />}
                        {toast.type === 'info' && <Info size={20} />}
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.4 }}>
                        {toast.message}
                    </div>
                    <button 
                        onClick={() => setToast(null)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255, 255, 255, 0.6)',
                            cursor: 'pointer',
                            marginLeft: 'auto',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Barra de resumen sticky inferior cuando la ventana flotante está activa */}
            {showFloatingDoc && (
                <div style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    width: isFloatingDocExpanded ? 'calc(100% - 998px)' : 'calc(100% - 598px)',
                    backgroundColor: 'white',
                    borderTop: '1px solid #E2E8F0',
                    boxShadow: '0 -10px 15px -3px rgba(0, 0, 0, 0.05), 0 -4px 6px -2px rgba(0, 0, 0, 0.05)',
                    padding: '1rem 2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    zIndex: 999,
                    transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxSizing: 'border-box'
                }}>
                    {/* Resumen del pedido */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Items</span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#1E293B' }}>{cart.length}</span>
                        </div>
                        <div style={{ height: '24px', width: '1px', backgroundColor: '#CBD5E1' }} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subtotal (Neto)</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#475569' }}>{formatMoney(calculateSubtotal())}</span>
                        </div>
                        <div style={{ height: '24px', width: '1px', backgroundColor: '#CBD5E1' }} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>IVA Estimado</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#475569' }}>{formatMoney(calculateTotalTax())}</span>
                        </div>
                        <div style={{ height: '24px', width: '1px', backgroundColor: '#CBD5E1' }} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total a Pagar</span>
                            <span style={{ fontSize: '1.5rem', fontWeight: 950, color: '#059669' }}>{formatMoney(calculateTotal())}</span>
                        </div>
                    </div>

                    {/* Acciones */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#94A3B8', maxWidth: '220px', textAlign: 'right', lineHeight: '1.3' }}>
                            El pedido se creará en estado &quot;Recibido&quot; para aprobación.
                        </span>
                        <button
                            onClick={handleSubmit}
                            disabled={loading || cart.length === 0}
                            style={{
                                padding: '0.75rem 2rem',
                                borderRadius: '12px',
                                backgroundColor: '#1E293B',
                                color: 'white',
                                border: 'none',
                                fontWeight: '800',
                                fontSize: '1rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                opacity: (loading || cart.length === 0) ? 0.5 : 1,
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                            }}
                            onMouseEnter={e => {
                                if (!loading && cart.length > 0) e.currentTarget.style.backgroundColor = '#0F172A';
                            }}
                            onMouseLeave={e => {
                                if (!loading && cart.length > 0) e.currentTarget.style.backgroundColor = '#1E293B';
                            }}
                        >
                            {loading ? 'Creando...' : 'Confirmar Pedido'}
                        </button>
                    </div>
                </div>
            )}

            {/* Ventana flotante premium con el documento original */}
            {showFloatingDoc && uploadedFileUrl && (
                <div style={{
                    position: 'fixed',
                    right: '24px',
                    top: '5vh',
                    width: isFloatingDocExpanded ? '950px' : '550px',
                    height: '90vh',
                    backgroundColor: 'white',
                    borderRadius: THEME.radius.xl,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
                    zIndex: 10000,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                }} onClick={e => e.stopPropagation()}>
                    <style>{`
                        @keyframes fadeInUp {
                            from { opacity: 0; transform: translateY(8px) scale(0.99); }
                            to { opacity: 1; transform: translateY(0) scale(1); }
                        }
                    `}</style>
                    {/* Header de la ventana flotante */}
                    <div style={{
                        padding: '12px 16px',
                        backgroundColor: '#F8FAFC',
                        borderBottom: '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileText size={16} color="#2563EB" />
                            <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1E293B' }}>
                                Documento Original ({importValidation.documentType || 'DOCUMENTO'})
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                                type="button"
                                onClick={() => setIsFloatingDocExpanded(prev => !prev)}
                                style={{
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    color: '#64748B',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'background-color 0.2s, color 0.2s',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.backgroundColor = '#EFF6FF';
                                    e.currentTarget.style.color = '#2563EB';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = '#64748B';
                                }}
                                title={isFloatingDocExpanded ? "Contraer visor" : "Expandir visor"}
                            >
                                {isFloatingDocExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                            </button>
                            
                            <button
                                type="button"
                                onClick={() => setShowFloatingDoc(false)}
                                style={{
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    color: '#64748B',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'background-color 0.2s, color 0.2s'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.backgroundColor = '#FEF2F2';
                                    e.currentTarget.style.color = '#EF4444';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = '#64748B';
                                }}
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Visor del Documento */}
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#F1F5F9' }}>
                        <iframe 
                            src={uploadedFileUrl} 
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title="Visor de Documento Original"
                        />
                    </div>
                </div>
            )}

            {/* Modal de Confirmación de Pedidos Relacionados Multi-Entrega */}
            {showMultiOrderModal && (() => {
                const group1 = stagedItems.filter(i => !i.deliverySchedule && i.suggestedProduct);
                const group2 = stagedItems.filter(i => i.deliverySchedule && i.suggestedProduct);
                const secondaryScheduleName = group2[0]?.deliverySchedule || 'Segunda Entrega';

                const clientDetails = getSelectedClientDetails();
                const clientName = clientDetails?.company_name || clientDetails?.contact_name || 'Cliente Institucional';

                const calcTotalGroup = (items: any[]) => {
                    return items.reduce((acc, it) => {
                        const price = (it.suggestedProduct?.id && contractPrices[it.suggestedProduct.id]) 
                            ? contractPrices[it.suggestedProduct.id] 
                            : (it.price || it.suggestedProduct?.base_price || 1000);
                        return acc + (price * it.quantity);
                    }, 0);
                };

                return (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.75)',
                        backdropFilter: 'blur(6px)',
                        zIndex: 99999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1.5rem'
                    }}>
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '24px',
                            maxWidth: '960px',
                            width: '100%',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            overflow: 'hidden'
                        }}>
                            {/* Modal Header */}
                            <div style={{
                                padding: '1.5rem 2rem',
                                borderBottom: '1px solid #E2E8F0',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                backgroundColor: '#F8FAFC'
                            }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ backgroundColor: '#FEF3C7', color: '#92400E', padding: '3px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>
                                            Multi-Entrega Inteligente
                                        </span>
                                        {importValidation?.poNumber && (
                                            <span style={{ backgroundColor: '#E0F2FE', color: '#0369A1', padding: '3px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '900' }}>
                                                OC: {importValidation.poNumber}
                                            </span>
                                        )}
                                    </div>
                                    <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0F172A', marginTop: '4px' }}>
                                        Crear 2 Pedidos Relacionados para {clientName}
                                    </h2>
                                    <p style={{ fontSize: '0.88rem', color: '#64748B', marginTop: '2px' }}>
                                        El documento solicita entregas en días diferentes. FruFresco creará dos pedidos independientes para garantizar el alistamiento y despacho correcto sin confusiones en bodega.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowMultiOrderModal(false)}
                                    style={{
                                        border: 'none',
                                        background: '#F1F5F9',
                                        color: '#64748B',
                                        borderRadius: '12px',
                                        width: '36px',
                                        height: '36px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Modal Body: Two Columns */}
                            <div style={{ padding: '1.5rem 2rem', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                {/* Order 1 Box */}
                                <div style={{
                                    border: '2px solid #E2E8F0',
                                    borderRadius: '18px',
                                    padding: '1.25rem',
                                    backgroundColor: '#FAFAFA',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                                            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#1E293B' }}>
                                                Pedido 1: Entrega Principal
                                            </h3>
                                        </div>
                                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#059669', backgroundColor: '#ECFDF5', padding: '2px 8px', borderRadius: '6px' }}>
                                            {group1.length} productos
                                        </span>
                                    </div>

                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '4px' }}>
                                            FECHA DE ENTREGA PEDIDO 1
                                        </label>
                                        <input
                                            type="date"
                                            value={multiOrderDate1}
                                            onChange={e => setMultiOrderDate1(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '8px 12px',
                                                borderRadius: '10px',
                                                border: '1.5px solid #CBD5E1',
                                                fontSize: '0.9rem',
                                                fontWeight: '700',
                                                color: '#1E293B',
                                                backgroundColor: '#FFFFFF'
                                            }}
                                        />
                                    </div>

                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>
                                        Productos a Alistar:
                                    </div>
                                    <div style={{ flex: 1, maxHeight: '240px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px', backgroundColor: '#FFFFFF', padding: '8px' }}>
                                        {group1.map((it, idx) => (
                                            <div key={it.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px', borderBottom: idx < group1.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                                                <div style={{ maxWidth: '70%' }}>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#1E293B' }}>{it.suggestedProduct?.name || it.originalName}</div>
                                                    {it.observations && (
                                                        <div style={{ fontSize: '0.7rem', color: '#64748B', fontStyle: 'italic' }}>📝 {it.observations}</div>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0F172A', whiteSpace: 'nowrap' }}>
                                                    {it.quantity} {it.originalUnit || it.suggestedProduct?.unit_of_measure}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: '600' }}>Subtotal estimado:</span>
                                        <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#1E293B' }}>{formatMoney(calcTotalGroup(group1))}</span>
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
                                        Nota: OC: {importValidation?.poNumber || 'S/N'} [Entrega 1/2 - Principal]
                                    </div>
                                </div>

                                {/* Order 2 Box */}
                                <div style={{
                                    border: '2px solid #FDE68A',
                                    borderRadius: '18px',
                                    padding: '1.25rem',
                                    backgroundColor: '#FFFDF5',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#F59E0B' }} />
                                            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#92400E' }}>
                                                Pedido 2: Entrega ({secondaryScheduleName})
                                            </h3>
                                        </div>
                                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#B45309', backgroundColor: '#FEF3C7', padding: '2px 8px', borderRadius: '6px' }}>
                                            {group2.length} productos
                                        </span>
                                    </div>

                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#92400E', display: 'block', marginBottom: '4px' }}>
                                            FECHA DE ENTREGA PEDIDO 2 (CALCULADA)
                                        </label>
                                        <input
                                            type="date"
                                            value={multiOrderDate2}
                                            onChange={e => setMultiOrderDate2(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '8px 12px',
                                                borderRadius: '10px',
                                                border: '1.5px solid #FCD34D',
                                                fontSize: '0.9rem',
                                                fontWeight: '700',
                                                color: '#78350F',
                                                backgroundColor: '#FFFFFF'
                                            }}
                                        />
                                    </div>

                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#92400E', textTransform: 'uppercase', marginBottom: '6px' }}>
                                        Productos a Alistar:
                                    </div>
                                    <div style={{ flex: 1, maxHeight: '240px', overflowY: 'auto', border: '1px solid #FDE68A', borderRadius: '10px', backgroundColor: '#FFFFFF', padding: '8px' }}>
                                        {group2.map((it, idx) => (
                                            <div key={it.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px', borderBottom: idx < group2.length - 1 ? '1px solid #FEF3C7' : 'none' }}>
                                                <div style={{ maxWidth: '70%' }}>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#1E293B' }}>{it.suggestedProduct?.name || it.originalName}</div>
                                                    {it.observations && (
                                                        <div style={{ fontSize: '0.7rem', color: '#B45309', fontWeight: '600' }}>🗓️ {it.observations}</div>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#92400E', whiteSpace: 'nowrap' }}>
                                                    {it.quantity} {it.originalUnit || it.suggestedProduct?.unit_of_measure}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #FDE68A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#92400E', fontWeight: '600' }}>Subtotal estimado:</span>
                                        <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#92400E' }}>{formatMoney(calcTotalGroup(group2))}</span>
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#B45309', marginTop: '4px' }}>
                                        Nota: OC: {importValidation?.poNumber || 'S/N'} [Entrega 2/2 - {secondaryScheduleName}]
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div style={{
                                padding: '1.25rem 2rem',
                                borderTop: '1px solid #E2E8F0',
                                backgroundColor: '#F8FAFC',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setShowMultiOrderModal(false)}
                                    disabled={isCreatingMultiOrders}
                                    style={{
                                        padding: '10px 20px',
                                        borderRadius: '12px',
                                        border: '1px solid #CBD5E1',
                                        backgroundColor: 'white',
                                        color: '#64748B',
                                        fontWeight: '700',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Volver y Revisar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCreateMultiOrders}
                                    disabled={isCreatingMultiOrders}
                                    style={{
                                        padding: '12px 28px',
                                        borderRadius: '14px',
                                        border: 'none',
                                        backgroundColor: isCreatingMultiOrders ? '#B45309' : '#D97706',
                                        color: 'white',
                                        fontWeight: '900',
                                        fontSize: '1rem',
                                        cursor: isCreatingMultiOrders ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 10px 20px -3px rgba(217, 119, 6, 0.4)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    {isCreatingMultiOrders ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin" />
                                            <span>Generando Pedidos Relacionados...</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 size={18} />
                                            <span>🚀 Confirmar y Crear los 2 Pedidos</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Modal de Éxito Multi-Entrega */}
            {multiOrderSuccess && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 100000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.5rem'
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '24px',
                        maxWidth: '600px',
                        width: '100%',
                        padding: '2.5rem',
                        textAlign: 'center',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)'
                    }}>
                        <div style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '50%',
                            backgroundColor: '#DCFCE7',
                            color: '#16A34A',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1.25rem'
                        }}>
                            <CheckCircle2 size={36} strokeWidth={2.5} />
                        </div>
                        <h2 style={{ fontSize: '1.6rem', fontWeight: '900', color: '#0F172A', marginBottom: '0.5rem' }}>
                            ¡2 Pedidos Creados Exitosamente!
                        </h2>
                        <p style={{ fontSize: '0.92rem', color: '#64748B', marginBottom: '1.5rem' }}>
                            La Orden de Compra fue separada correctamente. Ambos pedidos quedaron registrados en el sistema, vinculados al documento original y programados para sus respectivas fechas de despacho.
                        </p>

                        <div style={{ backgroundColor: '#F8FAFC', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem', textAlign: 'left', border: '1px solid #E2E8F0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid #E2E8F0' }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#059669', textTransform: 'uppercase' }}>Pedido 1 (Principal)</div>
                                    <div style={{ fontSize: '1rem', fontWeight: '900', color: '#1E293B' }}>ID: #{multiOrderSuccess.order1Id.slice(0, 8)}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Fecha de Despacho: <b>{multiOrderDate1}</b></div>
                                </div>
                                <Link href={`/admin/orders/loading?date=${multiOrderDate1}`}>
                                    <button style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: 'white', color: '#1E293B', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}>
                                        Ver Alistamiento
                                    </button>
                                </Link>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#D97706', textTransform: 'uppercase' }}>Pedido 2 (Diferido)</div>
                                    <div style={{ fontSize: '1rem', fontWeight: '900', color: '#1E293B' }}>ID: #{multiOrderSuccess.order2Id.slice(0, 8)}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Fecha de Despacho: <b>{multiOrderDate2}</b></div>
                                </div>
                                <Link href={`/admin/orders/loading?date=${multiOrderDate2}`}>
                                    <button style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: 'white', color: '#1E293B', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}>
                                        Ver Alistamiento
                                    </button>
                                </Link>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <Link href="/admin/orders">
                                <button style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', backgroundColor: '#0F172A', color: 'white', fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer' }}>
                                    Ver Listado de Pedidos
                                </button>
                            </Link>
                            <button
                                type="button"
                                onClick={() => setMultiOrderSuccess(null)}
                                style={{ padding: '12px 24px', borderRadius: '12px', border: '1px solid #CBD5E1', backgroundColor: 'white', color: '#64748B', fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer' }}
                            >
                                Cerrar y Continuar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

export default function CreateOrderPage() {
    return (
        <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#F3F4F6' }}>
                <div style={{ color: '#3B82F6', fontWeight: '600' }}>Cargando formulario...</div>
            </div>
        }>
            <CreateOrderContent />
        </Suspense>
    );
}
