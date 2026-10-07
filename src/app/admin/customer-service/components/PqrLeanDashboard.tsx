'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
    BarChart2, TrendingUp, TrendingDown, ShieldAlert, CheckCircle2, 
    AlertTriangle, DollarSign, Clock, Truck, Warehouse, Store, 
    Layers, User, Target, Wrench, Plus, ArrowRight, RefreshCw, 
    Sliders, FileText, Check, HelpCircle, AlertCircle, Activity,
    Calendar, Filter, ArrowUpRight, ArrowDownRight, Minus, Flag, Sparkles
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

export const CATEGORY_PALETTE: Record<string, { label: string; color: string; bg: string; border: string }> = {
    dano_mecanico: { label: 'Daño Físico & Mecánico', color: '#E11D48', bg: '#FFE4E6', border: '#FDA4AF' },
    fisiologia_maduracion: { label: 'Fisiología & Maduración', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
    fitopatologia: { label: 'Fitopatología & Sanidad', color: '#7C3AED', bg: '#F3E8FF', border: '#DDD6FE' },
    cadena_frio: { label: 'Cadena de Frío & Humedad', color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC' },
    calibre_especificacion: { label: 'Calibre & Especificación', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
    error_montaje_pedido: { label: 'Error Picking / Montaje', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
    comercial_cliente: { label: 'Comercial / Cliente', color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
    no_definido: { label: 'Sin Clasificar / En Análisis', color: '#94A3B8', bg: '#F8FAFC', border: '#E2E8F0' }
};

interface HistBucket {
    key: string;
    label: string;
    fullLabel: string;
    startDate: Date;
    endDate: Date;
    totalCount: number;
    totalFinancial: number;
    categoryCounts: Record<string, number>;
    categoryFinancial: Record<string, number>;
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

    // 3. Histogram & Trend Analysis State
    const [histGranularity, setHistGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [histMetric, setHistMetric] = useState<'count' | 'financial'>('count');
    const [histSelectedCategory, setHistSelectedCategory] = useState<string>('all');
    const [hoveredBucketIdx, setHoveredBucketIdx] = useState<number | null>(null);

    // Auto-adjust default granularity when timeRange changes
    useEffect(() => {
        if (timeRange === '7d') setHistGranularity('daily');
        else if (timeRange === '30d') setHistGranularity('daily');
        else if (timeRange === '90d') setHistGranularity('weekly');
        else if (timeRange === 'year') setHistGranularity('monthly');
        else setHistGranularity('monthly');
    }, [timeRange]);

    // 4. CAPA Plans State (Persistent in localStorage)
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
                const oi = n.orders?.order_items?.find((item: any) => item.product_id === n.product_id);
                const price = Number(oi?.unit_price || n.unit_price || 0);
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
    // Macrocausa Distribution & Counts in Active Period
    // -------------------------------------------------------------
    const macroCategoryStats = useMemo(() => {
        const stats: Record<string, { count: number; financial: number }> = {};
        let totalCount = 0;
        let totalFinancial = 0;

        periodPqrs.forEach(p => {
            const rca = parseRcaFromRecord(p);
            const cat = rca.categoryL1 || 'no_definido';
            const cost = rca.imputedEntities?.reduce((sum, e) => sum + (Number(e.deductionAmount) || 0), 0) || 45000;

            if (!stats[cat]) {
                stats[cat] = { count: 0, financial: 0 };
            }
            stats[cat].count += 1;
            stats[cat].financial += cost;
            totalCount += 1;
            totalFinancial += cost;
        });

        return { stats, totalCount, totalFinancial };
    }, [periodPqrs]);

    // -------------------------------------------------------------
    // Histogram Time Buckets & Trend Engine (Statistical Process Control)
    // -------------------------------------------------------------
    const histogramBuckets = useMemo(() => {
        const now = new Date();
        const start = new Date(cutoffDate.getTime());
        const buckets: HistBucket[] = [];

        if (histGranularity === 'daily') {
            // Calculate number of days
            const diffDays = Math.max(1, Math.min(31, Math.ceil((now.getTime() - start.getTime()) / 86400000)));
            const bucketDuration = diffDays <= 7 ? 1 : diffDays <= 14 ? 1 : 2; // 1 or 2 days per bar

            let cur = new Date(start.getTime());
            cur.setHours(0, 0, 0, 0);

            while (cur < now) {
                const bEnd = new Date(cur.getTime() + bucketDuration * 86400000);
                const isSingleDay = bucketDuration === 1;
                const label = isSingleDay
                    ? cur.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
                    : `${cur.getDate()}-${new Date(bEnd.getTime() - 86400000).getDate()} ${cur.toLocaleDateString('es-CO', { month: 'short' })}`;

                const b: HistBucket = {
                    key: `day-${cur.getTime()}`,
                    label,
                    fullLabel: `${cur.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}`,
                    startDate: new Date(cur),
                    endDate: new Date(bEnd),
                    totalCount: 0,
                    totalFinancial: 0,
                    categoryCounts: {},
                    categoryFinancial: {}
                };

                // Aggregate PQRS
                periodPqrs.forEach(p => {
                    const pDate = new Date(p.created_at);
                    if (pDate >= b.startDate && pDate < b.endDate) {
                        b.totalCount += 1;
                        const rca = parseRcaFromRecord(p);
                        const cat = rca.categoryL1 || 'no_definido';
                        b.categoryCounts[cat] = (b.categoryCounts[cat] || 0) + 1;
                        
                        // Financial impact
                        const rcaCost = rca.imputedEntities?.reduce((sum, e) => sum + (Number(e.deductionAmount) || 0), 0) || 45000;
                        b.totalFinancial += rcaCost;
                        b.categoryFinancial[cat] = (b.categoryFinancial[cat] || 0) + rcaCost;
                    }
                });

                buckets.push(b);
                cur = new Date(bEnd.getTime());
            }
        } else if (histGranularity === 'weekly') {
            const stepMs = 7 * 86400000;
            let cur = new Date(start.getTime());
            let weekIdx = 1;

            while (cur < now) {
                const bEnd = new Date(Math.min(now.getTime() + 86400000, cur.getTime() + stepMs));
                const label = `Sem ${weekIdx}`;
                const fullLabel = `${cur.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} - ${new Date(bEnd.getTime() - 86400000).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`;

                const b: HistBucket = {
                    key: `week-${weekIdx}`,
                    label,
                    fullLabel,
                    startDate: new Date(cur),
                    endDate: new Date(bEnd),
                    totalCount: 0,
                    totalFinancial: 0,
                    categoryCounts: {},
                    categoryFinancial: {}
                };

                periodPqrs.forEach(p => {
                    const pDate = new Date(p.created_at);
                    if (pDate >= b.startDate && pDate < b.endDate) {
                        b.totalCount += 1;
                        const rca = parseRcaFromRecord(p);
                        const cat = rca.categoryL1 || 'no_definido';
                        b.categoryCounts[cat] = (b.categoryCounts[cat] || 0) + 1;

                        const rcaCost = rca.imputedEntities?.reduce((sum, e) => sum + (Number(e.deductionAmount) || 0), 0) || 45000;
                        b.totalFinancial += rcaCost;
                        b.categoryFinancial[cat] = (b.categoryFinancial[cat] || 0) + rcaCost;
                    }
                });

                buckets.push(b);
                cur = new Date(bEnd.getTime());
                weekIdx++;
            }
        } else {
            // Monthly
            let cur = new Date(start.getFullYear(), start.getMonth(), 1);
            while (cur <= now) {
                const bEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
                const label = cur.toLocaleDateString('es-CO', { month: 'short' });
                const fullLabel = cur.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

                const b: HistBucket = {
                    key: `month-${cur.getFullYear()}-${cur.getMonth()}`,
                    label,
                    fullLabel,
                    startDate: new Date(cur),
                    endDate: new Date(bEnd),
                    totalCount: 0,
                    totalFinancial: 0,
                    categoryCounts: {},
                    categoryFinancial: {}
                };

                periodPqrs.forEach(p => {
                    const pDate = new Date(p.created_at);
                    if (pDate >= b.startDate && pDate < b.endDate) {
                        b.totalCount += 1;
                        const rca = parseRcaFromRecord(p);
                        const cat = rca.categoryL1 || 'no_definido';
                        b.categoryCounts[cat] = (b.categoryCounts[cat] || 0) + 1;

                        const rcaCost = rca.imputedEntities?.reduce((sum, e) => sum + (Number(e.deductionAmount) || 0), 0) || 45000;
                        b.totalFinancial += rcaCost;
                        b.categoryFinancial[cat] = (b.categoryFinancial[cat] || 0) + rcaCost;
                    }
                });

                buckets.push(b);
                cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
            }
        }

        return buckets;
    }, [cutoffDate, histGranularity, periodPqrs]);

    // Trend Evaluation (Delta vs Previous Half)
    const trendAnalysis = useMemo(() => {
        if (histogramBuckets.length < 2) {
            return {
                deltaPercent: 0,
                status: 'stable' as 'improving' | 'worsening' | 'stable',
                totalMetricValue: 0,
                peakBucket: null as HistBucket | null,
                categoryStats: [] as any[]
            };
        }

        const mid = Math.floor(histogramBuckets.length / 2);
        const firstHalf = histogramBuckets.slice(0, mid);
        const secondHalf = histogramBuckets.slice(mid);

        const getVal = (b: HistBucket) => {
            if (histSelectedCategory === 'all') {
                return histMetric === 'count' ? b.totalCount : b.totalFinancial;
            }
            return histMetric === 'count' 
                ? (b.categoryCounts[histSelectedCategory] || 0) 
                : (b.categoryFinancial[histSelectedCategory] || 0);
        };

        const sum1 = firstHalf.reduce((acc, b) => acc + getVal(b), 0);
        const sum2 = secondHalf.reduce((acc, b) => acc + getVal(b), 0);
        const total = sum1 + sum2;

        let deltaPercent = 0;
        if (sum1 > 0) {
            deltaPercent = Math.round(((sum2 - sum1) / sum1) * 100);
        } else if (sum2 > 0) {
            deltaPercent = 100;
        }

        let status: 'improving' | 'worsening' | 'stable' = 'stable';
        if (deltaPercent <= -15) status = 'improving';
        else if (deltaPercent >= 15) status = 'worsening';

        // Peak bucket
        let peakBucket: HistBucket | null = null;
        let maxVal = -1;
        histogramBuckets.forEach(b => {
            const v = getVal(b);
            if (v > maxVal) {
                maxVal = v;
                peakBucket = b;
            }
        });

        // Category by Category Breakdown with Sparkline values
        const catStats = RCA_CATEGORIES_L1.map(cat => {
            const counts = histogramBuckets.map(b => b.categoryCounts[cat.code] || 0);
            const totalCatCount = counts.reduce((a, b) => a + b, 0);
            const totalCatFinancial = histogramBuckets.reduce((acc, b) => acc + (b.categoryFinancial[cat.code] || 0), 0);

            const catHalf1 = counts.slice(0, mid).reduce((a, b) => a + b, 0);
            const catHalf2 = counts.slice(mid).reduce((a, b) => a + b, 0);
            let catDelta = 0;
            if (catHalf1 > 0) catDelta = Math.round(((catHalf2 - catHalf1) / catHalf1) * 100);
            else if (catHalf2 > 0) catDelta = 100;

            let catStatus: 'improving' | 'worsening' | 'stable' = 'stable';
            if (catDelta <= -15) catStatus = 'improving';
            else if (catDelta >= 15) catStatus = 'worsening';

            return {
                code: cat.code,
                label: cat.label,
                totalCount: totalCatCount,
                totalFinancial: totalCatFinancial,
                sparkline: counts,
                deltaPercent: catDelta,
                status: catStatus,
                palette: CATEGORY_PALETTE[cat.code] || CATEGORY_PALETTE.no_definido
            };
        }).sort((a, b) => b.totalCount - a.totalCount);

        return {
            deltaPercent,
            status,
            totalMetricValue: total,
            peakBucket,
            categoryStats: catStats
        };
    }, [histogramBuckets, histSelectedCategory, histMetric]);

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

            const associatedNovs = periodNovelties.filter(n => n.order_id === p.order_id);
            if (associatedNovs.length > 0) {
                associatedNovs.forEach(n => {
                    const oi = n.orders?.order_items?.find((item: any) => item.product_id === n.product_id);
                    const pr = Number(oi?.unit_price || n.unit_price || 0);
                    const q = Number(n.quantity_returned) || 0;
                    map[key].totalAmount += (pr * q);
                });
            } else {
                map[key].totalAmount += 45000;
            }
        });

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

    // Max Histogram Value for scaling
    const maxHistVal = useMemo(() => {
        let max = 1;
        histogramBuckets.forEach(b => {
            if (histSelectedCategory === 'all') {
                const v = histMetric === 'count' ? b.totalCount : b.totalFinancial;
                if (v > max) max = v;
            } else {
                const v = histMetric === 'count' 
                    ? (b.categoryCounts[histSelectedCategory] || 0) 
                    : (b.categoryFinancial[histSelectedCategory] || 0);
                if (v > max) max = v;
            }
        });
        return Math.max(max, histMetric === 'count' ? 5 : 100000);
    }, [histogramBuckets, histSelectedCategory, histMetric]);

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

            {/* ============================================================= */}
            {/* 3. HISTOGRAMA DE EVOLUCIÓN TEMPORAL & RUN CHARTS (LEAN TRENDS) */}
            {/* ============================================================= */}
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #CBD5E1',
                padding: '1.25rem 1.5rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
            }}>
                {/* Header of Histogram Section */}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <Activity size={18} style={{ color: '#0D7A57' }} />
                            <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#1A231E', margin: 0 }}>
                                Histograma de Evolución Temporal & Análisis de Tendencia (Run Chart)
                            </h3>
                            <span style={{
                                fontSize: '0.68rem',
                                fontWeight: '800',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                backgroundColor: trendAnalysis.status === 'improving' ? '#ECFDF5' : trendAnalysis.status === 'worsening' ? '#FEF2F2' : '#F1F5F9',
                                color: trendAnalysis.status === 'improving' ? '#059669' : trendAnalysis.status === 'worsening' ? '#DC2626' : '#475569',
                                border: `1px solid ${trendAnalysis.status === 'improving' ? '#A7F3D0' : trendAnalysis.status === 'worsening' ? '#FECDD3' : '#CBD5E1'}`,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                {trendAnalysis.status === 'improving' ? <ArrowDownRight size={12} /> : trendAnalysis.status === 'worsening' ? <ArrowUpRight size={12} /> : <Minus size={12} />}
                                <span>
                                    {trendAnalysis.status === 'improving' 
                                        ? `Mejora Continua (${trendAnalysis.deltaPercent}%)` 
                                        : trendAnalysis.status === 'worsening' 
                                        ? `Alerta: Empeorando (+${trendAnalysis.deltaPercent}%)` 
                                        : `Tendencia Estable (${trendAnalysis.deltaPercent}%)`}
                                </span>
                            </span>
                        </div>
                        <p style={{ fontSize: '0.72rem', color: '#64748B', margin: '2px 0 0 0' }}>
                            Verifica de forma cronológica si los planes de mejoramiento están reduciendo efectivamente las causas raíz en el tiempo
                        </p>
                    </div>

                    {/* Controls: Metric Toggle + Granularity */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Granularity Selector */}
                        <div style={{
                            display: 'inline-flex',
                            backgroundColor: '#F8FAFC',
                            borderRadius: '10px',
                            padding: '3px',
                            border: '1px solid #CBD5E1'
                        }}>
                            {[
                                { id: 'daily', label: 'Diario' },
                                { id: 'weekly', label: 'Semanal' },
                                { id: 'monthly', label: 'Mensual' }
                            ].map(g => (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => setHistGranularity(g.id as any)}
                                    style={{
                                        padding: '5px 10px',
                                        fontSize: '0.7rem',
                                        fontWeight: histGranularity === g.id ? '800' : '600',
                                        borderRadius: '7px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        backgroundColor: histGranularity === g.id ? '#0D7A57' : 'transparent',
                                        color: histGranularity === g.id ? '#FFFFFF' : '#475569',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {g.label}
                                </button>
                            ))}
                        </div>

                        {/* Metric Selector */}
                        <div style={{
                            display: 'inline-flex',
                            backgroundColor: '#F8FAFC',
                            borderRadius: '10px',
                            padding: '3px',
                            border: '1px solid #CBD5E1'
                        }}>
                            <button
                                type="button"
                                onClick={() => setHistMetric('count')}
                                style={{
                                    padding: '5px 10px',
                                    fontSize: '0.7rem',
                                    fontWeight: histMetric === 'count' ? '800' : '600',
                                    borderRadius: '7px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    backgroundColor: histMetric === 'count' ? '#0D7A57' : 'transparent',
                                    color: histMetric === 'count' ? '#FFFFFF' : '#475569',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <Layers size={12} />
                                <span># Casos</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setHistMetric('financial')}
                                style={{
                                    padding: '5px 10px',
                                    fontSize: '0.7rem',
                                    fontWeight: histMetric === 'financial' ? '800' : '600',
                                    borderRadius: '7px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    backgroundColor: histMetric === 'financial' ? '#0D7A57' : 'transparent',
                                    color: histMetric === 'financial' ? '#FFFFFF' : '#475569',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <DollarSign size={12} />
                                <span>$ CoQ COP</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Macrocausa Selector Filter Pills (Fluid Multi-Line Wrap & Reactive Case Badges) */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '6px',
                    padding: '8px 0 4px 0'
                }}>
                    <button
                        type="button"
                        onClick={() => setHistSelectedCategory('all')}
                        style={{
                            padding: '4px 10px',
                            fontSize: '0.72rem',
                            fontWeight: histSelectedCategory === 'all' ? '800' : '600',
                            borderRadius: '20px',
                            border: histSelectedCategory === 'all' ? '1.5px solid #0D7A57' : '1px solid #CBD5E1',
                            backgroundColor: histSelectedCategory === 'all' ? '#EAEFEA' : '#FFFFFF',
                            color: histSelectedCategory === 'all' ? '#0D7A57' : '#475569',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: histSelectedCategory === 'all' ? '0 1px 3px rgba(13, 122, 87, 0.15)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <span>🌐 Todas las Macrocausas (Apiladas)</span>
                        <span style={{
                            fontSize: '0.64rem',
                            fontWeight: '900',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            backgroundColor: histSelectedCategory === 'all' ? '#0D7A57' : '#E2E8F0',
                            color: histSelectedCategory === 'all' ? '#FFFFFF' : '#475569'
                        }}>
                            {macroCategoryStats.totalCount}
                        </span>
                    </button>

                    {RCA_CATEGORIES_L1.map(cat => {
                        const pal = CATEGORY_PALETTE[cat.code] || CATEGORY_PALETTE.no_definido;
                        const isSel = histSelectedCategory === cat.code;
                        const count = macroCategoryStats.stats[cat.code]?.count || 0;
                        const hasCases = count > 0;

                        return (
                            <button
                                key={cat.code}
                                type="button"
                                onClick={() => setHistSelectedCategory(cat.code)}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '0.72rem',
                                    fontWeight: isSel ? '800' : hasCases ? '600' : '500',
                                    borderRadius: '20px',
                                    border: isSel ? `1.5px solid ${pal.color}` : hasCases ? '1px solid #CBD5E1' : '1px dashed #E2E8F0',
                                    backgroundColor: isSel ? pal.bg : hasCases ? '#FFFFFF' : '#F8FAFC',
                                    color: isSel ? pal.color : hasCases ? '#334155' : '#94A3B8',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    opacity: hasCases || isSel ? 1 : 0.75,
                                    boxShadow: isSel ? `0 1px 4px ${pal.color}25` : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <span style={{ 
                                    width: '7px', 
                                    height: '7px', 
                                    borderRadius: '50%', 
                                    backgroundColor: hasCases || isSel ? pal.color : '#CBD5E1' 
                                }} />
                                <span>{cat.label.replace(/^\d+\.\s*/, '')}</span>
                                <span style={{
                                    fontSize: '0.64rem',
                                    fontWeight: '800',
                                    padding: '1px 6px',
                                    borderRadius: '10px',
                                    backgroundColor: isSel ? pal.color : hasCases ? '#F1F5F9' : '#F8FAFC',
                                    color: isSel ? '#FFFFFF' : hasCases ? '#475569' : '#94A3B8',
                                    border: isSel ? 'none' : hasCases ? '1px solid #E2E8F0' : '1px solid #F1F5F9'
                                }}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Telemetry Summary Banner for Selected Cause */}
                <div style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    margin: '8px 0 14px 0',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '10px',
                    fontSize: '0.72rem'
                }}>
                    <div>
                        <span style={{ color: '#64748B', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: '800' }}>Causa Activa</span>
                        <strong style={{ color: '#0F172A', fontSize: '0.82rem' }}>
                            {histSelectedCategory === 'all' 
                                ? 'Consolidado General (Todas las Causas)' 
                                : RCA_CATEGORIES_L1.find(c => c.code === histSelectedCategory)?.label || histSelectedCategory}
                        </strong>
                    </div>

                    <div>
                        <span style={{ color: '#64748B', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: '800' }}>Total en Periodo</span>
                        <strong style={{ color: '#0D7A57', fontSize: '0.82rem' }}>
                            {histMetric === 'count' 
                                ? `${trendAnalysis.totalMetricValue} casos registrados` 
                                : formatMoney(trendAnalysis.totalMetricValue)}
                        </strong>
                    </div>

                    <div>
                        <span style={{ color: '#64748B', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: '800' }}>Tendencia Run-Chart</span>
                        <strong style={{ 
                            color: trendAnalysis.status === 'improving' ? '#059669' : trendAnalysis.status === 'worsening' ? '#DC2626' : '#475569', 
                            fontSize: '0.82rem' 
                        }}>
                            {trendAnalysis.status === 'improving' ? '📉 Reduciendo Fallas' : trendAnalysis.status === 'worsening' ? '📈 Crecimiento de Fallas' : '➡️ Estable'}
                        </strong>
                    </div>

                    <div>
                        <span style={{ color: '#64748B', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: '800' }}>Pico Crítico</span>
                        <strong style={{ color: '#BE123C', fontSize: '0.82rem' }}>
                            {trendAnalysis.peakBucket ? `${trendAnalysis.peakBucket.label}` : 'Sin picos'}
                        </strong>
                    </div>
                </div>

                {/* SVG Histogram Visualizer */}
                <div style={{ position: 'relative', width: '100%', backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '10px 0' }}>
                    {histogramBuckets.length > 0 ? (
                        <svg viewBox="0 0 940 240" style={{ width: '100%', height: '240px', overflow: 'visible' }}>
                            {/* Horizontal Grid lines */}
                            {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                                const y = 190 - (pct * 160);
                                const valLabel = histMetric === 'count' 
                                    ? Math.round(pct * maxHistVal) 
                                    : `$${Math.round((pct * maxHistVal) / 1000)}k`;
                                return (
                                    <g key={idx}>
                                        <line x1="50" y1={y} x2="920" y2={y} stroke="#F1F5F9" strokeWidth="1" strokeDasharray={pct > 0 && pct < 1 ? "4 4" : undefined} />
                                        <text x="42" y={y + 4} textAnchor="end" fontSize="10" fill="#94A3B8" fontFamily="sans-serif">
                                            {valLabel}
                                        </text>
                                    </g>
                                );
                            })}

                            {/* Render Bars for each Bucket */}
                            {(() => {
                                const bCount = histogramBuckets.length;
                                const usableWidth = 860;
                                const step = usableWidth / Math.max(1, bCount);
                                const barW = Math.max(12, Math.min(48, step * 0.65));

                                // Points for single category trendline
                                const trendPoints: { x: number; y: number }[] = [];

                                return (
                                    <>
                                        {histogramBuckets.map((b, i) => {
                                            const cx = 60 + i * step + (step / 2);
                                            const bx = cx - barW / 2;
                                            const isHovered = hoveredBucketIdx === i;

                                            if (histSelectedCategory === 'all') {
                                                // Stacked Bars by Category
                                                let curY = 190;
                                                const catKeys = Object.keys(b.categoryCounts);

                                                return (
                                                    <g 
                                                        key={b.key}
                                                        onMouseEnter={() => setHoveredBucketIdx(i)}
                                                        onMouseLeave={() => setHoveredBucketIdx(null)}
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        {/* Base Highlight on Hover */}
                                                        {isHovered && (
                                                            <rect x={cx - step/2} y="20" width={step} height="175" fill="#F8FAFC" opacity="0.7" rx="6" />
                                                        )}

                                                        {catKeys.map(catKey => {
                                                            const catVal = histMetric === 'count' 
                                                                ? (b.categoryCounts[catKey] || 0) 
                                                                : (b.categoryFinancial[catKey] || 0);
                                                            if (catVal <= 0) return null;

                                                            const segH = Math.max(2, (catVal / maxHistVal) * 160);
                                                            curY -= segH;
                                                            const pal = CATEGORY_PALETTE[catKey] || CATEGORY_PALETTE.no_definido;

                                                            return (
                                                                <rect 
                                                                    key={catKey}
                                                                    x={bx}
                                                                    y={curY}
                                                                    width={barW}
                                                                    height={segH}
                                                                    fill={pal.color}
                                                                    opacity={isHovered ? 1 : 0.85}
                                                                    rx="3"
                                                                />
                                                            );
                                                        })}

                                                        {/* Bucket Label */}
                                                        <text x={cx} y="210" textAnchor="middle" fontSize="10" fill={isHovered ? '#0F172A' : '#64748B'} fontWeight={isHovered ? '800' : '600'}>
                                                            {b.label}
                                                        </text>
                                                    </g>
                                                );
                                            } else {
                                                // Single Category Bar + Trendline
                                                const val = histMetric === 'count' 
                                                    ? (b.categoryCounts[histSelectedCategory] || 0) 
                                                    : (b.categoryFinancial[histSelectedCategory] || 0);
                                                
                                                const h = Math.max(val > 0 ? 3 : 0, (val / maxHistVal) * 160);
                                                const y = 190 - h;
                                                const pal = CATEGORY_PALETTE[histSelectedCategory] || CATEGORY_PALETTE.no_definido;

                                                trendPoints.push({ x: cx, y });

                                                return (
                                                    <g 
                                                        key={b.key}
                                                        onMouseEnter={() => setHoveredBucketIdx(i)}
                                                        onMouseLeave={() => setHoveredBucketIdx(null)}
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        {isHovered && (
                                                            <rect x={cx - step/2} y="20" width={step} height="175" fill="#F8FAFC" opacity="0.7" rx="6" />
                                                        )}

                                                        <rect 
                                                            x={bx}
                                                            y={y}
                                                            width={barW}
                                                            height={h}
                                                            fill={pal.color}
                                                            opacity={isHovered ? 1 : 0.85}
                                                            rx="4"
                                                        />

                                                        {/* Top Value on bar if > 0 */}
                                                        {val > 0 && (
                                                            <text x={cx} y={y - 6} textAnchor="middle" fontSize="9" fontWeight="800" fill={pal.color}>
                                                                {histMetric === 'count' ? val : `$${Math.round(val / 1000)}k`}
                                                            </text>
                                                        )}

                                                        <text x={cx} y="210" textAnchor="middle" fontSize="10" fill={isHovered ? '#0F172A' : '#64748B'} fontWeight={isHovered ? '800' : '600'}>
                                                            {b.label}
                                                        </text>
                                                    </g>
                                                );
                                            }
                                        })}

                                        {/* Trendline Curve for Single Category */}
                                        {histSelectedCategory !== 'all' && trendPoints.length > 1 && (
                                            <g>
                                                <polyline 
                                                    points={trendPoints.map(p => `${p.x},${p.y}`).join(' ')}
                                                    fill="none"
                                                    stroke="#1E293B"
                                                    strokeWidth="2.5"
                                                    strokeDasharray="4 2"
                                                />
                                                {trendPoints.map((p, pIdx) => (
                                                    <circle 
                                                        key={pIdx} 
                                                        cx={p.x} 
                                                        cy={p.y} 
                                                        r="4" 
                                                        fill="#FFFFFF" 
                                                        stroke="#1E293B" 
                                                        strokeWidth="2" 
                                                    />
                                                ))}
                                            </g>
                                        )}
                                    </>
                                );
                            })()}
                        </svg>
                    ) : (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.8rem' }}>
                            No hay datos temporales registrados para este horizonte.
                        </div>
                    )}

                    {/* Tooltip Card on Hover */}
                    {hoveredBucketIdx !== null && histogramBuckets[hoveredBucketIdx] && (
                        <div style={{
                            position: 'absolute',
                            top: '12px',
                            right: '20px',
                            backgroundColor: '#0F172A',
                            color: 'white',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                            fontSize: '0.72rem',
                            minWidth: '220px',
                            zIndex: 10
                        }}>
                            <div style={{ fontWeight: '800', borderBottom: '1px solid #334155', paddingBottom: '4px', marginBottom: '6px' }}>
                                📅 {histogramBuckets[hoveredBucketIdx].fullLabel}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ color: '#94A3B8' }}>Total Casos:</span>
                                <strong>{histogramBuckets[hoveredBucketIdx].totalCount} incidencias</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ color: '#94A3B8' }}>Impacto CoQ:</span>
                                <strong style={{ color: '#F87171' }}>{formatMoney(histogramBuckets[hoveredBucketIdx].totalFinancial)}</strong>
                            </div>

                            {/* Category breakdown in this bucket */}
                            <div style={{ borderTop: '1px solid #1E293B', paddingTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                {Object.entries(histogramBuckets[hoveredBucketIdx].categoryCounts).map(([catCode, cnt]) => {
                                    const pal = CATEGORY_PALETTE[catCode] || CATEGORY_PALETTE.no_definido;
                                    return (
                                        <div key={catCode} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.68rem' }}>
                                            <span style={{ color: pal.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: pal.color }} />
                                                {pal.label}
                                            </span>
                                            <span style={{ fontWeight: '700' }}>{cnt}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. Matriz Comparativa de Tendencias por Macrocausa (Tabla Lean Kaizen) */}
                <div style={{ marginTop: '1.25rem', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <h4 style={{ fontSize: '0.82rem', fontWeight: '800', color: '#1A231E', margin: 0, textTransform: 'uppercase' }}>
                            Matriz de Control Estadístico por Macrocausa L1
                        </h4>
                        <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                            Semáforo de tendencia respecto a la primera mitad del periodo
                        </span>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: '800' }}>
                                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Macrocausa L1</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Incidencias</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Costo CoQ</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Sparkline Tendencia</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Estado de Tendencia</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Acción Kaizen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trendAnalysis.categoryStats.map(stat => {
                                    const maxSpark = Math.max(...stat.sparkline, 1);
                                    return (
                                        <tr key={stat.code} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            {/* Macrocausa */}
                                            <td style={{ padding: '8px 10px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: stat.palette.color }} />
                                                <span>{stat.label}</span>
                                            </td>

                                            {/* Incidencias */}
                                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '800', color: stat.totalCount > 0 ? '#0F172A' : '#94A3B8' }}>
                                                {stat.totalCount} {stat.totalCount === 1 ? 'caso' : 'casos'}
                                            </td>

                                            {/* Costo CoQ */}
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: stat.totalFinancial > 0 ? '#BE123C' : '#94A3B8' }}>
                                                {formatMoney(stat.totalFinancial)}
                                            </td>

                                            {/* Mini Sparkline */}
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '2px', height: '18px' }}>
                                                    {stat.sparkline.map((v: number, vIdx: number) => {
                                                        const h = Math.max(2, (v / maxSpark) * 16);
                                                        return (
                                                            <div 
                                                                key={vIdx}
                                                                style={{
                                                                    width: '4px',
                                                                    height: `${h}px`,
                                                                    backgroundColor: v > 0 ? stat.palette.color : '#E2E8F0',
                                                                    borderRadius: '1px'
                                                                }}
                                                                title={`Periodo ${vIdx + 1}: ${v} casos`}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </td>

                                            {/* Trend Status */}
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                <span style={{
                                                    fontSize: '0.68rem',
                                                    fontWeight: '800',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    backgroundColor: stat.status === 'improving' ? '#ECFDF5' : stat.status === 'worsening' ? '#FEF2F2' : '#F8FAFC',
                                                    color: stat.status === 'improving' ? '#059669' : stat.status === 'worsening' ? '#DC2626' : '#64748B',
                                                    border: `1px solid ${stat.status === 'improving' ? '#A7F3D0' : stat.status === 'worsening' ? '#FECDD3' : '#E2E8F0'}`,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}>
                                                    {stat.status === 'improving' ? <ArrowDownRight size={11} /> : stat.status === 'worsening' ? <ArrowUpRight size={11} /> : <Minus size={11} />}
                                                    <span>{stat.status === 'improving' ? `Mejorando (${stat.deltaPercent}%)` : stat.status === 'worsening' ? `Empeorando (+${stat.deltaPercent}%)` : 'Estable'}</span>
                                                </span>
                                            </td>

                                            {/* Action Button */}
                                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenNewCapaForCause({
                                                        categoryL1: stat.code,
                                                        subtypeL2: 'general',
                                                        dominantResponsible: 'transporte',
                                                        count: stat.totalCount,
                                                        totalAmount: stat.totalFinancial
                                                    })}
                                                    style={{
                                                        padding: '4px 10px',
                                                        fontSize: '0.68rem',
                                                        fontWeight: '700',
                                                        backgroundColor: stat.status === 'worsening' ? '#BE123C' : '#0D7A57',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                                    }}
                                                >
                                                    <Plus size={11} />
                                                    <span>Plan CAPA</span>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ============================================================= */}
            {/* 4. DUAL PARETO ANALYSIS SECTION (80/20 & CURVA DE LORENZ)     */}
            {/* ============================================================= */}
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
                                                    backgroundColor: isTopVital ? '#0D7A57' : '#94A3B8',
                                                    borderRadius: '7px',
                                                    transition: 'width 0.4s ease'
                                                }} />
                                            </div>

                                            {/* Amount & Accumulated Pct */}
                                            <div style={{ width: '130px', textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#1A231E' }}>
                                                    {paretoMode === 'financial' ? formatMoney(item.totalAmount) : `${item.count} casos`}
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: '#64748B' }}>
                                                    <strong>{item.cumulativePercentage.toFixed(0)}%</strong> Acum.
                                                </div>
                                            </div>
                                        </div>

                                        {/* Quick CAPA Action Button */}
                                        <button
                                            type="button"
                                            onClick={() => handleOpenNewCapaForCause(item)}
                                            style={{
                                                padding: '6px 10px',
                                                fontSize: '0.7rem',
                                                fontWeight: '700',
                                                backgroundColor: 'white',
                                                border: '1px solid #CBD5E1',
                                                color: '#0D7A57',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                flexShrink: 0
                                            }}
                                            title="Generar Plan de Acción CAPA para esta Causa"
                                        >
                                            <Target size={12} />
                                            <span>Plan CAPA</span>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.8rem' }}>
                            No hay suficientes datos clasificados para construir el Diagrama de Pareto.
                        </div>
                    )}
                </div>
            </div>

            {/* ============================================================= */}
            {/* 5. IMPUTABILITY DISTRIBUTION & CAPA PLANS TRACKER             */}
            {/* ============================================================= */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                gap: '16px'
            }}>
                {/* 5.A Imputability Matrix by Chain Echelon */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #CBD5E1',
                    padding: '1.25rem 1.5rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <Store size={18} style={{ color: '#0D7A57' }} />
                        <h3 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#1A231E', margin: 0 }}>
                            Matriz de Imputabilidad por Eslabón
                        </h3>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {areaBreakdown.map(area => (
                            <div key={area.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                <div style={{ width: '130px', fontSize: '0.74rem', fontWeight: '700', color: '#334155' }}>
                                    {area.label}
                                </div>
                                <div style={{ flex: 1, height: '10px', backgroundColor: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${area.percentage}%`,
                                        height: '100%',
                                        backgroundColor: area.color,
                                        borderRadius: '5px'
                                    }} />
                                </div>
                                <div style={{ width: '110px', textAlign: 'right', fontSize: '0.72rem', color: '#475569' }}>
                                    <strong>{area.count}</strong> ({area.percentage}%) • <strong>{formatMoney(area.amount)}</strong>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 5.B CAPA Continuous Improvement Action Tracker */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #CBD5E1',
                    padding: '1.25rem 1.5rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
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
                                    padding: '5px 10px',
                                    fontSize: '0.7rem',
                                    fontWeight: '800',
                                    backgroundColor: '#0D7A57',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <Plus size={13} />
                                <span>Nuevo Plan</span>
                            </button>
                        </div>

                        {/* List of active CAPA plans */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                            {capaPlans.map(plan => {
                                const statusLabels: Record<string, { label: string; bg: string; text: string }> = {
                                    planning: { label: 'Planificado', bg: '#F1F5F9', text: '#475569' },
                                    implementing: { label: 'En Ejecución', bg: '#EFF6FF', text: '#1D4ED8' },
                                    verifying_15d: { label: 'Verificación 15D', bg: '#FEF3C7', text: '#92400E' },
                                    standardized: { label: 'Estandarizado', bg: '#ECFDF5', text: '#065F46' },
                                    closed_ineffective: { label: 'Inefectivo / Reabierto', bg: '#FEF2F2', text: '#991B1B' }
                                };
                                const st = statusLabels[plan.status] || { label: plan.status, bg: '#F1F5F9', text: '#475569' };

                                return (
                                    <div 
                                        key={plan.id}
                                        onClick={() => {
                                            setSelectedCapaPlan(plan);
                                            setCapaPrefillData(null);
                                            setIsCapaModalOpen(true);
                                        }}
                                        style={{
                                            padding: '8px 12px',
                                            borderRadius: '10px',
                                            border: '1px solid #E2E8F0',
                                            backgroundColor: '#FAFAFA',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px',
                                            transition: 'background-color 0.15s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FAFAFA'}
                                    >
                                        <div style={{ overflow: 'hidden' }}>
                                            <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {plan.title}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: '#64748B', display: 'flex', gap: '6px' }}>
                                                <span>Resp: {plan.assignedTo}</span>
                                                <span>•</span>
                                                <span>Límite: {plan.targetDate}</span>
                                            </div>
                                        </div>

                                        <span style={{
                                            fontSize: '0.65rem',
                                            fontWeight: '800',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            backgroundColor: st.bg,
                                            color: st.text,
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {st.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* CAPA Plan Creation/Edit Modal */}
            <PqrCapaPlanModal
                isOpen={isCapaModalOpen}
                onClose={() => {
                    setIsCapaModalOpen(false);
                    setSelectedCapaPlan(null);
                    setCapaPrefillData(null);
                }}
                plan={selectedCapaPlan}
                prefillData={capaPrefillData}
                customTaxonomy={customTaxonomy}
                onSave={handleSaveCapaPlan}
                onDelete={handleDeleteCapaPlan}
            />
        </div>
    );
}
