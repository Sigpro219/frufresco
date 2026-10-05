'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    X, 
    Zap, 
    Save, 
    Search, 
    Filter, 
    ShoppingBag, 
    CheckCircle2, 
    Layers, 
    Calculator,
    AlertCircle,
    ArrowRight
} from 'lucide-react';
import { formatNumber, formatMoney } from '@/lib/adminTheme';

interface ProductItem {
    id: string;
    name: string;
    sku?: string;
    accounting_id?: number | null;
    unit_of_measure: string;
    category?: string;
    purchase_sublist?: string;
    parent_id?: string | null;
}

interface FastPlazaPurchasesModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    currentDate: string;
    products: ProductItem[];
    currentPurchasesMap?: Record<string, number>;
}

export default function FastPlazaPurchasesModal({
    isOpen,
    onClose,
    onSuccess,
    currentDate,
    products,
    currentPurchasesMap = {}
}: FastPlazaPurchasesModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSublist, setSelectedSublist] = useState<string>('all');
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [pricesMap, setPricesMap] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [activeInputIndex, setActiveInputIndex] = useState<number>(0);

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Inicializar valores con los que ya existan en la Sábana para la fecha
    useEffect(() => {
        if (!isOpen) return;
        const initialInputs: Record<string, string> = {};
        Object.entries(currentPurchasesMap).forEach(([pId, val]) => {
            if (val && val > 0) {
                initialInputs[pId] = String(val);
            }
        });
        setInputValues(initialInputs);
        setSearchTerm('');
        setSelectedSublist('all');
    }, [isOpen, currentPurchasesMap]);

    // Ordenamiento idéntico a las planillas de Corabastos (Sublista -> Nombre)
    const sortedProducts = useMemo(() => {
        const list = [...products];
        return list.sort((a, b) => {
            const subA = (a.purchase_sublist || a.category || 'Generales').toUpperCase();
            const subB = (b.purchase_sublist || b.category || 'Generales').toUpperCase();
            if (subA !== subB) return subA.localeCompare(subB);
            return a.name.localeCompare(b.name);
        });
    }, [products]);

    // Sublistas únicas detectadas en el catálogo
    const availableSublists = useMemo(() => {
        const set = new Set<string>();
        products.forEach(p => {
            const sub = p.purchase_sublist || p.category || 'Generales';
            if (sub) set.add(sub);
        });
        return Array.from(set).sort();
    }, [products]);

    // Filtrado por buscador y sublista
    const filteredProducts = useMemo(() => {
        return sortedProducts.filter(p => {
            const sub = p.purchase_sublist || p.category || 'Generales';
            const matchesSublist = selectedSublist === 'all' || sub.toLowerCase() === selectedSublist.toLowerCase();
            const matchesSearch = !searchTerm.trim() || 
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (p.accounting_id && String(p.accounting_id).includes(searchTerm));
            return matchesSublist && matchesSearch;
        });
    }, [sortedProducts, selectedSublist, searchTerm]);

    // Resetear refs al cambiar filtros
    useEffect(() => {
        inputRefs.current = inputRefs.current.slice(0, filteredProducts.length);
    }, [filteredProducts]);

    // Enfoque inicial al primer input al abrir el modal
    useEffect(() => {
        if (isOpen && filteredProducts.length > 0) {
            setTimeout(() => {
                inputRefs.current[0]?.focus();
                inputRefs.current[0]?.select();
            }, 150);
        }
    }, [isOpen, selectedSublist]);

    // Evaluar expresión matemática simple (soporta 10+20, 15*2, etc.)
    const evaluateExpression = (expr: string): number => {
        if (!expr || !expr.trim()) return 0;
        const clean = expr.trim().replace(/,/g, '.').replace(/x/gi, '*');
        if (!/^[\d\s.+\-*/()]+$/.test(clean)) return 0;
        try {
            // eslint-disable-next-line no-new-func
            const res = Function(`"use strict"; return (${clean})`)();
            return typeof res === 'number' && !isNaN(res) && isFinite(res) ? Math.max(0, res) : 0;
        } catch {
            return 0;
        }
    };

    // Manejador de teclado para navegación ultra-rápida (Enter salta al siguiente)
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const nextIndex = index + 1;
            if (nextIndex < filteredProducts.length) {
                inputRefs.current[nextIndex]?.focus();
                inputRefs.current[nextIndex]?.select();
                setActiveInputIndex(nextIndex);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIndex = Math.min(filteredProducts.length - 1, index + 1);
            inputRefs.current[nextIndex]?.focus();
            inputRefs.current[nextIndex]?.select();
            setActiveInputIndex(nextIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIndex = Math.max(0, index - 1);
            inputRefs.current[prevIndex]?.focus();
            inputRefs.current[prevIndex]?.select();
            setActiveInputIndex(prevIndex);
        }
    };

    // Resumen en tiempo real
    const summary = useMemo(() => {
        let itemCount = 0;
        let totalKg = 0;
        Object.entries(inputValues).forEach(([_, valStr]) => {
            const parsed = evaluateExpression(valStr);
            if (parsed > 0) {
                itemCount++;
                totalKg += parsed;
            }
        });
        return { itemCount, totalKg };
    }, [inputValues]);

    // Guardar cambios en lote a Supabase
    const handleSaveBatch = async () => {
        setIsSaving(true);
        try {
            const { data: whData } = await supabase.from('warehouses').select('id').limit(1).single();
            const warehouseId = whData?.id;
            const timestampIso = `${currentDate}T12:00:00.000Z`;

            // Identificar los ítems modificados o con valor
            const entriesToSave = Object.entries(inputValues).filter(([_, valStr]) => {
                const parsed = evaluateExpression(valStr);
                return parsed > 0;
            });

            if (entriesToSave.length === 0) {
                if (!confirm('No has ingresado ninguna cantidad de compra (> 0). ¿Deseas salir sin guardar?')) {
                    setIsSaving(false);
                    return;
                }
                onClose();
                return;
            }

            // Para cada producto, actualizar o insertar en inventory_movements con reference_type = 'purchase_reception'
            for (const [productId, valStr] of entriesToSave) {
                const qty = evaluateExpression(valStr);
                const unitPrice = evaluateExpression(pricesMap[productId] || '0');
                const formulaAudit = valStr.trim() !== String(qty) ? ` (Fórmula: ${valStr.trim()})` : '';
                const priceAudit = unitPrice > 0 ? ` | Costo: $${unitPrice}/Kg` : '';
                const noteDesc = `[COMPRA PLAZA CORABASTOS - Canal A] Entrada: ${formatNumber(qty, 2)}${formulaAudit}${priceAudit}`;

                // Buscar si ya existía un movimiento de compra para este producto en la fecha
                const { data: existingMovs } = await supabase
                    .from('inventory_movements')
                    .select('id')
                    .eq('product_id', productId)
                    .eq('reference_type', 'purchase_reception')
                    .gte('created_at', `${currentDate}T00:00:00.000Z`)
                    .lte('created_at', `${currentDate}T23:59:59.999Z`);

                if (existingMovs && existingMovs.length > 0) {
                    const targetId = existingMovs[0].id;
                    await supabase
                        .from('inventory_movements')
                        .update({
                            quantity: qty,
                            notes: noteDesc,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', targetId);

                    // Eliminar duplicados si existieran más de 1
                    if (existingMovs.length > 1) {
                        const extraIds = existingMovs.slice(1).map(m => m.id);
                        await supabase.from('inventory_movements').delete().in('id', extraIds);
                    }
                } else {
                    await supabase
                        .from('inventory_movements')
                        .insert([{
                            product_id: productId,
                            warehouse_id: warehouseId,
                            quantity: qty,
                            type: 'entry',
                            reference_type: 'purchase_reception',
                            notes: noteDesc,
                            created_at: timestampIso
                        }]);
                }
            }

            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Error guardando compras de plaza:', err);
            alert(`Error al guardar compras: ${err?.message || 'Error desconocido'}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
        }}>
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                width: '100%',
                maxWidth: '920px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: '1px solid #E2E8F0'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F8FAFC'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            padding: '8px',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Zap size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: '1rem', fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                Ingesta Rápida de Compras Corabastos
                                <span style={{
                                    fontSize: '0.66rem',
                                    backgroundColor: '#DCFCE7',
                                    color: '#166534',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    fontWeight: '800'
                                }}>
                                    Canal A &bull; Teclado-Primero
                                </span>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                                Fecha de Operación: <strong>{currentDate}</strong> &bull; Transcribe en el mismo orden que la planilla física. Usa <code>Tab</code> o <code>Enter</code> para avanzar.
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#64748B',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '8px'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Toolbar de Filtros */}
                <div style={{
                    padding: '0.75rem 1.25rem',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    backgroundColor: '#FFFFFF'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {/* Omnibox Buscador */}
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: '#F8FAFC',
                            border: '1.5px solid #CBD5E1',
                            borderRadius: '8px',
                            padding: '0 10px',
                            height: '36px'
                        }}>
                            <Search size={15} color="#94A3B8" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Filtrar por nombre, SKU o ID contable..."
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    outline: 'none',
                                    fontSize: '0.78rem',
                                    width: '100%',
                                    fontWeight: '600'
                                }}
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* Badges de Conteo en Vivo */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 12px',
                            backgroundColor: '#ECFDF5',
                            border: '1px solid #A7F3D0',
                            borderRadius: '8px'
                        }}>
                            <CheckCircle2 size={16} color="#0D7A57" />
                            <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#065F46' }}>
                                {summary.itemCount} ítems ({formatNumber(summary.totalKg, 1)} Kg)
                            </span>
                        </div>
                    </div>

                    {/* Píldoras de Sublistas de Plaza */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.70rem', fontWeight: '800', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Filter size={12} /> Sublista:
                        </span>
                        <button
                            type="button"
                            onClick={() => setSelectedSublist('all')}
                            style={{
                                padding: '3px 10px',
                                borderRadius: '6px',
                                fontSize: '0.70rem',
                                fontWeight: '800',
                                border: selectedSublist === 'all' ? '1.5px solid #0D7A57' : '1px solid #CBD5E1',
                                backgroundColor: selectedSublist === 'all' ? '#0D7A57' : '#FFFFFF',
                                color: selectedSublist === 'all' ? '#FFFFFF' : '#334155',
                                cursor: 'pointer'
                            }}
                        >
                            Todas ({products.length})
                        </button>
                        {availableSublists.map(sub => {
                            const isSelected = selectedSublist.toLowerCase() === sub.toLowerCase();
                            return (
                                <button
                                    key={sub}
                                    type="button"
                                    onClick={() => setSelectedSublist(sub)}
                                    style={{
                                        padding: '3px 10px',
                                        borderRadius: '6px',
                                        fontSize: '0.70rem',
                                        fontWeight: '800',
                                        border: isSelected ? '1.5px solid #0D7A57' : '1px solid #CBD5E1',
                                        backgroundColor: isSelected ? '#0D7A57' : '#FFFFFF',
                                        color: isSelected ? '#FFFFFF' : '#334155',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {sub}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Tabla de Captura */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 1.25rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '2px solid #CBD5E1', textAlign: 'left', position: 'sticky', top: 0, zIndex: 2 }}>
                                <th style={{ padding: '8px 10px', width: '38px', color: '#475569', fontWeight: '800' }}>#</th>
                                <th style={{ padding: '8px 10px', width: '120px', color: '#475569', fontWeight: '800' }}>Sublista</th>
                                <th style={{ padding: '8px 10px', color: '#475569', fontWeight: '800' }}>Producto / Presentación</th>
                                <th style={{ padding: '8px 10px', width: '60px', textAlign: 'center', color: '#475569', fontWeight: '800' }}>UOM</th>
                                <th style={{ padding: '8px 10px', width: '140px', textAlign: 'right', color: '#065F46', fontWeight: '900' }}>
                                    Kilos Comprados (Col G)
                                </th>
                                <th style={{ padding: '8px 10px', width: '120px', textAlign: 'right', color: '#475569', fontWeight: '800' }}>
                                    Costo / Kg ($)
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.map((p, idx) => {
                                const sub = p.purchase_sublist || p.category || 'Generales';
                                const rawVal = inputValues[p.id] || '';
                                const numericVal = evaluateExpression(rawVal);
                                const isFilled = numericVal > 0;

                                return (
                                    <tr 
                                        key={p.id}
                                        style={{
                                            borderBottom: '1px solid #E2E8F0',
                                            backgroundColor: isFilled ? '#F0FDF4' : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
                                        }}
                                    >
                                        <td style={{ padding: '6px 10px', color: '#94A3B8', fontWeight: '700' }}>
                                            {idx + 1}
                                        </td>
                                        <td style={{ padding: '6px 10px' }}>
                                            <span style={{
                                                fontSize: '0.65rem',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontWeight: '800',
                                                backgroundColor: '#E2E8F0',
                                                color: '#334155'
                                            }}>
                                                {sub}
                                            </span>
                                        </td>
                                        <td style={{ padding: '6px 10px', fontWeight: '800', color: '#0F172A' }}>
                                            {p.name}
                                            {p.accounting_id && (
                                                <span style={{ fontSize: '0.66rem', color: '#64748B', marginLeft: '6px', fontWeight: '600' }}>
                                                    #{p.accounting_id}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '6px 10px', textAlign: 'center', color: '#64748B', fontWeight: '700' }}>
                                            {p.unit_of_measure}
                                        </td>
                                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                                            <input
                                                ref={el => { inputRefs.current[idx] = el; }}
                                                type="text"
                                                value={rawVal}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setInputValues(prev => ({ ...prev, [p.id]: val }));
                                                }}
                                                onKeyDown={e => handleKeyDown(e, idx)}
                                                onFocus={e => {
                                                    setActiveInputIndex(idx);
                                                    e.target.select();
                                                }}
                                                placeholder="0.0"
                                                style={{
                                                    width: '100%',
                                                    padding: '5px 8px',
                                                    fontSize: '0.80rem',
                                                    fontWeight: '900',
                                                    textAlign: 'right',
                                                    borderRadius: '6px',
                                                    border: isFilled ? '2px solid #059669' : '1.5px solid #CBD5E1',
                                                    backgroundColor: isFilled ? '#ECFDF5' : '#FFFFFF',
                                                    color: isFilled ? '#065F46' : '#0F172A',
                                                    outline: 'none'
                                                }}
                                            />
                                        </td>
                                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                                            <input
                                                type="text"
                                                value={pricesMap[p.id] || ''}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setPricesMap(prev => ({ ...prev, [p.id]: val }));
                                                }}
                                                placeholder="$ 0"
                                                style={{
                                                    width: '100%',
                                                    padding: '5px 8px',
                                                    fontSize: '0.74rem',
                                                    fontWeight: '700',
                                                    textAlign: 'right',
                                                    borderRadius: '6px',
                                                    border: '1px solid #CBD5E1',
                                                    backgroundColor: '#FFFFFF',
                                                    color: '#334155',
                                                    outline: 'none'
                                                }}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Footer con Resumen y Botón de Acción */}
                <div style={{
                    padding: '0.85rem 1.25rem',
                    borderTop: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F8FAFC'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                            Navegación: <code>Enter</code> o <code>↓</code> avanza &bull; Acepta fórmulas (ej: <code>10+25</code>).
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '8px 14px',
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                borderRadius: '8px',
                                fontSize: '0.76rem',
                                fontWeight: '800',
                                color: '#475569',
                                cursor: 'pointer'
                            }}
                        >
                            Cancelar
                        </button>

                        <button
                            type="button"
                            onClick={handleSaveBatch}
                            disabled={isSaving}
                            style={{
                                padding: '8px 18px',
                                backgroundColor: '#0D7A57',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '0.80rem',
                                fontWeight: '900',
                                color: '#FFFFFF',
                                cursor: isSaving ? 'wait' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 2px 6px rgba(13, 122, 87, 0.3)'
                            }}
                        >
                            <Save size={14} />
                            {isSaving ? 'Guardando en Sábana...' : `Guardar Entradas (${summary.itemCount} Ítems)`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
