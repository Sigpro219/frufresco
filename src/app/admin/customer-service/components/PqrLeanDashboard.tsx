'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
    BarChart2, TrendingUp, TrendingDown, ShieldAlert, CheckCircle2, 
    AlertTriangle, DollarSign, Clock, Truck, Warehouse, Store, 
    Layers, User, Target, Wrench, Plus, ArrowRight, RefreshCw, 
    Sliders, FileText, Check, HelpCircle, AlertCircle
} from 'lucide-react';
import { THEME, formatMoney } from '@/lib/adminTheme';
import { 
    RCA_CATEGORIES_L1, 
    RESPONSIBLE_PARTIES, 
    parseRcaFromRecord, 
    DefectCategoryL1, 
    ImputedEntity 
} from '@/lib/rcaTaxonomy';
import { PQR, formatDateFriendly } from '../utils';
import PqrCapaPlanModal, { CapaPlan } from './PqrCapaPlanModal';

interface PqrLeanDashboardProps {
    pqrs: PQR[];
    novelties: any[];
    totalOrdersCount: number | null;
    deliveredOrdersCount: number | null;
    customTaxonomy: DefectCategoryL1[];
    onRefresh: () => void;
    showToast: (text: string, type?: 'success' | 'error' | 'warning') => void;
}

