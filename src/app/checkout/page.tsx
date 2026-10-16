'use client';

import { useState, useEffect, useMemo } from 'react';
import { useCart } from '../../lib/cartContext';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Map } from '@vis.gl/react-google-maps';
import { Polygon } from '@/components/admin/GeofencingManager';
import { isAbortError } from '../../lib/errorUtils';
import { isInsidePolygon, Point } from '../../lib/geoUtils';
import { DEFAULT_CUTOFF_HOUR } from '../../lib/constants';
import { translations, Locale } from '../../lib/translations';
 import { useSearchParams } from 'next/navigation';
import { 
    Plus,
    Bell,
    Trash2, 
    MapPin, 
    Map as MapIcon, 
    Loader2, 
    CheckCircle2, 
    CreditCard, 
    Rocket, 
    ShoppingCart, 
    User,
    Phone,
    Mail,
    Calendar,
    AlertCircle,
    AlertTriangle,
    Info,
    X,
    ShieldCheck,
    Truck,
    Lock as LockIcon,
    Pencil,
    RotateCcw,
    ArrowLeft,
    ShoppingBag,
    Package,
    Edit3,
    Gift,
    UserCheck,
    FileText,
    Banknote,
    Building2,
    Home,
    Receipt,
    ChevronDown,
    ChevronUp,
    Sparkles,
    Clock,
    Zap,
    Leaf,
    RefreshCw,
    Check,
    Heart,
    UserPlus,
    CalendarClock,
    BookmarkCheck
} from 'lucide-react';
import { useAuth } from '../../lib/authContext';
import { getNextValidDeliveryDate, isValidDeliveryDate, parseStoreVacationConfig, StoreVacationConfig } from '@/lib/colombianHolidays';
import dynamic from 'next/dynamic';
import GooglePlacesAddressInput from '@/components/checkout/GooglePlacesAddressInput';

const QuickViewModal = dynamic(() => import('../../components/QuickViewModal'), { ssr: false });

