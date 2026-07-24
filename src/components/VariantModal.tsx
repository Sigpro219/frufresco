'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Product, supabase } from '@/lib/supabase';

interface Variant {
    id: string;
    options: Record<string, any>;
    sku: string;
    image_url: string | null;
    price_adjustment_percent: number;
    is_active?: boolean;
    show_on_web?: boolean;
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
    const [variants, setVariants] = useState<Variant[]>(() => {
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
    const [isSaving, setIsSaving] = useState(false);
    const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
    const [masterAttributes, setMasterAttributes] = useState<any[]>([]);
    const [showCustomInput, setShowCustomInput] = useState<Record<number, boolean>>({});

    useEffect(() => {
        async function fetchMasterAttributes() {
            try {
                const { data, error } = await supabase
                    .from('product_attributes_master')
                    .select('*')
                    .order('name', { ascending: true });
                if (!error && data) {
                    setMasterAttributes(data);
                }
            } catch (err) {
                console.error('Error fetching master attributes:', err);
            }
        }
        fetchMasterAttributes();
    }, []);

    const prevLengthRef = useRef(options.length);

    useEffect(() => {
        // Focus the first input or the add button when the modal mounts
        setTimeout(() => {
            const firstInput = document.getElementById('attr-name-0') || 
                               document.getElementById('attr-values-0') || 
                               document.getElementById('btn-add-attribute');
            if (firstInput) {
                firstInput.focus();
                if ((firstInput as any).select) (firstInput as any).select();
            }
        }, 100);
    }, []);

    useEffect(() => {
        if (options.length > prevLengthRef.current) {
            const newIndex = options.length - 1;
            setTimeout(() => {
                const newInput = document.getElementById(`attr-name-${newIndex}`);
                if (newInput) {
                    newInput.focus();
                    if ((newInput as any).select) (newInput as any).select();
                }
            }, 50);
        }
        prevLengthRef.current = options.length;
    }, [options.length]);

    useEffect(() => {
        if (readOnly) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === '+' || e.key === 'Add') {
                e.preventDefault();
                addOption();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [options, readOnly]);


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
        // Map options to include show_on_web from masterAttributes
        const mappedOptions = options.map(opt => {
            const master = masterAttributes.find(m => m.name === opt.name);
            return {
                name: opt.name,
                values: opt.values,
                show_on_web: master ? master.show_on_web !== false : true
            };
        });
        const success = await onSave(mappedOptions, variants);
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
        const newOptions = options.filter((_, i) => i !== index);
        setOptions(newOptions);
        // Si ya no quedan opciones, las variantes deben limpiarse automáticamente
        if (newOptions.length === 0) {
            setVariants([]);
        }
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
        const usedIds = new Set<string>();
        const newVariants = results.map((combination, idx) => {
            const attrValues = Object.values(combination).map((v: any) => v.toString().substring(0, 1).toUpperCase()).join('');
            const variantSku = `${product.sku}.${attrValues}`;

            // Buscar si ya existe una variante con estas mismas opciones para mantener su imagen e ID sin repetir IDs
            const existing = variants.find(v => 
                v.options &&
                Object.keys(combination).every(k => v.options[k] === combination[k]) &&
                Object.keys(v.options).length === Object.keys(combination).length &&
                !usedIds.has(v.id)
            ) || variants.find(v => v.sku === variantSku && !usedIds.has(v.id));

            let id = existing?.id;
            if (!id || usedIds.has(id)) {
                id = `v-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
            }
            usedIds.add(id);

            const resolvedActive = existing?.is_active ?? existing?.show_on_web ?? true;
            return {
                id,
                options: combination,
                sku: variantSku,
                image_url: existing?.image_url || null,
                price_adjustment_percent: existing?.price_adjustment_percent || 0,
                is_active: resolvedActive,
                show_on_web: resolvedActive
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
            zIndex: 25000,
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
                                    id="btn-add-attribute"
                                    onClick={addOption}
                                    style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '2px dashed #3B82F6', color: '#1E40AF', fontWeight: '700', background: '#EFF6FF', cursor: 'pointer', fontSize: '0.9rem' }}
                                >
                                    + Añadir Atributo
                                </button>
                            )}
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {options.map((opt, idx) => (
                                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '250px 1fr 40px', gap: '1.25rem', alignItems: 'start', backgroundColor: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                                    <div>
                                        {(() => {
                                            const isCustomName = opt.name && !masterAttributes.some(ma => ma.name === opt.name);
                                            const isCustom = showCustomInput[idx] || isCustomName;

                                            if (isCustom) {
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <div style={{ display: 'flex', gap: '6px' }}>
                                                            <input
                                                                id={`attr-name-${idx}`}
                                                                type="text"
                                                                placeholder="Nombre del Atributo (Ej: Madurez)"
                                                                value={opt.name}
                                                                onChange={(e) => updateOption(idx, e.target.value, opt.values.join(', '))}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        document.getElementById(`attr-values-${idx}`)?.focus();
                                                                    } else if (e.key === 'ArrowDown') {
                                                                        e.preventDefault();
                                                                        const next = document.getElementById(`attr-name-${idx + 1}`);
                                                                        if (next) (next as any).focus();
                                                                    } else if (e.key === 'ArrowUp') {
                                                                        e.preventDefault();
                                                                        const prev = document.getElementById(`attr-name-${idx - 1}`);
                                                                        if (prev) (prev as any).focus();
                                                                    }
                                                                }}
                                                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700', fontSize: '0.9rem' }}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setShowCustomInput(prev => ({ ...prev, [idx]: false }));
                                                                    updateOption(idx, '', '');
                                                                }}
                                                                style={{ padding: '0.6rem 0.8rem', backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}
                                                                title="Seleccionar de la lista"
                                                            >
                                                                📋
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <select
                                                    id={`attr-name-${idx}`}
                                                    value={opt.name}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === '__custom__') {
                                                            setShowCustomInput(prev => ({ ...prev, [idx]: true }));
                                                            updateOption(idx, '', '');
                                                        } else {
                                                            updateOption(idx, val, '');
                                                        }
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            document.getElementById(`attr-values-${idx}`)?.focus();
                                                        }
                                                    }}
                                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700', fontSize: '0.9rem', backgroundColor: 'white', cursor: 'pointer' }}
                                                >
                                                    <option value="">Seleccionar Atributo...</option>
                                                    {masterAttributes.map(ma => (
                                                        <option key={ma.name} value={ma.name}>{ma.name}</option>
                                                    ))}
                                                    <option value="__custom__">✍️ Atributo Personalizado...</option>
                                                </select>
                                            );
                                        })()}
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                        <input
                                            id={`attr-values-${idx}`}
                                            type="text"
                                            placeholder="Valores (Verde, Pintón, Maduro... separados por comas)"
                                            value={opt.values.join(', ')}
                                            onChange={(e) => updateOption(idx, opt.name, e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    if (idx < options.length - 1) {
                                                        const next = document.getElementById(`attr-name-${idx + 1}`) || document.getElementById(`attr-values-${idx + 1}`);
                                                        if (next) next.focus();
                                                    } else {
                                                        const firstPrice = document.getElementById('variant-price-0');
                                                        if (firstPrice) {
                                                            firstPrice.focus();
                                                            (firstPrice as HTMLInputElement).select();
                                                        } else {
                                                            document.getElementById('btn-save-variants')?.focus();
                                                        }
                                                    }
                                                } else if (e.key === 'ArrowDown') {
                                                    e.preventDefault();
                                                    const next = document.getElementById(`attr-values-${idx + 1}`);
                                                    if (next) next.focus();
                                                } else if (e.key === 'ArrowUp') {
                                                    e.preventDefault();
                                                    const prev = document.getElementById(`attr-values-${idx - 1}`);
                                                    if (prev) prev.focus();
                                                }
                                            }}
                                            style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', width: '100%' }}
                                        />
                                        {(() => {
                                            const matchedAttribute = masterAttributes.find(ma => ma.name === opt.name);
                                            if (!matchedAttribute || !matchedAttribute.suggested_values || matchedAttribute.suggested_values.length === 0) return null;

                                            return (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                                                    {matchedAttribute.suggested_values.slice().sort((a: string, b: string) => {
                                                        const cleanA = a.includes('|') ? a.split('|')[0] : a;
                                                        const cleanB = b.includes('|') ? b.split('|')[0] : b;
                                                        return cleanA.localeCompare(cleanB, undefined, { numeric: true, sensitivity: 'base' });
                                                    }).map((val: string) => {
                                                        const isChecked = opt.values.includes(val);
                                                        return (
                                                            <label 
                                                                key={val} 
                                                                style={{ 
                                                                    display: 'inline-flex', 
                                                                    alignItems: 'center', 
                                                                    gap: '6px', 
                                                                    backgroundColor: isChecked ? '#EFF6FF' : '#F3F4F6', 
                                                                    color: isChecked ? '#1E40AF' : '#4B5563',
                                                                    border: isChecked ? '1px solid #BFDBFE' : '1px solid #E5E7EB',
                                                                    padding: '4px 10px', 
                                                                    borderRadius: '20px', 
                                                                    cursor: 'pointer', 
                                                                    fontSize: '0.78rem',
                                                                    fontWeight: '600',
                                                                    transition: 'all 0.15s',
                                                                    userSelect: 'none'
                                                                }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={(e) => {
                                                                        const checked = e.target.checked;
                                                                        let newVals;
                                                                        if (checked) {
                                                                            newVals = [...opt.values, val];
                                                                        } else {
                                                                            newVals = opt.values.filter(v => v !== val);
                                                                        }
                                                                        updateOption(idx, opt.name, newVals.join(', '));
                                                                    }}
                                                                    style={{ cursor: 'pointer' }}
                                                                />
                                                                {val.includes('|') ? `${val.split('|')[0].charAt(0).toUpperCase() + val.split('|')[0].slice(1)} ${val.split('|')[1]} gr` : val}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    <button 
                                        onClick={() => removeOption(idx)}
                                        style={{ border: 'none', background: 'none', color: '#EF4444', fontSize: '1.2rem', cursor: 'pointer', fontWeight: '800', marginTop: '6px' }}
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
                                    <tr key={v.id ? `${v.id}-${idx}` : `v-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
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
                                                        <Image 
                                                            src={v.image_url} 
                                                            alt="" 
                                                            width={60} 
                                                            height={60} 
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            sizes="60px"
                                                        />
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
                                                    id={`variant-price-${idx}`}
                                                    type="number"
                                                    disabled={readOnly}
                                                    value={v.price_adjustment_percent || 0}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        setVariants(prev => prev.map(variant => 
                                                            variant.id === v.id ? { ...variant, price_adjustment_percent: isNaN(val) ? 0 : val } : variant
                                                        ));
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'ArrowDown' || e.key === 'Enter') {
                                                            e.preventDefault();
                                                            const next = document.getElementById(`variant-price-${idx + 1}`) as HTMLInputElement | null;
                                                            if (next) {
                                                                next.focus();
                                                                next.select();
                                                            } else if (e.key === 'Enter') {
                                                                document.getElementById('btn-save-variants')?.focus();
                                                            }
                                                        } else if (e.key === 'ArrowUp') {
                                                            e.preventDefault();
                                                            const prev = document.getElementById(`variant-price-${idx - 1}`) as HTMLInputElement | null;
                                                            if (prev) {
                                                                prev.focus();
                                                                prev.select();
                                                            }
                                                        }
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
                                                    setVariants(prev => prev.map(variant => {
                                                        if (variant.id === v.id) {
                                                            const newActive = !(variant.is_active ?? true);
                                                            return { ...variant, is_active: newActive, show_on_web: newActive };
                                                        }
                                                        return variant;
                                                    }));
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
                            id="btn-save-variants"
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
