'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { isInsidePolygon, Point } from '@/lib/geoUtils';
import { translations, Locale } from '@/lib/translations';
import { supabase } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatTimeWindow, LogisticsData } from '@/lib/logistics-parser';
import Link from 'next/link';
import { Map, Marker } from '@vis.gl/react-google-maps';
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
    AlertTriangle,
    Info,
    FolderOpen,
    Sparkles,
    Settings,
    ChevronLeft,
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
    UploadCloud
} from 'lucide-react';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import VariantModal from '@/components/VariantModal';

function CreateOrderContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(false);

    // Helpers to format inputs with thousands separator (.) and decimal (,)
    const formatQuantityDisplay = (qtyStr: string | number | undefined | null): string => {
        if (qtyStr === undefined || qtyStr === null) return '';
        // Remove existing dots and convert comma to dot to check validity
        const clean = qtyStr.toString().replace(/\./g, '').replace(',', '.');
        const parsed = parseFloat(clean);
        if (isNaN(parsed)) return qtyStr.toString();

        // Split by decimal comma of the input
        const parts = qtyStr.toString().replace(/\./g, '').split(',');
        const integerPart = parts[0];
        const decimalPart = parts[1];

        // Format integer part with dot for thousands
        const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

        return decimalPart !== undefined ? `${formattedInteger},${decimalPart}` : formattedInteger;
    };

    const formatPriceDisplay = (price: number | string | undefined | null): string => {
        if (price === undefined || price === null || price === '') return '';
        const clean = price.toString().replace(/\./g, '').replace(',', '.');
        const parsed = parseFloat(clean);
        if (isNaN(parsed)) return price.toString();

        const parts = price.toString().replace(/\./g, '').split(',');
        const integerPart = parts[0];
        const decimalPart = parts[1];

        const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return decimalPart !== undefined ? `${formattedInteger},${decimalPart}` : formattedInteger;
    };

    // Data Sources
    const [clients, setClients] = useState<any[]>([]); // B2B Profiles
    const [b2cClients, setB2cClients] = useState<any[]>([]); // B2C Profiles
    const [products, setProducts] = useState<any[]>([]);
    const [conversions, setConversions] = useState<any[]>([]);
    const [contractPrices, setContractPrices] = useState<Record<string, number>>({});
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

    // Client Exceptions (Product Nicknames & Notes) State
    const [clientExceptions, setClientExceptions] = useState<any[]>([]);

    useEffect(() => {
        if (!selectedClient) {
            setClientExceptions([]);
            return;
        }
        async function fetchClientExceptions() {
            const { data } = await supabase
                .from('product_nicknames')
                .select('*')
                .eq('customer_id', selectedClient);
            if (data) setClientExceptions(data);
        }
        fetchClientExceptions();
    }, [selectedClient]);

    const [focusedProductIndex, setFocusedProductIndex] = useState(-1);

    // B2C State
    const [b2cMode, setB2CMode] = useState<'search' | 'new'>('new');
    const [clientSearchB2C, setClientSearchB2C] = useState('');
    const [selectedClientB2C, setSelectedClientB2C] = useState('');
    const [guestInfo, setGuestInfo] = useState({ name: '', phone: '', address: '', city: 'Bogotá', email: '', nit: '', saveToDirectory: true }); // For B2C New

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


    
    // Payment Method State
    const [paymentMethod, setPaymentMethod] = useState('contra_entrega');

    // Search States
    const [productSearch, setProductSearch] = useState('');

    const [originSource, setOriginSource] = useState(searchParams.get('source') || 'phone'); // phone, whatsapp, email
    const [deliveryDate, setDeliveryDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]); // Default tomorrow
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
    const firstSelectRef = useRef<HTMLSelectElement | null>(null);
    const productSearchInputRef = useRef<HTMLInputElement | null>(null);

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

            // Only reset modal states to defaults if we are NOT in editing mode!
            if (editingCartIndex !== null) {
                return;
            }

            setModalQuantity('1');

            const hasWebUnit = selectedProductForModal.web_unit && selectedProductForModal.web_conversion_factor;
            if (hasWebUnit) {
                setModalUnit(selectedProductForModal.web_unit);
                setModalFactor(parseFloat(selectedProductForModal.web_conversion_factor) || 1);
            } else {
                setModalUnit(selectedProductForModal.unit_of_measure || 'Kg');
                setModalFactor(1);
            }
        }
    }, [selectedProductForModal, editingCartIndex]);

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
    }[]>([]);
    const [deleteConfirm, setDeleteConfirm] = useState<{
        isOpen: boolean;
        productName: string;
        onConfirm: () => void;
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
        documentType: 'PDF' | 'EXCEL' | 'CSV' | null
    }>({ clientInDocument: '', isMatch: true, documentType: null });

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

            if (clientType === 'B2B' && selectedClient) {
                currentProfile = clients.find(c => c.id === selectedClient);
            } else if (clientType === 'B2C' && selectedClientB2C) {
                currentProfile = b2cClients.find(c => c.id === selectedClientB2C);
            }

            if (currentProfile) {
                modelId = currentProfile.pricing_model_id || null;
            }

            let resolvedModel: any = null;
            let expired = false;
            let b2cFallback = false;

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

            // 2. Fallback to Clientes B2C if no model or if expired
            if (!resolvedModel || expired) {
                b2cFallback = true;
                const { data: b2cModel } = await supabase
                    .from('pricing_models')
                    .select('*')
                    .eq('name', 'Clientes B2C')
                    .single();
                
                if (b2cModel) {
                    resolvedModel = b2cModel;
                }
            }

            setActivePricingModel(resolvedModel);
            setIsB2CDefault(b2cFallback);
            setIsContractExpired(expired);

            // 3. Load prices for the resolved model
            if (resolvedModel) {
                const { data: prices } = await supabase
                    .from('pricing_model_prices')
                    .select('product_id, price')
                    .eq('model_id', resolvedModel.id);
                
                const map: Record<string, number> = {};
                prices?.forEach((p: any) => {
                    map[p.product_id] = p.price;
                });
                setContractPrices(map);
            } else {
                setContractPrices({});
            }
        }

        resolveContract();
    }, [clientType, selectedClient, selectedClientB2C, deliveryDate, clients, b2cClients]);

    // Reactively update prices in cart when contractPrices change
    useEffect(() => {
        if (Object.keys(contractPrices).length > 0) {
            setCart(prev => prev.map(item => {
                const resolvedPrice = contractPrices[item.product.id] || 0;
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
                .select('id, company_name, contact_name, nit, address, contact_phone, latitude, longitude, email, city, municipality, parent_id, logistics_data, delivery_restrictions, document_type, remission_with_prices, pricing_model_id')
                .eq('role', 'b2b_client')
                .order('company_name', { ascending: true });

            const fetchB2C = supabase
                .from('profiles')
                .select('id, company_name, contact_name, nit, address, contact_phone, phone, latitude, longitude, email, city, municipality, delivery_restrictions, geocoding_status, document_type, remission_with_prices, pricing_model_id')
                .eq('role', 'b2c_client') // Matched with Admin Drivers Core
                .eq('is_active', true)
                .order('contact_name', { ascending: true });

            const fetchConversions = supabase
                .from('product_conversions')
                .select('*');

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
                .select('id, accounting_id, sku, name, base_price, unit_of_measure, image_url, options_config, weight_kg, web_unit, web_conversion_factor')
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
        factor?: number
    ) => {
        const exc = clientExceptions.find(e => e.product_id === product.id);
        let finalLabel = variantLabel || '';
        let finalNickname = exc?.nickname || product.name;

        const resolvedFactor = factor || 1;
        const resolvedUnit = unit || product.unit_of_measure || 'Kg';
        const baseQty = parseFloat((qty * resolvedFactor).toFixed(2));

        setCart(prev => {
            const existingIndex = prev.findIndex(item =>
                item.product.id === product.id && item.variant_label === finalLabel && item.originalUnit === resolvedUnit
            );

            const resolvedPrice = contractPrices[product.id] || 0;

            if (existingIndex >= 0) {
                const newCart = [...prev];
                const item = { ...newCart[existingIndex] };
                item.originalQty = parseFloat(((item.originalQty || 0) + qty).toFixed(2));
                item.qty = parseFloat((item.originalQty * resolvedFactor).toFixed(2));
                
                const filteredCart = newCart.filter((_, i) => i !== existingIndex);
                return [item, ...filteredCart];
            } else {
                return [{ 
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
                }, ...prev];
            }
        });
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

                const formattedVariants = variants.map((v: any) => ({
                    product_id: productId,
                    sku: v.sku,
                    options: v.options,
                    image_url: v.image_url,
                    price_adjustment_percent: v.price_adjustment_percent || 0,
                    is_active: v.is_active ?? true
                }));

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
        const optionValues = Object.values(selectedOptions).filter(v => v);
        const variantLabel = optionValues.length > 0 ? optionValues.join(', ') : undefined;
        const qtyNum = parseFloat(String(modalQuantity).replace(',', '.')) || 1;

        if (editingCartIndex !== null) {
            const finalLabel = variantLabel || '';
            const resolvedFactor = modalFactor || 1;
            const resolvedUnit = modalUnit || selectedProductForModal.unit_of_measure || 'Kg';
            const baseQty = parseFloat((qtyNum * resolvedFactor).toFixed(2));

            setCart(prev => prev.map((c, i) => i === editingCartIndex ? {
                ...c,
                qty: baseQty,
                originalQty: qtyNum,
                originalUnit: resolvedUnit,
                conversion_factor: resolvedFactor,
                variant_label: finalLabel || undefined,
                selected_options: selectedOptions
            } : c));
            closeProductModal();
        } else {
            addToCartDirectly(
                selectedProductForModal, 
                qtyNum, 
                variantLabel, 
                selectedOptions,
                modalUnit,
                modalFactor
            );
            closeProductModal();
        }
    };

    const closeProductModal = () => {
        setSelectedProductForModal(null);
        setEditingCartIndex(null);
        setTimeout(() => {
            if (productSearchInputRef.current) {
                productSearchInputRef.current.focus();
            }
        }, 80);
    };

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
            const w = item.product.weight_kg || (item.product.unit_of_measure?.toLowerCase() === 'kg' ? 1 : 0);
            return acc + (qtyNum * w);
        }, 0);
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

    // --- ORDER IMPORT LOGIC (Mesa de Trabajo) ---

    const parseOrderWithAI = async (file: File) => {
        setParsingFile(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/ai/extract-order', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error en la API de extracción');
            }

            const data = await response.json();
            
            // Intentamos encontrar el mejor SKU sugerido para cada item extraído por la IA
            const suggested = data.items.map((item: any) => {
                // Algoritmo de Fuzzy Match simple
                const match = products.find(p => 
                    item.originalName.toLowerCase().includes(p.name.toLowerCase()) ||
                    p.name.toLowerCase().includes(item.originalName.toLowerCase().split(' ')[0])
                );
                return {
                    id: crypto.randomUUID(),
                    originalName: item.originalName,
                    quantity: item.quantity,
                    suggestedProduct: match || null,
                    status: match ? 'MATCH' : 'PENDING'
                };
            });

            // Lógica de Validación de Cliente (Auditoría)
            const selectedDetails = clientType === 'B2B' ? getSelectedClientDetails() : getSelectedB2CDetails();
            const clientInFile = data.clientInDocument;
            
            // Verificamos si hay coincidencia entre el documento y el sistema
            const selectedName = (selectedDetails?.company_name || selectedDetails?.contact_name || '').toUpperCase();
            const detectedName = clientInFile.toUpperCase();
            
            const isMatch = selectedName.includes(detectedName.split(' ')[0]) || 
                            detectedName.includes(selectedName.split(' ')[0]);

            setImportValidation({
                clientInDocument: clientInFile,
                isMatch: !!isMatch,
                documentType: data.documentType || (file.name.endsWith('.pdf') ? 'PDF' : 'Documento')
            });

            setStagedItems(suggested);
            setIsStaging(true);
        } catch (error: any) {
            console.error('AI Parsing Error:', error);
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            setParsingFile(false);
        }
    };

    const handleConfirmImport = () => {
        // Inyectamos los items validados al carrito real
        const itemsToInject = stagedItems
            .filter(item => item.suggestedProduct)
            .map(item => ({
                product: item.suggestedProduct,
                qty: item.quantity,
                variant_label: undefined,
                selected_options: undefined
            }));

        setCart(prev => [...itemsToInject, ...prev]);
        setIsStaging(false);
        setStagedItems([]);
        showToast(`✅ Se han inyectado ${itemsToInject.length} productos al detalle del pedido.`, 'success');
    };

    const updateStagedItem = (id: string, field: string, value: any) => {
        setStagedItems(prev => prev.map(item => {
            if (item.id === id) {
                if (field === 'product') {
                    return { ...item, suggestedProduct: value, status: 'MATCH' };
                }
                return { ...item, [field]: value };
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
            const data = await response.json();

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
                const data = await response.json();

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

            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert({
                    profile_id: finalProfileId,
                    total: calculateTotal(),
                    total_weight_kg: calculateTotalWeight(),
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
                    logistics_data: logisticsOverride
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
            router.push('/admin/orders/loading');

        } catch (e: any) {
            console.error('Submit Full Error:', e);
            const msg = e.message || JSON.stringify(e);
            showToast('Error creando pedido: ' + msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Filters & Helpers
    const filteredProducts = (!productSearch || productSearch.length < 2) ? [] : (products || []).filter(p =>
        (p.name && p.name.toLowerCase().includes(productSearch.toLowerCase())) ||
        (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
    ).slice(0, 10);

    const handleProductSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (filteredProducts.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedProductIndex(prev => (prev < filteredProducts.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedProductIndex(prev => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (focusedProductIndex >= 0 && focusedProductIndex < filteredProducts.length) {
                e.preventDefault();
                handleProductClick(filteredProducts[focusedProductIndex]);
                setFocusedProductIndex(-1);
            }
        } else if (e.key === 'Escape') {
            setProductSearch('');
            setFocusedProductIndex(-1);
        }
    };

    const filteredClients = clientSearch.length < 2 ? [] : clients.filter(c =>
        (c.company_name?.toLowerCase() || '').includes(clientSearch.toLowerCase()) ||
        (c.nit?.toString() || '').includes(clientSearch) ||
        (c.contact_name?.toLowerCase() || '').includes(clientSearch.toLowerCase()) ||
        (c.address?.toLowerCase() || '').includes(clientSearch.toLowerCase()) ||
        (c.contact_phone?.toString() || '').includes(clientSearch)
    ).slice(0, 8);

    const getSelectedClientDetails = () => clients.find(c => c.id === selectedClient);

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <style>{hideSpinnersStyle}</style>
            <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <Link href="/admin/orders/loading" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        textDecoration: 'none',
                        color: THEME.colors.textSecondary,
                        fontWeight: '600',
                        fontSize: '0.85rem',
                        transition: 'color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.color = THEME.colors.primary}
                    onMouseOut={(e) => e.currentTarget.style.color = THEME.colors.textSecondary}
                    >
                        <ArrowLeft size={16} strokeWidth={1.5} />
                        <span>Volver a Órdenes</span>
                    </Link>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', gap: '1.5rem', alignItems: 'start' }}>

                    {/* LEFT COLUMN: FORM */}
                    <div style={{ backgroundColor: THEME.colors.surface, padding: '2rem', borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary }}>
                                    <FileText size={18} strokeWidth={1.5} />
                                </div>
                                <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.02em' }}>Nuevo Pedido Manual</h1>
                            </div>
                            
                            {/* CLIENT SEGMENTATION (SLIMMER) */}
                            <div style={{ display: 'flex', gap: '4px', padding: '3px', backgroundColor: THEME.colors.primaryLight, borderRadius: '12px', width: '320px' }}>
                                <button
                                    onClick={() => setClientType('B2B')}
                                    style={{
                                        flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none',
                                        backgroundColor: clientType === 'B2B' ? THEME.colors.primary : 'transparent',
                                        color: clientType === 'B2B' ? '#ffffff' : THEME.colors.textSecondary,
                                        fontWeight: '700', cursor: 'pointer', boxShadow: clientType === 'B2B' ? THEME.shadow.sm : 'none',
                                        transition: 'all 0.2s', fontSize: '0.8rem',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                    }}
                                >
                                    <Building2 size={14} strokeWidth={1.5} />
                                    <span>Institucional</span>
                                </button>
                                <button
                                    onClick={() => setClientType('B2C')}
                                    style={{
                                        flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none',
                                        backgroundColor: clientType === 'B2C' ? THEME.colors.primary : 'transparent',
                                        color: clientType === 'B2C' ? '#ffffff' : THEME.colors.textSecondary,
                                        fontWeight: '700', cursor: 'pointer', boxShadow: clientType === 'B2C' ? THEME.shadow.sm : 'none',
                                        transition: 'all 0.2s', fontSize: '0.8rem',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                    }}
                                >
                                    <Home size={14} strokeWidth={1.5} />
                                    <span>Hogar</span>
                                </button>
                            </div>
                        </div>

                        {/* TOP SECTION GRID: CLIENT + LOGISTICS */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                            
                            {/* LEFT: CLIENT FIELDS */}
                            <div>
                                <div style={{ padding: '1.5rem', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '1px dashed #D1D5DB', height: '100%' }}>
                            {clientType === 'B2B' ? (
                                <div style={{ position: 'relative' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Buscar Empresa (Nombre, NIT, Dir, Tel)</label>

                                    {selectedClient ? (
                                        <div style={{
                                            padding: '1.2rem', 
                                            backgroundColor: '#F0FDF4', 
                                            border: '1px solid #BBF7D0', 
                                            borderRadius: '16px',
                                            display: 'flex', 
                                            flexDirection: 'column',
                                            gap: '0.8rem',
                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                                                        SUCURSAL SELECCIONADA
                                                    </div>
                                                    <div style={{ fontWeight: '900', color: '#14532D', fontSize: '1.2rem', lineHeight: '1.2' }}>
                                                        {getSelectedClientDetails()?.company_name}
                                                        {activePricingModel && (
                                                            <div style={{
                                                                marginTop: '0.5rem',
                                                                padding: '0.35rem 0.65rem',
                                                                borderRadius: '8px',
                                                                backgroundColor: isB2CDefault ? '#FFF7ED' : '#E0F2FE',
                                                                border: `1px solid ${isB2CDefault ? '#FED7AA' : '#BAE6FD'}`,
                                                                color: isB2CDefault ? '#C2410C' : '#0369A1',
                                                                fontSize: '0.8rem',
                                                                fontWeight: 'bold',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                width: 'fit-content'
                                                            }}>
                                                                <span>🏷️ {isB2CDefault ? 'Tarifa B2C (Por Defecto)' : `Modelo: ${activePricingModel.name}`}</span>
                                                                {isContractExpired && <span style={{ color: '#DC2626' }}>(Contrato Expirado)</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {getSelectedClientDetails()?.parent_id && (
                                                        <div style={{ fontSize: '0.85rem', color: '#15803D', fontWeight: '600', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span style={{ opacity: 0.7 }}>Matriz:</span> 
                                                            {clients.find(c => c.id === getSelectedClientDetails()?.parent_id)?.company_name || 'Corporativo'}
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => setSelectedClient('')}
                                                    style={{ 
                                                        background: '#DCFCE7', 
                                                        border: 'none', 
                                                        color: '#166534', 
                                                        width: '28px', 
                                                        height: '28px', 
                                                        borderRadius: '50%', 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        justifyContent: 'center', 
                                                        cursor: 'pointer',
                                                        fontSize: '0.8rem'
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', borderTop: '1px solid #DCFCE7', paddingTop: '0.8rem' }}>
                                                {/* Fila 1: Dirección Full Width */}
                                                <div>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} strokeWidth={1.5} /> DIRECCIÓN DE ENTREGA</span></div>
                                                    <div style={{ fontSize: '1rem', fontWeight: '800', color: '#14532D' }}>
                                                        {getSelectedClientDetails()?.address}
                                                        <span style={{ fontSize: '0.8rem', fontWeight: '500', marginLeft: '6px', opacity: 0.8 }}>
                                                            ({getSelectedClientDetails()?.city || 'Bogotá'})
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Fila 2: Grid para Encargado y GPS */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderTop: '1px solid rgba(22, 101, 52, 0.1)', paddingTop: '0.8rem' }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#15803D', textTransform: 'uppercase', marginBottom: '2px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><User size={12} strokeWidth={1.5} /> Encargado</span></div>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#166534' }}>{getSelectedClientDetails()?.contact_name || 'No asignado'}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#15803D' }}>{getSelectedClientDetails()?.contact_phone || 'Sin teléfono'}</div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#15803D', textTransform: 'uppercase', marginBottom: '2px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Globe size={12} strokeWidth={1.5} /> Estado GPS</span></div>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            {getSelectedClientDetails()?.latitude ? 'Confirmado' : 'Pendiente'}
                                                        </div>
                                                        {getSelectedClientDetails()?.latitude && (
                                                            <div style={{ fontSize: '0.7rem', color: '#15803D', opacity: 0.8 }}>
                                                                {getSelectedClientDetails()?.latitude.toFixed(5)}, {getSelectedClientDetails()?.longitude.toFixed(5)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <input
                                                type="text"
                                                placeholder="Ej: 'Calle 100' o 'Restaurante'..."
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
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                            />
                                            {filteredClients.length > 0 && (
                                                <div style={{
                                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                                                    backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '12px',
                                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.15)', marginTop: '0.5rem',
                                                    maxHeight: '280px', overflowY: 'auto'
                                                }}>
                                                    {filteredClients.map((c, idx) => (
                                                        <div
                                                            key={c.id}
                                                            onClick={() => selectClient(c)}
                                                            style={{
                                                                padding: '0.8rem 1rem', cursor: 'pointer', borderBottom: '1px solid #F3F4F6',
                                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                backgroundColor: idx === focusedClientIndex ? '#EFF6FF' : 'white'
                                                            }}
                                                            onMouseEnter={() => setFocusedClientIndex(idx)}
                                                            onMouseLeave={() => setFocusedClientIndex(-1)}
                                                        >
                                                            <div>
                                                                <div style={{ fontWeight: '600', color: '#1F2937' }}>{c.company_name}</div>
                                                                <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                                                                    NIT: {c.nit} • {c.address}
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
                                                    padding: '0.8rem', backgroundColor: '#EFF6FF', border: '1px solid #3B82F6', borderRadius: '8px',
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                                }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: '700', color: '#1E40AF', fontSize: '1.1rem' }}>
                                                            {getSelectedB2CDetails()?.contact_name || getSelectedB2CDetails()?.company_name}
                                                            {activePricingModel && (
                                                                <div style={{
                                                                    marginTop: '0.25rem',
                                                                    padding: '0.2rem 0.5rem',
                                                                    borderRadius: '6px',
                                                                    backgroundColor: isB2CDefault ? '#FFF7ED' : '#E0F2FE',
                                                                    border: `1px solid ${isB2CDefault ? '#FED7AA' : '#BAE6FD'}`,
                                                                    color: isB2CDefault ? '#C2410C' : '#0369A1',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 'bold',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    width: 'fit-content'
                                                                }}>
                                                                    <span>🏷️ {isB2CDefault ? 'Tarifa B2C (Por Defecto)' : `Modelo: ${activePricingModel.name}`}</span>
                                                                    {isContractExpired && <span style={{ color: '#DC2626' }}>(Contrato Expirado)</span>}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                                                            <div style={{ color: '#1E3A8A' }}>
                                                                <span style={{ fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Phone size={12} strokeWidth={1.5} /> Tel:</span> {getSelectedB2CDetails()?.contact_phone || 'N/A'}
                                                            </div>
                                                            <div style={{ color: '#1E3A8A' }}>
                                                                <span style={{ fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FileText size={12} strokeWidth={1.5} /> CC/NIT:</span> {getSelectedB2CDetails()?.nit || 'N/A'}
                                                            </div>
                                                            <div style={{ color: '#1E3A8A', gridColumn: '1 / -1' }}>
                                                                <span style={{ fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Mail size={12} strokeWidth={1.5} /> Email:</span> {getSelectedB2CDetails()?.email || 'N/A'}
                                                            </div>
                                                            <div style={{ color: '#1E3A8A', gridColumn: '1 / -1' }}>
                                                                <span style={{ fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} strokeWidth={1.5} /> Dir:</span> {getSelectedB2CDetails()?.address || 'Sin dirección'} ({getSelectedB2CDetails()?.city || '?'})
                                                            </div>
                                                            <div style={{ gridColumn: '1 / -1', marginTop: '4px' }}>
                                                                {(getSelectedB2CDetails()?.latitude && getSelectedB2CDetails()?.longitude) ? (
                                                                    <div style={{ color: '#059669', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16A34A' }}><CheckCircle2 size={12} strokeWidth={1.5} /> Georeferenciado ({getSelectedB2CDetails()?.latitude?.toFixed(4)}, {getSelectedB2CDetails()?.longitude?.toFixed(4)})</span>
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ color: '#DC2626', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#EF4444' }}><AlertTriangle size={12} strokeWidth={1.5} /> Sin Georeferenciación</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => { setSelectedClientB2C(''); setGuestInfo({ name: '', phone: '', address: '', city: 'Bogotá', email: '', nit: '', saveToDirectory: true }); }}
                                                        style={{ background: 'transparent', border: 'none', color: '#2563EB', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.2rem' }}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <input
                                                            type="text"
                                                            placeholder="Ej: Juan Pérez o 300..."
                                                            value={clientSearchB2C}
                                                            onChange={(e) => setClientSearchB2C(e.target.value)}
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
                                                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', marginTop: '0.5rem', overflow: 'hidden', maxHeight: '200px', overflowY: 'auto'
                                                        }}>
                                                            {filteredClientsB2C.map(c => (
                                                                <div
                                                                    key={c.id}
                                                                    onClick={() => selectClientB2C(c)}
                                                                    style={{
                                                                        padding: '0.8rem 1rem', cursor: 'pointer', borderBottom: '1px solid #F3F4F6',
                                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                                                    }}
                                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#EFF6FF'}
                                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                                                                >
                                                                    <div>
                                                                        <div style={{ fontWeight: '600', color: '#1F2937' }}>{c.contact_name || c.company_name}</div>
                                                                        <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
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
                            </div>

                            {/* RIGHT: LOGISTICS & DELIVERY */}
                            <div>
                                <div style={{ padding: '1.5rem', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', height: '100%' }}>
                                    <h3 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#475569', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Configuración de Entrega
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#64748B', marginBottom: '0.4rem' }}>CANAL DE VENTA</label>
                                            <select
                                                value={originSource} onChange={e => setOriginSource(e.target.value)}
                                                style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: 'white', fontSize: '0.9rem' }}
                                            >
                                                <option value="phone">Teléfono</option>
                                                <option value="whatsapp">WhatsApp</option>
                                                <option value="email">Email</option>
                                                <option value="file_upload">Documento de compra</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#64748B', marginBottom: '0.4rem' }}>FECHA DE ENTREGA</label>
                                            <input
                                                type="date"
                                                value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                                                style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem' }}
                                            />
                                        </div>
                                    </div>

                                    {/* INFO FRANJA (Final Refined Version) */}
                                    {(selectedClient || selectedClientB2C) && (
                                        <div style={{ 
                                            marginTop: '1.2rem', 
                                            padding: '1.2rem 1.5rem', 
                                            backgroundColor: isManualDelivery ? '#F0FDF4' : '#FFF7ED', 
                                            borderRadius: '20px', 
                                            border: isManualDelivery ? '1px solid #BBF7D0' : '1px solid #FFEDD5',
                                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '900', color: isManualDelivery ? '#166534' : '#9A3412', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                    {isManualDelivery ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#D97706' }}><AlertTriangle size={12} strokeWidth={1.5} /> OVERRIDE MANUAL ACTIVO</span> : 'FRANJA DE ENTREGA'}
                                                </div>
                                                {isManualDelivery && (
                                                    <span style={{ fontSize: '0.6rem', backgroundColor: '#10B981', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                        ESTADO: PRIORITARIO
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: '900', color: isManualDelivery ? '#14532D' : '#431407', lineHeight: '1.2' }}>
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
                                    <div style={{ marginTop: '1.5rem', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '1rem' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={isManualDelivery} 
                                                onChange={e => setIsManualDelivery(e.target.checked)}
                                                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#10B981' }}
                                            />
                                            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#334155' }}>Configuración Manual de Entrega</span>
                                        </label>

                                        {isManualDelivery && (
                                            <div style={{ 
                                                padding: '1rem', 
                                                backgroundColor: '#F0FDF4', 
                                                borderRadius: '12px', 
                                                border: '1px solid #DCFCE7',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.8rem',
                                                animation: 'fadeIn 0.2s ease-out'
                                            }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800', color: '#166534', marginBottom: '0.3rem' }}>HORA ESPECÍFICA</label>
                                                        <input 
                                                            type="time" 
                                                            value={manualDeliveryTime}
                                                            onChange={e => setManualDeliveryTime(e.target.value)}
                                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #BBF7D0', fontSize: '0.85rem' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800', color: '#166534', marginBottom: '0.3rem' }}>MARGEN (+/- min)</label>
                                                        <select
                                                            value={manualDeliveryMargin} onChange={e => setManualDeliveryMargin(Number(e.target.value))}
                                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #BBF7D0', fontSize: '0.85rem' }}
                                                        >
                                                            <option value={15}>15 min</option>
                                                            <option value={30}>30 min</option>
                                                            <option value={45}>45 min</option>
                                                            <option value={60}>60 min</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800', color: '#166534', marginBottom: '0.3rem' }}>NOTA DE ENTREGA</label>
                                                    <textarea 
                                                        placeholder="Instrucciones específicas..."
                                                        value={manualDeliveryNote}
                                                        onChange={e => setManualDeliveryNote(e.target.value)}
                                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #BBF7D0', fontSize: '0.85rem', minHeight: '60px', resize: 'none' }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
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
                                {/* Global Datalist for SKUs to improve performance */}
                                <datalist id="all-products-list">
                                    {products.map(p => (
                                        <option key={p.id} value={`${p.name} (${p.sku})`} />
                                    ))}
                                </datalist>

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
                                        style={{ display: 'none' }} 
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) parseOrderWithAI(file);
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
                                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                                    overflow: 'hidden',
                                    animation: 'fadeInUp 0.3s ease-out'
                                }}>
                                    {/* Mesa de Trabajo Header: Client Validation */}
                                    <div style={{ 
                                        padding: '1.5rem 2rem', 
                                        backgroundColor: importValidation.isMatch ? '#F0FDF4' : '#FFF7ED', 
                                        borderBottom: `1px solid ${importValidation.isMatch ? '#BBF7D0' : '#FFEDD5'}`,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                            <div style={{ color: importValidation.isMatch ? '#16A34A' : '#D97706' }}>{importValidation.isMatch ? <CheckCircle2 size={24} strokeWidth={1.5} /> : <AlertTriangle size={24} strokeWidth={1.5} />}</div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '900', color: importValidation.isMatch ? '#166534' : '#9A3412', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    Validación de Cliente (Auditoría)
                                                </div>
                                                <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0F172A' }}>
                                                    Documento detectado para: <span style={{ textDecoration: 'underline' }}>{importValidation.clientInDocument}</span>
                                                </div>
                                                {!importValidation.isMatch && (
                                                    <div style={{ fontSize: '0.85rem', color: '#C2410C', fontWeight: '600', marginTop: '2px' }}>
                                                        ¡ALERTA! El nombre del documento no coincide con el cliente seleccionado.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
                                            <span style={{ 
                                                padding: '6px 12px', 
                                                backgroundColor: 'white', 
                                                borderRadius: '100px', 
                                                fontSize: '0.75rem', 
                                                fontWeight: '800', 
                                                color: '#475569',
                                                border: '1px solid rgba(0,0,0,0.05)'
                                            }}>
                                                DOCUMENTO {importValidation.documentType}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Mesa de Trabajo Body: Table Mapping */}
                                    <div style={{ padding: '0', maxHeight: '550px', overflowY: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                                <tr style={{ textAlign: 'left', borderBottom: '2px solid #F1F5F9' }}>
                                                    <th style={{ padding: '1rem', textAlign: 'center', width: '40px' }}>
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
                                                    <th style={{ ...THEME.typography?.tableHeader, padding: '1rem 2rem', textAlign: 'left' }}>NOMBRE EN DOCUMENTO</th>
                                                    <th style={{ ...THEME.typography?.tableHeader, padding: '1rem', textAlign: 'left' }}>TU PRODUCTO (SKU)</th>
                                                    <th style={{ ...THEME.typography?.tableHeader, padding: '1rem', textAlign: 'center' }}>CANT.</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {stagedItems.map((item, idx) => (
                                                    <tr 
                                                        key={item.id} 
                                                        style={{ 
                                                            borderBottom: '1px solid #F8FAFC',
                                                            backgroundColor: item.suggestedProduct ? 'white' : '#FFF7ED',
                                                            transition: 'background-color 0.2s'
                                                        }}
                                                    >
                                                        <td style={{ padding: '1rem', textAlign: 'center', width: '40px' }}>
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
                                                        <td style={{ padding: '1rem 2rem' }}>
                                                            <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>{item.originalName}</div>
                                                        </td>
                                                        <td style={{ padding: '0.5rem 1rem', position: 'relative' }}>
                                                            <input 
                                                                type="text"
                                                                placeholder="Buscar SKU..."
                                                                defaultValue={item.suggestedProduct ? `${item.suggestedProduct.name} (${item.suggestedProduct.sku})` : ''}
                                                                list="all-products-list"
                                                                onFocus={(e) => e.target.select()}
                                                                className="sku-search-input"
                                                                id={`sku-input-${idx}`}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    const p = products.find(prod => `${prod.name} (${prod.sku})` === val);
                                                                    if (p) {
                                                                        updateStagedItem(item.id, 'product', p);
                                                                    }
                                                                }}
                                                                style={{ 
                                                                    width: '100%', 
                                                                    padding: '10px 14px', 
                                                                    borderRadius: '10px', 
                                                                    border: item.suggestedProduct ? '2px solid #E2E8F0' : '2px solid #F97316',
                                                                    fontSize: '1rem',
                                                                    fontWeight: '700',
                                                                    backgroundColor: item.suggestedProduct ? '#FFFFFF' : '#FFFBEB',
                                                                    outline: 'none',
                                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                                }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>
                                                            <input 
                                                                type="number"
                                                                value={item.quantity}
                                                                onFocus={(e) => e.target.select()}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        const nextInput = document.getElementById(`sku-input-${idx + 1}`);
                                                                        if (nextInput) {
                                                                            nextInput.focus();
                                                                        }
                                                                    }
                                                                }}
                                                                onChange={(e) => updateStagedItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                                                style={{ 
                                                                    width: '80px', 
                                                                    padding: '10px', 
                                                                    borderRadius: '8px', 
                                                                    border: '2px solid #E2E8F0', 
                                                                    textAlign: 'center',
                                                                    fontWeight: '800',
                                                                    fontSize: '1.1rem',
                                                                    backgroundColor: 'white'
                                                                }}
                                                            />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
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
                                            onClick={() => { setIsStaging(false); setStagedItems([]); }}
                                            style={{ padding: '10px 20px', borderRadius: '12px', border: '1px solid #CBD5E1', backgroundColor: 'white', color: '#64748B', fontWeight: '700', cursor: 'pointer' }}
                                        >
                                            Cancelar y Limpiar
                                        </button>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <div style={{ textAlign: 'right', marginRight: '1rem' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Items Auditados</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#1E293B' }}>{stagedItems.length} productos</div>
                                            </div>
                                            <button 
                                                onClick={handleConfirmImport}
                                                style={{ 
                                                    padding: '12px 28px', 
                                                    borderRadius: '14px', 
                                                    border: 'none', 
                                                    backgroundColor: '#059669', 
                                                    color: 'white', 
                                                    fontWeight: '800', 
                                                    fontSize: '1rem',
                                                    cursor: 'pointer',
                                                    boxShadow: '0 10px 15px -3px rgba(5, 150, 105, 0.3)',
                                                    transition: 'transform 0.2s'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                            >
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Sparkles size={14} strokeWidth={1.5} /> Confirmar e Inyectar al Pedido</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        )}

                        {/* 2. PRODUCT SEARCH (Visible only if NOT importing a document) */}
                        {originSource !== 'file_upload' && (
                            <div style={{ marginBottom: '2rem', position: 'relative' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Agregar Productos Manualmente</label>
                            <input
                                ref={productSearchInputRef}
                                type="text"
                                placeholder="Escribe para buscar (ej: Tomate)..."
                                value={productSearch} 
                                onChange={e => { setProductSearch(e.target.value); setFocusedProductIndex(-1); }}
                                onKeyDown={handleProductSearchKeyDown}
                                style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '2px solid #E2E8F0', fontSize: '1.1rem', outline: 'none' }}
                                onFocus={(e) => e.target.style.borderColor = '#3B82F6'}
                                onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
                            />

                            {filteredProducts.length > 0 && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                                    backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '12px',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.15)', marginTop: '0.5rem',
                                    maxHeight: '280px', overflowY: 'auto'
                                }}>
                                    {filteredProducts.map((p, idx) => (
                                        <div
                                            key={p.id}
                                            onClick={() => handleProductClick(p)}
                                            onMouseEnter={() => setFocusedProductIndex(idx)}
                                            style={{
                                                padding: '0.8rem 1rem', cursor: 'pointer', borderBottom: '1px solid #F3F4F6',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                backgroundColor: idx === focusedProductIndex ? '#EFF6FF' : 'white'
                                            }}
                                        >
                                            <span style={{ fontWeight: '600' }}>{p.name} {p.sku && <span style={{fontSize: '0.8em', color: '#6B7280'}}>({p.sku})</span>}</span>
                                            <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                                                {formatMoney(p.base_price)}/{p.unit_of_measure}
                                                {p.options_config?.length > 0 && <span style={{ marginLeft: '6px', fontSize: '0.7em', backgroundColor: '#FEF3C7', color: '#D97706', padding: '2px 4px', borderRadius: '4px' }}>⚙️ Opciones</span>}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        )}
                        {/* 3. CART LIST WITH IMPROVED STEPPER */}
                        <div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1rem' }}>Detalle del Pedido</h3>
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
                                                                    style={{ fontWeight: '500', color: '#0891B2', fontSize: '0.8em', backgroundColor: '#ECFEFF', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}
                                                                    title="Haz clic para editar variaciones"
                                                                >
                                                                    {item.variant_label}
                                                                </span>
                                                            )}
                                                            {item.picking_note && (
                                                                <span style={{ fontWeight: '600', color: '#D97706', fontSize: '0.8em', backgroundColor: '#FEF3C7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #FCD34D' }}>
                                                                    Nota: {item.picking_note}
                                                                </span>
                                                            )}
                                                            {item.delivery_note && (
                                                                <span style={{ fontWeight: '600', color: '#4F46E5', fontSize: '0.8em', backgroundColor: '#EEF2FF', padding: '2px 6px', borderRadius: '4px', border: '1px solid #C7D2FE' }}>
                                                                    Entr: {item.delivery_note}
                                                                </span>
                                                            )}
                                                            {/* Pricing Source Badge */}
                                                            {contractPrices[item.product.id] !== undefined && contractPrices[item.product.id] !== null ? (
                                                                <span style={{ fontSize: '0.75rem', backgroundColor: isB2CDefault ? '#FFF7ED' : '#E0F2FE', color: isB2CDefault ? '#C2410C' : '#0369A1', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                                    {isB2CDefault ? 'Tarifa B2C (Defecto)' : 'Tarifa Contrato'}
                                                                </span>
                                                            ) : (
                                                                <span style={{ fontSize: '0.75rem', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                                    ⚠️ Sin Precio
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                                            <span style={{ fontSize: '0.75rem', color: '#475569', backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0', fontWeight: '700' }}>
                                                                ID: {item.product.accounting_id || 'N/A'}
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
                                                                ⚖️ Conversión {item.originalUnit && `(${item.originalQty} ${item.originalUnit})`}
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
                                                            <span style={{ fontSize: '0.65rem', color: '#DC2626', fontWeight: 'bold' }}>⚠️ Asignar Precio</span>
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
                                                            ✏️
                                                        </button>
                                                        <button
                                                            onClick={() => removeFromCart(idx)}
                                                            style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', backgroundColor: '#FEE2E2', color: '#B91C1C', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FECACA'}
                                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                                                            title="Eliminar item"
                                                        >
                                                            ✕
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
                                                            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: hasPredefined ? '#15803D' : '#A16207' }}>
                                                                {hasPredefined ? '⚖️ Conversiones de Equivalencia Sugeridas' : '⚖️ Calculadora Libre de Equivalencias'}
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
                                                                            const calculatedQty = parseFloat(((item.originalQty || 1) * factor).toFixed(2));
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
                                                                        const calculatedQty = parseFloat((orig * factor).toFixed(2));
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

                        <div style={{ marginTop: '2rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Notas Administrativas / Observaciones del Pedido</label>
                            <textarea
                                value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                                rows={3}
                                placeholder="Ej: Entregar por la puerta trasera. Cliente solicita aguacates verdes."
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                            />
                        </div>

                    </div>

                    {/* RIGHT COLUMN: SUMMARY */}
                    <div>
                        <div style={{ position: 'sticky', top: '2rem', backgroundColor: 'white', padding: '1.5rem', borderRadius: '16px', border: '1px solid #E5E7EB', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1.5rem', color: '#111827' }}>Resumen</h3>

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <span style={{ color: '#6B7280' }}>Total Items:</span>
                                <span style={{ fontWeight: 'bold' }}>{cart.length}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', fontSize: '1.2rem', fontWeight: '900', color: '#111827' }}>
                                <span>TOTAL:</span>
                                <span>{formatMoney(calculateTotal())}</span>
                            </div>

                            <button
                                onClick={handleSubmit}
                                disabled={loading || cart.length === 0}
                                style={{
                                    width: '100%', padding: '1rem', borderRadius: '12px',
                                    backgroundColor: '#111827', color: 'white', border: 'none',
                                    fontWeight: '800', fontSize: '1.1rem', cursor: 'pointer',
                                    opacity: (loading || cart.length === 0) ? 0.5 : 1,
                                    marginBottom: '1rem'
                                }}
                            >
                                {loading ? 'Creando...' : 'CONFIRMAR PEDIDO'}
                            </button>

                            <p style={{ fontSize: '0.8rem', color: '#9CA3AF', textAlign: 'center', lineHeight: '1.4' }}>
                                Al confirmar, el pedido entrará a la Mesa de Control en estado &quot;Recibido&quot; para su revisión y aprobación.
                            </p>
                        </div>
                    </div>

                </div>
            </div>

            {/* --- VARIANT SELECTION MODAL --- */}
            {selectedProductForModal && (() => {
                const exc = clientExceptions.find(e => e.product_id === selectedProductForModal.id);
                const itemConversions = conversions.filter(c => c.product_id === selectedProductForModal.id);

                // Build full options list for unit selection (web_unit is first, if configured)
                const optionsList = [];
                const hasWebUnit = selectedProductForModal.web_unit && selectedProductForModal.web_conversion_factor;
                
                if (hasWebUnit) {
                    optionsList.push({
                        unit: selectedProductForModal.web_unit,
                        factor: parseFloat(selectedProductForModal.web_conversion_factor) || 1,
                        label: `${selectedProductForModal.web_unit} (${selectedProductForModal.web_conversion_factor} ${selectedProductForModal.unit_of_measure})`
                    });
                }
                
                if (!hasWebUnit || selectedProductForModal.unit_of_measure !== selectedProductForModal.web_unit) {
                    optionsList.push({
                        unit: selectedProductForModal.unit_of_measure || 'Kg',
                        factor: 1,
                        label: `${selectedProductForModal.unit_of_measure || 'Kg'} (Base)`
                    });
                }
                
                itemConversions.forEach(c => {
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
                    if (e.key === 'Enter') {
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
                    }
                };

                return (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1000, backdropFilter: 'blur(3px)'
                    }} onClick={() => closeProductModal()}>

                        <div
                            style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '24px', width: '95%', maxWidth: '680px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', textAlign: 'center' }}
                            onClick={e => e.stopPropagation()} // Prevent close
                        >
                            {selectedProductForModal.image_url ? (
                                <img
                                    src={selectedProductForModal.image_url}
                                    style={{ width: '100px', height: '100px', borderRadius: '16px', objectFit: 'cover', marginBottom: '1.2rem', boxShadow: '0 4px 10px rgba(0,0,0,0.08)' }}
                                />
                            ) : (
                                <div style={{
                                    width: '100px',
                                    height: '100px',
                                    borderRadius: '16px',
                                    backgroundColor: '#F3F4F6',
                                    border: '1px solid #E5E7EB',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 1.2rem auto',
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.04)'
                                }}>
                                    <span style={{ fontSize: '1.8rem', color: '#9CA3AF' }}>📦</span>
                                    <span style={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: '800', textTransform: 'uppercase', marginTop: '4px', letterSpacing: '0.05em' }}>
                                        Sin Imagen
                                    </span>
                                </div>
                            )}
                            <h3 style={{ fontSize: '1.6rem', fontWeight: '900', marginBottom: '0.3rem', color: '#111827' }}>{selectedProductForModal.name}</h3>
                            
                            {/* CLIENT CUSTOM REQUIREMENT INFO BOX */}
                            {exc && (
                                <div style={{
                                    backgroundColor: '#FEF3C7',
                                    border: '1px solid #FCD34D',
                                    borderRadius: '12px',
                                    padding: '0.8rem 1.2rem',
                                    margin: '0.8rem 0 1.2rem 0',
                                    textAlign: 'left',
                                    fontSize: '0.8rem',
                                    color: '#92400E',
                                    lineHeight: '1.4'
                                }}>
                                    <div style={{ fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase', fontSize: '0.7rem', color: '#B45309', letterSpacing: '0.05em' }}>
                                        📌 Requerimientos del Cliente:
                                    </div>
                                    {exc.nickname && exc.nickname !== selectedProductForModal.name && (
                                        <div><strong>Alias Comercial:</strong> {exc.nickname}</div>
                                    )}
                                    {exc.picking_note && (
                                        <div><strong>Bodega (Picking):</strong> {exc.picking_note}</div>
                                    )}
                                    {exc.delivery_note && (
                                        <div><strong>Despacho (Conductores):</strong> {exc.delivery_note}</div>
                                    )}
                                    {exc.preferred_options && Object.keys(exc.preferred_options).length > 0 && (
                                        <div><strong>Variación Preferida:</strong> {Object.entries(exc.preferred_options).map(([k,v]) => `${k}: ${v}`).join(', ')}</div>
                                    )}
                                </div>
                            )}

                            <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '1.0rem' }}>
                                {selectedProductForModal.options_config && selectedProductForModal.options_config.length > 0
                                    ? 'Personaliza tu producto:'
                                    : 'Especifica la cantidad y unidad de medida:'}
                            </p>

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
                                        textDecoration: 'underline'
                                    }}
                                >
                                    ⚙️ Editar Variantes
                                </button>
                                <span>|</span>
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => {
                                        if (window.confirm("¿Quieres crear una nueva equivalencia?")) {
                                            setManageConversionsProduct(selectedProductForModal);
                                        }
                                    }}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#4B5563',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        padding: 0,
                                        fontSize: 'inherit',
                                        textDecoration: 'underline'
                                    }}
                                >
                                    ⚙️ Editar Equivalencias
                                </button>
                            </div>

                            {/* RENDER OPTIONS DYNAMICALLY */}
                            {selectedProductForModal.options_config && selectedProductForModal.options_config.map((opt: any, index: number) => (
                                <div key={opt.name} style={{ marginBottom: '1.2rem', textAlign: 'left' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {opt.name}
                                    </label>
                                    <select
                                        id={`modal-select-${index}`}
                                        ref={index === 0 ? firstSelectRef : undefined}
                                        value={selectedOptions[opt.name] || ''}
                                        onChange={(e) => setSelectedOptions(prev => ({ ...prev, [opt.name]: e.target.value }))}
                                        onKeyDown={(e) => handleSelectKeyDown(e, index, selectedProductForModal.options_config.length)}
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
                                        <option value="">Seleccionar {opt.name}...</option>
                                        {opt.values?.map((val: string) => (
                                            <option key={val} value={val}>{val}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', margin: '1.5rem 0', textAlign: 'left' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Cantidad
                                    </label>
                                    <input
                                        id="modal-qty-input"
                                        type="text"
                                        value={modalQuantity}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(',', '.');
                                            setModalQuantity(val);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                const unitSel = document.getElementById('modal-unit-select');
                                                if (unitSel) {
                                                    unitSel.focus();
                                                } else {
                                                    confirmModalAdd();
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
                                            const parsed = parseFloat(String(modalQuantity).replace(',', '.'));
                                            if (isNaN(parsed) || parsed <= 0) {
                                                setModalQuantity('1');
                                            } else {
                                                setModalQuantity(String(parsed));
                                            }
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Unidad de Medida
                                    </label>
                                    {optionsList.length > 1 ? (
                                        <select
                                            id="modal-unit-select"
                                            value={modalUnit}
                                            onChange={(e) => {
                                                const selected = e.target.value;
                                                setModalUnit(selected);
                                                const matched = optionsList.find(o => o.unit === selected);
                                                if (matched) {
                                                    setModalFactor(matched.factor);
                                                }
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
                                            type="text"
                                            value={selectedProductForModal.unit_of_measure}
                                            style={{
                                                width: '100%',
                                                padding: '0.7rem 0.8rem',
                                                borderRadius: '10px',
                                                border: '2px solid #E2E8F0',
                                                fontWeight: '700',
                                                fontSize: '1.1rem',
                                                backgroundColor: '#F3F4F6',
                                                color: '#4B5563',
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
                                    type="button"
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
                        zIndex: 1100, backdropFilter: 'blur(3px)'
                    }} onClick={() => setManageConversionsProduct(null)}>

                        <div
                            style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '24px', width: '95%', maxWidth: '550px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', textAlign: 'center' }}
                            onClick={e => e.stopPropagation()} // Prevent close
                        >
                            <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                                <div style={{ textAlign: 'left' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#111827' }}>
                                        ⚖️ Equivalencias y Conversiones
                                    </h3>
                                    <span style={{ fontSize: '0.85rem', color: '#6B7280', fontWeight: '600' }}>
                                        {manageConversionsProduct.name}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setManageConversionsProduct(null)}
                                    style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9CA3AF', fontWeight: 'bold' }}
                                >
                                    ✕
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
                                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '800', textAlign: 'center' }}>
                                    ➕ DEFINIR NUEVA RELACIÓN
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
                                            <input id="new-conv-qty-1" type="number" defaultValue="1" style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700', textAlign: 'center', fontSize: '0.9rem' }} />
                                        </div>
                                        <div style={{ flex: 2 }}>
                                            <select id="new-conv-unit-1" style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700', backgroundColor: 'white', fontSize: '0.9rem' }}>
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
                                            <input id="new-conv-qty-2" type="number" placeholder="Ej: 0.3" style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700', textAlign: 'center', fontSize: '0.9rem' }} />
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
                            <Map
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
                            </Map>
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
