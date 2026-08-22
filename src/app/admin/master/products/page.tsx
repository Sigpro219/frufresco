'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
// Force re-compilation to fix Turbopack module factory error
import { supabase, Product } from '@/lib/supabase';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth, checkUserPermission } from '@/lib/authContext';
import { ShieldAlert } from 'lucide-react';
import CreateProductModal from '@/components/CreateProductModal';
import EditProductModal from '@/components/EditProductModal';
import Toast from '@/components/Toast';
import * as XLSX from 'xlsx';
import { CATEGORY_MAP } from '@/lib/constants';
import { triggerProductRevalidation } from '@/lib/revalidate';
import { 
    Plus, 
    FileDown, 
    FileUp, 
    Globe, 
    EyeOff, 
    Search,
    ChevronDown,
    ChevronUp,
    Wand2,
    Dna,
    X,
    Info,
    ImageOff,
    Database,
    CheckCircle,
    AlertTriangle,
    Filter,
    GitFork,
    Edit3,
    User,
    Wrench,
    BarChart2,
    FileText,
    Scale,
    ArrowUpDown,
    ArrowLeft,
    RefreshCw
} from 'lucide-react';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';



interface ProductConversion {
    id: string;
    product_id: string;
    from_unit: string;
    to_unit: string;
    conversion_factor: number;
}

