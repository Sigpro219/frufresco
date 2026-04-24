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
    AlertCircle
} from 'lucide-react';

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
            activeCoverage: (active / total * 100).toFixed(1),
            imageCoverage: (withImg / total * 100).toFixed(1),
            variantsCoverage: (withVariants / total * 100).toFixed(1),
            pricingStatus: (withPrice / total * 100).toFixed(1)
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
        <div style={{ backgroundColor: '#F9FAFB', minHeight: '100vh', fontFamily: 'var(--font-outfit), sans-serif' }}>
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
                    <div style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #4F46E5', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    <div style={{ fontWeight: '700', color: '#4F46E5' }}>Cargando catálogo...</div>
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
                            <Link href="/admin/dashboard" style={{ textDecoration: 'none', color: '#6B7280', fontWeight: '600', fontSize: '0.85rem' }}>← Volver al Dashboard</Link>
                            <h1 style={{ fontSize: '2.3rem', fontWeight: '900', color: '#111827', margin: '0.2rem 0 0 0', letterSpacing: '-0.02em' }}>Catálogo Comercial B2C 🛍️</h1>
                            <p style={{ color: '#6B7280', fontSize: '0.95rem' }}>Gestión de precios públicos, visibilidad y branding de productos.</p>
                        </div>
                        <div style={{ 
                            display: 'flex', 
                            gap: '12px', 
                            alignItems: 'center',
                            padding: '0.4rem',
                            borderRadius: '16px',
                        }}>
                            <Link href="/admin/master/products" style={{ 
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                color: '#111827', 
                                fontWeight: '800', 
                                textDecoration: 'none', 
                                fontSize: '0.8rem',
                                backgroundColor: 'white',
                                padding: '0.65rem 1.2rem',
                                borderRadius: '12px',
                                border: '1px solid #E5E7EB',
                                transition: 'all 0.2s',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F9FAFB')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                            >
                                <Info size={16} /> Panel Maestro
                            </Link>

                            <button
                                onClick={syncB2CWebPrices}
                                disabled={isSyncingPrices}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    color: 'white',
                                    backgroundColor: isSyncingPrices ? '#9CA3AF' : 'var(--primary)',
                                    padding: '0.65rem 1.4rem',
                                    borderRadius: '12px',
                                    border: 'none',
                                    fontWeight: '900',
                                    fontSize: '0.85rem',
                                    cursor: isSyncingPrices ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 4px 12px rgba(26, 77, 46, 0.2)',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                }}
                                onMouseEnter={(e) => !isSyncingPrices && (e.currentTarget.style.transform = 'translateY(-2px)')}
                                onMouseLeave={(e) => !isSyncingPrices && (e.currentTarget.style.transform = 'translateY(0)')}
                            >
                                <Globe size={18} />
                                {isSyncingPrices ? 'Publicando...' : 'Publicar Precios en Tienda'}
                            </button>

                            {/* SEPARADOR SUTIL */}
                            <div style={{ height: '20px', width: '1px', backgroundColor: 'rgba(0,0,0,0.1)', marginLeft: '8px' }}></div>

                            {/* SELECTOR AUTO-SYNC PEGADO A LA DERECHA */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                paddingLeft: '8px'
                            }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: '900', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Auto
                                </span>
                                <div 
                                    onClick={toggleAutosync}
                                    style={{
                                        width: '40px',
                                        height: '21px',
                                        backgroundColor: autosyncEnabled ? '#10B981' : '#D1D5DB',
                                        borderRadius: '20px',
                                        position: 'relative',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    }}
                                >
                                    <div style={{
                                        width: '15px',
                                        height: '15px',
                                        backgroundColor: 'white',
                                        borderRadius: '50%',
                                        position: 'absolute',
                                        top: '3px',
                                        left: autosyncEnabled ? '22px' : '3px',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                    }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* KPI DASHBOARD PREMIUM */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
                    <KPIMiniCard label="Total Catálogo" value={kpiMetrics.total} icon="📦" color="#6366F1" />
                    <KPIMiniCard label="Stock Activo" value={`${kpiMetrics.activeCoverage}%`} icon="✅" color="#10B981" />
                    <KPIMiniCard label="Visualización" value={`${kpiMetrics.imageCoverage}%`} icon="📸" color="#3B82F6" />
                    <KPIMiniCard label="Precios Web" value={`${kpiMetrics.pricingStatus}%`} icon="💰" color="#F59E0B" />
                    <KPIMiniCard label="Mix Variantes" value={`${kpiMetrics.variantsCoverage}%`} icon="⚖️" color="#8B5CF6" />
                </div>



                {selectedIds.length > 0 && (
                    <div style={{
                        position: 'fixed',
                        bottom: '2rem',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: '#111827',
                        color: 'white',
                        padding: '1rem 2rem',
                        borderRadius: '100px',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2rem',
                        zIndex: 1000,
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <span style={{ fontWeight: '600' }}>{selectedIds.length} seleccionados</span>
                        <div style={{ display: 'flex', gap: '0.8rem' }}>
                            <button onClick={() => handleBulkToggle(true)} style={{ backgroundColor: '#10B981', color: 'white', border: 'none', padding: '0.5rem 1.2rem', borderRadius: '50px', fontWeight: '700', cursor: 'pointer' }}>👁️ Mostrar</button>
                            <button onClick={() => handleBulkToggle(false)} style={{ backgroundColor: '#EF4444', color: 'white', border: 'none', padding: '0.5rem 1.2rem', borderRadius: '50px', fontWeight: '700', cursor: 'pointer' }}>🚫 Ocultar</button>
                            <button onClick={() => setSelectedIds([])} style={{ backgroundColor: 'transparent', color: 'rgba(255,255,255,0.6)', border: 'none', padding: '0.5rem', fontWeight: '600', cursor: 'pointer' }}>Cancelar</button>
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
                        borderBottom: '1px solid var(--border)', 
                        paddingBottom: '0.8rem', 
                        flexWrap: 'wrap', 
                        alignItems: 'center' 
                    }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {[
                                { id: 'all', label: 'Todos' },
                                { id: 'active', label: 'Activos' },
                                { id: 'hidden', label: 'Ocultos' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setStatusFilter(tab.id as any)}
                                    style={{
                                        padding: '0.5rem 1.2rem',
                                        borderRadius: '12px',
                                        border: 'none',
                                        backgroundColor: statusFilter === tab.id ? '#111827' : 'transparent',
                                        color: statusFilter === tab.id ? 'white' : '#6B7280',
                                        fontWeight: statusFilter === tab.id ? '800' : '600',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ width: '1px', height: '24px', backgroundColor: '#E5E7EB', margin: '0 0.5rem' }}></div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {Object.entries(CATEGORY_MAP).map(([id, label]) => (
                                <button
                                    key={id}
                                    onClick={() => setCategoryFilter(categoryFilter === id ? 'all' : id)}
                                    style={{
                                        padding: '0.4rem 1rem',
                                        borderRadius: '20px',
                                        border: categoryFilter === id ? '2px solid #111827' : '1px solid #E5E7EB',
                                        backgroundColor: categoryFilter === id ? '#EEF2FF' : 'white',
                                        color: categoryFilter === id ? '#111827' : '#6B7280',
                                        fontWeight: categoryFilter === id ? '800' : '600',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        fontSize: '0.85rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <div style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}>
                                <Search size={22} />
                            </div>
                            <input
                                type="text"
                                placeholder="Buscar por nombre, SKU o etiqueta estratégica..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '1.1rem 3.5rem 1.1rem 3.5rem',
                                    borderRadius: '16px',
                                    border: '1px solid #E5E7EB',
                                    fontSize: '1rem',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                    transition: 'all 0.2s',
                                    fontFamily: 'inherit'
                                }}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    style={{
                                        position: 'absolute',
                                        right: '1.2rem',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        border: 'none',
                                        background: 'none',
                                        color: '#9CA3AF',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '4px'
                                    }}
                                >
                                    <X size={20} />
                                </button>
                            )}
                        </div>

                        <div style={{ position: 'relative' }}>
                            <div 
                                onClick={() => setIsInfoGuideOpen(!isInfoGuideOpen)}
                                style={{ 
                                    color: isInfoGuideOpen ? 'white' : '#2563EB', 
                                    cursor: 'pointer',
                                    backgroundColor: isInfoGuideOpen ? '#2563EB' : '#EFF6FF',
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    border: '1px solid #BFDBFE',
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Info size={24} />
                            </div>
                            {isInfoGuideOpen && (
                                <div style={{
                                    position: 'absolute',
                                    right: 0,
                                    top: '120%',
                                    width: '320px',
                                    backgroundColor: 'white',
                                    borderRadius: '20px',
                                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
                                    border: '1px solid #E5E7EB',
                                    padding: '1.8rem',
                                    zIndex: 100,
                                    animation: 'fadeInDown 0.2s ease-out'
                                }}>
                                    <h4 style={{ margin: '0 0 1.2rem 0', color: '#111827', fontSize: '1.1rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        🚀 Power Search Tips
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                                        {[
                                            { tag: '@web', desc: 'Productos activos en tienda' },
                                            { tag: '@oculto', desc: 'Items en mantenimiento' },
                                            { tag: '@19%', desc: 'Filtrar por tasa de IVA' },
                                            { tag: '@fruta', desc: 'Búsqueda por categoría' },
                                            { tag: '@on', desc: 'SKUs habilitados' }
                                        ].map((item, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                                <code style={{ backgroundColor: '#EEF2FF', padding: '3px 8px', borderRadius: '6px', color: '#4F46E5', fontWeight: '800' }}>{item.tag}</code>
                                                <span style={{ color: '#6B7280', fontWeight: '600' }}>{item.desc}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #F3F4F6', fontSize: '0.75rem', color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center' }}>
                                        Combinar: &quot;Papa @web @fresco&quot;
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: 'var(--radius-lg)',
                        boxShadow: 'var(--shadow-md)',
                        overflow: 'hidden',
                        border: '1px solid var(--border)'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F8FAFB', borderBottom: '2px solid #E5E7EB' }}>
                                    <th style={{ padding: '1.2rem 1rem', width: '50px', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.length === paginatedProducts.length && paginatedProducts.length > 0}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedIds(paginatedProducts.map(p => p.id));
                                                    else setSelectedIds([]);
                                                }}
                                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                            />
                                    </th>
                                    <th style={{ padding: '1.2rem 1rem', color: '#111827', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>Producto</th>
                                    <th style={{ padding: '1.2rem 1rem', color: '#111827', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', textAlign: 'center' }}>Categoría</th>
                                    <th style={{ padding: '1.2rem 1rem', color: '#111827', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', textAlign: 'center' }}>Atributos & Tags</th>
                                    <th style={{ padding: '1.2rem 1rem', color: '#111827', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', textAlign: 'center' }}>Precio</th>
                                    <th style={{ padding: '1.2rem 1rem', color: '#111827', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', textAlign: 'center' }}>Oferta / Var.</th>
                                    <th style={{ padding: '1.2rem 1rem', color: '#111827', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', textAlign: 'center' }}>Presencia</th>
                                    <th style={{ padding: '1.2rem 1rem', color: '#111827', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', textAlign: 'center' }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedProducts.map((product) => (
                                    <tr key={product.id} style={{ borderBottom: '1px solid var(--border)', height: '110px', backgroundColor: selectedIds.includes(product.id) ? '#F9FAFB' : 'transparent', transition: 'background-color 0.2s' }}>
                                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(product.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedIds([...selectedIds, product.id]);
                                                    else setSelectedIds(selectedIds.filter(id => id !== product.id));
                                                }}
                                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                            />
                                        </td>
                                        <td style={{ padding: '1.5rem 1rem', display: 'flex', alignItems: 'center', gap: '1.5rem', position: 'relative' }}>
                                            {savingId === product.id && (
                                                <div style={{ position: 'absolute', left: '-10px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '40px', backgroundColor: 'var(--primary)', borderRadius: '2px', animation: 'pulse 1s infinite' }}></div>
                                            )}
                                            <div
                                                onClick={() => document.getElementById(`file-${product.id}`)?.click()}
                                                style={{
                                                    width: '80px',
                                                    height: '80px',
                                                    borderRadius: '12px',
                                                    overflow: 'hidden',
                                                    backgroundColor: '#eee',
                                                    flexShrink: 0,
                                                    boxShadow: 'var(--shadow-sm)',
                                                    cursor: 'pointer',
                                                    position: 'relative',
                                                    transition: 'all 0.2s',
                                                    border: '1px solid #E5E7EB'
                                                }}
                                            >
                                                {product.image_url ? (
                                                    <Image 
                                                        src={product.image_url} 
                                                        alt={product.name} 
                                                        width={80} 
                                                        height={80} 
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        sizes="80px"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF' }}>
                                                        <ImageIcon size={30} />
                                                    </div>
                                                )}
                                                <div style={{
                                                    position: 'absolute',
                                                    inset: 0,
                                                    backgroundColor: 'rgba(0,0,0,0.4)',
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
                                                    <ImageIcon size={24} />
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
                                            <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div style={{ fontWeight: '800', fontSize: '1.2rem', color: '#111827' }}>
                                                    {product.name}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: '700' }}>{product.sku}</span>
                                                    {product.iva_rate !== undefined && (
                                                        <span style={{ 
                                                            fontSize: '0.7rem', 
                                                            padding: '2px 6px', 
                                                            borderRadius: '6px',
                                                            backgroundColor: product.iva_rate === 0 ? '#DCFCE7' : product.iva_rate === 5 ? '#DBEAFE' : '#FFEDD5',
                                                            color: product.iva_rate === 0 ? '#166534' : product.iva_rate === 5 ? '#1E40AF' : '#9A3412',
                                                            fontWeight: '800'
                                                        }}>
                                                            IVA {product.iva_rate}%
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: '#6B7280', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                    {product.description || 'Sin descripción técnica.'}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ 
                                                    fontSize: '0.85rem', 
                                                    fontWeight: '800', 
                                                    padding: '4px 12px', 
                                                    backgroundColor: '#F3F4F6', 
                                                    borderRadius: '20px',
                                                    color: '#374151'
                                                }}>
                                                    {CATEGORY_MAP[product.category] || product.category}
                                                </span>
                                                
                                                {/* Cápsula de Jerarquía Minimalista */}
                                                {product.parent_id && (
                                                    <div style={{
                                                        fontSize: '0.65rem',
                                                        fontWeight: '900',
                                                        padding: '2px 5px',
                                                        borderRadius: '4px',
                                                        backgroundColor: product.parent_id === product.id ? '#4F46E5' : '#10B981',
                                                        color: 'white',
                                                        display: 'inline-flex',
                                                        minWidth: '16px',
                                                        justifyContent: 'center',
                                                        lineHeight: '1',
                                                        marginTop: '4px'
                                                    }} title={product.parent_id === product.id ? 'Producto Padre' : 'Producto Hijo'}>
                                                        {product.parent_id === product.id ? 'P' : 'H'}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'center', minWidth: '240px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {/* Tags Input */}
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px', justifyContent: 'center' }}>
                                                    {product.tags?.map((tag, i) => (
                                                        <span key={i} style={{ 
                                                            fontSize: '0.65rem', 
                                                            padding: '2px 8px', 
                                                            backgroundColor: '#F3F4F6', 
                                                            color: '#374151', 
                                                            borderRadius: '6px',
                                                            fontWeight: '800',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            border: '1px solid #E5E7EB'
                                                        }}>
                                                            {tag}
                                                            <X size={10} style={{ cursor: 'pointer' }} onClick={() => {
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
                                                            padding: '6px 12px', 
                                                            borderRadius: '8px', 
                                                            border: '1px solid #E5E7EB', 
                                                            width: '100%',
                                                            backgroundColor: '#F9FAFB',
                                                            fontWeight: '600'
                                                        }}
                                                        onFocus={(e) => {
                                                            const box = e.currentTarget.nextElementSibling as HTMLElement;
                                                            if (box) box.style.display = 'flex';
                                                        }}
                                                        onBlur={(e) => {
                                                            // Delay to allow clicking suggestions
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
                                                        backgroundColor: 'white', 
                                                        border: '1px solid #E5E7EB', 
                                                        borderRadius: '12px', 
                                                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
                                                        zIndex: 20,
                                                        padding: '10px',
                                                        flexDirection: 'column',
                                                        gap: '6px'
                                                    }}>
                                                        <div style={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: '800', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.05em' }}>Sugerencias</div>
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
                                                                            style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '6px', border: '1px solid #E0E7FF', backgroundColor: '#F0F4FF', cursor: 'pointer', fontWeight: '700', color: '#4F46E5' }}
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
                                                                        style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '6px', border: '1px solid #F3F4F6', backgroundColor: '#F9FAFB', cursor: 'pointer', fontWeight: '700', color: '#374151' }}
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
                                                    style={{ fontSize: '0.75rem', padding: '6px 12px', borderRadius: '8px', border: '1px solid #E5E7EB', width: '100%', fontStyle: 'italic', backgroundColor: 'transparent' }}
                                                    onBlur={(e) => {
                                                        if (e.target.value !== (product.keywords || '')) {
                                                            updateProductField(product.id, 'keywords', e.target.value);
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                                            <div style={{ fontWeight: '900', fontSize: '1.25rem', color: '#111827' }}>
                                                ${product.base_price?.toLocaleString()}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                                            <button
                                                onClick={() => setSelectedProduct(product)}
                                                style={{
                                                    padding: '0.6rem 1rem',
                                                    borderRadius: '10px',
                                                    border: '1px solid #E5E7EB',
                                                    backgroundColor: 'white',
                                                    color: '#111827',
                                                    cursor: 'pointer',
                                                    fontSize: '0.9rem',
                                                    fontWeight: '700',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem'
                                                }}
                                            >
                                                <Filter size={16} /> 
                                                <span>Ver Variantes</span>
                                                {product.variants && (product.variants as any[]).length > 0 && (
                                                    <span style={{
                                                        marginLeft: '4px',
                                                        backgroundColor: '#4F46E5',
                                                        color: 'white',
                                                        fontSize: '0.75rem',
                                                        padding: '2px 6px',
                                                        borderRadius: '12px',
                                                        fontWeight: '800'
                                                    }}>
                                                        {(product.variants as any[]).length}
                                                    </span>
                                                )}
                                            </button>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                                            <span style={{
                                                color: product.is_active ? '#059669' : '#DC2626',
                                                fontWeight: '800',
                                                fontSize: '0.9rem',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}>
                                                {product.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                                                {product.is_active ? 'Visible' : 'Oculto'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                                            <button
                                                onClick={() => toggleActive(product.id, product.is_active)}
                                                style={{
                                                    padding: '0.6rem 1.2rem',
                                                    borderRadius: '10px',
                                                    border: 'none',
                                                    backgroundColor: product.is_active ? '#F3F4F6' : '#DCFCE7',
                                                    color: product.is_active ? '#4B5563' : '#166534',
                                                    cursor: 'pointer',
                                                    fontSize: '0.85rem',
                                                    fontWeight: '800',
                                                    transition: 'all 0.2s'
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
                            padding: '1.5rem', 
                            borderTop: '1px solid #E5E7EB', 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            backgroundColor: '#F9FAFB'
                        }}>
                            <span style={{ fontSize: '0.9rem', color: '#6B7280', fontWeight: '600' }}>
                                Mostrando <span style={{ color: '#111827' }}>{paginatedProducts.length}</span> de <span style={{ color: '#111827' }}>{filteredProducts.length}</span> resultados
                            </span>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(prev => prev - 1)}
                                    style={{
                                        padding: '0.6rem 1rem',
                                        borderRadius: '10px',
                                        border: '1px solid #E5E7EB',
                                        backgroundColor: currentPage === 1 ? '#F3F4F6' : 'white',
                                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        fontWeight: '700',
                                        color: currentPage === 1 ? '#9CA3AF' : '#374151'
                                    }}
                                >
                                    <ChevronLeft size={18} /> Anterior
                                </button>
                                <div style={{ display: 'flex', alignItems: 'center', color: '#6B7280', fontWeight: '700', fontSize: '0.9rem', padding: '0 1rem' }}>
                                    Página {currentPage} de {totalPages || 1}
                                </div>
                                <button
                                    disabled={currentPage === totalPages || totalPages === 0}
                                    onClick={() => setCurrentPage(prev => prev + 1)}
                                    style={{
                                        padding: '0.6rem 1rem',
                                        borderRadius: '10px',
                                        border: '1px solid #E5E7EB',
                                        backgroundColor: (currentPage === totalPages || totalPages === 0) ? '#F3F4F6' : 'white',
                                        cursor: (currentPage === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        fontWeight: '700',
                                        color: (currentPage === totalPages || totalPages === 0) ? '#9CA3AF' : '#374151'
                                    }}
                                >
                                    Siguiente <ChevronRight size={18} />
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

function KPIMiniCard({ label, value, icon, color }: { label: string, value: string | number, icon: string, color: string }) {
    return (
        <div style={{
            backgroundColor: 'white',
            padding: '1.2rem',
            borderRadius: '20px',
            border: '1px solid #E5E7EB',
            borderTop: `4px solid ${color}`,
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}
        onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-3px)';
            e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.05)';
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
        }}
        >
            <div style={{ 
                width: '42px', 
                height: '42px', 
                borderRadius: '12px', 
                backgroundColor: `${color}10`, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontSize: '1.3rem',
                color: color
            }}>
                {icon}
            </div>
            <div>
                <p style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                    {label}
                </p>
                <p style={{ fontSize: '1.4rem', fontWeight: '900', color: '#111827', margin: 0, letterSpacing: '-0.02em', lineHeight: '1.2' }}>
                    {value}
                </p>
            </div>
        </div>
    );
}
