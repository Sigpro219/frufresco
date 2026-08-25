'use client';

import { useState, useEffect, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Search, 
    X, 
    Brain, 
    Cpu, 
    TrendingUp, 
    TrendingDown, 
    Clock, 
    ShieldAlert, 
    BarChart3, 
    CheckCircle2, 
    RefreshCw, 
    Download, 
    Upload, 
    AlertTriangle, 
    Pencil, 
    Check, 
    Folder, 
    ArrowLeft,
    AlertCircle,
    ArrowUpRight,
    ArrowDownRight,
    Layers,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Minus
} from 'lucide-react';
import { logError } from '@/lib/errorUtils';
import Link from 'next/link';
import { CATEGORY_MAP } from '@/lib/constants';
import * as XLSX from 'xlsx';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { THEME, formatNumber } from '@/lib/adminTheme';

interface Purchase {
    product_id: string;
    unit_price: number;
    created_at: string;
    purchase_unit: string;
    normalized_price: number;
}

interface Product {
    id: string;
    sku: string;
    name: string;
    category: string;
    unit_of_measure: string;
    keywords?: string;
    tags?: string[];
    capabilities?: string[];
    accounting_id?: number | null;
}

const safeGetValidDate = (dateVal: any): Date | null => {
    if (!dateVal) return null;
    try {
        const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
        return isNaN(d.getTime()) ? null : d;
    } catch {
        return null;
    }
};

const safeFormatDate = (dateVal: any, pattern: string, fallback: string = '—'): string => {
    const validDate = safeGetValidDate(dateVal);
    if (!validDate) return fallback;
    try {
        return format(validDate, pattern, { locale: es });
    } catch {
        return fallback;
    }
};

function StatCard({ label, value, subValue, trend, color, bg = THEME.colors.surface, icon, onClick, active }: any) {
    return (
        <div 
            onClick={onClick}
            style={{ 
                backgroundColor: bg, 
                padding: '0.85rem 1.15rem', 
                borderRadius: THEME.radius.lg, 
                border: active ? `2px solid ${color}` : `1px solid ${THEME.colors.border}`, 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.35rem', 
                boxShadow: active ? '0 4px 12px rgba(13, 122, 87, 0.12)' : THEME.shadow.sm, 
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                position: 'relative',
                overflow: 'hidden',
                cursor: onClick ? 'pointer' : 'default',
                fontFamily: THEME.typography.fontFamilySecondary
            }} 
            onMouseEnter={(e) => {
                if (onClick) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = THEME.shadow.md;
                }
            }} 
            onMouseLeave={(e) => {
                if (onClick) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = active ? '0 4px 12px rgba(13, 122, 87, 0.12)' : THEME.shadow.sm;
                }
            }}
        >
            <div style={{ position: 'absolute', top: '-6px', right: '-6px', opacity: 0.08, transform: 'scale(2.2)', color: color, pointerEvents: 'none' }}>
                {icon}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ 
                    fontSize: '0.68rem', 
                    fontWeight: '800', 
                    color: THEME.colors.textSecondary, 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em' 
                }}>
                    {label}
                </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: 'auto' }}>
                <span style={{ 
                    fontSize: '1.45rem', 
                    fontWeight: '900', 
                    color: color, 
                    letterSpacing: '-0.03em',
                    fontFamily: THEME.typography.fontFamilyMain,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                }}>
                    {trend === 'up' && <ArrowUpRight size={18} color={color} strokeWidth={2.5} />}
                    {trend === 'down' && <ArrowDownRight size={18} color={color} strokeWidth={2.5} />}
                    {value}
                </span>
                {subValue && (
                    <span style={{ fontSize: '0.74rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {subValue}
                    </span>
                )}
            </div>
        </div>
    );
}

function Sparkline({ data, productId }: { data: Purchase[], productId?: string }) {
    if (!data || data.length === 0) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ 
                    fontSize: '0.65rem', 
                    color: '#94A3B8', 
                    fontWeight: '700',
                    backgroundColor: '#F8FAFC',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px dashed #E2E8F0'
                }}>
                    Sin Historial
                </span>
            </div>
        );
    }

    if (data.length === 1) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                <div style={{ width: '28px', height: '2px', backgroundColor: '#CBD5E1', borderRadius: '1px' }} />
                <span style={{ 
                    fontSize: '0.68rem', 
                    color: THEME.colors.textSecondary, 
                    fontWeight: '800',
                    backgroundColor: '#F1F5F9',
                    border: '1px solid #E2E8F0',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px'
                }}>
                    <Minus size={10} /> Base
                </span>
            </div>
        );
    }

    // Cronológico (del más antiguo al más reciente)
    const prices = data.map(d => d.normalized_price).reverse();
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    // Puntos normalizados con margen superior e inferior
    const points = prices.map((p, i) => {
        const x = (i / (prices.length - 1)) * 88 + 6;
        const y = 80 - ((p - min) / range) * 60;
        return { x, y };
    });

    const trend = (prices[prices.length - 1] - prices[0]) / (prices[0] || 1);
    const trendPercent = Math.abs(trend * 100);
    const isUp = trend > 0.005;
    const isDown = trend < -0.005;
    const isNeutral = !isUp && !isDown;

    const themeColor = isUp ? '#DC2626' : isDown ? THEME.colors.primary : THEME.colors.textSecondary;
    const bgColor = isUp ? '#FEF2F2' : isDown ? '#ECFDF5' : '#F1F5F9';
    const borderColor = isUp ? '#FECACA' : isDown ? '#A7F3D0' : '#E2E8F0';
    const gradId = `spark-grad-${productId ? productId.replace(/[^a-zA-Z0-9]/g, '') : Math.random().toString(36).substring(2, 7)}`;

    // Curva Bezier suave (Cubic Spline)
    let pathD = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i === 0 ? i : i - 1];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;

        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        pathD += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.x.toFixed(1)}`;
    }

    const lastPoint = points[points.length - 1];
    const firstPoint = points[0];
    const areaD = `${pathD} L ${lastPoint.x.toFixed(1)},100 L ${firstPoint.x.toFixed(1)},100 Z`;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', padding: '0 0.1rem' }}>
            {/* SVG Waveform con Área Sombreada y Nodo Pulsante */}
            <div style={{ width: '64px', height: '26px', position: 'relative' }}>
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                    <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={themeColor} stopOpacity="0.25" />
                            <stop offset="100%" stopColor={themeColor} stopOpacity="0.0" />
                        </linearGradient>
                    </defs>
                    
                    {/* Relleno translúcido */}
                    <path d={areaD} fill={`url(#${gradId})`} />
                    
                    {/* Línea curva suave */}
                    <path
                        d={pathD}
                        fill="none"
                        stroke={themeColor}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />

                    {/* Nodo focal de la última compra */}
                    <circle cx={lastPoint.x} cy={lastPoint.y} r="7" fill={themeColor} opacity="0.25" />
                    <circle cx={lastPoint.x} cy={lastPoint.y} r="4" fill={themeColor} />
                    <circle cx={lastPoint.x} cy={lastPoint.y} r="1.8" fill="white" />
                </svg>
            </div>

            {/* Micro-Badge con Icono Lucide y Porcentaje */}
            <div style={{ 
                fontSize: '0.72rem', 
                fontWeight: '900', 
                color: themeColor,
                backgroundColor: bgColor,
                border: `1px solid ${borderColor}`,
                padding: '2px 6px',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                minWidth: '56px',
                justifyContent: 'center',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                lineHeight: 1.2,
                fontFamily: 'monospace'
            }}>
                {isUp && <TrendingUp size={11} strokeWidth={3} />}
                {isDown && <TrendingDown size={11} strokeWidth={3} />}
                {isNeutral && <Minus size={11} strokeWidth={3} />}
                <span>
                    {isUp ? '+' : isDown ? '-' : ''}
                    {trendPercent > 999 ? '>999%' : `${trendPercent.toFixed(trendPercent < 10 ? 1 : 0)}%`}
                </span>
            </div>
        </div>
    );
}

