'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function CreateQuotePage() {
    // FORM STATE
    const [clientName, setClientName] = useState('');
    const [selectedClientId, setSelectedClientId] = useState('');
    const [selectedModelId, setSelectedModelId] = useState('');
    const [items, setItems] = useState<any[]>([]);

    // DATA STATE
    const [clients, setClients] = useState<any[]>([]);
    const [models, setModels] = useState<any[]>([]);
    const [rules, setRules] = useState<any[]>([]); 
    const [clientSearch, setClientSearch] = useState('');
    const [showClientResults, setShowClientResults] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [nicknames, setNicknames] = useState<any[]>([]);
    const [conversions, setConversions] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [quoteNumber, setQuoteNumber] = useState<string | null>(null);

    // MODAL STATE FOR NEW CLIENT
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [newClient, setNewClient] = useState({
        company_name: '',
        contact_name: '',
        nit: '',
        phone: '',
        address: '',
        role: 'b2b_client' as 'b2b_client' | 'b2c_client',
        pricing_model_id: ''
    });

    // BRANDING & SETTINGS
    const [appSettings, setAppSettings] = useState<Record<string, string>>({
        provider_nit: '900.000.000-0',
        provider_legal_name: '',
        provider_logo_url: '',
        app_name: 'FruFresco',
        app_logo_url: '',
        primary_color: '#111827',
        secondary_color: '#6B7280'
    });

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        const { data: sData } = await supabase.from('app_settings').select('*');
        if (sData) {
            const settingsMap: Record<string, string> = {};
            sData.forEach((s: any) => { settingsMap[s.key] = s.value; });
            setAppSettings(prev => ({ ...prev, ...settingsMap }));
        }

        const { data: mData } = await supabase.from('pricing_models').select('*').order('name');
        if (mData) setModels(mData);

        const { data: cData } = await supabase.from('profiles').select('id, company_name, contact_name, nit, phone, address, pricing_model_id, role').in('role', ['b2b_client', 'b2c_client']).order('company_name');
        if (cData) setClients(cData);

        const { data: convData } = await supabase.from('product_conversions').select('*');
        if (convData) setConversions(convData || []);
    };

    useEffect(() => {
        if (selectedModelId) {
            fetchRules(selectedModelId);
        }
    }, [selectedModelId]);

    const fetchRules = async (modelId: string) => {
        const { data } = await supabase.from('pricing_rules').select('*').eq('model_id', modelId);
        if (data) setRules(data || []);
    };

    const handleClientChange = async (clientId: string) => {
        setSelectedClientId(clientId);
        const client = clients.find(c => c.id === clientId);
        if (client) {
            setClientName(client.company_name || client.contact_name || '');
            if (client.pricing_model_id) {
                setSelectedModelId(client.pricing_model_id);
            }
            // Cargar máscaras de productos (Nicknames) para este cliente
            try {
                const { data } = await supabase
                    .from('product_nicknames')
                    .select('*')
                    .eq('customer_id', clientId);
                if (data) setNicknames(data);
            } catch (err) {
                console.error('Error cargando nicknames:', err);
                setNicknames([]);
            }
        } else {
            setClientName('');
            setSelectedModelId('');
            setNicknames([]);
        }
    };

    const getMarginForProduct = (productId: string, modelId: string, loadedRules: any[]) => {
        const model = models.find(m => m.id === modelId);
        if (!model) return 0;
        let margin = model.base_margin_percent;
        const rule = loadedRules.find((r: any) => r.product_id === productId);
        if (rule) {
            margin += rule.margin_adjustment;
        }
        return margin;
    };

    useEffect(() => {
        if (items.length > 0 && selectedModelId) {
            recalcExistingItems();
        }
    }, [rules]);

    const recalcExistingItems = () => {
        const updated = items.map(item => {
            const margin = getMarginForProduct(item.product_id, selectedModelId, rules);
            const price = calculateFinalPrice(item.cost, margin);
            return { ...item, margin, price };
        });
        setItems(updated);
    };

    const calculateFinalPrice = (cost: number, marginPercent: number) => {
        return cost * (1 + (marginPercent / 100));
    };

    const calculateSmartAverageCost = async (productId: string, salesUnit: string) => {
        const { data: purchases } = await supabase
            .from('purchases')
            .select('unit_price, purchase_unit')
            .eq('product_id', productId)
            .order('created_at', { ascending: false })
            .limit(5);

        if (!purchases || purchases.length === 0) return 0;

        let totalNormalizedCost = 0;
        let count = 0;

        purchases.forEach(p => {
            let cost = p.unit_price;
            if (p.purchase_unit && p.purchase_unit !== salesUnit) {
                const conv = conversions.find(c =>
                    c.product_id === productId &&
                    c.from_unit === p.purchase_unit &&
                    c.to_unit === salesUnit
                );
                if (conv && conv.conversion_factor) {
                    cost = cost / conv.conversion_factor;
                }
            }
            totalNormalizedCost += cost;
            count++;
        });

        return count > 0 ? totalNormalizedCost / count : 0;
    };

    const handleQuickCreateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .insert([{
                    ...newClient,
                    company_name: newClient.role === 'b2c_client' ? '' : newClient.company_name,
                    nit: newClient.role === 'b2c_client' ? '' : newClient.nit
                }])
                .select()
                .single();

            if (error) throw error;

            await fetchInitialData();
            handleClientChange(data.id);
            setClientSearch('');
            setIsClientModalOpen(false);
            
            setNewClient({
                company_name: '',
                contact_name: '',
                nit: '',
                phone: '',
                address: '',
                role: 'b2b_client',
                pricing_model_id: ''
            });

        } catch (err: any) {
            console.error('Error creating client:', err);
            alert('Error al crear el cliente: ' + (err.message || 'Error desconocido'));
        } finally {
            setSaving(false);
        }
    };

    const handleSearch = async (term: string) => {
        setSearchTerm(term);
        if (term.length < 2) {
            setSearchResults([]);
            return;
        }
        const { data } = await supabase
            .from('products')
            .select(`
                id, name, unit_of_measure, iva_rate,
                product_variants (*)
            `)
            .eq('is_active', true)
            .or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
            .limit(10);
            
        if (data) {
            const filteredData = data.map(p => ({
                ...p,
                product_variants: (p.product_variants || []).filter((v: any) => v.is_active !== false)
            }));
            setSearchResults(filteredData);
        }
    };

    const addProduct = async (product: any, variant?: any) => {
        const cost = await calculateSmartAverageCost(product.id, product.unit_of_measure);
        const baseMargin = getMarginForProduct(product.id, selectedModelId, rules);
        const variantAdjustment = variant?.price_adjustment_percent || 0;
        const basePrice = calculateFinalPrice(cost, baseMargin);
        const finalPrice = basePrice * (1 + (variantAdjustment / 100));
        const ivaRate = product.iva_rate ?? 0;

        const clientNickname = nicknames.find(n => n.product_id === product.id);
        const displayName = clientNickname ? clientNickname.nickname : (variant ? `${product.name} (${Object.values(variant.options).join(' / ')})` : product.name);

        setItems([...items, {
            product_id: product.id,
            variant_id: variant?.id || null,
            name: displayName,
            sku: variant?.sku || product.sku,
            unit: product.unit_of_measure,
            cost: cost,
            margin: baseMargin,
            variant_adjustment: variantAdjustment,
            price: finalPrice,
            iva_rate: ivaRate,
            quantity: 1
        }]);
        setSearchTerm('');
        setSearchResults([]);
    };

    const removeItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const updateQuantity = (index: number, val: number) => {
        const newItems = [...items];
        newItems[index].quantity = val;
        setItems(newItems);
    };

    const router = useRouter();

    const saveQuote = async (shouldRedirect = true) => {
        if (!clientName) { alert('Ingresa el nombre del cliente'); return null; }
        if (!selectedModelId) { alert('Selecciona un Modelo de Precios'); return null; }
        if (items.length === 0) { alert('Agrega al menos un producto'); return null; }

        setSaving(true);
        try {
            const subtotal = items.reduce((sum, i) => sum + (Math.ceil(i.price) * i.quantity), 0);
            const totalTax = items.reduce((sum, i) => sum + (Math.ceil(i.price) * i.quantity) * ((i.iva_rate || 0) / 100), 0);
            const totalAmount = subtotal + totalTax;

            const selectedModel = models.find(m => m.id === selectedModelId);

            const { data: quote, error: qError } = await supabase
                .from('quotes')
                .insert({
                    client_id: selectedClientId || null, // Standardized column name
                    client_name: clientName,
                    model_id: selectedModelId,
                    model_snapshot_name: selectedModel?.name,
                    subtotal_amount: subtotal,
                    total_tax_amount: totalTax,
                    total_amount: totalAmount,
                    status: 'draft',
                    valid_until: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
                })
                .select()
                .single();

            if (qError) throw qError;

            const quoteItemsArr = items.map(item => ({
                quote_id: quote.id,
                product_id: item.product_id,
                product_name: item.name,
                quantity: item.quantity,
                cost_basis: item.cost,
                margin_percent: item.margin,
                unit_price: Math.ceil(item.price),
                iva_rate: item.iva_rate || 0,
                iva_amount: (Math.ceil(item.price) * item.quantity) * ((item.iva_rate || 0) / 100),
                total_price: Math.ceil(item.price) * item.quantity
            }));

            const { error: iError } = await supabase.from('quote_items').insert(quoteItemsArr);
            if (iError) throw iError;

            if (shouldRedirect) {
                alert(`Cotización ${quote.quote_number || ''} guardada exitosamente`);
                router.push('/admin/commercial/quotes');
            } else {
                setQuoteNumber(quote.quote_number || 'SAVED');
                return quote;
            }
        } catch (err: any) {
            console.error('Save Quote Error Detail:', JSON.stringify(err, null, 2), err);
            const errMsg = err?.message || err?.error_description || JSON.stringify(err);
            alert('Error guardando: ' + errMsg);
            return null;
        } finally {
            setSaving(false);
        }
    };

    const handlePrint = async () => {
        const savedQuote = await saveQuote(false);
        if (savedQuote) {
            setTimeout(() => {
                window.print();
            }, 500);
        }
    };

    const selectedClientInfo = clients.find(c => c.id === selectedClientId);

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', fontFamily: 'Inter, sans-serif' }}>
            <div className="no-print">
                <Navbar />
            </div>

            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>

                <div className="no-print" style={{ marginBottom: '2rem' }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <Link href="/admin/commercial" style={{ textDecoration: 'none', color: '#6B7280', fontWeight: '600' }}>← Volver (Sin guardar)</Link>
                    </div>

                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '16px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem', alignItems: 'start' }}>
                        <div style={{ position: 'relative' }}>
                            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '800', color: '#111827' }}>Destinatario de la Cotización</h3>
                            {!selectedClientId ? (
                                <div style={{ position: 'relative' }}>
                                    <input 
                                        type="text"
                                        placeholder="🔍 Buscar cliente (Nombre, NIT, Contacto...)"
                                        value={clientSearch}
                                        onChange={(e) => {
                                            setClientSearch(e.target.value);
                                            setShowClientResults(true);
                                        }}
                                        onFocus={() => setShowClientResults(true)}
                                        style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                    />
                                    {showClientResults && clientSearch.length > 0 && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, marginTop: '4px', maxHeight: '250px', overflowY: 'auto' }}>
                                            {clients.filter(c => 
                                                (c.company_name?.toLowerCase().includes(clientSearch.toLowerCase())) ||
                                                (c.contact_name?.toLowerCase().includes(clientSearch.toLowerCase())) ||
                                                (c.nit?.toLowerCase().includes(clientSearch.toLowerCase()))
                                            ).map(c => (
                                                <div 
                                                    key={c.id}
                                                    onClick={() => {
                                                        handleClientChange(c.id);
                                                        setShowClientResults(false);
                                                        setClientSearch('');
                                                    }}
                                                    style={{ padding: '0.8rem', cursor: 'pointer', borderBottom: '1px solid #F3F4F6', transition: 'background 0.2s' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{c.company_name || c.contact_name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                                                        {c.role === 'b2c_client' ? 'Consumidor Final' : `NIT: ${c.nit || 'Sin registro'}`} • {c.contact_name}
                                                    </div>
                                                </div>
                                            ))}
                                            <div 
                                                onClick={() => {
                                                    setClientName(clientSearch);
                                                    setSelectedClientId('');
                                                    setShowClientResults(false);
                                                }}
                                                style={{ padding: '0.8rem', cursor: 'pointer', backgroundColor: '#F0FDFA', color: '#0F766E', fontWeight: 'bold', fontSize: '0.85rem', textAlign: 'center' }}
                                            >
                                                + Usar &quot;{clientSearch}&quot; como cliente manual
                                            </div>
                                            <div 
                                                onClick={() => {
                                                    setNewClient(prev => ({ ...prev, company_name: clientSearch, contact_name: clientSearch }));
                                                    setIsClientModalOpen(true);
                                                    setShowClientResults(false);
                                                }}
                                                style={{ padding: '0.8rem', cursor: 'pointer', backgroundColor: '#EFF6FF', color: '#1E40AF', fontWeight: 'bold', fontSize: '0.85rem', textAlign: 'center', borderTop: '1px solid #DBEAFE' }}
                                            >
                                                ✨ Registrar cliente nuevo oficial
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#374151' }}>O escribe nombre manual:</label>
                                        <button 
                                            type="button"
                                            onClick={() => setIsClientModalOpen(true)}
                                            style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: appSettings.primary_color, color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                                        >
                                            + Nuevo Cliente
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        value={clientName}
                                        onChange={e => setClientName(e.target.value)}
                                        placeholder="Nombre manual"
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #E5E7EB' }}
                                    />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '12px', border: `1px solid ${appSettings.primary_color}33` }}>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: appSettings.primary_color, fontWeight: '900', textTransform: 'uppercase', marginBottom: '4px' }}>Cliente Seleccionado</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#111827' }}>{clientName}</div>
                                        {selectedClientInfo?.nit && <div style={{ fontSize: '0.85rem', color: '#4B5563' }}>NIT: {selectedClientInfo.nit}</div>}
                                    </div>
                                    <button 
                                        onClick={() => {
                                            setSelectedClientId('');
                                            setClientName('');
                                            setClientSearch('');
                                        }}
                                        style={{ background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: '6px', padding: '4px 12px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
                                    >
                                        Cambiar
                                    </button>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1rem', fontWeight: '800', color: '#111827' }}>Configuración</h3>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>Modelo de Precios</label>
                                <select
                                    value={selectedModelId}
                                    onChange={e => setSelectedModelId(e.target.value)}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: 'white' }}
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {models.map(m => (
                                        <option key={m.id} value={m.id}>{m.name} (Base: {m.base_margin_percent}%)</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                <button
                                    onClick={handlePrint}
                                    style={{ flex: 1, padding: '0.8rem', backgroundColor: 'white', color: '#1F2937', border: '1px solid #D1D5DB', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                >
                                    🖨️ PDF
                                </button>
                                <button
                                    onClick={() => saveQuote(true)}
                                    disabled={saving}
                                    style={{ flex: 1.5, padding: '0.8rem', backgroundColor: appSettings.primary_color || '#111827', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                >
                                    {saving ? '...' : '💾 Guardar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="quote-document" style={{ backgroundColor: 'white', minHeight: '800px', padding: '3rem', borderRadius: '2px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3rem', borderBottom: `2px solid ${appSettings.primary_color || '#111827'}`, paddingBottom: '1rem' }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '900', letterSpacing: '-1px', color: appSettings.primary_color || '#111827' }}>
                                COTIZACIÓN {quoteNumber ? `#${quoteNumber}` : <span style={{ fontSize: '1rem', color: '#9CA3AF', verticalAlign: 'middle' }}>(Borrador)</span>}
                            </h1>
                            <p style={{ color: appSettings.secondary_color || '#6B7280', margin: '0.5rem 0' }}>Fecha: {new Date().toLocaleDateString()}</p>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                            {(appSettings.provider_logo_url || appSettings.app_logo_url) && (
                                <img src={appSettings.provider_logo_url || appSettings.app_logo_url} alt="Logo Documento" style={{ maxHeight: '60px', objectFit: 'contain' }} />
                            )}
                            <div style={{ marginTop: 'auto' }}>
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: appSettings.primary_color || '#111827' }}>{appSettings.provider_legal_name || appSettings.app_name || 'Empresa Emisora'}</div>
                                <div style={{ color: appSettings.secondary_color || '#6B7280', fontSize: '0.9rem' }}>Nit: {appSettings.provider_nit || 'Sin NIT'}</div>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: '3rem' }}>
                        <div style={{ fontSize: '0.8rem', color: appSettings.secondary_color || '#6B7280', textTransform: 'uppercase', fontWeight: 'bold' }}>Preparado para:</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: appSettings.primary_color || '#111827' }}>
                            {clientName || 'Cliente General'}
                        </div>
                        {selectedClientInfo && (
                            <div style={{ marginTop: '0.8rem', color: '#4B5563', fontSize: '0.95rem', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '0.5rem 2rem', borderLeft: `3px solid ${appSettings.primary_color}33`, paddingLeft: '1rem' }}>
                                {selectedClientInfo.nit && <div><strong style={{ color: appSettings.primary_color }}>NIT/CC:</strong> {selectedClientInfo.nit}</div>}
                                {selectedClientInfo.contact_name && selectedClientInfo.company_name && <div><strong style={{ color: appSettings.primary_color }}>Atención:</strong> {selectedClientInfo.contact_name}</div>}
                                {selectedClientInfo.phone && <div><strong style={{ color: appSettings.primary_color }}>Teléfono:</strong> {selectedClientInfo.phone}</div>}
                                {selectedClientInfo.address && <div><strong style={{ color: appSettings.primary_color }}>Dirección:</strong> {selectedClientInfo.address}</div>}
                            </div>
                        )}
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '3rem' }}>
                        <thead>
                            <tr style={{ borderBottom: `2px solid ${appSettings.primary_color || '#111827'}`, color: appSettings.primary_color || '#111827' }}>
                                <th style={{ padding: '1rem', width: '50%' }}>Producto</th>
                                <th style={{ padding: '1rem', textAlign: 'center' }}>Cantidad</th>
                                <th style={{ padding: '1rem', textAlign: 'center' }}>IVA</th>
                                <th style={{ padding: '1rem', textAlign: 'right' }}>Precio Unit.</th>
                                <th style={{ padding: '1rem', textAlign: 'right' }}>Total</th>
                                <th className="no-print" style={{ padding: '1rem' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, index) => (
                                <tr key={index} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                    <td style={{ padding: '1rem' }}>{item.name}</td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <div className="no-print">
                                            <input type="number" value={item.quantity} onChange={e => updateQuantity(index, parseFloat(e.target.value))} style={{ width: '60px', padding: '0.3rem', textAlign: 'center' }} />
                                            <span> {item.unit}</span>
                                        </div>
                                        <span className="only-print" style={{ display: 'none' }}>{item.quantity} {item.unit}</span>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center', color: '#6B7280', fontSize: '0.9rem' }}>{item.iva_rate || 0}%</td>
                                    <td style={{ padding: '1rem', textAlign: 'right' }}>${Math.ceil(item.price).toLocaleString()}</td>
                                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>${(Math.ceil(item.price) * item.quantity * (1 + ((item.iva_rate || 0)/100))).toLocaleString()}</td>
                                    <td className="no-print"><button onClick={() => removeItem(index)} style={{ color: '#EF4444', border: 'none', background: 'none' }}>X</button></td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: `2px solid ${appSettings.primary_color || '#111827'}`, color: appSettings.primary_color || '#111827' }}>
                                <td colSpan={3}></td>
                                <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 'bold' }}>Subtotal antes de impuestos</td>
                                <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 'bold', fontSize: '1.2rem' }}>
                                    ${items.reduce((sum, i) => sum + (Math.ceil(i.price) * i.quantity), 0).toLocaleString()}
                                </td>
                                <td></td>
                            </tr>
                            <tr style={{ color: '#4B5563' }}>
                                <td colSpan={3}></td>
                                <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>Impuestos</td>
                                <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>
                                    ${items.reduce((sum, i) => sum + (Math.ceil(i.price) * i.quantity) * ((i.iva_rate || 0)/100), 0).toLocaleString()}
                                </td>
                                <td></td>
                            </tr>
                            <tr style={{ backgroundColor: '#F9FAFB', color: appSettings.primary_color || '#111827' }}>
                                <td colSpan={3}></td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '900' }}>Total</td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '900', fontSize: '1.5rem' }}>
                                    ${(
                                        items.reduce((sum, i) => sum + (Math.ceil(i.price) * i.quantity), 0) + 
                                        items.reduce((sum, i) => sum + (Math.ceil(i.price) * i.quantity) * ((i.iva_rate || 0) / 100), 0)
                                    ).toLocaleString()}
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>

                    <div className="no-print" style={{ marginTop: '2rem', padding: '2rem', backgroundColor: '#F9FAFB', borderRadius: '8px', border: '1px dashed #D1D5DB' }}>
                        <h3 style={{ marginTop: 0 }}>Agregar Producto</h3>
                        <div style={{ position: 'relative' }}>
                            <input placeholder="Buscar SKU..." value={searchTerm} onChange={e => handleSearch(e.target.value)} disabled={!selectedModelId} style={{ width: '100%', padding: '1rem' }} />
                            {searchResults.length > 0 && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', zIndex: 10, boxShadow: '0 10px 15px rgba(0,0,0,0.1)', borderRadius: '0 0 8px 8px', border: '1px solid #D1D5DB', maxHeight: '300px', overflowY: 'auto' }}>
                                    {searchResults.map(p => (
                                        <div key={p.id}>
                                            <div 
                                                onClick={() => addProduct(p)} 
                                                style={{ padding: '0.8rem 1rem', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', backgroundColor: '#F9FAFB', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}
                                            >
                                                <span>📦 {p.name} (Maestro)</span>
                                                <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>Precio Base</span>
                                            </div>
                                            {p.product_variants?.map((v: any) => (
                                                <div 
                                                    key={v.id} 
                                                    onClick={() => addProduct(p, v)}
                                                    style={{ padding: '0.8rem 1rem 0.8rem 2.5rem', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', transition: 'background 0.2s' }}
                                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <span>↳ {Object.values(v.options).join(' / ')}</span>
                                                    {v.price_adjustment_percent !== 0 && (
                                                        <span style={{ 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: 'bold', 
                                                            color: v.price_adjustment_percent > 0 ? '#059669' : '#DC2626',
                                                            backgroundColor: v.price_adjustment_percent > 0 ? '#ECFDF5' : '#FEF2F2',
                                                            padding: '2px 6px',
                                                            borderRadius: '4px'
                                                        }}>
                                                            {v.price_adjustment_percent > 0 ? '+' : ''}{v.price_adjustment_percent}%
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* QUICK CREATE CLIENT MODAL */}
            {isClientModalOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontWeight: '900', color: '#111827' }}>Registrar Nuevo Cliente</h3>
                            <button onClick={() => setIsClientModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                        </div>
                        <form onSubmit={handleQuickCreateClient} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                                <button type="button" onClick={() => setNewClient(p => ({ ...p, role: 'b2b_client' }))} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: newClient.role === 'b2b_client' ? '#EFF6FF' : 'white', fontWeight: 'bold', color: newClient.role === 'b2b_client' ? '#1D4ED8' : '#6B7280' }}>Corporativo (B2B)</button>
                                <button type="button" onClick={() => setNewClient(p => ({ ...p, role: 'b2c_client' }))} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: newClient.role === 'b2c_client' ? '#F0FDFA' : 'white', fontWeight: 'bold', color: newClient.role === 'b2c_client' ? '#0F766E' : '#6B7280' }}>Persona (B2C)</button>
                            </div>

                            {newClient.role === 'b2b_client' && (
                                <>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', marginBottom: '4px' }}>Razón Social *</label>
                                        <input required value={newClient.company_name} onChange={e => setNewClient(p => ({ ...p, company_name: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', marginBottom: '4px' }}>NIT / RUT *</label>
                                        <input required value={newClient.nit} onChange={e => setNewClient(p => ({ ...p, nit: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                                    </div>
                                </>
                            )}

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', marginBottom: '4px' }}>Nombre de Contacto *</label>
                                <input required value={newClient.contact_name} onChange={e => setNewClient(p => ({ ...p, contact_name: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', marginBottom: '4px' }}>Teléfono</label>
                                    <input value={newClient.phone} onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', marginBottom: '4px' }}>Modelo Precios</label>
                                    <select value={newClient.pricing_model_id} onChange={e => setNewClient(p => ({ ...p, pricing_model_id: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB', background: 'white' }}>
                                        <option value="">Default</option>
                                        {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', marginBottom: '4px' }}>Dirección de Entrega</label>
                                <input value={newClient.address} onChange={e => setNewClient(p => ({ ...p, address: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setIsClientModalOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #E5E7EB', backgroundColor: 'white', fontWeight: 'bold' }}>Cancelar</button>
                                <button type="submit" disabled={saving} style={{ flex: 2, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: appSettings.primary_color, color: 'white', fontWeight: 'bold' }}>{saving ? 'Guardando...' : 'Crear Registro'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <style jsx global>{`
                @media print { 
                    .no-print { display: none !important; } 
                    .only-print { display: inline !important; }
                    body { background-color: white !important; padding: 0 !important; margin: 0 !important; }
                    
                    #quote-document { 
                        box-shadow: none !important; 
                        border: none !important; 
                        width: 100% !important; 
                        margin: 0 !important; 
                        padding: 1.5cm !important;
                        min-height: auto !important;
                        position: relative;
                        overflow: visible;
                    }

                    /* WATERMARK */
                    #quote-document::before {
                        content: "";
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%) rotate(-30deg);
                        width: 500px;
                        height: 500px;
                        background-image: url('${appSettings.provider_logo_url || appSettings.app_logo_url}');
                        background-repeat: no-repeat;
                        background-position: center;
                        background-size: contain;
                        opacity: 0.05;
                        pointer-events: none;
                        z-index: -1;
                    }

                    /* PAGE NUMBERING */
                    footer.print-footer {
                        position: fixed;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        font-size: 0.75rem;
                        color: #94A3B8;
                        text-align: right;
                        padding-top: 10px;
                        border-top: 1px solid #E2E8F0;
                        display: block !important;
                    }
                }

                @page { 
                    size: letter; 
                    margin: 2cm; 
                    @bottom-right {
                        content: "Página " counter(page);
                    }
                }

                /* HIDE PRINT FOOTER IN BROWSER */
                .print-footer { display: none; }
            `}</style>

            {/* Print-only Footer for Page Numbers */}
            <footer className="print-footer only-print">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{appSettings.provider_legal_name || appSettings.app_name} - Cotización Oficial</span>
                    <span>Página 1</span>
                </div>
            </footer>
        </main>
    );
}
