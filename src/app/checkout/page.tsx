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

            <div className="container" style={{ padding: '4rem 1rem', display: 'grid', gridTemplateColumns: '1fr 400px', gap: '4rem' }}>

                {/* LEFT COLUMN: LIST */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <h1 className="section-title" style={{ textAlign: 'left', margin: 0 }}>Resumen de Compra</h1>
                        {items.length > 0 && (
                            <button
                                onClick={() => {
                                    clearCart();
                                    router.push('/');
                                }}
                                style={{
                                    backgroundColor: '#F3F4F6',
                                    color: '#6B7280',
                                    border: 'none',
                                    padding: '0.6rem 1.2rem',
                                    borderRadius: '12px',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E5E7EB'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                            >
                                🗑️ Vaciar Carrito
                            </button>
                        )}
                    </div>

                    {items.length === 0 ? (
                        <p>Tu carrito está vacío.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {items.map((item) => (
                                <div key={`${item.id}-${item.name}`} style={{
                                    backgroundColor: 'white',
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    border: '1px solid #E5E7EB',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <h4 style={{ fontWeight: '600' }}>{item.name}</h4>
                                        <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>
                                            ${item.price.toLocaleString('es-CO')} x {item.quantity}
                                        </p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <p style={{ fontWeight: '700', color: '#0F172A' }}>
                                            ${(item.price * item.quantity).toLocaleString('es-CO')}
                                        </p>
                                        <button
                                            onClick={() => removeItem(item.id, item.name)}
                                            style={{ color: '#EF4444', fontSize: '0.8rem', background: 'none', border: 'none', cursor: 'pointer', marginTop: '0.5rem' }}
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: FORM & TOTAL */}
                <div>
                    <div style={{
                        backgroundColor: 'white',
                        padding: '2.5rem',
                        borderRadius: '24px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        position: 'sticky',
                        top: '100px',
                        border: '1px solid #E5E7EB'
                    }}>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: '900', marginBottom: '2rem', color: '#1E293B', borderBottom: '2px solid #F3F4F6', paddingBottom: '0.5rem' }}>Finalizar Pedido</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '700', fontSize: '0.9rem', color: '#374151' }}>Nombre Completo</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Juan Pérez"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '1rem' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '700', fontSize: '0.9rem', color: '#374151' }}>WhatsApp / Celular</label>
                                    <input
                                        type="tel"
                                        placeholder="300 123 4567"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '1rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '700', fontSize: '0.9rem', color: '#374151' }}>Email</label>
                                    <input
                                        type="email"
                                        placeholder="cliente@correo.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '1rem' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '700', fontSize: '0.9rem', color: '#374151' }}>Dirección de Entrega (Incluye Apto/Torre)</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Calle 158 # 93-37, Apto 310"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '1rem', marginBottom: '0.5rem' }}
                                />

                                {/* GPS Capture Flow: Prominent button appears only after address is typed */}
                                {address.trim().length > 3 && !latitude && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                        <button 
                                            onClick={handleGetLocation}
                                            type="button"
                                            style={{ 
                                                width: '100%',
                                                fontSize: '0.85rem', 
                                                background: '#EFF6FF', 
                                                color: '#2563EB', 
                                                border: '1px dashed #BFDBFE', 
                                                padding: '0.8rem', 
                                                borderRadius: '12px', 
                                                cursor: 'pointer',
                                                fontWeight: '700',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px',
                                                transition: 'all 0.2s'
                                            }}
                                            disabled={isGettingLocation}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#DBEAFE'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = '#EFF6FF'}
                                        >
                                            {isGettingLocation ? '⌛ Obteniendo...' : '📍 Estoy en el sitio (Usar GPS)'}
                                        </button>

                                        <button 
                                            onClick={() => setShowMapPicker(true)}
                                            type="button"
                                            style={{ 
                                                width: '100%',
                                                fontSize: '0.85rem', 
                                                background: '#F8FAFC', 
                                                color: '#64748B', 
                                                border: '1px solid #E2E8F0', 
                                                padding: '0.8rem', 
                                                borderRadius: '12px', 
                                                cursor: 'pointer',
                                                fontWeight: '700',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px'
                                            }}
                                        >
                                            🗺️ No estoy en el sitio (Elegir en Mapa)
                                        </button>
                                    </div>
                                )}

                                {latitude && (
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between',
                                        gap: '8px', 
                                        backgroundColor: '#DCFCE7', 
                                        padding: '0.6rem 1rem', 
                                        borderRadius: '12px',
                                        border: '1px solid #BBF7D0'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '1.2rem' }}>✅</span>
                                            <p style={{ fontSize: '0.8rem', color: '#166534', margin: 0, fontWeight: '600' }}>
                                                Punto de entrega vinculado
                                            </p>
                                        </div>
                                        <button 
                                            onClick={() => { setLatitude(null); setLongitude(null); }}
                                            style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}
                                        >
                                            Cambiar
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '700', fontSize: '0.9rem', color: '#374151' }}>Fecha Programada</label>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    min={minDeliveryDate}
                                    style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '1rem' }}
                                />
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '2px dashed #F3F4F6' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ color: '#6B7280', fontWeight: '500' }}>Subtotal</span>
                                <span style={{ fontWeight: '600' }}>${totalPrice.toLocaleString('es-CO')}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <span style={{ fontSize: '1.3rem', fontWeight: '900', color: '#1E293B' }}>Total</span>
                                <span style={{ fontSize: '1.6rem', fontWeight: '900', color: '#059669' }}>${totalPrice.toLocaleString('es-CO')}</span>
                            </div>

                            {!isMinOrderMet && (
                                <div style={{
                                    backgroundColor: '#FEF2F2',
                                    color: '#991B1B',
                                    padding: '0.8rem',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem',
                                    marginBottom: '1.5rem',
                                    border: '1px solid #FECACA',
                                    textAlign: 'center',
                                    fontWeight: '600'
                                }}>
                                    ⚠️ No has alcanzado el pedido mínimo de ${minOrder.toLocaleString('es-CO')}
                                </div>
                            )}

                            {outOfZone && latitude && (
                                <div style={{
                                    backgroundColor: '#FFF7ED',
                                    color: '#9A3412',
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    fontSize: '0.85rem',
                                    marginBottom: '1.5rem',
                                    border: '1px solid #FFEDD5',
                                    textAlign: 'center'
                                }}>
                                    <p style={{ fontWeight: '900', margin: '0 0 8px 0' }}>📍 Zona de Cobertura Limitada</p>
                                    <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem' }}>Las entregas B2C están limitadas a la Zona Norte. ¿Eres un comercio o estás en el sur?</p>
                                    <Link href="/register" style={{ color: '#C2410C', fontWeight: '900', textDecoration: 'underline' }}>
                                        Regístrate como Cliente B2B aquí
                                    </Link>
                                </div>
                            )}

                            <button
                                className="btn btn-primary"
                                style={{ 
                                    width: '100%', 
                                    padding: '1.2rem', 
                                    fontSize: '1.2rem', 
                                    borderRadius: '14px', 
                                    fontWeight: '900', 
                                    backgroundColor: (loading || !isMinOrderMet || !latitude || outOfZone) ? '#94A3B8' : '#059669', 
                                    color: 'white', 
                                    border: 'none', 
                                    cursor: (loading || !isMinOrderMet || !latitude || outOfZone) ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.3s ease'
                                }}
                                disabled={loading || !isMinOrderMet || !latitude || outOfZone}
                                onClick={handleSubmit}
                            >
                                {loading ? '🚀 Procesando...' : !latitude ? '📍 Vincula GPS para Pagar' : outOfZone ? 'Zona No Soportada' : '💳 Pagar Seguro'}
                            </button>

                            {!latitude && address.trim().length > 3 && (
                                <p style={{ fontSize: '0.75rem', color: '#64748B', textAlign: 'center', marginTop: '0.8rem', fontWeight: '500' }}>
                                    * Es obligatorio vincular tu ubicación GPS para habilitar el pago.
                                </p>
                            )}

                            <div style={{ marginTop: '1.2rem', textAlign: 'center' }}>
                                <img src="https://wompi.com/assets/img/logos-pagos.png" alt="Medios de pago aceptados: Tarjetas, PSE y Corresponsales" style={{ height: '24px', opacity: 0.6, filter: 'grayscale(1)' }} />
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* MAP PICKER MODAL */}
            {showMapPicker && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 999, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: '2rem'
                }}>
                    <div style={{
                        width: '100%', maxWidth: '900px', height: '80vh', backgroundColor: 'white',
                        borderRadius: '24px', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column'
                    }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontWeight: '900' }}>🗺️ Selecciona ubicación de entrega</h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>Mueve el mapa para que el marcador quede exacto en tu puerta.</p>
                            </div>
                            <button 
                                onClick={() => setShowMapPicker(false)}
                                style={{ background: '#F1F5F9', border: 'none', padding: '0.5rem 1rem', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                Cerrar
                            </button>
                        </div>
                        
                        <div style={{ flex: 1, position: 'relative' }}>
                            <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
                                <Map
                                    defaultCenter={{ lat: 4.6097, lng: -74.0817 }} // Bogota
                                    defaultZoom={13}
                                    mapId="DEMO_MAP_ID"
                                    onCenterChanged={(e) => {
                                        // Update coords as map moves
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
                                        pointerEvents: 'none', fontSize: '2.5rem'
                                    }}>
                                        📍
                                    </div>
                                </Map>
                            </APIProvider>
                        </div>

                        <div style={{ padding: '1.5rem', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button 
                                onClick={() => setShowMapPicker(false)}
                                className="btn btn-primary"
                                style={{ padding: '1rem 2.5rem', borderRadius: '14px', fontWeight: '900' }}
                            >
                                Confirmar este punto
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