function ActionTooltip({ 
    children, 
    title, 
    description, 
    badge, 
    badgeColor = '#38BDF8',
    icon 
}: { 
    children: React.ReactNode; 
    title: string; 
    description: string; 
    badge?: string; 
    badgeColor?: string;
    icon?: React.ReactNode;
}) {
    const [visible, setVisible] = useState(false);

    return (
        <div 
            style={{ position: 'relative', display: 'inline-flex' }}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            {children}
            {visible && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 9px)',
                    right: 0,
                    width: '275px',
                    backgroundColor: '#0F172A',
                    color: '#F8FAFC',
                    borderRadius: '12px',
                    padding: '0.8rem 0.95rem',
                    boxShadow: '0 15px 30px -5px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                    zIndex: 1000,
                    pointerEvents: 'none',
                    textAlign: 'left',
                    fontFamily: THEME.typography.fontFamilyMain || 'system-ui, sans-serif'
                }}>
                    {/* Indicador de flecha */}
                    <div style={{
                        position: 'absolute',
                        top: '-5px',
                        right: '24px',
                        width: '10px',
                        height: '10px',
                        backgroundColor: '#0F172A',
                        borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        transform: 'rotate(45deg)'
                    }} />
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginBottom: '0.35rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '800', fontSize: '0.82rem', color: '#FFFFFF' }}>
                            {icon}
                            <span>{title}</span>
                        </div>
                        {badge && (
                            <span style={{
                                fontSize: '0.62rem',
                                fontWeight: '900',
                                color: badgeColor,
                                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                border: `1px solid ${badgeColor}33`,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                whiteSpace: 'nowrap'
                            }}>
                                {badge}
                            </span>
                        )}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.74rem', color: '#94A3B8', lineHeight: '1.45', fontWeight: '500' }}>
                        {description}
                    </p>
                </div>
            )}
        </div>
    );
}

function ManualCostInput({ productId, onSave, savingId, currentManual, cellState }: any) {
    const [val, setVal] = useState(currentManual ? String(currentManual) : '');
    const isSaved = savingId === productId;
    
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'center', minWidth: '130px' }}>
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', width: '100%', justifyContent: 'center' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, maxWidth: '110px' }}>
                    <span style={{ 
                        position: 'absolute', 
                        left: '8px', 
                        fontSize: '0.75rem', 
                        fontWeight: '800', 
                        color: THEME.colors.textSecondary,
                        pointerEvents: 'none'
                    }}>
                        $
                    </span>
                    <input 
                        type="number"
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        placeholder="0"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && val) {
                                e.stopPropagation();
                                onSave(productId, val);
                            }
                        }}
                        style={{
                            width: '100%',
                            padding: '0.45rem 0.4rem 0.45rem 1.25rem',
                            borderRadius: THEME.radius.md,
                            border: isSaved ? `1.5px solid ${THEME.colors.primary}` : `1.5px solid ${THEME.colors.border}`,
                            textAlign: 'right',
                            fontSize: '0.88rem',
                            fontWeight: '700',
                            fontFamily: 'monospace',
                            color: THEME.colors.textMain,
                            outline: 'none',
                            backgroundColor: isSaved ? '#ECFDF5' : THEME.colors.surface,
                            transition: 'all 0.2s ease',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                        }}
                    />
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (val) onSave(productId, val);
                    }}
                    disabled={!val}
                    title="Aprobar Costo"
                    style={{
                        padding: '0.45rem',
                        width: '32px',
                        height: '32px',
                        backgroundColor: val ? THEME.colors.primary : '#E2E8F0',
                        color: 'white',
                        border: 'none',
                        borderRadius: THEME.radius.md,
                        cursor: val ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        boxShadow: val ? '0 2px 6px rgba(13, 122, 87, 0.25)' : 'none',
                        flexShrink: 0
                    }}
                >
                    <Check size={16} strokeWidth={2.5} />
                </button>
            </div>
            <div style={{ 
                fontSize: '0.62rem', 
                color: isSaved ? THEME.colors.primary : (cellState?.textColor || THEME.colors.textSecondary), 
                fontWeight: '800', 
                textTransform: 'uppercase', 
                textAlign: 'center',
                backgroundColor: isSaved ? '#ECFDF5' : (cellState?.badgeBg || '#F1F5F9'),
                padding: '2px 8px',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                border: `1px solid ${isSaved ? '#A7F3D0' : (cellState?.badgeBorder || '#E2E8F0')}`
            }}>
                {isSaved ? (
                    <>
                        <CheckCircle2 size={10} color={THEME.colors.primary} />
                        <span>Guardado</span>
                    </>
                ) : (
                    <>
                        {cellState?.icon || <Pencil size={10} />}
                        <span>{cellState?.badge || 'Sin Referencia'}</span>
                    </>
                )}
            </div>
        </div>
    );
}

