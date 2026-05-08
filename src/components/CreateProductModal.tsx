'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { supabase, Product } from '@/lib/supabase';
import { diagnoseStorageError } from '@/lib/errorUtils';
import { REVERSE_CATEGORY_MAP } from '@/lib/constants';
import { Wand2, Sparkles, Loader2 } from 'lucide-react';

interface CreateProductModalProps {
    onClose: () => void;
    onSave: () => void;
}

export default function CreateProductModal({ onClose, onSave }: CreateProductModalProps) {
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        sku: '',
        accounting_id: '',
        category: 'Frutas',
        unit_of_measure: 'Kg',
        weight_kg: 0.5,
        description: '',
        image_url: '',
        is_active: true,
        show_on_web: true,
        min_inventory_level: 0,
        iva_rate: 19,
        display_name: '',
        web_unit: 'Kg',
        web_conversion_factor: 1.0,
        name_en: '',
        description_en: '',
        buying_team: '',
        procurement_method: 'Compras Generales',
        inventory_group: '',
        purchase_sublist: '',
        tags: [] as string[],
        parent_id: null as string | null,
        utility_deviation_pct: 0,
        inherit_price: false
    });
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [parentSearch, setParentSearch] = useState('');
    const [showParentResults, setShowParentResults] = useState(false);

    const [generatingAI, setGeneratingAI] = useState(false);
    const [tagInput, setTagInput] = useState('');
    const [inventoryGroups, setInventoryGroups] = useState<string[]>([]);
    const [purchaseSublists, setPurchaseSublists] = useState<string[]>([]);

    const [options, setOptions] = useState<any[]>([]);
    const [variants, setVariants] = useState<any[]>([]);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [conversionFactorInput, setConversionFactorInput] = useState('1,0');

    // Mapeo técnico de unidades para evitar colisiones (Ej: Lb vs Lt)

    // Ayudante para generar SKU técnico basado en estándares (CATEGORIA-ID)
    const generateSKU = (category: string, id: string | number) => {
        const catPrefix = REVERSE_CATEGORY_MAP[category] || 'DE';
        const cleanId = id.toString().padStart(5, '0');
        return `${catPrefix}-${cleanId}`;
    };

    const INITIAL_ATTRIBUTES = [
        { name: 'Madurez', values: ['Verde', 'Pintón', 'Maduro', 'Sobremaduro'] },
        { name: 'Tamaño', values: ['Pequeño', 'Mediano', 'Grande', 'Extra Grande'] },
        { name: 'Calidad', values: ['Primera (Extra)', 'Segunda (Estándar)', 'Industrial'] },
        { name: 'Presentación', values: ['Granel', 'Empacado', 'Malla', 'Caja'] },
        { name: 'Corte', values: ['Entero', 'Picado', 'Troceado', 'Pelado'] },
        { name: 'Proceso', values: ['Lavado', 'Sucio', 'Cepillado'] }
    ];

    const [masterAttributes, setMasterAttributes] = useState(INITIAL_ATTRIBUTES);

    useEffect(() => {
        const fetchMaster = async () => {
            try {
                const { data, error } = await supabase.from('product_attributes_master').select('*').order('name');
                if (error) {
                    console.warn('CreateModal: No master table found, using defaults.');
                    return;
                }
                if (data && data.length > 0) {
                    setMasterAttributes(data.map(attr => ({ name: attr.name, values: attr.suggested_values })));
                }
            } catch (err) {
                console.warn('CreateModal: Error fetching master attributes.');
            }
        };
        fetchMaster();

        const fetchNextId = async () => {
            const { data } = await supabase
                .from('products')
                .select('accounting_id')
                .order('accounting_id', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            if (data && data.accounting_id) {
                const nextId = (parseInt(data.accounting_id) + 1).toString();
                setFormData(prev => {
                    const suggestedSku = generateSKU(prev.category, nextId);
                    return { ...prev, accounting_id: nextId, sku: suggestedSku };
                });
            }
        };
        fetchNextId();

        const fetchAllProducts = async () => {
            const { data } = await supabase.from('products').select('*').order('sku');
            if (data) setAllProducts(data);
        };
        fetchAllProducts();
    }, []);

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

    const handleNameBlur = () => {
        if (!formData.name) return;
        
        // Sugerir SKU si hay ID
        if (!formData.sku && formData.accounting_id) {
            const suggestedSku = generateSKU(formData.category, formData.accounting_id);
            setFormData(prev => ({ ...prev, sku: suggestedSku }));
        }
    };

    // Actualizador inteligente de SKU y descripción al cambiar Categoría, Unidad o ID
    const handleMetadataChange = (field: 'category' | 'unit_of_measure' | 'accounting_id', value: string) => {
        setFormData(prev => {
            const currentSuggestedSku = generateSKU(prev.category, prev.accounting_id);
            
            const nextCategory = field === 'category' ? value : prev.category;
            const nextId = field === 'accounting_id' ? value : prev.accounting_id;
            
            const newSku = (prev.sku === currentSuggestedSku || !prev.sku) && nextId 
                ? generateSKU(nextCategory, nextId) 
                : prev.sku;
            
            return { ...prev, [field]: value, sku: newSku };
        });
    };

    const categories = ['Frutas', 'Hortalizas', 'Verduras', 'Tubérculos', 'Despensa', 'Lácteos'];
    const baseUnits = ['Kg', 'G', 'Lb', 'Lt', 'Un', 'Atado', 'Bulto'];

    // LÓGICA DE VARIANTES (Replicada de VariantModal)
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

    const removeOption = (index: number) => {
        setOptions(options.filter((_, i) => i !== index));
    };

    const generateVariants = () => {
        if (options.length === 0) return;

        let results: any[] = [{}];
        options.forEach(opt => {
            const temp: any[] = [];
            results.forEach(res => {
                opt.values.forEach((val: string) => {
                    temp.push({ ...res, [opt.name]: val });
                });
            });
            results = temp;
        });

        const newVariants = results.map((combination, idx) => {
            // Lógica de sufijo inteligente para variantes (Hijos)
            const attrValues = Object.values(combination).map((v: any) => v.toString().substring(0, 1).toUpperCase()).join('');
            const variantSku = `${formData.sku}.${attrValues}`;

            return {
                id: `v-${Math.random().toString(36).substr(2, 9)}`,
                options: combination,
                sku: variantSku
            };
        });

        setVariants(newVariants);
    };

    // LÓGICA DE CARGA DE IMAGEN
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
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError, data } = await supabase.storage
            .from('product-images')
            .upload(filePath, imageFile);

        if (uploadError) {
            diagnoseStorageError(uploadError, 'product-images');
            alert('Error subiendo imagen: ' + uploadError.message);
            setUploading(false);
            return formData.image_url;
        }

        const { data: { publicUrl } } = supabase.storage
            .from('product-images')
            .getPublicUrl(filePath);

        setUploading(false);
        return publicUrl;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // 1. Verificación de SKU duplicado antes de procesar imagen
            const { data: existing, error: checkError } = await supabase
                .from('products')
                .select('sku')
                .eq('sku', formData.sku)
                .maybeSingle();

            if (checkError) {
                diagnoseStorageError(checkError, 'products'); // Assuming 'products' is the bucket/table context
                throw checkError;
            }
            if (existing) {
                alert(`Error: El SKU "${formData.sku}" ya está registrado en el sistema.`);
                setLoading(false);
                return;
            }

            const uploadedImageUrl = await uploadImage();

            const { data: newProduct, error } = await supabase
                .from('products')
                .insert([{
                    ...formData,
                    image_url: uploadedImageUrl,
                    options_config: options,
                    variants: variants,
                    iva_rate: formData.iva_rate,
                    name_en: formData.name_en,
                    description_en: formData.description_en,
                    tags: formData.tags,
                    parent_id: formData.parent_id,
                    utility_deviation_pct: formData.utility_deviation_pct,
                    inherit_price: formData.inherit_price
                }])
                .select()
                .single();

            if (error) throw error;

            // 2. Sincronizar tabla dedicada de variantes
            if (newProduct && variants && variants.length > 0) {
                const formattedVariants = variants.map(v => ({
                    product_id: newProduct.id,
                    sku: v.sku,
                    options: v.options,
                    image_url: v.image_url || null,
                    price_adjustment_percent: v.price_adjustment_percent || 0,
                    is_active: true
                }));

                const { error: variantError } = await supabase
                    .from('product_variants')
                    .insert(formattedVariants);

                if (variantError) console.error("Error al guardar variantes iniciales:", variantError);
            }

            onSave();
            onClose();
        } catch (error: any) {
            alert('Error al crear producto: ' + error.message);
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
            zIndex: 1000,
            backdropFilter: 'blur(8px)',
            padding: '2rem'
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '1.5rem 2rem',
                borderRadius: '20px',
                width: '100%',
                maxWidth: '1100px',
                maxHeight: '95vh',
                overflowY: 'auto',
                boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
                border: '1px solid #E5E7EB'
            }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.8rem' }}>
                    <h2 style={{ fontSize: '1.6rem', fontWeight: '900', color: '#111827', margin: 0 }}>✨ Nuevo SKU Maestro</h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.8rem', cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 }}>✕</button>
                </header>

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }}>
                        {/* COLUMNA IZQUIERDA: INFO GENERAL E IMAGEN */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '4px solid var(--primary)', paddingLeft: '10px', marginBottom: '0.5rem' }}>1. Datos del Producto</h3>

                            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.8rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', marginBottom: '4px' }}>Nombre del Producto</label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        onBlur={handleNameBlur}
                                        placeholder="Ej: Manzana Gala Selección"
                                        style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '0.95rem', fontWeight: '600' }}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', marginBottom: '4px' }}>ID</label>
                                        <input
                                            required
                                            type="number"
                                            value={formData.accounting_id}
                                            onChange={(e) => handleMetadataChange('accounting_id', e.target.value)}
                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '0.95rem', fontWeight: '800', textAlign: 'center', backgroundColor: '#F9FAFB' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', marginBottom: '4px' }}>IVA %</label>
                                        <select
                                            value={formData.iva_rate}
                                            onChange={(e) => setFormData({ ...formData, iva_rate: parseInt(e.target.value) })}
                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: '1px solid #10B981', fontSize: '0.95rem', fontWeight: '800', color: '#065F46', backgroundColor: '#ECFDF5' }}
                                        >
                                            <option value={19}>19</option>
                                            <option value={5}>5</option>
                                            <option value={0}>0</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', marginBottom: '4px' }}>Categoría</label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => handleMetadataChange('category', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '0.9rem', fontWeight: '600' }}
                                    >
                                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', marginBottom: '4px' }}>Unidad Base</label>
                                    <select
                                        value={formData.unit_of_measure}
                                        onChange={(e) => handleMetadataChange('unit_of_measure', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '0.9rem', fontWeight: '600' }}
                                    >
                                        {baseUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', marginBottom: '4px' }}>Peso Log. (kg)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={formData.weight_kg}
                                        onChange={(e) => setFormData({ ...formData, weight_kg: parseFloat(e.target.value) || 0 })}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '0.9rem', fontWeight: '700' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '0.8rem', backgroundColor: '#F9FAFB', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#3B82F6', marginBottom: '4px' }}>SKU Código Sugerido</label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.sku}
                                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #2563EB', fontSize: '1rem', fontWeight: '900', color: '#1E40AF', backgroundColor: '#EFF6FF' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', marginBottom: '4px' }}>Inventario Mínimo</label>
                                    <input 
                                        type="number"
                                        value={formData.min_inventory_level}
                                        onChange={(e) => setFormData({ ...formData, min_inventory_level: parseInt(e.target.value) || 0 })}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.95rem', fontWeight: '800', color: '#B91C1C' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', borderTop: '1px dashed #E5E7EB', paddingTop: '0.8rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', marginBottom: '4px' }}>Comprador (Equipo)</label>
                                    <select
                                        value={formData.buying_team}
                                        onChange={(e) => setFormData({ ...formData, buying_team: e.target.value })}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.8rem', fontWeight: '700' }}
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
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', marginBottom: '4px' }}>Gestión de Compras</label>
                                    <select
                                        value={formData.procurement_method}
                                        onChange={(e) => setFormData({ ...formData, procurement_method: e.target.value })}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.8rem', fontWeight: '700' }}
                                    >
                                        <option value="">Seleccionar método...</option>
                                        <option value="Compras Generales">Compras Generales</option>
                                        <option value="Compras Menores">Compras Menores</option>
                                        <option value="Compras Noche">Compras Noche</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                <div>
                                    <select
                                        value={formData.inventory_group}
                                        onChange={(e) => setFormData({ ...formData, inventory_group: e.target.value })}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.8rem', fontWeight: '700' }}
                                    >
                                        <option value="">Seleccionar grupo...</option>
                                        <option value="INVENTARIO DE ABARROTES, FRUTOS SECOS, LACTEOS Y CARNES FRIAS">INVENTARIO DE ABARROTES, FRUTOS SECOS, LACTEOS Y CARNES FRIAS</option>
                                        <option value="INVENTARIO DE FRUTAS Y OTROS">INVENTARIO DE FRUTAS Y OTROS</option>
                                        <option value="INVENTARIO DE HORTALIZAS">INVENTARIO DE HORTALIZAS</option>
                                        <option value="INVENTARIO DE PAPAS, PLATANO, TOMATE Y AGUACATES">INVENTARIO DE PAPAS, PLATANO, TOMATE Y AGUACATES</option>
                                        <option value="INVENTARIO DE VERDURAS">INVENTARIO DE VERDURAS</option>
                                    </select>
                                </div>
                                <div>
                                    <select
                                        value={formData.purchase_sublist}
                                        onChange={(e) => setFormData({ ...formData, purchase_sublist: e.target.value })}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.8rem', fontWeight: '700' }}
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

                            {/* VINCULACIÓN A PADRE (NUEVO) */}
                            <div style={{ position: 'relative' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', marginBottom: '4px' }}>Vincular a SKU Padre (Opcional)</label>
                                <input
                                    type="text"
                                    placeholder="Buscar padre por nombre o SKU..."
                                    value={parentSearch || (formData.parent_id ? (() => {
                                        const p = allProducts.find(i => i.id === formData.parent_id);
                                        return p ? `${p.sku} - ${p.name}` : '';
                                    })() : '')}
                                    onChange={(e) => {
                                        setParentSearch(e.target.value);
                                        setShowParentResults(true);
                                    }}
                                    onFocus={() => setShowParentResults(true)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '0.9rem', fontWeight: 'bold', color: formData.parent_id ? '#2563EB' : 'inherit' }}
                                />
                                {showParentResults && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #D1D5DB', borderRadius: '10px', marginTop: '4px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '200px', overflowY: 'auto' }}>
                                        <div 
                                            onClick={() => {
                                                setFormData({ ...formData, parent_id: null });
                                                setParentSearch('');
                                                setShowParentResults(false);
                                            }}
                                            style={{ padding: '0.6rem', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', color: '#EF4444', fontWeight: '800', fontSize: '0.8rem' }}
                                        >
                                            ❌ Ninguno (Producto Independiente)
                                        </div>
                                        {allProducts
                                            .filter(p => p.name.toLowerCase().includes(parentSearch.toLowerCase()) || p.sku.toLowerCase().includes(parentSearch.toLowerCase()))
                                            .slice(0, 10)
                                            .map(p => (
                                                <div 
                                                    key={p.id}
                                                    onClick={() => {
                                                        setFormData({ ...formData, parent_id: p.id });
                                                        setParentSearch(p.sku);
                                                        setShowParentResults(false);
                                                    }}
                                                    style={{ padding: '0.6rem', borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }}
                                                >
                                                    <div style={{ fontWeight: '800', color: '#2563EB', fontSize: '0.85rem' }}>{p.sku}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>{p.name}</div>
                                                </div>
                                            ))
                                        }
                                    </div>
                                )}
                            </div>

                            {/* CONFIGURACIÓN FRACCIONADO (NUEVO) */}
                            {formData.parent_id && (
                                <div style={{ padding: '1rem', backgroundColor: '#EFF6FF', borderRadius: '14px', border: '1px solid #BFDBFE', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1E40AF', fontWeight: '800', fontSize: '0.75rem' }}>
                                            <span>📊 HIJO FRACCIONADO</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.65rem', fontWeight: '800', color: formData.inherit_price ? '#2563EB' : '#6B7280' }}>
                                                {formData.inherit_price ? 'HEREDAR PRECIO' : 'PRECIO INDEPENDIENTE'}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, inherit_price: !formData.inherit_price })}
                                                style={{ width: '36px', height: '18px', borderRadius: '9px', backgroundColor: formData.inherit_price ? '#2563EB' : '#D1D5DB', border: 'none', position: 'relative', cursor: 'pointer', transition: '0.2s' }}
                                            >
                                                <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '2px', left: formData.inherit_price ? '20px' : '2px', transition: '0.2s' }} />
                                            </button>
                                        </div>
                                    </div>
                                    {formData.inherit_price && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: '900', color: '#1E40AF', marginBottom: '2px' }}>Ajuste Utilidad %</label>
                                                <input 
                                                    type="number"
                                                    value={formData.utility_deviation_pct}
                                                    onChange={(e) => setFormData({ ...formData, utility_deviation_pct: parseFloat(e.target.value) || 0 })}
                                                    style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid #2563EB', fontWeight: '900', textAlign: 'center' }}
                                                />
                                            </div>
                                            <div style={{ flex: 1, textAlign: 'right', fontSize: '0.65rem', color: '#1E40AF' }}>
                                                Heredará del padre <br />
                                                <strong>{allProducts.find(p => p.id === formData.parent_id)?.sku}</strong>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#6B7280' }}>Descripción ES/EN + IA</label>
                                    <button
                                        type="button"
                                        onClick={handleGenerateAI}
                                        disabled={generatingAI}
                                        style={{ padding: '3px 8px', borderRadius: '6px', border: 'none', backgroundColor: '#EEF2FF', color: '#4F46E5', fontSize: '0.65rem', fontWeight: '800', cursor: 'pointer' }}
                                    >
                                        {generatingAI ? '...' : '✨ IA'}
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Español..."
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.8rem', minHeight: '60px' }}
                                    />
                                    <textarea
                                        value={formData.description_en}
                                        onChange={(e) => setFormData({ ...formData, description_en: e.target.value })}
                                        placeholder="English..."
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '0.8rem', minHeight: '60px', backgroundColor: '#F9FAFB' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                                <div style={{ backgroundColor: '#FFF7ED', padding: '0.8rem', borderRadius: '12px', border: '1px solid #FFEDD5' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                        <input type="checkbox" checked={formData.show_on_web} onChange={(e) => setFormData({ ...formData, show_on_web: e.target.checked })} style={{ width: '16px', height: '16px' }} />
                                        <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#9A3412' }}>Configuración Web B2C (Público)</label>
                                    </div>
                                    <p style={{ fontSize: '0.7rem', color: '#C2410C', marginBottom: '10px', lineHeight: 1.3 }}>
                                        Si está activo, el producto se publicará en la tienda. Define el nombre público, la unidad de venta (ej. Atado) y su peso en kg (ej. 0.25) para descargar correctamente el inventario logístico.
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <input
                                            type="text"
                                            placeholder="Nombre Público (Web)"
                                            value={formData.display_name}
                                            onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #FFD8A8', fontSize: '0.85rem' }}
                                        />
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            <select
                                                value={formData.web_unit}
                                                onChange={(e) => setFormData({ ...formData, web_unit: e.target.value })}
                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #FFD8A8', fontSize: '0.8rem', fontWeight: '700' }}
                                            >
                                                <option value="">Unidad Web...</option>
                                                {baseUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                                            </select>
                                            <input
                                                type="text"
                                                placeholder="Factor (kg)"
                                                value={conversionFactorInput}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (/^[0-9,.]*$/.test(val)) {
                                                        setConversionFactorInput(val);
                                                        const normalized = val.replace(',', '.');
                                                        if (!isNaN(parseFloat(normalized))) {
                                                            setFormData({ ...formData, web_conversion_factor: parseFloat(normalized) });
                                                        }
                                                    }
                                                }}
                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #FFD8A8', fontSize: '0.8rem', fontWeight: '700', textAlign: 'center' }}
                                            />
                                        </div>
                                        <div style={{ marginTop: '1rem' }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#9A3412', marginBottom: '4px' }}>Etiquetas (Tags) - Búsqueda Web</label>
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
                                                {formData.tags.map((tag, idx) => (
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
                                                            onClick={() => setFormData({ ...formData, tags: formData.tags.filter((_, i) => i !== idx) })}
                                                            style={{ background: 'none', border: 'none', color: '#EA580C', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                ))}
                                                <input
                                                    type="text"
                                                    placeholder={formData.tags.length === 0 ? "Ej: organico, oferta, temporada..." : "Agregar tag..."}
                                                    value={tagInput}
                                                    onChange={(e) => setTagInput(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ',') {
                                                            e.preventDefault();
                                                            const newTag = tagInput.trim().toLowerCase();
                                                            if (newTag && !formData.tags.includes(newTag)) {
                                                                setFormData({ ...formData, tags: [...formData.tags, newTag] });
                                                                setTagInput('');
                                                            }
                                                        } else if (e.key === 'Backspace' && tagInput === '' && formData.tags.length > 0) {
                                                            setFormData({ ...formData, tags: formData.tags.slice(0, -1) });
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
                                            <p style={{ fontSize: '0.7rem', color: '#7C2D12', marginTop: '4px' }}>Presiona <strong>Enter</strong> o <strong>Coma (,)</strong> para añadir la etiqueta.</p>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ marginTop: '0.5rem', position: 'relative' }}>
                                    <div style={{ border: '2px dashed #D1D5DB', borderRadius: '12px', padding: '0.5rem', textAlign: 'center', backgroundColor: '#F9FAFB', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {previewUrl ? (
                                            <Image src={previewUrl} alt="" width={80} height={80} style={{ height: '70px', width: 'auto', borderRadius: '8px' }} />
                                        ) : (
                                            <span style={{ fontSize: '1.5rem' }}>📸</span>
                                        )}
                                        <input type="file" accept="image/*" onChange={handleFileChange} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* COLUMNA DERECHA: VARIANTES */}
                        <div style={{ borderLeft: '1px solid #f3f4f6', paddingLeft: '2rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '4px solid #111827', paddingLeft: '10px', marginBottom: '1rem' }}>2. Configurar Variantes</h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                {options.map((opt, idx) => (
                                    <div key={idx} style={{ padding: '0.8rem', backgroundColor: '#F3F4F6', borderRadius: '10px', position: 'relative' }}>
                                        <button type="button" onClick={() => removeOption(idx)} style={{ position: 'absolute', right: '8px', top: '8px', border: 'none', background: 'none', color: '#EF4444', fontWeight: '900', cursor: 'pointer' }}>✕</button>
                                        
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '0.5rem' }}>
                                            <select
                                                value={masterAttributes.some(a => a.name === opt.name) ? opt.name : (opt.name ? 'Personalizado' : '')}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === 'Personalizado') updateOption(idx, '', '');
                                                    else {
                                                        const master = masterAttributes.find(a => a.name === val);
                                                        updateOption(idx, val, master?.values.join(', ') || '');
                                                    }
                                                }}
                                                style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.75rem', fontWeight: '700' }}
                                            >
                                                <option value="">-- Variable --</option>
                                                {masterAttributes.map(attr => <option key={attr.name} value={attr.name}>{attr.name}</option>)}
                                                <option value="Personalizado">+ Otra...</option>
                                            </select>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {opt.values.slice(0, 4).map(v => <span key={v} style={{ fontSize: '0.65rem', padding: '2px 6px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #E5E7EB' }}>{v}</span>)}
                                                {opt.values.length > 4 && <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>+{opt.values.length - 4}</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {options.length < 3 && (
                                    <button type="button" onClick={addOption} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px dashed #D1D5DB', color: '#6B7280', fontSize: '0.75rem', fontWeight: '700', background: 'none', cursor: 'pointer' }}>+ Añadir Variable</button>
                                )}

                                {options.length > 0 && (
                                    <button type="button" onClick={generateVariants} style={{ padding: '0.6rem', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '0.8rem' }}>🔄 Combinar</button>
                                )}

                                {variants.length > 0 && (
                                    <div style={{ marginTop: '0.5rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid #f3f4f6', borderRadius: '8px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                            <thead style={{ backgroundColor: '#F9FAFB', position: 'sticky', top: 0 }}>
                                                <tr>
                                                    <th style={{ padding: '4px 8px', textAlign: 'left' }}>Variante</th>
                                                    <th style={{ padding: '4px 8px', textAlign: 'left' }}>SKU</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {variants.map((v, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                        <td style={{ padding: '4px 8px' }}>{Object.values(v.options).join('/')}</td>
                                                        <td style={{ padding: '4px 8px', fontWeight: '800', color: '#2563EB' }}>{v.sku}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <footer style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ padding: '0.6rem 1.5rem', background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600' }}>Cancelar</button>
                        <button
                            type="submit"
                            disabled={loading || uploading}
                            style={{
                                padding: '0.6rem 2.5rem',
                                backgroundColor: 'var(--primary)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '10px',
                                fontWeight: '900',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
                            }}
                        >
                            {loading || uploading ? '...' : '🚀 Crear SKU Maestro'}
                        </button>
                    </footer>
                </form>
            </div>
        </div>
    );
}
