'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import { 
    Printer, 
    ArrowLeft, 
    BookOpen, 
    Layers, 
    Filter, 
    Search, 
    Check, 
    Sparkles, 
    FileText,
    Calendar,
    Phone,
    Mail,
    Globe,
    Building2,
    Clock
} from 'lucide-react';
import Letterhead from '@/components/Letterhead';

const formatCategoryTitle = (cat?: string) => {
    if (!cat) return 'Otros Productos';
    const c = cat.toUpperCase().trim();
    if (c === 'FR' || c.startsWith('FRUT')) return 'Frutas Seleccionadas';
    if (c === 'VE' || c.startsWith('VERD')) return 'Verduras & Hortalizas';
    if (c === 'HO' || c.startsWith('HORT')) return 'Hortalizas de Hoja';
    if (c === 'TU' || c.startsWith('TUBER') || c.startsWith('TUBÉR')) return 'Tubérculos & Plátanos';
    if (c === 'DE' || c.startsWith('DESP') || c.startsWith('ABARR')) return 'Despensa & Abarrotes';
    if (c === 'LA' || c.startsWith('LACT') || c.startsWith('LÁCT')) return 'Lácteos & Derivados';
    if (c === 'CO' || c.startsWith('CONG') || c.startsWith('PULP')) return 'Congelados & Pulpas';
    if (c === 'PR' || c.startsWith('PROC') || c.startsWith('PELAD')) return 'Procesados & Pelados';
    if (c === 'HI' || c.startsWith('HIER')) return 'Hierbas Aromáticas';
    return cat;
};

const CATEGORY_PRIORITY = [
    'Verduras & Hortalizas',
    'Frutas Seleccionadas',
    'Hortalizas de Hoja',
    'Tubérculos & Plátanos',
    'Hierbas Aromáticas',
    'Despensa & Abarrotes',
    'Lácteos & Derivados',
    'Congelados & Pulpas',
    'Procesados & Pelados',
    'Otros Productos'
];

interface PricingModel {
    id: string;
    name: string;
    base_margin_percent: number;
    description?: string;
}

interface ProductItem {
    id: string;
    name: string;
    sku: string;
    accounting_id: string;
    category: string;
    unit_of_measure: string;
    base_price: number;
    resolved_price: number;
    show_on_web?: boolean;
}

