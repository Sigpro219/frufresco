'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
    Layers,
    ArrowLeft,
    Scale,
    AlertTriangle,
    CheckCircle2,
    Search,
    Calendar,
    RefreshCw,
    ArrowRight,
    FileCheck,
    Calculator,
    Sparkles
} from 'lucide-react';
import { CATEGORY_MAP } from '@/lib/constants';

const INVENTORY_MOVEMENT_SUBTYPES = {
    WASTE_DAMAGE: 'waste_damage',
    WASTE_CLEANING: 'waste_cleaning'
} as const;

interface CatalogProduct {
    id: string;
    name: string;
    accounting_id: number | null;
    unit_of_measure: string;
    category: string;
    parent_id: string | null;
}

interface ProcessedBatchLog {
    id: string;
    parent_product_id: string;
    parent_product_name: string;
    parent_accounting_id: number | null;
    child_product_id: string;
    child_product_name: string;
    child_accounting_id: number | null;
    raw_input_kg: number;
    finished_output_kg: number;
    waste_damage_kg: number;
    waste_cleaning_kg: number;
    yield_pct: number;
    operator_notes: string;
    created_at: string;
}

export default function OpsProcesadosPage() {
    const supabase = createClient();

    const getBogotaDate = () => {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    };

    const [operationDate, setOperationDate] = useState<string>(getBogotaDate());
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [products, setProducts] = useState<CatalogProduct[]>([]);
    const [batchLogs, setBatchLogs] = useState<ProcessedBatchLog[]>([]);
    const [warehouseId, setWarehouseId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Form state (SDD Escenarios 391 & 392 / DT-18)
    const [parentSearch, setParentSearch] = useState<string>('');
    const [selectedParentId, setSelectedParentId] = useState<string>('');
    const [childSearch, setChildSearch] = useState<string>('');
    const [selectedChildId, setSelectedChildId] = useState<string>('');
    const [rawInputKg, setRawInputKg] = useState<string>('');
    const [finishedOutputKg, setFinishedOutputKg] = useState<string>('');
    const [wasteDamageKg, setWasteDamageKg] = useState<string>('0');
    const [wasteCleaningKg, setWasteCleaningKg] = useState<string>('0');
    const [operatorNotes, setOperatorNotes] = useState<string>('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [{ data: whData }, { data: prodData }] = await Promise.all([
                supabase.from('warehouses').select('id').limit(1).maybeSingle(),
                supabase
                    .from('products')
                    .select('id, name, accounting_id, unit_of_measure, category, parent_id')
                    .eq('is_active', true)
                    .order('name', { ascending: true })
            ]);

            if (whData?.id) setWarehouseId(whData.id);
            const allProds = (prodData as CatalogProduct[]) || [];
            setProducts(allProds);

            const prodMap = new Map<string, CatalogProduct>();
            allProds.forEach(p => prodMap.set(p.id, p));

            const startIso = `${operationDate}T00:00:00.000Z`;
            const endIso = `${operationDate}T23:59:59.999Z`;

            const { data: movsData } = await supabase
                .from('inventory_movements')
                .select('id, product_id, quantity, reference_type, notes, created_at')
                .eq('reference_type', 'production_transform')
                .gte('created_at', startIso)
                .lte('created_at', endIso)
                .order('created_at', { ascending: false });

            const parsedLogs: ProcessedBatchLog[] = [];
            (movsData || []).forEach((m: Record<string, unknown>) => {
                if (Number(m.quantity) <= 0) return; // Tomar el asiento positivo del hijo que contiene el metadato del lote
                const noteStr = String(m.notes || '');
                const metaMatch = noteStr.match(/\[DT18_META:\s*(\{[^\]]+\})\]/);
                if (!metaMatch) return;
                try {
                    const meta = JSON.parse(metaMatch[1]);
                    const parentProd = prodMap.get(String(meta.parent_product_id || ''));
                    const childProd = prodMap.get(String(meta.child_product_id || m.product_id || ''));
                    const rawIn = Number(meta.raw_input_kg) || 0;
                    const finOut = Number(meta.finished_output_kg ?? m.quantity) || 0;
                    const wDamage = Number(meta.waste_damage_kg) || 0;
                    const wClean = Number(meta.waste_cleaning_kg) || 0;
                    parsedLogs.push({
                        id: String(m.id),
                        parent_product_id: String(meta.parent_product_id || ''),
                        parent_product_name: parentProd?.name || String(meta.parent_product_name || 'SKU Padre'),
                        parent_accounting_id: parentProd?.accounting_id ?? null,
                        child_product_id: String(meta.child_product_id || m.product_id || ''),
                        child_product_name: childProd?.name || String(meta.child_product_name || 'SKU Hijo'),
                        child_accounting_id: childProd?.accounting_id ?? null,
                        raw_input_kg: rawIn,
                        finished_output_kg: finOut,
                        waste_damage_kg: wDamage,
                        waste_cleaning_kg: wClean,
                        yield_pct: rawIn > 0 ? Math.round((finOut / rawIn) * 1000) / 10 : 0,
                        operator_notes: String(meta.operator_notes || ''),
                        created_at: String(m.created_at || '')
                    });
                } catch {
                    // ignore malformed metadata
                }
            });
            setBatchLogs(parsedLogs);
        } catch (err) {
            console.error('Error loading procesados data:', err);
        } finally {
            setLoading(false);
        }
    }, [operationDate, supabase]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Filter Parent SKUs (prioritize parents that have children or independent SKUs)
    const parentIdsWithChildren = useMemo(() => {
        const s = new Set<string>();
        products.forEach(p => {
            if (p.parent_id) s.add(p.parent_id);
        });
        return s;
    }, [products]);

    const filteredParents = useMemo(() => {
        const q = parentSearch.trim().toLowerCase();
        const sorted = [...products].sort((a, b) => {
            const aIsP = parentIdsWithChildren.has(a.id) ? 0 : 1;
            const bIsP = parentIdsWithChildren.has(b.id) ? 0 : 1;
            if (aIsP !== bIsP) return aIsP - bIsP;
            return a.name.localeCompare(b.name);
        });
        if (!q) return sorted.slice(0, 60);
        return sorted
            .filter(
                p =>
                    p.name.toLowerCase().includes(q) ||
                    String(p.accounting_id ?? '').includes(q)
            )
            .slice(0, 60);
    }, [products, parentSearch, parentIdsWithChildren]);

    const filteredChildren = useMemo(() => {
        const q = childSearch.trim().toLowerCase();
        const directChildren = selectedParentId
            ? products.filter(p => p.parent_id === selectedParentId && p.id !== selectedParentId)
            : [];
        const basePool = directChildren.length > 0 && !q ? directChildren : products.filter(p => p.id !== selectedParentId);
        if (!q) return basePool.slice(0, 60);
        return basePool
            .filter(
                p =>
                    p.name.toLowerCase().includes(q) ||
                    String(p.accounting_id ?? '').includes(q)
            )
            .slice(0, 60);
    }, [products, selectedParentId, childSearch]);

    // Auto-select first child when parent changes if it has direct children
    const handleParentChange = (newParentId: string) => {
        setSelectedParentId(newParentId);
        const directChildren = products.filter(p => p.parent_id === newParentId && p.id !== newParentId);
        if (directChildren.length > 0) {
            setSelectedChildId(directChildren[0].id);
        }
    };

    const numRawInput = Math.max(0, parseFloat(rawInputKg) || 0);
    const numFinishedOutput = Math.max(0, parseFloat(finishedOutputKg) || 0);
    const numWasteDamageColQ = Math.max(0, parseFloat(wasteDamageKg) || 0);
    const numWasteCleaningColR = Math.max(0, parseFloat(wasteCleaningKg) || 0);
    const totalOutputs = Math.round((numFinishedOutput + numWasteDamageColQ + numWasteCleaningColR) * 100) / 100;
    const massDelta = Math.round((numRawInput - totalOutputs) * 100) / 100;
    const isMassBalanced = numRawInput > 0 && Math.abs(massDelta) <= 0.02;
    const yieldPct = numRawInput > 0 ? Math.round((numFinishedOutput / numRawInput) * 1000) / 10 : 0;

    const handleAutoFillCleaningWaste = () => {
        const remainder = Math.max(0, Math.round((numRawInput - numFinishedOutput - numWasteDamageColQ) * 100) / 100);
        setWasteCleaningKg(String(remainder));
    };

    const handleSaveBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedbackBanner(null);

        if (!selectedParentId || !selectedChildId) {
            setFeedbackBanner({ type: 'error', message: 'Debes seleccionar tanto el Producto Padre (Entrada Bruta) como el Producto Hijo (Procesado).' });
            return;
        }
        if (numRawInput <= 0 || numFinishedOutput <= 0) {
            setFeedbackBanner({ type: 'error', message: 'La masa bruta de entrada y la masa procesada obtenida deben ser mayores a 0 Kg.' });
            return;
        }
        if (!isMassBalanced) {
            setFeedbackBanner({
                type: 'error',
                message: `Invariante de Conservación de Masa no cuadrado: Entrada (${numRawInput} Kg) != Hijo (${numFinishedOutput} Kg) + Desperdicio Col Q (${numWasteDamageColQ} Kg) + Basura Col R (${numWasteCleaningColR} Kg). Diferencia: ${massDelta > 0 ? `+${massDelta}` : massDelta} Kg.`
            });
            return;
        }

        setSaving(true);
        try {
            const timestampIso = `${operationDate}T12:00:00.000Z`;
            const parentProd = products.find(p => p.id === selectedParentId);
            const childProd = products.find(p => p.id === selectedChildId);

            const metaPayload = {
                parent_product_id: selectedParentId,
                parent_product_name: parentProd?.name || '',
                child_product_id: selectedChildId,
                child_product_name: childProd?.name || '',
                raw_input_kg: numRawInput,
                finished_output_kg: numFinishedOutput,
                waste_damage_kg: numWasteDamageColQ,
                waste_cleaning_kg: numWasteCleaningColR,
                operator_notes: operatorNotes
            };

            const movementsToInsert: Array<Record<string, unknown>> = [
                // 1. Transferencia de masa aprovechable del Padre (-numFinishedOutput) al Hijo (+numFinishedOutput)
                {
                    product_id: selectedParentId,
                    warehouse_id: warehouseId,
                    quantity: -numFinishedOutput,
                    type: 'exit',
                    status_to: 'available',
                    reference_type: 'production_transform',
                    notes: `[TRANSFORMACIÓN PLANTA PROCESADOS - SALIDA PADRE] -${numFinishedOutput} Kg hacia Hijo #${childProd?.accounting_id ?? 'S/N'} ${childProd?.name || ''}`
                        + ` (Bruto: ${numRawInput} Kg, Q: -${numWasteDamageColQ} Kg, R: -${numWasteCleaningColR} Kg)`,
                    created_at: timestampIso
                },
                {
                    product_id: selectedChildId,
                    warehouse_id: warehouseId,
                    quantity: numFinishedOutput,
                    type: 'entry',
                    status_to: 'available',
                    reference_type: 'production_transform',
                    notes: `[TRANSFORMACIÓN PLANTA PROCESADOS - ENTRADA HIJO] +${numFinishedOutput} Kg desde Padre #${parentProd?.accounting_id ?? 'S/N'} ${parentProd?.name || ''}`
                        + ` [DT18_META: ${JSON.stringify(metaPayload)}]`,
                    created_at: timestampIso
                }
            ];

            // 2. Fracción de Desperdicio / Avería -> Columna Q ('waste_damage')
            if (numWasteDamageColQ > 0) {
                movementsToInsert.push({
                    product_id: selectedParentId,
                    warehouse_id: warehouseId,
                    quantity: -numWasteDamageColQ,
                    type: 'exit',
                    status_to: 'available',
                    reference_type: INVENTORY_MOVEMENT_SUBTYPES.WASTE_DAMAGE,
                    notes: `[PROCESADOS PLANTA -> COL Q DESPERDICIO (-${numWasteDamageColQ} Kg)] Lote Padre #${parentProd?.accounting_id ?? 'S/N'} -> Hijo #${childProd?.accounting_id ?? 'S/N'} ${operatorNotes ? `| ${operatorNotes}` : ''}`,
                    created_at: timestampIso
                });
            }

            // 3. Fracción de Basura / Cáscara / Descapote -> Columna R ('waste_cleaning')
            if (numWasteCleaningColR > 0) {
                movementsToInsert.push({
                    product_id: selectedParentId,
                    warehouse_id: warehouseId,
                    quantity: -numWasteCleaningColR,
                    type: 'exit',
                    status_to: 'available',
                    reference_type: INVENTORY_MOVEMENT_SUBTYPES.WASTE_CLEANING,
                    notes: `[PROCESADOS PLANTA -> COL R BASURA/DESCAPOTE (-${numWasteCleaningColR} Kg)] Lote Padre #${parentProd?.accounting_id ?? 'S/N'} -> Hijo #${childProd?.accounting_id ?? 'S/N'} ${operatorNotes ? `| ${operatorNotes}` : ''}`,
                    created_at: timestampIso
                });
            }

            const { error: movErr } = await supabase.from('inventory_movements').insert(movementsToInsert);
            if (movErr) throw movErr;

            setFeedbackBanner({
                type: 'success',
                message: `Lote de Procesados registrado: ${numRawInput} Kg de ${parentProd?.name} -> +${numFinishedOutput} Kg de ${childProd?.name} (Rendimiento ${yieldPct}%) | Col Q: -${numWasteDamageColQ} Kg | Col R: -${numWasteCleaningColR} Kg.`
            });

            setRawInputKg('');
            setFinishedOutputKg('');
            setWasteDamageKg('0');
            setWasteCleaningKg('0');
            setOperatorNotes('');
            await loadData();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al registrar lote de procesados';
            setFeedbackBanner({ type: 'error', message: msg });
        } finally {
            setSaving(false);
        }
    };

    const filteredLogs = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return batchLogs;
        return batchLogs.filter(
            b =>
                b.parent_product_name.toLowerCase().includes(q) ||
                b.child_product_name.toLowerCase().includes(q) ||
                String(b.parent_accounting_id ?? '').includes(q) ||
                String(b.child_accounting_id ?? '').includes(q)
        );
    }, [batchLogs, searchQuery]);

    const summaryStats = useMemo(() => {
        const totals = batchLogs.reduce(
            (acc, b) => ({
                rawIn: Math.round((acc.rawIn + b.raw_input_kg) * 100) / 100,
                finishedOut: Math.round((acc.finishedOut + b.finished_output_kg) * 100) / 100,
                wasteColQ: Math.round((acc.wasteColQ + b.waste_damage_kg) * 100) / 100,
                cleaningColR: Math.round((acc.cleaningColR + b.waste_cleaning_kg) * 100) / 100
            }),
            { rawIn: 0, finishedOut: 0, wasteColQ: 0, cleaningColR: 0 }
        );
        const avgYield = totals.rawIn > 0 ? Math.round((totals.finishedOut / totals.rawIn) * 1000) / 10 : 0;
        return { ...totals, avgYield };
    }, [batchLogs]);

    return (
        <div
            style={{
                minHeight: '100vh',
                backgroundColor: 'var(--ops-bg)',
                color: 'var(--ops-text)',
                padding: '1.25rem',
                paddingBottom: '100px',
                fontFamily: "'Inter', sans-serif"
            }}
        >
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                {/* Cabecera Estándar onFRU OPS */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '1rem',
                        marginBottom: '1.25rem',
                        backgroundColor: 'var(--ops-surface)',
                        border: '1px solid var(--ops-border)',
                        borderRadius: '18px',
                        padding: '1rem 1.25rem'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <Link
                            href="/ops"
                            style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '12px',
                                backgroundColor: 'var(--ops-bg)',
                                border: '1px solid var(--ops-border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--ops-text)',
                                textDecoration: 'none'
                            }}
                            title="Volver al Centro de Mando OPS"
                        >
                            <ArrowLeft size={20} />
                        </Link>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                    style={{
                                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                        color: 'var(--ops-primary)',
                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.7rem',
                                        fontWeight: 800,
                                        letterSpacing: '0.06em',
                                        textTransform: 'uppercase'
                                    }}
                                >
                                    ESTACIÓN 10 • PLANTA DE PROCESADOS
                                </span>
                            </div>
                            <h1
                                style={{
                                    margin: '4px 0 0 0',
                                    fontFamily: "'Outfit', sans-serif",
                                    fontSize: '1.45rem',
                                    fontWeight: 900,
                                    letterSpacing: '-0.02em',
                                    color: 'var(--ops-text)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                <Layers size={22} color="#10B981" />
                                Transformación Padre a Hijo, Desperdicio (Col Q) y Basura (Col R)
                            </h1>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                backgroundColor: 'var(--ops-bg)',
                                border: '1px solid var(--ops-border)',
                                borderRadius: '12px',
                                padding: '0.45rem 0.85rem'
                            }}
                        >
                            <Calendar size={16} color="#10B981" />
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ops-text-muted)' }}>
                                Jornada:
                            </span>
                            <input
                                type="date"
                                value={operationDate}
                                onChange={e => setOperationDate(e.target.value)}
                                style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: 'var(--ops-text)',
                                    fontWeight: 800,
                                    fontSize: '0.85rem',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <button
                            type="button"
                            onClick={loadData}
                            style={{
                                height: '42px',
                                padding: '0 1rem',
                                borderRadius: '12px',
                                backgroundColor: 'var(--ops-bg)',
                                border: '1px solid var(--ops-border)',
                                color: 'var(--ops-text)',
                                fontWeight: 800,
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            <RefreshCw size={15} /> Actualizar
                        </button>
                    </div>
                </div>

                {/* KPIs de Conservación de Masa en Planta de Procesados */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '0.85rem',
                        marginBottom: '1.25rem'
                    }}
                >
                    <div
                        style={{
                            backgroundColor: 'var(--ops-surface)',
                            border: '1px solid var(--ops-border)',
                            borderRadius: '16px',
                            padding: '1rem 1.15rem'
                        }}
                    >
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--ops-text-muted)', textTransform: 'uppercase' }}>
                            Masa Bruta Padre Entrada
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--ops-text)', fontFamily: "'Outfit', sans-serif", marginTop: '4px' }}>
                            {summaryStats.rawIn.toFixed(2)} Kg
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--ops-text-muted)', marginTop: '2px' }}>
                            Materia prima ingresada a mesa
                        </div>
                    </div>

                    <div
                        style={{
                            backgroundColor: 'var(--ops-surface)',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            borderRadius: '16px',
                            padding: '1rem 1.15rem'
                        }}
                    >
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#10B981', textTransform: 'uppercase' }}>
                            Producto Hijo Obtenido ({summaryStats.avgYield}%)
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10B981', fontFamily: "'Outfit', sans-serif", marginTop: '4px' }}>
                            +{summaryStats.finishedOut.toFixed(2)} Kg
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--ops-text-muted)', marginTop: '2px' }}>
                            Convertido en SKU Hijo listo para despacho
                        </div>
                    </div>

                    <div
                        style={{
                            backgroundColor: 'var(--ops-surface)',
                            border: '1px solid var(--ops-border)',
                            borderRadius: '16px',
                            padding: '1rem 1.15rem'
                        }}
                    >
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--ops-text-muted)', textTransform: 'uppercase' }}>
                            Desperdicio / Avería (Col Q -)
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#EF4444', fontFamily: "'Outfit', sans-serif", marginTop: '4px' }}>
                            -{summaryStats.wasteColQ.toFixed(2)} Kg
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--ops-text-muted)', marginTop: '2px' }}>
                            Imputado a Columna Q en Sábana
                        </div>
                    </div>

                    <div
                        style={{
                            backgroundColor: 'var(--ops-surface)',
                            border: '1px solid var(--ops-border)',
                            borderRadius: '16px',
                            padding: '1rem 1.15rem'
                        }}
                    >
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--ops-text-muted)', textTransform: 'uppercase' }}>
                            Basura / Descapote (Col R -)
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#F59E0B', fontFamily: "'Outfit', sans-serif", marginTop: '4px' }}>
                            -{summaryStats.cleaningColR.toFixed(2)} Kg
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--ops-text-muted)', marginTop: '2px' }}>
                            Cáscara, hojas o tallos hacia Columna R
                        </div>
                    </div>
                </div>

                {feedbackBanner && (
                    <div
                        style={{
                            marginBottom: '1.25rem',
                            padding: '0.9rem 1.15rem',
                            borderRadius: '14px',
                            backgroundColor: feedbackBanner.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            border: `1px solid ${feedbackBanner.type === 'success' ? '#10B981' : '#EF4444'}`,
                            color: feedbackBanner.type === 'success' ? '#10B981' : '#EF4444',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        {feedbackBanner.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                        <span>{feedbackBanner.message}</span>
                    </div>
                )}

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                        gap: '1.25rem',
                        alignItems: 'start'
                    }}
                >
                    {/* Panel Izquierdo: Formulario de Transformación Padre -> Hijo + Q + R */}
                    <div
                        style={{
                            backgroundColor: 'var(--ops-surface)',
                            border: '1px solid var(--ops-border)',
                            borderRadius: '18px',
                            padding: '1.25rem'
                        }}
                    >
                        <h2
                            style={{
                                margin: '0 0 0.35rem 0',
                                fontFamily: "'Outfit', sans-serif",
                                fontSize: '1.1rem',
                                fontWeight: 800,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            <Scale size={18} color="#10B981" />
                            Registrar Lote de Transformación en Planta
                        </h2>
                        <p style={{ margin: '0 0 1rem 0', fontSize: '0.78rem', color: 'var(--ops-text-muted)' }}>
                            Invariante de Masa Cerrada: Masa Padre Entrada = Masa Hijo Procesado + Desperdicio (Col Q) + Basura/Cáscara (Col R).
                        </p>

                        <form onSubmit={handleSaveBatch} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                            {/* 1. Selección de SKU Padre */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                                    1. PRODUCTO PADRE BRUTO QUE ENTRA A PROCESO [P]
                                </label>
                                <input
                                    type="text"
                                    placeholder="Filtrar Padre por #ID Contable o nombre..."
                                    value={parentSearch}
                                    onChange={e => setParentSearch(e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '40px',
                                        padding: '0 0.85rem',
                                        borderRadius: '10px',
                                        backgroundColor: 'var(--ops-bg)',
                                        border: '1px solid var(--ops-border)',
                                        color: 'var(--ops-text)',
                                        fontSize: '0.82rem',
                                        marginBottom: '6px'
                                    }}
                                />
                                <select
                                    value={selectedParentId}
                                    onChange={e => handleParentChange(e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '44px',
                                        padding: '0 0.85rem',
                                        borderRadius: '10px',
                                        backgroundColor: 'var(--ops-bg)',
                                        border: '1px solid var(--ops-border)',
                                        color: 'var(--ops-text)',
                                        fontWeight: 700,
                                        fontSize: '0.84rem'
                                    }}
                                >
                                    <option value="">-- Seleccionar Producto Padre (Entrada) --</option>
                                    {filteredParents.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {parentIdsWithChildren.has(p.id) ? '[P] ' : ''}#{p.accounting_id ?? 'S/N'} • {p.name} ({CATEGORY_MAP[p.category] || p.category})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* 2. Selección de SKU Hijo */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                                    2. PRODUCTO HIJO PROCESADO RESULTANTE [H]
                                </label>
                                <input
                                    type="text"
                                    placeholder="Filtrar Hijo por #ID Contable o nombre..."
                                    value={childSearch}
                                    onChange={e => setChildSearch(e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '40px',
                                        padding: '0 0.85rem',
                                        borderRadius: '10px',
                                        backgroundColor: 'var(--ops-bg)',
                                        border: '1px solid var(--ops-border)',
                                        color: 'var(--ops-text)',
                                        fontSize: '0.82rem',
                                        marginBottom: '6px'
                                    }}
                                />
                                <select
                                    value={selectedChildId}
                                    onChange={e => setSelectedChildId(e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '44px',
                                        padding: '0 0.85rem',
                                        borderRadius: '10px',
                                        backgroundColor: 'var(--ops-bg)',
                                        border: '1px solid var(--ops-border)',
                                        color: 'var(--ops-text)',
                                        fontWeight: 700,
                                        fontSize: '0.84rem'
                                    }}
                                >
                                    <option value="">-- Seleccionar Producto Hijo (Salida) --</option>
                                    {filteredChildren.map(p => (
                                        <option key={p.id} value={p.id}>
                                            [H] #{p.accounting_id ?? 'S/N'} • {p.name} ({p.unit_of_measure || 'Kg'})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* 3. Pesos de Entrada y Salida */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                                        MASA BRUTA ENTRADA PADRE (KG)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Ej. 50.00"
                                        value={rawInputKg}
                                        onChange={e => setRawInputKg(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '44px',
                                            padding: '0 0.85rem',
                                            borderRadius: '10px',
                                            backgroundColor: 'var(--ops-bg)',
                                            border: '1px solid var(--ops-border)',
                                            color: 'var(--ops-text)',
                                            fontWeight: 800,
                                            fontSize: '0.95rem'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#10B981', marginBottom: '4px' }}>
                                        MASA NETA HIJO OBTENIDO (KG)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Ej. 42.00"
                                        value={finishedOutputKg}
                                        onChange={e => setFinishedOutputKg(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '44px',
                                            padding: '0 0.85rem',
                                            borderRadius: '10px',
                                            backgroundColor: 'var(--ops-bg)',
                                            border: '1px solid rgba(16, 185, 129, 0.45)',
                                            color: 'var(--ops-text)',
                                            fontWeight: 800,
                                            fontSize: '0.95rem'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* 4. Bifurcación del Resto: Desperdicio (Col Q) y Basura/Cáscara (Col R) */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#EF4444', marginBottom: '4px' }}>
                                        DESPERDICIO / AVERÍA (COL Q -)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Ej. 3.00"
                                        value={wasteDamageKg}
                                        onChange={e => setWasteDamageKg(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '44px',
                                            padding: '0 0.85rem',
                                            borderRadius: '10px',
                                            backgroundColor: 'var(--ops-bg)',
                                            border: '1px solid var(--ops-border)',
                                            color: 'var(--ops-text)',
                                            fontWeight: 800,
                                            fontSize: '0.95rem'
                                        }}
                                    />
                                </div>

                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#F59E0B' }}>
                                            BASURA / CÁSCARA (COL R -)
                                        </label>
                                        <button
                                            type="button"
                                            onClick={handleAutoFillCleaningWaste}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: '#10B981',
                                                fontSize: '0.68rem',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '3px',
                                                padding: 0
                                            }}
                                            title="Calcular diferencia restante hacia Basura (Col R)"
                                        >
                                            <Calculator size={11} /> Autocalcular resto
                                        </button>
                                    </div>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Ej. 5.00"
                                        value={wasteCleaningKg}
                                        onChange={e => setWasteCleaningKg(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '44px',
                                            padding: '0 0.85rem',
                                            borderRadius: '10px',
                                            backgroundColor: 'var(--ops-bg)',
                                            border: '1px solid var(--ops-border)',
                                            color: 'var(--ops-text)',
                                            fontWeight: 800,
                                            fontSize: '0.95rem'
                                        }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                                    OBSERVACIONES DEL LOTE / OPERARIO DE MESA
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ej. Pelado y empacado al vacío - Mesa 2..."
                                    value={operatorNotes}
                                    onChange={e => setOperatorNotes(e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '42px',
                                        padding: '0 0.85rem',
                                        borderRadius: '10px',
                                        backgroundColor: 'var(--ops-bg)',
                                        border: '1px solid var(--ops-border)',
                                        color: 'var(--ops-text)',
                                        fontSize: '0.82rem'
                                    }}
                                />
                            </div>

                            {/* Monitor de Conservación de Masa */}
                            <div
                                style={{
                                    backgroundColor: 'var(--ops-bg)',
                                    border: `1px solid ${isMassBalanced ? '#10B981' : 'var(--ops-border)'}`,
                                    borderRadius: '12px',
                                    padding: '0.85rem 1rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '8px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700
                                }}
                            >
                                <span>Entrada: {numRawInput.toFixed(2)} Kg</span>
                                <span>Salidas (Hijo + Q + R): {totalOutputs.toFixed(2)} Kg</span>
                                <span style={{ color: isMassBalanced ? '#10B981' : '#F59E0B', fontWeight: 900 }}>
                                    {isMassBalanced
                                        ? `Masa Cuadrada • Rendimiento ${yieldPct}%`
                                        : `Diferencia por cuadrar: ${massDelta > 0 ? `+${massDelta.toFixed(2)}` : massDelta.toFixed(2)} Kg`}
                                </span>
                            </div>

                            <button
                                type="submit"
                                disabled={saving}
                                style={{
                                    height: '48px',
                                    borderRadius: '12px',
                                    backgroundColor: '#10B981',
                                    color: '#052E16',
                                    border: 'none',
                                    fontWeight: 900,
                                    fontSize: '0.9rem',
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px'
                                }}
                            >
                                <Sparkles size={18} />
                                {saving ? 'Procesando Transformación...' : 'Registrar Lote e Inyectar a Sábana (Hijo + Col Q + Col R)'}
                            </button>
                        </form>
                    </div>

                    {/* Panel Derecho: Bitácora de Lotes Procesados en la Jornada */}
                    <div
                        style={{
                            backgroundColor: 'var(--ops-surface)',
                            border: '1px solid var(--ops-border)',
                            borderRadius: '18px',
                            padding: '1.25rem'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
                            <h3
                                style={{
                                    margin: 0,
                                    fontFamily: "'Outfit', sans-serif",
                                    fontSize: '1rem',
                                    fontWeight: 800,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                <FileCheck size={18} color="#10B981" />
                                Lotes Transformados en {operationDate} ({filteredLogs.length})
                            </h3>
                            <div style={{ position: 'relative', minWidth: '210px' }}>
                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ops-text-muted)' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar por #ID o producto..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '36px',
                                        paddingLeft: '30px',
                                        paddingRight: '10px',
                                        borderRadius: '8px',
                                        backgroundColor: 'var(--ops-bg)',
                                        border: '1px solid var(--ops-border)',
                                        color: 'var(--ops-text)',
                                        fontSize: '0.78rem'
                                    }}
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ops-text-muted)', fontSize: '0.85rem' }}>
                                Cargando lotes de procesados...
                            </div>
                        ) : filteredLogs.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ops-text-muted)', fontSize: '0.82rem' }}>
                                No hay lotes de transformación registrados en la fecha {operationDate}.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '520px', overflowY: 'auto' }}>
                                {filteredLogs.map(batch => (
                                    <div
                                        key={batch.id}
                                        style={{
                                            padding: '0.85rem 1rem',
                                            borderRadius: '12px',
                                            backgroundColor: 'var(--ops-bg)',
                                            border: '1px solid var(--ops-border)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '0.84rem', color: 'var(--ops-text)' }}>
                                                <span>[P] #{batch.parent_accounting_id ?? 'S/N'} {batch.parent_product_name}</span>
                                                <ArrowRight size={14} color="#10B981" />
                                                <span style={{ color: '#10B981' }}>[H] #{batch.child_accounting_id ?? 'S/N'} {batch.child_product_name}</span>
                                            </div>
                                            <span
                                                style={{
                                                    backgroundColor: 'rgba(16, 185, 129, 0.14)',
                                                    color: '#10B981',
                                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 800
                                                }}
                                            >
                                                Rendimiento: {batch.yield_pct}%
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '0.75rem', fontWeight: 700 }}>
                                            <span style={{ color: 'var(--ops-text-muted)' }}>
                                                Bruto: {batch.raw_input_kg} Kg
                                            </span>
                                            <span style={{ color: '#10B981' }}>
                                                Hijo: +{batch.finished_output_kg} Kg
                                            </span>
                                            <span style={{ color: '#EF4444' }}>
                                                Col Q (Desperdicio): -{batch.waste_damage_kg} Kg
                                            </span>
                                            <span style={{ color: '#F59E0B' }}>
                                                Col R (Basura): -{batch.waste_cleaning_kg} Kg
                                            </span>
                                        </div>
                                        {batch.operator_notes && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--ops-text-muted)' }}>
                                                Nota: {batch.operator_notes}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
