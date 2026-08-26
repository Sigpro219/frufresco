'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, X, Tag, AlertCircle, Save, Trash2, Edit3, Loader2, PlusCircle, ShieldAlert, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface MasterAttribute {
    id: string;
    name: string;
    suggested_values: string[];
    show_on_web?: boolean;
}

interface ManageAttributesModalProps {
    onClose: () => void;
}

export const extractWeight = (val: string): number | null => {
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

export const sortSuggestedValues = (values: string[]): string[] => {
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

export const groupSuggestedValues = (values: string[]) => {
    const under1kg: string[] = [];
    const overOrEqual1kg: string[] = [];
    const others: string[] = [];

    const sorted = sortSuggestedValues(values);

    sorted.forEach(val => {
        const weight = extractWeight(val);
        if (weight !== null) {
            if (weight < 1000) {
                under1kg.push(val);
            } else {
                overOrEqual1kg.push(val);
            }
        } else {
            others.push(val);
        }
    });

    return { under1kg, overOrEqual1kg, others };
};

export default function ManageAttributesModal({ onClose }: ManageAttributesModalProps) {
    const [dbAttributes, setDbAttributes] = useState<MasterAttribute[]>([]);
    const [localAttributes, setLocalAttributes] = useState<MasterAttribute[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newAttrName, setNewAttrName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [newValueInputs, setNewValueInputs] = useState<Record<string, string>>({});
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const fetchAttributes = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('product_attributes_master')
                .select('*')
                .order('name', { ascending: true });
            
            if (error) throw error;
            const normalizedData = (data || []).map((attr: any) => ({
                ...attr,
                suggested_values: sortSuggestedValues(attr.suggested_values || [])
            }));
            setDbAttributes(normalizedData);
            const sortedData = JSON.parse(JSON.stringify(normalizedData)).sort((a: any, b: any) => a.name.localeCompare(b.name));
            setLocalAttributes(sortedData);
        } catch (error: any) {
            console.error('❌ Error fetching attributes:', error.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAttributes();
    }, [fetchAttributes]);

    const handleAddAttributeLocal = () => {
        if (!newAttrName.trim()) return;
        const newAttr: MasterAttribute = {
            id: `temp-${Math.random().toString(36).substr(2, 9)}`,
            name: newAttrName,
            suggested_values: [],
            show_on_web: true
        };
        setLocalAttributes([...localAttributes, newAttr].sort((a, b) => a.name.localeCompare(b.name)));
        setNewAttrName('');
    };

    const handleToggleShowOnWeb = (id: string, show: boolean) => {
        setLocalAttributes(localAttributes.map(a => a.id === id ? { ...a, show_on_web: show } : a));
    };

    const handleRenameLocal = (id: string) => {
        if (!editingName.trim()) {
            setEditingId(null);
            return;
        }
        setLocalAttributes(localAttributes.map(a => a.id === id ? { ...a, name: editingName } : a));
        setEditingId(null);
    };

    const handleAddValueLocal = (attrId: string) => {
        const val = newValueInputs[attrId]?.trim();
        if (!val) {
            inputRefs.current[attrId]?.focus();
            return;
        }

        const attr = localAttributes.find(a => a.id === attrId);
        const isPresentacion = attr?.name.toLowerCase().includes('presentaci');

        let finalVal = val;
        if (isPresentacion && val.toLowerCase() !== 'unidad web' && val.toLowerCase() !== 'unidadweb') {
            const grams = prompt(`⚠️ EQUIVALENCIA EN GRAMOS:\n\nIngrese la equivalencia en gramos para "${val}" (ej: 250):`);
            if (grams === null) return; // Operator clicked cancel
            const gramsNum = parseInt(grams.trim());
            if (isNaN(gramsNum) || gramsNum <= 0) {
                alert('🛑 Error: Debe ingresar un número de gramos válido (mayor a 0).');
                return;
            }
            finalVal = `${val}|${gramsNum}`;
        } else if (isPresentacion && (val.toLowerCase() === 'unidad web' || val.toLowerCase() === 'unidadweb')) {
            finalVal = 'Unidad Web';
        }

        setLocalAttributes(localAttributes.map(a => {
            if (a.id === attrId) {
                if (a.suggested_values.includes(finalVal)) return a;
                return { ...a, suggested_values: [...a.suggested_values, finalVal] };
            }
            return a;
        }));
        setNewValueInputs({ ...newValueInputs, [attrId]: '' });
        
        setTimeout(() => inputRefs.current[attrId]?.focus(), 10);
    };

    const handleRemoveValueLocal = (attrId: string, valueToRemove: string) => {
        if (!confirm(`⚠️ PRECAUCIÓN: ¿Seguro que quieres eliminar la subcategoría "${valueToRemove}"?\n\nSi hay productos usando este valor, podrían quedar inconsistentes.`)) return;
        
        setLocalAttributes(localAttributes.map(a => a.id === attrId 
            ? { ...a, suggested_values: a.suggested_values.filter(v => v !== valueToRemove) } 
            : a
        ));
    };

    const handleDeleteLocal = (id: string, name: string) => {
        const firstCheck = confirm(`🛑 ACCIÓN CRÍTICA: Estás a punto de borrar la categoría completa "${name}".\n\nEsto afectará la capacidad de crear variantes basadas en este atributo para TODOS los productos.`);
        if (firstCheck) {
            const secondCheck = confirm(`¿ESTÁS ABSOLUTAMENTE SEGURO?\n\nRecomendamos NO borrar categorías que ya tengan productos vinculados.`);
            if (secondCheck) {
                setLocalAttributes(localAttributes.filter(a => a.id !== id));
            }
        }
    };

    const handleSaveChanges = async () => {
        setSaving(true);
        try {
            const idsEnLocal = localAttributes.map(a => a.id);
            const eliminados = dbAttributes.filter(a => !idsEnLocal.includes(a.id));
            
            for (const del of eliminados) {
                const { error } = await supabase.from('product_attributes_master').delete().eq('id', del.id);
                if (error) throw error;
            }

            for (const attr of localAttributes) {
                const sortedValues = sortSuggestedValues(attr.suggested_values || []);
                const payload: any = { 
                    name: attr.name, 
                    suggested_values: sortedValues,
                    show_on_web: attr.show_on_web !== false
                };
                
                if (attr.id.startsWith('temp-')) {
                    const { error } = await supabase.from('product_attributes_master').insert([payload]);
                    if (error) throw error;
                } else {
                    const { error } = await supabase.from('product_attributes_master').update(payload).eq('id', attr.id);
                    if (error) throw error;
                }
            }

            await fetchAttributes();
            if ((window as any).showToast) {
                (window as any).showToast('Gobernanza actualizada con éxito ✅', 'success');
            } else {
                alert('Gobernanza actualizada con éxito ✅');
            }
            onClose(); // Cerrar el modal al guardar exitosamente
        } catch (err: any) {
            console.error('Save error:', err);
            const errMsg = err.message || err.details || 'Error desconocido de permisos de base de datos.';
            alert(`Error al guardar los cambios: ${errMsg}`);
        } finally {
            setSaving(false);
        }
    };

    const handleExportExcel = () => {
        try {
            if (!localAttributes || localAttributes.length === 0) {
                if (typeof window !== 'undefined' && (window as any).showToast) {
                    (window as any).showToast('No hay variantes registradas para exportar', 'error');
                } else {
                    alert('No hay variantes registradas para exportar');
                }
                return;
            }

            // Excluir "Gramaje frutas" para este ejercicio según instrucción del usuario
            const validAttributes = localAttributes.filter(attr => {
                const normName = (attr.name || '').toLowerCase().trim();
                return !normName.includes('gramaje');
            });

            if (validAttributes.length === 0) {
                alert('No hay atributos válidos disponibles para exportar (se excluyó Gramaje frutas).');
                return;
            }

            // 1. Matriz de 2 Columnas Solicitada: "Atributo" y "opciones de ese atributo"
            const matrix2Cols = validAttributes.map(attr => {
                const sortedValues = [...(attr.suggested_values || [])].sort((a, b) => 
                    a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
                );

                return {
                    'Atributo': attr.name,
                    'opciones de ese atributo': sortedValues.join(', '),
                    'Texto Para Copiar a Columna Variantes': `${attr.name}: ${sortedValues.join(', ')}`
                };
            });

            // 2. Detalle Desglosado por Atributo
            const detailData: any[] = [];
            validAttributes.forEach(attr => {
                const sortedValues = [...(attr.suggested_values || [])].sort((a, b) => 
                    a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
                );
                if (sortedValues.length === 0) {
                    detailData.push({
                        'Atributo': attr.name,
                        'Opción Individual': '(Sin opciones configuradas)',
                        'Mostrar en Web': attr.show_on_web ? 'SÍ' : 'NO'
                    });
                } else {
                    sortedValues.forEach(val => {
                        detailData.push({
                            'Atributo': attr.name,
                            'Opción Individual': val,
                            'Mostrar en Web': attr.show_on_web ? 'SÍ' : 'NO'
                        });
                    });
                }
            });

            const workbook = XLSX.utils.book_new();
            const wsMatrix = XLSX.utils.json_to_sheet(matrix2Cols);
            const wsDetail = XLSX.utils.json_to_sheet(detailData);

            wsMatrix['!cols'] = [{ wch: 25 }, { wch: 60 }, { wch: 65 }];
            wsDetail['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 15 }];

            XLSX.utils.book_append_sheet(workbook, wsMatrix, "Matriz_Atributos");
            XLSX.utils.book_append_sheet(workbook, wsDetail, "Opciones_Desglosadas");

            const dateStr = new Date().toISOString().split('T')[0];
            XLSX.writeFile(workbook, `Matriz_Variantes_FruFresco_${dateStr}.xlsx`);

            if (typeof window !== 'undefined' && (window as any).showToast) {
                (window as any).showToast('Matriz de atributos exportada en Excel con éxito', 'success');
            }
        } catch (err: any) {
            console.error('Error al exportar variantes a Excel:', err);
            alert('Error al generar el archivo Excel: ' + (err?.message || err));
        }
    };

    const hasChanges = JSON.stringify(dbAttributes) !== JSON.stringify(localAttributes);

    return (
        <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, backdropFilter: 'blur(10px)', padding: '20px'
        }}>
            <div style={{
                backgroundColor: 'white', width: '100%', maxWidth: '700px',
                borderRadius: '24px', padding: '1.8rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column', maxHeight: '85vh', position: 'relative',
                border: '1px solid #E5E7EB'
            }}>
                <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button 
                        type="button"
                        onClick={handleExportExcel}
                        style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            padding: '0.45rem 0.95rem', 
                            backgroundColor: '#059669', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '12px', 
                            fontSize: '0.8rem', 
                            fontWeight: '800', 
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#047857'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                        title="Descargar matriz completa de variantes en Excel (.xlsx)"
                    >
                        <FileSpreadsheet size={16} strokeWidth={2} />
                        <span>Exportar Excel</span>
                    </button>

                    <button 
                        onClick={onClose} 
                        style={{ background: '#F3F4F6', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}
                        title="Cerrar modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                <header style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <div style={{ padding: '6px', backgroundColor: '#111827', borderRadius: '10px', color: 'white' }}>
                            <Tag size={20} />
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#111827', margin: 0 }}>Gobernanza de Variantes</h2>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: 0 }}>Gestión maestra de categorías y subcategorías estructurales.</p>
                </header>

                {/* CREAR CATEGORÍA PADRE (Compacto) */}
                <div style={{ 
                    display: 'flex', gap: '10px', padding: '0.8rem', backgroundColor: '#F9FAFB', 
                    borderRadius: '16px', border: '1px solid #E5E7EB', marginBottom: '1.2rem' 
                }}>
                    <input 
                        type="text" 
                        placeholder="Nueva Categoría: Ej. Calibre, Empaque..." 
                        value={newAttrName}
                        onChange={(e) => setNewAttrName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddAttributeLocal()}
                        style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '0.9rem', fontWeight: '600', outline: 'none' }}
                    />
                    <button 
                        onClick={handleAddAttributeLocal}
                        disabled={!newAttrName.trim()}
                        style={{ 
                            padding: '0 1.2rem', backgroundColor: '#111827', color: 'white', 
                            border: 'none', borderRadius: '10px', fontWeight: '800', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px', opacity: !newAttrName.trim() ? 0.5 : 1,
                            fontSize: '0.85rem'
                        }}
                    >
                        <PlusCircle size={16} /> Crear
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: '#6B7280' }}>
                            <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto 1rem auto' }} />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            {localAttributes.map(attr => (
                                <div key={attr.id} style={{ 
                                    padding: '1.2rem', backgroundColor: 'white', borderRadius: '18px', 
                                    border: '1px solid #E5E7EB'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                                        {editingId === attr.id ? (
                                            <input 
                                                autoFocus
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                                onBlur={() => handleRenameLocal(attr.id)}
                                                onKeyPress={(e) => e.key === 'Enter' && handleRenameLocal(attr.id)}
                                                style={{ fontSize: '1rem', fontWeight: '900', border: '2px solid #111827', borderRadius: '8px', padding: '4px 8px', outline: 'none', flex: 1, marginRight: '1rem' }}
                                            />
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontWeight: '900', color: '#111827', fontSize: '1.05rem' }}>{attr.name}</span>
                                                <button 
                                                    onClick={() => { setEditingId(attr.id); setEditingName(attr.name); }}
                                                    style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '2px' }}
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginLeft: '12px', fontSize: '0.8rem', color: '#6B7280', userSelect: 'none' }}>
                                                    <input 
                                                        type="checkbox"
                                                        checked={attr.show_on_web !== false}
                                                        onChange={(e) => handleToggleShowOnWeb(attr.id, e.target.checked)}
                                                        style={{ accentColor: '#10B981', cursor: 'pointer' }}
                                                    />
                                                    <span>Mostrar en la web</span>
                                                </label>
                                            </div>
                                        )}
                                        
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <button 
                                                type="button"
                                                onClick={(e) => { e.preventDefault(); handleAddValueLocal(attr.id); }}
                                                style={{ background: '#F3F4F6', border: 'none', color: '#059669', cursor: 'pointer', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            >
                                                <Plus size={18} strokeWidth={3} />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteLocal(attr.id, attr.name)}
                                                style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ backgroundColor: '#F9FAFB', padding: '10px 12px', borderRadius: '12px', border: '1px solid #F3F4F6' }}>
                                        {(() => {
                                            const { under1kg, overOrEqual1kg, others } = groupSuggestedValues(attr.suggested_values || []);
                                            const hasWeightGroups = under1kg.length > 0 || overOrEqual1kg.length > 0;

                                            const renderChip = (val: string) => {
                                                const isWebUnit = val.toLowerCase() === 'unidad web' || val.toLowerCase() === 'unidadweb';
                                                return (
                                                    <span key={val} style={{ 
                                                        display: 'inline-flex', alignItems: 'center', gap: '5px', 
                                                        backgroundColor: isWebUnit ? '#ECFDF5' : 'white', 
                                                        border: isWebUnit ? '1.5px solid #10B981' : '1.5px solid #E5E7EB', 
                                                        padding: '3px 10px', borderRadius: '100px', fontSize: '0.8rem', 
                                                        fontWeight: '700', color: isWebUnit ? '#047857' : '#374151' 
                                                    }} title={isWebUnit ? '🌐 EXCLUSIVO PARA TIENDA WEB: Hereda unidad web y factor en Kg.' : undefined}>
                                                        {isWebUnit ? '🏷️ Unidad Web (Dinámica SKU)' : (val.includes('|') ? `${val.split('|')[0].charAt(0).toUpperCase() + val.split('|')[0].slice(1)} ${val.split('|')[1]} gr` : val)}
                                                        <button 
                                                            onClick={() => handleRemoveValueLocal(attr.id, val)}
                                                            style={{ background: 'none', border: 'none', color: isWebUnit ? '#059669' : '#9CA3AF', cursor: 'pointer', padding: 0, display: 'flex' }}
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                );
                                            };

                                            if (!hasWeightGroups) {
                                                return (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {others.map(renderChip)}
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    {under1kg.length > 0 && (
                                                        <div>
                                                            <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span>⚖️ Menos de 1 Kilo (&lt; 1000 gr)</span>
                                                            </div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                {under1kg.map(renderChip)}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {overOrEqual1kg.length > 0 && (
                                                        <div style={{ borderTop: under1kg.length > 0 ? '1px dashed #E5E7EB' : 'none', paddingTop: under1kg.length > 0 ? '6px' : '0' }}>
                                                            <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span>📦 1 Kilo o Más (&ge; 1 Kg / Mayorista)</span>
                                                            </div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                {overOrEqual1kg.map(renderChip)}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {others.length > 0 && (
                                                        <div style={{ borderTop: '1px dashed #E5E7EB', paddingTop: '6px' }}>
                                                            <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span>🧺 Empaques &amp; Otras Presentaciones</span>
                                                            </div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                {others.map(renderChip)}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        <div style={{ marginTop: '8px' }}>
                                            <input 
                                                ref={el => { inputRefs.current[attr.id] = el; }}
                                                placeholder="+ Opción / Presentación..."
                                                value={newValueInputs[attr.id] || ''}
                                                onChange={(e) => setNewValueInputs({ ...newValueInputs, [attr.id]: e.target.value })}
                                                onKeyPress={(e) => e.key === 'Enter' && handleAddValueLocal(attr.id)}
                                                style={{ 
                                                    border: '1.5px dashed #D1D5DB', background: 'none', 
                                                    padding: '3px 10px', borderRadius: '100px', fontSize: '0.8rem', 
                                                    fontWeight: '700', outline: 'none', width: '150px'
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Compacto con Aviso Crítico */}
                <div style={{ marginTop: '1.2rem', borderTop: '1px solid #E5E7EB', paddingTop: '1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', backgroundColor: '#FEF2F2', padding: '10px 14px', borderRadius: '14px', border: '1px solid #FEE2E2', marginBottom: '1rem' }}>
                        <ShieldAlert size={18} color="#DC2626" style={{ marginTop: '2px' }} />
                        <div>
                            <p style={{ fontSize: '0.75rem', color: '#991B1B', margin: 0, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                Aviso de Integridad Crítica
                            </p>
                            <p style={{ fontSize: '0.72rem', color: '#B91C1C', margin: '2px 0 0 0', lineHeight: '1.4', fontWeight: '500' }}>
                                Estas variables son los pilares del catálogo inteligente. Borrarlas involuntariamente puede romper la consistencia de los productos ya configurados. Procede con máxima precaución.
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={onClose} style={{ flex: 1, padding: '0.8rem', backgroundColor: '#F3F4F6', color: '#4B5563', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', fontSize: '0.9rem' }}>
                            Cancelar
                        </button>
                        <button 
                            onClick={handleSaveChanges}
                            disabled={!hasChanges || saving}
                            style={{ 
                                flex: 2, padding: '0.8rem', 
                                backgroundColor: hasChanges ? '#DC2626' : '#9CA3AF', 
                                color: 'white', border: 'none', borderRadius: '12px', 
                                fontWeight: '900', cursor: hasChanges ? 'pointer' : 'not-allowed',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.9rem'
                            }}
                        >
                            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            {saving ? 'Sincronizando...' : 'Confirmar Cambios Críticos'}
                        </button>
                    </div>
                </div>
                
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes spin { to { transform: rotate(360deg); } }
                    .animate-spin { animation: spin 1s linear infinite; }
                ` }} />
            </div>
        </div>
    );
}
