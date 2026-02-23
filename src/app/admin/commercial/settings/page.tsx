'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

export default function PricingSettingsPage() {
    // Data
    const [models, setModels] = useState<any[]>([]);
    const [selectedModel, setSelectedModel] = useState<any>(null);
    const [rules, setRules] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]); // For search

    // UI
    const [loadingModels, setLoadingModels] = useState(true);
    const [loadingRules, setLoadingRules] = useState(false);
    const [isCreating, setIsCreating] = useState(false); // Creating Model
    const [showRuleModal, setShowRuleModal] = useState(false); // Creating Rule

    // Forms
    const [newModelName, setNewModelName] = useState('');
    const [newModelMargin, setNewModelMargin] = useState(20);
    const [newModelDesc, setNewModelDesc] = useState('');

    // Editing State
    const [isEditingModel, setIsEditingModel] = useState(false);
    const [editModelData, setEditModelData] = useState({ name: '', description: '', margin: 0 });

    const [ruleProductSearch, setRuleProductSearch] = useState('');
    const [ruleSelectedProduct, setRuleSelectedProduct] = useState<any>(null);
    const [ruleAdjustment, setRuleAdjustment] = useState(0);

    const fetchModels = async () => {
        setLoadingModels(true);
        const { data, error } = await supabase
            .from('pricing_models')
            .select('*')
            .order('name', { ascending: true });

        if (data) setModels(data);
        if (data && data.length > 0 && !selectedModel) setSelectedModel(data[0]); // Select first
        setLoadingModels(false);
    };

    const fetchRules = async (modelId: string) => {
        setLoadingRules(true);
        // Join with products to show names
        const { data, error } = await supabase
            .from('pricing_rules')
            .select(`
                *,
                product:products (id, name, unit_of_measure)
            `)
            .eq('model_id', modelId);

        if (data) setRules(data);
        setLoadingRules(false);
    };

    useEffect(() => {
        fetchModels();
    }, []);

    useEffect(() => {
        if (selectedModel) {
            fetchRules(selectedModel.id);
            // Reset edit state when switching models
            setIsEditingModel(false);
        } else {
            setRules([]);
        }
    }, [selectedModel]);

    // --- MODEL ACTIONS ---
    const createModel = async () => {
        if (!newModelName) return alert('Nombre requerido');
        const { data, error } = await supabase
            .from('pricing_models')
            .insert({
                name: newModelName,
                base_margin_percent: newModelMargin,
                description: newModelDesc
            })
            .select()
            .single();

        if (error) return alert('Error creando modelo: ' + error.message);

        setModels([...models, data]);
        setSelectedModel(data); // Switch to new
        setIsCreating(false);
        setNewModelName('');
        setNewModelDesc('');
        setNewModelMargin(20);
    };

    const saveModelChanges = async () => {
        if (!selectedModel) return;
        const { error } = await supabase
            .from('pricing_models')
            .update({
                name: editModelData.name,
                description: editModelData.description,
                base_margin_percent: editModelData.margin
            })
            .eq('id', selectedModel.id);

        if (error) {
            alert('Error actualizando: ' + error.message);
        } else {
            // Update local state
            const updated = { ...selectedModel, name: editModelData.name, description: editModelData.description, base_margin_percent: editModelData.margin };
            setSelectedModel(updated);
            // Update list
            setModels(models.map(m => m.id === updated.id ? updated : m));
            setIsEditingModel(false);
        }
    };

    const deleteModel = async (id: string) => {
        if (!confirm('¿Eliminar este modelo y todas sus reglas?')) return;
        await supabase.from('pricing_models').delete().eq('id', id);
        fetchModels(); // Refresh
        if (selectedModel?.id === id) setSelectedModel(null);
    };

    // --- RULE ACTIONS ---
    const searchProducts = async (term: string) => {
        setRuleProductSearch(term);
        if (term.length < 2) {
            setProducts([]);
            return;
        }
        const { data } = await supabase.from('products').select('id, name, unit_of_measure').ilike('name', `%${term}%`).limit(5);
        if (data) setProducts(data);
    };

    const createRule = async () => {
        if (!ruleSelectedProduct) return alert('Selecciona un producto');

        const { error } = await supabase.from('pricing_rules').insert({
            model_id: selectedModel.id,
            product_id: ruleSelectedProduct.id,
            margin_adjustment: ruleAdjustment
        });

        if (error) return alert('Error: ' + error.message);

        fetchRules(selectedModel.id);
        setShowRuleModal(false);
        setRuleSelectedProduct(null);
        setRuleProductSearch('');
        setRuleAdjustment(0);
    };

    const deleteRule = async (id: string) => {
        await supabase.from('pricing_rules').delete().eq('id', id);
        fetchRules(selectedModel.id);
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', fontFamily: 'Inter, sans-serif' }}>
            <Navbar />
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <Link href="/admin/commercial" style={{ textDecoration: 'none', color: '#6B7280', fontWeight: '600' }}>← Volver</Link>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) 2fr', gap: '2rem', alignItems: 'start' }}>

                    {/* --- LEFT: MODELS LIST --- */}
                    <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0 }}>Modelos</h2>
                            <button onClick={() => setIsCreating(true)} style={{ padding: '0.5rem', borderRadius: '6px', border: 'none', backgroundColor: '#111827', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>+</button>
                        </div>

                        {/* CREATE FORM */}
                        {isCreating && (
                            <div style={{ padding: '1rem', backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                                <input placeholder="Nombre (ej: A1)" value={newModelName} onChange={e => setNewModelName(e.target.value)} style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB' }} />
                                <input placeholder="Uso (ej: Hoteles grandes)" value={newModelDesc} onChange={e => setNewModelDesc(e.target.value)} style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: '600' }}>Margen %:</label>
                                    <input type="number" value={newModelMargin || ''} onChange={e => {
                                        const val = parseFloat(e.target.value);
                                        setNewModelMargin(isNaN(val) ? 0 : val);
                                    }} style={{ width: '80px', padding: '0.3rem' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button onClick={createModel} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', backgroundColor: '#10B981', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Guardar</button>
                                    <button onClick={() => setIsCreating(false)} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', backgroundColor: '#D1D5DB', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Cancelar</button>
                                </div>
                            </div>
                        )}

                        <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                            {loadingModels ? <div style={{ padding: '1rem' }}>Cargando...</div> : models.map(m => (
                                <div
                                    key={m.id}
                                    onClick={() => setSelectedModel(m)}
                                    style={{
                                        padding: '1.2rem',
                                        borderBottom: '1px solid #F3F4F6',
                                        cursor: 'pointer',
                                        backgroundColor: selectedModel?.id === m.id ? '#EFF6FF' : 'white',
                                        borderLeft: selectedModel?.id === m.id ? '4px solid #2563EB' : '4px solid transparent',
                                        transition: 'background 0.2s'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1, paddingRight: '1rem' }}>
                                            <div style={{ fontWeight: '900', fontSize: '1.2rem', color: '#111827', marginBottom: '0.3rem' }}>
                                                {m.name}
                                            </div>
                                            {m.description && (
                                                <div style={{ fontSize: '0.9rem', color: '#6B7280', lineHeight: '1.4' }}>
                                                    <span style={{ fontWeight: '600', color: '#4B5563' }}>Uso:</span> {m.description}
                                                </div>
                                            )}
                                        </div>

                                        <div style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                                            backgroundColor: selectedModel?.id === m.id ? '#DBEAFE' : '#ECFDF5',
                                            padding: '0.5rem 0.8rem', borderRadius: '8px', minWidth: '70px',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                        }}>
                                            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: '800', color: selectedModel?.id === m.id ? '#1E40AF' : '#047857' }}>MARGEN</span>
                                            <span style={{ fontWeight: '900', fontSize: '1.4rem', color: selectedModel?.id === m.id ? '#1D4ED8' : '#059669' }}>
                                                {m.base_margin_percent}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* --- RIGHT: RULES MANAGMENT --- */}
                    {selectedModel ? (
                        <div>
                            {/* HEADER (EDITABLE) */}
                            {isEditingModel ? (
                                <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '1.5rem' }}>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Nombre del Modelo</label>
                                        <input
                                            value={editModelData.name}
                                            onChange={e => setEditModelData({ ...editModelData, name: e.target.value })}
                                            style={{ width: '100%', padding: '0.5rem', fontSize: '1.2rem', fontWeight: 'bold', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Uso / Descripción</label>
                                        <input
                                            value={editModelData.description}
                                            onChange={e => setEditModelData({ ...editModelData, description: e.target.value })}
                                            style={{ width: '100%', padding: '0.5rem', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Margen Base (%)</label>
                                        <input
                                            type="number"
                                            value={editModelData.margin || ''}
                                            onChange={e => {
                                                const val = parseFloat(e.target.value);
                                                setEditModelData({ ...editModelData, margin: isNaN(val) ? 0 : val });
                                            }}
                                            style={{ width: '100px', padding: '0.5rem', fontSize: '1.2rem', fontWeight: 'bold', color: '#059669', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button onClick={saveModelChanges} style={{ padding: '0.5rem 1rem', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>💾 Guardar Cambios</button>
                                        <button onClick={() => setIsEditingModel(false)} style={{ padding: '0.5rem 1rem', backgroundColor: '#F3F4F6', color: '#4B5563', border: '1px solid #D1D5DB', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h1 style={{ fontSize: '2rem', fontWeight: '900', margin: 0, color: '#111827' }}>{selectedModel.name}</h1>
                                        <p style={{ color: '#6B7280', margin: '0.5rem 0 0 0', fontWeight: '500' }}>{selectedModel.description}</p>
                                        <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#059669', fontWeight: 'bold' }}>Margen Base: {selectedModel.base_margin_percent}%</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => {
                                                setEditModelData({
                                                    name: selectedModel.name,
                                                    description: selectedModel.description,
                                                    margin: selectedModel.base_margin_percent
                                                });
                                                setIsEditingModel(true);
                                            }}
                                            style={{ color: '#2563EB', background: 'none', border: '1px solid #BFDBFE', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                                        >
                                            ✏️ Editar
                                        </button>
                                        <button onClick={() => deleteModel(selectedModel.id)} style={{ color: '#EF4444', background: 'none', border: '1px solid #FECACA', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>🗑️</button>
                                    </div>
                                </div>
                            )}

                            {/* RULES LIST */}
                            <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                                <div style={{ padding: '1.5rem', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0 }}>Reglas de Excepción ({rules.length})</h3>
                                    <button
                                        onClick={() => setShowRuleModal(true)}
                                        style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', backgroundColor: '#111827', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                    >
                                        + Nueva Regla
                                    </button>
                                </div>

                                {rules.length === 0 ? (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: '#9CA3AF' }}>
                                        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>✨</div>
                                        <p>No hay reglas especiales.</p>
                                        <p style={{ fontSize: '0.9rem' }}>Todos los productos usan el margen base del <strong style={{ color: '#059669' }}>{selectedModel.base_margin_percent}%</strong>.</p>
                                    </div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6B7280' }}>
                                                <th style={{ padding: '1rem', textAlign: 'left' }}>Producto</th>
                                                <th style={{ padding: '1rem', textAlign: 'left' }}>Ajuste</th>
                                                <th style={{ padding: '1rem', textAlign: 'left' }}>Margen Final</th>
                                                <th style={{ padding: '1rem' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rules.map(rule => {
                                                const finalMargin = selectedModel.base_margin_percent + rule.margin_adjustment;
                                                return (
                                                    <tr key={rule.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                        <td style={{ padding: '1rem', fontWeight: '600' }}>{rule.product?.name}</td>
                                                        <td style={{ padding: '1rem' }}>
                                                            {rule.margin_adjustment > 0 ? (
                                                                <span style={{ backgroundColor: '#ECFDF5', color: '#059669', padding: '0.3rem 0.6rem', borderRadius: '6px', fontWeight: 'bold' }}>+{rule.margin_adjustment}%</span>
                                                            ) : (
                                                                <span style={{ backgroundColor: '#FEF2F2', color: '#DC2626', padding: '0.3rem 0.6rem', borderRadius: '6px', fontWeight: 'bold' }}>{rule.margin_adjustment}%</span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '1rem' }}>
                                                            <span style={{ color: '#1F2937', fontWeight: '900', fontSize: '1rem' }}>
                                                                {finalMargin}%
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                            <button onClick={() => deleteRule(rule.id)} style={{ color: '#9CA3AF', cursor: 'pointer', border: 'none', background: 'none', fontSize: '1.2rem' }}>×</button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: '3rem', textAlign: 'center', color: '#9CA3AF', border: '2px dashed #E5E7EB', borderRadius: '12px' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👈</div>
                            Selecciona un modelo de la lista para ver o editar sus reglas.
                        </div>
                    )}
                </div>

                {/* --- MODAL ADD RULE --- */}
                {showRuleModal && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ marginTop: 0 }}>Agregar Excepción</h3>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.3rem' }}>Buscar Producto:</label>
                                <input
                                    value={ruleProductSearch}
                                    onChange={e => searchProducts(e.target.value)}
                                    placeholder="Escribe para buscar..."
                                    style={{ width: '100%', padding: '0.8rem', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                                />
                                {products.length > 0 && !ruleSelectedProduct && (
                                    <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: '6px', marginTop: '0.5rem' }}>
                                        {products.map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => { setRuleSelectedProduct(p); setProducts([]); }}
                                                style={{ padding: '0.5rem', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', fontSize: '0.9rem' }}
                                            >
                                                {p.name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {ruleSelectedProduct && (
                                <div style={{ padding: '0.8rem', backgroundColor: '#F0FDF4', color: '#166534', borderRadius: '6px', marginBottom: '1rem', fontWeight: 'bold', fontSize: '0.9rem', border: '1px solid #BBF7D0' }}>
                                    ✓ {ruleSelectedProduct.name}
                                </div>
                            )}

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.3rem' }}>Ajuste de Margen (+/- %):</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input
                                        type="number"
                                        value={ruleAdjustment || 0}
                                        onChange={e => {
                                            const val = parseFloat(e.target.value);
                                            setRuleAdjustment(isNaN(val) ? 0 : val);
                                        }}
                                        style={{ width: '80px', padding: '0.8rem', border: '1px solid #D1D5DB', borderRadius: '6px', fontWeight: 'bold', fontSize: '1rem' }}
                                    />
                                    <span style={{ fontSize: '0.9rem', color: '#6B7280' }}>
                                        Margen Final: <strong>{selectedModel.base_margin_percent + ruleAdjustment}%</strong>
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button onClick={() => setShowRuleModal(false)} style={{ flex: 1, padding: '0.8rem', borderRadius: '6px', border: '1px solid #D1D5DB', cursor: 'pointer', backgroundColor: 'white', fontWeight: '600' }}>Cancelar</button>
                                <button onClick={createRule} style={{ flex: 1, padding: '0.8rem', borderRadius: '6px', backgroundColor: '#111827', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Guardar Regla</button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </main>
    );
}
