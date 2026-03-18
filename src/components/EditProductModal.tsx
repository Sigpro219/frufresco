'use client';

import { useState, useEffect } from 'react';
import { supabase, Product } from '@/lib/supabase';
import { diagnoseStorageError } from '@/lib/errorUtils';

interface EditProductModalProps {
    product: Product;
    allProducts: Product[];
    onClose: () => void;
    onSave: () => void;
}

export default function EditProductModal({ product, allProducts, onClose, onSave }: EditProductModalProps) {
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [formData, setFormData] = useState<Product>({ 
        ...product,
        iva_rate: product.iva_rate ?? 19 
    });
    const [parentSearch, setParentSearch] = useState('');
    const [showParentResults, setShowParentResults] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(product.image_url);
    const [options, setOptions] = useState<any[]>(product.options_config || []);
    const [variants, setVariants] = useState<any[]>(product.variants || []);
    const [variantUploading, setVariantUploading] = useState<string | null>(null);

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
    const baseUnits = ['Kg', 'G', 'Lb', 'Lt', 'Un', 'Atado', 'Bulto', 'Caja', 'Saco', 'Cubeta'];

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
                    console.warn('EditModal: No master table found, using defaults.');
                    return;
                }
                if (data && data.length > 0) {
                    setMasterAttributes(data.map(attr => ({ name: attr.name, values: attr.suggested_values })));
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
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `master/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(filePath, imageFile);

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
    };

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

    const removeOption = (index: number) => {
        setOptions(options.filter((_, i) => i !== index));
    };

    const generateVariants = () => {
        if (options.length === 0) {
            if (confirm('¿Eliminar todas las combinaciones generadas?')) {
                setVariants([]);
            }
            return;
        }

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

        const newVariants = results.map((combination) => {
            const attrValues = Object.values(combination).map((v: any) => v.toString().substring(0, 1).toUpperCase()).join('');
            const variantSku = `${formData.sku}.${attrValues}`;

            // Intentar preservar datos si el SKU ya existía
            const existing = variants.find(v => v.sku === variantSku);

            return {
                id: existing?.id || `v-${Math.random().toString(36).substr(2, 9)}`,
                options: combination,
                sku: variantSku,
                price_adj_pct: existing?.price_adj_pct || 0,
                image_url: existing?.image_url || null,
                show_on_web: existing?.show_on_web !== false // Default to true if new or previously true
            };
        });

        setVariants(newVariants);
    };

    const updateVariantPrice = (id: string, price: number) => {
        setVariants(variants.map(v => v.id === id ? { ...v, price_adj_pct: price } : v));
    };

    const updateVariantVisibility = (id: string, visible: boolean) => {
        setVariants(variants.map(v => v.id === id ? { ...v, show_on_web: visible } : v));
    };

    const handleVariantImageUpload = async (variantId: string, file: File) => {
        setVariantUploading(variantId);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${variantId}-${Math.random()}.${fileExt}`;
            const filePath = `variants/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, file);

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
        setLoading(true);

        try {
            const uploadedImageUrl = await uploadImage();
            
            console.log('Guardando Producto:', {
                id: product.id,
                sku: formData.sku,
                options_count: options.length,
                variants_count: variants.length
            });

            const { error } = await supabase
                .from('products')
                .update({
                    name: formData.name,
                    sku: formData.sku,
                    category: formData.category,
                    unit_of_measure: formData.unit_of_measure,
                    description: formData.description,
                    min_inventory_level: formData.min_inventory_level,
                    is_active: formData.is_active,
                    image_url: uploadedImageUrl,
                    parent_id: formData.parent_id,
                    buying_team: formData.buying_team,
                    procurement_method: formData.procurement_method,
                    options_config: options,
                    options: options, // Para compatibilidad con versiones anteriores
                    variants: variants,
                    iva_rate: formData.iva_rate
                })
                .eq('id', product.id);

            if (error) throw error;

            console.info('✅ Producto actualizado correctamente');
            onSave();
            onClose();
        } catch (error: any) {
            alert('Error al actualizar producto: ' + error.message);
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
                width: '100%',
                maxWidth: '1100px',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
            }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', borderBottom: '1px solid #eee', paddingBottom: '1.5rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: '900', color: '#111827' }}>⚙️ Editar Maestro</h2>
                        <p style={{ fontSize: '0.9rem', color: '#6B7280', marginTop: '4px' }}>Actualizando SKU: {product.sku}</p>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '2rem', cursor: 'pointer', color: '#6B7280' }}>✕</button>
                </header>

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '3rem' }}>
                        
                        {/* COLUMNA IZQUIERDA: CONFIGURACIÓN BÁSICA */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', backgroundColor: '#F9FAFB', padding: '1rem', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
                        <div style={{ width: '100px', height: '100px', borderRadius: '12px', overflow: 'hidden', border: '2px solid #D1D5DB', position: 'relative', flexShrink: 0 }}>
                            {previewUrl ? (
                                <img src={previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>SKU Código</label>
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
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Comprador (Buying Team)</label>
                            <select
                                value={formData.buying_team || ''}
                                onChange={(e) => setFormData({ ...formData, buying_team: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem' }}
                            >
                                <option value="">Seleccionar equipo...</option>
                                {buyingTeams.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Gestión de Compras</label>
                            <select
                                value={formData.procurement_method || ''}
                                onChange={(e) => setFormData({ ...formData, procurement_method: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem' }}
                            >
                                <option value="">Seleccionar método...</option>
                                {procurementMethods.map(pm => <option key={pm} value={pm}>{pm}</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ position: 'relative' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Vincular a SKU Padre (Hijo de...)</label>
                        <input
                            type="text"
                            placeholder="Buscar padre por nombre o SKU..."
                            value={parentSearch || (formData.parent_id ? allProducts.find(p => p.id === formData.parent_id)?.sku : '')}
                            onChange={(e) => {
                                setParentSearch(e.target.value);
                                setShowParentResults(true);
                            }}
                            onFocus={() => setShowParentResults(true)}
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.95rem' }}
                        />
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
                                    .filter(p => p.id !== product.id && (p.name.toLowerCase().includes(parentSearch.toLowerCase()) || p.sku.toLowerCase().includes(parentSearch.toLowerCase())))
                                    .slice(0, 10)
                                    .map(p => (
                                        <div 
                                            key={p.id}
                                            onClick={() => {
                                                setFormData({ ...formData, parent_id: p.id });
                                                setParentSearch(p.sku);
                                                setShowParentResults(false);
                                            }}
                                            style={{ padding: '0.8rem', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', transition: 'background 0.2s' }}
                                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <div style={{ fontWeight: '800', color: '#2563EB' }}>{p.sku}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>{p.name}</div>
                                        </div>
                                    ))
                                }
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Unidad de Medida</label>
                            <select
                                value={formData.unit_of_measure}
                                onChange={(e) => setFormData({ ...formData, unit_of_measure: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '1rem', cursor: 'pointer' }}
                            >
                                {baseUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                            </select>
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
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Descripción Técnica</label>
                        <textarea
                            value={formData.description || ''}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={4}
                            style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '0.9rem', resize: 'none', fontFamily: 'inherit' }}
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
                        border: `1px solid ${(formData as any).show_on_web !== false ? '#BFDBFE' : '#D1D5DB'}`
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

                        </div>

                        {/* COLUMNA DERECHA: VARIANTES */}
                        <div style={{ borderLeft: '1px solid #eee', paddingLeft: '3rem' }}>
                            <h3 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#111827', borderBottom: '2px solid #E5E7EB', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>🧬 Variantes del SKU</h3>

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

                                {options.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={generateVariants}
                                        style={{ padding: '1rem', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', marginTop: '1rem' }}
                                    >
                                        🔄 Regenerar Combinaciones
                                    </button>
                                ) : variants.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={generateVariants}
                                        style={{ padding: '1rem', backgroundColor: '#EF4444', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', marginTop: '1rem' }}
                                    >
                                        🗑️ Borrar Combinaciones
                                    </button>
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
                                                        <tr key={v.id} style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.2s' }}>
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
                                                                        <img src={v.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                    </div>

                    <footer style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid #eee', paddingTop: '1.5rem' }}>
                        <button type="button" onClick={onClose} style={{ padding: '0.8rem 2rem', background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontWeight: '600' }}>Cancelar</button>
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
                    </footer>
                </form>
            </div>
        </div>
    );
}
