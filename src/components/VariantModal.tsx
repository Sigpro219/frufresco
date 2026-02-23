'use client';

import { useState } from 'react';
import { Product } from '@/lib/supabase';

interface Variant {
    id: string;
    options: Record<string, any>;
    sku: string;
    image_url: string | null;
    price_adjustment_percent: number;
    is_active?: boolean;
}

interface VariantModalProps {
    product: Product;
    onClose: () => void;
    onSave: (optionsConfig: any[] | null, variants: Variant[] | null) => Promise<boolean>;
    onUploadImage: (file: File) => Promise<string | null>;
    readOnly?: boolean;
}

export default function VariantModal({ product, onClose, onSave, onUploadImage, readOnly = false }: VariantModalProps) {
    const [options, setOptions] = useState<any[]>(product.options_config || []);
    const [variants, setVariants] = useState<Variant[]>(product.variants || []);
    const [isSaving, setIsSaving] = useState(false);
    const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);


    const handleUpload = async (id: string, file: File) => {
        const index = variants.findIndex(v => v.id === id);
        if (index === -1) return;
        
        setUploadingIndex(index);
        const url = await onUploadImage(file);
        if (url) {
            setVariants(prev => prev.map(v => 
                v.id === id ? { ...v, image_url: url } : v
            ));
        }
        setUploadingIndex(null);
    };

    const handleSave = async () => {
        setIsSaving(true);
        // Asegurarnos de usar el estado más fresco
        const success = await onSave(options, variants);
        setIsSaving(false);
        if (success) {
            onClose();
        }
    };

    const removeVariantImage = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('¿Quitar imagen de esta variante?')) {
            setVariants(prev => {
                const newVariants = [...prev];
                newVariants[index] = { ...newVariants[index], image_url: null };
                return newVariants;
            });
        }
    };

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

        // Preservar imágenes si la combinación ya existe
        const newVariants = results.map((combination) => {
            const attrValues = Object.values(combination).map((v: any) => v.toString().substring(0, 1).toUpperCase()).join('');
            const variantSku = `${product.sku}.${attrValues}`;

            // Buscar si ya existe una variante con estas mismas opciones para mantener su imagen e ID
            const existing = variants.find(v => 
                Object.keys(combination).every(k => v.options[k] === combination[k]) &&
                Object.keys(v.options).length === Object.keys(combination).length
            );

            return {
                id: existing?.id || `v-${Math.random().toString(36).substr(2, 9)}`,
                options: combination,
                sku: variantSku,
                image_url: existing?.image_url || null,
                price_adjustment_percent: existing?.price_adjustment_percent || 0,
                is_active: existing?.is_active ?? true
            };
        });

        setVariants(newVariants);
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: 'var(--radius-lg)',
                width: '100%',
                maxWidth: '1000px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '2rem',
                boxShadow: 'var(--shadow-xl)'
            }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: '800', margin: 0 }}>{readOnly ? product.name : `Configurar Variantes: ${product.name}`}</h2>
                        <span style={{ color: '#6B7280', fontWeight: '600' }}>SKU Maestro: {product.sku}</span>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '2rem', cursor: 'pointer' }}>✕</button>
                </header>

                {!readOnly && (
                    <section style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#F9FAFB', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.3rem', fontWeight: '800', margin: 0, color: '#111827' }}>1. Configurar Atributos</h3>
                            {options.length < 3 && (
                                <button 
                                    onClick={addOption}
                                    style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '2px dashed #3B82F6', color: '#1E40AF', fontWeight: '700', background: '#EFF6FF', cursor: 'pointer', fontSize: '0.9rem' }}
                                >
                                    + Añadir Atributo
                                </button>
                            )}
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {options.map((opt, idx) => (
                                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '200px 1fr 40px', gap: '1rem', alignItems: 'center', backgroundColor: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                                    <input
                                        type="text"
                                        placeholder="Ej: Madurez, Tamaño..."
                                        value={opt.name}
                                        onChange={(e) => updateOption(idx, e.target.value, opt.values.join(', '))}
                                        style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700' }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Verde, Pintón, Maduro (separado por comas)"
                                        value={opt.values.join(', ')}
                                        onChange={(e) => updateOption(idx, opt.name, e.target.value)}
                                        style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                                    />
                                    <button 
                                        onClick={() => removeOption(idx)}
                                        style={{ border: 'none', background: 'none', color: '#EF4444', fontSize: '1.2rem', cursor: 'pointer', fontWeight: '800' }}
                                    >✕</button>
                                </div>
                            ))}
                        </div>

                        {options.length > 0 && (
                            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                                <button 
                                    onClick={generateVariants}
                                    style={{ padding: '0.8rem 2rem', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                                >
                                    🔄 Regenerar Todas las Combinaciones
                                </button>
                            </div>
                        )}
                    </section>
                )}

                {variants.length > 0 && (
                    <section>
                        {!readOnly && <h3 style={{ fontSize: '1.4rem', fontWeight: '700', marginBottom: '1.5rem' }}>2. Gestionar Combinaciones (Hijos)</h3>}
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                                    <th style={{ padding: '1rem', fontSize: '1.1rem' }}>Foto</th>
                                    <th style={{ padding: '1rem', fontSize: '1.1rem' }}>Variante</th>
                                    <th style={{ padding: '1rem', fontSize: '1.1rem' }}>SKU</th>
                                    <th style={{ padding: '1rem', fontSize: '1.1rem', textAlign: 'center' }}>Ajuste Precio (%)</th>
                                    <th style={{ padding: '1rem', fontSize: '1.1rem', textAlign: 'center' }}>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {variants.map((v, idx) => (
                                    <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '1rem', width: '80px' }}>
                                            <div style={{ position: 'relative', width: '60px', height: '60px' }}>
                                                <label
                                                    htmlFor={readOnly ? undefined : `v-file-${idx}`}
                                                    style={{
                                                        width: '100%', height: '100%', borderRadius: '8px',
                                                        backgroundColor: '#F3F4F6', border: '1px dashed #D1D5DB',
                                                        cursor: readOnly ? 'default' : 'pointer', display: 'flex', alignItems: 'center',
                                                        justifyContent: 'center', overflow: 'hidden', position: 'relative', margin: 0
                                                    }}
                                                >
                                                    {uploadingIndex === idx ? (
                                                        <span style={{ fontSize: '1.5rem' }}>⏳</span>
                                                    ) : v.image_url ? (
                                                        <img src={v.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <span style={{ fontSize: '1.5rem', opacity: 0.5 }}>📷</span>
                                                    )}
                                                </label>
                                                {!readOnly && v.image_url && uploadingIndex === null && (
                                                    <button
                                                        onClick={(e) => removeVariantImage(idx, e)}
                                                        style={{
                                                            position: 'absolute', top: '-8px', right: '-8px',
                                                            backgroundColor: '#EF4444', color: 'white', border: 'none',
                                                            borderRadius: '50%', width: '20px', height: '20px',
                                                            fontSize: '12px', cursor: 'pointer'
                                                        }}
                                                    >✕</button>
                                                )}
                                                <input
                                                    id={`v-file-${idx}`}
                                                    type="file"
                                                    accept="image/*"
                                                    style={{ display: 'none' }}
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            e.target.value = '';
                                                            handleUpload(v.id, file);
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.2rem 1rem', fontWeight: '700', fontSize: '1.15rem' }}>
                                            {Object.values(v.options).join(' / ')}
                                        </td>
                                        <td style={{ padding: '1.2rem 1rem' }}>
                                            <span style={{ fontWeight: '800', color: '#1E40AF', fontSize: '1rem' }}>{v.sku}</span>
                                        </td>
                                        <td style={{ padding: '1.2rem 1rem', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}>
                                                <input 
                                                    type="number"
                                                    disabled={readOnly}
                                                    value={v.price_adjustment_percent || 0}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        setVariants(prev => prev.map(variant => 
                                                            variant.id === v.id ? { ...variant, price_adjustment_percent: isNaN(val) ? 0 : val } : variant
                                                        ));
                                                    }}
                                                    style={{ width: '70px', padding: '0.4rem', borderRadius: '6px', border: '1px solid #D1D5DB', textAlign: 'center', fontWeight: '800', color: (v.price_adjustment_percent || 0) > 0 ? '#059669' : (v.price_adjustment_percent || 0) < 0 ? '#DC2626' : '#111827', opacity: readOnly ? 0.7 : 1 }}
                                                />
                                                <span style={{ fontWeight: '800', color: '#6B7280' }}>%</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.2rem 1rem', textAlign: 'center' }}>
                                            <button 
                                                disabled={readOnly}
                                                onClick={() => {
                                                    setVariants(prev => prev.map(variant => 
                                                        variant.id === v.id ? { ...variant, is_active: !(variant.is_active ?? true) } : variant
                                                    ));
                                                }}
                                                style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'center',
                                                    gap: '0.4rem', 
                                                    background: (v.is_active ?? true) ? '#ECFDF5' : '#FEF2F2',
                                                    border: `1px solid ${(v.is_active ?? true) ? '#A7F3D0' : '#FECACA'}`,
                                                    padding: '5px 12px',
                                                    borderRadius: '20px',
                                                    cursor: readOnly ? 'default' : 'pointer',
                                                    width: 'fit-content',
                                                    margin: '0 auto',
                                                    opacity: readOnly ? 0.7 : 1
                                                }}
                                            >
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: (v.is_active ?? true) ? '#10B981' : '#EF4444' }}></div>
                                                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: (v.is_active ?? true) ? '#065F46' : '#991B1B' }}>
                                                    {(v.is_active ?? true) ? 'ACTIVO' : 'INACTIVO'}
                                                </span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                )}

                <footer style={{ marginTop: '3rem', display: 'flex', justifyContent: 'flex-end', gap: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '2.5rem' }}>
                    <button onClick={onClose} style={{ padding: '1rem 2rem', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '1.1rem', fontWeight: '600' }}>{readOnly ? 'Cerrar' : 'Cancelar'}</button>
                    {!readOnly && (
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            style={{ padding: '1rem 3rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', fontSize: '1.2rem' }}
                        >
                            {isSaving ? 'Guardando...' : 'Guardar SKU y Variantes'}
                        </button>
                    )}
                </footer>
            </div>
        </div>
    );
}
