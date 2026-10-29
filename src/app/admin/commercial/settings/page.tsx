'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, fetchAllRows } from '@/lib/supabase';
import { recalculateAndSyncProductPrices, batchRecalculateAndSyncPrices, CLIENTES_HOGAR_ID, GENERAL_INSTITUCIONAL_ID } from '@/lib/pricingUtils';
import Link from 'next/link';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import { 
    Plus, 
    Save, 
    Trash2, 
    Edit3, 
    Rocket, 
    ArrowLeft, 
    CheckCircle2, 
    AlertCircle, 
    Tag, 
    ChevronRight,
    ChevronLeft,
    ChevronDown,
    RefreshCw,
    X,
    TrendingUp,
    Globe,
    Building,
    Activity,
    Search,
    Check,
    FileUp,
    FileDown,
    CircleDot,
    Pause,
    ClipboardList,
    BarChart2,
    ArrowLeftCircle,
    Clock,
    Crown,
    Loader2,
    ArrowUp,
    ArrowDown,
    ArrowUpDown
} from 'lucide-react';
import { CATEGORY_MAP } from '@/lib/constants';

interface PricingRuleItem {
    id: string;
    model_id: string;
    product_id: string;
    margin_adjustment: number;
    created_at?: string;
}

export default function PricingSettingsPage({ 
    embedded = false,
    activeTab: externalActiveTab,
    onTabChange
}: { 
    embedded?: boolean;
    activeTab?: 'models' | 'templates';
    onTabChange?: (tab: 'models' | 'templates') => void;
} = {}) {
    // Data
    const [models, setModels] = useState<any[]>([]);
    const [selectedModel, setSelectedModel] = useState<any>(null);
    const [rules, setRules] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]); // For search
    const [internalActiveTab, setInternalActiveTab] = useState<'models' | 'templates'>('models');
    
    const activeTab = externalActiveTab !== undefined ? externalActiveTab : internalActiveTab;
    const setActiveTab = (t: 'models' | 'templates') => {
        setInternalActiveTab(t);
        onTabChange?.(t);
    };

    // Templates (Preformas) State
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [templateItems, setTemplateItems] = useState<any[]>([]);
    const [loadingTemplateItems, setLoadingTemplateItems] = useState(false);
    const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [newTemplateDesc, setNewTemplateDesc] = useState('');
    const [isEditingTemplate, setIsEditingTemplate] = useState(false);
    const [editTemplateName, setEditTemplateName] = useState('');
    const [editTemplateDesc, setEditTemplateDesc] = useState('');

    // Telemetría On-Screen y márgenes personalizados por cliente (Escenario 275 SDD)
    const [templateCosts, setTemplateCosts] = useState<Record<string, number>>({});
    const [templateDemand, setTemplateDemand] = useState<Record<string, { volume: number; ordersCount: number }>>({});
    const [templateMargins, setTemplateMargins] = useState<Record<string, number>>({});
    const [savingTemplateMargins, setSavingTemplateMargins] = useState(false);
    const [templateClientProfile, setTemplateClientProfile] = useState<any | null>(null);
    const [templateProductSearch, setTemplateProductSearch] = useState('');
    const [selectedTemplateProduct, setSelectedTemplateProduct] = useState<any>(null);
    const [templateSearchFilter, setTemplateSearchFilter] = useState('');
    const [uploadingTemplateExcel, setUploadingTemplateExcel] = useState(false);
    const [showTemplateExcelModal, setShowTemplateExcelModal] = useState(false);

    // Searchable Picker States (Buscadores de cabecera)
    const modelPickerRef = useRef<HTMLDivElement>(null);
    const templatePickerRef = useRef<HTMLDivElement>(null);
    const [modelSearchQuery, setModelSearchQuery] = useState('');
    const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
    const [templateSearchQuery, setTemplateSearchQuery] = useState('');
    const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modelPickerRef.current && !modelPickerRef.current.contains(event.target as Node)) {
                setIsModelPickerOpen(false);
            }
            if (templatePickerRef.current && !templatePickerRef.current.contains(event.target as Node)) {
                setIsTemplatePickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const [templateProductsFound, setTemplateProductsFound] = useState<any[]>([]);

    // UI
    const [loadingModels, setLoadingModels] = useState(true);
    const [loadingRules, setLoadingRules] = useState(false);
    const [isCreating, setIsCreating] = useState(false); // Creating Model
    const [showRuleModal, setShowRuleModal] = useState(false); // Creating Rule

    // Forms
    const [newModelName, setNewModelName] = useState('');
    const [newModelMargin, setNewModelMargin] = useState(20);
    const [newModelDesc, setNewModelDesc] = useState('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [cloneFromModelId, setCloneFromModelId] = useState<string>(''); // Nuevo: ID del modelo a clonar
    const [createModelError, setCreateModelError] = useState<string | null>(null);
    const [isSubmittingModel, setIsSubmittingModel] = useState(false);

    // Editing State
    const [isEditingModel, setIsEditingModel] = useState(false);
    const [editModelData, setEditModelData] = useState<{ name: string; description: string; margin: number; color_tag: string | null }>({ name: '', description: '', margin: 0, color_tag: null });

    const [ruleProductSearch, setRuleProductSearch] = useState('');
    const [ruleSelectedProduct, setRuleSelectedProduct] = useState<any>(null);
    const [ruleAdjustment, setRuleAdjustment] = useState(0);
    const [isEditingRule, setIsEditingRule] = useState(false); // Nuevo: estado de edición

    // Pricing Matrix states
    const [matrixData, setMatrixData] = useState<any[]>([]);
    const [matrixSearch, setMatrixSearch] = useState('');
    const [matrixPage, setMatrixPage] = useState(1);
    const [matrixPageSize, setMatrixPageSize] = useState(50);
    const [savingMargins, setSavingMargins] = useState<Record<string, 'saving' | 'success' | 'error'>>({});
    const [editingMargins, setEditingMargins] = useState<Record<string, string>>({});
    const [showExcelModal, setShowExcelModal] = useState(false);

    // Matrix Sorting states
    type MatrixSortField = 'id' | 'name' | 'category' | 'base_cost' | 'iva_rate' | 'margin' | 'suggested_price' | 'final_price';
    const [matrixSortField, setMatrixSortField] = useState<MatrixSortField | null>(null);
    const [matrixSortOrder, setMatrixSortOrder] = useState<'asc' | 'desc'>('asc');

    const handleMatrixSort = (field: MatrixSortField) => {
        if (matrixSortField === field) {
            if (matrixSortOrder === 'asc') {
                setMatrixSortOrder('desc');
            } else {
                setMatrixSortField(null);
                setMatrixSortOrder('asc');
            }
        } else {
            setMatrixSortField(field);
            setMatrixSortOrder('asc');
        }
        setMatrixPage(1);
    };
    const [uploadingExcel, setUploadingExcel] = useState(false);
    const [excelError, setExcelError] = useState<string | null>(null);
    const [excelSuccess, setExcelSuccess] = useState<string | null>(null);
    const [modelAverages, setModelAverages] = useState<Record<string, number>>({});

    const fetchModels = async () => {
        setLoadingModels(true);
        const { data, error } = await supabase
            .from('pricing_models')
            .select('*');

        if (data) {
            // Calcular utilidad promedio para cada modelo desde pricing_rules
            const { data: allRules } = await fetchAllRows<{ model_id: string; margin_adjustment: number | null }>(
                (from, to) => supabase.from('pricing_rules').select('model_id, margin_adjustment').range(from, to)
            );

            const avgMap: Record<string, number> = {};
            if (allRules && allRules.length > 0) {
                const sumMap: Record<string, { sum: number; count: number }> = {};
                allRules.forEach(r => {
                    if (!sumMap[r.model_id]) sumMap[r.model_id] = { sum: 0, count: 0 };
                    sumMap[r.model_id].sum += Number(r.margin_adjustment || 0);
                    sumMap[r.model_id].count += 1;
                });
                data.forEach(m => {
                    const stats = sumMap[m.id];
                    avgMap[m.id] = stats && stats.count > 0 ? (stats.sum / stats.count) : (m.base_margin_percent || 0);
                });
                // Cascada dinámica para modelos derivados sin reglas fijas (ej. Clientes Hogar = GI + 10%)
                const giAvg = avgMap[GENERAL_INSTITUCIONAL_ID] || 25;
                data.forEach(m => {
                    if (m.id !== GENERAL_INSTITUCIONAL_ID && (!sumMap[m.id] || sumMap[m.id].count === 0)) {
                        avgMap[m.id] = giAvg + (Number(m.base_margin_percent) || 0);
                    }
                });
            } else {
                data.forEach(m => {
                    avgMap[m.id] = Number(m.base_margin_percent) || 0;
                });
            }
            setModelAverages(avgMap);

            // Lógica de ordenamiento personalizado
            const sortedData = [...data].sort((a, b) => {
                // 1. Prioridad para General institucional dinámico (1) y Clientes Hogar / B2C (2)
                if (a.id === GENERAL_INSTITUCIONAL_ID || a.name === 'General institucional dinámico' || a.name === 'General Institucional') return -1;
                if (b.id === GENERAL_INSTITUCIONAL_ID || b.name === 'General institucional dinámico' || b.name === 'General Institucional') return 1;
                if (a.name === 'Clientes Hogar' || a.name === 'Clientes B2C') return -1;
                if (b.name === 'Clientes Hogar' || b.name === 'Clientes B2C') return 1;

                // 2. Extraer días (busca números en el nombre)
                const getDays = (name: string) => {
                    const match = name.match(/(\d+)\s*días/i);
                    return match ? parseInt(match[1]) : 0;
                };

                const daysA = getDays(a.name);
                const daysB = getDays(b.name);

                // Ordenar por días descendente (30 > 15 > 8)
                if (daysA !== daysB) return daysB - daysA;

                // 3. Ordenar por tamaño (Grande > Mediano > Pequeño)
                const sizePriority: Record<string, number> = {
                    'Grande': 1,
                    'Mediano': 2,
                    'Pequeño': 3
                };

                const getSizePriority = (name: string) => {
                    if (name.toLowerCase().includes('grande')) return 1;
                    if (name.toLowerCase().includes('mediano')) return 2;
                    if (name.toLowerCase().includes('pequeño')) return 3;
                    return 99;
                };

                const priorityA = getSizePriority(a.name);
                const priorityB = getSizePriority(b.name);

                return priorityA - priorityB;
            });

            setModels(sortedData);
            if (sortedData.length > 0 && !selectedModel) setSelectedModel(sortedData[0]);
        }
        setLoadingModels(false);
    };

    const fetchMatrixData = async (modelId: string) => {
        setLoadingRules(true);
        try {
            // Get model first
            const { data: modelData, error: modelErr } = await supabase
                .from('pricing_models')
                .select('*')
                .eq('id', modelId)
                .single();
            
            if (modelErr || !modelData) throw modelErr || new Error("Model not found");
            const isB2C = modelData.name === 'Clientes B2C';

            // 1. Fetch active products with range-looping to bypass 1000 limit
            let allProds: any[] = [];
            let pageNum = 0;
            const PAGE_SIZE = 1000;
            let finished = false;
            
            while (!finished) {
                let query = supabase
                    .from('products')
                    .select('id, name, sku, accounting_id, iva_rate, category, parent_id, utility_deviation_pct, unit_of_measure, show_on_web')
                    .eq('is_active', true)
                    .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);
                
                if (isB2C) {
                    query = query.eq('show_on_web', true);
                }
                
                const { data, error } = await query;
                if (error) throw error;
                if (data && data.length > 0) {
                    allProds = [...allProds, ...data];
                    if (data.length < PAGE_SIZE) {
                        finished = true;
                    } else {
                        pageNum++;
                    }
                } else {
                    finished = true;
                }
            }

            // 2. Fetch exception rules for this model and General Institucional baseline
            const modelIdsToFetch = modelId === GENERAL_INSTITUCIONAL_ID ? [modelId] : [modelId, GENERAL_INSTITUCIONAL_ID];
            const { data: rulesData, error: rulesErr } = await fetchAllRows<PricingRuleItem>(
                (from, to) => supabase.from('pricing_rules').select('*').in('model_id', modelIdsToFetch).range(from, to)
            );
            if (rulesErr) throw rulesErr;
            
            const rulesMap = new Map();
            const giRulesMap = new Map();
            rulesData?.forEach(r => {
                if (r.model_id === modelId) {
                    rulesMap.set(r.product_id, r);
                } else if (r.model_id === GENERAL_INSTITUCIONAL_ID) {
                    giRulesMap.set(r.product_id, r);
                }
            });

            // 3. Fetch overrides
            const { data: overridesData } = await supabase
                .from('commercial_overrides')
                .select('product_id, manual_cost, expires_at');
            
            const overridesMap = new Map();
            const now = new Date();
            overridesData?.forEach(o => {
                if (!o.expires_at || new Date(o.expires_at) > now) {
                    overridesMap.set(o.product_id, o.manual_cost);
                }
            });

            // 4. Fetch latest purchases
            const { data: purchasesData } = await fetchAllRows<{ product_id: string; unit_price: number; purchase_unit: string; created_at: string }>(
                (from, to) => supabase.from('purchases').select('product_id, unit_price, purchase_unit, created_at').order('created_at', { ascending: false }).range(from, to)
            );
            
            const purchasesMap = new Map();
            purchasesData?.forEach(p => {
                if (!purchasesMap.has(p.product_id)) {
                    purchasesMap.set(p.product_id, { price: p.unit_price, unit: p.purchase_unit });
                }
            });

            // 5. Fetch conversions
            const { data: convData } = await supabase
                .from('product_conversions')
                .select('*');
            const conversions = convData || [];

            // 6. Build the matrix data
            const matrix = allProds.map(prod => {
                // Find cost
                const overrideCost = overridesMap.get(prod.id);
                const purchaseInfo = purchasesMap.get(prod.id) || (prod.parent_id ? purchasesMap.get(prod.parent_id) : null);
                
                let baseCost = 0;
                if (overrideCost !== undefined) {
                    baseCost = overrideCost;
                } else if (purchaseInfo) {
                    let realCost = purchaseInfo.price;
                    if (purchaseInfo.unit && purchaseInfo.unit !== prod.unit_of_measure) {
                        const convAB = conversions.find(c => 
                            c.product_id === prod.id && 
                            c.from_unit === purchaseInfo.unit && 
                            c.to_unit === prod.unit_of_measure
                        );
                        if (convAB && convAB.conversion_factor) {
                            realCost = purchaseInfo.price / convAB.conversion_factor;
                        } else {
                            const convBA = conversions.find(c => 
                                c.product_id === prod.id && 
                                c.from_unit === prod.unit_of_measure && 
                                c.to_unit === purchaseInfo.unit
                            );
                            if (convBA && convBA.conversion_factor) {
                                realCost = purchaseInfo.price * convBA.conversion_factor;
                            }
                        }
                    }
                    baseCost = realCost;
                }

                // Margin adjustment rule if exists, or cascade from General Institucional baseline
                const rule = rulesMap.get(prod.id);
                const giRule = giRulesMap.get(prod.id);
                
                let absoluteMargin: number;
                let adjustment: number = 0;
                let isInherited = false;

                if (rule) {
                    absoluteMargin = Number(rule.margin_adjustment);
                    adjustment = absoluteMargin;
                    isInherited = false;
                } else if (giRule && modelId !== GENERAL_INSTITUCIONAL_ID) {
                    absoluteMargin = Number(giRule.margin_adjustment) + (Number(modelData.base_margin_percent) || 0);
                    adjustment = Number(modelData.base_margin_percent) || 0;
                    isInherited = true;
                } else {
                    absoluteMargin = Number(modelData.base_margin_percent) || 0;
                    adjustment = 0;
                    isInherited = false;
                }

                return {
                    product_id: prod.id,
                    name: prod.name,
                    sku: prod.sku,
                    accounting_id: prod.accounting_id,
                    iva_rate: prod.iva_rate || 0,
                    category: prod.category || '',
                    unit_of_measure: prod.unit_of_measure || '',
                    base_cost: baseCost,
                    rule_id: rule ? rule.id : null,
                    margin_adjustment: adjustment,
                    margin: absoluteMargin,
                    is_inherited: isInherited,
                    utility_deviation_pct: prod.utility_deviation_pct || 0
                };
            });

            // Sort by product name
            matrix.sort((a, b) => a.name.localeCompare(b.name));
            setMatrixData(matrix);
            // set legacy rules for compatibility if any other code relies on it
            setRules(rulesData || []);
        } catch (err: any) {
            console.error('Error fetching matrix data:', err);
        } finally {
            setLoadingRules(false);
        }
    };

    useEffect(() => {
        fetchModels();
    }, []);

    useEffect(() => {
        if (selectedModel) {
            fetchMatrixData(selectedModel.id);
            // Reset edit state when switching models
            setIsEditingModel(false);
            setMatrixSearch('');
            setMatrixPage(1);
        } else {
            setMatrixData([]);
            setRules([]);
        }
    }, [selectedModel]);

    useEffect(() => {
        if (activeTab === 'templates') {
            fetchTemplates();
        }
    }, [activeTab]);

    useEffect(() => {
        if (selectedTemplate && activeTab === 'templates') {
            fetchTemplateItems(selectedTemplate.id);
        }
    }, [selectedTemplate, activeTab]);

    // --- TEMPLATE ACTIONS ---
    const [templateCounts, setTemplateCounts] = useState<Record<string, number>>({});

    const fetchTemplates = async () => {
        setLoadingTemplates(true);
        const { data, error } = await supabase
            .from('quote_templates')
            .select('*, quote_template_items(count)')
            .order('name', { ascending: true });
        if (data) {
            setTemplates(data);
            
            // Map counts directly from joined aggregate (bypasses Supabase 1000-row limit)
            const counts: Record<string, number> = {};
            data.forEach((row: any) => {
                counts[row.id] = row.quote_template_items?.[0]?.count || 0;
            });
            setTemplateCounts(counts);

            if (data.length > 0) {
                const stillExists = selectedTemplate ? data.some(t => t.id === selectedTemplate.id) : false;
                if (!stillExists) {
                    setSelectedTemplate(data[0]);
                }
            } else {
                setSelectedTemplate(null);
            }
        }
        setLoadingTemplates(false);
    };

    const fetchTemplateItems = async (templateId: string, currentTemplate?: any) => {
        setLoadingTemplateItems(true);
        const tpl = currentTemplate || selectedTemplate;
        try {
            // 1. Cargar productos de la canasta
            const { data, error } = await supabase
                .from('quote_template_items')
                .select('product_id, products(id, name, sku, accounting_id, category, unit_of_measure)')
                .eq('template_id', templateId);
            
            const flattened = (data || []).map((item: any) => ({
                product_id: item.product_id,
                ...item.products
            })).filter((item: any) => item.id);
            setTemplateItems(flattened);

            // 2. Cargar costos base vigentes de commercial_cost_matrix
            const { data: matrixCosts } = await supabase
                .from('commercial_cost_matrix')
                .select('product_id, manual_cost');
            const cMap: Record<string, number> = {};
            (matrixCosts || []).forEach((c: any) => {
                if (c.manual_cost) cMap[c.product_id] = Number(c.manual_cost);
            });
            setTemplateCosts(cMap);

            // 3. Cargar márgenes personalizados de la canasta desde app_settings
            const { data: sData } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', `quote_template_margins:${templateId}`)
                .maybeSingle();
            let mObj: Record<string, number> = {};
            if (sData?.value) {
                try { mObj = JSON.parse(sData.value); } catch (e) {}
            }
            setTemplateMargins(mObj);

            // 4. Intentar emparejar con Casa Matriz y calcular demanda 30d
            const tplName = (tpl?.name || '').trim();
            if (tplName) {
                const { data: matchedProfiles } = await supabase
                    .from('profiles')
                    .select('id, company_name, razon_social')
                    .eq('role', 'b2b_client')
                    .or(`company_name.ilike.%${tplName}%,razon_social.ilike.%${tplName}%`)
                    .limit(1);

                const matched = matchedProfiles?.[0];
                setTemplateClientProfile(matched || null);

                if (matched) {
                    const { data: branches } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('parent_id', matched.id);

                    const clientIds = [matched.id, ...(branches || []).map(b => b.id)];
                    const cycleStartIso = new Date(Date.now() - 30 * 86400000).toISOString();

                    const { data: orders } = await supabase
                        .from('orders')
                        .select('id')
                        .in('profile_id', clientIds)
                        .gte('created_at', cycleStartIso)
                        .neq('status', 'cancelled');

                    const oIds = (orders || []).map(o => o.id);
                    const dMap: Record<string, { volume: number; ordersCount: number }> = {};

                    if (oIds.length > 0) {
                        for (let i = 0; i < oIds.length; i += 80) {
                            const slice = oIds.slice(i, i + 80);
                            const { data: items } = await supabase
                                .from('order_items')
                                .select('product_id, quantity')
                                .in('order_id', slice);

                            (items || []).forEach((it: any) => {
                                if (!it.product_id) return;
                                if (!dMap[it.product_id]) dMap[it.product_id] = { volume: 0, ordersCount: 0 };
                                dMap[it.product_id].volume += Number(it.quantity || 0);
                                dMap[it.product_id].ordersCount += 1;
                            });
                        }
                    }
                    setTemplateDemand(dMap);
                } else {
                    setTemplateDemand({});
                }
            } else {
                setTemplateDemand({});
                setTemplateClientProfile(null);
            }
        } catch (err) {
            console.error('Error cargando canasta de cliente:', err);
        } finally {
            setLoadingTemplateItems(false);
        }
    };

    const handleUpdateItemMargin = (productId: string, marginVal: number) => {
        setTemplateMargins(prev => ({ ...prev, [productId]: marginVal }));
    };

    const handleSaveTemplateMargins = async () => {
        if (!selectedTemplate) return;
        setSavingTemplateMargins(true);
        try {
            await supabase.from('app_settings').upsert({
                key: `quote_template_margins:${selectedTemplate.id}`,
                value: JSON.stringify(templateMargins),
                description: `Márgenes personalizados de canasta para ${selectedTemplate.name}`
            });
            alert(`¡Márgenes de la canasta "${selectedTemplate.name}" guardados exitosamente!`);
        } catch (err: any) {
            alert('Error guardando márgenes: ' + (err.message || err));
        } finally {
            setSavingTemplateMargins(false);
        }
    };

    const createTemplate = async () => {
        if (!newTemplateName.trim()) return alert('El nombre es obligatorio');
        const { data, error } = await supabase
            .from('quote_templates')
            .insert([{ name: newTemplateName, description: newTemplateDesc }])
            .select()
            .single();
        if (error) {
            alert('Error al crear plantilla: ' + error.message);
        } else if (data) {
            setTemplates([...templates, data]);
            setSelectedTemplate(data);
            setIsCreatingTemplate(false);
            setNewTemplateName('');
            setNewTemplateDesc('');
        }
    };

    const saveTemplateChanges = async () => {
        if (!selectedTemplate) return;
        const { error } = await supabase
            .from('quote_templates')
            .update({ name: editTemplateName, description: editTemplateDesc })
            .eq('id', selectedTemplate.id);
        if (error) {
            alert('Error al actualizar plantilla: ' + error.message);
        } else {
            const updated = { ...selectedTemplate, name: editTemplateName, description: editTemplateDesc };
            setSelectedTemplate(updated);
            setTemplates(templates.map(t => t.id === updated.id ? updated : t));
            setIsEditingTemplate(false);
        }
    };

    const deleteTemplate = async (id: string, name: string) => {
        if (!confirm(`¿Estás seguro de eliminar la plantilla "${name}"? Se borrarán todos los productos asociados a ella.`)) return;
        const { error } = await supabase
            .from('quote_templates')
            .delete()
            .eq('id', id);
        if (error) {
            alert('Error al eliminar plantilla: ' + error.message);
        } else {
            const remaining = templates.filter(t => t.id !== id);
            setTemplates(remaining);
            setSelectedTemplate(remaining.length > 0 ? remaining[0] : null);
        }
    };

    const searchTemplateProducts = async (term: string) => {
        if (!term) {
            setTemplateProductsFound([]);
            return;
        }
        const { data } = await supabase
            .from('products')
            .select('id, name, sku, accounting_id, category, unit_of_measure')
            .eq('is_active', true)
            .ilike('name', `%${term}%`)
            .limit(30);
        if (data) {
            // Filter out products already present in templateItems
            const filtered = data.filter(p => !templateItems.some(item => item.product_id === p.id));
            setTemplateProductsFound(filtered.slice(0, 10));
        }
    };

    const addProductToTemplate = async (productId: string) => {
        if (!selectedTemplate) return;
        if (templateItems.some(item => item.product_id === productId)) {
            alert('El producto ya se encuentra en esta lista');
            return;
        }
        const { error } = await supabase
            .from('quote_template_items')
            .insert([{ template_id: selectedTemplate.id, product_id: productId }]);
        if (error) {
            alert('Error al agregar producto: ' + error.message);
        } else {
            // Fetch updated list of items
            await fetchTemplateItems(selectedTemplate.id);
            // Refresh counts in list sidebar
            await fetchTemplates();
            setSelectedTemplateProduct(null);
            setTemplateProductSearch('');
            setTemplateProductsFound([]);
        }
    };

    const removeProductFromTemplate = async (productId: string) => {
        if (!selectedTemplate) return;
        const { error } = await supabase
            .from('quote_template_items')
            .delete()
            .eq('template_id', selectedTemplate.id)
            .eq('product_id', productId);
        if (error) {
            alert('Error al remover producto: ' + error.message);
        } else {
            setTemplateItems(templateItems.filter(item => item.product_id !== productId));
        }
    };

    const exportTemplateExcel = async () => {
        if (!selectedTemplate || templateItems.length === 0) return alert('No hay productos para exportar');
        const XLSX = await import('xlsx');
        const dataToExport = templateItems.map(item => ({
            'ID ERP': item.accounting_id || '',
            'SKU': item.sku || '',
            'Producto': item.name || '',
            'Categoría': CATEGORY_MAP[item.category] || item.category || '',
            'Unidad': item.unit_of_measure || ''
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');
        XLSX.writeFile(workbook, `Plantilla_${selectedTemplate.name.replace(/\s+/g, '_')}.xlsx`);
    };

    const handleTemplateExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedTemplate) return;
        
        setUploadingTemplateExcel(true);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const XLSX = await import('xlsx');
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws) as any[];
                
                if (data.length === 0) throw new Error('El archivo Excel está vacío.');
                
                const skus = data.map(row => String(row['SKU'] || row['sku'] || '').trim()).filter(Boolean);
                const erps = data.map(row => String(row['ID ERP'] || row['id erp'] || row['ID_ERP'] || '').trim()).filter(Boolean);
                
                if (skus.length === 0 && erps.length === 0) {
                    throw new Error('No se encontraron columnas "SKU" o "ID ERP" válidas en el Excel.');
                }
                
                let query = supabase.from('products').select('id, sku, accounting_id');
                if (skus.length > 0 && erps.length > 0) {
                    const skuString = skus.map(s => `'${s}'`).join(',');
                    const erpString = erps.map(e => Number(e)).filter(n => !isNaN(n)).join(',');
                    query = query.or(`sku.in.(${skuString}),accounting_id.in.(${erpString})`);
                } else if (skus.length > 0) {
                    const skuString = skus.map(s => `'${s}'`).join(',');
                    query = query.or(`sku.in.(${skuString})`);
                } else {
                    const erpString = erps.map(e => Number(e)).filter(n => !isNaN(n)).join(',');
                    query = query.or(`accounting_id.in.(${erpString})`);
                }
                
                const { data: matchedProds, error: fetchErr } = await query;
                if (fetchErr) throw fetchErr;
                if (!matchedProds || matchedProds.length === 0) {
                    throw new Error('No se encontró ningún producto coincidente en el sistema.');
                }
                
                const itemsToInsert = matchedProds.map(p => ({
                    template_id: selectedTemplate.id,
                    product_id: p.id
                }));
                
                const { error: insertErr } = await supabase
                    .from('quote_template_items')
                    .upsert(itemsToInsert, { onConflict: 'template_id,product_id' });
                    
                if (insertErr) throw insertErr;
                
                alert(`¡Éxito! Se cargaron/actualizaron ${matchedProds.length} productos en la plantilla.`);
                fetchTemplateItems(selectedTemplate.id);
            } catch (err: any) {
                alert('Error procesando Excel: ' + err.message);
            } finally {
                setUploadingTemplateExcel(false);
                setShowTemplateExcelModal(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    // --- MODEL ACTIONS ---
    const createModel = async () => {
        const trimmedName = newModelName.trim();
        if (!trimmedName) {
            setCreateModelError('El nombre del modelo es requerido.');
            return;
        }

        // Anti double-click guard
        if (isSubmittingModel) return;

        // 1. Verificar duplicados localmente (insensible a mayúsculas y espacios)
        const isDuplicate = models.some(m => m.name && m.name.trim().toLowerCase() === trimmedName.toLowerCase());
        if (isDuplicate) {
            setCreateModelError(`Ya existe un modelo con el nombre "${trimmedName}". Elige un nombre diferente.`);
            return;
        }

        setIsSubmittingModel(true);
        setCreateModelError(null);

        try {
            // 2. Insertar el nuevo modelo
            const { data: newModel, error } = await supabase
                .from('pricing_models')
                .insert({
                    name: trimmedName,
                    base_margin_percent: newModelMargin,
                    description: newModelDesc?.trim() || ''
                })
                .select()
                .single();

            if (error) {
                // Capturar colisión UNIQUE de PostgreSQL (código 23505 o pricing_models_name_key)
                if (error.code === '23505' || error.message?.includes('pricing_models_name_key') || error.message?.toLowerCase().includes('duplicate key')) {
                    await fetchModels();
                    setCreateModelError(`El modelo "${trimmedName}" ya existe en el sistema. Hemos sincronizado la lista de modelos.`);
                    return;
                }
                throw error;
            }

            // 3. Si se seleccionó un modelo para clonar, copiar sus reglas
            if (cloneFromModelId && newModel) {
                console.log('Clonando reglas desde:', cloneFromModelId);
                const { data: sourceRules } = await supabase
                    .from('pricing_rules')
                    .select('product_id, margin_adjustment')
                    .eq('model_id', cloneFromModelId);

                if (sourceRules && sourceRules.length > 0) {
                    const rulesToInsert = sourceRules.map(r => ({
                        model_id: newModel.id,
                        product_id: r.product_id,
                        margin_adjustment: r.margin_adjustment
                    }));

                    const { error: cloneError } = await supabase
                        .from('pricing_rules')
                        .insert(rulesToInsert);

                    if (cloneError) console.error('Error clonando reglas:', cloneError);
                }
            }

            await fetchModels();
            setSelectedModel(newModel);
            setIsCreating(false);
            setNewModelName('');
            setNewModelDesc('');
            setNewModelMargin(20);
            setCloneFromModelId('');
            setCreateModelError(null);

        } catch (err: any) {
            console.error('Error creando modelo:', err);
            setCreateModelError(err.message || 'Error al crear el modelo.');
        } finally {
            setIsSubmittingModel(false);
        }
    };

    const saveModelChanges = async () => {
        if (!selectedModel) return;

        const trimmedName = editModelData.name.trim();
        if (!trimmedName) {
            alert('El nombre del modelo no puede estar vacío.');
            return;
        }

        const isDuplicate = models.some(m => m.id !== selectedModel.id && m.name?.trim().toLowerCase() === trimmedName.toLowerCase());
        if (isDuplicate) {
            alert(`Ya existe otro modelo con el nombre "${trimmedName}". Elige un nombre diferente.`);
            return;
        }

        // If a color tag is selected, clear it from any other model first
        if (editModelData.color_tag) {
            await supabase
                .from('pricing_models')
                .update({ color_tag: null })
                .eq('color_tag', editModelData.color_tag);
        }

        const { error } = await supabase
            .from('pricing_models')
            .update({
                name: trimmedName,
                description: editModelData.description?.trim() || '',
                base_margin_percent: editModelData.margin,
                color_tag: editModelData.color_tag
            })
            .eq('id', selectedModel.id);

        if (error) {
            if (error.code === '23505' || error.message?.includes('pricing_models_name_key')) {
                alert(`Ya existe un modelo con el nombre "${trimmedName}".`);
            } else {
                alert('Error actualizando: ' + error.message);
            }
        } else {
            // Update local state
            const updated = { 
                ...selectedModel, 
                name: trimmedName, 
                description: editModelData.description?.trim() || '', 
                base_margin_percent: editModelData.margin,
                color_tag: editModelData.color_tag
            };
            setSelectedModel(updated);

            // Update list clearing the tag from the previous model owner if reassigned
            const updatedList = models.map(m => {
                if (m.id === updated.id) return updated;
                if (editModelData.color_tag && m.color_tag === editModelData.color_tag) {
                    return { ...m, color_tag: null };
                }
                return m;
            });
            setModels(updatedList);
            setIsEditingModel(false);
        }
    };

    const deleteModel = async (id: string, name: string) => {
        // Proteccion inmutable: Los modelos estandar jamas deben poder eliminarse
        const isStandardModel = id === GENERAL_INSTITUCIONAL_ID || 
            id === CLIENTES_HOGAR_ID || 
            ['general institucional dinámico', 'general institucional', 'clientes hogar', 'grande', 'mediano', 'pequeño', 'modelo corporativo'].includes(name.toLowerCase().trim());

        if (isStandardModel) {
            alert(`El modelo estándar "${name}" es una columna vertebral del sistema de precios y está protegido contra eliminación.`);
            return;
        }

        // First confirmation
        const firstConfirm = confirm(`¿Estás seguro de que deseas eliminar el modelo de precios "${name}"?`);
        if (!firstConfirm) return;

        // Second confirmation: Require typing the model name
        const userInput = prompt(
            `¡ATENCIÓN! Esta acción es irreversible y eliminará todas las reglas de precios asociadas.\n\n` +
            `Para confirmar la eliminación, escribe el nombre del modelo exactamente como aparece ("${name}"):`
        );

        if (userInput === null) return; // User clicked "Cancel"

        if (userInput.trim() !== name.trim()) {
            alert('El nombre ingresado no coincide con el del modelo. Operación cancelada.');
            return;
        }

        const { error } = await supabase.from('pricing_models').delete().eq('id', id);
        if (error) {
            alert('Error al eliminar el modelo: ' + error.message);
        } else {
            fetchModels(); // Refresh
            if (selectedModel?.id === id) setSelectedModel(null);
        }
    };

    const toggleAutosyncDay = async (dayIndex: number) => {
        if (!selectedModel) return;
        
        const currentDays = selectedModel.autosync_days || [0, 1, 2, 3, 4, 5, 6];
        let newDays: number[];
        if (currentDays.includes(dayIndex)) {
            newDays = currentDays.filter(d => d !== dayIndex);
        } else {
            newDays = [...currentDays, dayIndex].sort();
        }

        const { error } = await supabase
            .from('pricing_models')
            .update({ autosync_days: newDays })
            .eq('id', selectedModel.id);
        
        if (error) {
            alert('Error al guardar días de recálculo: ' + error.message);
        } else {
            const updatedModel = { ...selectedModel, autosync_days: newDays };
            setSelectedModel(updatedModel);
            setModels(prev => prev.map(m => m.id === selectedModel.id ? updatedModel : m));
        }
    };

    const toggleAutosyncEnabled = async () => {
        if (!selectedModel) return;
        
        const newValue = !selectedModel.b2c_autosync_enabled;
        const { error } = await supabase
            .from('pricing_models')
            .update({ b2c_autosync_enabled: newValue })
            .eq('id', selectedModel.id);
        
        if (error) {
            alert('Error al actualizar auto-recálculo: ' + error.message);
        } else {
            const updatedModel = { ...selectedModel, b2c_autosync_enabled: newValue };
            setSelectedModel(updatedModel);
            setModels(prev => prev.map(m => m.id === selectedModel.id ? updatedModel : m));
        }
    };

    const saveMarginEdit = async (productId: string, valStr: string) => {
        if (!selectedModel) return;
        
        const normalizedStr = valStr.replace(',', '.');
        const parsedVal = parseFloat(normalizedStr);
        if (isNaN(parsedVal)) {
            // Reset to original
            const orig = matrixData.find(p => p.product_id === productId);
            if (orig) {
                setEditingMargins(prev => {
                    const next = { ...prev };
                    delete next[productId];
                    return next;
                });
            }
            return;
        }

        setSavingMargins(prev => ({ ...prev, [productId]: 'saving' }));

        try {
            const isBaseModel = selectedModel.id === GENERAL_INSTITUCIONAL_ID;
            let shouldDeleteRule = false;

            if (isBaseModel) {
                if (Math.abs(parsedVal - (Number(selectedModel.base_margin_percent) || 0)) < 0.001) {
                    shouldDeleteRule = true;
                }
            } else {
                // Consultar regla de General Institucional para este producto
                const { data: giRule } = await supabase
                    .from('pricing_rules')
                    .select('margin_adjustment')
                    .eq('model_id', GENERAL_INSTITUCIONAL_ID)
                    .eq('product_id', productId)
                    .maybeSingle();

                const giMargin = giRule?.margin_adjustment !== undefined && giRule?.margin_adjustment !== null
                    ? Number(giRule.margin_adjustment)
                    : 25;

                const expectedInheritedMargin = giMargin + (Number(selectedModel.base_margin_percent) || 0);

                if (Math.abs(parsedVal - expectedInheritedMargin) < 0.001) {
                    shouldDeleteRule = true;
                }
            }

            if (shouldDeleteRule) {
                // Delete pricing rule if it matches inherited/base margin
                const { error } = await supabase
                    .from('pricing_rules')
                    .delete()
                    .eq('model_id', selectedModel.id)
                    .eq('product_id', productId);
                
                if (error) throw error;
                
                setMatrixData(prev => prev.map(item => {
                    if (item.product_id === productId) {
                        return { 
                            ...item, 
                            margin: parsedVal, 
                            margin_adjustment: isBaseModel ? 0 : (Number(selectedModel.base_margin_percent) || 0), 
                            rule_id: null,
                            is_inherited: !isBaseModel
                        };
                    }
                    return item;
                }));
            } else {
                // Upsert pricing rule con margen absoluto
                const { data, error } = await supabase
                    .from('pricing_rules')
                    .upsert({
                        model_id: selectedModel.id,
                        product_id: productId,
                        margin_adjustment: parsedVal
                    }, { onConflict: 'model_id,product_id' })
                    .select()
                    .single();
                
                if (error) throw error;

                setMatrixData(prev => prev.map(item => {
                    if (item.product_id === productId) {
                        return { 
                            ...item, 
                            margin: parsedVal, 
                            margin_adjustment: parsedVal, 
                            rule_id: data.id,
                            is_inherited: false
                        };
                    }
                    return item;
                }));
            }

            // Auto-recalcular y sincronizar precios para todos los modelos y tienda web
            await fetch('/api/commercial/cost-matrix/sync-product', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId })
            }).catch(e => console.warn('Pricing sync error:', e));

            setSavingMargins(prev => ({ ...prev, [productId]: 'success' }));
            setTimeout(() => {
                setSavingMargins(prev => {
                    const next = { ...prev };
                    delete next[productId];
                    return next;
                });
            }, 1500);

        } catch (err: any) {
            console.error('Error saving margin:', err);
            setSavingMargins(prev => ({ ...prev, [productId]: 'error' }));
        } finally {
            setEditingMargins(prev => {
                const next = { ...prev };
                delete next[productId];
                return next;
            });
        }
    };

    const exportToExcel = async () => {
        if (!selectedModel || matrixData.length === 0) return;
        const XLSX = await import('xlsx');
        
        const data = matrixData.map(p => ({
            'ID': p.accounting_id || '',
            'SKU': p.sku || '',
            'Producto': p.name || '',
            'Categoría': CATEGORY_MAP[p.category] || p.category || '',
            'Unidad': p.unit_of_measure || '',
            'Costo Base': Math.round(p.base_cost),
            'IVA (%)': p.iva_rate,
            'Margen (%)': p.margin,
            'Sugerido sin IVA': Math.round(p.base_cost * (1 + p.margin / 100)),
            'Precio Final con IVA': Math.ceil((p.base_cost * (1 + p.margin / 100) * (1 + p.iva_rate / 100)) / 50) * 50
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Matriz de Precios");
        XLSX.writeFile(wb, `Planilla_Margenes_${selectedModel.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    const importFromExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedModel) return;

        setUploadingExcel(true);
        setExcelError(null);
        setExcelSuccess(null);

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const XLSX = await import('xlsx');
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const rawData = XLSX.utils.sheet_to_json<any>(ws);

                if (rawData.length === 0) {
                    throw new Error("El archivo Excel está vacío.");
                }

                // 1. Fetch active products to map ID/SKU to product_id
                let allProds: any[] = [];
                let pageNum = 0;
                const PAGE_SIZE = 1000;
                let finished = false;
                
                while (!finished) {
                    const { data, error } = await supabase
                        .from('products')
                        .select('id, sku, accounting_id')
                        .eq('is_active', true)
                        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);
                    
                    if (error) throw error;
                    if (data && data.length > 0) {
                        allProds = [...allProds, ...data];
                        if (data.length < PAGE_SIZE) {
                            finished = true;
                        } else {
                            pageNum++;
                        }
                    } else {
                        finished = true;
                    }
                }

                const idMap = new Map();
                const skuMap = new Map();
                allProds.forEach(p => {
                    if (p.accounting_id) idMap.set(String(p.accounting_id).trim(), p.id);
                    if (p.sku) skuMap.set(p.sku.trim().toLowerCase(), p.id);
                });

                // Prepare rules to upsert or delete
                const rulesToUpsert: any[] = [];
                const ruleIdsToDelete: string[] = [];
                
                const { data: existingRules } = await supabase
                    .from('pricing_rules')
                    .select('id, product_id')
                    .eq('model_id', selectedModel.id);
                
                const existingRulesMap = new Map();
                existingRules?.forEach(r => {
                    existingRulesMap.set(r.product_id, r.id);
                });

                let processedCount = 0;
                let skippedCount = 0;

                for (const row of rawData) {
                    const excelId = row['ID'] !== undefined ? String(row['ID']).trim() : '';
                    const excelSku = row['SKU'] !== undefined ? String(row['SKU']).trim().toLowerCase() : '';
                    const excelMarginVal = row['Margen (%)'] !== undefined ? row['Margen (%)'] : row['Margen'];

                    if (excelMarginVal === undefined) {
                        skippedCount++;
                        continue;
                    }

                    const parsedMargin = parseFloat(String(excelMarginVal).replace(',', '.'));
                    if (isNaN(parsedMargin)) {
                        skippedCount++;
                        continue;
                    }

                    let productId = null;
                    if (excelId && idMap.has(excelId)) {
                        productId = idMap.get(excelId);
                    } else if (excelSku && skuMap.has(excelSku)) {
                        productId = skuMap.get(excelSku);
                    }

                    if (!productId) {
                        skippedCount++;
                        continue;
                    }

                    const targetAdjustment = parsedMargin - selectedModel.base_margin_percent;

                    if (Math.abs(targetAdjustment) < 0.001) {
                        const existingRuleId = existingRulesMap.get(productId);
                        if (existingRuleId) {
                            ruleIdsToDelete.push(existingRuleId);
                        }
                    } else {
                        rulesToUpsert.push({
                            model_id: selectedModel.id,
                            product_id: productId,
                            margin_adjustment: targetAdjustment
                        });
                    }
                    processedCount++;
                }

                // Execute deletes
                if (ruleIdsToDelete.length > 0) {
                    for (let i = 0; i < ruleIdsToDelete.length; i += 100) {
                        const batch = ruleIdsToDelete.slice(i, i + 100);
                        const { error } = await supabase
                            .from('pricing_rules')
                            .delete()
                            .in('id', batch);
                        if (error) throw error;
                    }
                }

                // Execute upserts
                if (rulesToUpsert.length > 0) {
                    for (let i = 0; i < rulesToUpsert.length; i += 50) {
                        const batch = rulesToUpsert.slice(i, i + 50);
                        const { error } = await supabase
                            .from('pricing_rules')
                            .upsert(batch, { onConflict: 'model_id,product_id' });
                        if (error) throw error;
                    }
                }

                const affectedIds = rulesToUpsert.map(r => r.product_id);
                if (affectedIds.length > 0) {
                    await batchRecalculateAndSyncPrices(supabase, affectedIds).catch(e => console.warn('Excel pricing sync error:', e));
                }

                setExcelSuccess(`Planilla cargada. Se procesaron ${processedCount} filas: ${rulesToUpsert.length} excepciones creadas/actualizadas y ${ruleIdsToDelete.length} reglas removidas.`);
                await fetchMatrixData(selectedModel.id);
            } catch (err: any) {
                console.error('Error importing Excel:', err);
                setExcelError(`Error al procesar el archivo: ${err.message}`);
            } finally {
                setUploadingExcel(false);
                e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    // --- RULE ACTIONS ---
    const searchProducts = async (term: string) => {
        setRuleProductSearch(term);
        if (term.length < 2) {
            setProducts([]);
            return;
        }
        const { data } = await supabase.from('products').select('id, name, unit_of_measure').ilike('name', `%${term}%`).limit(5);
        if (data) setProducts(data);
    };

    const createRule = async () => {
        if (!ruleSelectedProduct) return alert('Selecciona un producto');

        const productId = ruleSelectedProduct.id;
        const { error } = await supabase.from('pricing_rules').upsert({
            model_id: selectedModel.id,
            product_id: productId,
            margin_adjustment: ruleAdjustment
        }, { onConflict: 'model_id,product_id' });

        if (error) {
            console.error('Error saving rule:', error);
            return alert('Error al guardar: ' + error.message);
        }

        await fetch('/api/commercial/cost-matrix/sync-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId })
        }).catch(e => console.warn('Pricing sync error:', e));

        await fetchMatrixData(selectedModel.id);
        setShowRuleModal(false);
        setRuleSelectedProduct(null);
        setRuleProductSearch('');
        setRuleAdjustment(0);
    };

    const deleteRule = async (id: string, productId?: string) => {
        await supabase.from('pricing_rules').delete().eq('id', id);
        if (productId) {
            await fetch('/api/commercial/cost-matrix/sync-product', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId })
            }).catch(e => console.warn('Pricing sync error:', e));
        }
        fetchMatrixData(selectedModel.id);
    };

    // --- MASTER SYNC LOGIC ---
    const syncPricesToCatalog = async () => {
        if (!selectedModel) return;

        const isHogar = selectedModel.id === CLIENTES_HOGAR_ID || 
                        selectedModel.is_base_model || 
                        selectedModel.name.toLowerCase().includes('hogar') || 
                        selectedModel.name.toLowerCase().includes('b2c');

        if (!confirm(`¿Estás seguro? Esta acción recalculará y sincronizará los precios de todo el catálogo tomando como base la Matriz de Costos ${isHogar ? 'y actualizará los precios del catálogo público B2C Clientes Hogar.' : `para el modelo ${selectedModel.name}.`}`)) return;

        setIsSyncing(true);
        try {
            console.log('Iniciando sincronización maestra de precios para modelo:', selectedModel.name);

            const res = await batchRecalculateAndSyncPrices(supabase);
            if (!res.success) throw new Error(res.error || 'Error en sincronización');

            await fetchMatrixData(selectedModel.id);
            alert(`¡Éxito! Se han recalculado y sincronizado ${res.processed} productos en la Matriz y Catálogo.`);
        } catch (err: any) {
            console.error('Error en Sync:', err);
            alert('Error durante la sincronización: ' + err.message);
        } finally {
            setIsSyncing(false);
        }
    };    // Filter the matrix data locally
    const filteredProducts = matrixData.filter(prod => {
        const term = matrixSearch.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (!term) return true;
        const prodName = (prod.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const prodSku = (prod.sku || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const prodId = String(prod.accounting_id || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const categoryName = (CATEGORY_MAP[prod.category] || prod.category || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return prodName.includes(term) || prodSku.includes(term) || prodId.includes(term) || categoryName.includes(term);
    });

    // Sort the filtered products tri-state
    const sortedProducts = [...filteredProducts].sort((a, b) => {
        if (!matrixSortField) return 0;

        switch (matrixSortField) {
            case 'id': {
                const idA = a.accounting_id || a.sku || '';
                const idB = b.accounting_id || b.sku || '';
                const numA = Number(idA);
                const numB = Number(idB);
                if (!isNaN(numA) && !isNaN(numB) && idA !== '' && idB !== '') {
                    return matrixSortOrder === 'asc' ? numA - numB : numB - numA;
                }
                return matrixSortOrder === 'asc' 
                    ? String(idA).localeCompare(String(idB), 'es', { numeric: true }) 
                    : String(idB).localeCompare(String(idA), 'es', { numeric: true });
            }
            case 'name': {
                const valA = a.name || '';
                const valB = b.name || '';
                return matrixSortOrder === 'asc'
                    ? valA.localeCompare(valB, 'es', { sensitivity: 'base', numeric: true })
                    : valB.localeCompare(valA, 'es', { sensitivity: 'base', numeric: true });
            }
            case 'category': {
                const valA = CATEGORY_MAP[a.category] || a.category || '';
                const valB = CATEGORY_MAP[b.category] || b.category || '';
                return matrixSortOrder === 'asc'
                    ? valA.localeCompare(valB, 'es', { sensitivity: 'base', numeric: true })
                    : valB.localeCompare(valA, 'es', { sensitivity: 'base', numeric: true });
            }
            case 'base_cost': {
                const valA = Number(a.base_cost) || 0;
                const valB = Number(b.base_cost) || 0;
                return matrixSortOrder === 'asc' ? valA - valB : valB - valA;
            }
            case 'iva_rate': {
                const valA = Number(a.iva_rate) || 0;
                const valB = Number(b.iva_rate) || 0;
                return matrixSortOrder === 'asc' ? valA - valB : valB - valA;
            }
            case 'margin': {
                const valA = Number(a.margin) || 0;
                const valB = Number(b.margin) || 0;
                return matrixSortOrder === 'asc' ? valA - valB : valB - valA;
            }
            case 'suggested_price': {
                const valA = (Number(a.base_cost) || 0) * (1 + (Number(a.margin) || 0) / 100);
                const valB = (Number(b.base_cost) || 0) * (1 + (Number(b.margin) || 0) / 100);
                return matrixSortOrder === 'asc' ? valA - valB : valB - valA;
            }
            case 'final_price': {
                const priceBeforeTaxA = (Number(a.base_cost) || 0) * (1 + (Number(a.margin) || 0) / 100);
                const finalA = Math.ceil((priceBeforeTaxA * (1 + (Number(a.iva_rate) || 0) / 100)) / 50) * 50;
                const priceBeforeTaxB = (Number(b.base_cost) || 0) * (1 + (Number(b.margin) || 0) / 100);
                const finalB = Math.ceil((priceBeforeTaxB * (1 + (Number(b.iva_rate) || 0) / 100)) / 50) * 50;
                return matrixSortOrder === 'asc' ? finalA - finalB : finalB - finalA;
            }
            default:
                return 0;
        }
    });

    const avgMargin = matrixData.length > 0
        ? matrixData.reduce((acc, curr) => acc + curr.margin, 0) / matrixData.length
        : selectedModel?.base_margin_percent || 0;

    const totalItems = sortedProducts.length;
    const totalPages = Math.ceil(totalItems / matrixPageSize);
    const startIndex = (matrixPage - 1) * matrixPageSize;
    const endIndex = startIndex + matrixPageSize;
    const paginatedProducts = sortedProducts.slice(startIndex, endIndex);

    const getAutosyncDaysSummary = (days: number[] | null) => {
        const dayList = days || [0, 1, 2, 3, 4, 5, 6];
        if (dayList.length === 7) return 'Todos los días';
        if (dayList.length === 0) return 'Sin días programados';
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
        return dayList.map(d => dayNames[d]).join(', ');
    };

    return (
        <main style={{ minHeight: embedded ? 'auto' : '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography.fontFamilyMain }}>
            <div style={{ maxWidth: '1600px', margin: '0 auto', padding: embedded ? '0.5rem 2rem 2.5rem 2rem' : '1.25rem 2rem 2rem 2rem' }}>
                {!embedded && (
                <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {!embedded && (
                            <Link href="/admin/commercial" style={{ textDecoration: 'none', color: THEME.colors.textSecondary, fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem' }}>
                                <ArrowLeft size={16} /> Volver a Comercial
                            </Link>
                        )}
                        <div style={{ display: 'inline-flex', gap: '4px', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '8px', border: `1px solid ${THEME.colors.border}` }}>
                            <button
                                onClick={() => setActiveTab('models')}
                                style={{
                                    padding: '0.35rem 0.9rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: activeTab === 'models' ? 'white' : 'transparent',
                                    color: activeTab === 'models' ? THEME.colors.primary : THEME.colors.textSecondary,
                                    fontSize: '0.82rem',
                                    fontWeight: activeTab === 'models' ? '800' : '600',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    boxShadow: activeTab === 'models' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.15s'
                                }}
                            >Modelos Estándar</button>
                            <button
                                onClick={() => setActiveTab('templates')}
                                style={{
                                    padding: '0.35rem 0.9rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: activeTab === 'templates' ? 'white' : 'transparent',
                                    color: activeTab === 'templates' ? THEME.colors.primary : THEME.colors.textSecondary,
                                    fontSize: '0.82rem',
                                    fontWeight: activeTab === 'templates' ? '800' : '600',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    boxShadow: activeTab === 'templates' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.15s'
                                }}
                            >Modelos por Cliente (Canastas)</button>
                        </div>
                    </div>
                </div>
                )}

                {activeTab === 'models' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>

                    {/* --- MASTER MODEL SELECTOR & ACTION BAR (Full-Width Swiss Precision) --- */}
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: THEME.radius.lg,
                        boxShadow: THEME.shadow.sm,
                        border: `1px solid ${THEME.colors.border}`,
                        padding: '0.85rem 1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem'
                    }}>
                        {/* ROW 1: MASTER SELECTOR + NEW BUTTON + ACTIONS */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flex: 1, minWidth: '320px' }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748B', whiteSpace: 'nowrap' }}>
                                    Modelo de Precios:
                                </span>

                                <div ref={modelPickerRef} style={{ position: 'relative', minWidth: '340px', maxWidth: '520px', flex: 1 }}>
                                    <input
                                        type="text"
                                        value={isModelPickerOpen ? modelSearchQuery : (selectedModel ? `${selectedModel.name} — Margen Base: ${selectedModel.base_margin_percent}%` : '')}
                                        placeholder="Buscar modelo de precios..."
                                        onFocus={() => {
                                            setIsModelPickerOpen(true);
                                            setModelSearchQuery('');
                                        }}
                                        onChange={e => {
                                            setModelSearchQuery(e.target.value);
                                            if (!isModelPickerOpen) setIsModelPickerOpen(true);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: (selectedModel?.id === GENERAL_INSTITUCIONAL_ID || selectedModel?.name?.toLowerCase().includes('general institucional')) && !isModelPickerOpen 
                                                ? '0.5rem 6.6rem 0.5rem 0.85rem' 
                                                : '0.5rem 0.85rem',
                                            borderRadius: '8px',
                                            border: isModelPickerOpen 
                                                ? `1.5px solid ${THEME.colors.primary}` 
                                                : ((selectedModel?.id === GENERAL_INSTITUCIONAL_ID || selectedModel?.name?.toLowerCase().includes('general institucional')) ? '1.5px solid #059669' : `1.5px solid ${THEME.colors.border}`),
                                            backgroundColor: isModelPickerOpen 
                                                ? '#FFFFFF' 
                                                : ((selectedModel?.id === GENERAL_INSTITUCIONAL_ID || selectedModel?.name?.toLowerCase().includes('general institucional')) ? '#F8FCFA' : '#F8FAFC'),
                                            fontWeight: '700',
                                            fontSize: '0.88rem',
                                            color: THEME.colors.textMain,
                                            cursor: 'text',
                                            outline: 'none',
                                            boxShadow: isModelPickerOpen ? '0 0 0 2px rgba(13, 122, 87, 0.15)' : 'none',
                                            transition: 'all 0.15s ease'
                                        }}
                                    />
                                    {(selectedModel?.id === GENERAL_INSTITUCIONAL_ID || selectedModel?.name?.toLowerCase().includes('general institucional')) && !isModelPickerOpen && (
                                        <span style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                                            <span style={{
                                                fontSize: '0.62rem',
                                                fontWeight: '800',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.04em',
                                                backgroundColor: '#DCFCE7',
                                                color: '#15803D',
                                                border: '1px solid #A7F3D0',
                                                padding: '2px 7px',
                                                borderRadius: '999px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '3px'
                                            }}>
                                                <Crown size={11} strokeWidth={2.4} /> Base Maestra
                                            </span>
                                        </span>
                                    )}
                                    {isModelPickerOpen && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 4px)',
                                            left: 0,
                                            right: 0,
                                            backgroundColor: 'white',
                                            border: `1px solid ${THEME.colors.border}`,
                                            borderRadius: '8px',
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                            zIndex: 100,
                                            maxHeight: '280px',
                                            overflowY: 'auto'
                                        }}>
                                            {models
                                                .filter(m => {
                                                    if (!modelSearchQuery.trim()) return true;
                                                    const q = modelSearchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                                    const name = (m.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                                    return name.includes(q);
                                                })
                                                .map(m => {
                                                    const isSelected = selectedModel?.id === m.id;
                                                    const isMaster = m.id === GENERAL_INSTITUCIONAL_ID || m.name?.toLowerCase().includes('general institucional');
                                                    const avg = modelAverages[m.id] !== undefined ? modelAverages[m.id] : (m.base_margin_percent || 0);
                                                    return (
                                                        <div
                                                            key={m.id}
                                                            onClick={() => {
                                                                setSelectedModel(m);
                                                                setIsModelPickerOpen(false);
                                                                setModelSearchQuery('');
                                                                setIsEditingModel(false);
                                                            }}
                                                            style={{
                                                                padding: isMaster ? '0.75rem 0.95rem' : '0.65rem 0.9rem',
                                                                cursor: 'pointer',
                                                                borderBottom: isMaster ? '1.5px solid #E2E8F0' : '1px solid #F1F5F9',
                                                                borderLeft: isMaster ? '4px solid #059669' : '4px solid transparent',
                                                                backgroundColor: isSelected 
                                                                    ? '#F0FDF4' 
                                                                    : (isMaster ? '#F8FCFA' : 'white'),
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                gap: '0.6rem',
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                            onMouseEnter={e => {
                                                                if (!isSelected) {
                                                                    e.currentTarget.style.backgroundColor = isMaster ? '#EBF8F2' : '#F8FAFC';
                                                                }
                                                            }}
                                                            onMouseLeave={e => {
                                                                if (!isSelected) {
                                                                    e.currentTarget.style.backgroundColor = isMaster ? '#F8FCFA' : 'white';
                                                                }
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                                                                 {isMaster && (
                                                                     <Crown size={14} color="#059669" strokeWidth={2.4} style={{ flexShrink: 0 }} />
                                                                 )}
                                                                 <span style={{
                                                                     fontWeight: isMaster ? '800' : (isSelected ? '800' : '600'),
                                                                     color: isMaster ? '#0F172A' : (isSelected ? THEME.colors.primary : THEME.colors.textMain),
                                                                     fontSize: '0.86rem',
                                                                     letterSpacing: isMaster ? '-0.01em' : 'normal'
                                                                 }}>
                                                                     {m.name}
                                                                 </span>
                                                                 {isMaster && (
                                                                     <span style={{
                                                                         fontSize: '0.62rem',
                                                                         fontWeight: '800',
                                                                         textTransform: 'uppercase',
                                                                         letterSpacing: '0.04em',
                                                                         backgroundColor: '#DCFCE7',
                                                                         color: '#15803D',
                                                                         border: '1px solid #A7F3D0',
                                                                         padding: '1px 7px',
                                                                         borderRadius: '999px',
                                                                         whiteSpace: 'nowrap',
                                                                         display: 'inline-flex',
                                                                         alignItems: 'center',
                                                                         boxShadow: '0 1px 2px rgba(5, 150, 105, 0.08)'
                                                                     }}>
                                                                         Base Maestra
                                                                     </span>
                                                                 )}
                                                            </div>
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                fontWeight: '700',
                                                                color: isMaster ? '#047857' : (isSelected ? '#065F46' : '#64748B'),
                                                                backgroundColor: isMaster ? '#E6F7F0' : (isSelected ? '#DCFCE7' : '#F1F5F9'),
                                                                border: isMaster ? '1px solid #A7F3D0' : 'none',
                                                                padding: '2px 8px',
                                                                borderRadius: '5px',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                Margen: {m.base_margin_percent}% (Prom: {formatNumber(avg, 1)}%)
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => { setIsCreating(true); setCreateModelError(null); setNewModelName(''); setNewModelDesc(''); }}
                                    style={{
                                        padding: '0.45rem 0.85rem',
                                        borderRadius: '6px',
                                        border: 'none',
                                        backgroundColor: THEME.colors.primary,
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontWeight: '700',
                                        fontSize: '0.8rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        boxShadow: '0 1px 3px rgba(13, 122, 87, 0.2)'
                                    }}
                                >
                                    Nuevo Modelo
                                </button>

                                {selectedModel && (
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        backgroundColor: '#ECFDF5',
                                        border: '1px solid #A7F3D0',
                                        padding: '0.3rem 0.65rem',
                                        borderRadius: '6px'
                                    }}>
                                        <span style={{ fontSize: '0.62rem', fontWeight: '800', textTransform: 'uppercase', color: '#065F46' }}>Promedio Real:</span>
                                        <span style={{ fontSize: '0.88rem', fontWeight: '900', color: '#0D7A57' }}>
                                            {formatNumber(modelAverages[selectedModel.id] !== undefined ? modelAverages[selectedModel.id] : (selectedModel.base_margin_percent || 0), 1)}%
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Right: Actions */}
                            {selectedModel && (
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    {selectedModel.name === 'Clientes B2C' && (
                                        <button
                                            onClick={syncPricesToCatalog}
                                            disabled={isSyncing}
                                            style={{
                                                backgroundColor: THEME.colors.primary,
                                                color: 'white',
                                                border: 'none',
                                                padding: '0.45rem 0.85rem',
                                                borderRadius: '6px',
                                                fontWeight: '700',
                                                cursor: isSyncing ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                fontSize: '0.78rem'
                                            }}
                                        >
                                            
                                            {isSyncing ? 'Fijando...' : 'Fijar Precios'}
                                        </button>
                                    )}

                                    <button
                                        onClick={() => setShowExcelModal(true)}
                                        style={{
                                            backgroundColor: '#F0FDF4',
                                            color: '#0D7A57',
                                            border: '1px solid #BBF7D0',
                                            padding: '0.45rem 0.85rem',
                                            borderRadius: '6px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            fontSize: '0.78rem'
                                        }}
                                    >
                                        Excel
                                    </button>

                                    <button
                                        onClick={() => {
                                            setEditModelData({
                                                name: selectedModel.name,
                                                description: selectedModel.description,
                                                margin: selectedModel.base_margin_percent,
                                                color_tag: selectedModel.color_tag || null
                                            });
                                            setIsEditingModel(true);
                                        }}
                                        style={{
                                            color: '#475569',
                                            backgroundColor: '#F8FAFC',
                                            border: '1px solid #E2E8F0',
                                            padding: '0.45rem 0.85rem',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontWeight: '700',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            fontSize: '0.78rem'
                                        }}
                                    >
                                        Editar
                                    </button>


                                </div>
                            )}
                        </div>

                        {/* ROW 2: SUB-CINTA ESBELTA (Margen Base + Descripción + Recálculo Nocturno) */}
                        {selectedModel && !isEditingModel && (
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '0.75rem',
                                paddingTop: '0.5rem',
                                borderTop: `1px solid ${THEME.colors.border || '#F1F5F9'}`
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', backgroundColor: '#EAFDF4', color: '#0D7A57', padding: '0.2rem 0.55rem', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                        Margen Base: {selectedModel.base_margin_percent}%
                                    </span>

                                    {(selectedModel.id === GENERAL_INSTITUCIONAL_ID || selectedModel.name?.toLowerCase().includes('general institucional')) && (
                                        <span style={{
                                            fontSize: '0.68rem',
                                            fontWeight: '800',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.04em',
                                            color: '#047857',
                                            backgroundColor: '#ECFDF5',
                                            border: '1px solid #A7F3D0',
                                            padding: '2px 8px',
                                            borderRadius: '999px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            <Crown size={11} strokeWidth={2.5} /> Modelo Base Maestro
                                        </span>
                                    )}

                                    {selectedModel.color_tag && (
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: '700',
                                            padding: '0.15rem 0.5rem',
                                            borderRadius: '10px',
                                            backgroundColor: selectedModel.color_tag === 'verde' ? '#DCFCE7' : selectedModel.color_tag === 'amarillo' ? '#FEF3C7' : '#FEE2E2',
                                            color: selectedModel.color_tag === 'verde' ? '#15803D' : selectedModel.color_tag === 'amarillo' ? '#B45309' : '#B91C1C'
                                        }}>
                                            {selectedModel.color_tag === 'verde' ? 'Segmento Verde (Grande)' : selectedModel.color_tag === 'amarillo' ? 'Segmento Amarillo (Mediano)' : 'Segmento Rojo (Pequeño)'}
                                        </span>
                                    )}

                                    {selectedModel.description && (
                                        <span style={{ color: THEME.colors.textSecondary, fontSize: '0.78rem', maxWidth: '600px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {selectedModel.description}
                                        </span>
                                    )}
                                </div>

                                {/* Recálculo Nocturno */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        Recálculo medianoche:
                                    </span>
                                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                                        {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((dayName, idx) => {
                                            const isSelected = (selectedModel.autosync_days || [0, 1, 2, 3, 4, 5, 6]).includes(idx);
                                            return (
                                                <button
                                                    key={idx}
                                                    onClick={() => toggleAutosyncDay(idx)}
                                                    title={`Recalcular día ${dayName}`}
                                                    style={{
                                                        width: '20px',
                                                        height: '20px',
                                                        borderRadius: '50%',
                                                        border: 'none',
                                                        backgroundColor: isSelected ? THEME.colors.primary : '#E2E8F0',
                                                        color: isSelected ? 'white' : '#64748B',
                                                        fontWeight: 'bold',
                                                        fontSize: '0.62rem',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        transition: 'all 0.15s'
                                                    }}
                                                >
                                                    {dayName}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', borderLeft: `1px solid ${THEME.colors.border}`, paddingLeft: '0.6rem' }}>
                                        <button
                                            onClick={toggleAutosyncEnabled}
                                            title={selectedModel.b2c_autosync_enabled ? 'Desactivar recálculo automático' : 'Activar recálculo automático'}
                                            style={{
                                                width: '28px',
                                                height: '16px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                backgroundColor: selectedModel.b2c_autosync_enabled ? THEME.colors.primary : '#CBD5E1',
                                                position: 'relative',
                                                cursor: 'pointer',
                                                padding: 0
                                            }}
                                        >
                                            <span style={{
                                                width: '12px',
                                                height: '12px',
                                                borderRadius: '50%',
                                                backgroundColor: 'white',
                                                position: 'absolute',
                                                top: '2px',
                                                left: selectedModel.b2c_autosync_enabled ? '14px' : '2px',
                                                transition: 'left 0.2s'
                                            }} />
                                        </button>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 'bold', color: selectedModel.b2c_autosync_enabled ? THEME.colors.primary : THEME.colors.textSecondary }}>
                                            {selectedModel.b2c_autosync_enabled ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* INLINE BANNER: CREATE NEW MODEL */}
                    {isCreating && (
                        <div style={{
                            backgroundColor: '#F8FAFC',
                            padding: '1.25rem',
                            borderRadius: THEME.radius.lg,
                            border: `1.5px solid ${THEME.colors.primary}`,
                            boxShadow: THEME.shadow.sm
                        }}>
                            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: '800', color: THEME.colors.primary, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                Crear Nuevo Modelo de Precios
                            </h4>
                            {createModelError && (
                                <div style={{
                                    padding: '0.6rem 0.75rem',
                                    marginBottom: '0.75rem',
                                    borderRadius: '6px',
                                    backgroundColor: '#FEF2F2',
                                    border: '1px solid #FCA5A5',
                                    color: '#991B1B',
                                    fontSize: '0.8rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}>
                                    <AlertCircle size={15} color="#DC2626" />
                                    <span>{createModelError}</span>
                                </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.25rem' }}>Nombre del Modelo *</label>
                                    <input 
                                        placeholder="Ej: B2B Premium o 30 días" 
                                        value={newModelName} 
                                        onChange={e => {
                                            setNewModelName(e.target.value);
                                            if (createModelError) setCreateModelError(null);
                                        }} 
                                        disabled={isSubmittingModel}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, fontSize: '0.85rem' }} 
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.25rem' }}>Uso / Segmento</label>
                                    <input 
                                        placeholder="Ej: Clientes B2B con 30 días de plazo" 
                                        value={newModelDesc} 
                                        onChange={e => setNewModelDesc(e.target.value)} 
                                        disabled={isSubmittingModel}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, fontSize: '0.85rem' }} 
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.25rem' }}>Margen Base %</label>
                                    <input 
                                        type="number" 
                                        value={newModelMargin || ''} 
                                        disabled={isSubmittingModel}
                                        onChange={e => {
                                            const val = parseFloat(e.target.value);
                                            setNewModelMargin(isNaN(val) ? 0 : val);
                                        }} 
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, fontWeight: 'bold' }} 
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.25rem' }}>Clonar Reglas Desde (Opcional)</label>
                                    <select 
                                        value={cloneFromModelId} 
                                        disabled={isSubmittingModel}
                                        onChange={e => setCloneFromModelId(e.target.value)} 
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', fontSize: '0.85rem' }}
                                    >
                                        <option value="">-- No clonar, empezar vacío --</option>
                                        {models.map(m => (
                                            <option key={m.id} value={m.id}>{m.name} ({m.base_margin_percent}%)</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button 
                                    onClick={() => { setIsCreating(false); setCreateModelError(null); }} 
                                    disabled={isSubmittingModel} 
                                    style={{ padding: '0.45rem 1rem', borderRadius: '6px', backgroundColor: '#E2E8F0', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.82rem', color: '#475569' }}
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={createModel} 
                                    disabled={isSubmittingModel || !newModelName.trim()} 
                                    style={{ 
                                        padding: '0.45rem 1.25rem', 
                                        borderRadius: '6px', 
                                        backgroundColor: (isSubmittingModel || !newModelName.trim()) ? '#9CA3AF' : THEME.colors.primary, 
                                        color: 'white', 
                                        border: 'none', 
                                        cursor: (isSubmittingModel || !newModelName.trim()) ? 'not-allowed' : 'pointer', 
                                        fontWeight: '800', 
                                        fontSize: '0.82rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.35rem'
                                    }}
                                >
                                    
                                    {isSubmittingModel ? 'Guardando...' : 'Crear Modelo'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* INLINE BANNER: EDIT MODEL */}
                    {isEditingModel && selectedModel && (
                        <div style={{
                            backgroundColor: '#F8FAFC',
                            padding: '1.25rem',
                            borderRadius: THEME.radius.lg,
                            border: `1.5px solid ${THEME.colors.primary}`,
                            boxShadow: THEME.shadow.sm
                        }}>
                            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                Editar Modelo: {selectedModel.name}
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.25rem' }}>Nombre del Modelo</label>
                                    <input
                                        value={editModelData.name}
                                        onChange={e => setEditModelData({ ...editModelData, name: e.target.value })}
                                        style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold', border: `1px solid ${THEME.colors.border}`, borderRadius: '6px' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.25rem' }}>Uso / Descripción</label>
                                    <input
                                        value={editModelData.description}
                                        onChange={e => setEditModelData({ ...editModelData, description: e.target.value })}
                                        style={{ width: '100%', padding: '0.5rem', border: `1px solid ${THEME.colors.border}`, borderRadius: '6px', fontSize: '0.85rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.25rem' }}>Margen Base (%)</label>
                                    <input
                                        type="number"
                                        value={editModelData.margin || ''}
                                        onChange={e => {
                                            const val = parseFloat(e.target.value);
                                            setEditModelData({ ...editModelData, margin: isNaN(val) ? 0 : val });
                                        }}
                                        style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold', color: THEME.colors.primary, border: `1px solid ${THEME.colors.border}`, borderRadius: '6px' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.25rem' }}>Clasificación Semáforo B2B</label>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button 
                                            type="button"
                                            onClick={() => setEditModelData({ ...editModelData, color_tag: editModelData.color_tag === 'verde' ? null : 'verde' })}
                                            style={{
                                                padding: '0.35rem 0.6rem',
                                                borderRadius: '6px',
                                                border: editModelData.color_tag === 'verde' ? '2px solid #10B981' : '1px solid #E2E8F0',
                                                backgroundColor: editModelData.color_tag === 'verde' ? '#DCFCE7' : 'white',
                                                color: editModelData.color_tag === 'verde' ? '#15803D' : '#475569',
                                                fontWeight: '700',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '3px'
                                            }}
                                        >
                                            <CircleDot size={12} color="#10B981" /> Verde
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setEditModelData({ ...editModelData, color_tag: editModelData.color_tag === 'amarillo' ? null : 'amarillo' })}
                                            style={{
                                                padding: '0.35rem 0.6rem',
                                                borderRadius: '6px',
                                                border: editModelData.color_tag === 'amarillo' ? '2px solid #F59E0B' : '1px solid #E2E8F0',
                                                backgroundColor: editModelData.color_tag === 'amarillo' ? '#FEF3C7' : 'white',
                                                color: editModelData.color_tag === 'amarillo' ? '#B45309' : '#475569',
                                                fontWeight: '700',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '3px'
                                            }}
                                        >
                                            <CircleDot size={12} color="#F59E0B" /> Amarillo
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setEditModelData({ ...editModelData, color_tag: editModelData.color_tag === 'rojo' ? null : 'rojo' })}
                                            style={{
                                                padding: '0.35rem 0.6rem',
                                                borderRadius: '6px',
                                                border: editModelData.color_tag === 'rojo' ? '2px solid #EF4444' : '1px solid #E2E8F0',
                                                backgroundColor: editModelData.color_tag === 'rojo' ? '#FEE2E2' : 'white',
                                                color: editModelData.color_tag === 'rojo' ? '#B91C1C' : '#475569',
                                                fontWeight: '700',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '3px'
                                            }}
                                        >
                                            <CircleDot size={12} color="#EF4444" /> Rojo
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button 
                                    onClick={() => setIsEditingModel(false)} 
                                    style={{ padding: '0.45rem 1rem', borderRadius: '6px', backgroundColor: '#E2E8F0', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.82rem', color: '#475569' }}
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={saveModelChanges} 
                                    style={{ padding: '0.45rem 1.25rem', backgroundColor: THEME.colors.primary, color: 'white', border: 'none', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}
                                >
                                    Guardar Cambios
                                </button>
                            </div>
                        </div>
                    )}

                    {/* PRICING MATRIX VIEW */}
                    {selectedModel ? (
                            <div style={{ 
                                backgroundColor: 'white', 
                                borderRadius: THEME.radius.lg, 
                                boxShadow: THEME.shadow.md, 
                                border: `1px solid ${THEME.colors.border}`,
                                position: 'relative'
                            }}>
                                
                                {/* Search and count header (Sticky Frosted Toolbar) */}
                                <div style={{ 
                                    padding: '0.85rem 1.5rem', 
                                    borderBottom: `1px solid ${THEME.colors.border}`,
                                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                                    backdropFilter: 'blur(12px)',
                                    position: 'sticky',
                                    top: embedded ? '142px' : '85px',
                                    zIndex: 40,
                                    borderTopLeftRadius: THEME.radius.lg,
                                    borderTopRightRadius: THEME.radius.lg,
                                    boxSizing: 'border-box',
                                    minHeight: '66px',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', width: '100%' }}>
                                        <div style={{ flex: 1, minWidth: '280px' }}>
                                            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, color: THEME.colors.textMain }}>Matriz de Precios y Utilidades</h3>
                                            <p style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, margin: '0.15rem 0 0 0' }}>
                                                Listado completo de productos activos. Edita el margen directamente y se guardará automáticamente.
                                            </p>
                                        </div>
                                        
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '350px' }}>
                                            <div style={{ position: 'relative', width: '100%' }}>
                                                <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center' }}>
                                                    <Search size={16} />
                                                </span>
                                                <input 
                                                    type="text"
                                                    value={matrixSearch}
                                                    onChange={e => {
                                                        setMatrixSearch(e.target.value);
                                                        setMatrixPage(1);
                                                    }}
                                                    placeholder="Buscar por SKU, ID, nombre..."
                                                    style={{ 
                                                        width: '100%', 
                                                        padding: '0.55rem 0.55rem 0.55rem 2.2rem', 
                                                        border: `1px solid ${THEME.colors.border}`, 
                                                        borderRadius: '8px', 
                                                        fontSize: '0.85rem',
                                                        outline: 'none',
                                                        transition: 'border-color 0.2s'
                                                    }}
                                                    onFocus={e => e.target.style.borderColor = THEME.colors.primary}
                                                    onBlur={e => e.target.style.borderColor = THEME.colors.border}
                                                />
                                                {matrixSearch && (
                                                    <button 
                                                        onClick={() => {
                                                            setMatrixSearch('');
                                                            setMatrixPage(1);
                                                        }}
                                                        style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: THEME.colors.textSecondary, padding: 0 }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                            
                                            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: THEME.colors.textSecondary, whiteSpace: 'nowrap' }}>
                                                {filteredProducts.length} items
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {filteredProducts.length === 0 ? (
                                    <div style={{ padding: '4rem 2rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}><Search size={40} color="#94A3B8" /></div>
                                        <p style={{ fontWeight: 'bold', margin: 0 }}>No se encontraron productos</p>
                                        <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Prueba con otros términos de búsqueda.</p>
                                    </div>
                                ) : (
                                    <div style={{ width: '100%', position: 'relative' }}>
                                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                                            <thead style={{ position: 'sticky', top: embedded ? '208px' : '151px', zIndex: 30, backgroundColor: '#F8FAFC' }}>
                                                <tr>
                                                    <th 
                                                        onClick={() => handleMatrixSort('id')}
                                                        style={{ 
                                                            ...THEME.typography.tableHeader, 
                                                            padding: '0.65rem 1.25rem', 
                                                            width: '10%', 
                                                            position: 'sticky', 
                                                            top: embedded ? '208px' : '151px', 
                                                            backgroundColor: '#F8FAFC', 
                                                            zIndex: 30, 
                                                            borderBottom: `1.5px solid ${THEME.colors.border}`, 
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                                            cursor: 'pointer',
                                                            userSelect: 'none'
                                                        }}
                                                    >
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: matrixSortField === 'id' ? THEME.colors.primary : THEME.colors.textSecondary }}>
                                                            <span>ID ERP</span>
                                                            {matrixSortField === 'id' ? (
                                                                matrixSortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />
                                                            ) : (
                                                                <ArrowUpDown size={11} style={{ opacity: 0.35 }} />
                                                            )}
                                                        </div>
                                                    </th>
                                                    <th 
                                                        onClick={() => handleMatrixSort('name')}
                                                        style={{ 
                                                            ...THEME.typography.tableHeader, 
                                                            padding: '0.65rem 1.25rem', 
                                                            width: '35%', 
                                                            position: 'sticky', 
                                                            top: embedded ? '208px' : '151px', 
                                                            backgroundColor: '#F8FAFC', 
                                                            zIndex: 30, 
                                                            borderBottom: `1.5px solid ${THEME.colors.border}`, 
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                                            cursor: 'pointer',
                                                            userSelect: 'none'
                                                        }}
                                                    >
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: matrixSortField === 'name' ? THEME.colors.primary : THEME.colors.textSecondary }}>
                                                            <span>Producto</span>
                                                            {matrixSortField === 'name' ? (
                                                                matrixSortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />
                                                            ) : (
                                                                <ArrowUpDown size={11} style={{ opacity: 0.35 }} />
                                                            )}
                                                        </div>
                                                    </th>
                                                    <th 
                                                        onClick={() => handleMatrixSort('category')}
                                                        style={{ 
                                                            ...THEME.typography.tableHeader, 
                                                            padding: '0.65rem 1.25rem', 
                                                            width: '15%', 
                                                            position: 'sticky', 
                                                            top: embedded ? '208px' : '151px', 
                                                            backgroundColor: '#F8FAFC', 
                                                            zIndex: 30, 
                                                            borderBottom: `1.5px solid ${THEME.colors.border}`, 
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                                            cursor: 'pointer',
                                                            userSelect: 'none'
                                                        }}
                                                    >
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: matrixSortField === 'category' ? THEME.colors.primary : THEME.colors.textSecondary }}>
                                                            <span>Categoría</span>
                                                            {matrixSortField === 'category' ? (
                                                                matrixSortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />
                                                            ) : (
                                                                <ArrowUpDown size={11} style={{ opacity: 0.35 }} />
                                                            )}
                                                        </div>
                                                    </th>
                                                    <th 
                                                        onClick={() => handleMatrixSort('base_cost')}
                                                        style={{ 
                                                            ...THEME.typography.tableHeader, 
                                                            padding: '0.65rem 1.25rem', 
                                                            width: '10%', 
                                                            textAlign: 'right', 
                                                            position: 'sticky', 
                                                            top: embedded ? '208px' : '151px', 
                                                            backgroundColor: '#F8FAFC', 
                                                            zIndex: 30, 
                                                            borderBottom: `1.5px solid ${THEME.colors.border}`, 
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                                            cursor: 'pointer',
                                                            userSelect: 'none'
                                                        }}
                                                    >
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', width: '100%', color: matrixSortField === 'base_cost' ? THEME.colors.primary : THEME.colors.textSecondary }}>
                                                            <span>Costo Base</span>
                                                            {matrixSortField === 'base_cost' ? (
                                                                matrixSortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />
                                                            ) : (
                                                                <ArrowUpDown size={11} style={{ opacity: 0.35 }} />
                                                            )}
                                                        </div>
                                                    </th>
                                                    <th 
                                                        onClick={() => handleMatrixSort('iva_rate')}
                                                        style={{ 
                                                            ...THEME.typography.tableHeader, 
                                                            padding: '0.65rem 1.25rem', 
                                                            width: '8%', 
                                                            textAlign: 'right', 
                                                            position: 'sticky', 
                                                            top: embedded ? '208px' : '151px', 
                                                            backgroundColor: '#F8FAFC', 
                                                            zIndex: 30, 
                                                            borderBottom: `1.5px solid ${THEME.colors.border}`, 
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                                            cursor: 'pointer',
                                                            userSelect: 'none'
                                                        }}
                                                    >
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', width: '100%', color: matrixSortField === 'iva_rate' ? THEME.colors.primary : THEME.colors.textSecondary }}>
                                                            <span>IVA</span>
                                                            {matrixSortField === 'iva_rate' ? (
                                                                matrixSortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />
                                                            ) : (
                                                                <ArrowUpDown size={11} style={{ opacity: 0.35 }} />
                                                            )}
                                                        </div>
                                                    </th>
                                                    <th 
                                                        onClick={() => handleMatrixSort('margin')}
                                                        style={{ 
                                                            ...THEME.typography.tableHeader, 
                                                            padding: '0.65rem 1.25rem', 
                                                            width: '12%', 
                                                            textAlign: 'right', 
                                                            position: 'sticky', 
                                                            top: embedded ? '208px' : '151px', 
                                                            backgroundColor: '#F8FAFC', 
                                                            zIndex: 30, 
                                                            borderBottom: `1.5px solid ${THEME.colors.border}`, 
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                                            cursor: 'pointer',
                                                            userSelect: 'none'
                                                        }}
                                                    >
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', width: '100%', color: matrixSortField === 'margin' ? THEME.colors.primary : THEME.colors.textSecondary }}>
                                                            <span>Utilidad</span>
                                                            {matrixSortField === 'margin' ? (
                                                                matrixSortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />
                                                            ) : (
                                                                <ArrowUpDown size={11} style={{ opacity: 0.35 }} />
                                                            )}
                                                        </div>
                                                    </th>
                                                    <th 
                                                        onClick={() => handleMatrixSort('suggested_price')}
                                                        style={{ 
                                                            ...THEME.typography.tableHeader, 
                                                            padding: '0.65rem 1.25rem', 
                                                            width: '10%', 
                                                            textAlign: 'right', 
                                                            position: 'sticky', 
                                                            top: embedded ? '208px' : '151px', 
                                                            backgroundColor: '#F8FAFC', 
                                                            zIndex: 30, 
                                                            borderBottom: `1.5px solid ${THEME.colors.border}`, 
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                                            cursor: 'pointer',
                                                            userSelect: 'none'
                                                        }}
                                                    >
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', width: '100%', color: matrixSortField === 'suggested_price' ? THEME.colors.primary : THEME.colors.textSecondary }}>
                                                            <span>Sug. sin IVA</span>
                                                            {matrixSortField === 'suggested_price' ? (
                                                                matrixSortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />
                                                            ) : (
                                                                <ArrowUpDown size={11} style={{ opacity: 0.35 }} />
                                                            )}
                                                        </div>
                                                    </th>
                                                    <th 
                                                        onClick={() => handleMatrixSort('final_price')}
                                                        style={{ 
                                                            ...THEME.typography.tableHeader, 
                                                            padding: '0.65rem 1.25rem', 
                                                            width: '10%', 
                                                            textAlign: 'right', 
                                                            position: 'sticky', 
                                                            top: embedded ? '208px' : '151px', 
                                                            backgroundColor: '#F8FAFC', 
                                                            zIndex: 30, 
                                                            borderBottom: `1.5px solid ${THEME.colors.border}`, 
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                                            cursor: 'pointer',
                                                            userSelect: 'none'
                                                        }}
                                                    >
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', width: '100%', color: matrixSortField === 'final_price' ? THEME.colors.primary : THEME.colors.textSecondary }}>
                                                            <span>Precio Final</span>
                                                            {matrixSortField === 'final_price' ? (
                                                                matrixSortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />
                                                            ) : (
                                                                <ArrowUpDown size={11} style={{ opacity: 0.35 }} />
                                                            )}
                                                        </div>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedProducts.map(p => {
                                                    // Pricing calculations
                                                    const priceBeforeTax = p.base_cost * (1 + p.margin / 100);
                                                    const priceWithTax = priceBeforeTax * (1 + p.iva_rate / 100);
                                                    const finalPriceRounded = Math.ceil(priceWithTax / 50) * 50;

                                                    // Margin edit visual handling
                                                    const isEditing = editingMargins[p.product_id] !== undefined;
                                                    const displayMarginValue = isEditing 
                                                        ? editingMargins[p.product_id] 
                                                        : formatNumber(p.margin, 1);

                                                    const isInherited = p.is_inherited;
                                                    const isModified = p.rule_id !== null && !isInherited;

                                                    return (
                                                        <tr key={p.product_id} style={{ 
                                                            borderBottom: `1px solid ${THEME.colors.border}`,
                                                            backgroundColor: 'transparent',
                                                            transition: 'background-color 0.2s'
                                                        }}>
                                                            {/* ERP ID */}
                                                            <td style={{ padding: '0.65rem 1.25rem', fontSize: '0.85rem', fontFamily: 'monospace', color: '#475569', fontWeight: 'bold' }}>
                                                                {p.accounting_id || p.sku || '-'}
                                                            </td>
                                                            
                                                            {/* Product Name */}
                                                            <td style={{ padding: '0.65rem 1.25rem' }}>
                                                                <div style={{ fontWeight: '700', fontSize: '0.9rem', color: THEME.colors.textMain }}>
                                                                    {p.name}
                                                                </div>
                                                            </td>
                                                            
                                                            {/* Category and unit */}
                                                            <td style={{ padding: '0.65rem 1.25rem' }}>
                                                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                                    <span style={{ 
                                                                        fontSize: '0.7rem', 
                                                                        fontWeight: '700', 
                                                                        backgroundColor: '#F1F5F9', 
                                                                        color: '#475569', 
                                                                        padding: '0.15rem 0.4rem', 
                                                                        borderRadius: '4px' 
                                                                    }}>
                                                                        {CATEGORY_MAP[p.category] || p.category || 'General'}
                                                                    </span>
                                                                    {p.unit_of_measure && (
                                                                        <span style={{ 
                                                                            fontSize: '0.7rem', 
                                                                            fontWeight: '700', 
                                                                            backgroundColor: '#E2E8F0', 
                                                                            color: '#64748B', 
                                                                            padding: '0.15rem 0.4rem', 
                                                                            borderRadius: '4px' 
                                                                        }}>
                                                                            {p.unit_of_measure}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            
                                                            {/* Base Cost */}
                                                            <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: THEME.colors.textMain }}>
                                                                {formatMoney(p.base_cost)}
                                                            </td>
                                                            
                                                            {/* IVA */}
                                                            <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right', fontSize: '0.85rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                                                {p.iva_rate}%
                                                            </td>
                                                            
                                                            {/* Utilidad / Margen Input Inline */}
                                                            <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                                                                    {savingMargins[p.product_id] === 'saving' && (
                                                                        <RefreshCw size={12} className="animate-spin" style={{ color: THEME.colors.primary }} />
                                                                    )}
                                                                    {savingMargins[p.product_id] === 'success' && (
                                                                        <Check size={14} style={{ color: '#10B981' }} />
                                                                    )}
                                                                    {savingMargins[p.product_id] === 'error' && (
                                                                        <AlertCircle size={14} style={{ color: '#EF4444' }} />
                                                                    )}

                                                                    <div 
                                                                        title={isInherited ? `Margen dinámico heredado (+${formatNumber(p.margin_adjustment, 1)}% sobre base General Institucional)` : (isModified ? `Margen personalizado exclusivo para este modelo (${formatNumber(p.margin, 1)}%)` : undefined)}
                                                                        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
                                                                    >
                                                                        <input 
                                                                            type="text"
                                                                            value={displayMarginValue}
                                                                            onChange={e => {
                                                                                const val = e.target.value;
                                                                                setEditingMargins(prev => ({ ...prev, [p.product_id]: val }));
                                                                            }}
                                                                            onBlur={e => saveMarginEdit(p.product_id, e.target.value)}
                                                                            onKeyDown={e => {
                                                                                if (e.key === 'Enter') {
                                                                                    saveMarginEdit(p.product_id, (e.target as HTMLInputElement).value);
                                                                                }
                                                                            }}
                                                                            style={{ 
                                                                                width: '65px', 
                                                                                padding: '0.35rem 0.5rem', 
                                                                                border: `1px solid ${isModified ? '#A7F3D0' : THEME.colors.border}`, 
                                                                                borderRadius: '6px', 
                                                                                textAlign: 'right',
                                                                                fontSize: '0.85rem',
                                                                                fontWeight: 'bold',
                                                                                color: isModified ? '#065F46' : THEME.colors.textMain,
                                                                                outline: 'none',
                                                                                backgroundColor: isModified ? '#ECFDF5' : 'white'
                                                                            }}
                                                                        />
                                                                        <span style={{ fontSize: '0.85rem', color: isModified ? '#065F46' : THEME.colors.textSecondary, marginLeft: '2px', fontWeight: 'bold' }}>%</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            
                                                            {/* Sugerido sin IVA */}
                                                            <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right', fontSize: '0.85rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                                                {formatMoney(priceBeforeTax)}
                                                            </td>
                                                            
                                                            {/* Precio Final (con IVA, redondeado a 50) */}
                                                            <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right', fontSize: '0.9rem', fontWeight: '800', color: THEME.colors.primary }}>
                                                                {formatMoney(finalPriceRounded)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Paginador local en el footer */}
                                {totalItems > 0 && (
                                    <div style={{ 
                                        padding: '1rem 1.5rem', 
                                        borderTop: `1px solid ${THEME.colors.border}`, 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center', 
                                        backgroundColor: '#F8FAFC', 
                                        borderRadius: '0 0 12px 12px',
                                        flexWrap: 'wrap',
                                        gap: '1rem'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.85rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                                Mostrando <strong style={{ color: THEME.colors.textMain }}>{startIndex + 1}</strong> a <strong style={{ color: THEME.colors.textMain }}>{Math.min(endIndex, totalItems)}</strong> de <strong style={{ color: THEME.colors.textMain }}>{totalItems}</strong> productos
                                            </span>
                                            
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <span style={{ fontSize: '0.85rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>Mostrar:</span>
                                                <select 
                                                    value={matrixPageSize === 10000 ? 'all' : matrixPageSize} 
                                                    onChange={e => {
                                                        const val = e.target.value === 'all' ? 10000 : parseInt(e.target.value);
                                                        setMatrixPageSize(val);
                                                        setMatrixPage(1);
                                                    }}
                                                    style={{
                                                        padding: '0.3rem 0.5rem',
                                                        borderRadius: '6px',
                                                        border: `1px solid ${THEME.colors.border}`,
                                                        fontSize: '0.85rem',
                                                        backgroundColor: 'white',
                                                        fontWeight: 'bold',
                                                        color: THEME.colors.textMain
                                                    }}
                                                >
                                                    <option value={20}>20 filas</option>
                                                    <option value={50}>50 filas</option>
                                                    <option value={100}>100 filas</option>
                                                    <option value="all">Ver todo</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                            <button 
                                                onClick={() => setMatrixPage(prev => Math.max(prev - 1, 1))}
                                                disabled={matrixPage === 1}
                                                style={{ 
                                                    padding: '0.4rem', 
                                                    borderRadius: '6px', 
                                                    border: `1px solid ${THEME.colors.border}`, 
                                                    backgroundColor: 'white', 
                                                    cursor: matrixPage === 1 ? 'not-allowed' : 'pointer',
                                                    opacity: matrixPage === 1 ? 0.5 : 1,
                                                    display: 'flex',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                <ChevronLeft size={16} />
                                            </button>
                                            <span style={{ fontSize: '0.85rem', color: THEME.colors.textMain, fontWeight: 'bold' }}>
                                                Página {matrixPage} de {totalPages || 1}
                                            </span>
                                            <button 
                                                onClick={() => setMatrixPage(prev => Math.min(prev + 1, totalPages))}
                                                disabled={matrixPage === totalPages || totalPages === 0}
                                                style={{ 
                                                    padding: '0.4rem', 
                                                    borderRadius: '6px', 
                                                    border: `1px solid ${THEME.colors.border}`, 
                                                    backgroundColor: 'white', 
                                                    cursor: (matrixPage === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer',
                                                    opacity: (matrixPage === totalPages || totalPages === 0) ? 0.5 : 1,
                                                    display: 'flex',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                <ChevronRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                    ) : (
                        <div style={{ padding: '4rem 2rem', textAlign: 'center', color: THEME.colors.textSecondary, border: `2px dashed ${THEME.colors.border}`, borderRadius: THEME.radius.lg, backgroundColor: 'white' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}><ArrowLeftCircle size={44} color="#94A3B8" /></div>
                            <h3 style={{ margin: 0, color: THEME.colors.textMain, fontWeight: '800' }}>Selecciona un modelo</h3>
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>Elige un modelo de precios del selector superior para ver y gestionar su matriz.</p>
                        </div>
                    )}
                </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>

                    {/* --- MASTER TEMPLATE SELECTOR & ACTION BAR (Full-Width Swiss Precision) --- */}
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: THEME.radius.lg,
                        boxShadow: THEME.shadow.sm,
                        border: `1px solid ${THEME.colors.border}`,
                        padding: '0.85rem 1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem'
                    }}>
                        {/* ROW 1: MASTER SELECTOR + NEW BUTTON + ACTIONS */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flex: 1, minWidth: '320px' }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748B', whiteSpace: 'nowrap' }}>
                                    Lista de Cotización:
                                </span>

                                <div ref={templatePickerRef} style={{ position: 'relative', minWidth: '340px', maxWidth: '520px', flex: 1 }}>
                                    <input
                                        type="text"
                                        value={isTemplatePickerOpen ? templateSearchQuery : (selectedTemplate ? `${selectedTemplate.name} (${templateCounts[selectedTemplate.id] || 0} prod.)` : '')}
                                        placeholder="Buscar cliente matriz o lista de cotización..."
                                        onFocus={() => {
                                            setIsTemplatePickerOpen(true);
                                            setTemplateSearchQuery('');
                                        }}
                                        onChange={e => {
                                            setTemplateSearchQuery(e.target.value);
                                            if (!isTemplatePickerOpen) setIsTemplatePickerOpen(true);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '0.5rem 0.85rem',
                                            borderRadius: '8px',
                                            border: isTemplatePickerOpen ? `1.5px solid ${THEME.colors.primary}` : `1.5px solid ${THEME.colors.border}`,
                                            backgroundColor: isTemplatePickerOpen ? '#FFFFFF' : '#F8FAFC',
                                            fontWeight: '700',
                                            fontSize: '0.88rem',
                                            color: THEME.colors.textMain,
                                            cursor: 'text',
                                            outline: 'none',
                                            boxShadow: isTemplatePickerOpen ? '0 0 0 2px rgba(13, 122, 87, 0.15)' : 'none',
                                            transition: 'all 0.15s ease'
                                        }}
                                    />
                                    {isTemplatePickerOpen && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 4px)',
                                            left: 0,
                                            right: 0,
                                            backgroundColor: 'white',
                                            border: `1px solid ${THEME.colors.border}`,
                                            borderRadius: '8px',
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                            zIndex: 100,
                                            maxHeight: '280px',
                                            overflowY: 'auto'
                                        }}>
                                            {templates
                                                .filter(t => {
                                                    if (!templateSearchQuery.trim()) return true;
                                                    const q = templateSearchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                                    const name = (t.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                                    const desc = (t.description || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                                    return name.includes(q) || desc.includes(q);
                                                })
                                                .map(t => {
                                                    const isSelected = selectedTemplate?.id === t.id;
                                                    return (
                                                        <div
                                                            key={t.id}
                                                            onClick={() => {
                                                                setSelectedTemplate(t);
                                                                setIsTemplatePickerOpen(false);
                                                                setTemplateSearchQuery('');
                                                                setIsEditingTemplate(false);
                                                            }}
                                                            style={{
                                                                padding: '0.65rem 0.9rem',
                                                                cursor: 'pointer',
                                                                borderBottom: '1px solid #F1F5F9',
                                                                backgroundColor: isSelected ? '#F0FDF4' : 'white',
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                gap: '0.5rem',
                                                                transition: 'background-color 0.1s'
                                                            }}
                                                            onMouseEnter={e => {
                                                                if (!isSelected) e.currentTarget.style.backgroundColor = '#F8FAFC';
                                                            }}
                                                            onMouseLeave={e => {
                                                                if (!isSelected) e.currentTarget.style.backgroundColor = 'white';
                                                            }}
                                                        >
                                                            <span style={{
                                                                fontWeight: isSelected ? '800' : '600',
                                                                color: isSelected ? THEME.colors.primary : THEME.colors.textMain,
                                                                fontSize: '0.86rem'
                                                            }}>
                                                                {t.name}
                                                            </span>
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                fontWeight: '700',
                                                                color: isSelected ? '#065F46' : '#64748B',
                                                                backgroundColor: isSelected ? '#DCFCE7' : '#F1F5F9',
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                {templateCounts[t.id] || 0} prod.
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            {templates.filter(t => {
                                                if (!templateSearchQuery.trim()) return true;
                                                const q = templateSearchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                                const name = (t.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                                return name.includes(q);
                                            }).length === 0 && (
                                                <div style={{ padding: '1rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.82rem' }}>
                                                    No se encontraron listas coincidentes
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => { setIsCreatingTemplate(true); setNewTemplateName(''); setNewTemplateDesc(''); }}
                                    style={{
                                        padding: '0.45rem 0.85rem',
                                        borderRadius: '6px',
                                        border: 'none',
                                        backgroundColor: THEME.colors.primary,
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontWeight: '700',
                                        fontSize: '0.8rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        boxShadow: '0 1px 3px rgba(13, 122, 87, 0.2)'
                                    }}
                                >
                                    Nueva Lista
                                </button>

                                {selectedTemplate && (
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        backgroundColor: '#EFF6FF',
                                        border: '1px solid #BFDBFE',
                                        padding: '0.3rem 0.65rem',
                                        borderRadius: '6px'
                                    }}>
                                        <span style={{ fontSize: '0.62rem', fontWeight: '800', textTransform: 'uppercase', color: '#1D4ED8' }}>Catálogo:</span>
                                        <span style={{ fontSize: '0.88rem', fontWeight: '900', color: '#1E40AF' }}>
                                            {templateCounts[selectedTemplate.id] || 0} Productos
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Right: Actions */}
                            {selectedTemplate && (
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={exportTemplateExcel}
                                        style={{
                                            backgroundColor: '#F0FDF4',
                                            color: '#0D7A57',
                                            border: '1px solid #BBF7D0',
                                            padding: '0.45rem 0.85rem',
                                            borderRadius: '6px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            fontSize: '0.78rem'
                                        }}
                                        title="Exportar lista a Excel"
                                    >
                                        Exportar Excel
                                    </button>

                                    <button
                                        onClick={() => setShowTemplateExcelModal(true)}
                                        style={{
                                            backgroundColor: '#F0FDF4',
                                            color: '#0D7A57',
                                            border: '1px solid #BBF7D0',
                                            padding: '0.45rem 0.85rem',
                                            borderRadius: '6px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            fontSize: '0.78rem'
                                        }}
                                        title="Importar lista desde Excel"
                                    >
                                        Importar Excel
                                    </button>

                                    <button
                                        onClick={() => {
                                            setEditTemplateName(selectedTemplate.name);
                                            setEditTemplateDesc(selectedTemplate.description || '');
                                            setIsEditingTemplate(true);
                                        }}
                                        style={{
                                            color: '#475569',
                                            backgroundColor: '#F8FAFC',
                                            border: '1px solid #E2E8F0',
                                            padding: '0.45rem 0.85rem',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontWeight: '700',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            fontSize: '0.78rem'
                                        }}
                                    >
                                        Editar
                                    </button>

                                    <button
                                        onClick={() => deleteTemplate(selectedTemplate.id, selectedTemplate.name)}
                                        style={{
                                            color: '#DC2626',
                                            backgroundColor: '#FEF2F2',
                                            border: '1px solid #FEE2E2',
                                            padding: '0.45rem 0.85rem',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontWeight: '700',
                                            fontSize: '0.78rem'
                                        }}
                                        title="Eliminar Lista"
                                    >
                                        Eliminar
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* ROW 2: SUB-CINTA ESBELTA (Descripción) */}
                        {selectedTemplate && selectedTemplate.description && !isEditingTemplate && (
                            <div style={{
                                paddingTop: '0.5rem',
                                borderTop: `1px solid ${THEME.colors.border || '#F1F5F9'}`
                            }}>
                                <span style={{ color: THEME.colors.textSecondary, fontSize: '0.8rem', lineHeight: 1.3 }}>
                                    {selectedTemplate.description}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* INLINE BANNER: CREATE NEW TEMPLATE */}
                    {isCreatingTemplate && (
                        <div style={{
                            backgroundColor: '#F8FAFC',
                            padding: '1.25rem',
                            borderRadius: THEME.radius.lg,
                            border: `1.5px solid ${THEME.colors.primary}`,
                            boxShadow: THEME.shadow.sm
                        }}>
                            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: '800', color: THEME.colors.primary, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                Crear Nueva Lista de Cotización
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.25rem' }}>Nombre de la Lista *</label>
                                    <input 
                                        placeholder="Ej: Lista Larga o Canasta Escolar" 
                                        value={newTemplateName} 
                                        onChange={e => setNewTemplateName(e.target.value)} 
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, fontSize: '0.85rem' }} 
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.25rem' }}>Descripción / Segmento</label>
                                    <input 
                                        placeholder="Ej: Catálogo sugerido para clientes institucionales" 
                                        value={newTemplateDesc} 
                                        onChange={e => setNewTemplateDesc(e.target.value)} 
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, fontSize: '0.85rem' }} 
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button onClick={() => setIsCreatingTemplate(false)} style={{ padding: '0.45rem 1rem', borderRadius: '6px', backgroundColor: '#E2E8F0', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.82rem', color: '#475569' }}>Cancelar</button>
                                <button onClick={createTemplate} style={{ padding: '0.45rem 1.25rem', borderRadius: '6px', backgroundColor: THEME.colors.primary, color: 'white', border: 'none', cursor: 'pointer', fontWeight: '800', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>Guardar</button>
                            </div>
                        </div>
                    )}

                    {/* INLINE BANNER: EDIT TEMPLATE */}
                    {isEditingTemplate && selectedTemplate && (
                        <div style={{
                            backgroundColor: '#F8FAFC',
                            padding: '1.25rem',
                            borderRadius: THEME.radius.lg,
                            border: `1.5px solid ${THEME.colors.primary}`,
                            boxShadow: THEME.shadow.sm
                        }}>
                            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                Editar Lista: {selectedTemplate.name}
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.25rem' }}>Nombre de la Lista</label>
                                    <input
                                        value={editTemplateName}
                                        onChange={e => setEditTemplateName(e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold', border: `1px solid ${THEME.colors.border}`, borderRadius: '6px' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.25rem' }}>Descripción</label>
                                    <input
                                        value={editTemplateDesc}
                                        onChange={e => setEditTemplateDesc(e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem', border: `1px solid ${THEME.colors.border}`, borderRadius: '6px', fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button onClick={() => setIsEditingTemplate(false)} style={{ padding: '0.45rem 1rem', borderRadius: '6px', backgroundColor: '#E2E8F0', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.82rem', color: '#475569' }}>Cancelar</button>
                                <button onClick={saveTemplateChanges} style={{ padding: '0.45rem 1.25rem', backgroundColor: THEME.colors.primary, color: 'white', border: 'none', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}><Save size={13} /> Guardar Cambios</button>
                            </div>
                        </div>
                    )}

                    {/* TEMPLATE ITEMS TABLE CARD */}
                    {selectedTemplate ? (() => {
                        const defaultMargin = 34.2;
                        const computedRows = templateItems.map(item => {
                            const cost = templateCosts[item.product_id] || 0;
                            const margin = templateMargins[item.product_id] !== undefined ? templateMargins[item.product_id] : defaultMargin;
                            const projectedPrice = cost > 0 ? Math.ceil((cost * (1 + margin / 100)) / 50) * 50 : 0;
                            const demandInfo = templateDemand[item.product_id] || { volume: 0, ordersCount: 0 };
                            const monthlyVolume = demandInfo.volume;
                            const projectedProfit = monthlyVolume > 0 && cost > 0 ? monthlyVolume * (projectedPrice - cost) : 0;
                            const projectedRevenue = monthlyVolume > 0 && projectedPrice > 0 ? monthlyVolume * projectedPrice : 0;
                            return {
                                ...item,
                                cost,
                                margin,
                                projectedPrice,
                                monthlyVolume,
                                ordersCount: demandInfo.ordersCount,
                                projectedProfit,
                                projectedRevenue
                            };
                        });

                        const totalVolumeKg = computedRows.reduce((acc, r) => acc + (r.monthlyVolume || 0), 0);
                        const totalProfitCOP = computedRows.reduce((acc, r) => acc + (r.projectedProfit || 0), 0);
                        const totalRevenueCOP = computedRows.reduce((acc, r) => acc + (r.projectedRevenue || 0), 0);
                        const weightedMargin = totalRevenueCOP > 0 ? (totalProfitCOP / totalRevenueCOP) * 100 : (computedRows.length > 0 ? computedRows.reduce((acc, r) => acc + r.margin, 0) / computedRows.length : defaultMargin);

                        const filteredRows = computedRows.filter(item => {
                            const term = templateSearchFilter.toLowerCase().trim();
                            if (!term) return true;
                            return (item.name || '').toLowerCase().includes(term) || 
                                   String(item.accounting_id || '').includes(term);
                        });

                        const stickyBase = embedded ? 139 : 0;
                        const stickyToolbarTop = `${stickyBase}px`;
                        const stickyTheadTop = `${stickyBase + 54}px`;

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                                {/* CINTA KPI DE RENTABILIDAD Y DEMANDA ON-SCREEN */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    backgroundColor: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '12px',
                                    padding: '0.85rem 1.25rem',
                                    flexWrap: 'wrap',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                                        <div>
                                            <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Canasta de Cliente:</span>
                                            <div style={{ fontSize: '0.92rem', fontWeight: '800', color: THEME.colors.textMain }}>
                                                {selectedTemplate?.name}
                                            </div>
                                            {templateClientProfile ? (
                                                <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: '700' }}>
                                                    ● Cuenta Matriz vinculada (Consumo consolidado matriz + sucursales)
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '600' }}>
                                                    Canasta institucional general
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ height: '32px', width: '1px', backgroundColor: '#E2E8F0' }} />
                                        <div>
                                            <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>SKUs Activos:</span>
                                            <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#1E293B' }}>{templateItems.length} prod.</div>
                                        </div>
                                        <div style={{ height: '32px', width: '1px', backgroundColor: '#E2E8F0' }} />
                                        <div>
                                            <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Consumo 30 Días:</span>
                                            <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0369A1' }}>
                                                {totalVolumeKg >= 1000 ? `${(totalVolumeKg / 1000).toFixed(2)} Ton` : `${Math.round(totalVolumeKg)} Kg/Und`}
                                            </div>
                                        </div>
                                        <div style={{ height: '32px', width: '1px', backgroundColor: '#E2E8F0' }} />
                                        <div>
                                            <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Margen Ponderado:</span>
                                            <div style={{ fontSize: '0.92rem', fontWeight: '800', color: weightedMargin >= 30 ? '#0D7A57' : '#D97706' }}>
                                                {weightedMargin.toFixed(1)}%
                                            </div>
                                        </div>
                                        <div style={{ height: '32px', width: '1px', backgroundColor: '#E2E8F0' }} />
                                        <div>
                                            <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Utilidad Proyectada:</span>
                                            <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0D7A57', fontFamily: 'monospace' }}>
                                                {formatMoney(totalProfitCOP)}
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleSaveTemplateMargins}
                                        disabled={savingTemplateMargins}
                                        style={{
                                            padding: '0.55rem 1.1rem',
                                            backgroundColor: '#0D7A57',
                                            color: 'white',
                                            borderRadius: '8px',
                                            border: 'none',
                                            fontSize: '0.8rem',
                                            fontWeight: '700',
                                            cursor: savingTemplateMargins ? 'not-allowed' : 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)'
                                        }}
                                    >
                                        {savingTemplateMargins ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                        {savingTemplateMargins ? 'Guardando...' : 'Guardar Márgenes'}
                                    </button>
                                </div>

                                {/* TABLE WRAPPER CONTAINER (Anti-secuestro de scroll: overflow visible) */}
                                <div style={{
                                    backgroundColor: 'white',
                                    borderRadius: THEME.radius.lg,
                                    boxShadow: THEME.shadow.md,
                                    border: `1px solid ${THEME.colors.border}`,
                                    overflow: 'visible',
                                    position: 'relative'
                                }}>
                                    {/* FILA STICKY 1: TOOLBAR DE PRODUCTOS DE LA CANASTA */}
                                    <div style={{
                                        position: 'sticky',
                                        top: stickyToolbarTop,
                                        zIndex: 40,
                                        backgroundColor: '#FFFFFF',
                                        padding: '0.65rem 1.25rem',
                                        borderBottom: `1px solid ${THEME.colors.border}`,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '1rem',
                                        flexWrap: 'wrap',
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                                        borderTopLeftRadius: THEME.radius.lg,
                                        borderTopRightRadius: THEME.radius.lg
                                    }}>
                                        {/* Izquierda: Buscador Omnibox dentro de la Canasta */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '300px' }}>
                                            <div style={{ position: 'relative', width: '320px' }}>
                                                <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                                                <input
                                                    type="text"
                                                    placeholder="Filtrar productos en esta canasta..."
                                                    value={templateSearchFilter}
                                                    onChange={e => setTemplateSearchFilter(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.45rem 2rem 0.45rem 2.2rem',
                                                        borderRadius: '8px',
                                                        border: `1px solid ${THEME.colors.border}`,
                                                        fontSize: '0.85rem',
                                                        outline: 'none'
                                                    }}
                                                />
                                                {templateSearchFilter && (
                                                    <button 
                                                        onClick={() => setTemplateSearchFilter('')}
                                                        style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', padding: 0 }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: THEME.colors.textSecondary, whiteSpace: 'nowrap' }}>
                                                {filteredRows.length} productos filtrados
                                            </span>
                                        </div>

                                        {/* Derecha: Acción de Agregar Producto del Catálogo Maestro */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.primary, whiteSpace: 'nowrap' }}>
                                                + Catálogo Maestro:
                                            </span>
                                            <div style={{ position: 'relative', width: '280px' }}>
                                                <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.primary }} />
                                                <input
                                                    type="text"
                                                    placeholder="Buscar y agregar producto..."
                                                    value={templateProductSearch}
                                                    onChange={e => {
                                                        setTemplateProductSearch(e.target.value);
                                                        searchTemplateProducts(e.target.value);
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.42rem 1.8rem 0.42rem 2.1rem',
                                                        borderRadius: '8px',
                                                        border: `1.5px solid ${THEME.colors.primary}`,
                                                        fontSize: '0.82rem',
                                                        outline: 'none',
                                                        backgroundColor: '#F0FDF4'
                                                    }}
                                                />
                                                {templateProductSearch && (
                                                    <button 
                                                        onClick={() => {
                                                            setTemplateProductSearch('');
                                                            setTemplateProductsFound([]);
                                                        }}
                                                        style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', padding: 0 }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                                {templateProductsFound.length > 0 && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '100%',
                                                        left: 0,
                                                        right: 0,
                                                        backgroundColor: 'white',
                                                        border: `1px solid ${THEME.colors.border}`,
                                                        borderRadius: '8px',
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                                        zIndex: 60,
                                                        maxHeight: '250px',
                                                        overflowY: 'auto',
                                                        marginTop: '4px'
                                                    }}>
                                                        {templateProductsFound.map(p => (
                                                            <div
                                                                key={p.id}
                                                                onClick={() => addProductToTemplate(p.id)}
                                                                style={{
                                                                    padding: '0.65rem 0.85rem',
                                                                    cursor: 'pointer',
                                                                    borderBottom: `1px solid ${THEME.colors.border}`,
                                                                    fontSize: '0.82rem',
                                                                    transition: 'background 0.15s',
                                                                    textAlign: 'left'
                                                                }}
                                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#EFF6FF'}
                                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                                                            >
                                                                <span style={{ fontWeight: 'bold', color: '#1E293B', marginRight: '6px' }}>[{p.accounting_id || 'SIN ID'}]</span>
                                                                <span style={{ color: '#475569' }}>{p.name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Table Content */}
                                    {loadingTemplateItems ? (
                                        <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary }}>Cargando canasta y telemetría de cliente...</div>
                                    ) : templateItems.length === 0 ? (
                                        <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary }}>Esta canasta no tiene productos asociados. Usa el buscador de arriba para agregar.</div>
                                    ) : (
                                        <div style={{ width: '100%', overflow: 'visible' }}>
                                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                                                {/* FILA STICKY 2: THEAD CON REGLA CHROMIUM */}
                                                <thead>
                                                    <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '8%', position: 'sticky', top: stickyTheadTop, zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>ID ERP</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '22%', position: 'sticky', top: stickyTheadTop, zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>Producto</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '12%', position: 'sticky', top: stickyTheadTop, zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>Categoría</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '11%', textAlign: 'right', position: 'sticky', top: stickyTheadTop, zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>Costo Base</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '12%', textAlign: 'center', position: 'sticky', top: stickyTheadTop, zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>Utilidad %</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '11%', textAlign: 'right', position: 'sticky', top: stickyTheadTop, zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>Precio Final</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '12%', textAlign: 'right', position: 'sticky', top: stickyTheadTop, zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>Consumo 30d</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '12%', textAlign: 'right', position: 'sticky', top: stickyTheadTop, zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>Utilidad Total</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '6%', textAlign: 'center', position: 'sticky', top: stickyTheadTop, zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredRows.map(item => {
                                                        const cleanUnit = item.unit_of_measure === 'Atado' ? 'Kg' : (item.unit_of_measure || 'Kg');
                                                        return (
                                                            <tr key={item.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background-color 0.15s' }}>
                                                                <td style={{ padding: '0.65rem 1.25rem', fontWeight: '800', fontFamily: 'monospace', color: '#475569', fontSize: '0.85rem' }}>
                                                                    {item.accounting_id || '—'}
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem', fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.9rem' }}>
                                                                    <div>{item.name}</div>
                                                                    <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '600' }}>
                                                                        {cleanUnit}
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem' }}>
                                                                    <span style={{
                                                                        backgroundColor: '#F1F5F9',
                                                                        color: '#475569',
                                                                        padding: '0.15rem 0.45rem',
                                                                        borderRadius: '4px',
                                                                        fontSize: '0.72rem',
                                                                        fontWeight: '700'
                                                                    }}>
                                                                        {CATEGORY_MAP[item.category] || item.category || 'General'}
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right', fontWeight: '700', color: '#475569', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                                                                    {item.cost > 0 ? `${formatNumber(item.cost)}` : <span style={{ color: '#EF4444' }}>Sin Costo</span>}
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem', textAlign: 'center' }}>
                                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                        <input
                                                                            type="number"
                                                                            step="0.5"
                                                                            value={item.margin}
                                                                            onChange={(e) => handleUpdateItemMargin(item.product_id, parseFloat(e.target.value) || 0)}
                                                                            style={{
                                                                                width: '65px',
                                                                                padding: '4px 6px',
                                                                                borderRadius: '6px',
                                                                                border: '1.5px solid #CBD5E1',
                                                                                fontWeight: '800',
                                                                                textAlign: 'right',
                                                                                fontSize: '0.82rem',
                                                                                color: '#0D7A57',
                                                                                backgroundColor: '#F8FAFC'
                                                                            }}
                                                                        />
                                                                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748B' }}>%</span>
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right', fontWeight: '800', color: THEME.colors.primary, fontSize: '0.9rem', fontFamily: 'monospace' }}>
                                                                    {item.projectedPrice > 0 ? `${formatNumber(item.projectedPrice)}` : '—'}
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right' }}>
                                                                    <div>
                                                                        <span style={{ fontWeight: '800', fontSize: '0.85rem', color: item.monthlyVolume > 0 ? '#0284C7' : '#94A3B8' }}>
                                                                            {item.monthlyVolume > 0 ? `${formatNumber(item.monthlyVolume, 1)} ${cleanUnit}` : '0'}
                                                                        </span>
                                                                        {item.ordersCount > 0 && (
                                                                            <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block' }}>
                                                                                {item.ordersCount} pedidos
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right', fontWeight: '800', color: item.projectedProfit > 0 ? '#0D7A57' : '#94A3B8', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                                                    {item.projectedProfit > 0 ? formatMoney(item.projectedProfit) : '—'}
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem', textAlign: 'center' }}>
                                                                    <button
                                                                        onClick={() => removeProductFromTemplate(item.product_id)}
                                                                        style={{
                                                                            background: 'none',
                                                                            border: 'none',
                                                                            color: '#DC2626',
                                                                            cursor: 'pointer',
                                                                            padding: '0.25rem',
                                                                            borderRadius: '4px'
                                                                        }}
                                                                        title="Remover de la lista"
                                                                    >
                                                                        <Trash2 size={15} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })() : (
                        <div style={{ padding: '4rem 2rem', textAlign: 'center', color: THEME.colors.textSecondary, border: `2px dashed ${THEME.colors.border}`, borderRadius: THEME.radius.lg, backgroundColor: 'white' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}><ArrowLeftCircle size={44} color="#94A3B8" /></div>
                            <h3 style={{ margin: 0, color: THEME.colors.textMain, fontWeight: '800' }}>Selecciona una lista</h3>
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>Elige una lista de cotización del selector superior para gestionar sus productos.</p>
                        </div>
                    )}
                </div>
                )}

                {/* --- MODAL CARGA EXCEL PARA PLANTILLAS --- */}
                {showTemplateExcelModal && selectedTemplate && (
                    <div style={{ 
                        position: 'fixed', 
                        top: 0, 
                        left: 0, 
                        right: 0, 
                        bottom: 0, 
                        backgroundColor: 'rgba(15, 23, 42, 0.4)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        zIndex: 100,
                        backdropFilter: 'blur(4px)'
                    }}>
                        <div style={{ 
                            backgroundColor: 'white', 
                            borderRadius: '16px', 
                            padding: '2rem', 
                            width: '450px', 
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            border: '1px solid #E2E8F0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.25rem'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: THEME.colors.textMain }}>
                                    Cargar Productos (.xlsx)
                                </h3>
                                <button 
                                    onClick={() => setShowTemplateExcelModal(false)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.colors.textSecondary }}
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            
                            <p style={{ fontSize: '0.85rem', color: THEME.colors.textSecondary, margin: 0, lineHeight: '1.4' }}>
                                Sube un archivo Excel para actualizar la lista. Debe contener una columna llamada <strong>"SKU"</strong> o <strong>"ID ERP"</strong>.
                            </p>

                            <label style={{
                                border: '2px dashed #BFDBFE',
                                backgroundColor: '#F8FAFC',
                                borderRadius: '12px',
                                padding: '2rem',
                                textAlign: 'center',
                                cursor: uploadingTemplateExcel ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '0.5rem',
                                transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = '#3B82F6'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = '#BFDBFE'}
                            >
                                {uploadingTemplateExcel ? (
                                    <>
                                        <RefreshCw size={24} className="animate-spin" style={{ color: '#2563EB' }} />
                                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#2563EB' }}>Cargando productos...</span>
                                    </>
                                ) : (
                                    <>
                                        <FileUp size={24} style={{ color: '#2563EB' }} />
                                        <span style={{ fontSize: '0.85rem', fontWeight: '800', color: THEME.colors.textMain }}>Seleccionar archivo Excel</span>
                                        <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary }}>Formatos .xlsx, .xls</span>
                                    </>
                                )}
                                <input 
                                    type="file"
                                    accept=".xlsx, .xls"
                                    onChange={handleTemplateExcelUpload}
                                    disabled={uploadingTemplateExcel}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        </div>
                    </div>
                )}

                {/* --- MODAL PREMIUM CARGA/DESCARGA EXCEL --- */}
                {showExcelModal && selectedModel && (
                    <div style={{ 
                        position: 'fixed', 
                        top: 0, 
                        left: 0, 
                        right: 0, 
                        bottom: 0, 
                        backgroundColor: 'rgba(15, 23, 42, 0.4)', 
                        backdropFilter: 'blur(6px)',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        zIndex: 100 
                    }}>
                        <div style={{ 
                            backgroundColor: 'white', 
                            padding: '2rem', 
                            borderRadius: '16px', 
                            width: '480px', 
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                            border: `1px solid ${THEME.colors.border}`,
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.5rem'
                        }}>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: '900', margin: 0, color: THEME.colors.textMain }}>
                                    Cargar / Descargar Planilla de Márgenes
                                </h3>
                                <button 
                                    onClick={() => {
                                        setShowExcelModal(false);
                                        setExcelError(null);
                                        setExcelSuccess(null);
                                    }} 
                                    style={{ 
                                        border: 'none', 
                                        background: 'none', 
                                        cursor: 'pointer', 
                                        color: THEME.colors.textSecondary,
                                        padding: '0.25rem',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: '#F1F5F9'
                                    }}
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Section 1: Descargar */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: '800', color: THEME.colors.textMain }}>
                                    1. Descargar planilla actual del modelo
                                </div>
                                <p style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, margin: 0, lineHeight: '1.4' }}>
                                    Obtén el listado completo de productos activos. Modifica la columna <strong>Margen (%)</strong> en Excel para aplicarlo masivamente.
                                </p>
                                <button
                                    onClick={exportToExcel}
                                    style={{
                                        padding: '0.6rem 1rem',
                                        backgroundColor: '#EAFDF4',
                                        color: '#0D7A57',
                                        border: '1px solid #BBF7D0',
                                        borderRadius: '8px',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem',
                                        fontSize: '0.85rem',
                                        marginTop: '0.25rem',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <FileDown size={16} /> Descargar Planilla Excel (.xlsx)
                                </button>
                            </div>

                            <div style={{ borderTop: `1px solid ${THEME.colors.border}` }} />

                            {/* Section 2: Cargar */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: '800', color: THEME.colors.textMain }}>
                                    2. Subir planilla editada
                                </div>
                                <p style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, margin: 0, lineHeight: '1.4' }}>
                                    Sube el archivo Excel modificado. El sistema mapeará automáticamente los productos usando el <strong>ID ERP</strong> (prioritario) o el <strong>SKU</strong>.
                                </p>
                                
                                {/* Drag & Drop Area / File Selector */}
                                <label style={{
                                    border: `2px dashed ${uploadingExcel ? THEME.colors.border : '#BBF7D0'}`,
                                    backgroundColor: uploadingExcel ? '#F8FAFC' : '#F6FEFA',
                                    borderRadius: '12px',
                                    padding: '1.5rem',
                                    textAlign: 'center',
                                    cursor: uploadingExcel ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    marginTop: '0.25rem',
                                    transition: 'all 0.2s'
                                }}>
                                    {uploadingExcel ? (
                                        <>
                                            <RefreshCw size={24} className="animate-spin" style={{ color: THEME.colors.primary }} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: THEME.colors.primary }}>Procesando archivo...</span>
                                        </>
                                    ) : (
                                        <>
                                            <FileUp size={24} style={{ color: '#0D7A57' }} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.textMain }}>
                                                Haga clic aquí para seleccionar o arrastre el archivo
                                            </span>
                                            <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary }}>
                                                Solo formatos .xlsx o .xls
                                            </span>
                                        </>
                                    )}
                                    <input 
                                        type="file"
                                        accept=".xlsx, .xls"
                                        onChange={importFromExcel}
                                        disabled={uploadingExcel}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                            </div>

                            {/* Success & Error Banners */}
                            {excelSuccess && (
                                <div style={{ 
                                    padding: '0.75rem 1rem', 
                                    backgroundColor: '#ECFDF5', 
                                    color: '#047857', 
                                    borderRadius: '8px', 
                                    fontSize: '0.8rem', 
                                    fontWeight: '600',
                                    border: '1px solid #A7F3D0',
                                    lineHeight: '1.4'
                                }}>
                                    {excelSuccess}
                                </div>
                            )}

                            {excelError && (
                                <div style={{ 
                                    padding: '0.75rem 1rem', 
                                    backgroundColor: '#FEF2F2', 
                                    color: '#B91C1C', 
                                    borderRadius: '8px', 
                                    fontSize: '0.8rem', 
                                    fontWeight: '600',
                                    border: '1px solid #FCA5A5',
                                    lineHeight: '1.4'
                                }}>
                                    {excelError}
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </main>
    );
}
