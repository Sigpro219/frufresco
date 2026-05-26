'use client';

import { useState, useEffect } from 'react';
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
    X,
    ShieldCheck,
    Truck,
    Lock as LockIcon
} from 'lucide-react';
import { useAuth } from '../../lib/authContext';

export default function CheckoutPage() {
    const { items, totalPrice, removeItem, clearCart } = useCart();
    const [isMounted, setIsMounted] = useState(false);
    const [name, setName] = useState('');
    const [identification, setIdentification] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [date, setDate] = useState('');
    const [minOrder, setMinOrder] = useState(0);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const [minDeliveryDate, setMinDeliveryDate] = useState('');
    const [latitude, setLatitude] = useState<number | null>(null);
    const [longitude, setLongitude] = useState<number | null>(null);
    const [isGettingLocation, setIsGettingLocation] = useState(false);
    const [showMapPicker, setShowMapPicker] = useState(false);
    const [b2cGeofence, setB2cGeofence] = useState<Point[]>([]);
    const [outOfZone, setOutOfZone] = useState(false);
    const [specialNotes, setSpecialNotes] = useState('');
    const { profile } = useAuth();
    const searchParams = useSearchParams();
    
    const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
    const t = translations[locale];
    
    const taxAmount = items.reduce((totalTax, item) => {
        const rate = Number(item.iva_rate) || 0;
        if (rate <= 0) return totalTax;
        
        // Precio incluye IVA -> IVA = Total * (Rate / (100 + Rate))
        const itemTotal = item.price * item.quantity;
        const itemTax = itemTotal * (rate / (100 + rate));
        
        console.log(`📊 IVA SKU [${item.name}]: Tasa ${rate}% -> Aporta $${itemTax.toFixed(2)}`);
        return totalTax + itemTax;
    }, 0);

    const isB2B = profile?.role === 'b2b_client';

    useEffect(() => {
        setIsMounted(true);
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

    // Initial default value to avoid empty state
    useEffect(() => {
        const defaultDate = getSafeBogotaDate(1);
        setDate(prev => prev || defaultDate);
        setMinDeliveryDate(defaultDate);
    }, []);

    // Load Profile data for B2B/Registered users
    useEffect(() => {
        if (profile) {
            // El nombre se deja limpio a propósito para que se llene manualmente
            if (!email && profile.company_name?.includes('@')) setEmail(profile.company_name);
            if (!address) setAddress(profile.address_main || '');
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

                let daysToAdd = cutoffEnabled ? 1 : 0;
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
        if (!name) return alert(locale === 'es' ? 'Por favor ingresa tu Nombre Completo.' : 'Please enter your Full Name.');
        if (!identification) return alert(locale === 'es' ? 'Por favor ingresa tu Número de Identificación.' : 'Please enter your ID Number.');
        if (!phone) return alert(locale === 'es' ? 'Por favor ingresa tu Número de Celular.' : 'Please enter your WhatsApp Number.');
        if (!email) return alert(locale === 'es' ? 'Por favor ingresa tu Email.' : 'Please enter your Email.');
        if (!address) return alert(locale === 'es' ? 'Por favor ingresa la Dirección de Entrega.' : 'Please enter your Delivery Address.');
        if (!isMinOrderMet) return alert(`${t.minOrderMsg}: $${minOrder.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')}.`);
        if (outOfZone) return alert(t.outOfZoneMsg);

        setLoading(true);

        try {
            console.log('1️⃣ Creating order record...');
            
            // Sanitize coordinates to ensure they fit DECIMAL(10,8)
            const safeLat = latitude ? parseFloat(latitude.toFixed(8)) : null;
            const safeLng = longitude ? parseFloat(longitude.toFixed(8)) : null;

            // Create a Promise race to handle potential Supabase client hangs
            const orderDataToInsert = {
                type: 'b2c_wompi',
                status: 'pending_approval',
                delivery_date: date,
                shipping_address: address,
                subtotal: totalPrice - taxAmount,
                tax: taxAmount,
                total: totalPrice,
                latitude: safeLat,
                longitude: safeLng,
                special_notes: `[CLIENTE: ${name} | Tel: ${phone} | Email: ${email} | ID: ${identification}]\n[ORIGIN: web]\n${specialNotes || ''}`
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
                const errorData = await result.json().catch(() => ({}));
                console.error('❌ Error insertando pedido:', errorData);
                throw new Error(`Error al crear el pedido: ${errorData.error || result.statusText}`);
            }

            const { order: orderData } = await result.json();

            if (!orderData) throw new Error('No se recibió confirmación del pedido.');
            console.log('✅ Pedido creado:', orderData.id);

            console.log('3️⃣ Requesting Wompi hash...');
            
            const amountInCents = totalPrice * 100;
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

    if (!isMounted) return null;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>

            <div className="container mobile-stack" style={{ padding: '2.5rem 1rem', display: 'grid', gridTemplateColumns: '1fr 380px', gap: '2.5rem' }}>

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
                            fontSize: '1.8rem', 
                            fontWeight: '900', 
                            color: 'var(--text-main)', 
                            margin: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            letterSpacing: '-0.04em'
                        }}>
                            <ShoppingCart size={24} strokeWidth={2.5} color="var(--primary)" /> {t.checkoutTitle}
                        </h1>
                        {items.length > 0 && (
                            <button
                                onClick={() => {
                                    clearCart();
                                    router.push('/');
                                }}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '12px',
                                    fontSize: '0.8rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    color: '#EF4444',
                                    backgroundColor: '#FEF2F2',
                                    border: '1px solid #FEE2E2',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                            >
                                <Trash2 size={14} /> {t.clearCart}
                            </button>
                        )}
                    </div>

                    {items.length === 0 ? (
                        <div style={{ 
                            textAlign: 'center', 
                            padding: '4rem 2rem', 
                            backgroundColor: 'white', 
                            borderRadius: '32px',
                            border: '1px dashed var(--border)'
                        }}>
                            <ShoppingCart size={64} color="var(--border)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: '500' }}>{t.emptyCart}</p>
                            <Link href="/" className="btn-premium" style={{ display: 'inline-flex', marginTop: '1.5rem', padding: '0.8rem 2rem' }}>
                                {t.exploreProducts}
                            </Link>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {items.map((item) => (
                                <div key={`${item.id}-${item.name}`} style={{
                                    backgroundColor: 'white',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '16px',
                                    border: '1px solid var(--border)',
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
                                            <h4 style={{ 
                                                fontFamily: 'var(--font-outfit), sans-serif',
                                                fontSize: '1rem',
                                                fontWeight: '800', 
                                                margin: '0 0 0.1rem 0',
                                                color: 'var(--text-main)',
                                                letterSpacing: '-0.02em'
                                            }}>{item.name}</h4>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ 
                                                    color: 'var(--primary)', 
                                                    fontSize: '0.8rem', 
                                                    fontWeight: '700',
                                                }}>
                                                    ${item.price.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')}{locale === 'en' ? ' COP' : ''}
                                                </span>
                                                <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: '600' }}>
                                                    • {item.quantity} {item.unit || ''}
                                                </span>
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
                                                ${(item.price * item.quantity).toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')}{locale === 'en' ? ' COP' : ''}
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
                            fontSize: '1.2rem', 
                            fontWeight: '900', 
                            marginBottom: '1rem', 
                            color: 'var(--text-main)', 
                            letterSpacing: '-0.04em',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}>
                            <CreditCard size={18} color="var(--primary)" strokeWidth={2.5} /> {t.deliveryDetail}
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: '800', fontSize: '0.7rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {t.fullName}
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '12px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)', opacity: 0.4, pointerEvents: 'none' }}>
                                        <User size={15} />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder={t.fullNamePlaceholder}
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem 1rem 0.5rem 2.5rem', borderRadius: '10px', border: '1px solid #E5E7EB', fontSize: '0.85rem', fontWeight: '500', backgroundColor: '#F9FAFB', outline: 'none', transition: 'all 0.2s' }}
                                        className="checkout-input-modern"
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: '800', fontSize: '0.7rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Identificación (Cédula/NIT)
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '12px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)', opacity: 0.4, pointerEvents: 'none' }}>
                                        <User size={15} />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Ej: 123456789"
                                        value={identification}
                                        onChange={(e) => setIdentification(e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem 1rem 0.5rem 2.5rem', borderRadius: '10px', border: '1px solid #E5E7EB', fontSize: '0.85rem', fontWeight: '500', backgroundColor: '#F9FAFB', outline: 'none', transition: 'all 0.2s' }}
                                        className="checkout-input-modern"
                                    />
                                </div>
                            </div>

                            <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: '800', fontSize: '0.7rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {t.whatsapp}
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', left: '12px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)', opacity: 0.4, pointerEvents: 'none' }}>
                                            <Phone size={15} />
                                        </div>
                                        <input
                                            type="tel"
                                            placeholder={t.whatsappPlaceholder}
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            style={{ width: '100%', padding: '0.5rem 1rem 0.5rem 2.5rem', borderRadius: '10px', border: '1px solid #E5E7EB', fontSize: '0.85rem', fontWeight: '500', backgroundColor: '#F9FAFB', outline: 'none' }}
                                            className="checkout-input-modern"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: '800', fontSize: '0.7rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {t.email}
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', left: '12px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)', opacity: 0.4, pointerEvents: 'none' }}>
                                            <Mail size={15} />
                                        </div>
                                        <input
                                            type="email"
                                            placeholder={t.emailPlaceholder}
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            style={{ width: '100%', padding: '0.5rem 1rem 0.5rem 2.5rem', borderRadius: '10px', border: '1px solid #E5E7EB', fontSize: '0.85rem', fontWeight: '500', backgroundColor: '#F9FAFB', outline: 'none' }}
                                            className="checkout-input-modern"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: '800', fontSize: '0.7rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Dirección de Entrega
                                </label>
                                <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
                                    <div style={{ position: 'absolute', left: '12px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)', opacity: 0.4, pointerEvents: 'none' }}>
                                        <MapPin size={15} />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Ej: Calle 10 # 20-30, Apto 5, Barrio Centro"
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem 1rem 0.5rem 2.5rem', borderRadius: '10px', border: '1px solid #E5E7EB', fontSize: '0.85rem', fontWeight: '500', backgroundColor: '#F9FAFB', outline: 'none' }}
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

                                {latitude && (
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between',
                                        gap: '8px', 
                                        backgroundColor: '#F0FDF4', 
                                        padding: '0.6rem 1rem', 
                                        borderRadius: '12px',
                                        border: '1px solid #DCFCE7'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <CheckCircle2 size={16} color="#166534" strokeWidth={2.5} />
                                            <p style={{ fontSize: '0.8rem', color: '#166534', margin: 0, fontWeight: '700' }}>
                                                {t.locationVerified}
                                            </p>
                                        </div>
                                        <button 
                                            onClick={() => { setLatitude(null); setLongitude(null); }}
                                            style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontSize: '0.7rem', fontWeight: '800', textDecoration: 'underline' }}
                                        >
                                            {t.change}
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: '800', fontSize: '0.7rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                                            padding: '0.5rem 1rem 0.5rem 2.5rem', 
                                            borderRadius: '10px', 
                                            border: '1px solid #E5E7EB', 
                                            fontSize: '0.85rem', 
                                            fontWeight: '500', 
                                            backgroundColor: '#F9FAFB', 
                                            outline: 'none', 
                                            cursor: 'pointer',
                                            WebkitAppearance: 'none'
                                        }}
                                        className="checkout-input-modern custom-date-input"
                                    />
                                </div>
                            </div>

                            <div style={{ marginTop: '0.4rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                    <label style={{ display: 'block', margin: 0, fontWeight: '800', fontSize: '0.7rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {t.specialNotes}
                                    </label>
                                    <span style={{ fontSize: '0.65rem', color: specialNotes.length > 130 ? '#EF4444' : '#9CA3AF', fontWeight: '800' }}>
                                        {specialNotes.length}/150
                                    </span>
                                </div>
                                <textarea
                                    placeholder={t.specialNotesPlaceholder}
                                    value={specialNotes}
                                    onChange={(e) => setSpecialNotes(e.target.value.slice(0, 150))}
                                    style={{ 
                                        width: '100%', 
                                        padding: '0.5rem 0.75rem', 
                                        borderRadius: '10px', 
                                        border: '1px solid #E5E7EB', 
                                        fontSize: '0.85rem', 
                                        fontWeight: '500', 
                                        backgroundColor: '#F9FAFB', 
                                        outline: 'none', 
                                        minHeight: '50px', 
                                        resize: 'none',
                                        fontFamily: 'inherit',
                                        transition: 'all 0.3s'
                                    }}
                                    className="checkout-input-modern"
                                />
                            </div>
                        </div>

                        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '2px dashed rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.9rem' }}>{t.subtotal}</span>
                                <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.9rem' }}>${(totalPrice - taxAmount).toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')}{locale === 'en' ? ' COP' : ''}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.9rem' }}>{t.taxes}</span>
                                <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.9rem' }}>${taxAmount.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')}{locale === 'en' ? ' COP' : ''}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
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
                                }}>${totalPrice.toLocaleString(locale === 'es' ? 'es-CO' : 'en-US')}{locale === 'en' ? ' COP' : ''}</span>
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
                                    backgroundColor: '#FFF7ED',
                                    color: '#9A3412',
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    fontSize: '0.8rem',
                                    marginBottom: '1rem',
                                    border: '1px solid #FFEDD5',
                                    textAlign: 'center'
                                }}>
                                    <p style={{ 
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        fontWeight: '900', 
                                        margin: '0 0 4px 0',
                                        fontSize: '1rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px'
                                    }}>
                                        <MapPin size={16} /> {locale === 'es' ? 'Fuera de Cobertura' : 'Out of Coverage'}
                                    </p>
                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.75rem', fontWeight: '600', opacity: 0.8 }}>
                                        {locale === 'es' ? 'B2C solo disponible en Zona Norte.' : 'B2C only available in North Zone.'} 
                                    </p>
                                    <Link href="/b2b/register" style={{ 
                                        color: 'white', 
                                        backgroundColor: '#9A3412',
                                        padding: '0.5rem 1rem',
                                        borderRadius: '10px',
                                        fontWeight: '800', 
                                        textDecoration: 'none',
                                        display: 'inline-block',
                                        fontSize: '0.75rem'
                                    }}>
                                        {locale === 'es' ? 'Registrar mi Negocio (B2B)' : 'Register my Business (B2B)'}
                                    </Link>
                                </div>
                            )}

                            <button
                                className="btn-premium"
                                style={{ 
                                    width: '100%', 
                                    padding: '1rem', 
                                    fontSize: '1.1rem', 
                                    borderRadius: '16px', 
                                    fontWeight: '900', 
                                    backgroundColor: (loading || !isMinOrderMet || !latitude || outOfZone) ? 'rgba(0,0,0,0.06)' : 'var(--primary)', 
                                    color: (loading || !isMinOrderMet || !latitude || outOfZone) ? 'rgba(0,0,0,0.3)' : 'white', 
                                    border: 'none', 
                                    cursor: (loading || !isMinOrderMet || !latitude || outOfZone) ? 'not-allowed' : 'pointer',
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
                                    <>{locale === 'es' ? 'Pagar Pedido' : 'Pay Order'} <Rocket size={20} strokeWidth={2.5} /></>
                                )}
                            </button>

                            {!latitude && address.trim().length > 3 && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem', fontWeight: '600', opacity: 0.7 }}>
                                    {locale === 'es' ? '📍 Necesitamos tu ubicación exacta para que el repartidor llegue sin problemas.' : '📍 We need your exact location so the driver can arrive without issues.'}
                                </p>
                            )}

                            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                                    <div style={{ height: '1px', flex: 1, background: 'rgba(0,0,0,0.06)' }} />
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#9CA3AF', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{locale === 'es' ? 'Pago seguro' : 'Secure Payment'}</span>
                                    <div style={{ height: '1px', flex: 1, background: 'rgba(0,0,0,0.06)' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '28px', gap: '4px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #F1F5F9', fontSize: '0.65rem', fontWeight: '800', color: '#64748B', backgroundColor: '#F8FAFC' }}>
                                        <ShieldCheck size={12} color="#10B981" /> Wompi
                                    </span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '28px', gap: '4px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #F1F5F9', fontSize: '0.65rem', fontWeight: '800', color: '#64748B', backgroundColor: '#F8FAFC' }}>
                                        <Truck size={12} color="#3B82F6" /> Contraentrega
                                    </span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '28px', gap: '4px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #F1F5F9', fontSize: '0.65rem', fontWeight: '800', color: '#64748B', backgroundColor: '#F8FAFC' }}>
                                        <LockIcon size={12} color="#8B5CF6" /> SSL
                                    </span>
                                </div>
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
        </main>
    );
}
