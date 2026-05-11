'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, X, Tag, AlertCircle, Save, Trash2, Edit3 } from 'lucide-react';

interface MasterAttribute {
    id: string;
    name: string;
    suggested_values: string[];
}

interface ManageAttributesModalProps {
    onClose: () => void;
}

export default function ManageAttributesModal({ onClose }: ManageAttributesModalProps) {
    const [attributes, setAttributes] = useState<MasterAttribute[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newAttrName, setNewAttrName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [newValueInputs, setNewValueInputs] = useState<Record<string, string>>({});

    const fetchAttributes = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('product_attributes_master')
                .select('*')
                .order('name', { ascending: true });
            
            if (error) throw error;
            setAttributes(data || []);
        } catch (error: any) {
            console.error('❌ Error fetching attributes:', error.message);
            // Fallback to empty but don't show local mode unless explicitly needed
            setAttributes([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAttributes();
    }, [fetchAttributes]);

    const handleAddAttribute = async () => {
        if (!newAttrName.trim()) return;
        try {
            setSaving(true);
            const { data, error } = await supabase
                .from('product_attributes_master')
                .insert([{ name: newAttrName, suggested_values: [] }])
                .select();
            
            if (error) throw error;
            if (data) setAttributes([...attributes, data[0]]);
            setNewAttrName('');
        } catch (err) {
            alert('Error añadiendo atributo.');
        } finally {
            setSaving(false);
        }
    };

    const handleRenameAttribute = async (id: string) => {
        if (!editingName.trim()) {
            setEditingId(null);
            return;
        }
        try {
            const { error } = await supabase
                .from('product_attributes_master')
                .update({ name: editingName })
                .eq('id', id);
            
            if (error) throw error;
            setAttributes(attributes.map(a => a.id === id ? { ...a, name: editingName } : a));
            setEditingId(null);
        } catch (err) {
            alert('Error renombrando atributo.');
        }
    };

    const handleAddValue = async (attrId: string) => {
        const val = newValueInputs[attrId]?.trim();
        if (!val) return;

        const attr = attributes.find(a => a.id === attrId);
        if (!attr) return;

        if (attr.suggested_values.includes(val)) {
            setNewValueInputs({ ...newValueInputs, [attrId]: '' });
            return;
        }

        const newValues = [...attr.suggested_values, val];
        try {
            const { error } = await supabase
                .from('product_attributes_master')
                .update({ suggested_values: newValues })
                .eq('id', attrId);
            
            if (error) throw error;
            setAttributes(attributes.map(a => a.id === attrId ? { ...a, suggested_values: newValues } : a));
            setNewValueInputs({ ...newValueInputs, [attrId]: '' });
        } catch (err) {
            alert('Error guardando valor.');
        }
    };

    const handleRemoveValue = async (attrId: string, valueToRemove: string) => {
        const attr = attributes.find(a => a.id === attrId);
        if (!attr) return;

        const newValues = attr.suggested_values.filter(v => v !== valueToRemove);
        try {
            const { error } = await supabase
                .from('product_attributes_master')
                .update({ suggested_values: newValues })
                .eq('id', attrId);
            
            if (error) throw error;
            setAttributes(attributes.map(a => a.id === attrId ? { ...a, suggested_values: newValues } : a));
        } catch (err) {
            alert('Error eliminando valor.');
        }
    };

    const handleDeleteAttribute = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este atributo? Esto no borrará las variantes existentes en los productos, pero ya no aparecerá como opción para nuevos SKUs.')) return;
        
        try {
            const { error } = await supabase
                .from('product_attributes_master')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            setAttributes(attributes.filter(a => a.id !== id));
        } catch (err) {
            alert('Error eliminando atributo.');
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, backdropFilter: 'blur(8px)', padding: '20px'
        }}>
            <div style={{
                backgroundColor: 'white', width: '100%', maxWidth: '700px',
                borderRadius: '28px', padding: '2.5rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column', maxHeight: '90vh', position: 'relative'
            }}>
                <button 
                    onClick={onClose} 
                    style={{ position: 'absolute', top: '20px', right: '20px', background: '#F3F4F6', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}
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
                    <p style={{ fontSize: '0.95rem', color: '#6B7280', margin: 0 }}>Define el diccionario maestro de atributos que rige tu catálogo inteligente.</p>
                </header>

                <div style={{ 
                    display: 'flex', gap: '12px', padding: '1rem', backgroundColor: '#F9FAFB', 
                    borderRadius: '20px', border: '1px solid #E5E7EB', marginBottom: '2rem' 
                }}>
                    <input 
                        type="text" 
                        placeholder="Nuevo tipo: Ej. Calibre, Proceso, Empaque..." 
                        value={newAttrName}
                        onChange={(e) => setNewAttrName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddAttribute()}
                        style={{ flex: 1, padding: '0.8rem 1.2rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '1rem', fontWeight: '600', outline: 'none' }}
                    />
                    <button 
                        onClick={handleAddAttribute}
                        disabled={saving || !newAttrName.trim()}
                        style={{ 
                            padding: '0 1.5rem', backgroundColor: '#111827', color: 'white', 
                            border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px', opacity: saving ? 0.5 : 1
                        }}
                    >
                        <Plus size={18} /> Añadir
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#6B7280' }}>
                            <div style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #111827', borderRadius: '50%', margin: '0 auto 1rem auto', animation: 'spin 1s linear infinite' }} />
                            Cargando diccionario...
                        </div>
                    ) : attributes.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '4rem 2rem', backgroundColor: '#F9FAFB', borderRadius: '24px', border: '2px dashed #E5E7EB' }}>
                            <p style={{ color: '#6B7280', fontSize: '1rem', fontWeight: '600' }}>No hay variaciones maestras configuradas.</p>
                            <p style={{ fontSize: '0.85rem', color: '#9CA3AF', marginTop: '8px' }}>Las variaciones permiten crear sub-productos (ej: Picado, Maduro) con un solo clic.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            {attributes.map(attr => (
                                <div key={attr.id} style={{ 
                                    padding: '1.5rem', backgroundColor: 'white', borderRadius: '20px', 
                                    border: '1px solid #E5E7EB', transition: 'all 0.2s',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                                        {editingId === attr.id ? (
                                            <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                                                <input 
                                                    autoFocus
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    onBlur={() => handleRenameAttribute(attr.id)}
                                                    onKeyPress={(e) => e.key === 'Enter' && handleRenameAttribute(attr.id)}
                                                    style={{ fontSize: '1.2rem', fontWeight: '900', border: '2px solid #111827', borderRadius: '8px', padding: '4px 8px', outline: 'none', width: '200px' }}
                                                />
                                                <button onClick={() => handleRenameAttribute(attr.id)} style={{ background: '#111827', color: 'white', border: 'none', borderRadius: '8px', padding: '0 8px' }}><Save size={16}/></button>
                                            </div>
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
                                        
                                        <button 
                                            onClick={() => handleDeleteAttribute(attr.id)}
                                            style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer', opacity: 0.6 }}
                                            onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                                            onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <div style={{ backgroundColor: '#F9FAFB', padding: '12px', borderRadius: '12px', border: '1px solid #F3F4F6' }}>
                                        <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: '900', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
                                            Valores Sugeridos
                                        </label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {attr.suggested_values.map(val => (
                                                <span key={val} style={{ 
                                                    display: 'inline-flex', alignItems: 'center', gap: '6px', 
                                                    backgroundColor: 'white', border: '1.5px solid #E5E7EB', 
                                                    padding: '6px 12px', borderRadius: '100px', fontSize: '0.85rem', 
                                                    fontWeight: '700', color: '#374151' 
                                                }}>
                                                    {val}
                                                    <button 
                                                        onClick={() => handleRemoveValue(attr.id, val)}
                                                        style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, display: 'flex' }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </span>
                                            ))}
                                            <input 
                                                placeholder="+ Añadir..."
                                                value={newValueInputs[attr.id] || ''}
                                                onChange={(e) => setNewValueInputs({ ...newValueInputs, [attr.id]: e.target.value })}
                                                onKeyPress={(e) => e.key === 'Enter' && handleAddValue(attr.id)}
                                                style={{ 
                                                    border: '1.5px dashed #D1D5DB', background: 'none', 
                                                    padding: '6px 12px', borderRadius: '100px', fontSize: '0.85rem', 
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

                <div style={{ marginTop: '2.5rem', display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#FFF7ED', padding: '1rem', borderRadius: '16px', border: '1px solid #FFEDD5' }}>
                    <AlertCircle size={20} color="#EA580C" />
                    <p style={{ fontSize: '0.8rem', color: '#9A3412', margin: 0, fontWeight: '500' }}>
                        Los cambios realizados aquí son globales. Si eliminas un valor, ya no se podrá seleccionar en nuevos productos, pero no afectará a los SKUs ya creados.
                    </p>
                </div>
                
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes spin { to { transform: rotate(360deg); } }
                ` }} />
            </div>
        </div>
    );
}