export default function MasterProductsPage() {
    const { profile } = useAuth();
    const [roles, setRoles] = useState<any[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    const hasPermission = (permission: string) => {
        return checkUserPermission(profile, permission, roles);
    };

    const canView = hasPermission('admin.products.master.view');
    const canEdit = hasPermission('admin.products.master.edit');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [openHeaderDropdown, setOpenHeaderDropdown] = useState<string | null>(null);
    const [filterHierarchy, setFilterHierarchy] = useState<string>('all');
    const [filterCategoryHeader, setFilterCategoryHeader] = useState<string>('all');
    const [filterIvaHeader, setFilterIvaHeader] = useState<string>('all');
    const [filterWebHeader, setFilterWebHeader] = useState<string>('all');
    const [filterStatusHeader, setFilterStatusHeader] = useState<string>('all');
    const [filterDevHeader, setFilterDevHeader] = useState<string>('all');
    const [filterPhotoHeader, setFilterPhotoHeader] = useState<string>('all');
    const [filterUnitHeader, setFilterUnitHeader] = useState<string>('all');

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

    useEffect(() => {
        const handleClickOutside = () => setOpenHeaderDropdown(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);
    const [conversions, setConversions] = useState<ProductConversion[]>([]);
    const [conversionProduct, setConversionProduct] = useState<Product | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [wipeExistingData, setWipeExistingData] = useState(false); // Nueva opción de limpieza
    const [dynamicUnits, setDynamicUnits] = useState<string[]>(['Kg', 'G', 'Lb', 'Lt', 'Un', 'Atado', 'Bulto', 'Caja', 'Saco', 'Cubeta']);
    const [selectedEditProduct, setSelectedEditProduct] = useState<Product | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
    const [isInfoGuideOpen, setIsInfoGuideOpen] = useState(false);
    const [showHelpTooltip, setShowHelpTooltip] = useState(false);
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

            // Fetch conversions paginated
            let allConvs: any[] = [];
            let hasMoreConvs = true;
            let fromConv = 0;
            const limitConv = 1000;
            while (hasMoreConvs) {
                const { data: convData } = await supabase
                    .from('product_conversions')
                    .select('*')
                    .range(fromConv, fromConv + limitConv - 1);
                if (convData && convData.length > 0) {
                    allConvs = [...allConvs, ...convData];
                    fromConv += limitConv;
                    if (convData.length < limitConv) hasMoreConvs = false;
                } else {
                    hasMoreConvs = false;
                }
            }
            setConversions(allConvs as ProductConversion[]);

            // Cargas secundarias (simultáneas para no bloquear UI)
            Promise.all([
                supabase.from('app_settings').select('value').eq('key', 'standard_units').maybeSingle()
            ]).then(([settings]) => {
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

    // Realtime subscription & Local Storage sync for conversions
    useEffect(() => {
        const fetchConversions = () => {
            if (conversionProduct) {
                supabase.from('product_conversions').select('*').eq('product_id', conversionProduct.id).then(({ data }) => {
                    if (data) {
                        setConversions(prev => {
                            const filtered = prev.filter(c => c.product_id !== conversionProduct.id);
                            return [...filtered, ...(data as ProductConversion[])];
                        });
                    }
                });
            }
        };

        // 1. Listen for Supabase Broadcast (Cross-device)
        const channel = supabase.channel('master_conversions_changes')
            .on('broadcast', { event: 'conversion_update' }, fetchConversions)
            .subscribe();

        // 2. Listen for LocalStorage changes (Cross-tab same browser - 100% reliable)
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'conversions_changed') {
                fetchConversions();
            }
        };
        window.addEventListener('storage', handleStorage);

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('storage', handleStorage);
        };
    }, [supabase]);

    // Resetear a página 1 cuando se busca algo
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    // Abrir modal de conversión por URL (?editUnits=productId)
    useEffect(() => {
        if (products.length > 0) {
            const params = new URLSearchParams(window.location.search);
            const editUnitsId = params.get('editUnits');
            if (editUnitsId) {
                const matched = products.find(p => p.id === editUnitsId);
                if (matched) {
                    setConversionProduct(matched);
                    // Limpiar el parámetro de la URL
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, '', newUrl);
                }
            }
        }
    }, [products]);

    // Fetch conversions on demand when modal opens
    useEffect(() => {
        if (conversionProduct) {
            supabase
                .from('product_conversions')
                .select('*')
                .eq('product_id', conversionProduct.id)
                .then(({ data, error }) => {
                    if (!error && data) {
                        setConversions(prev => {
                            const filtered = prev.filter(c => c.product_id !== conversionProduct.id);
                            return [...filtered, ...(data as ProductConversion[])];
                        });
                    }
                });
        }
    }, [conversionProduct]);

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
        // Tab 1: Productos Base (sin campos de precio estáticos, gestionados dinámicamente en Matriz de Costos)
        const exportData = products.map(p => {
            const parent = products.find(pr => pr.id === p.parent_id);
            return {
                ID_INTERNO: p.id,
                SKU: p.sku || '',
                ID_CONTABLE: p.accounting_id || '',
                Nombre: p.name || '',
                Nombre_EN: p.name_en || '',
                Descripcion: p.description || '',
                Descripcion_EN: p.description_en || '',
                Categoria: p.category || '',
                Categoria_Nombre: CATEGORY_MAP[p.category] || p.category,
                Unidad: p.unit_of_measure || '',
                ID_PADRE: p.parent_id || '',
                SKU_PADRE: parent?.sku || '',
                Nombre_Padre: parent?.name || '',
                Tipo_Jerarquia: p.parent_id ? (p.parent_id === p.id ? 'PADRE' : 'HIJO') : 'PRINCIPAL',
                IVA: p.iva_rate ?? 19,
                URL_Imagen: p.image_url || '',
                Comprador: p.buying_team || '',
                Metodo_Compra: p.procurement_method || '',
                Activo: p.is_active ? 'SI' : 'NO',
                Web: p.show_on_web ? 'SI' : 'NO',
                Nombre_Web: p.display_name || '',
                Unidad_Web: p.web_unit || '',
                Factor_Web: p.web_conversion_factor || 1.0,
                Min_Inventario: p.min_inventory_level || 0,
                Merma_Teorica_Pct: p.theoretical_shrinkage_pct || 0,
                Razones_Desperdicio: Array.isArray(p.allowed_waste_reasons) ? p.allowed_waste_reasons.join(',') : '',
                Grupo_Inventario: p.inventory_group || '',
                Sublista_Compra: p.purchase_sublist || '',
                Tags: Array.isArray(p.tags) ? p.tags.join(',') : '',
                Keywords: p.keywords || '',
                Desviacion_Utilidad_Pct: p.utility_deviation_pct || 0,
                Heredar_Precio: p.inherit_price ? 'SI' : 'NO',
                Revisado_Dev: (p.is_verified_dev || (p.tags && p.tags.includes('verified_dev'))) ? 'SI' : 'NO'
            };
        });

        // Tab 2: Variaciones de Atributos Planas
        const exportVariations: any[] = [];
        products.forEach(p => {
            if (Array.isArray(p.options_config)) {
                p.options_config.forEach(opt => {
                    const valuesList = Array.isArray(opt.values) ? opt.values.join(',') : '';
                    if (opt.name) {
                        exportVariations.push({
                            SKU_PRODUCTO: p.sku || '',
                            ID_CONTABLE: p.accounting_id || '',
                            Nombre_Producto: p.name || '',
                            Atributo: opt.name,
                            Valores_Permitidos: valuesList
                        });
                    }
                });
            }
        });

        // Tab 3: Guía de Datos / Diccionario
        const guideHeaders = ["Hoja de Excel", "Campo Plantilla", "Requerido", "Tipo de Dato", "Descripción / Valores Permitidos"];
        const guideRows = [
            ["1. Productos", "ID_INTERNO", "NO (Autogenerado)", "UUID Texto", "ID único en base de datos. Dejar intacto para actualizar registros."],
            ["1. Productos", "SKU", "SÍ", "Texto", "Código único identificador del SKU (ej: M-FR-MNZ-K)"],
            ["1. Productos", "ID_CONTABLE", "SÍ", "Número", "ID numérico único de contabilidad/ERP. ¡Llave primaria comercial!"],
            ["1. Productos", "Nombre", "SÍ", "Texto", "Nombre principal del SKU en español"],
            ["1. Productos", "Nombre_EN", "NO", "Texto", "Nombre del SKU en inglés"],
            ["1. Productos", "Descripcion", "NO", "Texto", "Descripción comercial en español"],
            ["1. Productos", "Descripcion_EN", "NO", "Texto", "Descripción comercial en inglés"],
            ["1. Productos", "Categoria", "SÍ", "Texto", "Código de Categoría: FR (Frutas), VE (Verduras), HO (Hortalizas), TU (Tubérculos), DE (Despensa), LA (Lácteos)"],
            ["1. Productos", "Unidad", "SÍ", "Texto", "Unidad base física (ej: Kg, G, Lb, Lt, Un, Atado, Bulto)"],
            ["1. Productos", "IVA", "SÍ", "Número", "Porcentaje de IVA aplicable (0, 5, 19)"],
            ["1. Productos", "URL_Imagen", "NO", "Texto", "Enlace público HTTP de la foto principal"],
            ["1. Productos", "Comprador", "NO", "Texto", "Equipo de alistamiento asignado (ej: EQUIPO B FRUTAS Y OTROS)"],
            ["1. Productos", "Metodo_Compra", "NO", "Texto", "Tipo de compra: 'Compras Generales', 'Compras Menores', 'Compras Noche'"],
            ["1. Productos", "Activo", "SÍ", "SI/NO", "Estado de disponibilidad maestro en el ERP"],
            ["1. Productos", "Web", "SÍ", "SI/NO", "Estado de publicación en el e-commerce B2C"],
            ["1. Productos", "Nombre_Web", "NO", "Texto", "Nombre de exhibición web en e-commerce B2C"],
            ["1. Productos", "Unidad_Web", "NO", "Texto", "Unidad de empaque en la web (ej: Kg, Atado, Un)"],
            ["1. Productos", "Factor_Web", "NO", "Número", "Conversión de unidad web a unidad base logarítmica (ej: 1.0)"],
            ["1. Productos", "Min_Inventario", "NO", "Número", "Umbral de alerta de stock crítico"],
            ["1. Productos", "ID_PADRE", "NO", "Texto", "ID de producto padre si es un producto fraccionado"],
            ["1. Productos", "Merma_Teorica_Pct", "NO", "Número", "Porcentaje (%) de merma esperada por manipulación logísitica (ej: 2.5)"],
            ["1. Productos", "Razones_Desperdicio", "NO", "Texto", "Lista de razones separadas por coma permitidas en picking/recepción"],
            ["1. Productos", "Grupo_Inventario", "NO", "Texto", "Nombre del grupo lógico de inventario físico"],
            ["1. Productos", "Sublista_Compra", "NO", "Texto", "Nombre de la sublista para compras/abastecimiento"],
            ["1. Productos", "Tags", "NO", "Texto", "Etiquetas de clasificación web separadas por comas"],
            ["1. Productos", "Keywords", "NO", "Texto", "Palabras alternativas de búsqueda separadas por comas"],
            ["1. Productos", "Desviacion_Utilidad_Pct", "NO", "Número", "Porcentaje (%) máximo de desviación respecto al costo heredado"],
            ["1. Productos", "Heredar_Precio", "NO", "SI/NO", "Indica si hereda automáticamente precios y costos de su SKU padre"],
            
            ["2. Variaciones", "SKU_PRODUCTO", "SÍ", "Texto", "SKU del producto base al que se asigna la variación."],
            ["2. Variaciones", "ID_CONTABLE", "SÍ", "Número", "ID Contable comercial del producto base."],
            ["2. Variaciones", "Atributo", "SÍ", "Texto", "Nombre de la variación (ej: Madurez, Calidad, Presentación, Corte)"],
            ["2. Variaciones", "Valores_Permitidos", "SÍ", "Texto", "Valores posibles de la variación separados por comas (ej: Verde,Maduro,Pintón o Atado,Caja)"],
            ["Nota General", "PRECIOS", "DINÁMICOS", "N/A", "Los precios comerciales y costos se calculan dinámicamente desde el módulo Matriz de Costos."]
        ];
        const guideSheetData = [guideHeaders, ...guideRows];

        const workbook = XLSX.utils.book_new();
        const wsProducts = XLSX.utils.json_to_sheet(exportData);
        const wsVariations = XLSX.utils.json_to_sheet(exportVariations);
        const wsGuide = XLSX.utils.aoa_to_sheet(guideSheetData);

        // Ajustar anchos
        wsProducts['!cols'] = Object.keys(exportData[0] || {}).map(() => ({ wch: 18 }));
        wsVariations['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 35 }];
        wsGuide['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 15 }, { wch: 60 }];

        XLSX.utils.book_append_sheet(workbook, wsProducts, "1. Productos");
        XLSX.utils.book_append_sheet(workbook, wsVariations, "2. Variaciones");
        XLSX.utils.book_append_sheet(workbook, wsGuide, "3. Diccionario_Guia");

        XLSX.writeFile(workbook, `maestro_edicion_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('Maestro completo exportado (precios gestionados dinámicamente)', 'success');
    };

    const sanitizeMasterData = async () => {
        if (!canEdit) {
            showToast('No tienes permisos para modificar el catálogo maestro.', 'error');
            return;
        }
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
    
    const syncWebVisibility = async () => {
        if (!canEdit) {
            showToast('No tienes permisos para modificar el catálogo maestro.', 'error');
            return;
        }
        const toHide = products.filter(p => (!p.image_url || p.image_url.trim() === '') && p.show_on_web).length;
        const toShow = products.filter(p => p.image_url && p.image_url.trim() !== '' && !p.show_on_web && p.is_active).length;
        
        if (toHide === 0 && toShow === 0) {
            showToast('El catálogo web ya está sincronizado con las imágenes disponibles.', 'info');
            return;
        }

        if (!confirm(`🚀 Sincronización Web:\n\n• Se ocultarán ${toHide} productos sin foto.\n• Se activarán ${toShow} productos con foto activa.\n\n¿Deseas aplicar estos cambios masivamente?`)) return;

        try {
            setLoading(true);
            
            // 1. Ocultar los que no tienen imagen (o imagen vacía)
            const { error: hideErr } = await supabase
                .from('products')
                .update({ show_on_web: false })
                .or('image_url.is.null,image_url.eq.""');
            if (hideErr) throw hideErr;

            // 2. Mostrar los que sí tienen imagen Y están activos en catálogo
            const { error: showErr } = await supabase
                .from('products')
                .update({ show_on_web: true })
                .not('image_url', 'is', null)
                .neq('image_url', '')
                .eq('is_active', true);
            if (showErr) throw showErr;

            showToast(`Sincronización exitosa: ${toHide} ocultos y ${toShow} nuevos publicados.`, 'success');
            triggerProductRevalidation();
            await fetchProducts();
        } catch (err: any) {
            console.error('Sync error:', err);
            showToast('Error durante la sincronización: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };


    const updateProductField = async (id: string, field: keyof Product, value: string | number | boolean | unknown[] | null) => {
        if (!canEdit) {
            showToast('No tienes permisos para modificar el catálogo maestro.', 'error');
            return;
        }

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
            triggerProductRevalidation();
        }
        setSavingId(null);
    };

    const addConversion = async (productId: string, fromUnit: string, toUnit: string, factor: number) => {
        if (!canEdit) {
            showToast('No tienes permisos para modificar el catálogo maestro.', 'error');
            return;
        }
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
        if (!canEdit) {
            showToast('No tienes permisos para modificar el catálogo maestro.', 'error');
            return;
        }
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



    const handleMainImageUpload = async (productId: string, file: File) => {
        if (!canEdit) {
            showToast('No tienes permisos para modificar el catálogo maestro.', 'error');
            return;
        }
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
            triggerProductRevalidation();
        } catch (err: unknown) {
            const error = err as { message?: string };
            showToast('Error al subir imagen: ' + (error.message || 'Error desconocido'), 'error');
            console.error('Main Image Upload Error:', error);
        } finally {
            setSavingId(null);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const processFile = async () => {
        if (!canEdit) {
            showToast('No tienes permisos para modificar el catálogo maestro.', 'error');
            return;
        }
        if (!selectedFile) return;
        
        const reader = new FileReader();
        reader.onload = async (readerEvent) => {
            const data = readerEvent.target?.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            
            // 1. Encontrar las pestañas
            const sheetNames = workbook.SheetNames;
            const prodSheetName = sheetNames.find(n => n.includes("Productos") || n.includes("Maestro")) || sheetNames[0];
            const varSheetName = sheetNames.find(n => n.includes("Variaciones"));
            const priceSheetName = sheetNames.find(n => n.includes("Precios"));

            const prodWorksheet = workbook.Sheets[prodSheetName];
            const prodRows = XLSX.utils.sheet_to_json(prodWorksheet) as Record<string, any>[];

            if (prodRows.length === 0) {
                showToast('La pestaña de Productos está vacía o tiene un formato incorrecto', 'error');
                return;
            }

            // 2. Parsear variaciones planas si existen
            const variationsMap: Record<string, any[]> = {};
            if (varSheetName) {
                const varWorksheet = workbook.Sheets[varSheetName];
                const varRows = XLSX.utils.sheet_to_json(varWorksheet) as Record<string, any>[];
                varRows.forEach(row => {
                    const sku = (row.SKU_PRODUCTO || row.sku || '').toString().trim();
                    if (sku) {
                        if (!variationsMap[sku]) variationsMap[sku] = [];
                        variationsMap[sku].push({
                            name: (row.Atributo || '').toString().trim(),
                            values: (row.Valores_Permitidos || '').toString().split(',').map((v: string) => v.trim()).filter((v: string) => v !== '')
                        });
                    }
                });
            }

            // 3. Parsear precios planos por canal si existen
            const pricesMap: Record<string, any[]> = {};
            if (priceSheetName) {
                const priceWorksheet = workbook.Sheets[priceSheetName];
                const priceRows = XLSX.utils.sheet_to_json(priceWorksheet) as Record<string, any>[];
                priceRows.forEach(row => {
                    const sku = (row.SKU_PRODUCTO || row.sku || '').toString().trim();
                    const channel = (row.Canal_Cliente || 'General').toString().trim();
                    const price = parseFloat(row.Precio_Especial || '0');
                    if (sku) {
                        if (!pricesMap[sku]) pricesMap[sku] = [];
                        pricesMap[sku].push({ channel, price });
                    }
                });
            }

            if (wipeExistingData) {
                const confirmed = confirm('⚠️ ATENCIÓN: Se eliminarán TODOS los productos actuales antes de cargar los nuevos. ¿Estás absolutamente seguro?');
                if (!confirmed) return;
            }

            setLoading(true);
            try {
                // Pre-extraer los SKUs válidos del Excel subido
                const validSkus = new Set(
                    prodRows
                        .map(r => (r.SKU || r.sku || '').toString().trim())
                        .filter(s => s !== '')
                );

                if (wipeExistingData) {
                    // Intento 1: Intento de borrado físico directo
                    const { error: purgeError } = await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000'); 
                    
                    if (purgeError) {
                        console.warn('⚠️ No se pudo realizar el borrado físico directo por restricciones de FK en la BD. Ejecutando deshabilitación inteligente de productos no presentes en el Excel...', purgeError.message);
                        
                        // Intento 2: Deshabilitación de productos descontinuados que no vienen en el nuevo Excel
                        const { data: existingProds } = await supabase.from('products').select('id, sku');
                        if (existingProds && existingProds.length > 0) {
                            const obsoleteIds = existingProds
                                .filter(p => p.sku && !validSkus.has(p.sku.trim()))
                                .map(p => p.id);
                            
                            if (obsoleteIds.length > 0) {
                                // Desactivar en lotes los productos obsoletos
                                for (let i = 0; i < obsoleteIds.length; i += 100) {
                                    const chunkIds = obsoleteIds.slice(i, i + 100);
                                    await supabase.from('products').update({ is_active: false }).in('id', chunkIds);
                                }
                            }
                        }
                    }
                }

                const productsToInsert = prodRows
                    .filter(row => (row.SKU || row.sku || '').toString().trim() !== '')
                    .map(row => {
                        const cleanArrayStr = (val: any): string[] => {
                            if (!val) return [];
                            if (Array.isArray(val)) return val;
                            return val.toString().split(',').map((t: string) => t.trim()).filter((t: string) => t !== '');
                        };

                        const sku = (row.SKU || row.sku || '').toString().trim();
                        
                        // Detección de celda única con variaciones en la misma fila del producto (ej: columna Variantes / Opciones / Combinaciones)
                        const singleCellVar = (
                            row.Variantes || 
                            row.Variaciones || 
                            row.Opciones || 
                            row.Combinaciones || 
                            row['Opciones Variantes'] || 
                            row['Variantes Combinaciones'] || 
                            row['Opciones_Variantes'] ||
                            row['variantes'] ||
                            row['variaciones'] ||
                            ''
                        ).toString().trim();

                        // Reconstruir options_config y variants JSON a partir de la pestaña Variaciones O de la celda única
                        let options_config = variationsMap[sku] || [];
                        let variants: any[] = [];

                        if (options_config.length === 0 && singleCellVar) {
                            // Parsear la celda única con formato inteligente
                            const attrMap = new Map<string, Set<string>>();
                            const explicitCombos: Record<string, string>[] = [];

                            const segments = singleCellVar.split(/[;\n]+/).map((s: string) => s.trim()).filter(Boolean);
                            segments.forEach((segment: string) => {
                                if (segment.includes(':') || segment.includes('=')) {
                                    const pairs = segment.split('|').map(p => p.trim()).filter(Boolean);
                                    const currentCombo: Record<string, string> = {};

                                    pairs.forEach(pair => {
                                        const parts = pair.split(/[:=]/);
                                        if (parts.length >= 2) {
                                            const attrName = parts[0].trim();
                                            const rawVals = parts.slice(1).join(':').trim();
                                            const valList = rawVals.split(',').map(v => v.trim()).filter(Boolean);

                                            if (!attrMap.has(attrName)) attrMap.set(attrName, new Set());
                                            valList.forEach(v => {
                                                attrMap.get(attrName)!.add(v);
                                                if (valList.length === 1) currentCombo[attrName] = v;
                                            });
                                        }
                                    });

                                    if (Object.keys(currentCombo).length > 0 && Object.keys(currentCombo).length === pairs.length) {
                                        explicitCombos.push(currentCombo);
                                    }
                                } else {
                                    const defaultAttr = "Variante";
                                    if (!attrMap.has(defaultAttr)) attrMap.set(defaultAttr, new Set());
                                    segment.split(',').map(v => v.trim()).filter(Boolean).forEach(v => {
                                        attrMap.get(defaultAttr)!.add(v);
                                    });
                                }
                            });

                            options_config = Array.from(attrMap.entries()).map(([name, valSet]) => ({
                                name,
                                values: Array.from(valSet)
                            }));

                            if (explicitCombos.length > 0 && attrMap.size > 1 && explicitCombos.length < 500) {
                                variants = explicitCombos.map(combo => {
                                    const attrValues = Object.values(combo).map(v => (v || '').toString().substring(0, 2).toUpperCase()).join('');
                                    return {
                                        id: `v-${Math.random().toString(36).substring(2, 11)}`,
                                        options: combo,
                                        sku: `${sku}.${attrValues}`
                                    };
                                });
                            }
                        }

                        if (options_config.length > 0 && variants.length === 0) {
                            let results: any[] = [{}];
                            options_config.forEach(opt => {
                                const temp: any[] = [];
                                results.forEach(res => {
                                    opt.values.forEach((val: string) => {
                                        temp.push({ ...res, [opt.name]: val });
                                    });
                                });
                                results = temp;
                            });
                            variants = results.map(combination => {
                                const attrValues = Object.values(combination).map((v: any) => v.toString().substring(0, 2).toUpperCase()).join('');
                                return {
                                    id: `v-${Math.random().toString(36).substring(2, 11)}`,
                                    options: combination,
                                    sku: `${sku}.${attrValues}`
                                };
                            });
                        }

                        // Precios de canal
                        const pricing_model_prices = pricesMap[sku] || [];

                        // Detección flexible de ID UUID
                        const rawId = row.ID_INTERNO || row.id || row['ID Interno'] || row['id_interno'];
                        const isUUID = rawId && typeof rawId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId.trim());
                        const id = isUUID ? rawId.trim() : undefined;

                        // Detección flexible de Unidad_Web y Factor_Web
                        const web_unit = (row.Unidad_Web || row['Unidad Web'] || row.web_unit || row['unidad_web'] || row['unidad web'] || '').toString().trim() || null;
                        
                        const rawFactor = row.Factor_Web ?? row['Factor Web'] ?? row.web_conversion_factor ?? row['factor_web'] ?? row['factor web'];
                        let web_conversion_factor = 1.0;
                        if (rawFactor !== undefined && rawFactor !== null && rawFactor !== '') {
                            const parsedFactor = parseFloat(rawFactor.toString().replace(',', '.'));
                            if (!isNaN(parsedFactor) && parsedFactor > 0) {
                                web_conversion_factor = parsedFactor;
                            }
                        }

                        // Sanitización de números para prevenir NaN
                        const parseNum = (val: any, fallback: number = 0): number => {
                            if (val === undefined || val === null || val === '') return fallback;
                            const n = parseFloat(val.toString().replace(',', '.'));
                            return isNaN(n) ? fallback : n;
                        };

                        const parseIntNum = (val: any, fallback: number = 0): number => {
                            if (val === undefined || val === null || val === '') return fallback;
                            const n = parseInt(val.toString());
                            return isNaN(n) ? fallback : n;
                        };

                        const isVerifiedDev = (row.Revisado_Dev || row['Revisado Dev'] || row.revisado_dev || row.is_verified_dev) === 'SI' || (row.Revisado_Dev || row['Revisado Dev'] || row.revisado_dev || row.is_verified_dev) === true;
                        let tags = cleanArrayStr(row.Tags || row.tags);
                        if (isVerifiedDev && !tags.includes('verified_dev')) {
                            tags.push('verified_dev');
                        } else if (!isVerifiedDev && tags.includes('verified_dev') && (row.Revisado_Dev !== undefined || row['Revisado Dev'] !== undefined || row.is_verified_dev !== undefined)) {
                            tags = tags.filter(t => t !== 'verified_dev');
                        }

                        return {
                            id,
                            sku: sku,
                            accounting_id: parseIntNum(row.ID_CONTABLE || row.accounting_id, 0),
                            name: (row.Nombre || row.name || '').toString(),
                            name_en: (row.Nombre_EN || row.name_en || '').toString() || null,
                            description: (row.Descripcion || row.description || '').toString(),
                            description_en: (row.Descripcion_EN || row.description_en || '').toString() || null,
                            category: (row.Categoria || row.category || 'DE').toString(),
                            unit_of_measure: (row.Unidad || row.unit_of_measure || 'Kg').toString(),
                            base_price: parseNum(row.Costo_Base || row.base_price, 0),
                            iva_rate: parseIntNum(row.IVA || row.iva_rate, 19),
                            image_url: (row.URL_Imagen && row.URL_Imagen.toString() !== '0') ? row.URL_Imagen.toString() : null,
                            buying_team: (row.Comprador || row.buying_team || '').toString() || null,
                            procurement_method: (row.Metodo_Compra || row.procurement_method || '').toString() || null,
                            is_active: (row.Activo || row.is_active) === 'SI' || row.is_active === true,
                            show_on_web: (row.Web || row.show_on_web) === 'SI' || row.show_on_web === true,
                            display_name: (row.Nombre_Web || row.display_name || '').toString() || null,
                            web_unit,
                            web_conversion_factor,
                            min_inventory_level: parseIntNum(row.Min_Inventario || row.min_inventory_level, 0),
                            parent_id: row.ID_PADRE || row.parent_id || null,
                            theoretical_shrinkage_pct: parseNum(row.Merma_Teorica_Pct || row.theoretical_shrinkage_pct, 0),
                            allowed_waste_reasons: cleanArrayStr(row.Razones_Desperdicio || row.allowed_waste_reasons),
                            inventory_group: (row.Grupo_Inventario || row.inventory_group || '').toString() || null,
                            purchase_sublist: (row.Sublista_Compra || row.purchase_sublist || '').toString() || null,
                            tags,
                            keywords: (row.Keywords || row.keywords || '').toString() || null,
                            utility_deviation_pct: parseNum(row.Desviacion_Utilidad_Pct || row.utility_deviation_pct, 0),
                            inherit_price: (row.Heredar_Precio || row.inherit_price) === 'SI' || row.inherit_price === true,
                            is_verified_dev: isVerifiedDev,
                            
                            options_config,
                            variants,
                            pricing_model_prices
                        };
                    });

                // Cargar en bloques de 100 con manejo inteligente de onConflict
                const chunkSize = 100;
                for (let i = 0; i < productsToInsert.length; i += chunkSize) {
                    const chunk = productsToInsert.slice(i, i + chunkSize);
                    
                    // Si el lote tiene id UUID definido en todos los ítems, upsert directo por id; de lo contrario upsert por SKU
                    const hasUUIDs = chunk.every(item => item.id);
                    if (hasUUIDs) {
                        const { error } = await supabase.from('products').upsert(chunk);
                        if (error) throw error;
                    } else {
                        const { error } = await supabase.from('products').upsert(chunk, { onConflict: 'sku' });
                        if (error) throw error;
                    }
                }

                showToast(`Carga masiva completada: ${productsToInsert.length} productos procesados exitosamente.`, 'success');
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
        // Tab 1: Productos Base (sin campos de precio estáticos)
        const headers = [
            "SKU", "ID_CONTABLE", "Nombre", "Nombre_EN", "Descripcion", "Descripcion_EN", 
            "Categoria", "Unidad", "IVA", "URL_Imagen", "Comprador", 
            "Metodo_Compra", "Activo", "Web", "Nombre_Web", "Unidad_Web", "Factor_Web", 
            "Min_Inventario", "ID_PADRE", "Merma_Teorica_Pct", "Razones_Desperdicio", 
            "Grupo_Inventario", "Sublista_Compra", "Tags", "Keywords", "Desviacion_Utilidad_Pct", 
            "Heredar_Precio", "Config_Opciones", "Variantes_JSON"
        ];
        
        const sample1 = [
            "M-FR-MNZ-K", "101", "Manzana Roja", "Red Apple", "Manzana fresca seleccionada de alta calidad", "Fresh red apple selected...", 
            "FR", "Kg", 0, "https://images.com/manzana.jpg", "EQUIPO B FRUTAS Y OTROS", 
            "Compras Generales", "SI", "SI", "Manzana Roja Web", "Kg", 1.0, 
            10, "", 2.5, "Daño por transporte,Madurez excesiva", 
            "INVENTARIO DE FRUTAS Y OTROS", "FRUTA SELECCIONADA", "frescos,fruta,roja", "manzana,apple,red", 0, 
            "NO", "[]", "[]"
        ];

        const sample2 = [
            "M-VE-CBL-K", "102", "Cebolla Cabezona", "White Onion", "Cebolla cabezona blanca seleccionada", "Fresh white onion...", 
            "VE", "Kg", 0, "", "LAVADO, BATAVIA, ARRACACHA, CEBOLLA LARGA Y PEPINO", 
            "Compras Generales", "SI", "SI", "Cebolla Cabezona Web", "Kg", 1.0, 
            20, "", 1.8, "Deshidratación", 
            "INVENTARIO DE VERDURAS", "VERDURAS", "verduras,cebolla", "cebolla,onion", 0, 
            "NO", "[]", "[]"
        ];

        const dataSheet = [headers, sample1, sample2];

        // Tab 2: Guía de Datos / Diccionario
        const guideHeaders = ["Campo Plantilla", "Requerido", "Tipo de Dato", "Descripción / Valores Permitidos"];
        const guideRows = [
            ["SKU", "SÍ", "Texto", "Código único identificador del SKU (ej: M-FR-MNZ-K)"],
            ["ID_CONTABLE", "SÍ", "Número", "ID numérico único de contabilidad (ej: 101, 102)"],
            ["Nombre", "SÍ", "Texto", "Nombre principal del SKU en español"],
            ["Nombre_EN", "NO", "Texto", "Nombre del SKU en inglés"],
            ["Descripcion", "NO", "Texto", "Descripción comercial en español"],
            ["Descripcion_EN", "NO", "Texto", "Descripción comercial en inglés"],
            ["Categoria", "SÍ", "Texto", "Código de Categoría: FR (Frutas), VE (Verduras), HO (Hortalizas), TU (Tubérculos), DE (Despensa), LA (Lácteos)"],
            ["Unidad", "SÍ", "Texto", "Unidad base física (ej: Kg, G, Lb, Lt, Un, Atado, Bulto)"],
            ["IVA", "SÍ", "Número", "Porcentaje de IVA aplicable (0, 5, 19)"],
            ["URL_Imagen", "NO", "Texto", "Enlace público HTTP de la foto principal"],
            ["Comprador", "NO", "Texto", "Equipo de alistamiento asignado (ej: EQUIPO B FRUTAS Y OTROS, HIERBAS Y HORTALIZAS)"],
            ["Metodo_Compra", "NO", "Texto", "Tipo de compra: 'Compras Generales', 'Compras Menores', 'Compras Noche'"],
            ["Activo", "SÍ", "SI/NO", "Estado de disponibilidad maestro en el ERP"],
            ["Web", "SÍ", "SI/NO", "Estado de publicación en el e-commerce B2C"],
            ["Nombre_Web", "NO", "Texto", "Nombre de exhibición web en e-commerce B2C"],
            ["Unidad_Web", "NO", "Texto", "Unidad de empaque en la web (ej: Kg, Atado, Un)"],
            ["Factor_Web", "NO", "Número", "Conversión de unidad web a unidad base logarítmica (ej: 1.0)"],
            ["Min_Inventario", "NO", "Número", "Umbral de alerta de stock crítico"],
            ["ID_PADRE", "NO", "Texto", "ID de producto padre si es un producto fraccionado"],
            ["Merma_Teorica_Pct", "NO", "Número", "Porcentaje (%) de merma esperada por manipulación logísitica (ej: 2.5)"],
            ["Razones_Desperdicio", "NO", "Texto", "Lista de razones separadas por coma permitidas en picking/recepción"],
            ["Grupo_Inventario", "NO", "Texto", "Nombre del grupo lógico de inventario físico"],
            ["Sublista_Compra", "NO", "Texto", "Nombre de la sublista para compras/abastecimiento"],
            ["Tags", "NO", "Texto", "Etiquetas de clasificación web separadas por comas"],
            ["Keywords", "NO", "Texto", "Palabras alternativas de búsqueda separadas por comas"],
            ["Desviacion_Utilidad_Pct", "NO", "Número", "Porcentaje (%) máximo permitido de desviación respecto al costo heredado"],
            ["Heredar_Precio", "NO", "SI/NO", "Indica si hereda automáticamente precios y costos de su SKU padre"],
            ["Config_Opciones", "NO", "JSON", "Configuración de atributos (opciones) del SKU"],
            ["Variantes_JSON", "NO", "JSON", "Variaciones paramétricas generadas"],
            ["Nota General", "PRECIOS DINÁMICOS", "N/A", "Los precios comerciales se gestionan dinámicamente desde el módulo Matriz de Costos."]
        ];
        const guideSheetData = [guideHeaders, ...guideRows];

        const workbook = XLSX.utils.book_new();
        
        const worksheetData = XLSX.utils.aoa_to_sheet(dataSheet);
        const worksheetGuide = XLSX.utils.aoa_to_sheet(guideSheetData);
        
        // Ajustar anchos
        worksheetData['!cols'] = headers.map(() => ({ wch: 20 }));
        worksheetGuide['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 65 }];

        XLSX.utils.book_append_sheet(workbook, worksheetData, "Plantilla_Productos");
        XLSX.utils.book_append_sheet(workbook, worksheetGuide, "Diccionario_Datos_Guia");
        
        XLSX.writeFile(workbook, "plantilla_carga_masiva_frubana.xlsx");
        showToast('Plantilla descargada (sin precios estáticos)', 'success');
    };

    const availableUnits = useMemo(() => {
        const unitsFromProducts = products.map(p => p.unit_of_measure?.trim()).filter(Boolean) as string[];
        const combined = Array.from(new Set([...dynamicUnits, ...unitsFromProducts]));
        return combined.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    }, [products, dynamicUnits]);

    const filteredProducts = useMemo(() => {
        let result = products;

        // Filtros de Cabeceras de Columna
        if (filterHierarchy === 'padre') {
            result = result.filter(p => p.parent_id === p.id);
        } else if (filterHierarchy === 'hijo') {
            result = result.filter(p => p.parent_id !== null && p.parent_id !== p.id);
        }

        if (filterCategoryHeader !== 'all') {
            result = result.filter(p => p.category === filterCategoryHeader);
        }

        if (filterIvaHeader !== 'all') {
            const ivaVal = parseInt(filterIvaHeader);
            result = result.filter(p => (p.iva_rate ?? 19) === ivaVal);
        }

        if (filterWebHeader === 'web') {
            result = result.filter(p => p.show_on_web);
        } else if (filterWebHeader === 'oculto') {
            result = result.filter(p => !p.show_on_web);
        }

        if (filterStatusHeader === 'activo') {
            result = result.filter(p => p.is_active);
        } else if (filterStatusHeader === 'inactivo') {
            result = result.filter(p => !p.is_active);
        }

        if (filterPhotoHeader === 'con_foto') {
            result = result.filter(p => p.image_url && p.image_url.trim() !== '' && p.image_url !== '0');
        } else if (filterPhotoHeader === 'sin_foto') {
            result = result.filter(p => !p.image_url || p.image_url.trim() === '' || p.image_url === '0');
        }

        if (filterUnitHeader !== 'all') {
            result = result.filter(p => (p.unit_of_measure || '').trim().toLowerCase() === filterUnitHeader.trim().toLowerCase());
        }

        const query = searchQuery.trim().toLowerCase();
        if (!query) return result;

        // Separar factores por comas
        const factors = query.split(',').map(f => f.trim()).filter(Boolean);

        return result.filter(p => {
            const matchesSearch = factors.every(factor => {
                // 1. Lógica de IDs (#3, #15...)
                if (factor.startsWith('#')) {
                    const id = factor.slice(1);
                    return p.accounting_id?.toString() === id;
                }

                // 2. Lógica de ETIQUETAS (@web, @oculto...)
                if (factor.startsWith('@')) {
                    const tag = factor.slice(1);
                    
                    // Filtro Foto / Imagen (@foto, @confoto, @con-foto, @imagen / @sinfoto, @sin-foto, @sinimagen)
                    const hasPhoto = Boolean(p.image_url && p.image_url.trim() !== '' && p.image_url !== '0');
                    if (['foto', 'confoto', 'con-foto', 'imagen', 'conimagen', 'con-imagen', 'photo', 'withphoto'].includes(tag)) {
                        return hasPhoto;
                    }
                    if (['sinfoto', 'sin-foto', 'sin_foto', 'sinimagen', 'sin-imagen', 'sin_imagen', 'nophoto', 'no-photo', 'sinimg', 'sin-img'].includes(tag)) {
                        return !hasPhoto;
                    }

                    // Filtro Unidad (@kg, @g, @lb, @un, @atado, @bulto, @caja, @lt, @saco, @cubeta)
                    const unitLower = (p.unit_of_measure || '').trim().toLowerCase();
                    if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(tag)) return unitLower === 'kg';
                    if (['g', 'gr', 'gramo', 'gramos'].includes(tag)) return unitLower === 'g' || unitLower === 'gr';
                    if (['lb', 'libra', 'libras'].includes(tag)) return unitLower === 'lb';
                    if (['un', 'und', 'unidad', 'unidades'].includes(tag)) return unitLower === 'un' || unitLower === 'und' || unitLower === 'unidad';
                    if (['atado', 'atados'].includes(tag)) return unitLower === 'atado' || unitLower === 'atados';
                    if (['bulto', 'bultos'].includes(tag)) return unitLower === 'bulto' || unitLower === 'bultos';
                    if (['caja', 'cajas'].includes(tag)) return unitLower === 'caja' || unitLower === 'cajas';
                    if (['saco', 'sacos'].includes(tag)) return unitLower === 'saco' || unitLower === 'sacos';
                    if (['lt', 'litro', 'litros'].includes(tag)) return unitLower === 'lt' || unitLower === 'litro';
                    if (['cubeta', 'cubetas'].includes(tag)) return unitLower === 'cubeta' || unitLower === 'cubetas';

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

                    // Filtro Jerarquía (@padre, @hijo)
                    if (tag === 'padre') return p.parent_id === p.id;
                    if (tag === 'hijo') return p.parent_id !== null && p.parent_id !== p.id;

                    // Filtro Incompletos (@sindatos)
                    if (tag === 'sindatos' || tag === 'incompleto') {
                        return !p.image_url || !p.description || !p.display_name || !p.buying_team || !p.procurement_method;
                    }

                    // Filtro Dev (@dev, @revisado, @pendiente)
                    if (tag === 'dev' || tag === 'revisado') return p.is_verified_dev || (p.tags && p.tags.includes('verified_dev'));
                    if (tag === 'pendiente') return !p.is_verified_dev && !(p.tags && p.tags.includes('verified_dev'));

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

                // 3. Lógica de TEXTO normal
                return (
                    p.name?.toLowerCase().includes(factor) ||
                    p.sku?.toLowerCase().includes(factor) ||
                    p.accounting_id?.toString().includes(factor)
                );
            });

            // Filtro por header Dev (Dropdown)
            if (filterDevHeader === 'revisado') {
                const isDev = p.is_verified_dev || (p.tags && p.tags.includes('verified_dev'));
                if (!isDev) return false;
            }
            if (filterDevHeader === 'pendiente') {
                const isDev = p.is_verified_dev || (p.tags && p.tags.includes('verified_dev'));
                if (isDev) return false;
            }

            return matchesSearch;
        });
    }, [products, searchQuery, filterHierarchy, filterCategoryHeader, filterIvaHeader, filterWebHeader, filterStatusHeader, filterDevHeader]);

    const paginatedProducts = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredProducts, currentPage]);

    const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);

    // Dashboard KPIs
    const kpiMetrics = useMemo(() => {
        const total = products.length;
        if (total === 0) return { total: 0, activeCount: 0, imageCoverage: 0, webCount: 0, noImageCount: 0, alerts: 0, parentCount: 0, childCount: 0 };

        const withImg = products.filter(p => p.image_url && p.image_url.trim() !== '').length;
        const webVis = products.filter(p => p.show_on_web).length;
        const withAlert = products.filter(p => p.min_inventory_level > 0).length;
        const noImg = products.filter(p => !p.image_url || p.image_url.trim() === '').length;
        const activeCount = products.filter(p => p.is_active).length;
        
        // Conteo de Jerarquía
        const parentCount = products.filter(p => p.parent_id === p.id).length;
        const childCount = products.filter(p => p.parent_id !== null && p.parent_id !== p.id).length;
        const devVerifiedCount = products.filter(p => p.is_verified_dev || (p.tags && p.tags.includes('verified_dev'))).length;

        return {
            total,
            activeCount,
            imageCoverage: Math.round((withImg / total) * 100),
            webCount: webVis,
            noImageCount: noImg,
            alerts: withAlert,
            parentCount,
            childCount,
            devVerifiedCount
        };
    }, [products]);

    if (loading) {
        return (
            <main style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.background }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <RefreshCw size={32} className="animate-spin" style={{ color: THEME.colors.primary }} />
                    <span style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem', fontWeight: '600' }}>Cargando catálogo maestro...</span>
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

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background }}>
            <Toast />
            
            <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem' }}>
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
                        <span>Modo Vista: No tienes permisos para modificar el catálogo maestro.</span>
                    </div>
                )}
                <header style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <Link href="/admin/dashboard" style={{ textDecoration: 'none', color: THEME.colors.textSecondary, fontWeight: '600', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <ArrowLeft size={14} strokeWidth={1.5} /> Volver al Dashboard
                            </Link>
                            <h1 style={{ fontSize: '2rem', fontWeight: '800', color: THEME.colors.textMain, margin: '0.4rem 0 0 0', letterSpacing: '-0.02em' }}>Maestro de Productos (Datos Técnicos)</h1>
                            <p style={{ color: THEME.colors.textSecondary, fontSize: '0.9rem', marginTop: '0.2rem' }}>Gestión centralizada de estándares, códigos contables y definiciones técnicas.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button
                                onClick={sanitizeMasterData}
                                disabled={!canEdit}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: THEME.radius.md,
                                    backgroundColor: '#FFFBEB',
                                    color: '#B45309',
                                    border: '1px solid #FDE68A',
                                    fontWeight: '600',
                                    cursor: canEdit ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '0.8rem',
                                    opacity: canEdit ? 1 : 0.6,
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => { if (canEdit) e.currentTarget.style.backgroundColor = '#FEF3C7'; }}
                                onMouseLeave={e => { if (canEdit) e.currentTarget.style.backgroundColor = '#FFFBEB'; }}
                                title="Generar descripciones y sanetizar datos de productos"
                            >
                                <Wand2 size={14} strokeWidth={1.5} /> Sanetizar
                            </button>
                            <button
                                onClick={syncWebVisibility}
                                disabled={!canEdit}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: THEME.radius.md,
                                    backgroundColor: THEME.colors.primaryLight,
                                    color: THEME.colors.primary,
                                    border: `1px solid ${THEME.colors.border}`,
                                    fontWeight: '600',
                                    cursor: canEdit ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '0.8rem',
                                    opacity: canEdit ? 1 : 0.6,
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => { if (canEdit) e.currentTarget.style.backgroundColor = '#DFE7DF'; }}
                                onMouseLeave={e => { if (canEdit) e.currentTarget.style.backgroundColor = THEME.colors.primaryLight; }}
                                title="Sincronizar visibilidad web con disponibilidad de imágenes"
                            >
                                <Globe size={14} strokeWidth={1.5} /> Sincronizar Web
                            </button>

                            <button
                                onClick={() => canEdit && setIsCreateModalOpen(true)}
                                disabled={!canEdit}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '0.5rem 1rem',
                                    backgroundColor: canEdit ? THEME.colors.primary : THEME.colors.textSecondary,
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: THEME.radius.md,
                                    fontWeight: '700',
                                    fontSize: '0.8rem',
                                    cursor: canEdit ? 'pointer' : 'not-allowed',
                                    opacity: canEdit ? 1 : 0.6,
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={e => { if (canEdit) e.currentTarget.style.backgroundColor = THEME.colors.primaryHover; }}
                                onMouseLeave={e => { if (canEdit) e.currentTarget.style.backgroundColor = THEME.colors.primary; }}
                            >
                                <Plus size={16} strokeWidth={1.5} /> Nuevo Producto
                            </button>
                            <button
                                onClick={downloadFullMaster}
                                style={{
                                    padding: '0.5rem 0.75rem',
                                    borderRadius: THEME.radius.md,
                                    backgroundColor: THEME.colors.surface,
                                    color: THEME.colors.textSecondary,
                                    border: `1px solid ${THEME.colors.border}`,
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = THEME.colors.borderActive}
                                onMouseLeave={e => e.currentTarget.style.borderColor = THEME.colors.border}
                                title="Exportar Todo el Maestro (Excel)"
                            >
                                <FileDown size={16} strokeWidth={1.5} />
                            </button>
                            <button
                                onClick={() => canEdit && setIsBulkModalOpen(true)}
                                disabled={!canEdit}
                                style={{
                                    padding: '0.5rem 0.75rem',
                                    borderRadius: THEME.radius.md,
                                    backgroundColor: THEME.colors.surface,
                                    color: THEME.colors.textMain,
                                    border: `1px solid ${THEME.colors.border}`,
                                    fontWeight: '600',
                                    cursor: canEdit ? 'pointer' : 'not-allowed',
                                    opacity: canEdit ? 1 : 0.6,
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => { if (canEdit) e.currentTarget.style.borderColor = THEME.colors.borderActive; }}
                                onMouseLeave={e => { if (canEdit) e.currentTarget.style.borderColor = THEME.colors.border; }}
                                title="Carga Masiva (Excel)"
                            >
                                <FileUp size={16} strokeWidth={1.5} />
                            </button>
                        </div>
                    </div>
                </header>

                {/* KPI DASHBOARD */}
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                    gap: '1rem', 
                    marginBottom: '2rem' 
                }}>
                    {[
                        { label: 'Total Histórico', value: formatNumber(kpiMetrics.total), icon: <Database size={16} strokeWidth={1.5} />, color: '#6366F1', bg: '#EEF2FF' },
                        { label: 'Catálogo Activo', value: `${kpiMetrics.total > 0 ? formatNumber((kpiMetrics.activeCount / kpiMetrics.total) * 100, 1) : 0}%`, icon: <CheckCircle size={16} strokeWidth={1.5} />, color: THEME.colors.primary, bg: THEME.colors.primaryLight },
                        { label: 'Publicados en Web', value: formatNumber(kpiMetrics.webCount), icon: <Globe size={16} strokeWidth={1.5} />, color: '#3B82F6', bg: '#EFF6FF' },
                        { label: 'Cobertura Imagen', value: `${formatNumber(kpiMetrics.imageCoverage)}%`, icon: <Globe size={16} strokeWidth={1.5} />, color: '#F59E0B', bg: '#FFFBEB' }, // Replaced with Globe or Eye for styling, let's keep Globe for similarity
                        { label: 'Alertas Inventario', value: formatNumber(kpiMetrics.alerts), icon: <AlertTriangle size={16} strokeWidth={1.5} />, color: '#EF4444', bg: '#FEF2F2' },
                        { label: 'Jerarquía (P/H)', value: `${formatNumber(kpiMetrics.parentCount)} P / ${formatNumber(kpiMetrics.childCount)} H`, icon: <GitFork size={16} strokeWidth={1.5} />, color: '#6D28D9', bg: '#F5F3FF' },
                        { label: 'Revisión Dev', value: `${formatNumber(kpiMetrics.devVerifiedCount)} / ${formatNumber(kpiMetrics.total)}`, icon: <CheckCircle size={16} strokeWidth={1.5} />, color: '#10B981', bg: '#ECFDF5' },
                    ].map((card, i) => (
                        <div key={i} style={{
                            backgroundColor: THEME.colors.surface,
                            padding: '0.85rem 1.1rem',
                            borderRadius: THEME.radius.lg,
                            border: `1px solid ${THEME.colors.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            transition: 'all 0.2s ease',
                            cursor: 'default',
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
                                backgroundColor: card.bg, 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                color: card.color
                            }}>
                                {card.icon}
                            </div>
                            <div>
                                <p style={{ fontSize: '0.65rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                                    {card.label}
                                </p>
                                <p style={{ fontSize: '1.25rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.02em' }}>
                                    {card.value}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>



                {savingId && (
                    <div style={{ 
                        backgroundColor: THEME.colors.primaryLight, 
                        color: THEME.colors.primary, 
                        padding: '0.75rem 1rem', 
                        borderRadius: THEME.radius.md, 
                        fontWeight: '600', 
                        fontSize: '0.85rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        marginBottom: '1.5rem',
                        border: `1px solid ${THEME.colors.border}`
                    }}>
                        <RefreshCw size={14} className="animate-spin" strokeWidth={1.5} style={{ marginRight: '4px' }} /> Guardando cambios en maestro...
                    </div>
                )}

                {/* Buscador Con Esteroides (X y Info) */}
                <div style={{ marginBottom: '1.5rem', position: 'relative', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <div style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center' }}>
                            <Search size={16} strokeWidth={1.5} />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar por ID Contable, Nombre o Categoría... (Usa @ para filtros rápidos)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.65rem 2.5rem 0.65rem 2.5rem',
                                borderRadius: THEME.radius.md,
                                border: `1px solid ${THEME.colors.border}`,
                                fontSize: '0.9rem',
                                fontWeight: '500',
                                outline: 'none',
                                transition: 'all 0.2s ease',
                                backgroundColor: THEME.colors.surface,
                                boxShadow: THEME.shadow.sm,
                                color: THEME.colors.textMain
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = THEME.colors.primary;
                                e.target.style.boxShadow = `0 0 0 2px ${THEME.colors.primaryLight}`;
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = THEME.colors.border;
                                e.target.style.boxShadow = THEME.shadow.sm;
                            }}
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: THEME.colors.textSecondary,
                                    cursor: 'pointer',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    position: 'absolute',
                                    right: '0.85rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)'
                                }}
                                title="Limpiar búsqueda"
                            >
                                <X size={16} strokeWidth={1.5} />
                            </button>
                        )}
                    </div>

                    {/* Contador de Productos Filtrados */}
                    <div style={{
                        padding: '0 1rem',
                        borderRadius: THEME.radius.md,
                        backgroundColor: searchQuery ? THEME.colors.primaryLight : THEME.colors.surface,
                        color: searchQuery ? THEME.colors.primary : THEME.colors.textSecondary,
                        border: `1px solid ${searchQuery ? THEME.colors.primary : THEME.colors.border}`,
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap',
                        height: '38px',
                        transition: 'all 0.2s ease',
                        boxShadow: THEME.shadow.sm,
                    }}>
                        {searchQuery ? <Search size={14} strokeWidth={1.5} /> : <Database size={14} strokeWidth={1.5} />}
                        <span>
                            {searchQuery ? (
                                <>
                                    <strong style={{ color: THEME.colors.primary, fontWeight: '700' }}>{formatNumber(filteredProducts.length)}</strong>
                                    <span style={{ fontWeight: '450', color: THEME.colors.textSecondary, marginLeft: '4px' }}>de {formatNumber(products.length)}</span>
                                </>
                            ) : (
                                <>
                                    <strong style={{ color: THEME.colors.textMain, fontWeight: '700' }}>{formatNumber(products.length)}</strong>
                                    <span style={{ fontWeight: '450', color: THEME.colors.textSecondary, marginLeft: '4px' }}>productos</span>
                                </>
                            )}
                        </span>
                    </div>

                    {/* Botón Informativo Estándar (Hover/Click) */}
                    <div 
                        onClick={() => setShowHelpTooltip(prev => !prev)}
                        onMouseEnter={() => setShowHelpTooltip(true)}
                        onMouseLeave={() => setShowHelpTooltip(false)}
                        style={{ 
                            position: 'relative',
                            width: '38px', 
                            height: '38px', 
                            borderRadius: THEME.radius.md, 
                            backgroundColor: THEME.colors.primaryLight, 
                            color: THEME.colors.primary, 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            cursor: 'pointer',
                            border: `1px solid ${THEME.colors.border}`,
                            fontSize: '0.9rem',
                            fontWeight: '600',
                            flexShrink: 0,
                            transition: 'all 0.2s ease',
                            boxShadow: THEME.shadow.sm
                        }}
                    >
                        <Info size={16} strokeWidth={1.5} />
                        {showHelpTooltip && (
                            <div style={{
                                position: 'absolute',
                                top: '44px',
                                right: '0',
                                width: '380px',
                                backgroundColor: '#111827',
                                color: 'white',
                                padding: '1.2rem',
                                borderRadius: '16px',
                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
                                zIndex: 1000,
                                fontSize: '0.78rem',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                lineHeight: '1.5',
                                animation: 'fadeInDown 0.2s ease-out'
                            }}>
                                <div style={{ fontWeight: '800', color: '#10B981', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Dna size={14} strokeWidth={2} /> COMANDOS MAESTROS (@)
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 'normal' }}>Clic para aplicar</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                                    {[
                                        { tag: '@web', desc: 'En Tienda Web' },
                                        { tag: '@oculto', desc: 'No Web' },
                                        { tag: '@foto', desc: 'Con Foto' },
                                        { tag: '@sinfoto', desc: 'Sin Foto' },
                                        { tag: '@sindatos', desc: 'Faltan datos' },
                                        { tag: '@activo', desc: 'Habilitados' },
                                        { tag: '@padre', desc: 'Producto Base' },
                                        { tag: '@hijo', desc: 'Fraccionado' },
                                        { tag: '@19', desc: 'IVA 19%' },
                                        { tag: '@0', desc: 'Exentos IVA' },
                                        { tag: '@frutas', desc: 'Cat. Frutas' },
                                        { tag: '@verduras', desc: 'Cat. Verduras' },
                                        { tag: '@despensa', desc: 'Cat. Despensa' },
                                        { tag: '@kg', desc: 'Unidad: Kg' },
                                        { tag: '@un', desc: 'Unidad: Un/Atado' },
                                        { tag: '#ID', desc: 'ID Contable (#12)' }
                                    ].map((item, i) => (
                                        <div 
                                            key={i}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const cleanTag = item.tag === '#ID' ? '#' : item.tag;
                                                setSearchQuery(prev => {
                                                    if (!prev) return cleanTag;
                                                    if (prev.toLowerCase().includes(cleanTag.toLowerCase())) return prev;
                                                    return `${prev}, ${cleanTag}`;
                                                });
                                            }}
                                            style={{
                                                cursor: 'pointer',
                                                padding: '4px 6px',
                                                borderRadius: '6px',
                                                backgroundColor: 'rgba(255,255,255,0.05)',
                                                transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.2)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
                                        >
                                            <b style={{ color: '#FCD34D' }}>{item.tag}</b>: {item.desc}
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8', fontStyle: 'italic', fontSize: '0.72rem' }}>
                                    💡 Tip: Filtra por campos combinados separando con comas (,). Ejemplo: <code>Papa, @web, @activo</code>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ 
                    backgroundColor: THEME.colors.surface, 
                    borderRadius: THEME.radius.lg, 
                    boxShadow: THEME.shadow.sm, 
                    overflowX: 'auto', 
                    border: `1px solid ${THEME.colors.border}`,
                    width: '100%'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                {/* FOTO */}
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', width: '80px', position: 'relative' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>FOTO</span>
                                        <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setOpenHeaderDropdown(openHeaderDropdown === 'photo' ? null : 'photo'); }}
                                            style={{ background: filterPhotoHeader !== 'all' ? THEME.colors.primary : '#E2E8F0', color: filterPhotoHeader !== 'all' ? 'white' : '#475569', border: 'none', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                            title="Filtrar por Foto"
                                        >
                                            <ChevronDown size={12} />
                                        </button>
                                    </div>
                                    {openHeaderDropdown === 'photo' && (
                                        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', minWidth: '150px', padding: '0.4rem', fontWeight: 'normal', textTransform: 'none' }}>
                                            <div onClick={() => { setFilterPhotoHeader('all'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterPhotoHeader === 'all' ? 'bold' : 'normal', backgroundColor: filterPhotoHeader === 'all' ? '#F1F5F9' : 'transparent' }}>
                                                <Filter size={13} style={{ color: '#64748B' }} /> Todas
                                            </div>
                                            <div onClick={() => { setFilterPhotoHeader('con_foto'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterPhotoHeader === 'con_foto' ? 'bold' : 'normal', backgroundColor: filterPhotoHeader === 'con_foto' ? '#F1F5F9' : 'transparent' }}>
                                                📷 Con Foto
                                            </div>
                                            <div onClick={() => { setFilterPhotoHeader('sin_foto'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterPhotoHeader === 'sin_foto' ? 'bold' : 'normal', backgroundColor: filterPhotoHeader === 'sin_foto' ? '#F1F5F9' : 'transparent' }}>
                                                🚫 Sin Foto
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', width: '140px' }}>ID Contable</th>

                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem' }}>Nombre Técnico</th>

                                {/* CATEGORÍA */}
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', position: 'relative' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>CATEGORÍA</span>
                                        <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setOpenHeaderDropdown(openHeaderDropdown === 'category' ? null : 'category'); }}
                                            style={{ background: filterCategoryHeader !== 'all' ? THEME.colors.primary : '#E2E8F0', color: filterCategoryHeader !== 'all' ? 'white' : '#475569', border: 'none', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                            title="Filtrar por categoría"
                                        >
                                            <ChevronDown size={12} />
                                        </button>
                                    </div>
                                    {openHeaderDropdown === 'category' && (
                                        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', minWidth: '180px', padding: '0.4rem', fontWeight: 'normal', textTransform: 'none' }}>
                                            <div onClick={() => { setFilterCategoryHeader('all'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterCategoryHeader === 'all' ? 'bold' : 'normal', backgroundColor: filterCategoryHeader === 'all' ? '#F1F5F9' : 'transparent' }}>
                                                <Filter size={13} style={{ color: '#64748B' }} /> Todas las categorías
                                            </div>
                                            {[
                                                { code: 'FR', label: '🍎 Frutas' },
                                                { code: 'VE', label: '🥦 Verduras' },
                                                { code: 'HO', label: '🌿 Hortalizas' },
                                                { code: 'TU', label: '🥔 Tubérculos' },
                                                { code: 'LA', label: '🥛 Lácteos' },
                                                { code: 'DP', label: '🥫 Despensa' },
                                                { code: 'CG', label: '❄️ Congelados' },
                                                { code: 'PR', label: '⚙️ Procesados' }
                                            ].map(cat => (
                                                <div key={cat.code} onClick={() => { setFilterCategoryHeader(cat.code); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterCategoryHeader === cat.code ? 'bold' : 'normal', backgroundColor: filterCategoryHeader === cat.code ? '#F1F5F9' : 'transparent' }}>
                                                    {cat.label}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </th>

                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem' }}>Logística</th>
                                
                                {/* UNIDAD */}
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', textAlign: 'center', position: 'relative' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                        <span>UNIDAD</span>
                                        <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setOpenHeaderDropdown(openHeaderDropdown === 'unit' ? null : 'unit'); }}
                                            style={{ background: filterUnitHeader !== 'all' ? THEME.colors.primary : '#E2E8F0', color: filterUnitHeader !== 'all' ? 'white' : '#475569', border: 'none', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                            title="Filtrar por Unidad"
                                        >
                                            <ChevronDown size={12} />
                                        </button>
                                    </div>
                                    {openHeaderDropdown === 'unit' && (
                                        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', zIndex: 100, backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', minWidth: '150px', maxHeight: '250px', overflowY: 'auto', padding: '0.4rem', fontWeight: 'normal', textTransform: 'none', textAlign: 'left' }}>
                                            <div onClick={() => { setFilterUnitHeader('all'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterUnitHeader === 'all' ? 'bold' : 'normal', backgroundColor: filterUnitHeader === 'all' ? '#F1F5F9' : 'transparent' }}>
                                                <Filter size={13} style={{ color: '#64748B' }} /> Todas las unidades
                                            </div>
                                            {availableUnits.map(unit => (
                                                <div key={unit} onClick={() => { setFilterUnitHeader(unit); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterUnitHeader.toLowerCase() === unit.toLowerCase() ? 'bold' : 'normal', backgroundColor: filterUnitHeader.toLowerCase() === unit.toLowerCase() ? '#F1F5F9' : 'transparent' }}>
                                                    📦 {unit}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </th>

                                {/* IVA */}
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', textAlign: 'center', position: 'relative' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                        <span>IVA</span>
                                        <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setOpenHeaderDropdown(openHeaderDropdown === 'iva' ? null : 'iva'); }}
                                            style={{ background: filterIvaHeader !== 'all' ? THEME.colors.primary : '#E2E8F0', color: filterIvaHeader !== 'all' ? 'white' : '#475569', border: 'none', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                            title="Filtrar por IVA"
                                        >
                                            <ChevronDown size={12} />
                                        </button>
                                    </div>
                                    {openHeaderDropdown === 'iva' && (
                                        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', zIndex: 100, backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', minWidth: '140px', padding: '0.4rem', fontWeight: 'normal', textTransform: 'none', textAlign: 'left' }}>
                                            <div onClick={() => { setFilterIvaHeader('all'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterIvaHeader === 'all' ? 'bold' : 'normal', backgroundColor: filterIvaHeader === 'all' ? '#F1F5F9' : 'transparent' }}>
                                                <Filter size={13} style={{ color: '#64748B' }} /> Todos los IVA
                                            </div>
                                            <div onClick={() => { setFilterIvaHeader('19'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterIvaHeader === '19' ? 'bold' : 'normal', backgroundColor: filterIvaHeader === '19' ? '#F1F5F9' : 'transparent' }}>
                                                🏷️ IVA 19%
                                            </div>
                                            <div onClick={() => { setFilterIvaHeader('5'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterIvaHeader === '5' ? 'bold' : 'normal', backgroundColor: filterIvaHeader === '5' ? '#F1F5F9' : 'transparent' }}>
                                                🏷️ IVA 5%
                                            </div>
                                            <div onClick={() => { setFilterIvaHeader('0'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterIvaHeader === '0' ? 'bold' : 'normal', backgroundColor: filterIvaHeader === '0' ? '#F1F5F9' : 'transparent' }}>
                                                🌱 Exento 0%
                                            </div>
                                        </div>
                                    )}
                                </th>

                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', textAlign: 'center' }}>Mínimo</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', textAlign: 'center' }}>Configuración</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem' }}>Descripción</th>

                                {/* WEB */}
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', width: '80px', textAlign: 'center', position: 'relative' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                        <span>WEB</span>
                                        <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setOpenHeaderDropdown(openHeaderDropdown === 'web' ? null : 'web'); }}
                                            style={{ background: filterWebHeader !== 'all' ? THEME.colors.primary : '#E2E8F0', color: filterWebHeader !== 'all' ? 'white' : '#475569', border: 'none', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                            title="Filtrar publicación web"
                                        >
                                            <ChevronDown size={12} />
                                        </button>
                                    </div>
                                    {openHeaderDropdown === 'web' && (
                                        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', minWidth: '160px', padding: '0.4rem', fontWeight: 'normal', textTransform: 'none', textAlign: 'left' }}>
                                            <div onClick={() => { setFilterWebHeader('all'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterWebHeader === 'all' ? 'bold' : 'normal', backgroundColor: filterWebHeader === 'all' ? '#F1F5F9' : 'transparent' }}>
                                                <Filter size={13} style={{ color: '#64748B' }} /> Todos
                                            </div>
                                            <div onClick={() => { setFilterWebHeader('web'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterWebHeader === 'web' ? 'bold' : 'normal', backgroundColor: filterWebHeader === 'web' ? '#F1F5F9' : 'transparent' }}>
                                                🌐 En Tienda Web
                                            </div>
                                            <div onClick={() => { setFilterWebHeader('oculto'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterWebHeader === 'oculto' ? 'bold' : 'normal', backgroundColor: filterWebHeader === 'oculto' ? '#F1F5F9' : 'transparent' }}>
                                                🙈 Ocultos
                                            </div>
                                        </div>
                                    )}
                                </th>

                                {/* ESTADO */}
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', width: '120px', position: 'relative' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>ESTADO</span>
                                        <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setOpenHeaderDropdown(openHeaderDropdown === 'status' ? null : 'status'); }}
                                            style={{ background: filterStatusHeader !== 'all' ? THEME.colors.primary : '#E2E8F0', color: filterStatusHeader !== 'all' ? 'white' : '#475569', border: 'none', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                            title="Filtrar por estado"
                                        >
                                            <ChevronDown size={12} />
                                        </button>
                                    </div>
                                    {openHeaderDropdown === 'status' && (
                                        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', minWidth: '150px', padding: '0.4rem', fontWeight: 'normal', textTransform: 'none' }}>
                                            <div onClick={() => { setFilterStatusHeader('all'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterStatusHeader === 'all' ? 'bold' : 'normal', backgroundColor: filterStatusHeader === 'all' ? '#F1F5F9' : 'transparent' }}>
                                                <Filter size={13} style={{ color: '#64748B' }} /> Todos
                                            </div>
                                            <div onClick={() => { setFilterStatusHeader('activo'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterStatusHeader === 'activo' ? 'bold' : 'normal', backgroundColor: filterStatusHeader === 'activo' ? '#F1F5F9' : 'transparent' }}>
                                                ✅ Habilitados
                                            </div>
                                            <div onClick={() => { setFilterStatusHeader('inactivo'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterStatusHeader === 'inactivo' ? 'bold' : 'normal', backgroundColor: filterStatusHeader === 'inactivo' ? '#F1F5F9' : 'transparent' }}>
                                                ❌ Deshabilitados
                                            </div>
                                        </div>
                                    )}
                                </th>

                                {/* DEV REVISIÓN */}
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1rem', width: '130px', position: 'relative' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>DEV (REVISADO)</span>
                                        <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setOpenHeaderDropdown(openHeaderDropdown === 'dev' ? null : 'dev'); }}
                                            style={{ background: filterDevHeader !== 'all' ? '#10B981' : '#E2E8F0', color: filterDevHeader !== 'all' ? 'white' : '#475569', border: 'none', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                            title="Filtrar por revisión Dev"
                                        >
                                            <ChevronDown size={12} />
                                        </button>
                                    </div>
                                    {openHeaderDropdown === 'dev' && (
                                        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', minWidth: '150px', padding: '0.4rem', fontWeight: 'normal', textTransform: 'none' }}>
                                            <div onClick={() => { setFilterDevHeader('all'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterDevHeader === 'all' ? 'bold' : 'normal', backgroundColor: filterDevHeader === 'all' ? '#F1F5F9' : 'transparent' }}>
                                                <Filter size={13} style={{ color: '#64748B' }} /> Todos
                                            </div>
                                            <div onClick={() => { setFilterDevHeader('revisado'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterDevHeader === 'revisado' ? 'bold' : 'normal', backgroundColor: filterDevHeader === 'revisado' ? '#F1F5F9' : 'transparent' }}>
                                                🔍 Revisados
                                            </div>
                                            <div onClick={() => { setFilterDevHeader('pendiente'); setOpenHeaderDropdown(null); }} style={{ padding: '0.45rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: filterDevHeader === 'pendiente' ? 'bold' : 'normal', backgroundColor: filterDevHeader === 'pendiente' ? '#F1F5F9' : 'transparent' }}>
                                                ⏳ Pendientes
                                            </div>
                                        </div>
                                    )}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={12} style={{ textAlign: 'center', padding: '3rem', color: THEME.colors.textSecondary, fontSize: '0.9rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                            <RefreshCw size={16} className="animate-spin" strokeWidth={1.5} /> Cargando maestros...
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedProducts.map(p => (
                                <tr key={p.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, height: '80px', transition: 'background-color 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '0.5rem 1rem' }}>
                                        <label 
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ 
                                                width: '46px', 
                                                height: '46px', 
                                                backgroundColor: '#F3F4F6', 
                                                borderRadius: THEME.radius.sm, 
                                                overflow: 'hidden', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center', 
                                                border: `1px solid ${THEME.colors.border}`,
                                                cursor: canEdit ? 'pointer' : 'not-allowed',
                                                position: 'relative',
                                                transition: 'all 0.2s',
                                                opacity: savingId === p.id ? 0.5 : 1
                                            }}
                                            onMouseEnter={(e) => { if (canEdit) e.currentTarget.style.borderColor = THEME.colors.primary; }}
                                            onMouseLeave={(e) => { if (canEdit) e.currentTarget.style.borderColor = THEME.colors.border; }}
                                            title={canEdit ? "Cambiar foto del maestro" : "Modo Vista"}
                                        >
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                style={{ display: 'none' }} 
                                                disabled={!canEdit}
                                                onChange={(e) => {
                                                    if (e.target.files?.[0]) {
                                                        handleMainImageUpload(p.id, e.target.files[0]);
                                                    }
                                                }}
                                            />
                                            {p.image_url ? (
                                                <Image 
                                                    src={p.image_url} 
                                                    alt={p.name} 
                                                    width={46} 
                                                    height={46} 
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    sizes="46px"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <ImageOff size={16} style={{ opacity: 0.4 }} strokeWidth={1.5} />
                                            )}
                                            {savingId === p.id && (
                                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <RefreshCw size={12} className="animate-spin" strokeWidth={1.5} />
                                                </div>
                                            )}
                                        </label>
                                    </td>
                                    <td 
                                        style={{ padding: '0.75rem 1rem', cursor: 'pointer' }}
                                        onClick={() => setSelectedEditProduct(p)}
                                        title="Abrir panel de edición maestro"
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ 
                                                    fontWeight: '800', 
                                                    color: THEME.colors.primary, 
                                                    fontSize: '0.85rem',
                                                    display: 'block'
                                                }}>
                                                    ID: {p.accounting_id ? formatNumber(p.accounting_id) : 'S/N'}
                                                </span>
                                                <Edit3 size={10} style={{ opacity: 0.5 }} strokeWidth={1.5} />
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {p.sku && (
                                                    <span style={{ 
                                                        fontSize: '0.65rem', 
                                                        fontWeight: '600', 
                                                        color: THEME.colors.textSecondary,
                                                        backgroundColor: '#F1F5F9',
                                                        padding: '1px 4px',
                                                        borderRadius: '4px'
                                                    }}>
                                                        SKU: {p.sku}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <div style={{ fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.85rem' }}>{p.name}</div>
                                    </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                                                <span style={{ 
                                                    padding: '0.2rem 0.5rem', 
                                                    borderRadius: '4px', 
                                                    backgroundColor: '#F1F5F9', 
                                                    fontSize: '0.75rem', 
                                                    fontWeight: '600', 
                                                    color: THEME.colors.textMain,
                                                    border: `1px solid ${THEME.colors.border}`,
                                                    display: 'inline-block',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {CATEGORY_MAP[p.category] || p.category}
                                                </span>
                                                
                                                {/* Cápsula de Jerarquía en Categoría */}
                                                {p.parent_id && (
                                                    <div style={{
                                                        fontSize: '0.6rem',
                                                        fontWeight: '700',
                                                        padding: '1px 4px',
                                                        borderRadius: '3px',
                                                        backgroundColor: p.parent_id === p.id ? '#4F46E5' : THEME.colors.primary,
                                                        color: 'white',
                                                        display: 'inline-flex',
                                                        minWidth: '14px',
                                                        justifyContent: 'center',
                                                        lineHeight: '1.2',
                                                        marginTop: '2px'
                                                    }}>
                                                        {p.parent_id === p.id ? 'P' : 'H'}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <div style={{ 
                                            backgroundColor: '#F8FAFC', 
                                            padding: '6px 10px', 
                                            borderRadius: THEME.radius.sm, 
                                            border: `1px solid ${THEME.colors.border}`,
                                            fontSize: '0.75rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '3px',
                                            minWidth: '160px'
                                        }}>
                                            <div style={{ fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <User size={10} strokeWidth={1.5} /> {p.buying_team || 'Sin asignar'}
                                            </div>
                                            <div style={{ fontWeight: '500', color: THEME.colors.textSecondary, borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '3px', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Wrench size={10} strokeWidth={1.5} /> {p.procurement_method || 'General'}
                                            </div>
                                            {p.inventory_group && (
                                                <div style={{ fontSize: '0.6rem', color: '#2563EB', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <BarChart2 size={10} strokeWidth={1.5} /> {p.inventory_group}
                                                </div>
                                            )}
                                            {p.purchase_sublist && (
                                                <div style={{ fontSize: '0.6rem', color: THEME.colors.primary, fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <FileText size={10} strokeWidth={1.5} /> {p.purchase_sublist}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                        <span style={{ 
                                            backgroundColor: '#F1F5F9', 
                                            padding: '2px 6px', 
                                            borderRadius: '4px', 
                                            fontSize: '0.75rem', 
                                            fontWeight: '600', 
                                            color: THEME.colors.textMain,
                                            border: `1px solid ${THEME.colors.border}`,
                                            display: 'inline-block'
                                        }}>
                                            {p.unit_of_measure}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
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
                                                    borderRadius: '4px',
                                                    padding: '2px 6px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '700',
                                                    minWidth: '40px'
                                                }}>
                                                    {formatNumber(rate)}%
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td style={{ 
                                        padding: '0.75rem 1rem', 
                                        textAlign: 'center',
                                        backgroundColor: p.min_inventory_level > 0 ? '#FEF2F2' : 'transparent',
                                        borderLeft: p.min_inventory_level > 0 ? '3px solid #EF4444' : 'none',
                                        transition: 'all 0.2s'
                                    }}>
                                        {p.min_inventory_level > 0 ? (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                <div style={{ 
                                                    backgroundColor: '#FEE2E2',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    border: '1px solid #FCA5A5',
                                                    display: 'flex',
                                                    alignItems: 'baseline',
                                                    gap: '1px'
                                                }}>
                                                    <span style={{ 
                                                        fontWeight: '700', 
                                                        color: '#B91C1C', 
                                                        fontSize: '0.8rem'
                                                    }}>
                                                        {formatNumber(p.min_inventory_level)} 
                                                    </span>
                                                    <span style={{ fontSize: '0.65rem', color: '#B91C1C', fontWeight: '600' }}>{p.unit_of_measure}</span>
                                                </div>
                                                <span title="Política activa crítica" style={{ display: 'flex', alignItems: 'center' }}>
                                                    <AlertTriangle size={12} strokeWidth={1.5} className="text-red-500" />
                                                </span>
                                            </div>
                                        ) : (
                                            <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: '500', opacity: 0.6 }}>—</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                                            <button 
                                                onClick={() => setConversionProduct(p)}
                                                style={{ 
                                                    fontSize: '0.65rem', 
                                                    color: THEME.colors.primary, 
                                                    background: THEME.colors.primaryLight, 
                                                    border: `1px solid ${THEME.colors.border}`, 
                                                    borderRadius: '4px', 
                                                    cursor: 'pointer', 
                                                    padding: '2px 6px',
                                                    fontWeight: '600',
                                                    whiteSpace: 'nowrap',
                                                    width: 'fit-content',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }}
                                            >
                                                <Scale size={10} strokeWidth={1.5} /> Equivalencias
                                            </button>
                                            <div style={{ 
                                                fontSize: '0.65rem', 
                                                color: '#7C3AED', 
                                                background: '#F5F3FF', 
                                                border: '1px solid #DDD6FE', 
                                                borderRadius: '4px', 
                                                padding: '2px 6px',
                                                fontWeight: '600',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '3px',
                                                whiteSpace: 'nowrap',
                                                width: 'fit-content',
                                                opacity: (p.variants?.length || 0) > 0 ? 1 : 0.4
                                            }}>
                                                <Dna size={10} strokeWidth={1.5} /> {formatNumber(p.variants?.length || 0)} Var.
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', width: '250px' }}>
                                        <div 
                                            onClick={() => setExpandedDescriptions(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                                            style={{ 
                                                fontSize: '0.75rem', 
                                                color: THEME.colors.textSecondary, 
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '2px'
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
                                                    color: THEME.colors.primary, 
                                                    fontSize: '0.65rem', 
                                                    fontWeight: '600', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '2px',
                                                    marginTop: '2px'
                                                }}>
                                                    {expandedDescriptions[p.id] ? (
                                                        <><ChevronUp size={10} strokeWidth={1.5} /> Ver menos</>
                                                    ) : (
                                                        <><ChevronDown size={10} strokeWidth={1.5} /> Ver más</>
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                        <div 
                                            onClick={() => canEdit && updateProductField(p.id, 'show_on_web', !p.show_on_web)}
                                            title={!canEdit ? "Modo Vista" : (p.show_on_web ? 'Visible en tienda (Click para ocultar)' : 'Oculto en tienda (Click para mostrar)')}
                                            style={{ 
                                                display: 'flex',
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                opacity: p.show_on_web ? 1 : 0.3,
                                                color: p.show_on_web ? THEME.colors.primary : THEME.colors.textSecondary,
                                                cursor: canEdit ? 'pointer' : 'not-allowed',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {p.show_on_web ? <Globe size={18} strokeWidth={1.5} /> : <EyeOff size={18} strokeWidth={1.5} />}
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <div 
                                            onClick={() => canEdit && updateProductField(p.id, 'is_active', !p.is_active)}
                                            style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                gap: '4px', 
                                                background: p.is_active ? '#ECFDF5' : '#FEF2F2',
                                                border: `1px solid ${p.is_active ? '#A7F3D0' : '#FECACA'}`,
                                                padding: '4px 8px',
                                                borderRadius: '20px',
                                                width: '100%',
                                                cursor: canEdit ? 'pointer' : 'not-allowed',
                                                transition: 'all 0.2s'
                                            }}
                                            title={canEdit ? "Click para cambiar estado" : "Modo Vista"}
                                        >
                                            <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: p.is_active ? '#10B981' : '#EF4444' }}></div>
                                            <span style={{ fontSize: '0.65rem', fontWeight: '700', color: p.is_active ? '#065F46' : '#991B1B' }}>
                                                {p.is_active ? 'ON' : 'OFF'}
                                            </span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        {(() => {
                                            const isVerified = p.is_verified_dev || (p.tags && p.tags.includes('verified_dev'));
                                            return (
                                                <div 
                                                    onClick={() => canEdit && toggleDevVerified(p)}
                                                    style={{ 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: '4px', 
                                                        background: isVerified ? '#ECFDF5' : '#FFFBEB',
                                                        border: `1px solid ${isVerified ? '#A7F3D0' : '#FDE68A'}`,
                                                        padding: '4px 8px',
                                                        borderRadius: '20px',
                                                        width: '100%',
                                                        cursor: canEdit ? 'pointer' : 'not-allowed',
                                                        transition: 'all 0.2s',
                                                        boxShadow: isVerified ? '0 1px 2px rgba(16, 185, 129, 0.15)' : 'none'
                                                    }}
                                                    title={canEdit ? (isVerified ? "Dev: SKU Revisado (Click para marcar pendiente)" : "Dev: Pendiente (Click para marcar revisado)") : "Modo Vista"}
                                                >
                                                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: isVerified ? '#10B981' : '#F59E0B' }}></div>
                                                    <span style={{ fontSize: '0.65rem', fontWeight: '700', color: isVerified ? '#065F46' : '#92400E', whiteSpace: 'nowrap' }}>
                                                        {isVerified ? '🔍 REVISADO' : '⏳ PENDIENTE'}
                                                    </span>
                                                </div>
                                            );
                                        })()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* PAGINACIÓN FOOTER */}
                {!loading && totalPages > 1 && (
                    <div style={{ 
                        marginTop: '1.5rem', 
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center', 
                        gap: '1rem',
                        padding: '1rem',
                        backgroundColor: THEME.colors.surface,
                        borderRadius: THEME.radius.lg,
                        boxShadow: THEME.shadow.sm,
                        border: `1px solid ${THEME.colors.border}`
                    }}>
                        <button 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            style={{ 
                                padding: '0.4rem 0.8rem', 
                                borderRadius: THEME.radius.sm, 
                                border: `1px solid ${THEME.colors.border}`, 
                                backgroundColor: currentPage === 1 ? '#F1F5F9' : 'white', 
                                color: currentPage === 1 ? THEME.colors.textSecondary : THEME.colors.textMain,
                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer', 
                                fontWeight: '600',
                                fontSize: '0.8rem',
                                transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => { if (currentPage !== 1) e.currentTarget.style.borderColor = THEME.colors.borderActive; }}
                            onMouseLeave={e => { if (currentPage !== 1) e.currentTarget.style.borderColor = THEME.colors.border; }}
                        >
                            Anterior
                        </button>
                        
                        <div style={{ fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.8rem' }}>
                            Página {formatNumber(currentPage)} de {formatNumber(totalPages)} 
                            <span style={{ fontWeight: '400', color: THEME.colors.textSecondary, marginLeft: '6px' }}>
                                (Mostrando {formatNumber(paginatedProducts.length)} de {formatNumber(filteredProducts.length)} productos)
                            </span>
                        </div>

                        <button 
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            style={{ 
                                padding: '0.4rem 0.8rem', 
                                borderRadius: THEME.radius.sm, 
                                border: `1px solid ${THEME.colors.border}`, 
                                backgroundColor: currentPage === totalPages ? '#F1F5F9' : 'white', 
                                color: currentPage === totalPages ? THEME.colors.textSecondary : THEME.colors.textMain,
                                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', 
                                fontWeight: '600',
                                fontSize: '0.8rem',
                                transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => { if (currentPage !== totalPages) e.currentTarget.style.borderColor = THEME.colors.borderActive; }}
                            onMouseLeave={e => { if (currentPage !== totalPages) e.currentTarget.style.borderColor = THEME.colors.border; }}
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


            {selectedEditProduct && (
                <EditProductModal 
                    product={selectedEditProduct} 
                    allProducts={products}
                    onClose={() => setSelectedEditProduct(null)} 
                    onSave={() => fetchProducts()}
                    readOnly={!canEdit}
                />
            )}

            {/* MODAL DE GESTIÓN DE CONVERSIONES */}
            {conversionProduct && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: THEME.colors.surface, padding: '1.5rem', borderRadius: THEME.radius.lg, width: '90%', maxWidth: '550px', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.lg }}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Scale size={18} strokeWidth={1.5} /> Unidades y Logística
                                </h2>
                                <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary }}>{conversionProduct.name}</span>
                            </div>
                            <button onClick={() => setConversionProduct(null)} style={{ border: 'none', background: 'none', fontSize: '1.25rem', cursor: 'pointer', color: THEME.colors.textSecondary }}>✕</button>
                        </header>

                        {!canEdit && (
                            <div style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                                border: '1px solid rgba(245, 158, 11, 0.2)',
                                color: '#D97706',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                marginBottom: '1rem'
                            }}>
                                <ShieldAlert size={14} />
                                <span>Modo Vista: No tienes permisos para modificar unidades.</span>
                            </div>
                        )}

                        <div style={{ marginBottom: '1rem' }}>
                            {/* SECCIÓN DE UNIDAD BASE (LA RAÍZ) */}
                            <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: THEME.radius.md, marginBottom: '1.25rem', border: `1px solid ${THEME.colors.border}` }}>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unidad de Inventario (Base)</label>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <div style={{ 
                                        padding: '0.5rem 1.25rem', 
                                        backgroundColor: THEME.colors.primaryLight, 
                                        border: `1px solid ${THEME.colors.border}`, 
                                        borderRadius: THEME.radius.sm, 
                                        fontSize: '0.9rem', 
                                        fontWeight: '700', 
                                        color: THEME.colors.primary,
                                        minWidth: '100px',
                                        textAlign: 'center'
                                    }}>
                                        {conversionProduct.unit_of_measure}
                                    </div>
                                    <div style={{ flex: 1, fontSize: '0.75rem', color: THEME.colors.textSecondary, lineHeight: '1.35' }}>
                                        <Info size={13} strokeWidth={1.5} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                                        Unidad base definida para el control de inventario de este SKU. Para modificarla, dirígete a la sección de edición del SKU.
                                    </div>
                                </div>
                            </div>

                            <div style={{ backgroundColor: '#FFFFFF', borderRadius: THEME.radius.md, padding: '0px', marginBottom: '1.25rem' }}>
                                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '700' }}>Equivalencias de Compra</h4>
                                {conversions.filter(c => c.product_id === conversionProduct.id).length === 0 ? (
                                    <div style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, textAlign: 'center', padding: '0.75rem', border: `1px dashed ${THEME.colors.border}`, borderRadius: THEME.radius.sm }}>
                                        Solo se opera en {conversionProduct.unit_of_measure}.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {conversions.filter(c => c.product_id === conversionProduct.id).map(c => {
                                            return (
                                                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: '0.6rem 0.8rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}` }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                                                        <span style={{ fontWeight: '600', color: THEME.colors.textMain }}>1 {c.from_unit}</span>
                                                        <span style={{ color: THEME.colors.textSecondary }}>=</span>
                                                        <span style={{ fontWeight: '600', color: THEME.colors.primary }}>{formatNumber(c.conversion_factor, 2)} {conversionProduct.unit_of_measure}</span>
                                                        <span 
                                                            onClick={() => {
                                                                const inverted = formatNumber(1 / c.conversion_factor, 2);
                                                                showToast(`También se lee como: 1 ${conversionProduct.unit_of_measure} = ${inverted} ${c.from_unit}`, 'info');
                                                            }}
                                                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', color: THEME.colors.textSecondary }}
                                                            title="Ver equivalente"
                                                        >
                                                            <ArrowUpDown size={12} strokeWidth={1.5} />
                                                        </span>
                                                    </div>
                                                    {canEdit ? (
                                                        <button 
                                                            onClick={() => deleteConversion(c.id)} 
                                                            style={{ color: '#EF4444', background: '#FEF2F2', border: `1px solid #FECACA`, padding: '2px 6px', borderRadius: '4px', fontWeight: '600', cursor: 'pointer', fontSize: '0.7rem', transition: 'all 0.15s' }}
                                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                                                        >
                                                            Eliminar
                                                        </button>
                                                    ) : (
                                                        <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>Modo Vista</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div style={{ borderTop: `1px dashed ${THEME.colors.border}`, paddingTop: '1rem', ...(!canEdit ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}>
                                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: THEME.colors.textMain, textAlign: 'center', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                    <Plus size={12} strokeWidth={1.5} /> DEFINIR NUEVA RELACIÓN
                                </h4>
                                
                                <div style={{ 
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    gap: '6px', 
                                    backgroundColor: THEME.colors.primaryLight, 
                                    padding: '1rem', 
                                    borderRadius: THEME.radius.md,
                                    border: `1px solid ${THEME.colors.border}`
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ flex: 1 }}>
                                            <input id="raw-qty-1" type="number" defaultValue="1" style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: `1px solid ${THEME.colors.border}`, fontWeight: '600', textAlign: 'center', fontSize: '0.85rem' }} />
                                        </div>
                                        <div style={{ flex: 2 }}>
                                            <select id="raw-unit-1" style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: `1px solid ${THEME.colors.border}`, fontWeight: '600', backgroundColor: 'white', fontSize: '0.85rem' }}>
                                                <option value="">Selecciona unidad</option>
                                                {dynamicUnits.map(u => (
                                                    <option key={u} value={u}>{u}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ textAlign: 'center', color: THEME.colors.primary, fontWeight: '700', fontSize: '0.75rem' }}>EQUIVALE A</div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ flex: 1 }}>
                                            <input id="raw-qty-2" type="number" placeholder="Ej: 50" style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: `1px solid ${THEME.colors.border}`, fontWeight: '600', textAlign: 'center', fontSize: '0.85rem' }} />
                                        </div>
                                        <div style={{ flex: 2 }}>
                                            <div style={{ width: '100%', padding: '0.4rem', backgroundColor: '#FFFFFF', border: `1px solid ${THEME.colors.border}`, borderRadius: '4px', fontWeight: '700', textAlign: 'center', color: THEME.colors.primary, fontSize: '0.85rem' }}>
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
                                        
                                        if (!unit1) {
                                            showToast('Por favor, selecciona una unidad de origen.', 'info');
                                            return;
                                        }
                                        if (isNaN(qty1) || qty1 <= 0 || isNaN(qty2) || qty2 <= 0) {
                                            showToast('Las cantidades deben ser valores válidos mayores a cero.', 'info');
                                            return;
                                        }

                                        const factor = qty2 / qty1;
                                        addConversion(conversionProduct.id, unit1, conversionProduct.unit_of_measure, factor);
                                        
                                        (document.getElementById('raw-qty-1') as HTMLInputElement).value = '1';
                                        (document.getElementById('raw-unit-1') as HTMLInputElement).value = '';
                                        (document.getElementById('raw-qty-2') as HTMLInputElement).value = '';
                                    }}
                                    style={{ 
                                        width: '100%',
                                        padding: '0.6rem', 
                                        backgroundColor: THEME.colors.primary, 
                                        color: 'white', 
                                        border: 'none', 
                                        borderRadius: THEME.radius.sm, 
                                        fontWeight: '700', 
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        marginTop: '0.75rem',
                                        transition: 'all 0.15s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
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
                    <div style={{ backgroundColor: THEME.colors.surface, padding: 0, borderRadius: THEME.radius.lg, width: '90%', maxWidth: '500px', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.lg, overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, padding: '6px', borderRadius: THEME.radius.sm }}>
                                    <FileUp size={16} strokeWidth={1.5} />
                                </div>
                                <h2 style={{ fontSize: '0.95rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0 }}>Cargue Masivo (Productos)</h2>
                            </div>
                            <button onClick={() => setIsBulkModalOpen(false)} style={{ background: 'none', border: 'none', color: THEME.colors.textSecondary, cursor: 'pointer', fontSize: '1.25rem', fontWeight: '300' }}>✕</button>
                        </div>

                        <div style={{ padding: '1.5rem' }}>
                            <p style={{ color: THEME.colors.textSecondary, fontSize: '0.8rem', textAlign: 'center', marginBottom: '1rem', lineHeight: '1.4' }}>
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
                                    border: dragging ? `2px solid ${THEME.colors.primary}` : `2px dashed ${THEME.colors.border}`,
                                    backgroundColor: dragging ? THEME.colors.primaryLight : '#F8FAFC',
                                    borderRadius: THEME.radius.md,
                                    height: '180px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.75rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    position: 'relative'
                                }}
                                onClick={() => document.getElementById('bulk-file-input')?.click()}
                            >
                                <input id="bulk-file-input" type="file" hidden accept=".xlsx,.xls,.csv" onChange={handleFileSelect} />
                                
                                <div style={{ 
                                    backgroundColor: 'white', 
                                    padding: '8px', 
                                    borderRadius: '50%', 
                                    border: `1px solid ${THEME.colors.border}`,
                                    color: selectedFile ? '#10B981' : THEME.colors.textSecondary
                                }}>
                                    {selectedFile ? (
                                        <CheckCircle size={24} strokeWidth={1.5} />
                                    ) : (
                                        <FileUp size={24} strokeWidth={1.5} />
                                    )}
                                </div>
                                <div style={{ textAlign: 'center', padding: '0 1rem' }}>
                                    <div style={{ fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.85rem' }}>
                                        {selectedFile ? selectedFile.name : 'Haz clic para seleccionar o arrastra un archivo'}
                                    </div>
                                    {!selectedFile && <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>Archivos .xlsx o .xls oficiales de Excel</div>}
                                </div>
                            </div>

                            {/* Opción de Purga */}
                            <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#FEF2F2', borderRadius: THEME.radius.sm, border: '1px solid #FEE2E2', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input 
                                    type="checkbox" 
                                    id="wipe-data" 
                                    checked={wipeExistingData} 
                                    onChange={(e) => setWipeExistingData(e.target.checked)}
                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                />
                                <label htmlFor="wipe-data" style={{ fontSize: '0.75rem', color: '#B91C1C', fontWeight: '600', cursor: 'pointer' }}>
                                    Borrar todos los productos existentes antes de cargar (Limpieza total)
                                </label>
                            </div>

                            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <button 
                                    disabled={!selectedFile || loading}
                                    onClick={processFile}
                                    style={{ 
                                        width: '100%', 
                                        padding: '0.6rem', 
                                        backgroundColor: selectedFile ? THEME.colors.primary : '#A7F3D0', 
                                        color: 'white', 
                                        border: 'none', 
                                        borderRadius: THEME.radius.sm, 
                                        fontWeight: '700', 
                                        cursor: selectedFile ? 'pointer' : 'not-allowed',
                                        fontSize: '0.85rem',
                                        transition: 'all 0.15s'
                                    }}
                                    onMouseEnter={e => { if (selectedFile) e.currentTarget.style.backgroundColor = THEME.colors.primaryHover; }}
                                    onMouseLeave={e => { if (selectedFile) e.currentTarget.style.backgroundColor = THEME.colors.primary; }}
                                >
                                    {loading ? 'Procesando...' : 'Procesar Excel'}
                                </button>
                                
                                <button 
                                    onClick={downloadTemplate}
                                    style={{ 
                                        width: '100%', 
                                        padding: '0.6rem', 
                                        backgroundColor: '#F1F5F9', 
                                        color: THEME.colors.textMain, 
                                        border: `1px solid ${THEME.colors.border}`, 
                                        borderRadius: THEME.radius.sm, 
                                        fontWeight: '600', 
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        transition: 'all 0.15s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#E2E8F0'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                >
                                    <FileDown size={14} strokeWidth={1.5} />
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
