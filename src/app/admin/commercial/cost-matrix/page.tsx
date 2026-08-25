'use client';

import { useState, useEffect, Fragment, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, X, Info, Brain, Cpu, Leaf, Sun, TrendingUp, TrendingDown, Clock, ShieldAlert, BarChart3, ChevronRight, CheckCircle2, RefreshCw, FileSpreadsheet, Download, AlertTriangle, FileText } from 'lucide-react';
import { logError } from '@/lib/errorUtils';
import Link from 'next/link';
import { CATEGORY_MAP } from '@/lib/constants';
import * as XLSX from 'xlsx';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { THEME } from '@/lib/adminTheme';

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

const formatNumberWithDots = (val: number) => {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

function StatCard({ label, value, subValue, trend, color, bg = 'white', icon }: any) {
    return (
        <div style={{ 
            backgroundColor: bg, 
            padding: '0.6rem 1rem', 
            borderRadius: '16px', 
            border: '1px solid #E2E8F0', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.2rem', 
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', 
            transition: 'all 0.3s ease',
            position: 'relative',
            overflow: 'hidden'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.05)';
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.02)';
        }}>
            <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.05, transform: 'scale(3)', color: color }}>
                {icon}
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: '900', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                <span style={{ fontSize: '1.4rem', fontWeight: '900', color: color, letterSpacing: '-0.03em' }}>
                    {trend === 'up' && '▲ '}{trend === 'down' && '▼ '}{value}
                </span>
                {subValue && <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94A3B8' }}>{subValue}</span>}
            </div>
        </div>
    );
}

function ManualCostInput({ productId, onSave, savingId, currentManual, cellState }: any) {
    const [val, setVal] = useState(currentManual ? String(currentManual) : '');
    const labelColor = cellState?.labelColor || '#9CA3AF';
    const borderVal = cellState?.border || '1px solid #D1D5DB';
    const textVal = cellState?.text || '#1E40AF';
    const bgVal = cellState?.bg || '#F8FAFC';
    const badgeVal = cellState?.badge || 'Sin Referencia';
    
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                <input 
                    type="number"
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    placeholder="$$$"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && val) {
                            e.stopPropagation();
                            onSave(productId, val);
                        }
                    }}
                    style={{
                        width: '95px',
                        padding: '0.4rem 0.2rem',
                        borderRadius: '8px',
                        border: savingId === productId ? '2px solid #10B981' : `2px solid ${labelColor}`,
                        textAlign: 'center',
                        fontSize: '0.9rem',
                        fontWeight: '800',
                        color: textVal,
                        outline: 'none',
                        backgroundColor: savingId === productId ? '#F0FDF4' : 'white',
                        transition: 'all 0.3s ease'
                    }}
                />
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (val) onSave(productId, val);
                    }}
                    disabled={!val}
                    title="Aprobar Costo"
                    style={{
                        padding: '0.4rem',
                        width: '32px',
                        height: '32px',
                        backgroundColor: val ? labelColor : '#E2E8F0',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: val ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        boxShadow: val ? `0 4px 6px ${labelColor}20` : 'none'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
            </div>
            <span style={{ 
                fontSize: '0.6rem', 
                color: savingId === productId ? '#10B981' : labelColor, 
                fontWeight: '900', 
                textTransform: 'uppercase', 
                textAlign: 'center',
                backgroundColor: savingId === productId ? '#DCFCE7' : `${labelColor}15`,
                padding: '2px 8px',
                borderRadius: '6px',
                display: 'inline-block'
            }}>
                {savingId === productId ? '✓ Guardado' : badgeVal}
            </span>
        </div>
    );
}

