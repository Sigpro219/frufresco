'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, Product } from '@/lib/supabase';
import Toast from '@/components/Toast';
import Link from 'next/link';
import VariantModal from '@/components/VariantModal';
import CreateProductModal from '@/components/CreateProductModal';
import { CATEGORY_MAP } from '@/lib/constants';
import Image from 'next/image';
import { 
    Search,
    ChevronLeft,
    ChevronRight,
    X,
    Info,
    Eye,
    EyeOff,
    Image as ImageIcon,
    Filter,
    Globe,
    CheckCircle,
    Package,
    AlertCircle,
    DollarSign,
    Scale,
    ShoppingBag,
    Sparkles
} from 'lucide-react';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';

export default function AdminProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isInfoGuideOpen, setIsInfoGuideOpen] = useState(false);
    const ITEMS_PER_PAGE = 50;

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
        if ((window as any).showToast) {
            (window as any).showToast(message, type);
        } else {
            console.warn(`Toast Fallback [${type}]: ${message}`);
        }
    }, []);

    const fetchProducts = useCallback(async () => {
        try {
            setLoading(true);
            let allProducts: Product[] = [];
            let from = 0;
            const limit = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('products')
                    .select('*')
                    .eq('show_on_web', true)
                    .order('accounting_id', { ascending: true })
                    .range(from, from + limit - 1);
                
                if (error) throw error;
                
                if (data && data.length > 0) {
                    allProducts = [...allProducts, ...data];
                    from += limit;
                    if (data.length < limit) hasMore = false;
                } else {
                    hasMore = false;
                }
            }

            setProducts(allProducts);
        } catch (err) {
            console.error('Unexpected fetch error:', err);
            showToast('Falla en la carga del catálogo completo', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    const [savingId, setSavingId] = useState<string | null>(null);
    const [isSyncingPrices, setIsSyncingPrices] = useState(false);
    const [autosyncEnabled, setAutosyncEnabled] = useState(true);
    const [b2cModelId, setB2cModelId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'hidden'>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    useEffect(() => {
        fetchProducts();
        fetchAutosyncStatus();
    }, [fetchProducts]);

    const fetchAutosyncStatus = async () => {
        const { data, error } = await supabase
            .from('pricing_models')
            .select('id, b2c_autosync_enabled')
            .eq('name', 'Clientes B2C')
            .single();
        
        if (data) {
            setAutosyncEnabled(data.b2c_autosync_enabled);
            setB2cModelId(data.id);
        }
    };

    const toggleAutosync = async () => {
        const newValue = !autosyncEnabled;
        setAutosyncEnabled(newValue);
        
        if (b2cModelId) {
            const { error } = await supabase
                .from('pricing_models')
                .update({ b2c_autosync_enabled: newValue })
                .eq('id', b2cModelId);
            
            if (error) {
                showToast('No se pudo guardar la configuración', 'error');
                setAutosyncEnabled(!newValue);
            } else {
                showToast(`Auto-sincronización ${newValue ? 'activada' : 'desactivada'}`, 'info');
            }
        }
    };

    const updateProductField = async (id: string, field: keyof Product, value: string | number | boolean | any[] | null) => {
        // No guardar si el valor es el mismo para ahorrar peticiones
        const currentProduct = products.find(p => p.id === id);
        if (currentProduct && currentProduct[field] === value) return;

        setSavingId(id);
        const { error } = await supabase
            .from('products')
            .update({ [field]: value })
            .eq('id', id);

        if (error) {
            console.error('Error updating product:', error);
            showToast('Error al guardar: ' + error.message, 'error');
        } else {
            setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
            showToast('Cambio guardado con éxito', 'success');
        }
        setSavingId(null);
    };

    const toggleActive = async (id: string, currentStatus: boolean | undefined | null) => {
        await updateProductField(id, 'is_active', !(currentStatus ?? true));
    };



    const handleImageUpload = async (id: string, file: File) => {
        setSavingId(id);
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(filePath, file, { upsert: true });

        if (uploadError) {
            console.error('Error subiendo imagen:', uploadError);
            showToast('Error al subir imagen: ' + uploadError.message, 'error');
            setSavingId(null);
            return;
        }

        const { data: { publicUrl } } = supabase.storage
            .from('product-images')
            .getPublicUrl(filePath);

        await updateProductField(id, 'image_url', publicUrl);
    };

    const handleSaveVariants = async (optionsConfig: any[] | null, variants: any[] | null): Promise<boolean> => {
        if (!selectedProduct || !optionsConfig || !variants) return false;

        try {
            const { error: prodError } = await supabase
                .from('products')
                .update({
                    options_config: optionsConfig,
                    variants: variants,
                    options: (optionsConfig || []).reduce((acc: any, opt: any) => {
                        acc[opt.name] = opt.values;
                        return acc;
                    }, {})
                })
                .eq('id', selectedProduct.id);

            if (prodError) throw prodError;

            // Sincronizar tabla dedicada product_variants
            if (variants && variants.length > 0) {
                await supabase
                    .from('product_variants')
                    .delete()
                    .eq('product_id', selectedProduct.id);

                const formattedVariants = variants.map((v: any) => ({
                    product_id: selectedProduct.id,
                    sku: v.sku,
                    options: v.options,
                    image_url: v.image_url,
                    price_adjustment_percent: v.price_adjustment_percent || 0,
                    is_active: v.is_active ?? true
                }));

                const { error: variantError } = await supabase
                    .from('product_variants')
                    .insert(formattedVariants);

                if (variantError) throw variantError;
            }

            setProducts(products.map(p => p.id === selectedProduct.id ? { ...p, options_config: optionsConfig, variants: variants } : p));
            showToast('Variantes actualizadas', 'success');
            return true;
        } catch (err: any) {
            console.error('Error al guardar variantes:', err);
            alert('Error al guardar variantes: ' + err.message);
            return false;
        }
    };

    const handleVariantImageUpload = async (file: File) => {
        try {
            const fileExt = file.name.split('.').pop();
            const cleanFileName = `variant-${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
            const filePath = `${cleanFileName}`;

            console.log('Iniciando subida de variante:', filePath);

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) {
                console.error('Error supabase upload:', uploadError);
                alert(`Error al subir imagen: ${uploadError.message}`);
                return null;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(filePath);

            console.log('Upload exitoso, URL:', publicUrl);
            return `${publicUrl}?t=${Date.now()}`;
        } catch (err: any) {
            console.error('Error inesperado upload:', err);
            alert(`Error inesperado: ${err.message}`);
            return null;
        }
    };

    // --- SYNC B2C PRICES LOGIC ---
    const syncB2CWebPrices = async () => {
        if (!confirm('¿Sincronizar precios en tienda? Se calculará (Costo + Margen B2C + IVA) redondeando al siguiente múltiplo de $50.')) return;

        setIsSyncingPrices(true);
        try {
            console.log('🚀 Iniciando sincronización de tienda desde Panel B2C...');

            // 1. Obtener Modelo B2C y sus reglas
            const { data: b2cModel } = await supabase
                .from('pricing_models')
                .select('*')
                .eq('name', 'Clientes B2C')
                .single();

            if (!b2cModel) {
                alert('No se encontró el modelo \"Clientes B2C\". Créalo en la configuración de precios primero.');
                setIsSyncingPrices(false);
                return;
            }

            const { data: b2cRules } = await supabase
                .from('pricing_rules')
                .select('*')
                .eq('model_id', b2cModel.id);

            const rulesMap: Record<string, number> = {};
            b2cRules?.forEach(r => { rulesMap[r.product_id] = r.margin_adjustment; });

            // 1.1 Obtener TODAS las conversiones para el cálculo
            const { data: convData } = await supabase
                .from('product_conversions')
                .select('*');
            
            const conversions = convData || [];

            // 2. Obtener Costos (Matriz) con sus unidades
            const { data: lastPurchases } = await supabase
                .from('purchases')
                .select('product_id, unit_price, purchase_unit')
                .order('created_at', { ascending: false });

            const costMap: Record<string, { price: number, unit: string }> = {};
            lastPurchases?.forEach(p => {
                if (!costMap[p.product_id]) {
                    costMap[p.product_id] = { price: p.unit_price, unit: p.purchase_unit };
                }
            });

            // 3. Procesar Productos
            const updates = products.map(prod => {
                const purchaseInfo = costMap[prod.id];
                if (!purchaseInfo || purchaseInfo.price === 0) return null;

                let realCost = purchaseInfo.price;

                // --- LÓGICA DE CONVERSIÓN ---
                if (purchaseInfo.unit && purchaseInfo.unit !== prod.unit_of_measure) {
                    // Buscar si 1 Unidad de Compra = X Unidades de Venta
                    const convAB = conversions.find(c => 
                        c.product_id === prod.id && 
                        c.from_unit === purchaseInfo.unit && 
                        c.to_unit === prod.unit_of_measure
                    );

                    if (convAB && convAB.conversion_factor) {
                        realCost = purchaseInfo.price / convAB.conversion_factor;
                    } else {
                        // Buscar si 1 Unidad de Venta = X Unidades de Compra
                        const convBA = conversions.find(c => 
                            c.product_id === prod.id && 
                            c.from_unit === prod.unit_of_measure && 
                            c.to_unit === purchaseInfo.unit
                        );
                        if (convBA && convBA.conversion_factor) {
                            realCost = purchaseInfo.price * convBA.conversion_factor;
                        }
                    }
                }

                const baseMargin = b2cModel.base_margin_percent;
                const adjustment = rulesMap[prod.id] || 0;
                const finalMargin = (baseMargin + adjustment) / 100;
                
                // Formula: Costo Real x (1 + Margen) x (1 + IVA) -> Redondear $50
                const priceBeforeTax = realCost * (1 + finalMargin);
                const ivaRate = (prod.iva_rate || 0) / 100;
                const rawFinalPrice = priceBeforeTax * (1 + ivaRate);
                
                // Redondeo al siguiente múltiplo de $50:
                const roundedPrice = Math.ceil(rawFinalPrice / 50) * 50;

                return {
                    id: prod.id,
                    name: prod.name,
                    base_price: roundedPrice
                };
            }).filter(Boolean);

            if (updates.length === 0) {
                alert('No se encontraron productos con costos válidos para actualizar.');
                return;
            }

            // 4. Update Masivo
            for (let i = 0; i < updates.length; i += 50) {
                const batch = updates.slice(i, i + 50);
                const { error } = await supabase.from('products').upsert(batch);
                if (error) throw error;
            }

            showToast(`¡Tienda Actualizada! ${updates.length} precios sincronizados con IVA y redondeo $50.`, 'success');
            fetchProducts(); // Refrescar lista

        } catch (err: any) {
            console.error('Sync Error:', err);
            showToast('Error sincronizando tienda: ' + err.message, 'error');
        } finally {
            setIsSyncingPrices(false);
        }
    };

    const handleBulkToggle = async (active: boolean) => {
        const { error } = await supabase
            .from('products')
            .update({ is_active: active })
            .in('id', selectedIds);

        if (error) {
            showToast('Error en acción masiva: ' + error.message, 'error');
        } else {
            setProducts(products.map(p => selectedIds.includes(p.id) ? { ...p, is_active: active } : p));
            showToast(`${selectedIds.length} productos ${active ? 'activados' : 'ocultos'}`, 'success');
            setSelectedIds([]);
        }
    };

    const kpiMetrics = useMemo(() => {
        const total = products.length;
        if (total === 0) return { total: 0, activeCoverage: 0, imageCoverage: 0, variantsCoverage: 0, pricingStatus: 0 };

        const active = products.filter(p => p.is_active).length;
        const withImg = products.filter(p => p.image_url && p.image_url.trim() !== '').length;
        
        // Detección robusta de variaciones (array o configuración de opciones)
        const withVariants = products.filter(p => {
            const hasVariantsArray = Array.isArray(p.variants) && p.variants.length > 0;
            const hasOptionsConfig = p.options_config && typeof p.options_config === 'object' && Object.keys(p.options_config).length > 0;
            return hasVariantsArray || hasOptionsConfig;
        }).length;

        const withPrice = products.filter(p => p.base_price > 0).length;

        return {
            total,
            activeCoverage: formatNumber(active / total * 100, 1),
            imageCoverage: formatNumber(withImg / total * 100, 1),
            variantsCoverage: formatNumber(withVariants / total * 100, 1),
            pricingStatus: formatNumber(withPrice / total * 100, 1)
        };
    }, [products]);

    const filteredProducts = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        
        let filtered = products;

        // Filtro por Tab (Estado de Visibilidad)
        if (statusFilter === 'active') {
            filtered = filtered.filter(p => p.is_active);
        } else if (statusFilter === 'hidden') {
            filtered = filtered.filter(p => !p.is_active);
        }

        // Filtro por Categoría (Botones Rápidos)
        if (categoryFilter !== 'all') {
            filtered = filtered.filter(p => p.category === categoryFilter);
        }

        if (!query) return filtered;

        // Separar términos normales de etiquetas con @
        const parts = query.split(/\s+/);
        const tags = parts.filter(p => p.startsWith('@')).map(t => t.slice(1));
        const searchTerms = parts.filter(p => !p.startsWith('@'));

        return filtered.filter(p => {
            // 1. Lógica de TEXTO (AND: debe cumplir todos los términos escritos)
            const matchesText = searchTerms.every(term => 
                p.name?.toLowerCase().includes(term) ||
                p.sku?.toLowerCase().includes(term)
            );

            if (!matchesText && searchTerms.length > 0) return false;

            // 2. Lógica de ETIQUETAS (AND: debe cumplir todos los filtros @)
            const matchesTags = tags.every(tag => {
                // Filtro IVA (@19, @19%, @0...)
                if (['0', '5', '19', '22'].includes(tag.replace('%', ''))) {
                    const rate = parseInt(tag.replace('%', ''));
                    return (p.iva_rate ?? 19) === rate;
                }

                // Filtro Web/Active (@web, @virtual, @oculto)
                if (tag === 'web' || tag === 'virtual' || tag === 'on') return p.show_on_web;
                if (tag === 'oculto' || tag === 'hidden' || tag === 'off') return !p.show_on_web;

                // Filtro Categoría (@frutas, @despensa...)
                const categoryEntry = Object.entries(CATEGORY_MAP).find(([, label]) => 
                    label.toLowerCase().startsWith(tag)
                );
                if (categoryEntry && p.category === categoryEntry[0]) return true;

                // Filtro Logística/Compras (@alistamiento, @equipo...)
                if (p.buying_team?.toLowerCase().includes(tag)) return true;
                if (p.procurement_method?.toLowerCase().includes(tag)) return true;

                return false;
            });

            return matchesTags;
        });
    }, [products, searchQuery, statusFilter, categoryFilter]);

    const paginatedProducts = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredProducts, currentPage]);

    const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
    
    // CALCULAR SUGERENCIAS INTELIGENTES POR CATEGORÍA
    const categorySuggestions = useMemo(() => {
        const counts: Record<string, Record<string, number>> = {};
        products.forEach(p => {
            const cat = p.category || 'Otros';
            if (!counts[cat]) counts[cat] = {};
            p.tags?.forEach(tag => {
                counts[cat][tag] = (counts[cat][tag] || 0) + 1;
            });
        });
        
        const suggestions: Record<string, string[]> = {};
        Object.entries(counts).forEach(([cat, tagCounts]) => {
            suggestions[cat] = Object.entries(tagCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(e => e[0]);
        });
        return suggestions;
    }, [products]);

    // Resetear a página 1 cuando cambia filtro o búsqueda
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, statusFilter, categoryFilter]);



    // Renderizado principal
    return (
        <div style={{ backgroundColor: THEME.colors.background, minHeight: '100vh', fontFamily: 'var(--font-outfit), sans-serif' }}>
            <Toast />


            {loading && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(255,255,255,0.7)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 2000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: '1rem'
                }}>
                    <div style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: `4px solid ${THEME.colors.primary}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    <div style={{ fontWeight: '600', color: THEME.colors.primary }}>Cargando catálogo...</div>
                </div>
            )}

            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
            <Toast />
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem 2rem' }}>
                <header style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <Link href="/admin/dashboard" style={{ textDecoration: 'none', color: THEME.colors.textSecondary, fontWeight: '500', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span>← Volver al Dashboard</span>
                            </Link>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '0.4rem' }}>
                                <ShoppingBag size={26} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                                <h1 style={{ fontSize: '1.8rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.02em' }}>Catálogo Comercial B2C</h1>
                            </div>
                            <p style={{ color: THEME.colors.textSecondary, fontSize: '0.9rem', margin: '0.2rem 0 0 0' }}>Gestión de precios públicos, visibilidad y branding de productos.</p>
                        </div>
                        <div style={{ 
                            display: 'flex', 
                            gap: '12px', 
                            alignItems: 'center',
                            padding: '0.4rem',
                            borderRadius: THEME.radius.lg,
                        }}>
                            <Link href="/admin/master/products" style={{ 
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                color: THEME.colors.textMain, 
                                fontWeight: '500', 
                                textDecoration: 'none', 
                                fontSize: '0.8rem',
                                backgroundColor: THEME.colors.surface,
                                padding: '0.5rem 1rem',
                                borderRadius: THEME.radius.md,
                                border: `1px solid ${THEME.colors.border}`,
                                transition: 'all 0.2s',
                                boxShadow: THEME.shadow.sm
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = THEME.colors.background;
                                e.currentTarget.style.borderColor = THEME.colors.borderActive;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = THEME.colors.surface;
                                e.currentTarget.style.borderColor = THEME.colors.border;
                            }}
                            >
                                <Info size={14} strokeWidth={1.5} /> Panel Maestro
                            </Link>

                            <button
                                onClick={syncB2CWebPrices}
                                disabled={isSyncingPrices}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    color: 'white',
                                    backgroundColor: isSyncingPrices ? THEME.colors.textSecondary : THEME.colors.primary,
                                    padding: '0.5rem 1.1rem',
                                    borderRadius: THEME.radius.md,
                                    border: 'none',
                                    fontWeight: '600',
                                    fontSize: '0.8rem',
                                    cursor: isSyncingPrices ? 'not-allowed' : 'pointer',
                                    boxShadow: THEME.shadow.sm,
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSyncingPrices) {
                                        e.currentTarget.style.backgroundColor = THEME.colors.primaryHover;
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSyncingPrices) {
                                        e.currentTarget.style.backgroundColor = THEME.colors.primary;
                                        e.currentTarget.style.transform = 'none';
                                    }
                                }}
                            >
                                <Globe size={14} strokeWidth={1.5} />
                                {isSyncingPrices ? 'Publicando...' : 'Publicar Precios en Tienda'}
                            </button>

                            {/* SEPARADOR SUTIL */}
                            <div style={{ height: '20px', width: '1px', backgroundColor: THEME.colors.border, marginLeft: '4px' }}></div>

                            {/* SELECTOR AUTO-SYNC PEGADO A LA DERECHA */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                paddingLeft: '4px'
                            }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Auto
                                </span>
                                <div 
                                    onClick={toggleAutosync}
                                    style={{
                                        width: '36px',
                                        height: '18px',
                                        backgroundColor: autosyncEnabled ? THEME.colors.primary : '#CBD5E1',
                                        borderRadius: '20px',
                                        position: 'relative',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    <div style={{
                                        width: '12px',
                                        height: '12px',
                                        backgroundColor: 'white',
                                        borderRadius: '50%',
                                        position: 'absolute',
                                        top: '3px',
                                        left: autosyncEnabled ? '21px' : '3px',
                                        transition: 'all 0.2s ease',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                                    }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* KPI DASHBOARD PREMIUM */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    <KPIMiniCard label="Total Catálogo" value={formatNumber(kpiMetrics.total)} icon={<Package size={18} strokeWidth={1.5} />} />
                    <KPIMiniCard label="Stock Activo" value={`${kpiMetrics.activeCoverage}%`} icon={<CheckCircle size={18} strokeWidth={1.5} />} />
                    <KPIMiniCard label="Visualización" value={`${kpiMetrics.imageCoverage}%`} icon={<ImageIcon size={18} strokeWidth={1.5} />} />
                    <KPIMiniCard label="Precios Web" value={`${kpiMetrics.pricingStatus}%`} icon={<DollarSign size={18} strokeWidth={1.5} />} />
                    <KPIMiniCard label="Mix Variantes" value={`${kpiMetrics.variantsCoverage}%`} icon={<Scale size={18} strokeWidth={1.5} />} />
                </div>



                {selectedIds.length > 0 && (
                    <div style={{
                        position: 'fixed',
                        bottom: '2rem',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: THEME.colors.textMain,
                        color: 'white',
                        padding: '0.8rem 1.5rem',
                        borderRadius: THEME.radius.xl,
                        boxShadow: THEME.shadow.lg,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1.5rem',
                        zIndex: 1000,
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <span style={{ fontWeight: '500', fontSize: '0.85rem' }}>{formatNumber(selectedIds.length)} seleccionados</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => handleBulkToggle(true)} style={{ backgroundColor: THEME.colors.primary, color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: THEME.radius.md, fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Eye size={14} strokeWidth={1.5} /> Mostrar</button>
                            <button onClick={() => handleBulkToggle(false)} style={{ backgroundColor: '#EF4444', color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: THEME.radius.md, fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><EyeOff size={14} strokeWidth={1.5} /> Ocultar</button>
                            <button onClick={() => setSelectedIds([])} style={{ backgroundColor: 'transparent', color: 'rgba(255,255,255,0.6)', border: 'none', padding: '0.4rem 0.8rem', fontWeight: '500', fontSize: '0.8rem', cursor: 'pointer' }}>Cancelar</button>
                        </div>
                    </div>
                )}

                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.5rem',
                    marginBottom: '2rem'
                }}>
                    <div style={{ 
                        display: 'flex', 
                        gap: '1rem', 
                        borderBottom: `1px solid ${THEME.colors.border}`, 
                        paddingBottom: '0.8rem', 
                        flexWrap: 'wrap', 
                        alignItems: 'center' 
                    }}>
                        <div style={{ 
                            display: 'inline-flex', 
                            gap: '2px', 
                            backgroundColor: '#F1F5F9', 
                            padding: '3px', 
                            borderRadius: '10px',
                            border: `1px solid ${THEME.colors.border}`
                        }}>
                            {[
                                { id: 'all', label: 'Todos' },
                                { id: 'active', label: 'Activos' },
                                { id: 'hidden', label: 'Ocultos' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setStatusFilter(tab.id as any)}
                                    style={{
                                        padding: '0.4rem 1.1rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        backgroundColor: statusFilter === tab.id ? THEME.colors.primary : 'transparent',
                                        color: statusFilter === tab.id ? '#FFFFFF' : THEME.colors.textSecondary,
                                        fontWeight: statusFilter === tab.id ? '600' : '500',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ width: '1px', height: '20px', backgroundColor: THEME.colors.border, margin: '0 0.5rem' }}></div>

                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {Object.entries(CATEGORY_MAP).map(([id, label]) => {
                                const isActive = categoryFilter === id;
                                return (
                                    <button
                                        key={id}
                                        onClick={() => setCategoryFilter(categoryFilter === id ? 'all' : id)}
                                        style={{
                                            padding: '0.35rem 0.85rem',
                                            borderRadius: THEME.radius.lg,
                                            border: `1px solid ${isActive ? THEME.colors.primary : THEME.colors.border}`,
                                            backgroundColor: isActive ? THEME.colors.primaryLight : THEME.colors.surface,
                                            color: isActive ? THEME.colors.primary : THEME.colors.textSecondary,
                                            fontWeight: isActive ? '600' : '450',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            fontSize: '0.8rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isActive) {
                                                e.currentTarget.style.borderColor = THEME.colors.borderActive;
                                                e.currentTarget.style.color = THEME.colors.textMain;
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isActive) {
                                                e.currentTarget.style.borderColor = THEME.colors.border;
                                                e.currentTarget.style.color = THEME.colors.textSecondary;
                                            }
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center' }}>
                                <Search size={18} strokeWidth={1.5} />
                            </div>
                            <input
                                type="text"
                                placeholder="Buscar por nombre, SKU o etiqueta estratégica..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem 2.8rem 0.75rem 2.8rem',
                                    borderRadius: THEME.radius.lg,
                                    border: `1px solid ${THEME.colors.border}`,
                                    fontSize: '0.95rem',
                                    color: THEME.colors.textMain,
                                    backgroundColor: THEME.colors.surface,
                                    boxShadow: THEME.shadow.sm,
                                    transition: 'all 0.15s ease',
                                    outline: 'none',
                                    fontFamily: 'inherit'
                                }}
                                onFocus={(e) => {
                                    e.currentTarget.style.borderColor = THEME.colors.primary;
                                    e.currentTarget.style.boxShadow = `0 0 0 2px ${THEME.colors.primaryLight}`;
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.borderColor = THEME.colors.border;
                                    e.currentTarget.style.boxShadow = THEME.shadow.sm;
                                }}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    style={{
                                        position: 'absolute',
                                        right: '1rem',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        border: 'none',
                                        background: 'none',
                                        color: THEME.colors.textSecondary,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '4px'
                                    }}
                                >
                                    <X size={16} strokeWidth={1.5} />
                                </button>
                            )}
                        </div>

                        <div style={{ position: 'relative' }}>
                            <div 
                                onClick={() => setIsInfoGuideOpen(!isInfoGuideOpen)}
                                style={{ 
                                    color: isInfoGuideOpen ? 'white' : THEME.colors.primary, 
                                    cursor: 'pointer',
                                    backgroundColor: isInfoGuideOpen ? THEME.colors.primary : THEME.colors.primaryLight,
                                    padding: '0.75rem',
                                    borderRadius: THEME.radius.lg,
                                    border: `1px solid ${isInfoGuideOpen ? THEME.colors.primary : '#C2DFD6'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Info size={18} strokeWidth={1.5} />
                            </div>
                            {isInfoGuideOpen && (
                                <div style={{
                                    position: 'absolute',
                                    right: 0,
                                    top: '125%',
                                    width: '300px',
                                    backgroundColor: THEME.colors.surface,
                                    borderRadius: THEME.radius.lg,
                                    boxShadow: THEME.shadow.lg,
                                    border: `1px solid ${THEME.colors.border}`,
                                    padding: '1.2rem',
                                    zIndex: 100
                                }}>
                                    <h4 style={{ margin: '0 0 0.8rem 0', color: THEME.colors.textMain, fontSize: '0.95rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Sparkles size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Power Search Tips
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        {[
                                            { tag: '@web', desc: 'Productos activos en tienda' },
                                            { tag: '@oculto', desc: 'Items en mantenimiento' },
                                            { tag: '@19%', desc: 'Filtrar por tasa de IVA' },
                                            { tag: '@fruta', desc: 'Búsqueda por categoría' },
                                            { tag: '@on', desc: 'SKUs habilitados' }
                                        ].map((item, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                                                <code style={{ backgroundColor: THEME.colors.primaryLight, padding: '2px 6px', borderRadius: '4px', color: THEME.colors.primary, fontWeight: '600', fontSize: '0.75rem' }}>{item.tag}</code>
                                                <span style={{ color: THEME.colors.textSecondary, fontWeight: '400' }}>{item.desc}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: `1px solid ${THEME.colors.border}`, fontSize: '0.75rem', color: THEME.colors.textSecondary, fontStyle: 'italic', textAlign: 'center' }}>
                                        Combinar: &quot;Papa @web @fresco&quot;
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{
                        backgroundColor: THEME.colors.surface,
                        borderRadius: THEME.radius.lg,
                        boxShadow: THEME.shadow.sm,
                        overflow: 'hidden',
                        border: `1px solid ${THEME.colors.border}`
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                    <th style={{ padding: '0.75rem 1rem', width: '50px', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.length === paginatedProducts.length && paginatedProducts.length > 0}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedIds(paginatedProducts.map(p => p.id));
                                                    else setSelectedIds([]);
                                                }}
                                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                            />
                                    </th>
                                    <th style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>Producto</th>
                                    <th style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em', textAlign: 'center' }}>Categoría</th>
                                    <th style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em', textAlign: 'center' }}>Atributos & Tags</th>
                                    <th style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em', textAlign: 'center' }}>Precio</th>
                                    <th style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em', textAlign: 'center' }}>Oferta / Var.</th>
                                    <th style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em', textAlign: 'center' }}>Presencia</th>
                                    <th style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em', textAlign: 'center' }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedProducts.map((product) => (
                                    <tr key={product.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, height: '90px', backgroundColor: selectedIds.includes(product.id) ? THEME.colors.background : 'transparent', transition: 'background-color 0.2s' }}>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(product.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedIds([...selectedIds, product.id]);
                                                    else setSelectedIds(selectedIds.filter(id => id !== product.id));
                                                }}
                                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                            />
                                        </td>
                                        <td style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative' }}>
                                            {savingId === product.id && (
                                                <div style={{ position: 'absolute', left: '-10px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '30px', backgroundColor: THEME.colors.primary, borderRadius: '2px', animation: 'pulse 1s infinite' }}></div>
                                            )}
                                            <div
                                                onClick={() => document.getElementById(`file-${product.id}`)?.click()}
                                                style={{
                                                    width: '64px',
                                                    height: '64px',
                                                    borderRadius: THEME.radius.md,
                                                    overflow: 'hidden',
                                                    backgroundColor: '#F8FAFC',
                                                    flexShrink: 0,
                                                    boxShadow: THEME.shadow.sm,
                                                    cursor: 'pointer',
                                                    position: 'relative',
                                                    transition: 'all 0.2s ease',
                                                    border: `1px solid ${THEME.colors.border}`
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.borderColor = THEME.colors.borderActive;
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.borderColor = THEME.colors.border;
                                                }}
                                            >
                                                {product.image_url ? (
                                                    <Image 
                                                        src={product.image_url} 
                                                        alt={product.name} 
                                                        width={64} 
                                                        height={64} 
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        sizes="64px"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', color: THEME.colors.textSecondary }}>
                                                        <ImageIcon size={20} strokeWidth={1.5} />
                                                    </div>
                                                )}
                                                <div style={{
                                                    position: 'absolute',
                                                    inset: 0,
                                                    backgroundColor: 'rgba(0,0,0,0.3)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    opacity: 0,
                                                    transition: 'opacity 0.2s',
                                                    color: 'white'
                                                }}
                                                    onMouseOver={(e) => (e.currentTarget as HTMLElement).style.opacity = '1'}
                                                    onMouseOut={(e) => (e.currentTarget as HTMLElement).style.opacity = '0'}
                                                >
                                                    <ImageIcon size={18} strokeWidth={1.5} />
                                                </div>
                                                <input
                                                    id={`file-${product.id}`}
                                                    type="file"
                                                    accept="image/*"
                                                    style={{ display: 'none' }}
                                                    onChange={(e) => {
                                                        if (e.target.files && e.target.files[0]) {
                                                            handleImageUpload(product.id, e.target.files[0]);
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <div style={{ fontWeight: '600', fontSize: '1rem', color: THEME.colors.textMain }}>
                                                    {product.name}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>{product.sku}</span>
                                                    {product.iva_rate !== undefined && (
                                                        <span style={{ 
                                                            fontSize: '0.65rem', 
                                                            padding: '1px 5px', 
                                                            borderRadius: '4px',
                                                            backgroundColor: product.iva_rate === 0 ? '#E8F5E9' : product.iva_rate === 5 ? '#E3F2FD' : '#FFF3E0',
                                                            color: product.iva_rate === 0 ? '#2E7D32' : product.iva_rate === 5 ? '#1565C0' : '#E65100',
                                                            fontWeight: '600'
                                                        }}>
                                                            IVA {formatNumber(product.iva_rate)}%
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, display: '-webkit-box', WebkitLineClamp: '1', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                    {product.description || 'Sin descripción técnica.'}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ 
                                                    fontSize: '0.8rem', 
                                                    fontWeight: '500', 
                                                    padding: '2px 8px', 
                                                    backgroundColor: THEME.colors.background, 
                                                    borderRadius: THEME.radius.lg,
                                                    color: THEME.colors.textMain,
                                                    border: `1px solid ${THEME.colors.border}`
                                                }}>
                                                    {CATEGORY_MAP[product.category] || product.category}
                                                </span>
                                                
                                                {/* Cápsula de Jerarquía Minimalista */}
                                                {product.parent_id && (
                                                    <div style={{
                                                        fontSize: '0.6rem',
                                                        fontWeight: '600',
                                                        padding: '2px 4px',
                                                        borderRadius: '3px',
                                                        backgroundColor: product.parent_id === product.id ? THEME.colors.primary : '#0EA5E9',
                                                        color: 'white',
                                                        display: 'inline-flex',
                                                        minWidth: '14px',
                                                        justifyContent: 'center',
                                                        lineHeight: '1',
                                                        marginTop: '2px'
                                                    }} title={product.parent_id === product.id ? 'Producto Padre' : 'Producto Hijo'}>
                                                        {product.parent_id === product.id ? 'P' : 'H'}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', minWidth: '220px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {/* Tags Input */}
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '2px', justifyContent: 'center' }}>
                                                    {product.tags?.map((tag, i) => (
                                                        <span key={i} style={{ 
                                                            fontSize: '0.65rem', 
                                                            padding: '1px 6px', 
                                                            backgroundColor: THEME.colors.background, 
                                                            color: THEME.colors.textMain, 
                                                            borderRadius: '4px',
                                                            fontWeight: '500',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px',
                                                            border: `1px solid ${THEME.colors.border}`
                                                        }}>
                                                            {tag}
                                                            <X size={10} strokeWidth={1.5} style={{ cursor: 'pointer', color: THEME.colors.textSecondary }} onClick={() => {
                                                                const newTags = product.tags?.filter(t => t !== tag) || [];
                                                                updateProductField(product.id, 'tags', newTags);
                                                            }} />
                                                        </span>
                                                    ))}
                                                </div>
                                                <div style={{ position: 'relative' }}>
                                                    <input 
                                                        type="text"
                                                        placeholder="+ tag estratégico"
                                                        style={{ 
                                                            fontSize: '0.75rem', 
                                                            padding: '4px 8px', 
                                                            borderRadius: THEME.radius.sm, 
                                                            border: `1px solid ${THEME.colors.border}`, 
                                                            width: '100%',
                                                            backgroundColor: THEME.colors.surface,
                                                            fontWeight: '500',
                                                            outline: 'none'
                                                        }}
                                                        onFocus={(e) => {
                                                            const box = e.currentTarget.nextElementSibling as HTMLElement;
                                                            if (box) box.style.display = 'flex';
                                                        }}
                                                        onBlur={(e) => {
                                                            setTimeout(() => {
                                                                const box = e.target.nextElementSibling as HTMLElement;
                                                                if (box) box.style.display = 'none';
                                                            }, 200);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ',') {
                                                                e.preventDefault();
                                                                const val = e.currentTarget.value.trim().replace(',', '');
                                                                if (val) {
                                                                    const newTags = Array.from(new Set([...(product.tags || []), val]));
                                                                    updateProductField(product.id, 'tags', newTags);
                                                                    e.currentTarget.value = '';
                                                                }
                                                            }
                                                        }}
                                                    />
                                                    {/* Sugerencias Flotantes */}
                                                    <div style={{ 
                                                        display: 'none', 
                                                        position: 'absolute', 
                                                        bottom: '100%', 
                                                        left: 0, 
                                                        right: 0, 
                                                        backgroundColor: THEME.colors.surface, 
                                                        border: `1px solid ${THEME.colors.border}`, 
                                                        borderRadius: THEME.radius.md, 
                                                        boxShadow: THEME.shadow.md, 
                                                        zIndex: 20,
                                                        padding: '8px',
                                                        flexDirection: 'column',
                                                        gap: '4px'
                                                    }}>
                                                        <div style={{ fontSize: '0.6rem', color: THEME.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.05em' }}>Sugerencias</div>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                            {(categorySuggestions[product.category] || []).filter(t => !product.tags?.includes(t)).length > 0 ? (
                                                                (categorySuggestions[product.category] || [])
                                                                    .filter(t => !product.tags?.includes(t))
                                                                    .map(tag => (
                                                                        <button 
                                                                            key={tag}
                                                                            onClick={() => {
                                                                                const newTags = Array.from(new Set([...(product.tags || []), tag]));
                                                                                updateProductField(product.id, 'tags', newTags);
                                                                            }}
                                                                            style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', border: `1px solid ${THEME.colors.primary}30`, backgroundColor: THEME.colors.primaryLight, cursor: 'pointer', fontWeight: '500', color: THEME.colors.primary }}
                                                                        >
                                                                            + {tag}
                                                                        </button>
                                                                    ))
                                                            ) : (
                                                                ['Fresco', 'Oferta', 'Premium', 'Directo'].filter(t => !product.tags?.includes(t)).map(tag => (
                                                                    <button 
                                                                        key={tag}
                                                                        onClick={() => {
                                                                            const newTags = Array.from(new Set([...(product.tags || []), tag]));
                                                                            updateProductField(product.id, 'tags', newTags);
                                                                        }}
                                                                        style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, cursor: 'pointer', fontWeight: '500', color: THEME.colors.textMain }}
                                                                    >
                                                                        + {tag}
                                                                    </button>
                                                                ))
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Keywords Input */}
                                                <input 
                                                    type="text"
                                                    placeholder="Keywords de búsqueda..."
                                                    defaultValue={product.keywords || ''}
                                                    style={{ 
                                                        fontSize: '0.75rem', 
                                                        padding: '4px 8px', 
                                                        borderRadius: THEME.radius.sm, 
                                                        border: `1px solid ${THEME.colors.border}`, 
                                                        width: '100%', 
                                                        fontStyle: 'italic', 
                                                        backgroundColor: 'transparent',
                                                        outline: 'none'
                                                    }}
                                                    onBlur={(e) => {
                                                        if (e.target.value !== (product.keywords || '')) {
                                                            updateProductField(product.id, 'keywords', e.target.value);
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                            <div style={{ fontWeight: '700', fontSize: '1.1rem', color: THEME.colors.textMain }}>
                                                {formatMoney(product.base_price)}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                            <button
                                                onClick={() => setSelectedProduct(product)}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    borderRadius: THEME.radius.md,
                                                    border: `1px solid ${THEME.colors.border}`,
                                                    backgroundColor: THEME.colors.surface,
                                                    color: THEME.colors.textMain,
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem',
                                                    fontWeight: '500',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.4rem',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.borderColor = THEME.colors.borderActive;
                                                    e.currentTarget.style.backgroundColor = THEME.colors.background;
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.borderColor = THEME.colors.border;
                                                    e.currentTarget.style.backgroundColor = THEME.colors.surface;
                                                }}
                                            >
                                                <Filter size={14} strokeWidth={1.5} /> 
                                                <span>Ver Variantes</span>
                                                {product.variants && (product.variants as any[]).length > 0 && (
                                                    <span style={{
                                                        marginLeft: '4px',
                                                        backgroundColor: THEME.colors.primary,
                                                        color: 'white',
                                                        fontSize: '0.7rem',
                                                        padding: '1px 5px',
                                                        borderRadius: '10px',
                                                        fontWeight: '600'
                                                    }}>
                                                        {(product.variants as any[]).length}
                                                    </span>
                                                )}
                                            </button>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                            <span style={{
                                                color: product.is_active ? THEME.colors.primary : '#DC2626',
                                                fontWeight: '600',
                                                fontSize: '0.85rem',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}>
                                                {product.is_active ? <Eye size={14} strokeWidth={1.5} /> : <EyeOff size={14} strokeWidth={1.5} />}
                                                {product.is_active ? 'Visible' : 'Oculto'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                            <button
                                                onClick={() => toggleActive(product.id, product.is_active)}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    borderRadius: THEME.radius.md,
                                                    border: `1px solid ${product.is_active ? '#E2E8F0' : '#A7F3D0'}`,
                                                    backgroundColor: product.is_active ? '#F8FAFC' : '#ECFDF5',
                                                    color: product.is_active ? THEME.colors.textSecondary : THEME.colors.primary,
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem',
                                                    fontWeight: '500',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.backgroundColor = product.is_active ? '#F1F5F9' : '#D1FAE5';
                                                    e.currentTarget.style.borderColor = product.is_active ? '#CBD5E1' : '#6EE7B7';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = product.is_active ? '#F8FAFC' : '#ECFDF5';
                                                    e.currentTarget.style.borderColor = product.is_active ? '#E2E8F0' : '#A7F3D0';
                                                }}
                                            >
                                                {product.is_active ? 'Ocultar' : 'Activar'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {/* PAGINACIÓN */}
                        <div style={{ 
                            padding: '1.2rem 1.5rem', 
                            borderTop: `1px solid ${THEME.colors.border}`, 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            backgroundColor: '#F8FAFC'
                        }}>
                            <span style={{ fontSize: '0.85rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                Mostrando <span style={{ color: THEME.colors.textMain, fontWeight: '600' }}>{formatNumber(paginatedProducts.length)}</span> de <span style={{ color: THEME.colors.textMain, fontWeight: '600' }}>{formatNumber(filteredProducts.length)}</span> resultados
                            </span>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(prev => prev - 1)}
                                    style={{
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: THEME.radius.md,
                                        border: `1px solid ${THEME.colors.border}`,
                                        backgroundColor: currentPage === 1 ? '#F1F5F9' : THEME.colors.surface,
                                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        fontWeight: '500',
                                        fontSize: '0.8rem',
                                        color: currentPage === 1 ? THEME.colors.textSecondary : THEME.colors.textMain
                                    }}
                                >
                                    <ChevronLeft size={16} strokeWidth={1.5} /> Anterior
                                </button>
                                <div style={{ display: 'flex', alignItems: 'center', color: THEME.colors.textSecondary, fontWeight: '500', fontSize: '0.85rem', padding: '0 0.8rem' }}>
                                    Página {formatNumber(currentPage)} de {formatNumber(totalPages || 1)}
                                </div>
                                <button
                                    disabled={currentPage === totalPages || totalPages === 0}
                                    onClick={() => setCurrentPage(prev => prev + 1)}
                                    style={{
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: THEME.radius.md,
                                        border: `1px solid ${THEME.colors.border}`,
                                        backgroundColor: (currentPage === totalPages || totalPages === 0) ? '#F1F5F9' : THEME.colors.surface,
                                        cursor: (currentPage === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        fontWeight: '500',
                                        fontSize: '0.8rem',
                                        color: (currentPage === totalPages || totalPages === 0) ? THEME.colors.textSecondary : THEME.colors.textMain
                                    }}
                                >
                                    Siguiente <ChevronRight size={16} strokeWidth={1.5} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {
                    selectedProduct && (
                        <VariantModal
                            product={selectedProduct}
                            onClose={() => setSelectedProduct(null)}
                            onSave={handleSaveVariants}
                            onUploadImage={handleVariantImageUpload}
                            readOnly={true}
                        />
                    )
                }

                {
                    isCreateModalOpen && (
                        <CreateProductModal
                            onClose={() => setIsCreateModalOpen(false)}
                            onSave={fetchProducts}
                        />
                    )
                }
            </div>
        </div>
    );
}

function KPIMiniCard({ label, value, icon }: { label: string, value: string | number, icon: React.ReactNode }) {
    return (
        <div style={{
            backgroundColor: THEME.colors.surface,
            padding: '1rem 1.2rem',
            borderRadius: THEME.radius.lg,
            border: `1px solid ${THEME.colors.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            transition: 'all 0.2s ease',
            boxShadow: THEME.shadow.sm
        }}
        onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = THEME.shadow.md;
            e.currentTarget.style.borderColor = THEME.colors.borderActive;
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = THEME.shadow.sm;
            e.currentTarget.style.borderColor = THEME.colors.border;
        }}
        >
            <div style={{ 
                width: '36px', 
                height: '36px', 
                borderRadius: THEME.radius.md, 
                backgroundColor: THEME.colors.primaryLight, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                color: THEME.colors.primary
            }}>
                {icon}
            </div>
            <div>
                <p style={{ fontSize: '0.75rem', fontWeight: '500', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                    {label}
                </p>
                <p style={{ fontSize: '1.25rem', fontWeight: '600', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.02em', lineHeight: '1.2' }}>
                    {value}
                </p>
            </div>
        </div>
    );
}
