'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { recalculateAndSyncProductPrices, batchRecalculateAndSyncPrices } from '@/lib/pricingUtils';
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
    Minus, 
    Award, 
    Leaf, 
    Sparkles, 
    Tag, 
    Sun, 
    Info, 
    FileSpreadsheet, 
    Trash2, 
    Loader2,
    Zap,
    Package,
    Lock,
    Unlock,
    Plus,
    Sliders,
    Filter,
    BookOpen,
    ArrowRight,
    FileText,
    CheckCheck,
    Lightbulb,
    Store
} from 'lucide-react';
import { logError } from '@/lib/errorUtils';
import Link from 'next/link';
import { CATEGORY_MAP } from '@/lib/constants';
import * as XLSX from 'xlsx';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { THEME, formatNumber } from '@/lib/adminTheme';
import { useAuth } from '@/lib/authContext';
import { calculateAdaptiveCost, runAdaptivePricingModel, filterPriceOutliers, PriceObservation } from '@/lib/commercial/adaptivePricingEngine';
import { evaluateCostFreshness, getFreshnessSLA, ProductCostLifecycle } from '@/lib/commercial/costFreshnessPolicy';

interface Purchase {
    id?: string;
    product_id: string;
    unit_price: number;
    created_at: string;
    purchase_unit?: string;
    normalized_price: number;
    payment_method?: string;
    raw_data_source?: string;
    quantity?: number | null;
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
    theoretical_shrinkage_pct?: number | null;
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }} title={`Única compra registrada: $${formatNumber(Math.round(data[0].normalized_price))}`}>
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

    // Ordenar estrictamente de forma cronológica (del más antiguo al más reciente)
    const chronologicalPurchases = [...data].sort((a, b) => {
        const timeA = safeGetValidDate(a.created_at)?.getTime() || 0;
        const timeB = safeGetValidDate(b.created_at)?.getTime() || 0;
        return timeA - timeB;
    });

    // Normalizar y filtrar outliers de escala para que la curva refleje el costo unitario limpio
    const obsList: PriceObservation[] = chronologicalPurchases.map(d => ({
        price: d.normalized_price,
        date: d.created_at,
        purchaseUnit: d.purchase_unit
    }));
    const { validObservations, filteredCount } = filterPriceOutliers(obsList);
    const validPurchases = chronologicalPurchases.filter(p => 
        validObservations.some(v => Math.abs(v.price - p.normalized_price) < 0.01 && v.date === p.created_at)
    );

    if (validPurchases.length === 0) {
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
                    Sin Referencia
                </span>
            </div>
        );
    }

    if (validPurchases.length === 1) {
        const singlePrice = validPurchases[0].normalized_price;
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }} 
                 title={`Señal limpia de mercado: $${formatNumber(Math.round(singlePrice))}${filteredCount > 0 ? ` (${filteredCount} compras atípicas de empaque excluidas)` : ''}`}>
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

    const prices = validPurchases.map(d => d.normalized_price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min;

    // ViewBox de alta precisión 80x28 (1 unidad = 1 px)
    const W = 80;
    const H = 28;
    const padX = 8;
    const padY = 5;
    const usableW = W - padX * 2;
    const usableH = H - padY * 2;

    const points = prices.map((p, i) => {
        const x = padX + (i / (prices.length - 1)) * usableW;
        const y = range === 0 ? H / 2 : (H - padY) - ((p - min) / range) * usableH;
        return { x, y, price: p, date: validPurchases[i].created_at };
    });

    const trend = (prices[prices.length - 1] - prices[0]) / (prices[0] || 1);
    const trendPercent = Math.abs(trend * 100);
    const isUp = trend > 0.005;
    const isDown = trend < -0.005;
    const isNeutral = !isUp && !isDown;

    const themeColor = isUp ? '#DC2626' : isDown ? '#15803D' : '#64748B';
    const bgColor = isUp ? '#FEF2F2' : isDown ? '#DCFCE7' : '#F1F5F9';
    const borderColor = isUp ? '#FECACA' : isDown ? '#86EFAC' : '#E2E8F0';
    const gradId = `spark-grad-${productId ? productId.replace(/[^a-zA-Z0-9]/g, '') : Math.random().toString(36).substring(2, 7)}`;

    // Trayectoria poligonal nítida
    const pathD = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
    const lastPoint = points[points.length - 1];
    const firstPoint = points[0];
    const areaD = `${pathD} L ${lastPoint.x.toFixed(1)},${H} L ${firstPoint.x.toFixed(1)},${H} Z`;

    const tooltipText = `Historial de compras normalizado (${prices.length} eventos):\n` +
        validPurchases.map(p => `• ${safeFormatDate(p.created_at, 'dd MMM yyyy')}: $${formatNumber(Math.round(p.normalized_price))}`).join('\n') +
        (filteredCount > 0 ? `\n(${filteredCount} compras atípicas de empaque excluidas)` : '') +
        `\nTendencia: ${isUp ? '+' : isDown ? '-' : ''}${trendPercent.toFixed(1)}%`;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', justifyContent: 'center', padding: '0 0.1rem' }} title={tooltipText}>
            {/* SVG Waveform de alta fidelidad con marcadores visibles */}
            <div style={{ width: '80px', height: '28px', position: 'relative', flexShrink: 0 }}>
                <svg width="80" height="28" viewBox="0 0 80 28" style={{ overflow: 'visible', display: 'block' }}>
                    <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={themeColor} stopOpacity="0.22" />
                            <stop offset="100%" stopColor={themeColor} stopOpacity="0.0" />
                        </linearGradient>
                    </defs>
                    
                    {/* Línea guía central sutil */}
                    <line x1={padX} y1={H / 2} x2={W - padX} y2={H / 2} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="2,2" />

                    {/* Relleno degradado bajo la curva */}
                    <path d={areaD} fill={`url(#${gradId})`} />
                    
                    {/* Línea de tendencia continua y nítida */}
                    <path
                        d={pathD}
                        fill="none"
                        stroke={themeColor}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />

                    {/* Marcadores de compras históricas intermedias */}
                    {points.slice(0, points.length - 1).map((pt, idx) => (
                        <circle
                            key={idx}
                            cx={pt.x}
                            cy={pt.y}
                            r="2.5"
                            fill={themeColor}
                            stroke="#FFFFFF"
                            strokeWidth="1"
                        />
                    ))}

                    {/* Nodo destacado de la última compra (Compra actual) */}
                    <circle cx={lastPoint.x} cy={lastPoint.y} r="5.5" fill={themeColor} opacity="0.2" />
                    <circle cx={lastPoint.x} cy={lastPoint.y} r="3.5" fill={themeColor} stroke="#FFFFFF" strokeWidth="1.2" />
                    <circle cx={lastPoint.x} cy={lastPoint.y} r="1.3" fill="#FFFFFF" />
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
                minWidth: '58px',
                justifyContent: 'center',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                lineHeight: 1.2,
                fontFamily: 'monospace',
                flexShrink: 0
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
            onClick={() => setVisible(false)}
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

export default function CostMatrixPage({ embedded = false }: { embedded?: boolean } = {}) {
    const { user, profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [purchaseHistory, setPurchaseHistory] = useState<Record<string, Purchase[]>>({});
    const [manualOverrides, setManualOverrides] = useState<Record<string, any>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Todas');
    const [savingId, setSavingId] = useState<string | null>(null);
    const [isSmartModalOpen, setIsSmartModalOpen] = useState(false);
    const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
    const [modalSearchTerm, setModalSearchTerm] = useState('');
    const [isModalSearchOpen, setIsModalSearchOpen] = useState(false);
    const [trainingTab, setTrainingTab] = useState<'all' | 'dual' | 'perishability' | 'outliers' | 'adaptive' | 'playbook'>('all');
    const [simulatedPrice, setSimulatedPrice] = useState<string>('');
    const [simulatedVolume, setSimulatedVolume] = useState<number>(50);
    const [simulatedShrinkage, setSimulatedShrinkage] = useState<number>(5);
    const [batchProgress, setBatchProgress] = useState(0);
    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [sortField, setSortField] = useState<'name' | 'last_price' | 'cost' | 'trend' | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState('');
    const [importSuccess, setImportSuccess] = useState('');
    const [importFile, setImportFile] = useState<File | null>(null);
    const [fileValidation, setFileValidation] = useState<{
        status: 'idle' | 'validating' | 'valid' | 'invalid';
        idColumn?: string;
        costColumn?: string;
        detectedCostColumns?: string[];
        allDetectedColumns?: string[];
        totalMatchedRows?: number;
        totalFileRows?: number;
        errorMessage?: string;
        parsedUpdates?: any[];
    }>({ status: 'idle' });
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [lifecycleFilter, setLifecycleFilter] = useState<'all' | 'vigente' | 'por_vencer' | 'vencido'>('all');
    
    // Quick Market Quote Modal state (Columna ÚLTIMA)
    const [quotingProduct, setQuotingProduct] = useState<Product | null>(null);
    const [quoteInputCost, setQuoteInputCost] = useState('');
    const [quoteInputNotes, setQuoteInputNotes] = useState('');
    const [isSavingQuote, setIsSavingQuote] = useState(false);

    // Override Modal state (Columna COSTO BASE FRUFRESCO)
    const [overrideProduct, setOverrideProduct] = useState<Product | null>(null);
    const [overrideInputCost, setOverrideInputCost] = useState('');
    const [isSavingOverride, setIsSavingOverride] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            let allProds: any[] = [];
            let pageNum = 0;
            const PAGE_SIZE = 1000;
            let finished = false;

            while (!finished) {
                const { data: batchProds, error: prodErr } = await supabase
                    .from('products')
                    .select('*')
                    .setHeader('Cache-Control', 'no-store')
                    .eq('is_active', true)
                    .order('category', { ascending: true })
                    .order('name', { ascending: true })
                    .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

                if (prodErr) throw prodErr;

                if (batchProds && batchProds.length > 0) {
                    allProds = [...allProds, ...batchProds];
                    if (batchProds.length < PAGE_SIZE) {
                        finished = true;
                    } else {
                        pageNum++;
                    }
                } else {
                    finished = true;
                }
            }

            setProducts(allProds);

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

    const triggerPricingSync = async (productId?: string, explicitCost?: number, productIds?: string[]) => {
        try {
            await fetch('/api/commercial/cost-matrix/sync-product', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId, explicitCost, productIds })
            });
        } catch (e) {
            console.warn('Pricing sync API error:', e);
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

            // Propagación dinámica segura vía API server-side a modelos de precios y catálogo B2C Hogar
            await triggerPricingSync(productId, manualCost);

            // Registrar trazabilidad en auditoría
            fetch('/api/audit/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'UPDATE_COST_MATRIX',
                    module: 'COMMERCIAL',
                    collaborator_name: profile?.contact_name || profile?.company_name || user?.email || 'Administrador Comercial',
                    collaborator_id: (profile as any)?.collaborator_id || user?.user_metadata?.collaborator_id || user?.id || null,
                    details: {
                        product_id: productId,
                        product_name: products.find(p => p.id === productId)?.name || productId,
                        manual_cost: manualCost
                    }
                })
            }).catch(e => console.warn('Audit log error:', e));

            // Ingestar cotización manual como observación en purchases para alimentar la serie temporal
            await supabase.from('purchases').insert([{
                product_id: productId,
                quantity: 1,
                unit_price: manualCost,
                total_cost: manualCost,
                payment_method: 'market_quote',
                raw_data_source: 'COTIZACION_MANUAL_MATRIZ',
                purchase_unit: products.find(p => p.id === productId)?.unit_of_measure || 'Kg',
                notes: 'Cotización manual directa en Matriz Comercial',
                created_at: new Date().toISOString(),
                status: 'completed'
            }]).catch(e => console.warn('Purchases insert quote warning:', e));

            setTimeout(() => setSavingId(null), 2000);
        } catch (err) {
            logError('handleSaveManualCost', err);
            setSavingId(null);
        }
    };

    const handleRecordMarketQuote = async () => {
        if (!quotingProduct) return;
        const costNum = parseFloat(quoteInputCost);
        if (isNaN(costNum) || costNum <= 0) {
            alert('Por favor ingresa un costo válido mayor a 0');
            return;
        }

        setIsSavingQuote(true);
        try {
            const nowIso = new Date().toISOString();
            const purchaseUnit = quotingProduct.unit_of_measure || 'Kg';

            // 1. Guardar en purchases como cotización de mercado formal
            const { data: newPurchase, error: pErr } = await supabase
                .from('purchases')
                .insert([{
                    product_id: quotingProduct.id,
                    quantity: 1,
                    unit_price: costNum,
                    total_cost: costNum,
                    payment_method: 'market_quote',
                    raw_data_source: 'COTIZACION_MANUAL_MATRIZ',
                    purchase_unit: purchaseUnit,
                    notes: quoteInputNotes || 'Cotización manual de mercado registrada en Matriz Comercial',
                    created_at: nowIso,
                    status: 'completed'
                }])
                .select()
                .single();

            if (pErr) throw pErr;

            // 2. Crear observación local y actualizar purchaseHistory inmediatamente
            const newObs: Purchase = {
                id: newPurchase?.id || `quote-${Date.now()}`,
                product_id: quotingProduct.id,
                unit_price: costNum,
                normalized_price: costNum,
                purchase_unit: purchaseUnit,
                created_at: nowIso,
                payment_method: 'market_quote',
                raw_data_source: 'COTIZACION_MANUAL_MATRIZ'
            };

            const updatedHistory = [newObs, ...(purchaseHistory[quotingProduct.id] || [])];
            setPurchaseHistory(prev => ({
                ...prev,
                [quotingProduct.id]: updatedHistory
            }));

            // 3. Recalcular Motor Adaptativo con la nueva serie histórica
            const obsList: PriceObservation[] = updatedHistory.map(h => ({
                price: h.normalized_price,
                date: h.created_at,
                purchaseUnit: h.purchase_unit,
                quantity: h.quantity || null
            }));
            const shrinkagePct = quotingProduct.theoretical_shrinkage_pct || 0;
            const newSmartCost = calculateAdaptiveCost(obsList, costNum, { shrinkagePct });

            // 4. Actualizar la matriz comercial con el costo adaptativo
            await supabase
                .from('commercial_cost_matrix')
                .upsert({
                    product_id: quotingProduct.id,
                    manual_cost: newSmartCost,
                    updated_at: nowIso,
                    updated_by: 'AI-DELTA-AUTO',
                    is_active: true
                });

            setManualOverrides(prev => ({
                ...prev,
                [quotingProduct.id]: { manual_cost: newSmartCost, updated_at: nowIso, updated_by: 'AI-DELTA-AUTO' }
            }));

            // 5. Propagación en tiempo real a modelos de precios y catálogo
            await triggerPricingSync(quotingProduct.id, newSmartCost);

            // 6. Auditoría
            fetch('/api/audit/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'MARKET_QUOTE_REGISTERED',
                    module: 'COMMERCIAL',
                    collaborator_name: profile?.contact_name || profile?.company_name || user?.email || 'Administrador Comercial',
                    details: {
                        product_id: quotingProduct.id,
                        product_name: quotingProduct.name,
                        quoted_price: costNum,
                        smart_cost_result: newSmartCost
                    }
                })
            }).catch(e => console.warn('Audit error:', e));

            setQuotingProduct(null);
            setQuoteInputCost('');
            setQuoteInputNotes('');
        } catch (err) {
            logError('handleRecordMarketQuote', err);
            alert('Error al registrar cotización: ' + (err as Error).message);
        } finally {
            setIsSavingQuote(false);
        }
    };

    const handleSaveOverride = async () => {
        if (!overrideProduct) return;
        const costNum = parseFloat(overrideInputCost);
        if (isNaN(costNum) || costNum <= 0) {
            alert('Por favor ingresa un costo válido mayor a 0');
            return;
        }

        setIsSavingOverride(true);
        try {
            const nowIso = new Date().toISOString();
            await supabase
                .from('commercial_cost_matrix')
                .upsert({
                    product_id: overrideProduct.id,
                    manual_cost: costNum,
                    updated_at: nowIso,
                    updated_by: 'MANUAL_OVERRIDE',
                    is_active: true
                });

            setManualOverrides(prev => ({
                ...prev,
                [overrideProduct.id]: { manual_cost: costNum, updated_at: nowIso, updated_by: 'MANUAL_OVERRIDE' }
            }));

            await triggerPricingSync(overrideProduct.id, costNum);

            setOverrideProduct(null);
            setOverrideInputCost('');
        } catch (err) {
            logError('handleSaveOverride', err);
        } finally {
            setIsSavingOverride(false);
        }
    };

    const handleResetToAdaptive = async (productId: string) => {
        try {
            const smartCost = calculateSmartCost(productId);
            if (smartCost <= 0) return;

            const nowIso = new Date().toISOString();
            await supabase
                .from('commercial_cost_matrix')
                .upsert({
                    product_id: productId,
                    manual_cost: smartCost,
                    updated_at: nowIso,
                    updated_by: 'AI-DELTA-AUTO',
                    is_active: true
                });

            setManualOverrides(prev => ({
                ...prev,
                [productId]: { manual_cost: smartCost, updated_at: nowIso, updated_by: 'AI-DELTA-AUTO' }
            }));

            await triggerPricingSync(productId, smartCost);

            setOverrideProduct(null);
        } catch (err) {
            logError('handleResetToAdaptive', err);
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

            const authorizedIds: string[] = [];
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

                authorizedIds.push(p.id);
                setBatchProgress(Math.round(((i + 1) / toAuthorize.length) * 100));
            }

            if (authorizedIds.length > 0) {
                await triggerPricingSync(undefined, undefined, authorizedIds);
            }

            await fetchData();
            alert('¡Autorización Masiva Completada y Precios Sincronizados!');
        } catch (err) {
            logError('handleAuthorizeAll', err);
        } finally {
            setIsAuthorizing(false);
            setBatchProgress(0);
        }
    };

    const calculateSmartCost = (productId: string) => {
        const history = purchaseHistory[productId] || [];
        const manual = manualOverrides[productId];
        const refCost = manual?.manual_cost;
        const product = products.find(p => p.id === productId);

        if (history.length === 0) {
            return refCost && refCost > 0 ? Math.round(refCost) : 0;
        }

        const observations: PriceObservation[] = history.map(h => ({
            price: h.normalized_price,
            date: h.created_at,
            purchaseUnit: h.purchase_unit,
            quantity: h.quantity || null
        }));

        const shrinkagePct = product?.theoretical_shrinkage_pct || 0;

        return calculateAdaptiveCost(observations, refCost, { shrinkagePct });
    };

    const getHarvestStatus = (productId: string) => {
        const hist = purchaseHistory[productId] || [];
        if (hist.length < 4) return 'neutral';
        
        const currentMonth = new Date().getMonth();
        const sameMonthHistory = hist.filter(h => {
            const d = safeGetValidDate(h.created_at);
            return d ? d.getMonth() === currentMonth : false;
        });
        
        if (sameMonthHistory.length > 1) {
            const avgHist = sameMonthHistory.reduce((a, b) => a + b.normalized_price, 0) / sameMonthHistory.length;
            if (hist[0].normalized_price < avgHist * 0.9) return 'harvest';
            if (hist[0].normalized_price > avgHist * 1.1) return 'risk';
        }
        return 'neutral';
    };

    const getProductCostLifecycle = (productId: string) => {
        const hist = purchaseHistory[productId] || [];
        const manual = manualOverrides[productId];
        const product = products.find(p => p.id === productId);
        
        let latestSignalDate: Date | string | null = null;
        let signalSource: 'COMPRAS' | 'MANUAL' | 'SIN_SEÑAL' = 'SIN_SEÑAL';
        let currentCost: number = 0;

        const histDate = hist[0]?.created_at ? safeGetValidDate(hist[0].created_at) : null;
        const manualDate = manual?.updated_at ? safeGetValidDate(manual.updated_at) : null;

        if (histDate && manualDate) {
            if (histDate >= manualDate) {
                latestSignalDate = hist[0].created_at;
                signalSource = 'COMPRAS';
                currentCost = hist[0].normalized_price;
            } else {
                latestSignalDate = manual.updated_at;
                signalSource = 'MANUAL';
                currentCost = manual.manual_cost;
            }
        } else if (histDate) {
            latestSignalDate = hist[0].created_at;
            signalSource = 'COMPRAS';
            currentCost = hist[0].normalized_price;
        } else if (manualDate) {
            latestSignalDate = manual.updated_at;
            signalSource = 'MANUAL';
            currentCost = manual.manual_cost;
        } else if (manual?.manual_cost) {
            currentCost = manual.manual_cost;
        }

        return evaluateCostFreshness(latestSignalDate, product?.category, currentCost, signalSource);
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
                'ID_CONTABLE': p.accounting_id || '',
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
                'ID_CONTABLE': p.accounting_id || '',
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

    const handleFileSelection = (file: File | null) => {
        setImportFile(file);
        setImportError('');
        setImportSuccess('');
        if (!file) {
            setFileValidation({ status: 'idle' });
            return;
        }
        validateExcelFile(file);
    };

    const validateExcelFile = async (file: File) => {
        setFileValidation({ status: 'validating' });
        setImportError('');
        setImportSuccess('');

        try {
            const dataBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(dataBuffer);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData: any[] = XLSX.utils.sheet_to_json(sheet);

            if (!jsonData || jsonData.length === 0) {
                setFileValidation({
                    status: 'invalid',
                    errorMessage: 'El archivo Excel está vacío o no contiene filas con datos legibles.'
                });
                return;
            }

            const rawHeaders = Object.keys(jsonData[0] || {});
            if (rawHeaders.length === 0) {
                setFileValidation({
                    status: 'invalid',
                    errorMessage: 'No se encontraron encabezados de columna en la primera fila del archivo.'
                });
                return;
            }

            const normalizeKey = (k: string) => k.trim().toUpperCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[$#]/g, '')
                .replace(/[\s\-_.]+/g, '_');

            // 1. Identificar columna obligatoria ID_CONTABLE / ACCOUNTING_ID / SKU / ID
            let foundIdCol: string | null = null;
            for (const h of rawHeaders) {
                const norm = normalizeKey(h);
                if (['ID_CONTABLE', 'IDCONTABLE', 'ACCOUNTING_ID', 'CODIGO_CONTABLE', 'COD_CONTABLE', 'CODIGO', 'COD', 'IDPRODUCTO', 'ID_PRODUCTO'].includes(norm)) {
                    foundIdCol = h;
                    break;
                }
            }
            if (!foundIdCol) {
                for (const h of rawHeaders) {
                    const norm = normalizeKey(h);
                    if (['SKU', 'ID', 'UUID'].includes(norm)) {
                        foundIdCol = h;
                        break;
                    }
                }
            }

            if (!foundIdCol) {
                setFileValidation({
                    status: 'invalid',
                    allDetectedColumns: rawHeaders,
                    errorMessage: `No se encontró la columna de identificación "ID_CONTABLE" (o ACCOUNTING_ID / SKU / ID). Columnas detectadas en tu archivo: [${rawHeaders.join(', ')}].`
                });
                return;
            }

            // 2. Identificar columnas candidatas a precio/costo
            const costKeywords = [
                'ULTIMO', 'ULTIMA', 'ULTIMO_COSTO', 'COSTO_ULTIMO', 'ULTIMA_COMPRA', 'COMPRA',
                'NUEVO_COSTO', 'COSTO_NUEVO', 'COSTO', 'COSTO_ACTUAL', 'COSTO_ANTERIOR', 'COSTO_COMPRA',
                'NUEVO_PRECIO', 'PRECIO_NUEVO', 'PRECIO', 'PRECIO_COMPRA', 'PRECIO_VENTA', 'PRECIO_UNITARIO', 'PRECIO_ACTUAL',
                'VALOR', 'VALOR_UNITARIO', 'VALOR_ULTIMO', 'COSTO_UNITARIO'
            ];

            const detectedCostCols: string[] = [];
            for (const h of rawHeaders) {
                const norm = normalizeKey(h);
                const isCost = costKeywords.includes(norm) ||
                    norm.endsWith('_COSTO') || norm.endsWith('_PRECIO') || norm.endsWith('_VALOR') || norm.endsWith('_ULTIMO') ||
                    norm.includes('COSTO') || norm.includes('PRECIO');
                if (isCost && !detectedCostCols.includes(h)) {
                    detectedCostCols.push(h);
                }
            }

            // Validación estricta: debe haber exactamente 1 columna de precio
            if (detectedCostCols.length === 0) {
                setFileValidation({
                    status: 'invalid',
                    allDetectedColumns: rawHeaders,
                    errorMessage: `No se detectó ninguna columna de costo o precio en el archivo. Columnas detectadas: [${rawHeaders.join(', ')}]. Debe incluir una columna con el valor del costo (ej: ULTIMO o NUEVO_COSTO).`
                });
                return;
            }

            if (detectedCostCols.length > 1) {
                setFileValidation({
                    status: 'invalid',
                    detectedCostColumns: detectedCostCols,
                    allDetectedColumns: rawHeaders,
                    errorMessage: `Archivo ambiguo rechazado: Detectamos ${detectedCostCols.length} columnas de precio/costo: [${detectedCostCols.join(', ')}]. Para garantizar la exactitud financiera y evitar discrepancias de cálculo, por favor deja únicamente una sola columna de costo en tu archivo Excel.`
                });
                return;
            }

            const singleCostCol = detectedCostCols[0];
            const parseCostNum = (raw: any): number => {
                if (raw === undefined || raw === null || raw === '') return 0;
                if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
                let s = String(raw).trim().replace(/[$]/g, '').replace(/\s+/g, '');
                if (s.includes('.') && s.includes(',')) {
                    s = s.replace(/\./g, '').replace(',', '.');
                } else if (s.includes(',')) {
                    const parts = s.split(',');
                    if (parts[1] && parts[1].length === 3 && parts.length === 2 && Number(parts[0]) > 0) {
                        s = parts[0] + parts[1];
                    } else {
                        s = s.replace(',', '.');
                    }
                } else if (s.includes('.')) {
                    const parts = s.split('.');
                    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) {
                        s = s.replace(/\./g, '');
                    }
                }
                const n = parseFloat(s);
                return isNaN(n) ? 0 : n;
            };

            const nowIso = new Date().toISOString();
            const updatesToPerform: any[] = [];

            for (const row of jsonData) {
                const idVal = row[foundIdCol];
                const costValRaw = row[singleCostCol];

                if (costValRaw === undefined || costValRaw === null || costValRaw === '') continue;
                const costNum = parseCostNum(costValRaw);
                if (costNum <= 0) continue;

                let matchedProduct: Product | undefined = undefined;

                if (idVal !== undefined && idVal !== null && String(idVal).trim() !== '') {
                    const rawStr = String(idVal).trim();
                    const num = Number(rawStr);

                    // Match por accounting_id
                    matchedProduct = products.find(p => {
                        if (!p.accounting_id) return false;
                        const pStr = String(p.accounting_id).trim();
                        if (pStr === rawStr) return true;
                        if (!isNaN(num) && num > 0 && Number(pStr) === num) return true;
                        return false;
                    });

                    // Match por SKU
                    if (!matchedProduct) {
                        matchedProduct = products.find(p => p.sku && p.sku.trim().toLowerCase() === rawStr.toLowerCase());
                    }

                    // Match por ID UUID
                    if (!matchedProduct) {
                        matchedProduct = products.find(p => p.id && p.id.toLowerCase() === rawStr.toLowerCase());
                    }
                }

                if (matchedProduct) {
                    updatesToPerform.push({
                        product_id: matchedProduct.id,
                        manual_cost: costNum,
                        updated_at: nowIso,
                        updated_by: 'EXCEL-IMPORT',
                        is_active: true
                    });
                }
            }

            if (updatesToPerform.length === 0) {
                setFileValidation({
                    status: 'invalid',
                    idColumn: foundIdCol,
                    costColumn: singleCostCol,
                    allDetectedColumns: rawHeaders,
                    errorMessage: `Se reconocieron las columnas "${foundIdCol}" y "${singleCostCol}", pero ninguno de los registros coincidió con los IDs contables o SKUs activos de los productos en el catálogo.`
                });
                return;
            }

            // Validación exitosa
            setFileValidation({
                status: 'valid',
                idColumn: foundIdCol,
                costColumn: singleCostCol,
                totalMatchedRows: updatesToPerform.length,
                totalFileRows: jsonData.length,
                allDetectedColumns: rawHeaders,
                parsedUpdates: updatesToPerform
            });

        } catch (err: any) {
            setFileValidation({
                status: 'invalid',
                errorMessage: err.message || 'Error al procesar el archivo Excel.'
            });
        }
    };

    const handleImportSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!importFile || fileValidation.status !== 'valid' || !fileValidation.parsedUpdates) {
            if (fileValidation.errorMessage) {
                setImportError(fileValidation.errorMessage);
            }
            return;
        }

        setImporting(true);
        setImportError('');
        setImportSuccess('');

        try {
            const collaboratorName = profile?.contact_name || profile?.company_name || user?.email || 'Administrador Comercial';
            const collaboratorId = (profile as any)?.collaborator_id || user?.user_metadata?.collaborator_id || user?.id || null;

            const res = await fetch('/api/commercial/cost-matrix/bulk-import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    updates: fileValidation.parsedUpdates,
                    fileName: importFile.name,
                    collaboratorName,
                    collaboratorId
                })
            });

            const jsonRes = await res.json();
            if (!res.ok || !jsonRes.success) {
                throw new Error(jsonRes.error || 'Error al procesar la actualización en el servidor.');
            }

            setImportSuccess(`¡Carga exitosa! Se actualizaron ${jsonRes.count} productos en la matriz de costos con fecha de hoy y se registró la trazabilidad.`);
            await fetchData();

            setTimeout(() => {
                setIsImportModalOpen(false);
                setImportFile(null);
                setFileValidation({ status: 'idle' });
                setImportSuccess('');
            }, 2500);

        } catch (err: any) {
            console.error('Error importando Excel:', err);
            setImportError(err.message || 'No se pudo completar la carga en el servidor.');
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
        <div style={{ backgroundColor: THEME.colors.background, minHeight: embedded ? 'auto' : '100vh', padding: embedded ? '1.5rem 2rem 3rem 2rem' : '1.75rem 2rem', fontFamily: THEME.typography.fontFamilySecondary }}>
            <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
                
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
                        {!embedded && (
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
                        )}
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
                    <>
                        {/* BARRA FLOTANTE STICKY DE ACCIONES Y BÚSQUEDA (ESTÁNDAR CLIENTSMODULE) */}
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            gap: '0.8rem', 
                            marginBottom: '1.2rem',
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            backdropFilter: 'blur(12px)',
                            padding: '0.65rem 1.2rem',
                            borderRadius: '20px',
                            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.05)',
                            border: '1px solid #E2E8F0',
                            position: 'sticky',
                            top: embedded ? '142px' : '85px',
                            zIndex: 70,
                            transition: 'all 0.2s ease-in-out',
                            flexWrap: 'wrap'
                        }}>
                            {/* Search & Quick Lifecycle Chips */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flex: '1 1 500px', flexWrap: 'wrap' }}>
                                {/* Search Input Container */}
                                <div style={{ 
                                    flex: '1 1 240px',
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    backgroundColor: '#F8FAFC', 
                                    borderRadius: '10px', 
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
                                            borderRadius: '8px',
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
                                            borderRadius: '8px',
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
                                            borderRadius: '8px',
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
                                            borderRadius: '8px',
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
                                    borderRadius: '10px', 
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
                                    description="Abre el instructivo completo del Motor Adaptativo FruFresco, amortiguación de Corabastos y políticas de auditoría."
                                >
                                    <button 
                                        onClick={() => setIsSmartModalOpen(true)}
                                        style={{ 
                                            height: '38px',
                                            padding: '0 0.8rem', 
                                            borderRadius: '10px', 
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
                                        borderRadius: '10px', 
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

                        {/* --- ENTERPRISE DATA GRID CARD WITH NATURAL SCROLL & STICKY COLUMN HEADERS --- */}
                        <div style={{ 
                            backgroundColor: THEME.colors.surface, 
                            borderRadius: THEME.radius.xl, 
                            boxShadow: THEME.shadow.md, 
                            border: `1px solid ${THEME.colors.border}`,
                            position: 'relative'
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', minWidth: '1120px' }}>
                                <thead style={{ backgroundColor: '#F8FAFC' }}>
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
                                                top: embedded ? '203px' : '146px',
                                                left: 0, 
                                                backgroundColor: '#F8FAFC', 
                                                zIndex: 65,
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                borderBottom: `1.5px solid ${THEME.colors.border}`,
                                                boxShadow: '2px 2px 4px rgba(0,0,0,0.04)',
                                                borderTopLeftRadius: THEME.radius.xl
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
                                                position: 'sticky',
                                                top: embedded ? '203px' : '146px',
                                                zIndex: 60,
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

                                        <th style={{ padding: '0.85rem 0.8rem', textAlign: 'center', width: '85px', position: 'sticky', top: embedded ? '203px' : '146px', zIndex: 60, backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>Compra 2</th>
                                        <th style={{ padding: '0.85rem 0.8rem', textAlign: 'center', width: '85px', position: 'sticky', top: embedded ? '203px' : '146px', zIndex: 60, backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>Compra 3</th>
                                        <th style={{ padding: '0.85rem 0.8rem', textAlign: 'center', width: '85px', position: 'sticky', top: embedded ? '203px' : '146px', zIndex: 60, backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>Compra 4</th>
                                        <th style={{ padding: '0.85rem 0.8rem', textAlign: 'center', width: '85px', position: 'sticky', top: embedded ? '203px' : '146px', zIndex: 60, backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>Compra 5</th>
                                        <th style={{ padding: '0.85rem 0.8rem', textAlign: 'center', width: '85px', position: 'sticky', top: embedded ? '203px' : '146px', zIndex: 60, backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>Compra 6</th>
                                        <th style={{ padding: '0.85rem 0.8rem', textAlign: 'center', width: '85px', position: 'sticky', top: embedded ? '203px' : '146px', zIndex: 60, backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>Compra 7</th>
                                        <th style={{ padding: '0.85rem 0.8rem', textAlign: 'center', width: '85px', position: 'sticky', top: embedded ? '203px' : '146px', zIndex: 60, backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>Compra 8</th>

                                        {/* Sortable: Costo Base FruFresco */}
                                        <th 
                                            onClick={() => handleSort('cost')}
                                            style={{ 
                                                padding: '0.85rem 1rem', 
                                                textAlign: 'center', 
                                                width: '160px', 
                                                position: 'sticky',
                                                top: embedded ? '203px' : '146px',
                                                zIndex: 60,
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
                                                position: 'sticky',
                                                top: embedded ? '203px' : '146px',
                                                zIndex: 60,
                                                cursor: 'pointer', 
                                                userSelect: 'none',
                                                backgroundColor: '#F8FAFC',
                                                borderBottom: `1.5px solid ${THEME.colors.border}`,
                                                borderTopRightRadius: THEME.radius.xl
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

                                        // Historial cronológico real de compras y cotizaciones de mercado
                                        const combinedPurchases: Purchase[] = [];
                                        hist.forEach(h => {
                                            if (h.normalized_price > 0) combinedPurchases.push(h);
                                        });

                                        // Si no tiene compras registradas pero tiene costo manual en matriz, mostrarlo como referencia inicial
                                        const hasManual = manual && typeof manual.manual_cost === 'number' && manual.manual_cost > 0;
                                        if (combinedPurchases.length === 0 && hasManual) {
                                            combinedPurchases.push({
                                                id: `manual-${p.id}`,
                                                product_id: p.id,
                                                unit_price: manual.manual_cost,
                                                purchase_unit: p.unit_of_measure || 'Kg',
                                                normalized_price: manual.manual_cost,
                                                created_at: manual.updated_at || new Date().toISOString(),
                                                raw_data_source: 'Cotización Manual'
                                            });
                                        }

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
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontWeight: '800', fontSize: '0.88rem', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain }}>
                                                                {p.name}
                                                            </span>
                                                            {(() => {
                                                                const harvestStatus = getHarvestStatus(p.id);
                                                                if (harvestStatus === 'harvest') {
                                                                    return (
                                                                        <span title="Temporada de Cosecha: Abundancia estacional y precios favorables">
                                                                            <Leaf size={14} color="#10B981" />
                                                                        </span>
                                                                    );
                                                                }
                                                                if (harvestStatus === 'risk') {
                                                                    return (
                                                                        <span title="Alerta de Escasez: Históricamente los precios suben este mes">
                                                                            <ShieldAlert size={14} color="#EF4444" />
                                                                        </span>
                                                                    );
                                                                }
                                                                return null;
                                                            })()}
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
                                                            {/* Perecibilidad Badge with Lucide Icon */}
                                                            {lifecycle.sla.perishabilityClass === 'A' && (
                                                                <span title={lifecycle.sla.description} style={{ fontSize: '0.65rem', fontWeight: '800', color: '#7C3AED', backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE', padding: '1px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                    <Zap size={10} color="#7C3AED" strokeWidth={2.5} /> Clase A (4d)
                                                                </span>
                                                            )}
                                                            {lifecycle.sla.perishabilityClass === 'B' && (
                                                                <span title={lifecycle.sla.description} style={{ fontSize: '0.65rem', fontWeight: '800', color: '#0284C7', backgroundColor: '#F0F9FF', border: '1px solid #BAE6FD', padding: '1px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                    <Clock size={10} color="#0284C7" strokeWidth={2.5} /> Clase B (8d)
                                                                </span>
                                                            )}
                                                            {lifecycle.sla.perishabilityClass === 'C' && (
                                                                <span title={lifecycle.sla.description} style={{ fontSize: '0.65rem', fontWeight: '800', color: '#059669', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                    <Package size={10} color="#059669" strokeWidth={2.5} /> Clase C (30d)
                                                                </span>
                                                            )}
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
                                                                {lifecycle.status === 'VIGENTE' && <CheckCircle2 size={10} color={lifecycle.statusColor} />}
                                                                {lifecycle.status === 'POR_VENCER' && <Clock size={10} color={lifecycle.statusColor} />}
                                                                {(lifecycle.status === 'VENCIDO' || lifecycle.status === 'SIN_REFERENCIA') && <AlertTriangle size={10} color={lifecycle.statusColor} />}
                                                                {lifecycle.statusLabel}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Purchase History Columns 1 to 8 */}
                                                    {(() => {
                                                        const obsList: PriceObservation[] = combinedPurchases.map(h => ({
                                                            price: h.normalized_price,
                                                            date: h.created_at,
                                                            purchaseUnit: h.purchase_unit
                                                        }));
                                                        const { validObservations, outlierObservations } = filterPriceOutliers(obsList, manual?.manual_cost);
                                                        const validPrices = validObservations.map(h => h.price).filter(priceVal => priceVal > 0);
                                                        const minPrice = validPrices.length > 1 ? Math.min(...validPrices) : null;

                                                        return [0, 1, 2, 3, 4, 5, 6, 7].map((colIdx) => {
                                                            const purchase = combinedPurchases[colIdx];
                                                            const price = purchase ? Math.round(purchase.normalized_price) : null;
                                                            const dateStr = purchase?.created_at ? safeFormatDate(purchase.created_at, 'dd MMM', '') : '';
                                                            const isBestPrice = purchase && minPrice !== null && Math.abs(purchase.normalized_price - minPrice) < 0.01;
                                                            const isMarketQuote = purchase && (
                                                                purchase.id?.startsWith('manual-') || 
                                                                purchase.id?.startsWith('quote-') ||
                                                                purchase.payment_method === 'market_quote' || 
                                                                purchase.raw_data_source?.includes('RECOTIZACION') || 
                                                                purchase.raw_data_source?.includes('Cotización')
                                                            );
                                                            const isOutlier = purchase && outlierObservations.some(o => 
                                                                Math.abs(o.price - purchase.normalized_price) < 0.01 && o.date === purchase.created_at
                                                            );

                                                            return (
                                                                <td key={colIdx} style={{ padding: '0.6rem 0.5rem', textAlign: 'center', verticalAlign: 'middle', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                                    {price ? (
                                                                        isOutlier ? (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.45 }}
                                                                                 title={`Registro contable conservado ($${formatNumber(price)}), pero excluido del cálculo adaptativo por inconsistencia de escala dimensional (empaque mayorista no unitario).`}>
                                                                                <span 
                                                                                    style={{ 
                                                                                        fontSize: '0.78rem', 
                                                                                        fontWeight: '600', 
                                                                                        fontFamily: 'monospace', 
                                                                                        color: '#94A3B8',
                                                                                        backgroundColor: '#F1F5F9',
                                                                                        border: '1px dashed #CBD5E1',
                                                                                        padding: '1px 5px',
                                                                                        borderRadius: '5px',
                                                                                        display: 'inline-flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '2px',
                                                                                        textDecoration: 'line-through'
                                                                                    }}
                                                                                >
                                                                                    ${formatNumber(price)}
                                                                                </span>
                                                                                <span style={{ fontSize: '0.6rem', color: '#94A3B8', fontStyle: 'italic', marginTop: '2px' }}>
                                                                                    Atípico
                                                                                </span>
                                                                                {dateStr && (
                                                                                    <span style={{ fontSize: '0.62rem', color: '#94A3B8', marginTop: '1px' }}>
                                                                                        {dateStr}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                                                <span 
                                                                                    title={isBestPrice ? "Mejor precio histórico registrado" : isMarketQuote ? "Cotización de mercado autorizada" : "Compra física en bodega"}
                                                                                    style={{ 
                                                                                        fontSize: '0.82rem', 
                                                                                        fontWeight: '700', 
                                                                                        fontFamily: 'monospace', 
                                                                                        color: isBestPrice ? '#15803D' : (colIdx === 0 ? THEME.colors.primary : THEME.colors.textMain),
                                                                                        backgroundColor: isBestPrice ? '#DCFCE7' : (colIdx === 0 ? '#ECFDF5' : 'transparent'),
                                                                                        border: isBestPrice ? '1px solid #86EFAC' : (colIdx === 0 ? '1px solid #A7F3D0' : 'none'),
                                                                                        padding: '2px 6px',
                                                                                        borderRadius: '6px',
                                                                                        position: 'relative',
                                                                                        display: 'inline-flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '3px',
                                                                                        boxShadow: isBestPrice ? '0 1px 3px rgba(34, 197, 94, 0.15)' : 'none'
                                                                                    }}
                                                                                >
                                                                                    {isMarketQuote && <FileText size={10} color="#059669" />}
                                                                                    ${formatNumber(price)}
                                                                                    {isBestPrice && (
                                                                                        <span 
                                                                                            style={{ 
                                                                                                position: 'absolute', 
                                                                                                top: '-7px', 
                                                                                                right: '-7px', 
                                                                                                backgroundColor: '#FEF08A', 
                                                                                                border: '1px solid #FACC15', 
                                                                                                borderRadius: '50%', 
                                                                                                width: '16px', 
                                                                                                height: '16px', 
                                                                                                display: 'flex', 
                                                                                                alignItems: 'center', 
                                                                                                justifyContent: 'center', 
                                                                                                boxShadow: '0 1px 3px rgba(0,0,0,0.12)' 
                                                                                            }} 
                                                                                            title="Mejor precio histórico registrado en compras"
                                                                                        >
                                                                                            <Award size={10} color="#854D0E" strokeWidth={2.8} />
                                                                                        </span>
                                                                                    )}
                                                                                </span>
                                                                                {dateStr && (
                                                                                    <span style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, marginTop: '2px', fontWeight: '500' }}>
                                                                                        {dateStr}
                                                                                    </span>
                                                                                )}
                                                                                {colIdx === 0 && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setQuotingProduct(p);
                                                                                            setQuoteInputCost(price ? String(price) : '');
                                                                                            setQuoteInputNotes('');
                                                                                        }}
                                                                                        title="Registrar nueva cotización de mercado hoy (se capturará como Última)"
                                                                                        style={{
                                                                                            marginTop: '3px',
                                                                                            background: '#F0FDF4',
                                                                                            border: '1px solid #BBF7D0',
                                                                                            borderRadius: '4px',
                                                                                            padding: '1px 6px',
                                                                                            fontSize: '0.65rem',
                                                                                            fontWeight: '800',
                                                                                            color: THEME.colors.primary,
                                                                                            cursor: 'pointer',
                                                                                            display: 'inline-flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '3px'
                                                                                        }}
                                                                                    >
                                                                                        <Pencil size={9} /> Cotizar
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        )
                                                                    ) : (
                                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                                                                            <span style={{ color: '#CBD5E1', fontSize: '0.85rem' }}>—</span>
                                                                            {colIdx === 0 && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setQuotingProduct(p);
                                                                                        setQuoteInputCost('');
                                                                                        setQuoteInputNotes('');
                                                                                    }}
                                                                                    title="Ingresar primera cotización de mercado (se capturará como Última)"
                                                                                    style={{
                                                                                        background: '#F0FDF4',
                                                                                        border: '1px solid #BBF7D0',
                                                                                        borderRadius: '4px',
                                                                                        padding: '1px 6px',
                                                                                        fontSize: '0.65rem',
                                                                                        fontWeight: '800',
                                                                                        color: THEME.colors.primary,
                                                                                        cursor: 'pointer',
                                                                                        display: 'inline-flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '3px'
                                                                                    }}
                                                                                >
                                                                                    <Plus size={9} /> Cotizar
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            );
                                                        });
                                                    })()}

                                                    {/* Algorithmic Base Cost Cell (Adaptive Engine Output with Manual Override) */}
                                                    <td style={{ padding: '0.65rem 0.8rem', backgroundColor: '#F8FAFC', verticalAlign: 'middle', borderBottom: `1px solid ${THEME.colors.border}`, textAlign: 'center' }}>
                                                        {(() => {
                                                            const smartCost = calculateSmartCost(p.id);
                                                            const isManualOverridden = manual && manual.updated_by === 'MANUAL_OVERRIDE';
                                                            const displayCost = (isManualOverridden && manual.manual_cost > 0) ? manual.manual_cost : smartCost;

                                                            return (
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', minWidth: '130px' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                                                        <span style={{
                                                                            fontSize: '1.02rem',
                                                                            fontWeight: '900',
                                                                            fontFamily: 'monospace',
                                                                            color: isManualOverridden ? '#B45309' : (smartCost > 0 ? '#111827' : '#94A3B8'),
                                                                            letterSpacing: '-0.02em'
                                                                        }}>
                                                                            ${formatNumber(Math.round(displayCost))}
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setOverrideProduct(p);
                                                                                setOverrideInputCost(String(Math.round(displayCost)));
                                                                            }}
                                                                            title="Gestionar Costo Base (Forzar Manualmente o Restablecer al Modelo)"
                                                                            style={{
                                                                                background: 'transparent',
                                                                                border: 'none',
                                                                                cursor: 'pointer',
                                                                                padding: '2px 4px',
                                                                                color: THEME.colors.textSecondary,
                                                                                borderRadius: '4px',
                                                                                display: 'flex',
                                                                                alignItems: 'center'
                                                                            }}
                                                                        >
                                                                            <Sliders size={13} />
                                                                        </button>
                                                                    </div>
                                                                    <div>
                                                                        {isManualOverridden ? (
                                                                            <span style={{
                                                                                fontSize: '0.62rem',
                                                                                fontWeight: '800',
                                                                                color: '#92400E',
                                                                                backgroundColor: '#FEF3C7',
                                                                                border: '1px solid #FDE68A',
                                                                                padding: '1px 6px',
                                                                                borderRadius: '4px',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '3px'
                                                                            }}>
                                                                                <Lock size={9} /> Forzado Manual
                                                                            </span>
                                                                        ) : (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setSelectedProductForModal(p);
                                                                                    setIsSmartModalOpen(true);
                                                                                }}
                                                                                title="Ver diagnóstico pedagógico en vivo del costo de este producto"
                                                                                style={{
                                                                                    fontSize: '0.62rem',
                                                                                    fontWeight: '800',
                                                                                    color: smartCost > 0 ? '#065F46' : '#94A3B8',
                                                                                    backgroundColor: smartCost > 0 ? '#ECFDF5' : '#F1F5F9',
                                                                                    border: `1px solid ${smartCost > 0 ? '#A7F3D0' : '#E2E8F0'}`,
                                                                                    padding: '1px 6px',
                                                                                    borderRadius: '4px',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '3px',
                                                                                    cursor: 'pointer',
                                                                                    transition: 'all 0.15s ease'
                                                                                }}
                                                                            >
                                                                                <Brain size={9} color={smartCost > 0 ? '#059669' : '#94A3B8'} /> Adaptativo Abastos
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>

                                                    {/* Trend Indicator Cell with Interactive Sparkline */}
                                                    <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center', verticalAlign: 'middle', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                        <Sparkline data={combinedPurchases} productId={p.id} />
                                                    </td>
                                                </tr>
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
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

            {/* --- MODAL: REGISTRAR COTIZACIÓN DE MERCADO (ÚLTIMA) --- */}
            {quotingProduct && (
                <div
                    onClick={() => {
                        if (!isSavingQuote) {
                            setQuotingProduct(null);
                            setQuoteInputCost('');
                            setQuoteInputNotes('');
                        }
                    }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.6)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1.25rem'
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            backgroundColor: 'white',
                            borderRadius: '20px',
                            padding: '2rem',
                            maxWidth: '480px',
                            width: '100%',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            border: '1px solid #E2E8F0'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Pencil size={20} color={THEME.colors.primary} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: THEME.colors.textMain }}>
                                        Registrar Cotización de Mercado
                                    </h3>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: THEME.colors.textSecondary }}>
                                        Se capturará como <strong>ÚLTIMA</strong> y alimentará el Motor Adaptativo FruFresco
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    if (!isSavingQuote) {
                                        setQuotingProduct(null);
                                        setQuoteInputCost('');
                                        setQuoteInputNotes('');
                                    }
                                }}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Product summary card */}
                        <div style={{ backgroundColor: '#F8FAFC', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #E2E8F0', marginBottom: '1.25rem' }}>
                            <div style={{ fontWeight: '800', fontSize: '0.92rem', color: THEME.colors.textMain }}>
                                {quotingProduct.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '0.72rem', color: THEME.colors.textSecondary }}>
                                <span>Unidad: <strong>{quotingProduct.unit_of_measure || 'Kg'}</strong></span>
                                <span>&bull;</span>
                                <span>Categoría: <strong>{CATEGORY_MAP[quotingProduct.category] || quotingProduct.category}</strong></span>
                                {quotingProduct.accounting_id && (
                                    <>
                                        <span>&bull;</span>
                                        <span>ID ERP: <strong>{quotingProduct.accounting_id}</strong></span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Input field */}
                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '0.4rem' }}>
                                Precio Cotizado por {quotingProduct.unit_of_measure || 'Kg'} (COP):
                            </label>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <span style={{ position: 'absolute', left: '12px', fontSize: '1rem', fontWeight: '800', color: THEME.colors.textSecondary, pointerEvents: 'none' }}>$</span>
                                <input
                                    type="number"
                                    autoFocus
                                    value={quoteInputCost}
                                    onChange={e => setQuoteInputCost(e.target.value)}
                                    placeholder="Ej. 4500"
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleRecordMarketQuote();
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem 1rem 0.75rem 1.8rem',
                                        borderRadius: '10px',
                                        border: `1.5px solid ${THEME.colors.border}`,
                                        fontSize: '1.15rem',
                                        fontWeight: '800',
                                        fontFamily: 'monospace',
                                        color: THEME.colors.textMain,
                                        outline: 'none',
                                        backgroundColor: '#FFFFFF'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Notes input */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.35rem' }}>
                                Fuente / Observación (Opcional):
                            </label>
                            <input
                                type="text"
                                value={quoteInputNotes}
                                onChange={e => setQuoteInputNotes(e.target.value)}
                                placeholder="Ej. Corabastos Bloque 12 / Proveedor X"
                                style={{
                                    width: '100%',
                                    padding: '0.55rem 0.85rem',
                                    borderRadius: '8px',
                                    border: `1px solid ${THEME.colors.border}`,
                                    fontSize: '0.8rem',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                onClick={() => {
                                    setQuotingProduct(null);
                                    setQuoteInputCost('');
                                    setQuoteInputNotes('');
                                }}
                                disabled={isSavingQuote}
                                style={{
                                    padding: '0.65rem 1.25rem',
                                    borderRadius: '8px',
                                    border: '1px solid #E2E8F0',
                                    backgroundColor: '#F8FAFC',
                                    color: THEME.colors.textSecondary,
                                    fontSize: '0.82rem',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleRecordMarketQuote}
                                disabled={isSavingQuote || !quoteInputCost}
                                style={{
                                    padding: '0.65rem 1.4rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: THEME.colors.primary,
                                    color: 'white',
                                    fontSize: '0.84rem',
                                    fontWeight: '800',
                                    cursor: (isSavingQuote || !quoteInputCost) ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 8px rgba(13, 122, 87, 0.25)'
                                }}
                            >
                                {isSavingQuote ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                {isSavingQuote ? 'Guardando...' : 'Guardar Cotización (Última)'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: GOBERNANZA / FORZADO DE COSTO BASE --- */}
            {overrideProduct && (
                <div
                    onClick={() => {
                        if (!isSavingOverride) {
                            setOverrideProduct(null);
                            setOverrideInputCost('');
                        }
                    }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.6)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1.25rem'
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            backgroundColor: 'white',
                            borderRadius: '20px',
                            padding: '2rem',
                            maxWidth: '480px',
                            width: '100%',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            border: '1px solid #E2E8F0'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Sliders size={20} color="#B45309" />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: THEME.colors.textMain }}>
                                        Gobernanza de Costo Base
                                    </h3>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: THEME.colors.textSecondary }}>
                                        {overrideProduct.name}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    if (!isSavingOverride) {
                                        setOverrideProduct(null);
                                        setOverrideInputCost('');
                                    }
                                }}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Motor Adaptativo vs Current Status */}
                        {(() => {
                            const smart = calculateSmartCost(overrideProduct.id);
                            const manual = manualOverrides[overrideProduct.id];
                            const isOverridden = manual && manual.updated_by === 'MANUAL_OVERRIDE';

                            return (
                                <>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '1.25rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '0.78rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>Costo Calculado por Motor Adaptativo:</span>
                                            <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#065F46', fontFamily: 'monospace' }}>${formatNumber(Math.round(smart))}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.78rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>Estatus Actual:</span>
                                            {isOverridden ? (
                                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#92400E', backgroundColor: '#FEF3C7', padding: '2px 8px', borderRadius: '6px' }}>
                                                    Forzado a ${formatNumber(Math.round(manual.manual_cost))}
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#065F46', backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: '6px' }}>
                                                    Regido por Motor Adaptativo
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Input for manual override */}
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '0.4rem' }}>
                                            Forzar Costo Base Manual (Congelar):
                                        </label>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <span style={{ position: 'absolute', left: '12px', fontSize: '1rem', fontWeight: '800', color: THEME.colors.textSecondary, pointerEvents: 'none' }}>$</span>
                                            <input
                                                type="number"
                                                value={overrideInputCost}
                                                onChange={e => setOverrideInputCost(e.target.value)}
                                                placeholder={String(Math.round(smart))}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.75rem 1rem 0.75rem 1.8rem',
                                                    borderRadius: '10px',
                                                    border: `1.5px solid ${THEME.colors.border}`,
                                                    fontSize: '1.15rem',
                                                    fontWeight: '800',
                                                    fontFamily: 'monospace',
                                                    color: THEME.colors.textMain,
                                                    outline: 'none'
                                                }}
                                            />
                                        </div>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', color: '#94A3B8' }}>
                                            Usar sólo para excepciones comerciales específicas.
                                        </p>
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginTop: '1.5rem' }}>
                                        {isOverridden ? (
                                            <button
                                                type="button"
                                                onClick={() => handleResetToAdaptive(overrideProduct.id)}
                                                style={{
                                                    padding: '0.65rem 1rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #A7F3D0',
                                                    backgroundColor: '#ECFDF5',
                                                    color: '#065F46',
                                                    fontSize: '0.78rem',
                                                    fontWeight: '800',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '5px'
                                                }}
                                            >
                                                <RefreshCw size={13} /> Restablecer a Motor Adaptativo
                                            </button>
                                        ) : <div />}

                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setOverrideProduct(null);
                                                    setOverrideInputCost('');
                                                }}
                                                disabled={isSavingOverride}
                                                style={{
                                                    padding: '0.65rem 1.25rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #E2E8F0',
                                                    backgroundColor: '#F8FAFC',
                                                    color: THEME.colors.textSecondary,
                                                    fontSize: '0.82rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Cerrar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleSaveOverride}
                                                disabled={isSavingOverride || !overrideInputCost}
                                                style={{
                                                    padding: '0.65rem 1.4rem',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    backgroundColor: '#B45309',
                                                    color: 'white',
                                                    fontSize: '0.84rem',
                                                    fontWeight: '800',
                                                    cursor: (isSavingOverride || !overrideInputCost) ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}
                                            >
                                                <Lock size={14} /> Forzar Costo
                                            </button>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* --- MODAL: IMPORTAR EXCEL --- */}
            {isImportModalOpen && (
                <div 
                    onClick={() => {
                        if (!importing) {
                            setIsImportModalOpen(false);
                            setImportError('');
                            setImportSuccess('');
                            setImportFile(null);
                        }
                    }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.6)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1.25rem'
                    }}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '20px',
                            border: '1px solid #E2E8F0',
                            maxWidth: '540px',
                            width: '100%',
                            boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.05)',
                            padding: '1.75rem',
                            textAlign: 'left',
                            position: 'relative'
                        }}
                    >
                        {/* Cabecera del Modal */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{
                                    width: '44px',
                                    height: '44px',
                                    borderRadius: '12px',
                                    backgroundColor: '#EDF5F1',
                                    border: '1px solid #C8DDD3',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#0D7A57',
                                    flexShrink: 0
                                }}>
                                    <FileSpreadsheet size={22} strokeWidth={2.2} />
                                </div>
                                <div>
                                    <span style={{ 
                                        fontSize: '0.66rem', 
                                        fontWeight: '800', 
                                        color: '#0D7A57', 
                                        textTransform: 'uppercase', 
                                        letterSpacing: '0.06em',
                                        display: 'block'
                                    }}>
                                        Operaciones Comerciales & Costos
                                    </span>
                                    <h3 style={{ 
                                        margin: '2px 0 0 0', 
                                        fontSize: '1.22rem', 
                                        fontWeight: '900', 
                                        color: '#1A231E', 
                                        letterSpacing: '-0.02em',
                                        fontFamily: THEME.typography.fontFamilyMain 
                                    }}>
                                        Cargar Matriz de Costos
                                    </h3>
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={importing}
                                onClick={() => { setIsImportModalOpen(false); setImportError(''); setImportSuccess(''); setImportFile(null); }}
                                style={{ 
                                    background: '#F1F5F9', 
                                    border: 'none', 
                                    borderRadius: '50%',
                                    width: '32px',
                                    height: '32px',
                                    cursor: importing ? 'not-allowed' : 'pointer', 
                                    color: '#64748B',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#E2E8F0'; e.currentTarget.style.color = '#1A231E'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#F1F5F9'; e.currentTarget.style.color = '#64748B'; }}
                            >
                                <X size={16} strokeWidth={2.4} />
                            </button>
                        </div>

                        {/* Tarjeta de instrucciones y requerimientos de columnas */}
                        <div style={{
                            backgroundColor: '#F8FAF9',
                            border: '1px solid #E2E8F0',
                            borderRadius: '12px',
                            padding: '0.85rem 1rem',
                            marginBottom: '1.15rem'
                        }}>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569', lineHeight: '1.45', fontWeight: '500' }}>
                                Sube tu archivo Excel con las listas de precios actualizadas. El sistema actualizará el costo unitario de compra y recalculará la dispersión comercial.
                            </p>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Columnas obligatorias:
                                </span>
                                <span style={{ 
                                    fontSize: '0.68rem', 
                                    fontWeight: '800', 
                                    backgroundColor: '#EFF6FF', 
                                    color: '#1D4ED8', 
                                    border: '1px solid #BFDBFE', 
                                    padding: '1px 7px', 
                                    borderRadius: '6px',
                                    fontFamily: 'monospace'
                                }}>
                                    ID_CONTABLE <span style={{ fontWeight: '500', opacity: 0.8 }}>(o SKU / ID)</span>
                                </span>
                                <span style={{ 
                                    fontSize: '0.68rem', 
                                    fontWeight: '800', 
                                    backgroundColor: '#EDF5F1', 
                                    color: '#0D7A57', 
                                    border: '1px solid #C8DDD3', 
                                    padding: '1px 7px', 
                                    borderRadius: '6px',
                                    fontFamily: 'monospace'
                                }}>
                                    NUEVO_COSTO <span style={{ fontWeight: '500', opacity: 0.8 }}>(o COSTO)</span>
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.65rem', paddingTop: '0.55rem', borderTop: '1px dashed #E2E8F0', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={handleExportTemplateAll}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        fontSize: '0.74rem',
                                        fontWeight: '700',
                                        color: '#0D7A57',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Download size={13} strokeWidth={2.2} /> Descargar plantilla completa (.xlsx)
                                </button>
                                <span style={{ color: '#CBD5E1' }}>•</span>
                                <button
                                    type="button"
                                    onClick={handleExportTemplateExpired}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        fontSize: '0.74rem',
                                        fontWeight: '700',
                                        color: '#D97706',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Download size={13} strokeWidth={2.2} /> Solo costos desactualizados
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleImportSubmit}>
                            {/* Input oculto nativo */}
                            <input 
                                ref={fileInputRef}
                                type="file" 
                                accept=".xlsx, .xls" 
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleFileSelection(f);
                                }}
                                style={{ display: 'none' }}
                            />

                            {/* Zona interactiva Drag & Drop */}
                            {!importFile ? (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setIsDragging(false);
                                        const droppedFile = e.dataTransfer.files?.[0];
                                        if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
                                            handleFileSelection(droppedFile);
                                        } else if (droppedFile) {
                                            setImportError('Por favor selecciona un archivo con extensión .xlsx o .xls');
                                        }
                                    }}
                                    style={{
                                        border: isDragging ? '2px dashed #0D7A57' : '2px dashed #CBD5E1',
                                        backgroundColor: isDragging ? '#EDF5F1' : '#F8FAF9',
                                        borderRadius: '16px',
                                        padding: '1.8rem 1.25rem',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        marginBottom: '1rem'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isDragging) {
                                            e.currentTarget.style.borderColor = '#0D7A57';
                                            e.currentTarget.style.backgroundColor = '#F4F8F6';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isDragging) {
                                            e.currentTarget.style.borderColor = '#CBD5E1';
                                            e.currentTarget.style.backgroundColor = '#F8FAF9';
                                        }
                                    }}
                                >
                                    <div style={{
                                        width: '46px',
                                        height: '46px',
                                        borderRadius: '12px',
                                        backgroundColor: '#FFFFFF',
                                        border: '1px solid #E2E8F0',
                                        color: '#0D7A57',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                        marginBottom: '0.2rem'
                                    }}>
                                        <Upload size={22} strokeWidth={2.2} />
                                    </div>
                                    <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#1A231E' }}>
                                        Haz clic o arrastra tu archivo Excel aquí
                                    </span>
                                    <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: '500' }}>
                                        Formatos compatibles: .xlsx o .xls (hasta 25 MB)
                                    </span>
                                </div>
                            ) : (
                                /* Ficha del archivo seleccionado */
                                <div style={{
                                    border: fileValidation.status === 'invalid' ? '1.5px solid #F87171' : '1.5px solid #0D7A57',
                                    backgroundColor: fileValidation.status === 'invalid' ? '#FEF2F2' : '#EDF5F1',
                                    borderRadius: '16px',
                                    padding: '1rem 1.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '0.85rem',
                                    marginBottom: '1rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
                                        <div style={{
                                            width: '42px',
                                            height: '42px',
                                            borderRadius: '10px',
                                            backgroundColor: '#FFFFFF',
                                            border: fileValidation.status === 'invalid' ? '1px solid #FCA5A5' : '1px solid #C8DDD3',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: fileValidation.status === 'invalid' ? '#DC2626' : '#0D7A57',
                                            flexShrink: 0
                                        }}>
                                            <FileSpreadsheet size={22} strokeWidth={2.2} />
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ 
                                                fontSize: '0.86rem', 
                                                fontWeight: '800', 
                                                color: '#1A231E', 
                                                whiteSpace: 'nowrap', 
                                                overflow: 'hidden', 
                                                textOverflow: 'ellipsis' 
                                            }}>
                                                {importFile.name}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '2px' }}>
                                                <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '600' }}>
                                                    {(importFile.size / 1024).toFixed(1)} KB
                                                </span>
                                                <span style={{ color: '#CBD5E1' }}>•</span>
                                                {fileValidation.status === 'validating' ? (
                                                    <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <Loader2 size={11} className="animate-spin" /> Verificando columnas...
                                                    </span>
                                                ) : fileValidation.status === 'valid' ? (
                                                    <span style={{ fontSize: '0.72rem', color: '#0D7A57', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <Check size={12} strokeWidth={3} /> Archivo validado (1 precio)
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.72rem', color: '#DC2626', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <AlertCircle size={12} strokeWidth={2.5} /> Archivo no admitido
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        disabled={importing}
                                        onClick={() => {
                                            handleFileSelection(null);
                                            if (fileInputRef.current) fileInputRef.current.value = '';
                                        }}
                                        style={{
                                            backgroundColor: '#FFFFFF',
                                            border: '1px solid #CBD5E1',
                                            borderRadius: '8px',
                                            width: '32px',
                                            height: '32px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#DC2626',
                                            cursor: importing ? 'not-allowed' : 'pointer',
                                            flexShrink: 0,
                                            transition: 'all 0.15s ease'
                                        }}
                                        title="Quitar archivo"
                                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FEF2F2'; e.currentTarget.style.borderColor = '#FCA5A5'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                                    >
                                        <Trash2 size={15} strokeWidth={2.2} />
                                    </button>
                                </div>
                            )}

                            {/* Tarjeta de Validación: Verificando */}
                            {fileValidation.status === 'validating' && (
                                <div style={{
                                    padding: '0.85rem 1rem',
                                    backgroundColor: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '12px',
                                    color: '#475569',
                                    fontSize: '0.82rem',
                                    marginBottom: '1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <Loader2 size={16} className="animate-spin" color="#0D7A57" />
                                    <span>Validando estructura de columnas y verificando que exista un solo precio...</span>
                                </div>
                            )}

                            {/* Tarjeta de Validación: Rechazo por regla de negocio */}
                            {fileValidation.status === 'invalid' && (
                                <div style={{
                                    padding: '0.9rem 1.1rem',
                                    backgroundColor: '#FEF2F2',
                                    border: '1.5px solid #F87171',
                                    borderRadius: '12px',
                                    color: '#991B1B',
                                    fontSize: '0.82rem',
                                    marginBottom: '1.1rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800', fontSize: '0.88rem' }}>
                                        <AlertCircle size={18} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                                        <span>Archivo no admitido para actualización</span>
                                    </div>
                                    <p style={{ margin: 0, lineHeight: '1.45', color: '#7F1D1D' }}>
                                        {fileValidation.errorMessage}
                                    </p>
                                    <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#B91C1C', fontWeight: '600' }}>
                                        ℹ️ Asegúrate de que tu archivo contenga la columna <strong>ID_CONTABLE</strong> y <strong>una sola columna de precio</strong> (ej: ULTIMO o NUEVO_COSTO).
                                    </div>
                                </div>
                            )}

                            {/* Tarjeta de Validación: Exitosa */}
                            {fileValidation.status === 'valid' && (
                                <div style={{
                                    padding: '0.85rem 1.1rem',
                                    backgroundColor: '#ECFDF5',
                                    border: '1.5px solid #34D399',
                                    borderRadius: '12px',
                                    color: '#065F46',
                                    fontSize: '0.82rem',
                                    marginBottom: '1.1rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800', fontSize: '0.88rem' }}>
                                        <CheckCircle2 size={18} strokeWidth={2.4} color="#059669" style={{ flexShrink: 0 }} />
                                        <span>Estructura validada exitosamente</span>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '2px' }}>
                                        <span style={{ backgroundColor: '#FFFFFF', padding: '3px 8px', borderRadius: '6px', border: '1px solid #A7F3D0', fontWeight: '700', fontSize: '0.74rem' }}>
                                            Columna ID: <strong>{fileValidation.idColumn}</strong>
                                        </span>
                                        <span style={{ backgroundColor: '#FFFFFF', padding: '3px 8px', borderRadius: '6px', border: '1px solid #A7F3D0', fontWeight: '700', fontSize: '0.74rem' }}>
                                            Columna de Costo: <strong>{fileValidation.costColumn}</strong>
                                        </span>
                                        <span style={{ backgroundColor: '#D1FAE5', color: '#047857', padding: '3px 8px', borderRadius: '6px', fontWeight: '800', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <Check size={12} color="#047857" /> {fileValidation.totalMatchedRows} productos listos para actualizar
                                        </span>
                                    </div>
                                </div>
                            )}

                            {importError && (
                                <div style={{ 
                                    padding: '0.75rem 1rem', 
                                    backgroundColor: '#FEF2F2', 
                                    border: '1px solid #FCA5A5', 
                                    borderRadius: '10px', 
                                    color: '#991B1B', 
                                    fontSize: '0.8rem', 
                                    marginBottom: '1rem', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px' 
                                }}>
                                    <AlertCircle size={16} strokeWidth={2.2} style={{ flexShrink: 0 }} /> 
                                    <span>{importError}</span>
                                </div>
                            )}

                            {importSuccess && (
                                <div style={{ 
                                    padding: '0.75rem 1rem', 
                                    backgroundColor: '#ECFDF5', 
                                    border: '1px solid #A7F3D0', 
                                    borderRadius: '10px', 
                                    color: '#065F46', 
                                    fontSize: '0.8rem', 
                                    marginBottom: '1rem', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px' 
                                }}>
                                    <CheckCircle2 size={16} strokeWidth={2.2} style={{ flexShrink: 0 }} /> 
                                    <span>{importSuccess}</span>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.4rem' }}>
                                <button
                                    type="button"
                                    disabled={importing}
                                    onClick={() => {
                                        setIsImportModalOpen(false);
                                        setImportError('');
                                        setImportSuccess('');
                                        handleFileSelection(null);
                                    }}
                                    style={{
                                        padding: '0.65rem 1.35rem',
                                        backgroundColor: '#FFFFFF',
                                        color: '#475569',
                                        borderRadius: '10px',
                                        border: '1px solid #CBD5E1',
                                        fontWeight: '700',
                                        fontSize: '0.84rem',
                                        cursor: importing ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; e.currentTarget.style.borderColor = '#94A3B8'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={!importFile || fileValidation.status !== 'valid' || importing}
                                    style={{
                                        padding: '0.65rem 1.6rem',
                                        backgroundColor: (!importFile || fileValidation.status !== 'valid' || importing) ? '#94A3B8' : '#0D7A57',
                                        color: '#FFFFFF',
                                        borderRadius: '10px',
                                        border: 'none',
                                        fontWeight: '800',
                                        fontSize: '0.84rem',
                                        cursor: (!importFile || fileValidation.status !== 'valid' || importing) ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '7px',
                                        boxShadow: (!importFile || fileValidation.status !== 'valid' || importing) ? 'none' : '0 4px 10px rgba(13, 122, 87, 0.25)',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (importFile && fileValidation.status === 'valid' && !importing) {
                                            e.currentTarget.style.backgroundColor = '#0A5F43';
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (importFile && fileValidation.status === 'valid' && !importing) {
                                            e.currentTarget.style.backgroundColor = '#0D7A57';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }
                                    }}
                                >
                                    {importing ? (
                                        <>
                                            <RefreshCw size={15} className="animate-spin" />
                                            <span>Procesando matriz...</span>
                                        </>
                                    ) : fileValidation.status === 'valid' ? (
                                        <>
                                            <Check size={15} strokeWidth={2.4} />
                                            <span>Actualizar Matriz ({fileValidation.totalMatchedRows} productos)</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={15} strokeWidth={2.4} />
                                            <span>Subir y Actualizar Matriz</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- SMART METHODOLOGY & TRAINING MODAL (MANUAL DE CAPACITACIÓN OPERATIVA) --- */}
            {isSmartModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.7)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.25rem',
                    fontFamily: THEME.typography.fontFamilyMain || 'system-ui, sans-serif'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '24px',
                        maxWidth: '1240px',
                        width: '95vw',
                        maxHeight: '92vh',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#CBD5E1 transparent',
                        padding: '2rem 2.25rem',
                        position: 'relative',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
                        textAlign: 'left'
                    }}>
                        {/* Close button */}
                        <button 
                            onClick={() => {
                                setIsSmartModalOpen(false);
                                setSelectedProductForModal(null);
                            }}
                            style={{ 
                                position: 'absolute', 
                                top: '1.5rem', 
                                right: '1.5rem', 
                                border: 'none', 
                                background: '#F1F5F9', 
                                borderRadius: '50%',
                                width: '38px',
                                height: '38px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer', 
                                color: '#64748B',
                                transition: 'all 0.2s'
                            }}
                            title="Cerrar Manual"
                        >
                            <X size={20} />
                        </button>

                        {/* Modal Header */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem', marginBottom: '1.5rem' }}>
                            <div style={{ 
                                backgroundColor: '#ECFDF5', 
                                border: '1px solid #A7F3D0',
                                padding: '1rem', 
                                borderRadius: '18px', 
                                color: THEME.colors.primary,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <BookOpen size={34} strokeWidth={2.2} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                    <h2 style={{ margin: 0, fontSize: '1.55rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.02em' }}>
                                        Manual de Capacitación: Matriz de Costos FruFresco
                                    </h2>
                                    <span style={{ 
                                        backgroundColor: '#EFF6FF', 
                                        color: '#2563EB', 
                                        fontSize: '0.72rem', 
                                        fontWeight: '800', 
                                        padding: '3px 8px', 
                                        borderRadius: '6px',
                                        border: '1px solid #BFDBFE'
                                    }}>
                                        v2.0 IA-Delta
                                    </span>
                                    <span style={{ 
                                        backgroundColor: '#ECFDF5', 
                                        color: '#059669', 
                                        fontSize: '0.72rem', 
                                        fontWeight: '800', 
                                        padding: '3px 8px', 
                                        borderRadius: '6px',
                                        border: '1px solid #A7F3D0'
                                    }}>
                                        Protocolo Comercial FruFresco
                                    </span>
                                </div>
                                <p style={{ margin: '6px 0 0 0', color: '#64748B', fontWeight: '500', fontSize: '0.9rem', lineHeight: '1.4' }}>
                                    Guía formativa para operadores comerciales: calibración dinámica de precios, arquitectura dual, gestión de perecibilidad y motor de alisamiento adaptativo de Corabastos.
                                </p>
                            </div>
                        </div>

                        {/* Selected Product Context Banner & Live Operational Diagnosis */}
                        {(() => {
                            const activeProduct = selectedProductForModal || (products.length > 0 ? products[0] : null);
                            if (!activeProduct) return null;

                            const history = purchaseHistory[activeProduct.id] || [];
                            const manual = manualOverrides[activeProduct.id];
                            const refCost = manual?.manual_cost;
                            const observations: PriceObservation[] = history.map(h => ({
                                price: h.normalized_price,
                                date: h.created_at,
                                quantity: h.quantity || null
                            }));
                            const shrinkagePct = activeProduct.theoretical_shrinkage_pct || 0;
                            const liveModel = runAdaptivePricingModel(observations, refCost, { shrinkagePct });
                            const sla = getFreshnessSLA(activeProduct.category);

                            // Sorted chronological observations
                            const sortedObs = [...observations].filter(o => o.price && o.price > 0).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                            const latestObs = sortedObs.length > 0 ? sortedObs[sortedObs.length - 1] : null;
                            const prevObs = sortedObs.length > 1 ? sortedObs[sortedObs.length - 2] : null;
                            const latestPrice = latestObs ? latestObs.price : refCost || 0;
                            const prevPrice = prevObs ? prevObs.price : latestPrice;
                            const priceShock = prevPrice > 0 ? (latestPrice - prevPrice) / prevPrice : 0;
                            const shockPct = Number((priceShock * 100).toFixed(1));

                            const lastDate = latestObs ? latestObs.date : null;
                            const lifecycle = evaluateCostFreshness(lastDate, activeProduct.category, liveModel.cost);
                            const daysSince = lifecycle.daysOld;

                            // Intermediate Tone Pedagogical Narrative
                            let narrative = '';
                            if (sortedObs.length === 0) {
                                narrative = `El producto no cuenta con compras ni sondeos registrados en la base de datos. Se mantiene el costo de referencia base de $${formatNumber(refCost || 0)} COP/Kg como piso operativo provisional hasta que se registre una cotización táctica o una compra física en bodega.`;
                            } else if (sortedObs.length === 1) {
                                narrative = `Solo existe una señal de mercado reciente ($${formatNumber(latestPrice)} COP/Kg). El sistema toma este valor como costo base y le suma el rendimiento por merma de bodega (${shrinkagePct}%), generando un costo neto vendible de $${formatNumber(liveModel.cost)} COP/Kg.`;
                            } else if (priceShock > 0.18) {
                                narrative = `Se identificó un incremento reciente en plaza del +${shockPct}%. Para proteger la estabilidad comercial de las listas de precios y no sobrerreaccionar a un evento aislado de un solo día (lluvia o transporte), el algoritmo aplicó amortiguación de choque, situando el costo base en $${formatNumber(liveModel.grossCost)} COP/Kg en lugar de trasladar el pico directo de $${formatNumber(latestPrice)} COP/Kg.`;
                            } else if (liveModel.trendDirection === 'up' && sortedObs.length >= 3) {
                                narrative = `El producto acumula aumentos continuos en sus últimas compras y sondeos. Al confirmarse una escasez estacional sostenida, el algoritmo aceleró la captación del costo ($${formatNumber(liveModel.grossCost)} COP/Kg) para evitar vender por debajo del costo de reposición y salvaguardar el margen comercial.`;
                            } else if (priceShock < -0.15) {
                                narrative = `La plaza registró una caída abrupta del ${shockPct}%. El algoritmo aplicó un descenso gradual ($${formatNumber(liveModel.grossCost)} COP/Kg) para permitir la rotación rentable del inventario remanente en bodega antes de equiparar la nueva tarifa baja del mercado.`;
                            } else {
                                narrative = `Las cotizaciones y compras se mantienen estables dentro de los rangos habituales de mercado. El costo base de $${formatNumber(liveModel.grossCost)} COP/Kg refleja el equilibrio ponderado por volumen, asegurando tarifas firmes y consistentes.`;
                            }

                            return (
                                <div style={{ 
                                    marginBottom: '1.5rem', 
                                    padding: '1.25rem', 
                                    backgroundColor: '#F8FAFC', 
                                    borderRadius: '16px', 
                                    border: '1px solid #CBD5E1',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1rem'
                                }}>
                                    {/* Top Bar: Selector and SLA Badge */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ backgroundColor: '#ECFDF5', padding: '8px', borderRadius: '10px', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Brain size={20} color="#059669" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                    Diagnóstico Operativo en Vivo
                                                </div>
                                                <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#0F172A' }}>
                                                    {activeProduct.name}
                                                </div>
                                                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '1px' }}>
                                                    ID Contable: <strong>{activeProduct.accounting_id || 'S/N'}</strong> | Categoría: <strong>{CATEGORY_MAP[activeProduct.category] || activeProduct.category}</strong>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Product Selector Searcher */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', whiteSpace: 'nowrap' }}>
                                                    Buscar otro producto:
                                                </span>
                                                
                                                <div style={{
                                                    position: 'relative',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    backgroundColor: 'white',
                                                    borderRadius: '8px',
                                                    border: `1px solid ${isModalSearchOpen ? THEME.colors.primary : '#CBD5E1'}`,
                                                    padding: '0 8px',
                                                    height: '32px',
                                                    width: '260px',
                                                    gap: '6px',
                                                    boxShadow: isModalSearchOpen ? '0 0 0 2px rgba(16, 185, 129, 0.15)' : 'none',
                                                    transition: 'all 0.15s ease'
                                                }}>
                                                    <Search size={14} color="#64748B" />
                                                    <input
                                                        type="text"
                                                        value={modalSearchTerm}
                                                        placeholder="Nombre o ID contable..."
                                                        onChange={(e) => {
                                                            setModalSearchTerm(e.target.value);
                                                            setIsModalSearchOpen(true);
                                                        }}
                                                        onFocus={() => setIsModalSearchOpen(true)}
                                                        style={{
                                                            width: '100%',
                                                            border: 'none',
                                                            outline: 'none',
                                                            fontSize: '0.78rem',
                                                            fontWeight: '600',
                                                            color: '#0F172A',
                                                            background: 'transparent'
                                                        }}
                                                    />
                                                    {modalSearchTerm && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setModalSearchTerm('')}
                                                            style={{
                                                                border: 'none',
                                                                background: 'none',
                                                                color: '#94A3B8',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                padding: 0
                                                            }}
                                                            title="Limpiar búsqueda"
                                                        >
                                                            <X size={13} />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Autocomplete Dropdown List */}
                                                {isModalSearchOpen && (
                                                    <>
                                                        {/* Backdrop for click outside */}
                                                        <div 
                                                            onClick={() => setIsModalSearchOpen(false)}
                                                            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                                                        />

                                                        <div style={{
                                                            position: 'absolute',
                                                            top: 'calc(100% + 4px)',
                                                            right: 0,
                                                            width: '320px',
                                                            maxHeight: '260px',
                                                            overflowY: 'auto',
                                                            backgroundColor: 'white',
                                                            borderRadius: '10px',
                                                            border: '1px solid #CBD5E1',
                                                            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
                                                            zIndex: 1000,
                                                            padding: '4px 0'
                                                        }}>
                                                            {(() => {
                                                                const filteredModalProducts = products.filter(prod => {
                                                                    if (!modalSearchTerm.trim()) return true;
                                                                    const term = modalSearchTerm.toLowerCase();
                                                                    return prod.name.toLowerCase().includes(term) || (prod.accounting_id && String(prod.accounting_id).includes(term)) || (prod.sku && prod.sku.toLowerCase().includes(term));
                                                                }).slice(0, 15);

                                                                if (filteredModalProducts.length === 0) {
                                                                    return (
                                                                        <div style={{ padding: '12px 14px', fontSize: '0.75rem', color: '#94A3B8', textAlign: 'center' }}>
                                                                            No se encontraron productos coincidentes
                                                                        </div>
                                                                    );
                                                                }

                                                                return filteredModalProducts.map(prod => {
                                                                    const isSelected = prod.id === activeProduct.id;
                                                                    return (
                                                                        <div
                                                                            key={prod.id}
                                                                            onClick={() => {
                                                                                setSelectedProductForModal(prod);
                                                                                setModalSearchTerm('');
                                                                                setIsModalSearchOpen(false);
                                                                            }}
                                                                            style={{
                                                                                padding: '7px 12px',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'space-between',
                                                                                cursor: 'pointer',
                                                                                backgroundColor: isSelected ? '#ECFDF5' : 'transparent',
                                                                                borderLeft: isSelected ? '3px solid #059669' : '3px solid transparent',
                                                                                transition: 'background-color 0.15s ease'
                                                                            }}
                                                                            onMouseEnter={e => {
                                                                                if (!isSelected) e.currentTarget.style.backgroundColor = '#F8FAFC';
                                                                            }}
                                                                            onMouseLeave={e => {
                                                                                if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                                                                            }}
                                                                        >
                                                                            <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                                                                                <div style={{ 
                                                                                    fontSize: '0.78rem', 
                                                                                    fontWeight: isSelected ? '800' : '600', 
                                                                                    color: isSelected ? '#065F46' : '#0F172A',
                                                                                    whiteSpace: 'nowrap',
                                                                                    overflow: 'hidden',
                                                                                    textOverflow: 'ellipsis'
                                                                                }}>
                                                                                    {prod.name}
                                                                                </div>
                                                                                <div style={{ fontSize: '0.68rem', color: '#64748B', display: 'flex', gap: '6px' }}>
                                                                                    <span>ID: {prod.accounting_id || 'S/N'}</span>
                                                                                    <span>•</span>
                                                                                    <span>{CATEGORY_MAP[prod.category] || prod.category}</span>
                                                                                </div>
                                                                            </div>
                                                                            {isSelected && (
                                                                                <Check size={14} color="#059669" />
                                                                            )}
                                                                        </div>
                                                                    );
                                                                });
                                                            })()}
                                                        </div>
                                                    </>
                                                )}
                                            </div>

                                            {/* SLA Tag */}
                                            {sla.perishabilityClass === 'A' && (
                                                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#7C3AED', backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE', padding: '4px 10px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <Zap size={13} color="#7C3AED" strokeWidth={2.5} /> Clase A: Hiperperecedero ({sla.validDaysMax}d)
                                                </span>
                                            )}
                                            {sla.perishabilityClass === 'B' && (
                                                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0284C7', backgroundColor: '#F0F9FF', border: '1px solid #BAE6FD', padding: '4px 10px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <Clock size={13} color="#0284C7" strokeWidth={2.5} /> Clase B: Semi-perecedero ({sla.validDaysMax}d)
                                                </span>
                                            )}
                                            {sla.perishabilityClass === 'C' && (
                                                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#059669', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', padding: '4px 10px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <Package size={13} color="#059669" strokeWidth={2.5} /> Clase C: Despensa ({sla.validDaysMax}d)
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* 4 KPI Cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                                        <div style={{ backgroundColor: 'white', padding: '0.85rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase' }}>
                                                Última Señal de Mercado
                                            </div>
                                            <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#0F172A', marginTop: '3px' }}>
                                                ${formatNumber(latestPrice)} / {activeProduct.unit_of_measure || 'Kg'}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: shockPct > 0 ? '#B45309' : shockPct < 0 ? '#047857' : '#64748B', fontWeight: '700', marginTop: '2px' }}>
                                                {shockPct > 0 ? `▲ +${shockPct}% vs anterior` : shockPct < 0 ? `▼ ${shockPct}% vs anterior` : 'Sin variación'}
                                            </div>
                                        </div>

                                        <div style={{ backgroundColor: 'white', padding: '0.85rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase' }}>
                                                Costo Base Sugerido
                                            </div>
                                            <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#059669', marginTop: '3px' }}>
                                                ${formatNumber(liveModel.grossCost)} / {activeProduct.unit_of_measure || 'Kg'}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: '700', marginTop: '2px' }}>
                                                {liveModel.grossCost === latestPrice 
                                                    ? 'Alineado a última señal' 
                                                    : liveModel.grossCost < latestPrice 
                                                    ? `Amortiguado en -$${formatNumber(latestPrice - liveModel.grossCost)}`
                                                    : 'Ajustado a rango'}
                                            </div>
                                        </div>

                                        <div style={{ backgroundColor: 'white', padding: '0.85rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase' }}>
                                                Merma de Bodega
                                            </div>
                                            <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#0F172A', marginTop: '3px' }}>
                                                {shrinkagePct}% <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748B' }}>({liveModel.shrinkageCostDelta > 0 ? `+$${formatNumber(liveModel.shrinkageCostDelta)}` : 'Sin merma'})</span>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: '700', marginTop: '2px' }}>
                                                Costo Neto Vendible: <strong>${formatNumber(liveModel.cost)}</strong>
                                            </div>
                                        </div>

                                        <div style={{ backgroundColor: 'white', padding: '0.85rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase' }}>
                                                Vigencia Comercial (SLA)
                                            </div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: '900', color: lifecycle.statusColor, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                {lifecycle.status === 'VIGENTE' && <CheckCircle2 size={14} color={lifecycle.statusColor} />}
                                                {lifecycle.status === 'POR_VENCER' && <Clock size={14} color={lifecycle.statusColor} />}
                                                {lifecycle.status === 'VENCIDO' && <AlertTriangle size={14} color={lifecycle.statusColor} />}
                                                {lifecycle.status === 'SIN_REFERENCIA' && <AlertCircle size={14} color={lifecycle.statusColor} />}
                                                <span>{lifecycle.statusLabel}</span>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                                                {daysSince >= 999 ? 'Sin registros de compra' : `Última señal: hace ${daysSince} día${daysSince === 1 ? '' : 's'}`}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Intermediate Tone Operational Narrative */}
                                    <div style={{ backgroundColor: 'white', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.82rem', color: '#334155', lineHeight: '1.5' }}>
                                        <div style={{ fontWeight: '800', color: '#0F172A', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <Sparkles size={14} color="#059669" />
                                            Dictamen Operativo del Sistema:
                                        </div>
                                        {narrative}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Interactive Navigation Tabs */}
                        <div style={{ 
                            display: 'flex', 
                            gap: '8px', 
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            paddingBottom: '0.75rem', 
                            marginBottom: '1.5rem',
                            borderBottom: '1px solid #E2E8F0'
                        }}>
                            {[
                                { id: 'all', label: 'Manual Completo', icon: <BookOpen size={14} /> },
                                { id: 'dual', label: '1. Dinámica Dual', icon: <Sliders size={14} /> },
                                { id: 'perishability', label: '2. Perecibilidad & SLAs', icon: <Clock size={14} /> },
                                { id: 'outliers', label: '3. Filtro de Dispersión', icon: <Filter size={14} /> },
                                { id: 'adaptive', label: '4. Motor Adaptativo FruFresco', icon: <Brain size={14} /> },
                                { id: 'playbook', label: '5. Playbook Operativo', icon: <CheckCheck size={14} /> }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setTrainingTab(tab.id as any)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '7px 15px',
                                        borderRadius: '10px',
                                        fontSize: '0.8rem',
                                        fontWeight: trainingTab === tab.id ? '800' : '600',
                                        color: trainingTab === tab.id ? 'white' : '#475569',
                                        backgroundColor: trainingTab === tab.id ? THEME.colors.primary : '#F1F5F9',
                                        border: 'none',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {tab.icon}
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* MODULE CONTENT CONTAINER */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                            {/* MODULE 1: DINÁMICA DUAL (ÚLTIMA vs COSTO BASE) */}
                            {(trainingTab === 'all' || trainingTab === 'dual') && (
                                <section style={{ backgroundColor: '#F8FAFC', borderRadius: '16px', padding: '1.5rem', border: '1px solid #E2E8F0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                                        <span style={{ backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: '900', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px' }}>
                                            MÓDULO 1
                                        </span>
                                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#0F172A' }}>
                                            Dinámica Dual Operativa: Insumo de Entrada vs. Salida Algorítmica
                                        </h3>
                                    </div>
                                    <p style={{ fontSize: '0.86rem', color: '#475569', lineHeight: '1.55', margin: '0 0 1.25rem 0' }}>
                                        La matriz de costos separa estrictamente el <strong>sensor de mercado</strong> del <strong>costo de referencia comercial</strong>. La columna <strong>ÚLTIMA</strong> alimenta la señal y la columna <strong>COSTO BASE FRUFRESCO</strong> entrega el valor óptimo calculado por la inteligencia algorítmica.
                                    </p>

                                    {/* Flow Diagram */}
                                    <div style={{ backgroundColor: 'white', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px dashed #CBD5E1', marginBottom: '1.25rem' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                            Flujo de Propagación de Precios
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.78rem', fontWeight: '700' }}>
                                            <span style={{ backgroundColor: '#F1F5F9', color: '#334155', padding: '4px 10px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <Store size={12} /> Bodega / Sondeo de Mercado
                                            </span>
                                            <ArrowRight size={14} color="#94A3B8" />
                                            <span style={{ backgroundColor: '#DCFCE7', color: '#166534', padding: '4px 10px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <Pencil size={11} /> Columna ÚLTIMA (Insumo)
                                            </span>
                                            <ArrowRight size={14} color="#94A3B8" />
                                            <span style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', padding: '4px 10px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <Brain size={12} /> Motor Adaptativo FruFresco
                                            </span>
                                            <ArrowRight size={14} color="#94A3B8" />
                                            <span style={{ backgroundColor: '#FEF3C7', color: '#92400E', padding: '4px 10px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <Sliders size={12} /> COSTO BASE FRUFRESCO (Salida)
                                            </span>
                                            <ArrowRight size={14} color="#94A3B8" />
                                            <span style={{ backgroundColor: '#F5F3FF', color: '#6D28D9', padding: '4px 10px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <Tag size={12} /> Catálogos & Listas B2B
                                            </span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                                        {/* Left Card: Columna ÚLTIMA */}
                                        <div style={{ backgroundColor: 'white', padding: '1.2rem', borderRadius: '12px', border: '1px solid #E2E8F0', borderLeft: '4px solid #10B981' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.4rem' }}>
                                                <Pencil size={16} color="#059669" />
                                                <span style={{ fontWeight: '900', color: '#059669', fontSize: '0.95rem' }}>
                                                    Columna "ÚLTIMA" (Sensor de Mercado)
                                                </span>
                                            </div>
                                            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem', color: '#475569', lineHeight: '1.6' }}>
                                                <li><strong>Fuente Dual:</strong> Se nutre automáticamente de las compras físicas diarias en bodega (módulo <code>ops/compras</code>) y de recotizaciones comerciales directas.</li>
                                                <li><strong>Botón <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 6px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '5px', fontSize: '0.74rem', fontWeight: '800', color: '#166534' }}><Pencil size={10} /> Cotizar</span>:</strong> Si un producto no tiene compras recientes o su costo está vencido, el negociador comercial hace clic en dicho botón dentro de la misma celda para ingresar el sondeo del día.</li>
                                                <li><strong>Trazabilidad:</strong> Se guarda como un registro fechado en la base de datos (<code>payment_method: 'market_quote'</code>), convirtiéndose de inmediato en la señal más reciente.</li>
                                            </ul>
                                        </div>

                                        {/* Right Card: Columna COSTO BASE */}
                                        <div style={{ backgroundColor: 'white', padding: '1.2rem', borderRadius: '12px', border: '1px solid #E2E8F0', borderLeft: '4px solid #2563EB' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.4rem' }}>
                                                <Brain size={16} color="#2563EB" />
                                                <span style={{ fontWeight: '900', color: '#2563EB', fontSize: '0.95rem' }}>
                                                    Columna "COSTO BASE" (Salida de IA)
                                                </span>
                                            </div>
                                            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem', color: '#475569', lineHeight: '1.6' }}>
                                                <li><strong>Cálculo Automático:</strong> Ya no es una celda editable a mano alzada. Muestra el costo por kilogramo derivado de la corrida del Motor Adaptativo FruFresco.</li>
                                                <li><strong>Propagación Comercial:</strong> Alimenta directamente las listas de precios activas sumando los márgenes de ganancia configurados para cada cliente o segmento.</li>
                                                <li><strong>Override de Emergencia:</strong> Mediante el botón de ajuste <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 6px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '5px', fontSize: '0.74rem', fontWeight: '800', color: '#1D4ED8' }}><Sliders size={10} /> Ajustar</span>, el usuario puede fijar temporalmente un costo forzado (<code>FORZADO MANUAL</code>) o restablecerlo al modelo algorítmico con un clic.</li>
                                            </ul>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* MODULE 2: SEMÁFORO DE PERECIBILIDAD & SLAS */}
                            {(trainingTab === 'all' || trainingTab === 'perishability') && (
                                <section style={{ backgroundColor: '#F8FAFC', borderRadius: '16px', padding: '1.5rem', border: '1px solid #E2E8F0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                                        <span style={{ backgroundColor: '#E0E7FF', color: '#4338CA', fontWeight: '900', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px' }}>
                                            MÓDULO 2
                                        </span>
                                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#0F172A' }}>
                                            Semáforo de Perecibilidad: Clasificación Biológica y Acuerdos de Frescura (SLAs)
                                        </h3>
                                    </div>
                                    <p style={{ fontSize: '0.86rem', color: '#475569', lineHeight: '1.55', margin: '0 0 1.25rem 0' }}>
                                        No todos los alimentos comparten la misma dinámica de mercado. Los costos expiran a ritmos diferentes según su tasa respiratoria y susceptibilidad postcosecha. Cada fila de la matriz muestra un distintivo con su clase y SLA de vigencia:
                                    </p>

                                    {/* 3 Classes Cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                                        {/* Clase A */}
                                        <div style={{ backgroundColor: 'white', padding: '1.1rem', borderRadius: '12px', border: '1px solid #DDD6FE' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem' }}>
                                                <span style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', padding: '3px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #DDD6FE' }}>
                                                    <Zap size={13} color="#7C3AED" strokeWidth={2.5} /> Clase A: Hiperperecederos
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#7C3AED', marginBottom: '0.3rem' }}>
                                                SLA de Frescura: Máximo 4 días
                                            </div>
                                            <p style={{ fontSize: '0.78rem', color: '#475569', margin: 0, lineHeight: '1.5' }}>
                                                <strong>Familias:</strong> Hortalizas de hoja, hierbas aromáticas, verduras delicadas (cilantro, lechuga, espinaca).<br />
                                                <strong>Dinámica:</strong> Muy alta volatilidad por clima en la sabana. Requiere recotización obligatoria si supera 4 días sin compra.
                                            </p>
                                        </div>

                                        {/* Clase B */}
                                        <div style={{ backgroundColor: 'white', padding: '1.1rem', borderRadius: '12px', border: '1px solid #BAE6FD' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem' }}>
                                                <span style={{ backgroundColor: '#F0F9FF', color: '#0284C7', padding: '3px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #BAE6FD' }}>
                                                    <Clock size={13} color="#0284C7" strokeWidth={2.5} /> Clase B: Semi-perecederos
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0284C7', marginBottom: '0.3rem' }}>
                                                SLA de Frescura: Máximo 8 días
                                            </div>
                                            <p style={{ fontSize: '0.78rem', color: '#475569', margin: 0, lineHeight: '1.5' }}>
                                                <strong>Familias:</strong> Frutas frescas, tubérculos, plátanos, lácteos (tomate chonto, papa, plátano verde).<br />
                                                <strong>Dinámica:</strong> Rotación intermedia; permite suavizar tendencias semanales de abastecimiento sin desfasarse del mercado mayorista.
                                            </p>
                                        </div>

                                        {/* Clase C */}
                                        <div style={{ backgroundColor: 'white', padding: '1.1rem', borderRadius: '12px', border: '1px solid #A7F3D0' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem' }}>
                                                <span style={{ backgroundColor: '#ECFDF5', color: '#059669', padding: '3px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #A7F3D0' }}>
                                                    <Package size={13} color="#059669" strokeWidth={2.5} /> Clase C: Despensa y Secos
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#059669', marginBottom: '0.3rem' }}>
                                                SLA de Frescura: 30 a 45 días
                                            </div>
                                            <p style={{ fontSize: '0.78rem', color: '#475569', margin: 0, lineHeight: '1.5' }}>
                                                <strong>Familias:</strong> Abarrotes, granos secos, aceites por litro, procesados y pulpas congeladas.<br />
                                                <strong>Dinámica:</strong> Precios contractuales o de lista industrial. Las señales históricas mantienen validez durante semanas.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Status Legend Bar */}
                                    <div style={{ backgroundColor: 'white', padding: '0.9rem 1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#334155' }}>
                                            Estados del Ciclo de Vida:
                                        </div>
                                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#15803D', fontWeight: '700' }}>
                                                <CheckCircle2 size={13} color="#15803D" /> VIGENTE: Costo seguro y amparado por el SLA
                                            </span>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#B45309', fontWeight: '700' }}>
                                                <Clock size={13} color="#B45309" /> POR VENCER: Últimas 24-48 horas de vigencia
                                            </span>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#B91C1C', fontWeight: '700' }}>
                                                <AlertTriangle size={13} color="#B91C1C" /> VENCIDO: Requiere cotización comercial urgente
                                            </span>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* MODULE 3: FILTRO DE DISPERSIÓN & NORMALIZACIÓN */}
                            {(trainingTab === 'all' || trainingTab === 'outliers') && (
                                <section style={{ backgroundColor: '#F8FAFC', borderRadius: '16px', padding: '1.5rem', border: '1px solid #E2E8F0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                                        <span style={{ backgroundColor: '#FEF3C7', color: '#92400E', fontWeight: '900', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px' }}>
                                            MÓDULO 3
                                        </span>
                                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#0F172A' }}>
                                            Filtro de Normalización de Unidades y Atenuación de Empaques Mayoristas
                                        </h3>
                                    </div>
                                    <p style={{ fontSize: '0.86rem', color: '#475569', lineHeight: '1.55', margin: '0 0 1.25rem 0' }}>
                                        Garantiza que todas las observaciones comparadas correspondan estrictamente a la <strong>misma unidad de medida</strong> (precio por kilogramo o litro), neutralizando compras atípicas sin vulnerar los registros contables.
                                    </p>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                                        {/* Why they exist & Why they aren't deleted */}
                                        <div style={{ backgroundColor: 'white', padding: '1.2rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.88rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <ShieldAlert size={16} color="#EA580C" /> Preservación de Trazabilidad Contable
                                            </div>
                                            <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0, lineHeight: '1.55' }}>
                                                En el historial de compras existen entradas correspondientes a <strong>empaques mayoristas completos o presentaciones cerradas</strong> (ej. facturas de $45.000, $80.000 o $95.000) que se ingresaron como monto global en vez de dividirse por los kilos netos.<br /><br />
                                                <strong>Regla de Oro:</strong> Estos registros <u>NUNCA se borran</u> de la base de datos, ya que son el soporte contable y tributario de los egresos pagados a proveedores en bodega.
                                            </p>
                                        </div>

                                        {/* How the algorithm filters and attenuates */}
                                        <div style={{ backgroundColor: 'white', padding: '1.2rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.88rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Filter size={16} color="#2563EB" /> Detección Estadística & Atenuación Visual
                                            </div>
                                            <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0, lineHeight: '1.55' }}>
                                                El motor calcula la mediana de precios unitarios del producto. Cualquier compra que supere <strong>3.5 veces la mediana</strong> es aislada automáticamente por discrepancia de escala.<br /><br />
                                                En la tabla de la matriz, estas compras se muestran <strong>visualmente atenuadas</strong> (opacidad reducida al 45%, número tachado y etiqueta <em>Atípico</em>), confirmando al operador que no intervienen en el cálculo del costo sugerido por kilogramo.
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* MODULE 4: MOTOR ADAPTATIVO FRUFRESCO */}
                            {(trainingTab === 'all' || trainingTab === 'adaptive') && (
                                <section style={{ backgroundColor: '#F8FAFC', borderRadius: '16px', padding: '1.5rem', border: '1px solid #E2E8F0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                                        <span style={{ backgroundColor: '#DBEAFE', color: '#1E40AF', fontWeight: '900', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px' }}>
                                            MÓDULO 4
                                        </span>
                                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#0F172A' }}>
                                            Motor Adaptativo FruFresco: Ponderación por Volumen, Merma Real y Alisamiento de Abastos
                                        </h3>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: '1.5rem', alignItems: 'center' }}>
                                        <div>
                                            <p style={{ fontSize: '0.86rem', color: '#475569', lineHeight: '1.55', margin: '0 0 1rem 0' }}>
                                                Diseñado específicamente para la dinámica de <strong>Corabastos</strong> y el abastecimiento perecedero bajo el mandato de <strong>"no perder pesos ni clientes"</strong>:
                                            </p>
                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.82rem', color: '#334155' }}>
                                                 <div style={{ backgroundColor: 'white', padding: '0.8rem 1rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                                         <Layers size={14} color="#2563EB" />
                                                         <strong style={{ color: '#0F172A' }}>1. Doble Fuente de Entrada & Volumen (VWAP):</strong>
                                                     </div>
                                                     Se alimenta de las compras reales con remisión y kilos físicos de <code>/ops/compras</code> y de sondeos tácticos de plaza. Las compras de gran volumen tienen mayor inercia y evitan que una compra marginal pequeña a precio elevado distorsione el costo de todo el lote.
                                                 </div>
                                                 <div style={{ backgroundColor: 'white', padding: '0.8rem 1rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                                         <Leaf size={14} color="#166534" />
                                                         <strong style={{ color: '#0F172A' }}>2. Factor Merma Operativa Real:</strong>
                                                     </div>
                                                     Integra directamente los registros de pesaje (Col P), fruta averiada (Col Q) y descapote/limpieza (Col R) del Kardex diario de inventario. Convierte el costo bruto de compra en <em>Costo Neto por Kilo Aprovechable</em>, protegiendo el margen comercial para que no se pierda en el descarte físico.
                                                 </div>
                                                 <div style={{ backgroundColor: 'white', padding: '0.8rem 1rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                                         <TrendingUp size={14} color="#D97706" />
                                                         <strong style={{ color: '#0F172A' }}>3. Amortiguador Asimétrico de Choque:</strong>
                                                     </div>
                                                     Ante un bache logístico o lluvia de un solo día, amortigua la subida (35% de absorción) para no trasladar volatilidad errática a los clientes. Ante escasez estacional sostenida, acelera la captación (78% de adaptación) para no rezagarse vendiendo por debajo del costo de reposición.
                                                 </div>
                                                 <div style={{ backgroundColor: 'white', padding: '0.8rem 1rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                                         <ShieldAlert size={14} color="#4F46E5" />
                                                         <strong style={{ color: '#0F172A' }}>4. Regla Infranqueable de Contención:</strong>
                                                     </div>
                                                     El costo base calculado queda formalmente acotado entre el mínimo y el máximo de las cotizaciones y compras reales. <em>Nunca proyecta costos especulativos por encima de lo realmente pagado o cotizado.</em>
                                                 </div>
                                             </div>
                                         </div>

                                         {/* SVG Graphical Representation Card */}
                                         <div style={{ backgroundColor: 'white', padding: '1.25rem', borderRadius: '16px', border: '1px solid #CBD5E1', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                             <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#1E293B', marginBottom: '0.75rem', textAlign: 'center' }}>
                                                 Alisamiento Adaptativo FruFresco vs. Serrucho de Plaza
                                             </div>
                                             <div style={{ width: '100%', height: '130px' }}>
                                                 <svg width="100%" height="100%" viewBox="0 0 100 50">
                                                     <line x1="0" y1="42" x2="100" y2="42" stroke="#F1F5F9" strokeWidth="0.8" />
                                                     <line x1="0" y1="25" x2="100" y2="25" stroke="#F1F5F9" strokeWidth="0.8" strokeDasharray="1" />
                                                     {/* Jagged Raw Market Line */}
                                                     <path d="M 0 38 L 15 36 L 30 14 L 45 39 L 60 28 L 75 18 L 88 15 L 98 22" fill="none" stroke="#CBD5E1" strokeWidth="1.4" strokeDasharray="2" />
                                                     {/* Smooth Adaptive Bezier */}
                                                     <path d="M 0 38 Q 20 36, 30 29 Q 40 34, 50 33 Q 65 24, 75 19 Q 88 17, 98 20" fill="none" stroke="#0D7A57" strokeWidth="3" />
                                                     <circle cx="98" cy="20" r="3.5" fill="#0D7A57" />
                                                     <circle cx="98" cy="20" r="1.5" fill="white" />
                                                 </svg>
                                             </div>
                                             <div style={{ display: 'flex', justifyContent: 'center', gap: '1.2rem', marginTop: '0.5rem', fontSize: '0.72rem', fontWeight: '700' }}>
                                                 <span style={{ color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                     <span style={{ width: '12px', height: '0px', borderBottom: '2px dashed #94A3B8' }}></span> Serrucho Abastos
                                                 </span>
                                                 <span style={{ color: '#0D7A57', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                     <span style={{ width: '12px', height: '3px', backgroundColor: '#0D7A57', borderRadius: '2px' }}></span> Costo Alisado Protegido
                                                 </span>
                                             </div>
                                             <p style={{ margin: '0.6rem 0 0 0', fontSize: '0.72rem', color: '#64748B', textAlign: 'center', fontStyle: 'italic' }}>
                                                 "Absorbe picos de un solo día y acelera ante escasez estacional confirmada."
                                             </p>
                                         </div>
                                     </div>

                                     {/* Interactive Cause-and-Effect Simulator */}
                                     <div style={{ marginTop: '1.5rem', backgroundColor: 'white', padding: '1.25rem', borderRadius: '14px', border: '1px solid #CBD5E1' }}>
                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                                             <Sliders size={16} color={THEME.colors.primary} />
                                             <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '900', color: '#0F172A' }}>
                                                 Simulador de Causa y Efecto: "¿Qué pasa si cotizas o compras a otro precio?"
                                             </h4>
                                             <span style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', fontSize: '0.68rem', fontWeight: '800', padding: '2px 6px', borderRadius: '4px' }}>
                                                 Herramienta Práctica de Capacitación
                                             </span>
                                         </div>
                                         <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 1rem 0', lineHeight: '1.4' }}>
                                             Prueba en tiempo real cómo respondería el Motor Adaptativo ante una cotización simulada en Corabastos. Observa cómo el algoritmo amortigua los picos y calcula el costo neto con merma.
                                         </p>

                                         {/* Simulator Input Controls */}
                                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                                             <div>
                                                 <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '800', color: '#334155', marginBottom: '4px' }}>
                                                     Precio Hipotético en Plaza (COP/Kg):
                                                 </label>
                                                 <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                     <span style={{ position: 'absolute', left: '10px', fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>$</span>
                                                     <input
                                                         type="number"
                                                         value={simulatedPrice}
                                                         placeholder="Ej. 12500"
                                                         onChange={e => setSimulatedPrice(e.target.value)}
                                                         style={{
                                                             width: '100%',
                                                             padding: '6px 8px 6px 24px',
                                                             borderRadius: '8px',
                                                             border: '1px solid #CBD5E1',
                                                             fontSize: '0.85rem',
                                                             fontWeight: '700',
                                                             color: '#0F172A',
                                                             outline: 'none'
                                                         }}
                                                     />
                                                 </div>
                                             </div>

                                             <div>
                                                 <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '800', color: '#334155', marginBottom: '4px' }}>
                                                     Volumen de la Operación: <strong>{simulatedVolume} Kg</strong>
                                                 </label>
                                                 <input
                                                     type="range"
                                                     min="10"
                                                     max="500"
                                                     step="10"
                                                     value={simulatedVolume}
                                                     onChange={e => setSimulatedVolume(Number(e.target.value))}
                                                     style={{ width: '100%', accentColor: THEME.colors.primary }}
                                                 />
                                                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#94A3B8' }}>
                                                     <span>10 Kg (Sondeo)</span>
                                                     <span>500 Kg (Bultos)</span>
                                                 </div>
                                             </div>

                                             <div>
                                                 <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '800', color: '#334155', marginBottom: '4px' }}>
                                                     Merma Estimada de Bodega: <strong>{simulatedShrinkage}%</strong>
                                                 </label>
                                                 <input
                                                     type="range"
                                                     min="0"
                                                     max="30"
                                                     step="1"
                                                     value={simulatedShrinkage}
                                                     onChange={e => setSimulatedShrinkage(Number(e.target.value))}
                                                     style={{ width: '100%', accentColor: THEME.colors.primary }}
                                                 />
                                                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#94A3B8' }}>
                                                     <span>0% (Sin descarte)</span>
                                                     <span>30% (Alta merma)</span>
                                                 </div>
                                             </div>
                                         </div>

                                         {/* Simulation Output Cards */}
                                         {(() => {
                                             const activeProduct = selectedProductForModal || (products.length > 0 ? products[0] : null);
                                             const history = activeProduct ? (purchaseHistory[activeProduct.id] || []) : [];
                                             const baseObservations: PriceObservation[] = history.map(h => ({
                                                 price: h.normalized_price,
                                                 date: h.created_at,
                                                 quantity: h.quantity || null
                                             }));

                                             const fallbackPrice = baseObservations.length > 0 ? baseObservations[baseObservations.length - 1].price : 10000;
                                             const numPrice = Number(simulatedPrice) > 0 ? Number(simulatedPrice) : Math.round(fallbackPrice * 1.15);
                                             const simObs: PriceObservation[] = [
                                                 ...baseObservations,
                                                 { price: numPrice, date: new Date().toISOString(), quantity: simulatedVolume }
                                             ];

                                             const simResult = runAdaptivePricingModel(simObs, numPrice, { shrinkagePct: simulatedShrinkage });
                                             const lastRealPrice = baseObservations.length > 0 ? baseObservations[baseObservations.length - 1].price : numPrice;
                                             const diffPrice = numPrice - lastRealPrice;
                                             const diffPct = lastRealPrice > 0 ? Number(((diffPrice / lastRealPrice) * 100).toFixed(1)) : 0;
                                             const b2bSuggestedPrice = Math.round((simResult.cost * 1.25) / 50) * 50;

                                             return (
                                                 <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                                         <div style={{ backgroundColor: 'white', padding: '0.75rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                             <div style={{ fontSize: '0.68rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                                                                 Precio Simulado
                                                             </div>
                                                             <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0F172A', marginTop: '2px' }}>
                                                                 ${formatNumber(numPrice)} / Kg
                                                             </div>
                                                             <div style={{ fontSize: '0.7rem', color: diffPct > 0 ? '#B45309' : diffPct < 0 ? '#047857' : '#64748B', fontWeight: '700' }}>
                                                                 {diffPct > 0 ? `▲ +${diffPct}% frente a base` : diffPct < 0 ? `▼ ${diffPct}% frente a base` : 'Mismo nivel'}
                                                             </div>
                                                         </div>

                                                         <div style={{ backgroundColor: 'white', padding: '0.75rem', borderRadius: '8px', border: '1px solid #DCFCE7' }}>
                                                             <div style={{ fontSize: '0.68rem', fontWeight: '800', color: '#166534', textTransform: 'uppercase' }}>
                                                                 Costo Base Alisado
                                                             </div>
                                                             <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#166534', marginTop: '2px' }}>
                                                                 ${formatNumber(simResult.grossCost)} / Kg
                                                             </div>
                                                             <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: '700' }}>
                                                                 {simResult.grossCost < numPrice 
                                                                     ? `Absorbe -$${formatNumber(numPrice - simResult.grossCost)} del alza` 
                                                                     : 'Alineado al mercado'}
                                                             </div>
                                                         </div>

                                                         <div style={{ backgroundColor: 'white', padding: '0.75rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                             <div style={{ fontSize: '0.68rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                                                                 Costo Neto con Merma
                                                             </div>
                                                             <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0F172A', marginTop: '2px' }}>
                                                                 ${formatNumber(simResult.cost)} / Kg
                                                             </div>
                                                             <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '600' }}>
                                                                 Incluye {simulatedShrinkage}% de merma
                                                             </div>
                                                         </div>

                                                         <div style={{ backgroundColor: 'white', padding: '0.75rem', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                                                             <div style={{ fontSize: '0.68rem', fontWeight: '800', color: '#1D4ED8', textTransform: 'uppercase' }}>
                                                                 Tarifa B2B (Margen 25%)
                                                             </div>
                                                             <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#1D4ED8', marginTop: '2px' }}>
                                                                 ${formatNumber(b2bSuggestedPrice)} / Kg
                                                             </div>
                                                             <div style={{ fontSize: '0.7rem', color: '#2563EB', fontWeight: '600' }}>
                                                                 Rentabilidad bruta protegida
                                                             </div>
                                                         </div>
                                                     </div>

                                                     {/* Pedagogical Commentary */}
                                                     <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: '1.45', backgroundColor: 'white', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                         <strong>Lección Operativa:</strong> {diffPct > 15 ? (
                                                             `Al registrar una cotización con incremento de +${diffPct}%, el algoritmo no traslada los $${formatNumber(numPrice)} directamente al catálogo. En su lugar, sitúa el costo base en $${formatNumber(simResult.grossCost)}, amortiguando el impacto inicial para no desestabilizar a los clientes institucionales mientras confirma si la escasez persiste en las siguientes compras.`
                                                         ) : diffPct < -15 ? (
                                                             `Ante una caída abrupta del ${diffPct}%, el motor desciende de forma gradual a $${formatNumber(simResult.grossCost)}, permitiendo agotar el inventario remanente en bodega sin quemar el margen de los lotes adquiridos previamente.`
                                                         ) : (
                                                             `Variación moderada dentro del rango de tolerancia habitual. El motor actualiza el costo base a $${formatNumber(simResult.grossCost)} conservando la proporción óptima entre competitividad y rentabilidad.`
                                                         )}
                                                     </div>
                                                 </div>
                                             );
                                         })()}
                                     </div>
                                 </section>
                             )}

                             {/* MODULE 5: PLAYBOOK OPERATIVO EN 3 PASOS */}
                             {(trainingTab === 'all' || trainingTab === 'playbook') && (
                                 <section style={{ backgroundColor: '#F8FAFC', borderRadius: '16px', padding: '1.5rem', border: '1px solid #E2E8F0' }}>
                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                                         <span style={{ backgroundColor: '#FEE2E2', color: '#991B1B', fontWeight: '900', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px' }}>
                                             MÓDULO 5
                                         </span>
                                         <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#0F172A' }}>
                                             Playbook Operativo: Protocolo de Cotización en 3 Pasos
                                         </h3>
                                     </div>
                                     <p style={{ fontSize: '0.86rem', color: '#475569', lineHeight: '1.55', margin: '0 0 1.25rem 0' }}>
                                         Procedimiento operativo diario que todo negociador comercial debe ejecutar para mantener el catálogo actualizado y proteger la rentabilidad de los pedidos:
                                     </p>

                                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                                         {/* Step 1 */}
                                         <div style={{ backgroundColor: 'white', padding: '1.2rem', borderRadius: '12px', border: '1px solid #E2E8F0', position: 'relative' }}>
                                             <div style={{ width: '34px', height: '34px', backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.6rem' }}>
                                                 <AlertTriangle size={18} color="#B91C1C" />
                                             </div>
                                             <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                                                 1. Monitorear Alertas de Vigencia
                                             </div>
                                             <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0, lineHeight: '1.5' }}>
                                                 Al iniciar la jornada o planear una cotización B2B, revisar los productos marcados con badge <strong>VENCIDO</strong> o <strong>POR VENCER</strong> en la matriz.
                                             </p>
                                         </div>

                                         {/* Step 2 */}
                                         <div style={{ backgroundColor: 'white', padding: '1.2rem', borderRadius: '12px', border: '1px solid #E2E8F0', position: 'relative' }}>
                                             <div style={{ width: '34px', height: '34px', backgroundColor: '#DCFCE7', color: '#166534', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.6rem' }}>
                                                 <Pencil size={18} color="#166534" />
                                             </div>
                                             <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                                                 2. Capturar en Columna ÚLTIMA
                                             </div>
                                             <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0, lineHeight: '1.5' }}>
                                                 Presionar el botón <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 6px', backgroundColor: '#DCFCE7', border: '1px solid #A7F3D0', borderRadius: '5px', fontSize: '0.74rem', fontWeight: '800', color: '#166534' }}><Pencil size={10} /> Cotizar</span> en la columna <strong>ÚLTIMA</strong> del producto. Digitar el precio sondeado por kilogramo verificado en Corabastos o con el proveedor, junto con una breve nota explicativa.
                                             </p>
                                         </div>

                                         {/* Step 3 */}
                                         <div style={{ backgroundColor: 'white', padding: '1.2rem', borderRadius: '12px', border: '1px solid #E2E8F0', position: 'relative' }}>
                                             <div style={{ width: '34px', height: '34px', backgroundColor: '#EFF6FF', color: '#1D4ED8', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.6rem' }}>
                                                 <RefreshCw size={18} color="#1D4ED8" />
                                             </div>
                                             <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                                                 3. Propagación Automática
                                             </div>
                                             <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0, lineHeight: '1.5' }}>
                                                 El sistema recalcula de forma instantánea el <strong>COSTO BASE FRUFRESCO</strong> con el Motor Adaptativo y sincroniza las listas de precios activas sin necesidad de recalcular tablas en Excel.
                                             </p>
                                         </div>
                                     </div>
                                 </section>
                             )}

                        </div>

                        {/* Modal Footer */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem', borderTop: '1px solid #E2E8F0', paddingTop: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <CheckCircle2 size={14} color="#10B981" />
                                <span>Capacitación Comercial • FruFresco Operaciones y Pricing</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsSmartModalOpen(false);
                                        setSelectedProductForModal(null);
                                    }}
                                    style={{
                                        padding: '0.75rem 2rem',
                                        backgroundColor: THEME.colors.primary,
                                        color: 'white',
                                        borderRadius: '10px',
                                        border: 'none',
                                        fontWeight: '800',
                                        fontSize: '0.9rem',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 12px rgba(22, 101, 52, 0.2)',
                                        transition: 'all 0.2s ease',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <Check size={16} /> Entendido, ir a la Matriz
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
