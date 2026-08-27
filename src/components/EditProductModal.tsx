'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { supabase, Product } from '@/lib/supabase';
import { diagnoseStorageError, diagnoseDatabaseError } from '@/lib/errorUtils';
import { Wand2, Sparkles, Loader2, ShieldAlert, Tag, Leaf, Flame, Zap, Check, Plus, HelpCircle, Info, Scale, Package, Truck, X, BookOpen, ChefHat, Soup, UtensilsCrossed, Wheat, Drumstick } from 'lucide-react';
import { triggerProductRevalidation } from '@/lib/revalidate';
import { optimizeImageForUpload } from '@/lib/imageOptimizer';

const TYPICAL_RECIPES = [
    { id: 'ajiaco', label: 'Ajiaco', Icon: Soup },
    { id: 'sancocho', label: 'Sancocho', Icon: Flame },
    { id: 'bandeja paisa', label: 'Bandeja Paisa', Icon: UtensilsCrossed },
    { id: 'mondongo', label: 'Mondongo', Icon: Soup },
    { id: 'mute', label: 'Mute', Icon: Wheat },
    { id: 'tamal', label: 'Tamal', Icon: Sparkles },
    { id: 'arroz con pollo', label: 'Arroz con Pollo', Icon: Drumstick },
];

interface EditProductModalProps {
    product: Product;
    allProducts: Product[];
    onClose: () => void;
    onSave: () => void;
    readOnly?: boolean;
}

const extractWeight = (val: string): number | null => {
    if (!val) return null;
    if (val.includes('|')) {
        const grams = parseFloat(val.split('|')[1]);
        if (!isNaN(grams) && grams > 0) return grams;
    }
    const clean = val.toLowerCase();
    const kgMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilos)/);
    if (kgMatch) {
        const num = parseFloat(kgMatch[1]);
        if (!isNaN(num) && num > 0) return num * 1000;
    }
    const gMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:g|gr|grs|gramos|grams|gramo|gram)/);
    if (gMatch) {
        const num = parseFloat(gMatch[1]);
        if (!isNaN(num) && num > 0) return num;
    }
    return null;
};

const sortSuggestedValues = (values: string[]): string[] => {
    return values.slice().sort((a, b) => {
        const weightA = extractWeight(a);
        const weightB = extractWeight(b);
        if (weightA !== null && weightB !== null) {
            if (weightA !== weightB) return weightA - weightB;
        }
        if (weightA !== null && weightB === null) return -1;
        if (weightA === null && weightB !== null) return 1;
        const cleanA = a.includes('|') ? a.split('|')[0] : a;
        const cleanB = b.includes('|') ? b.split('|')[0] : b;
        return cleanA.localeCompare(cleanB, 'es', { numeric: true, sensitivity: 'base' });
    });
};

