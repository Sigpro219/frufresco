'use client';

import { useState, useEffect } from 'react';
import { supabase, Product } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Toast from '@/components/Toast';
import Link from 'next/link';
import CreateProductModal from '@/components/CreateProductModal';
import EditProductModal from '@/components/EditProductModal';
import VariantModal from '@/components/VariantModal';
import * as XLSX from 'xlsx';

export default function MasterProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [conversions, setConversions] = useState<any[]>([]);
    const [conversionProduct, setConversionProduct] = useState<Product | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [dynamicUnits, setDynamicUnits] = useState<string[]>(['Kg', 'G', 'Lb', 'Lt', 'Un', 'Atado', 'Bulto', 'Caja', 'Saco', 'Cubeta']);
    const [selectedVariantProduct, setSelectedVariantProduct] = useState<Product | null>(null);
    const [selectedEditProduct, setSelectedEditProduct] = useState<Product | null>(null);

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('name');
            
            if (error) {
                console.error('Fetch Error Detail:', error);
                showToast(`Error de conexión: ${error.message}`, 'error');
                return;
            } 

            setProducts(data || []);

            // Cargas secundarias
            Promise.all([
                supabase.from('product_conversions').select('*'),
                supabase.from('app_settings').select('value').eq('key', 'standard_units').maybeSingle()
            ]).then(([conv, settings]) => {
                if (conv.data) setConversions(conv.data);
                if (settings.data?.value) setDynamicUnits(settings.data.value.split(','));
            }).catch(e => console.warn('Carga secundaria falló:', e));

        } catch (err: any) {
            if (err.name === 'AbortError' || err.message?.includes('aborted')) {
                console.log('Petición interrumpida (Normal en HMR)');
                return;
            }
            console.error('Falla inesperada:', err);
            showToast('Falla en el puente de datos', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    // Helper para generar SKU técnico si no viene en el Excel
    const generateSKU = (name: string, category: string, unit: string) => {
        if (!name) return 'TEMP-' + Math.random().toString(36).substr(2, 5).toUpperCase();
        
        const catMap: Record<string, string> = {
            'Frutas': 'F', 'Hortalizas': 'H', 'Verduras': 'V', 'Tubérculos': 'T', 'Despensa': 'D', 'Lácteos': 'L'
        };
        const catPrefix = catMap[category] || 'X';
        
        const unitMap: Record<string, string> = {
            'kg': 'K', 'g': 'G', 'lb': 'A', 'lt': 'L', 'un': 'U', 'atado': 'T', 'bulto': 'B', 'saco': 'S', 'caja': 'C', 'cubeta': 'K'
        };
        const unitSuffix = unitMap[unit?.toLowerCase()] || 'X';

        // Extraer 3 consonantes
        const consonantes = name.toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^BCDFGHJKLMNPQRSTVWXYZ]/g, '');
        
        const namePart = consonantes.substring(0, 3).padEnd(3, 'X');
        
        return `${catPrefix}-${namePart}-${unitSuffix}`;
    };

    // Helper para generar descripción técnica equilibrada
    const generateDescription = (name: string, category: string, unit: string) => {
        if (!name) return '';
        const nameNorm = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        
        const unitLabels: Record<string, string> = {
            'kg': 'kilogramo', 'g': 'gramo', 'lb': 'libra', 'lt': 'litro', 'un': 'unidad', 'atado': 'atado', 'bulto': 'bulto'
        };
        const unitLong = unitLabels[unit?.toLowerCase()] || 'unidad';
        
        let usage = "consumo diario";
        if (category === 'Frutas') usage = "ensaladas, postres y jugos frescos";
        if (category === 'Verduras' || category === 'Hortalizas') usage = "preparaciones gourmet, guisos y ensaladas";
        if (category === 'Tubérculos') usage = "frituras, purés y bases de cocina";
        if (category === 'Lácteos') usage = "consumo directo y repostería";

        return `${nameNorm} de calidad premium seleccionada. Frescura garantizada desde el origen. Ideal para ${usage}. Presentación técnica por ${unitLong}.`;
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
                const updates: any = {};
                if (!p.sku) updates.sku = generateSKU(p.name, p.category, p.unit_of_measure);
                if (!p.description) updates.description = generateDescription(p.name, p.category, p.unit_of_measure);

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

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        if ((window as any).showToast) {
            (window as any).showToast(message, type);
        }
    };

    const updateProductField = async (id: string, field: keyof Product, value: any) => {
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
            console.error('Master update error:', error);
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

    const deleteProduct = async (product: Product) => {
        // Primera confirmación
        if (!confirm(`¿Estás seguro de que deseas eliminar el SKU [${product.sku}] ${product.name}?`)) return;
        
        // Segunda confirmación con advertencia de irreversibilidad
        if (!confirm('Esta acción es IRREVERSIBLE y eliminará todo el historial tecnico asociado (incluyendo conversiones de unidades). ¿Deseas proceder?')) return;

        setSavingId(product.id);
        
        try {
            // 1. Eliminar primero las conversiones asociadas (si no hay CASCADE en DB)
            const { error: convError } = await supabase
                .from('product_conversions')
                .delete()
                .eq('product_id', product.id);
            
            if (convError) throw convError;

            // 2. Intentar borrar el producto
            const { error: prodError } = await supabase
                .from('products')
                .delete()
                .eq('id', product.id);

            if (prodError) throw prodError;

            setProducts(products.filter(p => p.id !== product.id));
            showToast('Producto y sus dependencias eliminados', 'success');
        } catch (err: any) {
            // TRUCO: Los objetos Error de JS no se dejan ver con JSON.stringify normal.
            // Usamos esto para ver todas las propiedades ocultas (mensaje, detalles, hint, etc.)
            const errorInfo = JSON.parse(JSON.stringify(err, Object.getOwnPropertyNames(err)));
            console.error('DIAGNÓSTICO COMPLETO:', errorInfo);

            const errorMsg = errorInfo.message || 'Error desconocido';
            const errorDetails = errorInfo.details || '';
            const errorHint = errorInfo.hint || '';
            
            if (errorMsg.includes('foreign key') || (errorDetails && errorDetails.includes('is still referenced'))) {
                showToast('⚠️ No se puede eliminar: Este SKU está amarrado a pedidos reales.', 'error');
            } else if (errorInfo.code === '42501') {
                showToast('⛔ Sin Permisos: Ejecuta las políticas de borrado en el SQL Editor de Supabase.', 'error');
            } else {
                showToast(`Error de DB: ${errorMsg}`, 'error');
            }
        } finally {
            setSavingId(null);
        }
    };

    const processBulkUpload = async (rawText: string) => {
        const rows = rawText.split('\n').filter(r => r.trim());
        if (rows.length === 0) return;

        setLoading(true);
        const newProducts: any[] = [];
        let errors = 0;

        rows.forEach((row, index) => {
            const cols = row.split('\t'); 
            if (cols.length < 4) {
                errors++;
                return;
            }

            const [sku, name, category, unit] = cols.map(c => c.trim());
            
            if (!sku || !name || !category || !unit) {
                errors++;
                return;
            }

            newProducts.push({
                sku,
                name,
                category,
                unit_of_measure: unit,
                is_active: true,
                image_url: `https://loremflickr.com/320/240/${category.toLowerCase()}`
            });
        });

        if (newProducts.length > 0) {
            const { error } = await supabase.from('products').upsert(newProducts, { onConflict: 'sku' });
            if (error) {
                console.error('Bulk Error:', error);
                showToast('Error en carga masiva: ' + error.message, 'error');
            } else {
                showToast(`Carga exitosa: ${newProducts.length} procesados, ${errors} errores.`, 'success');
                fetchProducts();
            }
        } else if (errors > 0) {
            showToast(`Error: no se detectaron filas válidas (${errors} errores).`, 'error');
        }
        
        setLoading(false);
        setIsBulkModalOpen(false);
    };

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
        reader.onload = async (e) => {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // Convert to JSON (array of arrays)
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
            
            if (rows.length <= 1) {
                showToast('El archivo está vacío o solo tiene encabezados', 'error');
                return;
            }

            setLoading(true);
            const newProducts: any[] = [];
            let errors = 0;

            // Skip header (index 0)
            rows.slice(1).forEach((cols) => {
                if (cols.length < 4) {
                    errors++;
                    return;
                }

                let sku = cols[0]?.toString().trim();
                const name = cols[1]?.toString().trim();
                const category = cols[2]?.toString().trim();
                const unit = cols[3]?.toString().trim();

                if (!name || !category || !unit) {
                    errors++;
                    return;
                }

                // Generar SKU si está vacío
                if (!sku) {
                    sku = generateSKU(name, category, unit);
                }

                newProducts.push({
                    sku,
                    name,
                    category,
                    unit_of_measure: unit,
                    description: generateDescription(name, category, unit),
                    is_active: true,
                    image_url: `https://loremflickr.com/320/240/${category.toLowerCase()}`
                });
            });

            if (newProducts.length > 0) {
                const { error } = await supabase.from('products').upsert(newProducts, { onConflict: 'sku' });
                if (error) {
                    console.error('Bulk Error:', error);
                    showToast('Error en carga masiva: ' + error.message, 'error');
                } else {
                    showToast(`Carga exitosa: ${newProducts.length} procesados, ${errors} errores.`, 'success');
                    fetchProducts();
                }
            } else if (errors > 0) {
                showToast(`Error: no se detectaron filas válidas (${errors} errores).`, 'error');
            }
            
            setLoading(false);
            setSelectedFile(null);
            setIsBulkModalOpen(false);
        };
        reader.readAsBinaryString(selectedFile);
    };

    const downloadTemplate = () => {
        const data = [
            ["SKU (Opcional)", "Nombre", "Categoría", "Unidad"],
            ["", "Papa Sabanera", "Tubérculos", "Kg"],
            ["", "Tomate Chonto", "Verduras", "Kg"]
        ];

        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Plantilla");
        
        // Use XLSX.writeFile for browser download
        XLSX.writeFile(workbook, "plantilla_maestro_productos.xlsx");
    };

    const filteredProducts = products.filter(p => {
        return p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
               p.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
               p.category?.toLowerCase().includes(searchQuery.toLowerCase());
    });

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
                                🪄 Sanetizar Datos
                            </button>
                            <button
                                onClick={() => setIsBulkModalOpen(true)}
                                style={{
                                    padding: '1rem 1.5rem',
                                    borderRadius: '12px',
                                    backgroundColor: '#F3F4F6',
                                    color: '#111827',
                                    border: '1px solid #E5E7EB',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.8rem',
                                }}
                            >
                                📥 Carga Masiva (Excel)
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
                                ➕ Crear Nuevo SKU Maestro
                            </button>
                        </div>
                    </div>
                </header>

                {/* Dashboard Rápido */}
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #E5E7EB', flex: 1 }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase' }}>Total SKUs en Sistema</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#111827' }}>{products.length}</div>
                        </div>
                        {savingId && (
                            <div style={{ backgroundColor: '#DBEAFE', color: '#1E40AF', padding: '1rem', borderRadius: '12px', fontWeight: '700', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                🔄 Guardando cambios en maestro...
                            </div>
                        )}
                    </div>

                {/* Buscador */}
                <div style={{ marginBottom: '2rem' }}>
                    <input
                        type="text"
                        placeholder="Buscar por SKU, Nombre o Categoría..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '1.2rem',
                            borderRadius: '12px',
                            border: '1px solid #D1D5DB',
                            fontSize: '1.1rem',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                        }}
                    />
                </div>

                <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', width: '60px' }}>Foto</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>SKU Código</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>Nombre Técnico</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>Categoría</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>Unidad Base</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>Mínimo</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>Equivalencias</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>Variaciones</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem' }}>Descripción Técnica</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', width: '100px' }}>Estado</th>
                                <th style={{ padding: '1.2rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', width: '50px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>Cargando maestros...</td></tr>
                            ) : filteredProducts.map(p => (
                                <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6', height: '80px' }}>
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
                                                <img src={p.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ 
                                                fontWeight: '900', 
                                                color: '#2563EB', 
                                                fontSize: '1rem',
                                                display: 'block',
                                                padding: '0.4rem 0'
                                            }}>
                                                {p.sku}
                                            </span>
                                            <span style={{ fontSize: '0.8rem', opacity: 0.3 }}>✏️</span>
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
                                            fontSize: '0.85rem', 
                                            fontWeight: '700', 
                                            color: '#374151',
                                            border: '1px solid #E5E7EB',
                                            display: 'inline-block',
                                            minWidth: '100px',
                                            textAlign: 'center'
                                        }}>
                                            {p.category}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <span style={{ 
                                            backgroundColor: '#F3F4F6', 
                                            padding: '4px 12px', 
                                            borderRadius: '20px', 
                                            fontSize: '0.8rem', 
                                            fontWeight: '800', 
                                            color: '#374151',
                                            border: '1px solid #E5E7EB',
                                            textTransform: 'uppercase'
                                        }}>
                                            {p.unit_of_measure}
                                        </span>
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
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#6B7280', lineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden', maxWidth: '200px' }}>
                                            {p.description || 'Sin descripción'}
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
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <button 
                                            onClick={() => deleteProduct(p)}
                                            style={{ 
                                                background: 'none', 
                                                border: 'none', 
                                                cursor: 'pointer', 
                                                fontSize: '1.1rem',
                                                padding: '5px',
                                                borderRadius: '6px'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            🗑️
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
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
        </main>
    );
}
