'use client';

import { useState, useEffect } from 'react';
import { supabase, Product } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import Navbar from '@/components/Navbar';
import Toast from '@/components/Toast';
import Link from 'next/link';
import VariantModal from '@/components/VariantModal';
import CreateProductModal from '@/components/CreateProductModal';

export default function AdminProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const { user, profile } = useAuth();

    // Bypass de seguridad para desarrollo habilitado
    const fetchProducts = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('name');
            if (error) {
                console.error('Products fetch error:', error);
                showToast('Error al cargar catálogo', 'error');
            } else if (data) {
                setProducts(data);
            }
        } catch (err) {
            console.error('Unexpected fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const [savingId, setSavingId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'hidden'>('all');

    useEffect(() => {
        fetchProducts();
    }, []);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        if ((window as any).showToast) {
            (window as any).showToast(message, type);
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

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.category.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'active' && p.is_active) ||
            (statusFilter === 'hidden' && !p.is_active);

        return matchesSearch && matchesStatus;
    });



    // Renderizado principal
    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
            <Navbar />

            <style>{`
                @keyframes pulse {
                    0% { opacity: 0.3; }
                    50% { opacity: 1; }
                    100% { opacity: 0.3; }
                }
            `}</style>
            {/* ... existing code ... */}



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
                                color: 'white', 
                                fontWeight: '700', 
                                textDecoration: 'none', 
                                fontSize: '0.9rem',
                                backgroundColor: '#4F46E5',
                                padding: '0.5rem 1.2rem',
                                borderRadius: '8px',
                                border: 'none',
                                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)'
                            }}>
                                🏗️ Ir al Maestro Técnico (Editar Datos)
                            </Link>
                        </div>
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <span style={{ backgroundColor: '#EEF2FF', color: '#4F46E5', padding: '0.2rem 0.8rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '700' }}>
                                👤 {profile?.company_name || user?.email?.split('@')[0] || 'Usuario'}
                            </span>
                            <span style={{ backgroundColor: '#F0FDF4', color: '#166534', padding: '0.2rem 0.8rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '700' }}>
                                🛡️ Acceso de Desarrollo Habilitado
                            </span>
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
                    <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                        {[
                            { id: 'all', label: 'Todos', count: stats.total },
                            { id: 'active', label: 'Activos', count: stats.active },
                            { id: 'hidden', label: 'Ocultos', count: stats.hidden }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setStatusFilter(tab.id as any)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: statusFilter === tab.id ? '#F3F4F6' : 'transparent',
                                    color: statusFilter === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                                    fontWeight: statusFilter === tab.id ? '800' : '600',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                {tab.label}
                                <span style={{ fontSize: '0.75rem', backgroundColor: statusFilter === tab.id ? 'var(--primary)' : '#E5E7EB', color: statusFilter === tab.id ? 'white' : 'inherit', padding: '2px 8px', borderRadius: '10px' }}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <input
                                type="text"
                                placeholder="Buscar por nombre, SKU o categoría..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '1.2rem 3.5rem 1.2rem 3.5rem',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border)',
                                    fontSize: '1.1rem',
                                    boxShadow: 'var(--shadow-sm)'
                                }}
                            />
                            <span style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1.2rem', opacity: 0.4 }}>🔍</span>
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    style={{
                                        position: 'absolute',
                                        right: '1rem',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        border: 'none',
                                        background: '#eee',
                                        borderRadius: '50%',
                                        width: '24px',
                                        height: '24px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 'bold',
                                        fontSize: '0.8rem'
                                    }}
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        <div style={{ backgroundColor: '#F3F4F6', padding: '1rem 1.5rem', borderRadius: '12px', border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '1rem', color: '#6B7280' }}>
                            <span style={{ fontSize: '1.5rem' }}>ℹ️</span>
                            <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                                La creación de nuevos productos y códigos SKU se realiza desde el <strong>Módulo Maestro</strong>.
                            </div>
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
                                            checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedIds(filteredProducts.map(p => p.id));
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
                                {filteredProducts.map((product) => (
                                    <tr key={product.id} style={{ borderBottom: '1px solid var(--border)', height: '110px', backgroundColor: selectedIds.includes(product.id) ? '#F9FAFB' : 'transparent' }}>
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
                                                    borderRadius: '8px',
                                                    overflow: 'hidden',
                                                    backgroundColor: '#eee',
                                                    flexShrink: 0,
                                                    boxShadow: 'var(--shadow-sm)',
                                                    cursor: 'pointer',
                                                    position: 'relative',
                                                    transition: 'transform 0.2s'
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                                onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                            >
                                                {product.image_url && <img src={product.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                                <div style={{
                                                    position: 'absolute',
                                                    inset: 0,
                                                    backgroundColor: 'rgba(0,0,0,0.3)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    opacity: 0,
                                                    transition: 'opacity 0.2s',
                                                    color: 'white',
                                                    fontSize: '1.2rem'
                                                }}
                                                    className="image-hover"
                                                    onMouseOver={(e) => (e.currentTarget as HTMLElement).style.opacity = '1'}
                                                    onMouseOut={(e) => (e.currentTarget as HTMLElement).style.opacity = '0'}
                                                >
                                                    📷
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
                                            <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ width: '100%', fontWeight: '700', fontSize: '1.3rem', color: '#111827', padding: '4px 0' }}>
                                                    {product.name}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontSize: '0.9rem', color: '#1E3A8A', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SKU:</span>
                                                    <span style={{ fontSize: '1.05rem', color: '#1E40AF', fontWeight: '800' }}>{product.sku}</span>
                                                </div>
                                                <div style={{ width: '100%', fontSize: '0.85rem', color: '#6B7280', padding: '4px 0', minHeight: '40px' }}>
                                                    {product.description || 'Sin descripción técnica registrada.'}
                                                </div>
                                                {product.options_config && Array.isArray(product.options_config) && product.options_config.length > 0 && (
                                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                        {product.options_config.map((opt: any, idx: number) => (
                                                            <span key={idx} style={{
                                                                fontSize: '0.75rem',
                                                                backgroundColor: '#EEF2FF',
                                                                padding: '1px 6px',
                                                                borderRadius: '6px',
                                                                color: '#4F46E5',
                                                                fontWeight: '700',
                                                                textTransform: 'lowercase'
                                                            }}>
                                                                ({opt.name} {opt.values?.length || 0})
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.5rem 1rem' }}>
                                            <div style={{ 
                                                padding: '0.6rem 1.2rem', 
                                                borderRadius: '20px', 
                                                fontSize: '0.9rem', 
                                                backgroundColor: '#F3F4F6', 
                                                color: '#374151', 
                                                fontWeight: '700',
                                                textAlign: 'center',
                                                display: 'inline-block',
                                                minWidth: '120px'
                                            }}>
                                                {product.category}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.5rem 1rem' }}>
                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <div style={{ fontWeight: '800', fontSize: '1.3rem', color: '#111827' }}>
                                                ${product.base_price?.toLocaleString()}
                                            </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.5rem 1rem' }}>
                                            <button
                                                onClick={() => setSelectedProduct(product)}
                                                style={{
                                                    padding: '0.8rem 1.2rem',
                                                    borderRadius: 'var(--radius-md)',
                                                    border: '1px solid var(--primary)',
                                                    backgroundColor: 'transparent',
                                                    color: 'var(--primary)',
                                                    cursor: 'pointer',
                                                    fontSize: '1.05rem',
                                                    fontWeight: '700',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                🧶 Variantes
                                            </button>
                                        </td>
                                        <td style={{ padding: '1.5rem 1rem' }}>
                                            <span style={{
                                                color: product.is_active ? '#10B981' : '#EF4444',
                                                fontWeight: '700',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.6rem',
                                                fontSize: '1.1rem',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: product.is_active ? '#10B981' : '#EF4444' }}></div>
                                                {product.is_active ? 'Activo' : 'OFF'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1.5rem 1rem', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                {product.is_active ? (
                                                    <button
                                                        onClick={() => toggleActive(product.id, product.is_active)}
                                                        style={{
                                                            padding: '0.8rem 1.5rem',
                                                            borderRadius: 'var(--radius-md)',
                                                            border: '1px solid var(--border)',
                                                            backgroundColor: 'white',
                                                            color: 'inherit',
                                                            cursor: 'pointer',
                                                            fontSize: '1.05rem',
                                                            fontWeight: '700',
                                                            transition: 'all 0.2s',
                                                            minWidth: '120px'
                                                        }}
                                                    >
                                                        🚫 Ocultar
                                                    </button>
                                                ) : (
                                                    <div style={{
                                                        padding: '0.8rem 1.5rem',
                                                        borderRadius: 'var(--radius-md)',
                                                        backgroundColor: '#FEE2E2',
                                                        color: '#991B1B',
                                                        fontSize: '0.9rem',
                                                        fontWeight: '800',
                                                        textAlign: 'center',
                                                        border: '1px dashed #EF4444',
                                                        opacity: 0.8,
                                                        minWidth: '120px'
                                                    }}>
                                                        🔒 Bloqueado
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {products.length === 0 && !loading && (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                No hay productos registrados en el catálogo.
                            </div>
                        )}
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