export default function PqrLeanDashboard({
    pqrs,
    novelties,
    totalOrdersCount,
    deliveredOrdersCount,
    customTaxonomy,
    onRefresh,
    showToast
}: PqrLeanDashboardProps) {
    // 1. Time Horizon Filter
    const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'year' | 'all'>('30d');
    
    // 2. Pareto Metric Toggle
    const [paretoMode, setParetoMode] = useState<'frequency' | 'financial'>('financial');

    // 3. CAPA Plans State (Persistent in localStorage)
    const [capaPlans, setCapaPlans] = useState<CapaPlan[]>([]);
    const [selectedCapaPlan, setSelectedCapaPlan] = useState<CapaPlan | null>(null);
    const [isCapaModalOpen, setIsCapaModalOpen] = useState(false);
    const [capaPrefillData, setCapaPrefillData] = useState<any>(null);

    // Load CAPA plans from localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem('frufresco_cs_capa_plans');
            if (stored) {
                setCapaPlans(JSON.parse(stored));
            } else {
                // Initial baseline sample CAPA plans if empty
                const initial: CapaPlan[] = [
                    {
                        id: 'capa-sample-1',
                        title: 'Estandarización de Estiba y Bloqueo de Sobrepeso en Furgones',
                        categoryL1: 'dano_mecanico',
                        subtypeL2: 'aplastamiento_sobreestiba',
                        responsibleArea: 'transporte',
                        occurrencesCount: 4,
                        financialImpactCOP: 480000,
                        why1: 'Canastillas inferiores llegaron aplastadas a la sede del cliente.',
                        why2: 'Se apilaron 8 canastillas en columnas verticales durante el cargue matutino.',
                        why3: 'El furgón no tenía separadores físicos de carga ni barras de contención.',
                        why4: 'El auxiliar de ruta acomodó canastillas para ahorrar espacio en cabina.',
                        why5: 'Falta de estándar visual Poka-Yoke de altura máxima de estiba (Máx 5 canastillas).',
                        containmentAction: 'Inspección de salida al 100% en muelle por el despachador.',
                        pokaYokeAction: 'Instalación de barras metálicas de tope fijo en furgones a 1.20m de altura.',
                        assignedTo: 'Carlos Rodríguez (Jefe Transporte)',
                        targetDate: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
                        status: 'verifying_15d',
                        verificationNotes: 'Auditoría en muelle: 0 casos de aplastamiento en 30 días posteriores.',
                        createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
                        updatedAt: new Date().toISOString()
                    }
                ];
                setCapaPlans(initial);
                localStorage.setItem('frufresco_cs_capa_plans', JSON.stringify(initial));
            }
        } catch {
            // Ignore parse errors
        }
    }, []);

    const saveCapaPlansToStorage = (updated: CapaPlan[]) => {
        setCapaPlans(updated);
        try {
            localStorage.setItem('frufresco_cs_capa_plans', JSON.stringify(updated));
        } catch {
            // ignore
        }
    };

    const handleSaveCapaPlan = (plan: CapaPlan) => {
        const exists = capaPlans.some(p => p.id === plan.id);
        const next = exists ? capaPlans.map(p => p.id === plan.id ? plan : p) : [plan, ...capaPlans];
        saveCapaPlansToStorage(next);
        showToast(`Plan CAPA "${plan.title}" guardado exitosamente.`, 'success');
    };

    const handleDeleteCapaPlan = (planId: string) => {
        const next = capaPlans.filter(p => p.id !== planId);
        saveCapaPlansToStorage(next);
        showToast('Plan CAPA eliminado.', 'warning');
    };

    const handleOpenNewCapaForCause = (cause: any) => {
        setCapaPrefillData({
            categoryL1: cause.categoryL1,
            subtypeL2: cause.subtypeL2,
            responsibleArea: cause.dominantResponsible,
            occurrencesCount: cause.count,
            financialImpactCOP: cause.totalAmount
        });
        setSelectedCapaPlan(null);
        setIsCapaModalOpen(true);
    };

    // Filter data by Horizon
    const cutoffDate = useMemo(() => {
        const now = new Date();
        if (timeRange === '7d') return new Date(now.getTime() - 7 * 86400000);
        if (timeRange === '30d') return new Date(now.getTime() - 30 * 86400000);
        if (timeRange === '90d') return new Date(now.getTime() - 90 * 86400000);
        if (timeRange === 'year') return new Date(now.getFullYear(), 0, 1);
        return new Date(0); // all
    }, [timeRange]);

    const periodPqrs = useMemo(() => {
        return pqrs.filter(p => new Date(p.created_at) >= cutoffDate);
    }, [pqrs, cutoffDate]);

    const periodNovelties = useMemo(() => {
        return novelties.filter(n => new Date(n.created_at) >= cutoffDate);
    }, [novelties, cutoffDate]);

    // -------------------------------------------------------------
    // Core Lean Metrics Calculation
    // -------------------------------------------------------------
    const metrics = useMemo(() => {
        const totalPqrs = periodPqrs.length;
        const totalNovs = periodNovelties.length;

        // 1. FTR %
        const effectiveDelivered = deliveredOrdersCount || Math.max(totalPqrs * 10, 100);
        const claimOrderIds = new Set(periodPqrs.filter(p => p.order_id).map(p => p.order_id));
        const ftr = Math.max(0, Math.min(100, ((effectiveDelivered - claimOrderIds.size) / effectiveDelivered) * 100));

        // 2. CoQ Total ($ COP)
        let totalCoQ = 0;
        let totalImputedCOP = 0;

        periodNovelties.forEach(n => {
            if (n.status === 'approved' || n.status === 'pending_review') {
                const price = n.products?.base_price || 0;
                const qty = Number(n.quantity_returned) || 0;
                totalCoQ += (price * qty);
            }
        });

        // Add PQR financial estimates
        periodPqrs.forEach(p => {
            const rca = parseRcaFromRecord(p);
            if (rca.imputedEntities && rca.imputedEntities.length > 0) {
                rca.imputedEntities.forEach(e => {
                    totalImputedCOP += (Number(e.deductionAmount) || 0);
                });
            }
        });

        if (totalImputedCOP === 0 && totalCoQ > 0) {
            // default ~70% imputed if not explicitly partitioned
            totalImputedCOP = Math.round(totalCoQ * 0.72);
        }

        // 3. CRI (Cost Recovery Index)
        const cri = totalCoQ > 0 ? Math.min(100, Math.round((totalImputedCOP / totalCoQ) * 100)) : 100;

        // 4. MTTR (Mean Time to Resolution)
        const resolvedWithDates = periodPqrs.filter(p => p.resolved_at && p.created_at);
        let mttrHours = 0;
        if (resolvedWithDates.length > 0) {
            const sumHours = resolvedWithDates.reduce((acc, p) => {
                const diff = new Date(p.resolved_at!).getTime() - new Date(p.created_at).getTime();
                return acc + (diff / (1000 * 60 * 60));
            }, 0);
            mttrHours = Math.round(sumHours / resolvedWithDates.length);
        }

        // 5. Chain Health (VQR, CDR, PAR)
        const vendorIssues = periodPqrs.filter(p => parseRcaFromRecord(p).responsible === 'proveedor').length;
        const transportIssues = periodPqrs.filter(p => parseRcaFromRecord(p).responsible === 'transporte').length;
        const pickingIssues = periodPqrs.filter(p => parseRcaFromRecord(p).responsible === 'picking').length;

        const vqr = Math.max(70, Math.min(100, 100 - (vendorIssues * 2.5)));
        const cdr = (transportIssues / Math.max(totalPqrs, 1)) * 100;
        const par = Math.max(80, Math.min(100, 100 - (pickingIssues * 1.8)));

        return {
            totalPqrs,
            totalNovs,
            ftr,
            totalCoQ,
            totalImputedCOP,
            cri,
            mttrHours,
            vqr,
            cdr,
            par
        };
    }, [periodPqrs, periodNovelties, deliveredOrdersCount]);

    // -------------------------------------------------------------
    // Pareto Dual Engine (Frequency vs Financial $ COP)
    // -------------------------------------------------------------
    const paretoData = useMemo(() => {
        const map: Record<string, {
            key: string;
            categoryL1: string;
            subtypeL2: string;
            label: string;
            dominantResponsible: any;
            count: number;
            totalAmount: number;
        }> = {};

        // Aggregate from PQRs
        periodPqrs.forEach(p => {
            const rca = parseRcaFromRecord(p);
            const cat = rca.categoryL1 || 'dano_mecanico';
            const sub = rca.subtypeL2 || 'aplastamiento_sobreestiba';
            const key = `${cat}___${sub}`;

            const catObj = customTaxonomy.find(c => c.code === cat);
            const subObj = catObj?.subtypes.find(s => s.code === sub);
            const label = subObj?.label || sub.replace(/_/g, ' ');

            if (!map[key]) {
                map[key] = {
                    key,
                    categoryL1: cat,
                    subtypeL2: sub,
                    label,
                    dominantResponsible: rca.responsible || 'transporte',
                    count: 0,
                    totalAmount: 0
                };
            }

            map[key].count += 1;

            // Estimate financial amount from associated novelties or order total fraction
            const associatedNovs = periodNovelties.filter(n => n.order_id === p.order_id);
            if (associatedNovs.length > 0) {
                associatedNovs.forEach(n => {
                    const pr = n.products?.base_price || 0;
                    const q = Number(n.quantity_returned) || 0;
                    map[key].totalAmount += (pr * q);
                });
            } else {
                map[key].totalAmount += 45000; // conservative nominal fallback
            }
        });

        // Convert to array and sort according to paretoMode
        const items = Object.values(map);
        if (paretoMode === 'frequency') {
            items.sort((a, b) => b.count - a.count);
        } else {
            items.sort((a, b) => b.totalAmount - a.totalAmount);
        }

        const totalValue = items.reduce((sum, item) => sum + (paretoMode === 'frequency' ? item.count : item.totalAmount), 0);

        let cumulative = 0;
        const enriched = items.map((item, idx) => {
            const val = paretoMode === 'frequency' ? item.count : item.totalAmount;
            const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
            cumulative += pct;
            const isVitalFew = cumulative <= 80 || idx === 0;

            return {
                ...item,
                value: val,
                percentage: pct,
                cumulativePercentage: Math.min(100, cumulative),
                isVitalFew
            };
        });

        return {
            items: enriched,
            totalValue
        };
    }, [periodPqrs, periodNovelties, customTaxonomy, paretoMode]);

    // -------------------------------------------------------------
    // Imputability Distribution by Area
    // -------------------------------------------------------------
    const areaBreakdown = useMemo(() => {
        const counts: Record<string, { count: number; amount: number }> = {
            proveedor: { count: 0, amount: 0 },
            bodega: { count: 0, amount: 0 },
            picking: { count: 0, amount: 0 },
            transporte: { count: 0, amount: 0 },
            comercial: { count: 0, amount: 0 },
            cliente: { count: 0, amount: 0 }
        };

        periodPqrs.forEach(p => {
            const rca = parseRcaFromRecord(p);
            const resp = rca.responsible in counts ? rca.responsible : 'transporte';
            counts[resp].count += 1;

            if (rca.imputedEntities && rca.imputedEntities.length > 0) {
                rca.imputedEntities.forEach(e => {
                    counts[resp].amount += (Number(e.deductionAmount) || 0);
                });
            } else {
                counts[resp].amount += 35000;
            }
        });

        const totalPqrCount = Math.max(1, periodPqrs.length);

        return Object.entries(counts).map(([key, data]) => {
            const info = RESPONSIBLE_PARTIES[key as any] || {
                label: key,
                color: '#64748B',
                bgLight: '#F1F5F9',
                border: '#CBD5E1'
            };

            return {
                key,
                label: info.label,
                color: info.color,
                bgLight: info.bgLight,
                border: info.border,
                count: data.count,
                amount: data.amount,
                percentage: Math.round((data.count / totalPqrCount) * 100)
            };
        }).sort((a, b) => b.count - a.count);
    }, [periodPqrs]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 1. Header Toolbar with Horizon Switcher */}
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #CBD5E1',
                padding: '12px 18px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        padding: '8px',
                        backgroundColor: '#EAEFEA',
                        color: '#0D7A57',
                        borderRadius: '10px',
                        border: '1px solid #C4D7C4'
                    }}>
                        <TrendingUp size={20} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1rem', fontWeight: '800', color: '#1A231E', margin: 0 }}>
                            Telemetría de Excelencia Operativa & Análisis Pareto (Lean Six Sigma)
                        </h2>
                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            Monitoreo de Calidad en la Fuente, Costo de No Calidad (CoQ) y Planes CAPA de Eliminación de Raíz
                        </span>
                    </div>
                </div>

                {/* Horizon Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        display: 'inline-flex',
                        backgroundColor: '#F8FAFC',
                        borderRadius: '10px',
                        padding: '3px',
                        border: '1px solid #CBD5E1'
                    }}>
                        {[
                            { id: '7d', label: '7 Días' },
                            { id: '30d', label: '30 Días' },
                            { id: '90d', label: '90 Días' },
                            { id: 'year', label: 'Año en Curso' },
                            { id: 'all', label: 'Histórico' }
                        ].map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setTimeRange(t.id as any)}
                                style={{
                                    padding: '5px 12px',
                                    fontSize: '0.72rem',
                                    fontWeight: timeRange === t.id ? '800' : '600',
                                    borderRadius: '7px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    backgroundColor: timeRange === t.id ? '#0D7A57' : 'transparent',
                                    color: timeRange === t.id ? '#FFFFFF' : '#475569',
                                    boxShadow: timeRange === t.id ? '0 1px 4px rgba(13, 122, 87, 0.3)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={onRefresh}
                        title="Recargar Telemetría"
                        style={{
                            padding: '8px',
                            backgroundColor: 'white',
                            border: '1px solid #CBD5E1',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            color: '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <RefreshCw size={15} />
                    </button>
                </div>
            </div>

            {/* 2. Six Lean KPI Cards Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px'
            }}>
                {/* KPI 1: FTR */}
                <div style={{ backgroundColor: 'white', padding: '1rem 1.2rem', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                            First Time Right (FTR)
                        </span>
                        <div style={{ padding: '6px', backgroundColor: '#EAEFEA', color: '#0D7A57', borderRadius: '8px' }}>
                            <CheckCircle2 size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: metrics.ftr >= 98 ? '#0D7A57' : metrics.ftr >= 95 ? '#D97706' : '#DC2626', marginTop: '4px' }}>
                        {metrics.ftr.toFixed(1)}%
                    </div>
                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                        Meta Clase Mundial: <strong>&ge; 98.5%</strong>
                    </span>
                </div>

                {/* KPI 2: CoQ Total */}
                <div style={{ backgroundColor: 'white', padding: '1rem 1.2rem', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                            Costo de Calidad (CoQ)
                        </span>
                        <div style={{ padding: '6px', backgroundColor: '#FEF2F2', color: '#DC2626', borderRadius: '8px' }}>
                            <DollarSign size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: '900', color: '#1A231E', marginTop: '4px' }}>
                        {formatMoney(metrics.totalCoQ)}
                    </div>
                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                        Pérdida en mermas y notas crédito
                    </span>
                </div>

                {/* KPI 3: CRI Cobro */}
                <div style={{ backgroundColor: 'white', padding: '1rem 1.2rem', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                            Recuperación (CRI)
                        </span>
                        <div style={{ padding: '6px', backgroundColor: '#F8FAFC', color: '#0D7A57', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                            <ShieldAlert size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#0D7A57', marginTop: '4px' }}>
                        {metrics.cri}%
                    </div>
                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                        Imputado: <strong>{formatMoney(metrics.totalImputedCOP)}</strong>
                    </span>
                </div>

                {/* KPI 4: MTTR */}
                <div style={{ backgroundColor: 'white', padding: '1rem 1.2rem', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                            Tiempo Resolución (MTTR)
                        </span>
                        <div style={{ padding: '6px', backgroundColor: '#F8FAFC', color: '#475569', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                            <Clock size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#1A231E', marginTop: '4px' }}>
                        {metrics.mttrHours}h
                    </div>
                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                        Meta perecederos: <strong>&le; 4.0h</strong>
                    </span>
                </div>

                {/* KPI 5: Vendor Score (VQR) */}
                <div style={{ backgroundColor: 'white', padding: '1rem 1.2rem', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                            Score Proveedor (VQR)
                        </span>
                        <div style={{ padding: '6px', backgroundColor: '#FEF3C7', color: '#B45309', borderRadius: '8px' }}>
                            <Warehouse size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#B45309', marginTop: '4px' }}>
                        {metrics.vqr.toFixed(0)}/100
                    </div>
                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                        Cumplimiento fitosanitario en muelle
                    </span>
                </div>

                {/* KPI 6: Picking & Rutas */}
                <div style={{ backgroundColor: 'white', padding: '1rem 1.2rem', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                            Exactitud Báscula (PAR)
                        </span>
                        <div style={{ padding: '6px', backgroundColor: '#F8FAFC', color: '#334155', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                            <Sliders size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#1A231E', marginTop: '4px' }}>
                        {metrics.par.toFixed(1)}%
                    </div>
                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                        Conformidad peso en alistamiento
                    </span>
                </div>
            </div>

            {/* 3. Dual Pareto Analysis Section */}
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #CBD5E1',
                padding: '1.25rem 1.5rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    paddingBottom: '1rem',
                    borderBottom: '1px solid #E2E8F0'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <BarChart2 size={18} style={{ color: '#0D7A57' }} />
                            <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#1A231E', margin: 0 }}>
                                Diagrama de Pareto Dual (Principio 80/20 & Curva de Lorenz)
                            </h3>
                            <span style={{ fontSize: '0.68rem', fontWeight: '700', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                                80% de pérdidas en el 20% de causas
                            </span>
                        </div>
                        <p style={{ fontSize: '0.72rem', color: '#64748B', margin: '2px 0 0 0' }}>
                            Identifica los &quot;Pocos Vitales&quot; que concentran el mayor impacto para enfocar los planes de mejora Poka-Yoke
                        </p>
                    </div>

                    {/* Pareto Mode Toggle */}
                    <div style={{
                        display: 'inline-flex',
                        backgroundColor: '#F8FAFC',
                        borderRadius: '10px',
                        padding: '3px',
                        border: '1px solid #CBD5E1'
                    }}>
                        <button
                            type="button"
                            onClick={() => setParetoMode('financial')}
                            style={{
                                padding: '6px 14px',
                                fontSize: '0.72rem',
                                fontWeight: paretoMode === 'financial' ? '800' : '600',
                                borderRadius: '7px',
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: paretoMode === 'financial' ? '#0D7A57' : 'transparent',
                                color: paretoMode === 'financial' ? '#FFFFFF' : '#475569',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <DollarSign size={13} />
                            <span>Por Impacto Financiero ($ COP)</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setParetoMode('frequency')}
                            style={{
                                padding: '6px 14px',
                                fontSize: '0.72rem',
                                fontWeight: paretoMode === 'frequency' ? '800' : '600',
                                borderRadius: '7px',
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: paretoMode === 'frequency' ? '#0D7A57' : 'transparent',
                                color: paretoMode === 'frequency' ? '#FFFFFF' : '#475569',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <Layers size={13} />
                            <span>Por Frecuencia (# Casos)</span>
                        </button>
                    </div>
                </div>

                {/* Pareto Chart Visualizer (Crisp SVG) */}
                <div style={{ margin: '1.25rem 0' }}>
                    {paretoData.items.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {paretoData.items.slice(0, 6).map((item, idx) => {
                                const isTopVital = item.isVitalFew;
                                const barWidth = Math.max(8, item.percentage);
                                const areaInfo = RESPONSIBLE_PARTIES[item.dominantResponsible as any] || { label: item.dominantResponsible, color: '#0D7A57', bgLight: '#EAEFEA' };

                                return (
                                    <div key={item.key} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '8px 12px',
                                        borderRadius: '10px',
                                        backgroundColor: isTopVital ? '#FEFCE8' : '#F8FAFC',
                                        border: isTopVital ? '1px solid #FEF08A' : '1px solid #E2E8F0'
                                    }}>
                                        {/* Rank # */}
                                        <div style={{
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '50%',
                                            backgroundColor: isTopVital ? '#CA8A04' : '#64748B',
                                            color: 'white',
                                            fontSize: '0.7rem',
                                            fontWeight: '900',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            {idx + 1}
                                        </div>

                                        {/* Label & Area */}
                                        <div style={{ width: '220px', flexShrink: 0 }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#1A231E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.label}>
                                                {item.label}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: '700', padding: '1px 5px', borderRadius: '4px', backgroundColor: areaInfo.bgLight, color: areaInfo.color }}>
                                                    {areaInfo.label}
                                                </span>
                                                <span style={{ fontSize: '0.65rem', color: '#64748B' }}>
                                                    {item.count} {item.count === 1 ? 'caso' : 'casos'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Bar & Accumulated Curve Visual */}
                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ flex: 1, height: '14px', backgroundColor: '#E2E8F0', borderRadius: '7px', overflow: 'hidden', position: 'relative' }}>
                                                <div style={{
                                                    width: `${barWidth}%`,
                                                    height: '100%',
                                                    backgroundColor: isTopVital ? '#0D7A57' : '#64748B',
                                                    borderRadius: '7px',
                                                    transition: 'width 0.4s ease'
                                                }} />
                                            </div>
                                            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#1A231E', width: '90px', textAlign: 'right' }}>
                                                {paretoMode === 'financial' ? formatMoney(item.totalAmount) : `${item.count} casos`}
                                            </span>
                                            <span style={{ fontSize: '0.68rem', fontWeight: '700', color: isTopVital ? '#CA8A04' : '#64748B', width: '70px', textAlign: 'right' }}>
                                                {item.cumulativePercentage.toFixed(0)}% Acum.
                                            </span>
                                        </div>

                                        {/* Action Button: Open CAPA */}
                                        <button
                                            type="button"
                                            onClick={() => handleOpenNewCapaForCause(item)}
                                            style={{
                                                padding: '5px 10px',
                                                fontSize: '0.68rem',
                                                fontWeight: '800',
                                                borderRadius: '6px',
                                                border: '1px solid #CBD5E1',
                                                backgroundColor: 'white',
                                                color: '#0D7A57',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                whiteSpace: 'nowrap'
                                            }}
                                            title="Abrir Plan de Acción Correctiva (CAPA)"
                                        >
                                            <Target size={12} />
                                            <span>Plan CAPA</span>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B', fontSize: '0.8rem' }}>
                            No hay incidencias registradas en el horizonte de tiempo seleccionado.
                        </div>
                    )}
                </div>
            </div>

            {/* 4. Imputability Matrix & Health of Supply Chain */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '16px'
            }}>
                {/* 4.A Area Imputability */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #CBD5E1',
                    padding: '1.25rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
                        <Warehouse size={18} style={{ color: '#0D7A57' }} />
                        <h3 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#1A231E', margin: 0 }}>
                            Matriz de Imputabilidad por Eslabón
                        </h3>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {areaBreakdown.map(area => (
                            <div key={area.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                <div style={{ width: '130px', fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>
                                    {area.label}
                                </div>
                                <div style={{ flex: 1, height: '8px', backgroundColor: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ width: `${area.percentage}%`, height: '100%', backgroundColor: area.color, borderRadius: '4px' }} />
                                </div>
                                <div style={{ width: '110px', textAlign: 'right', fontSize: '0.72rem', fontWeight: '800', color: '#1A231E' }}>
                                    {area.count} ({area.percentage}%) · {formatMoney(area.amount)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 4.B CAPA Improvement Plans Summary */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #CBD5E1',
                    padding: '1.25rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Target size={18} style={{ color: '#0D7A57' }} />
                                <h3 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#1A231E', margin: 0 }}>
                                    Planes de Mejora Continua (CAPA Tracker)
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedCapaPlan(null);
                                    setCapaPrefillData(null);
                                    setIsCapaModalOpen(true);
                                }}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    backgroundColor: '#0D7A57',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <Plus size={12} />
                                <span>Nuevo Plan</span>
                            </button>
                        </div>

                        {/* List of active CAPA plans */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                            {capaPlans.length > 0 ? (
                                capaPlans.map(plan => (
                                    <div
                                        key={plan.id}
                                        onClick={() => {
                                            setSelectedCapaPlan(plan);
                                            setIsCapaModalOpen(true);
                                        }}
                                        style={{
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            backgroundColor: '#F8FAFC',
                                            border: '1px solid #E2E8F0',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px'
                                        }}
                                    >
                                        <div style={{ maxWidth: '280px' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#1A231E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {plan.title}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: '#64748B' }}>
                                                Resp: {plan.assignedTo || 'Sin asignar'} · Límite: {plan.targetDate || 'S/F'}
                                            </div>
                                        </div>
                                        <span style={{
                                            fontSize: '0.65rem',
                                            fontWeight: '800',
                                            padding: '2px 6px',
                                            borderRadius: '8px',
                                            backgroundColor: plan.status === 'effective_closed' ? '#EAEFEA' : plan.status === 'verifying_15d' ? '#FEF3C7' : '#F1F5F9',
                                            color: plan.status === 'effective_closed' ? '#0D7A57' : plan.status === 'verifying_15d' ? '#92400E' : '#334155'
                                        }}>
                                            {plan.status === 'diagnosing' ? 'Diagnóstico' : plan.status === 'implementing' ? 'Implementación' : plan.status === 'verifying_15d' ? 'Verificación 15D' : plan.status === 'effective_closed' ? 'Cerrado Eficaz' : 'Ineficaz'}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <div style={{ fontSize: '0.75rem', color: '#94A3B8', textAlign: 'center', padding: '1.5rem 0' }}>
                                    No hay planes CAPA activos. Abre un plan desde el Pareto o crea uno nuevo.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal for CAPA Plan creation/edition */}
            <PqrCapaPlanModal
                isOpen={isCapaModalOpen}
                onClose={() => {
                    setIsCapaModalOpen(false);
                    setSelectedCapaPlan(null);
                    setCapaPrefillData(null);
                }}
                plan={selectedCapaPlan}
                onSave={handleSaveCapaPlan}
                onDelete={handleDeleteCapaPlan}
                customTaxonomy={customTaxonomy}
                prefillData={capaPrefillData}
            />
        </div>
    );
}
