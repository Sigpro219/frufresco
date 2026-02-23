'use client';

import { useState, useEffect, Fragment, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { logError } from '@/lib/errorUtils';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import * as XLSX from 'xlsx';

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
}

export default function CostMatrixPage() {
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [purchaseHistory, setPurchaseHistory] = useState<Record<string, Purchase[]>>({}); // { productId: [purchases] }
    const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
    const [categories, setCategories] = useState<string[]>([]);
    const [avgWindow, setAvgWindow] = useState<number>(3); // Default: average of last 3 prices
    const [searchTerm, setSearchTerm] = useState<string>('');
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        fetchData();
        return () => {
            isMounted.current = false;
        };
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch products
            const { data: productsData, error: pError } = await supabase
                .from('products')
                .select('*')
                .order('category', { ascending: true })
                .order('name', { ascending: true });

            if (pError) throw pError;
            if (!isMounted.current) return;
            setProducts(productsData || []);

            // Extract unique categories
            const cats = Array.from(new Set(productsData?.map(p => p.category) || [])).filter(Boolean) as string[];
            setCategories(['Todas', ...cats]);

            // 2. Fetch conversions
            const { data: convData, error: cError } = await supabase.from('product_conversions').select('*');
            if (cError) {
                logError('Matrix fetchData conversions', cError);
            }
            if (!isMounted.current) return;

            // 3. Fetch last purchases for ALL products
            const { data: purchasesData, error: iError } = await supabase
                .from('purchases')
                .select('product_id, unit_price, created_at, purchase_unit')
                .order('created_at', { ascending: false });

            if (iError) throw iError;
            if (!isMounted.current) return;

            // 4. Normalize and Group
            const historyMap: Record<string, Purchase[]> = {};
            
            if (purchasesData) {
                purchasesData.forEach((p: { product_id: string; unit_price: number; created_at: string; purchase_unit: string }) => {
                    if (!p.product_id) return;
                    if (!historyMap[p.product_id]) historyMap[p.product_id] = [];
                    if (historyMap[p.product_id].length < 8) {
                        // Normalization logic (Same as Quote Page)
                        const product = productsData?.find((pd) => pd.id === p.product_id);
                        let normalizedPrice = p.unit_price;

                        if (product && p.purchase_unit && p.purchase_unit !== product.unit_of_measure) {
                            const conv = (convData || []).find((c) => 
                                c.product_id === p.product_id && 
                                c.from_unit === p.purchase_unit && 
                                c.to_unit === product.unit_of_measure
                            );
                            if (conv && conv.conversion_factor) {
                                normalizedPrice = normalizedPrice / conv.conversion_factor;
                            }
                        }

                        historyMap[p.product_id].push({
                            ...p,
                            normalized_price: normalizedPrice
                        });
                    }
                });
            }

            // Reverse each list so it's Oldest -> Newest 
            Object.keys(historyMap).forEach(pid => {
                historyMap[pid].reverse();
            });

            setPurchaseHistory(historyMap);

        } catch (err: unknown) {
            if (!isMounted.current) return;
            logError('Matrix fetchData', err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        const d = new Date(dateString);
        return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
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
        
        // Trend calculation
        const first = prices[0];
        const last = prices[prices.length - 1];
        const trendPercent = ((last - first) / first) * 100;
        const isUp = last > first;
        const isNeutral = last === first;

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', justifyContent: 'center' }}>
                <svg width={width} height={height} style={{ overflow: 'visible' }}>
                    <path
                        d={pathData}
                        fill="none"
                        stroke={isUp ? '#EF4444' : isNeutral ? '#6B7280' : '#10B981'}
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                    {points.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={isUp ? '#EF4444' : isNeutral ? '#6B7280' : '#10B981'} />
                    ))}
                </svg>
                <div style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: '900', 
                    color: isUp ? '#EF4444' : isNeutral ? '#6B7280' : '#10B981',
                    display: 'flex',
                    alignItems: 'center',
                    minWidth: '45px'
                }}>
                    {isNeutral ? '—' : isUp ? '▲' : '▼'} {Math.abs(trendPercent).toFixed(1)}%
                </div>
            </div>
        );
    };

    const filteredProducts = products.filter(p => {
        const matchesCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
        const matchesSearch = searchTerm === '' || 
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesCategory && matchesSearch;
    });

    // --- DASHBOARD STATS ---
    const stats = (() => {
        let totalTrend = 0;
        let productsWithTrend = 0;
        let rising = 0;
        let falling = 0;

        filteredProducts.forEach(p => {
            const history = purchaseHistory[p.id];
            if (history && history.length >= 2) {
                const first = history[0].normalized_price;
                const last = history[history.length - 1].normalized_price;
                const trend = ((last - first) / first) * 100;
                
                totalTrend += trend;
                productsWithTrend++;
                if (last > first) rising++;
                else if (last < first) falling++;
            }
        });

        return {
            avgTrend: productsWithTrend > 0 ? totalTrend / productsWithTrend : 0,
            rising,
            falling,
            totalSKU: filteredProducts.length
        };
    })();

    const handleExport = () => {
        const exportData = filteredProducts.map(p => {
            const history = purchaseHistory[p.id] || [];
            
            // Calculate Average based on window
            const lastNPurchases = history.slice(-avgWindow);
            const sum = lastNPurchases.reduce((acc, curr) => acc + curr.normalized_price, 0);
            const avg = lastNPurchases.length > 0 ? sum / lastNPurchases.length : 0;
            
            // Calculate Trend
            const first = history.length >= 2 ? history[0].normalized_price : 0;
            const last = history.length >= 2 ? history[history.length - 1].normalized_price : 0;
            const trend = first > 0 ? ((last - first) / first) * 100 : 0;

            const row: any = {
                'SKU': p.sku || 'N/A',
                'PRODUCTO': p.name,
                'CATEGORÍA': p.category,
                'UNIDAD BASE': p.unit_of_measure,
            };

            // Add purchase columns (8 columns)
            for (let i = 0; i < 8; i++) {
                row[`COMPRA ${i + 1}`] = history[i] ? Math.round(history[i].normalized_price) : null;
            }

            row['COSTO PROMEDIO'] = avg > 0 ? Math.round(avg) : null;
            row['TENDENCIA'] = trend !== 0 ? `${trend > 0 ? '+' : ''}${trend.toFixed(1)}%` : '0%';

            return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Matriz de Precios');
        
        // Final filename with date
        const date = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `Frubana_Matriz_Costos_${date}.xlsx`);
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB', fontFamily: 'Inter, sans-serif' }}>
            <Navbar />
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
                
                <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <Link href="/admin/commercial" style={{ textDecoration: 'none', color: '#6B7280', fontWeight: '600', fontSize: '0.9rem' }}>← Volver al Panel</Link>
                        <h1 style={{ fontSize: '2rem', fontWeight: '900', color: '#111827', margin: '0.5rem 0 0 0' }}>Matriz de Precios Históricos 📊</h1>
                        <p style={{ color: '#6B7280', margin: '0.2rem 0 0 0' }}>Historial, tendencia y SKUs de los últimos precios registrados.</p>
                    </div>

                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <label style={{ fontWeight: '800', fontSize: '0.75rem', color: '#6B7280', textTransform: 'uppercase' }}>Promediar últimos:</label>
                            <select 
                                value={avgWindow}
                                onChange={(e) => setAvgWindow(Number(e.target.value))}
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: '#F3F4F6', fontWeight: '700', color: '#111827' }}
                            >
                                {[2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n} precios</option>)}
                            </select>
                         </div>

                         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <label style={{ fontWeight: '800', fontSize: '0.75rem', color: '#6B7280', textTransform: 'uppercase' }}>Categoría:</label>
                            <select 
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: 'white', fontWeight: '700' }}
                            >
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                         </div>
                         
                         <button 
                            onClick={fetchData} 
                            style={{ padding: '0.8rem 1.2rem', borderRadius: '10px', border: 'none', backgroundColor: '#111827', color: 'white', fontWeight: 'bold', cursor: 'pointer', alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                         >
                            🔄 Actualizar
                         </button>
                    </div>
                </div>

                {/* --- DASHBOARD LINE (Stats Bar) --- */}
                {!loading && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                        <div style={{ backgroundColor: 'white', padding: '1.2rem', borderRadius: '12px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: '0.3rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase' }}>Productos Analizados</span>
                            <span style={{ fontSize: '1.8rem', fontWeight: '900', color: '#111827' }}>{stats.totalSKU} <small style={{ fontSize: '0.8rem', color: '#9CA3AF', fontWeight: '500' }}>SKUs</small></span>
                        </div>
                        <div style={{ backgroundColor: 'white', padding: '1.2rem', borderRadius: '12px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: '0.3rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase' }}>Tendencia Global (AVG)</span>
                            <span style={{ fontSize: '1.8rem', fontWeight: '900', color: stats.avgTrend > 0 ? '#EF4444' : '#10B981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {stats.avgTrend > 0 ? '▲' : '▼'} {Math.abs(stats.avgTrend).toFixed(1)}%
                            </span>
                        </div>
                        <div style={{ backgroundColor: '#FEF2F2', padding: '1.2rem', borderRadius: '12px', border: '1px solid #FEE2E2', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#B91C1C', textTransform: 'uppercase' }}>Costos en Alza</span>
                            <span style={{ fontSize: '1.8rem', fontWeight: '900', color: '#991B1B' }}>{stats.rising} <small style={{ fontSize: '0.8rem', color: '#F87171', fontWeight: '500' }}>Productos</small></span>
                        </div>
                        <div style={{ backgroundColor: '#F0FDF4', padding: '1.2rem', borderRadius: '12px', border: '1px solid #DCFCE7', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#15803D', textTransform: 'uppercase' }}>Costos en Baja</span>
                            <span style={{ fontSize: '1.8rem', fontWeight: '900', color: '#166534' }}>{stats.falling} <small style={{ fontSize: '0.8rem', color: '#4ADE80', fontWeight: '500' }}>Oportunidades</small></span>
                        </div>
                    </div>
                )}

                {/* --- INTELLIGENT SEARCH BAR --- */}
                <div style={{ marginBottom: '2rem', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #E5E7EB', padding: '0.2rem 1.2rem', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', gap: '1rem' }}>
                        <span style={{ fontSize: '1.2rem' }}>🔍</span>
                        <input 
                            type="text"
                            placeholder="Buscar por nombre de producto o SKU específico (ej: FRU-001)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ 
                                width: '100%', 
                                padding: '1rem 0', 
                                border: 'none', 
                                outline: 'none', 
                                fontSize: '1.05rem', 
                                fontWeight: '500',
                                color: '#111827'
                            }}
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.2rem' }}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem' }}>
                    {searchTerm && (
                        <div style={{ marginRight: 'auto', fontSize: '0.9rem', color: '#6B7280', fontWeight: '600' }}>
                            Resultados para: <span style={{ color: '#2563EB' }}>&quot;{searchTerm}&quot;</span> ({filteredProducts.length} encontrados)
                        </div>
                    )}
                    <button 
                        onClick={handleExport}
                        style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid #10B981', backgroundColor: '#ECFDF5', color: '#065F46', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}
                    >
                        📊 Exportar a Excel
                    </button>
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
                                        <th style={{ 
                                            padding: '1.2rem 1.5rem', 
                                            minWidth: '250px', 
                                            position: 'sticky', 
                                            left: 0, 
                                            backgroundColor: '#F9FAFB', 
                                            zIndex: 10,
                                            boxShadow: '2px 0 5px rgba(0,0,0,0.02)'
                                        }}>
                                            <div style={{ fontSize: '0.75rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '900' }}>PRODUCTO / CATEGORÍA</div>
                                        </th>
                                        {/* Column Headers for 8 purchases */}
                                        {[...Array(8)].map((_, i) => (
                                            <th key={i} style={{ padding: '0.8rem', minWidth: '95px', borderLeft: '1px solid #F3F4F6', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '900', color: '#6B7280', textTransform: 'uppercase' }}>COMPRA {i + 1}</div>
                                            </th>
                                        ))}

                                        <th style={{ 
                                            padding: '1.2rem', 
                                            minWidth: '130px', 
                                            borderLeft: '2px solid #E5E7EB',
                                            backgroundColor: '#F0FDF4',
                                            textAlign: 'center'
                                        }}>
                                            <div style={{ fontSize: '0.7rem', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '900' }}>COSTO PROMEDIO</div>
                                            <div style={{ fontSize: '0.6rem', color: '#22C55E', fontWeight: '800' }}>ÚLTIMOS {avgWindow}</div>
                                        </th>

                                        <th style={{ 
                                            padding: '1.2rem', 
                                            minWidth: '160px', 
                                            borderLeft: '2px solid #E5E7EB',
                                            position: 'sticky',
                                            right: 0,
                                            backgroundColor: '#F9FAFB',
                                            zIndex: 10,
                                            boxShadow: '-2px 0 5px rgba(0,0,0,0.02)'
                                        }}>
                                            <div style={{ fontSize: '0.75rem', color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '900' }}>TENDENCIA</div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredProducts.map((p, idx) => {
                                        const prevProduct = idx > 0 ? filteredProducts[idx - 1] : null;
                                        const showCategoryHeader = !prevProduct || prevProduct.category !== p.category;
                                        const history = purchaseHistory[p.id] || [];

                                        return (
                                            <Fragment key={p.id}>
                                                {showCategoryHeader && (
                                                    <tr style={{ backgroundColor: '#F3F4F6' }}>
                                                        <td colSpan={12} style={{ padding: '0.6rem 1.5rem', fontWeight: '900', fontSize: '0.75rem', color: '#4B5563', textTransform: 'uppercase' }}>
                                                            📂 {p.category}
                                                        </td>
                                                    </tr>
                                                )}
                                                <tr style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.2s' }}>
                                                    <td style={{ 
                                                        padding: '1rem 1.5rem', 
                                                        position: 'sticky', 
                                                        left: 0, 
                                                        backgroundColor: 'white', 
                                                        zIndex: 5,
                                                        boxShadow: '2px 0 5px rgba(0,0,0,0.02)'
                                                    }}>
                                                        <div style={{ fontWeight: '800', color: '#111827', fontSize: '1rem' }}>{p.name}</div>
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
                                                                                {formatDate(purchase.created_at)}
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <span style={{ color: '#F3F4F6', fontSize: '0.8rem' }}>—</span>
                                                                    )}
                                                                </td>
                                                            );
                                                        });
                                                    })()}

                                                    {/* NEW: Smart Average Cost Column */}
                                                    {(() => {
                                                        const lastNPurchases = history.slice(-avgWindow);
                                                        const sum = lastNPurchases.reduce((acc, curr) => acc + curr.normalized_price, 0);
                                                        const avg = lastNPurchases.length > 0 ? sum / lastNPurchases.length : 0;
                                                        return (
                                                            <td style={{ 
                                                                padding: '1rem', 
                                                                borderLeft: '2px solid #E5E7EB', 
                                                                textAlign: 'center',
                                                                backgroundColor: '#F0FDF4'
                                                            }}>
                                                                {avg > 0 ? (
                                                                    <div style={{ 
                                                                        fontWeight: '900', 
                                                                        color: '#166534', 
                                                                        fontSize: '1.1rem'
                                                                    }}>
                                                                        ${Math.round(avg).toLocaleString()}
                                                                    </div>
                                                                ) : (
                                                                    <span style={{ color: '#D1D5DB' }}>—</span>
                                                                )}
                                                            </td>
                                                        );
                                                    })()}

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

                <div style={{ marginTop: '2rem', backgroundColor: '#EFF6FF', padding: '1.5rem', borderRadius: '12px', border: '1px solid #DBEAFE' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#1E40AF', fontWeight: '800' }}>💡 Sobre esta matriz</h3>
                    <p style={{ margin: '0.5rem 0 0 0', color: '#3B82F6', fontSize: '0.9rem', lineHeight: '1.5' }}>
                        Esta vista permite a los comerciales ver rápidamente qué precios se han ofrecido anteriormente. 
                        Es ideal para mantener consistencia en las ofertas y detectar variaciones de precios entre clientes.
                    </p>
                </div>
            </div>
        </main>
    );
}
