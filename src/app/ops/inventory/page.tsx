'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import { useRouter } from 'next/navigation';
import { isAbortError } from '@/lib/errorUtils';

interface InventoryTask {
    id: string;
    scheduled_date: string;
    status: 'pending' | 'in_progress' | 'completed';
    items: TaskItem[];
}

interface TaskItem {
    id: string;
    product_id: string;
    products: {
        name: string;
        sku: string;
        unit_of_measure: string;
        category?: string;
    };
    warehouse_id: string;
    actual_qty: number | null;
}

export default function OpsInventoryPage() {
    const [loading, setLoading] = useState(true);
    const [activeTask, setActiveTask] = useState<InventoryTask | null>(null);
    const [counts, setCounts] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [activeView, setActiveView] = useState<'audits' | 'returns'>('audits');
    const [pendingReturns, setPendingReturns] = useState<any[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
    const router = useRouter();
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        const today = new Date().toISOString().split('T')[0];
        
        try {
            const { data, error } = await supabase
                .from('inventory_random_tasks')
                .select(`
                    *,
                    items:inventory_task_items (
                        id,
                        product_id,
                        actual_qty,
                        products (name, sku, unit_of_measure, category)
                    )
                `)
                .or(`scheduled_date.eq.${today},status.eq.pending`)
                .order('created_at', { ascending: false });

            if (!isMounted.current) return;

            if (!error && data) {
                const pending = data.find(t => t.status !== 'completed');
                if (pending) setActiveTask(pending);
                else setActiveTask(null);
            }
        } catch (err: unknown) {
            if (isAbortError(err)) return;
            console.error('Error fetching floor tasks:', err);
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    }, []);

    const fetchReturns = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('inventory_movements')
                .select(`
                    id, created_at, quantity, notes, evidence_url,
                    products (name, sku, unit_of_measure)
                `)
                .eq('status_to', 'returned')
                .is('admin_decision', null)
                .order('created_at', { ascending: false });

            if (!error && data) {
                setPendingReturns(data);
            }
        } catch (err) {
            console.error('Error fetching returns:', err);
        }
    }, []);

    useEffect(() => {
        if (activeView === 'audits') fetchTasks();
        else fetchReturns();
    }, [activeView, fetchTasks, fetchReturns]);

    const handleSubmitCount = async () => {
        if (!activeTask) return;
        setSubmitting(true);

        try {
            for (const item of activeTask.items) {
                const qtyStr = counts[item.id];
                if (qtyStr !== undefined && qtyStr !== '') {
                    const { error } = await supabase
                        .from('inventory_task_items')
                        .update({ 
                            actual_qty: parseFloat(qtyStr),
                        })
                        .eq('id', item.id);
                    if (error) throw error;
                }
            }

            await supabase
                .from('inventory_random_tasks')
                .update({ status: 'completed' })
                .eq('id', activeTask.id);

            window.showToast?.('✅ Auditoría a ciegas completada', 'success');
            setActiveTask(null);
            fetchTasks();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Error desconocido';
            alert('Error al guardar: ' + message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleReturnDecision = async (movementId: string, decision: 'inventory' | 'waste' | 'donation') => {
        setSubmitting(true);
        try {
            const movement = pendingReturns.find(m => m.id === movementId);
            if (!movement) return;

            const { error: updateError } = await supabase
                .from('inventory_movements')
                .update({ 
                    admin_decision: decision,
                    status_to: decision === 'inventory' ? 'available' : 'exit',
                    notes: `${movement.notes || ''} | Decisión Bodega: ${decision.toUpperCase()}`
                })
                .eq('id', movementId);

            if (updateError) throw updateError;

            window.showToast?.(`✅ Producto gestionado como ${decision}`, 'success');
            fetchReturns();
        } catch (error) {
            alert('Error al procesar decisión');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--ops-bg)' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📦</div>
                <div style={{ fontWeight: '700', color: 'var(--ops-text-muted)' }}>Cargando módulo de inventario...</div>
            </div>
        </div>
    );

    const categoriesFromTask = activeTask 
        ? Array.from(new Set(activeTask.items.map(item => item.products.category).filter(Boolean))) as string[]
        : [];
    
    const sections = ['Todos', ...categoriesFromTask.sort()];

    const filteredItems = activeTask?.items.filter(item => {
        if (selectedCategory === 'Todos') return true;
        return item.products.category === selectedCategory;
    }) || [];

    return (
        <main style={{ minHeight: '100vh', backgroundColor: 'var(--ops-bg)', paddingBottom: '5rem', color: 'var(--ops-text)' }}>
            <Toast />
            
            <div style={{ maxWidth: '500px', margin: '0 auto', padding: '2rem 1rem' }}>
                <header style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.8rem', backgroundColor: 'var(--ops-surface)', padding: '0.5rem', borderRadius: '100px', marginBottom: '1.5rem', border: '1px solid var(--ops-border)' }}>
                        <button 
                            onClick={() => setActiveView('audits')}
                            style={{ padding: '0.5rem 1.2rem', borderRadius: '100px', border: 'none', backgroundColor: activeView === 'audits' ? 'var(--ops-primary)' : 'transparent', color: activeView === 'audits' ? 'white' : 'var(--ops-text-muted)', fontWeight: '800', fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                            📋 Auditorías
                        </button>
                        <button 
                            onClick={() => setActiveView('returns')}
                            style={{ padding: '0.5rem 1.2rem', borderRadius: '100px', border: 'none', backgroundColor: activeView === 'returns' ? '#F59E0B' : 'transparent', color: activeView === 'returns' ? 'white' : 'var(--ops-text-muted)', fontWeight: '800', fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                            🚛 Retornos {pendingReturns.length > 0 && <span style={{ marginLeft: '4px', backgroundColor: 'white', color: '#F59E0B', padding: '2px 6px', borderRadius: '50%', fontSize: '0.6rem' }}>{pendingReturns.length}</span>}
                        </button>
                    </div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '950', color: 'var(--ops-text)', margin: 0, letterSpacing: '-1px' }}>
                        {activeView === 'audits' ? 'Control de Existencias' : 'Gestión de Retornos'}
                    </h1>
                </header>

                {activeView === 'audits' ? (
                    !activeTask ? (
                         <div style={{ backgroundColor: 'var(--ops-surface)', padding: '3rem 2rem', borderRadius: '32px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', border: '1px solid var(--ops-border)' }}>
                            <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>✨</div>
                            <h2 style={{ fontWeight: '900', color: 'var(--ops-text)', fontSize: '1.5rem', marginBottom: '0.5rem' }}>¡Todo al día!</h2>
                            <p style={{ color: 'var(--ops-text-muted)', lineHeight: '1.6' }}>No hay auditorías a ciegas pendientes.</p>
                            <button onClick={() => router.push('/ops')} style={{ marginTop: '2rem', width: '100%', padding: '1.2rem', borderRadius: '16px', border: 'none', background: 'var(--ops-text)', color: 'var(--ops-surface)', fontWeight: '800', cursor: 'pointer' }}>Volver al Menú</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                             {/* Category Filter Buttons */}
                             <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0.5rem 0', scrollbarWidth: 'none' }}>
                                {sections.map(section => (
                                    <button
                                        key={section}
                                        onClick={() => setSelectedCategory(section)}
                                        style={{
                                            padding: '0.6rem 1.2rem',
                                            borderRadius: '100px',
                                            backgroundColor: selectedCategory === section ? 'var(--ops-text)' : 'var(--ops-surface)',
                                            color: selectedCategory === section ? 'var(--ops-surface)' : 'var(--ops-text-muted)',
                                            fontWeight: '800',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap',
                                            border: selectedCategory === section ? 'none' : '1px solid var(--ops-border)',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {section}
                                    </button>
                                ))}
                            </div>

                            {filteredItems.map((item: any, idx: number) => (
                                <div key={item.id} style={{ backgroundColor: 'var(--ops-surface)', padding: '1.5rem', borderRadius: '24px', border: '1px solid var(--ops-border)' }}>
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.2rem' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'var(--ops-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: 'var(--ops-primary)' }}>{idx + 1}</div>
                                        <div>
                                            <div style={{ fontWeight: '900', fontSize: '1.1rem' }}>{item.products.name}</div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--ops-text-muted)' }}>{item.products.sku}</div>
                                        </div>
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                        <input 
                                            type="number" 
                                            placeholder="0.00" 
                                            value={counts[item.id] || ''} 
                                            onChange={(e) => setCounts({...counts, [item.id]: e.target.value})}
                                            style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '2px solid var(--ops-border)', backgroundColor: 'var(--ops-bg)', fontSize: '1.4rem', fontWeight: '900', color: 'var(--ops-text)' }}
                                        />
                                        <div style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', color: 'var(--ops-text-muted)' }}>{item.products.unit_of_measure}</div>
                                    </div>
                                </div>
                            ))}
                            <button onClick={handleSubmitCount} disabled={submitting} style={{ width: '100%', padding: '1.5rem', borderRadius: '24px', border: 'none', background: 'var(--ops-primary)', color: 'white', fontSize: '1.1rem', fontWeight: '900', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.4)' }}>
                                {submitting ? '⏳ Guardando...' : 'Finalizar Conteo'}
                            </button>
                        </div>
                    )
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {pendingReturns.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'var(--ops-surface)', borderRadius: '32px', border: '1px solid var(--ops-border)' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚛</div>
                                <div style={{ fontWeight: '800', color: 'var(--ops-text-muted)' }}>No hay productos regresando de ruta</div>
                            </div>
                        ) : (
                            pendingReturns.map(ret => (
                                <div key={ret.id} style={{ backgroundColor: 'var(--ops-surface)', borderRadius: '24px', border: '1px solid var(--ops-border)', overflow: 'hidden' }}>
                                    {ret.evidence_url && (
                                        <div style={{ height: '150px', position: 'relative' }}>
                                            <img src={ret.evidence_url} alt="Evidencia ruta" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.65rem', color: 'white' }}>📸 FOTO DE RUTA</div>
                                        </div>
                                    )}
                                    <div style={{ padding: '1.5rem' }}>
                                        <div style={{ marginBottom: '1rem' }}>
                                            <div style={{ fontWeight: '900', fontSize: '1.1rem' }}>{ret.products.name}</div>
                                            <div style={{ fontSize: '0.85rem', color: '#F59E0B', fontWeight: '800' }}>Regresan: {ret.quantity} {ret.products.unit_of_measure}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--ops-text-muted)', marginTop: '4px' }}>💬 {ret.notes}</div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                                            <button 
                                                onClick={() => handleReturnDecision(ret.id, 'inventory')}
                                                style={{ padding: '0.8rem 0.4rem', borderRadius: '12px', border: 'none', background: '#10B981', color: 'white', fontSize: '0.65rem', fontWeight: '900', cursor: 'pointer' }}
                                            >
                                                📦 BODEGA
                                            </button>
                                            <button 
                                                onClick={() => handleReturnDecision(ret.id, 'waste')}
                                                style={{ padding: '0.8rem 0.4rem', borderRadius: '12px', border: 'none', background: '#EF4444', color: 'white', fontSize: '0.65rem', fontWeight: '900', cursor: 'pointer' }}
                                            >
                                                🗑️ DESPERD.
                                            </button>
                                            <button 
                                                onClick={() => handleReturnDecision(ret.id, 'donation')}
                                                style={{ padding: '0.8rem 0.4rem', borderRadius: '12px', border: 'none', background: '#3B82F6', color: 'white', fontSize: '0.65rem', fontWeight: '900', cursor: 'pointer' }}
                                            >
                                                🤝 DONA
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
