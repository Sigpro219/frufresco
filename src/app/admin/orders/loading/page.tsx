'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import { useAuth, checkUserPermission } from '@/lib/authContext';
import { ShieldAlert, Loader2 } from 'lucide-react';
import EmailDraftsModule from '@/components/EmailDraftsModule';
import EmailOutboxModule from '@/components/EmailOutboxModule';
import VariantModal from '@/components/VariantModal';
import { 
    MessageSquare, 
    Phone, 
    Mail, 
    UploadCloud, 
    Home, 
    Building2, 
    Globe, 
    ShoppingCart, 
    Clock, 
    PackageOpen, 
    Package, 
    Coins, 
    Truck, 
    CheckCircle2, 
    AlertTriangle, 
    Calendar, 
    Search, 
    List, 
    Grid, 
    Plus, 
    Trash2, 
    RefreshCw, 
    Edit2, 
    Save, 
    Check, 
    Sparkles, 
    HelpCircle,
    FileText,
    Eye,
    MapPin,
    Scale,
    Send,
    Lock,
    Unlock,
    Info,
    Navigation,
    Edit3,
    ChevronDown,
    Filter,
    X
} from 'lucide-react';

const getStatusLabel = (s: string) => {
    switch (s) {
        case 'pending_approval': 
        case 'pending': 
        case 'recibido': 
            return 'POR PROCESAR';
        case 'para_compra': return 'COMPRAS / QA';
        case 'approved': return 'APROBADO';
        case 'picking': return 'EN PREPARACIÓN';
        case 'shipped': return 'DESPACHADO';
        case 'delivered': return 'ENTREGADO';
        case 'cancelled': return 'CANCELADO';
        default: return s?.replace('_', ' ').toUpperCase() || '';
    }
};

const formatCreatedAt = (dateStr?: string) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const monthStr = months[d.getMonth()];
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return `${day} ${monthStr} · ${hours}:${minutes}`;
};

