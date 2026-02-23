'use client';

import { useState, useEffect } from 'react';
import { useCart } from '../../lib/cartContext';
import Navbar from '../../components/Navbar';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { APIProvider, Map } from '@vis.gl/react-google-maps';
import { isAbortError } from '../../lib/errorUtils';
import { isInsidePolygon, Point } from '../../lib/geoUtils';
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
    X
} from 'lucide-react';

export default function CheckoutPage() {
    const { items, totalPrice, removeItem, clearCart } = useCart();
    const [name, setName] = useState('');
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
            return alert('Tu navegador no soporta geolocalización.');
        }

        setIsGettingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLatitude(position.coords.latitude);
                setLongitude(position.coords.longitude);
                setIsGettingLocation(false);
                alert('📍 Ubicación capturada con éxito. Ahora tu entrega será más precisa.');
            },
            (error) => {
                console.error('Error getting location:', error);
                setIsGettingLocation(false);
                alert('No pudimos obtener tu ubicación. Por favor asegúrate de dar permisos en tu navegador.');
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
                    .single();

                const cutoffEnabled = cutoffData?.value !== 'false';
                
                const now = new Date();
                const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
                const bogotaNow = new Date(utc + (3600000 * -5));
                const currentHour = bogotaNow.getHours();

                let daysToAdd = 1;
                if (cutoffEnabled && currentHour >= 17) {
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
            return alert('Hubo un problema con la fecha. Se ha corregido, por favor intenta de nuevo.');
        }

        if (items.length === 0) return alert('Tu carrito está vacío.');
        if (!name) return alert('Por favor ingresa tu Nombre Completo.');
        if (!phone) return alert('Por favor ingresa tu Número de Celular.');
        if (!email) return alert('Por favor ingresa tu Email.');
        if (!address) return alert('Por favor ingresa la Dirección de Entrega.');
        if (!isMinOrderMet) return alert(`El pedido mínimo es de $${minOrder.toLocaleString('es-CO')}.`);
        if (outOfZone) return alert('📍 Lo sentimos, aún no llegamos a tu ubicación para entregas B2C. Te invitamos a registrarte como Cliente Institucional (B2B) para entregas en toda la Sabana.');

        setLoading(true);

        try {
            console.log('1️⃣ Creating order record...');
            
            // Sanitize coordinates to ensure they fit DECIMAL(10,8)
            const safeLat = latitude ? parseFloat(latitude.toFixed(8)) : null;
            const safeLng = longitude ? parseFloat(longitude.toFixed(8)) : null;

            // Create a Promise race to handle potential Supabase client hangs
            const insertOrderPromise = supabase
                .from('orders')
                .insert({
                    type: 'b2c_wompi',
                    status: 'pending_approval',
                    origin_source: 'web',
                    delivery_date: date,
                    shipping_address: address,
                    customer_name: name,
                    customer_email: email,
                    customer_phone: phone,
                    subtotal: totalPrice,
                    total: totalPrice,
                    latitude: safeLat,
                    longitude: safeLng,
                })
                .select()
                .single();

            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('La conexión está tardando demasiado (Timeout 60s). Verifica tu internet.')), 60000)
            );

            // Execute race
            const result = await Promise.race([insertOrderPromise, timeoutPromise]) as { 
                data: { id: string } | null, 
                error: { message: string } | null 
            };
            const { data: orderData, error: orderError } = result;

            if (orderError) {
                console.error('❌ Error insertando pedido:', orderError);
                throw new Error(`Error al crear el pedido: ${orderError.message}`);
            }

            if (!orderData) throw new Error('No se recibió confirmación del pedido.');
            console.log('✅ Pedido creado:', orderData.id);

            // 2. Create Order Items
            console.log('2️⃣ Creating order items with items:', items.length);
            const orderItemsData = items.map(item => ({
                order_id: orderData.id,
                product_id: (item as { id: string }).id,
                quantity: item.quantity,
                unit_price: item.price,
                ...(item.variant_label && { variant_label: item.variant_label }),
                ...(item.selected_options && { selected_options: item.selected_options })
            }));

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItemsData);

            if (itemsError) throw new Error(`Database Error (Items): ${itemsError.message}`);

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
            
            let userMsg = 'Error al procesar el pedido.';
            
            if (isAbortError(err)) {
                 userMsg = 'La conexión tardó demasiado (Timeout). Por favor verifica tu internet e intenta de nuevo.';
            } else if (err instanceof Error) {
                userMsg = err.message;
            }
            
            alert(userMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
            <Navbar />

            <div className="container mobile-stack" style={{ padding: '4rem 1rem', display: 'grid', gridTemplateColumns: '1fr 400px', gap: '4rem' }}>

                {/* LEFT COLUMN: LIST */}
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        marginBottom: '2.5rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.7)',
                        padding: '1.25rem 2rem',
                        borderRadius: '24px',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255, 255, 255, 0.5)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.05)'
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
                            <ShoppingCart size={28} strokeWidth={2.5} color="var(--primary)" /> Resumen de Compra
                        </h1>
                        {items.length > 0 && (
                            <button
                                onClick={() => {
                                    clearCart();
                                    router.push('/');
                                }}
                                className="btn-glass"
                                style={{
                                    padding: '0.6rem 1.2rem',
                                    borderRadius: 'var(--radius-full)',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.6rem',
                                    color: '#6B7280',
                                    fontWeight: '800',
                                    cursor: 'pointer'
                                }}
                            >
                                <Trash2 size={16} /> Vaciar Carrito
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
                            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: '500' }}>Tu carrito está vacío.</p>
                            <Link href="/" className="btn-premium" style={{ display: 'inline-flex', marginTop: '1.5rem', padding: '0.8rem 2rem' }}>
                                Explorar Productos
                            </Link>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {items.map((item) => (
                                <div key={`${item.id}-${item.name}`} style={{
                                    backgroundColor: 'white',
                                    padding: '1.25rem 1.75rem',
                                    borderRadius: '24px',
                                    border: '1px solid var(--border)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                                }}
                                className="cart-item-card"
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div>
                                            <h4 style={{ 
                                                fontFamily: 'var(--font-outfit), sans-serif',
                                                fontSize: '1.15rem',
                                                fontWeight: '800', 
                                                margin: '0 0 0.25rem 0',
                                                color: 'var(--text-main)',
                                                letterSpacing: '-0.02em'
                                            }}>{item.name}</h4>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ 
                                                    color: 'var(--primary)', 
                                                    fontSize: '0.9rem', 
                                                    fontWeight: '700',
                                                    backgroundColor: 'rgba(26, 77, 46, 0.05)',
                                                    padding: '2px 10px',
                                                    borderRadius: '8px'
                                                }}>
                                                    ${item.price.toLocaleString('es-CO')}
                                                </span>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: '600' }}>
                                                    Cantidad: {item.quantity}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <p style={{ 
                                            fontFamily: 'var(--font-outfit), sans-serif',
                                            fontSize: '1.25rem',
                                            fontWeight: '900', 
                                            color: 'var(--text-main)',
                                            margin: 0,
                                            letterSpacing: '-0.02em'
                                        }}>
                                            ${(item.price * item.quantity).toLocaleString('es-CO')}
                                        </p>
                                        <button
                                            onClick={() => removeItem(item.id, item.name)}
                                            style={{ 
                                                color: '#EF4444', 
                                                fontSize: '0.85rem', 
                                                background: 'none', 
                                                border: 'none', 
                                                cursor: 'pointer', 
                                                marginTop: '0.6rem',
                                                fontWeight: '700',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                marginLeft: 'auto'
                                            }}
                                        >
                                            <Trash2 size={14} /> Eliminar
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
                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                        backdropFilter: 'blur(20px)',
                        padding: '2.5rem',
                        borderRadius: '32px',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
                        position: 'sticky',
                        top: '100px',
                        border: '1px solid rgba(255, 255, 255, 0.5)'
                    }}>
                        <h3 style={{ 
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontSize: '1.6rem', 
                            fontWeight: '900', 
                            marginBottom: '2rem', 
                            color: 'var(--text-main)', 
                            borderBottom: '2px solid rgba(0,0,0,0.05)', 
                            paddingBottom: '0.75rem',
                            letterSpacing: '-0.02em',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}>
                            <CreditCard size={24} color="var(--primary)" strokeWidth={2.5} /> Detalle de Entrega
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.6rem', fontWeight: '800', fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Nombre Completo
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', opacity: 0.5 }}>
                                        <User size={18} />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Juan Pérez"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        style={{ width: '100%', padding: '0.85rem 1rem 0.85rem 2.8rem', borderRadius: '16px', border: '1px solid var(--border)', fontSize: '1rem', fontWeight: '500', backgroundColor: 'rgba(255,255,255,0.5)', outline: 'none' }}
                                        className="checkout-input"
                                    />
                                </div>
                            </div>

                            <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.6rem', fontWeight: '800', fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        WhatsApp
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', opacity: 0.5 }}>
                                            <Phone size={18} />
                                        </div>
                                        <input
                                            type="tel"
                                            placeholder="300 123 4567"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            style={{ width: '100%', padding: '0.85rem 1rem 0.85rem 2.8rem', borderRadius: '16px', border: '1px solid var(--border)', fontSize: '1rem', fontWeight: '500', backgroundColor: 'rgba(255,255,255,0.5)', outline: 'none' }}
                                            className="checkout-input"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.6rem', fontWeight: '800', fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Email
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', opacity: 0.5 }}>
                                            <Mail size={18} />
                                        </div>
                                        <input
                                            type="email"
                                            placeholder="cliente@correo.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            style={{ width: '100%', padding: '0.85rem 1rem 0.85rem 2.8rem', borderRadius: '16px', border: '1px solid var(--border)', fontSize: '1rem', fontWeight: '500', backgroundColor: 'rgba(255,255,255,0.5)', outline: 'none' }}
                                            className="checkout-input"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.6rem', fontWeight: '800', fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Dirección de Entrega
                                </label>
                                <div style={{ position: 'relative', marginBottom: '1rem' }}>
                                    <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', opacity: 0.5 }}>
                                        <MapPin size={18} />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Ej: Calle 158 # 93-37, Apto 310"
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                        style={{ width: '100%', padding: '0.85rem 1rem 0.85rem 2.8rem', borderRadius: '16px', border: '1px solid var(--border)', fontSize: '1rem', fontWeight: '500', backgroundColor: 'rgba(255,255,255,0.5)', outline: 'none' }}
                                        className="checkout-input"
                                    />
                                </div>

                                {/* GPS Capture Flow */}
                                {address.trim().length > 3 && !latitude && (
                                    <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '0.5rem' }}>
                                        <button
                                            onClick={handleGetLocation}
                                            type="button"
                                            className="btn-glass"
                                            style={{ 
                                                fontSize: '0.8rem', 
                                                background: 'rgba(37, 99, 235, 0.05)', 
                                                color: '#2563EB', 
                                                border: '1px solid rgba(37, 99, 235, 0.2)', 
                                                padding: '0.8rem', 
                                                borderRadius: '14px', 
                                                cursor: 'pointer',
                                                fontWeight: '800',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px',
                                            }}
                                            disabled={isGettingLocation}
                                        >
                                            {isGettingLocation ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
                                            Usar GPS
                                        </button>

                                        <button 
                                            onClick={() => setShowMapPicker(true)}
                                            type="button"
                                            className="btn-glass"
                                            style={{ 
                                                fontSize: '0.8rem', 
                                                background: 'rgba(0,0,0,0.03)', 
                                                color: 'var(--text-main)', 
                                                border: '1px solid rgba(0,0,0,0.1)', 
                                                padding: '0.8rem', 
                                                borderRadius: '14px', 
                                                cursor: 'pointer',
                                                fontWeight: '800',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px'
                                            }}
                                        >
                                            <MapIcon size={16} /> Mapa
                                        </button>
                                    </div>
                                )}

                                {latitude && (
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between',
                                        gap: '8px', 
                                        backgroundColor: 'rgba(22, 101, 52, 0.08)', 
                                        padding: '0.75rem 1.25rem', 
                                        borderRadius: '16px',
                                        border: '1px solid rgba(22, 101, 52, 0.2)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <CheckCircle2 size={18} color="#166534" strokeWidth={2.5} />
                                            <p style={{ fontSize: '0.85rem', color: '#166534', margin: 0, fontWeight: '700' }}>
                                                Ubicación vinculada
                                            </p>
                                        </div>
                                        <button 
                                            onClick={() => { setLatitude(null); setLongitude(null); }}
                                            style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '800', textDecoration: 'underline' }}
                                        >
                                            Cambiar
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.6rem', fontWeight: '800', fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Fecha de Entrega
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', opacity: 0.5 }}>
                                        <Calendar size={18} />
                                    </div>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        min={minDeliveryDate}
                                        style={{ width: '100%', padding: '0.85rem 1rem 0.85rem 2.8rem', borderRadius: '16px', border: '1px solid var(--border)', fontSize: '1rem', fontWeight: '600', color: 'var(--text-main)', backgroundColor: 'rgba(255,255,255,0.5)', outline: 'none' }}
                                        className="checkout-input"
                                    />
                                </div>
                            </div>
                        </div>

                        <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '2px dashed rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.95rem' }}>Subtotal</span>
                                <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>${totalPrice.toLocaleString('es-CO')}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2rem' }}>
                                <span style={{ 
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    fontSize: '1.4rem', 
                                    fontWeight: '900', 
                                    color: 'var(--text-main)',
                                    letterSpacing: '-0.02em'
                                }}>Total de compra</span>
                                <span style={{ 
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    fontSize: '2rem', 
                                    fontWeight: '900', 
                                    color: 'var(--primary)',
                                    letterSpacing: '-0.04em'
                                }}>${totalPrice.toLocaleString('es-CO')}</span>
                            </div>

                            {!isMinOrderMet && (
                                <div style={{
                                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                    color: '#B91C1C',
                                    padding: '1rem',
                                    borderRadius: '16px',
                                    fontSize: '0.85rem',
                                    marginBottom: '1.5rem',
                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                    textAlign: 'center',
                                    fontWeight: '700',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px'
                                }}>
                                    <AlertCircle size={18} /> Mínimo pedido: ${minOrder.toLocaleString('es-CO')}
                                </div>
                            )}

                            {outOfZone && latitude && (
                                <div style={{
                                    backgroundColor: 'rgba(249, 115, 22, 0.08)',
                                    color: '#C2410C',
                                    padding: '1.25rem',
                                    borderRadius: '20px',
                                    fontSize: '0.85rem',
                                    marginBottom: '1.5rem',
                                    border: '1px solid rgba(249, 115, 22, 0.2)',
                                    textAlign: 'center'
                                }}>
                                    <p style={{ 
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        fontWeight: '900', 
                                        margin: '0 0 8px 0',
                                        fontSize: '1.1rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px'
                                    }}>
                                        <MapPin size={18} /> Fuera de Cobertura
                                    </p>
                                    <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: '600', opacity: 0.8 }}>
                                        B2C solo disponible en Zona Norte. 
                                    </p>
                                    <Link href="/b2b/register" style={{ 
                                        color: 'white', 
                                        backgroundColor: '#C2410C',
                                        padding: '0.6rem 1.2rem',
                                        borderRadius: 'var(--radius-full)',
                                        fontWeight: '800', 
                                        textDecoration: 'none',
                                        display: 'inline-block',
                                        fontSize: '0.8rem'
                                    }}>
                                        Registrar mi Negocio (B2B)
                                    </Link>
                                </div>
                            )}

                            <button
                                className="btn-premium"
                                style={{ 
                                    width: '100%', 
                                    padding: '1.25rem', 
                                    fontSize: '1.3rem', 
                                    borderRadius: 'var(--radius-full)', 
                                    fontWeight: '900', 
                                    backgroundColor: (loading || !isMinOrderMet || !latitude || outOfZone) ? 'rgba(0,0,0,0.1)' : 'var(--primary)', 
                                    color: (loading || !isMinOrderMet || !latitude || outOfZone) ? 'rgba(0,0,0,0.3)' : 'white', 
                                    border: 'none', 
                                    cursor: (loading || !isMinOrderMet || !latitude || outOfZone) ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '12px',
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    boxShadow: (loading || !isMinOrderMet || !latitude || outOfZone) ? 'none' : '0 10px 30px rgba(26, 77, 46, 0.2)'
                                }}
                                disabled={loading || !isMinOrderMet || !latitude || outOfZone}
                                onClick={handleSubmit}
                            >
                                {loading ? (
                                    <>Procesando <Loader2 size={24} className="animate-spin" /></>
                                ) : !latitude ? (
                                    <>Vincular GPS para Pagar <MapPin size={24} strokeWidth={2.5} /></>
                                ) : outOfZone ? (
                                    <>Zona No Soportada <MapPin size={24} /></>
                                ) : (
                                    <>Pagar Pedido Seguro <Rocket size={24} strokeWidth={2.5} /></>
                                )}
                            </button>

                            {!latitude && address.trim().length > 3 && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem', fontWeight: '600', opacity: 0.7 }}>
                                    * Capturar tu ubicación GPS es obligatorio.
                                </p>
                            )}

                            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                                <p style={{ 
                                    fontSize: '0.85rem', 
                                    fontWeight: '700', 
                                    color: 'var(--text-muted)', 
                                    marginBottom: '0.75rem',
                                    fontFamily: 'var(--font-outfit), sans-serif'
                                }}>
                                    Pago seguro 💳 Wompi o Contraentrega
                                </p>
                                <div style={{ display: 'flex', justifyContent: 'center', opacity: 0.5, filter: 'grayscale(1)' }}>
                                    <img 
                                        src="https://cdn.wompi.co/assets/img/logos-pagos.png" 
                                        alt="Medios de pago" 
                                        style={{ height: '20px' }} 
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
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
                                    <MapPin size={24} color="var(--primary)" /> Selecciona tu Ubicación
                                </h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>Mueve el mapa para centrar el marcador en tu puerta.</p>
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
                                <X size={18} /> Cerrar
                            </button>
                        </div>
                        
                        <div style={{ flex: 1, position: 'relative' }}>
                            <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
                                <Map
                                    defaultCenter={{ lat: 4.6097, lng: -74.0817 }} // Bogota
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
                            </APIProvider>
                        </div>

                        <div style={{ padding: '1.5rem 2rem', backgroundColor: '#F9FAFB', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '2rem', borderTop: '1px solid var(--border)' }}>
                            <div style={{ marginRight: 'auto' }}>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coordenadas Detectadas</p>
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
                                <CheckCircle2 size={20} /> Confirmar Ubicación
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
