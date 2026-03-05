'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, Product } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Toast from '@/components/Toast';
import Link from 'next/link';
import VariantModal from '@/components/VariantModal';
import CreateProductModal from '@/components/CreateProductModal';
import { CATEGORY_MAP } from '@/lib/constants';
import { 
    Search,
    ChevronLeft,
    ChevronRight,
    X,
    Info,
    Eye,
    EyeOff,
    Image as ImageIcon,
    Filter
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
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'hidden'>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

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

    const stats = {
        total: products.length,
        active: products.filter(p => p.is_active).length,
        hidden: products.filter(p => !p.is_active).length,
        noImage: products.filter(p => !p.image_url).length
    };

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

    // Resetear a página 1 cuando cambia filtro o búsqueda
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, statusFilter, categoryFilter]);



    // Renderizado principal
    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
            <Navbar />


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
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
                <Link href="/admin/dashboard" style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: '#6B7280',
                    textDecoration: 'none',
                    fontWeight: '600',
                    marginBottom: '1rem',
                    fontSize: '0.95rem'
                }}>
                    ← Volver al Panel
                </Link>
                <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', marginBottom: '0.5rem' }}>🛍️ Catálogo B2C (Tienda)</h1>
                        <p style={{ color: '#6B7280', fontSize: '1.2rem' }}>Administra los precios comerciales, fotos y visibilidad pública de tus productos.</p>
                        <div style={{ marginTop: '0.8rem' }}>
                            <Link href="/admin/master/products" style={{ 
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                color: 'white', 
                                fontWeight: '700', 
                                textDecoration: 'none', 
                                fontSize: '0.9rem',
                                backgroundColor: '#4F46E5',
                                padding: '0.6rem 1.5rem',
                                borderRadius: '12px',
                                border: 'none',
                                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)',
                                transition: 'all 0.2s'
                            }}>
                                Ir al Maestro Técnico (Editar Datos)
                            </Link>
                        </div>
                    </div>
                    {savingId && (
                        <div style={{ backgroundColor: '#DBEAFE', color: '#1E40AF', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#1E40AF', animation: 'pulse 1s infinite' }}></div>
                            Guardando cambios...
                        </div>
                    )}
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                    {[
                        { label: 'Total Productos', value: stats.total, color: '#4F46E5', icon: '📦' },
                        { label: 'Activos en Tienda', value: stats.active, color: '#10B981', icon: '👁️' },
                        { label: 'Ocultos', value: stats.hidden, color: '#EF4444', icon: '🚫' },
                        { label: 'Sin Imagen', value: stats.noImage, color: '#F59E0B', icon: '🖼️' }
                    ].map((stat, i) => (
                        <div key={i} style={{
                            backgroundColor: 'white',
                            padding: '1.5rem',
                            borderRadius: '16px',
                            boxShadow: 'var(--shadow-sm)',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem'
                        }}>
                            <div style={{ fontSize: '2rem', backgroundColor: `${stat.color}15`, width: '50px', height: '50px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {stat.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>{stat.label}</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '800', color: stat.color }}>{stat.value}</div>
                            </div>
                        </div>
                    ))}
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
                            <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}>
                                <Search size={22} />
                            </div>
                            <input
                                type="text"
                                placeholder="Buscar por nombre, SKU o categoría..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '1.2rem 3.5rem 1.2rem 3.5rem',
                                    borderRadius: '12px',
                                    border: '1px solid #D1D5DB',
                                    fontSize: '1.1rem',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                    transition: 'all 0.2s'
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
                                    width: '300px',
                                    backgroundColor: 'white',
                                    borderRadius: '16px',
                                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
                                    border: '1px solid #E5E7EB',
                                    padding: '1.5rem',
                                    zIndex: 100
                                }}>
                                    <h4 style={{ margin: '0 0 1rem 0', color: '#111827', fontSize: '1rem', fontWeight: '800' }}>💡 Tips de Búsqueda</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.85rem' }}>
                                        <div><code style={{ background: '#F3F4F6', padding: '2px 4px', borderRadius: '4px' }}>@web</code> Solo en tienda</div>
                                        <div><code style={{ background: '#F3F4F6', padding: '2px 4px', borderRadius: '4px' }}>@19%</code> Filtrar por IVA</div>
                                        <div><code style={{ background: '#F3F4F6', padding: '2px 4px', borderRadius: '4px' }}>@fruta</code> Por categoría</div>
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
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                    <th style={{ padding: '1rem', width: '50px', textAlign: 'center' }}>
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
                                    <th style={{ padding: '1rem', fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: '600', textAlign: 'center' }}>PRODUCTO</th>
                                    <th style={{ padding: '1rem', fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: '600', textAlign: 'center' }}>CATEGORÍA</th>
                                    <th style={{ padding: '1rem', fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: '600', textAlign: 'center' }}>PRECIO</th>
                                    <th style={{ padding: '1rem', fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: '600', textAlign: 'center' }}>VARIANTES</th>
                                    <th style={{ padding: '1rem', fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: '600', textAlign: 'center' }}>ESTADO</th>
                                    <th style={{ padding: '1rem', fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: '600', textAlign: 'center' }}>ACCIÓN</th>
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
                                                    <img src={product.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
        </main >
    );
}
