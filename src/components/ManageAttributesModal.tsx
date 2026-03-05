'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface MasterAttribute {
    id: string;
    name: string;
    suggested_values: string[];
}

interface ManageAttributesModalProps {
    onClose: () => void;
}

const INITIAL_ATTRIBUTES = [
    { name: 'Madurez', values: ['Verde', 'Pintón', 'Maduro', 'Sobremaduro'] },
    { name: 'Tamaño', values: ['Pequeño', 'Mediano', 'Grande', 'Extra Grande'] },
    { name: 'Calidad', values: ['Primera (Extra)', 'Segunda (Estándar)', 'Industrial'] },
    { name: 'Presentación', values: ['Granel', 'Empacado', 'Malla', 'Caja'] },
    { name: 'Corte', values: ['Entero', 'Picado', 'Troceado', 'Pelado'] },
    { name: 'Proceso', values: ['Lavado', 'Sucio', 'Cepillado'] }
];

export default function ManageAttributesModal({ onClose }: ManageAttributesModalProps) {
    const [attributes, setAttributes] = useState<MasterAttribute[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newAttrName, setNewAttrName] = useState('');

    const fetchAttributes = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('product_attributes_master')
                .select('*')
                .order('name', { ascending: true });
            
            if (error) {
                console.warn('Supabase fetch issue:', error.message, error.code);
                if (error.code === '42P01') { // Table doesn't exist - Common on first setup
                    console.info('Table product_attributes_master missing. Using local initial list.');
                    // Map local INITIAL_ATTRIBUTES to the format the table uses
                    const mapped = INITIAL_ATTRIBUTES.map((a, i) => ({ 
                        id: `local-${i}`, 
                        name: a.name, 
                        suggested_values: a.values 
                    }));
                    setAttributes(mapped);
                } else {
                    // Si llegamos aquí con un error desconocido, intentamos desmenuzarlo
                    console.error('Unhandled database error detail:', {
                        msg: error?.message,
                        code: error?.code,
                        full: error,
                        props: error ? Object.getOwnPropertyNames(error) : 'null'
                    });
                    const mapped = INITIAL_ATTRIBUTES.map((a, i) => ({ 
                        id: `local-${i}`, 
                        name: a.name, 
                        suggested_values: a.values 
                    }));
                    setAttributes(mapped);
                }
            } else {
                setAttributes(data || []);
            }
        } catch (error: unknown) {
            const err = error as Error;
            console.error('❌ Error crítico en fetchAttributes:', err.message || err);
            if (err.message?.includes('Unexpected token') || err.message?.includes('valid JSON')) {
                console.error('💡 TIP: La respuesta de Supabase es HTML. Esto ocurre cuando la URL es incorrecta (apunta al sitio web en vez de a la API) o cuando el proyecto de Supabase está en pausa.');
            }
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
            
            if (error) {
                console.error('Insert error:', error);
                throw error;
            }
            if (data && data.length > 0) {
                setAttributes([...attributes, data[0]]);
            }
            setNewAttrName('');
        } catch (err) {
            console.error('Catch error:', err);
            alert('Error añadiendo atributo. ¿Quizás ya existe?');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateValues = async (id: string, valuesStr: string) => {
        const values = valuesStr.split(',').map(v => v.trim()).filter(v => v !== '');
        
        // Si es un ID local (vista previa), solo actualizamos el estado visual
        if (id.toString().startsWith('local-')) {
            console.info('Actualización local (Vista Previa):', values);
            setAttributes(attributes.map(a => a.id === id ? { ...a, suggested_values: values } : a));
            return;
        }

        try {
            const { error } = await supabase
                .from('product_attributes_master')
                .update({ suggested_values: values })
                .eq('id', id);
            
            if (error) {
                console.error('Update fail:', error.message, error.code);
                throw error;
            }
            setAttributes(attributes.map(a => a.id === id ? { ...a, suggested_values: values } : a));
        } catch (err: unknown) {
            const error = err as Error;
            console.error('Error updating values in DB:', error?.message || error);
            alert('No se pudo guardar permanentemente. ¿Está la tabla configurada?');
        }
    };

    const handleDeleteAttribute = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este tipo de variación? No afectará a los productos existentes pero ya no aparecerá como opción maestra.')) return;
        
        if (id.toString().startsWith('local-')) {
            setAttributes(attributes.filter(a => a.id !== id));
            return;
        }

        try {
            const { error } = await supabase
                .from('product_attributes_master')
                .delete()
                .eq('id', id);
            
            if (error) {
                console.error('Delete fail:', error.message, error.code);
                throw error;
            }
            setAttributes(attributes.filter(a => a.id !== id));
        } catch (err: unknown) {
            const error = err as Error;
            console.error('Error deleting attribute from DB:', error?.message || error);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                backgroundColor: 'white',
                width: '90%',
                maxWidth: '600px',
                borderRadius: '24px',
                padding: '2rem',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '85vh'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#111827' }}>Variaciones Maestras 🧬</h2>
                        <p style={{ fontSize: '0.9rem', color: '#6B7280' }}>Define los tipos y valores sugeridos para todos tus productos.</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9CA3AF' }}>✕</button>
                </div>

                {attributes.some(a => a.id.toString().startsWith('local-')) && (
                    <div style={{ backgroundColor: '#FEF3C7', color: '#92400E', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid #FDE68A', fontSize: '0.85rem', fontWeight: '600' }}>
                        ⚠️ <b>Modo Vista Previa:</b> La tabla no existe en DB. Puedes usar estas opciones para crear productos, pero para editarlas de forma permanente debes ejecutar el script SQL de &quot;Data Maestra&quot;.
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px', marginBottom: '2rem' }}>
                    <input 
                        type="text" 
                        placeholder="Nuevo tipo: Ej. Color, Calibre..." 
                        value={newAttrName}
                        onChange={(e) => setNewAttrName(e.target.value)}
                        style={{ flex: 1, padding: '0.8rem 1.2rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '1rem', fontWeight: '600' }}
                    />
                    <button 
                        onClick={handleAddAttribute}
                        disabled={saving || !newAttrName.trim()}
                        style={{ 
                            padding: '0.8rem 1.5rem', 
                            backgroundColor: '#2563EB', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '12px', 
                            fontWeight: '700', 
                            cursor: 'pointer',
                            opacity: saving ? 0.5 : 1
                        }}
                    >
                        {saving ? '...' : '+ Añadir'}
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: '#6B7280' }}>Cargando configuraciones...</div>
                    ) : attributes.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: '#F9FAFB', borderRadius: '16px', border: '2px dashed #E5E7EB' }}>
                            <p style={{ color: '#6B7280', fontSize: '0.95rem' }}>No hay variaciones maestras aún.</p>
                            <p style={{ fontSize: '0.8rem', color: '#9CA3AF', marginTop: '4px' }}>Crea una para que rinda más configurar SKU hijos.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {attributes.map(attr => (
                                <div key={attr.id} style={{ padding: '1.2rem', backgroundColor: '#F9FAFB', borderRadius: '16px', border: '1px solid #F3F4F6' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                                        <span style={{ fontWeight: '800', color: '#111827', fontSize: '1.1rem' }}>{attr.name}</span>
                                        <button 
                                            onClick={() => handleDeleteAttribute(attr.id)}
                                            style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer' }}
                                        >
                                            ELIMINAR
                                        </button>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '4px' }}>
                                            VALORES (Separados por coma)
                                        </label>
                                        <input 
                                            type="text" 
                                            defaultValue={attr.suggested_values.join(', ')}
                                            onBlur={(e) => handleUpdateValues(attr.id, e.target.value)}
                                            placeholder="Valor 1, Valor 2, Valor 3..."
                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '0.9rem' }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ marginTop: '2rem', textAlign: 'right' }}>
                    <button 
                        onClick={onClose} 
                        style={{ 
                            padding: '0.8rem 2rem', 
                            backgroundColor: '#F3F4F6', 
                            color: '#4B5563', 
                            border: 'none', 
                            borderRadius: '12px', 
                            fontWeight: '700', 
                            cursor: 'pointer' 
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