export default function EditProductModal({ product, allProducts, onClose, onSave, readOnly = false }: EditProductModalProps) {
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showUnitGuideModal, setShowUnitGuideModal] = useState(false);
    const initialWeight = () => {
        const u = (product.unit_of_measure || '').toLowerCase();
        if (product.weight_kg !== undefined && product.weight_kg !== null && !isNaN(Number(product.weight_kg))) {
            return Number(product.weight_kg);
        }
        if (u === 'kg' || u === 'kilo' || u === 'kilos') {
            return 0.1;
        }
        const extracted = extractWeight(product.name);
        if (extracted !== null && extracted > 0) {
            return extracted / 1000;
        }
        return 1.0;
    };

    const [formData, setFormData] = useState<Product>({ 
        ...product,
        unit_of_measure: product.unit_of_measure?.toLowerCase() === 'unidad' ? 'Unidad' : 'Kg',
        weight_kg: initialWeight(),
        iva_rate: product.iva_rate ?? 19,
        utility_deviation_pct: product.utility_deviation_pct ?? 0,
        inherit_price: (product as any).inherit_price ?? false
    });
    const hasChildren = allProducts.some(p => p.parent_id === product.id);
    const [parentSearch, setParentSearch] = useState('');
    const [showParentResults, setShowParentResults] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const parseInitialOptions = (prod: any) => {
        let list: any[] = [];
        if (Array.isArray(prod.options_config) && prod.options_config.length > 0) {
            list = prod.options_config.map((opt: any) => ({
                name: opt.name || '',
                values: Array.isArray(opt.values) ? opt.values : []
            }));
        } else if (prod.options) {
            if (Array.isArray(prod.options) && prod.options.length > 0) {
                list = prod.options.map((opt: any) => ({
                    name: opt.name || '',
                    values: Array.isArray(opt.values) ? opt.values : []
                }));
            } else if (typeof prod.options === 'object' && Object.keys(prod.options).length > 0) {
                list = Object.entries(prod.options).map(([name, values]) => ({
                    name,
                    values: Array.isArray(values) ? values : []
                }));
            }
        }
        return list.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    };

    const [previewUrl, setPreviewUrl] = useState<string | null>(product.image_url);
    const [options, setOptions] = useState<any[]>(() => parseInitialOptions(product));
    const [variants, setVariants] = useState<any[]>(() => {
        const raw = product.variants || [];
        const seen = new Set<string>();
        return raw.map((v: any, idx: number) => {
            let id = v?.id;
            if (!id || seen.has(id)) {
                id = `v-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
            }
            seen.add(id);
            return { ...v, id };
        });
    });
    const [variantUploading, setVariantUploading] = useState<string | null>(null);
    const [conversionFactorInput, setConversionFactorInput] = useState(product.web_conversion_factor?.toString().replace('.', ',') || '1,0');
    const [generatingAI, setGeneratingAI] = useState(false);
    const [tagInput, setTagInput] = useState('');
    const [keywordInput, setKeywordInput] = useState('');

    const categories = [
        { id: 'FR', name: 'Frutas' },
        { id: 'VE', name: 'Verduras' },
        { id: 'TU', name: 'Tubérculos' },
        { id: 'HO', name: 'Hortalizas' },
        { id: 'LA', name: 'Lácteos' },
        { id: 'DE', name: 'Despensa' },
        { id: 'CO', name: 'Congelados' }
    ];

    const buyingTeams = ['HIERBAS Y HORTALIZAS', 'EQUIPO A FRUTAS', 'EQUIPO A VEGETALES', 'LOGISTICA - PAPAS', 'REFRIGERADOS'];
    const procurementMethods = ['Compras Generales', 'Contratación Directa', 'Importación', 'Local'];
    const [baseUnits, setBaseUnits] = useState<string[]>(['Kg', 'Unidad', 'Atado', 'Bolsa', 'Caja', 'Bandeja', 'Malla', 'Gramos', 'Libra']);
    const [masterAttributes, setMasterAttributes] = useState<{ name: string, values: string[], show_on_web?: boolean }[]>([]);

    useEffect(() => {
        const fetchMaster = async () => {
            try {
                const { data, error } = await supabase.from('product_attributes_master').select('*').order('name');
                if (error) {
                    console.warn('EditModal: No master table found, using defaults.');
                    return;
                }
                if (data && data.length > 0) {
                    setMasterAttributes(data.map(attr => ({ 
                        name: attr.name, 
                        values: sortSuggestedValues(attr.suggested_values || []),
                        show_on_web: attr.show_on_web !== false
                    })));
                }

                // Fetch Dynamic Units from Settings
                const { data: settingsData } = await supabase.from('app_settings').select('value').eq('key', 'standard_units').single();
                if (settingsData?.value) {
                    const dynamicList = settingsData.value.split(',').map((u: string) => u.trim());
                    if (dynamicList.length > 0) setBaseUnits(dynamicList);
                }
            } catch (e) {
                console.warn('EditModal: Error fetching master attributes.');
            }
        };
        fetchMaster();
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const uploadImage = async () => {
        if (!imageFile) return formData.image_url;

        setUploading(true);
        try {
            // Compress and resize client-side to lightweight WebP thumbnail
            const optimizedFile = await optimizeImageForUpload(imageFile, {
                maxWidth: 800,
                maxHeight: 800,
                quality: 0.82
            });

            const fileExt = optimizedFile.name.split('.').pop() || 'webp';
            const fileName = `${formData.sku || product.id || 'prod'}-${Date.now()}.${fileExt}`;
            const filePath = `master/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, optimizedFile, {
                    cacheControl: '2592000',
                    contentType: optimizedFile.type,
                    upsert: true
                });

            if (uploadError) {
                diagnoseStorageError(uploadError, 'product-images');
                setUploading(false);
                return formData.image_url;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(filePath);

            setUploading(false);
            return publicUrl;
        } catch (err) {
            console.error('Error optimizing image:', err);
            setUploading(false);
            return formData.image_url;
        }
    };

    const [variantNotice, setVariantNotice] = useState<string | null>(null);

    // LÓGICA DE VARIANTES
    const addOption = () => {
        if (options.length < 3) {
            setOptions([...options, { name: '', values: [] }]);
        }
    };

    const updateOption = (index: number, name: string, valuesStr: string) => {
        const newOptions = [...options];
        newOptions[index] = {
            name,
            values: valuesStr.split(',').map(v => v.trim()).filter(v => v !== '')
        };
        setOptions(newOptions);
    };

    const updateOptionValues = (index: number, newValues: string[]) => {
        const newOptions = [...options];
        newOptions[index] = {
            ...newOptions[index],
            values: newValues
        };
        setOptions(newOptions);
    };

    const clearOptionValues = (index: number) => {
        const newOptions = [...options];
        newOptions[index] = {
            ...newOptions[index],
            values: []
        };
        setOptions(newOptions);
    };

    const removeOption = (index: number) => {
        const newOptions = options.filter((_, i) => i !== index);
        setOptions(newOptions);
        if (newOptions.length === 0) {
            setVariants([]);
            setVariantNotice('Se han eliminado las combinaciones.');
        }
    };


    const getAttributeCode = (rawVal: any): string => {
        if (!rawVal) return 'X';
        const str = rawVal.toString().trim();
        if (str.includes('|')) {
            const [label, code] = str.split('|');
            const cleanCode = code ? code.replace(/[^a-zA-Z0-9]/g, '') : '';
            const initial = label.substring(0, 1).toUpperCase();
            return cleanCode ? `${initial}${cleanCode}` : initial;
        }
        const clean = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        if (clean.length <= 4) return clean;
        return clean.substring(0, 4);
    };

    const generateVariants = (optsToUse = options) => {
        const activeOptions = optsToUse.filter(opt => opt.name && Array.isArray(opt.values) && opt.values.length > 0);

        if (activeOptions.length === 0) {
            setVariants([]);
            setVariantNotice('⚠️ No hay opciones seleccionadas en ningún atributo. Se limpiaron las combinaciones.');
            return;
        }

        let results: any[] = [{}];
        activeOptions.forEach(opt => {
            const temp: any[] = [];
            results.forEach(res => {
                opt.values.forEach((val: string) => {
                    temp.push({ ...res, [opt.name]: val });
                });
            });
            results = temp;
        });

        const usedIds = new Set<string>();
        const usedSkus = new Set<string>();

        const newVariants = results.map((combination, idx) => {
            const attrCode = Object.values(combination).map(getAttributeCode).join('.');
            const baseSku = `${formData.sku || 'SKU'}.${attrCode}`;
            let variantSku = baseSku;
            let counter = 1;
            while (usedSkus.has(variantSku)) {
                counter++;
                variantSku = `${baseSku}-${counter}`;
            }
            usedSkus.add(variantSku);

            // Intentar preservar datos si el SKU o combinacion ya existia sin repetir ID
            const existing = variants.find(v => 
                v.sku === variantSku && !usedIds.has(v.id)
            ) || variants.find(v => 
                v.options && 
                Object.keys(combination).every(k => v.options[k] === combination[k]) &&
                !usedIds.has(v.id)
            );

            let id = existing?.id;
            if (!id || usedIds.has(id)) {
                id = `v-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
            }
            usedIds.add(id);

            return {
                id,
                options: combination,
                sku: variantSku,
                price_adj_pct: existing?.price_adj_pct || existing?.price_adjustment_percent || 0,
                image_url: existing?.image_url || null,
                show_on_web: existing?.show_on_web !== false
            };
        });

        setVariants(newVariants);
        const summaryStr = activeOptions.map(o => `${o.name} (${o.values.length})`).join(' + ');
        setVariantNotice(`✅ ¡Combinaciones recalculadas! ${newVariants.length} combinaciones generadas con [ ${summaryStr} ]`);
    };

    const updateVariantPrice = (id: string, price: number) => {
        setVariants(variants.map(v => v.id === id ? { ...v, price_adj_pct: price } : v));
    };

    const updateVariantVisibility = (id: string, visible: boolean) => {
        setVariants(variants.map(v => v.id === id ? { ...v, show_on_web: visible } : v));
    };

    const handleGenerateAI = async () => {
        if (!formData.name) {
            alert('Por favor asigne un nombre al producto primero.');
            return;
        }
        setGeneratingAI(true);
        try {
            const response = await fetch('/api/products/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: formData.name, 
                    category: formData.category,
                    current_description: formData.description 
                })
            });

            if (response.ok) {
                const data = await response.json();
                setFormData(prev => ({
                    ...prev,
                    description: data.description_es,
                    description_en: data.description_en,
                    name_en: data.name_en
                }));
            } else {
                const err = await response.json();
                alert('Error IA: ' + (err.error || 'Error desconocido'));
            }
        } catch (error) {
            console.error('AI Generation error:', error);
            alert('Error de conexión con el motor de IA');
        } finally {
            setGeneratingAI(false);
        }
    };

    const handleVariantImageUpload = async (variantId: string, file: File) => {
        setVariantUploading(variantId);
        try {
            const optimizedFile = await optimizeImageForUpload(file, {
                maxWidth: 600,
                maxHeight: 600,
                quality: 0.80
            });

            const fileExt = optimizedFile.name.split('.').pop() || 'webp';
            const fileName = `${variantId}-${Date.now()}.${fileExt}`;
            const filePath = `variants/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, optimizedFile, {
                    cacheControl: '2592000',
                    contentType: optimizedFile.type,
                    upsert: true
                });

            if (uploadError) {
                diagnoseStorageError(uploadError, 'product-images');
                throw uploadError;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(filePath);

            setVariants(variants.map(v => v.id === variantId ? { ...v, image_url: publicUrl } : v));
        } catch (error) {
            console.error('Error subiendo imagen de variante:', error);
        } finally {
            setVariantUploading(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (readOnly) return;
        setLoading(true);

        try {
            const uploadedImageUrl = await uploadImage();
            
            console.log('Guardando Producto:', {
                id: product.id,
                sku: formData.sku,
                options_count: options.length,
                variants_count: variants.length
            });

            const updatePayload: any = {
                name: formData.name,
                sku: formData.sku,
                category: formData.category,
                unit_of_measure: formData.unit_of_measure?.toLowerCase() === 'unidad' ? 'Unidad' : 'Kg',
                description: formData.description,
                min_inventory_level: formData.min_inventory_level,
                is_active: formData.is_active,
                image_url: uploadedImageUrl,
                parent_id: formData.parent_id,
                buying_team: formData.buying_team,
                procurement_method: formData.procurement_method,
                inventory_group: formData.inventory_group,
                purchase_sublist: formData.purchase_sublist,
                utility_deviation_pct: formData.utility_deviation_pct || 0,
                options_config: options
                    .filter(opt => opt.name && Array.isArray(opt.values) && opt.values.length > 0)
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                    .map(opt => {
                        const attr: any = masterAttributes.find((a: any) => a.name === opt.name);
                        return {
                            name: opt.name,
                            values: opt.values,
                            show_on_web: attr ? attr.show_on_web !== false : true
                        };
                    }),
                options: options.reduce((acc: any, opt: any) => {
                    if (opt.name && Array.isArray(opt.values) && opt.values.length > 0) {
                        acc[opt.name] = opt.values;
                    }
                    return acc;
                }, {}),
                variants: variants,
                iva_rate: formData.iva_rate,
                weight_kg: formData.weight_kg !== undefined && formData.weight_kg !== null ? Number(formData.weight_kg) : (formData.unit_of_measure?.toLowerCase() === 'unidad' ? 1.0 : 0.1),
                display_name: formData.display_name,
                web_unit: formData.web_unit,
                web_conversion_factor: formData.web_conversion_factor,
                name_en: formData.name_en,
                description_en: formData.description_en,
                tags: formData.tags,
                keywords: formData.keywords || null,
                requires_label: (formData as any).requires_label ?? false
            };

            // Intentar incluir inherit_price si está definido
            if ('inherit_price' in formData) {
                updatePayload.inherit_price = (formData as any).inherit_price ?? false;
            }

            let { error } = await supabase
                .from('products')
                .update(updatePayload)
                .eq('id', product.id);

            // Si falla por columna faltante, reintentar sin inherit_price
            if (error && error.message?.includes('column "inherit_price" does not exist')) {
                console.warn('⚠️ Column inherit_price missing in DB. Retrying without it...');
                delete updatePayload.inherit_price;
                const retry = await supabase
                    .from('products')
                    .update(updatePayload)
                    .eq('id', product.id);
                error = retry.error;
                
                if (!error) {
                    alert('⚠️ El producto se guardó, pero la opción "Heredar Precio" requiere una actualización de la base de datos (Columna inherit_price faltante).');
                }
            }

            if (error) throw error;
            
            // 2. Sincronizar tabla dedicada product_variants
            // Primero, siempre limpiamos las existentes para este producto para evitar duplicados o huérfanos
            const { error: deleteError } = await supabase
                .from('product_variants')
                .delete()
                .eq('product_id', product.id);
            
            if (deleteError) {
                console.error('Error limpiando variantes anteriores:', deleteError);
                throw deleteError;
            }

            if (variants && variants.length > 0 && options.length > 0) {
                // Consultar variantes existentes para evitar duplicados contra otros productos
                const { data: existingDbVariants } = await supabase
                    .from('product_variants')
                    .select('sku')
                    .neq('product_id', product.id);

                const existingOtherSkus = new Set((existingDbVariants || []).map((ev: any) => ev.sku));
                const seenBatchSkus = new Set<string>();
                
                const formattedVariants = variants.map((v, idx) => {
                    let vSku = (v.sku && v.sku.trim()) || `${formData.sku || 'SKU'}-V${idx + 1}`;
                    let testSku = vSku;
                    let c = 2;
                    while (seenBatchSkus.has(testSku) || existingOtherSkus.has(testSku)) {
                        testSku = `${vSku}-${c}`;
                        c++;
                    }
                    seenBatchSkus.add(testSku);

                    return {
                        product_id: product.id,
                        sku: testSku,
                        options: v.options,
                        image_url: v.image_url,
                        price_adjustment_percent: v.price_adj_pct || 0,
                        is_active: v.show_on_web ?? true
                    };
                });

                const { error: variantError } = await supabase
                    .from('product_variants')
                    .insert(formattedVariants);

                if (variantError) {
                    console.error('Error insertando nuevas variantes:', variantError);
                    throw variantError;
                }
            }


            console.info('✅ Producto y variantes actualizados correctamente');
            triggerProductRevalidation();
            onSave();
            onClose();
        } catch (error: any) {
            const diagnosis = diagnoseDatabaseError(error, 'products', 'Update');
            alert(diagnosis || 'Error al actualizar producto');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            backdropFilter: 'blur(8px)',
            padding: '2rem'
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '2.5rem',
                borderRadius: '24px',
                width: '92%',
                maxWidth: '1450px',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
            }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.2rem', borderBottom: '1px solid #eee', paddingBottom: '0.8rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: '900', color: '#111827', display: 'flex', alignItems: 'center', gap: '0.8rem', margin: 0 }}>
                            <span>⚙️ Editar Maestro</span>
                            <span style={{ color: '#2563EB', fontWeight: '900' }}>
                                ID Contable: #{product.accounting_id || 'S/N'}
                            </span>
                        </h2>

                        {/* Toggle Dev Revisión */}
                        <button
                            type="button"
                            onClick={() => {
                                const isVerified = formData.is_verified_dev || (formData.tags && formData.tags.includes('verified_dev'));
                                const newStatus = !isVerified;
                                const updatedTags = newStatus
                                    ? Array.from(new Set([...(formData.tags || []), 'verified_dev']))
                                    : (formData.tags || []).filter(t => t !== 'verified_dev');
                                setFormData(prev => ({ ...prev, is_verified_dev: newStatus, tags: updatedTags }));
                            }}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 14px',
                                borderRadius: '20px',
                                border: `1px solid ${ (formData.is_verified_dev || (formData.tags && formData.tags.includes('verified_dev'))) ? '#A7F3D0' : '#FDE68A' }`,
                                backgroundColor: (formData.is_verified_dev || (formData.tags && formData.tags.includes('verified_dev'))) ? '#ECFDF5' : '#FFFBEB',
                                color: (formData.is_verified_dev || (formData.tags && formData.tags.includes('verified_dev'))) ? '#065F46' : '#92400E',
                                fontSize: '0.8rem',
                                fontWeight: '700',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            title="Haz clic para cambiar el estado de revisión en etapa de desarrollo"
                        >
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: (formData.is_verified_dev || (formData.tags && formData.tags.includes('verified_dev'))) ? '#10B981' : '#F59E0B' }}></div>
                            <span>{(formData.is_verified_dev || (formData.tags && formData.tags.includes('verified_dev'))) ? '🔍 REVISADO (DEV)' : '⏳ PENDIENTE (DEV)'}</span>
                        </button>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '2rem', cursor: 'pointer', color: '#6B7280' }}>✕</button>
                </header>

                {readOnly && (
                    <div style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                        color: '#D97706',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '1.5rem'
                    }}>
                        <ShieldAlert size={16} />
                        <span>Modo Vista: No tienes permisos para modificar este SKU.</span>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '3rem', ...(readOnly ? { pointerEvents: 'none', opacity: 0.85 } : {}) }}>
                        
                        {/* COLUMNA IZQUIERDA: CONFIGURACIÓN BÁSICA */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', backgroundColor: '#F9FAFB', padding: '1rem', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
                        <div style={{ width: '100px', height: '100px', borderRadius: '12px', overflow: 'hidden', border: '2px solid #D1D5DB', position: 'relative', flexShrink: 0 }}>
                            {previewUrl ? (
                                <Image 
                                    src={previewUrl} 
                                    alt="" 
                                    width={100} 
                                    height={100} 
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                    sizes="100px"
                                />
                            ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', color: '#9CA3AF' }}>📷</div>
                            )}
                            <input type="file" accept="image/*" onChange={handleFileChange} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '0.6rem', padding: '4px', textAlign: 'center' }}>CAMBIAR</div>
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Nombre Técnico</label>
                            <input
                                required
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '1.1rem', fontWeight: '700' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Código Contable (SKU)</label>
                            <input
                                required
                                type="text"
                                value={formData.sku}
                                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #2563EB', fontSize: '1rem', fontWeight: '800', backgroundColor: '#EFF6FF', color: '#1E40AF' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Categoría Técnica</label>
                            <select
                                value={formData.category}
                                onChange={(e) => {
                                    const newCatId = e.target.value;
                                    const oldSku = formData.sku || '';
                                    const parts = oldSku.split('-');
                                    let newSku = oldSku;
                                    
                                    if (parts.length > 1) {
                                        // Replace prefix before first hyphen (e.g., HO-001 -> VE-001)
                                        newSku = `${newCatId}-${parts.slice(1).join('-')}`;
                                    } else if (oldSku) {
                                        // No hyphen? Add prefix (e.g., 001 -> VE-001)
                                        newSku = `${newCatId}-${oldSku}`;
                                    }
                                    
                                    setFormData({ ...formData, category: newCatId, sku: newSku });
                                }}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '1rem', cursor: 'pointer', fontWeight: '800' }}
                            >
                                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name} ({cat.id})</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Alistamiento</label>
                            <select
                                value={formData.buying_team || ''}
                                onChange={(e) => setFormData({ ...formData, buying_team: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.8rem', fontWeight: '700' }}
                            >
                                <option value="">Seleccionar equipo...</option>
                                <option value="AGUACATES">AGUACATES</option>
                                <option value="ALISTAMIENTO ABARROTES">ALISTAMIENTO ABARROTES</option>
                                <option value="ALISTAMIENTO BATAVIA">ALISTAMIENTO BATAVIA</option>
                                <option value="ALISTAMIENTO EN SECO PAPAS">ALISTAMIENTO EN SECO PAPAS</option>
                                <option value="ALISTAMIENTO EN SECO PLATANOS">ALISTAMIENTO EN SECO PLATANOS</option>
                                <option value="ALISTAMIENTO EN SECO TOMATE">ALISTAMIENTO EN SECO TOMATE</option>
                                <option value="ALISTAMIENTO FRUTOS SECOS">ALISTAMIENTO FRUTOS SECOS</option>
                                <option value="ALISTAMIENTO PROCESADOS">ALISTAMIENTO PROCESADOS</option>
                                <option value="EQUIPO A VEGETALES">EQUIPO A VEGETALES</option>
                                <option value="EQUIPO B FRUTAS Y OTROS">EQUIPO B FRUTAS Y OTROS</option>
                                <option value="FRESAS Y MORA">FRESAS Y MORA</option>
                                <option value="FRUTA BAJA DEMANDA">FRUTA BAJA DEMANDA</option>
                                <option value="HIERBAS Y HORTALIZAS">HIERBAS Y HORTALIZAS</option>
                                <option value="LACTEOS Y REFRIGERADOS">LACTEOS Y REFRIGERADOS</option>
                                <option value="LAVADO, BATAVIA, ARRACACHA, CEBOLLA LARGA Y PEPINO">LAVADO, BATAVIA, ARRACACHA, CEBOLLA LARGA Y PEPINO</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Sublista de Compra</label>
                            <select
                                value={formData.purchase_sublist || ''}
                                onChange={(e) => setFormData({ ...formData, purchase_sublist: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.8rem', fontWeight: '700' }}
                            >
                                <option value="">Seleccionar sublista...</option>
                                <option value="DESPENSA">DESPENSA</option>
                                <option value="FRUTA SELECCIONADA">FRUTA SELECCIONADA</option>
                                <option value="HORTALIZA SELECCIONADA">HORTALIZA SELECCIONADA</option>
                                <option value="PLATANOS">PLATANOS</option>
                                <option value="TOMATE">TOMATE</option>
                                <option value="TUBERCULOS - PAPA">TUBERCULOS - PAPA</option>
                                <option value="VERDURAS">VERDURAS</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Gestión de Compras</label>
                            <select
                                value={formData.procurement_method || ''}
                                onChange={(e) => setFormData({ ...formData, procurement_method: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.8rem', fontWeight: '700' }}
                            >
                                <option value="">Seleccionar método...</option>
                                <option value="Compras Generales">Compras Generales</option>
                                <option value="Compras Menores">Compras Menores</option>
                                <option value="Compras Noche">Compras Noche</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Grupo Inventario</label>
                            <select
                                value={formData.inventory_group || ''}
                                onChange={(e) => setFormData({ ...formData, inventory_group: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.8rem', fontWeight: '700' }}
                            >
                                <option value="">Seleccionar grupo...</option>
                                <option value="INVENTARIO DE ABARROTES, FRUTOS SECOS, LACTEOS Y CARNES FRIAS">INVENTARIO DE ABARROTES, FRUTOS SECOS, LACTEOS Y CARNES FRIAS</option>
                                <option value="INVENTARIO DE FRUTAS Y OTROS">INVENTARIO DE FRUTAS Y OTROS</option>
                                <option value="INVENTARIO DE HORTALIZAS">INVENTARIO DE HORTALIZAS</option>
                                <option value="INVENTARIO DE PAPAS, PLATANO, TOMATE Y AGUACATES">INVENTARIO DE PAPAS, PLATANO, TOMATE Y AGUACATES</option>
                                <option value="INVENTARIO DE VERDURAS">INVENTARIO DE VERDURAS</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ position: 'relative' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Vincular a Producto Padre (Hijo de...)</label>
                        <input
                            type="text"
                            placeholder={hasChildren ? "Bloqueado: Este producto ya es PADRE" : "Buscar padre por nombre o ID Contable..."}
                            value={parentSearch || (formData.parent_id ? (() => {
                                const p = allProducts.find(i => i.id === formData.parent_id);
                                return p ? `ID: #${p.accounting_id || p.sku} - ${p.name}` : '';
                            })() : '')}
                            onChange={(e) => {
                                setParentSearch(e.target.value);
                                setShowParentResults(true);
                            }}
                            onFocus={() => !hasChildren && setShowParentResults(true)}
                            disabled={hasChildren}
                            style={{ 
                                width: '100%', 
                                padding: '0.8rem', 
                                borderRadius: '8px', 
                                border: '1px solid #D1D5DB', 
                                fontSize: '0.95rem', 
                                fontWeight: 'bold', 
                                color: formData.parent_id ? '#1E40AF' : 'inherit',
                                backgroundColor: hasChildren ? '#F3F4F6' : 'white',
                                cursor: hasChildren ? 'not-allowed' : 'text'
                            }}
                        />
                        {hasChildren && (
                            <p style={{ fontSize: '0.7rem', color: '#EF4444', marginTop: '4px', fontWeight: 'bold' }}>
                                ⚠️ Este producto ya es PADRE de otros productos. No puede ser vinculado a otro nivel superior.
                            </p>
                        )}
                        {showParentResults && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #D1D5DB', borderRadius: '8px', marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
                                <div 
                                    onClick={() => {
                                        setFormData({ ...formData, parent_id: null });
                                        setParentSearch('');
                                        setShowParentResults(false);
                                    }}
                                    style={{ padding: '0.8rem', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', color: '#EF4444', fontWeight: '700' }}
                                >
                                    ❌ Desvincular Padre
                                </div>
                                {allProducts
                                    .filter(p => 
                                        p.id !== product.id && 
                                        p.parent_id !== product.id &&
                                        (p.name.toLowerCase().includes(parentSearch.toLowerCase()) || (p.accounting_id?.toString() || '').includes(parentSearch) || p.sku.toLowerCase().includes(parentSearch.toLowerCase()))
                                    )
                                    .slice(0, 10)
                                    .map(p => (
                                        <div 
                                            key={p.id}
                                            onClick={() => {
                                                setFormData({ ...formData, parent_id: p.id });
                                                setParentSearch(`ID: #${p.accounting_id || p.sku} - ${p.name}`);
                                                setShowParentResults(false);
                                            }}
                                            style={{ padding: '0.8rem', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', transition: 'background 0.2s' }}
                                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <div style={{ fontWeight: '800', color: '#2563EB' }}>ID: #{p.accounting_id || p.sku}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>{p.name}</div>
                                        </div>
                                    ))
                                }
                            </div>
                        )}
                    </div>

                    {/* Lógica de Desviación de Utilidad (Solo si es Hijo y NO es Padre de otros) */}
                    {!hasChildren && formData.parent_id && (
                        <div style={{ padding: '1.2rem', backgroundColor: '#EFF6FF', borderRadius: '16px', border: '1px solid #BFDBFE', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1E40AF', fontWeight: '800', fontSize: '0.85rem' }}>
                                    <span>📊 CONFIGURACIÓN DE HIJO (FRACCIONADO)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', color: (formData as any).inherit_price ? '#2563EB' : '#6B7280' }}>
                                        {(formData as any).inherit_price ? 'HEREDAR PRECIO' : 'PRECIO INDEPENDIENTE'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, inherit_price: !(formData as any).inherit_price } as any)}
                                        style={{
                                            width: '40px',
                                            height: '20px',
                                            borderRadius: '10px',
                                            backgroundColor: (formData as any).inherit_price ? '#2563EB' : '#D1D5DB',
                                            border: 'none',
                                            position: 'relative',
                                            cursor: 'pointer',
                                            transition: 'background-color 0.2s'
                                        }}
                                    >
                                        <div style={{
                                            width: '16px',
                                            height: '16px',
                                            borderRadius: '50%',
                                            backgroundColor: 'white',
                                            position: 'absolute',
                                            top: '2px',
                                            left: (formData as any).inherit_price ? '22px' : '2px',
                                            transition: 'left 0.2s'
                                        }} />
                                    </button>
                                </div>
                            </div>

                            <p style={{ fontSize: '0.75rem', color: '#6B7280', margin: 0 }}>
                                {(formData as any).inherit_price 
                                    ? "Este producto hereda los costos del Padre. Define aquí la utilidad adicional." 
                                    : "Este producto tiene un precio independiente. No se verá afectado por cambios en el padre."}
                            </p>

                            {(formData as any).inherit_price && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '900', color: '#1E40AF', marginBottom: '4px' }}>Ajuste de Utilidad (%)</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input 
                                                type="number"
                                                value={formData.utility_deviation_pct}
                                                onChange={(e) => setFormData({ ...formData, utility_deviation_pct: parseFloat(e.target.value) || 0 })}
                                                style={{ width: '80px', padding: '0.6rem', borderRadius: '8px', border: '2px solid #2563EB', fontWeight: '900', textAlign: 'center' }}
                                            />
                                            <span style={{ fontWeight: '800', color: '#2563EB' }}>% ADICIONAL</span>
                                        </div>
                                    </div>
                                    {(() => {
                                        const parent = allProducts.find(p => p.id === formData.parent_id);
                                        return (
                                            <div style={{ flex: 1, textAlign: 'right', fontSize: '0.75rem', color: '#1E40AF' }}>
                                                Padre vinculado: <br />
                                                <strong style={{ fontSize: '0.85rem' }}>{parent?.sku || 'Cargando...'}</strong>
                                                {parent && <span style={{ display: 'block', opacity: 0.8, fontSize: '0.75rem', fontWeight: 'bold' }}>{parent.name}</span>}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.8rem' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#374151', margin: 0 }}>
                                    Unidad de Medida Compras
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setShowUnitGuideModal(true)}
                                    title="¿Cómo funciona? Haz clic para ver la guía explicativa"
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        cursor: 'pointer',
                                        padding: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        color: '#3B82F6'
                                    }}
                                >
                                    <HelpCircle size={14} />
                                </button>
                            </div>
                            <select
                                value={formData.unit_of_measure?.toLowerCase() === 'unidad' ? 'Unidad' : 'Kg'}
                                onChange={(e) => {
                                    const newUnit = e.target.value;
                                    let newWeight = formData.weight_kg;
                                    if (newUnit === 'Kg') {
                                        newWeight = (formData.weight_kg !== undefined && formData.weight_kg > 0 && formData.weight_kg <= 10) ? formData.weight_kg : 0.1;
                                    } else {
                                        newWeight = (formData.weight_kg !== undefined && formData.weight_kg > 0) ? formData.weight_kg : 1.0;
                                    }
                                    setFormData({ ...formData, unit_of_measure: newUnit, weight_kg: newWeight });
                                }}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '1rem', cursor: 'pointer', fontWeight: '700', color: '#111827' }}
                            >
                                <option value="Kg">Kg (Por Peso / Granel)</option>
                                <option value="Unidad">Unidad (Discreto / Empacado)</option>
                            </select>
                        </div>
                        <div>
                            {formData.unit_of_measure?.toLowerCase() === 'unidad' ? (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: '800', color: '#2563EB', margin: 0 }}>
                                            Peso Log. (kg/und)
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setShowUnitGuideModal(true)}
                                            title="Peso físico unitario para cubicaje de camiones"
                                            style={{
                                                border: 'none',
                                                background: 'transparent',
                                                cursor: 'pointer',
                                                padding: 0,
                                                display: 'flex',
                                                alignItems: 'center',
                                                color: '#2563EB'
                                            }}
                                        >
                                            <Info size={14} />
                                        </button>
                                    </div>
                                    <input
                                        type="number"
                                        step="0.001"
                                        min="0.001"
                                        placeholder="Ej: 0.050"
                                        value={formData.weight_kg !== undefined && formData.weight_kg !== null ? formData.weight_kg : ''}
                                        onChange={(e) => {
                                            const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                            setFormData({ ...formData, weight_kg: val });
                                        }}
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.8rem', 
                                            borderRadius: '8px', 
                                            border: '2px solid #93C5FD', 
                                            fontSize: '1rem', 
                                            fontWeight: '800',
                                            color: '#1E40AF',
                                            backgroundColor: '#EFF6FF'
                                        }}
                                    />
                                </>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: '800', color: '#D97706', margin: 0 }}>
                                            Cant. Mínima Venta (kg)
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setShowUnitGuideModal(true)}
                                            title="Cantidad mínima permitida en pedidos (default: 0.1 kg = 100g)"
                                            style={{
                                                border: 'none',
                                                background: 'transparent',
                                                cursor: 'pointer',
                                                padding: 0,
                                                display: 'flex',
                                                alignItems: 'center',
                                                color: '#D97706'
                                            }}
                                        >
                                            <Info size={14} />
                                        </button>
                                    </div>
                                    <input
                                        type="number"
                                        step="0.001"
                                        min="0.001"
                                        placeholder="0.1"
                                        value={formData.weight_kg !== undefined && formData.weight_kg !== null ? formData.weight_kg : 0.1}
                                        onChange={(e) => {
                                            const val = e.target.value === '' ? 0.1 : parseFloat(e.target.value);
                                            setFormData({ ...formData, weight_kg: val });
                                        }}
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.8rem', 
                                            borderRadius: '8px', 
                                            border: '2px solid #FCD34D', 
                                            fontSize: '1rem', 
                                            fontWeight: '800',
                                            color: '#B45309',
                                            backgroundColor: '#FFFBEB'
                                        }}
                                    />
                                </>
                            )}
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>IVA (%)</label>
                            <select
                                value={formData.iva_rate}
                                onChange={(e) => setFormData({ ...formData, iva_rate: parseInt(e.target.value) })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '2px solid #10B981', fontSize: '1.1rem', fontWeight: '900', color: '#065F46', backgroundColor: '#ECFDF5', cursor: 'pointer' }}
                            >
                                <option value={0}>0% (Exento/Excluido)</option>
                                <option value={5}>5% (Reducido)</option>
                                <option value={19}>19% (General)</option>
                                <option value={22}>22% (Especial)</option>
                            </select>
                        </div>
                    </div>

                    {/* TARJETA INFORMATIVA REACTIVA SEGÚN UNIDAD SELECCIONADA */}
                    {formData.unit_of_measure?.toLowerCase() === 'unidad' ? (
                        <div style={{
                            marginTop: '0.75rem',
                            padding: '0.75rem 1rem',
                            borderRadius: '10px',
                            backgroundColor: '#EFF6FF',
                            border: '1.5px solid #BFDBFE',
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '10px',
                            fontSize: '0.78rem',
                            color: '#1E40AF',
                            lineHeight: '1.45',
                            boxShadow: '0 1px 3px rgba(30, 64, 175, 0.05)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <Package size={18} color="#2563EB" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <div style={{ fontWeight: '800', color: '#1D4ED8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        Modo UNIDAD (Conteo / Presentación Discreta)
                                    </div>
                                    <div style={{ marginTop: '2px', color: '#1E3A8A' }}>
                                        • <strong>En Pedidos:</strong> Exige números enteros (1, 2, 3... bandejas o unidades), bloqueando decimales.
                                        <br />
                                        • <strong>Peso Logístico ({formData.weight_kg ?? 1.0} kg/und):</strong> Peso unitario estimado usado exclusivamente para cubicaje y cálculo de carga en los camiones de despacho.
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowUnitGuideModal(true)}
                                style={{
                                    flexShrink: 0,
                                    padding: '4px 10px',
                                    backgroundColor: '#DBEAFE',
                                    border: '1px solid #93C5FD',
                                    borderRadius: '6px',
                                    fontSize: '0.74rem',
                                    fontWeight: '800',
                                    color: '#1E40AF',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <HelpCircle size={13} />
                                Ver Guía
                            </button>
                        </div>
                    ) : (
                        <div style={{
                            marginTop: '0.75rem',
                            padding: '0.75rem 1rem',
                            borderRadius: '10px',
                            backgroundColor: '#FFFBEB',
                            border: '1.5px solid #FDE68A',
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '10px',
                            fontSize: '0.78rem',
                            color: '#92400E',
                            lineHeight: '1.45',
                            boxShadow: '0 1px 3px rgba(245, 158, 11, 0.05)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <Scale size={18} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <div style={{ fontWeight: '800', color: '#B45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        Modo KILOGRAMOS (Venta Continua a Granel)
                                    </div>
                                    <div style={{ marginTop: '2px', color: '#78350F' }}>
                                        • <strong>En Pedidos:</strong> Permite ingresar cantidades con decimales (ej: 0,5 kg, 1,25 kg).
                                        <br />
                                        • <strong>Cant. Mínima Venta ({formData.weight_kg ?? 0.1} kg):</strong> Límite mínimo de venta. Si el producto tiene presentaciones físicas (ej. Mango 550g), el sistema calcula el límite dinámico para no vender menos de una fruta.
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowUnitGuideModal(true)}
                                style={{
                                    flexShrink: 0,
                                    padding: '4px 10px',
                                    backgroundColor: '#FEF3C7',
                                    border: '1px solid #FCD34D',
                                    borderRadius: '6px',
                                    fontSize: '0.74rem',
                                    fontWeight: '800',
                                    color: '#B45309',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <HelpCircle size={13} />
                                Ver Guía
                            </button>
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Inventario Mínimo</label>
                            <input
                                type="number"
                                value={formData.min_inventory_level}
                                onChange={(e) => setFormData({ ...formData, min_inventory_level: parseInt(e.target.value) || 0 })}
                                style={{ 
                                    width: '100%', 
                                    padding: '0.8rem', 
                                    borderRadius: '8px', 
                                    border: '1px solid #D1D5DB', 
                                    fontSize: '1.2rem', 
                                    fontWeight: '900',
                                    color: formData.min_inventory_level > 0 ? '#B91C1C' : '#6B7280',
                                    backgroundColor: formData.min_inventory_level > 0 ? '#FEF2F2' : 'white'
                                }}
                            />
                        </div>
                    </div>

                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#6B7280' }}>Descripción Técnica (ES/EN)</label>
                            <button
                                type="button"
                                onClick={handleGenerateAI}
                                disabled={generatingAI}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '4px 10px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: generatingAI ? '#F3F4F6' : '#EEF2FF',
                                    color: '#4F46E5',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    cursor: generatingAI ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {generatingAI ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Wand2 size={14} />
                                )}
                                {generatingAI ? 'Generando...' : 'Optimizar con IA'}
                            </button>
                        </div>
                        <textarea
                            value={formData.description || ''}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={4}
                            placeholder="Descripción en español..."
                            style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '0.9rem', resize: 'none', fontFamily: 'inherit', marginBottom: '1rem' }}
                        />
                        <textarea
                            value={formData.description_en || ''}
                            onChange={(e) => setFormData({ ...formData, description_en: e.target.value })}
                            rows={3}
                            placeholder="Description in English (Auto-generated)..."
                            style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '0.85rem', resize: 'none', fontFamily: 'inherit', backgroundColor: '#F9FAFB' }}
                        />
                    </div>

                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        padding: '1rem', 
                        backgroundColor: formData.is_active ? '#ECFDF5' : '#FEF2F2', 
                        borderRadius: '12px',
                        border: `1px solid ${formData.is_active ? '#A7F3D0' : '#FECACA'}`,
                        marginBottom: '1rem'
                    }}>
                        <div>
                            <span style={{ fontWeight: '800', color: formData.is_active ? '#065F46' : '#991B1B' }}>ESTADO DEL SKU</span>
                            <p style={{ fontSize: '0.75rem', color: '#6B7280' }}>Si está OFF, no se verá en ninguna bodega comercial.</p>
                        </div>
                        <button 
                            type="button"
                            onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '20px',
                                border: 'none',
                                backgroundColor: formData.is_active ? '#10B981' : '#EF4444',
                                color: 'white',
                                fontWeight: '900',
                                cursor: 'pointer',
                                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                            }}
                        >
                            {formData.is_active ? 'HABILITADO' : 'SUSPENDIDO'}
                        </button>
                    </div>

                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        padding: '1rem', 
                        backgroundColor: (formData as any).show_on_web !== false ? '#EFF6FF' : '#F9FAFB', 
                        borderRadius: '12px',
                        border: `1px solid ${(formData as any).show_on_web !== false ? '#BFDBFE' : '#D1D5DB'}`,
                        marginBottom: '1.5rem'
                    }}>
                        <div>
                            <span style={{ fontWeight: '800', color: (formData as any).show_on_web !== false ? '#1E40AF' : '#4B5563' }}>DISPONIBLE WEB (B2C)</span>
                            <p style={{ fontSize: '0.75rem', color: '#6B7280' }}>Si está OFF, no aparecerá en el catálogo público.</p>
                        </div>
                        <button 
                            type="button"
                            onClick={() => setFormData({ ...formData, show_on_web: !(formData as any).show_on_web } as any)}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '20px',
                                border: 'none',
                                backgroundColor: (formData as any).show_on_web !== false ? '#2563EB' : '#9CA3AF',
                                color: 'white',
                                fontWeight: '900',
                                cursor: 'pointer',
                                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                            }}
                        >
                            {(formData as any).show_on_web !== false ? 'VISIBLE' : 'OCULTO'}
                        </button>
                    </div>

                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        padding: '1rem', 
                        backgroundColor: (formData as any).requires_label ? '#ECFDF5' : '#F9FAFB', 
                        borderRadius: '12px',
                        border: `1px solid ${(formData as any).requires_label ? '#A7F3D0' : '#D1D5DB'}`,
                        marginBottom: '1.5rem'
                    }}>
                        <div>
                            <span style={{ fontWeight: '800', color: (formData as any).requires_label ? '#065F46' : '#4B5563' }}>REQUIERE ETIQUETA TÉRMICA</span>
                            <p style={{ fontSize: '0.75rem', color: '#6B7280' }}>Si está ON, se generarán etiquetas al procesar pedidos.</p>
                        </div>
                        <button 
                            type="button"
                            onClick={() => setFormData({ ...formData, requires_label: !(formData as any).requires_label } as any)}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '20px',
                                border: 'none',
                                backgroundColor: (formData as any).requires_label ? '#059669' : '#9CA3AF',
                                color: 'white',
                                fontWeight: '900',
                                cursor: 'pointer',
                                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                            }}
                        >
                            {(formData as any).requires_label ? 'SÍ' : 'NO'}
                        </button>
                    </div>

                    {/* SECCIÓN COMERCIAL / VIDAS PARALELAS */}
                    <div style={{ padding: '1.5rem', backgroundColor: '#FFF7ED', borderRadius: '20px', border: '1px solid #FFEDD5', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '900', color: '#9A3412', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            🏷️ Configuración Comercial (Web)
                        </h3>
                        <p style={{ fontSize: '0.8rem', color: '#7C2D12', margin: 0 }}>
                            Personaliza cómo se ve este producto en la página web, independiente del nombre técnico.
                        </p>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#9A3412', marginBottom: '4px' }}>Nombre Público (Web)</label>
                            <input
                                type="text"
                                placeholder="Ej: Manzana Roja Importada"
                                value={formData.display_name || ''}
                                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #FFD8A8', fontSize: '1rem', fontWeight: '700' }}
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#9A3412', marginBottom: '4px' }}>Unidad Comercial (Web)</label>
                                <select
                                    value={formData.web_unit || ''}
                                    onChange={(e) => setFormData({ ...formData, web_unit: e.target.value })}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #FFD8A8', fontSize: '1rem', fontWeight: '700', backgroundColor: 'white', cursor: 'pointer' }}
                                >
                                    <option value="">Seleccionar unidad...</option>
                                    {baseUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#9A3412', marginBottom: '4px' }}>¿Cuántos Kg es 1 {formData.web_unit || 'unidad'}?</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0,00"
                                        value={conversionFactorInput}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            // Permitir caracteres de control y números/separadores
                                            if (/^[0-9,.]*$/.test(val)) {
                                                setConversionFactorInput(val);
                                                const normalized = val.replace(',', '.');
                                                if (!isNaN(parseFloat(normalized))) {
                                                    setFormData({ ...formData, web_conversion_factor: parseFloat(normalized) });
                                                }
                                            }
                                        }}
                                        onBlur={() => {
                                            // Limpiar el input al salir si es inválido
                                            const normalized = conversionFactorInput.replace(',', '.');
                                            const parsed = parseFloat(normalized);
                                            if (isNaN(parsed)) {
                                                setConversionFactorInput('1,0');
                                                setFormData({ ...formData, web_conversion_factor: 1.0 });
                                            } else {
                                                setConversionFactorInput(parsed.toString().replace('.', ','));
                                            }
                                        }}
                                        style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #FFD8A8', fontSize: '1rem', fontWeight: '700', textAlign: 'center' }}
                                    />
                                    <span style={{ fontSize: '0.7rem', color: '#9A3412', fontWeight: '700', width: '80px' }}>KG equivalentes</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#9A3412', fontStyle: 'italic', backgroundColor: '#FFEDD5', padding: '8px', borderRadius: '8px' }}>
                            💡 <strong>Lógica:</strong> Si vendes por <strong>Atado de 100g</strong>, el factor es <strong>0.1</strong>. Si vendes por <strong>Libra</strong>, el factor es <strong>0.5</strong>.
                        </div>

                        {/* SECCIÓN RECETAS TÍPICAS & KEYWORDS */}
                        <div style={{ backgroundColor: '#F0FDF4', padding: '1rem', borderRadius: '12px', border: '1px solid #BBF7D0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#166534', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <ChefHat size={14} /> Recetas Típicas & Keywords de Búsqueda
                                </label>
                                <span style={{ fontSize: '0.7rem', color: '#15803D', fontStyle: 'italic' }}>Asocia el producto a recetas colombianas para el buscador</span>
                            </div>

                            {/* PRESETS DE PLATOS TÍPICOS */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                                {TYPICAL_RECIPES.map(({ id, label, Icon }) => {
                                    const currentList = (formData.keywords || '')
                                        .split(',')
                                        .map(k => k.trim().toLowerCase())
                                        .filter(Boolean);
                                    const isAssigned = currentList.includes(id) || currentList.includes(label.toLowerCase());

                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => {
                                                let updated: string[];
                                                if (isAssigned) {
                                                    updated = currentList.filter(k => k !== id && k !== label.toLowerCase());
                                                } else {
                                                    updated = Array.from(new Set([...currentList, id]));
                                                }
                                                setFormData({ ...formData, keywords: updated.join(', ') });
                                            }}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '3px 8px',
                                                borderRadius: '16px',
                                                fontSize: '0.72rem',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s',
                                                backgroundColor: isAssigned ? '#15803D' : '#FFFFFF',
                                                color: isAssigned ? '#FFFFFF' : '#166534',
                                                border: isAssigned ? '1px solid #15803D' : '1px solid #86EFAC',
                                                boxShadow: isAssigned ? '0 2px 4px rgba(21, 128, 61, 0.2)' : 'none'
                                            }}
                                        >
                                            <Icon size={11} strokeWidth={isAssigned ? 2.5 : 2} />
                                            <span>{label}</span>
                                            {isAssigned ? (
                                                <Check size={11} strokeWidth={3} style={{ marginLeft: '2px' }} />
                                            ) : (
                                                <Plus size={11} strokeWidth={2.5} style={{ marginLeft: '2px' }} />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* LISTA DE KEYWORDS ACTIVOS Y CAMPO MANUAL */}
                            <div style={{ 
                                display: 'flex', 
                                flexWrap: 'wrap', 
                                gap: '6px', 
                                padding: '0.5rem', 
                                border: '1px solid #86EFAC', 
                                borderRadius: '8px', 
                                backgroundColor: 'white',
                                minHeight: '40px',
                                alignItems: 'center'
                            }}>
                                {(formData.keywords || '')
                                    .split(',')
                                    .map(k => k.trim())
                                    .filter(Boolean)
                                    .map((kw, idx) => (
                                        <div key={idx} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            backgroundColor: '#DCFCE7',
                                            color: '#166534',
                                            padding: '2px 8px',
                                            borderRadius: '14px',
                                            fontSize: '0.75rem',
                                            fontWeight: '700',
                                            border: '1px solid #86EFAC'
                                        }}>
                                            <ChefHat size={10} />
                                            <span>{kw}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const current = (formData.keywords || '').split(',').map(k => k.trim()).filter(Boolean);
                                                    const updated = current.filter((_, i) => i !== idx);
                                                    setFormData({ ...formData, keywords: updated.join(', ') });
                                                }}
                                                style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ))}
                                <input
                                    type="text"
                                    placeholder={(!formData.keywords || formData.keywords.trim() === '') ? "Ej: ajiaco, sancocho, sopa, guiso..." : "Agregar keyword manual..."}
                                    value={keywordInput}
                                    onChange={(e) => setKeywordInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ',') {
                                            e.preventDefault();
                                            const newKw = keywordInput.trim().toLowerCase().replace(',', '');
                                            if (newKw) {
                                                const current = (formData.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                                                if (!current.includes(newKw)) {
                                                    const updated = [...current, newKw].join(', ');
                                                    setFormData({ ...formData, keywords: updated });
                                                }
                                                setKeywordInput('');
                                            }
                                        } else if (e.key === 'Backspace' && keywordInput === '') {
                                            const current = (formData.keywords || '').split(',').map(k => k.trim()).filter(Boolean);
                                            if (current.length > 0) {
                                                setFormData({ ...formData, keywords: current.slice(0, -1).join(', ') });
                                            }
                                        }
                                    }}
                                    style={{ 
                                        flex: 1, 
                                        minWidth: '130px', 
                                        border: 'none', 
                                        outline: 'none', 
                                        fontSize: '0.82rem', 
                                        backgroundColor: 'transparent',
                                        color: '#166534',
                                        fontWeight: '600'
                                    }}
                                />
                            </div>
                            <p style={{ fontSize: '0.7rem', color: '#15803D', marginTop: '4px', marginBottom: 0 }}>
                                Escribe palabras clave y presiona <strong>Enter</strong> o <strong>Coma (,)</strong> para añadirlas a la indexación del buscador.
                            </p>
                        </div>
                        
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#9A3412' }}>Etiquetas Comerciales & Búsqueda Web</label>
                                <span style={{ fontSize: '0.7rem', color: '#7C2D12', fontStyle: 'italic' }}>Activan badges automáticos en carrusel y catálogo</span>
                            </div>

                            {/* PRESETS RÁPIDOS DE CAMPAÑAS */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                {[
                                    { label: 'PROMOCION', type: 'promo', activeBg: '#FEF2F2', activeColor: '#DC2626', activeBorder: '#FCA5A5' },
                                    { label: 'COSECHA', type: 'harvest', activeBg: '#ECFDF5', activeColor: '#059669', activeBorder: '#A7F3D0' },
                                    { label: 'TEMPORADA', type: 'season', activeBg: '#ECFDF5', activeColor: '#059669', activeBorder: '#A7F3D0' },
                                    { label: 'BEST SELLER', type: 'bestseller', activeBg: '#FFFBEB', activeColor: '#D97706', activeBorder: '#FDE68A' },
                                    { label: 'OFERTA', type: 'flash', activeBg: '#FEF2F2', activeColor: '#DC2626', activeBorder: '#FCA5A5' },
                                    { label: 'GOURMET', type: 'gourmet', activeBg: '#F5F3FF', activeColor: '#7C3AED', activeBorder: '#DDD6FE' }
                                ].map((preset) => {
                                    const isSelected = (formData.tags || []).some(t => t.toUpperCase() === preset.label);
                                    return (
                                        <button
                                            key={preset.label}
                                            type="button"
                                            onClick={() => {
                                                const currentTags = formData.tags || [];
                                                if (isSelected) {
                                                    setFormData({
                                                        ...formData,
                                                        tags: currentTags.filter(t => t.toUpperCase() !== preset.label)
                                                    });
                                                } else {
                                                    setFormData({
                                                        ...formData,
                                                        tags: [...currentTags, preset.label]
                                                    });
                                                }
                                            }}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                padding: '4px 10px',
                                                borderRadius: '20px',
                                                fontSize: '0.72rem',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                backgroundColor: isSelected ? preset.activeBg : '#FFFFFF',
                                                color: isSelected ? preset.activeColor : '#6B7280',
                                                border: isSelected ? `1.5px solid ${preset.activeBorder}` : '1px solid #E5E7EB',
                                                boxShadow: isSelected ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                                            }}
                                        >
                                            {preset.type === 'promo' ? (
                                                <Tag size={12} strokeWidth={2.5} />
                                            ) : preset.type === 'harvest' || preset.type === 'season' ? (
                                                <Leaf size={12} strokeWidth={2.5} />
                                            ) : preset.type === 'bestseller' ? (
                                                <Flame size={12} strokeWidth={2.5} />
                                            ) : preset.type === 'flash' ? (
                                                <Zap size={12} strokeWidth={2.5} />
                                            ) : (
                                                <Sparkles size={12} strokeWidth={2.5} />
                                            )}
                                            <span>{preset.label}</span>
                                            {isSelected ? (
                                                <Check size={12} strokeWidth={3} style={{ marginLeft: '2px' }} />
                                            ) : (
                                                <Plus size={12} strokeWidth={2.5} style={{ marginLeft: '2px' }} />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div style={{ 
                                display: 'flex', 
                                flexWrap: 'wrap', 
                                gap: '8px', 
                                padding: '0.5rem', 
                                border: '1px solid #FFD8A8', 
                                borderRadius: '10px', 
                                backgroundColor: 'white',
                                minHeight: '45px',
                                alignItems: 'center'
                            }}>
                                {(formData.tags || []).map((tag, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        backgroundColor: '#FFF7ED',
                                        color: '#C2410C',
                                        padding: '4px 10px',
                                        borderRadius: '20px',
                                        fontSize: '0.8rem',
                                        fontWeight: '700',
                                        border: '1px solid #FED7AA'
                                    }}>
                                        {tag}
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, tags: (formData.tags || []).filter((_, i) => i !== idx) })}
                                            style={{ background: 'none', border: 'none', color: '#EA580C', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                                <input
                                    type="text"
                                    placeholder={(!formData.tags || formData.tags.length === 0) ? "Ej: organico, oferta, temporada..." : "Agregar tag manual..."}
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ',') {
                                            e.preventDefault();
                                            const newTag = tagInput.trim().toUpperCase();
                                            if (newTag && !(formData.tags || []).some(t => t.toUpperCase() === newTag)) {
                                                setFormData({ ...formData, tags: [...(formData.tags || []), newTag] });
                                                setTagInput('');
                                            }
                                        } else if (e.key === 'Backspace' && tagInput === '' && (formData.tags || []).length > 0) {
                                            setFormData({ ...formData, tags: (formData.tags || []).slice(0, -1) });
                                        }
                                    }}
                                    style={{ 
                                        flex: 1, 
                                        minWidth: '120px', 
                                        border: 'none', 
                                        outline: 'none', 
                                        fontSize: '0.9rem', 
                                        backgroundColor: 'transparent',
                                        color: '#9A3412',
                                        fontWeight: '600'
                                    }}
                                />
                            </div>
                            <p style={{ fontSize: '0.7rem', color: '#7C2D12', marginTop: '4px' }}>Presiona <strong>Enter</strong> o <strong>Coma (,)</strong> para añadir tags personalizados adicionales.</p>
                        </div>
                    </div>

                        </div>

                        {/* COLUMNA DERECHA: VARIANTES */}
                        <div style={{ borderLeft: '1px solid #eee', paddingLeft: '3rem' }}>
                            <h3 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#111827', borderBottom: '2px solid #E5E7EB', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>🧬 Variantes del Producto (ID: #{formData.accounting_id || 'S/N'})</h3>

                            {/* BLOQUE DE VARIANTES */}
                        <div style={{ backgroundColor: '#F9FAFB', borderRadius: '20px', padding: '1.5rem', border: '1px solid #E5E7EB' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: '#374151' }}>🛠️ VARIANTES (CANAL HOGAR)</h3>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>
                                        Exclusivo B2C. Define atributos (Madurez, Tamaño) para crear sub-SKUs comerciales.
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button 
                                        type="button"
                                        onClick={addOption}
                                        disabled={options.length >= 3}
                                        style={{ padding: '0.6rem 1rem', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '0.75rem', cursor: options.length >= 3 ? 'not-allowed' : 'pointer', opacity: options.length >= 3 ? 0.5 : 1 }}
                                    >
                                        + Agregar Atributo
                                    </button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                {options.map((opt: any, idx: number) => (
                                    <div key={idx} style={{ padding: '1.2rem', backgroundColor: '#F3F4F6', borderRadius: '12px', position: 'relative' }}>
                                        <button
                                            type="button"
                                            onClick={() => removeOption(idx)}
                                            style={{ position: 'absolute', right: '10px', top: '10px', border: 'none', background: 'none', color: '#EF4444', fontWeight: '800', cursor: 'pointer' }}
                                        >✕</button>

                                        <div style={{ marginBottom: '1rem' }}>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', marginBottom: '6px' }}>
                                                TIPO DE VARIACIÓN
                                            </label>
                                            <select
                                                value={masterAttributes.some(a => a.name === opt.name) ? opt.name : (opt.name ? 'Personalizado' : '')}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === 'Personalizado') {
                                                        updateOption(idx, '', '');
                                                    } else if (val === '') {
                                                        updateOption(idx, '', '');
                                                    } else {
                                                        updateOption(idx, val, '');
                                                    }
                                                }}
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #D1D5DB', fontWeight: '700', backgroundColor: 'white', color: '#1F2937', cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.8rem center', backgroundSize: '1.2em' }}
                                            >
                                                <option value="">-- Seleccionar --</option>
                                                {masterAttributes.map(attr => <option key={attr.name} value={attr.name}>{attr.name}</option>)}
                                            </select>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', marginBottom: '6px' }}>
                                                VALORES POSIBLES
                                            </label>
                                            
                                            {masterAttributes.some(a => a.name === opt.name) ? (() => {
                                                const masterAttr = masterAttributes.find(a => a.name === opt.name);
                                                const customVals = masterAttr ? opt.values.filter((v: string) => !masterAttr.values.includes(v)) : [];
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        {customVals.length > 0 && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', backgroundColor: '#FFFBEB', padding: '8px 12px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                                                                <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#B45309' }}>Valores Personalizados:</span>
                                                                {customVals.map((cVal: string) => (
                                                                    <span 
                                                                        key={cVal}
                                                                        style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '6px',
                                                                            backgroundColor: '#FEF3C7',
                                                                            color: '#92400E',
                                                                            border: '1px solid #FCD34D',
                                                                            padding: '3px 8px',
                                                                            borderRadius: '16px',
                                                                            fontSize: '0.75rem',
                                                                            fontWeight: '700'
                                                                        }}
                                                                    >
                                                                        <span>{cVal.includes('|') ? `${cVal.split('|')[0]} (${cVal.split('|')[1]} gr)` : cVal}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const newVals = opt.values.filter((v: string) => v !== cVal);
                                                                                updateOptionValues(idx, newVals);
                                                                            }}
                                                                            style={{ border: 'none', background: 'none', color: '#DC2626', cursor: 'pointer', fontWeight: '900', padding: 0, fontSize: '0.85rem' }}
                                                                            title="Eliminar este valor"
                                                                        >
                                                                            ✕
                                                                        </button>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #D1D5DB' }}>
                                                            {sortSuggestedValues(masterAttr?.values || []).map(val => {
                                                        const isWebUnit = val.toLowerCase() === 'unidad web' || val.toLowerCase() === 'unidadweb';
                                                        const webUnitName = formData.web_unit || 'Libra';
                                                        const webFactorKg = formData.web_conversion_factor ?? (formData.unit_of_measure?.toLowerCase() === 'kg' ? 0.5 : 1);
                                                        const webWeightText = webFactorKg >= 1 ? `${webFactorKg} kg` : `${Math.round(webFactorKg * 1000)} gr`;
                                                        const displayLabel = isWebUnit 
                                                            ? `🏷️ Unidad Web (${webUnitName} - ${webWeightText})`
                                                            : (val.includes('|') ? `${val.split('|')[0]} (${val.split('|')[1]} gr)` : val);

                                                        return (
                                                            <label 
                                                                key={val} 
                                                                style={{ 
                                                                    display: 'flex', 
                                                                    alignItems: 'center', 
                                                                    gap: '8px', 
                                                                    fontSize: '0.9rem', 
                                                                    cursor: 'pointer', 
                                                                    padding: '6px 12px', 
                                                                    backgroundColor: opt.values.includes(val) ? (isWebUnit ? '#ECFDF5' : '#EFF6FF') : (isWebUnit ? '#F0FDF4' : '#F9FAFB'), 
                                                                    borderRadius: '8px', 
                                                                    transition: 'all 0.2s', 
                                                                    border: `1.5px solid ${opt.values.includes(val) ? (isWebUnit ? '#10B981' : '#3B82F6') : (isWebUnit ? '#A7F3D0' : '#F3F4F6')}`, 
                                                                    color: opt.values.includes(val) ? (isWebUnit ? '#065F46' : '#1E40AF') : (isWebUnit ? '#047857' : '#4B5563'), 
                                                                    fontWeight: opt.values.includes(val) ? '800' : '500' 
                                                                }} 
                                                                title={isWebUnit ? `🌐 EXCLUSIVO PARA TIENDA WEB / E-COMMERCE: Al marcar esta casilla, el producto mostrará "${webUnitName} (${webWeightText})" como opción de compra para los clientes en la página web. Esto SOLO afecta la web y no altera pedidos ni operaciones institucionales B2B.` : undefined}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={opt.values.includes(val)}
                                                                    onChange={(e) => {
                                                                        const newValues = e.target.checked
                                                                            ? [...opt.values, val]
                                                                            : opt.values.filter((v: string) => v !== val);
                                                                        updateOptionValues(idx, newValues);
                                                                    }}
                                                                    style={{ width: '16px', height: '16px', accentColor: isWebUnit ? '#10B981' : '#3B82F6' }}
                                                                />
                                                                {displayLabel}
                                                            </label>
                                                        );
                                                    })}
                                                        </div>
                                                    </div>
                                                );
                                            })() : (
                                                <div style={{ fontSize: '0.85rem', color: '#94A3B8', fontWeight: '600', padding: '12px', backgroundColor: 'white', borderRadius: '10px', border: '1px dashed #D1D5DB', textAlign: 'center' }}>
                                                    Selecciona una variable de la lista para activar las opciones.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {options.length < 3 && (
                                    <button
                                        type="button"
                                        onClick={addOption}
                                        style={{ padding: '0.8rem', borderRadius: '8px', border: '2px dashed #D1D5DB', color: '#6B7280', fontWeight: '700', background: 'none', cursor: 'pointer' }}
                                    >
                                        + Añadir Variable de Producto
                                    </button>
                                )}

                                {options.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => generateVariants()}
                                        style={{ padding: '1rem', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', marginTop: '1rem', transition: 'all 0.2s' }}
                                    >
                                        🔄 Regenerar Combinaciones
                                    </button>
                                ) : variants.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => generateVariants()}
                                        style={{ padding: '1rem', backgroundColor: '#EF4444', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', marginTop: '1rem' }}
                                    >
                                        🗑️ Borrar Combinaciones
                                    </button>
                                )}

                                {variantNotice && (
                                    <div style={{ marginTop: '0.6rem', padding: '0.8rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '700', backgroundColor: variantNotice.includes('⚠️') ? '#FEF3C7' : '#ECFDF5', color: variantNotice.includes('⚠️') ? '#92400E' : '#065F46', border: `1px solid ${variantNotice.includes('⚠️') ? '#FCD34D' : '#6EE7B7'}` }}>
                                        {variantNotice}
                                    </div>
                                )}

                                {variants.length > 0 && (
                                    <div style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                                        <p style={{ fontWeight: '700', marginBottom: '1rem', color: '#059669' }}>✅ {variants.length} Combinaciones listas</p>
                                        <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '12px', marginTop: '0.5rem' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                <thead style={{ backgroundColor: '#F9FAFB', position: 'sticky', top: 0, zIndex: 5 }}>
                                                    <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                                                        <th style={{ padding: '12px 8px', textAlign: 'left', width: '60px' }}>Foto</th>
                                                        <th style={{ padding: '12px 8px', textAlign: 'left' }}>Variante</th>
                                                        <th style={{ padding: '12px 8px', textAlign: 'left' }}>SKU</th>
                                                        <th style={{ padding: '12px 8px', textAlign: 'center', width: '90px' }}>Ajuste %</th>
                                                        <th style={{ padding: '12px 8px', textAlign: 'center', width: '60px' }}>WEB</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {variants.map((v: any, i: number) => (
                                                        <tr key={v.id ? `${v.id}-${i}` : `v-${i}`} style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.2s' }}>
                                                            <td style={{ padding: '8px' }}>
                                                                <div 
                                                                    onClick={() => document.getElementById(`file-${v.id}`)?.click()}
                                                                    style={{ 
                                                                        width: '40px', 
                                                                        height: '40px', 
                                                                        borderRadius: '6px', 
                                                                        border: '1px dashed #D1D5DB', 
                                                                        cursor: 'pointer',
                                                                        overflow: 'hidden',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        backgroundColor: '#fff',
                                                                        position: 'relative'
                                                                    }}
                                                                >
                                                                    {v.image_url ? (
                                                                        <Image 
                                                                            src={v.image_url} 
                                                                            alt=""
                                                                            width={40} 
                                                                            height={40}
                                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                                            sizes="40px"
                                                                        />
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>{variantUploading === v.id ? '...' : '📷'}</span>
                                                                    )}
                                                                    <input 
                                                                        id={`file-${v.id}`}
                                                                        type="file" 
                                                                        hidden 
                                                                        accept="image/*"
                                                                        onChange={(e) => {
                                                                            if (e.target.files?.[0]) handleVariantImageUpload(v.id, e.target.files[0]);
                                                                        }}
                                                                    />
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '8px' }}>
                                                                <div style={{ fontWeight: '700', color: '#374151' }}>{Object.values(v.options).join(' / ')}</div>
                                                            </td>
                                                            <td style={{ padding: '8px' }}>
                                                                <span style={{ fontWeight: '800', color: '#2563EB', backgroundColor: '#EFF6FF', padding: '2px 6px', borderRadius: '4px' }}>{v.sku}</span>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                                                                    <input 
                                                                        type="number"
                                                                        value={v.price_adj_pct || 0}
                                                                        onChange={(e) => updateVariantPrice(v.id, parseFloat(e.target.value) || 0)}
                                                                        style={{ 
                                                                            width: '60px', 
                                                                            padding: '4px', 
                                                                            borderRadius: '4px', 
                                                                            border: '1px solid #D1D5DB',
                                                                            textAlign: 'center',
                                                                            fontWeight: '700',
                                                                            fontSize: '0.8rem'
                                                                        }}
                                                                    />
                                                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280' }}>%</span>
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateVariantVisibility(v.id, v.show_on_web === false)}
                                                                    style={{
                                                                        border: 'none',
                                                                        background: 'none',
                                                                        fontSize: '1.2rem',
                                                                        cursor: 'pointer',
                                                                        opacity: v.show_on_web === false ? 0.3 : 1,
                                                                        filter: v.show_on_web === false ? 'grayscale(1)' : 'none'
                                                                    }}
                                                                    title={v.show_on_web === false ? 'Oculto en Web' : 'Visible en Web'}
                                                                >
                                                                    {v.show_on_web === false ? '📵' : '🌐'}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        </div> {/* Fin Columna Derecha */}
                    </div> {/* Fin Grid */}

                    <footer style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid #eee', paddingTop: '1.5rem' }}>
                        <button type="button" onClick={onClose} style={{ padding: '0.8rem 2rem', background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontWeight: '600' }}>
                            {readOnly ? 'Cerrar' : 'Cancelar'}
                        </button>
                        {!readOnly && (
                            <button
                                type="submit"
                                disabled={loading || uploading}
                                style={{
                                    padding: '0.8rem 3rem',
                                    backgroundColor: '#111827',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '10px',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                {loading || uploading ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        )}
                    </footer>
                </form>
            </div>

            {/* MODAL GUÍA INTERACTIVA DE UNIDADES DE MEDIDA */}
            {showUnitGuideModal && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.65)',
                        backdropFilter: 'blur(6px)',
                        zIndex: 10001,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem'
                    }}
                    onClick={() => setShowUnitGuideModal(false)}
                >
                    <div
                        style={{
                            backgroundColor: 'white',
                            borderRadius: '18px',
                            maxWidth: '720px',
                            width: '100%',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            overflow: 'hidden',
                            animation: 'modalSlideUp 0.2s ease-out'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid #E5E7EB',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#F8FAFC'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    backgroundColor: '#EEF2FF',
                                    padding: '8px',
                                    borderRadius: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <BookOpen size={20} color="#4F46E5" />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#111827' }}>
                                        Guía de Unidades de Medida y Logística
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#6B7280' }}>
                                        ¿Qué sucede en el sistema según la unidad de compra seleccionada?
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowUnitGuideModal(false)}
                                style={{
                                    border: 'none',
                                    backgroundColor: '#F3F4F6',
                                    padding: '6px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    color: '#6B7280',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body Comparison */}
                        <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                            {/* Card Kg */}
                            <div style={{
                                backgroundColor: '#FFFBEB',
                                border: '2px solid #FCD34D',
                                borderRadius: '14px',
                                padding: '1.2rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ backgroundColor: '#FEF3C7', padding: '6px', borderRadius: '8px', color: '#D97706' }}>
                                        <Scale size={20} />
                                    </div>
                                    <span style={{ fontWeight: '900', fontSize: '1rem', color: '#B45309' }}>
                                        Kg (Por Peso / Granel)
                                    </span>
                                </div>

                                <div style={{ fontSize: '0.82rem', color: '#78350F', display: 'flex', flexDirection: 'column', gap: '8px', lineHeight: '1.45' }}>
                                    <div>
                                        <strong>🛒 Compras / Proveedor:</strong>
                                        <div style={{ color: '#92400E' }}>El insumo se compra, costea y factura por kilogramos (peso continuo).</div>
                                    </div>
                                    <div>
                                        <strong>📝 Captura de Pedidos:</strong>
                                        <div style={{ color: '#92400E' }}>Permite a los clientes u operadores ingresar <strong>decimales</strong> (ej. <code>0,5 kg</code>, <code>1,25 kg</code>).</div>
                                    </div>
                                    <div>
                                        <strong>🛡️ Cant. Mínima Venta (kg):</strong>
                                        <div style={{ color: '#92400E' }}>Por defecto <strong>0,1 kg</strong> (100g). Evita pedidos de $0 o microfracciones inviables. Si el producto tiene frutas indivisibles (ej. Mango Tommy de 550g), el sistema protegerá para que no se pida menos del peso de la fruta.</div>
                                    </div>
                                </div>
                            </div>

                            {/* Card Unidad */}
                            <div style={{
                                backgroundColor: '#EFF6FF',
                                border: '2px solid #93C5FD',
                                borderRadius: '14px',
                                padding: '1.2rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ backgroundColor: '#DBEAFE', padding: '6px', borderRadius: '8px', color: '#2563EB' }}>
                                        <Package size={20} />
                                    </div>
                                    <span style={{ fontWeight: '900', fontSize: '1rem', color: '#1D4ED8' }}>
                                        Unidad (Discreto / Presentación)
                                    </span>
                                </div>

                                <div style={{ fontSize: '0.82rem', color: '#1E3A8A', display: 'flex', flexDirection: 'column', gap: '8px', lineHeight: '1.45' }}>
                                    <div>
                                        <strong>📦 Compras / Proveedor:</strong>
                                        <div style={{ color: '#1E40AF' }}>El insumo se compra por conteo de piezas o empaques cerrados (bandejas, cajas, atados).</div>
                                    </div>
                                    <div>
                                        <strong>📝 Captura de Pedidos:</strong>
                                        <div style={{ color: '#1E40AF' }}>Exige <strong>números enteros estrictos</strong> (<code>1</code>, <code>2</code>, <code>3...</code>). Bloquea la entrada de decimales.</div>
                                    </div>
                                    <div>
                                        <strong>🚚 Peso Logístico (kg/und):</strong>
                                        <div style={{ color: '#1E40AF' }}>Peso físico estimado de 1 unidad (ej. <code>0,050 kg</code>). Se usa <strong>exclusivamente para cubicaje de camiones</strong> y cálculo de carga en despacho.</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            borderTop: '1px solid #E5E7EB',
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            justifyContent: 'flex-end'
                        }}>
                            <button
                                type="button"
                                onClick={() => setShowUnitGuideModal(false)}
                                style={{
                                    padding: '0.6rem 1.5rem',
                                    backgroundColor: '#111827',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '0.88rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
