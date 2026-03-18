'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, Product } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Toast from '@/components/Toast';
import Link from 'next/link';
import Image from 'next/image';
import CreateProductModal from '@/components/CreateProductModal';
import EditProductModal from '@/components/EditProductModal';
import ManageAttributesModal from '@/components/ManageAttributesModal';
import VariantModal from '@/components/VariantModal';
import * as XLSX from 'xlsx';
import { CATEGORY_MAP } from '@/lib/constants';
import { 
    Plus, 
    FileDown, 
    FileUp, 
    Percent, 
    Globe, 
    EyeOff, 
    Search,
    ChevronDown,
    ChevronUp,
    Wand2,
    Dna,
    Package,
    CheckCircle,
    AlertCircle,
    Lock,
    X,
    Info
} from 'lucide-react';



interface ProductConversion {
    id: string;
    product_id: string;
    from_unit: string;
    to_unit: string;
    conversion_factor: number;
}

export default function MasterProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [conversions, setConversions] = useState<ProductConversion[]>([]);
    const [conversionProduct, setConversionProduct] = useState<Product | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [wipeExistingData, setWipeExistingData] = useState(false); // Nueva opción de limpieza
    const [dynamicUnits, setDynamicUnits] = useState<string[]>(['Kg', 'G', 'Lb', 'Lt', 'Un', 'Atado', 'Bulto', 'Caja', 'Saco', 'Cubeta']);
    const [selectedVariantProduct, setSelectedVariantProduct] = useState<Product | null>(null);
    const [selectedEditProduct, setSelectedEditProduct] = useState<Product | null>(null);
    const [isManageAttributesModalOpen, setIsManageAttributesModalOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
    const [isInfoGuideOpen, setIsInfoGuideOpen] = useState(false);
    const ITEMS_PER_PAGE = 50;

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
        const win = window as unknown as { showToast?: (m: string, t: string) => void };
        if (win.showToast) {
            win.showToast(message, type);

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

            // Cargas secundarias (simultáneas para no bloquear UI)
            Promise.all([
                supabase.from('product_conversions').select('*'),
                supabase.from('app_settings').select('value').eq('key', 'standard_units').maybeSingle()
            ]).then(([conv, settings]) => {
                if (conv.data) setConversions(conv.data as ProductConversion[]);
                if (settings.data?.value) setDynamicUnits((settings.data.value as string).split(','));
            }).catch(e => console.warn('Carga secundaria falló:', e));

        } catch (err: unknown) {
            const error = err as Error;
            if (error.name === 'AbortError' || error.message?.includes('aborted')) {

                console.log('Petición interrumpida (Normal en HMR)');
                return;
            }
            console.error('Falla inesperada:', err);
            showToast('Falla en el puente de datos', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    // Resetear a página 1 cuando se busca algo
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    // Helper para generar SKU técnico secuencial
    const generateSequentialSKU = (lastSKU: string) => {
        const num = parseInt(lastSKU || '0') + 1;
        return num.toString().padStart(4, '0');
    };

    // Helper para generar descripción técnica equilibrada
    const generateDescription = (name: string, categoryCode: string) => {
        if (!name) return '';
        const nameNorm = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        
        let usage = "consumo diario y diversas preparaciones culinarias";
        let healthBenefit = "aliado ideal para mantener una dieta equilibrada y un estilo de vida saludable";

        // Mapeo por códigos técnicos
        if (categoryCode === 'FR') {
            usage = "ensaladas de frutas, postres, snacks saludables y jugos naturales";
            healthBenefit = "excelente fuente natural de vitaminas, antioxidantes y fibra que activan tu vitalidad";
        } else if (categoryCode === 'VE' || categoryCode === 'HO') {
            usage = "preparaciones gourmet, ensaladas frescas, guisados y acompañamientos";
            healthBenefit = "rico en minerales esenciales y clorofila que ayudan a desintoxicar el organismo";
        } else if (categoryCode === 'TU') {
            usage = "purés, frituras crocantes, procesos de horneado y bases de sopas";
            healthBenefit = "aporta energía duradera gracias a sus carbohidratos de absorción lenta";
        } else if (categoryCode === 'LA') {
            usage = "consumo directo, desayunos, meriendas y repostería fina";
            healthBenefit = "fuente primordial de calcio y proteínas para el fortalecimiento óseo";
        }

        return `${nameNorm} de calidad premium, seleccionado cuidadosamente para garantizar frescura. Es ideal para ${usage}. Además, es un ${healthBenefit}.`;
    };

    const downloadFullMaster = () => {
        const exportData = products.map(p => ({
            ID_INTERNO: p.id,
            SKU: p.sku || '',
            ID_CONTABLE: p.accounting_id || '',
            Nombre: p.name || '',
            Descripcion: p.description || '',
            Categoria: p.category || '', // Mantener código técnico para recarga
            Categoria_Nombre: CATEGORY_MAP[p.category] || p.category,
            Unidad: p.unit_of_measure || '',
            Costo_Base: p.base_price || 0,
            IVA: p.iva_rate ?? 19,
            URL_Imagen: p.image_url || '',
            Comprador: p.buying_team || '',
            Metodo_Compra: p.procurement_method || '',
            Activo: p.is_active ? 'SI' : 'NO',
            Web: p.show_on_web ? 'SI' : 'NO',
            Min_Inventario: p.min_inventory_level || 0,
            Config_Opciones: p.options_config ? JSON.stringify(p.options_config) : '[]',
            Variantes_JSON: p.variants ? JSON.stringify(p.variants) : '[]'
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        // Ajustar anchos de columna básicos
        worksheet['!cols'] = [
            { wch: 36 }, { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 60 }, 
            { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 50 },
            { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 15 }
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Maestro_Completo");
        XLSX.writeFile(workbook, `full_maestro_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('Catálogo completo exportado para edición', 'success');
    };

    const sanitizeMasterData = async () => {
        if (!confirm('¿Deseas generar automáticamente SKUs y Descripciones para todos los productos que no los tengan?')) return;
        
        try {
            setLoading(true);
            let updatedCount = 0;
            const toUpdate = products.filter(p => !p.sku || !p.description);
            
            if (toUpdate.length === 0) {
                showToast('Todos los productos ya tienen SKU y Descripción.', 'info');
                setLoading(false);
                return;
            }

            for (const p of toUpdate) {
                const updates: Partial<Product> = {};

                if (!p.sku) {
                    // Para sanetización manual de productos huérfanos
                    const lastSku = products.filter(pr => pr.sku).sort((a,b) => a.sku.localeCompare(b.sku)).pop()?.sku || '0000';
                    updates.sku = generateSequentialSKU(lastSku);
                }
                if (!p.description) updates.description = generateDescription(p.name, p.category);

                if (Object.keys(updates).length > 0) {
                    const { error } = await supabase.from('products').update(updates).eq('id', p.id);
                    if (!error) updatedCount++;
                }
            }

            showToast(`Sanetización completada: ${updatedCount} productos actualizados.`, 'success');
            await fetchProducts();
        } catch (error) {
            console.error('Sanitize error:', error);
            showToast('Error durante la sanetización', 'error');
        } finally {
            setLoading(false);
        }
    };

    const updateProductField = async (id: string, field: keyof Product, value: string | number | boolean | unknown[] | null) => {

        const currentProduct = products.find(p => p.id === id);
        if (currentProduct && currentProduct[field] === value) return;

        // Validación de unicidad para campos clave del maestro
        if (field === 'sku' || field === 'name') {
            const duplicate = products.find(p => p.id !== id && p[field]?.toString().toLowerCase() === value?.toString().toLowerCase());
            if (duplicate) {
                showToast(`Error: Ya existe otro producto con este ${field === 'sku' ? 'SKU' : 'Nombre'}.`, 'error');
                fetchProducts();
                return;
            }
        }

        setSavingId(id);
        
        // 1. Actualización optimista inmediata
        setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));

        // 2. Persistir en servidor
        const { error } = await supabase
            .from('products')
            .update({ [field]: value })
            .eq('id', id);

        if (error) {
            console.error('Master update error:', JSON.stringify(error, null, 2));
            showToast('Error al guardar: ' + error.message, 'error');
            // Revertir en caso de fallo crítico
            fetchProducts();
        } else {
            showToast('Dato maestro sincronizado', 'success');
        }
        setSavingId(null);
    };

    const addConversion = async (productId: string, fromUnit: string, toUnit: string, factor: number) => {
        const { data, error } = await supabase
            .from('product_conversions')
            .insert({ product_id: productId, from_unit: fromUnit, to_unit: toUnit, conversion_factor: factor })
            .select()
            .single();

        if (error) {
            showToast('Error al crear conversión: ' + error.message, 'error');
        } else {
            setConversions([...conversions, data]);
            showToast('Conversión logística añadida', 'success');
        }
    };

    const deleteConversion = async (id: string) => {
        const { error } = await supabase.from('product_conversions').delete().eq('id', id);
        if (error) {
            showToast('Error al eliminar: ' + error.message, 'error');
        } else {
            setConversions(conversions.filter(c => c.id !== id));
            showToast('Conversión eliminada', 'info');
        }
    };

    // Nota: deleteProduct ha sido removido por seguridad para preservar historiales.
    // Use is_active para desactivar SKUs.

    // Nota: deleteProduct y deleteAllProducts han sido removidos por seguridad.


    const handleUploadVariantImage = async (file: File) => {
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(filePath);

            return publicUrl;
        } catch (error) {
            console.error('Error uploading variant image:', error);
            showToast('Error al subir imagen', 'error');
            return null;
        }
    };

    const handleMainImageUpload = async (productId: string, file: File) => {
        setSavingId(productId);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${productId}-${Date.now()}.${fileExt}`;
            
            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(fileName, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(fileName);

            const { error: updateError } = await supabase
                .from('products')
                .update({ image_url: publicUrl })
                .eq('id', productId);

            if (updateError) throw updateError;

            // Optimistic update: Update local state immediately without full re-fetch
            setProducts(prev => prev.map(p => p.id === productId ? { ...p, image_url: publicUrl } : p));
            
            showToast('Imagen principal actualizada', 'success');
        } catch (err: unknown) {
            const error = err as { message?: string };
            showToast('Error al subir imagen: ' + (error.message || 'Error desconocido'), 'error');
            console.error('Main Image Upload Error:', error);
        } finally {
            setSavingId(null);
        }
    };

    const handleSaveVariants = async (optionsConfig: any[] | null, variants: any[] | null): Promise<boolean> => {
        if (!selectedVariantProduct) return false;

        try {
            // 1. Guardar configuración en el maestro
            const { error: prodError } = await supabase
                .from('products')
                .update({ 
                    options_config: optionsConfig,
                    variants: variants // Mantener JSONB como redundancia/historial por ahora
                })
                .eq('id', selectedVariantProduct.id);

            if (prodError) throw prodError;

            // 2. Sincronizar tabla dedicada product_variants
            if (variants && variants.length > 0) {
                // Limpiar anteriores
                await supabase
                    .from('product_variants')
                    .delete()
                    .eq('product_id', selectedVariantProduct.id);

                // Insertar nuevas
                const formattedVariants = variants.map(v => ({
                    product_id: selectedVariantProduct.id,
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

            showToast('Estructura técnica y fotos guardadas', 'success');
            fetchProducts();
            return true;
        } catch (err: unknown) {
            const error = err as { message?: string; code?: string; details?: string };
            const errorMsg = error.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
            showToast('Error al guardar: ' + errorMsg, 'error');
            console.error('Variant Save Error Detailed:', error);
            return false;
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const processFile = async () => {
        if (!selectedFile) return;
        
        const reader = new FileReader();
        reader.onload = async (readerEvent) => {
            const data = readerEvent.target?.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            const rows = XLSX.utils.sheet_to_json(worksheet) as any[];

            if (rows.length === 0) {
                showToast('El archivo está vacío o no tiene el formato correcto', 'error');
                return;
            }

            if (wipeExistingData) {
                const confirmed = confirm('⚠️ ATENCIÓN: Se eliminarán TODOS los productos actuales antes de cargar los nuevos. ¿Estás absolutamente seguro?');
                if (!confirmed) return;
            }

            setLoading(true);
            try {
                if (wipeExistingData) {
                    // Borrado total (excepto quizás un ping de sistema si existiera)
                    const { error: purgeError } = await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000'); 
                    if (purgeError) throw purgeError;
                }

                const productsToInsert = rows.map(row => {
                    // Mapeo flexible por nombres de columna para soportar exportación completa
                    return {
                        id: row.ID_INTERNO || row.id || undefined,
                        sku: (row.SKU || row.sku || '').toString(),
                        accounting_id: parseInt(row.ID_CONTABLE || row.accounting_id || '0'),
                        name: (row.Nombre || row.name || '').toString(),
                        description: (row.Descripcion || row.description || '').toString(),
                        category: (row.Categoria || row.category || 'DE').toString(),
                        unit_of_measure: (row.Unidad || row.unit_of_measure || 'Kg').toString(),
                        base_price: parseFloat(row.Costo_Base || row.base_price || '0'),
                        iva_rate: parseInt(row.IVA || row.iva_rate || '19'),
                        image_url: (row.URL_Imagen || row.image_url || '').toString() || null,
                        buying_team: (row.Comprador || row.buying_team || '').toString(),
                        procurement_method: (row.Metodo_Compra || row.procurement_method || '').toString(),
                        is_active: (row.Activo || row.is_active) === 'SI' || row.is_active === true,
                        show_on_web: (row.Web || row.show_on_web) === 'SI' || row.show_on_web === true,
                        min_inventory_level: parseInt(row.Min_Inventario || row.min_inventory_level || '0'),
                        options_config: typeof row.Config_Opciones === 'string' ? JSON.parse(row.Config_Opciones) : (row.options_config || []),
                        variants: typeof row.Variantes_JSON === 'string' ? JSON.parse(row.Variantes_JSON) : (row.variants || [])
                    };
                });

                // Cargar en bloques de 100
                const chunkSize = 100;
                for (let i = 0; i < productsToInsert.length; i += chunkSize) {
                    const chunk = productsToInsert.slice(i, i + chunkSize);
                    const { error } = await supabase.from('products').upsert(chunk);
                    if (error) throw error;
                }

                showToast(`Carga masiva completada: ${productsToInsert.length} productos procesados.`, 'success');
                setIsBulkModalOpen(false);
                setSelectedFile(null);
                fetchProducts();
            } catch (err: any) {
                console.error('Error en carga masiva:', err);
                showToast('Error en la carga: ' + err.message, 'error');
            } finally {
                setLoading(false);
            }
        };
        reader.readAsBinaryString(selectedFile);
    };

    const downloadTemplate = () => {
        const data = [
            ["SKU", "Nombre", "Descripcion", "Categoria", "Unidad", "Costo_Base", "IVA", "URL_Imagen", "Comprador", "Metodo_Compra", "Activo", "Web", "Min_Inventario"],
            ["M-FR-MNZ-K", "Manzana Roja", "Manzana fresca seleccionada...", "FR", "Kg", 5000, 0, "", "FRUTA", "Compras Generales", "SI", "SI", 10],
            ["M-VE-CBL-K", "Cebolla Cabezona", "Cebolla de alta calidad...", "VE", "Kg", 2000, 0, "", "VEGETAL", "Compras Generales", "SI", "SI", 20]
        ];

        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Plantilla_Productos");
        XLSX.writeFile(workbook, "plantilla_carga_masiva_frubana.xlsx");
    };

    const filteredProducts = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return products;

        // Separar términos normales de etiquetas con @
        const parts = query.split(/\s+/);
        const tags = parts.filter(p => p.startsWith('@')).map(t => t.slice(1));
        const searchTerms = parts.filter(p => !p.startsWith('@'));

        return products.filter(p => {
            // 1. Lógica de TEXTO (AND: debe cumplir todos los términos escritos)
            const matchesText = searchTerms.every(term => 
                p.name?.toLowerCase().includes(term) ||
                p.sku?.toLowerCase().includes(term) ||
                p.accounting_id?.toString().includes(term)
            );

            if (!matchesText && searchTerms.length > 0) return false;

            // 2. Lógica de ETIQUETAS (AND: debe cumplir todos los filtros @)
            const matchesTags = tags.every(tag => {
                // Filtro IVA (@19, @19%, @0...)
                if (['0', '5', '19', '22'].includes(tag.replace('%', ''))) {
                    const rate = parseInt(tag.replace('%', ''));
                    return (p.iva_rate ?? 19) === rate;
                }

                // Filtro Web (@web, @virtual, @oculto)
                if (tag === 'web' || tag === 'virtual') return p.show_on_web;
                if (tag === 'oculto' || tag === 'hidden') return !p.show_on_web;

                // Filtro Estado Maestro (@on, @activo, @off, @inactivo)
                if (tag === 'on' || tag === 'activo') return p.is_active;
                if (tag === 'off' || tag === 'inactivo') return !p.is_active;

                // Filtro Categoría (@frutas, @despensa...)
                const categoryEntry = Object.entries(CATEGORY_MAP).find(([_, label]) => 
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
    }, [products, searchQuery]);

    const paginatedProducts = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredProducts, currentPage]);

    const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6' }}>
            <Navbar />
            <Toast />
            
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
                <header style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <Link href="/admin/dashboard" style={{ textDecoration: 'none', color: '#6B7280', fontWeight: '600', fontSize: '0.9rem' }}>← Volver</Link>
                            <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', margin: '0.5rem 0 0 0' }}>Data Maestra de SKUs 🏗️</h1>
                            <p style={{ color: '#6B7280' }}>Definición técnica de productos, códigos únicos y unidades base.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={sanitizeMasterData}
                                style={{
                                    padding: '1rem 1.5rem',
                                    borderRadius: '12px',
                                    backgroundColor: '#FEF3C7',
                                    color: '#92400E',
                                    border: '1px solid #FDE68A',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.8rem',
                                }}
                                title="Generar SKUs y descripciones faltantes"
                            >
                                <Wand2 size={18} /> Sanetizar Datos

                            </button>
                            <button
                                onClick={() => setIsManageAttributesModalOpen(true)}
                                style={{
                                    padding: '1rem 1.5rem',
                                    borderRadius: '12px',
                                    backgroundColor: 'white',
                                    color: '#4B5563',
                                    border: '1px solid #D1D5DB',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.8rem',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                                }}
                            >
                                <Dna size={18} /> Variaciones Maestras

                            </button>
                            <button
                                onClick={() => setIsCreateModalOpen(true)}
                                style={{
                                    padding: '1rem 2rem',
                                    borderRadius: '12px',
                                    backgroundColor: '#111827',
                                    color: 'white',
                                    border: 'none',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.8rem',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                }}
                            >
                                <Plus size={18} /> Crear Nuevo SKU Maestro

                            </button>
                            <button
                                onClick={downloadFullMaster}
                                style={{
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    backgroundColor: '#EFF6FF',
                                    color: '#2563EB',
                                    border: '1px solid #BFDBFE',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.8rem',
                                    transition: 'all 0.2s'
                                }}
                                title="Exportar Todo el Maestro (Excel)"
                            >
                                <FileDown size={20} />

                            </button>
                            <button
                                onClick={() => setIsBulkModalOpen(true)}
                                style={{
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    backgroundColor: '#F3F4F6',
                                    color: '#374151',
                                    border: '1px solid #E5E7EB',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.8rem',
                                    transition: 'all 0.2s',
                                    position: 'relative'
                                }}
                                title="Carga Masiva desde Excel"
                            >
                                <div style={{ position: 'relative' }}>
                                    <FileUp size={20} />
                                </div>
                            </button>
                        </div>
                    </div>
                </header>

                {/* Dashboard Rápido / KPI'S INTERACTIVOS COMPACTOS */}
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
                    gap: '1rem', 
                    marginBottom: '1rem' 
                }}>
                    {/* CARD 1: TOTAL CATALOGO */}
                    <div style={{ 
                        backgroundColor: 'white', 
                        padding: '1.1rem 1.2rem', 
                        borderRadius: '16px', 
                        border: '1px solid #E5E7EB',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.05 }}>
                            <Package size={80} color="#111827" />
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portafolio Maestro</span>
                        <div style={{ fontSize: '2rem', fontWeight: '900', color: '#111827', margin: '0.1rem 0' }}>{products.length}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#059669', fontWeight: '700' }}>
                            <CheckCircle size={12} /> SKUs Técnicos Únicos
                        </div>
                    </div>

                    {/* CARD 2: VISIBILIDAD WEB */}
                    <div style={{ 
                        backgroundColor: 'white', 
                        padding: '1.1rem 1.2rem', 
                        borderRadius: '16px', 
                        border: '1px solid #E5E7EB',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                    }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alcance Comercial</span>
                        <div style={{ fontSize: '2rem', fontWeight: '900', color: '#2563EB', margin: '0.1rem 0' }}>
                            {Math.round((products.filter(p => p.show_on_web).length / (products.length || 1)) * 100)}%
                        </div>
                        <div style={{ height: '4px', backgroundColor: '#EFF6FF', borderRadius: '10px', marginTop: '6px' }}>
                            <div style={{ 
                                width: `${(products.filter(p => p.show_on_web).length / (products.length || 1)) * 100}%`, 
                                height: '100%', 
                                backgroundColor: '#2563EB', 
                                borderRadius: '10px' 
                            }}></div>
                        </div>
                        <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: '#1E40AF', fontWeight: '700' }}>
                            {products.filter(p => p.show_on_web).length} en tienda virtual
                        </p>
                    </div>

                    {/* CARD 3: SALUD FISCAL (IVA) */}
                    <div style={{ 
                        backgroundColor: 'white', 
                        padding: '1.1rem 1.2rem', 
                        borderRadius: '16px', 
                        border: '1px solid #E5E7EB',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                    }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cumplimiento Fiscal</span>
                        <div style={{ fontSize: '2rem', fontWeight: '900', color: '#C2410C', margin: '0.1rem 0' }}>
                            {products.filter(p => p.iva_rate !== undefined).length} <span style={{ fontSize: '1rem', color: '#9CA3AF' }}>/ {products.length}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '3px', marginTop: '10px' }}>
                            {[22, 19, 5, 0].map(rate => {
                                const count = products.filter(p => p.iva_rate === rate).length;
                                if (count === 0) return null;
                                return (
                                    <div key={rate} style={{ 
                                        flex: count, 
                                        height: '10px', 
                                        backgroundColor: rate === 22 ? '#6B21A8' : rate === 19 ? '#C2410C' : rate === 5 ? '#1E40AF' : '#166534',
                                        borderRadius: '2px'
                                    }} title={`${rate}%: ${count} SKUs`}></div>
                                );
                            })}
                        </div>
                        <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: '#6B7280', fontWeight: '700' }}>
                            Distribución de tasas IVA
                        </p>
                    </div>

                    {/* CARD 4: POLÍTICAS DE RIESGO */}
                    <div style={{ 
                        backgroundColor: 'white', 
                        padding: '1.1rem 1.2rem', 
                        borderRadius: '16px', 
                        border: '1px solid #E5E7EB',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                        borderLeft: '4px solid #EF4444'
                    }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Control de Quiebres</span>
                        <div style={{ fontSize: '2rem', fontWeight: '900', color: '#B91C1C', margin: '0.1rem 0' }}>
                            {products.filter(p => p.min_inventory_level > 0).length}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#B91C1C', fontWeight: '700' }}>
                            <AlertCircle size={12} /> Cobertura: {Math.round((products.filter(p => p.min_inventory_level > 0).length / (products.length || 1)) * 100)}%
                        </div>
                        <p style={{ margin: '6px 0 0 0', fontSize: '0.7rem', color: '#9CA3AF' }}>
                             Seguridad de stock activa
                        </p>
                    </div>
                </div>

                {savingId && (
                    <div style={{ 
                        backgroundColor: '#DBEAFE', 
                        color: '#1E40AF', 
                        padding: '1rem', 
                        borderRadius: '12px', 
                        fontWeight: '700', 
                        fontSize: '0.9rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        marginBottom: '1.5rem',
                        animation: 'pulse 2s infinite'
                    }}>
                        🔄 Guardando cambios en maestro...
                    </div>
                )}

                {/* Buscador Con Esteroides (X y Info) */}
                <div style={{ marginBottom: '2rem', position: 'relative', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}>
                            <Search size={22} />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar por SKU, Nombre o Categoría..."
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
                                    background: 'none',
                                    border: 'none',
                                    color: '#9CA3AF',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                title="Limpiar búsqueda"
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
                                transition: 'all 0.2s',
                                boxShadow: isInfoGuideOpen ? '0 0 0 3px rgba(37, 99, 235, 0.2)' : 'none'
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
                                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
                                border: '1px solid #E5E7EB',
                                padding: '1.5rem',
                                zIndex: 100,
                                animation: 'fadeInDown 0.2s ease-out'
                            }}>
                                <h4 style={{ margin: '0 0 1rem 0', color: '#111827', fontSize: '1rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    🚀 Power Search Guide
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                    {[
                                        { tag: '@19%', desc: 'IVA del 19% (Gral)' },
                                        { tag: '@5%', desc: 'IVA reducido' },
                                        { tag: '@0%', desc: 'Productos exentos' },
                                        { tag: '@web', desc: 'Visibles en tienda' },
                                        { tag: '@virtual', desc: 'Equiv. a @web' },
                                        { tag: '@oculto', desc: 'No publicados' },
                                        { tag: '@on', desc: 'SKUs activos' },
                                        { tag: '@fruta', desc: 'Filtro por Categoría' }
                                    ].map((item, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                            <code style={{ backgroundColor: '#F3F4F6', padding: '2px 6px', borderRadius: '4px', color: '#2563EB', fontWeight: 'bold' }}>{item.tag}</code>
                                            <span style={{ color: '#6B7280' }}>{item.desc}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: '1.2rem', paddingTop: '1rem', borderTop: '1px solid #F3F4F6', fontSize: '0.75rem', color: '#9CA3AF', fontStyle: 'italic' }}>
                                    Puedes combinar términos: "Papa @19% @web"
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', width: '60px' }}>Foto</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>SKU Código</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>Nombre Técnico</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>Categoría</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>Logística</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', textAlign: 'center' }}>Unidad</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', textAlign: 'center' }}>IVA</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', textAlign: 'center' }}>Mínimo</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>Equivalencias</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>Variaciones</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>Descripción</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', width: '60px', textAlign: 'center' }}>Web</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', width: '100px' }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={12} style={{ textAlign: 'center', padding: '3rem' }}>Cargando maestros...</td></tr>
                            ) : paginatedProducts.map(p => (
                                <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6', height: '95px' }}>
                                    <td style={{ padding: '0.5rem 1rem' }}>
                                        <label 
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ 
                                                width: '50px', 
                                                height: '50px', 
                                                backgroundColor: '#F3F4F6', 
                                                borderRadius: '8px', 
                                                overflow: 'hidden', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center', 
                                                border: '1px solid #E5E7EB',
                                                cursor: 'pointer',
                                                position: 'relative',
                                                transition: 'all 0.2s',
                                                opacity: savingId === p.id ? 0.5 : 1
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.borderColor = '#2563EB'}
                                            onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E5E7EB'}
                                            title="Cambiar foto del maestro"
                                        >
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                style={{ display: 'none' }} 
                                                onChange={(e) => {
                                                    if (e.target.files?.[0]) {
                                                        handleMainImageUpload(p.id, e.target.files[0]);
                                                    }
                                                }}
                                            />
                                            {p.image_url ? (
                                                <Image src={p.image_url} alt={p.name} width={50} height={50} style={{ width: '100%', height: '100%', objectFit: 'cover' }} unoptimized />
                                            ) : (
                                                <span style={{ fontSize: '1.2rem', opacity: 0.5 }}>📷</span>
                                            )}
                                            {savingId === p.id && (
                                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span style={{ fontSize: '0.8rem' }}>...</span>
                                                </div>
                                            )}
                                        </label>
                                    </td>
                                    <td 
                                        style={{ padding: '1rem', cursor: 'pointer' }}
                                        onClick={() => setSelectedEditProduct(p)}
                                        title="Abrir panel de edición maestro"
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ 
                                                    fontWeight: '900', 
                                                    color: '#2563EB', 
                                                    fontSize: '1rem',
                                                    display: 'block'
                                                }}>
                                                    {p.sku}
                                                </span>
                                                <span style={{ fontSize: '0.8rem', opacity: 0.3 }}>✏️</span>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {p.accounting_id && (
                                                    <span style={{ 
                                                        fontSize: '0.7rem', 
                                                        fontWeight: '700', 
                                                        color: '#6B7280',
                                                        backgroundColor: '#F3F4F6',
                                                        padding: '1px 4px',
                                                        borderRadius: '4px'
                                                    }}>
                                                        ID: {p.accounting_id}
                                                    </span>
                                                )}
                                                {p.parent_id && (
                                                    <span style={{ 
                                                        fontSize: '0.7rem', 
                                                        fontWeight: '800', 
                                                        color: '#7C3AED',
                                                        backgroundColor: '#F5F3FF',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        border: '1px solid #DDD6FE'
                                                    }}>
                                                        🔗 {products.find(pr => pr.id === p.parent_id)?.sku || 'Hijo'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontWeight: '700', color: '#111827', fontSize: '0.9rem' }}>{p.name}</div>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <span style={{ 
                                            padding: '0.4rem 0.8rem', 
                                            borderRadius: '8px', 
                                            backgroundColor: '#F3F4F6', 
                                            fontSize: '0.8rem', 
                                            fontWeight: '800', 
                                            color: '#374151',
                                            border: '1px solid #E5E7EB',
                                            display: 'inline-block',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {CATEGORY_MAP[p.category] || p.category}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ 
                                            backgroundColor: '#F9FAFB', 
                                            padding: '8px 12px', 
                                            borderRadius: '10px', 
                                            border: '1px solid #E5E7EB',
                                            fontSize: '0.75rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px',
                                            minWidth: '150px'
                                        }}>
                                            <div style={{ fontWeight: '800', color: '#111827', fontSize: '0.7rem' }}>👤 {p.buying_team || 'Sin asignar'}</div>
                                            <div style={{ fontWeight: '600', color: '#6B7280', borderTop: '1px solid #E5E7EB', paddingTop: '2px', fontSize: '0.7rem' }}>🛠️ {p.procurement_method || 'General'}</div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <span style={{ 
                                            backgroundColor: '#F3F4F6', 
                                            padding: '4px 10px', 
                                            borderRadius: '6px', 
                                            fontSize: '0.75rem', 
                                            fontWeight: '800', 
                                            color: '#4B5563',
                                            border: '1px solid #E5E7EB',
                                            display: 'inline-block'
                                        }}>
                                            {p.unit_of_measure}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        {(() => {
                                            const rate = p.iva_rate ?? 19;
                                            const colors: Record<number, { bg: string, text: string, border: string }> = {
                                                0: { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
                                                5: { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' },
                                                19: { bg: '#FFF7ED', text: '#C2410C', border: '#FFEDD5' },
                                                22: { bg: '#FAF5FF', text: '#6B21A8', border: '#E9D5FF' }
                                            };
                                            const style = colors[rate] || colors[19];
                                            return (
                                                <div style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    backgroundColor: style.bg,
                                                    color: style.text,
                                                    border: `1px solid ${style.border}`,
                                                    borderRadius: '6px',
                                                    padding: '4px 8px',
                                                    fontSize: '0.85rem',
                                                    fontWeight: '900',
                                                    minWidth: '45px'
                                                }}>
                                                    {rate}%
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td style={{ 
                                        padding: '1rem', 
                                        textAlign: 'center',
                                        backgroundColor: p.min_inventory_level > 0 ? '#FEF2F2' : 'transparent',
                                        borderLeft: p.min_inventory_level > 0 ? '4px solid #EF4444' : 'none',
                                        transition: 'all 0.3s'
                                    }}>
                                        {p.min_inventory_level > 0 ? (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                <div style={{ 
                                                    backgroundColor: '#FEE2E2',
                                                    padding: '4px 10px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #FCA5A5',
                                                    display: 'flex',
                                                    alignItems: 'baseline',
                                                    gap: '2px'
                                                }}>
                                                    <span style={{ 
                                                        fontWeight: '900', 
                                                        color: '#B91C1C', 
                                                        fontSize: '1.1rem'
                                                    }}>
                                                        {p.min_inventory_level} 
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#B91C1C', fontWeight: '700' }}>{p.unit_of_measure}</span>
                                                </div>
                                                <span title="Política activa crítica" style={{ fontSize: '1rem' }}>⚠️</span>
                                            </div>
                                        ) : (
                                            <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: '500', opacity: 0.6 }}>—</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <button 
                                            onClick={() => setConversionProduct(p)}
                                            style={{ 
                                                fontSize: '0.75rem', 
                                                color: '#2563EB', 
                                                background: '#EFF6FF', 
                                                border: '1px solid #BFDBFE', 
                                                borderRadius: '6px', 
                                                cursor: 'pointer', 
                                                padding: '6px 10px',
                                                fontWeight: '700',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            ⚖️ {conversions.filter(c => c.product_id === p.id).length} Eq.
                                        </button>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <button 
                                            onClick={() => setSelectedVariantProduct(p)}
                                            style={{ 
                                                fontSize: '0.75rem', 
                                                color: '#7C3AED', 
                                                background: '#F5F3FF', 
                                                border: '1px solid #DDD6FE', 
                                                borderRadius: '6px', 
                                                cursor: 'pointer', 
                                                padding: '6px 10px',
                                                fontWeight: '700',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            🧬 {p.variants?.length || 0} Var.
                                        </button>
                                    </td>
                                    <td style={{ padding: '1rem', width: '250px' }}>
                                        <div 
                                            onClick={() => setExpandedDescriptions(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                                            style={{ 
                                                fontSize: '0.75rem', 
                                                color: '#6B7280', 
                                                cursor: 'pointer',
                                                transition: 'all 0.3s ease',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '4px'
                                            }}
                                        >
                                            <div style={{ 
                                                lineClamp: expandedDescriptions[p.id] ? 'none' : 2, 
                                                display: '-webkit-box', 
                                                WebkitLineClamp: expandedDescriptions[p.id] ? 'none' : 2, 
                                                WebkitBoxOrient: 'vertical', 
                                                overflow: 'hidden',
                                                lineHeight: '1.4'
                                            }}>
                                                {p.description || 'Sin descripción'}
                                            </div>
                                            {(p.description?.length || 0) > 60 && (
                                                <span style={{ 
                                                    color: '#2563EB', 
                                                    fontSize: '0.65rem', 
                                                    fontWeight: '700', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '2px',
                                                    marginTop: '2px'
                                                }}>
                                                    {expandedDescriptions[p.id] ? (
                                                        <><ChevronUp size={10} /> Ver menos</>
                                                    ) : (
                                                        <><ChevronDown size={10} /> Ver más</>
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <div 
                                            onClick={() => updateProductField(p.id, 'show_on_web', !p.show_on_web)}
                                            title={p.show_on_web ? 'Visible en tienda (Click para ocultar)' : 'Oculto en tienda (Click para mostrar)'}
                                            style={{ 
                                                display: 'flex',
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                opacity: p.show_on_web ? 1 : 0.3,
                                                color: p.show_on_web ? '#2563EB' : '#9CA3AF',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {p.show_on_web ? <Globe size={20} /> : <EyeOff size={20} />}
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            gap: '0.4rem', 
                                            background: p.is_active ? '#ECFDF5' : '#FEF2F2',
                                            border: `1px solid ${p.is_active ? '#A7F3D0' : '#FECACA'}`,
                                            padding: '5px 8px',
                                            borderRadius: '20px',
                                            width: '100%'
                                        }}>
                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: p.is_active ? '#10B981' : '#EF4444' }}></div>
                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: p.is_active ? '#065F46' : '#991B1B' }}>
                                                {p.is_active ? 'ON' : 'OFF'}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* PAGINACIÓN FOOTER */}
                {!loading && totalPages > 1 && (
                    <div style={{ 
                        marginTop: '2rem', 
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center', 
                        gap: '1rem',
                        padding: '1.5rem',
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                        border: '1px solid #E5E7EB'
                    }}>
                        <button 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: currentPage === 1 ? '#F3F4F6' : 'white', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontWeight: '700' }}
                        >
                            Anterior
                        </button>
                        
                        <div style={{ fontWeight: '800', color: '#374151' }}>
                            Página {currentPage} de {totalPages} 
                            <span style={{ fontWeight: '400', color: '#6B7280', marginLeft: '8px' }}>
                                (Mostrando {paginatedProducts.length} de {filteredProducts.length} productos)
                            </span>
                        </div>

                        <button 
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: currentPage === totalPages ? '#F3F4F6' : 'white', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontWeight: '700' }}
                        >
                            Siguiente
                        </button>
                    </div>
                )}
            </div>

            {isCreateModalOpen && (
                <CreateProductModal
                    onClose={() => setIsCreateModalOpen(false)}
                    onSave={fetchProducts}
                />
            )}

            {selectedVariantProduct && (
                <VariantModal
                    product={selectedVariantProduct}
                    onClose={() => setSelectedVariantProduct(null)}
                    onSave={handleSaveVariants}
                    onUploadImage={handleUploadVariantImage}
                />
            )}

            {selectedEditProduct && (
                <EditProductModal 
                    product={selectedEditProduct} 
                    allProducts={products}
                    onClose={() => setSelectedEditProduct(null)} 
                    onSave={() => fetchProducts()}
                />
            )}

            {/* MODAL DE GESTIÓN DE CONVERSIONES */}
            {conversionProduct && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '20px', width: '450px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900' }}>📦 Unidades y Logística</h2>
                                <span style={{ fontSize: '0.9rem', color: '#6B7280' }}>{conversionProduct.name}</span>
                            </div>
                            <button onClick={() => setConversionProduct(null)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9CA3AF' }}>✕</button>
                        </header>

                        <div style={{ marginBottom: '2rem' }}>
                            {/* SECCIÓN DE UNIDAD BASE (LA RAÍZ) */}
                            <div style={{ backgroundColor: '#F3F4F6', padding: '1.2rem', borderRadius: '16px', marginBottom: '1.5rem', border: '1px solid #E5E7EB' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#4B5563', marginBottom: '8px', textTransform: 'uppercase' }}>Unidad de Inventario (Base)</label>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <select
                                        value={conversionProduct.unit_of_measure}
                                        onChange={(e) => updateProductField(conversionProduct.id, 'unit_of_measure', e.target.value)}
                                        style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: '2px solid #2563EB', fontSize: '1.1rem', fontWeight: '800', color: '#1E40AF', backgroundColor: '#EFF6FF', cursor: 'pointer', appearance: 'none' }}
                                    >
                                        {dynamicUnits.map(u => (
                                            <option key={u} value={u}>{u}</option>
                                        ))}
                                    </select>
                                    <div style={{ flex: 1.5, fontSize: '0.75rem', color: '#6B7280', lineHeight: '1.2' }}>
                                        💡 <strong>Recomendación:</strong> Usa la unidad más pequeña en la que vayas a mover el inventario (ej: Kg).
                                    </div>
                                </div>
                            </div>

                            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '0px', marginBottom: '2rem' }}>
                                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '800' }}>Equivalencias de Compra</h4>
                                {conversions.filter(c => c.product_id === conversionProduct.id).length === 0 ? (
                                    <div style={{ fontSize: '0.85rem', color: '#9CA3AF', textAlign: 'center', padding: '1rem', border: '1px dashed #D1D5DB', borderRadius: '12px' }}>Solo se opera en {conversionProduct.unit_of_measure}.</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {conversions.filter(c => c.product_id === conversionProduct.id).map(c => {
                                            return (
                                                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB', padding: '0.8rem', borderRadius: '10px', border: '1px solid #E5E7EB' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontWeight: '800', color: '#111827' }}>1 {c.from_unit}</span>
                                                        <span style={{ color: '#6B7280' }}>=</span>
                                                        <span style={{ fontWeight: '800', color: '#2563EB' }}>{c.conversion_factor} {conversionProduct.unit_of_measure}</span>
                                                        <span 
                                                            onClick={() => {
                                                                // Solo un aviso visual de que se puede leer al revés
                                                                const inverted = (1 / c.conversion_factor).toFixed(2);
                                                                showToast(`También se lee como: 1 ${conversionProduct.unit_of_measure} = ${inverted} ${c.from_unit}`, 'info');
                                                            }}
                                                            style={{ cursor: 'pointer', fontSize: '0.9rem', marginLeft: '5px' }}
                                                            title="Ver equivalente"
                                                        >
                                                            ⇅
                                                        </span>
                                                    </div>
                                                    <button 
                                                        onClick={() => deleteConversion(c.id)} 
                                                        style={{ color: '#EF4444', background: '#FEF2F2', border: 'none', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.75rem' }}
                                                    >
                                                        Eliminar
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div style={{ borderTop: '2px dashed #E5E7EB', paddingTop: '1.5rem' }}>
                                <h4 style={{ margin: '0 0 1.2rem 0', fontSize: '0.85rem', color: '#111827', textAlign: 'center', fontWeight: '800' }}>➕ DEFINIR NUEVA RELACIÓN</h4>
                                
                                <div style={{ 
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    gap: '4px', 
                                    backgroundColor: '#EFF6FF', 
                                    padding: '1.2rem', 
                                    borderRadius: '16px',
                                    border: '1px solid #BFDBFE'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ flex: 1 }}>
                                            <input id="raw-qty-1" type="number" defaultValue="1" style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '800', textAlign: 'center' }} />
                                        </div>
                                        <div style={{ flex: 2 }}>
                                            <select id="raw-unit-1" style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700', backgroundColor: 'white' }}>
                                                <option value="">Seleccionar Unidad</option>
                                                {dynamicUnits.map(u => (
                                                    <option key={u} value={u}>{u}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ textAlign: 'center', color: '#2563EB', fontWeight: '900', fontSize: '1.2rem' }}>EQUIVALE A</div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ flex: 1 }}>
                                            <input id="raw-qty-2" type="number" placeholder="Ej: 50" style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '800', textAlign: 'center' }} />
                                        </div>
                                        <div style={{ flex: 2 }}>
                                            <div style={{ width: '100%', padding: '0.6rem', backgroundColor: '#DBEAFE', borderRadius: '8px', fontWeight: '800', textAlign: 'center', color: '#1E40AF' }}>
                                                {conversionProduct.unit_of_measure}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => {
                                        const qty1 = parseFloat((document.getElementById('raw-qty-1') as HTMLInputElement).value);
                                        const unit1 = (document.getElementById('raw-unit-1') as HTMLInputElement).value;
                                        const qty2 = parseFloat((document.getElementById('raw-qty-2') as HTMLInputElement).value);
                                        
                                        if (qty1 && unit1 && qty2) {
                                            const factor = qty2 / qty1;
                                            addConversion(conversionProduct.id, unit1, conversionProduct.unit_of_measure, factor);
                                            
                                            // Limpiar
                                            (document.getElementById('raw-qty-1') as HTMLInputElement).value = '1';
                                            (document.getElementById('raw-unit-1') as HTMLInputElement).value = '';
                                            (document.getElementById('raw-qty-2') as HTMLInputElement).value = '';
                                        }
                                    }}
                                    style={{ 
                                        width: '100%',
                                        padding: '1.2rem', 
                                        backgroundColor: '#111827', 
                                        color: 'white', 
                                        border: 'none', 
                                        borderRadius: '12px', 
                                        fontWeight: '900', 
                                        cursor: 'pointer',
                                        fontSize: '1rem',
                                        marginTop: '1.2rem',
                                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                                    }}
                                >
                                    Vincular Unidades
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* MODAL CARGA MASIVA PREMIUM */}
            {isBulkModalOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
                    <div style={{ backgroundColor: 'white', padding: 0, borderRadius: '28px', width: '90%', maxWidth: '540px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2rem', borderBottom: '1px solid #F3F4F6' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ backgroundColor: '#EFF6FF', color: '#2563EB', padding: '8px', borderRadius: '10px' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                </div>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#111827', margin: 0 }}>Cargue Masivo (Productos)</h2>
                            </div>
                            <button onClick={() => setIsBulkModalOpen(false)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '1.5rem', fontWeight: '300' }}>×</button>
                        </div>

                        <div style={{ padding: '2rem' }}>
                            <p style={{ color: '#6B7280', fontSize: '0.9rem', textAlign: 'center', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                                Sube un archivo con el maestro de materiales (SKU, Nombre, Unidad, Categoría y Precio).
                            </p>

                            {/* Drop Zone */}
                            <div 
                                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setDragging(false);
                                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                        setSelectedFile(e.dataTransfer.files[0]);
                                    }
                                }}
                                style={{ 
                                    border: dragging ? '2px solid #2563EB' : '2px dashed #E5E7EB',
                                    backgroundColor: dragging ? '#EFF6FF' : '#F9FAFB',
                                    borderRadius: '20px',
                                    height: '220px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '1rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    position: 'relative'
                                }}
                                onClick={() => document.getElementById('bulk-file-input')?.click()}
                            >
                                <input id="bulk-file-input" type="file" hidden accept=".xlsx,.xls,.csv" onChange={handleFileSelect} />
                                
                                <div style={{ 
                                    backgroundColor: 'white', 
                                    padding: '12px', 
                                    borderRadius: '50%', 
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                                    color: selectedFile ? '#10B981' : '#9CA3AF'
                                }}>
                                    {selectedFile ? (
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                    ) : (
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                    )}
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontWeight: '700', color: '#374151', fontSize: '0.95rem' }}>
                                        {selectedFile ? selectedFile.name : 'Haz clic para seleccionar o arrastra un archivo'}
                                    </div>
                                    {!selectedFile && <div style={{ fontSize: '0.8rem', color: '#9CA3AF', marginTop: '4px' }}>Archivos .xlsx o .xls oficiales de Excel</div>}
                                </div>
                            </div>

                            {/* Opción de Purga */}
                            <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#FEF2F2', borderRadius: '14px', border: '1px solid #FEE2E2', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <input 
                                    type="checkbox" 
                                    id="wipe-data" 
                                    checked={wipeExistingData} 
                                    onChange={(e) => setWipeExistingData(e.target.checked)}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                />
                                <label htmlFor="wipe-data" style={{ fontSize: '0.85rem', color: '#B91C1C', fontWeight: '700', cursor: 'pointer' }}>
                                    Borrar todos los productos existentes antes de cargar (Limpieza total)
                                </label>
                            </div>

                            <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <button 
                                    disabled={!selectedFile || loading}
                                    onClick={processFile}
                                    style={{ 
                                        width: '100%', 
                                        padding: '1rem', 
                                        backgroundColor: selectedFile ? '#2563EB' : '#A5C1F9', 
                                        color: 'white', 
                                        border: 'none', 
                                        borderRadius: '14px', 
                                        fontWeight: '800', 
                                        cursor: selectedFile ? 'pointer' : 'not-allowed',
                                        fontSize: '0.95rem',
                                        transition: 'all 0.2s',
                                        boxShadow: selectedFile ? '0 4px 12px rgba(37, 99, 235, 0.2)' : 'none'
                                    }}
                                >
                                    {loading ? 'Procesando...' : 'Procesar Excel'}
                                </button>
                                
                                <button 
                                    onClick={downloadTemplate}
                                    style={{ 
                                        width: '100%', 
                                        padding: '1rem', 
                                        backgroundColor: '#F3F4F6', 
                                        color: '#374151', 
                                        border: 'none', 
                                        borderRadius: '14px', 
                                        fontWeight: '700', 
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                    Descargar Plantilla (.xlsx)
                                </button>

                            </div>
                        </div>
                    </div>
                </div>
            )}
            {isManageAttributesModalOpen && (
                <ManageAttributesModal onClose={() => setIsManageAttributesModalOpen(false)} />
            )}
        </main>
    );
}
