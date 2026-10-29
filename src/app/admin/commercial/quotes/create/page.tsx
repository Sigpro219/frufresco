'use client';

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { GENERAL_INSTITUCIONAL_ID } from '@/lib/pricingUtils';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { THEME } from '@/lib/adminTheme';
import Letterhead from '@/components/Letterhead';
import {
    Sparkles,
    Search,
    CircleDot,
    Printer,
    Save,
    Package,
    AlertTriangle,
    Plus,
    Trash2,
    ArrowLeft,
    Building2,
    ShieldCheck,
    Eye,
    Sliders,
    TrendingUp,
    X,
    FileText,
    CheckCircle2
} from 'lucide-react';

const normalizeUnit = (u?: string) => {
    if (!u) return 'Kg';
    const clean = u.trim();
    if (clean.toLowerCase() === 'atado') return 'Kg';
    return clean;
};

const formatCategoryTitle = (cat?: string) => {
    if (!cat) return 'Otros Productos';
    const c = cat.toUpperCase().trim();
    if (c === 'FR' || c.startsWith('FRUT')) return 'Frutas';
    if (c === 'VE' || c.startsWith('VERD')) return 'Verduras';
    if (c === 'HO' || c.startsWith('HORT')) return 'Hortalizas';
    if (c === 'TU' || c.startsWith('TUBER') || c.startsWith('TUBÉR')) return 'Tubérculos y Plátanos';
    if (c === 'DE' || c.startsWith('DESP') || c.startsWith('ABARR')) return 'Despensa y Abarrotes';
    if (c === 'LA' || c.startsWith('LACT') || c.startsWith('LÁCT')) return 'Lácteos y Derivados';
    if (c === 'CO' || c.startsWith('CONG') || c.startsWith('PULP')) return 'Congelados y Pulpas';
    if (c === 'PR' || c.startsWith('PROC') || c.startsWith('PELAD')) return 'Procesados y Pelados';
    if (c === 'HI' || c.startsWith('HIER')) return 'Hierbas Aromáticas';
    return cat;
};

const CATEGORY_PRIORITY = [
    'Verduras',
    'Frutas',
    'Hortalizas',
    'Tubérculos y Plátanos',
    'Despensa y Abarrotes',
    'Lácteos y Derivados',
    'Congelados y Pulpas',
    'Procesados y Pelados',
    'Hierbas Aromáticas',
    'Otros Productos'
];

const normalizeEntityName = (s?: string) =>
    (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\b(S\.?A\.?S\.?|LTDA\.?|S\.?A\.?|B2B|CLIENTE|LISTA|PLANTILLA)\b/g, '')
        .replace(/[^A-Z0-9]/g, '')
        .trim();

