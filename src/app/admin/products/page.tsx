'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, Product } from '@/lib/supabase';
import Toast from '@/components/Toast';
import Link from 'next/link';
import { useAuth, checkUserPermission } from '@/lib/authContext';
import { ShieldAlert, Loader2 } from 'lucide-react';
import VariantModal from '@/components/VariantModal';
import CreateProductModal from '@/components/CreateProductModal';
import { CATEGORY_MAP } from '@/lib/constants';
import Image from 'next/image';
import { triggerProductRevalidation } from '@/lib/revalidate';
import { optimizeImageForUpload } from '@/lib/imageOptimizer';
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
    Sparkles,
    ChefHat,
    Plus,
    Tag,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Check,
    RotateCcw,
    SlidersHorizontal
} from 'lucide-react';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';

const TYPICAL_RECIPES = [
    { id: 'ajiaco', label: 'Ajiaco' },
    { id: 'sancocho', label: 'Sancocho' },
    { id: 'bandeja paisa', label: 'Bandeja Paisa' },
    { id: 'mondongo', label: 'Mondongo' },
    { id: 'mute', label: 'Mute' },
    { id: 'tamal', label: 'Tamal' },
    { id: 'arroz con pollo', label: 'Arroz con Pollo' },
];

const COMMERCIAL_TAGS = ['Promoción', 'Cosecha', 'Oferta', 'Descuento', 'Top Ventas'];

const dropdownBaseStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    width: '230px',
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.radius.md,
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    border: `1px solid ${THEME.colors.border}`,
    padding: '0.5rem',
    zIndex: 100,
    textAlign: 'left',
    fontWeight: 'normal',
    color: THEME.colors.textMain
};

const dropdownSectionHeaderStyle: React.CSSProperties = {
    fontSize: '0.68rem',
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '4px 8px',
    marginBottom: '2px'
};

const dropdownDividerStyle: React.CSSProperties = {
    height: '1px',
    backgroundColor: THEME.colors.border,
    margin: '4px 0'
};

const dropdownItemStyle = (isSelected: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '6px 8px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: isSelected ? THEME.colors.primaryLight : 'transparent',
    color: isSelected ? THEME.colors.primary : THEME.colors.textMain,
    fontSize: '0.78rem',
    fontWeight: isSelected ? '600' : '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    textAlign: 'left',
    transition: 'background-color 0.1s'
});

const dropdownResetStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 8px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#F8FAFC',
    color: THEME.colors.textSecondary,
    fontSize: '0.72rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    textAlign: 'center'
};

const activeChipStyle: React.CSSProperties = {
    backgroundColor: '#DCFCE7',
    color: '#15803D',
    border: '1px solid #86EFAC',
    borderRadius: '4px',
    padding: '2px 7px',
    fontWeight: '600',
    fontSize: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px'
};