export default function PrintCatalogPage() {
    const [pricingModels, setPricingModels] = useState<PricingModel[]>([]);
    const [selectedModelId, setSelectedModelId] = useState<string>('');
    const [products, setProducts] = useState<ProductItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [columnsMode, setColumnsMode] = useState<'single' | 'dual'>('dual');
    const printDocRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadCatalogData();
    }, []);

    const loadCatalogData = async () => {
        setLoading(true);
        try {
            // 1. Cargar Modelos de Precios
            const { data: pmData } = await supabase
                .from('pricing_models')
                .select('*')
                .order('name', { ascending: true });

            const models = pmData || [];
            setPricingModels(models);

            const defaultModel = models.find(m => m.name.toLowerCase().includes('institucional')) || models[0];
            if (defaultModel) {
                setSelectedModelId(defaultModel.id);
            }

            // 2. Cargar Productos Activos y Costos
            const [prodRes, matrixRes] = await Promise.all([
                supabase
                    .from('products')
                    .select('id, name, sku, accounting_id, category, unit_of_measure, base_price, is_active, show_on_web')
                    .eq('is_active', true)
                    .order('name', { ascending: true }),
                supabase
                    .from('commercial_cost_matrix')
                    .select('product_id, manual_cost, is_active')
                    .eq('is_active', true)
            ]);

            const costMap = new Map<string, number>();
            (matrixRes.data || []).forEach(m => {
                if (m.manual_cost && Number(m.manual_cost) > 0) {
                    costMap.set(m.product_id, Number(m.manual_cost));
                }
            });

            const marginPct = defaultModel?.base_margin_percent ? Number(defaultModel.base_margin_percent) : 34.5;

            const mappedProds: ProductItem[] = (prodRes.data || []).map(p => {
                const bPrice = Number(p.base_price || 0);
                const cost = costMap.get(p.id);
                let resPrice = bPrice;

                // Si hay costo de matriz, aplicar fórmula de markup sobre costo efectivo
                if (cost && cost > 0) {
                    resPrice = Math.round(cost * (1 + marginPct / 100));
                }
                if (resPrice <= 0) resPrice = bPrice;

                return {
                    id: p.id,
                    name: p.name,
                    sku: p.sku || '---',
                    accounting_id: p.accounting_id || '---',
                    category: p.category || 'Varios',
                    unit_of_measure: p.unit_of_measure || 'Kg',
                    base_price: bPrice,
                    resolved_price: resPrice,
                    show_on_web: p.show_on_web
                };
            });

            setProducts(mappedProds);
        } catch (err) {
            console.error('Error loading print catalog data:', err);
        } finally {
            setLoading(false);
        }
    };

    // Re-resolve prices when pricing model changes
    const handleSelectModel = (modelId: string) => {
        setSelectedModelId(modelId);
        const selModel = pricingModels.find(m => m.id === modelId);
        const marginPct = selModel?.base_margin_percent ? Number(selModel.base_margin_percent) : 34.5;

        setProducts(prev => prev.map(p => {
            const bPrice = p.base_price;
            // Estimated price based on model margin variation
            const resPrice = bPrice > 0 ? Math.round(bPrice * (1 + (marginPct - 34.5) / 100)) : bPrice;
            return {
                ...p,
                resolved_price: resPrice > 0 ? resPrice : bPrice
            };
        }));
    };

    // Group products by formatted category
    const groupedProducts = useMemo(() => {
        let filtered = products;

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(p => 
                p.name.toLowerCase().includes(term) || 
                p.sku.toLowerCase().includes(term) ||
                p.accounting_id.toLowerCase().includes(term) ||
                p.category.toLowerCase().includes(term)
            );
        }

        if (selectedCategory !== 'all') {
            filtered = filtered.filter(p => formatCategoryTitle(p.category) === selectedCategory);
        }

        const map = new Map<string, ProductItem[]>();
        filtered.forEach(p => {
            const cat = formatCategoryTitle(p.category);
            if (!map.has(cat)) map.set(cat, []);
            map.get(cat)!.push(p);
        });

        // Sort categories by priority
        const sortedCategories = Array.from(map.keys()).sort((a, b) => {
            const idxA = CATEGORY_PRIORITY.indexOf(a);
            const idxB = CATEGORY_PRIORITY.indexOf(b);
            const posA = idxA >= 0 ? idxA : 999;
            const posB = idxB >= 0 ? idxB : 999;
            if (posA !== posB) return posA - posB;
            return a.localeCompare(b);
        });

        return sortedCategories.map(cat => ({
            category: cat,
            items: map.get(cat)!.sort((a, b) => a.name.localeCompare(b.name))
        }));
    }, [products, searchTerm, selectedCategory]);

    const activeModelName = useMemo(() => {
        return pricingModels.find(m => m.id === selectedModelId)?.name || 'General Institucional';
    }, [pricingModels, selectedModelId]);

    const availableCategories = useMemo(() => {
        const set = new Set<string>();
        products.forEach(p => set.add(formatCategoryTitle(p.category)));
        return Array.from(set).sort((a, b) => {
            const idxA = CATEGORY_PRIORITY.indexOf(a);
            const idxB = CATEGORY_PRIORITY.indexOf(b);
            return (idxA >= 0 ? idxA : 999) - (idxB >= 0 ? idxB : 999);
        });
    }, [products]);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
            {/* FLOATING ACTION TOOLBAR (HIDDEN ON PRINT) */}
            <div className="no-print" style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(10px)',
                borderBottom: `1px solid ${THEME.colors.border}`,
                padding: '0.75rem 2rem',
                boxShadow: '0 2px 10px rgba(0,0,0,0.05)'
            }}>
                <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Link
                            href="/admin/commercial"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                backgroundColor: 'white',
                                border: `1px solid ${THEME.colors.border}`,
                                color: THEME.colors.textSecondary,
                                textDecoration: 'none'
                            }}
                            title="Volver a la consola comercial"
                        >
                            <ArrowLeft size={18} />
                        </Link>
                        <div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>
                                Dirección Comercial • Dominio 7
                            </div>
                            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <BookOpen size={20} color={THEME.colors.primary} /> Catálogo Oficial Impreso & Tarifa Institucional
                            </h1>
                        </div>
                    </div>

                    {/* CONTROLS */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Model Selector */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: THEME.colors.textSecondary }}>Modelo:</span>
                            <select
                                value={selectedModelId}
                                onChange={e => handleSelectModel(e.target.value)}
                                style={{
                                    padding: '0.4rem 0.75rem',
                                    borderRadius: '8px',
                                    border: `1px solid ${THEME.colors.border}`,
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    outline: 'none',
                                    backgroundColor: 'white'
                                }}
                            >
                                {pricingModels.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Category Selector */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: THEME.colors.textSecondary }}>Categoría:</span>
                            <select
                                value={selectedCategory}
                                onChange={e => setSelectedCategory(e.target.value)}
                                style={{
                                    padding: '0.4rem 0.75rem',
                                    borderRadius: '8px',
                                    border: `1px solid ${THEME.colors.border}`,
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    outline: 'none',
                                    backgroundColor: 'white'
                                }}
                            >
                                <option value="all">Todas las Categorías</option>
                                {availableCategories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>

                        {/* Search Input */}
                        <div style={{ position: 'relative', width: '200px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                            <input
                                type="text"
                                placeholder="Filtrar producto..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.4rem 0.6rem 0.4rem 1.7rem',
                                    borderRadius: '8px',
                                    border: `1px solid ${THEME.colors.border}`,
                                    fontSize: '0.75rem',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        {/* Column Switcher */}
                        <div style={{ display: 'flex', gap: '2px', backgroundColor: '#F1F5F9', padding: '2px', borderRadius: '8px' }}>
                            <button
                                onClick={() => setColumnsMode('single')}
                                style={{
                                    padding: '0.35rem 0.65rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    backgroundColor: columnsMode === 'single' ? 'white' : 'transparent',
                                    color: columnsMode === 'single' ? THEME.colors.primary : THEME.colors.textSecondary,
                                    cursor: 'pointer'
                                }}
                            >
                                1 Col
                            </button>
                            <button
                                onClick={() => setColumnsMode('dual')}
                                style={{
                                    padding: '0.35rem 0.65rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    backgroundColor: columnsMode === 'dual' ? 'white' : 'transparent',
                                    color: columnsMode === 'dual' ? THEME.colors.primary : THEME.colors.textSecondary,
                                    cursor: 'pointer'
                                }}
                            >
                                2 Col (Densa)
                            </button>
                        </div>

                        {/* Print Button */}
                        <button
                            onClick={handlePrint}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '0.45rem 1rem',
                                borderRadius: '8px',
                                backgroundColor: THEME.colors.primary,
                                color: 'white',
                                border: 'none',
                                fontSize: '0.8rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(13,122,87,0.2)'
                            }}
                        >
                            <Printer size={15} /> Imprimir / PDF
                        </button>
                    </div>
                </div>
            </div>

            {/* PRINT CONTAINER (A4 / LETTER OPTIMIZED) */}
            <div style={{ maxWidth: '1000px', margin: '2rem auto', padding: '0 1rem' }}>
                <div 
                    ref={printDocRef}
                    id="print-document-root"
                    style={{
                        backgroundColor: 'white',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                        borderRadius: '12px',
                        overflow: 'hidden'
                    }}
                >
                    <Letterhead
                        title="PORTAFOLIO OFICIAL & TARIFA INSTITUCIONAL"
                        subtitle={`Tarifa de Precios Vigente • Modelo: ${activeModelName.toUpperCase()}`}
                        badge="TARIFA OFICIAL B2B"
                        badgeVariant="emerald"
                        date={new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
                        reference={`CAT-${new Date().getFullYear()}-${new Date().getMonth() + 1}`}
                        showWatermark={false}
                    >
                        <div style={{ padding: '0.5rem 0' }}>
                            {/* INTRODUCTORY STRIP */}
                            <div style={{
                                backgroundColor: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                padding: '0.75rem 1rem',
                                marginBottom: '1.25rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '0.75rem',
                                color: THEME.colors.textSecondary
                            }}>
                                <div>
                                    <strong style={{ color: THEME.colors.textMain }}>Garantía de Calidad FruFresco:</strong> Selección directa en Corabastos, cadena de frío y entrega puntual matutina.
                                </div>
                                <div style={{ fontWeight: 700, color: THEME.colors.primary }}>
                                    {products.length} productos disponibles
                                </div>
                            </div>

                            {/* CATEGORIES AND PRODUCTS */}
                            {loading ? (
                                <div style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                    Cargando catálogo oficial...
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    {groupedProducts.map(group => (
                                        <div key={group.category} style={{ breakInside: 'avoid' }}>
                                            {/* Category Heading Banner */}
                                            <div style={{
                                                backgroundColor: '#0D7A57',
                                                color: 'white',
                                                padding: '4px 10px',
                                                borderRadius: '4px',
                                                fontSize: '0.8rem',
                                                fontWeight: 800,
                                                letterSpacing: '0.04em',
                                                textTransform: 'uppercase',
                                                marginBottom: '6px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <span>{group.category}</span>
                                                <span style={{ fontSize: '0.7rem', opacity: 0.85, fontWeight: 600 }}>{group.items.length} ítems</span>
                                            </div>

                                            {/* Product Table (Dual or Single Column) */}
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: columnsMode === 'dual' ? '1fr 1fr' : '1fr',
                                                gap: '8px'
                                            }}>
                                                {/* In dual column, split items into 2 chunks */}
                                                {columnsMode === 'dual' ? (
                                                    <>
                                                        <ProductSubTable items={group.items.slice(0, Math.ceil(group.items.length / 2))} />
                                                        <ProductSubTable items={group.items.slice(Math.ceil(group.items.length / 2))} />
                                                    </>
                                                ) : (
                                                    <ProductSubTable items={group.items} />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* COMMERCIAL TERMS & CONDITIONS FOOTER */}
                            <div style={{
                                marginTop: '2rem',
                                paddingTop: '1rem',
                                borderTop: '2px dashed #CBD5E1',
                                fontSize: '0.72rem',
                                color: '#475569',
                                lineHeight: '1.5',
                                breakInside: 'avoid'
                            }}>
                                <div style={{ fontWeight: 800, color: THEME.colors.textMain, marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Términos Comerciales & Políticas de Despacho:
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem' }}>
                                    <div>• <strong>Horario de Recepción:</strong> Pedidos recibidos hasta las 8:00 PM para entrega al día siguiente.</div>
                                    <div>• <strong>Pedido Mínimo:</strong> Institucional $150.000 COP sin costo de flete en zona metropolitana.</div>
                                    <div>• <strong>Variabilidad de Plaza:</strong> Precios sujetos a oferta y demanda semanal de Corabastos.</div>
                                    <div>• <strong>Garantía Post-Venta:</strong> Reclamaciones de calidad dentro de las primeras 12h de recibo.</div>
                                </div>
                            </div>
                        </div>
                    </Letterhead>
                </div>
            </div>

            {/* PRINT CSS STYLES */}
            <style jsx global>{`
                @media print {
                    .no-print {
                        display: none !important;
                    }
                    body {
                        background-color: white !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    #print-document-root {
                        box-shadow: none !important;
                        border: none !important;
                        border-radius: 0 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    @page {
                        size: letter portrait;
                        margin: 10mm 10mm 10mm 10mm;
                    }
                }
            `}</style>
        </div>
    );
}

function ProductSubTable({ items }: { items: ProductItem[] }) {
    if (items.length === 0) return null;
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
            <thead>
                <tr style={{ borderBottom: '1px solid #CBD5E1', color: '#64748B', textAlign: 'left' }}>
                    <th style={{ padding: '3px 6px', fontWeight: 800 }}>PRODUCTO</th>
                    <th style={{ padding: '3px 6px', fontWeight: 800, width: '45px' }}>UND</th>
                    <th style={{ padding: '3px 6px', fontWeight: 800, textAlign: 'right', width: '75px' }}>TARIFA</th>
                </tr>
            </thead>
            <tbody>
                {items.map((it, idx) => (
                    <tr key={it.id || idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? 'white' : '#FAFAFA' }}>
                        <td style={{ padding: '3px 6px', fontWeight: 700, color: '#1E293B' }}>
                            {it.name}
                        </td>
                        <td style={{ padding: '3px 6px', color: '#64748B', fontSize: '0.7rem' }}>
                            {it.unit_of_measure}
                        </td>
                        <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 800, color: '#047857' }}>
                            {formatMoney(it.resolved_price)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
