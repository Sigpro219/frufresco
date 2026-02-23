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
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const router = useRouter();
    const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
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

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

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
                            // Calculate difference server-side or here if needed
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

    if (loading) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--ops-bg)' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📦</div>
                <div style={{ fontWeight: '700', color: 'var(--ops-text-muted)' }}>Cargando cierre de inventario...</div>
            </div>
        </div>
    );

    // Dynamic categories based on active task items
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
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22C55E', padding: '0.4rem 1rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: '800', marginBottom: '1rem' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22C55E' }}></span>
                        OPERACIONES DE PISO
                    </div>
                    <h1 style={{ fontSize: '2.2rem', fontWeight: '950', color: 'var(--ops-text)', margin: 0, letterSpacing: '-1px' }}>Cierre de Inventario del Día</h1>
                </header>

                {!activeTask ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ backgroundColor: 'var(--ops-surface)', padding: '3rem 2rem', borderRadius: '32px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', border: '1px solid var(--ops-border)' }}>
                            <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>✨</div>
                            <h2 style={{ fontWeight: '900', color: 'var(--ops-text)', fontSize: '1.5rem', marginBottom: '0.5rem' }}>¡Todo al día!</h2>
                            <p style={{ color: 'var(--ops-text-muted)', lineHeight: '1.6' }}>No hay auditorías a ciegas pendientes asignadas por el área comercial.</p>
                            <button 
                                onClick={() => router.push('/ops')}
                                style={{ marginTop: '2rem', width: '100%', padding: '1.2rem', borderRadius: '16px', border: 'none', background: 'var(--ops-text)', color: 'var(--ops-surface)', fontWeight: '800', cursor: 'pointer', transition: 'transform 0.2s' }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                Volver al Menú
                            </button>
                        </div>

                        {/* Secondary Action: Returns */}
                        <div style={{ backgroundColor: 'var(--ops-surface)', padding: '2rem', borderRadius: '32px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)', border: '1px solid var(--ops-border)' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--ops-text)', marginBottom: '1rem' }}>🚛 Devoluciones</h3>
                            <button 
                                onClick={() => setIsReturnModalOpen(true)}
                                style={{ width: '100%', padding: '1.2rem', borderRadius: '16px', border: '2px solid var(--ops-border)', background: 'transparent', color: 'var(--ops-text-muted)', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem' }}
                            >
                                📥 Recibir Producto
                            </button>
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ backgroundColor: 'var(--ops-primary)', padding: '1.5rem', borderRadius: '24px', color: 'white', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', opacity: 0.9 }}>Auditoría Solicitada</span>
                                    <h2 style={{ margin: '0.2rem 0', fontWeight: '900', fontSize: '1.4rem' }}>Conteo a Ciegas</h2>
                                </div>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: '0.5rem 0.8rem', borderRadius: '12px', fontWeight: '900', fontSize: '0.9rem' }}>
                                    {activeTask.items.length} ítems
                                </div>
                            </div>
                            <p style={{ margin: '1rem 0 0 0', fontSize: '0.85rem', opacity: 0.9, lineHeight: '1.4' }}>
                                Ingrese las cantidades físicas exactas que ve en bodega. No verá el stock del sistema para no sesgar el conteo.
                            </p>
                        </div>

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
                                        boxShadow: selectedCategory === section ? '0 4px 6px -1px rgba(0,0,0,0.2)' : '0 1px 3px 0 rgba(0,0,0,0.1)',
                                        border: selectedCategory === section ? 'none' : '1px solid var(--ops-border)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {section}
                                </button>
                            ))}
                        </div>

                        {filteredItems.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'var(--ops-surface)', borderRadius: '24px', border: '1px solid var(--ops-border)' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔍</div>
                                <div style={{ fontWeight: '700', color: 'var(--ops-text-muted)' }}>No hay productos en esta sección</div>
                            </div>
                        ) : (
                            filteredItems.map((item, idx) => (
                                <div key={item.id} style={{ backgroundColor: 'var(--ops-surface)', padding: '1.5rem', borderRadius: '24px', border: '1px solid var(--ops-border)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.2rem' }}>
                                        <div style={{ width: '45px', height: '45px', borderRadius: '12px', backgroundColor: 'var(--ops-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: 'var(--ops-primary)', border: '1px solid var(--ops-border)' }}>
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: '900', fontSize: '1.1rem', color: 'var(--ops-text)' }}>{item.products.name}</div>
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--ops-text-muted)' }}>{item.products.sku}</div>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--ops-border)' }}>•</span>
                                                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--ops-primary)', textTransform: 'uppercase' }}>{item.products.category}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                        <input 
                                            type="number"
                                            placeholder="0.00"
                                            value={counts[item.id] || ''}
                                            onChange={(e) => setCounts({...counts, [item.id]: e.target.value})}
                                            style={{ width: '100%', padding: '1.2rem', borderRadius: '16px', border: '2px solid var(--ops-border)', backgroundColor: 'var(--ops-bg)', fontSize: '1.5rem', fontWeight: '950', color: 'var(--ops-text)', boxSizing: 'border-box', outline: 'none' }}
                                        />
                                        <div style={{ position: 'absolute', right: '1.2rem', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', color: 'var(--ops-text-muted)', fontSize: '0.9rem' }}>
                                            {item.products.unit_of_measure}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}

                        <button 
                            onClick={handleSubmitCount}
                            disabled={submitting}
                            style={{ width: '100%', padding: '1.5rem', borderRadius: '24px', border: 'none', background: 'var(--ops-primary)', color: 'white', fontSize: '1.1rem', fontWeight: '900', cursor: submitting ? 'not-allowed' : 'pointer', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.4)', transition: 'all 0.2s', marginTop: '1rem' }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                            {submitting ? '⏳ Guardando...' : 'Finalizar y Sincronizar'}
                        </button>
                    </div>
                )}
            </div>

            {/* Placeholder Return Modal */}
            {isReturnModalOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--ops-surface)', borderRadius: '32px', width: '100%', maxWidth: '400px', padding: '2.5rem', textAlign: 'center', border: '1px solid var(--ops-border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                        <div style={{ fontSize: '3.5rem', marginBottom: '1.5rem' }}>🚛</div>
                        <h2 style={{ fontWeight: '900', color: 'var(--ops-text)', marginBottom: '0.75rem', fontSize: '1.5rem' }}>Módulo de Devoluciones</h2>
                        <p style={{ color: 'var(--ops-text-muted)', fontSize: '1rem', marginBottom: '2.5rem', lineHeight: '1.6' }}>Esta funcionalidad se activará próximamente al integrar las rutas de despacho.</p>
                        <button 
                            onClick={() => setIsReturnModalOpen(false)}
                            style={{ width: '100%', padding: '1.2rem', borderRadius: '18px', border: 'none', background: 'var(--ops-primary)', color: 'white', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}
        </main>
    );
}
