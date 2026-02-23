'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

function CreateOrderContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(false);

    // Data Sources
    const [clients, setClients] = useState<any[]>([]); // B2B Profiles
    const [b2cClients, setB2cClients] = useState<any[]>([]); // B2C Profiles
    const [products, setProducts] = useState<any[]>([]);

    // Form State
    const [clientType, setClientType] = useState(searchParams.get('type')?.toUpperCase() === 'B2C' ? 'B2C' : 'B2B');
    
    // B2B State
    const [selectedClient, setSelectedClient] = useState('');
    const [clientSearch, setClientSearch] = useState('');

    // B2C State
    const [b2cMode, setB2CMode] = useState<'search' | 'new'>('new');
    const [clientSearchB2C, setClientSearchB2C] = useState('');
    const [selectedClientB2C, setSelectedClientB2C] = useState('');
    const [guestInfo, setGuestInfo] = useState({ name: '', phone: '', address: '', city: 'Bogotá', email: '', nit: '' }); // For B2C New

    const [latitude, setLatitude] = useState<number | null>(null);
    const [longitude, setLongitude] = useState<number | null>(null);
    const [isGettingLocation, setIsGettingLocation] = useState(false);
    
    // Payment Method State
    const [paymentMethod, setPaymentMethod] = useState('contra_entrega');

    // Search States
    const [productSearch, setProductSearch] = useState('');

    const [originSource, setOriginSource] = useState(searchParams.get('source') || 'phone'); // phone, whatsapp, email
    const [deliveryDate, setDeliveryDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]); // Default tomorrow
    const [deliverySlot, setDeliverySlot] = useState('AM'); // AM or PM
    const [adminNotes, setAdminNotes] = useState('');

    // MODAL STATE (For Product Variants)
    const [selectedProductForModal, setSelectedProductForModal] = useState<any | null>(null);
    const [modalQuantity, setModalQuantity] = useState(1);
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

    // Cart Logic
    const [cart, setCart] = useState<{ product: any, qty: number, variant_label?: string, selected_options?: any }[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            console.log("Iniciando carga de datos Maestro...");

            // 1. Clientes B2B & B2C (Parallel Fetch)
            const fetchB2B = supabase
                .from('profiles')
                .select('id, company_name, contact_name, nit, address, contact_phone, latitude, longitude, email, city, municipality')
                .eq('role', 'b2b_client')
                .order('company_name', { ascending: true });

            const fetchB2C = supabase
                .from('profiles')
                .select('id, company_name, contact_name, nit, address, contact_phone, latitude, longitude, email, city, municipality')
                .eq('role', 'b2c_client') // Matched with Admin Drivers Core
                .order('contact_name', { ascending: true });

            const [resB2B, resB2C] = await Promise.all([fetchB2B, fetchB2C]);

            if (resB2B.error) console.error("Error B2B:", resB2B.error);
            else if (resB2B.data) setClients(resB2B.data);

            if (resB2C.error) console.error("Error B2C:", resB2C.error);
            else if (resB2C.data) setB2cClients(resB2C.data);

            // 2. Productos
            const { data: prods, error: errorProds } = await supabase
                .from('products')
                .select('id, sku, name, base_price, unit_of_measure, image_url, options_config, weight_kg')
                .eq('is_active', true)
                .order('name');

            if (errorProds) console.error("Error cargando productos:", errorProds);
            if (prods) setProducts(prods);

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
            phone: client.contact_phone || '',
            address: client.address || '',
            city: client.city || 'Bogotá',
            email: client.email || '',
            nit: client.nit || ''
        });
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

        // Check if product has variants
        if (product.options_config && Array.isArray(product.options_config) && product.options_config.length > 0) {
            setSelectedProductForModal(product);
        } else {
            addToCartDirectly(product, 1);
        }
        setProductSearch('');
    };

    const addToCartDirectly = (product: any, qty: number, variantLabel?: string, optionsRaw?: any) => {
        setCart(prev => {
            const existingIndex = prev.findIndex(item =>
                item.product.id === product.id && item.variant_label === variantLabel
            );

            if (existingIndex >= 0) {
                const newCart = [...prev];
                newCart[existingIndex].qty += qty;
                return newCart;
            } else {
                return [...prev, { product, qty, variant_label: variantLabel, selected_options: optionsRaw }];
            }
        });
    };

    const confirmModalAdd = () => {
        if (!selectedProductForModal) return;
        const optionValues = Object.values(selectedOptions).filter(v => v);
        const variantLabel = optionValues.length > 0 ? optionValues.join(', ') : undefined;
        addToCartDirectly(selectedProductForModal, modalQuantity, variantLabel, selectedOptions);
        setSelectedProductForModal(null);
    };

    const updateQty = (index: number, newQty: number) => {
        setCart(prev => prev.map((item, i) =>
            i === index ? { ...item, qty: newQty } : item
        ));
    };

    const removeFromCart = (index: number) => {
        setCart(prev => prev.filter((_, i) => i !== index));
    };

    const calculateTotal = () => {
        return cart.reduce((acc, item) => acc + (item.product.base_price * item.qty), 0);
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
        if (!navigator.geolocation) return alert('No soportado');
        setIsGettingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLatitude(pos.coords.latitude);
                setLongitude(pos.coords.longitude);
                setIsGettingLocation(false);
            },
            () => {
                setIsGettingLocation(false);
                alert('No se pudo obtener la ubicación');
            }
        );
    };
    const handleGeocode = async () => {
        if (!guestInfo.address || !guestInfo.city) {
            alert("Por favor ingrese dirección y ciudad para validar coordenadas.");
            return;
        }
        setIsGettingLocation(true);
        try {
            const query = `${guestInfo.address}, ${guestInfo.city}, Colombia`;
            const encodedQuery = encodeURIComponent(query);
            const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1`);
            const data = await response.json();

            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                setLatitude(lat);
                setLongitude(lon);
                alert(`✅ Coordenadas encontradas: ${lat}, ${lon}`);
            } else {
                alert("❌ No se encontraron coordenadas para esta dirección. Intente ser más específico (ej: Kr 15 # 85-10).");
                setLatitude(null);
                setLongitude(null);
            }
        } catch (error) {
            console.error("Geocoding error:", error);
            alert("Error al validar dirección.");
        } finally {
            setIsGettingLocation(false);
        }
    };


    const handleSubmit = async () => {
        if (clientType === 'B2B' && !selectedClient) return alert('Debes seleccionar un cliente Institucional.');
        
        // B2C Validation
        if (clientType === 'B2C') {
            if (b2cMode === 'new') {
                if (!guestInfo.name || !guestInfo.phone) return alert('Debes ingresar al menos Nombre y Teléfono para cliente nuevo.');
            } else {
                if (!selectedClientB2C) return alert('Debes buscar y seleccionar un cliente B2C existente.');
            }
        }

        if (cart.length === 0) return alert('El pedido debe tener al menos un producto');

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
                const newProfileId = crypto.randomUUID();
                
                const { error: profileError } = await supabase
                    .from('profiles')
                    .insert({
                        id: newProfileId,
                        role: 'b2c_client',
                        contact_name: guestInfo.name,
                        contact_phone: guestInfo.phone,
                        address: guestInfo.address,
                        city: guestInfo.city,
                        company_name: guestInfo.name, // Helper for search
                        latitude: latitude,
                        longitude: longitude,
                        created_at: new Date().toISOString(),
                        email: guestInfo.email || null,
                        nit: guestInfo.nit || null
                    });

                if (profileError) {
                    console.error('Error creating B2C profile:', profileError);
                    throw new Error('No se pudo guardar el cliente nuevo.');
                }

                finalProfileId = newProfileId;
                finalAdminNotes = `[CLIENTE HOGAR CREADO] ID: ${newProfileId} | Nombre: ${guestInfo.name} | CC: ${guestInfo.nit} | Tel: ${guestInfo.phone} | Email: ${guestInfo.email}\n\n${adminNotes}`;
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

            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert({
                    user_id: null,
                    profile_id: finalProfileId,
                    total: calculateTotal(),
                    status: clientType === 'B2C' ? 'pending_approval' : 'approved',
                    type: clientType === 'B2B' ? 'b2b_credit' : 'b2c',
                    origin_source: originSource,
                    delivery_date: deliveryDate,
                    delivery_slot: finalDeliverySlot,
                    admin_notes: finalAdminNotes,
                    shipping_address: shippingAddress,
                    total_weight_kg: cart.reduce((acc, item) => acc + (item.qty * (item.product.weight_kg || 0)), 0),
                    latitude: latitude,
                    longitude: longitude
                })
                .select()
                .single();

            if (orderError) throw orderError;

            const itemsData = cart.map(item => ({
                order_id: order.id,
                product_id: item.product.id,
                quantity: item.qty,
                unit_price: item.product.base_price,
                variant_label: item.variant_label,
                selected_options: item.selected_options
            }));

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(itemsData);

            if (itemsError) throw itemsError;

            alert('Pedido creado exitosamente ✅');
            router.push('/admin/orders/loading');

        } catch (e: any) {
            console.error(e);
            alert('Error creando pedido: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    // Filters & Helpers
    const filteredProducts = (!productSearch || productSearch.length < 2) ? [] : (products || []).filter(p =>
        (p.name && p.name.toLowerCase().includes(productSearch.toLowerCase())) ||
        (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
    ).slice(0, 10);

    const filteredClients = clientSearch.length < 2 ? [] : clients.filter(c =>
        (c.company_name?.toLowerCase() || '').includes(clientSearch.toLowerCase()) ||
        (c.nit?.toString() || '').includes(clientSearch) ||
        (c.contact_name?.toLowerCase() || '').includes(clientSearch.toLowerCase()) ||
        (c.address?.toLowerCase() || '').includes(clientSearch.toLowerCase()) ||
        (c.contact_phone?.toString() || '').includes(clientSearch)
    ).slice(0, 8);

    const getSelectedClientDetails = () => clients.find(c => c.id === selectedClient);

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', fontFamily: 'Inter, sans-serif' }}>
            <Navbar />
            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <Link href="/admin/orders/loading" style={{ textDecoration: 'none', color: '#6B7280', fontWeight: '600' }}>← Volver</Link>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>

                    {/* LEFT COLUMN: FORM */}
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '16px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <h1 style={{ fontSize: '1.8rem', fontWeight: '900', color: '#111827', marginBottom: '2rem' }}>📝 Nuevo Pedido Manual</h1>

                        {/* CLIENT SEGMENTATION */}
                        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', padding: '0.3rem', backgroundColor: '#F3F4F6', borderRadius: '10px' }}>
                            <button
                                onClick={() => setClientType('B2B')}
                                style={{
                                    flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none',
                                    backgroundColor: clientType === 'B2B' ? 'white' : 'transparent',
                                    color: clientType === 'B2B' ? '#111827' : '#6B7280',
                                    fontWeight: '700', cursor: 'pointer', boxShadow: clientType === 'B2B' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.2s'
                                }}
                            >
                                🏢 Institucional (B2B)
                            </button>
                            <button
                                onClick={() => setClientType('B2C')}
                                style={{
                                    flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none',
                                    backgroundColor: clientType === 'B2C' ? 'white' : 'transparent',
                                    color: clientType === 'B2C' ? '#111827' : '#6B7280',
                                    fontWeight: '700', cursor: 'pointer', boxShadow: clientType === 'B2C' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.2s'
                                }}
                            >
                                🏠 Hogar / Invitado (B2C)
                            </button>
                        </div>



                        {/* CLIENT FIELDS */}
                        <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '1px dashed #D1D5DB' }}>
                            {clientType === 'B2B' ? (
                                <div style={{ position: 'relative' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Buscar Empresa (Nombre, NIT, Dir, Tel)</label>

                                    {selectedClient ? (
                                        <div style={{
                                            padding: '0.8rem', backgroundColor: '#ECFDF5', border: '1px solid #059669', borderRadius: '8px',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: '700', color: '#065F46' }}>
                                                    {getSelectedClientDetails()?.company_name}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#047857' }}>
                                                    NIT: {getSelectedClientDetails()?.nit || 'Sin NIT'} • {getSelectedClientDetails()?.contact_name}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#065F46', marginTop: '2px' }}>
                                                    📍 {getSelectedClientDetails()?.address || 'Sin dirección'}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setSelectedClient('')}
                                                style={{ background: 'transparent', border: 'none', color: '#059669', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.2rem' }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <input
                                                type="text"
                                                placeholder="Ej: 'Calle 100' o 'Restaurante'..."
                                                value={clientSearch}
                                                onChange={(e) => setClientSearch(e.target.value)}
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                            />
                                            {filteredClients.length > 0 && (
                                                <div style={{
                                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                                                    backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '12px',
                                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', marginTop: '0.5rem', overflow: 'hidden'
                                                }}>
                                                    {filteredClients.map(c => (
                                                        <div
                                                            key={c.id}
                                                            onClick={() => selectClient(c)}
                                                            style={{
                                                                padding: '0.8rem 1rem', cursor: 'pointer', borderBottom: '1px solid #F3F4F6',
                                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                                            }}
                                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#EFF6FF'}
                                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                                                        >
                                                            <div>
                                                                <div style={{ fontWeight: '600', color: '#1F2937' }}>{c.company_name}</div>
                                                                <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                                                                    NIT: {c.nit} • 📍 {c.address}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}


                                    <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px dashed #E5E7EB', fontSize: '0.75rem', color: '#6B7280', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '1rem' }}>💡</span>
                                        <span>
                                            <strong>Nota:</strong> La carga automática de PDF está habilitada para 
                                            <span style={{ color: '#7C3AED', fontWeight: 'bold' }}> Colegio San Bartolomé</span> y 
                                            <span style={{ color: '#7C3AED', fontWeight: 'bold' }}> Hotel Estelar</span>.
                                        </span>
                                    </div>
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
                                            🔍 Buscar Cliente Existente
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
                                            ➕ Cliente Nuevo
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
                                                        </div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                                                            <div style={{ color: '#1E3A8A' }}>
                                                                <span style={{ fontWeight: '600' }}>📞 Tel:</span> {getSelectedB2CDetails()?.contact_phone || 'N/A'}
                                                            </div>
                                                            <div style={{ color: '#1E3A8A' }}>
                                                                <span style={{ fontWeight: '600' }}>🆔 CC/NIT:</span> {getSelectedB2CDetails()?.nit || 'N/A'}
                                                            </div>
                                                            <div style={{ color: '#1E3A8A', gridColumn: '1 / -1' }}>
                                                                <span style={{ fontWeight: '600' }}>📧 Email:</span> {getSelectedB2CDetails()?.email || 'N/A'}
                                                            </div>
                                                            <div style={{ color: '#1E3A8A', gridColumn: '1 / -1' }}>
                                                                <span style={{ fontWeight: '600' }}>📍 Dir:</span> {getSelectedB2CDetails()?.address || 'Sin dirección'} ({getSelectedB2CDetails()?.city || '?'})
                                                            </div>
                                                            <div style={{ gridColumn: '1 / -1', marginTop: '4px' }}>
                                                                {(getSelectedB2CDetails()?.latitude && getSelectedB2CDetails()?.longitude) ? (
                                                                    <div style={{ color: '#059669', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        ✅ Georeferenciado ({getSelectedB2CDetails()?.latitude?.toFixed(4)}, {getSelectedB2CDetails()?.longitude?.toFixed(4)})
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ color: '#DC2626', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        ⚠️ Sin Georeferenciación
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => { setSelectedClientB2C(''); setGuestInfo({ name: '', phone: '', address: '', city: 'Bogotá', email: '', nit: '' }); }}
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
                                                                fontSize: '1.2rem',
                                                                color: '#3B82F6'
                                                            }}
                                                            title="Actualizar Lista de Clientes"
                                                        >
                                                            🔄
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
                                                                            📞 {c.contact_phone} • 📍 {c.address}
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
                                                        onClick={handleGeocode}
                                                        disabled={isGettingLocation}
                                                        style={{
                                                            backgroundColor: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '0 1rem', cursor: 'pointer', fontWeight: 'bold'
                                                        }}
                                                    >
                                                        {isGettingLocation ? '...' : '📍 Validar'}
                                                    </button>
                                                </div>
                                                {latitude && longitude && (
                                                    <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '4px' }}>
                                                        ✅ Ubicación confirmada: {latitude}, {longitude}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 2. SOURCE & DELIVERY (MOVED HERE) */}
                        <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Canal</label>
                                <select
                                    value={originSource} onChange={e => setOriginSource(e.target.value)}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: '#F9FAFB' }}
                                >
                                    <option value="phone">📞 Teléfono</option>
                                    <option value="whatsapp">💬 WhatsApp</option>
                                    <option value="email">📧 Email</option>
                                    <option value="flat_file">📁 Archivo Plano</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Entrega</label>
                                <input
                                    type="date"
                                    value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                />
                            </div>
                            
                            {clientType === 'B2C' && (
                                <>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Franja</label>
                                        <select
                                            value={deliverySlot} onChange={e => setDeliverySlot(e.target.value)}
                                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                        >
                                            <option value="AM">☀️ AM</option>
                                            <option value="PM">🌙 PM</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Método de Pago</label>
                                        <select
                                            value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                        >
                                            <option value="contra_entrega">💵 Contra Entrega</option>
                                            <option value="transferencia">🏦 Transferencia Anticipada</option>
                                            <option value="wompi">💳 Wompi (Link de Pago)</option>
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* PDF UPLOAD FOR SPECIFIC B2B CLIENTS */}
                        {clientType === 'B2B' && selectedClient && getSelectedClientDetails() && (
                            ['San Bartolomé', 'Hotel Estelar'].some(keyword => getSelectedClientDetails()?.company_name?.includes(keyword))
                        ) && originSource !== 'flat_file' && (
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
                                <div style={{ fontSize: '2rem' }}>📄</div>
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
                                    onClick={() => alert('¡Funcionalidad lista para implementar con el PDF de ejemplo!')}
                                >
                                    Subir PDF
                                </button>
                            </div>
                        )}

                        {originSource === 'flat_file' ? (
                            <div style={{ 
                                padding: '3rem', 
                                border: '2px dashed #3B82F6', 
                                borderRadius: '12px', 
                                backgroundColor: '#EFF6FF',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#DBEAFE'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#EFF6FF'}
                            onClick={() => alert('Funcionalidad de carga de archivo plano en desarrollo...')}
                            >
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#1E40AF', marginBottom: '0.5rem' }}>
                                    Cargar Archivo Plano (CSV / Excel)
                                </h3>
                                <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>
                                    Arrastra tu archivo aquí o haz clic para seleccionarlo
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* 2. PRODUCT SEARCH */}
                                <div style={{ marginBottom: '2rem', position: 'relative' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>Agregar Productos</label>
                                    <input
                                        type="text"
                                        placeholder="Escribe para buscar (ej: Tomate)..."
                                        value={productSearch} onChange={e => setProductSearch(e.target.value)}
                                        style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '2px solid #3B82F6', fontSize: '1.1rem' }}
                                    />

                                    {filteredProducts.length > 0 && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                                            backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '12px',
                                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', marginTop: '0.5rem', overflow: 'hidden'
                                        }}>
                                            {filteredProducts.map(p => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => handleProductClick(p)}
                                                    style={{
                                                        padding: '0.8rem 1rem', cursor: 'pointer', borderBottom: '1px solid #F3F4F6',
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#EFF6FF'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                                                >
                                                    <span style={{ fontWeight: '600' }}>{p.name} {p.sku && <span style={{fontSize: '0.8em', color: '#6B7280'}}>({p.sku})</span>}</span>
                                                    <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                                                        ${p.base_price}/{p.unit_of_measure}
                                                        {p.options_config?.length > 0 && <span style={{ marginLeft: '6px', fontSize: '0.7em', backgroundColor: '#FEF3C7', color: '#D97706', padding: '2px 4px', borderRadius: '4px' }}>⚙️ Opciones</span>}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* 3. CART LIST WITH IMPROVED STEPPER */}
                        <div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1rem' }}>Detalle del Pedido</h3>
                            {cart.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: '#F9FAFB', borderRadius: '12px', color: '#9CA3AF', border: '2px dashed #E5E7EB' }}>
                                    No hay productos agregados.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                    {cart.map((item, idx) => (
                                        <div key={`${item.product.id}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.8rem', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: '700' }}>
                                                    {item.product.name}
                                                    {item.variant_label && (
                                                        <span style={{ fontWeight: '400', color: '#6B7280', fontSize: '0.9em', marginLeft: '6px' }}>
                                                            ({item.variant_label})
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>${item.product.base_price.toLocaleString()} x {item.product.unit_of_measure}</div>
                                            </div>

                                            {/* STEPPER CONTROL */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #D1D5DB', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'white' }}>
                                                    <button
                                                        onClick={() => updateQty(idx, Math.max(0.5, item.qty - 0.5))}
                                                        style={{ width: '32px', height: '32px', border: 'none', borderRight: '1px solid #D1D5DB', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}
                                                    >−</button>
                                                    <input
                                                        type="number"
                                                        value={item.qty}
                                                        min="0.5" step="0.5"
                                                        onChange={(e) => updateQty(idx, parseFloat(e.target.value) || 0)}
                                                        style={{ width: '50px', height: '32px', border: 'none', textAlign: 'center', fontWeight: 'bold', fontSize: '1rem', outline: 'none' }}
                                                    />
                                                    <button
                                                        onClick={() => updateQty(idx, item.qty + 0.5)}
                                                        style={{ width: '32px', height: '32px', border: 'none', borderLeft: '1px solid #D1D5DB', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}
                                                    >+</button>
                                                </div>

                                                <button
                                                    onClick={() => removeFromCart(idx)}
                                                    style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', backgroundColor: '#FEE2E2', color: '#B91C1C', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '0.5rem' }}
                                                    title="Eliminar item"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                    ))}
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
                                <span>${calculateTotal().toLocaleString()}</span>
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
                                Al confirmar, el pedido entrará automáticamente en estado &quot;Aprobado&quot; y se sumará a la demanda de compras.
                            </p>
                        </div>
                    </div>

                </div>
            </div>

            {/* --- VARIANT SELECTION MODAL --- */}
            {selectedProductForModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, backdropFilter: 'blur(3px)'
                }} onClick={() => setSelectedProductForModal(null)}>

                    <div
                        style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '16px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', textAlign: 'center' }}
                        onClick={e => e.stopPropagation()} // Prevent close
                    >
                        {selectedProductForModal.image_url && (
                            <img
                                src={selectedProductForModal.image_url}
                                style={{ width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover', marginBottom: '1rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
                            />
                        )}
                        <h3 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '0.5rem' }}>{selectedProductForModal.name}</h3>
                        <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Personaliza tu producto:</p>

                        {/* RENDER OPTIONS DYNAMICALLY */}
                        {selectedProductForModal.options_config && selectedProductForModal.options_config.map((opt: any) => (
                            <div key={opt.name} style={{ marginBottom: '1rem', textAlign: 'left' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#4B5563', marginBottom: '0.3rem', textTransform: 'uppercase' }}>
                                    {opt.name}
                                </label>
                                <select
                                    value={selectedOptions[opt.name] || ''}
                                    onChange={(e) => setSelectedOptions(prev => ({ ...prev, [opt.name]: e.target.value }))}
                                    style={{ width: '100%', padding: '0.7rem', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '0.95rem', backgroundColor: '#F9FAFB' }}
                                >
                                    <option value="">Seleccionar {opt.name}...</option>
                                    {opt.values?.map((val: string) => (
                                        <option key={val} value={val}>{val}</option>
                                    ))}
                                </select>
                            </div>
                        ))}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', margin: '2rem 0' }}>
                            <button
                                onClick={() => setModalQuantity(Math.max(1, modalQuantity - 1))}
                                style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #D1D5DB', backgroundColor: 'white', fontSize: '1.2rem', cursor: 'pointer' }}
                            >−</button>
                            <span style={{ fontSize: '1.4rem', fontWeight: '800', minWidth: '60px' }}>
                                {modalQuantity} {selectedProductForModal.unit_of_measure}
                            </span>
                            <button
                                onClick={() => setModalQuantity(modalQuantity + 1)}
                                style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', backgroundColor: '#10B981', color: 'white', fontSize: '1.2rem', cursor: 'pointer' }}
                            >+</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <button
                                onClick={() => setSelectedProductForModal(null)}
                                style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: 'white', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmModalAdd}
                                style={{ padding: '0.8rem', borderRadius: '8px', border: 'none', backgroundColor: '#059669', color: 'white', fontWeight: '700', cursor: 'pointer' }}
                            >
                                Agregar
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
