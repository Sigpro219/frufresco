'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, X, Tag, AlertCircle, Save, Trash2, Edit3, Loader2, PlusCircle } from 'lucide-react';

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
        if (!confirm(`¿Seguro que quieres eliminar la subcategoría "${valueToRemove}"?`)) return;
        
        setLocalAttributes(localAttributes.map(a => a.id === attrId 
            ? { ...a, suggested_values: a.suggested_values.filter(v => v !== valueToRemove) } 
            : a
        ));
    };

    const handleDeleteLocal = (id: string, name: string) => {
        // DOBLE CONFIRMACIÓN
        const firstCheck = confirm(`⚠️ ADVERTENCIA: Estás a punto de borrar la categoría completa "${name}". Esto eliminará todas sus subcategorías asociadas.`);
        if (firstCheck) {
            const secondCheck = confirm(`¿ESTÁS ABSOLUTAMENTE SEGURO? Esta acción no se puede deshacer una vez guardes los cambios maestros.`);
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
            (window as any).showToast?.('Gobernanza actualizada con éxito ✅', 'success');
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
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, backdropFilter: 'blur(8px)', padding: '20px'
        }}>
            <div style={{
                backgroundColor: 'white', width: '100%', maxWidth: '750px',
                borderRadius: '32px', padding: '2.5rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column', maxHeight: '90vh', position: 'relative',
                border: '1px solid #E5E7EB'
            }}>
                <button 
                    onClick={onClose} 
                    style={{ position: 'absolute', top: '24px', right: '24px', background: '#F3F4F6', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}
                >
                    <X size={20} />
                </button>

                <header style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ padding: '8px', backgroundColor: '#111827', borderRadius: '12px', color: 'white' }}>
                            <Tag size={24} />
                        </div>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: '900', color: '#111827', margin: 0 }}>Gobernanza de Variantes</h2>
                    </div>
                    <p style={{ fontSize: '0.9rem', color: '#6B7280', margin: 0 }}>Gestiona las Categorías y Subcategorías maestras del catálogo.</p>
                </header>

                {/* CREAR CATEGORÍA PADRE */}
                <div style={{ 
                    display: 'flex', gap: '12px', padding: '1rem', backgroundColor: '#F9FAFB', 
                    borderRadius: '20px', border: '1px solid #E5E7EB', marginBottom: '1.5rem' 
                }}>
                    <input 
                        type="text" 
                        placeholder="Nueva Categoría: Ej. Calibre, Proceso, Empaque..." 
                        value={newAttrName}
                        onChange={(e) => setNewAttrName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddAttributeLocal()}
                        style={{ flex: 1, padding: '0.8rem 1.2rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '1rem', fontWeight: '600', outline: 'none', backgroundColor: 'white' }}
                    />
                    <button 
                        onClick={handleAddAttributeLocal}
                        disabled={!newAttrName.trim()}
                        style={{ 
                            padding: '0 1.5rem', backgroundColor: '#111827', color: 'white', 
                            border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px', opacity: !newAttrName.trim() ? 0.5 : 1
                        }}
                    >
                        <PlusCircle size={18} /> Crear Categoría
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#6B7280' }}>
                            <Loader2 className="animate-spin" size={40} style={{ margin: '0 auto 1rem auto' }} />
                            Cargando...
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            {localAttributes.map(attr => (
                                <div key={attr.id} style={{ 
                                    padding: '1.5rem', backgroundColor: 'white', borderRadius: '24px', 
                                    border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                                        {editingId === attr.id ? (
                                            <input 
                                                autoFocus
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                                onBlur={() => handleRenameLocal(attr.id)}
                                                onKeyPress={(e) => e.key === 'Enter' && handleRenameLocal(attr.id)}
                                                style={{ fontSize: '1.2rem', fontWeight: '900', border: '2px solid #111827', borderRadius: '8px', padding: '4px 10px', outline: 'none', flex: 1, marginRight: '1rem' }}
                                            />
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontWeight: '900', color: '#111827', fontSize: '1.2rem' }}>{attr.name}</span>
                                                <button 
                                                    onClick={() => { setEditingId(attr.id); setEditingName(attr.name); }}
                                                    style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '4px' }}
                                                >
                                                    <Edit3 size={16} />
                                                </button>
                                            </div>
                                        )}
                                        
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            {/* SÍMBOLO "+" PARA CREAR SUBCATEGORÍA */}
                                            <button 
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    handleAddValueLocal(attr.id);
                                                }}
                                                title="Añadir Subcategoría"
                                                style={{ background: '#F3F4F6', border: 'none', color: '#10B981', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#E5E7EB'}
                                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                            >
                                                <Plus size={20} strokeWidth={3} />
                                            </button>
                                            
                                            <button 
                                                onClick={() => handleDeleteLocal(attr.id, attr.name)}
                                                title="Eliminar Categoría"
                                                style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', transition: 'color 0.2s' }}
                                                onMouseOver={(e) => e.currentTarget.style.color = '#EF4444'}
                                                onMouseOut={(e) => e.currentTarget.style.color = '#9CA3AF'}
                                            >
                                                <Trash2 size={20} />
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ backgroundColor: '#F9FAFB', padding: '12px', borderRadius: '16px', border: '1px solid #F3F4F6' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {attr.suggested_values.map(val => (
                                                <span key={val} style={{ 
                                                    display: 'inline-flex', alignItems: 'center', gap: '6px', 
                                                    backgroundColor: 'white', border: '1.5px solid #E5E7EB', 
                                                    padding: '5px 12px', borderRadius: '100px', fontSize: '0.85rem', 
                                                    fontWeight: '700', color: '#374151' 
                                                }}>
                                                    {val}
                                                    <button 
                                                        onClick={() => handleRemoveValueLocal(attr.id, val)}
                                                        style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, display: 'flex' }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </span>
                                            ))}
                                            <input 
                                                ref={el => inputRefs.current[attr.id] = el}
                                                placeholder="+ Nueva Subcategoría..."
                                                value={newValueInputs[attr.id] || ''}
                                                onChange={(e) => setNewValueInputs({ ...newValueInputs, [attr.id]: e.target.value })}
                                                onKeyPress={(e) => e.key === 'Enter' && handleAddValueLocal(attr.id)}
                                                style={{ 
                                                    border: '2px dashed #D1D5DB', background: 'none', 
                                                    padding: '5px 12px', borderRadius: '100px', fontSize: '0.85rem', 
                                                    fontWeight: '700', outline: 'none', width: '150px',
                                                    color: '#111827'
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid #E5E7EB', paddingTop: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#FFF7ED', padding: '8px 12px', borderRadius: '12px', border: '1px solid #FFEDD5', marginBottom: '1.2rem' }}>
                        <AlertCircle size={14} color="#EA580C" />
                        <p style={{ fontSize: '0.75rem', color: '#9A3412', margin: 0, fontWeight: '500' }}>
                            Nota: Los cambios afectan a nuevas selecciones. No modifican SKUs ya existentes.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button 
                            onClick={onClose} 
                            style={{ flex: 1, padding: '1rem', backgroundColor: '#F3F4F6', color: '#4B5563', border: 'none', borderRadius: '16px', fontWeight: '800', cursor: 'pointer' }}
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleSaveChanges}
                            disabled={!hasChanges || saving}
                            style={{ 
                                flex: 2, padding: '1rem', 
                                backgroundColor: hasChanges ? '#111827' : '#9CA3AF', 
                                color: 'white', border: 'none', borderRadius: '16px', 
                                fontWeight: '900', cursor: hasChanges ? 'pointer' : 'not-allowed',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                            }}
                        >
                            {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                            {saving ? 'Guardando...' : 'Confirmar Cambios Maestros'}
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
