'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

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
        category: 'Frutas',
        unit_of_measure: 'Kg',
        weight_kg: 0.5,
        description: '',
        image_url: 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?auto=format&fit=crop&q=80&w=400',
        is_active: true,
        min_inventory_level: 0
    });

    const [options, setOptions] = useState<any[]>([]);
    const [variants, setVariants] = useState<any[]>([]);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // Mapeo técnico de unidades para evitar colisiones (Ej: Lb vs Lt)
    const unitMap: Record<string, { prefix: string, label: string }> = {
        'Kg': { prefix: 'K', label: 'kilogramo' },
        'G': { prefix: 'G', label: 'gramo' },
        'Lb': { prefix: 'A', label: 'libra' },
        'Lt': { prefix: 'L', label: 'litro' },
        'Un': { prefix: 'U', label: 'unidad' },
        'Atado': { prefix: 'T', label: 'atado' },
        'Bulto': { prefix: 'B', label: 'bulto' }
    };

    // Ayudante para generar SKU técnico basado en estándares
    const generateSKU = (name: string, category: string, unit: string) => {
        if (!name) return '';
        const catMap: Record<string, string> = {
            'Frutas': 'F', 'Hortalizas': 'H', 'Verduras': 'V', 'Tubérculos': 'T', 'Despensa': 'D', 'Lácteos': 'L'
        };
        const catPrefix = catMap[category] || 'X';
        
        // Extraer 3 consonantes representativas
        const consonantes = name.toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar tildes
            .replace(/[^BCDFGHJKLMNPQRSTVWXYZ]/g, ''); // Solo consonantes
        
        const namePart = consonantes.substring(0, 3).padEnd(3, 'X');
        const unitSuffix = unitMap[unit]?.prefix || 'U';
        
        return `${catPrefix}-${namePart}-${unitSuffix}`;
    };

    // Ayudante para generar descripción técnica equilibrada (B2B/B2C)
    const generateDescription = (name: string, category: string, unit: string) => {
        if (!name) return '';
        const nameNorm = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        const unitLong = unitMap[unit]?.label || 'unidad';
        
        let usage = "consumo diario";
        if (category === 'Frutas') usage = "ensaladas, postres y jugos frescos";
        if (category === 'Verduras' || category === 'Hortalizas') usage = "preparaciones gourmet, guisos y ensaladas";
        if (category === 'Tubérculos') usage = "frituras, purés y bases de cocina";
        if (category === 'Lácteos') usage = "consumo directo y repostería";

        return `${nameNorm} de calidad premium seleccionada. Frescura garantizada desde el origen. Ideal para ${usage}. Presentación técnica por ${unitLong}.`;
    };

    const handleNameBlur = () => {
        if (!formData.name) return;
        
        // Sugerir SKU si está vacío
        if (!formData.sku) {
            const suggestedSku = generateSKU(formData.name, formData.category, formData.unit_of_measure);
            setFormData(prev => ({ ...prev, sku: suggestedSku }));
        }
        // Sugerir descripción si está vacía
        if (!formData.description) {
            const suggestedDesc = generateDescription(formData.name, formData.category, formData.unit_of_measure);
            setFormData(prev => ({ ...prev, description: suggestedDesc }));
        }
    };

    // Actualizador inteligente de SKU y descripción al cambiar Categoría o Unidad
    const handleMetadataChange = (field: 'category' | 'unit_of_measure', value: string) => {
        setFormData(prev => {
            const currentSuggestedSku = generateSKU(prev.name, prev.category, prev.unit_of_measure);
            const currentSuggestedDesc = generateDescription(prev.name, prev.category, prev.unit_of_measure);
            
            const nextCategory = field === 'category' ? value : prev.category;
            const nextUnit = field === 'unit_of_measure' ? value : prev.unit_of_measure;
            
            const newSku = (prev.sku === currentSuggestedSku || !prev.sku) 
                ? generateSKU(prev.name, nextCategory, nextUnit) 
                : prev.sku;
                
            const newDesc = (prev.description === currentSuggestedDesc || !prev.description)
                ? generateDescription(prev.name, nextCategory, nextUnit)
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

            if (checkError) throw checkError;
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
                    variants: variants
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

                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', alignItems: 'end' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '1rem', fontWeight: '700', marginBottom: '8px' }}>SKU Código</label>
                                        <input
                                            required
                                            type="text"
                                            value={formData.sku}
                                            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                            placeholder="ABC-123"
                                            style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #2563EB', fontSize: '1.2rem', fontWeight: '800', color: '#1E40AF', backgroundColor: '#EFF6FF' }}
                                        />
                                    </div>
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

                                        <div style={{ marginBottom: '1rem' }}>
                                            <input
                                                type="text"
                                                placeholder="Ej: Madurez, Tamaño..."
                                                value={opt.name}
                                                onChange={(e) => updateOption(idx, e.target.value, opt.values.join(', '))}
                                                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontWeight: '600' }}
                                            />
                                        </div>
                                        <div>
                                            <input
                                                type="text"
                                                placeholder="Verde, Pintón, Maduro"
                                                value={opt.values.join(', ')}
                                                onChange={(e) => updateOption(idx, opt.name, e.target.value)}
                                                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.95rem' }}
                                            />
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