export default function AdminProductsPage() {
    const { profile } = useAuth();
    const [roles, setRoles] = useState<any[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    const hasPermission = (permission: string) => {
        return checkUserPermission(profile, permission, roles);
    };

    const canView = hasPermission('admin.products.catalog.view');
    const canEdit = hasPermission('admin.products.catalog.edit');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isInfoGuideOpen, setIsInfoGuideOpen] = useState(false);
    const ITEMS_PER_PAGE = 50;

    const toggleDevVerified = async (product: Product) => {
        const isCurrentlyVerified = product.is_verified_dev || (product.tags && product.tags.includes('verified_dev'));
        const newStatus = !isCurrentlyVerified;
        const updatedTags = newStatus
            ? Array.from(new Set([...(product.tags || []), 'verified_dev']))
            : (product.tags || []).filter(t => t !== 'verified_dev');

        setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_verified_dev: newStatus, tags: updatedTags } : p));

        try {
            const { error } = await supabase
                .from('products')
                .update({ tags: updatedTags })
                .eq('id', product.id);

            if (error) throw error;
            showToast(newStatus ? `🔍 SKU ${product.sku || product.name} marcado como REVISADO (DEV)` : `⏳ SKU ${product.sku || product.name} marcado como PENDIENTE (DEV)`, 'info');
        } catch (e: any) {
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_verified_dev: isCurrentlyVerified } : p));
            showToast('Error actualizando revisión DEV: ' + e.message, 'error');
        }
    };

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
            const { data: rolesData, error: rolesError } = await supabase
                .from('app_settings')
                .select('key, value')
                .eq('key', 'system_roles')
                .maybeSingle();

            if (!rolesError && rolesData?.value) {
                try {
                    setRoles(JSON.parse(rolesData.value));
                } catch (e) {
                    console.error('Error parsing system_roles:', e);
                }
            }
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

    // Filtros y ordenamiento por encabezados de columna
    const [openHeaderMenu, setOpenHeaderMenu] = useState<string | null>(null);
    const [photoFilter, setPhotoFilter] = useState<'all' | 'with_photo' | 'without_photo'>('all');
    const [recipeTagFilter, setRecipeTagFilter] = useState<'all' | 'with_recipes' | 'without_recipes' | 'with_tags' | 'without_tags'>('all');
    const [priceFilter, setPriceFilter] = useState<'all' | 'with_price' | 'zero_price'>('all');
    const [variantFilter, setVariantFilter] = useState<'all' | 'with_variants' | 'without_variants'>('all');
    const [visibilityColFilter, setVisibilityColFilter] = useState<'all' | 'visible' | 'hidden'>('all');
    const [devReviewFilter, setDevReviewFilter] = useState<'all' | 'verified' | 'pending'>('all');
    const [sortConfig, setSortConfig] = useState<{
        column: 'name' | 'category' | 'price' | null;
        direction: 'asc' | 'desc';
        special?: 'zero_first';
    }>({ column: null, direction: 'asc' });

    // Cerrar menú de columna al hacer click fuera
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('[data-header-dropdown]')) {
                setOpenHeaderMenu(null);
            }
        };
        if (openHeaderMenu) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [openHeaderMenu]);

    // Restablecer a página 1 cuando cambia cualquier filtro o búsqueda
    useEffect(() => {
        setCurrentPage(1);
    }, [
        searchQuery,
        statusFilter,
        categoryFilter,
        photoFilter,
        recipeTagFilter,
        priceFilter,
        variantFilter,
        visibilityColFilter,
        devReviewFilter,
        sortConfig
    ]);

    const resetAllColumnFilters = () => {
        setPhotoFilter('all');
        setRecipeTagFilter('all');
        setPriceFilter('all');
        setVariantFilter('all');
        setVisibilityColFilter('all');
        setDevReviewFilter('all');
        setCategoryFilter('all');
        setSortConfig({ column: null, direction: 'asc' });
    };

    const isAnyColumnFiltered = 
        photoFilter !== 'all' || 
        recipeTagFilter !== 'all' || 
        priceFilter !== 'all' || 
        variantFilter !== 'all' || 
        visibilityColFilter !== 'all' || 
        devReviewFilter !== 'all' ||
        categoryFilter !== 'all' ||
        sortConfig.column !== null;

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
        if (!canEdit) {
            showToast('No tienes permisos de edición en este módulo.', 'error');
            return;
        }
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
        if (!canEdit) {
            showToast('No tienes permisos de edición en este módulo.', 'error');
            return;
        }
        // No guardar si el valor es el mismo para ahorrar peticiones
        const currentProduct = products.find(p => p.id === id);
        if (currentProduct && currentProduct[field] === value) return;

        setSavingId(id);
        const { error } = await supabase
            .from('products')
            .update({ [field]: value })
            .eq('id', id);

        if (error) {
            console.error('Error updating product:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            showToast('Error al guardar: ' + (error.message || 'Error desconocido'), 'error');
        } else {
            setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
            showToast('Cambio guardado con éxito', 'success');
            triggerProductRevalidation();
        }
        setSavingId(null);
    };

    const toggleActive = async (id: string, currentStatus: boolean | undefined | null) => {
        await updateProductField(id, 'is_active', !(currentStatus ?? true));
    };



    const handleImageUpload = async (id: string, file: File) => {
        if (!canEdit) {
            showToast('No tienes permisos de edición en este módulo.', 'error');
            return;
        }
        setSavingId(id);
        try {
            const currentProduct = products.find(p => p.id === id);
            const optimizedFile = await optimizeImageForUpload(file, {
                maxWidth: 800,
                maxHeight: 800,
                quality: 0.82
            });

            const fileExt = optimizedFile.name.split('.').pop() || 'webp';
            const fileName = `${currentProduct?.sku || id}-${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, optimizedFile, { 
                    cacheControl: '2592000',
                    contentType: optimizedFile.type,
                    upsert: true 
                });

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
        } catch (err: any) {
            console.error('Error procesando imagen:', err);
            showToast('Error al procesar imagen: ' + err.message, 'error');
            setSavingId(null);
        }
    };

    const handleSaveVariants = async (optionsConfig: any[] | null, variants: any[] | null): Promise<boolean> => {
        if (!canEdit) {
            showToast('No tienes permisos de edición en este módulo.', 'error');
            return false;
        }
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

                const usedBatchSkus = new Set<string>();
                const formattedVariants = variants.map((v: any, idx: number) => {
                    let finalSku = (v.sku || `${selectedProduct.id}-${idx + 1}`).trim();
                    let counter = 1;
                    const baseSku = finalSku;
                    while (usedBatchSkus.has(finalSku)) {
                        counter++;
                        finalSku = `${baseSku}-${counter}`;
                    }
                    usedBatchSkus.add(finalSku);

                    return {
                        product_id: selectedProduct.id,
                        sku: finalSku,
                        options: v.options,
                        image_url: v.image_url,
                        price_adjustment_percent: v.price_adjustment_percent || v.price_adj_pct || 0,
                        is_active: v.is_active ?? true
                    };
                });

                const { error: variantError } = await supabase
                    .from('product_variants')
                    .insert(formattedVariants);

                if (variantError) throw variantError;
            }

            setProducts(products.map(p => p.id === selectedProduct.id ? { ...p, options_config: optionsConfig, variants: variants } : p));
            showToast('Variantes actualizadas', 'success');
            triggerProductRevalidation();
            return true;
        } catch (err: any) {
            console.error('Error al guardar variantes:', err);
            alert('Error al guardar variantes: ' + err.message);
            return false;
        }
    };

    const handleVariantImageUpload = async (file: File) => {
        if (!canEdit) {
            alert('No tienes permisos de edición en este módulo.');
            return null;
        }
        try {
            const optimizedFile = await optimizeImageForUpload(file, {
                maxWidth: 600,
                maxHeight: 600,
                quality: 0.80
            });

            const fileExt = optimizedFile.name.split('.').pop() || 'webp';
            const cleanFileName = `variant-${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
            const filePath = `${cleanFileName}`;

            console.log('Iniciando subida optimizada de variante:', filePath);

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, optimizedFile, {
                    cacheControl: '2592000',
                    contentType: optimizedFile.type,
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

    // --- SYNC B2C PRICES LOGIC (API Call) ---
    const syncB2CWebPrices = async () => {
        if (!canEdit) {
            showToast('No tienes permisos de edición en este módulo.', 'error');
            return;
        }
        if (!confirm('¿Sincronizar precios en tienda? Se calculará (Costo + Margen B2C + IVA) redondeando al siguiente múltiplo de $50.')) return;

        setIsSyncingPrices(true);
        try {
            console.log('🚀 Iniciando sincronización de tienda...');
            const token = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
            const res = await fetch(`/api/products/sync-prices?token=${token}`, {
                method: 'POST'
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Error en la respuesta del servidor');
            }

            const data = await res.json();
            showToast(`¡Tienda Actualizada! Se sincronizaron ${data.products_processed} precios públicos en la web.`, 'success');
            fetchProducts(); // Refrescar lista

        } catch (err: any) {
            console.error('Sync Error:', err);
            showToast('Error sincronizando tienda: ' + err.message, 'error');
        } finally {
            setIsSyncingPrices(false);
        }
    };

    const handleBulkToggle = async (active: boolean) => {
        if (!canEdit) {
            showToast('No tienes permisos de edición en este módulo.', 'error');
            return;
        }
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

        // --- FILTROS DE ENCABEZADO DE COLUMNA ---
        // 1. Filtro Foto (Columna Producto)
        if (photoFilter === 'without_photo') {
            filtered = filtered.filter(p => !p.image_url || p.image_url.trim() === '');
        } else if (photoFilter === 'with_photo') {
            filtered = filtered.filter(p => Boolean(p.image_url && p.image_url.trim() !== ''));
        }

        // 2. Filtro Recetas & Tags
        if (recipeTagFilter === 'with_recipes') {
            filtered = filtered.filter(p => Boolean(p.keywords && p.keywords.trim() !== ''));
        } else if (recipeTagFilter === 'without_recipes') {
            filtered = filtered.filter(p => !p.keywords || p.keywords.trim() === '');
        } else if (recipeTagFilter === 'with_tags') {
            filtered = filtered.filter(p => Array.isArray(p.tags) && p.tags.filter(t => t !== 'verified_dev').length > 0);
        } else if (recipeTagFilter === 'without_tags') {
            filtered = filtered.filter(p => !p.tags || p.tags.filter(t => t !== 'verified_dev').length === 0);
        }

        // 3. Filtro Precio
        if (priceFilter === 'with_price') {
            filtered = filtered.filter(p => (p.base_price || 0) > 0);
        } else if (priceFilter === 'zero_price') {
            filtered = filtered.filter(p => !p.base_price || p.base_price === 0);
        }

        // 4. Filtro Variantes
        if (variantFilter === 'with_variants') {
            filtered = filtered.filter(p => {
                const hasVariantsArray = Array.isArray(p.variants) && p.variants.length > 0;
                const hasOptionsConfig = p.options_config && typeof p.options_config === 'object' && Object.keys(p.options_config).length > 0;
                return hasVariantsArray || hasOptionsConfig;
            });
        } else if (variantFilter === 'without_variants') {
            filtered = filtered.filter(p => {
                const hasVariantsArray = Array.isArray(p.variants) && p.variants.length > 0;
                const hasOptionsConfig = p.options_config && typeof p.options_config === 'object' && Object.keys(p.options_config).length > 0;
                return !hasVariantsArray && !hasOptionsConfig;
            });
        }

        // 5. Filtro Presencia
        if (visibilityColFilter === 'visible') {
            filtered = filtered.filter(p => p.is_active);
        } else if (visibilityColFilter === 'hidden') {
            filtered = filtered.filter(p => !p.is_active);
        }

        // 6. Filtro Dev Revisión
        if (devReviewFilter === 'verified') {
            filtered = filtered.filter(p => p.is_verified_dev || (p.tags && p.tags.includes('verified_dev')));
        } else if (devReviewFilter === 'pending') {
            filtered = filtered.filter(p => !p.is_verified_dev && (!p.tags || !p.tags.includes('verified_dev')));
        }

        // --- FILTRO POR BÚSQUEDA AVANZADA (POWER SEARCH) ---
        if (query) {
            // Separar factores por comas
            const factors = query.split(',').map(f => f.trim()).filter(Boolean);

            filtered = filtered.filter(p => {
                return factors.every(factor => {
                    if (factor.startsWith('@')) {
                        const tag = factor.slice(1).toLowerCase();
                        
                        // Filtro Imagen/Foto (@sinfoto, @nofoto, @sin-foto, @sf, @confoto, @foto)
                        if (['sinfoto', 'nofoto', 'sin-foto', 'sin_foto', 'sf', 'sinimagen', 'no-image'].includes(tag)) {
                            return !p.image_url || p.image_url.trim() === '';
                        }
                        if (['confoto', 'con-foto', 'foto', 'conimagen', 'image'].includes(tag)) {
                            return Boolean(p.image_url && p.image_url.trim() !== '');
                        }

                        // Filtro IVA (@19, @19%, @0...)
                        if (['0', '5', '19', '22'].includes(tag.replace('%', ''))) {
                            const rate = parseInt(tag.replace('%', ''));
                            return (p.iva_rate ?? 19) === rate;
                        }

                        // Filtro Web/Active (@web, @virtual, @oculto)
                        if (tag === 'web' || tag === 'virtual' || tag === 'on') return p.show_on_web;
                        if (tag === 'oculto' || tag === 'hidden' || tag === 'off') return !p.show_on_web;

                        // Filtro Dev Revisión (@revisado, @dev, @pendiente)
                        if (tag === 'revisado' || tag === 'rev' || tag === 'dev') {
                            return p.is_verified_dev || (p.tags && p.tags.includes('verified_dev'));
                        }
                        if (tag === 'pendiente' || tag === 'norev' || tag === 'nodev') {
                            return !p.is_verified_dev && (!p.tags || !p.tags.includes('verified_dev'));
                        }

                        // Filtro Categoría (@frutas, @despensa...)
                        const categoryEntry = Object.entries(CATEGORY_MAP).find(([, label]) => 
                            label.toLowerCase().startsWith(tag)
                        );
                        if (categoryEntry && p.category === categoryEntry[0]) return true;

                        // Filtro Logística/Compras (@alistamiento, @equipo...)
                        if (p.buying_team?.toLowerCase().includes(tag)) return true;
                        if (p.procurement_method?.toLowerCase().includes(tag)) return true;

                        return false;
                    }

                    // Palabras clave directas para fotos sin @
                    if (['sin foto', 'sin fotos', 'sin imagen', 'sin imagenes', 'no foto', 'sinfoto', 'nofoto'].includes(factor)) {
                        return !p.image_url || p.image_url.trim() === '';
                    }
                    if (['con foto', 'con fotos', 'con imagen', 'con imagenes', 'confoto'].includes(factor)) {
                        return Boolean(p.image_url && p.image_url.trim() !== '');
                    }

                    return (
                        p.name?.toLowerCase().includes(factor) ||
                        p.sku?.toLowerCase().includes(factor) ||
                        (p.accounting_id && String(p.accounting_id).toLowerCase().includes(factor))
                    );
                });
            });
        }

        // --- ORDENAMIENTO (SORTING) ---
        if (sortConfig.column) {
            filtered = [...filtered].sort((a, b) => {
                if (sortConfig.column === 'name') {
                    const comp = (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
                    return sortConfig.direction === 'asc' ? comp : -comp;
                }
                if (sortConfig.column === 'category') {
                    const labelA = CATEGORY_MAP[a.category] || a.category || '';
                    const labelB = CATEGORY_MAP[b.category] || b.category || '';
                    const comp = labelA.localeCompare(labelB, 'es', { sensitivity: 'base' });
                    return sortConfig.direction === 'asc' ? comp : -comp;
                }
                if (sortConfig.column === 'price') {
                    if (sortConfig.special === 'zero_first') {
                        const priceA = a.base_price || 0;
                        const priceB = b.base_price || 0;
                        if (priceA === 0 && priceB > 0) return -1;
                        if (priceB === 0 && priceA > 0) return 1;
                        return priceA - priceB;
                    }
                    const priceA = a.base_price || 0;
                    const priceB = b.base_price || 0;
                    return sortConfig.direction === 'asc' ? priceA - priceB : priceB - priceA;
                }
                return 0;
            });
        }

        return filtered;
    }, [
        products, 
        searchQuery, 
        statusFilter, 
        categoryFilter, 
        photoFilter, 
        recipeTagFilter, 
        priceFilter, 
        variantFilter, 
        visibilityColFilter, 
        devReviewFilter, 
        sortConfig
    ]);

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



    if (loading) {
        return (
            <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.background }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <Loader2 size={36} className="animate-spin" style={{ color: THEME.colors.primary }} />
                    <span style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem', fontWeight: '600' }}>Cargando catálogo...</span>
                </div>
            </main>
        );
    }

    if (!canView) {
        return (
            <main style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.background }}>
                <div style={{
                    textAlign: 'center',
                    padding: '3rem',
                    backgroundColor: THEME.colors.surface,
                    borderRadius: THEME.radius.lg,
                    boxShadow: THEME.shadow.md,
                    maxWidth: '480px',
                    border: `1px solid ${THEME.colors.border}`,
                }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#EF4444',
                        marginBottom: '1.5rem',
                    }}>
                        <ShieldAlert size={32} />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '0.75rem' }}>
                        Acceso Denegado
                    </h1>
                    <p style={{ color: THEME.colors.textSecondary, fontSize: '0.95rem', lineHeight: '1.5' }}>
                        No tienes los permisos necesarios para visualizar este módulo. Por favor, solicita acceso a un administrador si consideras que esto es un error.
                    </p>
                </div>
            </main>
        );
    }

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
                {!canEdit && (
                    <div style={{
                        padding: '12px 16px',
                        borderRadius: THEME.radius.md,
                        backgroundColor: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                        color: '#D97706',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '1.5rem'
                    }}>
                        <ShieldAlert size={16} />
                        <span>Modo Vista: No tienes permisos para modificar el catálogo comercial.</span>
                    </div>
                )}
                <header style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <Link href="/admin/dashboard" style={{ textDecoration: 'none', color: THEME.colors.textSecondary, fontWeight: '500', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span>← Volver al Dashboard</span>
                            </Link>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '0.4rem' }}>
                                <ShoppingBag size={26} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                                <h1 style={{ fontSize: '1.8rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.02em' }}>Catálogo Web (Precios B2C)</h1>
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
                                disabled={isSyncingPrices || !canEdit}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    color: 'white',
                                    backgroundColor: (isSyncingPrices || !canEdit) ? THEME.colors.textSecondary : THEME.colors.primary,
                                    padding: '0.5rem 1.1rem',
                                    borderRadius: THEME.radius.md,
                                    border: 'none',
                                    fontWeight: '600',
                                    fontSize: '0.8rem',
                                    cursor: (isSyncingPrices || !canEdit) ? 'not-allowed' : 'pointer',
                                    opacity: canEdit ? 1 : 0.6,
                                    boxShadow: THEME.shadow.sm,
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSyncingPrices && canEdit) {
                                        e.currentTarget.style.backgroundColor = THEME.colors.primaryHover;
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSyncingPrices && canEdit) {
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
                                         backgroundColor: autosyncEnabled ? THEME.colors.primary : THEME.colors.borderActive,
                                         borderRadius: '20px',
                                         position: 'relative',
                                         cursor: canEdit ? 'pointer' : 'not-allowed',
                                         opacity: canEdit ? 1 : 0.6,
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
                            backgroundColor: THEME.colors.background, 
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
                                placeholder="Buscar por nombre, SKU, ID o comandos (@sinfoto, @web, @fruta)..."
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
                                    width: '320px',
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
                                            { tag: '@sinfoto', desc: 'Productos sin imagen cargada' },
                                            { tag: '@confoto', desc: 'Productos con imagen lista' },
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
                                        Combinar: &quot;Papa, @sinfoto, @web&quot;
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Barra de Filtros de Columna Activos */}
                    {isAnyColumnFiltered && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            flexWrap: 'wrap',
                            padding: '0.6rem 1rem',
                            backgroundColor: '#F0FDF4',
                            border: '1px solid #BBF7D0',
                            borderRadius: THEME.radius.lg,
                            fontSize: '0.8rem',
                            color: '#166534'
                        }}>
                            <span style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <SlidersHorizontal size={14} /> Filtros activos:
                            </span>
                            {photoFilter === 'without_photo' && (
                                <span style={activeChipStyle}>
                                    Sin foto <X size={12} style={{ cursor: 'pointer' }} onClick={() => setPhotoFilter('all')} />
                                </span>
                            )}
                            {photoFilter === 'with_photo' && (
                                <span style={activeChipStyle}>
                                    Con foto <X size={12} style={{ cursor: 'pointer' }} onClick={() => setPhotoFilter('all')} />
                                </span>
                            )}
                            {categoryFilter !== 'all' && (
                                <span style={activeChipStyle}>
                                    Cat: {CATEGORY_MAP[categoryFilter] || categoryFilter} <X size={12} style={{ cursor: 'pointer' }} onClick={() => setCategoryFilter('all')} />
                                </span>
                            )}
                            {recipeTagFilter !== 'all' && (
                                <span style={activeChipStyle}>
                                    {recipeTagFilter === 'with_recipes' ? 'Con recetas' : recipeTagFilter === 'without_recipes' ? 'Sin recetas' : recipeTagFilter === 'with_tags' ? 'Con tags' : 'Sin tags'}
                                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => setRecipeTagFilter('all')} />
                                </span>
                            )}
                            {priceFilter !== 'all' && (
                                <span style={activeChipStyle}>
                                    {priceFilter === 'with_price' ? 'Con precio (> $0)' : 'Sin precio ($0)'}
                                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => setPriceFilter('all')} />
                                </span>
                            )}
                            {variantFilter !== 'all' && (
                                <span style={activeChipStyle}>
                                    {variantFilter === 'with_variants' ? 'Con variantes' : 'Sin variantes'}
                                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => setVariantFilter('all')} />
                                </span>
                            )}
                            {visibilityColFilter !== 'all' && (
                                <span style={activeChipStyle}>
                                    {visibilityColFilter === 'visible' ? 'Visibles' : 'Ocultos'}
                                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => setVisibilityColFilter('all')} />
                                </span>
                            )}
                            {devReviewFilter !== 'all' && (
                                <span style={activeChipStyle}>
                                    {devReviewFilter === 'verified' ? 'Dev Revisado' : 'Dev Pendiente'}
                                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => setDevReviewFilter('all')} />
                                </span>
                            )}
                            {sortConfig.column && (
                                <span style={activeChipStyle}>
                                    Orden: {sortConfig.column === 'name' ? 'Nombre' : sortConfig.column === 'category' ? 'Categoría' : 'Precio'} {sortConfig.special === 'zero_first' ? '($0 primero)' : sortConfig.direction === 'asc' ? '↑' : '↓'}
                                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => setSortConfig({ column: null, direction: 'asc' })} />
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={resetAllColumnFilters}
                                style={{
                                    marginLeft: 'auto',
                                    background: 'none',
                                    border: 'none',
                                    color: '#15803D',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    fontSize: '0.78rem',
                                    textDecoration: 'underline',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <RotateCcw size={12} /> Limpiar todos los filtros
                            </button>
                        </div>
                    )}

                    <div style={{
                        backgroundColor: THEME.colors.surface,
                        borderRadius: THEME.radius.lg,
                        boxShadow: THEME.shadow.sm,
                        border: `1px solid ${THEME.colors.border}`,
                        minHeight: '380px'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', width: '50px', textAlign: 'center' }}>
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

                                    {/* COLUMNA PRODUCTO */}
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', textAlign: 'left', position: 'relative' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                            <span>Producto</span>
                                            <button
                                                type="button"
                                                data-header-dropdown="true"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenHeaderMenu(openHeaderMenu === 'product' ? null : 'product');
                                                }}
                                                title="Filtrar por foto u ordenar"
                                                style={{
                                                    background: (photoFilter !== 'all' || sortConfig.column === 'name') ? THEME.colors.primaryLight : 'transparent',
                                                    border: `1px solid ${(photoFilter !== 'all' || sortConfig.column === 'name') ? THEME.colors.primary : 'transparent'}`,
                                                    color: (photoFilter !== 'all' || sortConfig.column === 'name') ? THEME.colors.primary : THEME.colors.textSecondary,
                                                    borderRadius: '6px',
                                                    padding: '3px 5px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {sortConfig.column === 'name' ? (
                                                    sortConfig.direction === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} /> : <ArrowDown size={13} strokeWidth={2.5} />
                                                ) : (
                                                    <SlidersHorizontal size={13} strokeWidth={1.75} />
                                                )}
                                                {photoFilter !== 'all' && (
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: THEME.colors.primary }} />
                                                )}
                                            </button>
                                        </div>

                                        {openHeaderMenu === 'product' && (
                                            <div data-header-dropdown="true" style={{ ...dropdownBaseStyle, left: 0 }}>
                                                <div style={dropdownSectionHeaderStyle}>Ordenar por Nombre</div>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(sortConfig.column === 'name' && sortConfig.direction === 'asc')}
                                                    onClick={() => {
                                                        setSortConfig({ column: 'name', direction: 'asc' });
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <ArrowUp size={13} /> De la A a la Z
                                                    {sortConfig.column === 'name' && sortConfig.direction === 'asc' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(sortConfig.column === 'name' && sortConfig.direction === 'desc')}
                                                    onClick={() => {
                                                        setSortConfig({ column: 'name', direction: 'desc' });
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <ArrowDown size={13} /> De la Z a la A
                                                    {sortConfig.column === 'name' && sortConfig.direction === 'desc' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>

                                                <div style={dropdownDividerStyle} />

                                                <div style={dropdownSectionHeaderStyle}>Filtro de Foto</div>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(photoFilter === 'all')}
                                                    onClick={() => {
                                                        setPhotoFilter('all');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    Todas las fotos
                                                    {photoFilter === 'all' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(photoFilter === 'with_photo')}
                                                    onClick={() => {
                                                        setPhotoFilter('with_photo');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <ImageIcon size={13} /> Solo con foto
                                                    {photoFilter === 'with_photo' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={{
                                                        ...dropdownItemStyle(photoFilter === 'without_photo'),
                                                        color: photoFilter === 'without_photo' ? '#B91C1C' : '#DC2626',
                                                        fontWeight: '600'
                                                    }}
                                                    onClick={() => {
                                                        setPhotoFilter('without_photo');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <AlertCircle size={13} /> Solo sin foto (@sinfoto)
                                                    {photoFilter === 'without_photo' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>

                                                {(sortConfig.column === 'name' || photoFilter !== 'all') && (
                                                    <>
                                                        <div style={dropdownDividerStyle} />
                                                        <button
                                                            type="button"
                                                            style={dropdownResetStyle}
                                                            onClick={() => {
                                                                if (sortConfig.column === 'name') setSortConfig({ column: null, direction: 'asc' });
                                                                setPhotoFilter('all');
                                                                setOpenHeaderMenu(null);
                                                            }}
                                                        >
                                                            <RotateCcw size={12} /> Restablecer columna
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </th>

                                    {/* COLUMNA CATEGORÍA */}
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', textAlign: 'center', position: 'relative' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <span>Categoría</span>
                                            <button
                                                type="button"
                                                data-header-dropdown="true"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenHeaderMenu(openHeaderMenu === 'category' ? null : 'category');
                                                }}
                                                title="Filtrar por categoría"
                                                style={{
                                                    background: (categoryFilter !== 'all' || sortConfig.column === 'category') ? THEME.colors.primaryLight : 'transparent',
                                                    border: `1px solid ${(categoryFilter !== 'all' || sortConfig.column === 'category') ? THEME.colors.primary : 'transparent'}`,
                                                    color: (categoryFilter !== 'all' || sortConfig.column === 'category') ? THEME.colors.primary : THEME.colors.textSecondary,
                                                    borderRadius: '6px',
                                                    padding: '3px 5px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {sortConfig.column === 'category' ? (
                                                    sortConfig.direction === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} /> : <ArrowDown size={13} strokeWidth={2.5} />
                                                ) : (
                                                    <SlidersHorizontal size={13} strokeWidth={1.75} />
                                                )}
                                                {categoryFilter !== 'all' && (
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: THEME.colors.primary }} />
                                                )}
                                            </button>
                                        </div>

                                        {openHeaderMenu === 'category' && (
                                            <div data-header-dropdown="true" style={{ ...dropdownBaseStyle, left: '50%', transform: 'translateX(-50%)', maxHeight: '340px', overflowY: 'auto' }}>
                                                <div style={dropdownSectionHeaderStyle}>Ordenar por Categoría</div>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(sortConfig.column === 'category' && sortConfig.direction === 'asc')}
                                                    onClick={() => {
                                                        setSortConfig({ column: 'category', direction: 'asc' });
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <ArrowUp size={13} /> De la A a la Z
                                                    {sortConfig.column === 'category' && sortConfig.direction === 'asc' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(sortConfig.column === 'category' && sortConfig.direction === 'desc')}
                                                    onClick={() => {
                                                        setSortConfig({ column: 'category', direction: 'desc' });
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <ArrowDown size={13} /> De la Z a la A
                                                    {sortConfig.column === 'category' && sortConfig.direction === 'desc' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>

                                                <div style={dropdownDividerStyle} />

                                                <div style={dropdownSectionHeaderStyle}>Filtrar Categoría</div>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(categoryFilter === 'all')}
                                                    onClick={() => {
                                                        setCategoryFilter('all');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    Todas las categorías
                                                    {categoryFilter === 'all' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                {Object.entries(CATEGORY_MAP).map(([catKey, catLabel]) => {
                                                    const isSelected = categoryFilter === catKey;
                                                    return (
                                                        <button
                                                            key={catKey}
                                                            type="button"
                                                            style={dropdownItemStyle(isSelected)}
                                                            onClick={() => {
                                                                setCategoryFilter(isSelected ? 'all' : catKey);
                                                                setOpenHeaderMenu(null);
                                                            }}
                                                        >
                                                            <span>{catLabel}</span>
                                                            {isSelected && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                        </button>
                                                    );
                                                })}

                                                {(sortConfig.column === 'category' || categoryFilter !== 'all') && (
                                                    <>
                                                        <div style={dropdownDividerStyle} />
                                                        <button
                                                            type="button"
                                                            style={dropdownResetStyle}
                                                            onClick={() => {
                                                                if (sortConfig.column === 'category') setSortConfig({ column: null, direction: 'asc' });
                                                                setCategoryFilter('all');
                                                                setOpenHeaderMenu(null);
                                                            }}
                                                        >
                                                            <RotateCcw size={12} /> Restablecer categoría
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </th>

                                    {/* COLUMNA RECETAS & TAGS */}
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', textAlign: 'center', position: 'relative' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <span>Recetas & Tags</span>
                                            <button
                                                type="button"
                                                data-header-dropdown="true"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenHeaderMenu(openHeaderMenu === 'recipetag' ? null : 'recipetag');
                                                }}
                                                title="Filtrar por recetas o tags"
                                                style={{
                                                    background: recipeTagFilter !== 'all' ? THEME.colors.primaryLight : 'transparent',
                                                    border: `1px solid ${recipeTagFilter !== 'all' ? THEME.colors.primary : 'transparent'}`,
                                                    color: recipeTagFilter !== 'all' ? THEME.colors.primary : THEME.colors.textSecondary,
                                                    borderRadius: '6px',
                                                    padding: '3px 5px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <SlidersHorizontal size={13} strokeWidth={1.75} />
                                                {recipeTagFilter !== 'all' && (
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: THEME.colors.primary }} />
                                                )}
                                            </button>
                                        </div>

                                        {openHeaderMenu === 'recipetag' && (
                                            <div data-header-dropdown="true" style={{ ...dropdownBaseStyle, left: '50%', transform: 'translateX(-50%)' }}>
                                                <div style={dropdownSectionHeaderStyle}>Filtro de Recetas & Tags</div>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(recipeTagFilter === 'all')}
                                                    onClick={() => {
                                                        setRecipeTagFilter('all');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    Todos los productos
                                                    {recipeTagFilter === 'all' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(recipeTagFilter === 'with_recipes')}
                                                    onClick={() => {
                                                        setRecipeTagFilter('with_recipes');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <ChefHat size={13} style={{ color: '#15803D' }} /> Con Recetas (Keywords)
                                                    {recipeTagFilter === 'with_recipes' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(recipeTagFilter === 'without_recipes')}
                                                    onClick={() => {
                                                        setRecipeTagFilter('without_recipes');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    Sin Recetas asignadas
                                                    {recipeTagFilter === 'without_recipes' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(recipeTagFilter === 'with_tags')}
                                                    onClick={() => {
                                                        setRecipeTagFilter('with_tags');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <Tag size={13} style={{ color: '#B45309' }} /> Con Tags Comerciales
                                                    {recipeTagFilter === 'with_tags' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(recipeTagFilter === 'without_tags')}
                                                    onClick={() => {
                                                        setRecipeTagFilter('without_tags');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    Sin Tags Comerciales
                                                    {recipeTagFilter === 'without_tags' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>

                                                {recipeTagFilter !== 'all' && (
                                                    <>
                                                        <div style={dropdownDividerStyle} />
                                                        <button
                                                            type="button"
                                                            style={dropdownResetStyle}
                                                            onClick={() => {
                                                                setRecipeTagFilter('all');
                                                                setOpenHeaderMenu(null);
                                                            }}
                                                        >
                                                            <RotateCcw size={12} /> Restablecer filtro
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </th>

                                    {/* COLUMNA PRECIO */}
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', textAlign: 'center', position: 'relative' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <span>Precio</span>
                                            <button
                                                type="button"
                                                data-header-dropdown="true"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenHeaderMenu(openHeaderMenu === 'price' ? null : 'price');
                                                }}
                                                title="Ordenar o filtrar precios"
                                                style={{
                                                    background: (priceFilter !== 'all' || sortConfig.column === 'price') ? THEME.colors.primaryLight : 'transparent',
                                                    border: `1px solid ${(priceFilter !== 'all' || sortConfig.column === 'price') ? THEME.colors.primary : 'transparent'}`,
                                                    color: (priceFilter !== 'all' || sortConfig.column === 'price') ? THEME.colors.primary : THEME.colors.textSecondary,
                                                    borderRadius: '6px',
                                                    padding: '3px 5px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {sortConfig.column === 'price' ? (
                                                    sortConfig.direction === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} /> : <ArrowDown size={13} strokeWidth={2.5} />
                                                ) : (
                                                    <SlidersHorizontal size={13} strokeWidth={1.75} />
                                                )}
                                                {priceFilter !== 'all' && (
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: THEME.colors.primary }} />
                                                )}
                                            </button>
                                        </div>

                                        {openHeaderMenu === 'price' && (
                                            <div data-header-dropdown="true" style={{ ...dropdownBaseStyle, left: '50%', transform: 'translateX(-50%)' }}>
                                                <div style={dropdownSectionHeaderStyle}>Ordenar por Precio</div>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(sortConfig.column === 'price' && sortConfig.direction === 'asc' && !sortConfig.special)}
                                                    onClick={() => {
                                                        setSortConfig({ column: 'price', direction: 'asc' });
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <ArrowUp size={13} /> Menor a Mayor ($ ↑)
                                                    {sortConfig.column === 'price' && sortConfig.direction === 'asc' && !sortConfig.special && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(sortConfig.column === 'price' && sortConfig.direction === 'desc')}
                                                    onClick={() => {
                                                        setSortConfig({ column: 'price', direction: 'desc' });
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <ArrowDown size={13} /> Mayor a Menor ($ ↓)
                                                    {sortConfig.column === 'price' && sortConfig.direction === 'desc' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(sortConfig.column === 'price' && sortConfig.special === 'zero_first')}
                                                    onClick={() => {
                                                        setSortConfig({ column: 'price', direction: 'asc', special: 'zero_first' });
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <DollarSign size={13} /> Precios en $0 primero
                                                    {sortConfig.column === 'price' && sortConfig.special === 'zero_first' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>

                                                <div style={dropdownDividerStyle} />

                                                <div style={dropdownSectionHeaderStyle}>Filtro de Precio</div>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(priceFilter === 'all')}
                                                    onClick={() => {
                                                        setPriceFilter('all');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    Todos los precios
                                                    {priceFilter === 'all' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(priceFilter === 'with_price')}
                                                    onClick={() => {
                                                        setPriceFilter('with_price');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    Solo con precio (&gt; $0)
                                                    {priceFilter === 'with_price' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(priceFilter === 'zero_price')}
                                                    onClick={() => {
                                                        setPriceFilter('zero_price');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    Solo sin precio ($0)
                                                    {priceFilter === 'zero_price' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>

                                                {(sortConfig.column === 'price' || priceFilter !== 'all') && (
                                                    <>
                                                        <div style={dropdownDividerStyle} />
                                                        <button
                                                            type="button"
                                                            style={dropdownResetStyle}
                                                            onClick={() => {
                                                                if (sortConfig.column === 'price') setSortConfig({ column: null, direction: 'asc' });
                                                                setPriceFilter('all');
                                                                setOpenHeaderMenu(null);
                                                            }}
                                                        >
                                                            <RotateCcw size={12} /> Restablecer precio
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </th>

                                    {/* COLUMNA OFERTA / VAR. */}
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', textAlign: 'center', position: 'relative' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <span>Oferta / Var.</span>
                                            <button
                                                type="button"
                                                data-header-dropdown="true"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenHeaderMenu(openHeaderMenu === 'variants' ? null : 'variants');
                                                }}
                                                title="Filtrar por variantes"
                                                style={{
                                                    background: variantFilter !== 'all' ? THEME.colors.primaryLight : 'transparent',
                                                    border: `1px solid ${variantFilter !== 'all' ? THEME.colors.primary : 'transparent'}`,
                                                    color: variantFilter !== 'all' ? THEME.colors.primary : THEME.colors.textSecondary,
                                                    borderRadius: '6px',
                                                    padding: '3px 5px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <SlidersHorizontal size={13} strokeWidth={1.75} />
                                                {variantFilter !== 'all' && (
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: THEME.colors.primary }} />
                                                )}
                                            </button>
                                        </div>

                                        {openHeaderMenu === 'variants' && (
                                            <div data-header-dropdown="true" style={{ ...dropdownBaseStyle, left: '50%', transform: 'translateX(-50%)' }}>
                                                <div style={dropdownSectionHeaderStyle}>Filtro de Variantes</div>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(variantFilter === 'all')}
                                                    onClick={() => {
                                                        setVariantFilter('all');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    Todas las ofertas / variantes
                                                    {variantFilter === 'all' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(variantFilter === 'with_variants')}
                                                    onClick={() => {
                                                        setVariantFilter('with_variants');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <Package size={13} /> Con variantes configuradas
                                                    {variantFilter === 'with_variants' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(variantFilter === 'without_variants')}
                                                    onClick={() => {
                                                        setVariantFilter('without_variants');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    Sin variantes (SKU Simple)
                                                    {variantFilter === 'without_variants' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>

                                                {variantFilter !== 'all' && (
                                                    <>
                                                        <div style={dropdownDividerStyle} />
                                                        <button
                                                            type="button"
                                                            style={dropdownResetStyle}
                                                            onClick={() => {
                                                                setVariantFilter('all');
                                                                setOpenHeaderMenu(null);
                                                            }}
                                                        >
                                                            <RotateCcw size={12} /> Restablecer filtro
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </th>

                                    {/* COLUMNA PRESENCIA */}
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', textAlign: 'center', position: 'relative' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <span>Presencia</span>
                                            <button
                                                type="button"
                                                data-header-dropdown="true"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenHeaderMenu(openHeaderMenu === 'visibility' ? null : 'visibility');
                                                }}
                                                title="Filtrar por visibilidad"
                                                style={{
                                                    background: visibilityColFilter !== 'all' ? THEME.colors.primaryLight : 'transparent',
                                                    border: `1px solid ${visibilityColFilter !== 'all' ? THEME.colors.primary : 'transparent'}`,
                                                    color: visibilityColFilter !== 'all' ? THEME.colors.primary : THEME.colors.textSecondary,
                                                    borderRadius: '6px',
                                                    padding: '3px 5px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <SlidersHorizontal size={13} strokeWidth={1.75} />
                                                {visibilityColFilter !== 'all' && (
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: THEME.colors.primary }} />
                                                )}
                                            </button>
                                        </div>

                                        {openHeaderMenu === 'visibility' && (
                                            <div data-header-dropdown="true" style={{ ...dropdownBaseStyle, right: 0, left: 'auto' }}>
                                                <div style={dropdownSectionHeaderStyle}>Filtro de Presencia</div>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(visibilityColFilter === 'all')}
                                                    onClick={() => {
                                                        setVisibilityColFilter('all');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    Todos los estados
                                                    {visibilityColFilter === 'all' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(visibilityColFilter === 'visible')}
                                                    onClick={() => {
                                                        setVisibilityColFilter('visible');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <Eye size={13} style={{ color: THEME.colors.primary }} /> Solo Visibles (@web)
                                                    {visibilityColFilter === 'visible' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(visibilityColFilter === 'hidden')}
                                                    onClick={() => {
                                                        setVisibilityColFilter('hidden');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <EyeOff size={13} style={{ color: '#DC2626' }} /> Solo Ocultos (@oculto)
                                                    {visibilityColFilter === 'hidden' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>

                                                {visibilityColFilter !== 'all' && (
                                                    <>
                                                        <div style={dropdownDividerStyle} />
                                                        <button
                                                            type="button"
                                                            style={dropdownResetStyle}
                                                            onClick={() => {
                                                                setVisibilityColFilter('all');
                                                                setOpenHeaderMenu(null);
                                                            }}
                                                        >
                                                            <RotateCcw size={12} /> Restablecer filtro
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </th>

                                    {/* COLUMNA DEV REVISIÓN */}
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', textAlign: 'center', position: 'relative' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <span>Dev Revisión</span>
                                            <button
                                                type="button"
                                                data-header-dropdown="true"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenHeaderMenu(openHeaderMenu === 'devreview' ? null : 'devreview');
                                                }}
                                                title="Filtrar por revisión técnica"
                                                style={{
                                                    background: devReviewFilter !== 'all' ? THEME.colors.primaryLight : 'transparent',
                                                    border: `1px solid ${devReviewFilter !== 'all' ? THEME.colors.primary : 'transparent'}`,
                                                    color: devReviewFilter !== 'all' ? THEME.colors.primary : THEME.colors.textSecondary,
                                                    borderRadius: '6px',
                                                    padding: '3px 5px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <SlidersHorizontal size={13} strokeWidth={1.75} />
                                                {devReviewFilter !== 'all' && (
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: THEME.colors.primary }} />
                                                )}
                                            </button>
                                        </div>

                                        {openHeaderMenu === 'devreview' && (
                                            <div data-header-dropdown="true" style={{ ...dropdownBaseStyle, right: 0, left: 'auto' }}>
                                                <div style={dropdownSectionHeaderStyle}>Filtro de Dev Revisión</div>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(devReviewFilter === 'all')}
                                                    onClick={() => {
                                                        setDevReviewFilter('all');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    Todos
                                                    {devReviewFilter === 'all' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(devReviewFilter === 'verified')}
                                                    onClick={() => {
                                                        setDevReviewFilter('verified');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <CheckCircle size={13} style={{ color: '#059669' }} /> Revisados (DEV)
                                                    {devReviewFilter === 'verified' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={dropdownItemStyle(devReviewFilter === 'pending')}
                                                    onClick={() => {
                                                        setDevReviewFilter('pending');
                                                        setOpenHeaderMenu(null);
                                                    }}
                                                >
                                                    <AlertCircle size={13} style={{ color: '#D97706' }} /> Pendientes (DEV)
                                                    {devReviewFilter === 'pending' && <Check size={13} style={{ marginLeft: 'auto' }} />}
                                                </button>

                                                {devReviewFilter !== 'all' && (
                                                    <>
                                                        <div style={dropdownDividerStyle} />
                                                        <button
                                                            type="button"
                                                            style={dropdownResetStyle}
                                                            onClick={() => {
                                                                setDevReviewFilter('all');
                                                                setOpenHeaderMenu(null);
                                                            }}
                                                        >
                                                            <RotateCcw size={12} /> Restablecer filtro
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </th>

                                    {/* COLUMNA ACCIÓN */}
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', textAlign: 'center' }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedProducts.length === 0 && (
                                    <tr>
                                        <td colSpan={9} style={{ padding: '3.5rem 1rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                                                <ImageIcon size={36} strokeWidth={1.5} style={{ opacity: 0.35, color: THEME.colors.textSecondary }} />
                                                <div style={{ fontWeight: '600', fontSize: '1rem', color: THEME.colors.textMain }}>
                                                    No se encontraron productos con estos filtros
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: THEME.colors.textSecondary }}>
                                                    {photoFilter === 'without_photo'
                                                        ? '¡Excelente! No hay productos pendientes de foto con los criterios seleccionados.'
                                                        : 'Prueba modificando tu búsqueda o restableciendo los filtros de columna.'}
                                                </div>
                                                {isAnyColumnFiltered && (
                                                    <button
                                                        type="button"
                                                        onClick={resetAllColumnFilters}
                                                        style={{
                                                            marginTop: '0.5rem',
                                                            padding: '0.4rem 0.9rem',
                                                            borderRadius: THEME.radius.md,
                                                            border: `1px solid ${THEME.colors.border}`,
                                                            backgroundColor: THEME.colors.surface,
                                                            color: THEME.colors.primary,
                                                            fontWeight: '600',
                                                            fontSize: '0.8rem',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <RotateCcw size={13} /> Restablecer todos los filtros
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
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
                                                    <span style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>ID: {product.accounting_id || product.id?.slice(0, 8)}</span>
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
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', minWidth: '280px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {/* 1. SECCIÓN RECETAS (KEYWORDS) */}
                                                <div style={{ backgroundColor: '#F0FDF4', padding: '6px 8px', borderRadius: THEME.radius.sm, border: '1px solid #BBF7D0' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                        <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <ChefHat size={12} /> Recetas (Keywords)
                                                        </span>
                                                    </div>
                                                    
                                                    {/* Active Recipe Badges */}
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '4px', justifyContent: 'flex-start' }}>
                                                        {(product.keywords || '')
                                                            .split(',')
                                                            .map(k => k.trim())
                                                            .filter(Boolean)
                                                            .map((recipeKey, i) => {
                                                                const matched = TYPICAL_RECIPES.find(r => r.id === recipeKey.toLowerCase() || r.label.toLowerCase() === recipeKey.toLowerCase());
                                                                return (
                                                                    <span key={i} style={{ 
                                                                        fontSize: '0.65rem', 
                                                                        padding: '1px 6px', 
                                                                        backgroundColor: '#DCFCE7', 
                                                                        color: '#15803D', 
                                                                        borderRadius: '4px',
                                                                        fontWeight: '700',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '3px',
                                                                        border: '1px solid #86EFAC'
                                                                    }}>
                                                                        <ChefHat size={10} />
                                                                        <span>{matched?.label || recipeKey}</span>
                                                                        <X size={10} strokeWidth={2} style={{ cursor: 'pointer', color: '#166534' }} onClick={() => {
                                                                            const currentList = (product.keywords || '').split(',').map(k => k.trim()).filter(Boolean);
                                                                            const newList = currentList.filter(k => k.toLowerCase() !== recipeKey.toLowerCase());
                                                                            updateProductField(product.id, 'keywords', newList.join(', '));
                                                                        }} />
                                                                    </span>
                                                                );
                                                            })}
                                                    </div>

                                                    {/* Quick Recipe Chips Toggle */}
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                                        {TYPICAL_RECIPES.map(rec => {
                                                            const currentList = (product.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                                                            const isAssigned = currentList.includes(rec.id) || currentList.includes(rec.label.toLowerCase());
                                                            if (isAssigned) return null;

                                                            return (
                                                                <button
                                                                    key={rec.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const updated = Array.from(new Set([...currentList, rec.id])).join(', ');
                                                                        updateProductField(product.id, 'keywords', updated);
                                                                    }}
                                                                    style={{
                                                                        fontSize: '0.62rem',
                                                                        padding: '1px 5px',
                                                                        borderRadius: '3px',
                                                                        border: '1px dashed #86EFAC',
                                                                        backgroundColor: '#FFFFFF',
                                                                        color: '#166534',
                                                                        cursor: 'pointer',
                                                                        fontWeight: '600',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '2px'
                                                                    }}
                                                                >
                                                                    + {rec.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* 2. SECCIÓN TAGS COMERCIALES (TAGS) */}
                                                <div style={{ backgroundColor: '#FFFBEB', padding: '6px 8px', borderRadius: THEME.radius.sm, border: '1px solid #FDE68A' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                        <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#B45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Tag size={12} /> Tags Comerciales
                                                        </span>
                                                    </div>

                                                    {/* Active Commercial Tags */}
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '4px', justifyContent: 'flex-start' }}>
                                                        {product.tags?.map((tag, i) => (
                                                            <span key={i} style={{ 
                                                                fontSize: '0.65rem', 
                                                                padding: '1px 6px', 
                                                                backgroundColor: '#FEF3C7', 
                                                                color: '#92400E', 
                                                                borderRadius: '4px',
                                                                fontWeight: '700',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '3px',
                                                                border: '1px solid #FCD34D'
                                                            }}>
                                                                {tag}
                                                                <X size={10} strokeWidth={2} style={{ cursor: 'pointer', color: '#B45309' }} onClick={() => {
                                                                    const newTags = product.tags?.filter(t => t !== tag) || [];
                                                                    updateProductField(product.id, 'tags', newTags);
                                                                }} />
                                                            </span>
                                                        ))}
                                                    </div>

                                                    {/* Quick Tag Chips & Input */}
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', alignItems: 'center' }}>
                                                        {COMMERCIAL_TAGS.map(tLabel => {
                                                            const tVal = tLabel.toLowerCase();
                                                            const isAssigned = (product.tags || []).some(t => t.toLowerCase() === tVal);
                                                            if (isAssigned) return null;

                                                            return (
                                                                <button
                                                                    key={tVal}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const newTags = Array.from(new Set([...(product.tags || []), tVal]));
                                                                        updateProductField(product.id, 'tags', newTags);
                                                                    }}
                                                                    style={{
                                                                        fontSize: '0.62rem',
                                                                        padding: '1px 5px',
                                                                        borderRadius: '3px',
                                                                        border: '1px dashed #FCD34D',
                                                                        backgroundColor: '#FFFFFF',
                                                                        color: '#92400E',
                                                                        cursor: 'pointer',
                                                                        fontWeight: '600'
                                                                    }}
                                                                >
                                                                    + {tLabel}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
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
                                            {(() => {
                                                const isVerified = product.is_verified_dev || (product.tags && product.tags.includes('verified_dev'));
                                                return (
                                                    <button
                                                        onClick={() => canEdit && toggleDevVerified(product)}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            padding: '4px 8px',
                                                            borderRadius: '20px',
                                                            border: `1px solid ${isVerified ? '#A7F3D0' : '#FDE68A'}`,
                                                            backgroundColor: isVerified ? '#ECFDF5' : '#FFFBEB',
                                                            color: isVerified ? '#065F46' : '#92400E',
                                                            fontSize: '0.7rem',
                                                            fontWeight: '700',
                                                            cursor: canEdit ? 'pointer' : 'not-allowed',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        title={canEdit ? (isVerified ? "Dev: SKU Revisado (Click para marcar pendiente)" : "Dev: Pendiente (Click para marcar revisado)") : "Modo Vista"}
                                                    >
                                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isVerified ? '#10B981' : '#F59E0B' }}></div>
                                                        <span>{isVerified ? '🔍 REVISADO' : '⏳ PENDIENTE'}</span>
                                                    </button>
                                                );
                                            })()}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                            <button
                                                onClick={() => toggleActive(product.id, product.is_active)}
                                                disabled={!canEdit}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    borderRadius: THEME.radius.md,
                                                    border: `1px solid ${product.is_active ? '#E2E8F0' : '#A7F3D0'}`,
                                                    backgroundColor: product.is_active ? '#F8FAFC' : '#ECFDF5',
                                                    color: product.is_active ? THEME.colors.textSecondary : THEME.colors.primary,
                                                    cursor: canEdit ? 'pointer' : 'not-allowed',
                                                    opacity: canEdit ? 1 : 0.6,
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