export default function CheckoutPage() {
    const { items, totalPrice, removeItem, clearCart, updateItemQuantity, addItem } = useCart();
    const [isMounted, setIsMounted] = useState(false);
    const [loadingLastOrder, setLoadingLastOrder] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'wompi' | 'contra_entrega' | 'payroll_deduction'>('wompi');
    const [isCollaborator, setIsCollaborator] = useState(false);
    const [collaboratorInfo, setCollaboratorInfo] = useState<{ id?: string; contact_name?: string; document_id?: string; role?: string } | null>(null);
    const [name, setName] = useState('');
    const [identification, setIdentification] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [addressDetails, setAddressDetails] = useState('');
    const [buildingComplex, setBuildingComplex] = useState('');
    const [unitDetails, setUnitDetails] = useState('');
    const [includePackagingFee, setIncludePackagingFee] = useState(true);
    const [acceptHabeasData, setAcceptHabeasData] = useState(true);
    const [date, setDate] = useState('');
    const [minOrder, setMinOrder] = useState(150000);
    const [deliveryFee, setDeliveryFee] = useState(20000);
    const [maxOrderHogarCod, setMaxOrderHogarCod] = useState(400000);
    const [storeStatus, setStoreStatus] = useState<'open' | 'vacation_preorder' | 'closed'>('open');
    const [vacationConfig, setVacationConfig] = useState<StoreVacationConfig | null>(null);
    const [allowSundays, setAllowSundays] = useState(false);
    const [allowHolidays, setAllowHolidays] = useState(false);
    const [cartSavedForReopen, setCartSavedForReopen] = useState(false);
    const [isEditingDeliveryInfo, setIsEditingDeliveryInfo] = useState(false);
    const [showDetailItemsModal, setShowDetailItemsModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingCartItem, setEditingCartItem] = useState<any | null>(null);
    const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
    const [minDeliveryDate, setMinDeliveryDate] = useState('');
    const [latitude, setLatitude] = useState<number | null>(null);
    const [longitude, setLongitude] = useState<number | null>(null);
    const [isGettingLocation, setIsGettingLocation] = useState(false);
    const [isRegisteringRejection, setIsRegisteringRejection] = useState(false);
    const [showMapPicker, setShowMapPicker] = useState(false);
    const [b2cGeofence, setB2cGeofence] = useState<Point[]>([]);
    const [b2bGeofence, setB2bGeofence] = useState<Point[]>([]);
    const [outOfZone, setOutOfZone] = useState(false);
    const [specialNotes, setSpecialNotes] = useState('');
    const [notesJustSaved, setNotesJustSaved] = useState(false);
    const [isProfileMatched, setIsProfileMatched] = useState(false);
    const [isProfileUnlocked, setIsProfileUnlocked] = useState(false);
    const [maskedName, setMaskedName] = useState('');
    const [maskedAddress, setMaskedAddress] = useState('');
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const [resolvedAddressPreview, setResolvedAddressPreview] = useState<string>('');
    const [isResolvingAddress, setIsResolvingAddress] = useState<boolean>(false);
    const [addressSyncNotice, setAddressSyncNotice] = useState<string | null>(null);
    const [originalAddress, setOriginalAddress] = useState('');
    const [originalCoords, setOriginalCoords] = useState<{lat: number, lng: number} | null>(null);
    const [matchedProfileId, setMatchedProfileId] = useState<string | null>(null);
    const [unlockedEmail, setUnlockedEmail] = useState('');
    const [unlockedId, setUnlockedId] = useState('');
    const [unlockedPhone, setUnlockedPhone] = useState('');
    const { profile } = useAuth();
    const searchParams = useSearchParams();
    
    const [showConfirmationModal, setShowConfirmationModal] = useState(false);
    const [isGiftForRecipient, setIsGiftForRecipient] = useState(false);
    const [recipientName, setRecipientName] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [beneficiaries, setBeneficiaries] = useState<any[]>([]);
    const [selectedBeneficiaryIdx, setSelectedBeneficiaryIdx] = useState<number | 'new' | null>(null);
    const [checkoutNotice, setCheckoutNotice] = useState<{ message: string; type: 'error' | 'success' | 'warning' | 'info' } | null>(null);
    const [requiresInvoiceWithNit, setRequiresInvoiceWithNit] = useState(false);
    const [companyNit, setCompanyNit] = useState('');
    const [companyBusinessName, setCompanyBusinessName] = useState('');
    const [showCartItemsList, setShowCartItemsList] = useState(false);
    const [isEditingBuyerInfo, setIsEditingBuyerInfo] = useState(false);

    const notify = (message: string, type: 'error' | 'success' | 'warning' | 'info' = 'info') => {
        setCheckoutNotice({ message, type });
        if (typeof window !== 'undefined' && (window as any).showToast) {
            const toastType = type === 'warning' ? 'info' : type;
            (window as any).showToast(message, toastType);
        }
        setTimeout(() => {
            setCheckoutNotice(prev => (prev?.message === message ? null : prev));
        }, 8000);
    };

    const itemBreakdownSummary = useMemo(() => {
        if (!items || items.length === 0) return '';
        const unitCounts: Record<string, number> = {};

        items.forEach(item => {
            const qty = item.quantity || 1;
            let u = (item.unit || 'Unidad').trim();
            const uLower = u.toLowerCase();
            if (uLower.includes('libra') || uLower.includes('lb') || uLower.includes('pound')) {
                u = 'Libra';
            } else if (uLower.includes('bandeja')) {
                u = 'Bandeja';
            } else if (uLower.includes('bolsa')) {
                u = 'Bolsa';
            } else if (uLower.includes('kg') || uLower.includes('kilo')) {
                u = 'Kg';
            } else if (uLower.includes('un')) {
                u = 'Unidad';
            }
            unitCounts[u] = (unitCounts[u] || 0) + qty;
        });

        const parts = Object.entries(unitCounts).map(([unitName, count]) => {
            let unitLabel = unitName;
            if (count > 1) {
                const lower = unitName.toLowerCase();
                if (!lower.endsWith('s')) {
                    unitLabel = lower.endsWith('d') ? `${unitName}es` : `${unitName}s`;
                }
            }
            return `${count} ${unitLabel}`;
        });

        return parts.join(', ');
    }, [items]);

    const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
    const t = translations[locale];
    
    const taxAmount = items.reduce((totalTax, item) => {
        const rate = Number(item.iva_rate) || 0;
        if (rate <= 0) return totalTax;
        
        // Precio incluye IVA -> IVA = TotalLíneaRedondeado * (Rate / (100 + Rate))
        const itemTotal = Math.ceil((item.price * item.quantity) / 50) * 50;
        const itemTax = itemTotal * (rate / (100 + rate));
        
        return totalTax + itemTax;
    }, 0);

    const roundedTaxAmount = Math.round(taxAmount);
    const roundedSubtotal = Math.round(totalPrice - roundedTaxAmount);

    const isB2B = profile?.role === 'b2b_client';
    const activeGeofence = isB2B ? (b2bGeofence.length > 0 ? b2bGeofence : b2cGeofence) : b2cGeofence;

    const CRATE_PRODUCT_ID = 'c13cfedc-c803-495b-9b9d-71a54d472aa3';
    const [packagingMode, setPackagingMode] = useState<'plastic_bags' | 'buy_crate' | 'own_crate'>('plastic_bags');
    const [crateUnitPrice, setCrateUnitPrice] = useState(25000);
    const [crateProductName, setCrateProductName] = useState('Canastilla frutal (Naranja)');
    const [avgKgPerCrate, setAvgKgPerCrate] = useState(12.5);

    const [packagingFeeEnabled, setPackagingFeeEnabled] = useState(true);
    const [packagingFeePercentage, setPackagingFeePercentage] = useState(3);
    const [packagingFeeNote, setPackagingFeeNote] = useState('Para garantizar la inocuidad, higiene y conservación de tus alimentos frescos, todos los pedidos se entregan empacados en bolsas plásticas.');

    useEffect(() => {
        const fetchPackagingSettings = async () => {
            try {
                const [settingsRes, crateRes, logisticRes] = await Promise.all([
                    supabase
                        .from('app_settings')
                        .select('key, value')
                        .in('key', ['packaging_fee_enabled', 'packaging_fee_percentage', 'packaging_fee_note']),
                    supabase
                        .from('products')
                        .select('id, name, display_name, base_price')
                        .eq('id', CRATE_PRODUCT_ID)
                        .maybeSingle(),
                    supabase
                        .from('logistic_parameters')
                        .select('id, value')
                        .eq('id', 'avg_kg_per_crate')
                        .maybeSingle()
                ]);

                if (settingsRes.data) {
                    settingsRes.data.forEach(s => {
                        if (s.key === 'packaging_fee_enabled') setPackagingFeeEnabled(s.value === 'true');
                        if (s.key === 'packaging_fee_percentage') setPackagingFeePercentage(parseFloat(s.value) || 3);
                        if (s.key === 'packaging_fee_note') setPackagingFeeNote(s.value || '');
                    });
                }
                if (crateRes.data) {
                    const dbPrice = Number(crateRes.data.base_price);
                    if (!isNaN(dbPrice) && dbPrice > 0) setCrateUnitPrice(dbPrice);
                    const rawName = crateRes.data.display_name || crateRes.data.name || 'Canastilla frutal';
                    setCrateProductName(rawName.toLowerCase().includes('naranja') ? rawName : `${rawName} (Naranja)`);
                }
                if (logisticRes.data?.value) {
                    const val = parseFloat(logisticRes.data.value);
                    if (!isNaN(val) && val > 0) setAvgKgPerCrate(val);
                }
            } catch (err) {
                console.error('Error loading packaging settings:', err);
            }
        };
        fetchPackagingSettings();
    }, []);

    const crateCartItem = useMemo(() => items.find(i => i.id === CRATE_PRODUCT_ID), [items]);
    const crateQuantity = crateCartItem?.quantity || 0;

    // Cálculo dinámico de peso real de alimentos y cubicaje oficial según estándar de transporte
    const produceWeightKg = useMemo(() => {
        return items
            .filter(i => i.id !== CRATE_PRODUCT_ID)
            .reduce((sum, item) => {
                const unitLower = (item.unit || '').toLowerCase();
                const isWeightUnit = ['kg', 'kilo', 'kilos'].includes(unitLower);
                const isLibra = ['libra', 'libras'].includes(unitLower);
                const uw = item.weight_kg !== undefined ? item.weight_kg : (isWeightUnit ? 1 : isLibra ? 0.5 : 0);
                return sum + (uw * item.quantity);
            }, 0);
    }, [items]);

    const suggestedCrates = useMemo(() => {
        const capacity = avgKgPerCrate > 0 ? avgKgPerCrate : 12.5;
        return Math.max(1, Math.ceil((produceWeightKg || 1) / capacity));
    }, [produceWeightKg, avgKgPerCrate]);

    // Sincronizar modalidad de empaque con la presencia real de la canastilla en el carrito
    useEffect(() => {
        if (!isMounted) return;
        if (crateCartItem && packagingMode !== 'buy_crate') {
            setPackagingMode('buy_crate');
            setIncludePackagingFee(false);
        } else if (!crateCartItem && packagingMode === 'buy_crate') {
            setPackagingMode('plastic_bags');
            setIncludePackagingFee(true);
        }
    }, [crateCartItem, isMounted]);

    const handleSelectPackagingMode = (mode: 'plastic_bags' | 'buy_crate' | 'own_crate') => {
        setPackagingMode(mode);
        setIncludePackagingFee(mode === 'plastic_bags');

        if (mode === 'buy_crate') {
            if (!crateCartItem) {
                const initialQty = suggestedCrates;
                addItem({
                    id: CRATE_PRODUCT_ID,
                    name: crateProductName,
                    price: crateUnitPrice,
                    iva_rate: 0,
                    unit: 'Unidad',
                    quantity: initialQty,
                    weight_kg: 1.8
                });
                notify(
                    locale === 'es'
                        ? `Se agregaron ${initialQty} ${initialQty === 1 ? 'canastilla' : 'canastillas'} sugeridas (~${produceWeightKg.toFixed(1)} kg) según aforo logístico de transporte. Sin recargo de bolsas plásticas.`
                        : `Added ${initialQty} suggested crates (~${produceWeightKg.toFixed(1)} kg) per logistics standard. No plastic bag surcharge.`,
                    'success'
                );
            }
        } else {
            if (crateCartItem) {
                removeItem(crateCartItem.id, crateCartItem.name);
            }
        }
    };

    const handleCrateQuantityChange = (delta: number) => {
        if (!crateCartItem) return;
        const nextQty = crateQuantity + delta;
        if (nextQty <= 0) {
            handleSelectPackagingMode('plastic_bags');
            return;
        }
        updateItemQuantity(crateCartItem.id, crateCartItem.name, nextQty);
    };

    const foodItemsTotalPrice = useMemo(
        () => items.filter(i => i.id !== CRATE_PRODUCT_ID).reduce((sum, item) => sum + Math.ceil((item.price * item.quantity) / 50) * 50, 0),
        [items]
    );
    const previewPlasticFeeAmount = packagingFeeEnabled ? Math.round(foodItemsTotalPrice * (packagingFeePercentage / 100)) : 0;
    const packagingFeeAmount = (packagingFeeEnabled && packagingMode === 'plastic_bags') ? previewPlasticFeeAmount : 0;

    // Lógica Canónica de Domicilio B2C ($150.000 umbral gratis / $20.000 flete)
    const isFreeShipping = isB2B || foodItemsTotalPrice >= minOrder;
    const deliveryFeeAmount = isB2B ? 0 : (isFreeShipping ? 0 : deliveryFee);
    const missingForFreeShipping = Math.max(0, minOrder - foodItemsTotalPrice);
    const freeShippingProgress = minOrder > 0 ? Math.min(100, Math.round((foodItemsTotalPrice / minOrder) * 100)) : 100;

    // Beneficio Canónico Colaborador FruFresco: 5% de descuento en alimentos frescos (Escenario 229 SDD)
    const collaboratorDiscountAmount = isCollaborator ? Math.round(foodItemsTotalPrice * 0.05) : 0;

    // Redondear el total final de compra hacia abajo al próximo múltiplo de 50 (beneficio al usuario)
    const rawTotal = Math.max(0, (totalPrice - collaboratorDiscountAmount) + packagingFeeAmount + deliveryFeeAmount);
    const finalOrderTotal = Math.floor(rawTotal / 50) * 50;

    // Estándar Lufthansa Fast-Track: detección ejecutiva de cliente recurrente con datos completos
    const isKnownCustomer = useMemo(() => {
        if (isGiftForRecipient) {
            return Boolean(recipientName.trim() && recipientPhone.trim() && address.trim());
        }
        return Boolean(name.trim() && phone.trim() && address.trim());
    }, [isGiftForRecipient, recipientName, recipientPhone, name, phone, address]);

    // Monograma VIP iniciales para el cliente recurrente (Estándar Lufthansa First Class)
    const customerInitials = useMemo(() => {
        const targetName = isGiftForRecipient ? (recipientName || 'Destinatario') : (name || 'Cliente');
        const parts = targetName.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return 'FF';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }, [name, recipientName, isGiftForRecipient]);

    // Píldoras de fecha rápida de entrega (Instacart / Concierge Standard)
    const quickDates = useMemo(() => {
        if (!minDeliveryDate) return [];
        const dates: { dateStr: string; label: string; weekday: string }[] = [];
        let current = new Date(minDeliveryDate + 'T12:00:00Z');
        let count = 0;
        while (dates.length < 3 && count < 30) {
            const yyyy = current.getUTCFullYear();
            const mm = String(current.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(current.getUTCDate()).padStart(2, '0');
            const str = `${yyyy}-${mm}-${dd}`;
            if (isValidDeliveryDate(str, allowSundays, allowHolidays, vacationConfig)) {
                const dayName = current.toLocaleDateString(locale === 'es' ? 'es-CO' : 'en-US', { weekday: 'short', timeZone: 'UTC' });
                const monthDay = current.toLocaleDateString(locale === 'es' ? 'es-CO' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
                dates.push({
                    dateStr: str,
                    label: monthDay,
                    weekday: dayName.toUpperCase()
                });
            }
            current.setUTCDate(current.getUTCDate() + 1);
            count++;
        }
        return dates;
    }, [minDeliveryDate, locale, allowSundays, allowHolidays, vacationConfig]);

    // Manejador unificado de resolución satelital Google Places
    const handleCoordinatesResolved = (lat: number, lng: number, formattedAddress: string) => {
        setLatitude(lat);
        setLongitude(lng);
        handleAddressChange(formattedAddress);
        localStorage.setItem('checkout_latitude', lat.toString());
        localStorage.setItem('checkout_longitude', lng.toString());

        if (b2cGeofence && b2cGeofence.length > 0) {
            const inside = isInsidePolygon({ lat, lng }, b2cGeofence);
            setOutOfZone(!inside);
            if (!inside) {
                notify(locale === 'es' ? 'La dirección seleccionada está fuera de nuestra zona de cobertura en Bogotá.' : 'The selected address is outside our delivery zone in Bogotá.', 'warning');
            } else {
                notify(locale === 'es' ? 'Coordenadas satelitales confirmadas para entrega directa.' : 'Exact coordinates confirmed for direct delivery.', 'success');
            }
        }
    };

    useEffect(() => {
        setIsMounted(true);
        if (typeof window !== 'undefined') {
            const isAutofilled = localStorage.getItem('checkout_is_profile_autofilled') === 'true';
            const savedId = localStorage.getItem('checkout_identification');
            const savedEmail = localStorage.getItem('checkout_email');
            const savedPhone = localStorage.getItem('checkout_phone');
            const savedNotes = localStorage.getItem('checkout_specialNotes');
            const savedName = localStorage.getItem('checkout_name');
            const savedAddress = localStorage.getItem('checkout_address');
            const savedAddressDetails = localStorage.getItem('checkout_address_details');
            const savedBuildingComplex = localStorage.getItem('checkout_building_complex');
            const savedUnitDetails = localStorage.getItem('checkout_unit_details');
            const savedPayment = localStorage.getItem('checkout_payment_method');
            const savedIsGift = localStorage.getItem('checkout_is_gift');
            const savedRecipientName = localStorage.getItem('checkout_recipient_name');
            const savedRecipientPhone = localStorage.getItem('checkout_recipient_phone');
            const savedBeneficiaryIdx = localStorage.getItem('checkout_selected_beneficiary_idx');
            const savedLat = localStorage.getItem('checkout_latitude');
            const savedLng = localStorage.getItem('checkout_longitude');

            if (savedId) setIdentification(savedId);
            if (savedEmail) setEmail(savedEmail);
            if (savedPhone) setPhone(savedPhone);
            if (savedNotes) setSpecialNotes(savedNotes);
            if (savedBuildingComplex) setBuildingComplex(savedBuildingComplex);
            if (savedUnitDetails) setUnitDetails(savedUnitDetails);
            if (savedAddressDetails) {
                setAddressDetails(savedAddressDetails);
                if (!savedBuildingComplex && !savedUnitDetails) {
                    if (savedAddressDetails.includes(' - ')) {
                        const [c, ...rest] = savedAddressDetails.split(' - ');
                        setBuildingComplex(c.trim());
                        setUnitDetails(rest.join(' - ').trim());
                    } else {
                        setUnitDetails(savedAddressDetails.trim());
                    }
                }
            }
            if (savedPayment === 'wompi' || savedPayment === 'contra_entrega') {
                setPaymentMethod(savedPayment);
            }
            if (savedIsGift === 'true') {
                setIsGiftForRecipient(true);
            }
            if (savedRecipientName) setRecipientName(savedRecipientName);
            if (savedRecipientPhone) setRecipientPhone(savedRecipientPhone);
            if (savedBeneficiaryIdx !== null && savedBeneficiaryIdx !== undefined && savedBeneficiaryIdx !== '') {
                setSelectedBeneficiaryIdx(savedBeneficiaryIdx === 'new' ? 'new' : parseInt(savedBeneficiaryIdx));
            }
            if (savedLat && savedLng) {
                setLatitude(parseFloat(savedLat));
                setLongitude(parseFloat(savedLng));
            }

            if (savedName) setName(savedName);
            if (savedAddress) setAddress(savedAddress);

            const savedBeneficiariesJson = localStorage.getItem('checkout_beneficiaries');
            if (savedBeneficiariesJson) {
                try {
                    const parsed = JSON.parse(savedBeneficiariesJson);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setBeneficiaries(parsed);
                    }
                } catch (e) {
                    console.warn('Error parsing saved beneficiaries:', e);
                }
            }
        }
    }, []);

    const handleNameChange = (val: string) => {
        setName(val);
        localStorage.setItem('checkout_name', val);
    };

    const handleIdChange = (val: string) => {
        setIdentification(val);
        localStorage.setItem('checkout_identification', val);
    };

    const handlePhoneChange = (val: string) => {
        setPhone(val);
        localStorage.setItem('checkout_phone', val);
    };

    const handleEmailChange = (val: string) => {
        setEmail(val);
        localStorage.setItem('checkout_email', val);
    };

    const handleAddressChange = (val: string) => {
        setAddress(val);
        localStorage.setItem('checkout_address', val);
    };

    const handleBuildingComplexChange = (val: string) => {
        setBuildingComplex(val);
        localStorage.setItem('checkout_building_complex', val);
        const combined = val.trim() && unitDetails.trim()
            ? `${val.trim()} - ${unitDetails.trim()}`
            : (val.trim() || unitDetails.trim());
        setAddressDetails(combined);
        localStorage.setItem('checkout_address_details', combined);
    };

    const handleUnitDetailsChange = (val: string) => {
        setUnitDetails(val);
        localStorage.setItem('checkout_unit_details', val);
        const combined = buildingComplex.trim() && val.trim()
            ? `${buildingComplex.trim()} - ${val.trim()}`
            : (buildingComplex.trim() || val.trim());
        setAddressDetails(combined);
        localStorage.setItem('checkout_address_details', combined);
    };

    const handleAddressDetailsChange = (val: string) => {
        setAddressDetails(val);
        localStorage.setItem('checkout_address_details', val);
        if (val.includes(' - ')) {
            const [c, ...rest] = val.split(' - ');
            setBuildingComplex(c.trim());
            setUnitDetails(rest.join(' - ').trim());
        } else {
            setBuildingComplex('');
            setUnitDetails(val.trim());
        }
    };

    const handleRecipientNameChange = (val: string) => {
        setRecipientName(val);
        localStorage.setItem('checkout_recipient_name', val);
    };

    const handleRecipientPhoneChange = (val: string) => {
        setRecipientPhone(val);
        localStorage.setItem('checkout_recipient_phone', val);
    };

    const selectBeneficiary = (b: any, idx: number) => {
        setSelectedBeneficiaryIdx(idx);
        localStorage.setItem('checkout_selected_beneficiary_idx', idx.toString());
        setRecipientName(b.name || '');
        localStorage.setItem('checkout_recipient_name', b.name || '');
        setRecipientPhone(b.phone || '');
        localStorage.setItem('checkout_recipient_phone', b.phone || '');
        if (b.address) {
            setAddress(b.address);
            localStorage.setItem('checkout_address', b.address);
        }
        if (b.latitude && b.longitude) {
            const lat = parseFloat(b.latitude);
            const lng = parseFloat(b.longitude);
            setLatitude(lat);
            setLongitude(lng);
            localStorage.setItem('checkout_latitude', lat.toString());
            localStorage.setItem('checkout_longitude', lng.toString());
        }
        if (b.building_complex) {
            setBuildingComplex(b.building_complex);
            localStorage.setItem('checkout_building_complex', b.building_complex);
        }
        if (b.unit_details) {
            setUnitDetails(b.unit_details);
            localStorage.setItem('checkout_unit_details', b.unit_details);
        }
        setIsEditingDeliveryInfo(false);
    };

    const selectNewBeneficiary = () => {
        setSelectedBeneficiaryIdx('new');
        localStorage.setItem('checkout_selected_beneficiary_idx', 'new');
        setRecipientName('');
        setRecipientPhone('');
        setAddress('');
        setLatitude(null);
        setLongitude(null);
        setBuildingComplex('');
        setUnitDetails('');
        setIsEditingDeliveryInfo(true);
    };

    const handleGiftToggle = (val: boolean) => {
        setIsGiftForRecipient(val);
        localStorage.setItem('checkout_is_gift', val ? 'true' : 'false');
        if (val) {
            if (beneficiaries.length > 0) {
                if (selectedBeneficiaryIdx === null || selectedBeneficiaryIdx === undefined) {
                    selectBeneficiary(beneficiaries[0], 0);
                } else if (typeof selectedBeneficiaryIdx === 'number' && beneficiaries[selectedBeneficiaryIdx]) {
                    selectBeneficiary(beneficiaries[selectedBeneficiaryIdx], selectedBeneficiaryIdx);
                } else if (selectedBeneficiaryIdx === 'new') {
                    setIsEditingDeliveryInfo(true);
                }
            } else {
                setSelectedBeneficiaryIdx('new');
                setIsEditingDeliveryInfo(true);
            }
        } else {
            setSelectedBeneficiaryIdx(null);
            localStorage.removeItem('checkout_selected_beneficiary_idx');
            setRecipientName('');
            setRecipientPhone('');
            if (originalAddress) {
                setAddress(originalAddress);
                localStorage.setItem('checkout_address', originalAddress);
                if (originalCoords) {
                    setLatitude(originalCoords.lat);
                    setLongitude(originalCoords.lng);
                }
            }
            setIsEditingDeliveryInfo(false);
        }
    };

    const handlePaymentMethodChange = (val: 'wompi' | 'contra_entrega' | 'payroll_deduction') => {
        if (val === 'contra_entrega' && !isB2B && totalPrice > maxOrderHogarCod) {
            notify(locale === 'es' 
                ? `Por políticas de seguridad, los pedidos para Hogar con pago contra entrega tienen un límite máximo de $${maxOrderHogarCod.toLocaleString('es-CO')}. Para pedidos superiores, por favor selecciona pago en línea con Wompi (PSE, Tarjeta o Nequi).`
                : `For security reasons, Cash on Delivery for Household orders has a limit of $${maxOrderHogarCod.toLocaleString('en-US')}. Please select online payment via Wompi.`,
                'warning'
            );
            return;
        }
        setPaymentMethod(val);
        localStorage.setItem('checkout_payment_method', val);
    };

    useEffect(() => {
        if (!isB2B && totalPrice > maxOrderHogarCod && paymentMethod === 'contra_entrega') {
            setPaymentMethod('wompi');
            localStorage.setItem('checkout_payment_method', 'wompi');
        }
    }, [isB2B, totalPrice, maxOrderHogarCod, paymentMethod]);

    const handleNotesChange = (val: string) => {
        setSpecialNotes(val);
        setNotesJustSaved(false);
        if (typeof window !== 'undefined') {
            localStorage.setItem('checkout_specialNotes', val);
        }
    };

    const handleNotesEnter = () => {
        setNotesJustSaved(true);
        const paymentSection = document.getElementById('payment-method-section');
        if (paymentSection) {
            paymentSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };

    useEffect(() => {
        if (typeof window !== 'undefined') {
            if (latitude !== null && longitude !== null) {
                localStorage.setItem('checkout_latitude', latitude.toString());
                localStorage.setItem('checkout_longitude', longitude.toString());
            } else if (isMounted && latitude === null && longitude === null) {
                localStorage.removeItem('checkout_latitude');
                localStorage.removeItem('checkout_longitude');
            }
        }
    }, [latitude, longitude, isMounted]);

    useEffect(() => {
        if (date) {
            localStorage.setItem('checkout_selected_delivery_date', date);
            window.dispatchEvent(new Event('storage'));
        }
    }, [date]);

    // Step 1: Automatic B2C profile detection (Debounced)
    useEffect(() => {
        setIsProfileMatched(false);
        setIsProfileUnlocked(false);
        setMaskedName('');
        setMaskedAddress('');
        setLookupError('');

        const emailVal = (email || '').trim();
        const idVal = (identification || '').trim();

        if (emailVal.includes('@') && emailVal.length > 5 && idVal.length >= 5) {
            const delayDebounceFn = setTimeout(async () => {
                setLookupLoading(true);
                try {
                    const res = await fetch('/api/checkout/lookup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: emailVal, nit: idVal })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.found) {
                            setIsProfileMatched(true);
                            setMaskedName(data.name);
                            setMaskedAddress(data.address);
                        }
                    }
                } catch (err) {
                    console.error('Error during profile lookup:', err);
                } finally {
                    setLookupLoading(false);
                }
            }, 600);
            return () => clearTimeout(delayDebounceFn);
        }
    }, [email, identification]);

    // Step 2: Automatic phone verification & GPS coordinate recovery (Debounced)
    useEffect(() => {
        const cleanPhoneStr = (p: string) => (p || '').replace(/\D/g, '');
        const phoneVal = cleanPhoneStr(phone);
        const emailVal = (email || '').trim().toLowerCase();
        const idVal = (identification || '').trim().toLowerCase();

        const shouldLookup = !isProfileUnlocked && (
            phoneVal.length >= 10 || 
            (emailVal.includes('@') && idVal.length >= 5)
        );

        if (shouldLookup) {
            const delayDebounceFn = setTimeout(async () => {
                setLookupLoading(true);
                setLookupError('');
                try {
                    const res = await fetch('/api/checkout/lookup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: emailVal || undefined,
                            nit: idVal || undefined,
                            phone: phoneVal || undefined
                        })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.verified) {
                            setIsProfileUnlocked(true);
                            if (data.name) {
                                setName(prev => prev || data.name);
                                localStorage.setItem('checkout_name', data.name);
                            }
                            if (data.address && !isGiftForRecipient) {
                                setAddress(prev => prev || data.address);
                                localStorage.setItem('checkout_address', data.address);
                            }
                            if (data.phone) {
                                setPhone(data.phone);
                                localStorage.setItem('checkout_phone', data.phone);
                            }
                            if (data.email) {
                                setEmail(prev => prev || data.email);
                                localStorage.setItem('checkout_email', data.email);
                            }
                            setOriginalAddress(data.address);
                            setMatchedProfileId((data.profile_id && data.profile_id !== 'matched') ? data.profile_id : null);
                            localStorage.setItem('checkout_is_profile_autofilled', 'true');
                            setUnlockedEmail(emailVal);
                            setUnlockedId(idVal);
                            setUnlockedPhone(phoneVal);
                            if (data.latitude && data.longitude && !isGiftForRecipient) {
                                const latVal = parseFloat(data.latitude);
                                const lngVal = parseFloat(data.longitude);
                                setLatitude(latVal);
                                setLongitude(lngVal);
                                setOriginalCoords({ lat: latVal, lng: lngVal });
                            }
                            if (Array.isArray(data.beneficiaries) && data.beneficiaries.length > 0) {
                                setBeneficiaries(data.beneficiaries);
                                localStorage.setItem('checkout_beneficiaries', JSON.stringify(data.beneficiaries));
                                if (isGiftForRecipient && (selectedBeneficiaryIdx === null || selectedBeneficiaryIdx === undefined)) {
                                    selectBeneficiary(data.beneficiaries[0], 0);
                                }
                            }
                            if (data.is_collaborator) {
                                setIsCollaborator(true);
                                setCollaboratorInfo(data.collaborator_info || null);
                            } else {
                                setIsCollaborator(false);
                                setCollaboratorInfo(null);
                            }
                            setIsProfileMatched(false);
                        } else if (data.found) {
                            setIsProfileMatched(true);
                            setMaskedName(data.name);
                            setMaskedAddress(data.address);
                        }
                    }
                } catch (err) {
                    console.error('Error during phone verification:', err);
                } finally {
                    setLookupLoading(false);
                }
            }, 400);
            return () => clearTimeout(delayDebounceFn);
        }
    }, [phone, isProfileMatched, isProfileUnlocked, email, identification, isGiftForRecipient, selectedBeneficiaryIdx]);

    // Step 3: Monitor lookup fields to clear auto-filled profile details if credentials change/are removed
    useEffect(() => {
        if (matchedProfileId) {
            const currentEmail = (email || '').trim();
            const currentId = (identification || '').trim();
            const cleanPhoneStr = (p: string) => (p || '').replace(/\D/g, '');
            const currentPhone = cleanPhoneStr(phone);

            if (currentEmail !== unlockedEmail || currentId !== unlockedId || currentPhone !== unlockedPhone) {
                setMatchedProfileId(null);
                setIsProfileUnlocked(false);
                setIsCollaborator(false);
                setCollaboratorInfo(null);
                if (paymentMethod === 'payroll_deduction') {
                    setPaymentMethod('wompi');
                }
                setName('');
                setAddress('');
                setLatitude(null);
                setLongitude(null);
                setUnlockedEmail('');
                setUnlockedId('');
                setUnlockedPhone('');
                localStorage.removeItem('checkout_name');
                localStorage.removeItem('checkout_address');
                localStorage.removeItem('checkout_is_profile_autofilled');
            }
        }
    }, [email, identification, phone, matchedProfileId, unlockedEmail, unlockedId, unlockedPhone]);

    useEffect(() => {
        async function fetchGeofences() {
            try {
                const { data } = await supabase.from('app_settings')
                    .select('key, value')
                    .in('key', ['geofence_b2c_poly', 'geofence_b2b_poly']);
                if (data) {
                    data.forEach((row) => {
                        if (row.key === 'geofence_b2c_poly' && row.value) {
                            try { setB2cGeofence(JSON.parse(row.value)); } catch (e) {}
                        }
                        if (row.key === 'geofence_b2b_poly' && row.value) {
                            try { setB2bGeofence(JSON.parse(row.value)); } catch (e) {}
                        }
                    });
                }
            } catch (err) {
                console.error('Error fetching geofences:', err);
            }
        }
        fetchGeofences();

        const testCoordsHandler = (e: any) => {
            if (e.detail?.lat && e.detail?.lng) {
                setLatitude(e.detail.lat);
                setLongitude(e.detail.lng);
            }
        };
        window.addEventListener('set_test_coords', testCoordsHandler);
        return () => window.removeEventListener('set_test_coords', testCoordsHandler);
    }, []);

    // Reverse geocoding helper (Coordinates -> Street Address)
    const reverseGeocode = (lat: number, lng: number): Promise<string | null> => {
        return new Promise((resolve) => {
            if (typeof window === 'undefined' || !(window as any).google?.maps?.Geocoder) {
                return resolve(null);
            }
            const geocoder = new (window as any).google.maps.Geocoder();
            geocoder.geocode({ location: { lat, lng } }, (results: any, status: string) => {
                if (status === 'OK' && results && results[0]) {
                    let clean = results[0].formatted_address;
                    clean = clean.replace(/, Colombia.*$/i, '').replace(/, Cundinamarca.*$/i, '').trim();
                    resolve(clean);
                } else {
                    resolve(null);
                }
            });
        });
    };

    // Auto reverse geocode preview while interacting in the Map Modal
    useEffect(() => {
        if (!showMapPicker || !latitude || !longitude) return;
        const timer = setTimeout(async () => {
            setIsResolvingAddress(true);
            const resolved = await reverseGeocode(latitude, longitude);
            if (resolved) {
                setResolvedAddressPreview(resolved);
            }
            setIsResolvingAddress(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [latitude, longitude, showMapPicker]);

    // Monitor changes to delivery address to invalidate coordinates if address changes manually
    useEffect(() => {
        if (originalAddress && address.trim().toLowerCase() !== originalAddress.trim().toLowerCase()) {
            setLatitude(null);
            setLongitude(null);
        } else if (originalAddress && address.trim().toLowerCase() === originalAddress.trim().toLowerCase()) {
            if (originalCoords) {
                setLatitude(originalCoords.lat);
                setLongitude(originalCoords.lng);
            }
        }
    }, [address, originalAddress, originalCoords]);

    // Perform validation whenever coordinates change
    useEffect(() => {
        if (latitude && longitude && activeGeofence.length > 0) {
            const inside = isInsidePolygon({ lat: latitude, lng: longitude }, activeGeofence);
            setOutOfZone(!inside);
        }
    }, [latitude, longitude, activeGeofence]);

    const handleConfirmLocationFromMap = () => {
        if (outOfZone && !isB2B) {
            notify(locale === 'es' 
                ? 'El punto seleccionado está fuera de nuestra zona de cobertura activa (Zona Norte / Centro). Por favor ubica el marcador dentro del área verde o solicita notificación para avisarte cuando habilitemos tu sector.' 
                : 'The selected location is outside our active delivery zone. Please move the pin inside the green zone or request notification when available.',
                'warning'
            );
            return;
        }

        if (resolvedAddressPreview && resolvedAddressPreview.trim()) {
            handleAddressChange(resolvedAddressPreview.trim());
            setOriginalAddress(resolvedAddressPreview.trim());
            if (latitude && longitude) {
                setOriginalCoords({ lat: latitude, lng: longitude });
            }
            setAddressSyncNotice(resolvedAddressPreview.trim());
            setTimeout(() => setAddressSyncNotice(null), 6000);
        }

        setShowMapPicker(false);
    };

    const handleGetLocation = () => {
        if (!navigator.geolocation) {
            notify(locale === 'es' ? 'Tu navegador no soporta geolocalización.' : 'Your browser does not support geolocation.', 'error');
            return;
        }

        setIsGettingLocation(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                setLatitude(lat);
                setLongitude(lng);
                setIsGettingLocation(false);
                const resolved = await reverseGeocode(lat, lng);
                if (resolved) {
                    handleAddressChange(resolved);
                    setOriginalAddress(resolved);
                    setOriginalCoords({ lat, lng });
                    setAddressSyncNotice(resolved);
                    setTimeout(() => setAddressSyncNotice(null), 6000);
                }
                notify(locale === 'es' ? 'Ubicación capturada con éxito. Ahora tu entrega será más precisa.' : 'Location captured successfully. Your delivery will now be more precise.', 'success');
            },
            (error) => {
                console.error('Error getting location:', error);
                setIsGettingLocation(false);
                notify(locale === 'es' ? 'No pudimos obtener tu ubicación. Por favor asegúrate de dar permisos en tu navegador.' : 'We could not get your location. Please ensure you grant permissions in your browser.', 'error');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    // --- ROBUST DATE CALCULATOR (UTC-5) ---
    const getSafeBogotaDate = (daysToAdd = 1) => {
        const now = new Date();
        // Bogota is UTC-5 fixed. 
        // We calculate Bogota time by adjusting UTC time.
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const bogotaNow = new Date(utc + (3600000 * -5));
        
        // bogotaNow.getHours();
        
        // If it's already late (e.g. after 5 PM in Bogota), 
        // we might want to default to +2 days if rules are on.
        // For now, we'll just calculate a safe tomorrow.
        const result = new Date(bogotaNow);
        result.setDate(bogotaNow.getDate() + daysToAdd);
        
        return result.toISOString().split('T')[0];
    };

    // Initial default value to avoid empty state (skipping Sundays, 19 Colombian holidays & Vacation Recess)
    useEffect(() => {
        async function initDeliveryDate() {
            try {
                const { data: settingsData } = await supabase
                    .from('app_settings')
                    .select('key, value')
                    .in('key', [
                        'enable_cutoff_rules',
                        'cutoff_hour_public',
                        'allow_sunday_deliveries',
                        'allow_holiday_deliveries',
                        'store_status',
                        'store_vacation_config'
                    ]);

                const cutoffEnabled = settingsData?.find(s => s.key === 'enable_cutoff_rules')?.value !== 'false';
                const cutoffHourPublicSetting = settingsData?.find(s => s.key === 'cutoff_hour_public')?.value;
                const cutoffHourPublic = cutoffHourPublicSetting ? parseInt(cutoffHourPublicSetting, 10) : 17;
                const sundaysAllowed = settingsData?.find(s => s.key === 'allow_sunday_deliveries')?.value === 'true';
                const holidaysAllowed = settingsData?.find(s => s.key === 'allow_holiday_deliveries')?.value === 'true';
                const rawStatus = settingsData?.find(s => s.key === 'store_status')?.value;
                const parsedVac = parseStoreVacationConfig(settingsData?.find(s => s.key === 'store_vacation_config')?.value);

                setAllowSundays(sundaysAllowed);
                setAllowHolidays(holidaysAllowed);
                setVacationConfig(parsedVac);
                if (rawStatus === 'closed' || rawStatus === 'vacation_preorder' || rawStatus === 'open') {
                    setStoreStatus(rawStatus);
                }

                const now = new Date();
                const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
                const bogotaNow = new Date(utc + (3600000 * -5));
                const currentHour = bogotaNow.getHours();
                const daysToAdd = (cutoffEnabled && currentHour >= cutoffHourPublic) ? 2 : 1;

                const baseTarget = new Date(bogotaNow);
                baseTarget.setDate(bogotaNow.getDate() + daysToAdd);

                const validDate = getNextValidDeliveryDate(baseTarget, sundaysAllowed, holidaysAllowed, parsedVac);
                const dateStr = validDate.toISOString().split('T')[0];

                setMinDeliveryDate(dateStr);
                setDate(prev => (!prev || prev < dateStr || !isValidDeliveryDate(prev, sundaysAllowed, holidaysAllowed, parsedVac)) ? dateStr : prev);
            } catch (err) {
                console.error("Error initializing delivery date in checkout:", err);
            }
        }
        initDeliveryDate();
    }, []);

    // Load Profile data for B2B/Registered users
    useEffect(() => {
        if (profile) {
            // El nombre se deja limpio a propósito para que se llene manualmente
            if (!email && profile.company_name?.includes('@')) {
                setEmail(profile.company_name);
                localStorage.setItem('checkout_email', profile.company_name);
            }
            if (!address && profile.address_main) {
                setAddress(profile.address_main);
                localStorage.setItem('checkout_address', profile.address_main);
            }
            const profileBeneficiaries = (profile as any).beneficiaries || (profile as any).logistics_data?.beneficiaries || [];
            if (Array.isArray(profileBeneficiaries) && profileBeneficiaries.length > 0) {
                setBeneficiaries(profileBeneficiaries);
            }
            console.log('👤 profile found, filling member data...');
        }
    }, [profile]);

    // Fetch settings (Min Order Hogar, Delivery Fee & COD limits)
    useEffect(() => {
        async function loadConfig() {
            try {
                const { data: settingsData } = await supabase
                    .from('app_settings')
                    .select('key, value')
                    .in('key', ['min_order_hogar', 'delivery_fee', 'max_order_hogar_cod']);

                if (settingsData) {
                    settingsData.forEach(s => {
                        if (s.key === 'min_order_hogar') {
                            const val = parseInt(s.value, 10);
                            if (!isNaN(val) && val > 0) setMinOrder(val);
                        }
                        if (s.key === 'delivery_fee') {
                            const val = parseInt(s.value, 10);
                            if (!isNaN(val) && val >= 0) setDeliveryFee(val);
                        }
                        if (s.key === 'max_order_hogar_cod') {
                            const val = parseInt(s.value, 10);
                            if (!isNaN(val) && val > 0) setMaxOrderHogarCod(val);
                        }
                    });
                }
            } catch (err) {
                console.error('Error loading config:', err);
            }
        }
        loadConfig();
    }, []);

    const isMinOrderMet = isB2B ? (totalPrice >= minOrder) : (items.length > 0 && totalPrice > 0);

        const handleRegisterRejectionAndReturn = async () => {
        try {
            setIsRegisteringRejection(true);
            await fetch('/api/coverage/out-of-bounds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address,
                    latitude,
                    longitude,
                    customer_name: name || 'Cliente Web B2C',
                    customer_phone: phone || '',
                    customer_email: email || '',
                    channel: isB2B ? 'b2b' : 'b2c',
                    municipality: 'Fuera de Cobertura'
                })
            });
            notify(locale === 'es' 
                ? '¡Muchas gracias por tu interés! Hemos registrado tu ubicación exitosamente en nuestra base de demanda. Te avisaremos tan pronto habilitemos entregas en tu sector.' 
                : 'Thank you for your interest! We have recorded your location in our demand database. We will notify you as soon as we expand to your area.',
                'success'
            );
            if (typeof window !== 'undefined') {
                localStorage.removeItem('checkout_specialNotes');
            }
            clearCart();
            router.push('/');
        } catch (err) {
            console.error('Error registering demand rejection:', err);
            router.push('/');
        } finally {
            setIsRegisteringRejection(false);
        }
    };

    const handleSaveCartForReopen = () => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('frufresco_saved_cart_reopen', JSON.stringify({
                savedAt: new Date().toISOString(),
                itemsCount: items.length,
                totalPrice: finalOrderTotal,
                targetReturnDate: minDeliveryDate
            }));
        }
        setCartSavedForReopen(true);
        notify(
            locale === 'es'
                ? `Tu carrito (${items.length} productos) y tus datos han quedado guardados en este dispositivo para nuestra reapertura (${vacationConfig?.reopenTime || '06:00 AM'}).`
                : `Your cart (${items.length} items) and details have been saved on this device for our reopening.`,
            'success'
        );
    };

    const handleSubmit = async () => {
        console.log('🚀 Finalizing order. Date:', date);

        if (storeStatus === 'closed') {
            handleSaveCartForReopen();
            return;
        }
        
        if (!date || date === '' || date === 'dd/mm/aaaa') {
            const recoveryDate = minDeliveryDate || getSafeBogotaDate(1);
            setDate(recoveryDate);
            notify(locale === 'es' ? 'Hubo un problema con la fecha. Se ha corregido automáticamente, por favor confirma de nuevo.' : 'There was a problem with the date. It has been fixed, please confirm again.', 'warning');
            return;
        }

        if (items.length === 0) {
            notify(t.emptyCart, 'error');
            return;
        }
        if (!name || !name.trim()) {
            notify(locale === 'es' ? 'Por favor ingresa tu Nombre Completo.' : 'Please enter your Full Name.', 'error');
            return;
        }
        if ((isB2B || requiresInvoiceWithNit) && (!identification.trim() && !companyNit.trim())) {
            notify(locale === 'es' ? 'Por favor ingresa el NIT o Cédula para la factura corporativa.' : 'Please enter the NIT/ID for company invoice.', 'error');
            return;
        }
        if (!phone || !phone.trim()) {
            notify(locale === 'es' ? 'Por favor ingresa tu Número de Celular.' : 'Please enter your WhatsApp Number.', 'error');
            return;
        }
        if (!email || !email.trim()) {
            notify(locale === 'es' ? 'Por favor ingresa tu Email.' : 'Please enter your Email.', 'error');
            return;
        }
        if (!address || !address.trim()) {
            notify(locale === 'es' ? 'Por favor ingresa tu Dirección de entrega.' : 'Please enter your Delivery Address.', 'error');
            return;
        }
        if (!latitude || !longitude) {
            notify(
                locale === 'es' 
                    ? 'Por favor confirma la ubicación exacta en el mapa para que el domiciliario llegue sin demoras a tu portería o puerta.' 
                    : 'Please confirm the exact location on the map to ensure timely delivery to your gate or door.', 
                'warning'
            );
            if (address.trim().length > 5 && typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
                setIsGettingLocation(true);
                const geocoder = new (window as any).google.maps.Geocoder();
                geocoder.geocode({ address: `${address}, Bogotá, Colombia` }, (results: any, status: any) => {
                    setIsGettingLocation(false);
                    if (status === 'OK' && results && results[0]) {
                        setLatitude(results[0].geometry.location.lat());
                        setLongitude(results[0].geometry.location.lng());
                    }
                    setShowMapPicker(true);
                });
            } else {
                setShowMapPicker(true);
            }
            return;
        }
        if (isB2B && !isMinOrderMet) {
            notify(`${t.minOrderMsg}: $${minOrder.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')}.`, 'error');
            return;
        }
        if (!isB2B && paymentMethod === 'contra_entrega' && totalPrice > maxOrderHogarCod) {
            notify(locale === 'es' 
                ? `Por políticas de seguridad, los pedidos para Hogar con pago contra entrega tienen un límite máximo de $${maxOrderHogarCod.toLocaleString('es-CO')}. Para este pedido de $${totalPrice.toLocaleString('es-CO')}, por favor selecciona el método Wompi (pago seguro online).`
                : `For security reasons, Cash on Delivery for Household orders has a limit of $${maxOrderHogarCod.toLocaleString('en-US')}. Please select online payment via Wompi.`,
                'warning'
            );
            return;
        }
        if (outOfZone) {
            fetch('/api/coverage/out-of-bounds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address,
                    latitude,
                    longitude,
                    customer_name: name,
                    customer_phone: phone,
                    customer_email: email,
                    channel: isB2B ? 'b2b' : 'b2c'
                })
            }).catch(e => console.warn('Silent log error:', e));
            notify(t.outOfZoneMsg, 'error');
            return;
        }
        if (date < minDeliveryDate || !isValidDeliveryDate(date, allowSundays, allowHolidays, vacationConfig)) {
            const corrected = getNextValidDeliveryDate(date < minDeliveryDate ? minDeliveryDate : date, allowSundays, allowHolidays, vacationConfig).toISOString().split('T')[0];
            setDate(corrected);
            notify(locale === 'es' 
                ? `La fecha seleccionada cae en un día sin despacho (domingo, festivo o receso operativo). Se ha ajustado automáticamente a nuestra primera ruta disponible: ${corrected}.`
                : `The selected delivery date is not available. Adjusted to next valid route: ${corrected}.`,
                'warning'
            );
            return;
        }

        if (isGiftForRecipient) {
            if (!recipientName.trim()) {
                notify(locale === 'es' ? 'Por favor ingresa el Nombre Completo de quien recibe.' : 'Please enter the Recipient Full Name.', 'error');
                return;
            }
            if (!recipientPhone.trim()) {
                notify(locale === 'es' ? 'Por favor ingresa el Número de Celular de quien recibe.' : 'Please enter the Recipient Phone Number.', 'error');
                return;
            }
        }

        setShowConfirmationModal(true);
    };

    const executeOrderSubmission = async () => {
        setShowConfirmationModal(false);
        setLoading(true);

        try {
            console.log('1️⃣ Creating order record...');
            
            // Sanitize coordinates to ensure they fit DECIMAL(10,8)
            const safeLat = latitude ? parseFloat(latitude.toFixed(8)) : null;
            const safeLng = longitude ? parseFloat(longitude.toFixed(8)) : null;

            const complexPart = buildingComplex.trim();
            const unitPart = unitDetails.trim();
            let detailsString = '';
            if (complexPart && unitPart) detailsString = `${complexPart} (${unitPart})`;
            else if (complexPart) detailsString = complexPart;
            else if (unitPart) detailsString = unitPart;
            else if (addressDetails.trim()) detailsString = addressDetails.trim();

            const fullShippingAddress = detailsString ? `${address.trim()} - ${detailsString}` : address.trim();

            const finalIdentification = (isB2B || requiresInvoiceWithNit)
                ? (companyNit.trim() || identification.trim() || '222222222222')
                : (identification.trim() || '222222222222');

            const invoiceTag = (requiresInvoiceWithNit && companyNit.trim())
                ? `\n[FACTURACIÓN ELECTRÓNICA: NIT ${companyNit.trim()} - RAZÓN SOCIAL: ${companyBusinessName.trim() || name.trim()}]`
                : '';

            const clientNotesHeader = isGiftForRecipient 
                ? `[COMPRADOR / FACTURACIÓN: ${name} | Tel: ${phone} | Email: ${email} | ID: ${finalIdentification}]${invoiceTag}\n[DESTINATARIO / RECIBE EN PUERTA: ${recipientName} | Tel: ${recipientPhone}]`
                : `[CLIENTE: ${name} | Tel: ${phone} | Email: ${email} | ID: ${finalIdentification}]${invoiceTag}`;

            const isValidUuid = (str: any) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

            const packagingNoteTag = !packagingFeeEnabled
                ? ''
                : packagingMode === 'buy_crate'
                    ? `\n[EMPAQUE: COMPRA CANASTILLA NARANJA (ÚNICA VEZ) x${crateQuantity || suggestedCrates} - AFORO: ~${produceWeightKg.toFixed(1)} kg @ ${avgKgPerCrate} kg/canastilla - SIN BOLSAS PLÁSTICAS]`
                    : packagingMode === 'own_crate'
                        ? `\n[EMPAQUE: RECAMBIO CANASTILLA NARANJA PROPIA (${suggestedCrates} requeridas para ~${produceWeightKg.toFixed(1)} kg) - SIN BOLSAS PLÁSTICAS]`
                        : `\n[EMPAQUE PLÁSTICO (${packagingFeePercentage}%): +$${packagingFeeAmount.toLocaleString('es-CO')} COP]`;

            const deliveryNoteTag = isB2B
                ? ''
                : isFreeShipping
                    ? '\n[DOMICILIO: GRATIS (PEDIDO >= $150.000)]'
                    : `\n[DOMICILIO (< $150.000): +$${deliveryFeeAmount.toLocaleString('es-CO')} COP]`;

            const orderDataToInsert = {
                type: isB2B ? 'b2b_client' : 'b2c_client',
                status: 'pending_approval',
                delivery_date: date,
                shipping_address: fullShippingAddress,
                subtotal: roundedSubtotal,
                tax: roundedTaxAmount,
                total: finalOrderTotal,
                latitude: safeLat,
                longitude: safeLng,
                profile_id: isValidUuid(matchedProfileId) ? matchedProfileId : null,
                payment_method: paymentMethod,
                payment_status: paymentMethod === 'payroll_deduction' ? 'payroll_authorized' : 'Pendiente',
                special_notes: `${paymentMethod === 'payroll_deduction' ? '[⚠️ NO COBRAR EN PUERTA — VENTA EMPLEADO DEDUCCIÓN NÓMINA PRE-AUTORIZADA]\n' : ''}${clientNotesHeader}${deliveryNoteTag}${packagingNoteTag}\n[ORIGIN: web]${isCollaborator ? `\n[COLABORADOR FRUFRESCO: ${collaboratorInfo?.contact_name || name} (Doc: ${collaboratorInfo?.document_id || finalIdentification}) - Beneficio 5% Descuento Aplicado]` : ''}${specialNotes ? `\n[RECOMENDACIÓN / NOTA DE ENTREGA: ${specialNotes}]` : ''}`
            };

            const orderItemsData = items.map(item => ({
                product_id: (item as { id: string }).id,
                quantity: item.quantity,
                unit_price: item.price,
                unit: item.unit,
                variant_label: item.variant_label || null,
                nickname: item.variant_label || null,
            }));

            const createOrderPromise = fetch('/api/orders/public', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    order: orderDataToInsert, 
                    items: orderItemsData,
                    customer_info: {
                        name,
                        phone,
                        email,
                        identification: finalIdentification,
                        address: fullShippingAddress,
                        latitude: safeLat,
                        longitude: safeLng,
                        is_gift: isGiftForRecipient,
                        recipient_name: isGiftForRecipient ? recipientName : null,
                        recipient_phone: isGiftForRecipient ? recipientPhone : null
                    }
                })
            });

            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('La conexión está tardando demasiado (Timeout 60s). Verifica tu internet.')), 60000)
            );

            // Execute race
            const result = await Promise.race([createOrderPromise, timeoutPromise]) as Response;

            if (!result.ok) {
                const rawText = await result.text().catch(() => '');
                let errorMsg = result.statusText || 'Error al procesar pedido';
                try {
                    const parsed = JSON.parse(rawText);
                    if (parsed.error) errorMsg = parsed.error;
                } catch {
                    if (rawText) errorMsg = rawText;
                }
                console.error('❌ Error insertando pedido:', errorMsg);
                throw new Error(`Error al crear el pedido: ${errorMsg}`);
            }

            const { order: orderData } = await result.json();

            if (!orderData) throw new Error('No se recibió confirmación del pedido.');
            console.log('✅ Pedido creado:', orderData.id);

            if (paymentMethod === 'contra_entrega' || paymentMethod === 'payroll_deduction') {
                console.log(`3️⃣ ${paymentMethod} selected. Redirecting directly to success result page...`);
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('checkout_specialNotes');
                    localStorage.removeItem('checkout_is_gift');
                    localStorage.removeItem('checkout_recipient_name');
                    localStorage.removeItem('checkout_recipient_phone');
                    localStorage.removeItem('checkout_address_details');
                    localStorage.removeItem('checkout_building_complex');
                    localStorage.removeItem('checkout_unit_details');
                    localStorage.removeItem('checkout_selected_beneficiary_idx');
                }
                clearCart();
                router.push(`/checkout/result?reference=${orderData.id}&sequence=${orderData.sequence_id}&created_at=${encodeURIComponent(orderData.created_at)}&status=cod_success`);
                return;
            }

            console.log('3️⃣ Requesting Wompi hash...');
            
            const amountInCents = finalOrderTotal * 100;
            let response;
            let requestError;
            const maxRetries = 2;

            for (let i = 0; i < maxRetries; i++) {
                try {
                    if (i > 0) console.log(`🔄 Reintentando conexión con pasarela de pagos (Intento ${i + 1}/${maxRetries})...`);
                    
                    const controller = new AbortController();
                    // 25s timeout por intento (total seguriad < 60s global mental)
                    const timeoutId = setTimeout(() => {
                         // Pasar razón explícita (aunque en navegadores viejos se ignore, ayuda en modernos)
                         controller.abort(); 
                    }, 25000);

                    response = await fetch('/api/payments/wompi/integrity', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            reference: orderData.id,
                            amountInCents: amountInCents,
                            currency: 'COP'
                        }),
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(`Integrity Error: ${errorData.error || response.statusText}`);
                    }
                    
                    // Éxito, salir del bucle
                    break;
                } catch (err) {
                    requestError = err;
                    if (i < maxRetries - 1) {
                        // Esperar 1.5s antes de reintentar
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                }
            }

            if (!response || !response.ok) {
                throw requestError || new Error('No se pudo conectar con la pasarela de pagos tras varios intentos.');
            }

            await response.json(); // Consume hash but not used directly here
            console.log('4️⃣ Redirecting to simulator...');
            
            const wompiUrl = `/payments/simulator?reference=${orderData.id}&amount-in-cents=${amountInCents}&currency=COP`;

            if (typeof window !== 'undefined') {
                localStorage.removeItem('checkout_specialNotes');
                localStorage.removeItem('checkout_is_gift');
                localStorage.removeItem('checkout_recipient_name');
                localStorage.removeItem('checkout_recipient_phone');
                localStorage.removeItem('checkout_address_details');
                localStorage.removeItem('checkout_building_complex');
                localStorage.removeItem('checkout_unit_details');
                localStorage.removeItem('checkout_selected_beneficiary_idx');
            }
            clearCart();
            window.location.href = wompiUrl;

        } catch (err: unknown) {
            console.error('❌ Checkout Failed:', err);
            
            let userMsg = locale === 'es' ? 'Error al procesar el pedido.' : 'Error processing the order.';
            
            if (isAbortError(err)) {
                 userMsg = locale === 'es' ? 'La conexión tardó demasiado (Timeout). Por favor verifica tu internet e intenta de nuevo.' : 'Connection timed out. Please check your internet and try again.';
            } else if (err instanceof Error) {
                userMsg = err.message;
            }
            
            notify(userMsg, 'error');
        } finally {
            setLoading(false);
        }
    };
    const handleEditItem = async (item: any) => {
        try {
            setLoadingProductId(item.id);
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('id', item.id)
                .single();
            if (data) {
                setSelectedProduct({
                    id: data.id,
                    name: data.name,
                    name_en: data.name_en,
                    unit_of_measure: data.unit_of_measure,
                    image_url: data.image_url,
                    sku: data.sku,
                    iva_rate: data.iva_rate,
                    options: data.options,
                    options_config: data.options_config,
                    variants: data.variants,
                    web_conversion_factor: data.web_conversion_factor,
                    display_name: data.display_name,
                    weight_kg: data.weight_kg
                });
                setEditingCartItem(item);
                setIsEditModalOpen(true);
            }
        } catch (err) {
            console.error('Error fetching product for edit:', err);
        } finally {
            setLoadingProductId(null);
        }
    };

    const handleLoadLastOrder = async () => {
        try {
            setLoadingLastOrder(true);

            const cleanPhone = (phone || '').replace(/\D/g, '');
            const cleanEmail = (email || '').trim();
            const cleanId = (identification || '').trim();
            const targetProfileId = profile?.id || matchedProfileId || '';

            if (!targetProfileId && !cleanEmail && !cleanPhone && !cleanId) {
                notify(locale === 'es' 
                    ? 'Por favor ingresa tu correo, teléfono o cédula en el formulario para buscar tu última compra.' 
                    : 'Please enter your email, phone, or ID in the form to search for your last order.',
                    'info'
                );
                return;
            }

            const queryParams = new URLSearchParams();
            if (targetProfileId) queryParams.set('profile_id', targetProfileId);
            if (cleanEmail) queryParams.set('email', cleanEmail);
            if (cleanPhone) queryParams.set('phone', cleanPhone);
            if (cleanId) queryParams.set('identification', cleanId);

            const res = await fetch(`/api/orders/last-purchase?${queryParams.toString()}`);
            const data = await res.json();

            if (!res.ok) {
                notify(data.error || (locale === 'es' ? 'No se pudo cargar la última compra.' : 'Could not load last order.'), 'error');
                return;
            }

            if (!data.items || data.items.length === 0) {
                notify(locale === 'es' 
                    ? 'Los productos de tu última compra no están disponibles en el catálogo de hoy.' 
                    : 'Products from your last purchase are not available in today\'s catalog.',
                    'warning'
                );
                return;
            }

            let importedCount = 0;
            for (const item of data.items) {
                addItem(item);
                importedCount++;
            }

            if (importedCount > 0) {
                notify(locale === 'es' 
                    ? `¡Se agregaron ${importedCount} producto(s) de tu última compra al carrito con el precio de HOY!` 
                    : `Added ${importedCount} product(s) from your last purchase to cart at TODAY'S price!`,
                    'success'
                );
            }

        } catch (err: any) {
            console.error('Error loading last order:', err);
            notify(locale === 'es' ? 'Error al traer la última compra.' : 'Error loading last order.', 'error');
        } finally {
            setLoadingLastOrder(false);
        }
    };

    if (!isMounted) return null;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>

            <div className="container mobile-stack" style={{ padding: '1.25rem 1rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1.38fr) minmax(350px, 0.92fr)', gap: '1.25rem', maxWidth: '1440px', alignItems: 'start' }}>

                {/* LEFT COLUMN: THE 3-STEP JOURNEY (60% - OPTIMIZADO EN EJE Y) */}
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    
                    {/* Header Bar Compacto */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: 'white',
                        padding: '0.65rem 1.15rem',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ShoppingBag size={16} strokeWidth={2.2} color="var(--primary)" />
                            </div>
                            <h1 style={{
                                fontFamily: 'var(--font-outfit), sans-serif',
                                fontSize: '1.15rem',
                                fontWeight: '900',
                                color: '#0F172A',
                                margin: 0,
                                letterSpacing: '-0.02em'
                            }}>
                                {locale === 'es' ? 'Finalizar Compra' : 'Checkout'}
                            </h1>
                            <span className="hidden sm:inline" style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '500' }}>
                                • Bogotá
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <button
                                type="button"
                                onClick={handleLoadLastOrder}
                                disabled={loadingLastOrder}
                                style={{
                                    padding: '0.4rem 0.75rem',
                                    borderRadius: '10px',
                                    fontSize: '0.74rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    color: '#047857',
                                    backgroundColor: '#ECFDF5',
                                    border: '1px solid #A7F3D0',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    fontFamily: 'var(--font-outfit), sans-serif'
                                }}
                            >
                                <RotateCcw size={12} strokeWidth={2.2} style={{ animation: loadingLastOrder ? 'spin 1s linear infinite' : 'none' }} />
                                {loadingLastOrder 
                                    ? (locale === 'es' ? 'Buscando...' : 'Loading...') 
                                    : (locale === 'es' ? 'Repetir última compra' : 'Repeat last order')}
                            </button>
                            <Link
                                href={`/${locale === 'en' ? '?lang=en' : ''}#catalog`}
                                style={{
                                    padding: '0.4rem 0.75rem',
                                    borderRadius: '10px',
                                    fontSize: '0.74rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    color: '#475569',
                                    backgroundColor: '#FFFFFF',
                                    border: '1px solid #E2E8F0',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    textDecoration: 'none',
                                    fontFamily: 'var(--font-outfit), sans-serif'
                                }}
                            >
                                <Plus size={13} color="var(--primary)" />
                                {locale === 'es' ? 'Seguir comprando' : 'Add items'}
                            </Link>
                        </div>
                    </div>

                    {/* PASO 1: ¿A DÓNDE Y A QUIÉN ENTREGAMOS? (COMPACTO) */}
                    <div style={{
                        backgroundColor: 'white',
                        padding: '1.15rem 1.25rem',
                        borderRadius: '20px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.6rem', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                    width: '26px',
                                    height: '26px',
                                    borderRadius: '50%',
                                    backgroundColor: '#ECFDF5',
                                    color: '#047857',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '900',
                                    fontSize: '0.82rem',
                                    border: '1px solid #A7F3D0'
                                }}>
                                    1
                                </div>
                                <h2 style={{
                                    margin: 0,
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    fontSize: '1.05rem',
                                    fontWeight: '900',
                                    color: '#0F172A',
                                    letterSpacing: '-0.02em'
                                }}>
                                    {locale === 'es' ? '¿A dónde y a quién entregamos?' : 'Delivery & Contact'}
                                </h2>
                            </div>

                            {/* Selector Para mí vs Para otra persona */}
                            <div style={{
                                display: 'inline-flex',
                                gap: '3px',
                                backgroundColor: '#F1F5F9',
                                padding: '2px',
                                borderRadius: '10px'
                            }}>
                                <button
                                    type="button"
                                    onClick={() => handleGiftToggle(false)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        padding: '4px 10px',
                                        borderRadius: '8px',
                                        fontSize: '0.74rem',
                                        fontWeight: !isGiftForRecipient ? '800' : '600',
                                        border: !isGiftForRecipient ? '1px solid #CBD5E1' : '1px solid transparent',
                                        backgroundColor: !isGiftForRecipient ? '#FFFFFF' : 'transparent',
                                        color: !isGiftForRecipient ? '#0F172A' : '#64748B',
                                        boxShadow: !isGiftForRecipient ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <User size={12} color={!isGiftForRecipient ? 'var(--primary)' : '#64748B'} />
                                    <span>{locale === 'es' ? 'Para mí' : 'For me'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        handleGiftToggle(true);
                                        if (!recipientName.trim() || !recipientPhone.trim()) {
                                            setIsEditingDeliveryInfo(true);
                                        }
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        padding: '4px 10px',
                                        borderRadius: '8px',
                                        fontSize: '0.74rem',
                                        fontWeight: isGiftForRecipient ? '800' : '600',
                                        border: isGiftForRecipient ? '1px solid #A7F3D0' : '1px solid transparent',
                                        backgroundColor: isGiftForRecipient ? '#ECFDF5' : 'transparent',
                                        color: isGiftForRecipient ? '#065F46' : '#64748B',
                                        boxShadow: isGiftForRecipient ? '0 1px 2px rgba(5,150,105,0.06)' : 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Gift size={12} color={isGiftForRecipient ? '#059669' : '#64748B'} />
                                    <span>{locale === 'es' ? 'Para otra persona' : 'For someone else'}</span>
                                </button>
                            </div>
                        </div>

                        {/* BADGE DE COLABORADOR FRUFRESCO (ESCENARIO 229 SDD) */}
                        {isCollaborator && (
                            <div style={{
                                marginBottom: '0.75rem',
                                padding: '0.55rem 0.85rem',
                                backgroundColor: '#ECFDF5',
                                border: '1.5px solid #10B981',
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: '#059669', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Sparkles size={14} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.78rem', fontWeight: '900', color: '#065F46' }}>
                                            👥 Colaborador FruFresco — Beneficio Activo
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: '#047857', fontWeight: '600' }}>
                                            {collaboratorInfo?.contact_name || name} {collaboratorInfo?.role ? `• ${collaboratorInfo.role}` : ''} | <strong>5% de descuento directo</strong> aplicado en tus alimentos
                                        </div>
                                    </div>
                                </div>
                                <span style={{
                                    backgroundColor: '#059669',
                                    color: '#FFFFFF',
                                    fontSize: '0.68rem',
                                    fontWeight: '900',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    letterSpacing: '0.03em'
                                }}>
                                    -5% DTO
                                </span>
                            </div>
                        )}

                        {/* SELECTOR DE ELEGIDOS (BENEFICIARIOS GUARDADOS PARA REGALOS / OTRA PERSONA) */}
                        {isGiftForRecipient && beneficiaries.length > 0 && (
                            <div style={{
                                backgroundColor: '#F0FDF4',
                                border: '1px solid #BBF7D0',
                                borderRadius: '12px',
                                padding: '0.65rem 0.85rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#166534', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                        <Heart size={13} color="#059669" />
                                        {locale === 'es' ? 'Tus Elegidos habituales:' : 'Your saved recipients:'}
                                    </span>
                                    <span style={{ fontSize: '0.68rem', color: '#15803D', fontWeight: '600' }}>
                                        {locale === 'es' ? '1 clic para asignar' : '1-click to assign'}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {beneficiaries.map((b: any, idx: number) => {
                                        const isSelected = selectedBeneficiaryIdx === idx && !isEditingDeliveryInfo;
                                        return (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => selectBeneficiary(b, idx)}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    padding: '4px 10px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.74rem',
                                                    fontWeight: isSelected ? '800' : '600',
                                                    border: isSelected ? '1.5px solid #059669' : '1px solid #A7F3D0',
                                                    backgroundColor: isSelected ? '#059669' : '#FFFFFF',
                                                    color: isSelected ? '#FFFFFF' : '#166534',
                                                    boxShadow: isSelected ? '0 2px 6px rgba(5,150,105,0.25)' : 'none',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <User size={12} color={isSelected ? '#FFFFFF' : '#059669'} />
                                                <span>{b.name}</span>
                                                {b.phone && <span style={{ opacity: isSelected ? 0.9 : 0.65, fontSize: '0.68rem' }}>({b.phone})</span>}
                                            </button>
                                        );
                                    })}

                                    <button
                                        type="button"
                                        onClick={selectNewBeneficiary}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            padding: '4px 10px',
                                            borderRadius: '20px',
                                            fontSize: '0.74rem',
                                            fontWeight: selectedBeneficiaryIdx === 'new' ? '800' : '600',
                                            border: selectedBeneficiaryIdx === 'new' ? '1.5px solid #059669' : '1px dashed #059669',
                                            backgroundColor: selectedBeneficiaryIdx === 'new' ? '#ECFDF5' : '#FFFFFF',
                                            color: '#047857',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <UserPlus size={12} />
                                        <span>{locale === 'es' ? '+ Enviar a alguien nuevo' : '+ New recipient'}</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* VIP RETURNING CUSTOMER CARD / DESTINATARIO ELEGIDO CARD */}
                        {isKnownCustomer && !isEditingDeliveryInfo ? (
                            <div style={{
                                background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                                border: '1.5px solid #E2E8F0',
                                borderRadius: '16px',
                                padding: '0.85rem 1.15rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{
                                            width: '36px',
                                            height: '36px',
                                            borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                                            color: 'white',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: '900',
                                            fontSize: '0.9rem',
                                            fontFamily: 'var(--font-outfit), sans-serif',
                                            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.2)'
                                        }}>
                                            {customerInitials}
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#047857', backgroundColor: '#ECFDF5', padding: '1px 6px', borderRadius: '4px', border: '1px solid #A7F3D0', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                    <CheckCircle2 size={10} color="#059669" />
                                                    {isGiftForRecipient ? (locale === 'es' ? 'Destinatario verificado' : 'Verified recipient') : (locale === 'es' ? 'Cliente frecuente' : 'Frequent customer')}
                                                </span>
                                            </div>
                                            <h3 style={{ margin: '1px 0 0 0', fontSize: '0.95rem', fontWeight: '900', color: '#0F172A', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                {isGiftForRecipient ? `Recibe en puerta: ${recipientName}` : `¡Hola de nuevo, ${name}!`}
                                            </h3>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setIsEditingDeliveryInfo(true)}
                                        style={{
                                            backgroundColor: 'white',
                                            border: '1px solid #CBD5E1',
                                            borderRadius: '8px',
                                            padding: '4px 10px',
                                            fontSize: '0.74rem',
                                            fontWeight: '700',
                                            color: '#334155',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Edit3 size={12} /> {locale === 'es' ? 'Modificar' : 'Edit'}
                                    </button>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '12px',
                                    backgroundColor: 'white',
                                    padding: '0.6rem 0.85rem',
                                    borderRadius: '12px',
                                    border: '1px solid #E2E8F0',
                                    fontSize: '0.78rem',
                                    color: '#334155'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <Phone size={12} color="var(--primary)" />
                                        <span style={{ fontWeight: '600' }}>{isGiftForRecipient ? recipientPhone : phone}</span>
                                    </div>
                                    {!isGiftForRecipient && email && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <Mail size={12} color="var(--primary)" />
                                            <span style={{ fontWeight: '500' }}>{email}</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#0F172A' }}>
                                        <MapPin size={12} color="var(--primary)" />
                                        <span style={{ fontWeight: '700' }}>{address}</span>
                                        {(buildingComplex || unitDetails) && (
                                            <span style={{ color: '#64748B' }}>• {[buildingComplex, unitDetails].filter(Boolean).join(' • ')}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Radar de portería micro-pill sin emojis */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.35rem 0.75rem',
                                    backgroundColor: latitude ? '#ECFDF5' : '#FFFBEB',
                                    border: `1px solid ${latitude ? '#A7F3D0' : '#FDE68A'}`,
                                    borderRadius: '8px',
                                    fontSize: '0.72rem',
                                    color: latitude ? '#065F46' : '#92400E',
                                    fontWeight: '600'
                                }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        {latitude ? <CheckCircle2 size={13} color="#059669" /> : <AlertTriangle size={13} color="#D97706" />}
                                        {latitude ? (locale === 'es' ? 'Ubicación exacta confirmada' : 'Exact delivery location verified') : (locale === 'es' ? 'Ubicación sin confirmar en mapa' : 'GPS unconfirmed')}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setShowMapPicker(true)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: latitude ? '#047857' : '#B45309',
                                            fontWeight: '800',
                                            fontSize: '0.72rem',
                                            cursor: 'pointer',
                                            textDecoration: 'underline'
                                        }}
                                    >
                                        {locale === 'es' ? 'Ajustar punto en el mapa' : 'Adjust pin on map'}
                                    </button>
                                </div>

                                {/* En modo regalo: Barra discreta de datos del comprador */}
                                {isGiftForRecipient && (
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px',
                                        backgroundColor: '#F8FAFC',
                                        border: '1px solid #E2E8F0',
                                        borderRadius: '10px',
                                        padding: '0.45rem 0.8rem',
                                        fontSize: '0.74rem',
                                        color: '#475569'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Receipt size={13} color="#64748B" />
                                                <span>
                                                    <strong>Comprador / Facturación:</strong> {name || 'Cliente'} {phone ? `(${phone})` : ''} {email ? `• ${email}` : ''}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setIsEditingBuyerInfo(!isEditingBuyerInfo)}
                                                style={{ background: 'none', border: 'none', color: '#047857', fontWeight: '700', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
                                            >
                                                {isEditingBuyerInfo ? (locale === 'es' ? 'Ocultar' : 'Hide') : (locale === 'es' ? 'Editar comprador' : 'Edit buyer')}
                                            </button>
                                        </div>

                                        {isEditingBuyerInfo && (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.4rem', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #CBD5E1' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Tu nombre completo *"
                                                    value={name}
                                                    onChange={(e) => handleNameChange(e.target.value)}
                                                    className="checkout-input-modern"
                                                    style={{ width: '100%', padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                                                />
                                                <input
                                                    type="tel"
                                                    placeholder="Tu WhatsApp / Celular *"
                                                    value={phone}
                                                    onChange={(e) => handlePhoneChange(e.target.value)}
                                                    className="checkout-input-modern"
                                                    style={{ width: '100%', padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                                                />
                                                <input
                                                    type="email"
                                                    placeholder="Tu Correo Electrónico *"
                                                    value={email}
                                                    onChange={(e) => handleEmailChange(e.target.value)}
                                                    className="checkout-input-modern"
                                                    style={{ width: '100%', padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* FORMULARIO DE CAPTURA RÁPIDA (ALTA DENSIDAD EN EJE Y) */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                
                                {isGiftForRecipient ? (
                                    /* MODO REGALO: CAPTURA EXCLUSIVA DEL DESTINATARIO */
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#166534', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                <Gift size={14} color="#059669" />
                                                {locale === 'es' ? 'Datos de quien recibe en portería o puerta:' : 'Recipient details at door or gate:'}
                                            </span>
                                            {beneficiaries.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsEditingDeliveryInfo(false);
                                                        if (selectedBeneficiaryIdx === 'new') selectBeneficiary(beneficiaries[0], 0);
                                                    }}
                                                    style={{ background: 'none', border: 'none', color: '#047857', fontWeight: '700', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
                                                >
                                                    {locale === 'es' ? '← Volver a mis elegidos' : '← Back to saved recipients'}
                                                </button>
                                            )}
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                                            <div>
                                                <input
                                                    type="text"
                                                    placeholder="Nombre de quien recibe *"
                                                    value={recipientName}
                                                    onChange={(e) => handleRecipientNameChange(e.target.value)}
                                                    className="checkout-input-modern"
                                                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '10px', border: '1px solid #86EFAC', fontSize: '0.82rem', fontWeight: '600' }}
                                                />
                                            </div>
                                            <div>
                                                <input
                                                    type="tel"
                                                    placeholder="WhatsApp de quien recibe *"
                                                    value={recipientPhone}
                                                    onChange={(e) => handleRecipientPhoneChange(e.target.value)}
                                                    className="checkout-input-modern"
                                                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '10px', border: '1px solid #86EFAC', fontSize: '0.82rem', fontWeight: '600' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* MODO PARA MÍ: DATOS DE CONTACTO DEL COMPRADOR */
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.5rem' }}>
                                        <div style={{ position: 'relative' }}>
                                            <div style={{ position: 'absolute', left: '10px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)', opacity: 0.5, pointerEvents: 'none' }}>
                                                <User size={14} />
                                            </div>
                                            <input
                                                type="text"
                                                placeholder={t.fullNamePlaceholder + " *"}
                                                value={name}
                                                onChange={(e) => handleNameChange(e.target.value)}
                                                className="checkout-input-modern"
                                                style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2.1rem', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.82rem', fontWeight: '500' }}
                                            />
                                        </div>

                                        <div style={{ position: 'relative' }}>
                                            <div style={{ position: 'absolute', left: '10px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)', opacity: 0.5, pointerEvents: 'none' }}>
                                                <Phone size={14} />
                                            </div>
                                            <input
                                                type="tel"
                                                placeholder={(locale === 'es' ? "WhatsApp / Celular *" : "WhatsApp Phone *")}
                                                value={phone}
                                                onChange={(e) => handlePhoneChange(e.target.value)}
                                                className="checkout-input-modern"
                                                style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2.1rem', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.82rem', fontWeight: '500' }}
                                            />
                                        </div>

                                        <div style={{ position: 'relative' }}>
                                            <div style={{ position: 'absolute', left: '10px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)', opacity: 0.5, pointerEvents: 'none' }}>
                                                <Mail size={14} />
                                            </div>
                                            <input
                                                type="email"
                                                placeholder={t.emailPlaceholder + " *"}
                                                value={email}
                                                onChange={(e) => handleEmailChange(e.target.value)}
                                                className="checkout-input-modern"
                                                style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2.1rem', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.82rem', fontWeight: '500' }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* MOTOR DE DIRECCIONES CON GOOGLE PLACES AUTOCOMPLETE (CON SU PROPIO RADAR INTEGRADO) */}
                                <div>
                                    <GooglePlacesAddressInput
                                        address={address}
                                        onAddressChange={handleAddressChange}
                                        latitude={latitude}
                                        longitude={longitude}
                                        onCoordinatesResolved={handleCoordinatesResolved}
                                        onOpenMapPicker={() => setShowMapPicker(true)}
                                        isOutOfZone={outOfZone}
                                        locale={locale as 'es' | 'en'}
                                        label={isGiftForRecipient ? (locale === 'es' ? 'Dirección de quien recibe' : 'Recipient Address') : (locale === 'es' ? 'Dirección de entrega' : 'Delivery Address')}
                                        placeholder={locale === 'es' ? 'Escribe la calle, carrera o avenida en Bogotá (Ej: Calle 140 # 19-35)' : 'Enter address in Bogotá'}
                                    />
                                </div>

                                {/* Complemento de Dirección: Conjunto + Torre/Apto */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', left: '10px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: '#94A3B8', pointerEvents: 'none' }}>
                                            <Building2 size={14} />
                                        </div>
                                        <input
                                            type="text"
                                            placeholder={locale === 'es' ? 'Conjunto o Edificio (Opcional)' : 'Building / Complex (Optional)'}
                                            value={buildingComplex}
                                            onChange={(e) => handleBuildingComplexChange(e.target.value)}
                                            className="checkout-input-modern"
                                            style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2.1rem', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.82rem' }}
                                        />
                                    </div>

                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', left: '10px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: '#94A3B8', pointerEvents: 'none' }}>
                                            <Home size={14} />
                                        </div>
                                        <input
                                            type="text"
                                            placeholder={locale === 'es' ? 'Torre, Apto o Casa *' : 'Tower, Apt or House *'}
                                            value={unitDetails}
                                            onChange={(e) => handleUnitDetailsChange(e.target.value)}
                                            className="checkout-input-modern"
                                            style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2.1rem', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                </div>

                                {/* En modo regalo mientras se edita: Barra de datos del comprador */}
                                {isGiftForRecipient && (
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px',
                                        backgroundColor: '#F8FAFC',
                                        border: '1px solid #E2E8F0',
                                        borderRadius: '10px',
                                        padding: '0.45rem 0.8rem',
                                        fontSize: '0.74rem',
                                        color: '#475569'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Receipt size={13} color="#64748B" />
                                                <span>
                                                    <strong>Tus datos de comprador (Facturación):</strong> {name || 'Cliente'} {phone ? `(${phone})` : ''}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setIsEditingBuyerInfo(!isEditingBuyerInfo)}
                                                style={{ background: 'none', border: 'none', color: '#047857', fontWeight: '700', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
                                            >
                                                {isEditingBuyerInfo ? (locale === 'es' ? 'Cerrar' : 'Close') : (locale === 'es' ? 'Modificar mis datos' : 'Modify my data')}
                                            </button>
                                        </div>

                                        {isEditingBuyerInfo && (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.4rem', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #CBD5E1' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Tu nombre completo *"
                                                    value={name}
                                                    onChange={(e) => handleNameChange(e.target.value)}
                                                    className="checkout-input-modern"
                                                    style={{ width: '100%', padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                                                />
                                                <input
                                                    type="tel"
                                                    placeholder="Tu WhatsApp / Celular *"
                                                    value={phone}
                                                    onChange={(e) => handlePhoneChange(e.target.value)}
                                                    className="checkout-input-modern"
                                                    style={{ width: '100%', padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                                                />
                                                <input
                                                    type="email"
                                                    placeholder="Tu Correo Electrónico *"
                                                    value={email}
                                                    onChange={(e) => handleEmailChange(e.target.value)}
                                                    className="checkout-input-modern"
                                                    style={{ width: '100%', padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* TOGGLE FACTURA ELECTRÓNICA CON NIT (DISCRETO Y NO BLOQUEANTE) */}
                                <div style={{
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '10px',
                                    padding: '0.5rem 0.75rem',
                                    backgroundColor: requiresInvoiceWithNit ? '#F8FAFC' : '#FFFFFF',
                                    transition: 'all 0.2s ease'
                                }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '0.78rem', fontWeight: '700', color: '#334155' }}>
                                        <input
                                            type="checkbox"
                                            checked={requiresInvoiceWithNit}
                                            onChange={(e) => setRequiresInvoiceWithNit(e.target.checked)}
                                            style={{ width: '15px', height: '15px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                                        />
                                        <Receipt size={14} color="var(--primary)" />
                                        <span>{locale === 'es' ? '¿Requieres Factura Electrónica con NIT para tu empresa?' : 'Require electronic tax invoice with corporate NIT?'}</span>
                                    </label>

                                    {requiresInvoiceWithNit && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed #CBD5E1' }}>
                                            <input
                                                type="text"
                                                placeholder="NIT / Cédula Fiscal *"
                                                value={companyNit}
                                                onChange={(e) => {
                                                    setCompanyNit(e.target.value);
                                                    setIdentification(e.target.value);
                                                }}
                                                className="checkout-input-modern"
                                                style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Razón Social de la Empresa *"
                                                value={companyBusinessName}
                                                onChange={(e) => setCompanyBusinessName(e.target.value)}
                                                className="checkout-input-modern"
                                                style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                            />
                                        </div>
                                    )}
                                </div>

                                {isEditingDeliveryInfo && isKnownCustomer && (
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => setIsEditingDeliveryInfo(false)}
                                            style={{
                                                padding: '0.45rem 0.95rem',
                                                borderRadius: '10px',
                                                backgroundColor: '#047857',
                                                color: 'white',
                                                border: 'none',
                                                fontWeight: '800',
                                                fontSize: '0.76rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}
                                        >
                                            <CheckCircle2 size={13} />
                                            {locale === 'es' ? 'Guardar y Continuar' : 'Save & Continue'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* PASO 2: ¿CUÁNDO ENTREGAMOS Y EMPAQUE? (COMPACTO) */}
                    <div style={{
                        backgroundColor: 'white',
                        padding: '1.15rem 1.25rem',
                        borderRadius: '20px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.5rem' }}>
                            <div style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                backgroundColor: '#ECFDF5',
                                color: '#047857',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '900',
                                fontSize: '0.82rem',
                                border: '1px solid #A7F3D0'
                            }}>
                                2
                            </div>
                            <h2 style={{
                                margin: 0,
                                fontFamily: 'var(--font-outfit), sans-serif',
                                fontSize: '1.05rem',
                                fontWeight: '900',
                                color: '#0F172A',
                                letterSpacing: '-0.02em'
                            }}>
                                {locale === 'es' ? '¿Cuándo entregamos y empaque?' : 'Delivery Schedule & Packaging'}
                            </h2>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            {(storeStatus === 'vacation_preorder' || (vacationConfig?.enabled && vacationConfig.startDate && vacationConfig.endDate)) && (
                                <div style={{
                                    padding: '0.75rem 0.9rem',
                                    borderRadius: '12px',
                                    backgroundColor: 'rgba(236, 253, 245, 0.9)',
                                    border: '1px solid #A7F3D0',
                                    backdropFilter: 'blur(8px)',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '10px',
                                    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.06)'
                                }}>
                                    <CalendarClock size={18} color="#047857" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <div style={{ fontSize: '0.75rem', color: '#065F46', lineHeight: 1.45 }}>
                                        <div style={{ fontWeight: 800, color: '#047857', marginBottom: '2px' }}>
                                            {vacationConfig?.reasonTitle || 'Agenda de Retorno con Prioridad #1 de Abastecimiento'}
                                        </div>
                                        <div>
                                            {vacationConfig?.customMessage || `Nuestras rutas descansan del ${vacationConfig?.startDate || '—'} al ${vacationConfig?.endDate || '—'}. Tu pedido se agenda automáticamente para nuestra primera ruta hábil (${minDeliveryDate}).`}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Selector Concierge de Fechas (Píldoras 1-Tap) */}
                            <div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    {quickDates.map((q) => {
                                        const isSelected = date === q.dateStr;
                                        return (
                                            <button
                                                key={q.dateStr}
                                                type="button"
                                                onClick={() => setDate(q.dateStr)}
                                                style={{
                                                    flex: '1 1 100px',
                                                    padding: '0.5rem 0.65rem',
                                                    borderRadius: '10px',
                                                    border: isSelected ? '2px solid var(--primary)' : '1px solid #E2E8F0',
                                                    backgroundColor: isSelected ? '#ECFDF5' : '#FFFFFF',
                                                    color: isSelected ? '#047857' : '#334155',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <span style={{ fontSize: '0.64rem', fontWeight: '800', textTransform: 'uppercase', color: isSelected ? '#059669' : '#64748B' }}>
                                                    {q.weekday}
                                                </span>
                                                <span style={{ fontSize: '0.86rem', fontWeight: '900', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                    {q.label}
                                                </span>
                                            </button>
                                        );
                                    })}

                                    <div style={{ position: 'relative', width: '130px', flexShrink: 0 }}>
                                        <div style={{ position: 'absolute', left: '8px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)', opacity: 0.5, pointerEvents: 'none' }}>
                                            <Calendar size={13} />
                                        </div>
                                        <input
                                            type="date"
                                            value={date}
                                            onChange={(e) => {
                                                const picked = e.target.value;
                                                if (!picked) return;
                                                if (picked < minDeliveryDate || !isValidDeliveryDate(picked, allowSundays, allowHolidays, vacationConfig)) {
                                                    const nextValid = getNextValidDeliveryDate(picked < minDeliveryDate ? minDeliveryDate : picked, allowSundays, allowHolidays, vacationConfig).toISOString().split('T')[0];
                                                    setDate(nextValid);
                                                    notify(
                                                        locale === 'es'
                                                            ? `El día seleccionado no cuenta con despacho (domingo, festivo o receso). Ajustado automáticamente al ${nextValid}.`
                                                            : `Selected date has no delivery route. Auto-adjusted to ${nextValid}.`,
                                                        'warning'
                                                    );
                                                } else {
                                                    setDate(picked);
                                                }
                                            }}
                                            min={minDeliveryDate}
                                            className="checkout-input-modern"
                                            style={{ width: '100%', padding: '0.45rem 0.5rem 0.45rem 1.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Modalidad de Empaque sin emojis */}
                            {packagingFeeEnabled && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        {locale === 'es' ? '¿Cómo prefieres empacar tu mercado?' : 'Packaging preference'}
                                    </div>

                                    {/* Opción 1: Recambio canastilla propia ($0) */}
                                    <div
                                        onClick={() => handleSelectPackagingMode('own_crate')}
                                        style={{
                                            padding: '0.55rem 0.85rem',
                                            borderRadius: '10px',
                                            border: packagingMode === 'own_crate' ? '2px solid var(--primary)' : '1px solid #E2E8F0',
                                            backgroundColor: packagingMode === 'own_crate' ? '#F0FDF4' : '#FFFFFF',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="radio"
                                                checked={packagingMode === 'own_crate'}
                                                onChange={() => handleSelectPackagingMode('own_crate')}
                                                style={{ accentColor: 'var(--primary)' }}
                                            />
                                            <RefreshCw size={13} color="#059669" />
                                            <div>
                                                <span style={{ fontWeight: '800', fontSize: '0.8rem', color: '#0F172A' }}>
                                                    {locale === 'es' ? 'Ya tengo mi Canastilla Naranja (Recambio ecológico)' : 'Exchange my Orange Crate'}
                                                </span>
                                                <p style={{ margin: 0, fontSize: '0.68rem', color: '#64748B' }}>
                                                    {locale === 'es'
                                                        ? `Entregas ${suggestedCrates} ${suggestedCrates === 1 ? 'canastilla vacía' : 'canastillas vacías'} al conductor al recibir tu pedido (~${produceWeightKg.toFixed(1)} kg). $0 en bolsas.`
                                                        : `Hand over ${suggestedCrates} empty crate${suggestedCrates > 1 ? 's' : ''}. $0 bag fee.`}
                                                </p>
                                            </div>
                                        </div>
                                        <span style={{ fontWeight: '900', color: '#047857', fontSize: '0.84rem' }}>$0</span>
                                    </div>

                                    {/* Opción 2: Comprar Canastilla Naranja (Única vez) */}
                                    <div
                                        onClick={() => handleSelectPackagingMode('buy_crate')}
                                        style={{
                                            padding: '0.55rem 0.85rem',
                                            borderRadius: '10px',
                                            border: packagingMode === 'buy_crate' ? '2px solid #EA580C' : '1px solid #E2E8F0',
                                            backgroundColor: packagingMode === 'buy_crate' ? '#FFF7ED' : '#FFFFFF',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="radio"
                                                    checked={packagingMode === 'buy_crate'}
                                                    onChange={() => handleSelectPackagingMode('buy_crate')}
                                                    style={{ accentColor: '#EA580C' }}
                                                />
                                                <Package size={13} color="#C2410C" />
                                                <div>
                                                    <span style={{ fontWeight: '800', fontSize: '0.8rem', color: '#9A3412' }}>
                                                        {locale === 'es' ? 'Comprar Canastilla Naranja FruFresco (Única vez)' : 'Buy Orange Crate (One-time)'}
                                                    </span>
                                                    <p style={{ margin: 0, fontSize: '0.68rem', color: '#78350F' }}>
                                                        {locale === 'es' ? 'Ahorras en bolsas plásticas y las intercambias gratis en tus próximos pedidos.' : 'Save on plastic bags and exchange them free on future orders.'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {packagingMode === 'buy_crate' && (
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            backgroundColor: '#FFFFFF',
                                                            border: '1px solid #EA580C',
                                                            borderRadius: '8px',
                                                            padding: '2px 5px'
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCrateQuantityChange(-1)}
                                                            disabled={crateQuantity <= 1}
                                                            style={{
                                                                width: '20px',
                                                                height: '20px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                borderRadius: '4px',
                                                                border: 'none',
                                                                background: crateQuantity <= 1 ? '#F1F5F9' : '#FFF7ED',
                                                                color: crateQuantity <= 1 ? '#94A3B8' : '#EA580C',
                                                                cursor: crateQuantity <= 1 ? 'not-allowed' : 'pointer',
                                                                fontWeight: '900',
                                                                fontSize: '0.75rem'
                                                            }}
                                                        >
                                                            -
                                                        </button>
                                                        <span style={{ fontSize: '0.78rem', fontWeight: '900', color: '#9A3412', minWidth: '18px', textAlign: 'center' }}>
                                                            {crateQuantity || suggestedCrates}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCrateQuantityChange(1)}
                                                            style={{
                                                                width: '20px',
                                                                height: '20px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                borderRadius: '4px',
                                                                border: 'none',
                                                                background: '#FFF7ED',
                                                                color: '#EA580C',
                                                                cursor: 'pointer',
                                                                fontWeight: '900',
                                                                fontSize: '0.75rem'
                                                            }}
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                )}
                                                <span style={{ fontWeight: '900', color: '#C2410C', fontSize: '0.84rem' }}>
                                                    +${((crateQuantity || suggestedCrates) * crateUnitPrice).toLocaleString('es-CO')}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Capacidad de Transporte */}
                                        {packagingMode === 'buy_crate' && (
                                            <div style={{
                                                marginTop: '2px',
                                                padding: '5px 8px',
                                                backgroundColor: '#FFFBEB',
                                                borderRadius: '7px',
                                                border: '1px solid #FDE68A',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '6px'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Truck size={12} color="#D97706" />
                                                    <span style={{ fontSize: '0.67rem', color: '#92400E', fontWeight: '600' }}>
                                                        Capacidad: <strong>{avgKgPerCrate} kg por canastilla</strong>. Carga estimada: <strong>~{produceWeightKg.toFixed(1)} kg</strong> → Sugeridas: <strong>{suggestedCrates} {suggestedCrates === 1 ? 'canastilla' : 'canastillas'}</strong>.
                                                    </span>
                                                </div>
                                                {crateQuantity !== suggestedCrates && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (crateCartItem) {
                                                                updateItemQuantity(crateCartItem.id, crateCartItem.name, suggestedCrates);
                                                            }
                                                        }}
                                                        style={{
                                                            background: '#FEF3C7',
                                                            border: '1px solid #F59E0B',
                                                            borderRadius: '5px',
                                                            padding: '2px 6px',
                                                            fontSize: '0.62rem',
                                                            fontWeight: '800',
                                                            color: '#B45309',
                                                            cursor: 'pointer',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        Ajustar a {suggestedCrates}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Opción 3: Bolsas plásticas */}
                                    <div
                                        onClick={() => handleSelectPackagingMode('plastic_bags')}
                                        style={{
                                            padding: '0.55rem 0.85rem',
                                            borderRadius: '10px',
                                            border: packagingMode === 'plastic_bags' ? '2px solid var(--primary)' : '1px solid #E2E8F0',
                                            backgroundColor: packagingMode === 'plastic_bags' ? '#ECFDF5' : '#FFFFFF',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="radio"
                                                checked={packagingMode === 'plastic_bags'}
                                                onChange={() => handleSelectPackagingMode('plastic_bags')}
                                                style={{ accentColor: 'var(--primary)' }}
                                            />
                                            <Leaf size={13} color="#059669" />
                                            <div>
                                                <span style={{ fontWeight: '800', fontSize: '0.8rem', color: '#0F172A' }}>
                                                    {locale === 'es' ? 'Empaque en bolsas plásticas convencionales' : 'Standard plastic bag packaging'}
                                                </span>
                                                <p style={{ margin: 0, fontSize: '0.68rem', color: '#64748B' }}>
                                                    {locale === 'es' ? 'Empaque convencional en bolsas plásticas para tus alimentos.' : 'Standard packaging fee in plastic bags.'}
                                                </p>
                                            </div>
                                        </div>
                                        <span style={{ fontWeight: '900', color: '#047857', fontSize: '0.84rem' }}>
                                            +${previewPlasticFeeAmount.toLocaleString('es-CO')}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Instrucciones y notas especiales */}
                            <div>
                                <textarea
                                    placeholder={locale === 'es' ? "Indicaciones de entrega para el domiciliario (Ej: Dejar en portería, Torre 3 Apto 501)" : "Delivery instructions for driver"}
                                    value={specialNotes}
                                    onChange={(e) => handleNotesChange(e.target.value)}
                                    maxLength={300}
                                    rows={1}
                                    className="checkout-input-modern"
                                    style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.8rem', resize: 'vertical' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* PASO 3: MÉTODO DE PAGO (COMPACTO) */}
                    <div style={{
                        backgroundColor: 'white',
                        padding: '1.15rem 1.25rem',
                        borderRadius: '20px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.5rem' }}>
                            <div style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                backgroundColor: '#ECFDF5',
                                color: '#047857',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '900',
                                fontSize: '0.82rem',
                                border: '1px solid #A7F3D0'
                            }}>
                                3
                            </div>
                            <h2 style={{
                                margin: 0,
                                fontFamily: 'var(--font-outfit), sans-serif',
                                fontSize: '1.05rem',
                                fontWeight: '900',
                                color: '#0F172A',
                                letterSpacing: '-0.02em'
                            }}>
                                {locale === 'es' ? 'Método de Pago' : 'Payment Method'}
                            </h2>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                            {/* Wompi Online */}
                            <div
                                onClick={() => handlePaymentMethodChange('wompi')}
                                style={{
                                    padding: '0.75rem 0.95rem',
                                    borderRadius: '12px',
                                    border: `2px solid ${paymentMethod === 'wompi' ? 'var(--primary)' : '#E2E8F0'}`,
                                    backgroundColor: paymentMethod === 'wompi' ? 'rgba(5, 150, 105, 0.04)' : '#FFFFFF',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{
                                            width: '18px',
                                            height: '18px',
                                            borderRadius: '50%',
                                            border: `2px solid ${paymentMethod === 'wompi' ? 'var(--primary)' : '#CBD5E1'}`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            {paymentMethod === 'wompi' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />}
                                        </div>
                                        <span style={{ fontWeight: '900', fontSize: '0.86rem', color: '#0F172A', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            {locale === 'es' ? 'Pago Seguro Online' : 'Secure Online Payment'}
                                        </span>
                                    </div>
                                    <ShieldCheck size={16} color={paymentMethod === 'wompi' ? 'var(--primary)' : '#94A3B8'} />
                                </div>
                                <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748B' }}>
                                    {locale === 'es' ? 'PSE, Nequi, Daviplata, Tarjetas Débito y Crédito (Wompi).' : 'Cards, PSE, Nequi.'}
                                </p>
                            </div>

                            {/* Contra Entrega */}
                            {(() => {
                                const isCodExceeded = !isB2B && totalPrice > maxOrderHogarCod;
                                return (
                                    <div
                                        onClick={() => { if (!isCodExceeded) handlePaymentMethodChange('contra_entrega'); }}
                                        style={{
                                            padding: '0.75rem 0.95rem',
                                            borderRadius: '12px',
                                            border: `2px solid ${paymentMethod === 'contra_entrega' && !isCodExceeded ? 'var(--primary)' : '#E2E8F0'}`,
                                            backgroundColor: isCodExceeded ? '#F8FAFC' : (paymentMethod === 'contra_entrega' ? 'rgba(5, 150, 105, 0.04)' : '#FFFFFF'),
                                            cursor: isCodExceeded ? 'not-allowed' : 'pointer',
                                            opacity: isCodExceeded ? 0.6 : 1,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <div style={{
                                                    width: '18px',
                                                    height: '18px',
                                                    borderRadius: '50%',
                                                    border: `2px solid ${paymentMethod === 'contra_entrega' && !isCodExceeded ? 'var(--primary)' : '#CBD5E1'}`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    {paymentMethod === 'contra_entrega' && !isCodExceeded && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />}
                                                </div>
                                                <span style={{ fontWeight: '900', fontSize: '0.86rem', color: '#0F172A', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                    {locale === 'es' ? 'Pago Contra Entrega' : 'Cash on Delivery'}
                                                </span>
                                            </div>
                                            <Truck size={16} color={paymentMethod === 'contra_entrega' && !isCodExceeded ? 'var(--primary)' : '#94A3B8'} />
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.7rem', color: isCodExceeded ? '#DC2626' : '#64748B' }}>
                                            {isCodExceeded 
                                                ? (locale === 'es' ? `Tope superado (Máx $${maxOrderHogarCod.toLocaleString('es-CO')}). Paga online.` : 'Limit exceeded.')
                                                : (locale === 'es' ? 'Pagas en efectivo o transferencia al recibir en puerta.' : 'Pay on delivery.')}
                                        </p>
                                    </div>
                                );
                            })()}

                            {/* Opción Exclusiva: Deducción de Nómina (Crédito Empleado) - Escenario 229 SDD */}
                            {isCollaborator && (
                                <div
                                    onClick={() => handlePaymentMethodChange('payroll_deduction')}
                                    style={{
                                        padding: '0.75rem 0.95rem',
                                        borderRadius: '12px',
                                        border: `2px solid ${paymentMethod === 'payroll_deduction' ? '#047857' : '#10B981'}`,
                                        backgroundColor: paymentMethod === 'payroll_deduction' ? '#ECFDF5' : '#F0FDF4',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px',
                                        transition: 'all 0.15s ease',
                                        boxShadow: paymentMethod === 'payroll_deduction' ? '0 0 0 1px #047857' : 'none'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <div style={{
                                                width: '18px',
                                                height: '18px',
                                                borderRadius: '50%',
                                                border: `2px solid ${paymentMethod === 'payroll_deduction' ? '#047857' : '#059669'}`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: '#FFFFFF'
                                            }}>
                                                {paymentMethod === 'payroll_deduction' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#047857' }} />}
                                            </div>
                                            <span style={{ fontWeight: '900', fontSize: '0.86rem', color: '#064E3B', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                {locale === 'es' ? 'Deducción de Nómina' : 'Payroll Deduction'}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '0.64rem', fontWeight: '800', backgroundColor: '#059669', color: '#FFFFFF', padding: '1px 6px', borderRadius: '4px' }}>
                                            CRÉDITO
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#047857' }}>
                                        {locale === 'es' ? 'Descuento quincenal por nómina (Columna N). Sin desembolso hoy.' : 'Deducted directly from next paycheck.'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN: STICKY FINANCIAL SUMMARY & CTA (40% - ALTA DENSIDAD) */}
                <div style={{ position: 'sticky', top: '85px', zIndex: 10 }}>
                    <div style={{
                        backgroundColor: 'white',
                        padding: '1.15rem 1.25rem',
                        borderRadius: '20px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem'
                    }}>
                        {/* Summary Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.5rem' }}>
                            <h3 style={{
                                margin: 0,
                                fontFamily: 'var(--font-outfit), sans-serif',
                                fontSize: '1.1rem',
                                fontWeight: '900',
                                color: '#0F172A',
                                letterSpacing: '-0.02em',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <Receipt size={17} color="var(--primary)" />
                                {locale === 'es' ? 'Resumen de Compra' : 'Order Summary'}
                            </h3>
                            <span style={{
                                fontSize: '0.7rem',
                                fontWeight: '800',
                                backgroundColor: '#ECFDF5',
                                color: '#047857',
                                padding: '2px 7px',
                                borderRadius: '6px',
                                border: '1px solid #A7F3D0'
                            }}>
                                {items.length} {items.length === 1 ? 'producto' : 'productos'}
                            </span>
                        </div>

                        {/* Desplegable / Accordion de Canasta */}
                        <div style={{
                            border: '1px solid #E2E8F0',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            backgroundColor: '#F8FAFC'
                        }}>
                            <button
                                type="button"
                                onClick={() => setShowCartItemsList(prev => !prev)}
                                style={{
                                    width: '100%',
                                    padding: '0.5rem 0.75rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.76rem',
                                    fontWeight: '700',
                                    color: '#334155'
                                }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <ShoppingCart size={13} color="var(--primary)" />
                                    {locale === 'es' ? 'Ver detalle de la canasta' : 'View cart items'}
                                </span>
                                {showCartItemsList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            {showCartItemsList && (
                                <div style={{
                                    maxHeight: '220px',
                                    overflowY: 'auto',
                                    padding: '0.4rem 0.65rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                    borderTop: '1px solid #E2E8F0',
                                    backgroundColor: '#FFFFFF'
                                }}>
                                    {items.map((item) => (
                                        <div
                                            key={`${item.id}-${item.variant_label || ''}`}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '0.35rem 0',
                                                borderBottom: '1px dashed #F1F5F9',
                                                fontSize: '0.74rem'
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0, paddingRight: '6px' }}>
                                                <div style={{ fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {item.name}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                    {item.quantity} x ${item.price.toLocaleString('es-CO')}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E2E8F0', borderRadius: '5px', overflow: 'hidden' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (item.quantity <= 1) {
                                                                removeItem(item.id, item.name);
                                                            } else {
                                                                updateItemQuantity(item.id, item.name, item.quantity - 1);
                                                            }
                                                        }}
                                                        style={{ border: 'none', background: 'white', padding: '1px 5px', cursor: 'pointer', fontWeight: '800', fontSize: '0.75rem' }}
                                                    >-</button>
                                                    <span style={{ padding: '1px 5px', fontWeight: '800', fontSize: '0.7rem' }}>{item.quantity}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateItemQuantity(item.id, item.name, item.quantity + 1)}
                                                        style={{ border: 'none', background: 'white', padding: '1px 5px', cursor: 'pointer', fontWeight: '800', fontSize: '0.75rem' }}
                                                    >+</button>
                                                </div>
                                                <span style={{ fontWeight: '800', color: '#0F172A', minWidth: '55px', textAlign: 'right' }}>
                                                    ${(item.price * item.quantity).toLocaleString('es-CO')}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Desglose Financiero */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                                <span>{locale === 'es' ? 'Subtotal Productos' : 'Products Subtotal'}</span>
                                <span style={{ fontWeight: '700', color: '#0F172A' }}>${roundedSubtotal.toLocaleString('es-CO')}</span>
                            </div>

                            {packagingFeeEnabled && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                                    <span>{locale === 'es' ? 'Empaque Ecológico' : 'Eco Packaging'}</span>
                                    <span style={{ fontWeight: '700', color: packagingFeeAmount > 0 ? '#0F172A' : '#059669' }}>
                                        {packagingFeeAmount > 0 ? `+$${packagingFeeAmount.toLocaleString('es-CO')}` : '$0'}
                                    </span>
                                </div>
                            )}

                            {/* Descuento Colaborador FruFresco (5%) */}
                            {isCollaborator && collaboratorDiscountAmount > 0 && (
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0.35rem 0.55rem',
                                    borderRadius: '8px',
                                    backgroundColor: '#ECFDF5',
                                    border: '1px solid #A7F3D0'
                                }}>
                                    <span style={{ color: '#065F46', fontWeight: '800', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Sparkles size={13} color="#059669" />
                                        {locale === 'es' ? 'Descuento Colaborador (5%)' : 'Employee Discount (5%)'}
                                    </span>
                                    <span style={{ fontWeight: '900', color: '#059669', fontSize: '0.82rem' }}>
                                        -${collaboratorDiscountAmount.toLocaleString('es-CO')}
                                    </span>
                                </div>
                            )}

                            {/* Domicilio */}
                            {!isB2B && (
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0.35rem 0.55rem',
                                    borderRadius: '8px',
                                    backgroundColor: isFreeShipping ? '#ECFDF5' : '#F8FAFC',
                                    border: isFreeShipping ? '1px solid #A7F3D0' : '1px solid #E2E8F0'
                                }}>
                                    <span style={{ color: isFreeShipping ? '#065F46' : '#475569', fontWeight: '700', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Truck size={13} color={isFreeShipping ? '#059669' : '#64748B'} />
                                        {locale === 'es' ? 'Domicilio' : 'Delivery'}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        {isFreeShipping ? (
                                            <>
                                                <span style={{ textDecoration: 'line-through', color: '#94A3B8', fontSize: '0.7rem' }}>
                                                    ${deliveryFee.toLocaleString('es-CO')}
                                                </span>
                                                <span style={{ fontWeight: '900', color: '#059669', fontSize: '0.8rem' }}>
                                                    ¡GRATIS!
                                                </span>
                                            </>
                                        ) : (
                                            <span style={{ fontWeight: '800', color: '#0F172A' }}>
                                                +${deliveryFeeAmount.toLocaleString('es-CO')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Barra Progreso Domicilio Gratis */}
                            {!isB2B && !isFreeShipping && (
                                <div style={{
                                    padding: '0.45rem 0.65rem',
                                    borderRadius: '8px',
                                    backgroundColor: '#FFFBEB',
                                    border: '1px solid #FDE68A'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                        <span style={{ fontSize: '0.67rem', fontWeight: '800', color: '#B45309' }}>
                                            {locale === 'es' ? `Faltan $${missingForFreeShipping.toLocaleString('es-CO')} para Domicilio GRATIS` : `$${missingForFreeShipping.toLocaleString('en-US')} to Free Delivery`}
                                        </span>
                                        <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#D97706' }}>
                                            {freeShippingProgress}%
                                        </span>
                                    </div>
                                    <div style={{ width: '100%', height: '4px', backgroundColor: '#FDE68A', borderRadius: '999px', overflow: 'hidden' }}>
                                        <div style={{ width: `${freeShippingProgress}%`, height: '100%', backgroundColor: '#D97706', borderRadius: '999px', transition: 'width 0.4s ease' }} />
                                    </div>
                                </div>
                            )}

                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'baseline',
                                paddingTop: '0.6rem',
                                borderTop: '2px solid #F1F5F9',
                                marginTop: '2px'
                            }}>
                                <span style={{
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    fontSize: '0.98rem',
                                    fontWeight: '900',
                                    color: '#0F172A'
                                }}>
                                    {locale === 'es' ? 'Gran Total' : 'Total'}
                                </span>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        fontSize: '1.5rem',
                                        fontWeight: '950',
                                        color: '#047857',
                                        letterSpacing: '-0.03em'
                                    }}>
                                        ${finalOrderTotal.toLocaleString('es-CO')}
                                    </span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748B', marginLeft: '3px' }}>COP</span>
                                </div>
                            </div>
                        </div>

                        {checkoutNotice && (
                            <div style={{
                                padding: '0.65rem',
                                borderRadius: '10px',
                                backgroundColor: checkoutNotice.type === 'error' ? '#FEF2F2' : checkoutNotice.type === 'success' ? '#ECFDF5' : '#FFFBEB',
                                border: `1px solid ${checkoutNotice.type === 'error' ? '#FCA5A5' : checkoutNotice.type === 'success' ? '#A7F3D0' : '#FDE68A'}`,
                                color: checkoutNotice.type === 'error' ? '#991B1B' : checkoutNotice.type === 'success' ? '#065F46' : '#92400E',
                                fontSize: '0.74rem',
                                fontWeight: '700'
                            }}>
                                {checkoutNotice.message}
                            </div>
                        )}

                        {/* CTA BOTÓN PRIMARIO CON ÍCONOS LUCIDE EXCLUSIVOS */}
                        {storeStatus === 'closed' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={handleSaveCartForReopen}
                                    disabled={items.length === 0}
                                    style={{
                                        width: '100%',
                                        padding: '0.85rem',
                                        fontSize: '0.9rem',
                                        borderRadius: '14px',
                                        fontWeight: '900',
                                        backgroundColor: items.length === 0 ? '#CBD5E1' : cartSavedForReopen ? '#047857' : '#0F172A',
                                        color: items.length === 0 ? '#94A3B8' : '#FFFFFF',
                                        border: '1px solid #F59E0B',
                                        cursor: items.length === 0 ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        boxShadow: '0 8px 20px rgba(15, 23, 42, 0.2)',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    {cartSavedForReopen ? (
                                        <>
                                            <CheckCircle2 size={16} color="#34D399" />
                                            <span>{locale === 'es' ? 'Carrito Guardado para la Reapertura' : 'Cart Saved for Reopening'}</span>
                                        </>
                                    ) : (
                                        <>
                                            <BookmarkCheck size={16} color="#FDE68A" />
                                            <span>{locale === 'es' ? 'Guardar mi Carrito para la Reapertura' : 'Save my Cart for Reopening'}</span>
                                        </>
                                    )}
                                </button>
                                <div style={{ fontSize: '0.7rem', color: '#475569', textAlign: 'center', lineHeight: 1.4 }}>
                                    {vacationConfig?.customMessage || 'Nuestra planta está en receso operativo. Tu selección queda guardada en este navegador para confirmar en 1 clic al reabrir.'}
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="btn-premium"
                                onClick={handleSubmit}
                                disabled={loading || items.length === 0 || !isMinOrderMet || (outOfZone && !isB2B)}
                                style={{
                                    width: '100%',
                                    padding: '0.85rem',
                                    fontSize: '0.94rem',
                                    borderRadius: '14px',
                                    fontWeight: '900',
                                    backgroundColor: (loading || items.length === 0 || !isMinOrderMet || (outOfZone && !isB2B)) ? '#CBD5E1' : 'var(--primary)',
                                    color: (loading || items.length === 0 || !isMinOrderMet || (outOfZone && !isB2B)) ? '#94A3B8' : 'white',
                                    border: 'none',
                                    cursor: (loading || items.length === 0 || !isMinOrderMet || (outOfZone && !isB2B)) ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    boxShadow: (loading || items.length === 0 || !isMinOrderMet || (outOfZone && !isB2B)) ? 'none' : '0 8px 20px rgba(5, 150, 105, 0.22)',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {loading ? (
                                    <><Loader2 size={16} className="animate-spin" /> {t.processing}</>
                                ) : items.length === 0 ? (
                                    <><ShoppingCart size={15} /> {locale === 'es' ? 'Tu canasta está vacía' : 'Your cart is empty'}</>
                                ) : !isMinOrderMet ? (
                                    <><AlertCircle size={15} /> {locale === 'es' ? 'Pedido mínimo no alcanzado' : 'Minimum order required'}</>
                                ) : (outOfZone && !isB2B) ? (
                                    <><MapPin size={15} /> {locale === 'es' ? 'Sin Cobertura en la Zona' : 'Out of coverage'}</>
                                ) : (
                                    <>
                                        {paymentMethod === 'wompi' ? <Zap size={16} /> : paymentMethod === 'payroll_deduction' ? <FileText size={16} /> : <Truck size={16} />}
                                        <span>
                                            {paymentMethod === 'wompi' 
                                                ? (locale === 'es' ? 'Confirmar y Pagar Online' : 'Confirm & Pay Online')
                                                : paymentMethod === 'payroll_deduction'
                                                    ? (locale === 'es' ? 'Confirmar con Deducción de Nómina ($0 Hoy)' : 'Confirm with Payroll Deduction ($0 Today)')
                                                    : (locale === 'es' ? 'Confirmar Pedido (Pagar al Recibir)' : 'Confirm Order (Pay on Delivery)')}
                                        </span>
                                    </>
                                )}
                            </button>
                        )}

                        {/* Badges de Confianza con Íconos Lucide */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '3px',
                            textAlign: 'center',
                            fontSize: '0.67rem',
                            color: '#64748B',
                            fontWeight: '500',
                            paddingTop: '4px',
                            borderTop: '1px dashed #E2E8F0'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                <LockIcon size={11} color="#059669" />
                                <span>{locale === 'es' ? 'Cifrado SSL 256-bit • Pasarela Wompi Bancolombia' : 'Bank-grade 256-bit SSL encryption'}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                <Sparkles size={11} color="#059669" />
                                <span>{locale === 'es' ? 'Garantía de Frescura 100% FruFresco • Soporte WhatsApp' : '100% Freshness Guarantee'}</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

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
                            borderBottom: '1px solid var(--border)', 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            backgroundColor: 'white'
                        }}>
                            <div>
                                <h3 style={{ 
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    margin: 0, 
                                    fontWeight: '900', 
                                    fontSize: '1.4rem',
                                    color: 'var(--text-main)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}>
                                    <MapPin size={24} color="var(--primary)" /> {locale === 'es' ? 'Selecciona tu Ubicación' : 'Select your Location'}
                                </h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>{locale === 'es' ? 'Mueve el mapa para centrar el marcador en tu puerta.' : 'Move the map to center the marker on your door.'}</p>
                            </div>
                            <button 
                                onClick={() => setShowMapPicker(false)}
                                className="btn-glass"
                                style={{ 
                                    padding: '0.5rem 1rem', 
                                    borderRadius: '12px', 
                                    cursor: 'pointer', 
                                    fontWeight: '800',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '0.85rem'
                                }}
                            >
                                <X size={18} /> {locale === 'es' ? 'Cerrar' : 'Close'}
                            </button>
                        </div>
                        
                        <div style={{ flex: 1, position: 'relative' }}>
                            {/* Badge sutil de zona de cobertura */}
                            <div style={{
                                position: 'absolute',
                                top: '14px',
                                left: '14px',
                                zIndex: 2,
                                backgroundColor: 'rgba(255, 255, 255, 0.94)',
                                backdropFilter: 'blur(8px)',
                                padding: '6px 14px',
                                borderRadius: '12px',
                                border: '1px solid #E2E8F0',
                                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.08)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontFamily: 'var(--font-outfit), sans-serif',
                                pointerEvents: 'none'
                            }}>
                                <div style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    backgroundColor: '#10B981',
                                    boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.25)'
                                }} />
                                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#065F46' }}>
                                    {locale === 'es' ? 'Zona de Cobertura (Área Verde)' : 'Delivery Coverage Zone'}
                                </span>
                            </div>

                            <Map
                                defaultCenter={{ lat: latitude || 4.67, lng: longitude || -74.06 }} // Uses geocoded address or Bogota
                                defaultZoom={14}
                                mapId="DEMO_MAP_ID"
                                gestureHandling={'greedy'}
                                onCameraChanged={(ev) => {
                                    if (ev.detail?.center) {
                                        setLatitude(ev.detail.center.lat);
                                        setLongitude(ev.detail.center.lng);
                                    }
                                }}
                                onClick={(e: any) => {
                                    const lat = e.detail?.latLng?.lat;
                                    const lng = e.detail?.latLng?.lng;
                                    if (lat && lng) {
                                        setLatitude(lat);
                                        setLongitude(lng);
                                        if (e.map) {
                                            e.map.panTo({ lat, lng });
                                        }
                                    }
                                }}
                            >

                                {/* Polígono Sutil de Cobertura */}
                                {activeGeofence && activeGeofence.length > 0 && (
                                    <Polygon 
                                        paths={activeGeofence}
                                        fillColor="#10B981"
                                        fillOpacity={0.14}
                                        strokeColor="#10B981"
                                        strokeWeight={2}
                                        strokeOpacity={0.85}
                                        clickable={false}
                                    />
                                )}

                                {/* Visual center helper */}
                                <div style={{
                                    position: 'absolute', top: '50%', left: '50%',
                                    transform: 'translate(-50%, -100%)', zIndex: 1,
                                    pointerEvents: 'none',
                                    filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.3))'
                                }}>
                                    <div style={{ 
                                        backgroundColor: (outOfZone && !isB2B) ? '#EF4444' : 'var(--primary)', 
                                        color: 'white', 
                                        padding: '8px', 
                                        borderRadius: '50% 50% 50% 0',
                                        transform: 'rotate(-45deg)',
                                        width: '40px',
                                        height: '40px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '3px solid white',
                                        transition: 'background-color 0.25s ease'
                                    }}>
                                        <div style={{ transform: 'rotate(45deg)' }}>
                                            <MapPin size={20} fill="white" />
                                        </div>
                                    </div>
                                </div>
                            </Map>
                        </div>

                        <div style={{ padding: '1.25rem 2rem', backgroundColor: '#F9FAFB', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1.25rem', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                            <div style={{ marginRight: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {locale === 'es' ? 'Dirección en el mapa:' : 'Map Address:'}
                                    </span>
                                    {latitude && longitude && activeGeofence.length > 0 && (
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            padding: '2px 10px',
                                            borderRadius: '99px',
                                            backgroundColor: (outOfZone && !isB2B) ? '#FEF2F2' : '#ECFDF5',
                                            border: `1px solid ${(outOfZone && !isB2B) ? '#FECACA' : '#A7F3D0'}`,
                                            color: (outOfZone && !isB2B) ? '#DC2626' : '#059669',
                                            fontSize: '0.74rem',
                                            fontWeight: '800',
                                            fontFamily: 'var(--font-outfit), sans-serif'
                                        }}>
                                            {(outOfZone && !isB2B) ? (
                                                <>
                                                    <AlertCircle size={13} color="#DC2626" />
                                                    <span>{locale === 'es' ? 'Fuera de Cobertura' : 'Out of Coverage'}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle2 size={13} color="#059669" />
                                                    <span>{locale === 'es' ? 'Dentro de Cobertura' : 'In Coverage'}</span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <p style={{ margin: 0, fontSize: '0.88rem', color: (outOfZone && !isB2B) ? '#DC2626' : '#1E293B', fontWeight: '700', fontFamily: 'var(--font-outfit), sans-serif', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <MapPin size={15} color={(outOfZone && !isB2B) ? '#DC2626' : '#059669'} style={{ flexShrink: 0 }} />
                                    {isResolvingAddress ? (
                                        <span style={{ color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Loader2 size={13} className="animate-spin" /> {locale === 'es' ? 'Detectando dirección...' : 'Resolving street address...'}</span>
                                    ) : (
                                        resolvedAddressPreview || address || (locale === 'es' ? 'Mueve el marcador a tu puerta' : 'Move marker to your door')
                                    )}
                                </p>
                                <p style={{ margin: 0, fontSize: '0.72rem', color: '#94A3B8', fontFamily: 'monospace' }}>
                                    GPS: {latitude?.toFixed(5)}, {longitude?.toFixed(5)}
                                </p>
                            </div>

                            {outOfZone && !isB2B && (
                                <button
                                    type="button"
                                    onClick={handleRegisterRejectionAndReturn}
                                    disabled={isRegisteringRejection}
                                    style={{
                                        padding: '0.75rem 1.25rem',
                                        borderRadius: 'var(--radius-full)',
                                        backgroundColor: '#FEF3C7',
                                        border: '1px solid #FCD34D',
                                        color: '#92400E',
                                        fontWeight: '800',
                                        fontSize: '0.82rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <Bell size={15} color="#D97706" /> {locale === 'es' ? 'Avisarme cuando lleguen a mi sector' : 'Notify me when available'}
                                </button>
                            )}

                            <button 
                                type="button"
                                onClick={handleConfirmLocationFromMap}
                                className="btn-premium"
                                style={{ 
                                    padding: '0.85rem 2.25rem', 
                                    borderRadius: 'var(--radius-full)', 
                                    fontWeight: '900',
                                    fontSize: '0.95rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    backgroundColor: (outOfZone && !isB2B) ? '#DC2626' : 'var(--primary)',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: (outOfZone && !isB2B) ? '0 4px 14px rgba(220, 38, 38, 0.3)' : '0 4px 14px rgba(13, 122, 87, 0.3)'
                                }}
                            >
                                {(outOfZone && !isB2B) ? (
                                    <>
                                        <AlertCircle size={18} color="#FFFFFF" /> {locale === 'es' ? 'Ubicación Fuera de Cobertura' : 'Out of Coverage Area'}
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={18} color="#FFFFFF" /> {locale === 'es' ? 'Confirmar Ubicación' : 'Confirm Location'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {isEditModalOpen && selectedProduct && (
                <QuickViewModal
                    product={selectedProduct}
                    initialQuantity={editingCartItem?.quantity}
                    onUpdateQuantity={(qty) => {
                        if (editingCartItem) {
                            updateItemQuantity(editingCartItem.id, editingCartItem.name, qty);
                        }
                    }}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setSelectedProduct(null);
                        setEditingCartItem(null);
                    }}
                />
            )}

            {/* Modal de Confirmación Previo al Pago (Sobrio, Elegante B2C/B2B) */}
            {showConfirmationModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.5rem'
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '24px',
                        width: '100%',
                        maxWidth: '880px',
                        maxHeight: '92vh',
                        overflowY: 'auto',
                        boxShadow: '0 30px 70px -15px rgba(0, 0, 0, 0.28)',
                        border: '1px solid #E2E8F0',
                        padding: '2.5rem',
                        position: 'relative'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '14px',
                                    backgroundColor: '#EAEFEA',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--primary)'
                                }}>
                                    <ShoppingBag size={24} strokeWidth={2} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0, color: 'var(--text-main)', fontFamily: 'var(--font-outfit), sans-serif', letterSpacing: '-0.02em' }}>
                                        {locale === 'es' ? 'Confirmación Final de tu Pedido' : 'Final Order Confirmation'}
                                    </h3>
                                    <p style={{ fontSize: '0.88rem', color: '#64748B', margin: '3px 0 0 0' }}>
                                        {locale === 'es' ? 'Verifica el desglose de productos y datos de entrega antes de pagar.' : 'Review product details and delivery info before paying.'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowConfirmationModal(false)}
                                style={{
                                    border: 'none',
                                    background: '#F1F5F9',
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: '#64748B',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Executive Boarding Pass: Resumen Ejecutivo de Canasta */}
                        <div style={{
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '16px',
                            padding: '0.85rem 1.25rem',
                            marginBottom: '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '10px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', flexShrink: 0 }}>
                                    <Package size={18} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0F172A', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                        {items.length} {items.length === 1 ? (locale === 'es' ? 'producto seleccionado' : 'item selected') : (locale === 'es' ? 'productos seleccionados' : 'items selected')}
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: '500' }}>
                                        {itemBreakdownSummary}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowDetailItemsModal(!showDetailItemsModal)}
                                style={{
                                    background: 'white',
                                    border: '1px solid #CBD5E1',
                                    borderRadius: '8px',
                                    padding: '4px 10px',
                                    fontSize: '0.74rem',
                                    fontWeight: '700',
                                    color: '#475569',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                <span>{showDetailItemsModal ? (locale === 'es' ? 'Ocultar canasta ▲' : 'Hide details ▲') : (locale === 'es' ? 'Ver desglose ▼' : 'View items ▼')}</span>
                            </button>
                        </div>

                        {/* Desglose desplegable opcional */}
                        {showDetailItemsModal && (
                            <div style={{
                                border: '1px solid #E2E8F0',
                                borderRadius: '14px',
                                backgroundColor: '#FFFFFF',
                                marginBottom: '1rem',
                                maxHeight: '160px',
                                overflowY: 'auto',
                                fontSize: '0.82rem'
                            }}>
                                {items.map((item, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.55rem 1rem',
                                        borderBottom: idx < items.length - 1 ? '1px solid #F1F5F9' : 'none'
                                    }}>
                                        <span style={{ fontWeight: '600', color: '#1E293B' }}>{item.name}</span>
                                        <span style={{ color: '#64748B' }}>{item.quantity} {item.unit || 'Un'}</span>
                                        <span style={{ fontWeight: '700', color: 'var(--primary-dark)', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            ${Math.round(item.price * item.quantity).toLocaleString('es-CO')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Executive Boarding Pass: 2-Column Grid (Logística vs Finanzas) */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '14px',
                            marginBottom: '1.25rem'
                        }}>
                            {/* Columna 1: Logística de Entrega (Boarding Pass Left) */}
                            <div style={{
                                backgroundColor: '#FFFFFF',
                                border: '1.5px solid #E2E8F0',
                                borderRadius: '16px',
                                padding: '1.1rem 1.25rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.5rem' }}>
                                    <MapPin size={16} color="var(--primary)" />
                                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        {locale === 'es' ? 'Destino y Programación' : 'Destination & Schedule'}
                                    </span>
                                </div>

                                <div>
                                    <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0F172A', lineHeight: '1.3' }}>
                                        {address}
                                    </div>
                                    {(buildingComplex || unitDetails) && (
                                        <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: '600', marginTop: '2px' }}>
                                            {[buildingComplex, unitDetails].filter(Boolean).join(' • ')}
                                        </div>
                                    )}
                                </div>

                                <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <User size={13} color="#94A3B8" />
                                    <span>
                                        {isGiftForRecipient 
                                            ? `${locale === 'es' ? 'Recibe:' : 'Recipient:'} ${recipientName} (${recipientPhone})`
                                            : `${name} (${phone})`
                                        }
                                    </span>
                                </div>

                                <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Calendar size={13} color="#94A3B8" />
                                    <span>{locale === 'es' ? 'Fecha de entrega:' : 'Delivery date:'} <strong style={{ color: '#0F172A' }}>{date}</strong></span>
                                </div>

                                {latitude && (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#059669', fontWeight: '700', backgroundColor: '#ECFDF5', padding: '3px 8px', borderRadius: '6px', width: 'fit-content' }}>
                                        <CheckCircle2 size={12} />
                                        <span>{locale === 'es' ? 'Punto de entrega verificado' : 'Verified delivery location'}</span>
                                    </div>
                                )}
                            </div>

                            {/* Columna 2: Liquidación y Pago (Boarding Pass Right) */}
                            <div style={{
                                backgroundColor: '#F0FDF4',
                                border: '1.5px solid #A7F3D0',
                                borderRadius: '16px',
                                padding: '1.1rem 1.25rem',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                gap: '8px'
                            }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #C6F6D5', paddingBottom: '0.5rem', marginBottom: '8px' }}>
                                        <Receipt size={16} color="#059669" />
                                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#065F46', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            {locale === 'es' ? 'Resumen de tu pedido' : 'Order Summary'}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#334155', marginBottom: '4px' }}>
                                        <span>{locale === 'es' ? 'Subtotal productos:' : 'Items subtotal:'}</span>
                                        <span style={{ fontWeight: '600' }}>${totalPrice.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')}</span>
                                    </div>

                                    {packagingFeeAmount > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#334155', marginBottom: '4px' }}>
                                            <span>{locale === 'es' ? 'Empaque ecológico:' : 'Eco packaging:'}</span>
                                            <span style={{ fontWeight: '600' }}>${packagingFeeAmount.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')}</span>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#334155', marginBottom: '4px' }}>
                                        <span>{locale === 'es' ? 'Domicilio:' : 'Delivery fee:'}</span>
                                        <span style={{ fontWeight: '700', color: isFreeShipping ? '#059669' : '#0F172A' }}>
                                            {isFreeShipping ? (locale === 'es' ? 'GRATIS ($0)' : 'FREE ($0)') : `$${deliveryFeeAmount.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')}`}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#334155', marginBottom: '6px' }}>
                                        <span>{locale === 'es' ? 'Método de pago:' : 'Payment method:'}</span>
                                        <span style={{ fontWeight: '700', color: paymentMethod === 'wompi' ? '#2563EB' : paymentMethod === 'payroll_deduction' ? '#047857' : '#D97706' }}>
                                            {paymentMethod === 'wompi' 
                                                ? 'Wompi en línea' 
                                                : paymentMethod === 'payroll_deduction'
                                                    ? (locale === 'es' ? 'Deducción de Nómina (Crédito Empleado)' : 'Payroll Deduction')
                                                    : (locale === 'es' ? 'Contra Entrega' : 'Cash on Delivery')}
                                        </span>
                                    </div>
                                </div>

                                <div style={{
                                    borderTop: '1.5px dashed #A7F3D0',
                                    paddingTop: '8px',
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    justifyContent: 'space-between'
                                }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#065F46' }}>Total:</span>
                                    <span style={{ fontSize: '1.4rem', fontWeight: '950', color: '#047857', fontFamily: 'var(--font-outfit), sans-serif', letterSpacing: '-0.02em' }}>
                                        ${finalOrderTotal.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')} <span style={{ fontSize: '0.78rem', fontWeight: '700' }}>COP</span>
                                    </span>
                                </div>
                            </div>
                        </div>

                        {paymentMethod === 'payroll_deduction' && (
                            <div style={{
                                marginTop: '1.25rem',
                                backgroundColor: '#ECFDF5',
                                border: '1.5px solid #A7F3D0',
                                borderRadius: '16px',
                                padding: '1.1rem 1.4rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '14px'
                            }}>
                                <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #6EE7B7' }}>
                                    <FileText size={22} color="#047857" />
                                </div>
                                <div>
                                    <div style={{ fontWeight: '800', color: '#065F46', fontSize: '0.95rem' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            👥 {locale === 'es' ? 'Beneficio Colaborador FruFresco — Deducción por Nómina Quincenal' : 'Employee Benefit — Payroll Deduction'}
                                        </span>
                                    </div>
                                    <div style={{ marginTop: '3px', color: '#047857', fontSize: '0.85rem', lineHeight: '1.45', fontWeight: '500' }}>
                                        {locale === 'es' 
                                            ? `El total de $${finalOrderTotal.toLocaleString('es-CO')} COP será descontado directamente en tu próximo desprendible de nómina quincenal (Columna N). ⚠️ NO DEBES ENTREGAR NINGÚN DINERO AL REPARTIDOR en la puerta.`
                                            : `The total of $${finalOrderTotal.toLocaleString('en-US')} COP will be deducted on your next biweekly payroll. Do not hand any cash to the driver.`
                                        }
                                    </div>
                                </div>
                            </div>
                        )}

                        {paymentMethod === 'contra_entrega' && (
                            <div style={{
                                marginTop: '1.25rem',
                                backgroundColor: '#FFFBEB',
                                border: '1px solid #FDE68A',
                                borderRadius: '16px',
                                padding: '1.1rem 1.4rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '14px'
                            }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #FCD34D' }}>
                                    <Banknote size={22} color="#D97706" />
                                </div>
                                <div>
                                    <div style={{ fontWeight: '800', color: '#B45309', fontSize: '0.95rem' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Truck size={15} style={{ color: '#059669' }} /> {locale === 'es' ? 'Pedido Contra Entrega Programado' : 'Scheduled Cash on Delivery Order'}</span>
                                    </div>
                                    <div style={{ marginTop: '2px', color: '#78350F', fontSize: '0.85rem', lineHeight: '1.4' }}>
                                        {locale === 'es' 
                                            ? `Registraremos tu pedido inmediatamente. Pagarás el total de $${finalOrderTotal.toLocaleString('es-CO')} COP al repartidor en la puerta de tu domicilio en efectivo o transferencia (Nequi / Daviplata / PSE) al recibir.`
                                             : `Your order will be registered immediately. You will pay $${finalOrderTotal.toLocaleString('en-US')} COP on delivery in cash or bank transfer.`
                                        }
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Footer Action Buttons */}
                        <div style={{ display: 'flex', gap: '14px', justifyContent: 'flex-end', marginTop: '1.75rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => setShowConfirmationModal(false)}
                                style={{
                                    padding: '0.9rem 1.75rem',
                                    borderRadius: '14px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: 'white',
                                    color: '#475569',
                                    fontWeight: '700',
                                    fontSize: '0.92rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Edit3 size={17} />
                                {locale === 'es' ? 'Modificar Pedido' : 'Edit Order'}
                            </button>
                            <button
                                type="button"
                                onClick={executeOrderSubmission}
                                disabled={loading}
                                style={{
                                    padding: '0.9rem 2.25rem',
                                    borderRadius: '14px',
                                    border: 'none',
                                    backgroundColor: 'var(--primary)',
                                    color: 'white',
                                    fontWeight: '800',
                                    fontSize: '1rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    boxShadow: '0 4px 14px rgba(13, 122, 87, 0.3)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {loading ? <Loader2 size={20} className="animate-spin" /> : (paymentMethod === 'contra_entrega' || paymentMethod === 'payroll_deduction' ? <CheckCircle2 size={20} /> : <ShieldCheck size={20} />)}
                                {loading 
                                    ? (locale === 'es' ? 'Procesando...' : 'Processing...') 
                                    : paymentMethod === 'payroll_deduction'
                                        ? (locale === 'es' ? 'Confirmar Pedido (Deducción Nómina $0 Hoy)' : 'Confirm Order (Payroll Deduction $0 Today)')
                                        : paymentMethod === 'contra_entrega'
                                            ? (locale === 'es' ? 'Confirmar Pedido (Pagar al Recibir)' : 'Confirm Order (Pay on Delivery)')
                                            : (locale === 'es' ? 'Ir a Pagar Seguro (Wompi)' : 'Proceed to Secure Payment')
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
