'use client';

import { useState, useEffect, useMemo } from 'react';
import { useCart } from '../../lib/cartContext';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Map } from '@vis.gl/react-google-maps';
import { isAbortError } from '../../lib/errorUtils';
import { isInsidePolygon, Point } from '../../lib/geoUtils';
import { DEFAULT_CUTOFF_HOUR } from '../../lib/constants';
import { translations, Locale } from '../../lib/translations';
 import { useSearchParams } from 'next/navigation';
import { 
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
    Banknote
} from 'lucide-react';
import { useAuth } from '../../lib/authContext';
import { getNextValidDeliveryDate, isValidDeliveryDate } from '@/lib/colombianHolidays';
import dynamic from 'next/dynamic';

const QuickViewModal = dynamic(() => import('../../components/QuickViewModal'), { ssr: false });

export default function CheckoutPage() {
    const { items, totalPrice, removeItem, clearCart, updateItemQuantity, addItem } = useCart();
    const [isMounted, setIsMounted] = useState(false);
    const [loadingLastOrder, setLoadingLastOrder] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'wompi' | 'contra_entrega'>('wompi');
    const [name, setName] = useState('');
    const [identification, setIdentification] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [date, setDate] = useState('');
    const [minOrder, setMinOrder] = useState(0);
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
    const [showMapPicker, setShowMapPicker] = useState(false);
    const [b2cGeofence, setB2cGeofence] = useState<Point[]>([]);
    const [outOfZone, setOutOfZone] = useState(false);
    const [specialNotes, setSpecialNotes] = useState('');
    const [notesJustSaved, setNotesJustSaved] = useState(false);
    const [isProfileMatched, setIsProfileMatched] = useState(false);
    const [isProfileUnlocked, setIsProfileUnlocked] = useState(false);
    const [maskedName, setMaskedName] = useState('');
    const [maskedAddress, setMaskedAddress] = useState('');
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupError, setLookupError] = useState('');
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

    const [packagingFeeEnabled, setPackagingFeeEnabled] = useState(true);
    const [packagingFeePercentage, setPackagingFeePercentage] = useState(3);
    const [packagingFeeNote, setPackagingFeeNote] = useState('Para garantizar la inocuidad, higiene y conservación de tus alimentos frescos, todos los pedidos se entregan empacados en bolsas plásticas.');

    useEffect(() => {
        const fetchPackagingSettings = async () => {
            try {
                const { data } = await supabase
                    .from('app_settings')
                    .select('key, value')
                    .in('key', ['packaging_fee_enabled', 'packaging_fee_percentage', 'packaging_fee_note']);

                if (data) {
                    data.forEach(s => {
                        if (s.key === 'packaging_fee_enabled') setPackagingFeeEnabled(s.value === 'true');
                        if (s.key === 'packaging_fee_percentage') setPackagingFeePercentage(parseFloat(s.value) || 3);
                        if (s.key === 'packaging_fee_note') setPackagingFeeNote(s.value || '');
                    });
                }
            } catch (err) {
                console.error('Error loading packaging settings:', err);
            }
        };
        fetchPackagingSettings();
    }, []);

    const packagingFeeAmount = packagingFeeEnabled ? Math.round(totalPrice * (packagingFeePercentage / 100)) : 0;
    // Redondear el total final de compra hacia abajo al próximo múltiplo de 50 (beneficio al usuario)
    const rawTotal = totalPrice + packagingFeeAmount;
    const finalOrderTotal = Math.floor(rawTotal / 50) * 50;

    useEffect(() => {
        setIsMounted(true);
        if (typeof window !== 'undefined') {
            const isAutofilled = localStorage.getItem('checkout_is_profile_autofilled') === 'true';
            const savedId = localStorage.getItem('checkout_identification');
            const savedEmail = localStorage.getItem('checkout_email');
            const savedPhone = localStorage.getItem('checkout_phone');
            const savedNotes = localStorage.getItem('checkout_specialNotes');

            if (savedId) setIdentification(savedId);
            if (savedEmail) setEmail(savedEmail);
            if (savedPhone) setPhone(savedPhone);
            if (savedNotes) setSpecialNotes(savedNotes);

            const savedName = localStorage.getItem('checkout_name');
            const savedAddress = localStorage.getItem('checkout_address');
            const isLuis = savedName && savedName.includes('Luis Fernando');
            const isCalle127 = savedAddress && savedAddress.includes('Calle 127');

            // ONLY load saved name and address if they were NOT autofilled from a profile
            if (!isAutofilled && !isLuis && !isCalle127) {
                if (savedName) setName(savedName);
                if (savedAddress) setAddress(savedAddress);
            } else {
                setName('');
                setAddress('');
                localStorage.removeItem('checkout_name');
                localStorage.removeItem('checkout_address');
                localStorage.removeItem('checkout_is_profile_autofilled');
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

        if (!isProfileUnlocked && emailVal.includes('@') && idVal.length >= 5 && phoneVal.length >= 10) {
            const delayDebounceFn = setTimeout(async () => {
                setLookupLoading(true);
                setLookupError('');
                try {
                    const res = await fetch('/api/checkout/lookup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: emailVal,
                            nit: idVal,
                            phone: phoneVal
                        })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.verified) {
                            setIsProfileUnlocked(true);
                            setName(prev => prev || data.name);
                            localStorage.setItem('checkout_name', data.name);
                            setAddress(prev => prev || data.address);
                            localStorage.setItem('checkout_address', data.address);
                            setPhone(data.phone);
                            localStorage.setItem('checkout_phone', data.phone);
                            setOriginalAddress(data.address);
                            setMatchedProfileId((data.id && data.id !== 'matched') ? data.id : null);
                            localStorage.setItem('checkout_is_profile_autofilled', 'true');
                            setUnlockedEmail(emailVal);
                            setUnlockedId(idVal);
                            setUnlockedPhone(phoneVal);
                            if (data.latitude && data.longitude) {
                                const latVal = parseFloat(data.latitude);
                                const lngVal = parseFloat(data.longitude);
                                setLatitude(latVal);
                                setLongitude(lngVal);
                                setOriginalCoords({ lat: latVal, lng: lngVal });
                            } else {
                                setLatitude(null);
                                setLongitude(null);
                                setOriginalCoords(null);
                            }
                            setIsProfileMatched(false);
                        } else {
                            setLookupError(data.error || 'El celular no coincide.');
                        }
                    } else {
                        setLookupError('Error en la verificación.');
                    }
                } catch (err) {
                    console.error('Error during phone verification:', err);
                    setLookupError('Error en la conexión.');
                } finally {
                    setLookupLoading(false);
                }
            }, 400);
            return () => clearTimeout(delayDebounceFn);
        }
    }, [phone, isProfileMatched, isProfileUnlocked, email, identification]);

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
        async function fetchGeofence() {
            const { data } = await supabase.from('app_settings').select('value').eq('key', 'geofence_b2c_poly').single();
            if (data) setB2cGeofence(JSON.parse(data.value));
        }
        fetchGeofence();

        const testCoordsHandler = (e: any) => {
            if (e.detail?.lat && e.detail?.lng) {
                setLatitude(e.detail.lat);
                setLongitude(e.detail.lng);
            }
        };
        window.addEventListener('set_test_coords', testCoordsHandler);
        return () => window.removeEventListener('set_test_coords', testCoordsHandler);
    }, []);

    // Monitor changes to delivery address to invalidate coordinates if address changes
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
        if (latitude && longitude && b2cGeofence.length > 0) {
            const inside = isInsidePolygon({ lat: latitude, lng: longitude }, b2cGeofence);
            setOutOfZone(!inside);
        }
    }, [latitude, longitude, b2cGeofence]);

    const handleGetLocation = () => {
        if (!navigator.geolocation) {
            return alert(locale === 'es' ? 'Tu navegador no soporta geolocalización.' : 'Your browser does not support geolocation.');
        }

        setIsGettingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLatitude(position.coords.latitude);
                setLongitude(position.coords.longitude);
                setIsGettingLocation(false);
                alert(locale === 'es' ? '📍 Ubicación capturada con éxito. Ahora tu entrega será más precisa.' : '📍 Location captured successfully. Your delivery will now be more precise.');
            },
            (error) => {
                console.error('Error getting location:', error);
                setIsGettingLocation(false);
                alert(locale === 'es' ? 'No pudimos obtener tu ubicación. Por favor asegúrate de dar permisos en tu navegador.' : 'We could not get your location. Please ensure you grant permissions in your browser.');
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

    // Initial default value to avoid empty state (skipping Sundays & 19 Colombian holidays)
    useEffect(() => {
        async function initDeliveryDate() {
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

                setDate(prev => prev || dateStr);
                setMinDeliveryDate(dateStr);
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
            console.log('👤 profile found, filling member data...');
        }
    }, [profile]);

    // Fetch settings and refine date
    useEffect(() => {
        async function loadConfig() {
            try {
                // 1. Min Order
                const { data: minData } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'min_order_hogar')
                    .single();
                if (minData) setMinOrder(parseInt(minData.value));

                // 2. Cutoff Rules
                const { data: cutoffData } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'enable_cutoff_rules')
                    .limit(1);

                const cutoffEnabled = (cutoffData && cutoffData.length > 0) ? cutoffData[0].value !== 'false' : true;
                
                const now = new Date();
                const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
                const bogotaNow = new Date(utc + (3600000 * -5));
                const currentHour = bogotaNow.getHours();

                let daysToAdd = 1;
                if (cutoffEnabled && currentHour >= DEFAULT_CUTOFF_HOUR) {
                    daysToAdd = 2;
                }

                const finalDate = getSafeBogotaDate(daysToAdd);
                setMinDeliveryDate(finalDate);
                setDate(prev => {
                    if (!prev || prev < finalDate) return finalDate;
                    return prev;
                });
                console.log(`✅ Config logic synced. Bogota hour: ${currentHour}. Min delivery: ${finalDate}`);
            } catch (err) {
                console.error('❌ Error loading config:', err);
            }
        }
        loadConfig();
    }, []);

    const isMinOrderMet = totalPrice >= minOrder;

    const handleSubmit = async () => {
        console.log('🚀 Finalizing order. Date:', date);
        
        if (!date || date === '' || date === 'dd/mm/aaaa') {
            const recoveryDate = getSafeBogotaDate(1);
            setDate(recoveryDate);
            return alert(locale === 'es' ? 'Hubo un problema con la fecha. Se ha corregido, por favor intenta de nuevo.' : 'There was a problem with the date. It has been fixed, please try again.');
        }

        if (items.length === 0) return alert(t.emptyCart);
        if (!name || !name.trim()) return alert(locale === 'es' ? 'Por favor ingresa tu Nombre Completo.' : 'Please enter your Full Name.');
        if (!identification || !identification.trim()) return alert(locale === 'es' ? 'Por favor ingresa tu Número de Identificación.' : 'Please enter your ID Number.');
        if (!phone || !phone.trim()) return alert(locale === 'es' ? 'Por favor ingresa tu Número de Celular.' : 'Please enter your WhatsApp Number.');
        if (!email || !email.trim()) return alert(locale === 'es' ? 'Por favor ingresa tu Email.' : 'Please enter your Email.');
        if (!address || !address.trim()) return alert(locale === 'es' ? 'Por favor ingresa la Dirección de Entrega.' : 'Please enter your Delivery Address.');
        if (!isMinOrderMet) return alert(`${t.minOrderMsg}: $${minOrder.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')}.`);
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
            return alert(t.outOfZoneMsg);
        }
        if (date < minDeliveryDate) {
            return alert(locale === 'es' 
                ? `La fecha de entrega seleccionada no es válida. La fecha mínima de entrega permitida es ${minDeliveryDate}.`
                : `The selected delivery date is not valid. The minimum allowed delivery date is ${minDeliveryDate}.`
            );
        }

        if (isGiftForRecipient) {
            if (!recipientName.trim()) return alert(locale === 'es' ? 'Por favor ingresa el Nombre Completo de quien recibe.' : 'Please enter the Recipient Full Name.');
            if (!recipientPhone.trim()) return alert(locale === 'es' ? 'Por favor ingresa el Número de Celular de quien recibe.' : 'Please enter the Recipient Phone Number.');
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

            const clientNotesHeader = isGiftForRecipient 
                ? `[COMPRADOR / FACTURACIÓN: ${name} | Tel: ${phone} | Email: ${email} | ID: ${identification}]\n[DESTINATARIO / RECIBE EN PUERTA: ${recipientName} | Tel: ${recipientPhone}]`
                : `[CLIENTE: ${name} | Tel: ${phone} | Email: ${email} | ID: ${identification}]`;

            const isValidUuid = (str: any) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

            const orderDataToInsert = {
                type: isB2B ? 'b2b_client' : 'b2c_client',
                status: 'pending_approval',
                delivery_date: date,
                shipping_address: address,
                subtotal: roundedSubtotal,
                tax: roundedTaxAmount,
                total: finalOrderTotal,
                latitude: safeLat,
                longitude: safeLng,
                profile_id: isValidUuid(matchedProfileId) ? matchedProfileId : null,
                payment_method: paymentMethod === 'wompi' ? 'wompi' : 'contra_entrega',
                payment_status: 'Pendiente',
                special_notes: `${clientNotesHeader}${packagingFeeEnabled ? `\n[EMPAQUE PLÁSTICO (${packagingFeePercentage}%): +$${packagingFeeAmount.toLocaleString('es-CO')} COP]` : ''}\n[ORIGIN: web]${specialNotes ? `\n[RECOMENDACIÓN / NOTA DE ENTREGA: ${specialNotes}]` : ''}`
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
                body: JSON.stringify({ order: orderDataToInsert, items: orderItemsData })
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

            if (paymentMethod === 'contra_entrega') {
                console.log('3️⃣ Contra entrega selected. Redirecting directly to success result page...');
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('checkout_specialNotes');
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
            
            alert(userMsg);
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
                    base_price: data.base_price,
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
                alert(locale === 'es' 
                    ? 'Por favor ingresa tu correo, teléfono o cédula en el formulario para buscar tu última compra.' 
                    : 'Please enter your email, phone, or ID in the form to search for your last order.');
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
                alert(data.error || (locale === 'es' ? 'No se pudo cargar la última compra.' : 'Could not load last order.'));
                return;
            }

            if (!data.items || data.items.length === 0) {
                alert(locale === 'es' 
                    ? 'Los productos de tu última compra no están disponibles en el catálogo de hoy.' 
                    : 'Products from your last purchase are not available in today\'s catalog.');
                return;
            }

            let importedCount = 0;
            for (const item of data.items) {
                addItem(item);
                importedCount++;
            }

            if (importedCount > 0) {
                alert(locale === 'es' 
                    ? `✅ ¡Se agregaron ${importedCount} producto(s) de tu última compra al carrito con el precio de HOY!` 
                    : `✅ Added ${importedCount} product(s) from your last purchase to cart at TODAY'S price!`);
            }

        } catch (err: any) {
            console.error('Error loading last order:', err);
            alert(locale === 'es' ? 'Error al traer la última compra.' : 'Error loading last order.');
        } finally {
            setLoadingLastOrder(false);
        }
    };

    if (!isMounted) return null;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>

            <div className="container mobile-stack" style={{ padding: '2.5rem 1rem', display: 'grid', gridTemplateColumns: '1fr 420px', gap: '2.5rem', maxWidth: '1440px' }}>

                {/* LEFT COLUMN: LIST */}
                <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        marginBottom: '1.5rem',
                        backgroundColor: 'white',
                        padding: '1rem 1.5rem',
                        borderRadius: '20px',
                        border: '1px solid var(--border)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
                    }}>
                        <h1 style={{ 
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontSize: '1.4rem', 
                            fontWeight: '900', 
                            color: 'var(--text-main)', 
                            margin: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            letterSpacing: '-0.04em'
                        }}>
                            <ShoppingCart size={24} strokeWidth={2} color="var(--primary)" /> {t.checkoutTitle}
                        </h1>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                                onClick={handleLoadLastOrder}
                                disabled={loadingLastOrder}
                                style={{
                                    padding: '0.55rem 1rem',
                                    borderRadius: '12px',
                                    fontSize: '0.8rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    color: '#047857',
                                    backgroundColor: '#ECFDF5',
                                    border: '1px solid #A7F3D0',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    transition: 'all 0.15s ease-in-out'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#D1FAE5';
                                    e.currentTarget.style.borderColor = '#6EE7B7';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#ECFDF5';
                                    e.currentTarget.style.borderColor = '#A7F3D0';
                                }}
                                title="Importar los productos de tu última compra usando los precios vigentes de hoy"
                            >
                                <RotateCcw size={14} strokeWidth={2.2} style={{ animation: loadingLastOrder ? 'spin 1s linear infinite' : 'none' }} />
                                {loadingLastOrder 
                                    ? (locale === 'es' ? 'Buscando...' : 'Loading...') 
                                    : (locale === 'es' ? 'Repetir última compra' : 'Repeat last order')}
                            </button>
                            <Link
                                href="/"
                                style={{
                                    padding: '0.55rem 1rem',
                                    borderRadius: '12px',
                                    fontSize: '0.8rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    color: '#475569',
                                    backgroundColor: '#FFFFFF',
                                    border: '1px solid #E2E8F0',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    textDecoration: 'none',
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    transition: 'all 0.15s ease-in-out'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                                    e.currentTarget.style.borderColor = '#CBD5E1';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                                    e.currentTarget.style.borderColor = '#E2E8F0';
                                }}
                            >
                                <ArrowLeft size={14} strokeWidth={2} />
                                {locale === 'es' ? 'Seguir comprando' : 'Continue shopping'}
                            </Link>
                            {items.length > 0 && (
                                <button
                                    onClick={() => {
                                        clearCart();
                                        router.push('/');
                                    }}
                                    style={{
                                        padding: '0.55rem 1rem',
                                        borderRadius: '12px',
                                        fontSize: '0.8rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.45rem',
                                        color: '#EF4444',
                                        backgroundColor: '#FEF2F2',
                                        border: '1px solid #FEE2E2',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        transition: 'all 0.15s ease-in-out'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                                >
                                    <Trash2 size={14} /> {t.clearCart}
                                </button>
                            )}
                        </div>
                    </div>

                    {items.length === 0 ? (
                        <div style={{ 
                            textAlign: 'center', 
                            padding: '3.5rem 2rem', 
                            backgroundColor: 'white', 
                            borderRadius: '32px',
                            border: '1px dashed var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center'
                        }}>
                            <ShoppingCart size={56} color="var(--border)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: '500', margin: 0 }}>{t.emptyCart}</p>
                            
                            {/* CAJA PROMINENTE PARA CARGAR ÚLTIMO PEDIDO CON PRECIO DE HOY */}
                            <div style={{ 
                                marginTop: '1.5rem', 
                                padding: '1.25rem', 
                                backgroundColor: '#ECFDF5', 
                                borderRadius: '20px', 
                                border: '1px solid #A7F3D0', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                alignItems: 'center', 
                                gap: '0.65rem', 
                                maxWidth: '420px', 
                                width: '100%',
                                fontFamily: 'var(--font-outfit), sans-serif'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#047857', fontWeight: '800', fontSize: '0.9rem' }}>
                                    <RotateCcw size={16} strokeWidth={2.2} />
                                    {locale === 'es' ? '¿Quieres repetir tu última compra?' : 'Want to repeat your last purchase?'}
                                </div>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#065F46', textAlign: 'center', lineHeight: '1.4', fontWeight: '500' }}>
                                    {locale === 'es' 
                                        ? 'Importa automáticamente los productos de tu pedido anterior con los precios vigentes de hoy.' 
                                        : 'Automatically load items from your previous order at today\'s current prices.'}
                                </p>
                                <button
                                    onClick={handleLoadLastOrder}
                                    disabled={loadingLastOrder}
                                    style={{
                                        padding: '0.65rem 1.4rem',
                                        borderRadius: '12px',
                                        fontSize: '0.85rem',
                                        fontWeight: '800',
                                        backgroundColor: 'var(--primary)',
                                        color: 'white',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        boxShadow: '0 4px 12px rgba(13, 122, 87, 0.2)',
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = 'var(--primary-hover)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'var(--primary)';
                                    }}
                                >
                                    <RotateCcw size={15} strokeWidth={2.2} style={{ animation: loadingLastOrder ? 'spin 1s linear infinite' : 'none' }} />
                                    {loadingLastOrder ? (locale === 'es' ? 'Buscando...' : 'Loading...') : (locale === 'es' ? 'Cargar mi última compra' : 'Load my last order')}
                                </button>
                            </div>

                            <Link href="/" className="btn-premium" style={{ display: 'inline-flex', marginTop: '1.5rem', padding: '0.8rem 2rem' }}>
                                {t.exploreProducts}
                            </Link>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {items.map((item) => (
                                <div key={`${item.id}-${item.name}`} style={{
                                    backgroundColor: item.is_from_last_order ? '#FAFDFB' : 'white',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '16px',
                                    border: item.is_from_last_order ? '1px solid #A7F3D0' : '1px solid var(--border)',
                                    borderLeft: item.is_from_last_order ? '4px solid #10B981' : '1px solid var(--border)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'all 0.2s',
                                }}
                                className="cart-item-card"
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ 
                                            width: '56px', 
                                            height: '56px', 
                                            borderRadius: '12px', 
                                            overflow: 'hidden', 
                                            backgroundColor: '#f3f4f6',
                                            flexShrink: 0,
                                            border: '1px solid #f0f0f0'
                                        }}>
                                            <img 
                                                src={item.image_url || 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?auto=format&fit=crop&q=80&w=100'} 
                                                alt={item.name} 
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                            />
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <h4 style={{ 
                                                    fontFamily: 'var(--font-outfit), sans-serif',
                                                    fontSize: '1rem',
                                                    fontWeight: '800', 
                                                    margin: 0,
                                                    color: 'var(--text-main)',
                                                    letterSpacing: '-0.02em'
                                                }}>{item.name}</h4>
                                                {item.is_from_last_order && (
                                                    <span style={{ 
                                                        fontSize: '0.65rem', 
                                                        fontWeight: '800', 
                                                        backgroundColor: '#ECFDF5', 
                                                        color: '#047857', 
                                                        border: '1px solid #A7F3D0', 
                                                        padding: '2px 7px', 
                                                        borderRadius: '6px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        <RotateCcw size={10} strokeWidth={2.5} />
                                                        {locale === 'es' ? 'De tu última compra (Precio de hoy)' : 'From last order (Today\'s price)'}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ 
                                                    color: 'var(--primary)', 
                                                    fontSize: '0.8rem', 
                                                    fontWeight: '700',
                                                }}>
                                                    ${item.price.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')}{locale === 'en' ? ' COP' : ''}
                                                </span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: '600' }}>
                                                        • {String(item.quantity).replace('.', ',')} {item.unit || ''}
                                                    </span>
                                                    <button
                                                        onClick={() => handleEditItem(item)}
                                                        disabled={loadingProductId === item.id}
                                                        style={{
                                                            border: 'none',
                                                            backgroundColor: 'rgba(26, 77, 46, 0.08)',
                                                            cursor: 'pointer',
                                                            color: 'var(--primary)',
                                                            padding: '4px 6px',
                                                            borderRadius: '6px',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            transition: 'all 0.2s ease',
                                                            marginLeft: '6px'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'var(--primary)';
                                                            e.currentTarget.style.color = 'white';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'rgba(26, 77, 46, 0.08)';
                                                            e.currentTarget.style.color = 'var(--primary)';
                                                        }}
                                                        title="Editar cantidad"
                                                    >
                                                        {loadingProductId === item.id ? (
                                                            <Loader2 size={13} className="animate-spin" />
                                                        ) : (
                                                            <Pencil size={13} />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                            <p style={{ 
                                                fontFamily: 'var(--font-outfit), sans-serif',
                                                fontSize: '1.1rem',
                                                fontWeight: '900', 
                                                color: 'var(--text-main)',
                                                margin: 0,
                                                letterSpacing: '-0.02em'
                                            }}>
                                                ${(Math.ceil((item.price * item.quantity) / 50) * 50).toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')}{locale === 'en' ? ' COP' : ''}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => removeItem(item.id, item.name)}
                                            style={{ 
                                                color: '#CBD5E1', 
                                                background: 'none', 
                                                border: 'none', 
                                                cursor: 'pointer', 
                                                padding: '8px',
                                                borderRadius: '50%',
                                                transition: 'all 0.2s',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.color = '#EF4444';
                                                e.currentTarget.style.backgroundColor = '#FEF2F2';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.color = '#CBD5E1';
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                            }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: FORM & TOTAL */}
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{
                        backgroundColor: 'white',
                        padding: '1.25rem',
                        borderRadius: '24px',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.04)',
                        position: 'sticky',
                        top: '100px',
                        border: '1px solid var(--border)'
                    }}>
                        <h3 style={{ 
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontSize: '1.4rem', 
                            fontWeight: '900', 
                            marginBottom: '1.25rem', 
                            color: 'var(--text-main)', 
                            letterSpacing: '-0.04em',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            borderBottom: '1px solid #F3F4F6',
                            paddingBottom: '0.75rem'
                         }}>
                            <CreditCard size={20} color="var(--primary)" strokeWidth={2.5} /> {t.deliveryDetail}
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                            {/* 1. Email */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '800', fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                    {t.email}
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '12px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)', opacity: 0.5, pointerEvents: 'none' }}>
                                        <Mail size={15} />
                                    </div>
                                    <input
                                        type="email"
                                        placeholder={t.emailPlaceholder}
                                        value={email}
                                        onChange={(e) => handleEmailChange(e.target.value)}
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.55rem 1rem 0.55rem 2.5rem', 
                                            borderRadius: '12px', 
                                            border: '1px solid #E2E8F0', 
                                            fontSize: '0.85rem', 
                                            fontWeight: '500', 
                                            backgroundColor: 'white', 
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                            outline: 'none',
                                            fontFamily: 'var(--font-outfit), sans-serif',
                                            transition: 'all 0.15s ease-in-out'
                                        }}
                                        className="checkout-input-modern"
                                    />
                                </div>
                            </div>

                            {/* 2. Identificación */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '800', fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                    Identificación (Cédula/NIT)
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '12px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)', opacity: 0.5, pointerEvents: 'none' }}>
                                        <User size={15} />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Ej: 123456789"
                                        value={identification}
                                        onChange={(e) => handleIdChange(e.target.value)}
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.55rem 1rem 0.55rem 2.5rem', 
                                            borderRadius: '12px', 
                                            border: '1px solid #E2E8F0', 
                                            fontSize: '0.85rem', 
                                            fontWeight: '500', 
                                            backgroundColor: 'white', 
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                            outline: 'none', 
                                            fontFamily: 'var(--font-outfit), sans-serif',
                                            transition: 'all 0.15s ease-in-out' 
                                        }}
                                        className="checkout-input-modern"
                                    />
                                </div>
                            </div>

                            {/* 3. WhatsApp */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '800', fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                    {t.whatsapp}
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '12px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)', opacity: 0.5, pointerEvents: 'none' }}>
                                        <Phone size={15} />
                                    </div>
                                    <input
                                        type="tel"
                                        placeholder={t.whatsappPlaceholder}
                                        value={phone}
                                        onChange={(e) => handlePhoneChange(e.target.value)}
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.55rem 1rem 0.55rem 2.5rem', 
                                            borderRadius: '12px', 
                                            border: '1px solid #E2E8F0', 
                                            fontSize: '0.85rem', 
                                            fontWeight: '500', 
                                            backgroundColor: 'white', 
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                            outline: 'none',
                                            fontFamily: 'var(--font-outfit), sans-serif',
                                            transition: 'all 0.15s ease-in-out'
                                        }}
                                        className="checkout-input-modern"
                                    />
                                </div>
                                {isProfileMatched && (
                                    <div style={{ 
                                        backgroundColor: lookupError ? '#FEF2F2' : '#EFF6FF',
                                        border: `1px solid ${lookupError ? '#FCA5A5' : '#BFDBFE'}`,
                                        borderRadius: '10px',
                                        padding: '0.5rem 0.75rem',
                                        marginTop: '0.4rem',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '6px',
                                        fontFamily: 'var(--font-outfit), sans-serif'
                                    }}>
                                        <AlertCircle size={14} color={lookupError ? '#EF4444' : '#2563EB'} style={{ marginTop: '1px', flexShrink: 0 }} />
                                        <div>
                                            <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: '800', color: lookupError ? '#991B1B' : '#1E40AF' }}>
                                                {lookupError ? 'Error de Validación' : '🔒 Cuenta FruFresco Detectada'}
                                            </p>
                                            <p style={{ margin: '1px 0 0 0', fontSize: '0.7rem', fontWeight: '500', color: lookupError ? '#7F1D1D' : '#1E3A8A', lineHeight: '1.25' }}>
                                                {lookupError || (lookupLoading ? 'Validando...' : 'Digita el celular registrado para autocompletar tu compra.')}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 4. Nombre Completo */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '800', fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                    {t.fullName}
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ 
                                        position: 'absolute', 
                                        left: '12px', 
                                        top: 0, 
                                        bottom: 0, 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        color: isProfileMatched ? '#3B82F6' : 'var(--primary)', 
                                        opacity: 0.5, 
                                        pointerEvents: 'none' 
                                    }}>
                                        {isProfileMatched ? <LockIcon size={14} /> : <User size={15} />}
                                    </div>
                                    <input
                                        type="text"
                                        placeholder={t.fullNamePlaceholder}
                                        value={isProfileMatched ? maskedName : name}
                                        onChange={(e) => handleNameChange(e.target.value)}
                                        readOnly={isProfileMatched}
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.55rem 1rem 0.55rem 2.5rem', 
                                            borderRadius: '12px', 
                                            border: isProfileMatched ? '1px dashed #93C5FD' : '1px solid #E2E8F0', 
                                            fontSize: '0.85rem', 
                                            fontWeight: '500', 
                                            backgroundColor: isProfileMatched ? '#F3F4F6' : 'white', 
                                            color: isProfileMatched ? '#6B7280' : '#111827',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                            outline: 'none', 
                                            fontFamily: 'var(--font-outfit), sans-serif',
                                            transition: 'all 0.15s ease-in-out' 
                                        }}
                                        className="checkout-input-modern"
                                    />
                                </div>
                            </div>

                            {/* Selector de Enviar a Otra Persona / Regalo */}
                            <div style={{
                                marginTop: '1rem',
                                padding: '1rem 1.25rem',
                                backgroundColor: isGiftForRecipient ? '#F0FDF4' : '#F8FAFC',
                                border: `1px solid ${isGiftForRecipient ? '#A7F3D0' : '#E2E8F0'}`,
                                borderRadius: '16px',
                                transition: 'all 0.25s ease'
                            }}>
                                <label style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    cursor: 'pointer',
                                    userSelect: 'none'
                                }}>
                                    <div style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '10px',
                                        backgroundColor: isGiftForRecipient ? '#DCFCE7' : '#EAEFEA',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: isGiftForRecipient ? '#059669' : 'var(--primary)',
                                        flexShrink: 0
                                    }}>
                                        <Gift size={20} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: '800', color: isGiftForRecipient ? '#065F46' : 'var(--text-main)', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            {locale === 'es' ? '¿Quieres enviárselo a otra persona?' : 'Send as a gift / to someone else?'}
                                        </div>
                                        <div style={{ fontSize: '0.76rem', color: isGiftForRecipient ? '#047857' : '#64748B', marginTop: '1px' }}>
                                            {locale === 'es' 
                                                ? 'Marca esta casilla para ingresar el nombre, celular y dirección del destinatario.' 
                                                : 'Check this box to enter recipient details and delivery address.'}
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={isGiftForRecipient}
                                        onChange={(e) => setIsGiftForRecipient(e.target.checked)}
                                        style={{
                                            width: '20px',
                                            height: '20px',
                                            accentColor: 'var(--primary)',
                                            cursor: 'pointer'
                                        }}
                                    />
                                </label>
                            </div>

                            {/* Bloque de Destinatario (Si es para otra persona) */}
                            {isGiftForRecipient && (
                                <div style={{
                                    padding: '1.25rem',
                                    backgroundColor: '#F0FDF4',
                                    border: '1px solid #A7F3D0',
                                    borderRadius: '16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #C6F6D5', paddingBottom: '0.5rem' }}>
                                        <UserCheck size={18} color="#047857" />
                                        <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#065F46', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            {locale === 'es' ? 'Datos de quien recibe el pedido' : 'Recipient Information'}
                                        </span>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '800', fontSize: '0.72rem', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                {locale === 'es' ? 'Nombre de quien recibe *' : 'Recipient Full Name *'}
                                            </label>
                                            <div style={{ position: 'relative' }}>
                                                <div style={{ position: 'absolute', left: '12px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: '#059669', pointerEvents: 'none' }}>
                                                    <User size={15} />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={recipientName}
                                                    onChange={(e) => setRecipientName(e.target.value)}
                                                    placeholder={locale === 'es' ? 'Ej: Juan Pérez (Mamá / Amigo)' : 'e.g. John Doe'}
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.55rem 1rem 0.55rem 2.5rem',
                                                        borderRadius: '12px',
                                                        border: '1px solid #A7F3D0',
                                                        fontSize: '0.85rem',
                                                        fontWeight: '500',
                                                        backgroundColor: 'white',
                                                        outline: 'none',
                                                        fontFamily: 'var(--font-outfit), sans-serif'
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '800', fontSize: '0.72rem', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                {locale === 'es' ? 'Celular de quien recibe *' : 'Recipient Phone *'}
                                            </label>
                                            <div style={{ position: 'relative' }}>
                                                <div style={{ position: 'absolute', left: '12px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: '#059669', pointerEvents: 'none' }}>
                                                    <Phone size={15} />
                                                </div>
                                                <input
                                                    type="tel"
                                                    value={recipientPhone}
                                                    onChange={(e) => setRecipientPhone(e.target.value)}
                                                    placeholder={locale === 'es' ? 'Ej: 3001234567' : 'e.g. 3001234567'}
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.55rem 1rem 0.55rem 2.5rem',
                                                        borderRadius: '12px',
                                                        border: '1px solid #A7F3D0',
                                                        fontSize: '0.85rem',
                                                        fontWeight: '500',
                                                        backgroundColor: 'white',
                                                        outline: 'none',
                                                        fontFamily: 'var(--font-outfit), sans-serif'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 5. Dirección de Entrega (Del Destinatario o Propia) */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '800', fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                    {isGiftForRecipient 
                                        ? (locale === 'es' ? 'Dirección de Entrega del Destinatario *' : 'Recipient Delivery Address *')
                                        : (locale === 'es' ? 'Dirección de Entrega *' : 'Delivery Address *')}
                                </label>
                                <div style={{ position: 'relative', marginBottom: '0.4rem' }}>
                                    <div style={{ 
                                        position: 'absolute', 
                                        left: '12px', 
                                        top: 0, 
                                        bottom: 0, 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        color: isProfileMatched ? '#3B82F6' : 'var(--primary)', 
                                        opacity: 0.5, 
                                        pointerEvents: 'none' 
                                    }}>
                                        {isProfileMatched && !isGiftForRecipient ? <LockIcon size={14} /> : <MapPin size={15} />}
                                    </div>
                                    <input
                                        type="text"
                                        placeholder={isGiftForRecipient ? "Ej: Calle 140 # 19-35, Apto 402" : "Ej: Calle 10 # 20-30, Apto 5, Barrio Centro"}
                                        value={isProfileMatched && !isGiftForRecipient ? maskedAddress : address}
                                        onChange={(e) => handleAddressChange(e.target.value)}
                                        readOnly={isProfileMatched && !isGiftForRecipient}
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.55rem 1rem 0.55rem 2.5rem', 
                                            borderRadius: '12px', 
                                            border: isProfileMatched && !isGiftForRecipient ? '1px dashed #93C5FD' : '1px solid #E2E8F0', 
                                            fontSize: '0.85rem', 
                                            fontWeight: '500', 
                                            backgroundColor: isProfileMatched && !isGiftForRecipient ? '#F3F4F6' : 'white', 
                                            color: isProfileMatched && !isGiftForRecipient ? '#6B7280' : '#111827',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                            fontFamily: 'var(--font-outfit), sans-serif',
                                            outline: 'none' 
                                        }}
                                        className="checkout-input-modern"
                                    />
                                </div>

                                {/* GPS Capture Flow */}
                                {address.trim().length > 3 && !latitude && (
                                    <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                                        <button
                                            onClick={handleGetLocation}
                                            type="button"
                                            className="btn-glass"
                                            style={{ 
                                                fontSize: '0.75rem', 
                                                background: 'rgba(37, 99, 235, 0.05)', 
                                                color: '#2563EB', 
                                                border: '1px solid rgba(37, 99, 235, 0.1)', 
                                                padding: '0.7rem', 
                                                borderRadius: '12px', 
                                                cursor: 'pointer',
                                                fontWeight: '800',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px',
                                            }}
                                            disabled={isGettingLocation}
                                        >
                                            {isGettingLocation ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                                            {t.currentLocation}
                                        </button>

                                        <button 
                                            onClick={() => {
                                                if (!latitude && address.trim().length > 5) {
                                                    setIsGettingLocation(true);
                                                    if (window.google && window.google.maps && window.google.maps.Geocoder) {
                                                        const geocoder = new window.google.maps.Geocoder();
                                                        geocoder.geocode({ address: `${address}, Bogotá, Colombia` }, (results, status) => {
                                                            setIsGettingLocation(false);
                                                            if (status === 'OK' && results && results[0]) {
                                                                setLatitude(results[0].geometry.location.lat());
                                                                setLongitude(results[0].geometry.location.lng());
                                                            }
                                                            setShowMapPicker(true);
                                                        });
                                                    } else {
                                                        setIsGettingLocation(false);
                                                        setShowMapPicker(true);
                                                    }
                                                } else {
                                                    setShowMapPicker(true);
                                                }
                                            }}
                                            type="button"
                                            className="btn-glass"
                                            style={{ 
                                                fontSize: '0.75rem', 
                                                background: 'rgba(0,0,0,0.03)', 
                                                color: 'var(--text-main)', 
                                                border: '1px solid rgba(0,0,0,0.05)', 
                                                padding: '0.7rem', 
                                                borderRadius: '12px', 
                                                cursor: 'pointer',
                                                fontWeight: '800',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px'
                                            }}
                                            disabled={isGettingLocation}
                                        >
                                            {isGettingLocation ? <Loader2 size={14} className="animate-spin" /> : <MapIcon size={14} />} {t.selectOnMap}
                                        </button>
                                    </div>
                                )}

                                {latitude && (() => {
                                    const isCustomerOutOfZone = outOfZone && !isB2B;
                                    return (
                                        <div style={{ 
                                            marginTop: '0.6rem', 
                                            padding: '0.75rem 1rem', 
                                            backgroundColor: isCustomerOutOfZone ? '#FEFCE8' : '#F0FDF4', 
                                            display: 'flex', 
                                            alignItems: 'flex-start', 
                                            justifyContent: 'space-between',
                                            gap: '12px',
                                            borderRadius: '12px',
                                            border: `1px solid ${isCustomerOutOfZone ? '#FDE68A' : '#DCFCE7'}`,
                                            boxShadow: isCustomerOutOfZone ? '0 1px 4px rgba(217, 119, 6, 0.05)' : '0 1px 4px rgba(22, 101, 52, 0.05)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 }}>
                                                <div style={{
                                                    width: '28px',
                                                    height: '28px',
                                                    borderRadius: '50%',
                                                    backgroundColor: isCustomerOutOfZone ? '#FEF3C7' : '#DCFCE7',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0,
                                                    marginTop: '1px'
                                                }}>
                                                    {isCustomerOutOfZone ? (
                                                        <MapPin size={15} color="#D97706" strokeWidth={2} />
                                                    ) : (
                                                        <CheckCircle2 size={15} color="#166534" strokeWidth={2} />
                                                    )}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <p style={{ 
                                                        fontSize: '0.78rem', 
                                                        color: isCustomerOutOfZone ? '#92400E' : '#166534', 
                                                        margin: 0, 
                                                        fontWeight: '600',
                                                        lineHeight: '1.4',
                                                        fontFamily: 'var(--font-outfit), sans-serif'
                                                    }}>
                                                        {isCustomerOutOfZone ? t.locationOutOfZone : t.locationVerified}
                                                    </p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => { setLatitude(null); setLongitude(null); }}
                                                style={{ 
                                                    background: 'none', 
                                                    border: 'none', 
                                                    color: isCustomerOutOfZone ? '#D97706' : '#059669', 
                                                    cursor: 'pointer', 
                                                    paddingTop: '2px'
                                                }}
                                            >
                                                {t.change}
                                            </button>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '800', fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                    {t.deliveryDate}
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '12px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)', opacity: 0.4, pointerEvents: 'none' }}>
                                        <Calendar size={15} />
                                    </div>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        min={minDeliveryDate}
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.55rem 1rem 0.55rem 2.5rem', 
                                            borderRadius: '12px', 
                                            border: '1px solid #E2E8F0', 
                                            fontSize: '0.85rem', 
                                            fontWeight: '500', 
                                            backgroundColor: 'white', 
                                            outline: 'none', 
                                            cursor: 'pointer',
                                            fontFamily: 'var(--font-outfit), sans-serif',
                                            WebkitAppearance: 'none'
                                        }}
                                        className="checkout-input-modern custom-date-input"
                                    />
                                </div>
                            </div>

                            <div style={{ marginTop: '0.4rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <label style={{ display: 'block', margin: 0, fontWeight: '800', fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            {t.specialNotes}
                                        </label>
                                        {specialNotes.trim().length > 0 && (
                                            <span style={{ 
                                                display: 'inline-flex', 
                                                alignItems: 'center', 
                                                gap: '3px', 
                                                fontSize: '0.68rem', 
                                                fontWeight: '800', 
                                                color: '#059669', 
                                                backgroundColor: '#ECFDF5', 
                                                padding: '1px 6px', 
                                                borderRadius: '6px',
                                                border: '1px solid #A7F3D0',
                                                transition: 'all 0.2s ease'
                                            }}>
                                                <CheckCircle2 size={11} strokeWidth={2.5} color="#059669" />
                                                {locale === 'es' ? 'Guardado' : 'Saved'}
                                            </span>
                                        )}
                                    </div>
                                    <span style={{ fontSize: '0.65rem', color: specialNotes.length > 130 ? '#EF4444' : '#9CA3AF', fontWeight: '800', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                        {specialNotes.length}/150
                                    </span>
                                </div>
                                <textarea
                                    placeholder={isGiftForRecipient ? "Ej: Dejar en portería y decir que es un regalo de parte de German Higuera" : t.specialNotesPlaceholder}
                                    value={specialNotes}
                                    onChange={(e) => handleNotesChange(e.target.value.slice(0, 150))}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleNotesEnter();
                                        }
                                    }}
                                    onBlur={() => {
                                        if (specialNotes.trim()) {
                                            setNotesJustSaved(true);
                                        }
                                    }}
                                    style={{ 
                                        width: '100%', 
                                        padding: '0.55rem 0.75rem', 
                                        borderRadius: '12px', 
                                        border: specialNotes.trim().length > 0 ? '1.5px solid #10B981' : '1px solid #E2E8F0', 
                                        fontSize: '0.85rem', 
                                        fontWeight: '500', 
                                        backgroundColor: specialNotes.trim().length > 0 ? '#F0FDF4' : 'white', 
                                        outline: 'none', 
                                        minHeight: '50px', 
                                        resize: 'none',
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        transition: 'all 0.3s'
                                    }}
                                    className="checkout-input-modern"
                                />
                            </div>
                        </div>

                        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '2px dashed rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.9rem' }}>{t.subtotal}</span>
                                <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.9rem' }}>${totalPrice.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}{locale === 'en' ? ' COP' : ''}</span>
                            </div>
                            {roundedTaxAmount > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <span style={{ color: 'var(--text-muted)', fontWeight: '500', fontSize: '0.78rem' }}>
                                        {locale === 'es' ? 'IVA discriminado (incluido en precios)' : 'Tax (included in prices)'}
                                    </span>
                                    <span style={{ fontWeight: '600', color: '#64748B', fontSize: '0.8rem' }}>
                                        ${roundedTaxAmount.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}{locale === 'en' ? ' COP' : ''}
                                    </span>
                                </div>
                            )}

                            {packagingFeeEnabled && packagingFeeAmount > 0 && (
                                <div style={{ 
                                    marginTop: '0.6rem',
                                    marginBottom: '0.8rem',
                                    padding: '0.75rem 1rem', 
                                    backgroundColor: '#F0FDF4', 
                                    borderRadius: '14px', 
                                    border: '1.5px solid #A7F3D0',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.05)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: '#047857', fontWeight: '800', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            🛍️ Empaque e Inocuidad ({packagingFeePercentage}%):
                                        </span>
                                        <span style={{ fontWeight: '900', color: '#047857', fontSize: '0.88rem' }}>
                                            +${packagingFeeAmount.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}{locale === 'en' ? ' COP' : ''}
                                        </span>
                                    </div>
                                    {packagingFeeNote && (
                                        <span style={{ fontSize: '0.68rem', color: '#065F46', opacity: 0.9, lineHeight: '1.35', fontWeight: '500' }}>
                                            {packagingFeeNote}
                                        </span>
                                    )}
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem', marginTop: '0.5rem' }}>
                                <span style={{ 
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    fontSize: '1.1rem', 
                                    fontWeight: '900', 
                                    color: 'var(--text-main)', 
                                    letterSpacing: '-0.02em'
                                }}>{t.totalPurchase}</span>
                                <span style={{ 
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    fontSize: '1.6rem', 
                                    fontWeight: '900', 
                                    color: 'var(--primary)',
                                    letterSpacing: '-0.04em'
                                }}>${finalOrderTotal.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}{locale === 'en' ? ' COP' : ''}</span>
                            </div>

                            {!isMinOrderMet && (
                                <div style={{
                                    color: '#DC2626',
                                    padding: '0.5rem',
                                    fontSize: '0.8rem',
                                    marginBottom: '0.75rem',
                                    textAlign: 'center',
                                    fontWeight: '800',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px'
                                }}>
                                    <AlertCircle size={14} /> {t.minOrderMsg}: ${minOrder.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')}{locale === 'en' ? ' COP' : ''}
                                </div>
                            )}

                            {outOfZone && latitude && !isB2B && (
                                <div style={{
                                    backgroundColor: '#FEFCE8',
                                    color: '#B45309',
                                    padding: '1.1rem',
                                    borderRadius: '14px',
                                    fontSize: '0.8rem',
                                    marginBottom: '1rem',
                                    border: '1px solid #FEF08A',
                                    textAlign: 'center',
                                    boxShadow: '0 2px 8px rgba(217, 119, 6, 0.06)'
                                }}>
                                    <p style={{ 
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        fontWeight: '900', 
                                        margin: '0 0 6px 0',
                                        fontSize: '0.95rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        color: '#B45309'
                                    }}>
                                        <MapPin size={16} color="#D97706" /> {locale === 'es' ? '¡Pronto estaremos más cerca de ti!' : 'We hope to reach your area soon!'}
                                    </p>
                                    <p style={{ margin: '0 0 12px 0', fontSize: '0.78rem', fontWeight: '500', lineHeight: '1.45', color: '#92400E' }}>
                                        {locale === 'es' ? 'Por ahora nuestras entregas para hogares están habilitadas en la Zona Norte. Si buscas suministros para un restaurante o negocio en esta ubicación, ¡nuestro canal comercial para empresas sí puede atenderte!' : 'Our home delivery route is currently available in the North Zone. If you are buying for a restaurant or business in this area, our commercial team can serve you!'} 
                                    </p>
                                    <Link href="/b2b/register" style={{ 
                                        color: 'white', 
                                        backgroundColor: '#D97706',
                                        padding: '0.55rem 1.1rem',
                                        borderRadius: '10px',
                                        fontWeight: '800', 
                                        textDecoration: 'none',
                                        display: 'inline-block',
                                        fontSize: '0.78rem',
                                        boxShadow: '0 2px 6px rgba(217, 119, 6, 0.2)',
                                        transition: 'all 0.2s'
                                    }}>
                                        {locale === 'es' ? '¿Tienes un Restaurante o Negocio? Registrar mi Empresa' : 'Are you a Business? Register your Company'}
                                    </Link>
                                </div>
                            )}

                            {/* Método de Pago Selector */}
                            <div id="payment-method-section" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', marginBottom: '0.6rem', letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: 'var(--font-inter), sans-serif' }}>
                                    {locale === 'es' ? 'Método de Pago' : 'Payment Method'}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {/* Opción Wompi */}
                                    <div 
                                        onClick={() => setPaymentMethod('wompi')}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '1rem',
                                            borderRadius: '16px',
                                            border: `2px solid ${paymentMethod === 'wompi' ? 'var(--primary)' : 'rgba(0,0,0,0.06)'}`,
                                            backgroundColor: paymentMethod === 'wompi' ? 'rgba(5, 150, 105, 0.03)' : 'white',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            boxShadow: paymentMethod === 'wompi' ? '0 4px 20px rgba(5, 150, 105, 0.05)' : 'none'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{
                                                width: '20px',
                                                height: '20px',
                                                borderRadius: '50%',
                                                border: `2px solid ${paymentMethod === 'wompi' ? 'var(--primary)' : '#CBD5E1'}`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: paymentMethod === 'wompi' ? 'var(--primary)' : 'transparent',
                                                transition: 'all 0.2s'
                                            }}>
                                                {paymentMethod === 'wompi' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'white' }} />}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#1E293B', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                    {locale === 'es' ? 'Pago Seguro Online' : 'Secure Online Payment'}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '500', marginTop: '2px', fontFamily: 'var(--font-inter), sans-serif' }}>
                                                    {locale === 'es' ? 'Tarjeta de crédito, débito, PSE, Nequi, etc.' : 'Credit card, debit, bank transfer.'}
                                                </div>
                                            </div>
                                        </div>
                                        <ShieldCheck size={20} color={paymentMethod === 'wompi' ? 'var(--primary)' : '#94A3B8'} style={{ opacity: 0.8 }} />
                                    </div>

                                    {/* Opción Contra Entrega */}
                                    <div 
                                        onClick={() => setPaymentMethod('contra_entrega')}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '1rem',
                                            borderRadius: '16px',
                                            border: `2px solid ${paymentMethod === 'contra_entrega' ? 'var(--primary)' : 'rgba(0,0,0,0.06)'}`,
                                            backgroundColor: paymentMethod === 'contra_entrega' ? 'rgba(5, 150, 105, 0.03)' : 'white',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            boxShadow: paymentMethod === 'contra_entrega' ? '0 4px 20px rgba(5, 150, 105, 0.05)' : 'none'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{
                                                width: '20px',
                                                height: '20px',
                                                borderRadius: '50%',
                                                border: `2px solid ${paymentMethod === 'contra_entrega' ? 'var(--primary)' : '#CBD5E1'}`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: paymentMethod === 'contra_entrega' ? 'var(--primary)' : 'transparent',
                                                transition: 'all 0.2s'
                                            }}>
                                                {paymentMethod === 'contra_entrega' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'white' }} />}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#1E293B', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                    {locale === 'es' ? 'Pago Contra Entrega' : 'Cash on Delivery'}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '500', marginTop: '2px', fontFamily: 'var(--font-inter), sans-serif' }}>
                                                    {locale === 'es' ? 'Paga en efectivo o transferencia al recibir' : 'Pay with cash or bank transfer on receipt.'}
                                                </div>
                                            </div>
                                        </div>
                                        <Truck size={20} color={paymentMethod === 'contra_entrega' ? 'var(--primary)' : '#94A3B8'} style={{ opacity: 0.8 }} />
                                    </div>
                                </div>
                            </div>

                            <button
                                className="btn-premium"
                                style={{ 
                                    width: '100%', 
                                    padding: '1rem', 
                                    fontSize: '1.1rem', 
                                    borderRadius: '16px', 
                                    fontWeight: '900', 
                                    backgroundColor: (loading || !isMinOrderMet || !latitude || (outOfZone && !isB2B)) ? 'rgba(0,0,0,0.06)' : 'var(--primary)', 
                                    color: (loading || !isMinOrderMet || !latitude || (outOfZone && !isB2B)) ? 'rgba(0,0,0,0.3)' : 'white', 
                                    border: 'none', 
                                    cursor: (loading || !isMinOrderMet || !latitude || (outOfZone && !isB2B)) ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '12px',
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    boxShadow: (loading || !isMinOrderMet || !latitude || (outOfZone && !isB2B)) ? 'none' : '0 10px 30px rgba(26, 77, 46, 0.12)'
                                }}
                                disabled={loading || !isMinOrderMet || !latitude || (outOfZone && !isB2B)}
                                onClick={handleSubmit}
                            >
                                {loading ? (
                                    <>{t.processing} <Loader2 size={20} className="animate-spin" /></>
                                ) : !latitude ? (
                                    <><MapPin size={16} strokeWidth={2.5} style={{ opacity: 0.6 }} /> {locale === 'es' ? 'Ubica tu entrega' : 'Locate delivery'}</>
                                ) : (outOfZone && !isB2B) ? (
                                    <>{locale === 'es' ? 'Sin Cobertura' : 'No Coverage'} <MapPin size={20} /></>
                                ) : (
                                    <>{paymentMethod === 'wompi' 
                                        ? (locale === 'es' ? 'Confirmar y Pagar Online' : 'Confirm & Pay Online') 
                                        : (locale === 'es' ? 'Confirmar Pedido (Pagar al Recibir)' : 'Confirm Order (Pay on Delivery)')
                                    } {paymentMethod === 'wompi' ? <ShieldCheck size={20} strokeWidth={2} /> : <Truck size={20} strokeWidth={2} />}</>
                                )}
                            </button>

                            {paymentMethod === 'contra_entrega' && latitude && (
                                <p style={{ fontSize: '0.8rem', color: '#047857', textAlign: 'center', marginTop: '0.8rem', fontWeight: '700', backgroundColor: '#ECFDF5', padding: '8px 14px', borderRadius: '10px', border: '1px solid #A7F3D0' }}>
                                    💡 {locale === 'es' ? 'No pagas nada hoy. Cancelas el valor exacto al recibir tu pedido en puerta.' : 'You pay nothing today. Pay exact amount on delivery.'}
                                </p>
                            )}

                            {!latitude && address.trim().length > 3 && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem', fontWeight: '600', opacity: 0.7 }}>
                                    {locale === 'es' ? '📍 Necesitamos tu ubicación exacta para que el repartidor llegue sin problemas.' : '📍 We need your exact location so the driver can arrive without issues.'}
                                </p>
                            )}

                            <div style={{ 
                                marginTop: '1.5rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '6px',
                                color: '#94A3B8',
                                fontSize: '0.75rem',
                                fontWeight: '500',
                                fontFamily: 'var(--font-inter), sans-serif',
                                opacity: 0.8
                            }}>
                                <LockIcon size={12} color="#94A3B8" />
                                <span>
                                    {locale === 'es' 
                                        ? 'Tus datos están protegidos con cifrado SSL' 
                                        : 'Your data is secured with SSL encryption'}
                                </span>
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

                                <Map
                                    defaultCenter={{ lat: latitude || 4.6097, lng: longitude || -74.0817 }} // Uses geocoded address or Bogota
                                    defaultZoom={15}
                                    mapId="DEMO_MAP_ID"
                                    onCenterChanged={(e) => {
                                        const center = e.map.getCenter();
                                        if (center) {
                                            setLatitude(center.lat());
                                            setLongitude(center.lng());
                                        }
                                    }}
                                >
                                    {/* Visual center helper */}
                                    <div style={{
                                        position: 'absolute', top: '50%', left: '50%',
                                        transform: 'translate(-50%, -100%)', zIndex: 1,
                                        pointerEvents: 'none',
                                        filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.3))'
                                    }}>
                                        <div style={{ 
                                            backgroundColor: 'var(--primary)', 
                                            color: 'white', 
                                            padding: '8px', 
                                            borderRadius: '50% 50% 50% 0',
                                            transform: 'rotate(-45deg)',
                                            width: '40px',
                                            height: '40px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            border: '3px solid white'
                                        }}>
                                            <div style={{ transform: 'rotate(45deg)' }}>
                                                <MapPin size={20} fill="white" />
                                            </div>
                                        </div>
                                    </div>
                                </Map>
                        </div>

                        <div style={{ padding: '1.5rem 2rem', backgroundColor: '#F9FAFB', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '2rem', borderTop: '1px solid var(--border)' }}>
                            <div style={{ marginRight: 'auto' }}>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{locale === 'es' ? 'Coordenadas Detectadas' : 'Detected Coordinates'}</p>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: '700', fontFamily: 'monospace' }}>
                                    {latitude?.toFixed(5)}, {longitude?.toFixed(5)}
                                </p>
                            </div>
                            <button 
                                onClick={() => setShowMapPicker(false)}
                                className="btn-premium"
                                style={{ 
                                    padding: '1rem 2.5rem', 
                                    borderRadius: 'var(--radius-full)', 
                                    fontWeight: '900',
                                    fontSize: '1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px'
                                }}
                            >
                                <CheckCircle2 size={20} /> {locale === 'es' ? 'Confirmar Ubicación' : 'Confirm Location'}
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

                        {/* Minimalist Product List (Sobrio, Elegante y Amplio) */}
                        <div style={{
                            border: '1px solid #E2E8F0',
                            borderRadius: '18px',
                            overflow: 'hidden',
                            backgroundColor: '#FFFFFF',
                            marginBottom: '1.25rem',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
                        }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(280px, 2.5fr) 1.5fr 1fr',
                                padding: '0.8rem 1.25rem',
                                backgroundColor: '#F8FAFC',
                                borderBottom: '1px solid #E2E8F0',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                color: '#64748B',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }}>
                                <span>{locale === 'es' ? 'Producto' : 'Product'}</span>
                                <span style={{ textAlign: 'center' }}>{locale === 'es' ? 'Cantidad / Presentación' : 'Quantity'}</span>
                                <span style={{ textAlign: 'right' }}>Subtotal</span>
                            </div>
                            <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                                {items.map((item, idx) => {
                                    const itemTotal = Math.round(item.price * item.quantity);
                                    return (
                                        <div key={idx} style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'minmax(280px, 2.5fr) 1.5fr 1fr',
                                            padding: '0.85rem 1.25rem',
                                            borderBottom: idx < items.length - 1 ? '1px solid #F1F5F9' : 'none',
                                            fontSize: '0.92rem',
                                            alignItems: 'center',
                                            backgroundColor: idx % 2 === 0 ? 'white' : '#FAFAFA'
                                        }}>
                                            <span style={{ fontWeight: '600', color: '#1E293B' }}>
                                                {item.name}
                                            </span>
                                            <span style={{ textAlign: 'center', color: '#475569', fontWeight: '500' }}>
                                                {item.quantity} {item.unit || 'Un'}
                                            </span>
                                            <span style={{ textAlign: 'right', fontWeight: '700', color: 'var(--primary-dark)', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                ${itemTotal.toLocaleString('es-CO')}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Fila Resumen Única de Empaque y Total (Ancha y Sobria) */}
                        <div style={{
                            backgroundColor: '#F0FDF4',
                            border: '1px solid #A7F3D0',
                            borderRadius: '16px',
                            padding: '1.1rem 1.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px',
                            marginBottom: '1.5rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#166534', fontWeight: '700', fontSize: '0.98rem' }}>
                                <Package size={20} color="#059669" />
                                <span>
                                    {items.length} {items.length === 1 ? 'producto' : 'productos'} en total • {itemBreakdownSummary}
                                </span>
                            </div>
                            <div style={{ fontSize: '1.35rem', fontWeight: '950', color: '#047857', fontFamily: 'var(--font-outfit), sans-serif', letterSpacing: '-0.02em' }}>
                                Total: ${finalOrderTotal.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')} COP
                            </div>
                        </div>

                        {/* Resumen de Entrega y Pago */}
                        <div style={{
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '16px',
                            padding: '1.25rem',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                            gap: '16px',
                            fontSize: '0.88rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#EAEFEA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <MapPin size={18} color="var(--primary)" />
                                </div>
                                <div>
                                    <div style={{ fontWeight: '700', color: '#334155' }}>{locale === 'es' ? 'Dirección de Entrega' : 'Delivery Address'}</div>
                                    <div style={{ color: '#64748B', marginTop: '2px' }}>{address}</div>
                                    <div style={{ color: '#94A3B8', fontSize: '0.8rem', marginTop: '1px' }}>
                                        {isGiftForRecipient ? (
                                            <>
                                                <div>👤 {locale === 'es' ? 'Comprador:' : 'Buyer:'} {name} ({phone})</div>
                                                <div style={{ color: '#047857', fontWeight: '700', marginTop: '2px' }}>
                                                    🎁 {locale === 'es' ? 'Recibe en puerta:' : 'Recipient:'} {recipientName} ({recipientPhone})
                                                </div>
                                            </>
                                        ) : (
                                            <>{name} ({phone})</>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#EAEFEA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Calendar size={18} color="var(--primary)" />
                                </div>
                                <div>
                                    <div style={{ fontWeight: '700', color: '#334155' }}>{locale === 'es' ? 'Fecha y Método de Pago' : 'Delivery Date & Payment'}</div>
                                    <div style={{ color: '#64748B', marginTop: '2px' }}>{date}</div>
                                    <div style={{ color: '#0D7A57', fontWeight: '700', fontSize: '0.82rem', marginTop: '1px' }}>
                                        {paymentMethod === 'wompi' ? 'Wompi (PSE / Nequi / Tarjeta)' : (locale === 'es' ? 'Pago Contra Entrega' : 'Cash on Delivery')}
                                    </div>
                                </div>
                            </div>
                        </div>

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
                                        🚚 {locale === 'es' ? 'Pedido Contra Entrega Programado' : 'Scheduled Cash on Delivery Order'}
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
                                {loading ? <Loader2 size={20} className="animate-spin" /> : (paymentMethod === 'contra_entrega' ? <CheckCircle2 size={20} /> : <ShieldCheck size={20} />)}
                                {loading 
                                    ? (locale === 'es' ? 'Procesando...' : 'Processing...') 
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