export default function CostMatrixPage() {
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [purchaseHistory, setPurchaseHistory] = useState<Record<string, Purchase[]>>({});
    const [manualOverrides, setManualOverrides] = useState<Record<string, any>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Todas');
    const [savingId, setSavingId] = useState<string | null>(null);
    const [isSmartModalOpen, setIsSmartModalOpen] = useState(false);
    const [batchProgress, setBatchProgress] = useState(0);
    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [sortField, setSortField] = useState<'name' | 'last_price' | 'cost' | 'trend' | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState('');
    const [importSuccess, setImportSuccess] = useState('');
    const [importFile, setImportFile] = useState<File | null>(null);
    const [lifecycleFilter, setLifecycleFilter] = useState<'all' | 'vigente' | 'por_vencer' | 'vencido'>('all');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: prods, error: prodErr } = await supabase
                .from('products')
                .select('*')
                .setHeader('Cache-Control', 'no-store')
                .eq('show_on_web', true)
                .eq('is_active', true)
                .order('category', { ascending: true })
                .order('name', { ascending: true })
                .limit(5000);

            if (prodErr) throw prodErr;
            setProducts(prods || []);

            const { data: hist, error: histErr } = await supabase
                .from('purchase_history_normalized')
                .select('*')
                .setHeader('Cache-Control', 'no-store')
                .order('created_at', { ascending: false })
                .limit(20000);

            if (histErr) throw histErr;
            
            const groupedHist: Record<string, Purchase[]> = {};
            hist?.forEach(p => {
                if (!groupedHist[p.product_id]) groupedHist[p.product_id] = [];
                if (groupedHist[p.product_id].length < 8) {
                    groupedHist[p.product_id].push(p);
                }
            });
            setPurchaseHistory(groupedHist);

            const { data: manual, error: manualErr } = await supabase
                .from('commercial_cost_matrix')
                .select('*')
                .setHeader('Cache-Control', 'no-store');

            if (manualErr) throw manualErr;
            
            const manualMap: Record<string, any> = {};
            manual?.forEach(m => {
                manualMap[m.product_id] = m;
            });
            setManualOverrides(manualMap);

        } catch (err) {
            logError('fetchData-CostMatrix', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveManualCost = async (productId: string, cost: string) => {
        setSavingId(productId);
        try {
            const manualCost = parseFloat(cost);
            if (isNaN(manualCost)) return;

            const { error } = await supabase
                .from('commercial_cost_matrix')
                .upsert({
                    product_id: productId,
                    manual_cost: manualCost,
                    updated_at: new Date().toISOString(),
                    updated_by: 'AI-DELTA-AUTO',
                    is_active: true
                });

            if (error) throw error;
            
            setManualOverrides(prev => ({
                ...prev,
                [productId]: { manual_cost: manualCost }
            }));

            setTimeout(() => setSavingId(null), 2000);
        } catch (err) {
            logError('handleSaveManualCost', err);
            setSavingId(null);
        }
    };

    const handleAuthorizeAll = async () => {
        if (!confirm('¿Deseas autorizar todos los costos sugeridos por el protocolo inteligente de FruFresco?')) return;
        
        setIsAuthorizing(true);
        setBatchProgress(0);
        
        try {
            const toAuthorize = products.filter(p => {
                const smart = calculateSmartCost(p.id);
                const current = manualOverrides[p.id]?.manual_cost;
                return smart > 0 && (!current || Math.abs(current - smart) > 1);
            });

            if (toAuthorize.length === 0) {
                alert('No hay costos pendientes por autorizar.');
                setIsAuthorizing(false);
                return;
            }

            for (let i = 0; i < toAuthorize.length; i++) {
                const p = toAuthorize[i];
                const smart = calculateSmartCost(p.id);
                
                await supabase.from('commercial_cost_matrix').upsert({
                    product_id: p.id,
                    manual_cost: smart,
                    updated_at: new Date().toISOString(),
                    updated_by: 'AI-DELTA-AUTO',
                    is_active: true
                });

                setBatchProgress(Math.round(((i + 1) / toAuthorize.length) * 100));
            }

            await fetchData();
            alert('¡Autorización Masiva Completada!');
        } catch (err) {
            logError('handleAuthorizeAll', err);
        } finally {
            setIsAuthorizing(false);
            setBatchProgress(0);
        }
    };

    const calculateSmartCost = (productId: string) => {
        const history = purchaseHistory[productId] || [];
        if (history.length === 0) return 0;

        if (history.length === 1) return history[0].normalized_price;

        const latest = history[0];
        const previous = history[1];
        
        const latestDate = safeGetValidDate(latest.created_at);
        const daysSinceLast = latestDate ? differenceInDays(new Date(), latestDate) : 0;
        let alpha = 0.5;

        if (daysSinceLast > 7) {
            alpha = Math.max(0.1, 0.5 - (daysSinceLast * 0.05));
        }

        const priceChange = Math.abs(latest.normalized_price - previous.normalized_price) / previous.normalized_price;
        if (priceChange > 0.1) {
            alpha = 0.8;
        }

        return (latest.normalized_price * alpha) + (previous.normalized_price * (1 - alpha));
    };

    const getProductCostLifecycle = (productId: string) => {
        const hist = purchaseHistory[productId] || [];
        const manual = manualOverrides[productId];
        
        let latestSignalDate: Date | null = null;
        let signalSource: 'COMPRAS' | 'MANUAL' | 'SIN_SEÑAL' = 'SIN_SEÑAL';
        let currentCost: number | null = null;

        const histDate = hist[0]?.created_at ? safeGetValidDate(hist[0].created_at) : null;
        const manualDate = manual?.updated_at ? safeGetValidDate(manual.updated_at) : null;

        if (histDate && manualDate) {
            if (histDate >= manualDate) {
                latestSignalDate = histDate;
                signalSource = 'COMPRAS';
                currentCost = hist[0].normalized_price;
            } else {
                latestSignalDate = manualDate;
                signalSource = 'MANUAL';
                currentCost = manual.manual_cost;
            }
        } else if (histDate) {
            latestSignalDate = histDate;
            signalSource = 'COMPRAS';
            currentCost = hist[0].normalized_price;
        } else if (manualDate) {
            latestSignalDate = manualDate;
            signalSource = 'MANUAL';
            currentCost = manual.manual_cost;
        } else if (manual?.manual_cost) {
            currentCost = manual.manual_cost;
        }

        if (!latestSignalDate || isNaN(latestSignalDate.getTime()) || currentCost === null || currentCost <= 0) {
            return {
                daysOld: 999,
                status: 'SIN_REFERENCIA' as const,
                statusLabel: 'Sin Referencia',
                statusColor: '#DC2626',
                statusBg: '#FEF2F2',
                sourceLabel: 'Sin Registro',
                signalDateFormatted: 'N/A',
                isExpired: true,
                isDueSoon: false,
                currentCost: currentCost || 0
            };
        }

        const daysOld = Math.max(0, differenceInDays(new Date(), latestSignalDate));
        const formattedDate = safeFormatDate(latestSignalDate, 'yyyy-MM-dd', 'N/A');
        
        if (daysOld <= 7) {
            return {
                daysOld,
                status: 'VIGENTE' as const,
                statusLabel: `Vigente (${daysOld}d)`,
                statusColor: THEME.colors.primary,
                statusBg: '#ECFDF5',
                sourceLabel: signalSource === 'COMPRAS' ? 'Orden Compra' : 'Carga Manual',
                signalDateFormatted: formattedDate,
                isExpired: false,
                isDueSoon: false,
                currentCost
            };
        } else if (daysOld <= 14) {
            return {
                daysOld,
                status: 'POR_VENCER' as const,
                statusLabel: `Por Vencer (${daysOld}d)`,
                statusColor: '#D97706',
                statusBg: '#FFFBEB',
                sourceLabel: signalSource === 'COMPRAS' ? 'Orden Compra' : 'Carga Manual',
                signalDateFormatted: formattedDate,
                isExpired: false,
                isDueSoon: true,
                currentCost
            };
        } else {
            return {
                daysOld,
                status: 'VENCIDO' as const,
                statusLabel: `Vencido (${daysOld}d)`,
                statusColor: '#DC2626',
                statusBg: '#FEF2F2',
                sourceLabel: signalSource === 'COMPRAS' ? 'Orden Compra' : 'Carga Manual',
                signalDateFormatted: formattedDate,
                isExpired: true,
                isDueSoon: false,
                currentCost
            };
        }
    };

    const getCostCellState = (productId: string) => {
        const smart = calculateSmartCost(productId);
        const manual = manualOverrides[productId];
        const lifecycle = getProductCostLifecycle(productId);
        
        if (!manual) {
            if (smart === 0) {
                return {
                    bg: '#FEF2F2',
                    textColor: '#991B1B',
                    badgeBorder: '#FCA5A5',
                    badgeBg: '#FEF2F2',
                    badge: 'Sin Referencia',
                    labelColor: '#EF4444',
                    icon: <AlertCircle size={10} color="#EF4444" />
                };
            } else {
                return {
                    bg: '#FFFBEB',
                    textColor: '#B45309',
                    badgeBorder: '#FDE68A',
                    badgeBg: '#FFFBEB',
                    badge: 'Por Autorizar',
                    labelColor: '#D97706',
                    icon: <Clock size={10} color="#D97706" />
                };
            }
        }
        
        if (lifecycle.isExpired) {
            return {
                bg: '#FEF3C7',
                textColor: '#92400E',
                badgeBorder: '#FDE68A',
                badgeBg: '#FEF3C7',
                badge: `Desactualizado (+${lifecycle.daysOld}d)`,
                labelColor: '#D97706',
                icon: <AlertTriangle size={10} color="#D97706" />
            };
        }
        
        const isAligned = smart > 0 && Math.abs(manual.manual_cost - smart) < 1;
        if (isAligned) {
            return {
                bg: '#ECFDF5',
                textColor: '#065F46',
                badgeBorder: '#A7F3D0',
                badgeBg: '#ECFDF5',
                badge: 'Autorizado (IA)',
                labelColor: THEME.colors.primary,
                icon: <CheckCircle2 size={10} color={THEME.colors.primary} />
            };
        }
        
        return {
            bg: '#F8FAFC',
            textColor: THEME.colors.textMain,
            badgeBorder: '#E2E8F0',
            badgeBg: '#F8FAFC',
            badge: `Manual Vigente (${lifecycle.daysOld}d)`,
            labelColor: THEME.colors.primary,
            icon: <Pencil size={10} color={THEME.colors.primary} />
        };
    };

    const handleSort = (field: 'name' | 'last_price' | 'cost' | 'trend') => {
        if (sortField === field) {
            if (sortOrder === 'asc') {
                setSortOrder('desc');
            } else {
                setSortField(null);
                setSortOrder('asc');
            }
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const handleExport = () => {
        const data = sortedProducts.map(p => {
            const hist = purchaseHistory[p.id] || [];
            const smart = calculateSmartCost(p.id);
            const manual = manualOverrides[p.id]?.manual_cost;
            const lifecycle = getProductCostLifecycle(p.id);
            
            return {
                'accounting_id': p.accounting_id || '',
                'SKU': p.sku || '',
                'Producto': p.name,
                'Categoría': CATEGORY_MAP[p.category] || p.category,
                'Unidad': p.unit_of_measure,
                'Costo Sugerido IA': Math.round(smart),
                'Costo Manual': manual ? Math.round(manual) : 'N/A',
                'Última Compra': hist[0] ? Math.round(hist[0].normalized_price) : 0,
                'Fecha Última Compra': hist[0]?.created_at ? safeFormatDate(hist[0].created_at, 'yyyy-MM-dd', 'N/A') : 'N/A',
                'Días Antigüedad Costo': lifecycle.daysOld === 999 ? 'N/A' : lifecycle.daysOld,
                'Estado Ciclo de Vida': lifecycle.statusLabel,
                'Origen Señal': lifecycle.sourceLabel
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Matriz de Costos");
        XLSX.writeFile(wb, `Frufresco_CostMatrix_${safeFormatDate(new Date(), 'yyyyMMdd')}.xlsx`);
    };

    const handleExportTemplateAll = () => {
        const data = products.map(p => {
            const currentManual = manualOverrides[p.id]?.manual_cost || 0;
            const lifecycle = getProductCostLifecycle(p.id);
            return {
                'ID': p.id,
                'ID_CONTABLE': p.accounting_id || '',
                'SKU': p.sku || '',
                'PRODUCTO': p.name,
                'CATEGORIA': CATEGORY_MAP[p.category] || p.category,
                'UNIDAD': p.unit_of_measure,
                'COSTO_ACTUAL': currentManual > 0 ? Math.round(currentManual) : Math.round(lifecycle.currentCost),
                'NUEVO_COSTO': ''
            };
        });
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Plantilla Costos FruFresco");
        XLSX.writeFile(wb, `Plantilla_Costos_Completa_${safeFormatDate(new Date(), 'yyyyMMdd')}.xlsx`);
    };

    const handleExportTemplateExpired = () => {
        const expiredProducts = products.filter(p => {
            const lifecycle = getProductCostLifecycle(p.id);
            return lifecycle.isExpired || lifecycle.isDueSoon;
        });

        if (expiredProducts.length === 0) {
            alert('¡Excelente! No hay productos con costos vencidos o por vencer.');
            return;
        }

        const data = expiredProducts.map(p => {
            const currentManual = manualOverrides[p.id]?.manual_cost || 0;
            const lifecycle = getProductCostLifecycle(p.id);
            return {
                'ID': p.id,
                'ID_CONTABLE': p.accounting_id || '',
                'SKU': p.sku || '',
                'PRODUCTO': p.name,
                'CATEGORIA': CATEGORY_MAP[p.category] || p.category,
                'UNIDAD': p.unit_of_measure,
                'DIAS_ANTIGUEDAD': lifecycle.daysOld === 999 ? 'Sin Costo' : lifecycle.daysOld,
                'ESTADO': lifecycle.statusLabel,
                'COSTO_ANTERIOR': currentManual > 0 ? Math.round(currentManual) : Math.round(lifecycle.currentCost),
                'NUEVO_COSTO': ''
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Costos Desactualizados");
        XLSX.writeFile(wb, `Plantilla_Costos_Vencidos_${safeFormatDate(new Date(), 'yyyyMMdd')}.xlsx`);
    };

    const handleImportSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!importFile) return;

        setImporting(true);
        setImportError('');
        setImportSuccess('');

        try {
            const dataBuffer = await importFile.arrayBuffer();
            const workbook = XLSX.read(dataBuffer);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData: any[] = XLSX.utils.sheet_to_json(sheet);

            if (!jsonData || jsonData.length === 0) {
                throw new Error('El archivo Excel está vacío o no tiene datos reconocibles.');
            }

            let updatedCount = 0;
            const updatesToPerform: any[] = [];

            for (const row of jsonData) {
                const id = row['ID'] || row['id'] || row['Id'];
                const sku = row['SKU'] || row['sku'];
                const newCostRaw = row['NUEVO_COSTO'] || row['nuevo_costo'] || row['NUEVO COSTO'] || row['Costo'];

                if (newCostRaw === undefined || newCostRaw === null || newCostRaw === '') continue;

                const newCost = parseFloat(String(newCostRaw).replace(/[^0-9.]/g, ''));
                if (isNaN(newCost) || newCost <= 0) continue;

                let targetProductId = id;
                if (!targetProductId && sku) {
                    const match = products.find(p => p.sku === String(sku).trim());
                    if (match) targetProductId = match.id;
                }

                if (targetProductId) {
                    updatesToPerform.push({
                        product_id: targetProductId,
                        manual_cost: newCost,
                        updated_at: new Date().toISOString(),
                        updated_by: 'EXCEL-IMPORT',
                        is_active: true
                    });
                }
            }

            if (updatesToPerform.length === 0) {
                throw new Error('No se encontraron filas válidas con ID/SKU y la columna NUEVO_COSTO diligenciada.');
            }

            for (let i = 0; i < updatesToPerform.length; i += 50) {
                const batch = updatesToPerform.slice(i, i + 50);
                const { error: upsertErr } = await supabase.from('commercial_cost_matrix').upsert(batch);
                if (upsertErr) throw upsertErr;
                updatedCount += batch.length;
            }

            setImportSuccess(`¡Carga exitosa! Se actualizaron ${updatedCount} productos correctamente.`);
            await fetchData();

            setTimeout(() => {
                setIsImportModalOpen(false);
                setImportFile(null);
                setImportSuccess('');
            }, 2500);

        } catch (err: any) {
            console.error('Error importando Excel:', err);
            setImportError(err.message || 'Error al procesar el archivo Excel.');
        } finally {
            setImporting(false);
        }
    };

    const categories = Array.from(new Set(products.map(p => p.category))).filter(Boolean);

    const filteredProducts = products.filter(p => {
        const matchesCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
        const s = searchTerm.toLowerCase().trim();
        const matchesSearch = !s || 
            p.name.toLowerCase().includes(s) || 
            (p.sku && p.sku.toLowerCase().includes(s)) ||
            (p.accounting_id && String(p.accounting_id).includes(s));

        if (!matchesCategory || !matchesSearch) return false;

        if (lifecycleFilter === 'all') return true;
        const lifecycle = getProductCostLifecycle(p.id);

        if (lifecycleFilter === 'vigente') return lifecycle.status === 'VIGENTE';
        if (lifecycleFilter === 'por_vencer') return lifecycle.status === 'POR_VENCER';
        if (lifecycleFilter === 'vencido') return lifecycle.status === 'VENCIDO' || lifecycle.status === 'SIN_REFERENCIA';

        return true;
    });

    const sortedProducts = [...filteredProducts].sort((a, b) => {
        if (!sortField) return 0;
        
        if (sortField === 'name') {
            const comp = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
            return sortOrder === 'asc' ? comp : -comp;
        }

        if (sortField === 'last_price') {
            const priceA = purchaseHistory[a.id]?.[0]?.normalized_price || 0;
            const priceB = purchaseHistory[b.id]?.[0]?.normalized_price || 0;
            return sortOrder === 'asc' ? priceA - priceB : priceB - priceA;
        }

        if (sortField === 'cost') {
            const costA = manualOverrides[a.id]?.manual_cost || calculateSmartCost(a.id) || 0;
            const costB = manualOverrides[b.id]?.manual_cost || calculateSmartCost(b.id) || 0;
            return sortOrder === 'asc' ? costA - costB : costB - costA;
        }

        if (sortField === 'trend') {
            const getTrend = (pId: string) => {
                const hist = purchaseHistory[pId] || [];
                if (hist.length < 2 || !hist[1]?.normalized_price) return 0;
                return ((hist[0].normalized_price - hist[1].normalized_price) / hist[1].normalized_price) * 100;
            };
            const trendA = getTrend(a.id);
            const trendB = getTrend(b.id);
            return sortOrder === 'asc' ? trendA - trendB : trendB - trendA;
        }

        return 0;
    });

    const stats = {
        totalSKU: products.length,
        rising: 0,
        falling: 0,
        expiringSoon: 0,
        pendingCost: 0,
        vigentes: 0,
        avgTrend: 0
    };

    let totalTrendPercent = 0;
    let trendCount = 0;

    products.forEach(p => {
        const lifecycle = getProductCostLifecycle(p.id);
        if (lifecycle.status === 'VIGENTE') stats.vigentes++;
        if (lifecycle.isDueSoon) stats.expiringSoon++;
        if (lifecycle.isExpired) stats.pendingCost++;

        const history = purchaseHistory[p.id] || [];
        if (history.length >= 2) {
            const pCurrent = history[0].normalized_price;
            const pPrev = history[1].normalized_price;
            const diff = ((pCurrent - pPrev) / pPrev) * 100;
            if (diff > 1) stats.rising++;
            else if (diff < -1) stats.falling++;

            totalTrendPercent += diff;
            trendCount++;
        }
    });

    stats.avgTrend = trendCount > 0 ? totalTrendPercent / trendCount : 0;

    return (
        <div style={{ backgroundColor: THEME.colors.background, minHeight: '100vh', padding: '1.75rem 2rem', fontFamily: THEME.typography.fontFamilySecondary }}>
            <div style={{ maxWidth: '1680px', margin: '0 auto' }}>
                
                {/* --- HEADER --- */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '1.25rem', 
                    flexWrap: 'wrap', 
                    gap: '1rem' 
                }}>
                    <div>
                        <Link 
                            href="/admin/commercial" 
                            style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '6px', 
                                color: THEME.colors.textSecondary, 
                                fontSize: '0.82rem', 
                                fontWeight: '700', 
                                textDecoration: 'none', 
                                marginBottom: '0.4rem',
                                transition: 'color 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = THEME.colors.primary}
                            onMouseLeave={(e) => e.currentTarget.style.color = THEME.colors.textSecondary}
                        >
                            <ArrowLeft size={14} /> Volver a Comercial
                        </Link>
                        <h1 style={{ 
                            fontSize: '2rem', 
                            fontWeight: '900', 
                            color: THEME.colors.textMain, 
                            letterSpacing: '-0.03em', 
                            margin: 0,
                            fontFamily: THEME.typography.fontFamilyMain,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}>
                            Matriz Comercial <span style={{ color: THEME.colors.primary }}>FruFresco</span>
                        </h1>
                        <p style={{ margin: '4px 0 0 0', color: THEME.colors.textSecondary, fontSize: '0.88rem', fontWeight: '500' }}>
                            Inteligencia de costos y control de márgenes para canal Institucional y Hogar.
                        </p>
                    </div>

                    {/* Unified Actions Toolbar with Rich Tooltips */}
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <ActionTooltip
                            title="Autorización Inteligente"
                            badge="IA Delta v2"
                            badgeColor="#34D399"
                            icon={<Brain size={15} color="#34D399" />}
                            description="Aplica en lote el costo calculado por el algoritmo de suavizado exponencial adaptativo a todos los productos pendientes o desalineados."
                        >
                            <button 
                                onClick={handleAuthorizeAll}
                                disabled={isAuthorizing}
                                style={{
                                    padding: '0.65rem 1.25rem',
                                    backgroundColor: THEME.colors.primary,
                                    color: 'white',
                                    borderRadius: THEME.radius.md,
                                    fontWeight: '800',
                                    fontSize: '0.84rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    border: 'none',
                                    cursor: isAuthorizing ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 2px 8px rgba(13, 122, 87, 0.25)',
                                    transition: 'all 0.2s',
                                    fontFamily: THEME.typography.fontFamilySecondary
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                            >
                                <Brain size={16} /> 
                                {isAuthorizing ? `Autorizando (${batchProgress}%)...` : 'Autorización Inteligente'}
                            </button>
                        </ActionTooltip>

                        <ActionTooltip
                            title="Plantilla Catálogo Base"
                            badge="Excel Masivo"
                            badgeColor="#60A5FA"
                            icon={<Download size={15} color="#60A5FA" />}
                            description="Descarga el Excel oficial (.xlsx) con los 278 SKUs del catálogo, sus ID contables (ERP) y los costos vigentes listos para actualizar."
                        >
                            <button
                                onClick={handleExportTemplateAll}
                                style={{
                                    padding: '0.65rem 1rem',
                                    backgroundColor: THEME.colors.surface,
                                    color: THEME.colors.textMain,
                                    borderRadius: THEME.radius.md,
                                    fontWeight: '700',
                                    fontSize: '0.82rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    border: `1px solid ${THEME.colors.border}`,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.borderColor = THEME.colors.primary}
                                onMouseLeave={(e) => e.currentTarget.style.borderColor = THEME.colors.border}
                            >
                                <Download size={15} color={THEME.colors.primary} /> Plantilla Base
                            </button>
                        </ActionTooltip>

                        <ActionTooltip
                            title="Plantilla de Vencidos"
                            badge="Prioridad Alta"
                            badgeColor="#FBBF24"
                            icon={<Clock size={15} color="#FBBF24" />}
                            description="Descarga únicamente los SKUs sin compras recientes o cuyos precios superaron su ciclo de vida útil (14 a 30 días) para cotización urgente."
                        >
                            <button
                                onClick={handleExportTemplateExpired}
                                style={{
                                    padding: '0.65rem 1rem',
                                    backgroundColor: '#FFFBEB',
                                    color: '#92400E',
                                    borderRadius: THEME.radius.md,
                                    fontWeight: '700',
                                    fontSize: '0.82rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    border: '1px solid #FDE68A',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Clock size={15} color="#D97706" /> Vencidos ({stats.expiringSoon + stats.pendingCost})
                            </button>
                        </ActionTooltip>

                        <ActionTooltip
                            title="Importación Masiva"
                            badge="Carga Rápida"
                            badgeColor="#34D399"
                            icon={<Upload size={15} color="#34D399" />}
                            description="Sube una plantilla Excel diligenciada para actualizar costos en lote. Reinicia el ciclo de vida a 0 días y deja registro en auditoría."
                        >
                            <button
                                onClick={() => setIsImportModalOpen(true)}
                                style={{
                                    padding: '0.65rem 1.1rem',
                                    backgroundColor: THEME.colors.surface,
                                    color: THEME.colors.primary,
                                    borderRadius: THEME.radius.md,
                                    fontWeight: '800',
                                    fontSize: '0.82rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    border: `1px solid ${THEME.colors.primary}`,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = THEME.colors.primaryLight;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = THEME.colors.surface;
                                }}
                            >
                                <Upload size={15} /> Cargar Excel
                            </button>
                        </ActionTooltip>

                        <ActionTooltip
                            title="Consolidado de Matriz"
                            badge="Reporte Matriz"
                            badgeColor="#A78BFA"
                            icon={<BarChart3 size={15} color="#A78BFA" />}
                            description="Genera una exportación integral con el desglose histórico de compras (1 a 8), tendencias porcentuales, costos activos y estados de vigencia."
                        >
                            <button
                                onClick={handleExport}
                                style={{
                                    padding: '0.65rem 1.1rem',
                                    backgroundColor: THEME.colors.surface,
                                    color: THEME.colors.textSecondary,
                                    borderRadius: THEME.radius.md,
                                    fontWeight: '700',
                                    fontSize: '0.82rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    border: `1px solid ${THEME.colors.border}`,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <BarChart3 size={15} /> Exportar Reporte
                            </button>
                        </ActionTooltip>
                    </div>
                </div>

                {/* --- DASHBOARD STATS GRID (Responsive Auto-Fit) --- */}
                {!loading && (
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                        gap: '0.85rem', 
                        marginBottom: '1.25rem' 
                    }}>
                        <StatCard 
                            label="Catálogo Analizado" 
                            value={stats.totalSKU} 
                            color={THEME.colors.textMain} 
                            icon={<Cpu size={22} />} 
                            onClick={() => setLifecycleFilter('all')}
                            active={lifecycleFilter === 'all'}
                        />
                        <StatCard 
                            label="Tendencia Global" 
                            value={`${Math.abs(stats.avgTrend).toFixed(1)}%`} 
                            trend={stats.avgTrend > 0 ? 'up' : 'down'}
                            color={stats.avgTrend > 0 ? '#DC2626' : THEME.colors.primary} 
                            icon={<TrendingUp size={22} />}
                        />
                        <StatCard 
                            label="Costos en Alza" 
                            value={stats.rising} 
                            color="#DC2626" 
                            bg="#FEF2F2"
                            icon={<TrendingUp size={22} />}
                        />
                        <StatCard 
                            label="Costos en Baja" 
                            value={stats.falling} 
                            color={THEME.colors.primary} 
                            bg="#ECFDF5"
                            icon={<TrendingDown size={22} />}
                        />
                        <StatCard 
                            label="Desactualizados" 
                            value={stats.expiringSoon + stats.pendingCost} 
                            subValue={stats.pendingCost > 0 ? `${stats.pendingCost} sin costo` : 'Recotizar'}
                            color="#D97706" 
                            bg="#FFFBEB"
                            icon={<ShieldAlert size={22} />} 
                            onClick={() => setLifecycleFilter(lifecycleFilter === 'vencido' ? 'all' : 'vencido')}
                            active={lifecycleFilter === 'vencido'}
                        />
                    </div>
                )}

                {loading ? (
                    <div style={{ 
                        textAlign: 'center', 
                        padding: '6rem 2rem', 
                        backgroundColor: THEME.colors.surface, 
                        borderRadius: THEME.radius.xl,
                        border: `1px solid ${THEME.colors.border}`,
                        boxShadow: THEME.shadow.sm
                    }}>
                        <RefreshCw size={36} className="animate-spin" color={THEME.colors.primary} style={{ margin: '0 auto 1rem' }} />
                        <p style={{ margin: 0, color: THEME.colors.textSecondary, fontWeight: '700', fontSize: '0.95rem' }}>
                            Sincronizando historial de precios y matriz comercial...
                        </p>
                    </div>
                ) : (
                    /* --- ENTERPRISE DATA GRID CARD WITH INNER SCROLL & PINNED STICKY HEADERS --- */
                    <div style={{ 
                        backgroundColor: THEME.colors.surface, 
                        borderRadius: THEME.radius.xl, 
                        boxShadow: THEME.shadow.md, 
                        border: `1px solid ${THEME.colors.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        {/* STICKY TOOLBAR (Search & Quick Filters) */}
                        <div style={{ 
                            padding: '0.9rem 1.25rem', 
                            borderBottom: `1px solid ${THEME.colors.border}`, 
                            backgroundColor: '#FFFFFF',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '1rem',
                            flexWrap: 'wrap',
                            zIndex: 10
                        }}>
                            {/* Search & Quick Lifecycle Chips */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flex: '1 1 500px', flexWrap: 'wrap' }}>
                                {/* Search Input Container */}
                                <div style={{ 
                                    flex: '1 1 240px',
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    backgroundColor: '#F8FAFC', 
                                    borderRadius: THEME.radius.md, 
                                    border: `1px solid ${THEME.colors.border}`, 
                                    padding: '0 0.8rem', 
                                    gap: '0.5rem',
                                    height: '38px'
                                }}>
                                    <Search size={16} color={THEME.colors.textSecondary} />
                                    <input 
                                        type="text"
                                        placeholder="Buscar producto, ID contable o SKU..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{ 
                                            width: '100%', 
                                            border: 'none', 
                                            outline: 'none', 
                                            fontSize: '0.85rem', 
                                            fontWeight: '600',
                                            color: THEME.colors.textMain,
                                            background: 'transparent',
                                            fontFamily: THEME.typography.fontFamilySecondary
                                        }}
                                    />
                                    {searchTerm && (
                                        <button 
                                            onClick={() => setSearchTerm('')}
                                            style={{ border: 'none', background: 'none', color: THEME.colors.textSecondary, cursor: 'pointer', display: 'flex', padding: 0 }}
                                        >
                                            <X size={15} />
                                        </button>
                                    )}
                                </div>

                                {/* Quick Lifecycle Filter Chips */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => setLifecycleFilter('all')}
                                        style={{
                                            padding: '0.4rem 0.75rem',
                                            borderRadius: THEME.radius.md,
                                            border: lifecycleFilter === 'all' ? `1.5px solid ${THEME.colors.primary}` : `1px solid ${THEME.colors.border}`,
                                            backgroundColor: lifecycleFilter === 'all' ? '#ECFDF5' : 'white',
                                            color: lifecycleFilter === 'all' ? THEME.colors.primary : THEME.colors.textSecondary,
                                            fontSize: '0.75rem',
                                            fontWeight: '800',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        Todos ({stats.totalSKU})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLifecycleFilter('vigente')}
                                        style={{
                                            padding: '0.4rem 0.75rem',
                                            borderRadius: THEME.radius.md,
                                            border: lifecycleFilter === 'vigente' ? `1.5px solid ${THEME.colors.primary}` : `1px solid ${THEME.colors.border}`,
                                            backgroundColor: lifecycleFilter === 'vigente' ? '#ECFDF5' : 'white',
                                            color: lifecycleFilter === 'vigente' ? THEME.colors.primary : THEME.colors.textSecondary,
                                            fontSize: '0.75rem',
                                            fontWeight: '800',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <CheckCircle2 size={12} color={THEME.colors.primary} /> Vigentes ({stats.vigentes})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLifecycleFilter('por_vencer')}
                                        style={{
                                            padding: '0.4rem 0.75rem',
                                            borderRadius: THEME.radius.md,
                                            border: lifecycleFilter === 'por_vencer' ? '1.5px solid #D97706' : `1px solid ${THEME.colors.border}`,
                                            backgroundColor: lifecycleFilter === 'por_vencer' ? '#FFFBEB' : 'white',
                                            color: lifecycleFilter === 'por_vencer' ? '#92400E' : THEME.colors.textSecondary,
                                            fontSize: '0.75rem',
                                            fontWeight: '800',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <Clock size={12} color="#D97706" /> Por Vencer
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLifecycleFilter('vencido')}
                                        style={{
                                            padding: '0.4rem 0.75rem',
                                            borderRadius: THEME.radius.md,
                                            border: lifecycleFilter === 'vencido' ? '1.5px solid #DC2626' : `1px solid ${THEME.colors.border}`,
                                            backgroundColor: lifecycleFilter === 'vencido' ? '#FEF2F2' : 'white',
                                            color: lifecycleFilter === 'vencido' ? '#991B1B' : THEME.colors.textSecondary,
                                            fontSize: '0.75rem',
                                            fontWeight: '800',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <AlertTriangle size={12} color="#DC2626" /> Vencidos ({stats.expiringSoon + stats.pendingCost})
                                    </button>
                                </div>
                            </div>

                            {/* Category, Strategy & Refresh Controls */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                {/* Category Filter Select */}
                                <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.4rem', 
                                    backgroundColor: '#F8FAFC', 
                                    padding: '0 0.75rem', 
                                    borderRadius: THEME.radius.md, 
                                    border: `1px solid ${THEME.colors.border}`, 
                                    height: '38px' 
                                }}>
                                    <Layers size={14} color={THEME.colors.textSecondary} />
                                    <span style={{ fontWeight: '800', fontSize: '0.68rem', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Cat:</span>
                                    <select 
                                        value={selectedCategory}
                                        onChange={(e) => setSelectedCategory(e.target.value)}
                                        style={{ 
                                            border: 'none', 
                                            backgroundColor: 'transparent', 
                                            fontWeight: '700', 
                                            fontSize: '0.8rem',
                                            color: THEME.colors.textMain,
                                            outline: 'none',
                                            cursor: 'pointer',
                                            maxWidth: '140px',
                                            fontFamily: THEME.typography.fontFamilySecondary
                                        }}
                                    >
                                        <option value="Todas">Todas</option>
                                        {categories.map(c => <option key={c} value={c}>{CATEGORY_MAP[c] || c}</option>)}
                                    </select>
                                </div>

                                {/* Strategy Selector Button */}
                                <ActionTooltip
                                    title="Protocolo CI-Delta"
                                    badge="Instructivo"
                                    badgeColor="#38BDF8"
                                    icon={<Brain size={14} color="#38BDF8" />}
                                    description="Abre el instructivo completo del modelo de cálculo adaptativo, curvas Holt-Winters y políticas de auditoría."
                                >
                                    <button 
                                        onClick={() => setIsSmartModalOpen(true)}
                                        style={{ 
                                            height: '38px',
                                            padding: '0 0.8rem', 
                                            borderRadius: THEME.radius.md, 
                                            border: `1px solid ${THEME.colors.border}`, 
                                            backgroundColor: THEME.colors.primaryLight, 
                                            color: THEME.colors.primary, 
                                            fontWeight: '800', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '0.4rem',
                                            cursor: 'pointer',
                                            fontSize: '0.78rem'
                                        }}
                                    >
                                        <Brain size={14} /> Algoritmo FruFresco
                                    </button>
                                </ActionTooltip>

                                {/* Refresh button */}
                                <button 
                                    onClick={fetchData} 
                                    title="Sincronizar Datos"
                                    style={{ 
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: THEME.radius.md, 
                                        border: `1px solid ${THEME.colors.border}`, 
                                        backgroundColor: '#F8FAFC', 
                                        color: THEME.colors.textSecondary, 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <RefreshCw size={15} />
                                </button>
                            </div>
                        </div>

                        {/* DATA TABLE CONTAINER (Inner scroll with pinned sticky header) */}
                        <div style={{ 
                            maxHeight: 'calc(100vh - 280px)', 
                            minHeight: '450px',
                            overflowY: 'auto', 
                            overflowX: 'auto', 
                            width: '100%', 
                            WebkitOverflowScrolling: 'touch',
                            position: 'relative'
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', minWidth: '1120px' }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                                    <tr style={{ 
                                        backgroundColor: '#F8FAFC', 
                                        color: THEME.colors.textSecondary,
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em'
                                    }}>
                                        {/* Sticky Top-Left Intersection: Producto / Categoría */}
                                        <th 
                                            onClick={() => handleSort('name')}
                                            style={{ 
                                                padding: '0.85rem 1.25rem', 
                                                width: '280px', 
                                                position: 'sticky', 
                                                top: 0,
                                                left: 0, 
                                                backgroundColor: '#F8FAFC', 
                                                zIndex: 25,
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                borderBottom: `1.5px solid ${THEME.colors.border}`,
                                                boxShadow: '2px 2px 4px rgba(0,0,0,0.04)'
                                            }}
                                        >
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: sortField === 'name' ? THEME.colors.primary : THEME.colors.textSecondary }}>
                                                <span>Producto / Categoría</span>
                                                {sortField === 'name' ? (
                                                    sortOrder === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} /> : <ArrowDown size={13} strokeWidth={2.5} />
                                                ) : (
                                                    <ArrowUpDown size={12} style={{ opacity: 0.6 }} />
                                                )}
                                            </div>
                                        </th>

                                        {/* Sortable: Última Compra */}
                                        <th 
                                            onClick={() => handleSort('last_price')}
                                            style={{ 
                                                padding: '0.85rem 0.8rem', 
                                                textAlign: 'center', 
                                                width: '100px', 
                                                cursor: 'pointer', 
                                                userSelect: 'none',
                                                backgroundColor: '#F8FAFC',
                                                borderBottom: `1.5px solid ${THEME.colors.border}`
                                            }}
                                        >
                                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: sortField === 'last_price' ? THEME.colors.primary : THEME.colors.textSecondary }}>
                                                <span>Última</span>
                                                {sortField === 'last_price' ? (
                                                    sortOrder === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} /> : <ArrowDown size={13} strokeWidth={2.5} />
                                                ) : (
                                                    <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
                                                )}
                                            </div>
                                        </th>

                                        <th style={{ padding: '0.85rem 0.8rem', textAlign: 'center', width: '85px', backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>Compra 2</th>
                                        <th style={{ padding: '0.85rem 0.8rem', textAlign: 'center', width: '85px', backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>Compra 3</th>
                                        <th style={{ padding: '0.85rem 0.8rem', textAlign: 'center', width: '85px', backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>Compra 4</th>
                                        <th style={{ padding: '0.85rem 0.8rem', textAlign: 'center', width: '85px', backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>Compra 5</th>
                                        <th style={{ padding: '0.85rem 0.8rem', textAlign: 'center', width: '85px', backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>Compra 6</th>
                                        <th style={{ padding: '0.85rem 0.8rem', textAlign: 'center', width: '85px', backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>Compra 7</th>
                                        <th style={{ padding: '0.85rem 0.8rem', textAlign: 'center', width: '85px', backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>Compra 8</th>

                                        {/* Sortable: Costo Base FruFresco */}
                                        <th 
                                            onClick={() => handleSort('cost')}
                                            style={{ 
                                                padding: '0.85rem 1rem', 
                                                textAlign: 'center', 
                                                width: '160px', 
                                                backgroundColor: '#F1F5F9',
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                borderBottom: `1.5px solid ${THEME.colors.border}`
                                            }}
                                        >
                                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: sortField === 'cost' ? THEME.colors.primary : THEME.colors.textSecondary }}>
                                                <span>Costo Base FruFresco</span>
                                                {sortField === 'cost' ? (
                                                    sortOrder === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} /> : <ArrowDown size={13} strokeWidth={2.5} />
                                                ) : (
                                                    <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
                                                )}
                                            </div>
                                        </th>

                                        {/* Sortable: Tendencia con Sparkline */}
                                        <th 
                                            onClick={() => handleSort('trend')}
                                            style={{ 
                                                padding: '0.85rem 1rem', 
                                                textAlign: 'center', 
                                                width: '150px', 
                                                cursor: 'pointer', 
                                                userSelect: 'none',
                                                backgroundColor: '#F8FAFC',
                                                borderBottom: `1.5px solid ${THEME.colors.border}`
                                            }}
                                        >
                                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: sortField === 'trend' ? THEME.colors.primary : THEME.colors.textSecondary }}>
                                                <span>Tendencia</span>
                                                {sortField === 'trend' ? (
                                                    sortOrder === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} /> : <ArrowDown size={13} strokeWidth={2.5} />
                                                ) : (
                                                    <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
                                                )}
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedProducts.map((p, idx) => {
                                        const hist = purchaseHistory[p.id] || [];
                                        const manual = manualOverrides[p.id];
                                        const cellState = getCostCellState(p.id);
                                        const lifecycle = getProductCostLifecycle(p.id);
                                        const currentManual = manual?.manual_cost;

                                        // Category separator row only when not custom-sorted across categories
                                        const showCategorySeparator = !sortField || sortField === 'name';
                                        const isFirstOfCategory = showCategorySeparator && (idx === 0 || sortedProducts[idx - 1].category !== p.category);

                                        return (
                                            <Fragment key={p.id}>
                                                {isFirstOfCategory && (
                                                    <tr style={{ backgroundColor: '#F1F5F9' }}>
                                                        <td colSpan={11} style={{ padding: '0.5rem 1.25rem', fontWeight: '900', fontSize: '0.72rem', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <Folder size={14} color={THEME.colors.primary} />
                                                                <span>{CATEGORY_MAP[p.category]?.toUpperCase() || p.category}</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                <tr style={{ 
                                                    backgroundColor: idx % 2 === 0 ? 'white' : '#FAFAFA',
                                                    transition: 'background-color 0.15s'
                                                }}>
                                                    {/* Sticky Left Product Cell */}
                                                    <td style={{ 
                                                        padding: '0.85rem 1.25rem', 
                                                        position: 'sticky', 
                                                        left: 0, 
                                                        backgroundColor: idx % 2 === 0 ? 'white' : '#FAFAFA',
                                                        zIndex: 5,
                                                        boxShadow: '2px 0 5px -2px rgba(0,0,0,0.03)',
                                                        borderBottom: `1px solid ${THEME.colors.border}`
                                                    }}>
                                                        <div style={{ fontWeight: '800', fontSize: '0.88rem', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain }}>
                                                            {p.name}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                                                            {p.accounting_id && (
                                                                <span style={{ fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.primary, backgroundColor: '#ECFDF5', padding: '1px 6px', borderRadius: '4px' }}>
                                                                    ID: {p.accounting_id}
                                                                </span>
                                                            )}
                                                            <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>
                                                                {p.unit_of_measure}
                                                            </span>
                                                            <span style={{ 
                                                                fontSize: '0.65rem', 
                                                                fontWeight: '700', 
                                                                color: lifecycle.statusColor, 
                                                                backgroundColor: lifecycle.statusBg, 
                                                                padding: '1px 6px', 
                                                                borderRadius: '4px',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '3px'
                                                            }}>
                                                                <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: lifecycle.statusColor }} />
                                                                {lifecycle.statusLabel}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Purchase History Columns 1 to 8 */}
                                                    {[0, 1, 2, 3, 4, 5, 6, 7].map((colIdx) => {
                                                        const purchase = hist[colIdx];
                                                        const price = purchase ? Math.round(purchase.normalized_price) : null;
                                                        const dateStr = purchase?.created_at ? safeFormatDate(purchase.created_at, 'dd MMM', '') : '';

                                                        return (
                                                            <td key={colIdx} style={{ padding: '0.6rem 0.5rem', textAlign: 'center', verticalAlign: 'middle', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                                {price ? (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                                        <span style={{ 
                                                                            fontSize: '0.82rem', 
                                                                            fontWeight: '700', 
                                                                            fontFamily: 'monospace', 
                                                                            color: colIdx === 0 ? THEME.colors.primary : THEME.colors.textMain,
                                                                            backgroundColor: colIdx === 0 ? '#ECFDF5' : 'transparent',
                                                                            padding: colIdx === 0 ? '2px 6px' : '0',
                                                                            borderRadius: '6px'
                                                                        }}>
                                                                            ${formatNumber(price)}
                                                                        </span>
                                                                        {dateStr && (
                                                                            <span style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, marginTop: '2px', fontWeight: '500' }}>
                                                                                {dateStr}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span style={{ color: '#CBD5E1', fontSize: '0.85rem' }}>—</span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}

                                                    {/* Editable Base Cost Cell */}
                                                    <td style={{ padding: '0.65rem 0.8rem', backgroundColor: '#F8FAFC', verticalAlign: 'middle', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                        <ManualCostInput 
                                                            productId={p.id}
                                                            onSave={handleSaveManualCost}
                                                            savingId={savingId}
                                                            currentManual={currentManual}
                                                            cellState={cellState}
                                                        />
                                                    </td>

                                                    {/* Trend Indicator Cell with Interactive Sparkline */}
                                                    <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center', verticalAlign: 'middle', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                        <Sparkline data={hist} productId={p.id} />
                                                    </td>
                                                </tr>
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* --- FOOTER EXPLANATION BANNER --- */}
                <div style={{ 
                    marginTop: '1.75rem', 
                    padding: '1.25rem 1.6rem', 
                    backgroundColor: '#ECFDF5', 
                    borderRadius: THEME.radius.lg, 
                    border: '1px solid #A7F3D0',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px'
                }}>
                    <Brain size={24} color={THEME.colors.primary} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '900', color: '#064E3B', fontFamily: THEME.typography.fontFamilyMain }}>
                            Protocolo de Inteligencia Comercial FruFresco
                        </h4>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#047857', lineHeight: '1.45' }}>
                            Los costos son calculados analizando la dispersión de compras recientes, la frescura temporal de la señal y la volatilidad histórica de cada SKU. Los valores autorizados gobiernan las cotizaciones B2B y las listas de precios activas.
                        </p>
                    </div>
                </div>

            </div>

            {/* --- MODAL: IMPORTAR EXCEL --- */}
            {isImportModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <div style={{
                        backgroundColor: THEME.colors.surface,
                        borderRadius: THEME.radius.xl,
                        maxWidth: '500px',
                        width: '100%',
                        padding: '2rem',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                        textAlign: 'left'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Upload size={22} color={THEME.colors.primary} />
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain }}>
                                    Cargar Matriz de Costos
                                </h3>
                            </div>
                            <button
                                onClick={() => { setIsImportModalOpen(false); setImportError(''); setImportSuccess(''); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.colors.textSecondary }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.84rem', color: THEME.colors.textSecondary, lineHeight: '1.45' }}>
                            Sube el archivo Excel con las columnas <strong>ID</strong> o <strong>SKU</strong> y <strong>NUEVO_COSTO</strong> diligenciadas.
                        </p>

                        <form onSubmit={handleImportSubmit}>
                            <input 
                                type="file" 
                                accept=".xlsx, .xls" 
                                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                                style={{
                                    width: '100%',
                                    padding: '0.8rem',
                                    borderRadius: THEME.radius.md,
                                    border: `1.5px dashed ${THEME.colors.border}`,
                                    backgroundColor: '#F8FAFC',
                                    marginBottom: '1rem',
                                    fontSize: '0.85rem',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            />

                            {importError && (
                                <div style={{ padding: '0.65rem 0.9rem', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: THEME.radius.md, color: '#991B1B', fontSize: '0.8rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <AlertCircle size={15} /> {importError}
                                </div>
                            )}

                            {importSuccess && (
                                <div style={{ padding: '0.65rem 0.9rem', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: THEME.radius.md, color: '#065F46', fontSize: '0.8rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <CheckCircle2 size={15} /> {importSuccess}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsImportModalOpen(false)}
                                    style={{
                                        padding: '0.65rem 1.25rem',
                                        backgroundColor: '#F1F5F9',
                                        color: THEME.colors.textSecondary,
                                        borderRadius: THEME.radius.md,
                                        border: 'none',
                                        fontWeight: '700',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={!importFile || importing}
                                    style={{
                                        padding: '0.65rem 1.4rem',
                                        backgroundColor: THEME.colors.primary,
                                        color: 'white',
                                        borderRadius: THEME.radius.md,
                                        border: 'none',
                                        fontWeight: '800',
                                        fontSize: '0.85rem',
                                        cursor: (!importFile || importing) ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    {importing ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
                                    {importing ? 'Procesando...' : 'Aplicar Costos'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- MODAL: ESTRATEGIA ALGORÍTMICA --- */}
            {isSmartModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <div style={{
                        backgroundColor: THEME.colors.surface,
                        borderRadius: THEME.radius.xl,
                        maxWidth: '540px',
                        width: '100%',
                        padding: '2rem',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                        textAlign: 'left'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Brain size={22} color={THEME.colors.primary} />
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain }}>
                                    Algoritmo de Precios FruFresco
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsSmartModalOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.colors.textSecondary }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.84rem', color: THEME.colors.textSecondary, lineHeight: '1.5' }}>
                            <p style={{ margin: 0 }}>
                                El motor analiza las últimas 8 órdenes de compra normalizadas a la unidad de medida estándar del SKU y pondera las señales bajo 3 factores:
                            </p>
                            <div style={{ padding: '0.85rem 1rem', backgroundColor: '#F8FAFC', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                                <strong style={{ color: THEME.colors.textMain }}>1. Frescura Temporal:</strong> Compras registradas en los últimos 7 días tienen una ponderación del 50% al 80%.
                            </div>
                            <div style={{ padding: '0.85rem 1rem', backgroundColor: '#F8FAFC', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                                <strong style={{ color: THEME.colors.textMain }}>2. Sensibilidad a la Volatilidad:</strong> Variaciones bruscas (&gt;10%) priorizan el precio más reciente para proteger el margen bruto.
                            </div>
                            <div style={{ padding: '0.85rem 1rem', backgroundColor: '#F8FAFC', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                                <strong style={{ color: THEME.colors.textMain }}>3. Ciclo de Vida:</strong> Alertas automáticas para SKUs sin señal de compra en más de 14 días.
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                            <button
                                onClick={() => setIsSmartModalOpen(false)}
                                style={{
                                    padding: '0.65rem 1.4rem',
                                    backgroundColor: THEME.colors.primary,
                                    color: 'white',
                                    borderRadius: THEME.radius.md,
                                    border: 'none',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