const getChannelBadge = (source: string, isB2B?: boolean) => {
    let activeSource = source;
    if (isB2B && (source === 'web_b2c' || source === 'web' || !source)) {
        activeSource = 'web_b2b';
    }
    switch (activeSource) {
        case 'whatsapp': 
            return <span style={{ backgroundColor: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MessageSquare size={10} strokeWidth={1.5} /> WhatsApp</span>;
        case 'phone': 
            return <span style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Phone size={10} strokeWidth={1.5} /> Teléfono</span>;
        case 'email': 
            return <span style={{ backgroundColor: '#F3E8FF', color: '#6B21A8', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Mail size={10} strokeWidth={1.5} /> Correo</span>;
        case 'file_upload': 
            return <span style={{ backgroundColor: '#FEF3C7', color: '#B45309', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><UploadCloud size={10} strokeWidth={1.5} /> Carga</span>;
        case 'web_b2c': 
            return <span style={{ backgroundColor: '#FCE7F3', color: '#9D174D', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Home size={10} strokeWidth={1.5} /> Web Hogar</span>;
        case 'web_b2b': 
            return <span style={{ backgroundColor: '#E0F2FE', color: '#0369A1', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Building2 size={10} strokeWidth={1.5} /> Web Institucional</span>;
        default: 
            return <span style={{ backgroundColor: '#F3F4F6', color: '#4B5563', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Globe size={10} strokeWidth={1.5} /> {source || 'Web'}</span>;
    }
};

export default function OrderLoadingPage() {
    const { profile, loading: authLoading } = useAuth();
    const [roles, setRoles] = useState<any[]>([]);
    const [rolesLoaded, setRolesLoaded] = useState(false);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [pendingEmailCount, setPendingEmailCount] = useState(0);
    const [sentEmailCount, setSentEmailCount] = useState(0);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [activeTab, setActiveTab] = useState<'orders' | 'emails' | 'outbox'>('orders');

    const hasPermission = (permission: string) => {
        return checkUserPermission(profile, permission, roles);
    };

    const canView = hasPermission('admin.orders');

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            setCurrentUser(user);
        });

        supabase.from('app_settings')
            .select('key, value')
            .eq('key', 'system_roles')
            .maybeSingle()
            .then(({ data, error }) => {
                if (!error && data?.value) {
                    try {
                        setRoles(JSON.parse(data.value));
                    } catch (e) {
                        console.error('Error parsing system_roles:', e);
                    }
                }
                setRolesLoaded(true);
            });

        supabase.from('product_conversions')
            .select('*')
            .then(({ data, error }) => {
                if (!error && data) {
                    setConversions(data);
                }
            });
    }, []);

    useEffect(() => {
        const fetchEmailCounts = async () => {
            const { count: pendingCount } = await supabase
                .from('order_drafts')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');
            setPendingEmailCount(pendingCount || 0);

            const { count: sentCount } = await supabase
                .from('mail')
                .select('*', { count: 'exact', head: true });
            setSentEmailCount(sentCount || 0);
        };
        fetchEmailCounts();
    }, [refreshTrigger]);

    const [selectedDate, setSelectedDate] = useState(() => {
        try {
            const formatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Bogota',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            return formatter.format(new Date());
        } catch (e) {
            return new Date().toISOString().split('T')[0];
        }
    }); 
    const [searchTerm, setSearchTerm] = useState('');
    const [showHelpTooltip, setShowHelpTooltip] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

    // Modal States
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [orderItems, setOrderItems] = useState<any[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [updateLoading, setUpdateLoading] = useState(false);
    
    const isOrderLocked = () => {
        if (!selectedOrder) return true;
        return ['picking', 'shipped', 'in_transit', 'delivered', 'cancelled'].includes(selectedOrder.status);
    };
    
    // Bulk Selection State
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [targetStatusToConfirm, setTargetStatusToConfirm] = useState('');

    const [variantQuantity, setVariantQuantity] = useState<string | number>('1');
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
    const [scarcityLockedMap, setScarcityLockedMap] = useState<Record<string, any>>({});

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
                console.error('Error fetching scarcity in loading page:', e);
            }
        };
        fetchScarcity();
    }, []);

    const [selectedChannel, setSelectedChannel] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterGps, setFilterGps] = useState('');
    const [filterChannel, setFilterChannel] = useState('');
    const [filterClientType, setFilterClientType] = useState('');
    const [openHeaderDropdown, setOpenHeaderDropdown] = useState<string | null>(null);

    const clearAllFilters = () => {
        setFilterStatus('');
        setFilterGps('');
        setFilterChannel('');
        setFilterClientType('');
        setSelectedChannel('');
        setSearchTerm('');
        setOpenHeaderDropdown(null);
    };

    const hasActiveFilters = !!(filterStatus || filterGps || filterChannel || selectedChannel || filterClientType || searchTerm);

    // Edit Fields
    const [editStatus, setEditStatus] = useState('');
    const [editDeliveryDate, setEditDeliveryDate] = useState('');
    const [editShippingAddress, setEditShippingAddress] = useState('');
    const [editLatitude, setEditLatitude] = useState<number | null>(null);
    const [editLongitude, setEditLongitude] = useState<number | null>(null);
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [geocodedMessage, setGeocodedMessage] = useState<string | null>(null);
    const [showAddressInput, setShowAddressInput] = useState(false);

    // GPS Interactive Map Modal States
    const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
    const [tempLat, setTempLat] = useState<number>(4.6097);
    const [tempLng, setTempLng] = useState<number>(-74.0817);
    const [tempAddress, setTempAddress] = useState<string>('');
    const [tempCity, setTempCity] = useState<string>('Bogotá');
    const [tempGeocodeMsg, setTempGeocodeMsg] = useState<string | null>(null);

    const handleOpenMapPicker = async () => {
        if (!editShippingAddress || editShippingAddress.trim() === '') {
            alert('Por favor ingresa una dirección de entrega válida antes de abrir el mapa.');
            return;
        }

        const city = selectedOrder?.profiles?.city || 'Bogotá';
        setTempAddress(editShippingAddress);
        setTempCity(city);
        setTempGeocodeMsg(null);
        setIsGeocoding(true);

        if (editLatitude && editLongitude) {
            setTempLat(editLatitude);
            setTempLng(editLongitude);
            setIsGeocoding(false);
            setIsMapPickerOpen(true);
            return;
        }

        try {
            const res = await fetch(`/api/geocode?address=${encodeURIComponent(editShippingAddress)}&city=${encodeURIComponent(city)}`);
            const data = await res.json();

            if (data.results && data.results.length > 0) {
                const loc = data.results[0].geometry.location;
                setTempLat(loc.lat);
                setTempLng(loc.lng);
                setTempGeocodeMsg(`Ubicación detectada: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
            } else {
                const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(editShippingAddress + ', ' + city + ', Colombia')}`);
                const nomData = await nomRes.json();
                if (nomData && nomData.length > 0) {
                    const lat = parseFloat(nomData[0].lat);
                    const lon = parseFloat(nomData[0].lon);
                    setTempLat(lat);
                    setTempLng(lon);
                    setTempGeocodeMsg(`Ubicación OSM: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
                } else {
                    setTempLat(4.6097);
                    setTempLng(-74.0817);
                    setTempGeocodeMsg('Ubicación genérica (Bogotá). Ajusta los valores de Lat y Lng o busca otra dirección.');
                }
            }
        } catch (err) {
            console.error('Error al inicializar mapa:', err);
            setTempLat(4.6097);
            setTempLng(-74.0817);
        } finally {
            setIsGeocoding(false);
            setIsMapPickerOpen(true);
        }
    };

    const handleConfirmMapCoordinates = () => {
        setEditLatitude(tempLat);
        setEditLongitude(tempLng);
        setEditShippingAddress(tempAddress);
        setGeocodedMessage(`Coordenadas GPS asignadas al pedido: ${tempLat.toFixed(5)}, ${tempLng.toFixed(5)}`);
        setIsMapPickerOpen(false);
        if (typeof window !== 'undefined' && (window as any).showToast) {
            (window as any).showToast(`✅ Coordenadas GPS asignadas al pedido: ${tempLat.toFixed(5)}, ${tempLng.toFixed(5)}`, 'success');
        }
    };

    const handleSmartGeocodeInModal = async (addressToGeocode?: string) => {
        const queryAddr = addressToGeocode || tempAddress;
        if (!queryAddr || queryAddr.trim() === '') {
            alert('Por favor ingresa una dirección de entrega válida.');
            return;
        }

        setIsGeocoding(true);
        setTempGeocodeMsg(null);

        try {
            const res = await fetch(`/api/geocode?address=${encodeURIComponent(queryAddr)}&city=${encodeURIComponent(tempCity)}`);
            const data = await res.json();

            if (data.results && data.results.length > 0) {
                const loc = data.results[0].geometry.location;
                setTempLat(loc.lat);
                setTempLng(loc.lng);
                setTempGeocodeMsg(`Ubicación georreferenciada por IA: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
                if (typeof window !== 'undefined' && (window as any).showToast) {
                    (window as any).showToast(`✅ Pin inteligente asignado: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`, 'success');
                }
            } else {
                const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryAddr + ', ' + tempCity + ', Colombia')}`);
                const nomData = await nomRes.json();
                if (nomData && nomData.length > 0) {
                    const lat = parseFloat(nomData[0].lat);
                    const lon = parseFloat(nomData[0].lon);
                    setTempLat(lat);
                    setTempLng(lon);
                    setTempGeocodeMsg(`Ubicación georreferenciada (OSM): ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
                } else {
                    setTempGeocodeMsg('⚠️ No se hallaron coordenadas automáticas para esta dirección.');
                }
            }
        } catch (err) {
            console.error('Error en Pin inteligente:', err);
        } finally {
            setIsGeocoding(false);
        }
    };

    const handleGeocodeAddress = async () => {
        await handleOpenMapPicker();
    };

    const mapPickerContainerRef = useRef<HTMLDivElement | null>(null);
    const mapPickerInstanceRef = useRef<any>(null);
    const markerPickerInstanceRef = useRef<any>(null);

    // Inicialización y actualización del Mapa Interactivo con Marcador Arrastrable (Google Maps o Leaflet)
    useEffect(() => {
        if (!isMapPickerOpen) {
            mapPickerInstanceRef.current = null;
            markerPickerInstanceRef.current = null;
            return;
        }

        const timer = setTimeout(() => {
            if (!mapPickerContainerRef.current) return;

            const mapDiv = mapPickerContainerRef.current;
            const centerLat = tempLat || 4.6097;
            const centerLng = tempLng || -74.0817;

            // 1. Si Google Maps JavaScript API está disponible
            if (typeof window !== 'undefined' && (window as any).google?.maps) {
                const google = (window as any).google;
                const center = { lat: centerLat, lng: centerLng };

                if (!mapPickerInstanceRef.current || typeof mapPickerInstanceRef.current.setView === 'function') {
                    mapDiv.innerHTML = '';
                    mapPickerInstanceRef.current = new google.maps.Map(mapDiv, {
                        center,
                        zoom: 16,
                        mapTypeControl: false,
                        streetViewControl: false,
                        fullscreenControl: false
                    });

                    markerPickerInstanceRef.current = new google.maps.Marker({
                        position: center,
                        map: mapPickerInstanceRef.current,
                        draggable: true,
                        animation: google.maps.Animation.DROP
                    });

                    markerPickerInstanceRef.current.addListener('dragend', () => {
                        if (!markerPickerInstanceRef.current) return;
                        const pos = markerPickerInstanceRef.current.getPosition();
                        if (!pos) return;
                        setTempLat(pos.lat());
                        setTempLng(pos.lng());
                        setTempGeocodeMsg(`📍 Marcador ajustado a: ${pos.lat().toFixed(5)}, ${pos.lng().toFixed(5)}`);
                    });

                    mapPickerInstanceRef.current.addListener('click', (e: any) => {
                        const pos = e.latLng;
                        if (!pos || !markerPickerInstanceRef.current) return;
                        markerPickerInstanceRef.current.setPosition(pos);
                        setTempLat(pos.lat());
                        setTempLng(pos.lng());
                        setTempGeocodeMsg(`📍 Marcador movido a: ${pos.lat().toFixed(5)}, ${pos.lng().toFixed(5)}`);
                    });
                } else {
                    mapPickerInstanceRef.current.setCenter(center);
                    markerPickerInstanceRef.current?.setPosition(center);
                }
                return;
            }

            // 2. Fallback: Leaflet (OpenStreetMap) Interactivo con Arrastre
            const loadLeafletAndInit = () => {
                const w = window as any;
                if (!w.L || !mapPickerContainerRef.current) return;

                if (!mapPickerInstanceRef.current || !mapPickerInstanceRef.current.setView) {
                    mapDiv.innerHTML = '';
                    const map = w.L.map(mapDiv).setView([centerLat, centerLng], 16);
                    w.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        maxZoom: 19,
                        attribution: '© OpenStreetMap'
                    }).addTo(map);

                    const marker = w.L.marker([centerLat, centerLng], { draggable: true }).addTo(map);

                    marker.on('dragend', (event: any) => {
                        const position = event.target.getLatLng();
                        setTempLat(position.lat);
                        setTempLng(position.lng);
                        setTempGeocodeMsg(`📍 Marcador arrastrado a: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`);
                    });

                    map.on('click', (e: any) => {
                        marker.setLatLng(e.latlng);
                        setTempLat(e.latlng.lat);
                        setTempLng(e.latlng.lng);
                        setTempGeocodeMsg(`📍 Marcador movido a: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`);
                    });

                    mapPickerInstanceRef.current = map;
                    markerPickerInstanceRef.current = marker;
                } else {
                    mapPickerInstanceRef.current.setView([centerLat, centerLng], 16);
                    markerPickerInstanceRef.current?.setLatLng([centerLat, centerLng]);
                }
            };

            const w = window as any;
            if (w.L) {
                loadLeafletAndInit();
            } else {
                if (!document.getElementById('leaflet-css')) {
                    const link = document.createElement('link');
                    link.id = 'leaflet-css';
                    link.rel = 'stylesheet';
                    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                    document.head.appendChild(link);
                }

                if (!document.getElementById('leaflet-js')) {
                    const script = document.createElement('script');
                    script.id = 'leaflet-js';
                    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                    script.onload = () => loadLeafletAndInit();
                    document.head.appendChild(script);
                } else {
                    loadLeafletAndInit();
                }
            }
        }, 150);

        return () => clearTimeout(timer);
    }, [isMapPickerOpen, tempLat, tempLng]);
    
    // Product Search for adding new items
    const [productSearch, setProductSearch] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);

    // Variant Selection Modal States (For products with options)
    const [selectedProductForVariant, setSelectedProductForVariant] = useState<any | null>(null);
    const [variantConfigProduct, setVariantConfigProduct] = useState<any | null>(null);
    const [manageConversionsProduct, setManageConversionsProduct] = useState<any | null>(null);
    // Contract / pricing model states
    const [contractPrices, setContractPrices] = useState<Record<string, number>>({});
    const [customPriceIds, setCustomPriceIds] = useState<Set<string>>(new Set());
    const [activePricingModel, setActivePricingModel] = useState<any>(null);
    const [isB2CDefault, setIsB2CDefault] = useState(false);
    const [isContractExpired, setIsContractExpired] = useState(false);
    const [agreementPricesMap, setAgreementPricesMap] = useState<Record<string, number>>({});
    const [allowOffAgreement, setAllowOffAgreement] = useState<boolean>(true);

    // Client Exceptions (Product Nicknames & Notes) State
    const [clientExceptions, setClientExceptions] = useState<any[]>([]);
    const [conversions, setConversions] = useState<any[]>([]);
    const [selectedUnit, setSelectedUnit] = useState<string>('');
    const [selectedConversionFactor, setSelectedConversionFactor] = useState<number>(1);
    const [focusedProductIndex, setFocusedProductIndex] = useState<number>(-1);

    useEffect(() => {
        async function resolveContract() {
            if (!selectedOrder) {
                setContractPrices({});
                setAgreementPricesMap({});
                setAllowOffAgreement(true);
                setActivePricingModel(null);
                setIsB2CDefault(false);
                setIsContractExpired(false);
                setClientExceptions([]);
                setEditShippingAddress('');
                setEditLatitude(null);
                setEditLongitude(null);
                setGeocodedMessage(null);
                setShowAddressInput(false);
                return;
            }

            setEditShippingAddress(selectedOrder.shipping_address || selectedOrder.profiles?.address || '');
            setEditLatitude(selectedOrder.latitude ?? selectedOrder.profiles?.latitude ?? null);
            setEditLongitude(selectedOrder.longitude ?? selectedOrder.profiles?.longitude ?? null);
            setGeocodedMessage(null);
            setShowAddressInput(false);

            const profileObj = selectedOrder.profiles;
            const effectiveClientId = profileObj?.parent_id || profileObj?.id;

            // 0. Fetch B2B Commercial Agreement Prices for this client
            let agreeMap: Record<string, number> = {};
            if (effectiveClientId) {
                try {
                    const res = await fetch(`/api/b2b/agreements?clientId=${effectiveClientId}`);
                    if (res.ok) {
                        const json = await res.json();
                        if (json.pricesMap) {
                            agreeMap = json.pricesMap;
                        }
                    }
                } catch (e) {
                    console.warn('API agreement fetch error in admin order edit:', e);
                }
            }
            setAgreementPricesMap(agreeMap);

            // 0.1 Determine allow_off_agreement_purchases restriction
            let canOffAgreement = true;
            if (profileObj) {
                if (profileObj.allow_off_agreement_purchases !== undefined && profileObj.allow_off_agreement_purchases !== null) {
                    canOffAgreement = Boolean(profileObj.allow_off_agreement_purchases);
                }
                if (profileObj.parent_id && !profileObj.override_parent_off_agreement) {
                    try {
                        const { data: parentP } = await supabase
                            .from('profiles')
                            .select('allow_off_agreement_purchases')
                            .eq('id', profileObj.parent_id)
                            .single();
                        if (parentP && parentP.allow_off_agreement_purchases !== undefined && parentP.allow_off_agreement_purchases !== null) {
                            canOffAgreement = Boolean(parentP.allow_off_agreement_purchases);
                        }
                    } catch (e) {
                        console.error('Error fetching parent profile off agreement setting:', e);
                    }
                }
            }
            setAllowOffAgreement(canOffAgreement);

            let modelId = profileObj?.pricing_model_id || null;

            if (!modelId && profileObj?.parent_id) {
                try {
                    const { data: parentProfile } = await supabase
                        .from('profiles')
                        .select('pricing_model_id')
                        .eq('id', profileObj.parent_id)
                        .single();
                    if (parentProfile?.pricing_model_id) {
                        modelId = parentProfile.pricing_model_id;
                    }
                } catch (e) {
                    console.error('Error fetching parent profile pricing model:', e);
                }
            }
            const deliveryDate = editDeliveryDate || selectedOrder.delivery_date;

            // Load Client exceptions for B2B client
            if (profileObj?.id) {
                const { data: excs } = await supabase
                    .from('product_nicknames')
                    .select('*')
                    .eq('customer_id', profileObj.id);
                if (excs) setClientExceptions(excs);
            } else {
                setClientExceptions([]);
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

            // 3. Load prices for the resolved model with fallback B2C prices
            if (resolvedModel) {
                const map: Record<string, number> = {};
                const customIds = new Set<string>();

                // Fetch B2C prices first if active model is not Clientes B2C
                if (resolvedModel.name !== 'Clientes B2C') {
                    const { data: b2cModel } = await supabase
                        .from('pricing_models')
                        .select('id')
                        .eq('name', 'Clientes B2C')
                        .single();
                    
                    if (b2cModel) {
                        const { data: b2cPrices } = await supabase
                            .from('pricing_model_prices')
                            .select('product_id, price')
                            .eq('model_id', b2cModel.id);
                        
                        b2cPrices?.forEach((p: any) => {
                            map[p.product_id] = p.price;
                        });
                    }
                }

                // Fetch active model prices
                const { data: activePrices } = await supabase
                    .from('pricing_model_prices')
                    .select('product_id, price')
                    .eq('model_id', resolvedModel.id);
                
                activePrices?.forEach((p: any) => {
                    map[p.product_id] = p.price;
                    if (resolvedModel.name !== 'Clientes B2C') {
                        customIds.add(p.product_id);
                    }
                });

                setContractPrices(map);
                setCustomPriceIds(customIds);
            } else {
                setContractPrices({});
                setCustomPriceIds(new Set());
            }
        }

        resolveContract();
    }, [selectedOrder, editDeliveryDate]);

    useEffect(() => {
        let active = true;

        const fetchOrders = async () => {
            setLoading(true);
            try {
                let query = supabase
                    .from('orders')
                    .select('*, profiles:profiles(id, role, contact_phone, latitude, longitude, company_name, contact_name, nit, email, address, pricing_model_id, parent_id), order_items(id, quantity, unit, products(weight_kg, unit_of_measure))');

                if (selectedDate && selectedDate !== 'all') {
                    query = query.eq('delivery_date', selectedDate);
                }

                query = query.order('created_at', { ascending: false });

                if (selectedDate === 'all' || !selectedDate) {
                    query = query.limit(100);
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

                        const isB2B = order.type?.startsWith('b2b') || order.profiles?.role === 'b2b_client';

                        if (order.profiles) {
                            // Unified Profile Logic
                            if (order.profiles.role === 'b2b_client') {
                                name = order.profiles.company_name || 'Sin Razón Social';
                            } else {
                                // Assume B2C or mixed
                                name = order.profiles.contact_name || order.profiles.company_name || 'Cliente Registrado';
                            }
                            phone = order.profiles.contact_phone || 'Sin Teléfono';
                        } else {
                            // FALLBACK: Use data directly from order table if profile is missing
                            // This happens with new B2C Wompi leads/orders
                            name = order.customer_name || 'Cliente Desconocido';
                            phone = order.customer_phone || 'Sin Teléfono';

                            if (name === 'Cliente Desconocido' && order.special_notes) {
                                const nameMatch = order.special_notes.match(/\[CLIENTE:\s*(.*?)\s*\|/);
                                const phoneMatch = order.special_notes.match(/Tel:\s*(.*?)\s*\|/);
                                if (nameMatch) name = nameMatch[1].trim();
                                if (phoneMatch) phone = phoneMatch[1].trim();
                            }

                            if (order.admin_notes && order.admin_notes.includes('CLIENTE HOGAR')) {
                                const nameMatch = order.admin_notes.match(/Nombre: (.*?) \|/);
                                const phoneMatch = order.admin_notes.match(/Tel: (.*?) \|/);
                                if (nameMatch) name = nameMatch[1];
                                if (phoneMatch) phone = phoneMatch[1];
                            }
                        }

                        let nit = order.profiles?.nit || null;
                        if (!order.profiles && order.special_notes) {
                            const nitMatch = order.special_notes.match(/ID:\s*(.*?)(?:\]|\s*\|)/);
                            if (nitMatch) nit = nitMatch[1].trim();
                        }

                        // Payment Method Logic
                        let paymentMethod = order.admin_notes && order.admin_notes.includes('[PAGO:') ? 
                                           order.admin_notes.match(/\[PAGO: (.*?)\]/)?.[1] : null;
                        
                        // Auto-detect Wompi if transaction ID exists but tags are missing
                        if (!paymentMethod && (order.wompi_transaction_id || order.type === 'b2c_wompi')) {
                            paymentMethod = 'Tarjeta / Wompi';
                        }

                        // Calculate total weight from order items
                        const items = order.order_items || [];
                        const calculatedWeight = items.reduce((sum: number, item: any) => {
                            const unit = (item.unit || item.products?.unit_of_measure || '').toLowerCase().trim();
                            const isKgUnit = ['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'kg.'].includes(unit);
                            const isLibraUnit = ['libra', 'libras', 'lb', 'lbs', '500g'].includes(unit);
                            
                            let weightFactor = 1.0;
                            if (isKgUnit) {
                                weightFactor = 1.0;
                            } else if (isLibraUnit) {
                                weightFactor = 0.5;
                            } else if (item.products?.weight_kg && Number(item.products.weight_kg) > 0) {
                                weightFactor = Number(item.products.weight_kg);
                            } else {
                                weightFactor = 1.0;
                            }
                            return sum + (weightFactor * (parseFloat(item.quantity) || 0));
                        }, 0);

                        const totalWeight = calculatedWeight > 0 ? calculatedWeight : (order.total_weight_kg || 0);

                        // Align origin_source for B2B vs B2C
                        let originSource = order.origin_source;
                        if (isB2B && (originSource === 'web_b2c' || !originSource)) {
                            originSource = 'web_b2b';
                        }

                        // Resolve real physical shipping address
                        let addressToUse = order.shipping_address;
                        const isPlaceholderAddr = !addressToUse || 
                            addressToUse.toLowerCase().includes('registrada') || 
                            addressToUse.toLowerCase().includes('direccion registrada') || 
                            addressToUse.trim() === '';

                        if (isPlaceholderAddr) {
                            if (order.profiles?.address && order.profiles.address.trim() !== '') {
                                addressToUse = order.profiles.address;
                            } else if (order.profiles?.shipping_address && order.profiles.shipping_address.trim() !== '') {
                                addressToUse = order.profiles.shipping_address;
                            } else if (order.profiles?.company_name) {
                                addressToUse = `${order.profiles.company_name} - Sede Principal`;
                            } else {
                                addressToUse = 'Dirección Registrada';
                            }
                        }

                        return {
                            ...order,
                            customer_name: name,
                            customer_phone: phone,
                            customer_nit: nit,
                            shipping_address: addressToUse,
                            paymentMethod: paymentMethod,
                            total_weight_kg: totalWeight,
                            item_count: items.length,
                            origin_source: originSource,
                            isComplete: true
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
    }, [selectedDate, refreshTrigger]);



    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            const hasGPS = (order.latitude && order.longitude) || (order.profiles?.latitude && order.profiles?.longitude);
            const isB2B = order.type?.startsWith('b2b') || order.profiles?.role === 'b2b_client';
            const friendlyId = getFriendlyOrderId(order).toLowerCase();
            const notes = `${order.admin_notes || ''} ${order.special_notes || ''}`.toLowerCase();
            const paymentMethodStr = (order.paymentMethod || '').toLowerCase();

            // 1. Channel Filter
            const activeChannel = filterChannel || selectedChannel;
            if (activeChannel) {
                if (activeChannel === 'web_b2c' && !(order.origin_source === 'web_b2c' || notes.includes('[origin: web_b2c]') || order.type === 'b2c_wompi')) return false;
                if (activeChannel === 'web_b2b' && !(order.origin_source === 'web_b2b' || notes.includes('[origin: web_b2b]'))) return false;
                if (activeChannel === 'email' && !(order.origin_source === 'email' || notes.includes('[origin: email]'))) return false;
                if (activeChannel === 'whatsapp' && !(order.origin_source === 'whatsapp' || notes.includes('[origin: whatsapp]'))) return false;
                if (activeChannel === 'phone' && !(order.origin_source === 'phone' || notes.includes('[origin: phone]'))) return false;
                if (activeChannel === 'file_upload' && !(order.origin_source === 'file_upload')) return false;
            }

            // 2. Status Filter
            if (filterStatus) {
                if (filterStatus === 'cobrar_puerta') {
                    const isDoor = paymentMethodStr.includes('puerta') || paymentMethodStr.includes('contraentrega') || notes.includes('cobrar') || notes.includes('puerta');
                    if (!isDoor) return false;
                } else {
                    if (order.status !== filterStatus) return false;
                }
            }

            // 3. GPS Filter
            if (filterGps) {
                if (filterGps === 'ok' && !hasGPS) return false;
                if (filterGps === 'missing' && hasGPS) return false;
            }

            // 4. Client Type Filter
            if (filterClientType) {
                if (filterClientType === 'b2b' && !isB2B) return false;
                if (filterClientType === 'b2c' && isB2B) return false;
            }

            // 5. Search Term Filter
            if (searchTerm) {
                const term = searchTerm.toLowerCase().trim();
                if (term.startsWith('@')) {
                    const command = term.substring(1).replace(/[\s-]+/g, '_');
                    if (command === 'sin_coordinadas' || command === 'sin_coordenadas' || command === 'sin_gps') return !hasGPS;
                    if (command === 'con_coordinadas' || command === 'con_coordenadas' || command === 'con_gps') return hasGPS;
                    if (command === 'b2b') return isB2B;
                    if (command === 'b2c' || command === 'hogar') return !isB2B;
                    if (command === 'pendiente' || command === 'pending') return order.status === 'pending_approval';
                    if (command === 'para_compra' || command === 'compra') return order.status === 'para_compra';
                    if (command === 'aprobado' || command === 'approved') return order.status === 'approved';
                    if (command === 'enviado' || command === 'shipped') return order.status === 'shipped';
                    if (command === 'entregado' || command === 'delivered') return order.status === 'delivered';
                }

                const normFriendlyId = friendlyId.replace(/[_\s-]/g, '');
                const normTerm = term.replace(/[_\s-]/g, '');
                const rawSeqStr = (order.sequence_id || '').toString();

                const matchesText = friendlyId.includes(term) ||
                    normFriendlyId.includes(normTerm) ||
                    rawSeqStr === term ||
                    order.id.toLowerCase().includes(term) ||
                    (order.customer_name || '').toLowerCase().includes(term) ||
                    (order.customer_nit || '').toLowerCase().includes(term) ||
                    (order.customer_phone || '').toLowerCase().includes(term) ||
                    (order.shipping_address || '').toLowerCase().includes(term) ||
                    (order.status || '').toLowerCase().includes(term) ||
                    paymentMethodStr.includes(term) ||
                    (order.admin_notes || '').toLowerCase().includes(term) ||
                    (order.special_notes || '').toLowerCase().includes(term);

                if (!matchesText) return false;
            }

            return true;
        });
    }, [orders, selectedChannel, searchTerm, filterStatus, filterGps, filterChannel, filterClientType]);

    const filteredMetrics = useMemo(() => {
        const count = filteredOrders.length;
        const totalMoney = filteredOrders.reduce((acc, o) => acc + (parseFloat(o.total_amount) || 0), 0);
        return { count, totalMoney };
    }, [filteredOrders]);

    const toggleSelectAll = () => {
        const completeOrders = filteredOrders.filter(o => o.isComplete);
        if (selectedOrders.size === completeOrders.length && completeOrders.length > 0) {
            setSelectedOrders(new Set());
        } else {
            setSelectedOrders(new Set(completeOrders.map(o => o.id)));
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

            // --- REFINED FETCH LOGIC WITH FALLBACK ---
            let { data, error } = await supabase
                .from('order_items')
                .select(`
                    *,
                    products (
                        name, sku, accounting_id, unit_of_measure, weight_kg, image_url, iva_rate
                    )
                `)
                .eq('order_id', order.id);
            
            // FALLBACK: Si el Join falla (a veces por RLS o Schema Cache), pedimos los productos por separado
            if (error || !data || data.some(item => !item.products)) {
                console.warn('⚠️ Falló el Join automático, intentando carga manual de productos...');
                
                const { data: rawItems, error: itemsErr } = await supabase
                    .from('order_items')
                    .select('*')
                    .eq('order_id', order.id);
                
                if (itemsErr) throw itemsErr;

                if (rawItems && rawItems.length > 0) {
                    const productIds = [...new Set(rawItems.map(i => i.product_id))];
                    const { data: rawProducts, error: prodErr } = await supabase
                        .from('products')
                        .select('id, name, sku, accounting_id, unit_of_measure, weight_kg, image_url, iva_rate')
                        .in('id', productIds);
                    
                    if (!prodErr && rawProducts) {
                        data = rawItems.map(item => ({
                            ...item,
                            products: rawProducts.find(p => p.id === item.product_id)
                        }));
                    } else {
                        data = rawItems; // Al menos mostramos las cantidades
                    }
                }
            }

            if (!data || data.length === 0) {
                console.warn('⚠️ No se encontraron items para el pedido:', order.id);
            } else {
                console.log('✅ Items cargados:', data.length);
            }

            setOrderItems(data || []);
        } catch (err: any) {
            console.error('Error fetching order items:', err);
            alert(`Error cargando productos: ${err.message || 'Error de conexión o permisos'}`);
        } finally {
            setLoadingItems(false);
        }
    };

    // Real-time calculations
    const currentTotal = orderItems.reduce((acc, item) => acc + ((item.unit_price || 0) * item.quantity), 0);
    const currentTax = orderItems.reduce((acc, item) => {
        const price = Number(item.unit_price || 0);
        const qty = Number(item.quantity || 0);
        const itemTotal = price * qty;
        const rate = item.products?.iva_rate !== null && item.products?.iva_rate !== undefined ? Number(item.products.iva_rate) : 19;
        const ivaAmount = itemTotal * (rate / (100 + rate));
        return acc + ivaAmount;
    }, 0);
    const currentSubtotal = currentTotal - currentTax;
    const currentWeight = orderItems.reduce((acc, item) => {
        const unit = (item.products?.unit_of_measure || '').toLowerCase().trim();
        const isKgUnit = ['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'kg.'].includes(unit);
        const isLibraUnit = ['libra', 'libras', 'lb', 'lbs', '500g'].includes(unit);
        
        let weightFactor = 1.0;
        if (isKgUnit) {
            weightFactor = 1.0;
        } else if (isLibraUnit) {
            weightFactor = 0.5;
        } else if (item.products?.weight_kg && Number(item.products.weight_kg) > 0) {
            weightFactor = Number(item.products.weight_kg);
        } else {
            weightFactor = 1.0;
        }
        return acc + (weightFactor * item.quantity);
    }, 0);

    const handleSearchProducts = (term: string) => {
        setProductSearch(term);
    };

    const handleProductSearchKeyDown = (e: React.KeyboardEvent) => {
        if (searchResults.length === 0) return;
        
        let nextIndex = focusedProductIndex;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            nextIndex = focusedProductIndex < searchResults.length - 1 ? focusedProductIndex + 1 : focusedProductIndex;
            setFocusedProductIndex(nextIndex);
            setTimeout(() => {
                const el = document.getElementById(`search-item-${nextIndex}`);
                if (el) el.scrollIntoView({ block: 'nearest' });
            }, 10);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            nextIndex = focusedProductIndex > 0 ? focusedProductIndex - 1 : focusedProductIndex;
            setFocusedProductIndex(nextIndex);
            setTimeout(() => {
                const el = document.getElementById(`search-item-${nextIndex}`);
                if (el) el.scrollIntoView({ block: 'nearest' });
            }, 10);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (focusedProductIndex >= 0 && focusedProductIndex < searchResults.length) {
                e.preventDefault();
                addProductToOrder(searchResults[focusedProductIndex]);
                setFocusedProductIndex(-1);
            }
        } else if (e.key === 'Escape') {
            setProductSearch('');
            setSearchResults([]);
            setFocusedProductIndex(-1);
        }
    };

    useEffect(() => {
        if (productSearch.length < 2) {
            setSearchResults([]);
            setSearching(false);
            return;
        }
        
        setSearching(true);
        const delayDebounceFn = setTimeout(async () => {
            console.log('🔍 Buscando productos en edición (debounced):', productSearch);
            try {
                const { data, error } = await supabase
                    .from('products')
                    .select('id, name, sku, accounting_id, base_price, unit_of_measure, weight_kg, options_config, image_url, iva_rate')
                    .eq('is_active', true)
                    .or(`name.ilike.%${productSearch}%,sku.ilike.%${productSearch}%`)
                    .limit(50);
                
                if (error) {
                    console.error('❌ Error de Supabase:', error.message, error.details, error.hint, error.code);
                    throw error;
                }

                let finalProducts = data || [];

                // SI EL CLIENTE TIENE RESTRICCIÓN SOLO A CONVENIO (allowOffAgreement === false), FILTRAR PRODUCTOS
                if (!allowOffAgreement && Object.keys(agreementPricesMap).length > 0) {
                    finalProducts = finalProducts.filter(p => agreementPricesMap[p.id] !== undefined);
                }
                
                console.log('✅ Resultados encontrados en edición:', finalProducts.length);
                setSearchResults(finalProducts);
            } catch (err: any) {
                console.error('💥 Excepción en búsqueda:', err);
                const msg = err.message || JSON.stringify(err);
                
                if (err.code === '42501' || msg.includes('permission denied')) {
                    alert('⚠️ Error de Permisos (RLS): No tienes permiso para buscar en la tabla "products". Por favor, ejecuta el script SQL de permisos.');
                }
            } finally {
                setSearching(false);
            }
        }, 250);

        return () => clearTimeout(delayDebounceFn);
    }, [productSearch, allowOffAgreement, agreementPricesMap]);

    // Autofocus logic for sub-modal
    useEffect(() => {
        if (selectedProductForVariant) {
            const timer = setTimeout(() => {
                if (selectedProductForVariant.options_config && selectedProductForVariant.options_config.length > 0) {
                    const firstSelect = document.getElementById('modal-select-0');
                    if (firstSelect) firstSelect.focus();
                } else {
                    const qtyInput = document.getElementById('modal-qty-input');
                    if (qtyInput) {
                        (qtyInput as HTMLInputElement).focus();
                        (qtyInput as HTMLInputElement).select();
                    }
                }
            }, 80);
            return () => clearTimeout(timer);
        }
    }, [selectedProductForVariant]);

    // Close sub-modal on Escape keypress globally
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (selectedProductForVariant) {
                    setSelectedProductForVariant(null);
                }
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [selectedProductForVariant]);

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

    if (authLoading || !rolesLoaded) {
        return (
            <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.background }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <Loader2 size={36} className="animate-spin" style={{ color: THEME.colors.primary }} />
                    <span style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem', fontWeight: '600' }}>Cargando portal de pedidos...</span>
                </div>
            </main>
        );
    }

    if (!canView) {
        return (
            <main style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.background }}>
                <div style={{
                    textAlign: 'center',
                    padding: '3rem',
                    backgroundColor: THEME.colors.surface,
                    borderRadius: THEME.radius.lg,
                    boxShadow: THEME.shadow.md,
                    maxWidth: '480px',
                    border: `1px solid ${THEME.colors.border}`,
                }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#EF4444',
                        marginBottom: '1.5rem'
                    }}>
                        <ShieldAlert size={32} />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: THEME.colors.textMain, marginBottom: '0.75rem', fontFamily: THEME.typography.fontFamilyMain }}>
                        Acceso Restringido
                    </h1>
                    <p style={{ color: THEME.colors.textSecondary, fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.5rem', fontFamily: THEME.typography.fontFamilySecondary }}>
                        No tienes permisos para visualizar el panel de pedidos. Si consideras que esto es un error, por favor contacta al administrador del sistema.
                    </p>
                    <Link href="/" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0.75rem 1.5rem',
                        backgroundColor: THEME.colors.primary,
                        color: 'white',
                        fontWeight: '700',
                        fontSize: '0.875rem',
                        borderRadius: THEME.radius.md,
                        textDecoration: 'none',
                        transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover || '#16a34a'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                    >
                        Volver al Inicio
                    </Link>
                </div>
            </main>
        );
    }

    const addProductToOrder = (product: any) => {
        if (scarcityLockedMap[product.id]) {
            alert(`🚫 "${product.name}" no se puede agregar al pedido: Insumo bloqueado por escasez en el mercado.`);
            return;
        }
        // 1. Check for product substitution exception
        const exc = clientExceptions.find(e => e.product_id === product.id);
        if (exc && exc.substitution_product_id) {
            const fetchAndSubstitute = async () => {
                const { data: subProduct } = await supabase
                    .from('products')
                    .select('id, name, sku, accounting_id, base_price, unit_of_measure, weight_kg, options_config, image_url, iva_rate')
                    .eq('id', exc.substitution_product_id)
                    .single();
                
                if (subProduct) {
                    const confirmSwap = window.confirm(`El cliente prefiere sustituir "${product.name}" por "${subProduct.name}". ¿Desea aplicar la sustitución?`);
                    if (confirmSwap) {
                        addProductToOrder(subProduct);
                        return;
                    }
                }
                proceedAddProduct(product, exc);
            };
            fetchAndSubstitute();
        } else {
            proceedAddProduct(product, exc);
        }
    };

    const proceedAddProduct = (product: any, exc: any) => {
        // Reset sub-modal states
        setVariantQuantity('1');
        setSelectedOptions({});

        // Pre-populate preferred variant options (if any)
        const initialOptions: Record<string, string> = {};
        if (exc && exc.preferred_options && typeof exc.preferred_options === 'object') {
            Object.entries(exc.preferred_options).forEach(([k, v]) => {
                initialOptions[k] = String(v);
            });
        }
        setSelectedOptions(initialOptions);

        // Always open the sub-modal to input quantity/variants (just like create page!)
        setSelectedProductForVariant(product);

        // Find default unit conversions
        const hasWebUnit = product.web_unit && product.web_conversion_factor;
        const defaultUnit = hasWebUnit ? product.web_unit : (product.unit_of_measure || 'Kg');
        const defaultFactor = hasWebUnit ? parseFloat(product.web_conversion_factor) || 1 : 1;
        setSelectedUnit(defaultUnit);
        setSelectedConversionFactor(defaultFactor);

        setProductSearch('');
        setSearchResults([]);
    };

    const confirmVariantAdd = () => {
        if (!selectedProductForVariant) return;
        const optionValues = Object.values(selectedOptions).filter(v => v);
        const variantLabel = optionValues.length > 0 ? optionValues.join(', ') : undefined;
        
        const qtyVal = parseFloat(String(variantQuantity).replace(',', '.')) || 1;
        const baseQty = parseFloat((qtyVal * selectedConversionFactor).toFixed(3));
        addOrUpdateItemInState(selectedProductForVariant, baseQty, variantLabel, selectedOptions);
        setSelectedProductForVariant(null);
    };



    const addOrUpdateItemInState = (product: any, qty: number, variantLabel?: string, optionsRaw?: any) => {
        const exc = clientExceptions.find(e => e.product_id === product.id);
        const finalLabel = variantLabel || '';
        const finalNickname = exc?.nickname || product.name;

        // Check if item with same product_id AND variant_label exists
        const existsIndex = orderItems.findIndex(item => 
            item.product_id === product.id && item.variant_label === (finalLabel || null)
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
            const resolvedPrice = (agreementPricesMap[product.id] !== undefined && agreementPricesMap[product.id] !== null)
                ? Number(agreementPricesMap[product.id])
                : ((contractPrices[product.id] !== undefined && contractPrices[product.id] !== null)
                    ? Number(contractPrices[product.id])
                    : (product.base_price ? Number(product.base_price) : 0));
            const newItem = {
                order_id: selectedOrder.id,
                product_id: product.id,
                quantity: qty,
                unit_price: resolvedPrice,
                variant_label: finalLabel || null,
                selected_options: optionsRaw || {},
                nickname: finalNickname || null,
                products: {
                    name: product.name,
                    sku: product.sku,
                    accounting_id: product.accounting_id,
                    unit_of_measure: product.unit_of_measure,
                    weight_kg: product.weight_kg,
                    iva_rate: product.iva_rate
                },
                isNew: true
            };
            setOrderItems([...orderItems, newItem]);
        }
    };

    const updateItemQuantity = (idx: number, newQty: number) => {
        if (newQty < 0) return;
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

        // Block Zero Margin / Zero Price
        const zeroPriceItem = orderItems.find(item => !item.unit_price || parseFloat(item.unit_price.toString()) === 0);
        if (zeroPriceItem) {
            alert(`❌ No se puede guardar: El producto "${zeroPriceItem.products?.name || 'Item'}" tiene precio $0 (sin tarifa en contrato ni B2C). Por favor ingrese un precio manual.`);
            return;
        }

        // Block Zero / Negative Quantities
        const zeroQtyItem = orderItems.find(item => !item.quantity || parseFloat(item.quantity.toString()) <= 0);
        if (zeroQtyItem) {
            alert(`❌ No se puede guardar: El producto "${zeroQtyItem.products?.name || 'Item'}" tiene cantidad menor o igual a 0. Si desea eliminarlo, use el icono de la papelera.`);
            return;
        }

        setUpdateLoading(true);
        console.log('📦 Iniciando actualización del pedido:', selectedOrder.id);
        
        try {
            // 1. Actualizar cabecera del pedido con nota de auditoría en admin_notes
            const nowTimeStr = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
            const userTag = profile?.contact_name || (profile as any)?.email || 'Mesa de Control';
            const auditStamp = ` [Audit ${nowTimeStr}: Edición por ${userTag}]`;
            const updatedAdminNotes = `${selectedOrder.admin_notes || ''}${auditStamp}`.trim();

            const { error: orderError } = await supabase
                .from('orders')
                .update({
                    status: editStatus,
                    delivery_date: editDeliveryDate,
                    shipping_address: editShippingAddress,
                    latitude: editLatitude,
                    longitude: editLongitude,
                    geocoding_status: editLatitude && editLongitude ? 'SUCCESS' : 'PENDING',
                    total: currentTotal,
                    total_weight_kg: currentWeight,
                    subtotal: currentSubtotal,
                    tax: currentTax,
                    admin_notes: updatedAdminNotes
                })
                .eq('id', selectedOrder.id);

            if (orderError) {
                console.error('❌ Error actualizando cabecera:', orderError);
                throw new Error(`Error en orders: ${orderError.message}`);
            }

            // 2. Sincronizar ítems
            const { data: originalItems, error: fetchErr } = await supabase
                .from('order_items')
                .select('*')
                .eq('order_id', selectedOrder.id);
            
            if (fetchErr) throw fetchErr;
            
            const originalIds = originalItems?.map(item => item.id) || [];
            const currentIds = orderItems.filter(item => !item.isNew).map(item => item.id);
            const idsToDelete = originalIds.filter(id => !currentIds.includes(id));

            // Operaciones en paralelo para mayor velocidad
            const operations = [];

            // Eliminaciones
            if (idsToDelete.length > 0) {
                console.log('<Trash2 size={16} strokeWidth={1.5} /> Eliminando ítems:', idsToDelete.length);
                operations.push(supabase.from('order_items').delete().in('id', idsToDelete));
            }

            // Consolidador de Ítems (Bulk Upsert para Nuevos y Modificados)
            const itemsToUpsert = orderItems.filter(item => item.isNew || item.isModified).map(item => {
                const rate = item.products?.iva_rate !== null && item.products?.iva_rate !== undefined ? Number(item.products.iva_rate) : 19;
                const itemTotal = (item.unit_price || 0) * item.quantity;
                const ivaAmount = itemTotal * (rate / (100 + rate));

                const baseItem: any = {
                    order_id: selectedOrder.id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    variant_label: item.variant_label,
                    selected_options: item.selected_options,
                    nickname: item.nickname || item.variant_label || null,
                    iva_rate: rate,
                    iva_amount: ivaAmount
                };
                if (!item.isNew) {
                    baseItem.id = item.id;
                }
                return baseItem;
            });

            if (itemsToUpsert.length > 0) {
                console.log('⚡ Sincronizando ítems en lote (Upsert):', itemsToUpsert.length);
                operations.push(supabase.from('order_items').upsert(itemsToUpsert));
            }

            if (operations.length > 0) {
                const results = await Promise.all(operations);
                const errors = results.filter(r => r.error).map(r => r.error?.message);
                if (errors.length > 0) {
                    console.error('❌ Errores en operaciones de ítems:', errors);
                    throw new Error(`Error en ítems: ${errors.join(', ')}`);
                }
            }
            
            // --- INYECCIÓN DE AUDITORÍA MÓDULO 3.7 ---
            const auditReason = window.prompt("Razón de la modificación (opcional para justificar cambios de precios o cantidades al equipo Logístico):");
            const auditLog = {
                order_id: selectedOrder.id,
                changed_by: currentUser?.id || null,
                change_type: 'modification',
                reason: auditReason || 'Edición manual en Control Tower',
                old_data: { 
                    status: selectedOrder.status, 
                    delivery_date: selectedOrder.delivery_date, 
                    total: selectedOrder.total,
                    items: originalItems 
                },
                new_data: { 
                    status: editStatus, 
                    delivery_date: editDeliveryDate, 
                    total: currentTotal,
                    items: orderItems 
                }
            };
            const { error: auditError } = await supabase.from('order_audit_logs').insert([auditLog]);
            if (auditError) {
                console.warn('⚠️ No se pudo guardar el registro de auditoría:', auditError);
            }
            // -----------------------------------------

            // Refrescar estado local
            setOrders(orders.map(o => o.id === selectedOrder.id ? { 
                ...o, 
                status: editStatus, 
                delivery_date: editDeliveryDate, 
                shipping_address: editShippingAddress,
                latitude: editLatitude,
                longitude: editLongitude,
                geocoding_status: editLatitude && editLongitude ? 'SUCCESS' : 'PENDING',
                total: currentTotal,
                total_weight_kg: currentWeight,
                subtotal: currentSubtotal,
                tax: currentTax
            } : o));
            
            setSelectedOrder({ 
                ...selectedOrder, 
                status: editStatus, 
                delivery_date: editDeliveryDate,
                shipping_address: editShippingAddress,
                latitude: editLatitude,
                longitude: editLongitude,
                geocoding_status: editLatitude && editLongitude ? 'SUCCESS' : 'PENDING',
                total: currentTotal,
                total_weight_kg: currentWeight,
                subtotal: currentSubtotal,
                tax: currentTax
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
        setSearchTerm('');
    };

    // Summary Metrics (Dashboard)
    const totalOrders = orders.length;
    const totalSales = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalWeightTons = (orders.reduce((sum, o) => sum + (o.total_weight_kg || 0), 0) / 1000);
    const approvedCount = orders.filter(o => ['approved', 'shipped', 'delivered'].includes(o.status)).length;
    const incompleteCount = orders.filter(o => !o.isComplete).length;
    const approvalRate = totalOrders > 0 ? (approvedCount / totalOrders) * 100 : 0;


    return (
        <div style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            
            <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '0.4rem 2rem' }}>
                <header style={{ marginBottom: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary }}>
                                <FileText size={18} strokeWidth={1.5} />
                            </div>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.02em' }}>Cargue de Pedidos</h1>
                        </div>
                    </div>
                </header>

                {/* DASHBOARD INDICATORS (SLIM & PREMIUM) */}
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(5, 1fr)', 
                    gap: '1.2rem', 
                    marginBottom: '1rem'
                }}>
                    <KPICard title="Total Pedidos" value={formatNumber(totalOrders)} icon={<Package size={18} strokeWidth={1.5} />} color="#6366F1" subtitle="Para entrega hoy" />
                    <KPICard title="Valor Carga" value={formatMoney(totalSales)} icon={<Coins size={18} strokeWidth={1.5} />} color="#10B981" subtitle="Monto bruto" />
                    <KPICard title="Peso Total" value={`${formatNumber(totalWeightTons, 2)} TON`} icon={<Truck size={18} strokeWidth={1.5} />} color="#FBBF24" subtitle="Logística" />
                    <KPICard title="Efectividad" value={`${formatNumber(approvalRate, 0)}%`} icon={<CheckCircle2 size={18} strokeWidth={1.5} />} color="#0891B2" subtitle="Tasa de aprobación" />
                    <KPICard title="Alertas" value={formatNumber(incompleteCount)} icon={<AlertTriangle size={18} strokeWidth={1.5} />} color="#EF4444" subtitle="Info incompleta" />
                </div>

                {/* TABS FOR ORDERS VS EMAILS */}
                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.2rem', borderBottom: '1px solid #E5E7EB', paddingBottom: '2px' }}>
                    <button 
                        onClick={() => setActiveTab('orders')}
                        style={{
                            padding: '0.6rem 0.2rem',
                            border: 'none',
                            background: 'transparent',
                            color: activeTab === 'orders' ? THEME.colors.primary : '#64748B',
                            fontWeight: '700',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            borderBottom: activeTab === 'orders' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Package size={16} /> Pedidos del Día
                    </button>
                    <button 
                        onClick={() => setActiveTab('emails')}
                        style={{
                            padding: '0.6rem 0.2rem',
                            border: 'none',
                            background: 'transparent',
                            color: activeTab === 'emails' ? THEME.colors.primary : '#64748B',
                            fontWeight: '700',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            borderBottom: activeTab === 'emails' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Mail size={16} /> Bandeja de Entrada Email {pendingEmailCount > 0 && <span style={{ backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, padding: '1px 6px', borderRadius: '10px', fontSize: '0.7rem' }}>{pendingEmailCount}</span>}
                    </button>
                    <button 
                        onClick={() => setActiveTab('outbox')}
                        style={{
                            padding: '0.6rem 0.2rem',
                            border: 'none',
                            background: 'transparent',
                            color: activeTab === 'outbox' ? THEME.colors.primary : '#64748B',
                            fontWeight: '700',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            borderBottom: activeTab === 'outbox' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Send size={16} /> Bandeja de Salida Email {sentEmailCount > 0 && <span style={{ backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, padding: '1px 6px', borderRadius: '10px', fontSize: '0.7rem' }}>{sentEmailCount}</span>}
                    </button>
                </div>

                {activeTab === 'orders' ? (
                    <>
                        {/* UNIFIED SLENDER CONTROL BAR */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem', 
                    marginBottom: '1rem', 
                    backgroundColor: 'white', 
                    padding: '0.4rem 0.6rem', 
                    borderRadius: '12px', 
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    border: '1px solid #E5E7EB'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        {/* Date Selector Segment */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ 
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0 0.8rem',
                                backgroundColor: '#F9FAFB',
                                borderRadius: '10px',
                                border: '1px solid #E5E7EB',
                                cursor: 'pointer',
                                height: '40px',
                                position: 'relative'
                            }} onClick={(e) => {
                                const input = e.currentTarget.querySelector('input');
                                if (input) (input as any).showPicker?.();
                            }}>
                                 <Calendar size={16} strokeWidth={1.5} style={{ marginRight: '6px', color: THEME.colors.textSecondary, flexShrink: 0 }} />
                                 <input
                                    type="date"
                                    className="clean-date-input"
                                    value={selectedDate === 'all' ? '' : selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        fontSize: '0.82rem',
                                        fontWeight: '800',
                                        color: '#111827',
                                        outline: 'none',
                                        cursor: 'pointer',
                                        width: '115px'
                                    }}
                                />
                            </div>
                            <button 
                                onClick={() => {
                                    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
                                    setSelectedDate(todayStr);
                                }}
                                style={{
                                    height: '40px',
                                    padding: '0 10px',
                                    borderRadius: '10px',
                                    border: '1px solid #E5E7EB',
                                    backgroundColor: '#F8FAFC',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    color: THEME.colors.primary,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                }}
                                title="Ver pedidos programados para la fecha de hoy"
                            >
                                Hoy
                            </button>
                            <button 
                                onClick={() => setSelectedDate('all')}
                                style={{
                                    height: '40px',
                                    padding: '0 10px',
                                    borderRadius: '10px',
                                    border: selectedDate === 'all' ? '1px solid #818CF8' : '1px solid #E5E7EB',
                                    backgroundColor: selectedDate === 'all' ? '#EEF2FF' : '#F8FAFC',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    color: selectedDate === 'all' ? '#4F46E5' : '#64748B',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                }}
                                title="Ver todos los pedidos recientes sin filtro de fecha"
                            >
                                Todas
                            </button>
                        </div>

                        {/* Search Segment - Flexible & Responsive (MATCHING CLIENTS UI) */}
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={16} strokeWidth={1.5} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                            <input 
                                placeholder="Buscar por ID, empresa, @estado..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ 
                                    width: '100%', 
                                    padding: '0 2.5rem 0 2.5rem', 
                                    borderRadius: '10px', 
                                    border: '1px solid #F1F5F9', 
                                    fontSize: '0.85rem',
                                    fontWeight: '600',
                                    outline: 'none',
                                    height: '40px',
                                    backgroundColor: '#F8FAFC',
                                    transition: 'all 0.2s'
                                }}
                                onFocus={(e) => {
                                    e.target.style.backgroundColor = 'white';
                                    e.target.style.borderColor = '#0891B2';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(8, 145, 178, 0.1)';
                                }}
                                onBlur={(e) => {
                                    e.target.style.backgroundColor = '#F8FAFC';
                                    e.target.style.borderColor = '#E2E8F0';
                                }}
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    style={{
                                        position: 'absolute',
                                        right: '0.8rem',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: '#E2E8F0',
                                        border: 'none',
                                        color: '#64748B',
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        fontSize: '0.7rem',
                                        fontWeight: 'bold'
                                    }}
                                >✕</button>
                            )}
                        </div>

                        {/* Dropdown Filter by Channel */}
                        <div style={{ position: 'relative', height: '40px', flexShrink: 0 }}>
                            <select
                                value={selectedChannel}
                                onChange={(e) => setSelectedChannel(e.target.value)}
                                style={{
                                    height: '100%',
                                    padding: '0 2.5rem 0 1rem',
                                    borderRadius: '10px',
                                    border: '1px solid #E5E7EB',
                                    fontSize: '0.8rem',
                                    fontWeight: '800',
                                    color: '#111827',
                                    outline: 'none',
                                    backgroundColor: '#F8FAFC',
                                    cursor: 'pointer',
                                    appearance: 'none',
                                    backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
                                    backgroundPosition: 'right 0.5rem center',
                                    backgroundSize: '1.25rem',
                                    backgroundRepeat: 'no-repeat',
                                    width: '180px'
                                }}
                            >
                                <option value="">Todos los canales</option>
                                <option value="whatsapp">WhatsApp</option>
                                <option value="phone">Teléfono</option>
                                <option value="web_b2c">Web Hogar</option>
                                <option value="web_b2b">Web Horeca</option>
                                <option value="email">Correo</option>
                                <option value="file_upload">Carga Masiva</option>
                            </select>
                        </div>

                        {/* Info Button for Commands */}
                            <div 
                                onMouseEnter={() => setShowHelpTooltip(true)}
                                onMouseLeave={() => setShowHelpTooltip(false)}
                                style={{ 
                                    position: 'relative',
                                    width: '40px', 
                                    height: '40px', 
                                    borderRadius: '10px', 
                                    backgroundColor: '#EFF6FF', 
                                    color: '#2563EB', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    cursor: 'help',
                                    border: '1px solid #DBEAFE',
                                    fontSize: '1rem',
                                    fontWeight: '900',
                                    flexShrink: 0
                                }}
                            >
                                i
                                {showHelpTooltip && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '40px',
                                        right: '0',
                                        width: '280px',
                                        backgroundColor: '#1E293B',
                                        color: 'white',
                                        padding: '1rem',
                                        borderRadius: '12px',
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                                        zIndex: 1000,
                                        fontSize: '0.7rem',
                                        lineHeight: '1.4',
                                        pointerEvents: 'none',
                                        animation: 'fadeInUp 0.2s ease-out'
                                    }}>
                                        <div style={{ fontWeight: '900', color: '#38BDF8', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            🚀 COMANDOS RÁPIDOS (@)
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <b style={{ color: '#FCD34D' }}>@pendiente</b>: Recibidos<br/>
                                                <b style={{ color: '#FCD34D' }}>@aprobado</b>: Aprobados<br/>
                                                <b style={{ color: '#FCD34D' }}>@compra</b>: Compras<br/>
                                                <b style={{ color: '#FCD34D' }}>@b2b</b>: Corporativos
                                            </div>
                                            <div>
                                                <b style={{ color: '#FCD34D' }}>@b2c</b>: Hogares<br/>
                                                <b style={{ color: '#FCD34D' }}>@sin_gps</b>: Falta geo<br/>
                                                <b style={{ color: '#FCD34D' }}>@web</b>: De la App<br/>
                                                <b style={{ color: '#FCD34D' }}>@pago</b>: Pagados
                                            </div>
                                        </div>
                                        <style>{`
                                            @keyframes fadeInUp {
                                                from { opacity: 0; transform: translateY(10px); }
                                                to { opacity: 1; transform: translateY(0); }
                                            }
                                        `}</style>
                                    </div>
                                )}
                            </div>
                        </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {/* View Switcher */}
                        <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F3F4F6', padding: '2px', borderRadius: '8px' }}>
                            <button onClick={() => setViewMode('table')} style={{ padding: '0.4rem 0.6rem', border: 'none', borderRadius: '6px', background: viewMode === 'table' ? 'white' : 'transparent', fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer', color: viewMode === 'table' ? '#111827' : '#9CA3AF', display: 'flex', alignItems: 'center' }}><List size={14} strokeWidth={1.5} /></button>
                            <button onClick={() => setViewMode('cards')} style={{ padding: '0.4rem 0.6rem', border: 'none', borderRadius: '6px', background: viewMode === 'cards' ? 'white' : 'transparent', fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer', color: viewMode === 'cards' ? '#111827' : '#9CA3AF', display: 'flex', alignItems: 'center' }}><Grid size={14} strokeWidth={1.5} /></button>
                        </div>

                        <div style={{ height: '24px', width: '1px', backgroundColor: '#E5E7EB' }} />

                        <button onClick={() => setActiveTab('emails')} style={{
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: pendingEmailCount > 0 ? THEME.colors.primaryLight : '#F3F4F6',
                            color: pendingEmailCount > 0 ? THEME.colors.primary : '#4B5563',
                            border: `1px solid ${pendingEmailCount > 0 ? 'rgba(13, 122, 87, 0.2)' : '#E5E7EB'}`,
                            padding: '0.5rem 1rem',
                            borderRadius: '8px',
                            fontWeight: '800',
                            fontSize: '0.75rem',
                            transition: 'all 0.2s'
                        }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = pendingEmailCount > 0 ? 'rgba(13, 122, 87, 0.15)' : '#E5E7EB'; }}
                           onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = pendingEmailCount > 0 ? THEME.colors.primaryLight : '#F3F4F6'; }}>
                            <Mail size={14} />
                            <span>{pendingEmailCount} Pendientes Email</span>
                        </button>

                        <Link href="/admin/orders/create" style={{ 
                            backgroundColor: THEME.colors.primary, 
                            color: 'white', 
                            padding: '0.5rem 1rem', 
                            borderRadius: '8px', 
                            textDecoration: 'none',
                            fontWeight: '700', 
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'background-color 0.2s'
                        }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                           onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primary}>
                            <Plus size={14} strokeWidth={1.5} /> Nuevo Pedido
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
                                    onClick={() => {
                                        setTargetStatusToConfirm('para_compra');
                                        setShowConfirmModal(true);
                                    }}
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
                                    onClick={() => {
                                        window.open('/admin/orders/print-labels?ids=' + Array.from(selectedOrders).join(','), '_blank');
                                    }}
                                    style={{
                                        backgroundColor: '#059669',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        padding: '0.5rem 1rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 6px rgba(5, 150, 105, 0.2)',
                                    }}
                                >
                                    🖨️ Etiquetas
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




                {/* Loading */}
                {loading && (
                    <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'white', borderRadius: '12px' }}>
                        <div style={{ color: THEME.colors.primary, marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}><RefreshCw size={48} strokeWidth={1.5} className="animate-spin" /></div>
                        <div style={{ color: '#64748B' }}>Cargando pedidos...</div>
                    </div>
                )}

                {/* Empty */}
                {!loading && filteredOrders.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3.5rem 2rem', backgroundColor: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', margin: '1rem 0' }}>
                        <div style={{ color: '#94A3B8', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                            <PackageOpen size={54} strokeWidth={1.2} />
                        </div>
                        <div style={{ color: '#0F172A', fontWeight: '800', fontSize: '1.1rem', marginBottom: '0.4rem' }}>
                            No se encontraron pedidos con estos criterios
                        </div>
                        <div style={{ color: '#64748B', fontSize: '0.85rem', marginBottom: '1.5rem', maxWidth: '480px', margin: '0 auto 1.5rem' }}>
                            {selectedDate && selectedDate !== 'all'
                                ? `No hay entregas registradas para la fecha seleccionada (${selectedDate}). Puedes consultar los pedidos de hoy o ver todas las fechas.`
                                : 'Intenta ajustar tus criterios de búsqueda o limpiar los filtros activos.'}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button 
                                onClick={() => {
                                    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
                                    setSelectedDate(todayStr);
                                }}
                                style={{ backgroundColor: THEME.colors.primary, color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Calendar size={14} /> Ver Pedidos de Hoy
                            </button>
                            <button 
                                onClick={() => setSelectedDate('all')}
                                style={{ backgroundColor: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE', padding: '0.6rem 1.2rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                                🌐 Ver Pedidos de Todas las Fechas
                            </button>
                            {hasActiveFilters && (
                                <button 
                                    onClick={clearAllFilters}
                                    style={{ backgroundColor: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5', padding: '0.6rem 1.2rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <X size={14} /> Limpiar Filtros
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Barra de Filtros Activos y Totales */}
                {hasActiveFilters && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', padding: '0.6rem 1rem', borderRadius: '10px', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#15803D', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Filter size={14} /> Filtros Activos:
                            </span>
                            {filterClientType && (
                                <span style={{ fontSize: '0.7rem', backgroundColor: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    Tipo: {filterClientType === 'b2b' ? 'Institucional' : 'Hogar'}
                                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => setFilterClientType('')} />
                                </span>
                            )}
                            {filterGps && (
                                <span style={{ fontSize: '0.7rem', backgroundColor: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    GPS: {filterGps === 'ok' ? 'GPS OK' : 'SIN GPS'}
                                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => setFilterGps('')} />
                                </span>
                            )}
                            {(filterChannel || selectedChannel) && (
                                <span style={{ fontSize: '0.7rem', backgroundColor: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    Canal: {filterChannel || selectedChannel}
                                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setFilterChannel(''); setSelectedChannel(''); }} />
                                </span>
                            )}
                            {filterStatus && (
                                <span style={{ fontSize: '0.7rem', backgroundColor: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    Estado: {filterStatus === 'cobrar_puerta' ? 'Cobrar en Puerta' : getStatusLabel(filterStatus)}
                                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => setFilterStatus('')} />
                                </span>
                            )}
                            {searchTerm && (
                                <span style={{ fontSize: '0.7rem', backgroundColor: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    Texto: "{searchTerm}"
                                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => setSearchTerm('')} />
                                </span>
                            )}
                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginLeft: '6px' }}>
                                ({filteredMetrics.count} pedidos • Total: {formatMoney(filteredMetrics.totalMoney)})
                            </span>
                        </div>
                        <button 
                            onClick={clearAllFilters}
                            style={{ fontSize: '0.7rem', fontWeight: '800', color: '#DC2626', backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' }}
                        >
                            Limpiar Todo
                        </button>
                    </div>
                )}

                {/* Backdrop global para cerrar dropdowns de encabezado */}
                {openHeaderDropdown && (
                    <div 
                        onClick={() => setOpenHeaderDropdown(null)} 
                        style={{ position: 'fixed', inset: 0, zIndex: 90, backgroundColor: 'transparent' }} 
                    />
                )}

                {/* List View (Conditional) */}
                {!loading && filteredOrders.length > 0 && (
                    <>
                        {viewMode === 'table' ? (
                            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, overflow: 'visible', boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}` }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#F8FAFB', borderBottom: '1px solid #E5E7EB' }}>
                                            <th style={{ padding: '1rem', width: '12%', textAlign: 'left', position: 'relative', ...THEME.typography?.tableHeader }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span>ID / TIPO</span>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setOpenHeaderDropdown(openHeaderDropdown === 'type' ? null : 'type'); }}
                                                        style={{ background: filterClientType ? THEME.colors.primary : '#E2E8F0', color: filterClientType ? 'white' : '#475569', border: 'none', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                        title="Filtrar por tipo de cliente"
                                                    >
                                                        <ChevronDown size={12} />
                                                    </button>
                                                </div>
                                                {openHeaderDropdown === 'type' && (
                                                    <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', minWidth: '170px', padding: '0.4rem', fontWeight: 'normal', textTransform: 'none' }}>
                                                        <div onClick={() => { setFilterClientType(''); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterClientType === '' ? 'bold' : 'normal', backgroundColor: filterClientType === '' ? '#F1F5F9' : 'transparent' }}>
                                                            <Filter size={13} style={{ color: '#64748B' }} /> Todos los tipos
                                                        </div>
                                                        <div onClick={() => { setFilterClientType('b2b'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterClientType === 'b2b' ? 'bold' : 'normal', backgroundColor: filterClientType === 'b2b' ? '#F1F5F9' : 'transparent' }}>
                                                            <Building2 size={13} style={{ color: THEME.colors.primary }} /> Institucional (B2B)
                                                        </div>
                                                        <div onClick={() => { setFilterClientType('b2c'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterClientType === 'b2c' ? 'bold' : 'normal', backgroundColor: filterClientType === 'b2c' ? '#F1F5F9' : 'transparent' }}>
                                                            <Home size={13} style={{ color: '#EC4899' }} /> Hogar (B2C)
                                                        </div>
                                                    </div>
                                                )}
                                            </th>
                                            <th style={{ padding: '1rem', width: '22%', textAlign: 'left', ...THEME.typography?.tableHeader }}>CLIENTE</th>
                                            <th style={{ padding: '1rem', width: '24%', textAlign: 'left', position: 'relative', ...THEME.typography?.tableHeader }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span>DIRECCIÓN / GPS</span>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setOpenHeaderDropdown(openHeaderDropdown === 'gps' ? null : 'gps'); }}
                                                        style={{ background: filterGps ? THEME.colors.primary : '#E2E8F0', color: filterGps ? 'white' : '#475569', border: 'none', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                        title="Filtrar por GPS"
                                                    >
                                                        <ChevronDown size={12} />
                                                    </button>
                                                </div>
                                                {openHeaderDropdown === 'gps' && (
                                                    <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', minWidth: '170px', padding: '0.4rem', fontWeight: 'normal', textTransform: 'none' }}>
                                                        <div onClick={() => { setFilterGps(''); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterGps === '' ? 'bold' : 'normal', backgroundColor: filterGps === '' ? '#F1F5F9' : 'transparent' }}>
                                                            <Filter size={13} style={{ color: '#64748B' }} /> Todas las ubicaciones
                                                        </div>
                                                        <div onClick={() => { setFilterGps('ok'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterGps === 'ok' ? 'bold' : 'normal', backgroundColor: filterGps === 'ok' ? '#F1F5F9' : 'transparent' }}>
                                                            <MapPin size={13} style={{ color: '#10B981' }} /> GPS OK
                                                        </div>
                                                        <div onClick={() => { setFilterGps('missing'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterGps === 'missing' ? 'bold' : 'normal', backgroundColor: filterGps === 'missing' ? '#F1F5F9' : 'transparent' }}>
                                                            <AlertTriangle size={13} style={{ color: '#F59E0B' }} /> SIN GPS
                                                        </div>
                                                    </div>
                                                )}
                                            </th>
                                            <th style={{ padding: '1rem', width: '15%', textAlign: 'left', position: 'relative', ...THEME.typography?.tableHeader }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span>ASUNTO / ORIGEN</span>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setOpenHeaderDropdown(openHeaderDropdown === 'channel' ? null : 'channel'); }}
                                                        style={{ background: (filterChannel || selectedChannel) ? THEME.colors.primary : '#E2E8F0', color: (filterChannel || selectedChannel) ? 'white' : '#475569', border: 'none', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                        title="Filtrar por canal de origen"
                                                    >
                                                        <ChevronDown size={12} />
                                                    </button>
                                                </div>
                                                {openHeaderDropdown === 'channel' && (
                                                    <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', minWidth: '180px', padding: '0.4rem', fontWeight: 'normal', textTransform: 'none' }}>
                                                        <div onClick={() => { setFilterChannel(''); setSelectedChannel(''); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Globe size={13} style={{ color: '#64748B' }} /> Todos los canales
                                                        </div>
                                                        <div onClick={() => { setFilterChannel('web_b2c'); setSelectedChannel('web_b2c'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Home size={13} style={{ color: '#9D174D' }} /> Web Hogar
                                                        </div>
                                                        <div onClick={() => { setFilterChannel('web_b2b'); setSelectedChannel('web_b2b'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Building2 size={13} style={{ color: '#0369A1' }} /> Web Institucional
                                                        </div>
                                                        <div onClick={() => { setFilterChannel('email'); setSelectedChannel('email'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Mail size={13} style={{ color: '#6B21A8' }} /> Correo
                                                        </div>
                                                        <div onClick={() => { setFilterChannel('whatsapp'); setSelectedChannel('whatsapp'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <MessageSquare size={13} style={{ color: '#15803D' }} /> WhatsApp
                                                        </div>
                                                        <div onClick={() => { setFilterChannel('phone'); setSelectedChannel('phone'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Phone size={13} style={{ color: '#1D4ED8' }} /> Teléfono
                                                        </div>
                                                        <div onClick={() => { setFilterChannel('file_upload'); setSelectedChannel('file_upload'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <UploadCloud size={13} style={{ color: '#B45309' }} /> Carga Masiva
                                                        </div>
                                                    </div>
                                                )}
                                            </th>
                                            <th style={{ padding: '1rem', width: '10%', textAlign: 'center', ...THEME.typography?.tableHeader }}>ITEMS / PESO</th>
                                            <th style={{ padding: '1rem', width: '10%', textAlign: 'right', ...THEME.typography?.tableHeader }}>VALOR</th>
                                            <th style={{ padding: '1rem', width: '10%', textAlign: 'center', position: 'relative', ...THEME.typography?.tableHeader }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <span>ESTADO</span>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setOpenHeaderDropdown(openHeaderDropdown === 'status' ? null : 'status'); }}
                                                        style={{ background: filterStatus ? THEME.colors.primary : '#E2E8F0', color: filterStatus ? 'white' : '#475569', border: 'none', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                        title="Filtrar por estado del pedido"
                                                    >
                                                        <ChevronDown size={12} />
                                                    </button>
                                                </div>
                                                {openHeaderDropdown === 'status' && (
                                                    <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', minWidth: '180px', padding: '0.4rem', textAlign: 'left', fontWeight: 'normal', textTransform: 'none' }}>
                                                        <div onClick={() => { setFilterStatus(''); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Filter size={13} style={{ color: '#64748B' }} /> Todos los estados
                                                        </div>
                                                        <div onClick={() => { setFilterStatus('para_compra'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <CheckCircle2 size={13} style={{ color: '#10B981' }} /> COMPRAS / QA
                                                        </div>
                                                        <div onClick={() => { setFilterStatus('pending_approval'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Clock size={13} style={{ color: '#F59E0B' }} /> POR APROBAR
                                                        </div>
                                                        <div onClick={() => { setFilterStatus('approved'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <CheckCircle2 size={13} style={{ color: '#3B82F6' }} /> APROBADO
                                                        </div>
                                                        <div onClick={() => { setFilterStatus('picking'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Package size={13} style={{ color: '#8B5CF6' }} /> EN PREPARACIÓN
                                                        </div>
                                                        <div onClick={() => { setFilterStatus('shipped'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Truck size={13} style={{ color: '#06B6D4' }} /> DESPACHADO
                                                        </div>
                                                        <div onClick={() => { setFilterStatus('delivered'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <CheckCircle2 size={13} style={{ color: '#059669' }} /> ENTREGADO
                                                        </div>
                                                        <div onClick={() => { setFilterStatus('cancelled'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <AlertTriangle size={13} style={{ color: '#EF4444' }} /> CANCELADO
                                                        </div>
                                                        <div style={{ borderTop: '1px solid #E2E8F0', margin: '4px 0' }}></div>
                                                        <div onClick={() => { setFilterStatus('cobrar_puerta'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', color: '#D97706', fontWeight: 'bold' }}>
                                                            <Coins size={13} style={{ color: '#D97706' }} /> Cobrar en puerta
                                                        </div>
                                                    </div>
                                                )}
                                            </th>
                                            <th style={{ padding: '1rem', width: '7%', textAlign: 'center' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={filteredOrders.length > 0 && selectedOrders.size === filteredOrders.filter(o => o.isComplete).length}
                                                    onChange={toggleSelectAll}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredOrders.map((order) => {
                                            const isB2B = order.type?.startsWith('b2b') || order.profiles?.role === 'b2b_client';
                                            const hasGPS = (order.latitude && order.longitude) || (order.profiles?.latitude && order.profiles?.longitude);
                                            const friendlyId = getFriendlyOrderId(order);

                                            return (
                                                <tr key={order.id} 
                                                    onClick={() => handleOrderClick(order)}
                                                    style={{ 
                                                        borderBottom: '1px solid #F1F5F9', 
                                                        transition: 'all 0.1s', 
                                                        cursor: 'pointer',
                                                        backgroundColor: !order.isComplete ? '#FFF1F2' : 'transparent'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = !order.isComplete ? '#FFE4E6' : '#F9FAFB'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = !order.isComplete ? '#FFF1F2' : 'transparent'}
                                                >
                                                    <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                                                        <div style={{ fontWeight: '900', fontSize: '0.9rem', color: '#0F172A', letterSpacing: '-0.01em', lineHeight: '1.2' }}>
                                                            {friendlyId}
                                                        </div>
                                                        {order.created_at && (
                                                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '600', marginTop: '2px', whiteSpace: 'nowrap' }}>
                                                                {formatCreatedAt(order.created_at)}
                                                            </div>
                                                        )}
                                                        <div style={{ marginTop: '4px' }}>
                                                            {isB2B ? (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', fontWeight: '800', color: '#4F46E5', backgroundColor: '#EEF2FF', padding: '1px 6px', borderRadius: '4px' }}>
                                                                    <Building2 size={10} strokeWidth={2} /> Institucional
                                                                </span>
                                                            ) : (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', fontWeight: '800', color: '#BE185D', backgroundColor: '#FCE7F3', padding: '1px 6px', borderRadius: '4px' }}>
                                                                    <Home size={10} strokeWidth={2} /> Hogar
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '0.8rem 1rem' }}>
                                                        <div style={{ fontWeight: '800', fontSize: '0.9rem', color: '#111827' }}>{order.customer_name}</div>
                                                        <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Phone size={10} strokeWidth={1.5} /> {order.customer_phone || 'Sin tel.'}</div>
                                                    </td>
                                                    <td style={{ padding: '0.8rem 1rem' }}>
                                                        <div style={{ fontSize: '0.8rem', color: '#374151', fontWeight: '600' }}>{order.shipping_address?.slice(0, 35)}...</div>
                                                        {hasGPS ? (
                                                            <span style={{ fontSize: '0.65rem', color: '#059669', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                <MapPin size={11} strokeWidth={2} /> GPS OK
                                                            </span>
                                                        ) : (
                                                            <span style={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                <AlertTriangle size={11} strokeWidth={2} /> SIN GPS
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.8rem 1rem', textAlign: 'left' }}>
                                                        {getChannelBadge(order.origin_source, isB2B)}
                                                    </td>
                                                    <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                                                        <div style={{ fontWeight: '800', color: '#1E293B', fontSize: '0.85rem' }}>
                                                            {formatNumber(order.total_weight_kg, 1)} kg
                                                        </div>
                                                        {order.item_count > 0 && (
                                                            <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: '600' }}>
                                                                {order.item_count} {order.item_count === 1 ? 'item' : 'items'}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.8rem 1rem', textAlign: 'right', fontWeight: '900', color: '#10B981', fontSize: '0.95rem' }}>
                                                        {formatMoney(order.total)}
                                                    </td>
                                                    <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                                                        <div style={{
                                                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: '900',
                                                            backgroundColor: order.status === 'pending_approval' ? '#FEF3C7' : order.status === 'approved' ? '#DCFCE7' : '#F3F4F6',
                                                            color: order.status === 'pending_approval' ? '#92400E' : order.status === 'approved' ? '#15803D' : '#4B5563'
                                                        }}>
                                                            {getStatusLabel(order.status)}
                                                        </div>
                                                        {!isB2B && (order.payment_method === 'contra_entrega' || order.paymentMethod?.toLowerCase().includes('contra') || order.paymentMethod?.toLowerCase().includes('puerta')) && order.payment_status !== 'Pagado' && (
                                                            <div style={{
                                                                marginTop: '4px',
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.58rem',
                                                                fontWeight: '800',
                                                                backgroundColor: '#FFFBEB',
                                                                color: '#B45309',
                                                                border: '1px solid #FDE68A',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '3px',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                <Coins size={10} strokeWidth={1.5} /> Cobrar en puerta
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '1rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedOrders.has(order.id)}
                                                            disabled={!order.isComplete}
                                                            onChange={(e) => { e.stopPropagation(); toggleSelectOrder(order.id); }}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.2rem' }}>
                                {filteredOrders.map(order => (
                                    <OrderCard 
                                        key={order.id} 
                                        order={order} 
                                        isSelected={selectedOrders.has(order.id)}
                                        onToggleSelect={() => toggleSelectOrder(order.id)}
                                        onClick={() => handleOrderClick(order)} 
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}

                <div style={{ textAlign: 'center', marginTop: '1.5rem', color: '#94A3B8', fontSize: '0.8rem', fontWeight: '700' }}>
                    {filteredOrders.length} pedido(s) encontrado(s) en {viewMode === 'table' ? 'vista lista' : 'vista cuadrícula'}
                </div>

                {/* Bulk Confirm Modal */}
                {showConfirmModal && (() => {
                    const selectedOrdersList = filteredOrders.filter(o => selectedOrders.has(o.id));
                    const unselectedOrdersCount = filteredOrders.length - selectedOrders.size;
                    const uniqueClients = new Set(selectedOrdersList.map(o => o.customer_name)).size;
                    const b2bCount = selectedOrdersList.filter(o => o.type?.startsWith('b2b') || o.profiles?.role === 'b2b_client').length;
                    const b2cCount = selectedOrdersList.length - b2bCount;
                    const totalWeight = selectedOrdersList.reduce((sum, o) => sum + (o.total_weight_kg || 0), 0);
                    const totalValue = selectedOrdersList.reduce((sum, o) => sum + (o.total || 0), 0);
                    
                    return (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: 'rgba(15, 23, 42, 0.85)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 2000, backdropFilter: 'blur(12px)', padding: '1rem'
                        }} onClick={() => setShowConfirmModal(false)}>
                            <div style={{
                                backgroundColor: '#0F172A',
                                borderRadius: '32px',
                                width: '95%',
                                maxWidth: '950px',
                                padding: '3.5rem',
                                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1) inset',
                                display: 'flex', flexDirection: 'column', gap: '2rem',
                                color: 'white',
                                position: 'relative',
                                overflow: 'hidden'
                            }} onClick={e => e.stopPropagation()}>
                                {/* Background glow effect */}
                                <div style={{ position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%', background: 'radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.15), transparent 50%)', pointerEvents: 'none' }} />

                                <div style={{ textAlign: 'center', zIndex: 1 }}>
                                     <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '1rem' }}>
                                         <Sparkles size={32} strokeWidth={1.5} style={{ color: '#10B981' }} />
                                     </div>
                                    <h2 style={{ margin: 0, fontSize: '2.2rem', fontWeight: '900', letterSpacing: '-0.03em', background: 'linear-gradient(to right, #FFFFFF, #94A3B8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                         Resumen de Lanzamiento
                                     </h2>
                                    <p style={{ color: '#94A3B8', marginTop: '0.8rem', fontSize: '1rem', lineHeight: '1.5', maxWidth: '85%', margin: '0.8rem auto 0' }}>
                                         Revisa los indicadores críticos antes de sincronizar esta carga con las áreas de Compras y Transporte.
                                     </p>
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', zIndex: 1 }}>
                                     {/* Left Column: Logistics & Finances */}
                                     <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                         <div style={{ fontSize: '0.8rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.1em' }}>MÉTRICAS DE LA TANDA</div>
                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                             <span style={{ color: '#E2E8F0', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Package size={14} strokeWidth={1.5} /> Pedidos a enviar</span>
                                             <span style={{ fontWeight: '900', fontSize: '1.3rem', color: 'white' }}>{selectedOrders.size}</span>
                                         </div>
                                         <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.05)' }} />
                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                             <span style={{ color: '#E2E8F0', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Building2 size={14} strokeWidth={1.5} /> Clientes Únicos</span>
                                             <span style={{ fontWeight: '900', fontSize: '1.3rem', color: '#38BDF8' }}>{uniqueClients}</span>
                                         </div>
                                         <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.05)' }} />
                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                             <span style={{ color: '#E2E8F0', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Scale size={14} strokeWidth={1.5} /> Peso Logístico Estimado</span>
                                             <span style={{ fontWeight: '900', fontSize: '1.3rem', color: '#FBBF24' }}>
                                                 {formatNumber(totalWeight, 1)} <span style={{fontSize:'0.8rem', color:'#94A3B8'}}>kg</span>
                                             </span>
                                         </div>
                                         <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.05)' }} />
                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                             <span style={{ color: '#E2E8F0', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Coins size={14} strokeWidth={1.5} /> Valor Bruto</span>
                                             <span style={{ fontWeight: '900', fontSize: '1.3rem', color: '#10B981' }}>
                                                 {formatMoney(totalValue)}
                                             </span>
                                         </div>
                                     </div>

                                    {/* Right Column: Breakdown & Alerts */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', padding: '1.5rem', flex: 1 }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.1em', marginBottom: '1.2rem' }}>SEGMENTACIÓN</div>
                                            <div style={{ display: 'flex', gap: '1rem' }}>
                                                <div style={{ flex: 1, backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#38BDF8' }}>{b2bCount}</div>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#BAE6FD', marginTop: '4px' }}>B2B Institucional</div>
                                                </div>
                                                <div style={{ flex: 1, backgroundColor: 'rgba(167, 139, 250, 0.1)', border: '1px solid rgba(167, 139, 250, 0.2)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#A78BFA' }}>{b2cCount}</div>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#DDD6FE', marginTop: '4px' }}>B2C Hogar</div>
                                                </div>
                                            </div>
                                        </div>

                                        {unselectedOrdersCount > 0 ? (
                                             <div style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '20px', padding: '1.2rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                                                 <div style={{ color: '#FDA4AF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlertTriangle size={24} strokeWidth={1.5} /></div>
                                                 <div>
                                                     <div style={{ fontWeight: '900', color: '#FDA4AF', fontSize: '0.9rem' }}>Dejaste {unselectedOrdersCount} pedido(s) por fuera</div>
                                                     <div style={{ fontSize: '0.75rem', color: '#FECDD3', marginTop: '4px', lineHeight: '1.4' }}>Hay pedidos en pantalla que no seleccionaste. Se quedarán congelados sin pasar a Compras.</div>
                                                 </div>
                                             </div>
                                         ) : (
                                             <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '20px', padding: '1.2rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                                                 <div style={{ color: '#6EE7B7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle2 size={24} strokeWidth={1.5} /></div>
                                                 <div>
                                                     <div style={{ fontWeight: '900', color: '#6EE7B7', fontSize: '0.9rem' }}>Cobertura Total</div>
                                                     <div style={{ fontSize: '0.75rem', color: '#A7F3D0', marginTop: '4px', lineHeight: '1.4' }}>Seleccionaste el 100% de la lista. Toda la operación está cubierta.</div>
                                                 </div>
                                             </div>
                                         )}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', zIndex: 1 }}>
                                    <button 
                                        onClick={() => setShowConfirmModal(false)}
                                        style={{
                                            flex: 1, padding: '1.2rem', backgroundColor: 'transparent', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s', fontSize: '1rem'
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'white'; }}
                                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                                    >
                                        Revisar de nuevo
                                    </button>
                                    <button 
                                        onClick={() => {
                                            setShowConfirmModal(false);
                                            handleBulkAction(targetStatusToConfirm);
                                        }}
                                        disabled={updateLoading}
                                        style={{
                                            flex: 2, padding: '1.2rem', backgroundColor: '#10B981', color: 'white', border: 'none', borderRadius: '16px', fontWeight: '900', cursor: updateLoading ? 'wait' : 'pointer', boxShadow: '0 8px 25px rgba(16, 185, 129, 0.4)', transition: 'all 0.2s', fontSize: '1.1rem', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                    >
                                        {updateLoading ? 'Procesando...' : 'FIRMAR Y LANZAR OPERACIÓN'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

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
                            maxWidth: '1100px',
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
                                        <span style={{
                                            padding: '4px 12px',
                                            borderRadius: '20px',
                                            fontSize: '0.75rem',
                                            fontWeight: '800',
                                            backgroundColor: 
                                                selectedOrder.status === 'pending_approval' ? '#FEF3C7' : 
                                                selectedOrder.status === 'approved' ? '#D1FAE5' :
                                                selectedOrder.status === 'picking' ? '#FEF08A' :
                                                selectedOrder.status === 'shipped' ? '#DBEAFE' : '#F1F5F9',
                                            color: 
                                                selectedOrder.status === 'pending_approval' ? '#92400E' : 
                                                selectedOrder.status === 'approved' ? '#065F46' :
                                                selectedOrder.status === 'picking' ? '#854D0E' :
                                                selectedOrder.status === 'shipped' ? '#1E40AF' : '#475569'
                                        }}>
                                            {getStatusLabel(selectedOrder.status)}
                                        </span>
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
                                        <div style={{ color: '#64748B', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                            <MapPin size={14} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                                            <span style={{ fontWeight: '700', color: '#334155' }}>{selectedOrder.shipping_address}</span>
                                            {selectedOrder.latitude && selectedOrder.longitude ? (
                                                <span style={{ fontSize: '0.68rem', backgroundColor: '#ECFDF5', color: '#065F46', padding: '2px 6px', borderRadius: '6px', fontWeight: '800', border: '1px solid #A7F3D0', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                    <CheckCircle2 size={10} /> GPS: {Number(selectedOrder.latitude).toFixed(4)}, {Number(selectedOrder.longitude).toFixed(4)}
                                                </span>
                                            ) : selectedOrder.profiles?.latitude && selectedOrder.profiles?.longitude ? (
                                                <span style={{ fontSize: '0.68rem', backgroundColor: '#F0F9FF', color: '#0369A1', padding: '2px 6px', borderRadius: '6px', fontWeight: '700', border: '1px solid #BAE6FD', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                    <Globe size={10} /> GPS Perfil: {Number(selectedOrder.profiles.latitude).toFixed(4)}, {Number(selectedOrder.profiles.longitude).toFixed(4)}
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '0.68rem', backgroundColor: '#FEF3C7', color: '#B45309', padding: '2px 6px', borderRadius: '6px', fontWeight: '800', border: '1px solid #FCD34D', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                    <AlertTriangle size={10} /> Sin GPS Propio
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: '#475569', alignItems: 'center' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Phone size={12} strokeWidth={1.5} /> {selectedOrder.customer_phone || 'Sin tel.'}</div>
                                            {selectedOrder.paymentMethod && (
                                                <div style={{ fontWeight: '700', color: '#166534', backgroundColor: '#DCFCE7', padding: '2px 6px', borderRadius: '4px' }}>
                                                    {selectedOrder.paymentMethod}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    {isOrderLocked() ? (
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            backgroundColor: '#F1F5F9',
                                            color: '#64748B',
                                            padding: '8px 16px',
                                            borderRadius: '12px',
                                            fontSize: '0.875rem',
                                            fontWeight: '700',
                                            border: '1px solid #CBD5E1'
                                        }}>
                                            <Lock size={14} style={{ color: '#EF4444' }} /> Edición Cerrada
                                        </div>
                                    ) : !editMode ? (
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
                                            <Edit2 size={12} strokeWidth={1.5} style={{ marginRight: '4px' }} /> Modificar
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
                                            {updateLoading ? 'Guardando...' : 'Guardar Cambios'}
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
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.2fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                            {/* Fecha de Entrega */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#065F46', marginBottom: '6px' }}>FECHA DE ENTREGA</label>
                                                <input 
                                                    type="date"
                                                    value={editDeliveryDate}
                                                    onChange={(e) => setEditDeliveryDate(e.target.value)}
                                                    onClick={(e) => (e.target as any).showPicker?.()}
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px',
                                                        borderRadius: '8px',
                                                        border: '1px solid #A7F3D0',
                                                        fontSize: '0.9rem',
                                                        cursor: 'pointer',
                                                        fontWeight: '700'
                                                    }}
                                                />
                                                <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#047857', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Info size={12} /> Mueve el pedido al día seleccionado.
                                                </p>
                                            </div>

                                            {/* Dirección Exclusiva del Pedido y Georreferenciación GPS */}
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#065F46' }}>
                                                        DIRECCIÓN DE ENTREGA (EXCLUSIVA PARA ESTE PEDIDO)
                                                    </label>
                                                    <span style={{ fontSize: '0.68rem', backgroundColor: '#E0F2FE', color: '#0369A1', padding: '2px 8px', borderRadius: '12px', fontWeight: '800', border: '1px solid #7DD3FC', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        <MapPin size={10} /> No altera la sucursal en Maestra
                                                    </span>
                                                </div>

                                                {!showAddressInput ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', backgroundColor: '#FFFFFF', padding: '8px 12px', borderRadius: '8px', border: '1px solid #A7F3D0' }}>
                                                        <div style={{ fontSize: '0.85rem', color: '#334155', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <MapPin size={14} strokeWidth={1.5} style={{ color: '#0D7A57', flexShrink: 0 }} />
                                                            <span>{editShippingAddress || 'Dirección por defecto de la sucursal'}</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowAddressInput(true)}
                                                            style={{
                                                                padding: '6px 12px',
                                                                borderRadius: '8px',
                                                                backgroundColor: '#0D7A57',
                                                                color: 'white',
                                                                border: 'none',
                                                                fontSize: '0.75rem',
                                                                fontWeight: '800',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                whiteSpace: 'nowrap',
                                                                boxShadow: '0 2px 4px rgba(13, 122, 87, 0.2)'
                                                            }}
                                                        >
                                                            <Edit3 size={13} /> Cambiar dirección para esta entrega
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <input 
                                                                type="text"
                                                                value={editShippingAddress}
                                                                onChange={(e) => {
                                                                    setEditShippingAddress(e.target.value);
                                                                    setGeocodedMessage(null);
                                                                }}
                                                                placeholder="Ej: Calle 63 # 77 - 73 Sede Especial"
                                                                style={{
                                                                    flex: 1,
                                                                    padding: '10px 12px',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid #A7F3D0',
                                                                    fontSize: '0.88rem',
                                                                    outline: 'none',
                                                                    fontWeight: '600'
                                                                }}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={handleGeocodeAddress}
                                                                disabled={isGeocoding}
                                                                title="Georreferenciar dirección y obtener coordenadas GPS para este pedido"
                                                                style={{
                                                                    padding: '0 12px',
                                                                    borderRadius: '8px',
                                                                    backgroundColor: '#0D7A57',
                                                                    color: 'white',
                                                                    border: 'none',
                                                                    fontSize: '0.78rem',
                                                                    fontWeight: '800',
                                                                    cursor: isGeocoding ? 'wait' : 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    whiteSpace: 'nowrap'
                                                                }}
                                                            >
                                                                {isGeocoding ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                                                                {isGeocoding ? 'Buscando GPS...' : 'Georreferenciar GPS'}
                                                            </button>
                                                        </div>
                                                        {geocodedMessage && (
                                                            <div style={{ marginTop: '6px', fontSize: '0.75rem', fontWeight: '700', color: editLatitude ? '#065F46' : '#B45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <MapPin size={12} /> {geocodedMessage}
                                                            </div>
                                                        )}
                                                        {editLatitude && editLongitude && !geocodedMessage && (
                                                            <div style={{ marginTop: '5px', fontSize: '0.73rem', color: '#047857', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <CheckCircle2 size={12} /> Coordenadas GPS asignadas al pedido: Lat {editLatitude.toFixed(4)}, Lng {editLongitude.toFixed(4)}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                         {/* Product Search */}
                                        <div style={{ position: 'relative' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#065F46' }}>
                                                    AGREGAR PRODUCTO (NOMBRE O SKU)
                                                </label>
                                                {!allowOffAgreement ? (
                                                    <span style={{ fontSize: '0.7rem', backgroundColor: '#FEF3C7', color: '#B45309', padding: '2px 8px', borderRadius: '12px', fontWeight: '800', border: '1px solid #F59E0B', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        <Lock size={11} /> Cliente Restringido solo a Convenio
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.7rem', backgroundColor: '#E0F2FE', color: '#0369A1', padding: '2px 8px', borderRadius: '12px', fontWeight: '800', border: '1px solid #7DD3FC', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        <Unlock size={11} /> Permite Fuera de Convenio
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <div style={{ position: 'relative', flex: 1 }}>
                                                    <input 
                                                        type="text"
                                                        placeholder={!allowOffAgreement ? "Buscar productos en convenio comercial..." : "Buscar productos para agregar..."}
                                                        value={productSearch}
                                                        onChange={(e) => { handleSearchProducts(e.target.value); setFocusedProductIndex(-1); }}
                                                        onKeyDown={handleProductSearchKeyDown}
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
                                                        <div style={{ position: 'absolute', right: '12px', top: '12px' }}>
                                                            <Loader2 size={16} className="animate-spin" style={{ color: '#059669' }} />
                                                        </div>
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
                                                    maxHeight: '280px',
                                                    overflowY: 'auto'
                                                }}>
                                                    {searchResults.map((prod, idx) => {
                                                        const isAgreePrice = agreementPricesMap[prod.id] !== undefined && agreementPricesMap[prod.id] !== null;
                                                        const resolvedPrice = isAgreePrice
                                                            ? Number(agreementPricesMap[prod.id])
                                                            : ((contractPrices[prod.id] !== undefined && contractPrices[prod.id] !== null)
                                                                ? Number(contractPrices[prod.id])
                                                                : (prod.base_price ? Number(prod.base_price) : 0));

                                                        return (
                                                            <div 
                                                                key={prod.id}
                                                                id={`search-item-${idx}`}
                                                                onClick={() => addProductToOrder(prod)}
                                                                className="search-item"
                                                                onMouseEnter={() => setFocusedProductIndex(idx)}
                                                                style={{
                                                                    padding: '12px 16px',
                                                                    cursor: 'pointer',
                                                                    borderBottom: '1px solid #F1F5F9',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    transition: 'background-color 0.2s',
                                                                    backgroundColor: idx === focusedProductIndex ? '#EFF6FF' : 'white'
                                                                }}
                                                            >
                                                                <div>
                                                                    <div style={{ fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <span>{prod.name}</span>
                                                                        {prod.accounting_id && <span style={{ fontSize: '0.8em', color: '#6B7280' }}>({prod.accounting_id})</span>}
                                                                    </div>
                                                                </div>
                                                                <div style={{ fontWeight: '800', color: '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <span>
                                                                        {formatMoney(resolvedPrice)}/{prod.unit_of_measure || 'Kg'}
                                                                    </span>
                                                                    {isAgreePrice ? (
                                                                        <span style={{ fontSize: '0.65rem', backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', padding: '2px 6px', borderRadius: '6px', fontWeight: '800' }}>
                                                                            Convenio
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.65rem', backgroundColor: '#F3F4F6', color: '#4B5563', border: '1px solid #E5E7EB', padding: '2px 6px', borderRadius: '6px', fontWeight: '800' }}>
                                                                            Lista General
                                                                        </span>
                                                                    )}
                                                                    {prod.options_config && prod.options_config.length > 0 && (
                                                                        <span style={{ fontSize: '0.65rem', backgroundColor: '#FEF3C7', color: '#D97706', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                                            ⚙️ Opciones
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {loadingItems ? (
                                    <div style={{ textAlign: 'center', padding: '5rem' }}>
                                        <div style={{ color: THEME.colors.textSecondary, marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}><PackageOpen size={48} strokeWidth={1.5} /></div>
                                        <p style={{ color: '#64748B', fontWeight: '600', fontSize: '1.125rem' }}>Preparando el detalle de los productos...</p>
                                    </div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ textAlign: 'left', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                                <th style={{ padding: '1rem 2rem', ...THEME.typography?.tableHeader }}>ID</th>
                                                <th style={{ padding: '1rem 2rem', ...THEME.typography?.tableHeader }}>PRODUCTO</th>
                                                <th style={{ padding: '1rem', ...THEME.typography?.tableHeader, textAlign: 'center' }}>CANTIDAD</th>
                                                <th style={{ padding: '1rem', ...THEME.typography?.tableHeader, textAlign: 'right' }}>PRECIO U.</th>
                                                <th style={{ padding: '1rem 2rem', ...THEME.typography?.tableHeader, textAlign: 'right' }}>SUBTOTAL</th>
                                                {editMode && <th style={{ width: '50px' }}></th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orderItems.map((item, idx) => (
                                                <tr key={idx} style={{ 
                                                    borderBottom: '1px solid #F1F5F9',
                                                    backgroundColor: item.isNew ? '#F0F9FF' : 'transparent'
                                                }}>
                                                    <td style={{ padding: '1.25rem 2rem', fontSize: '0.95rem', color: '#475569', fontWeight: '800' }}>
                                                         {item.products?.accounting_id || '-'}
                                                     </td>
                                                     <td style={{ padding: '1.25rem 2rem' }}>
                                                         <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '1rem' }}>
                                                             {item.products?.name}
                                                             {item.isNew && <span style={{ marginLeft: '8px', fontSize: '0.6rem', backgroundColor: '#0EA5E9', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>NUEVO</span>}
                                                         </div>
                                                         <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px', alignItems: 'center' }}>
                                                             {item.variant_label && (
                                                                  <div style={{ fontSize: '0.75rem', color: '#0369A1', fontWeight: '700', backgroundColor: '#E0F2FE', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                      <Sparkles size={10} strokeWidth={1.5} /> {(() => {
                                                                          const cleaned = item.variant_label.replace(/\s*\((Nota|Entr):[^\)]*\)/g, '').trim();
                                                                          return cleaned;
                                                                      })()}
                                                                  </div>
                                                             )}
                                                             {(() => {
                                                                 const exc = clientExceptions.find(e => e.product_id === (item.product_id || item.products?.id));
                                                                 return (
                                                                     <>
                                                                         {exc?.picking_note && (
                                                                             <div style={{ fontWeight: '600', color: '#D97706', fontSize: '0.75rem', backgroundColor: '#FEF3C7', padding: '2px 8px', borderRadius: '4px', border: '1px solid #FCD34D', display: 'inline-flex', alignItems: 'center' }}>
                                                                                 Nota: {exc.picking_note}
                                                                             </div>
                                                                         )}
                                                                         {exc?.delivery_note && (
                                                                             <div style={{ fontWeight: '600', color: '#4F46E5', fontSize: '0.75rem', backgroundColor: '#EEF2FF', padding: '2px 8px', borderRadius: '4px', border: '1px solid #C7D2FE', display: 'inline-flex', alignItems: 'center' }}>
                                                                                 Entr: {exc.delivery_note}
                                                                             </div>
                                                                         )}
                                                                         {!(item.unit_price) || parseFloat(item.unit_price.toString()) <= 0 ? (
                                                                             <span style={{ fontSize: '0.75rem', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                                                 ⚠️ Sin Precio
                                                                             </span>
                                                                         ) : contractPrices[item.product_id] !== undefined && contractPrices[item.product_id] !== null ? (
                                                                             customPriceIds.has(item.product_id) ? (
                                                                                 <span style={{ fontSize: '0.75rem', backgroundColor: '#E0F2FE', color: '#0369A1', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                                                     Tarifa Contrato
                                                                                 </span>
                                                                             ) : (
                                                                                 <span style={{ fontSize: '0.75rem', backgroundColor: '#FFF7ED', color: '#C2410C', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                                                     Tarifa B2C (Defecto)
                                                                                 </span>
                                                                             )
                                                                         ) : (
                                                                             <span style={{ fontSize: '0.75rem', backgroundColor: '#ECFDF5', color: '#047857', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                                                 Tarifa Asignada
                                                                             </span>
                                                                         )}
                                                                     </>
                                                                 );
                                                             })()}
                                                         </div>
                                                    </td>
                                                    <td style={{ padding: '1.25rem 1rem', textAlign: 'center' }}>
                                                        {editMode ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                                <input 
                                                                    type="number"
                                                                    step="any"
                                                                    value={item.quantity === 0 ? '' : item.quantity}
                                                                    onFocus={(e) => e.target.select()}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0);
                                                                        updateItemQuantity(idx, val);
                                                                    }}
                                                                    style={{ width: '75px', textAlign: 'center', padding: '6px', borderRadius: '8px', border: '1px solid #CBD5E1', fontWeight: '800', backgroundColor: 'white' }}
                                                                />
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
                                                                {formatNumber(item.quantity, 1)} 
                                                                <span style={{ fontSize: '0.75rem', color: '#64748B', marginLeft: '4px', fontWeight: '600' }}>
                                                                    {item.products?.unit_of_measure}
                                                                </span>
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '1.25rem 1rem', textAlign: 'right', color: '#1E293B', fontWeight: '800', fontSize: '0.95rem' }}>
                                                        {formatMoney(item.unit_price || 0)}
                                                    </td>
                                                    <td style={{ padding: '1.25rem 2rem', textAlign: 'right', fontWeight: '900', color: '#059669', fontSize: '1.125rem' }}>
                                                        {formatMoney((item.unit_price || 0) * item.quantity)}
                                                    </td>
                                                    {editMode && (
                                                        <td style={{ paddingRight: '1rem' }}>
                                                            <button 
                                                                onClick={() => removeItemFromOrder(idx)}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}
                                                                title="Eliminar de la orden"
                                                            >
                                                                <Trash2 size={16} strokeWidth={1.5} />
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                            {orderItems.length === 0 && (
                                                <tr>
                                                    <td colSpan={editMode ? 6 : 5} style={{ padding: '4rem', textAlign: 'center', color: '#94A3B8' }}>
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
                                        <div style={{ color: THEME.colors.textSecondary }}><Truck size={24} strokeWidth={1.5} /></div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase' }}>PESO TOTAL</div>
                                            <div style={{ fontWeight: '900', color: '#1E293B', fontSize: '1.125rem' }}>
                                                {formatNumber(currentWeight, 1)} kg
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ color: THEME.colors.textSecondary }}><Globe size={24} strokeWidth={1.5} /></div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase' }}>CANAL</div>
                                            <div style={{ marginTop: '2px' }}>
                                                {getChannelBadge(selectedOrder.origin_source)}
                                            </div>
                                        </div>
                                    </div>
                                    {selectedOrder.document_url && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ color: '#3B82F6' }}><FileText size={24} strokeWidth={1.5} /></div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase' }}>DOCUMENTO</div>
                                                <div style={{ marginTop: '2px' }}>
                                                    <a 
                                                        href={selectedOrder.document_url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        style={{ 
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            backgroundColor: '#EFF6FF', 
                                                            color: '#1D4ED8', 
                                                            padding: '2px 8px', 
                                                            borderRadius: '6px', 
                                                            fontWeight: '800', 
                                                            fontSize: '0.75rem',
                                                            border: '1px solid #BFDBFE',
                                                            textDecoration: 'none',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onMouseEnter={e => {
                                                            e.currentTarget.style.backgroundColor = '#DBEAFE';
                                                        }}
                                                        onMouseLeave={e => {
                                                            e.currentTarget.style.backgroundColor = '#EFF6FF';
                                                        }}
                                                    >
                                                        Ver Anexo ↗
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end', marginBottom: '8px' }}>
                                        <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                                            <span>Subtotal (Neto): </span>
                                            <span style={{ fontWeight: '700', color: '#334155' }}>{formatMoney(currentSubtotal)}</span>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                                            <span>IVA Estimado: </span>
                                            <span style={{ fontWeight: '700', color: '#334155' }}>{formatMoney(currentTax)}</span>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.875rem', color: '#64748B', fontWeight: '700', marginBottom: '4px' }}>TOTAL CONSOLIDADO</div>
                                    <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#059669', lineHeight: '1' }}>
                                        {formatMoney(currentTotal)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- VARIANT SELECTION MODAL (SUB-MODAL) --- */}
                {selectedProductForVariant && (() => {
                    const exc = clientExceptions.find(e => e.product_id === selectedProductForVariant.id);
                    
                    // Build full options list for unit selection (web_unit is first, if configured)
                    const optionsList = [];
                    const hasWebUnit = selectedProductForVariant.web_unit && selectedProductForVariant.web_conversion_factor;
                    
                    if (hasWebUnit) {
                        optionsList.push({
                            unit: selectedProductForVariant.web_unit,
                            factor: parseFloat(selectedProductForVariant.web_conversion_factor) || 1,
                            label: `${selectedProductForVariant.web_unit} (${selectedProductForVariant.web_conversion_factor} ${selectedProductForVariant.unit_of_measure})`
                        });
                    }
                    
                    if (!hasWebUnit || selectedProductForVariant.unit_of_measure !== selectedProductForVariant.web_unit) {
                        optionsList.push({
                            unit: selectedProductForVariant.unit_of_measure || 'Kg',
                            factor: 1,
                            label: `${selectedProductForVariant.unit_of_measure || 'Kg'} (Base)`
                        });
                    }
                    
                    const itemConversions = conversions.filter(c => c.product_id === selectedProductForVariant.id);
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

                    return (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 3000, 
                            backdropFilter: 'blur(3px)',
                            padding: '1rem'
                        }} onClick={() => setSelectedProductForVariant(null)}>
                            <div 
                                style={{ 
                                    backgroundColor: 'white', 
                                    padding: '2rem', 
                                    borderRadius: '24px', 
                                    width: '95%', 
                                    maxWidth: '820px', 
                                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', 
                                    position: 'relative',
                                    textAlign: 'left'
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

                                {/* Flex container for header */}
                                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '1rem', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                                        {selectedProductForVariant.image_url ? (
                                            <img 
                                                src={selectedProductForVariant.image_url} 
                                                alt={selectedProductForVariant.name}
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
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: '0 4px 10px rgba(0,0,0,0.04)'
                                            }}>
                                                <span style={{ fontSize: '1.8rem', color: '#9CA3AF' }}>📦</span>
                                            </div>
                                        )}
                                        <div>
                                            <h3 style={{ fontSize: '1.6rem', fontWeight: '900', color: '#111827', margin: 0 }}>{selectedProductForVariant.name}</h3>
                                            <p style={{ color: '#6B7280', fontSize: '0.85rem', margin: '4px 0 0 0', fontWeight: '600' }}>
                                                Personaliza tu producto:
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Client notes box */}
                                {exc && (
                                    <div style={{
                                        backgroundColor: '#FEF3C7',
                                        border: '1px solid #FCD34D',
                                        borderRadius: '12px',
                                        padding: '0.8rem 1.2rem',
                                        margin: '0.5rem 0 1.2rem 0',
                                        textAlign: 'left',
                                        fontSize: '0.8rem',
                                        color: '#92400E',
                                        lineHeight: '1.4'
                                    }}>
                                        <div style={{ fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase', fontSize: '0.7rem', color: '#B45309', letterSpacing: '0.05em' }}>
                                            📌 REQUERIMIENTOS DEL CLIENTE:
                                        </div>
                                        {exc.nickname && exc.nickname.trim().toLowerCase() !== selectedProductForVariant.name.trim().toLowerCase() && (
                                            <div><strong>Nombre/Alias:</strong> {exc.nickname}</div>
                                        )}
                                        {exc.picking_note && <div><strong>Nota:</strong> {exc.picking_note}</div>}
                                        {exc.delivery_note && <div><strong>Nota Entrega:</strong> {exc.delivery_note}</div>}
                                    </div>
                                )}

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
                                        onClick={() => alert("Para editar las variantes Estructurales, por favor ve al panel de catálogo de productos o a la creación del pedido.")}
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
                                            if (window.confirm("¿Quieres crear una nueva equivalencia? Te redirigiremos al catálogo de productos.")) {
                                                setSelectedProductForVariant(null);
                                                window.location.href = '/admin/products';
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

                                {/* Options Rendering */}
                                {selectedProductForVariant.options_config?.map((opt: any, index: number) => (
                                    <div key={opt.name} style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {opt.name}
                                        </label>
                                        <select
                                            id={`modal-select-${index}`}
                                            value={selectedOptions[opt.name] || ''}
                                            onChange={(e) => setSelectedOptions(prev => ({ ...prev, [opt.name]: e.target.value }))}
                                            onKeyDown={(e) => handleSelectKeyDown(e, index, selectedProductForVariant.options_config.length)}
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

                                {/* Quantity & Unit select grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', margin: '1.5rem 0', textAlign: 'left' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Cantidad
                                        </label>
                                        <input
                                            id="modal-qty-input"
                                            type="text"
                                            value={variantQuantity}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(',', '.');
                                                setVariantQuantity(val);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    const unitSel = document.getElementById('modal-unit-select');
                                                    if (unitSel) {
                                                        unitSel.focus();
                                                    } else {
                                                        confirmVariantAdd();
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
                                                backgroundColor: '#F9FAFB',
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
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Unidad de Medida
                                        </label>
                                        <select
                                            id="modal-unit-select"
                                            value={selectedUnit}
                                            onChange={(e) => {
                                                const opt = optionsList.find(o => o.unit === e.target.value);
                                                if (opt) {
                                                    setSelectedUnit(opt.unit);
                                                    setSelectedConversionFactor(opt.factor);
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Tab' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    const addBtn = document.getElementById('modal-add-button');
                                                    if (addBtn) addBtn.focus();
                                                } else if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    confirmVariantAdd();
                                                }
                                            }}
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
                                            {optionsList.map(o => (
                                                <option key={o.unit} value={o.unit}>{o.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Panel de Equivalencias Premium */}
                                {itemConversions.length > 0 && (
                                    <div style={{
                                        margin: '1.5rem 0',
                                        padding: '1rem',
                                        backgroundColor: '#F0FDF4',
                                        borderRadius: '12px',
                                        border: '1px solid #DCFCE7',
                                        textAlign: 'left'
                                    }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#15803D', marginBottom: '8px' }}>
                                            ⚖️ Conversiones de Equivalencia Sugeridas
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {itemConversions.map(c => {
                                                const isSelected = selectedUnit === c.from_unit;
                                                return (
                                                    <button
                                                        key={c.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedUnit(c.from_unit);
                                                            setSelectedConversionFactor(parseFloat(c.conversion_factor) || 1);
                                                        }}
                                                        style={{
                                                            backgroundColor: isSelected ? '#DCFCE7' : 'white',
                                                            border: `1px solid ${isSelected ? '#15803D' : '#CBD5E1'}`,
                                                            color: isSelected ? '#15803D' : '#334155',
                                                            padding: '6px 12px',
                                                            borderRadius: '8px',
                                                            fontSize: '0.85rem',
                                                            fontWeight: '700',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        {c.from_unit} ({c.conversion_factor} {c.to_unit})
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Footer buttons */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
                                    <button 
                                        onClick={() => setSelectedProductForVariant(null)}
                                        style={{ padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', backgroundColor: 'white', fontWeight: '700', color: '#64748B', cursor: 'pointer' }}
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        id="modal-add-button"
                                        onClick={confirmVariantAdd}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === 'Tab') {
                                                e.preventDefault();
                                                confirmVariantAdd();
                                            }
                                        }}
                                        style={{ padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: '#059669', color: 'white', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(5, 150, 105, 0.2)' }}
                                    >
                                        Agregar
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* MODAL INTERACTIVO DE GEORREFERENCIACIÓN GPS */}
                {isMapPickerOpen && (
                    <div 
                        style={{
                            position: 'fixed',
                            inset: 0,
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            backdropFilter: 'blur(6px)',
                            zIndex: 3000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '1rem'
                        }}
                        onClick={() => setIsMapPickerOpen(false)}
                    >
                        <div 
                            style={{
                                backgroundColor: 'white',
                                borderRadius: '24px',
                                width: '95%',
                                maxWidth: '920px',
                                maxHeight: '92vh',
                                display: 'flex',
                                flexDirection: 'column',
                                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                                overflow: 'hidden',
                                border: '1px solid rgba(255,255,255,0.2)'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div style={{
                                padding: '1.25rem 1.75rem',
                                borderBottom: '1px solid #E2E8F0',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: 'linear-gradient(to right, #F8FAFC, #FFFFFF)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <MapPin size={20} style={{ color: '#0D7A57' }} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: '#0F172A' }}>
                                            Georreferenciación GPS de Pedido
                                        </h3>
                                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>
                                            Ajuste de ubicación de entrega para {selectedOrder?.customer_name || 'este pedido'} ({getFriendlyOrderId(selectedOrder)})
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <button
                                        type="button"
                                        onClick={() => handleSmartGeocodeInModal()}
                                        disabled={isGeocoding}
                                        title="Georreferenciar automáticamente la dirección usando Inteligencia Artificial"
                                        style={{
                                            backgroundColor: '#0D7A57',
                                            color: 'white',
                                            border: 'none',
                                            padding: '0.5rem 1.1rem',
                                            borderRadius: '10px',
                                            fontSize: '0.78rem',
                                            fontWeight: '800',
                                            cursor: isGeocoding ? 'wait' : 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            boxShadow: '0 2px 5px rgba(13, 122, 87, 0.25)',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {isGeocoding ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                        {isGeocoding ? 'Buscando...' : 'Pin inteligente (IA)'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsMapPickerOpen(false)}
                                        style={{ background: '#F1F5F9', border: 'none', width: '36px', height: '36px', borderRadius: '10px', fontSize: '1.1rem', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '1.5rem', alignItems: 'start' }}>
                                    {/* Left Column: Form & Coordinates */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                DIRECCIÓN DE ENTREGA (EXCLUSIVA DE ESTE PEDIDO)
                                            </label>
                                            <input 
                                                type="text"
                                                value={tempAddress}
                                                onChange={(e) => setTempAddress(e.target.value)}
                                                placeholder="Ej: Calle 63 # 77 - 73"
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.88rem', fontWeight: '600', outline: 'none' }}
                                            />
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div>
                                                <label style={{ fontSize: '0.68rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                    CIUDAD / MNPIO
                                                </label>
                                                <input 
                                                    type="text"
                                                    value={tempCity}
                                                    onChange={(e) => setTempCity(e.target.value)}
                                                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: '700', backgroundColor: '#F8FAFC' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.68rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                    DEPARTAMENTO
                                                </label>
                                                <input 
                                                    type="text"
                                                    value="Cundinamarca"
                                                    readOnly
                                                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: '700', backgroundColor: '#F8FAFC' }}
                                                />
                                            </div>
                                        </div>

                                        {/* PANEL DE GEOCERCAS MANUAL */}
                                        <div style={{ backgroundColor: '#F8FAFC', padding: '1.2rem', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#475569', marginBottom: '0.8rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                GEOCERCAS (LAT/LNG)
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '4px' }}>LAT</label>
                                                    <input 
                                                        type="number"
                                                        step="0.000001"
                                                        value={tempLat}
                                                        onChange={(e) => setTempLat(parseFloat(e.target.value) || tempLat)}
                                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: '800', color: '#0F172A', outline: 'none' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '4px' }}>LNG</label>
                                                    <input 
                                                        type="number"
                                                        step="0.000001"
                                                        value={tempLng}
                                                        onChange={(e) => setTempLng(parseFloat(e.target.value) || tempLng)}
                                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: '800', color: '#0F172A', outline: 'none' }}
                                                    />
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#D97706', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <AlertTriangle size={13} /> AJUSTE MANUAL (VERIFICA EN MAPA)
                                            </div>
                                        </div>

                                        {tempGeocodeMsg && (
                                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#047857', backgroundColor: '#ECFDF5', padding: '8px 12px', borderRadius: '8px', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <CheckCircle2 size={13} /> {tempGeocodeMsg}
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Column: Interactive Map Box */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                        <div style={{ height: '320px', width: '100%', borderRadius: '16px', overflow: 'hidden', border: '1px solid #CBD5E1', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', position: 'relative' }}>
                                            <div ref={mapPickerContainerRef} style={{ width: '100%', height: '100%' }} />
                                        </div>
                                        <div style={{ backgroundColor: '#ECFDF5', padding: '0.8rem 1rem', borderRadius: '12px', fontSize: '0.75rem', color: '#065F46', fontWeight: '700', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Sparkles size={14} style={{ color: '#059669', flexShrink: 0 }} />
                                            <span>Tip: Puedes arrastrar el marcador rojo en el mapa para ubicar el punto de entrega exacto si la dirección es ambigua.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div style={{ padding: '1rem 1.75rem', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '1rem', backgroundColor: '#F8FAFC' }}>
                                <button 
                                    type="button"
                                    onClick={() => setIsMapPickerOpen(false)}
                                    style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #CBD5E1', backgroundColor: 'white', fontWeight: '700', color: '#64748B', cursor: 'pointer', fontSize: '0.85rem' }}
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="button"
                                    onClick={handleConfirmMapCoordinates}
                                    style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', backgroundColor: '#0D7A57', color: 'white', fontWeight: '800', cursor: 'pointer', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 6px -1px rgba(13, 122, 87, 0.3)' }}
                                >
                                    <CheckCircle2 size={16} /> Confirmar Coordenadas GPS para este Pedido
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                    </>
                ) : activeTab === 'emails' ? (
                    <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, marginTop: '1rem', padding: '1.5rem' }}>
                        <EmailDraftsModule onDraftsChange={(count) => setPendingEmailCount(count)} />
                    </div>
                ) : (
                    <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, marginTop: '1rem', padding: '1.5rem' }}>
                        <EmailOutboxModule onOutboxChange={(count) => setSentEmailCount(count)} />
                    </div>
                )}
            </div>
        </div>
    );
}

function KPICard({ title, value, icon, color, subtitle }: { title: string, value: number | string, icon: any, color: string, subtitle: string }) {
    return (
        <div style={{
            backgroundColor: THEME.colors.surface,
            padding: '1.2rem',
            borderRadius: THEME.radius.lg,
            boxShadow: THEME.shadow.sm,
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            border: `1px solid ${THEME.colors.border}`,
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = THEME.shadow.lg;
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = THEME.shadow.sm;
        }}>
            <div style={{ backgroundColor: `${color}10`, width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: color, flexShrink: 0 }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: THEME.colors.textMain, margin: '2px 0', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: '700' }}>{subtitle}</div>
            </div>
        </div>
    );
}

function OrderCard({ order, isSelected, onToggleSelect, onClick }: any) {
    const isB2B = order.type?.startsWith('b2b') || order.profiles?.role === 'b2b_client';
    const friendlyId = getFriendlyOrderId(order);

    return (
        <div 
            onClick={onClick}
            style={{
                padding: '1.2rem',
                borderRadius: '16px',
                border: '1px solid #E5E7EB',
                boxShadow: isSelected ? '0 0 0 2px #6366F1' : '0 2px 8px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.2s',
                opacity: order.isComplete ? 1 : 0.8,
                backgroundColor: !order.isComplete ? '#FFF1F2' : 'white'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ fontWeight: '900', fontSize: '1.1rem', color: '#111827' }}>{friendlyId}</div>
                        {order.created_at && (
                            <span style={{ fontSize: '0.68rem', color: '#475569', fontWeight: '700', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', padding: '1px 6px', borderRadius: '5px', letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>
                                {formatCreatedAt(order.created_at)}
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '0.7rem', fontWeight: '900', color: isB2B ? '#6366F1' : '#EC4899', marginTop: '3px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span>{isB2B ? 'CORPORATIVO' : 'CONSUMIDOR'}</span>
                        {getChannelBadge(order.origin_source)}
                    </div>
                </div>
                <div style={{
                    padding: '4px 10px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: '900',
                    backgroundColor: order.status === 'pending_approval' ? '#FEF3C7' : '#DCFCE7',
                    color: order.status === 'pending_approval' ? '#92400E' : '#15803D',
                    height: 'fit-content'
                }}>
                    {getStatusLabel(order.status)}
                </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#111827' }}>{order.customer_name}</div>
                <div style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: '4px' }}>{order.shipping_address?.slice(0, 45)}...</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F3F4F6', paddingTop: '0.8rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '900', color: '#10B981' }}>{formatMoney(order.total)}</div>
                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94A3B8' }}>{formatNumber(order.total_weight_kg, 1)} kg</div>
            </div>

            <div 
                onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
                style={{
                    position: 'absolute', top: '12px', right: '12px',
                    width: '24px', height: '24px', borderRadius: '50%',
                    border: '2px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isSelected ? '#6366F1' : 'white',
                    color: 'white', fontSize: '0.8rem'
                }}
            >
                {isSelected && '✓'}
            </div>
        </div>
    );
}
