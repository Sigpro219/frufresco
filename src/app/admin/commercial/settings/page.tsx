'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
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
    RefreshCw,
    X,
    TrendingUp,
    Globe,
    Building,
    Activity,
    Search,
    Check,
    FileUp,
    FileDown
} from 'lucide-react';
import { CATEGORY_MAP } from '@/lib/constants';
import * as XLSX from 'xlsx';

export default function PricingSettingsPage() {
    // Data
    const [models, setModels] = useState<any[]>([]);
    const [selectedModel, setSelectedModel] = useState<any>(null);
    const [rules, setRules] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]); // For search

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

    // Editing State
    const [isEditingModel, setIsEditingModel] = useState(false);
    const [editModelData, setEditModelData] = useState({ name: '', description: '', margin: 0 });

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
    const [uploadingExcel, setUploadingExcel] = useState(false);
    const [excelError, setExcelError] = useState<string | null>(null);
    const [excelSuccess, setExcelSuccess] = useState<string | null>(null);

    const fetchModels = async () => {
        setLoadingModels(true);
        const { data, error } = await supabase
            .from('pricing_models')
            .select('*');

        if (data) {
            // Lógica de ordenamiento personalizado
            const sortedData = [...data].sort((a, b) => {
                // 1. Prioridad para Clientes B2C
                if (a.name === 'Clientes B2C') return -1;
                if (b.name === 'Clientes B2C') return 1;

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
                    .select('id, name, sku, accounting_id, iva_rate, category, parent_id, utility_deviation_pct, unit_of_measure, base_price, show_on_web')
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

            // 2. Fetch exception rules for this model
            const { data: rulesData, error: rulesErr } = await supabase
                .from('pricing_rules')
                .select('*')
                .eq('model_id', modelId);
            if (rulesErr) throw rulesErr;
            
            const rulesMap = new Map();
            rulesData?.forEach(r => {
                rulesMap.set(r.product_id, r);
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
            const { data: purchasesData } = await supabase
                .from('purchases')
                .select('product_id, unit_price, purchase_unit, created_at')
                .order('created_at', { ascending: false });
            
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
                if (baseCost === 0) {
                    baseCost = prod.base_price || 0;
                }

                // Margin adjustment rule if exists
                const rule = rulesMap.get(prod.id);
                const adjustment = rule ? rule.margin_adjustment : 0;
                const absoluteMargin = modelData.base_margin_percent + adjustment;

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

    // --- MODEL ACTIONS ---
    const createModel = async () => {
        if (!newModelName) return alert('Nombre requerido');
        
        // 1. Verificar duplicados localmente
        if (models.some(m => m.name.toLowerCase() === newModelName.toLowerCase())) {
            return alert('Ya existe un modelo con ese nombre.');
        }

        setLoadingModels(true);
        
        try {
            // 2. Insertar el nuevo modelo
            const { data: newModel, error } = await supabase
                .from('pricing_models')
                .insert({
                    name: newModelName,
                    base_margin_percent: newModelMargin,
                    description: newModelDesc
                })
                .select()
                .single();

            if (error) throw error;

            // 3. Si se seleccionó un modelo para clonar, copiar sus reglas
            if (cloneFromModelId && newModel) {
                console.log('🔄 Clonando reglas desde:', cloneFromModelId);
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

            setModels([...models, newModel]);
            setSelectedModel(newModel);
            setIsCreating(false);
            setNewModelName('');
            setNewModelDesc('');
            setNewModelMargin(20);
            setCloneFromModelId('');
            
        } catch (err: any) {
            alert('Error creando modelo: ' + err.message);
        } finally {
            setLoadingModels(false);
        }
    };

    const saveModelChanges = async () => {
        if (!selectedModel) return;
        const { error } = await supabase
            .from('pricing_models')
            .update({
                name: editModelData.name,
                description: editModelData.description,
                base_margin_percent: editModelData.margin
            })
            .eq('id', selectedModel.id);

        if (error) {
            alert('Error actualizando: ' + error.message);
        } else {
            // Update local state
            const updated = { ...selectedModel, name: editModelData.name, description: editModelData.description, base_margin_percent: editModelData.margin };
            setSelectedModel(updated);
            // Update list
            setModels(models.map(m => m.id === updated.id ? updated : m));
            setIsEditingModel(false);
        }
    };

    const deleteModel = async (id: string, name: string) => {
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
        const targetAdjustment = parsedVal - selectedModel.base_margin_percent;

        try {
            if (Math.abs(targetAdjustment) < 0.001) {
                // Delete pricing rule if it matches base margin
                const { error } = await supabase
                    .from('pricing_rules')
                    .delete()
                    .eq('model_id', selectedModel.id)
                    .eq('product_id', productId);
                
                if (error) throw error;
                
                setMatrixData(prev => prev.map(item => {
                    if (item.product_id === productId) {
                        return { ...item, margin: parsedVal, margin_adjustment: 0, rule_id: null };
                    }
                    return item;
                }));
            } else {
                // Upsert pricing rule
                const { data, error } = await supabase
                    .from('pricing_rules')
                    .upsert({
                        model_id: selectedModel.id,
                        product_id: productId,
                        margin_adjustment: targetAdjustment
                    }, { onConflict: 'model_id,product_id' })
                    .select()
                    .single();
                
                if (error) throw error;

                setMatrixData(prev => prev.map(item => {
                    if (item.product_id === productId) {
                        return { ...item, margin: parsedVal, margin_adjustment: targetAdjustment, rule_id: data.id };
                    }
                    return item;
                }));
            }

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

    const exportToExcel = () => {
        if (!selectedModel || matrixData.length === 0) return;
        
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

        const { error } = await supabase.from('pricing_rules').upsert({
            model_id: selectedModel.id,
            product_id: ruleSelectedProduct.id,
            margin_adjustment: ruleAdjustment
        }, { onConflict: 'model_id,product_id' });

        if (error) {
            console.error('Error saving rule:', error);
            return alert('Error al guardar: ' + error.message);
        }

        await fetchMatrixData(selectedModel.id);
        setShowRuleModal(false);
        setRuleSelectedProduct(null);
        setRuleProductSearch('');
        setRuleAdjustment(0);
    };

    const deleteRule = async (id: string) => {
        await supabase.from('pricing_rules').delete().eq('id', id);
        fetchMatrixData(selectedModel.id);
    };

    // --- MASTER SYNC LOGIC ---
    const syncPricesToCatalog = async () => {
        if (!selectedModel) return;
        if (selectedModel.name !== 'Clientes B2C') {
            return alert('Esta sincronización maestra está optimizada para el modelo \"Clientes B2C\" que alimenta la landing page.');
        }

        if (!confirm('¿Estás seguro? Esta acción actualizará los precios públicos de TODO el catálogo basándose en los últimos costos de la matriz y el margen de este modelo.')) return;

        setIsSyncing(true);
        try {
            console.log('🚀 Iniciando sincronización maestra de precios...');

            // 1. Obtener todos los productos activos
            const { data: allProducts, error: pError } = await supabase
                .from('products')
                .select('id, name, iva_rate, category, parent_id, utility_deviation_pct');
            
            if (pError) throw pError;

            // 2. Obtener últimas compras y Overrides (Costo Inteligente Autorizado)
            const [purchasesRes, overridesRes] = await Promise.all([
                supabase
                    .from('purchases')
                    .select('product_id, unit_price, created_at')
                    .order('created_at', { ascending: false }),
                supabase
                    .from('commercial_overrides')
                    .select('product_id, manual_cost, expires_at')
            ]);

            if (purchasesRes.error) throw purchasesRes.error;

            const historyMap: Record<string, { price: number, date: Date }[]> = {};
            purchasesRes.data?.forEach(p => {
                if (!historyMap[p.product_id]) historyMap[p.product_id] = [];
                if (historyMap[p.product_id].length < 1) { // Solo necesitamos el último para fallback
                    historyMap[p.product_id].push({ price: p.unit_price, date: new Date(p.created_at) });
                }
            });

            const overridesMap: Record<string, number> = {};
            overridesRes.data?.forEach(o => {
                overridesMap[o.product_id] = o.manual_cost;
            });

            // 3. Obtener reglas de excepción del modelo B2C
            const { data: b2cRules } = await supabase
                .from('pricing_rules')
                .select('*')
                .eq('model_id', selectedModel.id);

            const rulesMap: Record<string, number> = {};
            b2cRules?.forEach(r => {
                rulesMap[r.product_id] = r.margin_adjustment;
            });

            // 4. Calcular y Preparar Updates
            const updates = allProducts.map(prod => {
                // PRIORIDAD: 
                // 1. Costo Manual Autorizado (Override) -> Ya viene suavizado por la Matriz Delta
                // 2. Última Compra (Fallback)
                const overrideCost = overridesMap[prod.id];
                const history = historyMap[prod.id] || (prod.parent_id ? historyMap[prod.parent_id] : []);
                
                let baseCost = overrideCost || (history[0]?.price || 0);
                if (baseCost === 0) return null;

                const lastDate = history[0]?.date || new Date();
                const now = new Date();
                const daysOld = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

                // --- FASE 1: FACTOR DE FRESCURA (TIME-DECAY) ---
                // Si el dato es viejo (>7 días), protegemos el margen añadiendo 5% diario
                if (daysOld > 7) {
                    const extraDays = daysOld - 7;
                    baseCost = baseCost * Math.pow(1.05, extraDays);
                }

                const baseMargin = selectedModel.base_margin_percent;
                const adjustment = rulesMap[prod.id] || 0;
                const utilityDeviation = prod.utility_deviation_pct || 0;
                
                const finalMargin = (baseMargin + adjustment + utilityDeviation) / 100;
                
                // Lógica de Precio: (Costo * (1 + Margen)) * (1 + IVA)
                const priceBeforeTax = baseCost * (1 + finalMargin);
                const ivaRate = (prod.iva_rate || 0) / 100;
                const priceWithTax = priceBeforeTax * (1 + ivaRate);

                // --- FASE 2: REDONDEO COMERCIAL (Múltiplo de 50) ---
                const finalPrice = Math.ceil(priceWithTax / 50) * 50;

                return {
                    id: prod.id,
                    base_price: finalPrice
                };
            }).filter(Boolean);

            if (updates.length === 0) {
                alert('No se encontraron productos con costos válidos para actualizar.');
                return;
            }

            console.log(`📊 Procesando ${updates.length} actualizaciones de precio...`);

            // 5. Ejecutar actualizaciones (usamos update individual en paralelo para evitar errores de restricción NOT NULL en upsert)
            for (let i = 0; i < updates.length; i += 15) {
                const batch = updates.slice(i, i + 15);
                await Promise.all(batch.map(async (up) => {
                    const { error: upError } = await supabase
                        .from('products')
                        .update({ base_price: up.base_price })
                        .eq('id', up.id);
                    
                    if (upError) throw upError;
                }));
            }

            alert(`✅ ¡Éxito! Se han actualizado ${updates.length} precios en el catálogo público conforme al modelo B2C.`);
            
        } catch (err: any) {
            console.error('❌ Error en Sync:', err);
            alert('Error durante la sincronización: ' + err.message);
        } finally {
            setIsSyncing(false);
        }
    };    // Filter and paginate the matrix data locally
    const filteredProducts = matrixData.filter(prod => {
        const term = matrixSearch.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (!term) return true;
        const prodName = (prod.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const prodSku = (prod.sku || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const prodId = String(prod.accounting_id || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const categoryName = (CATEGORY_MAP[prod.category] || prod.category || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return prodName.includes(term) || prodSku.includes(term) || prodId.includes(term) || categoryName.includes(term);
    });

    const avgMargin = matrixData.length > 0
        ? matrixData.reduce((acc, curr) => acc + curr.margin, 0) / matrixData.length
        : selectedModel?.base_margin_percent || 0;

    const totalItems = filteredProducts.length;
    const totalPages = Math.ceil(totalItems / matrixPageSize);
    const startIndex = (matrixPage - 1) * matrixPageSize;
    const endIndex = startIndex + matrixPageSize;
    const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

    const getAutosyncDaysSummary = (days: number[] | null) => {
        const dayList = days || [0, 1, 2, 3, 4, 5, 6];
        if (dayList.length === 7) return 'Todos los días';
        if (dayList.length === 0) return 'Sin días programados';
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
        return dayList.map(d => dayNames[d]).join(', ');
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography.fontFamilyMain }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
                <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center' }}>
                    <Link href="/admin/commercial" style={{ textDecoration: 'none', color: THEME.colors.textSecondary, fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                        <ArrowLeft size={16} /> Volver a Comercial
                    </Link>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) 2.5fr', gap: '2rem', alignItems: 'start' }}>

                    {/* --- LEFT: MODELS LIST --- */}
                    <div style={{ 
                        backgroundColor: 'white', 
                        borderRadius: THEME.radius.lg, 
                        boxShadow: THEME.shadow.md, 
                        border: `1px solid ${THEME.colors.border}`,
                        position: 'sticky',
                        top: '105px',
                        alignSelf: 'start'
                    }}>
                        <div style={{ padding: '1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, color: THEME.colors.textMain }}>Modelos de Precios</h2>
                            <button 
                                onClick={() => setIsCreating(true)} 
                                style={{ 
                                    padding: '0.4rem 0.6rem', 
                                    borderRadius: '6px', 
                                    border: 'none', 
                                    backgroundColor: THEME.colors.primary, 
                                    color: 'white', 
                                    cursor: 'pointer', 
                                    fontWeight: 'bold',
                                    fontSize: '1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 2px 4px rgba(13, 122, 87, 0.15)'
                                }}
                            >
                                <Plus size={16} />
                            </button>
                        </div>

                        {/* CREATE FORM */}
                        {isCreating && (
                            <div style={{ padding: '1.25rem', backgroundColor: '#F9FAFB', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                <input placeholder="Nombre (ej: B2B Premium)" value={newModelName} onChange={e => setNewModelName(e.target.value)} style={{ width: '100%', padding: '0.55rem', marginBottom: '0.6rem', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, fontSize: '0.85rem' }} />
                                <input placeholder="Uso (ej: Clientes B2B con 30 días de plazo)" value={newModelDesc} onChange={e => setNewModelDesc(e.target.value)} style={{ width: '100%', padding: '0.55rem', marginBottom: '0.6rem', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, fontSize: '0.85rem' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: THEME.colors.textMain }}>Margen Base %:</label>
                                    <input type="number" value={newModelMargin || ''} onChange={e => {
                                        const val = parseFloat(e.target.value);
                                        setNewModelMargin(isNaN(val) ? 0 : val);
                                    }} style={{ width: '80px', padding: '0.4rem', borderRadius: '4px', border: `1px solid ${THEME.colors.border}`, fontWeight: 'bold' }} />
                                </div>

                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', marginBottom: '0.3rem', color: THEME.colors.textSecondary }}>🆕 CLONAR REGLAS DESDE (Opcional):</label>
                                    <select 
                                        value={cloneFromModelId} 
                                        onChange={e => setCloneFromModelId(e.target.value)} 
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', fontSize: '0.85rem' }}
                                    >
                                        <option value="">-- No clonar, empezar vacío --</option>
                                        {models.map(m => (
                                            <option key={m.id} value={m.id}>{m.name} ({m.base_margin_percent}%)</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button onClick={createModel} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', backgroundColor: THEME.colors.primary, color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>Guardar</button>
                                    <button onClick={() => setIsCreating(false)} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', backgroundColor: '#D1D5DB', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', color: '#374151' }}>Cancelar</button>
                                </div>
                            </div>
                        )}

                        <div style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
                            {loadingModels ? <div style={{ padding: '1.5rem', textAlign: 'center', color: THEME.colors.textSecondary }}>Cargando modelos...</div> : models.map(m => (
                                <div
                                    key={m.id}
                                    onClick={() => setSelectedModel(m)}
                                    style={{
                                        padding: '1.25rem',
                                        borderBottom: `1px solid ${THEME.colors.border}`,
                                        cursor: 'pointer',
                                        backgroundColor: selectedModel?.id === m.id ? '#F0FDF4' : 'white',
                                        borderLeft: selectedModel?.id === m.id ? `4px solid ${THEME.colors.primary}` : '4px solid transparent',
                                        transition: 'background 0.2s'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1, paddingRight: '1rem' }}>
                                            <div style={{ fontWeight: '800', fontSize: '1.05rem', color: THEME.colors.textMain, marginBottom: '0.2rem' }}>
                                                {(() => {
                                                    const parts = m.name.split(/(\d+\s*días)/i);
                                                    return parts.map((part, i) => (
                                                        <span key={i} style={{ 
                                                            color: /(\d+\s*días)/i.test(part) ? '#0D7A57' : 'inherit',
                                                            fontSize: /(\d+\s*días)/i.test(part) ? '0.95em' : 'inherit'
                                                        }}>
                                                            {part}
                                                        </span>
                                                    ));
                                                })()}
                                            </div>
                                            {m.description && (
                                                <div style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, lineHeight: '1.4' }}>
                                                    {m.description}
                                                </div>
                                            )}
                                        </div>

                                        <div style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                                            backgroundColor: selectedModel?.id === m.id ? '#D1FAE5' : '#F3F4F6',
                                            padding: '0.4rem 0.7rem', borderRadius: '8px', minWidth: '65px'
                                        }}>
                                            <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: '800', color: selectedModel?.id === m.id ? '#065F46' : '#475569' }}>BASE</span>
                                            <span style={{ fontWeight: '900', fontSize: '1.25rem', color: selectedModel?.id === m.id ? '#0D7A57' : '#1E293B' }}>
                                                {m.base_margin_percent}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* --- RIGHT: PRICING MATRIX VIEW --- */}
                    {selectedModel ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            
                            {/* REDESIGNED MODEL DETAILS HEADER */}
                            {isEditingModel ? (
                                <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: THEME.radius.lg, boxShadow: THEME.shadow.md, border: `1px solid ${THEME.colors.border}` }}>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: THEME.colors.textMain }}>Nombre del Modelo</label>
                                        <input
                                            value={editModelData.name}
                                            onChange={e => setEditModelData({ ...editModelData, name: e.target.value })}
                                            style={{ width: '100%', padding: '0.55rem', fontSize: '1.1rem', fontWeight: 'bold', border: `1px solid ${THEME.colors.border}`, borderRadius: '6px', marginTop: '0.2rem' }}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: THEME.colors.textMain }}>Uso / Descripción</label>
                                        <input
                                            value={editModelData.description}
                                            onChange={e => setEditModelData({ ...editModelData, description: e.target.value })}
                                            style={{ width: '100%', padding: '0.55rem', border: `1px solid ${THEME.colors.border}`, borderRadius: '6px', marginTop: '0.2rem' }}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: THEME.colors.textMain }}>Margen Base (%)</label>
                                        <input
                                            type="number"
                                            value={editModelData.margin || ''}
                                            onChange={e => {
                                                const val = parseFloat(e.target.value);
                                                setEditModelData({ ...editModelData, margin: isNaN(val) ? 0 : val });
                                            }}
                                            style={{ width: '100px', padding: '0.55rem', fontSize: '1.1rem', fontWeight: 'bold', color: THEME.colors.primary, border: `1px solid ${THEME.colors.border}`, borderRadius: '6px', marginTop: '0.2rem' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button 
                                            onClick={saveModelChanges} 
                                            style={{ 
                                                padding: '0.55rem 1.25rem', 
                                                backgroundColor: THEME.colors.primary, 
                                                color: 'white', 
                                                border: 'none', 
                                                borderRadius: '8px', 
                                                fontWeight: '800', 
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.4rem',
                                                boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            <Save size={16} /> Guardar Cambios
                                        </button>
                                        <button 
                                            onClick={() => setIsEditingModel(false)} 
                                            style={{ 
                                                padding: '0.55rem 1.25rem', 
                                                backgroundColor: 'white', 
                                                color: THEME.colors.textSecondary, 
                                                border: `1px solid ${THEME.colors.border}`, 
                                                borderRadius: '8px', 
                                                cursor: 'pointer',
                                                fontWeight: '600',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ 
                                    backgroundColor: 'white', 
                                    padding: '1.5rem', 
                                    borderRadius: THEME.radius.lg, 
                                    boxShadow: THEME.shadow.md, 
                                    border: `1px solid ${THEME.colors.border}`,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1.25rem'
                                }}>
                                    {/* Header Info & Actions Row */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.5rem', flexWrap: 'wrap' }}>
                                        {/* Left Column: Title, Description & Badges */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: '1 1 450px' }}>
                                            <div>
                                                <h1 style={{ fontSize: '1.75rem', fontWeight: '900', margin: 0, color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                                    {(() => {
                                                        const parts = selectedModel.name.split(/(\d+\s*días)/i);
                                                        return parts.map((part, i) => (
                                                            <span key={i} style={{ color: /(\d+\s*días)/i.test(part) ? THEME.colors.primary : 'inherit' }}>
                                                                {part}
                                                            </span>
                                                        ));
                                                    })()}
                                                </h1>
                                                <p style={{ color: THEME.colors.textSecondary, margin: '0.3rem 0 0 0', fontWeight: '500', fontSize: '0.9rem' }}>
                                                    {selectedModel.description}
                                                </p>
                                            </div>
                                            
                                            {/* Badges Block */}
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: '700', backgroundColor: '#EAFDF4', color: '#0D7A57', padding: '0.3rem 0.6rem', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                                    📈 Margen Base: {selectedModel.base_margin_percent}%
                                                </span>
                                                <span style={{ fontSize: '0.75rem', fontWeight: '700', backgroundColor: '#E0F2FE', color: '#0369A1', padding: '0.3rem 0.6rem', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                                    📊 Promedio: {formatNumber(avgMargin, 1)}%
                                                </span>
                                                <span style={{ 
                                                    fontSize: '0.75rem', 
                                                    fontWeight: '700', 
                                                    backgroundColor: selectedModel.name === 'Clientes B2C' ? '#EFF6FF' : '#F1F5F9', 
                                                    color: selectedModel.name === 'Clientes B2C' ? '#1D4ED8' : '#475569', 
                                                    padding: '0.3rem 0.6rem', 
                                                    borderRadius: '20px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.2rem'
                                                }}>
                                                    {selectedModel.name === 'Clientes B2C' ? (
                                                        <><Globe size={12} /> Canal: Web / B2C</>
                                                    ) : (
                                                        <><Building size={12} /> Canal: B2B / Distribución</>
                                                    )}
                                                </span>
                                                <span style={{ 
                                                    fontSize: '0.75rem', 
                                                    fontWeight: '700', 
                                                    backgroundColor: selectedModel.b2c_autosync_enabled ? '#ECFDF5' : '#F3F4F6', 
                                                    color: selectedModel.b2c_autosync_enabled ? '#047857' : '#64748B', 
                                                    padding: '0.3rem 0.6rem', 
                                                    borderRadius: '20px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.2rem'
                                                }}>
                                                    <Activity size={12} />
                                                    {selectedModel.b2c_autosync_enabled ? '🔄 Auto-recálculo Activo' : '⏸️ Recálculo Manual'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Right Column: Actions (Buttons) */}
                                        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                            {selectedModel.name === 'Clientes B2C' && (
                                                <button
                                                    onClick={syncPricesToCatalog}
                                                    disabled={isSyncing}
                                                    style={{ 
                                                        backgroundColor: THEME.colors.primary, 
                                                        color: 'white', 
                                                        border: 'none', 
                                                        padding: '0.55rem 1.1rem', 
                                                        borderRadius: '8px', 
                                                        fontWeight: '800', 
                                                        cursor: isSyncing ? 'not-allowed' : 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.4rem',
                                                        boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)',
                                                        opacity: isSyncing ? 0.7 : 1,
                                                        fontSize: '0.8rem'
                                                    }}
                                                >
                                                    {isSyncing ? <RefreshCw size={14} className="animate-spin" style={{ color: 'white' }} /> : <Rocket size={14} />} 
                                                    {isSyncing ? 'Fijando...' : 'Fijar Precios'}
                                                </button>
                                            )}

                                            <button
                                                onClick={() => setShowExcelModal(true)}
                                                style={{ 
                                                    backgroundColor: '#EAFDF4', 
                                                    color: '#0D7A57', 
                                                    border: '1px solid #BBF7D0', 
                                                    padding: '0.55rem 1.1rem', 
                                                    borderRadius: '8px', 
                                                    fontWeight: '800', 
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.4rem',
                                                    fontSize: '0.8rem'
                                                }}
                                            >
                                                <FileDown size={14} /> Cargar / Descargar
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setEditModelData({
                                                        name: selectedModel.name,
                                                        description: selectedModel.description,
                                                        margin: selectedModel.base_margin_percent
                                                    });
                                                    setIsEditingModel(true);
                                                }}
                                                style={{ 
                                                    color: '#2563EB', 
                                                    backgroundColor: '#F0F7FF', 
                                                    border: '1px solid #DBEAFE', 
                                                    padding: '0.55rem 1.1rem', 
                                                    borderRadius: '8px', 
                                                    cursor: 'pointer', 
                                                    fontWeight: '700', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '0.4rem',
                                                    fontSize: '0.8rem'
                                                }}
                                            >
                                                <Edit3 size={14} /> Editar
                                            </button>

                                            <button 
                                                onClick={() => deleteModel(selectedModel.id, selectedModel.name)} 
                                                style={{ 
                                                    color: '#9CA3AF', 
                                                    background: 'none', 
                                                    border: `1px solid ${THEME.colors.border}`, 
                                                    padding: '0.55rem', 
                                                    borderRadius: '8px', 
                                                    cursor: 'pointer', 
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    backgroundColor: 'white',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseOver={(e) => {
                                                    e.currentTarget.style.color = '#EF4444';
                                                    e.currentTarget.style.borderColor = '#FEE2E2';
                                                    e.currentTarget.style.backgroundColor = '#FEF2F2';
                                                }}
                                                onMouseOut={(e) => {
                                                    e.currentTarget.style.color = '#9CA3AF';
                                                    e.currentTarget.style.borderColor = THEME.colors.border;
                                                    e.currentTarget.style.backgroundColor = 'white';
                                                }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Autosync scheduler row */}
                                    <div style={{ 
                                        borderTop: `1px solid ${THEME.colors.border}`, 
                                        paddingTop: '1rem', 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        gap: '1.5rem'
                                    }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                            <div style={{ fontSize: '0.85rem', color: THEME.colors.textMain, fontWeight: '800' }}>
                                                Programación de Recálculo Automático
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>
                                                Días activos para recálculo automático a la medianoche: <strong style={{ color: THEME.colors.primary }}>{getAutosyncDaysSummary(selectedModel.autosync_days)}</strong>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                                            {/* Days circles */}
                                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((dayName, idx) => {
                                                    const isSelected = (selectedModel.autosync_days || [0, 1, 2, 3, 4, 5, 6]).includes(idx);
                                                    return (
                                                        <button
                                                            key={idx}
                                                            onClick={() => toggleAutosyncDay(idx)}
                                                            style={{
                                                                width: '26px',
                                                                height: '26px',
                                                                borderRadius: '50%',
                                                                border: 'none',
                                                                backgroundColor: isSelected ? THEME.colors.primary : '#E5E7EB',
                                                                color: isSelected ? 'white' : '#475569',
                                                                fontWeight: 'bold',
                                                                fontSize: '0.7rem',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                transition: 'all 0.15s',
                                                                boxShadow: isSelected ? '0 2px 4px rgba(13, 122, 87, 0.2)' : 'none'
                                                            }}
                                                        >
                                                            {dayName}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Switch toggle */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderLeft: `1px solid ${THEME.colors.border}`, paddingLeft: '1rem' }}>
                                                <button
                                                    onClick={toggleAutosyncEnabled}
                                                    style={{
                                                        width: '38px',
                                                        height: '20px',
                                                        borderRadius: '10px',
                                                        border: 'none',
                                                        backgroundColor: selectedModel.b2c_autosync_enabled ? THEME.colors.primary : '#CBD5E1',
                                                        position: 'relative',
                                                        cursor: 'pointer',
                                                        transition: 'background-color 0.2s',
                                                        padding: 0
                                                    }}
                                                >
                                                    <span style={{
                                                        width: '16px',
                                                        height: '16px',
                                                        borderRadius: '50%',
                                                        backgroundColor: 'white',
                                                        position: 'absolute',
                                                        top: '2px',
                                                        left: selectedModel.b2c_autosync_enabled ? '20px' : '2px',
                                                        transition: 'left 0.2s',
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                                                    }} />
                                                </button>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: selectedModel.b2c_autosync_enabled ? THEME.colors.primary : THEME.colors.textSecondary }}>
                                                    {selectedModel.b2c_autosync_enabled ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* MAIN PRICING MATRIX TABLE CARD */}
                            <div style={{ 
                                backgroundColor: 'white', 
                                borderRadius: THEME.radius.lg, 
                                boxShadow: THEME.shadow.md, 
                                border: `1px solid ${THEME.colors.border}`,
                                overflow: 'visible',
                                position: 'sticky',
                                top: '105px',
                                zIndex: 4
                            }}>
                                
                                {/* Search and count header */}
                                <div style={{ 
                                    padding: '1.5rem', 
                                    borderBottom: `1px solid ${THEME.colors.border}`,
                                    backgroundColor: 'white',
                                    borderRadius: '12px 12px 0 0'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                        <div style={{ flex: 1, minWidth: '280px' }}>
                                            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: THEME.colors.textMain }}>Matriz de Precios y Utilidades</h3>
                                            <p style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, margin: '0.2rem 0 0 0' }}>
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
                                                    onFocus={e => e.target.style.borderColor = THEME.colors.borderActive}
                                                    onBlur={e => e.target.style.borderColor = THEME.colors.border}
                                                />
                                                {matrixSearch && (
                                                    <button 
                                                        onClick={() => { setMatrixSearch(''); setMatrixPage(1); }}
                                                        style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0 }}
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                )}
                                            </div>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '700', backgroundColor: '#F1F5F9', color: '#475569', padding: '0.4rem 0.75rem', borderRadius: '12px', whiteSpace: 'nowrap' }}>
                                                {filteredProducts.length} ítems
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {filteredProducts.length === 0 ? (
                                    <div style={{ padding: '4rem 2rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔍</div>
                                        <p style={{ fontWeight: 'bold', margin: 0 }}>No se encontraron productos</p>
                                        <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Prueba con otros términos de búsqueda.</p>
                                    </div>
                                ) : (
                                    <div style={{ maxHeight: 'calc(100vh - 365px)', overflowY: 'auto', overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                            <thead style={{ 
                                                position: 'sticky', 
                                                top: 0, 
                                                backgroundColor: '#F8FAFC', 
                                                zIndex: 5, 
                                                borderBottom: `1px solid ${THEME.colors.border}` 
                                            }}>
                                                <tr>
                                                    <th style={{ ...THEME.typography.tableHeader, padding: '0.9rem 1.25rem', width: '10%', position: 'sticky', top: 0, backgroundColor: '#F8FAFC', zIndex: 5 }}>ID ERP</th>
                                                    <th style={{ ...THEME.typography.tableHeader, padding: '0.9rem 1.25rem', width: '35%', position: 'sticky', top: 0, backgroundColor: '#F8FAFC', zIndex: 5 }}>Producto</th>
                                                    <th style={{ ...THEME.typography.tableHeader, padding: '0.9rem 1.25rem', width: '15%', position: 'sticky', top: 0, backgroundColor: '#F8FAFC', zIndex: 5 }}>Categoría</th>
                                                    <th style={{ ...THEME.typography.tableHeader, padding: '0.9rem 1.25rem', width: '10%', textAlign: 'right', position: 'sticky', top: 0, backgroundColor: '#F8FAFC', zIndex: 5 }}>Costo Base</th>
                                                    <th style={{ ...THEME.typography.tableHeader, padding: '0.9rem 1.25rem', width: '8%', textAlign: 'right', position: 'sticky', top: 0, backgroundColor: '#F8FAFC', zIndex: 5 }}>IVA</th>
                                                    <th style={{ ...THEME.typography.tableHeader, padding: '0.9rem 1.25rem', width: '12%', textAlign: 'right', position: 'sticky', top: 0, backgroundColor: '#F8FAFC', zIndex: 5 }}>Utilidad</th>
                                                    <th style={{ ...THEME.typography.tableHeader, padding: '0.9rem 1.25rem', width: '10%', textAlign: 'right', position: 'sticky', top: 0, backgroundColor: '#F8FAFC', zIndex: 5 }}>Sug. sin IVA</th>
                                                    <th style={{ ...THEME.typography.tableHeader, padding: '0.9rem 1.25rem', width: '10%', textAlign: 'right', position: 'sticky', top: 0, backgroundColor: '#F8FAFC', zIndex: 5 }}>Precio Final</th>
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

                                                    const isModified = Math.abs(p.margin_adjustment) > 0.001;

                                                    return (
                                                        <tr key={p.product_id} style={{ 
                                                            borderBottom: `1px solid ${THEME.colors.border}`,
                                                            backgroundColor: 'transparent',
                                                            transition: 'background-color 0.2s'
                                                        }}>
                                                            {/* ERP ID */}
                                                            <td style={{ padding: '0.9rem 1.25rem', fontSize: '0.85rem', fontFamily: 'monospace', color: '#475569', fontWeight: 'bold' }}>
                                                                {p.accounting_id || p.sku || '-'}
                                                            </td>
                                                            
                                                            {/* Product Name */}
                                                            <td style={{ padding: '0.9rem 1.25rem' }}>
                                                                <div style={{ fontWeight: '700', fontSize: '0.9rem', color: THEME.colors.textMain }}>
                                                                    {p.name}
                                                                </div>
                                                                {isModified && (
                                                                    <span style={{ fontSize: '0.7rem', color: '#047857', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '2px', marginTop: '2px' }}>
                                                                        <TrendingUp size={10} /> Margen personalizado (ajuste: {p.margin_adjustment > 0 ? `+${formatNumber(p.margin_adjustment, 1)}` : formatNumber(p.margin_adjustment, 1)}%)
                                                                    </span>
                                                                )}
                                                            </td>
                                                            
                                                            {/* Category and unit */}
                                                            <td style={{ padding: '0.9rem 1.25rem' }}>
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
                                                            <td style={{ padding: '0.9rem 1.25rem', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: THEME.colors.textMain }}>
                                                                {formatMoney(p.base_cost)}
                                                            </td>
                                                            
                                                            {/* IVA */}
                                                            <td style={{ padding: '0.9rem 1.25rem', textAlign: 'right', fontSize: '0.85rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                                                {p.iva_rate}%
                                                            </td>
                                                            
                                                            {/* Utilidad / Margen Input Inline */}
                                                            <td style={{ padding: '0.9rem 1.25rem', textAlign: 'right' }}>
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

                                                                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
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
                                                            <td style={{ padding: '0.9rem 1.25rem', textAlign: 'right', fontSize: '0.85rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                                                {formatMoney(priceBeforeTax)}
                                                            </td>
                                                            
                                                            {/* Precio Final (con IVA, redondeado a 50) */}
                                                            <td style={{ padding: '0.9rem 1.25rem', textAlign: 'right', fontSize: '0.9rem', fontWeight: '800', color: THEME.colors.primary }}>
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
                        </div>
                    ) : (
                        <div style={{ padding: '4rem 2rem', textAlign: 'center', color: THEME.colors.textSecondary, border: `2px dashed ${THEME.colors.border}`, borderRadius: THEME.radius.lg, backgroundColor: 'white' }}>
                            <div style={{ fontSize: '3.5rem', marginBottom: '1.25rem' }}>👈</div>
                            <h3 style={{ margin: 0, color: THEME.colors.textMain, fontWeight: '800' }}>Selecciona un modelo</h3>
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>Elige un modelo de precios de la lista de la izquierda para ver y gestionar su matriz.</p>
                        </div>
                    )}
                </div>

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
