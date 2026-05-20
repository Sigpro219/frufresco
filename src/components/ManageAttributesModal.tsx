'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, X, Tag, AlertCircle, Save, Trash2, Edit3, Loader2, PlusCircle, ShieldAlert } from 'lucide-react';

interface MasterAttribute {
    id: string;
    name: string;
    suggested_values: string[];
}

interface ManageAttributesModalProps {
    onClose: () => void;
}

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
            setDbAttributes(data || []);
            setLocalAttributes(JSON.parse(JSON.stringify(data || [])));
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
            suggested_values: []
        };
        setLocalAttributes([...localAttributes, newAttr]);
        setNewAttrName('');
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

        setLocalAttributes(localAttributes.map(a => {
            if (a.id === attrId) {
                if (a.suggested_values.includes(val)) return a;
                return { ...a, suggested_values: [...a.suggested_values, val] };
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
                await supabase.from('product_attributes_master').delete().eq('id', del.id);
            }

            for (const attr of localAttributes) {
                const payload: any = { 
                    name: attr.name, 
                    suggested_values: attr.suggested_values 
                };
                
                if (attr.id.startsWith('temp-')) {
                    await supabase.from('product_attributes_master').insert([payload]);
                } else {
                    await supabase.from('product_attributes_master').update(payload).eq('id', attr.id);
                }
            }

            await fetchAttributes();
            if ((window as any).showToast) (window as any).showToast('Gobernanza actualizada con éxito ✅', 'success');
        } catch (err) {
            console.error('Save error:', err);
            alert('Error al guardar los cambios.');
        } finally {
            setSaving(false);
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
                <button 
                    onClick={onClose} 
                    style={{ position: 'absolute', top: '20px', right: '20px', background: '#F3F4F6', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}
                >
                    <X size={18} />
                </button>

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

                                    <div style={{ backgroundColor: '#F9FAFB', padding: '8px 10px', borderRadius: '12px', border: '1px solid #F3F4F6' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {attr.suggested_values.map(val => (
                                                <span key={val} style={{ 
                                                    display: 'inline-flex', alignItems: 'center', gap: '5px', 
                                                    backgroundColor: 'white', border: '1.5px solid #E5E7EB', 
                                                    padding: '3px 10px', borderRadius: '100px', fontSize: '0.8rem', 
                                                    fontWeight: '700', color: '#374151' 
                                                }}>
                                                    {val}
                                                    <button 
                                                        onClick={() => handleRemoveValueLocal(attr.id, val)}
                                                        style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, display: 'flex' }}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            ))}
                                            <input 
                                                ref={el => { inputRefs.current[attr.id] = el; }}
                                                placeholder="+ Subcat..."
                                                value={newValueInputs[attr.id] || ''}
                                                onChange={(e) => setNewValueInputs({ ...newValueInputs, [attr.id]: e.target.value })}
                                                onKeyPress={(e) => e.key === 'Enter' && handleAddValueLocal(attr.id)}
                                                style={{ 
                                                    border: '1.5px dashed #D1D5DB', background: 'none', 
                                                    padding: '3px 10px', borderRadius: '100px', fontSize: '0.8rem', 
                                                    fontWeight: '700', outline: 'none', width: '100px'
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