function CreateQuotePageContent() {
    const formatPrice = (value: number) => {
        return new Intl.NumberFormat('es-CO', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(Math.round(value || 0));
    };

    const printDocRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const searchParams = useSearchParams();
    const duplicateFrom = searchParams ? searchParams.get('duplicate_from') : null;

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
    const [selectedModelId, setSelectedModelId] = useState(GENERAL_INSTITUCIONAL_ID);
    const [clientDemandMap, setClientDemandMap] = useState<Map<string, { volume: number; ordersCount: number }>>(new Map());
    const [loadingDemand, setLoadingDemand] = useState(false);

    const [items, setItems] = useState<any[]>([]);
    const [paymentTermsDays, setPaymentTermsDays] = useState(30);
    const [basketFilter, setBasketFilter] = useState('');
    const [viewMode, setViewMode] = useState<'negotiation' | 'print_preview'>('negotiation');
    const [customMarginsAppliedCount, setCustomMarginsAppliedCount] = useState<number>(0);

    // DATA STATE
    const [clients, setClients] = useState<any[]>([]);
    const [leads, setLeads] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [loadingTemplate, setLoadingTemplate] = useState(false);
    const [models, setModels] = useState<any[]>([]);
    const [rules, setRules] = useState<any[]>([]);
    const [baseGiRules, setBaseGiRules] = useState<any[]>([]);
    const [clientSearch, setClientSearch] = useState('');
    const [showClientResults, setShowClientResults] = useState(false);
    const [activeDropdownIndex, setActiveDropdownIndex] = useState(-1);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [nicknames, setNicknames] = useState<any[]>([]);
    const [conversions, setConversions] = useState<any[]>([]);
    const [matrixCosts, setMatrixCosts] = useState<Record<string, number>>({});
    const [saving, setSaving] = useState(false);
    const [quoteNumber, setQuoteNumber] = useState<string | null>(null);
    const [originalQuoteVersion, setOriginalQuoteVersion] = useState<number>(1);
    const [parentQuoteId, setParentQuoteId] = useState<string | null>(null);
    const [inheritedSnapshotName, setInheritedSnapshotName] = useState<string | null>(null);

    // MODAL STATE FOR NEW CLIENT
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [newClient, setNewClient] = useState({
        company_name: '',
        contact_name: '',
        nit: '',
        phone: '',
        address: '',
        role: 'b2b_client' as 'b2b_client' | 'b2c_client',
        pricing_model_id: GENERAL_INSTITUCIONAL_ID
    });

    const [appSettings, setAppSettings] = useState<Record<string, string>>({
        provider_nit: '901.393.217-5',
        provider_legal_name: 'Investments Cortés S.A.S.',
        provider_logo_url: '/logo-investments.png',
        provider_address: 'CL 12 B # 71 D - 31 TO 4 AP 101, Bogotá D.C., Colombia',
        provider_email: 'contacto@investmentscortes.com',
        app_name: 'FruFresco',
        app_logo_url: '',
        primary_color: '#0D7A57',
        secondary_color: '#64748B'
    });

    const fetchClientDemand = async (clientId: string) => {
        if (!clientId) {
            setClientDemandMap(new Map());
            return;
        }
        setLoadingDemand(true);
        try {
            const clientObj = clients.find(c => c.id === clientId);
            const rootId = clientObj?.parent_id || clientId;
            const { data: branches } = await supabase
                .from('profiles')
                .select('id')
                .eq('parent_id', rootId);
            const clientIds = Array.from(new Set([rootId, clientId, ...(branches || []).map(b => b.id)]));

            const cycleStartIso = new Date(Date.now() - 30 * 86400000).toISOString();
            const { data: modelOrders } = await supabase
                .from('orders')
                .select('id')
                .in('profile_id', clientIds)
                .gte('created_at', cycleStartIso)
                .neq('status', 'cancelled');

            const orderIds = (modelOrders || []).map(o => o.id);
            const dMap = new Map<string, { volume: number; ordersCount: number }>();
            if (orderIds.length > 0) {
                for (let i = 0; i < orderIds.length; i += 80) {
                    const slice = orderIds.slice(i, i + 80);
                    const { data: bItems } = await supabase
                        .from('order_items')
                        .select('product_id, quantity')
                        .in('order_id', slice);
                    (bItems || []).forEach((it: any) => {
                        if (!it.product_id) return;
                        if (!dMap.has(it.product_id)) {
                            dMap.set(it.product_id, { volume: 0, ordersCount: 0 });
                        }
                        const rec = dMap.get(it.product_id)!;
                        rec.volume += Number(it.quantity || 0);
                        rec.ordersCount += 1;
                    });
                }
            }
            setClientDemandMap(dMap);
        } catch (err) {
            console.error('Error fetching client demand:', err);
        } finally {
            setLoadingDemand(false);
        }
    };

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
            const { data: qData, error: qErr } = await supabase
                .from('quotes')
                .select('*')
                .eq('id', quoteId)
                .single();

            if (qErr) throw qErr;

            if (qData) {
                setParentQuoteId(qData.id);
                setOriginalQuoteVersion(qData.version || 1);
                setInheritedSnapshotName(qData.model_snapshot_name || null);
                if (qData.client_id) {
                    setSelectedClientId(qData.client_id);
                    fetchClientDemand(qData.client_id);
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

                if (qData.model_id) setSelectedModelId(qData.model_id);
                if (qData.payment_terms_days) {
                    setPaymentTermsDays(qData.payment_terms_days);
                } else {
                    const { data: ptS } = await supabase
                        .from('app_settings')
                        .select('value')
                        .eq('key', `quote_payment_days:${quoteId}`)
                        .maybeSingle();
                    if (ptS?.value && !isNaN(Number(ptS.value))) setPaymentTermsDays(Number(ptS.value));
                }

                const { data: iData, error: iErr } = await supabase
                    .from('quote_items')
                    .select('*, products(name, unit_of_measure, sku, iva_rate, category, accounting_id)')
                    .eq('quote_id', quoteId);

                if (iErr) throw iErr;

                if (iData) {
                    const prodIds = iData.map((it: any) => it.product_id).filter(Boolean);
                    const liveCostMap: Record<string, number> = {};
                    if (prodIds.length > 0) {
                        const { data: liveMatrix } = await supabase
                            .from('commercial_cost_matrix')
                            .select('product_id, manual_cost')
                            .in('product_id', prodIds);
                        (liveMatrix || []).forEach((row: any) => {
                            if (Number(row.manual_cost) > 0) {
                                liveCostMap[row.product_id] = Number(row.manual_cost);
                            }
                        });
                    }

                    const isExpiredRequote = qData.status === 'expired' || (qData.valid_until && new Date(qData.valid_until.split('T')[0] + 'T23:59:59') < new Date());
                    const loadedItems = iData.map((item: any) => {
                        const liveCost = isExpiredRequote ? (liveCostMap[item.product_id] || Number(item.cost_basis) || 0) : (Number(item.cost_basis) || liveCostMap[item.product_id] || 0);
                        const margin = item.margin_percent !== null && item.margin_percent !== undefined ? Number(item.margin_percent) : 25;
                        const recalculatedPrice = isExpiredRequote && liveCost > 0
                            ? Math.ceil((liveCost * (1 + margin / 100)) / 50) * 50
                            : (Number(item.unit_price) || (liveCost > 0 ? Math.ceil((liveCost * (1 + margin / 100)) / 50) * 50 : 0));
                        return {
                            product_id: item.product_id,
                            variant_id: item.variant_id || null,
                            name: item.product_name || item.products?.name || 'Producto',
                            sku: item.sku || item.products?.sku || '',
                            accounting_id: item.products?.accounting_id || item.sku || item.product_id?.slice(0, 8),
                            category: item.products?.category || 'Otros Productos',
                            unit: normalizeUnit(item.unit_of_measure || item.products?.unit_of_measure || 'Kg'),
                            cost: liveCost,
                            margin: margin,
                            has_custom_margin: true,
                            variant_adjustment: 0,
                            price: recalculatedPrice,
                            iva_rate: item.iva_rate ?? item.products?.iva_rate ?? 0,
                            quantity: item.quantity || 1
                        };
                    });
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
            const { data: sData } = await supabase.from('app_settings').select('*');
            if (sData) {
                const settingsMap: Record<string, string> = {};
                sData.forEach((s: any) => { settingsMap[s.key] = s.value; });
                setAppSettings(prev => ({ ...prev, ...settingsMap }));
            }

            const { data: mData } = await supabase.from('pricing_models').select('*').order('name');
            if (mData && mData.length > 0) {
                setModels(mData);
                // SDD Escenario 269.1: Línea Base Inicial hereda de General Institucional Dinámico
                const giModel = mData.find((m: any) => m.id === GENERAL_INSTITUCIONAL_ID) || mData[0];
                if (!duplicateFrom) {
                    setSelectedModelId(giModel.id);
                }
            }

            const { data: cData } = await supabase
                .from('profiles')
                .select('id, company_name, razon_social, contact_name, nit, phone, contact_phone, email, address, pricing_model_id, parent_id, role, payment_days')
                .in('role', ['b2b_client', 'b2c_client'])
                .order('company_name');
            if (cData) setClients(cData || []);

            const { data: lData } = await supabase
                .from('leads')
                .select('id, company_name, contact_name, phone, email, business_type, business_size, nit, address, municipality')
                .order('company_name');
            if (lData) setLeads(lData || []);

            const { data: tData } = await supabase.from('quote_templates').select('*').order('name');
            if (tData) setTemplates(tData || []);

            const { data: convData } = await supabase.from('product_conversions').select('*');
            if (convData) setConversions(convData || []);

            const { data: matrixRows } = await supabase
                .from('commercial_cost_matrix')
                .select('product_id, manual_cost')
                .eq('is_active', true);
            if (matrixRows) {
                const mMap: Record<string, number> = {};
                matrixRows.forEach((r: any) => {
                    if (r.manual_cost && Number(r.manual_cost) > 0) {
                        mMap[r.product_id] = Number(r.manual_cost);
                    }
                });
                setMatrixCosts(mMap);
            }

            const { data: latestQuotes } = await supabase
                .from('quotes')
                .select('quote_number')
                .order('quote_number', { ascending: false })
                .limit(1);
            const nextNum = latestQuotes && latestQuotes.length > 0 ? (latestQuotes[0].quote_number + 1) : 1;
            setQuoteNumber(String(nextNum));
        } catch (err) {
            console.error('Error in fetchInitialData:', err);
        }
    };

    useEffect(() => {
        if (selectedModelId) {
            fetchRules(selectedModelId);
        }
    }, [selectedModelId]);

    const fetchRules = async (modelId: string) => {
        const { data } = await supabase.from('pricing_rules').select('*').eq('model_id', modelId);
        if (data) setRules(data || []);
        if (modelId !== GENERAL_INSTITUCIONAL_ID) {
            const { data: giData } = await supabase.from('pricing_rules').select('*').eq('model_id', GENERAL_INSTITUCIONAL_ID);
            if (giData) setBaseGiRules(giData || []);
        } else {
            setBaseGiRules([]);
        }
    };

    const getMarginForProduct = (productId: string, modelId: string, loadedRules: any[]) => {
        const model = models.find(m => m.id === modelId);
        if (!model) return 34.5;
        let margin = Number(model.base_margin_percent) || 0;
        const rule = loadedRules.find((r: any) => r.product_id === productId);
        if (rule) {
            margin += Number(rule.margin_adjustment) || 0;
        } else if (modelId !== GENERAL_INSTITUCIONAL_ID) {
            const giRule = baseGiRules.find((r: any) => r.product_id === productId);
            if (giRule) {
                margin += Number(giRule.margin_adjustment) || 0;
            }
        }
        return Math.round(margin * 10) / 10;
    };

    useEffect(() => {
        if (items.length > 0 && selectedModelId) {
            setItems(prev => prev.map(item => {
                if (item.has_custom_margin) return item;
                const margin = getMarginForProduct(item.product_id, selectedModelId, rules);
                const price = calculateFinalPrice(item.cost, margin);
                return { ...item, margin, price };
            }));
        }
    }, [rules]);

    const calculateFinalPrice = (cost: number, marginPercent: number) => {
        if (cost <= 0) return 0;
        const rawPrice = cost * (1 + (marginPercent || 0) / 100);
        return Math.ceil(rawPrice / 50) * 50;
    };

    const handleClientChange = async (clientId: string) => {
        setSelectedClientId(clientId);
        fetchClientDemand(clientId);
        const client = clients.find(c => c.id === clientId);
        if (client) {
            setClientName(client.company_name || client.contact_name || '');
            if (client.payment_days) {
                setPaymentTermsDays(Number(client.payment_days));
            }
            let resolvedModelId = client.pricing_model_id;
            const parentClient = client.parent_id ? clients.find(c => c.id === client.parent_id) : client;
            if (!resolvedModelId && parentClient) {
                resolvedModelId = parentClient.pricing_model_id;
            }
            const finalModelId = resolvedModelId || GENERAL_INSTITUCIONAL_ID;
            setSelectedModelId(finalModelId);

            try {
                const { data } = await supabase
                    .from('product_nicknames')
                    .select('*')
                    .eq('customer_id', clientId);
                if (data) setNicknames(data);
            } catch {
                setNicknames([]);
            }

            // Conexión automática con Paso 2 (Modelos por Cliente / Canastas):
            // Si el cliente o su Casa Matriz tiene una canasta configurada en quote_templates, cargarla automáticamente
            if (!duplicateFrom && templates.length > 0) {
                const exactNorm = normalizeEntityName(client.company_name);
                const parentNorm = normalizeEntityName(parentClient?.company_name || client.company_name);
                const matchedTemplate = templates.find(t => {
                    const tNorm = normalizeEntityName(t.name);
                    return tNorm.length >= 3 && (tNorm === exactNorm || tNorm === parentNorm || exactNorm.includes(tNorm) || parentNorm.includes(tNorm) || tNorm.includes(parentNorm));
                });
                if (matchedTemplate) {
                    handleTemplateChange(matchedTemplate.id, finalModelId, true);
                }
            }
        } else {
            setClientName('');
            setSelectedModelId(GENERAL_INSTITUCIONAL_ID);
            setNicknames([]);
        }
    };

    const handleLeadChange = (leadId: number) => {
        setSelectedLeadId(leadId);
        setSelectedClientId('');
        setClientDemandMap(new Map());
        const lead = leads.find(l => l.id === leadId);
        if (lead) {
            setClientName(lead.company_name || lead.contact_name || '');
        } else {
            setClientName('');
        }
    };

    const handleTemplateChange = async (templateId: string, overrideModelId?: string, skipClientAutoSelect = false) => {
        setSelectedTemplateId(templateId);
        if (!templateId) {
            setCustomMarginsAppliedCount(0);
            return;
        }

        const activeModelId = overrideModelId || selectedModelId || GENERAL_INSTITUCIONAL_ID;

        // Si el usuario selecciona primero el Modelo por Cliente (Canasta) y aún no ha elegido destinatario,
        // auto-vincular el cliente matriz correspondiente y cargar su demanda de 30 días
        if (!skipClientAutoSelect && !selectedClientId && !selectedLeadId) {
            const tmpl = templates.find(t => t.id === templateId);
            if (tmpl) {
                const tNorm = normalizeEntityName(tmpl.name);
                const matchedClient =
                    clients.find(c => !c.parent_id && normalizeEntityName(c.company_name) === tNorm) ||
                    clients.find(c => !c.parent_id && (normalizeEntityName(c.company_name).includes(tNorm) || tNorm.includes(normalizeEntityName(c.company_name)))) ||
                    clients.find(c => normalizeEntityName(c.company_name) === tNorm);
                if (matchedClient) {
                    setSelectedClientId(matchedClient.id);
                    setClientName(matchedClient.company_name || matchedClient.contact_name || '');
                    if (matchedClient.payment_days) setPaymentTermsDays(Number(matchedClient.payment_days));
                    fetchClientDemand(matchedClient.id);
                }
            }
        }

        setLoadingTemplate(true);
        try {
            // 1. Fetch template items + custom margins saved in Step 2 (Escenario 275.4: quote_template_margins:{template_id})
            const [{ data: itemData, error: itemsErr }, { data: marginSetting }] = await Promise.all([
                supabase.from('quote_template_items').select('product_id').eq('template_id', templateId),
                supabase.from('app_settings').select('value').eq('key', `quote_template_margins:${templateId}`).maybeSingle()
            ]);

            if (itemsErr) throw itemsErr;
            if (!itemData || itemData.length === 0) {
                alert('La canasta seleccionada no contiene productos.');
                setLoadingTemplate(false);
                return;
            }

            let customMarginsMap: Record<string, number> = {};
            if (marginSetting?.value) {
                try {
                    customMarginsMap = JSON.parse(marginSetting.value) || {};
                } catch {
                    customMarginsMap = {};
                }
            }

            const productIds = itemData.map((it: any) => it.product_id);

            // 2. Fetch products with category and unit
            const { data: products, error: prodErr } = await supabase
                .from('products')
                .select('id, name, unit_of_measure, iva_rate, sku, accounting_id, category')
                .in('id', productIds)
                .eq('is_active', true);

            if (prodErr) throw prodErr;

            // 3. Fallback purchases for any SKU not in matrixCosts
            const { data: purchases } = await supabase
                .from('purchases')
                .select('product_id, unit_price, purchase_unit, created_at')
                .in('product_id', productIds)
                .order('created_at', { ascending: false });

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

            let customApplied = 0;
            const loadedItems = [];
            for (const p of products || []) {
                let cost = matrixCosts[p.id] || 0;
                if (!cost) {
                    const prodPurchases = purchasesMap.get(p.id) || [];
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
                        cost = count > 0 ? totalNormalizedCost / count : 0;
                    }
                }

                // Prioridad 1: Utilidad personalizada del Modelo por Cliente (Paso 2 SDD Escenario 275.4)
                // Prioridad 2: Utilidad del Modelo Estándar (General Institucional Dinámico)
                let baseMargin: number;
                if (customMarginsMap[p.id] !== undefined && !isNaN(Number(customMarginsMap[p.id]))) {
                    baseMargin = Number(customMarginsMap[p.id]);
                    customApplied++;
                } else {
                    baseMargin = getMarginForProduct(p.id, activeModelId, rules);
                }

                const finalPrice = calculateFinalPrice(cost, baseMargin);

                loadedItems.push({
                    product_id: p.id,
                    variant_id: null,
                    name: p.name,
                    sku: p.sku,
                    accounting_id: p.accounting_id || p.sku || p.id?.slice(0, 8),
                    category: p.category || 'Otros Productos',
                    unit: normalizeUnit(p.unit_of_measure),
                    cost: cost,
                    margin: baseMargin,
                    has_custom_margin: customMarginsMap[p.id] !== undefined,
                    variant_adjustment: 0,
                    price: finalPrice,
                    iva_rate: p.iva_rate ?? 0,
                    quantity: 1
                });
            }

            setCustomMarginsAppliedCount(customApplied);
            setItems(loadedItems);
        } catch (err: any) {
            console.error('Error loading template:', err);
            alert('Error al cargar canasta: ' + (err.message || err));
        } finally {
            setLoadingTemplate(false);
        }
    };

    const calculateSmartAverageCost = async (productId: string, salesUnit: string) => {
        if (matrixCosts[productId] && matrixCosts[productId] > 0) {
            return matrixCosts[productId];
        }
        try {
            const { data: matrixRow } = await supabase
                .from('commercial_cost_matrix')
                .select('manual_cost')
                .eq('product_id', productId)
                .eq('is_active', true)
                .maybeSingle();
            if (matrixRow?.manual_cost && Number(matrixRow.manual_cost) > 0) {
                return Number(matrixRow.manual_cost);
            }
        } catch {
            // fallback
        }

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
                pricing_model_id: GENERAL_INSTITUCIONAL_ID
            });
        } catch (err: any) {
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
                id, name, unit_of_measure, iva_rate, accounting_id, category,
                product_variants (*)
            `)
            .eq('is_active', true)
            .or(`name.ilike.%${term}%,accounting_id.ilike.%${term}%`)
            .limit(12);

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
        const rawFinalPrice = basePrice * (1 + (variantAdjustment / 100));
        const finalPrice = Math.ceil(rawFinalPrice / 50) * 50;
        const ivaRate = product.iva_rate ?? 0;

        const clientNickname = nicknames.find(n => n.product_id === product.id);
        const displayName = clientNickname
            ? clientNickname.nickname
            : (variant ? `${product.name} (${Object.values(variant.options).join(' / ')})` : product.name);

        setItems(prev => [
            ...prev,
            {
                product_id: product.id,
                variant_id: variant?.id || null,
                name: displayName,
                accounting_id: product.accounting_id || product.id?.slice(0, 8),
                category: product.category || 'Otros Productos',
                unit: normalizeUnit(product.unit_of_measure),
                cost: cost,
                margin: baseMargin,
                variant_adjustment: variantAdjustment,
                price: finalPrice,
                iva_rate: ivaRate,
                quantity: 1
            }
        ]);
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
            const calcPrice = calculateFinalPrice(newItems[index].cost, numMargin);
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
            if (validPrice > 0 && newItems[index].cost > 0) {
                newItems[index].margin = Math.round(((validPrice - newItems[index].cost) / newItems[index].cost) * 1000) / 10;
            } else if (validPrice > 0 && newItems[index].cost <= 0) {
                newItems[index].margin = 100;
            } else {
                newItems[index].margin = 0;
            }
        }
        setItems(newItems);
    };

    const saveQuote = async (shouldRedirect = true, targetStatus: 'draft' | 'sent' = 'draft') => {
        if (!clientName) { alert('Selecciona o ingresa el nombre del destinatario de la cotización'); return null; }
        if (!selectedModelId) { alert('Selecciona un Modelo Base de Precios'); return null; }
        if (items.length === 0) { alert('Agrega al menos un producto o selecciona una Canasta'); return null; }

        const invalidQtyItem = items.find(i => (parseFloat(i.quantity) || 0) <= 0);
        if (invalidQtyItem) { alert(`La cantidad para "${invalidQtyItem.name}" debe ser mayor a 0.`); return null; }

        const invalidPriceItem = items.find(i => (parseFloat(i.price) || 0) < 0);
        if (invalidPriceItem) { alert(`El precio unitario para "${invalidPriceItem.name}" no puede ser negativo.`); return null; }

        setSaving(true);
        try {
            const sanitizedItems = items.map(item => ({
                ...item,
                quantity: parseFloat(item.quantity) || 0,
                price: parseFloat(item.price) || 0,
                margin: parseFloat(item.margin) || 0,
                cost: parseFloat(item.cost) || 0
            }));

            const subtotal = sanitizedItems.reduce((sum, i) => sum + (Math.ceil(i.price) * i.quantity), 0);
            const totalTax = sanitizedItems.reduce((sum, i) => sum + (Math.ceil(i.price) * i.quantity) * ((i.iva_rate || 0) / 100), 0);
            const totalAmount = subtotal + totalTax;

            const selectedModel = models.find(m => m.id === selectedModelId);
            const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
            const snapshotLabel = selectedTemplate
                ? `${selectedTemplate.name} (${selectedModel?.name || 'Institucional'})`
                : (inheritedSnapshotName || selectedModel?.name || 'General Institucional');

            const { data: quote, error: qError } = await supabase
                .from('quotes')
                .insert({
                    client_id: selectedClientId || null,
                    lead_id: selectedLeadId || null,
                    client_name: clientName,
                    model_id: selectedModelId,
                    model_snapshot_name: snapshotLabel,
                    subtotal_amount: subtotal,
                    total_tax_amount: totalTax,
                    total_amount: totalAmount,
                    status: targetStatus,
                    start_date: new Date().toISOString().split('T')[0],
                    valid_until: (() => { const d = new Date(); d.setDate(d.getDate() + 8); return d.toISOString().split('T')[0]; })(),
                    parent_quote_id: parentQuoteId,
                    version: parentQuoteId ? originalQuoteVersion + 1 : 1,
                })
                .select()
                .single();

            if (qError) throw qError;
            try {
                await supabase.from('app_settings').upsert({
                    key: `quote_payment_days:${quote.id}`,
                    value: String(paymentTermsDays ?? 30),
                    description: `Plazo de pago cotización ${quote.quote_number || quote.id}`
                });
            } catch (ptErr) {
                console.warn(ptErr);
            }

            if (selectedClientId && paymentTermsDays) {
                try {
                    await supabase
                        .from('profiles')
                        .update({ payment_days: paymentTermsDays })
                        .eq('id', selectedClientId);
                } catch (profErr) {
                    console.warn('Notice: Could not sync payment_days to profile:', profErr);
                }
            }

            if (selectedLeadId) {
                try {
                    await supabase
                        .from('leads')
                        .update({ status: 'contacted', last_contact_date: new Date().toISOString() })
                        .eq('id', selectedLeadId);
                } catch (leadErr) {
                    console.warn('Notice: Could not update lead status to contacted:', leadErr);
                }
            }

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
                await supabase.from('quotes').delete().eq('id', quote.id);
                throw itemErr;
            }

            if (duplicateFrom) {
                await supabase
                    .from('quotes')
                    .update({ status: 'superseded' })
                    .eq('id', duplicateFrom);
            }

            if (shouldRedirect) {
                router.push('/admin/commercial?tab=operations&subtab=quotes');
            } else {
                setQuoteNumber(quote.quote_number || 'SAVED');
                return quote;
            }
        } catch (err: any) {
            const errMsg = err?.message || err?.error_description || JSON.stringify(err);
            alert('Error guardando cotización: ' + errMsg);
            return null;
        } finally {
            setSaving(false);
        }
    };

    const handleEmitAndPrint = async () => {
        const savedQuote = await saveQuote(false, 'sent');
        if (!savedQuote || !savedQuote.id) return;
        window.open(`/admin/commercial/quotes/${savedQuote.id}/print`, '_blank');
        router.push('/admin/commercial?tab=operations&subtab=quotes');
    };

    const selectedClientInfo = clients.find(c => c.id === selectedClientId);
    const selectedLeadInfo = leads.find(l => l.id === selectedLeadId);
    const selectedModelObj = models.find(m => m.id === selectedModelId);
    const selectedTemplateObj = templates.find(t => t.id === selectedTemplateId);

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
        ...filteredClients.slice(0, 25).map(c => ({ type: 'client' as const, id: c.id, label: c.company_name || c.contact_name, c })),
        ...filteredLeads.slice(0, 15).map(l => ({ type: 'lead' as const, id: l.id, label: l.company_name || l.contact_name, l })),
        ...(clientSearch.trim() ? [{ type: 'manual' as const, label: `+ Usar "${clientSearch}" como destinatario manual` }] : []),
        { type: 'new_client' as const, label: 'Registrar cliente nuevo oficial' }
    ];

    // Agrupación jerárquica por Categoría Agrícola (SDD §7.15.F.2) preservando _originalIndex para edición sin saltos
    const groupedCategories = useMemo(() => {
        const catMap = new Map<string, any[]>();
        const term = basketFilter.trim().toLowerCase();

        items.forEach((item, originalIndex) => {
            if (term) {
                const matchName = (item.name || '').toLowerCase().includes(term);
                const matchId = String(item.accounting_id || '').toLowerCase().includes(term);
                const matchCat = (item.category || '').toLowerCase().includes(term);
                if (!matchName && !matchId && !matchCat) return;
            }
            const catTitle = formatCategoryTitle(item.category);
            if (!catMap.has(catTitle)) {
                catMap.set(catTitle, []);
            }
            catMap.get(catTitle)!.push({ ...item, _originalIndex: originalIndex });
        });

        const groups: { category: string; items: any[] }[] = [];
        catMap.forEach((groupItems, category) => {
            groupItems.sort((a, b) =>
                (a.name || '').toString().localeCompare((b.name || '').toString(), 'es', { numeric: true, sensitivity: 'base' })
            );
            groups.push({ category, items: groupItems });
        });

        groups.sort((a, b) => {
            const idxA = CATEGORY_PRIORITY.indexOf(a.category);
            const idxB = CATEGORY_PRIORITY.indexOf(b.category);
            const prioA = idxA !== -1 ? idxA : 999;
            const prioB = idxB !== -1 ? idxB : 999;
            if (prioA !== prioB) return prioA - prioB;
            return a.category.localeCompare(b.category, 'es');
        });

        return groups;
    }, [items, basketFilter]);

    // Telemetría Financiera y de Negociación (Escenario 269 & 275.3 SDD)
    const telemetry = useMemo(() => {
        let subtotal = 0;
        let totalTax = 0;
        let totalCostQuoted = 0;
        let totalDemand30dVolume = 0;
        let totalProjectedMonthlyProfit = 0;
        let totalProjectedMonthlyRevenue = 0;

        items.forEach(i => {
            const qty = parseFloat(i.quantity) || 0;
            const price = Math.ceil(parseFloat(i.price) || 0);
            const cost = parseFloat(i.cost) || 0;
            const iva = parseFloat(i.iva_rate) || 0;

            subtotal += price * qty;
            totalTax += (price * qty) * (iva / 100);
            totalCostQuoted += cost * qty;

            const demand = clientDemandMap.get(i.product_id);
            const vol30d = demand?.volume || 0;
            totalDemand30dVolume += vol30d;

            const effectiveVol = vol30d > 0 ? vol30d : qty;
            totalProjectedMonthlyProfit += effectiveVol * (price - cost);
            totalProjectedMonthlyRevenue += effectiveVol * price;
        });

        const weightedMarginPct = totalProjectedMonthlyRevenue > 0
            ? ((totalProjectedMonthlyProfit / totalProjectedMonthlyRevenue) * 100)
            : (subtotal > 0 ? (((subtotal - totalCostQuoted) / subtotal) * 100) : 0);

        return {
            subtotal,
            totalTax,
            totalAmount: subtotal + totalTax,
            totalDemand30dVolume: Math.round(totalDemand30dVolume * 10) / 10,
            totalProjectedMonthlyProfit: Math.round(totalProjectedMonthlyProfit),
            weightedMarginPct: Math.round(weightedMarginPct * 10) / 10
        };
    }, [items, clientDemandMap]);

    const docNumberStr = quoteNumber ? formatQuoteNumber(Number(quoteNumber)) : 'COT BORRADOR';
    const clientDisplayName = selectedClientInfo?.razon_social || selectedClientInfo?.company_name || clientName || selectedLeadInfo?.company_name || 'Pendiente Seleccionar Cliente';
    const clientNit = selectedClientInfo?.nit || selectedLeadInfo?.nit || 'Por definir en formalización';
    const clientContact = selectedClientInfo?.contact_name || selectedLeadInfo?.contact_name || 'Comité de Compras';
    const clientPhone = selectedClientInfo?.contact_phone || selectedClientInfo?.phone || selectedLeadInfo?.phone || 'Sin registrar';
    const clientEmail = selectedClientInfo?.email || selectedLeadInfo?.email || 'contacto@cliente.com';
    const clientAddress = selectedClientInfo?.address || selectedLeadInfo?.address || 'Bogotá D.C., Colombia';
    const validityUntilDate = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 8);
        return d.toLocaleDateString('es-CO');
    })();

    let globalRowCounter = 0;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F1F5F9', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif', paddingBottom: '4rem' }}>
            {/* Override para permitir que Letterhead opere a 1600px en modo Mesa de Negociación y a 215.9mm en Vista Carta */}
            <style dangerouslySetInnerHTML={{ __html: `
                .letterhead-container.quote-workspace-wide {
                    width: 100% !important;
                    max-width: 1600px !important;
                    margin: 0 auto !important;
                    padding: 1.5rem 2rem !important;
                    border-radius: 14px !important;
                    overflow: visible !important;
                }
                .letterhead-container.quote-workspace-wide table {
                    font-size: 0.82rem !important;
                }
                .letterhead-container.quote-workspace-wide th {
                    font-size: 0.7rem !important;
                    padding: 8px 10px !important;
                }
                .letterhead-container.quote-workspace-wide td {
                    font-size: 0.82rem !important;
                    padding: 6px 10px !important;
                }
            ` }} />

            <div style={{ width: '96%', maxWidth: '1600px', margin: '0 auto', paddingTop: '1.25rem' }}>
                {/* BARRA DE NAVEGACIÓN Y PIPELINE (PASO 3: COTIZACIONES) */}
                <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Link
                            href="/admin/commercial?tab=operations&subtab=quotes"
                            style={{
                                textDecoration: 'none',
                                color: '#334155',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                backgroundColor: 'white',
                                padding: '0.45rem 0.9rem',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                            }}
                        >
                            <ArrowLeft size={15} /> Volver a Cotizaciones
                        </Link>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', backgroundColor: '#DCFCE7', color: '#065F46', padding: '2px 8px', borderRadius: '5px', border: '1px solid #86EFAC' }}>
                                    Paso 3 del Pipeline Comercial
                                </span>
                                {parentQuoteId && (
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, backgroundColor: '#FEF3C7', color: '#B45309', padding: '2px 8px', borderRadius: '5px', border: '1px solid #FDE68A' }}>
                                        Recotización Dinámica v{originalQuoteVersion + 1} (Costos Vivos Hoy)
                                    </span>
                                )}
                            </div>
                            <h1 style={{ margin: '2px 0 0 0', fontSize: '1.35rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>
                                {parentQuoteId ? 'Recotizar Propuesta con Costos de Hoy' : 'Generador de Cotización & Mesa de Negociación B2B'}
                            </h1>
                        </div>
                    </div>

                    {/* BOTONERA DE MODO Y GUARDADO */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'inline-flex', backgroundColor: '#E2E8F0', padding: '3px', borderRadius: '9px' }}>
                            <button
                                type="button"
                                onClick={() => setViewMode('negotiation')}
                                style={{
                                    padding: '0.4rem 0.85rem',
                                    borderRadius: '7px',
                                    border: 'none',
                                    backgroundColor: viewMode === 'negotiation' ? 'white' : 'transparent',
                                    color: viewMode === 'negotiation' ? '#0D7A57' : '#475569',
                                    fontWeight: 800,
                                    fontSize: '0.76rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    boxShadow: viewMode === 'negotiation' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                <Sliders size={13} /> Mesa de Negociación (1600px)
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('print_preview')}
                                style={{
                                    padding: '0.4rem 0.85rem',
                                    borderRadius: '7px',
                                    border: 'none',
                                    backgroundColor: viewMode === 'print_preview' ? 'white' : 'transparent',
                                    color: viewMode === 'print_preview' ? '#0F172A' : '#475569',
                                    fontWeight: 800,
                                    fontSize: '0.76rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    boxShadow: viewMode === 'print_preview' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                <Eye size={13} /> Vista Documento Cliente (Carta)
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => saveQuote(true, 'draft')}
                            disabled={saving}
                            style={{
                                padding: '0.55rem 1rem',
                                backgroundColor: 'white',
                                color: '#334155',
                                border: '1px solid #CBD5E1',
                                borderRadius: '9px',
                                fontWeight: 800,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <Save size={15} /> {saving ? 'Guardando...' : 'Guardar Borrador'}
                        </button>

                        <button
                            type="button"
                            onClick={handleEmitAndPrint}
                            disabled={saving}
                            style={{
                                padding: '0.55rem 1.2rem',
                                backgroundColor: '#0D7A57',
                                color: 'white',
                                border: 'none',
                                borderRadius: '9px',
                                fontWeight: 800,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)'
                            }}
                        >
                            <Printer size={15} /> Emitir e Imprimir PDF Oficial
                        </button>
                    </div>
                </div>

                {/* CONSOLA DE CONFIGURACIÓN EN 3 BLOQUES LÓGICOS DEL PIPELINE */}
                <div className="no-print" style={{
                    backgroundColor: 'white',
                    padding: '1rem 1.25rem',
                    borderRadius: '14px',
                    border: '1px solid #CBD5E1',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    marginBottom: '0.9rem',
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1.3fr 0.7fr',
                    gap: '1.25rem',
                    alignItems: 'start'
                }}>
                    {/* BLOQUE 1: DESTINATARIO (CLIENTE B2B O LEAD CRM) */}
                    <div style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <label style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                1. Destinatario (Cliente Institucional / Prospecto CRM)
                            </label>
                            <button
                                type="button"
                                onClick={() => setIsClientModalOpen(true)}
                                style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '5px', background: '#ECFDF5', color: '#0D7A57', border: '1px solid #A7F3D0', cursor: 'pointer', fontWeight: 800 }}
                            >
                                + Nuevo Cliente
                            </button>
                        </div>

                        {!selectedClientId && !selectedLeadId ? (
                            <div style={{ position: 'relative' }}>
                                <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar cliente B2B, NIT, sucursal o prospecto CRM..."
                                    value={clientSearch}
                                    onChange={(e) => {
                                        setClientSearch(e.target.value);
                                        setClientName(e.target.value);
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
                                                    setClientDemandMap(new Map());
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
                                    style={{ width: '100%', height: '38px', paddingLeft: '34px', paddingRight: '12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', backgroundColor: '#F8FAFC', outline: 'none' }}
                                />
                                {showClientResults && (
                                    <div
                                        id="client-search-dropdown"
                                        onMouseLeave={() => setShowClientResults(false)}
                                        style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            right: 0,
                                            backgroundColor: 'white',
                                            border: '1px solid #CBD5E1',
                                            borderRadius: '10px',
                                            boxShadow: '0 12px 24px -4px rgba(0,0,0,0.12)',
                                            zIndex: 90,
                                            marginTop: '4px',
                                            maxHeight: '280px',
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
                                                        onMouseEnter={() => setActiveDropdownIndex(idx)}
                                                        style={{
                                                            padding: '0.6rem 0.85rem',
                                                            cursor: 'pointer',
                                                            borderBottom: '1px solid #F1F5F9',
                                                            backgroundColor: isActive ? '#F0FDF4' : 'transparent'
                                                        }}
                                                    >
                                                        <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0F172A' }}>
                                                            <span style={{ color: '#0D7A57', marginRight: '5px', fontSize: '0.72rem', fontWeight: 800 }}>[CLIENTE]</span>
                                                            {c.company_name || c.contact_name}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                            NIT: {c.nit || 'S/N'} &bull; {c.contact_name || 'Sin contacto'}
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
                                                        onMouseEnter={() => setActiveDropdownIndex(idx)}
                                                        style={{
                                                            padding: '0.6rem 0.85rem',
                                                            cursor: 'pointer',
                                                            borderBottom: '1px solid #F1F5F9',
                                                            backgroundColor: isActive ? '#EFF6FF' : 'transparent'
                                                        }}
                                                    >
                                                        <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0F172A' }}>
                                                            <span style={{ color: '#2563EB', marginRight: '5px', fontSize: '0.72rem', fontWeight: 800 }}>[PROSPECTO CRM]</span>
                                                            {l.company_name || l.contact_name}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                            {l.nit ? `NIT: ${l.nit} • ` : ''}Tel: {l.phone || 'S/T'}
                                                        </div>
                                                    </div>
                                                );
                                            } else if (item.type === 'manual') {
                                                return (
                                                    <div
                                                        key="manual-option"
                                                        onClick={() => {
                                                            setClientName(clientSearch);
                                                            setSelectedClientId('');
                                                            setClientDemandMap(new Map());
                                                            setSelectedLeadId(null);
                                                            setShowClientResults(false);
                                                        }}
                                                        style={{
                                                            padding: '0.6rem 0.85rem',
                                                            cursor: 'pointer',
                                                            backgroundColor: '#F0FDFA',
                                                            color: '#0F766E',
                                                            fontWeight: 800,
                                                            fontSize: '0.8rem',
                                                            textAlign: 'center'
                                                        }}
                                                    >
                                                        {item.label}
                                                    </div>
                                                );
                                            } else if (item.type === 'new_client') {
                                                return (
                                                    <div
                                                        key="new-client-option"
                                                        onClick={() => {
                                                            setNewClient(prev => ({ ...prev, company_name: clientSearch, contact_name: clientSearch }));
                                                            setIsClientModalOpen(true);
                                                            setShowClientResults(false);
                                                        }}
                                                        style={{
                                                            padding: '0.6rem 0.85rem',
                                                            cursor: 'pointer',
                                                            backgroundColor: '#EFF6FF',
                                                            color: '#1D4ED8',
                                                            fontWeight: 800,
                                                            fontSize: '0.8rem',
                                                            textAlign: 'center',
                                                            borderTop: '1px solid #DBEAFE'
                                                        }}
                                                    >
                                                        + Registrar cliente nuevo oficial
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.5rem 0.85rem',
                                backgroundColor: selectedLeadId ? '#EFF6FF' : '#F0FDF4',
                                borderRadius: '8px',
                                border: `1px solid ${selectedLeadId ? '#BFDBFE' : '#BBF7D0'}`
                            }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '0.66rem', fontWeight: 900, textTransform: 'uppercase', color: selectedLeadId ? '#1D4ED8' : '#0D7A57' }}>
                                            {selectedLeadId ? `Prospecto CRM #${selectedLeadId}` : 'Cliente Institucional'}
                                        </span>
                                        {selectedClientInfo?.nit && (
                                            <span style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 700 }}>
                                                &bull; NIT: {selectedClientInfo.nit}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {clientName}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedClientId('');
                                        setClientDemandMap(new Map());
                                        setSelectedLeadId(null);
                                        setClientName('');
                                        setClientSearch('');
                                    }}
                                    style={{ background: '#FEE2E2', color: '#B91C1C', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                                >
                                    Cambiar
                                </button>
                            </div>
                        )}
                    </div>

                    {/* BLOQUE 2: CONEXIÓN AL PASO 2 DEL PIPELINE (MODELO BASE + MODELO POR CLIENTE / CANASTA) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: '0.75rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                                2A. Modelo Estándar (Línea Base)
                            </label>
                            <select
                                value={selectedModelId}
                                onChange={e => setSelectedModelId(e.target.value)}
                                style={{ width: '100%', height: '38px', padding: '0 0.65rem', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}
                            >
                                {models.map(m => (
                                    <option key={m.id} value={m.id}>
                                        {m.name} (Base: {m.base_margin_percent}%)
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                <label style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    2B. Modelo por Cliente / Canasta
                                </label>
                                {customMarginsAppliedCount > 0 && (
                                    <span style={{ fontSize: '0.66rem', fontWeight: 800, backgroundColor: '#DCFCE7', color: '#065F46', padding: '1px 6px', borderRadius: '4px' }}>
                                        {customMarginsAppliedCount} utilidades cliente activas
                                    </span>
                                )}
                            </div>
                            <select
                                value={selectedTemplateId}
                                onChange={e => handleTemplateChange(e.target.value)}
                                disabled={loadingTemplate}
                                style={{ width: '100%', height: '38px', padding: '0 0.65rem', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: selectedTemplateId ? '#F0FDF4' : '#F8FAFC', fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}
                            >
                                <option value="">{loadingTemplate ? 'Cargando canasta y utilidades...' : '-- Seleccionar Canasta de Cliente --'}</option>
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* BLOQUE 3: CONDICIONES DE CRÉDITO Y VIGENCIA CANÓNICA */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                                3. Plazo de Pago
                            </label>
                            <select
                                value={paymentTermsDays}
                                onChange={e => setPaymentTermsDays(Number(e.target.value))}
                                style={{ width: '100%', height: '38px', padding: '0 0.6rem', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}
                            >
                                <option value={0}>Contado</option>
                                <option value={8}>8 Días Crédito</option>
                                <option value={15}>15 Días Crédito</option>
                                <option value={30}>30 Días Crédito</option>
                                <option value={45}>45 Días Crédito</option>
                                <option value={60}>60 Días Crédito</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                                Vigencia Oferta
                            </label>
                            <div style={{
                                height: '38px',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0 0.65rem',
                                borderRadius: '8px',
                                backgroundColor: '#F0FDF4',
                                border: '1px solid #BBF7D0',
                                fontSize: '0.76rem',
                                fontWeight: 800,
                                color: '#065F46'
                            }}>
                                8 Días ({validityUntilDate})
                            </div>
                        </div>
                    </div>
                </div>

                {/* CINTA KPI DE TELEMETRÍA DE NEGOCIACIÓN (ESCENARIO 269 & 275.3 SDD) */}
                <div className="no-print" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: '0.75rem',
                    marginBottom: '0.9rem'
                }}>
                    <div style={{ backgroundColor: 'white', padding: '0.65rem 1rem', borderRadius: '10px', border: '1px solid #CBD5E1' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>SKUs en Propuesta</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0F172A' }}>{items.length} productos</div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '0.65rem 1rem', borderRadius: '10px', border: '1px solid #CBD5E1' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Consumo Cliente (Últ. 30d)</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#2563EB' }}>
                            {loadingDemand ? 'Calculando...' : `${formatPrice(telemetry.totalDemand30dVolume)} Kg/Und`}
                        </div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '0.65rem 1rem', borderRadius: '10px', border: '1px solid #CBD5E1' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Margen Bruto Ponderado</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900, color: telemetry.weightedMarginPct < 15 ? '#DC2626' : '#0D7A57' }}>
                            {telemetry.weightedMarginPct}%
                        </div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '0.65rem 1rem', borderRadius: '10px', border: '1px solid #CBD5E1' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Utilidad Mensual Proyectada</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0D7A57' }}>
                            ${formatPrice(telemetry.totalProjectedMonthlyProfit)} COP
                        </div>
                    </div>
                    <div style={{ backgroundColor: '#0F172A', padding: '0.65rem 1rem', borderRadius: '10px', border: '1px solid #0F172A', color: 'white' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>Total Cotización (c/IVA)</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#34D399' }}>
                            ${formatPrice(telemetry.totalAmount)} COP
                        </div>
                    </div>
                </div>

                {/* BARRA STICKY DE BÚSQUEDA INTERNA Y ADICIÓN DE PRODUCTOS (ESTÁNDAR GALERÍAS FRUFRESCO) */}
                <div className="no-print" style={{
                    position: 'sticky',
                    top: '0px',
                    zIndex: 80,
                    backgroundColor: 'rgba(255, 255, 255, 0.97)',
                    backdropFilter: 'blur(8px)',
                    padding: '0.6rem 1rem',
                    borderRadius: '12px',
                    border: '1px solid #CBD5E1',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    flexWrap: 'wrap'
                }}>
                    {/* FILTRAR DENTRO DE LA CANASTA */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
                        <div style={{ position: 'relative', flex: 1, maxWidth: '380px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                            <input
                                type="text"
                                value={basketFilter}
                                onChange={e => setBasketFilter(e.target.value)}
                                placeholder="Filtrar productos dentro de esta cotización..."
                                style={{
                                    width: '100%',
                                    height: '34px',
                                    paddingLeft: '30px',
                                    paddingRight: basketFilter ? '26px' : '10px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8rem',
                                    backgroundColor: '#F8FAFC'
                                }}
                            />
                            {basketFilter && (
                                <button
                                    type="button"
                                    onClick={() => setBasketFilter('')}
                                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#64748B' }}
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748B', backgroundColor: '#F1F5F9', padding: '4px 10px', borderRadius: '6px' }}>
                            Mostrando {groupedCategories.reduce((acc, g) => acc + g.items.length, 0)} de {items.length} SKUs
                        </span>
                    </div>

                    {/* AGREGAR PRODUCTO DESDE EL CATÁLOGO MAESTRO */}
                    <div style={{ position: 'relative', flex: 1, maxWidth: '460px', minWidth: '280px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0D7A57', whiteSpace: 'nowrap' }}>
                                + Catálogo Maestro:
                            </span>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Plus size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#0D7A57' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar y agregar producto por nombre o ID ERP..."
                                    value={searchTerm}
                                    onChange={e => handleSearch(e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '34px',
                                        paddingLeft: '30px',
                                        paddingRight: '10px',
                                        borderRadius: '8px',
                                        border: '1.5px solid #86EFAC',
                                        backgroundColor: '#F0FDF4',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        color: '#0F172A',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        {searchResults.length > 0 && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                backgroundColor: 'white',
                                zIndex: 100,
                                boxShadow: '0 12px 24px rgba(0,0,0,0.14)',
                                borderRadius: '10px',
                                border: '1px solid #CBD5E1',
                                marginTop: '4px',
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}>
                                {searchResults.map(p => (
                                    <div key={p.id}>
                                        <div
                                            onClick={() => addProduct(p)}
                                            style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F0FDF4'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                                        >
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.82rem', color: '#0F172A' }}>
                                                <Package size={14} color="#0D7A57" /> {p.name}
                                            </span>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                                                {normalizeUnit(p.unit_of_measure)} &bull; Costo: ${formatPrice(matrixCosts[p.id] || 0)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* DOCUMENTO OFICIAL UNIFICADO (UNIVERSAL LETTERHEAD) */}
                <div ref={printDocRef}>
                    <Letterhead
                        title={parentQuoteId ? 'PROPUESTA COMERCIAL DE PRECIOS (RECOTIZACIÓN)' : 'PROPUESTA COMERCIAL DE PRECIOS'}
                        subtitle="INVESTMENTS CORTES S.A.S. • Abastecimiento Agrícola & Dotación B2B"
                        date={new Date().toLocaleDateString('es-CO')}
                        reference={`#${docNumberStr}`}
                        badge={selectedLeadId ? 'PROSPECTO B2B' : 'PROPUESTA OFICIAL'}
                        badgeVariant="emerald"
                        paperSize="letter"
                        showWatermark={items.length <= 10}
                        className={viewMode === 'negotiation' ? 'quote-workspace-wide' : ''}
                    >
                        {/* MICRO-GRID DE INFORMACIÓN DEL CLIENTE (ESTÁNDAR OFICIAL GOLDEN PRINT) */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1.25fr 1fr',
                            gap: '10px',
                            backgroundColor: '#F8FAFC',
                            padding: '8px 12px',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            fontSize: viewMode === 'negotiation' ? '0.8rem' : '7pt',
                            marginBottom: '10px'
                        }}>
                            <div>
                                <div style={{ lineHeight: 1.4 }}>
                                    <strong style={{ color: '#0F172A' }}>CLIENTE / RAZÓN SOCIAL:</strong> {clientDisplayName}
                                </div>
                                <div style={{ lineHeight: 1.4 }}>
                                    <strong style={{ color: '#0F172A' }}>NIT / C.C.:</strong> {clientNit}
                                </div>
                                <div style={{ lineHeight: 1.4 }}>
                                    <strong style={{ color: '#0F172A' }}>DIRECCIÓN DE ENTREGA:</strong> {clientAddress}
                                </div>
                                <div style={{ lineHeight: 1.4 }}>
                                    <strong style={{ color: '#0F172A' }}>ATENCIÓN / CONTACTO:</strong> {clientContact} &bull; Tel: {clientPhone}
                                </div>
                                <div style={{ lineHeight: 1.4 }}>
                                    <strong style={{ color: '#0F172A' }}>CORREO FACTURACIÓN:</strong> {clientEmail}
                                </div>
                            </div>

                            <div>
                                <div style={{ lineHeight: 1.4 }}>
                                    <strong style={{ color: '#0F172A' }}>DOCUMENTO:</strong> #{docNumberStr}
                                </div>
                                <div style={{ lineHeight: 1.4 }}>
                                    <strong style={{ color: '#0F172A' }}>FECHA EMISIÓN:</strong> {new Date().toLocaleDateString('es-CO')}
                                </div>
                                <div style={{ lineHeight: 1.4 }}>
                                    <strong style={{ color: '#0F172A' }}>VIGENCIA OFERTA:</strong>{' '}
                                    <span style={{ color: '#0D7A57', fontWeight: 800 }}>8 Días Calendario (Hasta {validityUntilDate})</span>
                                </div>
                                <div style={{ lineHeight: 1.4 }}>
                                    <strong style={{ color: '#0F172A' }}>PLAZO DE PAGO:</strong>{' '}
                                    {paymentTermsDays > 0 ? `${paymentTermsDays} Días de Crédito` : 'Contado contra entrega'}
                                </div>
                                <div style={{ lineHeight: 1.4 }}>
                                    <strong style={{ color: '#0F172A' }}>MODELO / CANASTA:</strong>{' '}
                                    {selectedTemplateObj ? `${selectedTemplateObj.name} (${selectedModelObj?.name || 'Institucional'})` : (selectedModelObj?.name || 'General Institucional Dinámico')}
                                </div>
                            </div>
                        </div>

                        {/* TABLA DE PRODUCTOS CON AGRUPACIÓN JERÁRQUICA POR CATEGORÍA + TELEMETRÍA DE NEGOCIACIÓN */}
                        {items.length === 0 ? (
                            <div className="no-print" style={{
                                padding: '3rem 2rem',
                                textAlign: 'center',
                                backgroundColor: '#F8FAFC',
                                border: '1.5px dashed #CBD5E1',
                                borderRadius: '10px',
                                margin: '1rem 0'
                            }}>
                                <FileText size={32} color="#0D7A57" style={{ margin: '0 auto 0.5rem' }} />
                                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0F172A', marginBottom: '4px' }}>
                                    Selecciona un Cliente o una Canasta (2B) para cargar los productos automáticamente
                                </div>
                                <div style={{ fontSize: '0.84rem', color: '#64748B' }}>
                                    También puedes buscar y añadir productos individuales desde la barra superior <strong>+ Catálogo Maestro</strong>.
                                </div>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#0F172A', color: 'white' }}>
                                        <th className="text-center" style={{ width: '4%' }}>#</th>
                                        <th style={{ width: viewMode === 'negotiation' ? '26%' : '42%' }}>DESCRIPCIÓN DEL PRODUCTO</th>
                                        <th className="text-center" style={{ width: '6%' }}>UM</th>
                                        <th className="text-center" style={{ width: '9%' }}>CANT.</th>
                                        {viewMode === 'negotiation' && (
                                            <>
                                                <th className="no-print text-right" style={{ width: '10%', backgroundColor: '#1E293B' }}>COSTO HOY</th>
                                                <th className="no-print text-center" style={{ width: '10%', backgroundColor: '#1E293B' }}>UTILIDAD %</th>
                                                <th className="no-print text-right" style={{ width: '10%', backgroundColor: '#1E293B' }}>CONSUMO 30D</th>
                                                <th className="no-print text-right" style={{ width: '11%', backgroundColor: '#1E293B' }}>UTIL. PROY.</th>
                                            </>
                                        )}
                                        <th className="text-center" style={{ width: '6%' }}>IVA</th>
                                        <th className="text-right" style={{ width: '11%' }}>PRECIO UNIT.</th>
                                        <th className="text-right" style={{ width: '11%' }}>VALOR TOTAL</th>
                                        {viewMode === 'negotiation' && (
                                            <th className="no-print text-center" style={{ width: '4%', backgroundColor: '#1E293B' }}></th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {groupedCategories.map(group => (
                                        <React.Fragment key={group.category}>
                                            <tr style={{ backgroundColor: '#F8FAFC', pageBreakInside: 'avoid' }}>
                                                <td colSpan={viewMode === 'negotiation' ? 12 : 7} style={{
                                                    padding: '4px 8px',
                                                    borderLeft: '3.5px solid #0D7A57',
                                                    borderTop: '1px solid #CBD5E1',
                                                    borderBottom: '1px solid #CBD5E1',
                                                    backgroundColor: '#F1F5F9'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <span style={{ fontWeight: 900, fontSize: viewMode === 'negotiation' ? '0.76rem' : '7.4pt', color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                            {group.category}
                                                        </span>
                                                        <span style={{ fontSize: viewMode === 'negotiation' ? '0.7rem' : '6.8pt', fontWeight: 800, color: '#475569', backgroundColor: '#E2E8F0', padding: '1px 7px', borderRadius: '4px' }}>
                                                            {group.items.length} {group.items.length === 1 ? 'producto' : 'productos'}
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>

                                            {group.items.map(item => {
                                                globalRowCounter++;
                                                const idx = item._originalIndex;
                                                const unitPrice = Math.ceil(parseFloat(item.price) || 0);
                                                const qty = parseFloat(item.quantity) || 0;
                                                const totalPrice = unitPrice * qty;
                                                const cost = parseFloat(item.cost) || 0;
                                                const demand = clientDemandMap.get(item.product_id);
                                                const vol30d = demand?.volume || 0;
                                                const orders30d = demand?.ordersCount || 0;
                                                const projectedProfit = (vol30d > 0 ? vol30d : qty) * (unitPrice - cost);

                                                return (
                                                    <tr key={`${item.product_id}-${idx}`}>
                                                        <td className="text-center" style={{ fontWeight: 700, color: '#64748B' }}>
                                                            {String(globalRowCounter).padStart(2, '0')}
                                                        </td>
                                                        <td>
                                                            <div style={{ fontWeight: 700, color: '#0F172A' }}>{item.name}</div>
                                                        </td>
                                                        <td className="text-center" style={{ fontWeight: 600, color: '#475569' }}>
                                                            {normalizeUnit(item.unit)}
                                                        </td>
                                                        <td className="text-center">
                                                            {viewMode === 'negotiation' ? (
                                                                <input
                                                                    type="number"
                                                                    min="0.01"
                                                                    step="any"
                                                                    value={item.quantity === undefined || item.quantity === null ? '' : item.quantity}
                                                                    onFocus={e => e.target.select()}
                                                                    onChange={e => updateQuantity(idx, e.target.value === '' ? '' : parseFloat(e.target.value))}
                                                                    style={{ width: '58px', padding: '3px 4px', textAlign: 'center', borderRadius: '5px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontWeight: 800, fontSize: '0.8rem' }}
                                                                />
                                                            ) : (
                                                                <span style={{ fontWeight: 700 }}>{qty}</span>
                                                            )}
                                                        </td>

                                                        {viewMode === 'negotiation' && (
                                                            <>
                                                                {/* COSTO BASE HOY */}
                                                                <td className="no-print text-right" style={{ color: '#475569', fontWeight: 700, backgroundColor: '#F8FAFC' }}>
                                                                    ${formatPrice(cost)}
                                                                </td>

                                                                {/* UTILIDAD % */}
                                                                <td className="no-print text-center" style={{ backgroundColor: '#F8FAFC' }}>
                                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                        <input
                                                                            type="number"
                                                                            step="0.1"
                                                                            value={item.margin === undefined || item.margin === null ? '' : item.margin}
                                                                            onFocus={e => e.target.select()}
                                                                            onChange={e => {
                                                                                const raw = e.target.value;
                                                                                if (raw === '' || raw === '-') {
                                                                                    handleMarginChange(idx, raw);
                                                                                    return;
                                                                                }
                                                                                const val = parseFloat(raw);
                                                                                if (!isNaN(val)) handleMarginChange(idx, val);
                                                                            }}
                                                                            style={{
                                                                                width: '54px',
                                                                                padding: '3px 4px',
                                                                                textAlign: 'center',
                                                                                borderRadius: '5px',
                                                                                border: `1px solid ${typeof item.margin === 'number' && item.margin < 15 ? '#FCA5A5' : '#86EFAC'}`,
                                                                                backgroundColor: typeof item.margin === 'number' && item.margin < 15 ? '#FEF2F2' : '#F0FDF4',
                                                                                color: typeof item.margin === 'number' && item.margin < 15 ? '#B91C1C' : '#065F46',
                                                                                fontWeight: 800,
                                                                                fontSize: '0.8rem'
                                                                            }}
                                                                        />
                                                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B' }}>%</span>
                                                                        {typeof item.margin === 'number' && item.margin < 15 && (
                                                                            <span title="Alerta Poka-Yoke: Utilidad inferior al 15%">
                                                                                <AlertTriangle size={13} color="#DC2626" />
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>

                                                                {/* CONSUMO 30D (ESCENARIO 269.2) */}
                                                                <td className="no-print text-right" style={{ backgroundColor: '#F8FAFC' }}>
                                                                    {vol30d > 0 ? (
                                                                        <div>
                                                                            <span style={{ fontWeight: 800, color: '#1D4ED8' }}>
                                                                                {Math.round(vol30d * 10) / 10} {normalizeUnit(item.unit)}
                                                                            </span>
                                                                            <span style={{ display: 'block', fontSize: '0.65rem', color: '#64748B' }}>
                                                                                {orders30d} ped. (30d)
                                                                            </span>
                                                                        </div>
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>0 {normalizeUnit(item.unit)}</span>
                                                                    )}
                                                                </td>

                                                                {/* UTILIDAD PROYECTADA ($ COP) */}
                                                                <td className="no-print text-right" style={{ backgroundColor: '#F8FAFC', fontWeight: 800, color: projectedProfit >= 0 ? '#0D7A57' : '#DC2626' }}>
                                                                    ${formatPrice(projectedProfit)}
                                                                    <span style={{ display: 'block', fontSize: '0.63rem', color: '#64748B', fontWeight: 600 }}>
                                                                        {vol30d > 0 ? 'según 30d' : 'según cant.'}
                                                                    </span>
                                                                </td>
                                                            </>
                                                        )}

                                                        <td className="text-center" style={{ color: '#64748B', fontWeight: 600 }}>
                                                            {item.iva_rate || 0}%
                                                        </td>

                                                        <td className="text-right">
                                                            {viewMode === 'negotiation' ? (
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="50"
                                                                    value={item.price === undefined || item.price === null ? '' : item.price}
                                                                    onFocus={e => e.target.select()}
                                                                    onChange={e => {
                                                                        const raw = e.target.value;
                                                                        if (raw === '') {
                                                                            handlePriceChange(idx, '');
                                                                            return;
                                                                        }
                                                                        const val = parseFloat(raw);
                                                                        if (!isNaN(val)) handlePriceChange(idx, val);
                                                                    }}
                                                                    style={{ width: '82px', padding: '3px 6px', textAlign: 'right', borderRadius: '5px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontWeight: 800, fontSize: '0.82rem' }}
                                                                />
                                                            ) : (
                                                                <span style={{ fontWeight: 700 }}>${formatPrice(unitPrice)}</span>
                                                            )}
                                                        </td>

                                                        <td className="text-right" style={{ fontWeight: 800, color: '#0F172A' }}>
                                                            ${formatPrice(totalPrice)}
                                                        </td>

                                                        {viewMode === 'negotiation' && (
                                                            <td className="no-print text-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeItem(idx)}
                                                                    title="Quitar producto de la propuesta"
                                                                    style={{ color: '#EF4444', border: 'none', background: '#FEE2E2', cursor: 'pointer', width: '24px', height: '24px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                >
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '1.5px solid #CBD5E1' }}>
                                        <td colSpan={viewMode === 'negotiation' ? 9 : 5}></td>
                                        <td className="text-right" style={{ fontWeight: 700 }}>Subtotal:</td>
                                        <td className="text-right" style={{ fontWeight: 800, color: '#0F172A' }}>
                                            ${formatPrice(telemetry.subtotal)}
                                        </td>
                                        {viewMode === 'negotiation' && <td className="no-print"></td>}
                                    </tr>
                                    <tr>
                                        <td colSpan={viewMode === 'negotiation' ? 9 : 5}></td>
                                        <td className="text-right" style={{ fontWeight: 600, color: '#64748B' }}>Impuestos (IVA):</td>
                                        <td className="text-right" style={{ fontWeight: 700, color: '#64748B' }}>
                                            ${formatPrice(telemetry.totalTax)}
                                        </td>
                                        {viewMode === 'negotiation' && <td className="no-print"></td>}
                                    </tr>
                                    <tr style={{ backgroundColor: '#F8FAFC', borderTop: '1px solid #CBD5E1' }}>
                                        <td colSpan={viewMode === 'negotiation' ? 9 : 5}></td>
                                        <td className="text-right" style={{ fontWeight: 900, color: '#0F172A' }}>Total General:</td>
                                        <td className="text-right" style={{ fontWeight: 900, color: '#0D7A57', fontSize: viewMode === 'negotiation' ? '0.95rem' : '10pt' }}>
                                            ${formatPrice(telemetry.totalAmount)} COP
                                        </td>
                                        {viewMode === 'negotiation' && <td className="no-print"></td>}
                                    </tr>
                                </tfoot>
                            </table>
                        )}

                        {/* SELLO DE GARANTÍA OPERATIVA B2B FRUFRESCO */}
                        <div style={{
                            marginTop: '0.65rem',
                            marginBottom: '0.5rem',
                            padding: '0.55rem 0.85rem',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderLeft: '3.5px solid #0D7A57',
                            borderRadius: '5px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px'
                        }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <ShieldCheck size={14} color="#0D7A57" /> Sello de Garantía Operativa FruFresco B2B
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px', lineHeight: 1.3 }}>
                                    <strong>Cero Intermediarios:</strong> Abastecimiento directo de campo y plaza.{' '}
                                    <strong>Puntualidad Suiza:</strong> Despachos matutinos en ventana acordada antes de apertura de cocina.{' '}
                                    <strong>Cero Desperdicio:</strong> Selección y pesaje exacto con control de merma.
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '10px', borderLeft: '1px solid #CBD5E1' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0D7A57' }}>CALIDAD CERTIFICADA</div>
                                <div style={{ fontSize: '0.66rem', color: '#64748B' }}>Inocuidad & Trazabilidad</div>
                            </div>
                        </div>

                        {/* CLÁUSULA LEGAL Y VIGENCIA COMERCIAL DE 8 DÍAS (GAP-11 & ESCENARIO 276) */}
                        <div style={{
                            padding: '0.5rem 0.75rem',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '5px',
                            fontSize: '0.7rem',
                            color: '#64748B',
                            lineHeight: 1.35,
                            marginBottom: '0.75rem'
                        }}>
                            <strong style={{ color: '#475569' }}>Términos y Condiciones Legales:</strong> Esta propuesta comercial tiene un carácter cotizador con vigencia de ocho (8) días calendario a partir de su emisión (hasta el {validityUntilDate}). Los precios finales quedarán perfeccionados y congelados una vez se apruebe y suscriba el Acuerdo Comercial correspondiente o se emita la primera orden de compra institucional.
                        </div>

                        {/* BLOQUE SOLEMNE DE FIRMAS DE ACEPTACIÓN COMERCIAL */}
                        <div style={{
                            marginTop: '0.85rem',
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '24px',
                            fontSize: '0.74rem',
                            paddingTop: '8px',
                            borderTop: '1px solid #CBD5E1',
                            pageBreakInside: 'avoid'
                        }}>
                            <div>
                                <div style={{ borderBottom: '1px solid #0F172A', height: '28px', marginBottom: '4px' }}></div>
                                <strong style={{ color: '#0F172A' }}>Investments Cortés S.A.S. (FruFresco)</strong>
                                <div style={{ color: '#64748B' }}>NIT: 901.393.217-5 &bull; Dirección Comercial</div>
                            </div>
                            <div>
                                <div style={{ borderBottom: '1px solid #0F172A', height: '28px', marginBottom: '4px' }}></div>
                                <strong style={{ color: '#0F172A' }}>Aceptación del Cliente / {clientDisplayName}</strong>
                                <div style={{ color: '#64748B' }}>Firma, Sello Comercial y C.C. / NIT</div>
                            </div>
                        </div>
                    </Letterhead>
                </div>
            </div>

            {/* MODAL DE CREACIÓN RÁPIDA DE CLIENTE */}
            {isClientModalOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontWeight: 900, color: '#0F172A' }}>Registrar Nuevo Cliente</h3>
                            <button onClick={() => setIsClientModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748B' }}>×</button>
                        </div>
                        <form onSubmit={handleQuickCreateClient} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button type="button" onClick={() => setNewClient(p => ({ ...p, role: 'b2b_client' }))} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: newClient.role === 'b2b_client' ? '#ECFDF5' : 'white', fontWeight: 800, color: newClient.role === 'b2b_client' ? '#0D7A57' : '#64748B' }}>Institucional (B2B)</button>
                                <button type="button" onClick={() => setNewClient(p => ({ ...p, role: 'b2c_client' }))} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: newClient.role === 'b2c_client' ? '#EFF6FF' : 'white', fontWeight: 800, color: newClient.role === 'b2c_client' ? '#1D4ED8' : '#64748B' }}>Hogar (B2C)</button>
                            </div>

                            {newClient.role === 'b2b_client' && (
                                <>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Razón Social / Empresa *</label>
                                        <input required value={newClient.company_name} onChange={e => setNewClient(p => ({ ...p, company_name: e.target.value }))} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #CBD5E1' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>NIT / RUT *</label>
                                        <input required value={newClient.nit} onChange={e => setNewClient(p => ({ ...p, nit: e.target.value }))} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #CBD5E1' }} />
                                    </div>
                                </>
                            )}

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Nombre de Contacto *</label>
                                <input required value={newClient.contact_name} onChange={e => setNewClient(p => ({ ...p, contact_name: e.target.value }))} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #CBD5E1' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Teléfono</label>
                                    <input value={newClient.phone} onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #CBD5E1' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Modelo Precios</label>
                                    <select value={newClient.pricing_model_id} onChange={e => setNewClient(p => ({ ...p, pricing_model_id: e.target.value }))} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #CBD5E1', background: 'white' }}>
                                        {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Dirección de Entrega</label>
                                <input value={newClient.address} onChange={e => setNewClient(p => ({ ...p, address: e.target.value }))} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #CBD5E1' }} />
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
                                <button type="button" onClick={() => setIsClientModalOpen(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: 'white', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#0D7A57', color: 'white', fontWeight: 800, cursor: 'pointer' }}>{saving ? 'Guardando...' : 'Crear Cliente'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}

export default function CreateQuotePage() {
    return (
        <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: '#64748B' }}>Cargando generador de cotizaciones...</div>}>
            <CreateQuotePageContent />
        </Suspense>
    );
}
