'use client';

import { useState, useEffect } from 'react';
import { supabase, Product } from '@/lib/supabase';
import { diagnoseStorageError } from '@/lib/errorUtils';
import { REVERSE_CATEGORY_MAP } from '@/lib/constants';

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
        iva_rate: 19
    });

    const [options, setOptions] = useState<any[]>([]);
    const [variants, setVariants] = useState<any[]>([]);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
    }, []);

    // Ayudante para generar descripción técnica con usos y beneficios de salud
    const generateDescription = (name: string, category: string) => {
        if (!name) return '';
        const nameNorm = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        
        let usage = "consumo diario";
        let healthBenefit = "aliado para una dieta equilibrada y bienestar integral";

        if (category === 'Frutas') {
            usage = "ensaladas, postres y jugos frescos";
            healthBenefit = "fuente natural de vitaminas, antioxidantes y fibra que fortalece el sistema inmunológico";
        } else if (category === 'Verduras' || category === 'Hortalizas') {
            usage = "preparaciones gourmet, guisos y ensaladas";
            healthBenefit = "con alto contenido de minerales y clorofila que favorecen una digestión saludable";
        } else if (category === 'Tubérculos') {
            usage = "frituras, purés y bases de cocina";
            healthBenefit = "excelente fuente de energía duradera y carbohidratos complejos";
        } else if (category === 'Lácteos') {
            usage = "consumo directo y repostería";
            healthBenefit = "fuente de calcio y proteínas esenciales para el fortalecimiento óseo";
        }

        return `${nameNorm} de calidad premium seleccionada. Frescura garantizada desde el origen. Ideal para ${usage}. Este producto es una ${healthBenefit}.`;
    };

    const handleNameBlur = () => {
        if (!formData.name) return;
        
        // Sugerir SKU si hay ID
        if (!formData.sku && formData.accounting_id) {
            const suggestedSku = generateSKU(formData.category, formData.accounting_id);
            setFormData(prev => ({ ...prev, sku: suggestedSku }));
        }
        // Sugerir descripción si está vacía
        if (!formData.description) {
            const suggestedDesc = generateDescription(formData.name, formData.category);
            setFormData(prev => ({ ...prev, description: suggestedDesc }));
        }
    };

    // Actualizador inteligente de SKU y descripción al cambiar Categoría, Unidad o ID
    const handleMetadataChange = (field: 'category' | 'unit_of_measure' | 'accounting_id', value: string) => {
        setFormData(prev => {
            const currentSuggestedSku = generateSKU(prev.category, prev.accounting_id);
            const currentSuggestedDesc = generateDescription(prev.name, prev.category);
            
            const nextCategory = field === 'category' ? value : prev.category;
            const nextId = field === 'accounting_id' ? value : prev.accounting_id;
            
            const newSku = (prev.sku === currentSuggestedSku || !prev.sku) && nextId 
                ? generateSKU(nextCategory, nextId) 
                : prev.sku;
                
            const newDesc = (prev.description === currentSuggestedDesc || !prev.description)
                ? generateDescription(prev.name, nextCategory)
                : prev.description;
            
            return { ...prev, [field]: value, sku: newSku, description: newDesc };
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
                    iva_rate: formData.iva_rate
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
                padding: '2.5rem',
                borderRadius: '24px',
                width: '100%',
                maxWidth: '950px',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
            }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', borderBottom: '1px solid #eee', paddingBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '2.4rem', fontWeight: '900', color: '#111827' }}>✨ Nuevo SKU</h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '2.5rem', cursor: 'pointer', color: '#6B7280' }}>✕</button>
                </header>

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }}>

                        {/* COLUMNA IZQUIERDA: INFO GENERAL E IMAGEN */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--primary)', borderBottom: '2px solid #FEE2E2', paddingBottom: '0.5rem' }}>1. Información General</h3>

                            <div>
                                <label style={{ display: 'block', fontSize: '1rem', fontWeight: '700', marginBottom: '8px' }}>Nombre</label>
                                <input
                                    required
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    onBlur={handleNameBlur}
                                    placeholder="Nombre completo del producto"
                                    style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '1.1rem' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '1rem', fontWeight: '700', marginBottom: '8px' }}>Categoría</label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => handleMetadataChange('category', e.target.value)}
                                        style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '1.1rem', backgroundColor: '#F9FAFB', cursor: 'pointer' }}
                                    >
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '1rem', fontWeight: '700', marginBottom: '8px' }}>Presentación Base</label>
                                    <select
                                        value={formData.unit_of_measure}
                                        onChange={(e) => handleMetadataChange('unit_of_measure', e.target.value)}
                                        style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '1.1rem', backgroundColor: '#F9FAFB', cursor: 'pointer' }}
                                    >
                                        {baseUnits.map(unit => (
                                            <option key={unit} value={unit}>{unit}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '1rem', fontWeight: '700', marginBottom: '8px' }}>Descripción Técnica (Autogenerada)</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Detalles sobre maduración, origen, empaque..."
                                        style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '1rem', minHeight: '100px', fontFamily: 'inherit', backgroundColor: '#FDFDFD' }}
                                    />
                                </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1.2fr 80px', gap: '1rem', alignItems: 'end' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px' }}>ID</label>
                                            <input
                                                required
                                                type="number"
                                                value={formData.accounting_id}
                                                onChange={(e) => handleMetadataChange('accounting_id', e.target.value)}
                                                placeholder="123"
                                                style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '1.1rem', fontWeight: '700' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '1rem', fontWeight: '700', marginBottom: '8px' }}>SKU Código</label>
                                            <input
                                                required
                                                type="text"
                                                value={formData.sku}
                                                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                                placeholder="CC-00123"
                                                style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #2563EB', fontSize: '1.2rem', fontWeight: '800', color: '#1E40AF', backgroundColor: '#EFF6FF' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px' }}>IVA %</label>
                                            <select
                                                value={formData.iva_rate}
                                                onChange={(e) => setFormData({ ...formData, iva_rate: parseInt(e.target.value) })}
                                                style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '2px solid #10B981', fontSize: '1.1rem', fontWeight: '900', color: '#065F46', backgroundColor: '#ECFDF5', cursor: 'pointer' }}
                                            >
                                                <option value={19}>19</option>
                                                <option value={5}>5</option>
                                                <option value={0}>0</option>
                                                <option value={22}>22</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', alignItems: 'end' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '1rem', fontWeight: '700', marginBottom: '8px' }}>Peso Logístico (kg)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.weight_kg}
                                            onChange={(e) => setFormData({ ...formData, weight_kg: parseFloat(e.target.value) || 0 })}
                                            style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '1.3rem', fontWeight: '800' }}
                                        />
                                    </div>
                                </div>

                                <div style={{ 
                                    backgroundColor: '#F9FAFB', 
                                    padding: '1.2rem', 
                                    borderRadius: '16px', 
                                    border: '1px solid #E5E7EB',
                                    marginTop: '0.5rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <input 
                                            type="checkbox" 
                                            id="minPolicy"
                                            checked={formData.min_inventory_level > 0}
                                            onChange={(e) => setFormData({ ...formData, min_inventory_level: e.target.checked ? 10 : 0 })}
                                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                        <label htmlFor="minPolicy" style={{ fontSize: '1rem', fontWeight: '800', color: '#374151', cursor: 'pointer' }}>
                                            ¿Habilitar Política de Inventario Mínimo?
                                        </label>
                                    </div>
                                    
                                    {formData.min_inventory_level >= 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', opacity: formData.min_inventory_level > 0 ? 1 : 0.5 }}>
                                            <div style={{ flex: 1 }}>
                                                <p style={{ fontSize: '0.85rem', color: '#6B7280', marginBottom: '4px' }}>Nivel crítico de stock para alertas:</p>
                                                <input 
                                                    type="number"
                                                    disabled={formData.min_inventory_level === 0}
                                                    value={formData.min_inventory_level}
                                                    onChange={(e) => setFormData({ ...formData, min_inventory_level: parseInt(e.target.value) || 0 })}
                                                    style={{ 
                                                        width: '100%', 
                                                        padding: '0.8rem', 
                                                        borderRadius: '8px', 
                                                        border: '1px solid #D1D5DB', 
                                                        fontSize: '1.2rem', 
                                                        fontWeight: '900',
                                                        color: '#B91C1C'
                                                    }}
                                                />
                                            </div>
                                            <div style={{ fontSize: '1.5rem' }}>📉</div>
                                        </div>
                                    )}
                                </div>

                                <div style={{ 
                                    backgroundColor: '#EFF6FF', 
                                    padding: '1.2rem', 
                                    borderRadius: '16px', 
                                    border: '1px solid #BFDBFE',
                                    marginTop: '1rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                        <input 
                                            type="checkbox" 
                                            id="showOnWeb"
                                            checked={formData.show_on_web}
                                            onChange={(e) => setFormData({ ...formData, show_on_web: e.target.checked })}
                                            style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                                        />
                                        <label htmlFor="showOnWeb" style={{ fontSize: '1.1rem', fontWeight: '800', color: '#1E40AF', cursor: 'pointer' }}>
                                            🌐 Disponible para Página Web (Público)
                                        </label>
                                    </div>
                                    <p style={{ fontSize: '0.85rem', color: '#3B82F6', marginTop: '6px', marginLeft: '30px' }}>
                                        Si se apaga, el producto solo será visible en el panel administrativo.
                                    </p>
                                </div>
                            </div>

                            <div style={{ marginTop: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>Foto del Producto</label>
                                <div style={{
                                    border: '2px dashed #D1D5DB',
                                    borderRadius: '16px',
                                    padding: '1.5rem',
                                    textAlign: 'center',
                                    position: 'relative',
                                    backgroundColor: '#F9FAFB',
                                    minHeight: '200px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {previewUrl ? (
                                        <img src={previewUrl} alt="Preview" style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '12px', marginBottom: '1rem' }} />
                                    ) : (
                                        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📸</div>
                                    )}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            opacity: 0,
                                            cursor: 'pointer'
                                        }}
                                    />
                                    <p style={{ fontWeight: '600', color: '#4B5563' }}>{imageFile ? 'Cambiar imagen' : 'Haga clic o arrastre imagen de la tienda'}</p>
                                    <p style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>JPG, PNG o WebP (Max 5MB)</p>
                                </div>
                            </div>
                        </div>

                        {/* COLUMNA DERECHA: VARIANTES */}
                        <div style={{ borderLeft: '1px solid #eee', paddingLeft: '3rem' }}>
                            <h3 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#111827', borderBottom: '2px solid #E5E7EB', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>2. Configurar Variantes (Opcional)</h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                {options.map((opt, idx) => (
                                    <div key={idx} style={{ padding: '1.2rem', backgroundColor: '#F3F4F6', borderRadius: '12px', position: 'relative' }}>
                                        <button
                                            type="button"
                                            onClick={() => removeOption(idx)}
                                            style={{ position: 'absolute', right: '10px', top: '10px', border: 'none', background: 'none', color: '#EF4444', fontWeight: '800', cursor: 'pointer' }}
                                        >✕</button>

                                        {/* TIPO DE VARIACIÓN - DROPDOWN MAESTRO */}
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
                                                        const master = masterAttributes.find(a => a.name === val);
                                                        updateOption(idx, val, master?.values.join(', ') || '');
                                                    }
                                                }}
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #D1D5DB', fontWeight: '700', backgroundColor: 'white', color: '#1F2937', cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.8rem center', backgroundSize: '1.2em' }}
                                            >
                                                <option value="">-- Seleccionar --</option>
                                                {masterAttributes.map(attr => <option key={attr.name} value={attr.name}>{attr.name}</option>)}
                                                <option value="Personalizado">➕ Otra (Personalizada)...</option>
                                            </select>

                                            {(opt.name !== '' && !masterAttributes.some(a => a.name === opt.name)) && (
                                                <input
                                                    type="text"
                                                    placeholder="Nombre: ej. Calibre, Color..."
                                                    value={opt.name}
                                                    onChange={(e) => updateOption(idx, e.target.value, opt.values.join(', '))}
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '2px solid #3B82F6', fontWeight: '800', marginTop: '10px', outline: 'none' }}
                                                    autoFocus
                                                />
                                            )}
                                        </div>

                                        {/* VALORES - LISTA DE CHEQUEO O MANUAL */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', marginBottom: '6px' }}>
                                                VALORES POSIBLES
                                            </label>
                                            
                                            {masterAttributes.some(a => a.name === opt.name) ? (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #D1D5DB' }}>
                                                    {masterAttributes.find(a => a.name === opt.name)?.values.map(val => (
                                                        <label 
                                                            key={val} 
                                                            style={{ 
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                gap: '8px', 
                                                                fontSize: '0.9rem', 
                                                                cursor: 'pointer', 
                                                                padding: '6px 12px', 
                                                                backgroundColor: opt.values.includes(val) ? '#EFF6FF' : '#F9FAFB', 
                                                                borderRadius: '8px', 
                                                                transition: 'all 0.2s',
                                                                border: `1.5px solid ${opt.values.includes(val) ? '#3B82F6' : '#F3F4F6'}`,
                                                                color: opt.values.includes(val) ? '#1E40AF' : '#4B5563',
                                                                fontWeight: opt.values.includes(val) ? '800' : '500'
                                                            }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={opt.values.includes(val)}
                                                                onChange={(e) => {
                                                                    const newValues = e.target.checked
                                                                        ? [...opt.values, val]
                                                                        : opt.values.filter((v: string) => v !== val);
                                                                    updateOption(idx, opt.name, newValues.join(', '));
                                                                }}
                                                                style={{ width: '16px', height: '16px', accentColor: '#3B82F6' }}
                                                            />
                                                            {val}
                                                        </label>
                                                    ))}
                                                </div>
                                            ) : (
                                                <input
                                                    type="text"
                                                    placeholder="Verde, Pintón, Maduro"
                                                    value={opt.values.join(', ')}
                                                    onChange={(e) => updateOption(idx, opt.name, e.target.value)}
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '0.95rem', fontWeight: '600' }}
                                                />
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

                                {options.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={generateVariants}
                                        style={{ padding: '1rem', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', marginTop: '1rem' }}
                                    >
                                        🔄 Generar Combinaciones
                                    </button>
                                )}

                                {variants.length > 0 && (
                                    <div style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                                        <p style={{ fontWeight: '700', marginBottom: '1rem', color: '#059669' }}>✅ {variants.length} Combinaciones generadas</p>
                                        <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                                <thead style={{ backgroundColor: '#F9FAFB', position: 'sticky', top: 0 }}>
                                                    <tr>
                                                        <th style={{ padding: '8px', textAlign: 'left' }}>Variante</th>
                                                        <th style={{ padding: '8px', textAlign: 'left' }}>SKU Sugerido</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {variants.map((v, i) => (
                                                        <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                                            <td style={{ padding: '8px' }}>{Object.values(v.options).join(' / ')}</td>
                                                            <td style={{ padding: '8px', fontWeight: '800', color: '#2563EB' }}>
                                                                {v.sku}
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
                    </div>

                    <footer style={{ marginTop: '4rem', display: 'flex', justifyContent: 'flex-end', gap: '2rem', borderTop: '1px solid #eee', paddingTop: '2.5rem' }}>
                        <button type="button" onClick={onClose} style={{ padding: '1.2rem 3rem', background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '1.2rem', fontWeight: '600' }}>Descartar</button>
                        <button
                            type="submit"
                            disabled={loading || uploading}
                            style={{
                                padding: '1.2rem 5rem',
                                backgroundColor: 'var(--primary)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '14px',
                                fontWeight: '900',
                                cursor: 'pointer',
                                fontSize: '1.4rem',
                                boxShadow: '0 10px 25px rgba(239, 68, 68, 0.3)',
                                transition: 'all 0.3s transform'
                            }}
                        >
                            {loading || uploading ? '📦 Procesando...' : '🚀 Finalizar y Crear SKU'}
                        </button>
                    </footer>
                </form>
            </div>
        </div>
    );
}
