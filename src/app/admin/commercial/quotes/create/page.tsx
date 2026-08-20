'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { GENERAL_INSTITUCIONAL_ID } from '@/lib/pricingUtils';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { THEME } from '@/lib/adminTheme';

function CreateQuotePageContent() {
    const formatPrice = (value: number) => {
        return new Intl.NumberFormat('es-CO', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(value);
    };

    const printDocRef = useRef<HTMLDivElement>(null);

    const formatQuoteNumber = (seq: number, dateStr?: string) => {
        const date = dateStr ? new Date(dateStr) : new Date();
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const paddedSeq = String(seq).padStart(4, '0');
        return `COT ${day}${month} ${paddedSeq}`;
    };

    // FORM STATE
    const [clientName, setClientName] = useState('');
    const [selectedClientId, setSelectedClientId] = useState('');
    const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
    const [selectedModelId, setSelectedModelId] = useState('');
    const [items, setItems] = useState<any[]>([]);
    const [paymentTermsDays, setPaymentTermsDays] = useState(30);
    const [introTitle, setIntroTitle] = useState('Suministro de Frutas y Verduras de Alta Calidad');
    const [introDesc, setIntroDesc] = useState('Nuestras cotizaciones combinan frescura, calidad garantizada y entregas puntuales del campo a su negocio. Los productos son seleccionados minuciosamente bajo los estándares óptimos de inocuidad y empaque.');

    // DATA STATE
    const [clients, setClients] = useState<any[]>([]);
    const [leads, setLeads] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [loadingTemplate, setLoadingTemplate] = useState(false);
    const [models, setModels] = useState<any[]>([]);
    const [rules, setRules] = useState<any[]>([]); 
    const [clientSearch, setClientSearch] = useState('');
    const [showClientResults, setShowClientResults] = useState(false);
    const [activeDropdownIndex, setActiveDropdownIndex] = useState(-1);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [nicknames, setNicknames] = useState<any[]>([]);
    const [conversions, setConversions] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [quoteNumber, setQuoteNumber] = useState<string | null>(null);
    const [originalQuoteVersion, setOriginalQuoteVersion] = useState<number>(1);
    const [parentQuoteId, setParentQuoteId] = useState<string | null>(null);

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
        provider_nit: '901.393.217',
        provider_legal_name: 'Investments Cortes S.A.S',
        provider_logo_url: '/logo-investments.png',
        provider_address: 'CL 12 B # 71 D - 31 TO 4 AP 101, Bogotá D.C., Colombia',
        provider_email: 'contacto@investmentscortes.com',
        app_name: 'FruFresco',
        app_logo_url: '',
        primary_color: '#111827',
        secondary_color: '#64748B'
    });

    const searchParams = useSearchParams();
    const duplicateFrom = searchParams ? searchParams.get('duplicate_from') : null;

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (duplicateFrom) {
            loadDuplicateQuote(duplicateFrom);
        }
    }, [duplicateFrom]);

    const loadDuplicateQuote = async (quoteId: string) => {
        try {
            // 1. Fetch quote details
            const { data: qData, error: qErr } = await supabase
                .from('quotes')
                .select('*')
                .eq('id', quoteId)
                .single();

            if (qErr) throw qErr;

            if (qData) {
                setParentQuoteId(qData.id);
                setOriginalQuoteVersion(qData.version || 1);
                // Pre-populate client info
                if (qData.client_id) {
                    setSelectedClientId(qData.client_id);
                    setClientName(qData.client_name || '');
                    setClientSearch(qData.client_name || '');
                } else if (qData.lead_id) {
                    setSelectedLeadId(qData.lead_id);
                    setClientName(qData.client_name || '');
                    setClientSearch(qData.client_name || '');
                } else {
                    setClientName(qData.client_name || '');
                    setClientSearch(qData.client_name || '');
                }

                // Pre-populate model and settings
                if (qData.model_id) setSelectedModelId(qData.model_id);
                if (qData.payment_terms_days) setPaymentTermsDays(qData.payment_terms_days);
                if (qData.intro_title) setIntroTitle(qData.intro_title);
                if (qData.intro_desc) setIntroDesc(qData.intro_desc);

                // 2. Fetch quote items
                const { data: iData, error: iErr } = await supabase
                    .from('quote_items')
                    .select('*, products(name, unit_of_measure, sku, iva_rate)')
                    .eq('quote_id', quoteId);

                if (iErr) throw iErr;

                if (iData) {
                    const loadedItems = iData.map((item: any) => ({
                        product_id: item.product_id,
                        variant_id: item.variant_id || null,
                        name: item.product_name || item.products?.name || 'Producto',
                        sku: item.sku || item.products?.sku || '',
                        unit: item.unit_of_measure || item.products?.unit_of_measure || 'Kg',
                        cost: item.cost_basis || 0,
                        margin: item.margin_percent || 0,
                        variant_adjustment: 0,
                        price: item.unit_price || 0,
                        iva_rate: item.iva_rate || 0,
                        quantity: item.quantity || 1
                    }));
                    setItems(loadedItems);
                }
            }
        } catch (err: any) {
            console.error('Error pre-populating quote version:', err);
            alert('Error al pre-cargar cotización anterior: ' + err.message);
        }
    };

    const fetchInitialData = async () => {
        try {
            const { data: sData, error: sErr } = await supabase.from('app_settings').select('*');
            if (sErr) console.warn('Error fetching app_settings:', sErr);
            if (sData) {
                const settingsMap: Record<string, string> = {};
                sData.forEach((s: any) => { settingsMap[s.key] = s.value; });
                setAppSettings(prev => ({ ...prev, ...settingsMap }));
            }

            const { data: mData, error: mErr } = await supabase.from('pricing_models').select('*').order('name');
            if (mErr) console.warn('Error fetching pricing_models:', mErr);
            if (mData && mData.length > 0) {
                setModels(mData);
                setSelectedModelId(mData[0].id);
            }

            const { data: cData, error: cErr } = await supabase.from('profiles').select('id, company_name, contact_name, nit, phone, address, pricing_model_id, parent_id, role').in('role', ['b2b_client', 'b2c_client']).order('company_name');
            if (cErr) console.warn('Error fetching profiles:', cErr);
            if (cData) setClients(cData || []);

            const { data: lData, error: lErr } = await supabase.from('leads').select('id, company_name, contact_name, phone, email, business_type, business_size, nit, address, municipality').order('company_name');
            if (lErr) console.warn('Error fetching leads:', lErr);
            if (lData) setLeads(lData || []);

            const { data: tData, error: tErr } = await supabase.from('quote_templates').select('*').order('name');
            if (tErr) console.warn('Error fetching quote_templates:', tErr);
            if (tData) setTemplates(tData || []);

            const { data: convData, error: convErr } = await supabase.from('product_conversions').select('*');
            if (convErr) console.warn('Error fetching product_conversions:', convErr);
            if (convData) setConversions(convData || []);

            // Fetch next sequential quote number
            const { data: latestQuotes, error: qErr } = await supabase
                .from('quotes')
                .select('quote_number')
                .order('quote_number', { ascending: false })
                .limit(1);
            if (qErr) console.warn('Error fetching latest quote number:', qErr);
            const nextNum = latestQuotes && latestQuotes.length > 0 ? (latestQuotes[0].quote_number + 1) : 1;
            setQuoteNumber(String(nextNum));
        } catch (err) {
            console.error('Error in fetchInitialData:', err);
        }
    };

    useEffect(() => {
        if (activeDropdownIndex >= 0) {
            const container = document.getElementById('client-search-dropdown');
            const activeItem = document.getElementById(`dropdown-item-${activeDropdownIndex}`);
            if (container && activeItem) {
                const containerTop = container.scrollTop;
                const containerBottom = containerTop + container.clientHeight;
                const elemTop = activeItem.offsetTop;
                const elemBottom = elemTop + activeItem.offsetHeight;
                if (elemTop < containerTop) {
                    container.scrollTop = elemTop;
                } else if (elemBottom > containerBottom) {
                    container.scrollTop = elemBottom - container.clientHeight;
                }
            }
        }
    }, [activeDropdownIndex]);

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
            let resolvedModelId = client.pricing_model_id;
            if (!resolvedModelId && client.parent_id) {
                const parent = clients.find(c => c.id === client.parent_id);
                if (parent) {
                    resolvedModelId = parent.pricing_model_id;
                }
            }
            if (resolvedModelId) {
                setSelectedModelId(resolvedModelId);
            } else {
                setSelectedModelId(GENERAL_INSTITUCIONAL_ID);
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

    const handleLeadChange = (leadId: number) => {
        setSelectedLeadId(leadId);
        setSelectedClientId('');
        const lead = leads.find(l => l.id === leadId);
        if (lead) {
            setClientName(lead.company_name || lead.contact_name || '');
        } else {
            setClientName('');
        }
    };

    const handleTemplateChange = async (templateId: string) => {
        setSelectedTemplateId(templateId);
        if (!templateId) return;

        setLoadingTemplate(true);
        try {
            // 1. Fetch template items
            const { data: itemData, error: itemsErr } = await supabase
                .from('quote_template_items')
                .select('product_id')
                .eq('template_id', templateId);

            if (itemsErr) throw itemsErr;
            if (!itemData || itemData.length === 0) {
                alert('La plantilla seleccionada no contiene productos.');
                setLoadingTemplate(false);
                return;
            }

            const productIds = itemData.map((it: any) => it.product_id);

            // 2. Fetch products details
            const { data: products, error: prodErr } = await supabase
                .from('products')
                .select('id, name, unit_of_measure, iva_rate, sku, accounting_id')
                .in('id', productIds)
                .eq('is_active', true);

            if (prodErr) throw prodErr;

            // 3. Fetch last 5 purchases for all these products to calculate cost basis in one query!
            const { data: purchases, error: purErr } = await supabase
                .from('purchases')
                .select('product_id, unit_price, purchase_unit, created_at')
                .in('product_id', productIds)
                .order('created_at', { ascending: false });

            if (purErr) throw purErr;

            // Group purchases by product_id
            const purchasesMap = new Map();
            if (purchases) {
                purchases.forEach((p: any) => {
                    if (!purchasesMap.has(p.product_id)) {
                        purchasesMap.set(p.product_id, []);
                    }
                    if (purchasesMap.get(p.product_id).length < 5) {
                        purchasesMap.get(p.product_id).push(p);
                    }
                });
            }

            // Calculate costs and margins
            const loadedItems = [];
            for (const p of products || []) {
                // Calculate average cost locally using purchasesMap
                const prodPurchases = purchasesMap.get(p.id) || [];
                let cost = 0;
                if (prodPurchases.length > 0) {
                    let totalNormalizedCost = 0;
                    let count = 0;
                    prodPurchases.forEach((pur: any) => {
                        let purCost = pur.unit_price;
                        if (pur.purchase_unit && pur.purchase_unit !== p.unit_of_measure) {
                            const conv = conversions.find((c: any) =>
                                c.product_id === p.id &&
                                c.from_unit === pur.purchase_unit &&
                                c.to_unit === p.unit_of_measure
                            );
                            if (conv && conv.conversion_factor) {
                                purCost = purCost / conv.conversion_factor;
                            }
                        }
                        totalNormalizedCost += purCost;
                        count++;
                    });
                    cost = totalNormalizedCost / count;
                }

                const baseMargin = getMarginForProduct(p.id, selectedModelId, rules);
                const finalPrice = calculateFinalPrice(cost, baseMargin);

                loadedItems.push({
                    product_id: p.id,
                    variant_id: null,
                    name: p.name,
                    sku: p.sku,
                    accounting_id: p.accounting_id || p.sku || p.id?.slice(0, 8),
                    unit: p.unit_of_measure,
                    cost: cost,
                    margin: baseMargin,
                    variant_adjustment: 0,
                    price: finalPrice,
                    iva_rate: p.iva_rate ?? 0,
                    quantity: 1
                });
            }

            setItems(sortItemsByAccountingId(loadedItems));
        } catch (err: any) {
            console.error('Error loading template:', err);
            alert('Error al cargar plantilla: ' + (err.message || err));
        } finally {
            setLoadingTemplate(false);
        }
    };

    const sortItemsByAccountingId = (itemsList: any[]) => {
        return [...itemsList].sort((a, b) => {
            const idA = (a.accounting_id || a.sku || a.name || '').toString().toLowerCase();
            const idB = (b.accounting_id || b.sku || b.name || '').toString().toLowerCase();
            return idA.localeCompare(idB, 'es', { numeric: true, sensitivity: 'base' });
        });
    };

    const sortItemsBySku = sortItemsByAccountingId;

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
        setItems(sortItemsByAccountingId(updated));
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
                id, name, unit_of_measure, iva_rate, accounting_id,
                product_variants (*)
            `)
            .eq('is_active', true)
            .or(`name.ilike.%${term}%,accounting_id.ilike.%${term}%`)
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

        setItems(sortItemsByAccountingId([...items, {
            product_id: product.id,
            variant_id: variant?.id || null,
            name: displayName,
            accounting_id: product.accounting_id || product.id?.slice(0, 8),
            unit: product.unit_of_measure,
            cost: cost,
            margin: baseMargin,
            variant_adjustment: variantAdjustment,
            price: finalPrice,
            iva_rate: ivaRate,
            quantity: 1
        }]));
        setSearchTerm('');
        setSearchResults([]);
    };

    const removeItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const updateQuantity = (index: number, val: any) => {
        const newItems = [...items];
        if (val === '' || val === null || val === undefined) {
            newItems[index].quantity = val;
        } else {
            const numVal = parseFloat(val);
            newItems[index].quantity = isNaN(numVal) ? '' : Math.max(0, numVal);
        }
        setItems(newItems);
    };

    const handleMarginChange = (index: number, newMargin: any) => {
        const newItems = [...items];
        newItems[index].margin = newMargin;
        const numMargin = parseFloat(newMargin);
        if (!isNaN(numMargin)) {
            const calcPrice = newItems[index].cost * (1 + (numMargin / 100));
            newItems[index].price = Math.max(0, calcPrice);
        } else {
            newItems[index].price = 0;
        }
        setItems(newItems);
    };

    const handlePriceChange = (index: number, newPrice: any) => {
        const newItems = [...items];
        if (newPrice === '' || newPrice === null || newPrice === undefined) {
            newItems[index].price = newPrice;
            newItems[index].margin = 0;
        } else {
            const numPrice = parseFloat(newPrice);
            const validPrice = isNaN(numPrice) ? 0 : Math.max(0, numPrice);
            newItems[index].price = validPrice;
            if (newItems[index].cost > 0) {
                newItems[index].margin = ((validPrice / newItems[index].cost) - 1) * 100;
            } else {
                newItems[index].margin = 0;
            }
        }
        setItems(newItems);
    };

    const router = useRouter();

    const saveQuote = async (shouldRedirect = true) => {
        if (!clientName) { alert('Ingresa el nombre del cliente'); return null; }
        if (!selectedModelId) { alert('Selecciona un Modelo de Precios'); return null; }
        if (items.length === 0) { alert('Agrega al menos un producto'); return null; }

        const invalidQtyItem = items.find(i => (parseFloat(i.quantity) || 0) <= 0);
        if (invalidQtyItem) { alert(`La cantidad para "${invalidQtyItem.name}" debe ser mayor a 0.`); return null; }

        const invalidPriceItem = items.find(i => (parseFloat(i.price) || 0) < 0);
        if (invalidPriceItem) { alert(`El precio unitario para "${invalidPriceItem.name}" no puede ser negativo.`); return null; }

        setSaving(true);
        try {
            // Sanitizar y limpiar items para asegurar que tengan valores numéricos correctos
            const sanitizedItems = items.map(item => {
                const qty = parseFloat(item.quantity) || 0;
                const price = parseFloat(item.price) || 0;
                const margin = parseFloat(item.margin) || 0;
                const cost = parseFloat(item.cost) || 0;
                return {
                    ...item,
                    quantity: qty,
                    price: price,
                    margin: margin,
                    cost: cost
                };
            });

            const subtotal = sanitizedItems.reduce((sum, i) => sum + (Math.ceil(i.price) * i.quantity), 0);
            const totalTax = sanitizedItems.reduce((sum, i) => sum + (Math.ceil(i.price) * i.quantity) * ((i.iva_rate || 0) / 100), 0);
            const totalAmount = subtotal + totalTax;

            const selectedModel = models.find(m => m.id === selectedModelId);

            const { data: quote, error: qError } = await supabase
                .from('quotes')
                .insert({
                    client_id: selectedClientId || null,
                    lead_id: selectedLeadId || null,
                    client_name: clientName,
                    model_id: selectedModelId,
                    model_snapshot_name: selectedModel?.name,
                    subtotal_amount: subtotal,
                    total_tax_amount: totalTax,
                    total_amount: totalAmount,
                    status: 'draft',
                    start_date: new Date().toISOString().split('T')[0],
                    valid_until: null,
                    parent_quote_id: parentQuoteId,
                    version: parentQuoteId ? originalQuoteVersion + 1 : 1
                })
                .select()
                .single();

            if (qError) throw qError;

            const quoteItemsArr = sanitizedItems.map(item => ({
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

            try {
                const { error: iError } = await supabase.from('quote_items').insert(quoteItemsArr);
                if (iError) throw iError;
            } catch (itemErr) {
                console.error('Error inserting quote items, rolling back quote header:', itemErr);
                await supabase.from('quotes').delete().eq('id', quote.id);
                throw itemErr;
            }

            if (duplicateFrom) {
                const { error: rejectError } = await supabase
                    .from('quotes')
                    .update({ status: 'rejected' })
                    .eq('id', duplicateFrom);
                if (rejectError) {
                    console.error('Error rejecting original quote:', rejectError);
                }
            }

            if (shouldRedirect) {
                if (duplicateFrom) {
                    alert(`Se ha creado la nueva versión ${quote.quote_number || ''} y se ha descartado la cotización anterior.`);
                } else {
                    alert(`Cotización ${quote.quote_number || ''} guardada exitosamente`);
                }
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
        if (!savedQuote || !savedQuote.id) {
            return;
        }

        window.open(`/admin/commercial/quotes/${savedQuote.id}/print`, '_blank');
        router.push('/admin/commercial/quotes');
    };

    const selectedClientInfo = clients.find(c => c.id === selectedClientId);
    const selectedLeadInfo = leads.find(l => l.id === selectedLeadId);

    const filteredClients = clients.filter(c => 
        (c.company_name?.toLowerCase().includes(clientSearch.toLowerCase())) ||
        (c.contact_name?.toLowerCase().includes(clientSearch.toLowerCase())) ||
        (c.nit?.toLowerCase().includes(clientSearch.toLowerCase()))
    );

    const filteredLeads = leads.filter(l => 
        (l.company_name?.toLowerCase().includes(clientSearch.toLowerCase())) ||
        (l.contact_name?.toLowerCase().includes(clientSearch.toLowerCase())) ||
        (l.phone?.toLowerCase().includes(clientSearch.toLowerCase())) ||
        (l.nit && String(l.nit).toLowerCase().includes(clientSearch.toLowerCase()))
    );

    const dropdownItems = [
        ...filteredClients.map(c => ({ type: 'client' as const, id: c.id, label: c.company_name || c.contact_name, c })),
        ...filteredLeads.map(l => ({ type: 'lead' as const, id: l.id, label: l.company_name || l.contact_name, l })),
        { type: 'manual' as const, label: `+ Usar "${clientSearch}" como cliente manual` },
        { type: 'new_client' as const, label: '✨ Registrar cliente nuevo oficial' }
    ];

    useEffect(() => {
        setActiveDropdownIndex(-1);
    }, [clientSearch]);

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>


            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>

                <div className="no-print" style={{ marginBottom: '2rem' }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <Link href="/admin/commercial" style={{ textDecoration: 'none', color: '#6B7280', fontWeight: '600' }}>← Volver (Sin guardar)</Link>
                    </div>

                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '16px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem', alignItems: 'start' }}>
                        <div style={{ position: 'relative' }}>
                            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '800', color: '#111827' }}>Destinatario de la Cotización</h3>
                            {!selectedClientId && !selectedLeadId ? (
                                <div style={{ position: 'relative' }}>
                                    <input 
                                        type="text"
                                        placeholder="🔍 Buscar cliente o lead (Nombre, NIT, Contacto...)"
                                        value={clientSearch}
                                        onChange={(e) => {
                                            setClientSearch(e.target.value);
                                            setShowClientResults(true);
                                        }}
                                        onFocus={() => setShowClientResults(true)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                setActiveDropdownIndex(prev => (prev + 1) % dropdownItems.length);
                                            } else if (e.key === 'ArrowUp') {
                                                e.preventDefault();
                                                setActiveDropdownIndex(prev => (prev - 1 + dropdownItems.length) % dropdownItems.length);
                                            } else if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (activeDropdownIndex >= 0 && activeDropdownIndex < dropdownItems.length) {
                                                    const item = dropdownItems[activeDropdownIndex];
                                                    if (item.type === 'client') {
                                                        handleClientChange(item.id);
                                                        setSelectedLeadId(null);
                                                        setShowClientResults(false);
                                                        setClientSearch('');
                                                    } else if (item.type === 'lead') {
                                                        handleLeadChange(item.id);
                                                        setSelectedClientId('');
                                                        setShowClientResults(false);
                                                        setClientSearch('');
                                                    } else if (item.type === 'manual') {
                                                        setClientName(clientSearch);
                                                        setSelectedClientId('');
                                                        setSelectedLeadId(null);
                                                        setShowClientResults(false);
                                                    } else if (item.type === 'new_client') {
                                                        setNewClient(prev => ({ ...prev, company_name: clientSearch, contact_name: clientSearch }));
                                                        setIsClientModalOpen(true);
                                                        setShowClientResults(false);
                                                    }
                                                }
                                            } else if (e.key === 'Escape') {
                                                setShowClientResults(false);
                                            }
                                        }}
                                        style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                    />
                                    {showClientResults && clientSearch.length > 0 && (
                                        <div 
                                            id="client-search-dropdown"
                                            style={{ 
                                                position: 'absolute', 
                                                top: '100%', 
                                                left: 0, 
                                                right: 0, 
                                                backgroundColor: 'white', 
                                                border: '1px solid #E5E7EB', 
                                                borderRadius: '8px', 
                                                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', 
                                                zIndex: 50, 
                                                marginTop: '4px', 
                                                maxHeight: '250px', 
                                                overflowY: 'auto' 
                                            }}
                                        >
                                            {dropdownItems.map((item, idx) => {
                                                const isActive = idx === activeDropdownIndex;
                                                if (item.type === 'client') {
                                                    const c = item.c;
                                                    return (
                                                        <div 
                                                            key={c.id}
                                                            id={`dropdown-item-${idx}`}
                                                            onClick={() => {
                                                                handleClientChange(c.id);
                                                                setSelectedLeadId(null);
                                                                setShowClientResults(false);
                                                                setClientSearch('');
                                                            }}
                                                            style={{ 
                                                                padding: '0.8rem', 
                                                                cursor: 'pointer', 
                                                                borderBottom: '1px solid #F3F4F6', 
                                                                transition: 'background 0.2s',
                                                                backgroundColor: isActive ? '#EFF6FF' : 'transparent'
                                                            }}
                                                            onMouseEnter={() => {
                                                                setActiveDropdownIndex(idx);
                                                            }}
                                                        >
                                                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                                                                <span style={{ color: appSettings.primary_color, marginRight: '4px' }}>[Cliente]</span> {c.company_name || c.contact_name}
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                                                                {c.role === 'b2c_client' ? 'Consumidor Final' : `NIT: ${c.nit || 'Sin registro'}`} • {c.contact_name}
                                                            </div>
                                                        </div>
                                                    );
                                                } else if (item.type === 'lead') {
                                                    const l = item.l;
                                                    return (
                                                        <div 
                                                            key={`lead-${l.id}`}
                                                            id={`dropdown-item-${idx}`}
                                                            onClick={() => {
                                                                handleLeadChange(l.id);
                                                                setSelectedClientId('');
                                                                setShowClientResults(false);
                                                                setClientSearch('');
                                                            }}
                                                            style={{ 
                                                                padding: '0.8rem', 
                                                                cursor: 'pointer', 
                                                                borderBottom: '1px solid #F3F4F6', 
                                                                transition: 'background 0.2s',
                                                                backgroundColor: isActive ? '#ECFEFF' : 'transparent'
                                                            }}
                                                            onMouseEnter={() => {
                                                                setActiveDropdownIndex(idx);
                                                            }}
                                                        >
                                                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                                                                <span style={{ color: '#16A34A', marginRight: '4px' }}>[Prospecto]</span> {l.company_name || l.contact_name}
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                                                                {l.nit ? `NIT: ${l.nit} • ` : ''}Tel: {l.phone || 'Sin teléfono'} • Contacto: {l.contact_name}
                                                            </div>
                                                        </div>
                                                    );
                                                } else if (item.type === 'manual') {
                                                    return (
                                                        <div 
                                                            key="manual-option"
                                                            id={`dropdown-item-${idx}`}
                                                            onClick={() => {
                                                                setClientName(clientSearch);
                                                                setSelectedClientId('');
                                                                setSelectedLeadId(null);
                                                                setShowClientResults(false);
                                                            }}
                                                            style={{ 
                                                                padding: '0.8rem', 
                                                                cursor: 'pointer', 
                                                                backgroundColor: isActive ? '#CCFBF1' : '#F0FDFA', 
                                                                color: '#0F766E', 
                                                                fontWeight: 'bold', 
                                                                fontSize: '0.85rem', 
                                                                textAlign: 'center' 
                                                            }}
                                                            onMouseEnter={() => {
                                                                setActiveDropdownIndex(idx);
                                                            }}
                                                        >
                                                            + Usar &quot;{clientSearch}&quot; como cliente manual
                                                        </div>
                                                    );
                                                } else if (item.type === 'new_client') {
                                                    return (
                                                        <div 
                                                            key="new-client-option"
                                                            id={`dropdown-item-${idx}`}
                                                            onClick={() => {
                                                                setNewClient(prev => ({ ...prev, company_name: clientSearch, contact_name: clientSearch }));
                                                                setIsClientModalOpen(true);
                                                                setShowClientResults(false);
                                                            }}
                                                            style={{ 
                                                                padding: '0.8rem', 
                                                                cursor: 'pointer', 
                                                                backgroundColor: isActive ? '#DBEAFE' : '#EFF6FF', 
                                                                color: '#1E40AF', 
                                                                fontWeight: 'bold', 
                                                                fontSize: '0.85rem', 
                                                                textAlign: 'center', 
                                                                borderTop: '1px solid #DBEAFE' 
                                                            }}
                                                            onMouseEnter={() => {
                                                                setActiveDropdownIndex(idx);
                                                            }}
                                                        >
                                                            ✨ Registrar cliente nuevo oficial
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })}
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1rem', backgroundColor: selectedLeadId ? '#F0FDF4' : '#F8FAFC', borderRadius: '12px', border: `1px solid ${selectedLeadId ? '#16A34A33' : `${appSettings.primary_color}33`}` }}>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: selectedLeadId ? '#16A34A' : appSettings.primary_color, fontWeight: '900', textTransform: 'uppercase', marginBottom: '4px' }}>
                                            {selectedLeadId ? 'Prospecto Seleccionado (CRM)' : 'Cliente Seleccionado'}
                                        </div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#111827' }}>
                                            {clientName}
                                        </div>
                                        {selectedLeadId ? (
                                            <>
                                                {(() => {
                                                    const lead = leads.find(l => l.id === selectedLeadId);
                                                    if (!lead) return null;
                                                    const bType = lead.business_type;
                                                    const bSize = lead.business_size;
                                                    let sizeBg = '#F3F4F6';
                                                    let sizeTextCol = '#374151';
                                                    let sizeDot = '🔴 ';
                                                    if (bSize) {
                                                        if (bSize.includes('Grande') || bSize.includes('30M')) { sizeBg = '#DCFCE7'; sizeTextCol = '#15803D'; sizeDot = '🟢 '; }
                                                        else if (bSize.includes('Mediano') || bSize.includes('10M')) { sizeBg = '#FEF3C7'; sizeTextCol = '#B45309'; sizeDot = '🟡 '; }
                                                        else if (bSize.includes('Pequeño') || bSize.includes('< 10M') || bSize.includes('Peq')) { sizeBg = '#FEE2E2'; sizeTextCol = '#B91C1C'; sizeDot = '🔴 '; }
                                                    }
                                                    return (
                                                        <div style={{ fontSize: '0.85rem', color: '#4B5563', lineHeight: '1.4', marginTop: '4px' }}>
                                                            <div>
                                                                Lead ID: #{selectedLeadId} {lead.nit ? `• NIT: ${lead.nit}` : ''} • Tel: {lead.phone || 'Sin teléfono'}
                                                            </div>
                                                            {lead.email && <div>Email: {lead.email}</div>}
                                                            {(lead.address || lead.municipality) && (
                                                                <div>Dirección: {lead.address || ''}{lead.municipality ? ` - ${lead.municipality}` : ''}</div>
                                                            )}
                                                            <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                                {bType && (
                                                                    <span style={{ fontSize: '0.65rem', backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                                                        {bType}
                                                                    </span>
                                                                )}
                                                                {bSize && (
                                                                    <span style={{ fontSize: '0.65rem', backgroundColor: sizeBg, color: sizeTextCol, padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                                                        {sizeDot}{bSize}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </>
                                        ) : (
                                            <>
                                                {selectedClientInfo && (
                                                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '0.65rem', backgroundColor: selectedClientInfo.role === 'b2c_client' ? '#ECFDF5' : '#EFF6FF', color: selectedClientInfo.role === 'b2c_client' ? '#047857' : '#1E40AF', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                                            {selectedClientInfo.role === 'b2c_client' ? 'Cliente Hogar' : 'Cliente Institucional'}
                                                        </span>
                                                    </div>
                                                )}
                                                {selectedClientInfo?.nit && <div style={{ fontSize: '0.85rem', color: '#4B5563', marginTop: '4px' }}>NIT: {selectedClientInfo.nit}</div>}
                                            </>
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => {
                                            setSelectedClientId('');
                                            setSelectedLeadId(null);
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
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>Preforma (Plantilla)</label>
                                    <select
                                        value={selectedTemplateId}
                                        onChange={e => handleTemplateChange(e.target.value)}
                                        disabled={loadingTemplate}
                                        style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: 'white' }}
                                    >
                                        <option value="">{loadingTemplate ? 'Cargando...' : '-- Ninguna --'}</option>
                                        {templates.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>



                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                <button
                                    onClick={handlePrint}
                                    disabled={saving}
                                    style={{ 
                                        flex: 1.5, 
                                        padding: '0.8rem', 
                                        backgroundColor: appSettings.primary_color || '#15803D', 
                                        color: 'white', 
                                        border: 'none', 
                                        borderRadius: '8px', 
                                        fontWeight: 'bold', 
                                        cursor: 'pointer', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        gap: '0.5rem',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                >
                                    🖨️ Guardar e Imprimir
                                </button>
                                <button
                                    onClick={() => saveQuote(true)}
                                    disabled={saving}
                                    style={{ 
                                        flex: 1, 
                                        padding: '0.8rem', 
                                        backgroundColor: 'white', 
                                        color: '#4B5563', 
                                        border: '1px solid #D1D5DB', 
                                        borderRadius: '8px', 
                                        fontWeight: 'bold', 
                                        cursor: 'pointer', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        gap: '0.5rem',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                                >
                                    {saving ? '...' : '💾 Solo Guardar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div ref={printDocRef} id="quote-document" style={{ 
                    backgroundColor: 'white', 
                    minHeight: '800px', 
                    padding: '3.5rem', 
                    borderRadius: '8px', 
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
                    position: 'relative'
                }}>
                    {/* Watermark in Preview (Browser Only) */}
                    <div className="no-print" style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotate(-30deg)',
                        width: '400px',
                        height: '400px',
                        backgroundImage: `url(${appSettings.provider_logo_url || appSettings.app_logo_url})`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                        backgroundSize: 'contain',
                        opacity: 0.03,
                        pointerEvents: 'none',
                        zIndex: 0
                    }} />

                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
                        <div>
                            {(appSettings.provider_logo_url || appSettings.app_logo_url) && (
                                <img src={appSettings.provider_logo_url || appSettings.app_logo_url} alt="Logo" style={{ maxHeight: '75px', objectFit: 'contain' }} />
                            )}
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '0.85rem', color: '#475569', lineHeight: '1.4' }}>
                            <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '1.1rem' }}>{appSettings.provider_legal_name || 'Investments Cortés S.A.S.'}</div>
                            <div>NIT: {appSettings.provider_nit || '901.393.217'}</div>
                            <div>{appSettings.provider_address || 'CL 12 B # 71 D - 31 TO 4 AP 101, Bogotá D.C.'}</div>
                            <div>{appSettings.provider_email || 'contacto@investmentscortes.com'}</div>
                        </div>
                    </div>

                    {/* Thick Solid Line Separator */}
                    <div style={{ borderTop: `3px solid ${appSettings.primary_color || '#15803D'}`, margin: '1.5rem 0 2rem 0', position: 'relative', zIndex: 1 }}></div>

                    {/* Metadata columns: Prepared For & Official Quote */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2.5rem', position: 'relative', zIndex: 1 }}>
                        <div style={{ width: '50%' }}>
                            <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: '800', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Propuesta para:</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0F172A', marginBottom: '0.25rem' }}>{clientName || 'Cliente General'}</div>
                            {selectedClientInfo ? (
                                <div style={{ fontSize: '0.9rem', color: '#475569', lineHeight: '1.5' }}>
                                    {selectedClientInfo.company_name && selectedClientInfo.company_name.trim().toLowerCase() !== (clientName || '').trim().toLowerCase() && (
                                        <div>{selectedClientInfo.company_name}</div>
                                    )}
                                    {selectedClientInfo.nit && <div>NIT: {selectedClientInfo.nit}</div>}
                                    {selectedClientInfo.contact_name && <div>Atención: {selectedClientInfo.contact_name}</div>}
                                    {selectedClientInfo.phone && <div>Teléfono: {selectedClientInfo.phone}</div>}
                                    {selectedClientInfo.address && <div>Dirección: {selectedClientInfo.address}</div>}
                                </div>
                            ) : selectedLeadInfo ? (
                                <div style={{ fontSize: '0.9rem', color: '#475569', lineHeight: '1.5' }}>
                                    {selectedLeadInfo.company_name && selectedLeadInfo.company_name.trim().toLowerCase() !== (clientName || '').trim().toLowerCase() && (
                                        <div>{selectedLeadInfo.company_name}</div>
                                    )}
                                    {selectedLeadInfo.nit && <div>NIT: {selectedLeadInfo.nit}</div>}
                                    {selectedLeadInfo.contact_name && <div>Atención: {selectedLeadInfo.contact_name}</div>}
                                    {selectedLeadInfo.phone && <div>Teléfono: {selectedLeadInfo.phone}</div>}
                                    {selectedLeadInfo.email && <div>Email: {selectedLeadInfo.email}</div>}
                                    {(selectedLeadInfo.address || selectedLeadInfo.municipality) && (
                                        <div>Dirección: {selectedLeadInfo.address || ''}{selectedLeadInfo.municipality ? ` - ${selectedLeadInfo.municipality}` : ''}</div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.9rem', color: '#64748B', fontStyle: 'italic' }}>Consumidor Final</div>
                            )}
                        </div>
                        <div style={{ width: '50%', textAlign: 'right' }}>
                            <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: '800', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Cotización</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0F172A', marginBottom: '0.25rem' }}>{quoteNumber ? formatQuoteNumber(Number(quoteNumber)) : 'Borrador'}</div>
                            <div style={{ fontSize: '0.9rem', color: '#475569', lineHeight: '1.5' }}>
                                <div>Fecha: {new Date().toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-')}</div>
                                <div>Validez: {paymentTermsDays || 30} días</div>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
                        <thead>
                            <tr style={{ borderBottom: '1.5px solid #CBD5E1', color: '#475569', backgroundColor: '#F1F5F9' }}>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '5%', textAlign: 'center' }}>#</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '45%' }}>Producto</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '12%', textAlign: 'center' }}>Cant.</th>
                                <th className="no-print" style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '8%', textAlign: 'center' }}>IVA</th>
                                <th className="no-print" style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '10%', textAlign: 'center' }}>Margen</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '15%', textAlign: 'right' }}>Tarifa Unit.</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '15%', textAlign: 'right' }}>Total</th>
                                <th className="no-print" style={{ padding: '0.45rem 0.5rem', width: '4%' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, index) => {
                                return (
                                    <tr key={index} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.2s' }}>
                                        {/* Row Index */}
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.75rem', fontWeight: '700', color: '#94A3B8', textAlign: 'center' }}>
                                            {String(index + 1).padStart(2, '0')}
                                        </td>
                                        
                                        {/* Description */}
                                        <td style={{ padding: '0.45rem 0.5rem' }}>
                                            <div style={{ fontWeight: '600', color: '#0F172A', fontSize: '0.82rem' }}>{item.name}</div>
                                            <span className="no-print" style={{ 
                                                display: 'inline-block',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                                backgroundColor: '#F1F5F9',
                                                color: '#64748B',
                                                fontSize: '0.68rem',
                                                fontWeight: '600',
                                                marginTop: '2px'
                                            }}>
                                                Costo base: ${formatPrice(Math.ceil(item.cost))}
                                            </span>
                                        </td>
                                        
                                        {/* Quantity */}
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                            <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                                <input 
                                                    type="number" 
                                                    min="0.01" 
                                                    step="any"
                                                    value={item.quantity === undefined || item.quantity === null ? '' : item.quantity} 
                                                    onChange={e => {
                                                        const raw = e.target.value;
                                                        updateQuantity(index, raw === '' ? '' : parseFloat(raw));
                                                    }} 
                                                    style={{ width: '50px', padding: '0.25rem', textAlign: 'center', borderRadius: '4px', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', fontWeight: 'bold', fontSize: '0.8rem' }} 
                                                />
                                                <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>{item.unit}</span>
                                            </div>
                                            <span className="only-print" style={{ fontWeight: '700', color: '#0F172A', fontSize: '7.8pt' }}>{parseFloat(item.quantity) || 0} {item.unit}</span>
                                        </td>
                                        
                                        {/* IVA (No-print) */}
                                        <td className="no-print" style={{ padding: '0.45rem 0.5rem', textAlign: 'center', color: '#475569', fontSize: '0.78rem', fontWeight: '600' }}>
                                            {item.iva_rate || 0}%
                                        </td>
                                        
                                        {/* Margin (No-print) */}
                                        <td className="no-print" style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                <input 
                                                    type="number" 
                                                    value={item.margin === undefined || item.margin === null ? '' : item.margin} 
                                                    onChange={e => {
                                                        const raw = e.target.value;
                                                        if (raw === '') {
                                                            handleMarginChange(index, '');
                                                            return;
                                                        }
                                                        if (raw === '-') {
                                                            handleMarginChange(index, '-');
                                                            return;
                                                        }
                                                        const val = parseFloat(raw);
                                                        if (!isNaN(val)) {
                                                            handleMarginChange(index, val);
                                                        }
                                                    }} 
                                                    style={{ width: '45px', padding: '0.25rem', textAlign: 'center', borderRadius: '4px', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', fontWeight: 'bold', fontSize: '0.8rem' }} 
                                                />
                                                <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 'bold' }}>%</span>
                                            </div>
                                        </td>
                                        
                                        {/* Unit Price */}
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                            <div className="no-print">
                                                <input 
                                                    type="number" 
                                                    min="0"
                                                    step="any"
                                                    value={item.price === undefined || item.price === null ? '' : item.price} 
                                                    onChange={e => {
                                                        const raw = e.target.value;
                                                        if (raw === '') {
                                                            handlePriceChange(index, '');
                                                            return;
                                                        }
                                                        const val = parseFloat(raw);
                                                        if (!isNaN(val)) {
                                                            handlePriceChange(index, val);
                                                        }
                                                    }} 
                                                    style={{ width: '75px', padding: '0.25rem', textAlign: 'right', borderRadius: '4px', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', fontWeight: 'bold', fontSize: '0.8rem' }} 
                                                />
                                            </div>
                                            <span className="only-print num-cell" style={{ fontWeight: '600', color: '#0F172A', fontSize: '7.8pt' }}>${formatPrice(Math.ceil(parseFloat(item.price) || 0))}</span>
                                        </td>
                                        
                                        {/* Total */}
                                        <td className="num-cell" style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: '700', color: '#0F172A', fontSize: '0.84rem' }}>
                                            ${formatPrice(Math.ceil(parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0))}
                                        </td>
                                        
                                        {/* Action Button (No-print) */}
                                        <td className="no-print" style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                            <button 
                                                onClick={() => removeItem(index)} 
                                                style={{ color: '#EF4444', border: 'none', background: '#FEE2E2', cursor: 'pointer', fontWeight: 'bold', width: '20px', height: '20px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s', fontSize: '0.8rem' }}
                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FCA5A5'}
                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                                            >
                                                ×
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {/* Totals Rows inside tbody so they only print once at the end */}
                            <tr style={{ borderTop: '1.5px solid #CBD5E1', color: '#475569' }}>
                                <td colSpan={4}></td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: '600', fontSize: '0.8rem' }}>Subtotal</td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: '700', fontSize: '0.9rem', color: '#0F172A' }}>
                                    ${formatPrice(items.reduce((sum, i) => sum + (Math.ceil(parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0))}
                                </td>
                                <td></td>
                            </tr>
                            <tr style={{ color: '#64748B' }}>
                                <td colSpan={4}></td>
                                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontWeight: '500', fontSize: '0.75rem' }}>Impuestos (IVA)</td>
                                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontWeight: '600', fontSize: '0.85rem' }}>
                                    ${formatPrice(items.reduce((sum, i) => sum + (Math.ceil(parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)) * ((i.iva_rate || 0)/100), 0))}
                                </td>
                                <td></td>
                            </tr>
                            <tr style={{ backgroundColor: '#F8FAFC', color: '#0F172A', borderTop: '1px solid #E2E8F0' }}>
                                <td colSpan={4}></td>
                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: '900', fontSize: '0.85rem' }}>Total</td>
                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: '900', fontSize: '1.15rem', color: appSettings.primary_color || '#15803D' }}>
                                    ${formatPrice(
                                        items.reduce((sum, i) => sum + (Math.ceil(parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0) + 
                                        items.reduce((sum, i) => sum + (Math.ceil(parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)) * ((i.iva_rate || 0) / 100), 0)
                                    )}
                                </td>
                                <td></td>
                            </tr>
                        </tbody>
                        <tfoot className="only-print print-spacer-tfoot" style={{ display: 'none' }}>
                            <tr style={{ border: 'none' }}>
                                <td colSpan={6} style={{ height: '48px', border: 'none', padding: 0 }}></td>
                            </tr>
                        </tfoot>
                    </table>

                    <div className="no-print" style={{ marginTop: '2rem', padding: '2rem', backgroundColor: '#F9FAFB', borderRadius: '8px', border: '1px dashed #D1D5DB' }}>
                        <h3 style={{ marginTop: 0 }}>Agregar Producto</h3>
                        <div style={{ position: 'relative' }}>
                            <input placeholder="Buscar producto por nombre o ID contable..." value={searchTerm} onChange={e => handleSearch(e.target.value)} disabled={!selectedModelId} style={{ width: '100%', padding: '1rem' }} />
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
                    {/* Print-only Footer for Page Numbers inside #quote-document */}
                    <footer className="print-footer only-print">
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5pt', color: '#94A3B8', borderTop: '1px solid #E2E8F0', paddingTop: '4px' }}>
                            <span>{appSettings.provider_legal_name || 'Investments Cortés S.A.S.'} | contacto@investmentscortes.com</span>
                            <span className="print-page-number"></span>
                        </div>
                    </footer>
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
            <style dangerouslySetInnerHTML={{ __html: `
                @media print { 
                    .no-print { display: none !important; } 
                    .only-print { display: block !important; }
                    body { background-color: white !important; padding: 0 !important; margin: 0 !important; font-size: 8.5pt !important; line-height: 1.3 !important; }
                    #quote-document { 
                        box-shadow: none !important; 
                        border: none !important; 
                        width: 100% !important; 
                        margin: 0 !important; 
                        padding: 1.5cm !important;
                        min-height: auto !important;
                        position: static !important;
                        overflow: visible;
                    }
                    table { border-collapse: collapse !important; }
                    thead { display: table-header-group !important; }
                    tfoot { display: table-row-group !important; }
                    .print-spacer-tfoot { display: none !important; }
                    .print-footer { display: none !important; }
                    tr { page-break-inside: avoid !important; }
                    th, td { padding: 4px 6px !important; font-size: 8.5pt !important; line-height: 1.3 !important; }
                    h1 { font-size: 14pt !important; }
                    h2, h3, h4 { font-size: 10pt !important; }
                    p, span, div { font-size: 8.5pt !important; }
                    @page { 
                        size: letter portrait; 
                        margin: 1.5cm 1.5cm 2cm 1.5cm;
                        @bottom-left {
                            content: "${appSettings.provider_legal_name || 'Investments Cortés S.A.S.'}";
                            font-size: 7.5pt;
                            color: #94A3B8;
                            font-family: system-ui, sans-serif;
                            border-top: 1px solid #E2E8F0;
                            padding-top: 4px;
                        }
                        @bottom-right {
                            content: "Página " counter(page) " de " counter(pages);
                            font-size: 7.5pt;
                            color: #94A3B8;
                            font-family: system-ui, sans-serif;
                            border-top: 1px solid #E2E8F0;
                            padding-top: 4px;
                        }
                    }
                }
                .only-print { display: none !important; }
                .print-footer { display: none !important; }
            ` }} />

        </main>
    );
}

export default function CreateQuotePage() {
    return (
        <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: '#64748B' }}>Cargando creador de cotizaciones...</div>}>
            <CreateQuotePageContent />
        </Suspense>
    );
}
