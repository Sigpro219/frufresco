'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
    DEFAULT_WASTE_SUSCEPTIBLE_ACCOUNTING_IDS,
    parseSusceptibleAccountingIds,
    isProductWasteSusceptible
} from '@/lib/inventory/wasteSusceptibleCatalog';
import { Search, CheckCircle2, RotateCcw, Save, Sparkles, Layers, Check } from 'lucide-react';

interface ProductCatalogItem {
    id: string;
    name: string;
    sku?: string;
    accounting_id?: number | null;
    category?: string | null;
    inventory_group?: string | null;
    parent_id?: string | null;
    unit_of_measure?: string;
}

interface WasteSusceptibleProductsManagerProps {
    products: ProductCatalogItem[];
}

export default function WasteSusceptibleProductsManager({
    products
}: WasteSusceptibleProductsManagerProps) {
    const [selectedAccIds, setSelectedAccIds] = useState<Set<number>>(
        () => new Set(DEFAULT_WASTE_SUSCEPTIBLE_ACCOUNTING_IDS)
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [cellFilter, setCellFilter] = useState<string>('ALL');
    const [viewFilter, setViewFilter] = useState<'susceptible' | 'all'>('susceptible');
    const [saving, setSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);

    const loadSettings = useCallback(async () => {
        try {
            const { data } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'waste_susceptible_products')
                .maybeSingle();
            if (data?.value) {
                setSelectedAccIds(parseSusceptibleAccountingIds(data.value));
            }
        } catch (err) {
            console.error('Error loading waste_susceptible_products:', err);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const productsById = useMemo(() => {
        const m = new Map<string, ProductCatalogItem>();
        products.forEach(p => m.set(p.id, p));
        return m;
    }, [products]);

    const availableCells = useMemo(() => {
        const set = new Set<string>();
        products.forEach(p => {
            if (p.inventory_group) set.add(p.inventory_group);
        });
        return Array.from(set).sort();
    }, [products]);

    const filteredProducts = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return products.filter(p => {
            const isSusc = isProductWasteSusceptible(p, selectedAccIds, productsById);
            if (viewFilter === 'susceptible' && !isSusc) return false;
            if (cellFilter !== 'ALL' && (p.inventory_group || '') !== cellFilter) return false;
            if (q) {
                const matchName = (p.name || '').toLowerCase().includes(q);
                const matchId = String(p.accounting_id || '').includes(q);
                const matchSku = (p.sku || '').toLowerCase().includes(q);
                if (!matchName && !matchId && !matchSku) return false;
            }
            return true;
        });
    }, [products, selectedAccIds, productsById, viewFilter, cellFilter, searchQuery]);

    const totalInheritedCount = useMemo(() => {
        return products.filter(p => isProductWasteSusceptible(p, selectedAccIds, productsById)).length;
    }, [products, selectedAccIds, productsById]);

    const handleToggleProduct = (accId: number | null | undefined) => {
        const num = Number(accId);
        if (!Number.isFinite(num) || num <= 0) return;
        setSelectedAccIds(prev => {
            const next = new Set(prev);
            if (next.has(num)) next.delete(num);
            else next.add(num);
            return next;
        });
    };

    const handleResetDefaults = () => {
        setSelectedAccIds(new Set(DEFAULT_WASTE_SUSCEPTIBLE_ACCOUNTING_IDS));
        setStatusMsg('Restaurados los 109 productos base del FORMATO DE DESPERDICIO.xlsx (recuerda Guardar).');
    };

    const handleSave = async () => {
        setSaving(true);
        setStatusMsg(null);
        try {
            const sortedIds = Array.from(selectedAccIds).sort((a, b) => a - b);
            const payload = {
                accounting_ids: sortedIds,
                inherit_children: true,
                source: 'FORMATO DE DESPERDICIO.xlsx',
                updated_at: new Date().toISOString()
            };

            const { data: existing } = await supabase
                .from('app_settings')
                .select('key')
                .eq('key', 'waste_susceptible_products')
                .maybeSingle();

            if (existing) {
                const { error } = await supabase
                    .from('app_settings')
                    .update({ value: JSON.stringify(payload) })
                    .eq('key', 'waste_susceptible_products');
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('app_settings')
                    .insert([{
                        key: 'waste_susceptible_products',
                        value: JSON.stringify(payload),
                        description: 'Catálogo editable de productos susceptibles a desperdicio y merma (SDD DT-18)'
                    }]);
                if (error) throw error;
            }

            setStatusMsg(`Lista guardada con éxito (${sortedIds.length} IDs base • ${totalInheritedCount} SKUs cubiertos con herencia Padre → Hijo).`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error desconocido';
            setStatusMsg('Error al guardar: ' + msg);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '1.5rem',
            marginTop: '1.5rem',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)'
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                marginBottom: '1rem'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: '#FEF3C7',
                            color: '#B45309',
                            fontSize: '0.7rem',
                            fontWeight: 800
                        }}>
                            SDD DT-18 • CERO-SQL
                        </span>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#0F172A' }}>
                            Catálogo Editable de Productos Susceptibles a Desperdicio y Basura (Cols Q y R)
                        </h3>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                        Define qué productos se imprimen automáticamente en el formato bicolumna del Módulo de Pedidos. Incluye <strong>Herencia Automática Padre → Hijo</strong>.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={handleResetDefaults}
                        style={{
                            padding: '0.5rem 0.85rem',
                            borderRadius: '10px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#F8FAFC',
                            color: '#475569',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <RotateCcw size={14} /> Restaurar 109 Base (Excel)
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '10px',
                            border: 'none',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            cursor: saving ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)'
                        }}
                    >
                        <Save size={14} /> {saving ? 'Guardando...' : `Guardar Lista (${selectedAccIds.size} IDs)`}
                    </button>
                </div>
            </div>

            {statusMsg && (
                <div style={{
                    padding: '0.65rem 1rem',
                    borderRadius: '10px',
                    backgroundColor: '#ECFDF5',
                    border: '1px solid #A7F3D0',
                    color: '#065F46',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <CheckCircle2 size={16} />
                    <span>{statusMsg}</span>
                </div>
            )}

            {/* Filtros */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap',
                marginBottom: '1rem'
            }}>
                <div style={{ position: 'relative', flex: '1 1 260px' }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Buscar por #ID contable, nombre o SKU..."
                        style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem 0.5rem 2rem',
                            borderRadius: '10px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.82rem',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>

                <select
                    value={cellFilter}
                    onChange={e => setCellFilter(e.target.value)}
                    style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '10px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#334155'
                    }}
                >
                    <option value="ALL">Todas las Células ({products.length})</option>
                    {availableCells.map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>

                <div style={{ display: 'inline-flex', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '10px', gap: '4px' }}>
                    <button
                        type="button"
                        onClick={() => setViewFilter('susceptible')}
                        style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: viewFilter === 'susceptible' ? '#0D7A57' : 'transparent',
                            color: viewFilter === 'susceptible' ? '#FFFFFF' : '#475569',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            cursor: 'pointer'
                        }}
                    >
                        Susceptibles ({totalInheritedCount})
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewFilter('all')}
                        style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: viewFilter === 'all' ? '#0F172A' : 'transparent',
                            color: viewFilter === 'all' ? '#FFFFFF' : '#475569',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            cursor: 'pointer'
                        }}
                    >
                        Todo el Catálogo ({products.length})
                    </button>
                </div>
            </div>

            {/* Grid compacta de productos */}
            <div style={{
                maxHeight: '360px',
                overflowY: 'auto',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '0.5rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '0.45rem',
                backgroundColor: '#F8FAFC'
            }}>
                {filteredProducts.map(p => {
                    const accId = Number(p.accounting_id);
                    const isDirect = Number.isFinite(accId) && selectedAccIds.has(accId);
                    const isInherited = !isDirect && isProductWasteSusceptible(p, selectedAccIds, productsById);
                    const active = isDirect || isInherited;

                    return (
                        <div
                            key={p.id}
                            onClick={() => handleToggleProduct(p.accounting_id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                                padding: '0.45rem 0.65rem',
                                borderRadius: '8px',
                                backgroundColor: active ? '#ECFDF5' : '#FFFFFF',
                                border: active ? '1px solid #10B981' : '1px solid #E2E8F0',
                                cursor: 'pointer',
                                fontSize: '0.78rem'
                            }}
                        >
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <span style={{
                                    fontWeight: 800,
                                    color: '#0D7A57',
                                    marginRight: '6px'
                                }}>
                                    #{p.accounting_id ?? 'S/N'}
                                </span>
                                <span style={{ fontWeight: 700, color: '#0F172A' }}>{p.name}</span>
                                {isInherited && (
                                    <span style={{
                                        marginLeft: '6px',
                                        fontSize: '0.65rem',
                                        padding: '1px 5px',
                                        borderRadius: '4px',
                                        backgroundColor: '#DBEAFE',
                                        color: '#1E40AF',
                                        fontWeight: 800
                                    }}>
                                        Hijo Heredado
                                    </span>
                                )}
                            </div>
                            <div style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '6px',
                                backgroundColor: active ? '#10B981' : '#F1F5F9',
                                color: active ? '#FFFFFF' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                <Check size={13} strokeWidth={3} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
