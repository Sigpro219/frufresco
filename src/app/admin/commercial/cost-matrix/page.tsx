'use client';

import { useState, useEffect, Fragment, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, X, Info, Brain, Cpu, Leaf, Sun, TrendingUp, TrendingDown, Clock, ShieldAlert, BarChart3, ChevronRight, CheckCircle2 } from 'lucide-react';
import { logError } from '@/lib/errorUtils';
import Link from 'next/link';
import { CATEGORY_MAP } from '@/lib/constants';
import * as XLSX from 'xlsx';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

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
}

function StatCard({ label, value, subValue, trend, color, bg = 'white', icon }: any) {
    return (
        <div style={{ 
            backgroundColor: bg, 
            padding: '1.5rem', 
            borderRadius: '20px', 
            border: '1px solid #E2E8F0', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.4rem', 
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
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ fontSize: '2rem', fontWeight: '900', color: color, letterSpacing: '-0.03em' }}>
                    {trend === 'up' && '▲ '}{trend === 'down' && '▼ '}{value}
                </span>
                {subValue && <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94A3B8' }}>{subValue}</span>}
            </div>
        </div>
    );
}

export default function CostMatrixPage() {
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [purchaseHistory, setPurchaseHistory] = useState<Record<string, Purchase[]>>({}); // { productId: [purchases] }
    const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
    const [categories, setCategories] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [showHelp, setShowHelp] = useState(false);
    const [isSmartModalOpen, setIsSmartModalOpen] = useState(false);
    const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
    const [sortField, setSortField] = useState<'name' | 'smartCost' | 'trend' | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [manualOverrides, setManualOverrides] = useState<Record<string, {manual_cost: number, expires_at: string}>>({});
    const [effectiveCosts, setEffectiveCosts] = useState<Record<string, number>>({});
    const [user, setUser] = useState<any>(null);
    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [batchProgress, setBatchProgress] = useState(0);
    const [savingId, setSavingId] = useState<string | null>(null);
    const isMounted = useRef(true);

    const calculateSmartCost = (productId: string) => {
        const history = purchaseHistory[productId] || [];
        if (history.length === 0) return 0;
        
        const sortedHistory = [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const latest = sortedHistory[0];
        const product = products.find(p => p.id === productId);
        
        const ageInDays = differenceInDays(new Date(), new Date(latest.created_at));
        const isPerishable = product?.capabilities?.includes('IS_PERISHABLE');
        
        let alpha = isPerishable ? 0.7 : 0.5;
        
        if (ageInDays > 7) {
            const penalty = Math.min(0.3, (ageInDays - 7) * 0.05);
            alpha = Math.max(0.1, alpha - penalty);
        }

        if (sortedHistory.length >= 2) {
            const prev = sortedHistory[1];
            const change = Math.abs((latest.normalized_price - prev.normalized_price) / prev.normalized_price);
            if (change > 0.1) alpha = 0.8;
        }

        const harvestStatus = getHarvestStatus(productId);
        if (harvestStatus === 'harvest') alpha = 0.9;

        let smartCost = latest.normalized_price;
        if (sortedHistory.length >= 2) {
            const prevPrice = sortedHistory[1].normalized_price;
            smartCost = (alpha * latest.normalized_price) + ((1 - alpha) * prevPrice);
        }

        return smartCost;
    };

    const handleAuthorizeAll = async () => {
        if (!window.confirm('¿Desea autorizar todas las recomendaciones de IA para esta categoría?')) return;
        
        setIsAuthorizing(true);
        setBatchProgress(0);
        let count = 0;
        const total = filteredProducts.length;

        for (let i = 0; i < total; i++) {
            const p = filteredProducts[i];
            const smart = calculateSmartCost(p.id);
            if (smart > 0) {
                const { error } = await supabase
                    .from('commercial_overrides')
                    .upsert({ 
                        product_id: p.id, 
                        manual_cost: Math.round(smart),
                        updated_by: 'AI-DELTA-AUTO',
                        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                    });
                if (!error) count++;
            }
            setBatchProgress(Math.round(((i + 1) / total) * 100));
        }

        setIsAuthorizing(false);
        setBatchProgress(0);
        alert(`¡Éxito! Se autorizaron ${count} precios inteligentes.`);
        window.location.reload();
    };

    const handleSaveManualCost = async (productId: string, cost: string) => {
        if (!cost || isNaN(Number(cost))) return;
        
        setSavingId(productId);
        try {
            const { error } = await supabase
                .from('commercial_overrides')
                .upsert({ 
                    product_id: productId, 
                    manual_cost: Number(cost),
                    updated_by: user?.email || 'Admin',
                    expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
                });

            if (error) throw error;
            
            setManualOverrides(prev => ({
                ...prev,
                [productId]: { manual_cost: Number(cost), expires_at: new Date().toISOString() }
            }));
            setEffectiveCosts(prev => ({
                ...prev,
                [productId]: Number(cost)
            }));
            
            setTimeout(() => { if (isMounted.current) setSavingId(null); }, 1000);
        } catch (err) {
            logError('Matrix SaveManualCost', err);
        }
    };

    const handleSort = (field: 'name' | 'smartCost' | 'trend') => {
        if (sortField === field) {
            if (sortDir === 'asc') setSortDir('desc');
            else { setSortField(null); setSortDir('asc'); }
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ field }: { field: 'name' | 'smartCost' | 'trend' }) => {
        if (sortField !== field) return <span style={{ opacity: 0.55, marginLeft: '5px', fontSize: '0.9rem' }}>↕</span>;
        return <span style={{ marginLeft: '5px', color: '#2563EB', fontSize: '0.95rem', fontWeight: '900' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
    };

    useEffect(() => {
        isMounted.current = true;
        fetchData();
        return () => { isMounted.current = false; };
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (isMounted.current) setUser(session?.user || null);
            
            let allProducts: Product[] = [];
            let from = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data: chunk, error: pError } = await supabase
                    .from('products')
                    .select('*')
                    .eq('is_active', true)
                    .eq('show_on_web', true)
                    .order('category', { ascending: true })
                    .order('name', { ascending: true })
                    .range(from, from + pageSize - 1);

                if (pError) throw pError;
                if (!chunk || chunk.length < pageSize) hasMore = false;
                if (chunk) allProducts = [...allProducts, ...chunk];
                from += pageSize;
            }

            if (!isMounted.current) return;
            setProducts(allProducts);

            const cats = Array.from(new Set(allProducts?.map((p: Product) => p.category) || [])).filter(Boolean) as string[];
            setCategories(['Todas', ...cats]);

            let convData: any[] = [];
            const { data: cData } = await supabase.from('product_conversions').select('*');
            convData = cData || [];

            const { data: pChunk, error: iError } = await supabase
                .from('purchases')
                .select('product_id, unit_price, created_at, purchase_unit')
                .order('created_at', { ascending: false })
                .limit(5000);
            if (iError) throw iError;
            const purchasesData = pChunk || [];

            let overMap: Record<string, any> = {};
            const { data: overData } = await supabase.from('commercial_overrides').select('product_id, manual_cost, expires_at');
            if (overData) {
                overData.forEach(o => { overMap[o.product_id] = { manual_cost: o.manual_cost, expires_at: o.expires_at }; });
                setManualOverrides(overMap);
            }

            const historyMap: Record<string, Purchase[]> = {};
            purchasesData.forEach((p: any) => {
                if (!p.product_id) return;
                if (!historyMap[p.product_id]) historyMap[p.product_id] = [];
                if (historyMap[p.product_id].length < 8) {
                    const product = allProducts.find((pd) => pd.id === p.product_id);
                    let normalizedPrice = Number(p.unit_price);
                    if (product && p.purchase_unit && p.purchase_unit !== product.unit_of_measure) {
                        const conv = convData.find((c: any) => c.product_id === p.product_id && c.from_unit === p.purchase_unit && c.to_unit === product.unit_of_measure);
                        if (conv?.conversion_factor) normalizedPrice = normalizedPrice / conv.conversion_factor;
                    }
                    historyMap[p.product_id].push({ ...p, normalized_price: normalizedPrice });
                }
            });
            Object.keys(historyMap).forEach(pid => { historyMap[pid].reverse(); });
            setPurchaseHistory(historyMap);

            const costMap: Record<string, number> = {};
            allProducts.forEach(p => {
                const history = historyMap[p.id] || [];
                let smart = 0;
                if (history.length > 0) {
                    const sortedH = [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                    const latest = sortedH[0];
                    let alpha = p.capabilities?.includes('IS_PERISHABLE') ? 0.7 : 0.5;
                    const age = differenceInDays(new Date(), new Date(latest.created_at));
                    if (age > 7) alpha = Math.max(0.1, alpha - Math.min(0.3, (age - 7) * 0.05));
                    if (sortedH.length >= 2 && Math.abs((latest.normalized_price - sortedH[1].normalized_price) / sortedH[1].normalized_price) > 0.1) alpha = 0.8;
                    smart = sortedH.length >= 2 ? (alpha * latest.normalized_price) + ((1 - alpha) * sortedH[1].normalized_price) : latest.normalized_price;
                }
                costMap[p.id] = smart > 0 ? smart : (overMap[p.id]?.manual_cost || 0);
            });
            setEffectiveCosts(costMap);

        } catch (err) {
            logError('Matrix fetchData', err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    const getEffectiveCost = (productId: string) => {
        const smart = calculateSmartCost(productId);
        return smart > 0 ? smart : (manualOverrides[productId]?.manual_cost || 0);
    };

    const getHarvestStatus = (productId: string) => {
        const history = purchaseHistory[productId] || [];
        if (history.length < 5) return 'stable';
        const now = new Date();
        const currentMonth = now.getMonth();
        const lastYearSameMonth = history.filter(p => {
            const d = new Date(p.created_at);
            return d.getMonth() === currentMonth && differenceInDays(now, d) > 300;
        });
        if (lastYearSameMonth.length > 0) {
            const avgLY = lastYearSameMonth.reduce((a, b) => a + b.normalized_price, 0) / lastYearSameMonth.length;
            const avgNow = history.slice(0, 3).reduce((a, b) => a + b.normalized_price, 0) / 3;
            if (avgNow < avgLY * 0.9) return 'harvest';
            if (avgNow > avgLY * 1.1) return 'risk';
        }
        return 'stable';
    };

    const Sparkline = ({ data }: { data: { normalized_price: number; created_at: string }[] }) => {
        if (!data || data.length < 2) return <div style={{ color: '#D1D5DB', fontSize: '0.7rem', textAlign: 'center' }}>Sin historial</div>;
        
        const prices = data.map(d => d.normalized_price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = max - min === 0 ? 1 : max - min;
        
        const width = 80;
        const height = 30;
        const points = prices.map((p, i) => ({
            x: (i / (prices.length - 1)) * width,
            y: height - ((p - min) / range) * height
        }));

        const pathData = `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`;
        
        // Trend calculation (Harden against 0)
        const first = prices[0];
        const last = prices[prices.length - 1];
        const trendPercent = first > 0 ? ((last - first) / first) * 100 : 0;
        const isUp = last > first;
        const isNeutral = last === first || Math.abs(trendPercent) < 0.1;

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center', backgroundColor: '#F8FAFC', padding: '0.5rem 1rem', borderRadius: '14px' }}>
                <svg width={width} height={height} style={{ overflow: 'visible' }}>
                    <path
                        d={pathData}
                        fill="none"
                        stroke={isUp ? '#EF4444' : isNeutral ? '#94A3B8' : '#10B981'}
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                    {points.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r="3" fill={i === points.length - 1 ? (isUp ? '#EF4444' : isNeutral ? '#94A3B8' : '#10B981') : 'white'} stroke={isUp ? '#EF4444' : isNeutral ? '#94A3B8' : '#10B981'} strokeWidth="1.5" />
                    ))}
                </svg>
                <div style={{ 
                    fontSize: '0.85rem', 
                    fontWeight: '900', 
                    color: isUp ? '#EF4444' : isNeutral ? '#64748B' : '#10B981',
                    display: 'flex',
                    alignItems: 'center',
                    minWidth: '55px',
                    justifyContent: 'flex-end',
                    fontFamily: 'Outfit, sans-serif'
                }}>
                    {isNeutral ? '—' : isUp ? '▲' : '▼'} {Math.abs(trendPercent).toFixed(1)}%
                </div>
            </div>
        );
    };

    const filteredProducts = products.filter(p => {
        const matchesCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
        
        if (searchTerm === '') return matchesCategory;

        const searchTerms = searchTerm.toLowerCase().split(',').map(t => t.trim()).filter(t => t !== '');
        
        const matchesSearch = searchTerms.every(term => {
            // Especial: Búsqueda por unidad o categoría (si empieza por @)
            if (term.startsWith('@')) {
                const searchVal = term.slice(1);
                const inUnit = p.unit_of_measure?.toLowerCase().includes(searchVal);
                const catName = (CATEGORY_MAP[p.category] || p.category).toLowerCase();
                const inCategory = catName.includes(searchVal);
                
                return inUnit || inCategory;
            }

            const inName = p.name.toLowerCase().includes(term);
            const inSKU = p.sku?.toLowerCase().includes(term);
            const inKeywords = p.keywords?.toLowerCase().includes(term);
            const inTags = p.tags?.some(tag => tag.toLowerCase().includes(term));
            
            return inName || inSKU || inKeywords || inTags;
        });

        return matchesCategory && matchesSearch;
    });

    // --- SORT ---
    const sortedProducts = [...filteredProducts].sort((a, b) => {
        if (!sortField) return 0;
        const dir = sortDir === 'asc' ? 1 : -1;
        if (sortField === 'name') return dir * a.name.localeCompare(b.name);
        if (sortField === 'smartCost') return dir * ((effectiveCosts[a.id] || 0) - (effectiveCosts[b.id] || 0));
        if (sortField === 'trend') {
            const getTrend = (id: string) => {
                const h = purchaseHistory[id];
                if (!h || h.length < 2) return 0;
                return ((h[h.length-1].normalized_price - h[0].normalized_price) / h[0].normalized_price) * 100;
            };
            return dir * (getTrend(a.id) - getTrend(b.id));
        }
        return 0;
    });

    // --- DASHBOARD STATS ---
    const stats = (() => {
        let totalTrend = 0;
        let productsWithTrend = 0;
        let rising = 0;
        let falling = 0;
        let pendingCost = 0;
        let expiringSoon = 0;
        const now = new Date();

        filteredProducts.forEach(p => {
            const history = purchaseHistory[p.id];
            const smartCost = calculateSmartCost(p.id);
            const override = manualOverrides[p.id];

            // AI/Algorithm stats
            if (history && history.length >= 2) {
                const first = history[0].normalized_price;
                const last = history[history.length - 1].normalized_price;
                const trend = first > 0 ? ((last - first) / first) * 100 : 0;
                
                totalTrend += trend;
                productsWithTrend++;
                if (last > first) rising++;
                else if (last < first) falling++;
            }

            // Commercial alerts stats
            if (smartCost === 0 && !override) {
                pendingCost++;
            }

            if (override && override.expires_at) {
                const expiry = new Date(override.expires_at);
                const daysLeft = (expiry.getTime() - now.getTime()) / (1000 * 3600 * 24);
                if (daysLeft <= 7) expiringSoon++;
            }
        });

        return {
            avgTrend: productsWithTrend > 0 ? totalTrend / productsWithTrend : 0,
            rising,
            falling,
            totalSKU: filteredProducts.length,
            pendingCost,
            expiringSoon
        };
    })();

    const handleExport = () => {
        const exportData = filteredProducts.map(p => {
            const history = purchaseHistory[p.id] || [];
            
            const smartCost = calculateSmartCost(p.id);
            
            // Calculate Trend
            const first = history.length >= 2 ? history[0].normalized_price : 0;
            const last = history.length >= 2 ? history[history.length - 1].normalized_price : 0;
            const trend = first > 0 ? ((last - first) / first) * 100 : 0;

            const row: Record<string, string | number | null> = {
                'SKU': p.sku || 'N/A',
                'PRODUCTO': p.name,
                'CATEGORÍA': CATEGORY_MAP[p.category] || p.category,
                'UNIDAD BASE': p.unit_of_measure,
            };

            for (let i = 0; i < 8; i++) {
                row[`COMPRA ${i + 1}`] = history[i] ? Math.round(history[i].normalized_price) : null;
            }

            row['COSTO INTELIGENTE'] = smartCost > 0 ? Math.round(smartCost) : null;
            row['TENDENCIA'] = trend !== 0 ? `${trend > 0 ? '+' : ''}${trend.toFixed(1)}%` : '0%';

            return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Matriz de Costos Inteligente');
        
        const date = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `FruFresco_Matriz_Inteligente_${date}.xlsx`);
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'Outfit, sans-serif' }}>
            <div style={{ width: '96%', margin: '0 auto', padding: '2.5rem 2rem' }}>
                
                <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '2rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 400px' }}>
                        <Link href="/admin/commercial" style={{ 
                            textDecoration: 'none', 
                            color: '#94A3B8', 
                            fontWeight: '700', 
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            marginBottom: '0.8rem',
                            transition: 'color 0.2s'
                        }} onMouseEnter={(e) => e.currentTarget.style.color = '#0EA5E9'} onMouseLeave={(e) => e.currentTarget.style.color = '#94A3B8'}>
                            ← Volver al Centro de Operaciones
                        </Link>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                            Matriz Comercial <span style={{ color: '#0EA5E9', filter: 'drop-shadow(0 0 8px rgba(14, 165, 233, 0.2))' }}>Delta</span>
                        </h1>
                        <p style={{ color: '#64748B', margin: '0.5rem 0 0 0', fontSize: '1.1rem', fontWeight: '500' }}>
                            Inteligencia de precios y tendencias históricas para optimización de margen.
                        </p>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.6)', padding: '0.8rem', borderRadius: '20px', backdropFilter: 'blur(10px)', border: '1px solid #E2E8F0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <label style={{ fontWeight: '900', fontSize: '0.65rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '0.5rem' }}>Estrategia:</label>
                            <button 
                                onClick={() => setIsSmartModalOpen(true)}
                                style={{ 
                                    padding: '0.6rem 1.2rem', 
                                    borderRadius: '14px', 
                                    border: '1px solid #BAE6FD', 
                                    backgroundColor: '#F0F9FF', 
                                    color: '#0369A1', 
                                    fontWeight: '800', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.6rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    fontSize: '0.9rem'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                <Brain size={18} /> CI-Delta v2
                            </button>
                         </div>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <label style={{ fontWeight: '900', fontSize: '0.65rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '0.5rem' }}>Filtrar:</label>
                            <select 
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                style={{ 
                                    padding: '0.6rem 1.2rem', 
                                    borderRadius: '14px', 
                                    border: '1px solid #E2E8F0', 
                                    backgroundColor: 'white', 
                                    fontWeight: '800', 
                                    minWidth: '180px',
                                    fontSize: '0.9rem',
                                    color: '#1E293B',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="Todas">Todo el Catálogo</option>
                                {categories.map(c => <option key={c} value={c}>{CATEGORY_MAP[c] || c}</option>)}
                            </select>
                         </div>
                         
                         <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-end' }}>
                            <button 
                                onClick={fetchData} 
                                title="Sincronizar Datos"
                                style={{ 
                                    width: '45px',
                                    height: '45px',
                                    borderRadius: '14px', 
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
                                <TrendingUp size={20} />
                            </button>
                            <button
                                onClick={() => handleAuthorizeAll()}
                                disabled={isAuthorizing}
                                style={{ 
                                    padding: '0 1.2rem', 
                                    height: '45px',
                                    borderRadius: '14px', 
                                    border: '1px solid #0EA5E9', 
                                    backgroundColor: isAuthorizing ? '#F1F5F9' : '#0F172A', 
                                    color: 'white', 
                                    fontWeight: '900', 
                                    cursor: isAuthorizing ? 'not-allowed' : 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.6rem',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.2)'
                                }}
                                onMouseEnter={(e) => !isAuthorizing && (e.currentTarget.style.backgroundColor = '#1E293B')}
                                onMouseLeave={(e) => !isAuthorizing && (e.currentTarget.style.backgroundColor = '#0F172A')}
                            >
                                <Brain size={20} className={isAuthorizing ? 'animate-pulse' : ''} />
                                {isAuthorizing ? `AUTORIZANDO ${batchProgress}%` : 'AUTORIZACIÓN INTELIGENTE'}
                            </button>
                            <button
                                onClick={handleExport}
                                style={{ 
                                    padding: '0 1.2rem', 
                                    height: '45px',
                                    borderRadius: '14px', 
                                    border: '1px solid #10B981', 
                                    backgroundColor: '#ECFDF5', 
                                    color: '#065F46', 
                                    fontWeight: '800', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.5rem',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#D1FAE5'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ECFDF5'}
                            >
                                <BarChart3 size={18} /> Exportar
                            </button>
                         </div>
                    </div>
                </div>

                {/* --- DASHBOARD LINE (Stats Bar) --- */}
                {!loading && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1.2rem', marginBottom: '2.5rem' }}>
                        <StatCard 
                            label="SKUS Analizados" 
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
                            label="Alertas Comerciales" 
                            value={stats.pendingCost} 
                            subValue={stats.expiringSoon > 0 ? `⌛ ${stats.expiringSoon}` : 'Al día'}
                            color="#C2410C" 
                            bg="#FFF7ED"
                            icon={<ShieldAlert size={20} />}
                        />
                    </div>
                )}

                <div style={{ marginBottom: '2.5rem', display: 'flex', gap: '1.2rem', alignItems: 'center' }}>
                    <div style={{ 
                        flex: 1,
                        display: 'flex', 
                        alignItems: 'center', 
                        backgroundColor: 'white', 
                        borderRadius: '16px', 
                        border: '1px solid #E2E8F0', 
                        padding: '0.2rem 1.5rem', 
                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.03)', 
                        gap: '1rem',
                        transition: 'all 0.3s ease'
                    }} onFocusCapture={(e) => e.currentTarget.style.borderColor = '#0EA5E9'}>
                        <Search size={22} color="#94A3B8" />
                        <input 
                            type="text"
                            placeholder="Buscar productos por nombre, SKU o etiquetas..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ 
                                width: '100%', 
                                padding: '1.1rem 0', 
                                border: 'none', 
                                outline: 'none', 
                                fontSize: '1.1rem', 
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
                    
                    {/* Tooltip Icon for search help */}
                    <div 
                        style={{ position: 'relative' }} 
                        onMouseEnter={() => setShowHelp(true)}
                        onMouseLeave={() => setShowHelp(false)}
                    >
                        <div style={{ 
                            cursor: 'help', 
                            color: showHelp ? 'var(--primary)' : '#9CA3AF',
                            backgroundColor: 'white',
                            padding: '0.8rem',
                            borderRadius: '10px',
                            border: '1px solid #E5E7EB',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.2s'
                        }}>
                            <Info size={20} />
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
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                                        <th 
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
                                            <th key={i} style={{ padding: '0.8rem', minWidth: '95px', borderLeft: '1px solid #F3F4F6', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '900', color: '#6B7280', textTransform: 'uppercase' }}>COMPRA {i + 1}</div>
                                            </th>
                                        ))}

                                        <th 
                                            onClick={() => handleSort('smartCost')}
                                            style={{ 
                                                padding: '1.2rem', 
                                                minWidth: '130px', 
                                                borderLeft: '2px solid #E5E7EB',
                                                backgroundColor: '#F0FDF4',
                                                textAlign: 'center',
                                                verticalAlign: 'middle',
                                                cursor: 'pointer',
                                                userSelect: 'none'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                                                <div style={{ fontSize: '0.75rem', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '900', display: 'flex', alignItems: 'center' }}>COSTO <SortIcon field="smartCost" /></div>
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleSort('trend')}
                                            style={{ 
                                                padding: '1.2rem', 
                                                minWidth: '160px', 
                                                borderLeft: '2px solid #E5E7EB',
                                                position: 'sticky',
                                                right: 0,
                                                backgroundColor: '#F9FAFB',
                                                zIndex: 10,
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
                                                    <td style={{ 
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
                                                            <span style={{ 
                                                                fontSize: '0.7rem', 
                                                                color: '#2563EB', 
                                                                backgroundColor: '#EFF6FF', 
                                                                padding: '2px 8px', 
                                                                borderRadius: '6px', 
                                                                fontWeight: '900',
                                                                border: '1px solid #DBEAFE'
                                                            }}>
                                                                {p.sku || 'SIN SKU'}
                                                            </span>
                                                            <span style={{ fontSize: '0.75rem', color: '#9CA3AF', fontWeight: '600' }}>
                                                                {p.unit_of_measure}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    
                                                    {/* Row Cells for 8 purchases */}
                                                    {(() => {
                                                        // Find min normalized price for the medal
                                                        const prices = history.map(h => h.normalized_price);
                                                        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

                                                        return [...Array(8)].map((_, i) => {
                                                            const purchase = history[i];
                                                            const isBestPrice = purchase && purchase.normalized_price === minPrice && prices.length > 1;

                                                            return (
                                                                <td key={i} style={{ padding: '0.6rem', borderLeft: '1px solid #F9FAFB', textAlign: 'center', position: 'relative' }}>
                                                                    {purchase ? (
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                                                            <div style={{ 
                                                                                fontWeight: '800', 
                                                                                color: isBestPrice ? '#15803D' : '#059669', 
                                                                                fontSize: '0.9rem',
                                                                                backgroundColor: isBestPrice ? '#DCFCE7' : '#ECFDF5',
                                                                                padding: '0.3rem',
                                                                                borderRadius: '6px',
                                                                                border: isBestPrice ? '1px solid #4ADE80' : '1px solid #D1FAE5',
                                                                                position: 'relative'
                                                                            }}>
                                                                                ${Math.round(purchase.normalized_price).toLocaleString()}
                                                                                {isBestPrice && (
                                                                                    <div style={{ position: 'absolute', top: '-8px', right: '-8px', fontSize: '1rem', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))' }} title="Mejor precio histórico">🎖️</div>
                                                                                )}
                                                                            </div>
                                                                            <div style={{ fontSize: '0.6rem', color: '#9CA3AF', fontWeight: 'bold' }}>
                                                                                {format(new Date(purchase.created_at), 'dd MMM', { locale: es })}
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
                                                    <td style={{ 
                                                        padding: '1rem', 
                                                        borderLeft: '2px solid #E5E7EB', 
                                                        textAlign: 'center',
                                                        backgroundColor: manualOverrides[p.id] ? '#EFF6FF' : '#F0FDF4',
                                                        position: 'relative'
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
                                                                            color: isAligned ? '#10B981' : '#1E293B',
                                                                            fontSize: '1.2rem',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.4rem'
                                                                        }}>
                                                                            ${Math.round(smart).toLocaleString()}
                                                                            {isAligned && <CheckCircle2 size={16} color="#10B981" title="Precio Autorizado por IA" />}
                                                                            {harvestStatus === 'harvest' && <Brain size={16} color="#0EA5E9" className="animate-pulse" title="RECOMENDACIÓN: ABUNDANCIA ESTACIONAL" />}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase' }}>
                                                                            Sugerido IA
                                                                        </div>
                                                                        {currentManual && !isAligned && (
                                                                            <div style={{ fontSize: '0.55rem', color: '#3B82F6', fontWeight: '900', textTransform: 'uppercase', backgroundColor: '#DBEAFE', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                                                                                ✍️ Manual: ${Math.round(currentManual).toLocaleString()}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            }

                                                            return (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center' }}>
                                                                    <input 
                                                                        type="number"
                                                                        placeholder="Set cost"
                                                                        onClick={(e) => e.stopPropagation()} 
                                                                        onBlur={(e) => handleSaveManualCost(p.id, e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                e.stopPropagation();
                                                                                handleSaveManualCost(p.id, (e.target as HTMLInputElement).value);
                                                                            }
                                                                        }}
                                                                        style={{
                                                                            width: '90px',
                                                                            padding: '0.4rem',
                                                                            borderRadius: '6px',
                                                                            border: savingId === p.id ? '2px solid #10B981' : '2px solid #D1D5DB',
                                                                            textAlign: 'center',
                                                                            fontSize: '0.9rem',
                                                                            fontWeight: '700',
                                                                            color: '#1E40AF',
                                                                            outline: 'none',
                                                                            backgroundColor: savingId === p.id ? '#F0FDF4' : 'white',
                                                                            position: 'relative',
                                                                            zIndex: 20,
                                                                            transition: 'all 0.3s ease'
                                                                        }}
                                                                    />
                                                                    <span style={{ fontSize: '0.55rem', color: savingId === p.id ? '#10B981' : '#9CA3AF', fontWeight: '800', textTransform: 'uppercase' }}>
                                                                        {savingId === p.id ? '✓ Guardado' : 'Sin Referencia'}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>

                                                    {/* Trend Chart column - STICKY to the right */}
                                                    <td style={{ 
                                                        padding: '1rem', 
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