export default function CostMatrixPage() {
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [purchaseHistory, setPurchaseHistory] = useState<Record<string, Purchase[]>>({}); // { productId: [purchases] }
    const [manualOverrides, setManualOverrides] = useState<Record<string, any>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Todas');
    const [savingId, setSavingId] = useState<string | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [isSmartModalOpen, setIsSmartModalOpen] = useState(false);
    const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
    const [batchProgress, setBatchProgress] = useState(0);
    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState('');
    const [importSuccess, setImportSuccess] = useState('');
    const [importFile, setImportFile] = useState<File | null>(null);

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

            if (prodErr) {
                console.error('❌ Error en consulta products:', prodErr);
                throw prodErr;
            }
            setProducts(prods || []);

            const { data: hist, error: histErr } = await supabase
                .from('purchase_history_normalized')
                .select('*')
                .setHeader('Cache-Control', 'no-store')
                .order('created_at', { ascending: false })
                .limit(20000);

            if (histErr) {
                console.error('❌ Error en consulta purchase_history_normalized:', histErr);
                throw histErr;
            }
            
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

            if (manualErr) {
                console.error('❌ Error en consulta commercial_cost_matrix:', manualErr);
                throw manualErr;
            }
            
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
        if (!confirm('¿Deseas autorizar todos los costos sugeridos por la IA Delta?')) return;
        
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
        
        const daysSinceLast = differenceInDays(new Date(), new Date(latest.created_at));
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

        if (hist[0] && manual?.updated_at) {
            const histDate = new Date(hist[0].created_at);
            const manualDate = new Date(manual.updated_at);
            if (histDate >= manualDate) {
                latestSignalDate = histDate;
                signalSource = 'COMPRAS';
                currentCost = hist[0].normalized_price;
            } else {
                latestSignalDate = manualDate;
                signalSource = 'MANUAL';
                currentCost = manual.manual_cost;
            }
        } else if (hist[0]) {
            latestSignalDate = new Date(hist[0].created_at);
            signalSource = 'COMPRAS';
            currentCost = hist[0].normalized_price;
        } else if (manual?.updated_at) {
            latestSignalDate = new Date(manual.updated_at);
            signalSource = 'MANUAL';
            currentCost = manual.manual_cost;
        } else if (manual?.manual_cost) {
            currentCost = manual.manual_cost;
        }

        if (!latestSignalDate || currentCost === null || currentCost <= 0) {
            return {
                daysOld: 999,
                status: 'SIN_REFERENCIA' as const,
                statusLabel: '❌ Sin Referencia',
                statusColor: '#DC2626',
                statusBg: '#FEF2F2',
                sourceLabel: 'Sin Registro',
                signalDateFormatted: 'N/A',
                isExpired: true,
                isDueSoon: false,
                currentCost: currentCost || 0
            };
        }

        const daysOld = differenceInDays(new Date(), latestSignalDate);
        
        if (daysOld <= 7) {
            return {
                daysOld,
                status: 'VIGENTE' as const,
                statusLabel: `🟢 Vigente (${daysOld}d)`,
                statusColor: '#059669',
                statusBg: '#ECFDF5',
                sourceLabel: signalSource === 'COMPRAS' ? 'Orden Compra' : 'Carga Manual',
                signalDateFormatted: format(latestSignalDate, 'yyyy-MM-dd'),
                isExpired: false,
                isDueSoon: false,
                currentCost
            };
        } else if (daysOld <= 14) {
            return {
                daysOld,
                status: 'POR_VENCER' as const,
                statusLabel: `🟡 Por Vencer (${daysOld}d)`,
                statusColor: '#D97706',
                statusBg: '#FFFBEB',
                sourceLabel: signalSource === 'COMPRAS' ? 'Orden Compra' : 'Carga Manual',
                signalDateFormatted: format(latestSignalDate, 'yyyy-MM-dd'),
                isExpired: false,
                isDueSoon: true,
                currentCost
            };
        } else {
            return {
                daysOld,
                status: 'VENCIDO' as const,
                statusLabel: `🔴 Vencido (${daysOld}d)`,
                statusColor: '#DC2626',
                statusBg: '#FEF2F2',
                sourceLabel: signalSource === 'COMPRAS' ? 'Orden Compra' : 'Carga Manual',
                signalDateFormatted: format(latestSignalDate, 'yyyy-MM-dd'),
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
                    text: '#991B1B',
                    border: '1px solid #FCA5A5',
                    badge: '❌ Sin Referencia',
                    labelColor: '#EF4444'
                };
            } else {
                return {
                    bg: '#FFFBEB',
                    text: '#B45309',
                    border: '1px solid #FCD34D',
                    badge: '⏳ Por Autorizar',
                    labelColor: '#F59E0B'
                };
            }
        }
        
        if (lifecycle.isExpired) {
            return {
                bg: '#FEF3C7',
                text: '#92400E',
                border: '1px solid #F59E0B',
                badge: `⚠️ Desactualizado (+${lifecycle.daysOld}d)`,
                labelColor: '#D97706'
            };
        }
        
        const isAligned = smart > 0 && Math.abs(manual.manual_cost - smart) < 1;
        if (isAligned) {
            return {
                bg: '#E8F5E9',
                text: '#2E7D32',
                border: '1px solid #81C784',
                badge: '✅ Autorizado (IA)',
                labelColor: '#4CAF50'
            };
        }
        
        return {
            bg: '#E3F2FD',
            text: '#1565C0',
            border: '1px solid #64B5F6',
            badge: `✍️ Manual Vigente (${lifecycle.daysOld}d)`,
            labelColor: '#2196F3'
        };
    };

    const handleExport = () => {
        const data = filteredProducts.map(p => {
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
                'Fecha Última Compra': hist[0] ? format(new Date(hist[0].created_at), 'yyyy-MM-dd') : 'N/A',
                'Días Antigüedad Costo': lifecycle.daysOld === 999 ? 'N/A' : lifecycle.daysOld,
                'Estado Ciclo de Vida': lifecycle.statusLabel,
                'Origen Señal': lifecycle.sourceLabel
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Matriz de Costos");
        XLSX.writeFile(wb, `Frufresco_CostMatrix_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    };

    // Plantilla 1: Catálogo Completo
    const handleExportTemplateAll = () => {
        const data = products.map(p => {
            const currentManual = manualOverrides[p.id]?.manual_cost || 0;
            const lifecycle = getProductCostLifecycle(p.id);
            return {
                'accounting_id': p.accounting_id || '',
                'SKU': p.sku || '',
                'Producto': p.name || '',
                'Categoría': CATEGORY_MAP[p.category] || p.category || '',
                'Unidad': p.unit_of_measure || '',
                'Costo Actual': currentManual ? Math.round(currentManual) : (lifecycle.currentCost ? Math.round(lifecycle.currentCost) : 0),
                'Nuevo Costo': '',
                'Días Antigüedad': lifecycle.daysOld === 999 ? 'N/A' : lifecycle.daysOld,
                'Estado Ciclo de Vida': lifecycle.statusLabel,
                'Origen Señal': lifecycle.sourceLabel,
                'Fecha Señal': lifecycle.signalDateFormatted
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Catalogo_Completo");
        XLSX.writeFile(wb, `Plantilla_Costos_Completa_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    };

    // Plantilla 2: Costos Vencidos / Por Vencer (Foco Lean Kanban)
    const handleExportTemplateDue = () => {
        const dueProducts = products.filter(p => {
            const lifecycle = getProductCostLifecycle(p.id);
            return lifecycle.isExpired || lifecycle.isDueSoon || lifecycle.status === 'SIN_REFERENCIA';
        });

        const data = dueProducts.map(p => {
            const currentManual = manualOverrides[p.id]?.manual_cost || 0;
            const lifecycle = getProductCostLifecycle(p.id);
            return {
                'accounting_id': p.accounting_id || '',
                'SKU': p.sku || '',
                'Producto': p.name || '',
                'Categoría': CATEGORY_MAP[p.category] || p.category || '',
                'Unidad': p.unit_of_measure || '',
                'Costo Actual': currentManual ? Math.round(currentManual) : (lifecycle.currentCost ? Math.round(lifecycle.currentCost) : 0),
                'Nuevo Costo': '',
                'Días Antigüedad': lifecycle.daysOld === 999 ? 'Sin Referencia' : lifecycle.daysOld,
                'Estado Ciclo de Vida': lifecycle.statusLabel,
                'Acción Requerida': lifecycle.status === 'SIN_REFERENCIA' ? 'Cotizar Urgente' : (lifecycle.isExpired ? 'Recotizar Inmediato' : 'Actualizar Próximo')
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Costos_Vencidos_Por_Vencer");
        XLSX.writeFile(wb, `Plantilla_Costos_Vencidos_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    };

    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportFile(file);
        setImportError('');
        setImportSuccess('');
    };

    const processImport = async () => {
        if (!importFile) {
            setImportError('Por favor selecciona un archivo Excel.');
            return;
        }
        setImporting(true);
        setImportError('');
        setImportSuccess('');
        try {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const bstr = evt.target?.result;
                    const wb = XLSX.read(bstr, { type: 'binary' });
                    const wsname = wb.SheetNames[0];
                    const ws = wb.Sheets[wsname];
                    const rawData = XLSX.utils.sheet_to_json(ws);
                    
                    if (!rawData || rawData.length === 0) {
                        throw new Error('El archivo Excel está vacío o no contiene filas de datos.');
                    }
                    
                    // Lookups rápidos por accounting_id, SKU y nombre normalizado
                    const byAccId: Record<number, Product> = {};
                    const bySku: Record<string, Product> = {};
                    const byName: Record<string, Product> = {};

                    products.forEach(p => {
                        if (p.accounting_id !== undefined && p.accounting_id !== null && !isNaN(Number(p.accounting_id))) {
                            byAccId[Number(p.accounting_id)] = p;
                        }
                        if (p.sku) {
                            bySku[p.sku.trim().toUpperCase()] = p;
                        }
                        if (p.name) {
                            byName[p.name.trim().toLowerCase()] = p;
                        }
                    });

                    // Helper para sanitizar y extraer números reales de Excel ("$ 15.000", "15.000", "15000,50", " 15000 ")
                    const parseCleanCost = (raw: any): number | null => {
                        if (raw === undefined || raw === null) return null;
                        if (typeof raw === 'number') {
                            return isNaN(raw) || raw <= 0 ? null : raw;
                        }
                        let str = String(raw).trim();
                        if (!str || str === '' || str === 'N/A' || str === '-' || str.toLowerCase() === 'sin registro' || str.toLowerCase() === 'n/d') return null;
                        
                        // Remover signos de moneda, COP y espacios
                        str = str.replace(/[\$\sCOPcop]/g, '');
                        
                        // Formato de miles colombiano ej: "15.000" o "1.500.000"
                        if (/^\d{1,3}(\.\d{3})+(\,\d+)?$/.test(str)) {
                            str = str.replace(/\./g, '').replace(',', '.');
                        } else if (/^\d+(\,\d+)$/.test(str)) {
                            // "1500,50" -> "1500.50"
                            str = str.replace(',', '.');
                        } else {
                            // Remoción general de comas
                            str = str.replace(/,/g, '');
                        }

                        const num = parseFloat(str);
                        return isNaN(num) || num <= 0 ? null : num;
                    };

                    const upsertData: any[] = [];
                    let processedCount = 0;
                    const nowIso = new Date().toISOString();

                    for (const row of rawData as any[]) {
                        const keys = Object.keys(row);
                        const findVal = (...aliases: string[]) => {
                            for (const a of aliases) {
                                const exactKey = keys.find(k => k.trim().toLowerCase() === a.toLowerCase());
                                if (exactKey !== undefined && row[exactKey] !== undefined && row[exactKey] !== null && row[exactKey] !== '') {
                                    return row[exactKey];
                                }
                            }
                            return null;
                        };

                        const accIdRaw = findVal('accounting_id', 'id erp', 'id_erp', 'codigo_contable', 'código contable', 'codigo contable', 'id contable', 'codigo');
                        const skuRaw = findVal('sku', 'codigo_sku', 'código_sku', 'item_code', 'referencia');
                        const nameRaw = findVal('producto', 'nombre', 'name', 'product_name', 'descripcion', 'artículo', 'articulo');
                        
                        let matchedProduct: Product | undefined;
                        if (accIdRaw !== null) {
                            const accNum = parseInt(String(accIdRaw).replace(/\D/g, ''));
                            if (!isNaN(accNum) && byAccId[accNum]) {
                                matchedProduct = byAccId[accNum];
                            }
                        }
                        if (!matchedProduct && skuRaw !== null) {
                            const cleanSku = String(skuRaw).trim().toUpperCase();
                            if (bySku[cleanSku]) matchedProduct = bySku[cleanSku];
                        }
                        if (!matchedProduct && nameRaw !== null) {
                            const cleanName = String(nameRaw).trim().toLowerCase();
                            if (byName[cleanName]) matchedProduct = byName[cleanName];
                        }

                        if (!matchedProduct) continue;

                        // Buscar costo con prioridad en 'Nuevo Costo', fallback a 'Costo Actual' / 'Costo'
                        const newCostRaw = findVal('nuevo costo', 'nuevo_costo', 'costo nuevo', 'costo_nuevo', 'nuevo');
                        const currentCostRaw = findVal('costo actual', 'costo_actual', 'costo', 'costo manual', 'costo_manual', 'precio', 'cost');

                        let finalCost = parseCleanCost(newCostRaw);
                        if (finalCost === null) {
                            finalCost = parseCleanCost(currentCostRaw);
                        }

                        if (finalCost !== null && finalCost > 0) {
                            upsertData.push({
                                product_id: matchedProduct.id,
                                manual_cost: finalCost,
                                updated_at: nowIso, // Reinicia el ciclo de vida del costo a 0 días
                                updated_by: 'EXCEL-BULK-UPDATE',
                                is_active: true
                            });
                            processedCount++;
                        }
                    }
                    
                    if (upsertData.length === 0) {
                        throw new Error('No se encontraron registros válidos para actualizar. Asegúrate de que las filas incluyan el "accounting_id" (o Nombre de Producto) y un valor numérico de costo mayor a 0 (ej: 15000 o $ 15.000).');
                    }
                    
                    const batchSize = 50;
                    for (let i = 0; i < upsertData.length; i += batchSize) {
                        const batch = upsertData.slice(i, i + batchSize);
                        const { error } = await supabase
                            .from('commercial_cost_matrix')
                            .upsert(batch, { onConflict: 'product_id' });
                        
                        if (error) throw error;
                    }
                    
                    setImportSuccess(`¡Actualización masiva completada! Se actualizaron ${processedCount} productos con nueva fecha de vigencia (Ciclo de Vida reiniciado hoy).`);
                    await fetchData();
                    setImportFile(null);
                } catch (err: any) {
                    console.error('Error parsing excel:', err);
                    setImportError(err.message || 'Error al procesar el archivo Excel.');
                } finally {
                    setImporting(false);
                }
            };
            reader.readAsBinaryString(importFile);
        } catch (err: any) {
            console.error('Error reading file:', err);
            setImportError(err.message || 'Error al leer el archivo.');
            setImporting(false);
        }
    };

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const categories = Array.from(new Set(products.map(p => p.category))).sort();

    const filteredProducts = products.filter(p => {
        const matchesCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
        
        const searchParts = searchTerm.toLowerCase().split(',').map(s => s.trim()).filter(s => s);
        if (searchParts.length === 0) return matchesCategory;

        const matchesSearch = searchParts.some(part => {
            if (part.startsWith('@')) {
                const tag = part.slice(1);
                return p.unit_of_measure.toLowerCase().includes(tag) || p.category.toLowerCase().includes(tag);
            }
            return (
                p.name.toLowerCase().includes(part) || 
                p.sku?.toLowerCase().includes(part) ||
                p.keywords?.toLowerCase().includes(part)
            );
        });

        return matchesCategory && matchesSearch;
    });

    const effectiveCosts = products.reduce((acc, p) => {
        acc[p.id] = manualOverrides[p.id]?.manual_cost || calculateSmartCost(p.id);
        return acc;
    }, {} as Record<string, number>);

    const stats = {
        totalSKU: products.length,
        avgTrend: products.reduce((acc, p) => {
            const hist = purchaseHistory[p.id] || [];
            if (hist.length < 2) return acc;
            const trend = (hist[0].normalized_price - hist[1].normalized_price) / hist[1].normalized_price;
            return acc + trend;
        }, 0) / (products.length || 1) * 100,
        rising: products.filter(p => {
            const hist = purchaseHistory[p.id] || [];
            return hist.length >= 2 && hist[0].normalized_price > hist[1].normalized_price;
        }).length,
        falling: products.filter(p => {
            const hist = purchaseHistory[p.id] || [];
            return hist.length >= 2 && hist[0].normalized_price < hist[1].normalized_price;
        }).length,
        pendingCost: products.filter(p => getProductCostLifecycle(p.id).status === 'SIN_REFERENCIA').length,
        expiringSoon: products.filter(p => getProductCostLifecycle(p.id).isExpired || getProductCostLifecycle(p.id).isDueSoon).length,
        vigentes: products.filter(p => getProductCostLifecycle(p.id).status === 'VIGENTE').length
    };

    const getHarvestStatus = (productId: string) => {
        const hist = purchaseHistory[productId] || [];
        if (hist.length < 5) return 'neutral';
        
        const currentMonth = new Date().getMonth();
        const sameMonthHistory = hist.filter(h => new Date(h.created_at).getMonth() === currentMonth);
        
        if (sameMonthHistory.length > 1) {
            const avgHist = sameMonthHistory.reduce((a, b) => a + b.normalized_price, 0) / sameMonthHistory.length;
            if (hist[0].normalized_price < avgHist * 0.9) return 'harvest';
            if (hist[0].normalized_price > avgHist * 1.1) return 'risk';
        }
        return 'neutral';
    };

    const sortedProducts = [...filteredProducts].sort((a, b) => {
        if (!sortField) return 0;

        let valA: any, valB: any;

        if (sortField === 'name') {
            valA = a.name;
            valB = b.name;
        } else if (sortField === 'smartCost') {
            valA = effectiveCosts[a.id];
            valB = effectiveCosts[b.id];
        } else if (sortField === 'trend') {
            const hA = purchaseHistory[a.id] || [];
            const hB = purchaseHistory[b.id] || [];
            valA = hA.length >= 2 ? (hA[0].normalized_price - hA[1].normalized_price) / hA[1].normalized_price : 0;
            valB = hB.length >= 2 ? (hB[0].normalized_price - hB[1].normalized_price) / hB[1].normalized_price : 0;
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    const SortIcon = ({ field }: { field: string }) => {
        if (sortField !== field) return <ChevronRight size={14} style={{ opacity: 0.3, marginLeft: '4px' }} />;
        return sortOrder === 'asc' ? <TrendingUp size={14} style={{ marginLeft: '4px' }} /> : <TrendingDown size={14} style={{ marginLeft: '4px' }} />;
    };

    const Sparkline = ({ data }: { data: Purchase[] }) => {
        if (data.length < 2) return <div style={{ height: '30px' }} />;
        
        const prices = data.map(d => d.normalized_price).reverse();
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = max - min || 1;
        
        const points = prices.map((p, i) => {
            const x = (i / (prices.length - 1)) * 100;
            const y = 100 - ((p - min) / range) * 80 - 10;
            return `${x},${y}`;
        }).join(' ');

        const trend = (prices[prices.length - 1] - prices[0]) / prices[0];
        const color = trend > 0.05 ? '#EF4444' : trend < -0.05 ? '#10B981' : '#64748B';

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', justifyContent: 'center' }}>
                <svg width="60" height="30" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline
                        fill="none"
                        stroke={color}
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={points}
                    />
                </svg>
                <div style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: '900', 
                    color: color,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    minWidth: '45px'
                }}>
                    {trend > 0 ? '+' : ''}{(trend * 100).toFixed(0)}%
                </div>
            </div>
        );
    };

    return (
        <main style={{ padding: '1.2rem', backgroundColor: '#F8FAFC', minHeight: '100vh', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
                
                {/* --- HEADER LINE --- */}
                <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
                    <div>
                        <Link href="/admin/commercial" style={{ 
                            textDecoration: 'none', 
                            color: '#94A3B8', 
                            fontWeight: '700', 
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            marginBottom: '0.4rem',
                            transition: 'color 0.2s'
                        }} onMouseEnter={(e) => e.currentTarget.style.color = '#0EA5E9'} onMouseLeave={(e) => e.currentTarget.style.color = '#94A3B8'}>
                            ← Volver
                        </Link>
                        <h1 style={{ 
                            fontSize: '2rem', 
                            fontWeight: '900', 
                            color: '#0F172A', 
                            margin: 0, 
                            letterSpacing: '-0.02em', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.6rem',
                        }}>
                            Matriz Comercial <span style={{ color: '#0EA5E9', filter: 'drop-shadow(0 0 8px rgba(14, 165, 233, 0.2))' }}>Delta</span>
                        </h1>
                        <p style={{ color: '#64748B', margin: '0.2rem 0 0 0', fontSize: '0.95rem', fontWeight: '500' }}>
                            Inteligencia de precios para optimización de margen.
                        </p>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => handleAuthorizeAll()}
                            disabled={isAuthorizing}
                            style={{ 
                                padding: '0 1.2rem', 
                                height: '42px',
                                borderRadius: '12px', 
                                border: 'none', 
                                background: isAuthorizing ? '#64748B' : 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', 
                                color: 'white', 
                                fontWeight: '900', 
                                cursor: isAuthorizing ? 'not-allowed' : 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                fontSize: '0.85rem',
                                gap: '0.5rem',
                                justifyContent: 'center',
                                transition: 'all 0.2s',
                                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)'
                            }}
                            onMouseEnter={(e) => !isAuthorizing && (e.currentTarget.style.transform = 'translateY(-1px)')}
                            onMouseLeave={(e) => !isAuthorizing && (e.currentTarget.style.transform = 'translateY(0)')}
                        >
                            <Brain size={18} className={isAuthorizing ? 'animate-pulse' : ''} />
                            {isAuthorizing ? `AUTORIZANDO ${batchProgress}%` : 'AUTORIZACIÓN INTELIGENTE'}
                        </button>
                        
                        {/* Carga Masiva Segmented Container */}
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.4rem', 
                            backgroundColor: 'white', 
                            padding: '0.3rem 0.6rem', 
                            borderRadius: '12px', 
                            border: '1px solid #DDD6FE', 
                            height: '42px',
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)'
                        }}>
                            <span style={{ fontWeight: '950', fontSize: '0.65rem', color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '0.2rem' }}>Plantillas:</span>
                            
                            {/* Download full catalog template */}
                            <button 
                                onClick={handleExportTemplateAll}
                                title="Descargar Plantilla Catálogo Completo (.xlsx)"
                                style={{ 
                                    height: '32px',
                                    padding: '0 0.6rem',
                                    borderRadius: '8px', 
                                    border: 'none', 
                                    backgroundColor: '#EFF6FF', 
                                    color: '#1E40AF', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '4px',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#DBEAFE'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#EFF6FF'}
                            >
                                <Download size={14} /> Completa
                            </button>

                            {/* Download due / expired template */}
                            <button 
                                onClick={handleExportTemplateDue}
                                title="Descargar Plantilla solo SKUs Vencidos o Por Vencer (.xlsx)"
                                style={{ 
                                    height: '32px',
                                    padding: '0 0.6rem',
                                    borderRadius: '8px', 
                                    border: 'none', 
                                    backgroundColor: '#FEF3C7', 
                                    color: '#92400E', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '4px',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FDE68A'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FEF3C7'}
                            >
                                <Clock size={14} /> Vencidos ({stats.expiringSoon + stats.pendingCost})
                            </button>

                            {/* Upload file button */}
                            <button 
                                onClick={() => setIsImportModalOpen(true)}
                                title="Subir Archivo Excel (Cargar Costos)"
                                style={{ 
                                    height: '32px',
                                    padding: '0 0.7rem',
                                    borderRadius: '8px', 
                                    border: 'none', 
                                    backgroundColor: '#8B5CF6', 
                                    color: 'white', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '4px',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 2px 4px rgba(139, 92, 246, 0.2)'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#7C3AED'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#8B5CF6'}
                            >
                                <TrendingUp size={14} /> Cargar Excel
                            </button>
                        </div>

                        <button onClick={handleExport}
                            style={{ 
                                padding: '0 1.2rem', 
                                height: '42px', 
                                borderRadius: '12px', 
                                border: '1px solid #A7F3D0', 
                                backgroundColor: '#ECFDF5', 
                                color: '#065F46', 
                                fontWeight: '800', 
                                fontSize: '0.85rem',
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.4rem',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#D1FAE5'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ECFDF5'}
                        >
                            <BarChart3 size={18} /> Exportar Reporte
                        </button>
                    </div>
                </div>

                {/* --- DASHBOARD LINE (Stats Bar) --- */}
                {!loading && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                        <StatCard 
                            label="Productos Analizados" 
                            value={stats.totalSKU} 
                            color="#334155" 
                            icon={<Cpu size={20} />} 
                        />
                        <StatCard 
                            label="Tendencia Global" 
                            value={`${Math.abs(stats.avgTrend).toFixed(1)}%`} 
                            trend={stats.avgTrend > 0 ? 'up' : 'down'}
                            color={stats.avgTrend > 0 ? '#EF4444' : '#10B981'} 
                            icon={<TrendingUp size={20} />}
                        />
                        <StatCard 
                            label="Costos en Alza" 
                            value={stats.rising} 
                            color="#B91C1C" 
                            bg="#FEF2F2"
                            icon={<TrendingUp size={20} />}
                        />
                        <StatCard 
                            label="Costos en Baja" 
                            value={stats.falling} 
                            color="#15803D" 
                            bg="#F0FDF4"
                            icon={<TrendingDown size={20} />}
                        />
                        <StatCard 
                            label="Precios Desactualizados (15d+)" 
                            value={stats.expiringSoon} 
                            subValue={stats.pendingCost > 0 ? `⚠️ ${stats.pendingCost} Sin Costo` : 'Al día'}
                            color="#C2410C" 
                            bg="#FFF7ED"
                            icon={<ShieldAlert size={20} />} 
                        />
                    </div>
                )}

                {/* --- FILTERS & SEARCH ROW --- */}
                <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Search Bar Container */}
                    <div style={{ 
                        flex: '1 1 400px',
                        display: 'flex', 
                        alignItems: 'center', 
                        backgroundColor: 'white', 
                        borderRadius: '12px', 
                        border: '1px solid #E2E8F0', 
                        padding: '0 1.2rem', 
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', 
                        gap: '0.8rem',
                        transition: 'all 0.3s ease'
                    }} onFocusCapture={(e) => e.currentTarget.style.borderColor = '#0EA5E9'}>
                        <Search size={18} color="#94A3B8" />
                        <input 
                            type="text"
                            placeholder="Buscar productos por nombre, ID contable, keywords o tags (@tag)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ 
                                width: '100%', 
                                padding: '0.7rem 0', 
                                border: 'none', 
                                outline: 'none', 
                                fontSize: '0.95rem', 
                                fontWeight: '600',
                                color: '#1E293B',
                                background: 'transparent'
                            }}
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                style={{ border: 'none', background: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex' }}
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>

                    {/* Filter controls row */}
                    <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
                         {/* Strategy Selector Button */}
                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: 'white', padding: '0.3rem 0.6rem', borderRadius: '12px', border: '1px solid #E2E8F0', height: '42px' }}>
                            <span style={{ fontWeight: '900', fontSize: '0.65rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '0.2rem' }}>Estrategia:</span>
                            <button 
                                onClick={() => setIsSmartModalOpen(true)}
                                style={{ 
                                    padding: '0.3rem 0.6rem', 
                                    borderRadius: '8px', 
                                    border: '1px solid #BAE6FD', 
                                    backgroundColor: '#F0F9FF', 
                                    color: '#0369A1', 
                                    fontWeight: '800', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.4rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    fontSize: '0.8rem'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                <Brain size={16} /> CI-Delta v2
                            </button>
                         </div>

                         {/* Category Filter Select */}
                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: 'white', padding: '0.3rem 0.6rem', borderRadius: '12px', border: '1px solid #E2E8F0', height: '42px' }}>
                            <span style={{ fontWeight: '900', fontSize: '0.65rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '0.2rem' }}>Categoría:</span>
                            <select 
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                style={{ 
                                    padding: '0.2rem 0.4rem', 
                                    borderRadius: '8px', 
                                    border: 'none', 
                                    backgroundColor: 'transparent', 
                                    fontWeight: '800', 
                                    minWidth: '150px',
                                    fontSize: '0.8rem',
                                    color: '#1E293B',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="Todas">Todo el Catálogo</option>
                                {categories.map(c => <option key={c} value={c}>{CATEGORY_MAP[c] || c}</option>)}
                            </select>
                         </div>

                         {/* Refresh button */}
                         <button 
                             onClick={fetchData} 
                             title="Sincronizar Datos"
                             style={{ 
                                 width: '42px',
                                 height: '42px',
                                 borderRadius: '12px', 
                                 border: 'none', 
                                 backgroundColor: '#0F172A', 
                                 color: 'white', 
                                 cursor: 'pointer', 
                                 display: 'flex', 
                                 alignItems: 'center', 
                                 justifyContent: 'center',
                                 transition: 'all 0.2s',
                                 boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.2)'
                             }}
                             onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1E293B'}
                             onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0F172A'}
                         >
                             <RefreshCw size={18} />
                         </button>

                         {/* Help Tooltip Icon */}
                         <div 
                             style={{ position: 'relative' }} 
                             onMouseEnter={() => setShowHelp(true)}
                             onMouseLeave={() => setShowHelp(false)}
                         >
                             <div style={{ 
                                 cursor: 'help', 
                                 color: showHelp ? 'var(--primary)' : '#9CA3AF',
                                 backgroundColor: 'white',
                                 padding: '0.7rem',
                                 borderRadius: '12px',
                                 border: '1px solid #E5E7EB',
                                 display: 'flex',
                                 alignItems: 'center',
                                 height: '42px',
                                 transition: 'all 0.2s'
                             }}>
                                 <Info size={18} />
                             </div>
                             
                             {showHelp && (
                                 <div style={{
                                     position: 'absolute',
                                     top: '110%',
                                     right: 0,
                                     backgroundColor: '#1F2937',
                                     color: 'white',
                                     padding: '1rem',
                                     borderRadius: '12px',
                                     width: '280px',
                                     fontSize: '0.8rem',
                                     zIndex: 100,
                                     boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                                     transition: 'all 0.2s ease',
                                     pointerEvents: 'none',
                                     opacity: 1
                                 }}>
                                     <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', color: '#60A5FA' }}>💡 Trucos de búsqueda:</p>
                                     <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: '1.4' }}>
                                         <li><b>Comas:</b> Varios términos (ej: <code>papa, cebolla</code>)</li>
                                         <li><b>@unidad:</b> Por unidad o categoría (ej: <code>@kg</code>, <code>@congelados</code>)</li>
                                         <li><b>SKU:</b> Busca por código exacto.</li>
                                     </ul>
                                 </div>
                             )}
                         </div>
                    </div>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '5rem', color: '#6B7280' }}>Cargando historial de precios...</div>
                ) : (
                    <div style={{ 
                        backgroundColor: 'white', 
                        borderRadius: '16px', 
                        boxShadow: '0 4px 20px rgba(0,0,0,0.05)', 
                        overflow: 'hidden',
                        border: '1px solid #E5E7EB'
                    }}>
                        <style dangerouslySetInnerHTML={{__html: `
                            .matrix-table th, .matrix-table td {
                                transition: all 0.3s ease;
                                box-sizing: border-box !important;
                            }
                            
                            /* Reglas estrictas para evitar que Tendencia y Costo se solapen NUNCA */
                            .col-tendencia { 
                                width: 160px !important; 
                                min-width: 160px !important; 
                                max-width: 160px !important; 
                                right: 0 !important; 
                            }
                            .col-costo { 
                                width: 160px !important; 
                                min-width: 160px !important; 
                                max-width: 160px !important; 
                                right: 160px !important; 
                            }

                            @media (max-width: 1440px) {
                                .matrix-table th, .matrix-table td {
                                    padding: 0.6rem 0.3rem !important;
                                }
                                .col-producto { min-width: 180px !important; font-size: 0.9rem; }
                                .col-compra, .col-compra-old { min-width: 70px !important; font-size: 0.8rem; }
                                
                                /* Ajuste estricto de anclaje para portátiles grandes */
                                .col-costo { width: 145px !important; min-width: 145px !important; max-width: 145px !important; right: 135px !important; }
                                .col-tendencia { width: 135px !important; min-width: 135px !important; max-width: 135px !important; right: 0 !important; }
                                
                                /* Achicar elementos internos para que quepan */
                                .col-costo input { width: 65px !important; padding: 0.3rem !important; font-size: 0.8rem !important; }
                                .col-costo button { width: 28px !important; height: 28px !important; padding: 0.2rem !important; }
                            }
                            
                            @media (max-width: 1200px) {
                                .col-producto { min-width: 150px !important; font-size: 0.8rem !important; }
                                .col-compra, .col-compra-old { min-width: 60px !important; font-size: 0.7rem !important; }
                                
                                /* Ajuste estricto de anclaje para portátiles estándar */
                                .col-costo { width: 130px !important; min-width: 130px !important; max-width: 130px !important; right: 120px !important; }
                                .col-tendencia { width: 120px !important; min-width: 120px !important; max-width: 120px !important; right: 0 !important; }
                                .col-costo input { width: 55px !important; }
                            }

                            @media (max-width: 768px) {
                                /* En móviles: ocultar compras antiguas para dejar siempre visible Costo y Compra 1 */
                                .col-compra-old { display: none !important; }
                                .col-producto { position: static !important; box-shadow: none !important; z-index: auto !important; }
                                .col-costo { position: static !important; box-shadow: none !important; width: auto !important; max-width: none !important; }
                                .col-tendencia { position: static !important; box-shadow: none !important; width: auto !important; max-width: none !important; }
                            }

                            /* Énfasis leve para la columna ÚLTIMA */
                            .col-compra {
                                background-color: #F8FAFC !important;
                                border-left: 1px solid #E2E8F0 !important;
                                border-right: 1px solid #E2E8F0 !important;
                            }
                            .matrix-table th.col-compra {
                                background-color: #F1F5F9 !important;
                            }
                        `}} />
                        <div style={{ overflowX: 'auto' }}>
                            <table className="matrix-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                                        <th 
                                            className="col-producto"
                                            onClick={() => handleSort('name')}
                                            style={{ 
                                                padding: '1.2rem 1.5rem', 
                                                minWidth: '250px', 
                                                position: 'sticky', 
                                                left: 0, 
                                                backgroundColor: '#F9FAFB', 
                                                zIndex: 10,
                                                boxShadow: '2px 0 5px rgba(0,0,0,0.02)',
                                                cursor: 'pointer',
                                                userSelect: 'none'
                                            }}
                                        >
                                            <div style={{ fontSize: '0.75rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '900', display: 'flex', alignItems: 'center' }}>
                                                PRODUCTO / CATEGORÍA <SortIcon field="name" />
                                            </div>
                                        </th>
                                        {/* Column Headers for 8 purchases */}
                                        {[...Array(8)].map((_, i) => (
                                            <th key={i} className={i > 0 ? "col-compra-old" : "col-compra"} style={{ padding: '0.8rem', minWidth: '95px', borderLeft: '1px solid #F3F4F6', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '900', color: '#6B7280', textTransform: 'uppercase' }}>{i === 0 ? 'ÚLTIMA' : `COMPRA ${i + 1}`}</div>
                                            </th>
                                        ))}

                                        <th 
                                            className="col-costo"
                                            onClick={() => handleSort('smartCost')}
                                            style={{ 
                                                padding: '1.2rem', 
                                                minWidth: '160px', 
                                                width: '160px',
                                                borderLeft: '2px solid #E5E7EB',
                                                backgroundColor: '#F0FDF4',
                                                textAlign: 'center',
                                                verticalAlign: 'middle',
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                position: 'sticky',
                                                right: '160px',
                                                zIndex: 6,
                                                boxShadow: '-2px 0 5px rgba(0,0,0,0.02)'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                                                <div style={{ fontSize: '0.75rem', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '900', display: 'flex', alignItems: 'center' }}>COSTO <SortIcon field="smartCost" /></div>
                                            </div>
                                        </th>

                                        <th 
                                            className="col-tendencia"
                                            onClick={() => handleSort('trend')}
                                            style={{ 
                                                padding: '1.2rem', 
                                                minWidth: '160px', 
                                                width: '160px',
                                                borderLeft: '2px solid #E5E7EB',
                                                position: 'sticky',
                                                right: 0,
                                                backgroundColor: '#F9FAFB',
                                                zIndex: 6,
                                                boxShadow: '-2px 0 5px rgba(0,0,0,0.02)',
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                textAlign: 'center',
                                                verticalAlign: 'middle'
                                            }}
                                        >
                                            <div style={{ fontSize: '0.75rem', color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>TENDENCIA <SortIcon field="trend" /></div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedProducts.map((p, idx) => {
                                        const prevProduct = idx > 0 ? sortedProducts[idx - 1] : null;
                                        const isGroupedView = !sortField || sortField === 'name';
                                        const showCategoryHeader = isGroupedView && (!prevProduct || prevProduct.category !== p.category);
                                        const history = purchaseHistory[p.id] || [];
                                        const smartCost = effectiveCosts[p.id] || 0;
                                        const harvestStatus = getHarvestStatus(p.id);
                                        const cellState = getCostCellState(p.id);

                                        return (
                                            <Fragment key={p.id}>
                                                {showCategoryHeader && (
                                                    <tr style={{ backgroundColor: '#F3F4F6' }}>
                                                        <td colSpan={12} style={{ padding: '0.6rem 1.5rem', fontWeight: '900', fontSize: '0.75rem', color: '#4B5563', textTransform: 'uppercase' }}>
                                                            📂 {CATEGORY_MAP[p.category]?.toUpperCase() || p.category}
                                                        </td>
                                                    </tr>
                                                )}
                                                <tr 
                                                    style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.2s' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <td className="col-producto" style={{ 
                                                        padding: '1rem 1.5rem', 
                                                        position: 'sticky', 
                                                        left: 0, 
                                                        backgroundColor: 'white', 
                                                        zIndex: 5,
                                                        boxShadow: '2px 0 5px rgba(0,0,0,0.02)'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <div style={{ fontWeight: '800', color: '#111827', fontSize: '1rem' }}>{p.name}</div>
                                                            {harvestStatus === 'harvest' && <div title="Temporada de Cosecha: Alta oferta, precios bajos" style={{ color: '#10B981' }}><Leaf size={16} /></div>}
                                                            {harvestStatus === 'risk' && <div title="Alerta de Escasez: Históricamente los precios suben este mes" style={{ color: '#EF4444' }}><ShieldAlert size={16} /></div>}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginTop: '0.3rem' }}>
                                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.primary, backgroundColor: THEME.colors.primaryLight, padding: '1px 5px', borderRadius: '4px' }}>
                                                                {p.accounting_id ? `ID: ${p.accounting_id}` : `ID: ${p.id.slice(0, 8)}`}
                                                            </span>
                                                            <span style={{ fontSize: '0.75rem', color: '#9CA3AF', fontWeight: '600' }}>
                                                                {p.unit_of_measure}
                                                            </span>
                                                        </div>
                                                        {(() => {
                                                            const lifecycle = getProductCostLifecycle(p.id);
                                                            return (
                                                                <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                    <span style={{ 
                                                                        fontSize: '0.65rem', 
                                                                        color: lifecycle.statusColor, 
                                                                        backgroundColor: lifecycle.statusBg, 
                                                                        padding: '2px 7px', 
                                                                        borderRadius: '6px', 
                                                                        fontWeight: '800',
                                                                        border: `1px solid ${lifecycle.statusColor}33`,
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px'
                                                                    }}>
                                                                        {lifecycle.status === 'VIGENTE' && <CheckCircle2 size={11} />}
                                                                        {lifecycle.status === 'POR_VENCER' && <Clock size={11} />}
                                                                        {(lifecycle.status === 'VENCIDO' || lifecycle.status === 'SIN_REFERENCIA') && <AlertTriangle size={11} />}
                                                                        {lifecycle.statusLabel}
                                                                    </span>
                                                                    <span style={{ fontSize: '0.62rem', color: '#94A3B8', fontWeight: '600' }}>
                                                                        • {lifecycle.sourceLabel}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                    
                                                    {/* Row Cells for 8 purchases */}
                                                    {(() => {
                                                        const prices = history.map(h => h.normalized_price);
                                                        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

                                                        return [...Array(8)].map((_, i) => {
                                                            const purchase = history[i];
                                                            const isBestPrice = purchase && purchase.normalized_price === minPrice && prices.length > 1;
                                                            const mOverride = i === 0 && !purchase ? manualOverrides[p.id] : null;

                                                            return (
                                                                <td key={i} className={i > 0 ? "col-compra-old" : "col-compra"} style={{ padding: '0.6rem', borderLeft: '1px solid #F9FAFB', textAlign: 'center', position: 'relative' }}>
                                                                    {purchase || mOverride ? (
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                                                            <div style={{ 
                                                                                fontWeight: '800', 
                                                                                color: mOverride ? '#1E40AF' : (isBestPrice ? '#15803D' : '#059669'), 
                                                                                fontSize: '0.9rem',
                                                                                backgroundColor: mOverride ? '#EFF6FF' : (isBestPrice ? '#DCFCE7' : '#ECFDF5'),
                                                                                padding: '0.3rem',
                                                                                borderRadius: '6px',
                                                                                border: mOverride ? '1px solid #BFDBFE' : (isBestPrice ? '1px solid #4ADE80' : '1px solid #D1FAE5'),
                                                                                position: 'relative'
                                                                            }}>
                                                                                ${formatNumberWithDots(purchase ? purchase.normalized_price : mOverride.manual_cost)}
                                                                                {isBestPrice && (
                                                                                    <div style={{ position: 'absolute', top: '-8px', right: '-8px', fontSize: '1rem', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))' }} title="Mejor precio histórico">🎖️</div>
                                                                                )}
                                                                                {mOverride && (
                                                                                    <div style={{ position: 'absolute', top: '-8px', right: '-8px', fontSize: '0.9rem' }} title="Costo manual de referencia">✍️</div>
                                                                                )}
                                                                            </div>
                                                                            <div style={{ fontSize: '0.6rem', color: '#9CA3AF', fontWeight: 'bold' }}>
                                                                                {format(new Date(purchase ? purchase.created_at : mOverride.updated_at), 'dd MMM', { locale: es })}
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <span style={{ color: '#F3F4F6', fontSize: '0.8rem' }}>—</span>
                                                                    )}
                                                                </td>
                                                            );
                                                        });
                                                    })()}

                                                    {/* Smart Average Cost Column */}
                                                    <td className="col-costo" style={{ 
                                                        padding: '1rem', 
                                                        minWidth: '160px',
                                                        width: '160px',
                                                        borderLeft: '2px solid #E5E7EB', 
                                                        textAlign: 'center',
                                                        backgroundColor: cellState.bg,
                                                        position: 'sticky',
                                                        right: '160px',
                                                        zIndex: 5,
                                                        boxShadow: '-2px 0 5px rgba(0,0,0,0.02)',
                                                        transition: 'all 0.3s ease'
                                                    }}>
                                                        {(() => {
                                                            const smart = calculateSmartCost(p.id);
                                                            const currentManual = manualOverrides[p.id]?.manual_cost;
                                                            const isAligned = currentManual && Math.abs(currentManual - smart) < 1;
                                                            
                                                            if (smart > 0) {
                                                                return (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                                                                        <div style={{ 
                                                                            fontWeight: '900', 
                                                                            color: cellState.text,
                                                                            fontSize: '1.2rem',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.4rem'
                                                                        }}>
                                                                            ${formatNumberWithDots(smart)}
                                                                            {isAligned && <span title="Precio Autorizado por IA"><CheckCircle2 size={16} color="#10B981" /></span>}
                                                                            {harvestStatus === 'harvest' && <span title="RECOMENDACIÓN: ABUNDANCIA ESTACIONAL"><Brain size={16} color="#0EA5E9" className="animate-pulse" /></span>}
                                                                        </div>
                                                                        <span style={{ 
                                                                            fontSize: '0.6rem', 
                                                                            color: cellState.labelColor, 
                                                                            fontWeight: '900', 
                                                                            textTransform: 'uppercase',
                                                                            backgroundColor: `${cellState.labelColor}15`,
                                                                            padding: '2px 8px',
                                                                            borderRadius: '6px'
                                                                        }}>
                                                                            {cellState.badge}
                                                                        </span>
                                                                        {currentManual && !isAligned && (
                                                                            <div style={{ fontSize: '0.55rem', color: '#1E40AF', fontWeight: '900', textTransform: 'uppercase', backgroundColor: '#DBEAFE', padding: '0.1rem 0.4rem', borderRadius: '4px', marginTop: '0.2rem' }}>
                                                                                ✍️ Manual: ${formatNumberWithDots(currentManual)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            }

                                                            return (
                                                                <ManualCostInput 
                                                                    productId={p.id}
                                                                    currentManual={currentManual}
                                                                    savingId={savingId}
                                                                    onSave={handleSaveManualCost}
                                                                    cellState={cellState}
                                                                />
                                                            );
                                                        })()}
                                                    </td>

                                                    {/* Trend Chart column - STICKY to the right */}
                                                    <td className="col-tendencia" style={{ 
                                                        padding: '1rem', 
                                                        minWidth: '160px',
                                                        width: '160px',
                                                        borderLeft: '2px solid #E5E7EB',
                                                        position: 'sticky',
                                                        right: 0,
                                                        backgroundColor: 'white',
                                                        zIndex: 5,
                                                        boxShadow: '-2px 0 5px rgba(0,0,0,0.02)'
                                                    }}>
                                                        <Sparkline data={history} />
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

                {/* --- SMART METHODOLOGY MODAL --- */}
                {isSmartModalOpen && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                        backdropFilter: 'blur(4px)'
                    }}>
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: '24px',
                            maxWidth: '900px',
                            width: '100%',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            padding: '2.5rem',
                            position: 'relative',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                        }}>
                            <button 
                                onClick={() => {
                                    setIsSmartModalOpen(false);
                                    setSelectedProductForModal(null);
                                }}
                                style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', border: 'none', background: 'none', cursor: 'pointer', color: '#9CA3AF' }}
                            >
                                <X size={30} />
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ backgroundColor: '#DBEAFE', padding: '1rem', borderRadius: '16px', color: '#1E40AF' }}>
                                    <Brain size={40} />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: '900', color: '#111827' }}>Protocolo CI-Delta (Costo Inteligente)</h2>
                                    <p style={{ margin: 0, color: '#6B7280', fontWeight: '600' }}>Metodología de Suavizado Exponencial Adaptativo v2.0</p>
                                </div>
                            </div>

                            {selectedProductForModal && (
                                <div style={{ marginBottom: '2rem', padding: '1.2rem', backgroundColor: '#F9FAFB', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
                                    <div style={{ fontWeight: '800', color: '#374151' }}>Análisis Maestro para: <span style={{ color: '#2563EB' }}>{selectedProductForModal.name}</span></div>
                                    <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>SKU: {selectedProductForModal.sku} | Cat: {CATEGORY_MAP[selectedProductForModal.category]}</div>
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2.5rem' }}>
                                <div>
                                    <h4 style={{ color: '#111827', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                        <Clock size={20} color="#3B82F6" /> 1. Factor de Frescura (Time-Decay)
                                    </h4>
                                    <p style={{ fontSize: '0.9rem', color: '#4B5563', lineHeight: '1.6' }}>
                                        El sistema evalúa la antigüedad de la última compra. Si el dato tiene menos de 7 días, se le otorga confianza plena (Alpha = 0.5). 
                                        A partir del día 8, el sistema aplica una <b>degradación de confianza del 5% diario</b> para proteger el margen contra la inflación acumulada.
                                    </p>

                                    <h4 style={{ color: '#111827', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', marginTop: '1.5rem' }}>
                                        <Cpu size={20} color="#10B981" /> 2. Modo Reactivo vs. Estable
                                    </h4>
                                    <p style={{ fontSize: '0.9rem', color: '#4B5563', lineHeight: '1.6' }}>
                                        Si detectamos un cambio brusco (mayor al 10%) entre las últimas dos compras, el algoritmo "espabila" y sube su sensibilidad (Alpha = 0.8) 
                                        para recalibrar el costo de inmediato. En mercados estables, mantiene la inercia para evitar ruido.
                                    </p>
                                </div>

                                <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0' }}>
                                    <h4 style={{ color: '#111827', fontWeight: '900', textAlign: 'center', marginBottom: '1rem' }}>Impacto en la Curva CI</h4>
                                    {/* SVG REPRESENTATION OF THE SMOOTHING */}
                                    <div style={{ height: '140px', width: '100%', position: 'relative' }}>
                                        <svg width="100%" height="100%" viewBox="0 0 100 50">
                                            {/* Reference Line */}
                                            <line x1="0" y1="40" x2="100" y2="40" stroke="#E2E8F0" strokeWidth="0.5" />
                                            {/* Raw Price Line (Jagged) */}
                                            <path d="M 0 40 L 20 10 L 40 45 L 60 15 L 80 40 L 100 20" fill="none" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="2" />
                                            {/* Smart Cost Line (Smooth) */}
                                            <path d="M 0 40 Q 20 20, 40 30 Q 60 20, 80 30 T 100 25" fill="none" stroke="#3B82F6" strokeWidth="2.5" />
                                            
                                            <circle cx="100" cy="25" r="3" fill="#3B82F6" />
                                        </svg>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #F1F5F9' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748B' }}>
                                            <div style={{ width: '12px', height: '0px', borderBottom: '2px dashed #CBD5E1' }}></div> Precio Real
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 'bold', color: '#3B82F6' }}>
                                            <div style={{ width: '12px', height: '3px', backgroundColor: '#3B82F6' }}></div> Costo Smart
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.85rem', color: '#64748B', fontStyle: 'italic', lineHeight: '1.3' }}>
                                        "Promedio Ponderado por relevancia temporal y volatilidad de mercado."
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem', borderTop: '1px solid #F1F5F9', paddingTop: '2rem' }}>
                                <div>
                                    <h4 style={{ color: '#111827', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                        <Sun size={20} color="#F59E0B" /> 3. Agente de Cosecha (Seasonality)
                                    </h4>
                                    <p style={{ fontSize: '0.9rem', color: '#4B5563', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                                        El CI-Delta analiza 15 meses de historia para detectar ciclos de abundancia. 
                                        Si el costo actual es un 10% menor al histórico del mismo mes (Año anterior), 
                                        el sistema marca el producto como <b>"Temporada de Cosecha"</b> para priorizar su aprovisionamiento.
                                    </p>

                                    <h4 style={{ color: '#111827', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                        <ShieldAlert size={20} color="#EF4444" /> 4. Peritaje y Vigencia Manual
                                    </h4>
                                    <p style={{ fontSize: '0.9rem', color: '#4B5563', lineHeight: '1.6' }}>
                                        Cuando no se recibe señal de precio (compras) por más de <b>60 días</b>, el sistema requiere un peritaje manual para garantizar la precisión comercial. 
                                        Toda entrada manual tiene una <b>vigencia de 60 días</b> antes de solicitar una nueva validación.
                                    </p>
                                </div>
                                <div style={{ backgroundColor: '#FFF7ED', padding: '1.5rem', borderRadius: '12px', border: '1px solid #FFEDD5', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '900', color: '#9A3412', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Estatus Peritaje Comercial</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#C2410C', fontWeight: '800', fontSize: '1.1rem' }}>
                                        <ShieldAlert size={24} /> Auditable para Revisoría
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#9A3412', marginTop: '0.8rem', lineHeight: '1.4' }}>
                                        Basado en el modelo de Holt-Winters simplificado. Las señales manuales se integran con un peso prioritario sobre la inercia del algoritmo.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- IMPORT MODAL --- */}
                {isImportModalOpen && (
                    <div style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.6)',
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                        backdropFilter: 'blur(4px)',
                        fontFamily: 'system-ui, sans-serif'
                    }}>
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: '24px',
                            maxWidth: '600px',
                            width: '100%',
                            padding: '2.5rem',
                            position: 'relative',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                        }}>
                            <button 
                                onClick={() => {
                                    setIsImportModalOpen(false);
                                    setImportFile(null);
                                    setImportError('');
                                    setImportSuccess('');
                                }}
                                style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', border: 'none', background: 'none', cursor: 'pointer', color: '#9CA3AF' }}
                            >
                                <X size={30} />
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ backgroundColor: '#F5F3FF', padding: '1rem', borderRadius: '16px', color: '#6D28D9' }}>
                                    <TrendingUp size={40} />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900', color: '#111827' }}>Importación Masiva de Costos</h2>
                                    <p style={{ margin: 0, color: '#6B7280', fontWeight: '600', fontSize: '0.85rem' }}>Carga masiva utilizando el identificador único <b>accounting_id</b></p>
                                </div>
                            </div>

                            {importError && (
                                <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '0.8rem 1.2rem', borderRadius: '12px', marginBottom: '1.2rem', fontSize: '0.85rem', fontWeight: '600' }}>
                                    ❌ {importError}
                                </div>
                            )}

                            {importSuccess && (
                                <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC', color: '#166534', padding: '0.8rem 1.2rem', borderRadius: '12px', marginBottom: '1.2rem', fontSize: '0.85rem', fontWeight: '600' }}>
                                    ✅ {importSuccess}
                                </div>
                            )}

                            {/* Template Download Shortcuts in Modal */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1px solid #E2E8F0', marginBottom: '1.2rem' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    📥 ¿Necesitas la plantilla base? Descárgala aquí:
                                </span>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                    <button
                                        type="button"
                                        onClick={handleExportTemplateAll}
                                        style={{
                                            padding: '0.55rem 0.8rem',
                                            backgroundColor: 'white',
                                            border: '1px solid #CBD5E1',
                                            borderRadius: '8px',
                                            color: '#1E293B',
                                            fontSize: '0.76rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <Download size={13} color="#2563EB" /> Catálogo Completo (.xlsx)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleExportTemplateDue}
                                        style={{
                                            padding: '0.55rem 0.8rem',
                                            backgroundColor: '#FEF3C7',
                                            border: '1px solid #FCD34D',
                                            borderRadius: '8px',
                                            color: '#92400E',
                                            fontSize: '0.76rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <Clock size={13} color="#D97706" /> Solo Vencidos ({stats.expiringSoon + stats.pendingCost})
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ border: '2px dashed #DDD6FE', padding: '2rem 1.5rem', borderRadius: '16px', textAlign: 'center', backgroundColor: '#F9F5FF' }}>
                                    <input 
                                        type="file" 
                                        accept=".xlsx, .xls"
                                        onChange={handleImportExcel}
                                        id="excel-file-upload"
                                        style={{ display: 'none' }}
                                    />
                                    <label htmlFor="excel-file-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                        <div style={{ color: '#8B5CF6' }}><TrendingUp size={36} /></div>
                                        <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#4C1D95' }}>
                                            {importFile ? importFile.name : 'Selecciona o arrastra tu archivo Excel'}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: '#7C3AED' }}>Formatos aceptados: .xlsx, .xls</span>
                                    </label>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
                                    <button 
                                        onClick={() => {
                                            setIsImportModalOpen(false);
                                            setImportFile(null);
                                            setImportError('');
                                            setImportSuccess('');
                                        }}
                                        style={{ padding: '0.6rem 1.2rem', borderRadius: '10px', border: '1px solid #E2E8F0', backgroundColor: 'white', color: '#475569', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        onClick={processImport}
                                        disabled={importing || !importFile}
                                        style={{ 
                                            padding: '0.6rem 1.2rem', 
                                            borderRadius: '10px', 
                                            border: 'none', 
                                            backgroundColor: !importFile ? '#E2E8F0' : '#8B5CF6', 
                                            color: 'white', 
                                            fontWeight: '800', 
                                            fontSize: '0.85rem', 
                                            cursor: !importFile ? 'not-allowed' : 'pointer',
                                            boxShadow: importFile ? '0 4px 12px rgba(139, 92, 246, 0.2)' : 'none'
                                        }}
                                    >
                                        {importing ? 'Procesando...' : 'Cargar Costos'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ marginTop: '2rem', backgroundColor: '#EFF6FF', padding: '1.5rem', borderRadius: '12px', border: '1px solid #DBEAFE' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.5rem' }}>
                        <Brain size={24} color="#1E40AF" />
                        <h3 style={{ margin: 0, fontSize: '1rem', color: '#1E40AF', fontWeight: '800' }}>Dashboard de Inteligencia Comercial Delta</h3>
                    </div>
                    <p style={{ margin: 0, color: '#3B82F6', fontSize: '0.9rem', lineHeight: '1.5' }}>
                        Esta matriz no utiliza promedios simples. El costo que visualizas es el resultado del <b>Protocolo CI-Delta</b>, 
                        que calibra automáticamente la sensibilidad del precio según la frescura del dato y la volatilidad del SKU.
                    </p>
                </div>
            </div>
        </main>
    );
}
