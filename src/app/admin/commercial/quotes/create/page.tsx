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
    const [rules, setRules] = useState<any[]>([]); // Rules for the selected model
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [conversions, setConversions] = useState<any[]>([]);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        // 1. Models
        const { data: mData } = await supabase.from('pricing_models').select('*').order('name');
        if (mData) setModels(mData);

        // 2. Clients (B2B)
        const { data: cData } = await supabase.from('profiles').select('id, company_name, pricing_model_id').eq('role', 'b2b_client').order('company_name');
        if (cData) setClients(cData);

        // 3. Conversions
        const { data: convData } = await supabase.from('product_conversions').select('*');
        if (convData) setConversions(convData || []);
    };

    useEffect(() => {
        if (selectedModelId) {
            fetchRules(selectedModelId);
            // Rules change effect will trigger recalculation
        }
    }, [selectedModelId]);

    const fetchRules = async (modelId: string) => {
        const { data } = await supabase.from('pricing_rules').select('*').eq('model_id', modelId);
        if (data) setRules(data || []);
    };

    const handleClientChange = (clientId: string) => {
        setSelectedClientId(clientId);
        const client = clients.find(c => c.id === clientId);
        if (client) {
            setClientName(client.company_name);
            if (client.pricing_model_id) {
                setSelectedModelId(client.pricing_model_id);
            }
        } else {
            setClientName('');
            setSelectedModelId('');
        }
    };

    // --- PRICING LOGIC ---
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

    // --- SMART COST CALCULATION ---
    const calculateSmartAverageCost = async (productId: string, salesUnit: string) => {
        const { data: purchases } = await supabase
            .from('purchases')
            .select('unit_price, purchase_unit')
            .eq('product_id', productId)
            .order('created_at', { ascending: false })
            .limit(5);

        if (!purchases || purchases.length === 0) {
            console.warn(`No price history found for product ${productId}. Seed required.`);
            return 0;
        }

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

    // --- PRODUCT SEARCH & ADD ---
    const handleSearch = async (term: string) => {
        setSearchTerm(term);
        if (term.length < 2) {
            setSearchResults([]);
            return;
        }
        // Buscar únicamente productos activos
        const { data } = await supabase
            .from('products')
            .select(`
                id, name, unit_of_measure, 
                product_variants (*)
            `)
            .eq('is_active', true) // Solo productos habilitados en el catálogo
            .or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
            .limit(10);
            
        if (data) {
            // Filtrar variantes inactivas en el lado del cliente para mayor seguridad
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
        
        // Aplicar ajuste de variante si existe
        const variantAdjustment = variant?.price_adjustment_percent || 0;
        
        // El precio final es: Costo * (1 + MargenBase/100) * (1 + AjusteVariante/100)
        // O: Costo * (1 + (MargenBase + AjusteVariante)/100)
        // El usuario dijo "-2% sobre el valor del producto padre", lo que implica cascada.
        const basePrice = calculateFinalPrice(cost, baseMargin);
        const finalPrice = basePrice * (1 + (variantAdjustment / 100));

        setItems([...items, {
            product_id: product.id,
            variant_id: variant?.id || null,
            name: variant ? `${product.name} (${Object.values(variant.options).join(' / ')})` : product.name,
            sku: variant?.sku || product.sku,
            unit: product.unit_of_measure,
            cost: cost,
            margin: baseMargin,
            variant_adjustment: variantAdjustment,
            price: finalPrice,
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
    const [saving, setSaving] = useState(false);
    const [quoteNumber, setQuoteNumber] = useState('');

    const saveQuote = async (shouldRedirect = true) => {
        if (!clientName) { alert('Ingresa el nombre del cliente'); return null; }
        if (!selectedModelId) { alert('Selecciona un Modelo de Precios'); return null; }
        if (items.length === 0) { alert('Agrega al menos un producto'); return null; }

        setSaving(true);
        try {
            const totalAmount = items.reduce((sum, i) => sum + (Math.ceil(i.price) * i.quantity), 0);
            const selectedModel = models.find(m => m.id === selectedModelId);

            const { data: quote, error: qError } = await supabase
                .from('quotes')
                .insert({
                    client_id: selectedClientId || null,
                    client_name: clientName,
                    model_id: selectedModelId,
                    model_snapshot_name: selectedModel?.name,
                    total_amount: totalAmount,
                    status: 'draft',
                    valid_until: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
                })
                .select()
                .single();

            if (qError) throw qError;

            const quoteItems = items.map(item => ({
                quote_id: quote.id,
                product_id: item.product_id,
                product_name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                cost_basis: item.cost,
                margin_percent: item.margin,
                unit_price: Math.ceil(item.price),
                total_price: Math.ceil(item.price) * item.quantity
            }));

            const { error: iError } = await supabase.from('quote_items').insert(quoteItems);
            if (iError) throw iError;

            if (shouldRedirect) {
                alert('Cotización guardada exitosamente');
                router.push('/admin/commercial/quotes');
            } else {
                setQuoteNumber(quote.quote_number || 'SAVED');
                return quote;
            }
        } catch (err: any) {
            console.error(err);
            alert('Error guardando: ' + err.message);
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

                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
                        <div>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Seleccionar Cliente</label>
                            <select
                                value={selectedClientId}
                                onChange={e => handleClientChange(e.target.value)}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: 'white' }}
                            >
                                <option value="">-- Cliente Manual --</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.company_name}</option>
                                ))}
                            </select>
                        </div>
                        
                        {!selectedClientId && (
                            <div>
                                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Nombre Manual</label>
                                <input
                                    placeholder="Ej: Restaurante El Sabor"
                                    value={clientName}
                                    onChange={e => setClientName(e.target.value)}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                />
                            </div>
                        )}

                        <div>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Modelo de Precios</label>
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

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={handlePrint}
                                style={{ flex: 1, padding: '0.8rem', backgroundColor: 'white', color: '#1F2937', border: '1px solid #D1D5DB', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                            >
                                🖨️ PDF
                            </button>
                            <button
                                onClick={() => saveQuote(true)}
                                disabled={saving}
                                style={{ flex: 1.5, padding: '0.8rem', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                            >
                                {saving ? '...' : '💾 Guardar'}
                            </button>
                        </div>
                    </div>
                </div>

                <div id="quote-document" style={{ backgroundColor: 'white', minHeight: '800px', padding: '3rem', borderRadius: '2px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3rem', borderBottom: '2px solid #111827', paddingBottom: '1rem' }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '900', letterSpacing: '-1px' }}>
                                COTIZACIÓN {quoteNumber ? `#${quoteNumber}` : <span style={{ fontSize: '1rem', color: '#9CA3AF', verticalAlign: 'middle' }}>(Borrador)</span>}
                            </h1>
                            <p style={{ color: '#6B7280', margin: '0.5rem 0' }}>Fecha: {new Date().toLocaleDateString()}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#111827' }}>FruFresco S.A.S</div>
                            <div style={{ color: '#6B7280', fontSize: '0.9rem' }}>Nit: 900.123.456-7</div>
                        </div>
                    </div>

                    <div style={{ marginBottom: '3rem' }}>
                        <div style={{ fontSize: '0.8rem', color: '#6B7280', textTransform: 'uppercase', fontWeight: 'bold' }}>Preparado para:</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>
                            {clientName || 'Cliente General'}
                        </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '3rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                                <th style={{ padding: '1rem', width: '50%' }}>Producto</th>
                                <th style={{ padding: '1rem', textAlign: 'center' }}>Cantidad</th>
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
                                    <td style={{ padding: '1rem', textAlign: 'right' }}>${Math.ceil(item.price).toLocaleString()}</td>
                                    <td style={{ padding: '1rem', textAlign: 'right' }}>${(Math.ceil(item.price) * item.quantity).toLocaleString()}</td>
                                    <td className="no-print"><button onClick={() => removeItem(index)} style={{ color: '#EF4444', border: 'none', background: 'none' }}>X</button></td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid #111827' }}>
                                <td colSpan={2}></td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>TOTAL</td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '900', fontSize: '1.5rem' }}>${items.reduce((sum, i) => sum + (Math.ceil(i.price) * i.quantity), 0).toLocaleString()}</td>
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
            <style jsx global>{`
                @media print { .no-print { display: none !important; } .only-print { display: inline !important; } }
            `}</style>
        </main>
    );
}
