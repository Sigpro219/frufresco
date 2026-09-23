'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { supabase, Product } from '@/lib/supabase';
import { diagnoseStorageError, diagnoseDatabaseError } from '@/lib/errorUtils';
import { 
    Lock, Unlock, Wand2, Sparkles, Loader2, ShieldAlert, ShieldCheck, Tag, Leaf, Flame, Zap, Check, Plus, 
    HelpCircle, Info, Scale, Package, Truck, X, BookOpen, ChefHat, Soup, 
    UtensilsCrossed, Wheat, Drumstick, GitFork, Edit3, Search, Sliders, Settings, 
    Camera, CheckCircle2, Clock, Layers, RefreshCw, Trash2, EyeOff, Globe, 
    ShoppingCart, FileEdit, AlertTriangle, ArrowRight, ArrowLeft, ChevronRight, Store
} from 'lucide-react';
import { triggerProductRevalidation } from '@/lib/revalidate';
import { optimizeImageForUpload } from '@/lib/imageOptimizer';
import { normalizeCatalogSpelling, getSpellingSuggestion, hasSpellingSuggestion } from '@/lib/spellingNormalizer';

const TYPICAL_RECIPES = [
    { id: 'ajiaco', label: 'Ajiaco', Icon: Soup },
    { id: 'sancocho', label: 'Sancocho', Icon: Flame },
    { id: 'bandeja paisa', label: 'Bandeja Paisa', Icon: UtensilsCrossed },
    { id: 'mondongo', label: 'Mondongo', Icon: Soup },
    { id: 'mute', label: 'Mute', Icon: Wheat },
    { id: 'tamal', label: 'Tamal', Icon: Sparkles },
    { id: 'arroz con pollo', label: 'Arroz con Pollo', Icon: Drumstick },
];

interface EditProductModalProps {
    product: Product;
    allProducts: Product[];
    onClose: () => void;
    onSave: () => void;
    readOnly?: boolean;
    onSelectProduct?: (product: Product) => void;
}

const extractWeight = (val: string): number | null => {
    if (!val) return null;
    if (val.includes('|')) {
        const grams = parseFloat(val.split('|')[1]);
        if (!isNaN(grams) && grams > 0) return grams;
    }
    const clean = val.toLowerCase();
    const kgMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilos)/);
    if (kgMatch) {
        const num = parseFloat(kgMatch[1]);
        if (!isNaN(num) && num > 0) return num * 1000;
    }
    const gMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:g|gr|grs|gramos|grams|gramo|gram)/);
    if (gMatch) {
        const num = parseFloat(gMatch[1]);
        if (!isNaN(num) && num > 0) return num;
    }
    return null;
};

const sortSuggestedValues = (values: string[]): string[] => {
    return values.slice().sort((a, b) => {
        const weightA = extractWeight(a);
        const weightB = extractWeight(b);
        if (weightA !== null && weightB !== null) {
            if (weightA !== weightB) return weightA - weightB;
        }
        if (weightA !== null && weightB === null) return -1;
        if (weightA === null && weightB !== null) return 1;
        const cleanA = a.includes('|') ? a.split('|')[0] : a;
        const cleanB = b.includes('|') ? b.split('|')[0] : b;
        return cleanA.localeCompare(cleanB, 'es', { numeric: true, sensitivity: 'base' });
    });
};

type CommercialTypology = 'bimodal' | 'monounidad' | 'empaque' | 'granel';

// ==========================================
// MODAL GUÍA DE ESTRATEGIA E-COMMERCE
// ==========================================
function EcommerceGuideModal({ onClose }: { onClose: () => void }) {
    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                zIndex: 10005,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.5rem'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: 'white',
                    borderRadius: '24px',
                    maxWidth: '820px',
                    width: '100%',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3)',
                    border: '1px solid #E2E8F0',
                    animation: 'modalSlideUp 0.2s ease-out'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '1.5rem 2rem',
                    borderBottom: '1px solid #E5E7EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F8FAFC'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            backgroundColor: '#FEF3C7',
                            padding: '10px',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#D97706'
                        }}>
                            <Sparkles size={24} strokeWidth={2.2} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '900', color: '#111827' }}>
                                Guía de Estrategia E-Commerce (Web Hogar)
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#6B7280' }}>
                                ¿Cómo operan las unidades de venta para clientes finales sin afectar Corabastos?
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            border: 'none',
                            backgroundColor: '#F3F4F6',
                            padding: '8px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            color: '#6B7280',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    {/* 4 Categorías Comerciales */}
                    <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: '900', color: '#1E293B', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Store size={18} color="#2563EB" /> 1. Las 4 Tipologías de Venta en la Tienda Online
                        </h4>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            {/* Card Bimodal */}
                            <div style={{ padding: '1rem', backgroundColor: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <Tag size={18} color="#DC2626" />
                                    <strong style={{ color: '#991B1B', fontSize: '0.92rem' }}>Pieza Calibrada &lt; 500g (Bimodal)</strong>
                                </div>
                                <p style={{ fontSize: '0.78rem', color: '#7F1D1D', margin: 0, lineHeight: '1.45' }}>
                                    <strong>Ejemplos:</strong> Tomate chonto, Tomate larga vida, Aguacate Hass, Pimentón, Pepino.<br />
                                    <strong>Comportamiento Web:</strong> El cliente puede comprar por <strong>Libra (500g)</strong> O por <strong>Unidad física (ej: 350g)</strong>. Ambos botones aparecen en la vitrina.
                                </p>
                            </div>

                            {/* Card Monounidad */}
                            <div style={{ padding: '1rem', backgroundColor: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <ShieldCheck size={18} color="#059669" />
                                    <strong style={{ color: '#065F46', fontSize: '0.92rem' }}>Pieza Grande &ge; 500g (Monounidad)</strong>
                                </div>
                                <p style={{ fontSize: '0.78rem', color: '#064E3B', margin: 0, lineHeight: '1.45' }}>
                                    <strong>Ejemplos:</strong> Melón, Patilla, Piña, Papaya, Ahuyama entera, Coliflor.<br />
                                    <strong>Regla Poka-Yoke:</strong> <strong>La Libra está PROHIBIDA.</strong> Se vende únicamente la fruta completa con su peso estimado (ej. Melón ±2kg, Patilla ±7kg) para evitar fraccionar en bodega.
                                </p>
                            </div>

                            {/* Card Empaque */}
                            <div style={{ padding: '1rem', backgroundColor: '#EFF6FF', border: '1.5px solid #BFDBFE', borderRadius: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <Package size={18} color="#2563EB" />
                                    <strong style={{ color: '#1E40AF', fontSize: '0.92rem' }}>Empaque Cerrado / Bandeja</strong>
                                </div>
                                <p style={{ fontSize: '0.78rem', color: '#1E3A8A', margin: 0, lineHeight: '1.45' }}>
                                    <strong>Ejemplos:</strong> Arándanos, Frambuesas, Champiñones, Huevos, Alfalfa.<br />
                                    <strong>Comportamiento Web:</strong> Se vende exclusivamente por su empaque cerrado (Bandeja 125g, Cubeta 30 und). Bloquea venta por libra o a granel.
                                </p>
                            </div>

                            {/* Card Granel */}
                            <div style={{ padding: '1rem', backgroundColor: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <Scale size={18} color="#D97706" />
                                    <strong style={{ color: '#B45309', fontSize: '0.92rem' }}>Granel Continuo Puro</strong>
                                </div>
                                <p style={{ fontSize: '0.78rem', color: '#78350F', margin: 0, lineHeight: '1.45' }}>
                                    <strong>Ejemplos:</strong> Papas, Arvejas desgranadas, Habichuelas, Uvas, Despensa.<br />
                                    <strong>Comportamiento Web:</strong> Venta estándar por Libra (500g) o por Kilo.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Caso Práctico: Cambio de Estrategia Gerencial (La Calabaza) */}
                    <div style={{ padding: '1.2rem', backgroundColor: '#F8FAFC', border: '1.5px solid #CBD5E1', borderRadius: '14px' }}>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: '900', color: '#0F172A', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ChefHat size={18} color="#4F46E5" /> 2. Flexibilidad Comercial: ¿Qué pasa si la estrategia cambia? (Ej: Calabaza partida)
                        </h4>
                        <p style={{ fontSize: '0.82rem', color: '#334155', margin: 0, lineHeight: '1.5' }}>
                            El sistema <strong>nunca es una camisa de fuerza</strong>. Si la gerencia decide que a partir de hoy en bodega se van a tajar las calabazas/ahuyamas para venderlas en porciones de libra con papel vinipel:
                            <br />
                            • <strong>Opción Rápida:</strong> El operador abre el SKU de la Calabaza y simplemente cambia la tipología de <em>Pieza Grande</em> a <strong>Granel / Porción (Libra 500g)</strong> o <strong>Bimodal</strong>. La web habilitará la libra inmediatamente sin tocar la base de datos.
                            <br />
                            • <strong>Opción Retail Pro:</strong> Mantener la Calabaza Entera como SKU Padre y crear el SKU Hijo fraccionado (Calabaza Tajada) vinculado en la pestaña de jerarquía.
                        </p>
                    </div>

                    {/* Aislamiento Total con Canales B2B */}
                    <div style={{ padding: '1.2rem', backgroundColor: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: '14px' }}>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: '900', color: '#065F46', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ShieldAlert size={18} color="#059669" /> 3. Aislamiento Total: Corabastos y Restaurantes Intactos
                        </h4>
                        <p style={{ fontSize: '0.82rem', color: '#064E3B', margin: 0, lineHeight: '1.5' }}>
                            Esta configuración comercial aplica <strong>exclusivamente para la tienda pública B2C (www.frufresco.com)</strong>.
                            Las compras en Corabastos, la planeación de abastecimiento, los pedidos institucionales de restaurantes (B2B) y las cotizaciones continúan operando y consolidando en <strong>Kilogramos continuos</strong> de manera 100% independiente.
                        </p>
                    </div>

                    {/* Soporte Multicalibre */}
                    <div style={{ padding: '1.2rem', backgroundColor: '#FFF7ED', border: '1.5px solid #FED7AA', borderRadius: '14px' }}>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: '900', color: '#9A3412', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Tag size={18} color="#EA580C" /> 4. Soporte Multicalibre (2 Calibres o Tamaños)
                        </h4>
                        <p style={{ fontSize: '0.82rem', color: '#7C2D12', margin: 0, lineHeight: '1.5' }}>
                            ¿Tienes productos con dos tamaños comerciales (ej: Patilla de 7 kg y 10 kg, o Mango Tommy de 200g y 550g)? 
                            El sistema permite calibrar ambos pesos simultáneamente. La tienda web presentará ambas opciones con cálculo matemático exacto de precio, sin romper el Poka-Yoke ni alterar los inventarios del ERP.
                        </p>
                    </div>

                </div>

                {/* Footer */}
                <div style={{
                    padding: '1.2rem 2rem',
                    borderTop: '1px solid #E5E7EB',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    backgroundColor: '#F8FAFC'
                }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '0.65rem 1.8rem',
                            backgroundColor: '#111827',
                            color: 'white',
                            borderRadius: '10px',
                            fontWeight: '800',
                            fontSize: '0.85rem',
                            border: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        Entendido / Cerrar Guía
                    </button>
                </div>
            </div>
        </div>
    );
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function EditProductModal({ product, allProducts, onClose, onSave, readOnly = false, onSelectProduct }: EditProductModalProps) {
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showUnitGuideModal, setShowUnitGuideModal] = useState(false);
    const [showEcommerceGuideModal, setShowEcommerceGuideModal] = useState(false);
    
    // FLUJO DE REVISIÓN ERGONÓMICO (TABS)
    const [activeTab, setActiveTab] = useState<'tecnica' | 'jerarquia' | 'ecommerce' | 'variantes'>('tecnica');

    const initialWeight = () => {
        const u = (product.unit_of_measure || '').toLowerCase();
        if (product.weight_kg !== undefined && product.weight_kg !== null && !isNaN(Number(product.weight_kg))) {
            return Number(product.weight_kg);
        }
        if (u === 'kg' || u === 'kilo' || u === 'kilos') {
            return 0.1;
        }
        const extracted = extractWeight(product.name);
        if (extracted !== null && extracted > 0) {
            return extracted / 1000;
        }
        return 1.0;
    };

    const initialWebUnit = (product.web_unit || '').trim().toLowerCase();
    const initialWebFactor = () => {
        if (initialWebUnit === 'libra' || initialWebUnit.includes('libra') || initialWebUnit === 'lb') return 0.5;
        if (initialWebUnit === 'kg' || initialWebUnit === 'kilo' || initialWebUnit.includes('kilo')) return 1.0;
        return product.web_conversion_factor ?? 1.0;
    };

    const [formData, setFormData] = useState<Product>({ 
        ...product,
        unit_of_measure: product.unit_of_measure?.toLowerCase() === 'unidad' ? 'Unidad' : 'Kg',
        weight_kg: initialWeight(),
        web_conversion_factor: initialWebFactor(),
        iva_rate: product.iva_rate ?? 19,
        min_inventory_level: product.min_inventory_level ?? 0,
        utility_deviation_pct: product.utility_deviation_pct ?? 0,
        inherit_price: (product as any).inherit_price ?? false
    });

    const [localChildren, setLocalChildren] = useState<Product[]>(() => {
        const found = (allProducts || []).filter(p => p.parent_id === product.id);
        if (product.parent_id === product.id && !found.some(p => p.id === product.id)) {
            return [product, ...found];
        }
        return found;
    });

    useEffect(() => {
        const found = (allProducts || []).filter(p => p.parent_id === product.id);
        if (product.parent_id === product.id && !found.some(p => p.id === product.id)) {
            setLocalChildren([product, ...found]);
        } else {
            setLocalChildren(found);
        }
    }, [allProducts, product.id, product.parent_id]);

    const isChild = !!formData.parent_id && formData.parent_id !== product.id;
    const isSelfChild = formData.parent_id === product.id || localChildren.some(c => c.id === product.id);
    const hasOtherChildren = localChildren.some(c => c.id !== product.id);
    const isParent = !isChild && (hasOtherChildren || product.parent_id === product.id || localChildren.length > 0);
    const hasChildren = localChildren.length > 0;

    const [filterOnlyActiveChildren, setFilterOnlyActiveChildren] = useState(true);

    const activeChildrenCount = localChildren.filter(c => c.is_active).length;
    const inactiveChildrenCount = localChildren.length - activeChildrenCount;

    const displayedChildren = useMemo(() => {
        if (filterOnlyActiveChildren) {
            return localChildren.filter(c => c.is_active);
        }
        return localChildren;
    }, [localChildren, filterOnlyActiveChildren]);

    const [showAddChildSearch, setShowAddChildSearch] = useState(false);
    const [addChildQuery, setAddChildQuery] = useState('');
    const [linkingChild, setLinkingChild] = useState(false);
    const [unlinkingChildId, setUnlinkingChildId] = useState<string | null>(null);

    const handleLinkChild = async (childToLink: Product) => {
        try {
            setLinkingChild(true);
            const { error } = await supabase
                .from('products')
                .update({ parent_id: product.id })
                .eq('id', childToLink.id);

            if (error) throw error;

            if (!formData.parent_id || formData.parent_id !== product.id) {
                setFormData(prev => ({ ...prev, parent_id: product.id }));
                await supabase
                    .from('products')
                    .update({ parent_id: product.id })
                    .eq('id', product.id);
            }

            setLocalChildren(prev => {
                if (prev.some(c => c.id === childToLink.id)) return prev;
                return [...prev, { ...childToLink, parent_id: product.id }];
            });
            setShowAddChildSearch(false);
            setAddChildQuery('');
            if (onSave) onSave();
        } catch (err: any) {
            alert('Error al vincular producto hijo: ' + err.message);
        } finally {
            setLinkingChild(false);
        }
    };

    const handleUnlinkChild = async (childId: string, childName: string) => {
        const isSelf = childId === product.id;
        const confirmMsg = isSelf
            ? `¿Confirmas desvincular este producto base ("${childName}") como SKU hijo? Seguirá siendo el producto padre de la familia.`
            : `¿Confirmas desvincular "${childName}" de este producto padre? Pasará a ser un SKU independiente.`;

        if (!window.confirm(confirmMsg)) {
            return;
        }
        try {
            setUnlinkingChildId(childId);
            const { error } = await supabase
                .from('products')
                .update({ parent_id: null })
                .eq('id', childId);

            if (error) throw error;

            if (isSelf) {
                setFormData(prev => ({ ...prev, parent_id: null }));
            }
            setLocalChildren(prev => prev.filter(c => c.id !== childId));
            if (onSave) onSave();
        } catch (err: any) {
            alert('Error al desvincular producto hijo: ' + err.message);
        } finally {
            setUnlinkingChildId(null);
        }
    };

    const availableChildrenCandidates = (allProducts || [])
        .filter(p => 
            p.is_active &&
            addChildQuery.trim() !== '' &&
            (p.id === product.id 
                ? !localChildren.some(c => c.id === product.id)
                : (p.parent_id !== product.id && !allProducts.some(other => other.parent_id === p.id && other.id !== p.id))
            ) &&
            (
                (p.name || '').toLowerCase().includes(addChildQuery.toLowerCase().trim()) ||
                (p.accounting_id?.toString() || '').includes(addChildQuery.trim()) ||
                (p.sku || '').toLowerCase().includes(addChildQuery.toLowerCase().trim())
            )
        )
        .slice(0, 10);

    const [parentSearch, setParentSearch] = useState('');
    const [showParentResults, setShowParentResults] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const parseInitialOptions = (prod: any) => {
        const optionMap = new Map<string, Set<string>>();

        // 1. Opciones estructuradas modernas
        if (Array.isArray(prod.options_config)) {
            prod.options_config.forEach((opt: any) => {
                const name = (opt.name || '').trim();
                if (name) {
                    if (!optionMap.has(name)) optionMap.set(name, new Set());
                    if (Array.isArray(opt.values)) {
                        opt.values.forEach((v: string) => optionMap.get(name)!.add(v));
                    }
                }
            });
        }

        // 2. Opciones de base de datos históricas / directas
        if (prod.options) {
            if (Array.isArray(prod.options)) {
                prod.options.forEach((opt: any) => {
                    const name = (opt.name || '').trim();
                    if (name) {
                        if (!optionMap.has(name)) optionMap.set(name, new Set());
                        if (Array.isArray(opt.values)) {
                            opt.values.forEach((v: string) => optionMap.get(name)!.add(v));
                        }
                    }
                });
            } else if (typeof prod.options === 'object') {
                Object.entries(prod.options).forEach(([name, values]) => {
                    const cleanName = name.trim();
                    if (cleanName) {
                        if (!optionMap.has(cleanName)) optionMap.set(cleanName, new Set());
                        if (Array.isArray(values)) {
                            values.forEach((v: any) => {
                                if (typeof v === 'string') optionMap.get(cleanName)!.add(v);
                            });
                        }
                    }
                });
            }
        }

        const list = Array.from(optionMap.entries()).map(([name, valSet]) => ({
            name,
            values: Array.from(valSet)
        }));

        return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    };

    const [previewUrl, setPreviewUrl] = useState<string | null>(product.image_url);
    const [options, setOptions] = useState<any[]>(() => parseInitialOptions(product));
    const [variants, setVariants] = useState<any[]>(() => {
        const raw = product.variants || [];
        const seen = new Set<string>();
        return raw.map((v: any, idx: number) => {
            let id = v?.id;
            if (!id || seen.has(id)) {
                id = `v-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
            }
            seen.add(id);
            return { ...v, id };
        });
    });
    const [variantUploading, setVariantUploading] = useState<string | null>(null);
    const [conversionFactorInput, setConversionFactorInput] = useState(initialWebFactor().toString().replace('.', ','));
    const [generatingAI, setGeneratingAI] = useState(false);
    const [tagInput, setTagInput] = useState('');
    const [keywordInput, setKeywordInput] = useState('');

    const categories = [
        { id: 'FR', name: 'Frutas' },
        { id: 'VE', name: 'Verduras' },
        { id: 'TU', name: 'Tubérculos' },
        { id: 'HO', name: 'Hortalizas' },
        { id: 'LA', name: 'Lácteos' },
        { id: 'DE', name: 'Despensa' },
        { id: 'CO', name: 'Congelados' }
    ];

    const buyingTeams = ['HIERBAS Y HORTALIZAS', 'EQUIPO A FRUTAS', 'EQUIPO A VEGETALES', 'LOGISTICA - PAPAS', 'REFRIGERADOS'];
    const procurementMethods = ['Compras Generales', 'Contratación Directa', 'Importación', 'Local'];
    const [baseUnits, setBaseUnits] = useState<string[]>(['Kg', 'Unidad', 'Atado', 'Bolsa', 'Caja', 'Bandeja', 'Malla', 'Gramos', 'Libra']);
    const [masterAttributes, setMasterAttributes] = useState<{ name: string, values: string[], show_on_web?: boolean }[]>([]);

    useEffect(() => {
        const fetchMaster = async () => {
            try {
                const { data, error } = await supabase.from('product_attributes_master').select('*').order('name');
                if (error) {
                    console.warn('EditModal: No master table found, using defaults.');
                    return;
                }
                if (data && data.length > 0) {
                    setMasterAttributes(data.map(attr => ({ 
                        name: attr.name, 
                        values: sortSuggestedValues(attr.suggested_values || []),
                        show_on_web: attr.show_on_web !== false
                    })));
                }

                const { data: settingsData } = await supabase.from('app_settings').select('value').eq('key', 'standard_units').single();
                if (settingsData?.value) {
                    const dynamicList = settingsData.value.split(',').map((u: string) => u.trim());
                    if (dynamicList.length > 0) setBaseUnits(dynamicList);
                }
            } catch (e) {
                console.warn('EditModal: Error fetching master attributes.');
            }
        };
        fetchMaster();
    }, []);

    // ==========================================
    // DETECCIÓN & ESTADO POKA-YOKE COMERCIAL
    // ==========================================
    const detectInitialTypology = (): { typology: CommercialTypology; grams: number; secondaryGrams: number | null; pkg: string } => {
        const presValsSet = new Set<string>();

        // 1. Desde options iniciales
        const presOpt = options.find((o: any) => (o.name || '').toLowerCase().includes('presentaci'));
        if (presOpt && Array.isArray(presOpt.values)) {
            presOpt.values.forEach((v: string) => presValsSet.add(v));
        }

        // 2. Desde options_config
        if (Array.isArray((product as any).options_config)) {
            const cfg = (product as any).options_config.find((c: any) => (c.name || '').toLowerCase().includes('presentaci'));
            if (cfg && Array.isArray(cfg.values)) {
                cfg.values.forEach((v: string) => presValsSet.add(v));
            }
        }

        // 3. Desde options directo en producto (diccionario histórico con pipes: Unidad|7000, Unidad|10000)
        if (product.options) {
            for (const [k, v] of Object.entries(product.options)) {
                if (k.toLowerCase().includes('presentaci') && Array.isArray(v)) {
                    v.forEach((val: any) => {
                        if (typeof val === 'string') presValsSet.add(val);
                    });
                }
            }
        }

        // 4. Desde variantes
        if (Array.isArray(product.variants)) {
            product.variants.forEach((v: any) => {
                if (v && v.options) {
                    for (const [k, val] of Object.entries(v.options)) {
                        if (k.toLowerCase().includes('presentaci') && typeof val === 'string') {
                            presValsSet.add(val);
                        }
                    }
                }
            });
        }

        const presVals = Array.from(presValsSet);
        const currentWebUnit = (product.web_unit || '').trim().toLowerCase();
        const isEmpaqueUnit = ['bandeja', 'cubeta', 'caja', 'paquete', 'malla', 'bolsa'].includes(currentWebUnit);

        const allGrams: number[] = [];
        for (const v of presVals) {
            const w = extractWeight(v);
            if (w !== null && w > 0 && w !== 500) {
                const rounded = Math.round(w);
                if (!allGrams.includes(rounded)) {
                    allGrams.push(rounded);
                }
            }
        }

        let foundGrams = 350;
        if (allGrams.length > 0) {
            foundGrams = allGrams[0];
        } else if (product.web_conversion_factor && product.web_conversion_factor > 0) {
            foundGrams = Math.round(product.web_conversion_factor * 1000);
        }

        const otherGrams = allGrams.filter(g => g !== foundGrams);
        const foundSecondary = otherGrams.length > 0 ? otherGrams[0] : null;

        if (isEmpaqueUnit) {
            const matched = ['bandeja', 'cubeta', 'caja', 'paquete', 'malla', 'bolsa'].find(p => p === currentWebUnit) || 'bandeja';
            return { 
                typology: 'empaque', 
                grams: foundGrams > 0 ? foundGrams : 125, 
                secondaryGrams: foundSecondary,
                pkg: matched.charAt(0).toUpperCase() + matched.slice(1) 
            };
        }

        const hasLibra = presVals.some(v => v.toLowerCase().includes('libra') || v.includes('|500'));
        const hasOtherUnit = presVals.some(v => !v.toLowerCase().includes('libra') && !v.includes('|500'));

        if (hasLibra && hasOtherUnit && foundGrams < 500) {
            return { typology: 'bimodal', grams: foundGrams, secondaryGrams: foundSecondary, pkg: 'Bandeja' };
        }

        const lowerName = (product.name || '').toLowerCase();
        const isLargePieceName = lowerName.includes('melón') || lowerName.includes('melon') || 
                                 lowerName.includes('patilla') || lowerName.includes('sandia') || lowerName.includes('sandía') || 
                                 lowerName.includes('piña') || lowerName.includes('papaya') || 
                                 lowerName.includes('ahuyama') || lowerName.includes('coliflor') || lowerName.includes('batavia');

        if ((foundGrams >= 500 && !hasLibra) || isLargePieceName || currentWebUnit === 'unidad') {
            if (foundGrams < 500 && isLargePieceName) foundGrams = 2000;
            return { typology: 'monounidad', grams: foundGrams >= 500 ? foundGrams : 2000, secondaryGrams: foundSecondary, pkg: 'Bandeja' };
        }

        return { typology: 'granel', grams: 500, secondaryGrams: null, pkg: 'Bandeja' };
    };

    const initialTypologyData = useMemo(() => detectInitialTypology(), []);
    const [commercialTypology, setCommercialTypology] = useState<CommercialTypology>(initialTypologyData.typology);
    const [targetGrams, setTargetGrams] = useState<number>(initialTypologyData.grams);
    const [secondaryGrams, setSecondaryGrams] = useState<number | null>(initialTypologyData.secondaryGrams);
    const [packageType, setPackageType] = useState<string>(initialTypologyData.pkg);
    const [isTypologyUnlocked, setIsTypologyUnlocked] = useState<boolean>(false);

    useEffect(() => {
        setIsTypologyUnlocked(false);
    }, [product?.id]);

    // Sincronizador en caliente del Poka-Yoke hacia formData y options
    const updatePokaYoke = (
        newTypology: CommercialTypology,
        newGrams: number,
        newPkg: string,
        newSecondaryGrams?: number | null
    ) => {
        setCommercialTypology(newTypology);
        setTargetGrams(newGrams);
        setPackageType(newPkg);
        let secGrams = newSecondaryGrams !== undefined ? newSecondaryGrams : secondaryGrams;
        if (newTypology === 'granel') {
            secGrams = null;
        }
        setSecondaryGrams(secGrams);

        let newWebUnit = 'Libra';
        let newFactor = 0.5;
        let presentationValues: string[] = [];

        if (newTypology === 'bimodal') {
            newWebUnit = 'Libra';
            newFactor = 0.5;
            presentationValues = [`Libra 500g|500`, `Unidad ${newGrams} gr|${newGrams}`];
            if (secGrams && secGrams > 0 && secGrams !== newGrams) {
                presentationValues.push(`Unidad ${secGrams} gr|${secGrams}`);
            }
        } else if (newTypology === 'monounidad') {
            newWebUnit = 'Unidad';
            newFactor = newGrams / 1000;
            presentationValues = [`Unidad ${newGrams} gr|${newGrams}`];
            if (secGrams && secGrams > 0 && secGrams !== newGrams) {
                presentationValues.push(`Unidad ${secGrams} gr|${secGrams}`);
            }
        } else if (newTypology === 'empaque') {
            newWebUnit = newPkg || 'Bandeja';
            newFactor = newGrams / 1000;
            presentationValues = [`${newPkg} ${newGrams} gr|${newGrams}`];
            if (secGrams && secGrams > 0 && secGrams !== newGrams) {
                presentationValues.push(`${newPkg} ${secGrams} gr|${secGrams}`);
            }
        } else if (newTypology === 'granel') {
            newWebUnit = 'Libra';
            newFactor = 0.5;
            presentationValues = [`Libra 500g|500`];
        }

        setFormData(prev => ({
            ...prev,
            web_unit: newWebUnit,
            web_conversion_factor: newFactor
        }));
        setConversionFactorInput(newFactor.toString().replace('.', ','));

        // Actualizar o insertar 'Presentación' dentro de options
        setOptions(prevOptions => {
            const otherOptions = prevOptions.filter((o: any) => !((o.name || '').toLowerCase().includes('presentaci')));
            const newPresOpt = {
                name: 'Presentación',
                values: sortSuggestedValues(presentationValues)
            };
            return [newPresOpt, ...otherOptions];
        });
    };

    // Calibres gobernados extraídos dinámicamente de la tabla maestra (Gobernanza de Variantes)
    const governedCalibres = useMemo(() => {
        const presAttr = masterAttributes.find(a => (a.name || '').toLowerCase().includes('presentaci'));
        const rawVals = presAttr?.values || [];
        const weightsSet = new Set<number>();
        
        rawVals.forEach(v => {
            const w = extractWeight(v);
            if (w !== null && w > 0 && w !== 500) {
                weightsSet.add(Math.round(w));
            }
        });

        const defaultUnder500 = [100, 125, 150, 160, 180, 200, 250, 300, 350, 400, 450];
        const defaultOver500 = [700, 800, 1000, 1200, 1300, 1500, 1800, 2000, 2200, 2500, 3000, 5000, 7000, 7100, 7200, 7300, 7500, 10000];

        const allWeights = Array.from(weightsSet);
        const under500 = allWeights.filter(w => w < 500).sort((a, b) => a - b);
        const overOrEqual500 = allWeights.filter(w => w >= 500).sort((a, b) => a - b);

        return {
            under500: under500.length > 0 ? under500 : defaultUnder500,
            overOrEqual500: overOrEqual500.length > 0 ? overOrEqual500 : defaultOver500
        };
    }, [masterAttributes]);

    const bimodalOptions = useMemo(() => {
        const list = [...governedCalibres.under500];
        if (targetGrams > 0 && targetGrams < 500 && !list.includes(targetGrams)) {
            list.push(targetGrams);
        }
        if (secondaryGrams && secondaryGrams > 0 && secondaryGrams < 500 && !list.includes(secondaryGrams)) {
            list.push(secondaryGrams);
        }
        return list.sort((a, b) => a - b);
    }, [governedCalibres.under500, targetGrams, secondaryGrams]);

    const monounidadOptions = useMemo(() => {
        const list = [...governedCalibres.overOrEqual500];
        if (targetGrams >= 500 && !list.includes(targetGrams)) {
            list.push(targetGrams);
        }
        if (secondaryGrams && secondaryGrams >= 500 && !list.includes(secondaryGrams)) {
            list.push(secondaryGrams);
        }
        return list.sort((a, b) => a - b);
    }, [governedCalibres.overOrEqual500, targetGrams, secondaryGrams]);

    const empaqueOptions = useMemo(() => {
        const set = new Set([...governedCalibres.under500, ...governedCalibres.overOrEqual500]);
        if (targetGrams > 0) set.add(targetGrams);
        if (secondaryGrams && secondaryGrams > 0) set.add(secondaryGrams);
        return Array.from(set).sort((a, b) => a - b);
    }, [governedCalibres, targetGrams, secondaryGrams]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const uploadImage = async () => {
        if (!imageFile) return formData.image_url;

        setUploading(true);
        try {
            const optimizedFile = await optimizeImageForUpload(imageFile, {
                maxWidth: 800,
                maxHeight: 800,
                quality: 0.82
            });

            const fileExt = optimizedFile.name.split('.').pop() || 'webp';
            const fileName = `${formData.sku || product.id || 'prod'}-${Date.now()}.${fileExt}`;
            const filePath = `master/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, optimizedFile, {
                    cacheControl: '2592000',
                    contentType: optimizedFile.type,
                    upsert: true
                });

            if (uploadError) {
                diagnoseStorageError(uploadError, 'product-images');
                setUploading(false);
                return formData.image_url;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(filePath);

            setUploading(false);
            return publicUrl;
        } catch (err) {
            console.error('Error optimizing image:', err);
            setUploading(false);
            return formData.image_url;
        }
    };

    const [variantNotice, setVariantNotice] = useState<string | null>(null);

    const addOption = () => {
        if (options.length < 3) {
            setOptions([...options, { name: '', values: [] }]);
        }
    };

    const updateOption = (index: number, name: string, valuesStr: string) => {
        const newOptions = [...options];
        newOptions[index] = {
            name,
            values: valuesStr.split(',').map(v => v.trim()).filter(v => v !== '')
        };
        setOptions(newOptions);
    };

    const updateOptionValues = (index: number, newValues: string[]) => {
        const newOptions = [...options];
        newOptions[index] = {
            ...newOptions[index],
            values: newValues
        };
        setOptions(newOptions);
    };

    const clearOptionValues = (index: number) => {
        const newOptions = [...options];
        newOptions[index] = {
            ...newOptions[index],
            values: []
        };
        setOptions(newOptions);
    };

    const removeOption = (index: number) => {
        const newOptions = options.filter((_, i) => i !== index);
        setOptions(newOptions);
        if (newOptions.length === 0) {
            setVariants([]);
            setVariantNotice('Se han eliminado las combinaciones.');
        }
    };

    const getAttributeCode = (rawVal: any): string => {
        if (!rawVal) return 'X';
        const str = rawVal.toString().trim();
        if (str.includes('|')) {
            const [label, code] = str.split('|');
            const cleanCode = code ? code.replace(/[^a-zA-Z0-9]/g, '') : '';
            const initial = label.substring(0, 1).toUpperCase();
            return cleanCode ? `${initial}${cleanCode}` : initial;
        }
        const clean = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        if (clean.length <= 4) return clean;
        return clean.substring(0, 4);
    };

    const generateVariants = (optsToUse = options) => {
        const activeOptions = optsToUse.filter(opt => opt.name && Array.isArray(opt.values) && opt.values.length > 0);

        if (activeOptions.length === 0) {
            setVariants([]);
            setVariantNotice('No hay opciones seleccionadas en ningún atributo. Se limpiaron las combinaciones.');
            return;
        }

        let results: any[] = [{}];
        activeOptions.forEach(opt => {
            const temp: any[] = [];
            results.forEach(res => {
                opt.values.forEach((val: string) => {
                    temp.push({ ...res, [opt.name]: val });
                });
            });
            results = temp;
        });

        const usedIds = new Set<string>();
        const usedSkus = new Set<string>();

        const newVariants = results.map((combination, idx) => {
            const attrCode = Object.values(combination).map(getAttributeCode).join('.');
            const baseSku = `${formData.sku || 'SKU'}.${attrCode}`;
            let variantSku = baseSku;
            let counter = 1;
            while (usedSkus.has(variantSku)) {
                counter++;
                variantSku = `${baseSku}-${counter}`;
            }
            usedSkus.add(variantSku);

            const existing = variants.find(v => 
                v.sku === variantSku && !usedIds.has(v.id)
            ) || variants.find(v => 
                v.options && 
                Object.keys(combination).every(k => v.options[k] === combination[k]) &&
                !usedIds.has(v.id)
            );

            let id = existing?.id;
            if (!id || usedIds.has(id)) {
                id = `v-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
            }
            usedIds.add(id);

            return {
                id,
                sku: variantSku,
                options: combination,
                price_adj_pct: existing?.price_adj_pct || existing?.price_adjustment_percent || 0,
                image_url: existing?.image_url || null,
                show_on_web: existing?.show_on_web !== false
            };
        });

        setVariants(newVariants);
        const summaryStr = activeOptions.map(o => `${o.name} (${o.values.length})`).join(' + ');
        setVariantNotice(`¡Combinaciones recalculadas! ${newVariants.length} combinaciones generadas con [ ${summaryStr} ]`);
    };

    const updateVariantPrice = (id: string, price: number) => {
        setVariants(variants.map(v => v.id === id ? { ...v, price_adj_pct: price } : v));
    };

    const updateVariantVisibility = (id: string, visible: boolean) => {
        setVariants(variants.map(v => v.id === id ? { ...v, show_on_web: visible } : v));
    };

    const handleGenerateAI = async () => {
        if (!formData.name) {
            alert('Por favor asigne un nombre al producto primero.');
            return;
        }
        setGeneratingAI(true);
        try {
            const response = await fetch('/api/products/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: formData.name, 
                    category: formData.category,
                    current_description: formData.description 
                })
            });

            if (response.ok) {
                const data = await response.json();
                setFormData(prev => ({
                    ...prev,
                    description: data.description_es,
                    description_en: data.description_en,
                    name_en: data.name_en
                }));
            } else {
                const err = await response.json();
                alert('Error IA: ' + (err.error || 'Error desconocido'));
            }
        } catch (error) {
            console.error('AI Generation error:', error);
            alert('Error de conexión con el motor de IA');
        } finally {
            setGeneratingAI(false);
        }
    };

    const handleVariantImageUpload = async (variantId: string, file: File) => {
        setVariantUploading(variantId);
        try {
            const optimizedFile = await optimizeImageForUpload(file, {
                maxWidth: 600,
                maxHeight: 600,
                quality: 0.80
            });

            const fileExt = optimizedFile.name.split('.').pop() || 'webp';
            const fileName = `${variantId}-${Date.now()}.${fileExt}`;
            const filePath = `variants/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, optimizedFile, {
                    cacheControl: '2592000',
                    contentType: optimizedFile.type,
                    upsert: true
                });

            if (uploadError) {
                diagnoseStorageError(uploadError, 'product-images');
                throw uploadError;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(filePath);

            setVariants(variants.map(v => v.id === variantId ? { ...v, image_url: publicUrl } : v));
        } catch (error) {
            console.error('Error subiendo imagen de variante:', error);
        } finally {
            setVariantUploading(null);
        }
    };

    // GUARDADO SEGURO
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (readOnly) return;
        setLoading(true);

        try {
            const uploadedImageUrl = await uploadImage();
            
            // Garantizar sincronización de Poka-Yoke antes de guardar
            let finalWebUnit = formData.web_unit || 'Libra';
            let finalFactor = formData.web_conversion_factor || 0.5;
            let presentationValues: string[] = [];

            if (commercialTypology === 'bimodal') {
                finalWebUnit = 'Libra';
                finalFactor = 0.5;
                presentationValues = [`Libra 500g|500`, `Unidad ${targetGrams} gr|${targetGrams}`];
                if (secondaryGrams && secondaryGrams > 0 && secondaryGrams !== targetGrams) {
                    presentationValues.push(`Unidad ${secondaryGrams} gr|${secondaryGrams}`);
                }
            } else if (commercialTypology === 'monounidad') {
                finalWebUnit = 'Unidad';
                finalFactor = targetGrams / 1000;
                presentationValues = [`Unidad ${targetGrams} gr|${targetGrams}`];
                if (secondaryGrams && secondaryGrams > 0 && secondaryGrams !== targetGrams) {
                    presentationValues.push(`Unidad ${secondaryGrams} gr|${secondaryGrams}`);
                }
            } else if (commercialTypology === 'empaque') {
                finalWebUnit = packageType || 'Bandeja';
                finalFactor = targetGrams / 1000;
                presentationValues = [`${packageType} ${targetGrams} gr|${targetGrams}`];
                if (secondaryGrams && secondaryGrams > 0 && secondaryGrams !== targetGrams) {
                    presentationValues.push(`${packageType} ${secondaryGrams} gr|${secondaryGrams}`);
                }
            } else if (commercialTypology === 'granel') {
                finalWebUnit = 'Libra';
                finalFactor = 0.5;
                presentationValues = [`Libra 500g|500`];
            }

            // Unir 'Presentación' con las demás opciones (como Maduración)
            const otherOptions = options.filter((o: any) => !((o.name || '').toLowerCase().includes('presentaci')));
            const syncedOptions = [
                { name: 'Presentación', values: sortSuggestedValues(presentationValues) },
                ...otherOptions
            ];

            const updatePayload: any = {
                name: formData.name,
                sku: formData.sku,
                category: formData.category,
                unit_of_measure: formData.unit_of_measure?.toLowerCase() === 'unidad' ? 'Unidad' : 'Kg',
                description: formData.description,
                min_inventory_level: formData.min_inventory_level,
                is_active: formData.is_active,
                image_url: uploadedImageUrl,
                parent_id: formData.parent_id,
                buying_team: formData.buying_team,
                procurement_method: formData.procurement_method,
                inventory_group: formData.inventory_group,
                purchase_sublist: formData.purchase_sublist,
                utility_deviation_pct: formData.utility_deviation_pct || 0,
                options_config: syncedOptions
                    .filter(opt => opt.name && Array.isArray(opt.values) && opt.values.length > 0)
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                    .map(opt => {
                        const attr: any = masterAttributes.find((a: any) => a.name === opt.name);
                        return {
                            name: opt.name,
                            values: opt.values,
                            show_on_web: attr ? attr.show_on_web !== false : true
                        };
                    }),
                options: syncedOptions.reduce((acc: any, opt: any) => {
                    if (opt.name && Array.isArray(opt.values) && opt.values.length > 0) {
                        acc[opt.name] = opt.values;
                    }
                    return acc;
                }, {}),
                variants: variants,
                iva_rate: formData.iva_rate,
                weight_kg: formData.weight_kg !== undefined && formData.weight_kg !== null ? Number(formData.weight_kg) : (formData.unit_of_measure?.toLowerCase() === 'unidad' ? 1.0 : 0.1),
                display_name: formData.display_name ? normalizeCatalogSpelling(formData.display_name) : formData.display_name,
                web_unit: finalWebUnit,
                web_conversion_factor: finalFactor,
                name_en: formData.name_en,
                description_en: formData.description_en,
                tags: formData.tags,
                keywords: formData.keywords || null,
                requires_label: (formData as any).requires_label ?? false,
                show_on_web: (formData as any).show_on_web !== false
            };

            if ('inherit_price' in formData) {
                updatePayload.inherit_price = (formData as any).inherit_price ?? false;
            }

            let { error } = await supabase
                .from('products')
                .update(updatePayload)
                .eq('id', product.id);

            if (error && error.message?.includes('column "inherit_price" does not exist')) {
                delete updatePayload.inherit_price;
                const retry = await supabase
                    .from('products')
                    .update(updatePayload)
                    .eq('id', product.id);
                error = retry.error;
            }

            if (error) throw error;
            
            const { error: deleteError } = await supabase
                .from('product_variants')
                .delete()
                .eq('product_id', product.id);
            
            if (deleteError) {
                console.error('Error limpiando variantes anteriores:', deleteError);
                throw deleteError;
            }

            if (variants && variants.length > 0 && syncedOptions.length > 0) {
                const { data: existingDbVariants } = await supabase
                    .from('product_variants')
                    .select('sku')
                    .neq('product_id', product.id);

                const existingOtherSkus = new Set((existingDbVariants || []).map((ev: any) => ev.sku));
                const seenBatchSkus = new Set<string>();
                
                const formattedVariants = variants.map((v, idx) => {
                    let vSku = (v.sku && v.sku.trim()) || `${formData.sku || 'SKU'}-V${idx + 1}`;
                    let testSku = vSku;
                    let c = 2;
                    while (seenBatchSkus.has(testSku) || existingOtherSkus.has(testSku)) {
                        testSku = `${vSku}-${c}`;
                        c++;
                    }
                    seenBatchSkus.add(testSku);

                    return {
                        product_id: product.id,
                        sku: testSku,
                        options: v.options,
                        image_url: v.image_url,
                        price_adjustment_percent: v.price_adj_pct || 0,
                        is_active: v.show_on_web ?? true
                    };
                });

                const { error: variantError } = await supabase
                    .from('product_variants')
                    .insert(formattedVariants);

                if (variantError) {
                    console.error('Error insertando nuevas variantes:', variantError);
                    throw variantError;
                }
            }

            triggerProductRevalidation();
            onSave();
            onClose();
        } catch (error: any) {
            const diagnosis = diagnoseDatabaseError(error, 'products', 'Update');
            alert(diagnosis || 'Error al actualizar producto');
        } finally {
            setLoading(false);
        }
    };

    // Cálculos de Precios Simulados para Live Preview
    const baseKgPrice = product.base_price || 0;
    const priceLibra = Math.ceil((baseKgPrice * 0.5) / 50) * 50;
    const priceUnit = Math.ceil((baseKgPrice * (targetGrams / 1000)) / 50) * 50;
    const priceSecondary = secondaryGrams ? Math.ceil((baseKgPrice * (secondaryGrams / 1000)) / 50) * 50 : 0;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            backdropFilter: 'blur(8px)',
            padding: '1.5rem'
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '2rem',
                borderRadius: '24px',
                width: '95%',
                maxWidth: '1420px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)',
                overflow: 'hidden'
            }}>
                {/* HEADER */}
                {/* HEADER */}
                <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.8rem', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                        <div style={{ backgroundColor: '#F1F5F9', padding: '8px', borderRadius: '10px', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Settings size={20} strokeWidth={2.2} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0F172A', fontFamily: 'var(--font-outfit), sans-serif', margin: 0 }}>
                                Editar Maestro
                            </h2>
                            <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                backgroundColor: '#EFF6FF', 
                                color: '#1E40AF', 
                                border: '1px solid #BFDBFE', 
                                padding: '2px 10px', 
                                borderRadius: '20px', 
                                fontSize: '0.78rem', 
                                fontWeight: '800',
                                fontVariantNumeric: 'tabular-nums' 
                            }}>
                                ID #{formData.accounting_id || product.accounting_id || 'S/N'}
                            </span>
                            <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                backgroundColor: '#F1F5F9', 
                                color: '#475569', 
                                border: '1px solid #CBD5E1', 
                                padding: '2px 8px', 
                                borderRadius: '14px', 
                                fontSize: '0.75rem', 
                                fontWeight: '800',
                                fontFamily: 'monospace' 
                            }}>
                                {formData.sku || product.sku}
                            </span>
                            <span style={{ 
                                fontSize: '1.25rem', 
                                fontWeight: '800', 
                                color: '#1A4D2E', 
                                fontFamily: 'var(--font-outfit), sans-serif',
                                borderLeft: '2px solid #E2E8F0',
                                paddingLeft: '10px'
                            }}>
                                {formData.name || product.name}
                            </span>
                        </div>
                    </div>

                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', borderRadius: '8px', transition: 'all 0.15s' }} title="Cerrar modal">
                        <X size={22} strokeWidth={2} />
                    </button>
                </header>

                {readOnly && (
                    <div style={{
                        padding: '10px 16px',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                        color: '#D97706',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '1rem',
                        flexShrink: 0
                    }}>
                        <ShieldAlert size={16} />
                        <span>Modo Vista: No tienes permisos para modificar este SKU.</span>
                    </div>
                )}

                {/* BARRA DE PESTAÑAS (FLUJO DE REVISIÓN ERGONÓMICO) */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderBottom: '2px solid #F1F5F9',
                    paddingBottom: '8px',
                    marginBottom: '1.2rem',
                    flexShrink: 0
                }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab('tecnica')}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            borderRadius: '12px',
                            border: activeTab === 'tecnica' ? '1.5px solid #1A4D2E' : '1.5px solid transparent',
                            backgroundColor: activeTab === 'tecnica' ? '#ECFDF5' : 'transparent',
                            color: activeTab === 'tecnica' ? '#1A4D2E' : '#64748B',
                            fontSize: '0.84rem',
                            fontWeight: '700',
                            fontFamily: 'var(--font-outfit), sans-serif',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                        }}
                    >
                        <Scale size={16} strokeWidth={2.2} />
                        <span>1. Logística & Costos</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('jerarquia')}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            borderRadius: '12px',
                            border: activeTab === 'jerarquia' ? '1.5px solid #1A4D2E' : '1.5px solid transparent',
                            backgroundColor: activeTab === 'jerarquia' ? '#ECFDF5' : 'transparent',
                            color: activeTab === 'jerarquia' ? '#1A4D2E' : '#64748B',
                            fontSize: '0.84rem',
                            fontWeight: '700',
                            fontFamily: 'var(--font-outfit), sans-serif',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                        }}
                    >
                        <GitFork size={16} strokeWidth={2.2} style={{ transform: 'rotate(180deg)' }} />
                        <span>2. Jerarquía Padre/Hijos</span>
                        {localChildren.length > 0 && (
                            <span style={{
                                backgroundColor: activeTab === 'jerarquia' ? '#1A4D2E' : '#94A3B8',
                                color: 'white',
                                fontSize: '0.68rem',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                fontWeight: '900'
                            }}>
                                {localChildren.length}
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('ecommerce')}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            borderRadius: '12px',
                            border: activeTab === 'ecommerce' ? '1.5px solid #EA580C' : '1.5px solid transparent',
                            backgroundColor: activeTab === 'ecommerce' ? '#FFF7ED' : 'transparent',
                            color: activeTab === 'ecommerce' ? '#C2410C' : '#64748B',
                            fontSize: '0.84rem',
                            fontWeight: '700',
                            fontFamily: 'var(--font-outfit), sans-serif',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                        }}
                    >
                        <ShoppingCart size={16} strokeWidth={2.2} />
                        <span>3. Venta Web (Poka-Yoke)</span>
                        <span style={{
                            backgroundColor: activeTab === 'ecommerce' ? '#EA580C' : '#FED7AA',
                            color: activeTab === 'ecommerce' ? 'white' : '#9A3412',
                            fontSize: '0.65rem',
                            padding: '2px 6px',
                            borderRadius: '8px',
                            fontWeight: '800'
                        }}>
                            B2C
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('variantes')}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            borderRadius: '12px',
                            border: activeTab === 'variantes' ? '1.5px solid #1A4D2E' : '1.5px solid transparent',
                            backgroundColor: activeTab === 'variantes' ? '#ECFDF5' : 'transparent',
                            color: activeTab === 'variantes' ? '#1A4D2E' : '#64748B',
                            fontSize: '0.84rem',
                            fontWeight: '700',
                            fontFamily: 'var(--font-outfit), sans-serif',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                        }}
                    >
                        <Sliders size={16} strokeWidth={2.2} />
                        <span>4. Maduración & Recetas</span>
                    </button>
                </div>

                {/* FORMULARIO Y CONTENIDO CON SCROLL INTERNO CONTROLADO */}
                <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', ...(readOnly ? { pointerEvents: 'none', opacity: 0.85 } : {}) }}>

                        {/* ==================================================== */}
                        {/* TAB 1: FICHA TÉCNICA & COMPRAS */}
                        {/* ==================================================== */}
                        {activeTab === 'tecnica' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                {/* Columna Izquierda: Identidad */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', backgroundColor: '#F9FAFB', padding: '1rem', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
                                        <div style={{ width: '100px', height: '100px', borderRadius: '12px', overflow: 'hidden', border: '2px solid #D1D5DB', position: 'relative', flexShrink: 0 }}>
                                            {previewUrl ? (
                                                <Image 
                                                    src={previewUrl} 
                                                    alt="" 
                                                    width={100} 
                                                    height={100} 
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                    sizes="100px"
                                                />
                                            ) : (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' }}>
                                                    <Camera size={28} strokeWidth={1.5} style={{ color: '#94A3B8' }} />
                                                </div>
                                            )}
                                            <input type="file" accept="image/*" onChange={handleFileChange} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '0.6rem', padding: '4px', textAlign: 'center' }}>CAMBIAR</div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Nombre Técnico (Corabastos / B2B)</label>
                                            <input
                                                required
                                                type="text"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '1.1rem', fontWeight: '700' }}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Código Contable (SKU)</label>
                                            <input
                                                required
                                                type="text"
                                                value={formData.sku}
                                                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #2563EB', fontSize: '1rem', fontWeight: '800', backgroundColor: '#EFF6FF', color: '#1E40AF' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Categoría Técnica</label>
                                            <select
                                                value={formData.category}
                                                onChange={(e) => {
                                                    const newCatId = e.target.value;
                                                    const oldSku = formData.sku || '';
                                                    const parts = oldSku.split('-');
                                                    let newSku = oldSku;
                                                    if (parts.length > 1) {
                                                        newSku = `${newCatId}-${parts.slice(1).join('-')}`;
                                                    } else if (oldSku) {
                                                        newSku = `${newCatId}-${oldSku}`;
                                                    }
                                                    setFormData({ ...formData, category: newCatId, sku: newSku });
                                                }}
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '1rem', cursor: 'pointer', fontWeight: '800' }}
                                            >
                                                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name} ({cat.id})</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Alistamiento</label>
                                            <select
                                                value={formData.buying_team?.toUpperCase() || ''}
                                                onChange={(e) => setFormData({ ...formData, buying_team: e.target.value })}
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.8rem', fontWeight: '700' }}
                                            >
                                                <option value="">SELECCIONAR EQUIPO...</option>
                                                <option value="ALISTAMIENTO ABARROTES Y FRUTOS SECOS">ALISTAMIENTO ABARROTES Y FRUTOS SECOS</option>
                                                <option value="ALISTAMIENTO AGUACATES">ALISTAMIENTO AGUACATES</option>
                                                <option value="ALISTAMIENTO BATAVIA">ALISTAMIENTO BATAVIA</option>
                                                <option value="ALISTAMIENTO FRESAS Y MORAS">ALISTAMIENTO FRESAS Y MORAS</option>
                                                <option value="ALISTAMIENTO FRUTAS DE ALTA DEMANDA">ALISTAMIENTO FRUTAS DE ALTA DEMANDA</option>
                                                <option value="ALISTAMIENTO FRUTAS DE BAJA DEMANDA">ALISTAMIENTO FRUTAS DE BAJA DEMANDA</option>
                                                <option value="ALISTAMIENTO HORTALIZAS">ALISTAMIENTO HORTALIZAS</option>
                                                <option value="ALISTAMIENTO LACTEOS Y REFRIGERADOS">ALISTAMIENTO LACTEOS Y REFRIGERADOS</option>
                                                <option value="ALISTAMIENTO PAPAS Y TUBERCULOS">ALISTAMIENTO PAPAS Y TUBERCULOS</option>
                                                <option value="ALISTAMIENTO PLATANOS">ALISTAMIENTO PLATANOS</option>
                                                <option value="ALISTAMIENTO PROCESADOS">ALISTAMIENTO PROCESADOS</option>
                                                <option value="ALISTAMIENTO TOMATES">ALISTAMIENTO TOMATES</option>
                                                <option value="ALISTAMIENTO VERDURAS">ALISTAMIENTO VERDURAS</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Sublista de Compra</label>
                                            <select
                                                value={formData.purchase_sublist?.toUpperCase() || ''}
                                                onChange={(e) => setFormData({ ...formData, purchase_sublist: e.target.value })}
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.8rem', fontWeight: '700' }}
                                            >
                                                <option value="">SELECCIONAR SUBLISTA...</option>
                                                <option value="DESPENSA">DESPENSA</option>
                                                <option value="FRUTA SELECCIONADA">FRUTA SELECCIONADA</option>
                                                <option value="HORTALIZA SELECCIONADA">HORTALIZA SELECCIONADA</option>
                                                <option value="PLATANOS">PLATANOS</option>
                                                <option value="TOMATE">TOMATE</option>
                                                <option value="TUBERCULOS - PAPA">TUBERCULOS - PAPA</option>
                                                <option value="VERDURAS">VERDURAS</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Gestión de Compras</label>
                                            <select
                                                value={formData.procurement_method?.toUpperCase() || ''}
                                                onChange={(e) => setFormData({ ...formData, procurement_method: e.target.value })}
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.8rem', fontWeight: '700' }}
                                            >
                                                <option value="">SELECCIONAR MÉTODO...</option>
                                                <option value="COMPRAS GENERALES">COMPRAS GENERALES</option>
                                                <option value="COMPRAS MENORES">COMPRAS MENORES</option>
                                                <option value="COMPRAS NOCHE">COMPRAS NOCHE</option>
                                                <option value="CONTRATACIÓN DIRECTA">CONTRATACIÓN DIRECTA</option>
                                                <option value="IMPORTACIÓN">IMPORTACIÓN</option>
                                                <option value="LOCAL">LOCAL</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Grupo Inventario</label>
                                            <select
                                                value={formData.inventory_group?.toUpperCase() || ''}
                                                onChange={(e) => setFormData({ ...formData, inventory_group: e.target.value })}
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.8rem', fontWeight: '700' }}
                                            >
                                                <option value="">SELECCIONAR GRUPO...</option>
                                                <option value="INVENTARIO DE ABARROTES, FRUTOS SECOS, LACTEOS Y CARNES FRIAS">INVENTARIO DE ABARROTES, FRUTOS SECOS, LACTEOS Y CARNES FRIAS</option>
                                                <option value="INVENTARIO DE FRESAS Y MORAS">INVENTARIO DE FRESAS Y MORAS</option>
                                                <option value="INVENTARIO DE FRUTAS Y OTROS">INVENTARIO DE FRUTAS Y OTROS</option>
                                                <option value="INVENTARIO DE HORTALIZAS">INVENTARIO DE HORTALIZAS</option>
                                                <option value="INVENTARIO DE PAPAS, PLATANO, TOMATE Y AGUACATES">INVENTARIO DE PAPAS, PLATANO, TOMATE Y AGUACATES</option>
                                                <option value="INVENTARIO DE VERDURAS">INVENTARIO DE VERDURAS</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Columna Derecha: Parámetros Operativos */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 0.9fr', gap: '0.8rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#374151', margin: 0 }}>
                                                    Unidad Compras
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowUnitGuideModal(true)}
                                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: '#3B82F6' }}
                                                    title="Ver guía de compras"
                                                >
                                                    <HelpCircle size={14} />
                                                </button>
                                            </div>
                                            <select
                                                value={formData.unit_of_measure?.toLowerCase() === 'unidad' ? 'Unidad' : 'Kg'}
                                                onChange={(e) => {
                                                    const newUnit = e.target.value;
                                                    let newWeight = formData.weight_kg;
                                                    if (newUnit === 'Kg') {
                                                        newWeight = (formData.weight_kg !== undefined && formData.weight_kg > 0 && formData.weight_kg <= 10) ? formData.weight_kg : 0.1;
                                                    } else {
                                                        newWeight = (formData.weight_kg !== undefined && formData.weight_kg > 0) ? formData.weight_kg : 1.0;
                                                    }
                                                    setFormData({ ...formData, unit_of_measure: newUnit, weight_kg: newWeight });
                                                }}
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '1rem', cursor: 'pointer', fontWeight: '700', color: '#111827' }}
                                            >
                                                <option value="Kg">Kg (Por Peso / Granel)</option>
                                                <option value="Unidad">Unidad (Discreto)</option>
                                            </select>
                                        </div>

                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: formData.unit_of_measure?.toLowerCase() === 'unidad' ? '#065F46' : '#6B7280', margin: 0 }}>
                                                    {formData.unit_of_measure?.toLowerCase() === 'unidad' ? 'Peso Unit. (kg)' : 'Peso Log. (kg)'}
                                                </label>
                                                {formData.unit_of_measure?.toLowerCase() === 'unidad' && (
                                                    <span style={{ fontSize: '0.65rem', fontWeight: '800', backgroundColor: '#ECFDF5', color: '#047857', padding: '1px 5px', borderRadius: '4px' }}>
                                                        DESPACHO
                                                    </span>
                                                )}
                                            </div>
                                            <input
                                                type="number"
                                                step="0.001"
                                                min="0.001"
                                                readOnly={formData.unit_of_measure?.toLowerCase() !== 'unidad'}
                                                disabled={formData.unit_of_measure?.toLowerCase() !== 'unidad'}
                                                value={formData.unit_of_measure?.toLowerCase() === 'unidad' 
                                                    ? (formData.weight_kg !== undefined && formData.weight_kg !== null ? formData.weight_kg : 0.3)
                                                    : 1.0
                                                }
                                                onChange={(e) => {
                                                    const val = e.target.value === '' ? 0.3 : parseFloat(e.target.value);
                                                    setFormData({ ...formData, weight_kg: val });
                                                }}
                                                onFocus={(e) => e.target.select()}
                                                title={formData.unit_of_measure?.toLowerCase() !== 'unidad' ? 'En compras por Kilos, 1 kg siempre equivale a 1.00 kg base' : 'Peso físico real de una unidad/botella/frasco/cubeta'}
                                                style={{ 
                                                    width: '100%', 
                                                    padding: '0.8rem', 
                                                    borderRadius: '8px', 
                                                    border: formData.unit_of_measure?.toLowerCase() === 'unidad' ? '1.5px solid #10B981' : '1px solid #E2E8F0', 
                                                    backgroundColor: formData.unit_of_measure?.toLowerCase() === 'unidad' ? '#FFFFFF' : '#F1F5F9',
                                                    color: formData.unit_of_measure?.toLowerCase() === 'unidad' ? '#065F46' : '#94A3B8',
                                                    fontSize: '1rem', 
                                                    fontWeight: '800',
                                                    cursor: formData.unit_of_measure?.toLowerCase() === 'unidad' ? 'text' : 'not-allowed'
                                                }}
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#B91C1C', marginBottom: '4px' }}>
                                                Mín. Inventario ({formData.unit_of_measure || 'Kg'})
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={formData.min_inventory_level !== undefined && formData.min_inventory_level !== null ? formData.min_inventory_level : 0}
                                                onChange={(e) => {
                                                    const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                                                    setFormData({ ...formData, min_inventory_level: isNaN(val) ? 0 : val });
                                                }}
                                                onFocus={(e) => e.target.select()}
                                                placeholder="0"
                                                style={{ 
                                                    width: '100%', 
                                                    padding: '0.8rem', 
                                                    borderRadius: '8px', 
                                                    border: formData.min_inventory_level && formData.min_inventory_level > 0 ? '1.5px solid #FCA5A5' : '1px solid #D1D5DB', 
                                                    backgroundColor: formData.min_inventory_level && formData.min_inventory_level > 0 ? '#FEF2F2' : '#FFFFFF', 
                                                    fontSize: '1rem', 
                                                    fontWeight: '800', 
                                                    color: formData.min_inventory_level && formData.min_inventory_level > 0 ? '#991B1B' : '#374151' 
                                                }}
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>IVA (%)</label>
                                            <select
                                                value={formData.iva_rate}
                                                onChange={(e) => setFormData({ ...formData, iva_rate: parseInt(e.target.value) })}
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '1rem', fontWeight: '800' }}
                                            >
                                                <option value={0}>0%</option>
                                                <option value={5}>5%</option>
                                                <option value={19}>19%</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* MICRO-BANNER PEDAGÓGICO DE COHERENCIA LOGÍSTICA */}
                                    {formData.unit_of_measure?.toLowerCase() === 'unidad' ? (
                                        <div style={{
                                            backgroundColor: '#EFF6FF',
                                            border: '1px solid #BFDBFE',
                                            padding: '8px 12px',
                                            borderRadius: '10px',
                                            fontSize: '0.78rem',
                                            color: '#1E40AF',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            <Package size={15} style={{ flexShrink: 0, color: '#2563EB' }} />
                                            <span><strong>Unidad Discreta (Abarrotes / Botellas / Cubetas):</strong> Registra el peso real de 1 envase/unidad en báscula. Es mandatorio para que el sistema cubique con exactitud la capacidad del camión.</span>
                                        </div>
                                    ) : (
                                        <div style={{
                                            backgroundColor: '#F0FDF4',
                                            border: '1px solid #BBF7D0',
                                            padding: '8px 12px',
                                            borderRadius: '10px',
                                            fontSize: '0.78rem',
                                            color: '#166534',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            <Scale size={15} style={{ flexShrink: 0, color: '#16A34A' }} />
                                            <span><strong>Granel / Por Peso (Kg):</strong> 1 kilo siempre pesa 1,00 kg físico inmutable. Si comercializas este SKU en presentaciones por unidad física o atado (ej. Atado 300 gr), configúralas en la <strong>Pestaña 3 (Venta Web / Poka-Yoke)</strong>.</span>
                                        </div>
                                    )}

                                    {/* Banner inteligente hacia gestión comercial E-Commerce */}
                                    <div style={{ 
                                        padding: '0.9rem 1.1rem', 
                                        backgroundColor: '#FFF7ED', 
                                        borderRadius: '14px', 
                                        border: '1.5px solid #FED7AA',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '12px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ padding: '8px', backgroundColor: '#FFEDD5', borderRadius: '10px', color: '#EA580C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Store size={18} />
                                            </div>
                                            <div>
                                                <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#9A3412', display: 'block', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                    Narrativa y Vitrina E-Commerce B2C
                                                </span>
                                                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#7C2D12', lineHeight: '1.3' }}>
                                                    La descripción bilingüe (ES / EN), nombres públicos y arquetipos Poka-Yoke se gestionan en <strong>Venta Web</strong>.
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('ecommerce')}
                                            style={{ 
                                                whiteSpace: 'nowrap',
                                                padding: '6px 12px', 
                                                backgroundColor: '#EA580C', 
                                                color: 'white', 
                                                border: 'none', 
                                                borderRadius: '8px', 
                                                fontSize: '0.75rem', 
                                                fontWeight: '800', 
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                fontFamily: 'var(--font-outfit), sans-serif',
                                                boxShadow: '0 2px 5px rgba(234, 88, 12, 0.25)',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            <span>Ir a Venta Web</span>
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>

                                    {/* Título de Estados Operativos */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '0.1rem' }}>
                                        <ShieldCheck size={16} color="#1A4D2E" />
                                        <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#1E293B', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            Estados Operativos y Disponibilidad Multicanal
                                        </span>
                                    </div>

                                    {/* Tríada de Estados Operativos (ERP, Tienda Web y Despacho) */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.85rem' }}>
                                        {/* 1. Estado ERP */}
                                        <div style={{ 
                                            padding: '0.85rem', 
                                            backgroundColor: formData.is_active ? '#ECFDF5' : '#FEF2F2', 
                                            borderRadius: '12px', 
                                            border: `1.5px solid ${formData.is_active ? '#A7F3D0' : '#FECACA'}`, 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            justifyContent: 'space-between',
                                            gap: '8px'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: formData.is_active ? '#065F46' : '#991B1B', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                    ESTADO ERP
                                                </span>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: formData.is_active ? '#10B981' : '#EF4444' }} />
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.68rem', color: '#6B7280', lineHeight: '1.2' }}>Compras y operaciones</p>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                                                style={{ 
                                                    width: '100%',
                                                    padding: '6px 0', 
                                                    borderRadius: '8px', 
                                                    border: 'none', 
                                                    backgroundColor: formData.is_active ? '#10B981' : '#EF4444', 
                                                    color: 'white', 
                                                    fontWeight: '900', 
                                                    fontSize: '0.75rem', 
                                                    cursor: 'pointer',
                                                    boxShadow: formData.is_active ? '0 2px 6px rgba(16, 185, 129, 0.25)' : '0 2px 6px rgba(239, 68, 68, 0.25)',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                {formData.is_active ? 'HABILITADO' : 'SUSPENDIDO'}
                                            </button>
                                        </div>

                                        {/* 2. Tienda Web B2C */}
                                        <div style={{ 
                                            padding: '0.85rem', 
                                            backgroundColor: (formData as any).show_on_web !== false ? '#EFF6FF' : '#F9FAFB', 
                                            borderRadius: '12px', 
                                            border: `1.5px solid ${(formData as any).show_on_web !== false ? '#BFDBFE' : '#D1D5DB'}`, 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            justifyContent: 'space-between',
                                            gap: '8px'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: (formData as any).show_on_web !== false ? '#1E40AF' : '#475569', fontFamily: 'var(--font-outfit), sans-serif', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Globe size={13} color={(formData as any).show_on_web !== false ? '#2563EB' : '#94A3B8'} /> TIENDA WEB
                                                </span>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: (formData as any).show_on_web !== false ? '#2563EB' : '#94A3B8' }} />
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.68rem', color: '#6B7280', lineHeight: '1.2' }}>Catálogo público B2C</p>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, show_on_web: !(formData as any).show_on_web } as any)}
                                                style={{ 
                                                    width: '100%',
                                                    padding: '6px 0', 
                                                    borderRadius: '8px', 
                                                    border: 'none', 
                                                    backgroundColor: (formData as any).show_on_web !== false ? '#2563EB' : '#94A3B8', 
                                                    color: 'white', 
                                                    fontWeight: '900', 
                                                    fontSize: '0.75rem', 
                                                    cursor: 'pointer',
                                                    boxShadow: (formData as any).show_on_web !== false ? '0 2px 6px rgba(37, 99, 235, 0.25)' : 'none',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                {(formData as any).show_on_web !== false ? 'VISIBLE' : 'OCULTO'}
                                            </button>
                                        </div>

                                        {/* 3. Etiqueta Térmica */}
                                        <div style={{ 
                                            padding: '0.85rem', 
                                            backgroundColor: (formData as any).requires_label ? '#F0FDF4' : '#F9FAFB', 
                                            borderRadius: '12px', 
                                            border: `1.5px solid ${(formData as any).requires_label ? '#BBF7D0' : '#D1D5DB'}`, 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            justifyContent: 'space-between',
                                            gap: '8px'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: (formData as any).requires_label ? '#166534' : '#475569', fontFamily: 'var(--font-outfit), sans-serif', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Tag size={13} color={(formData as any).requires_label ? '#166534' : '#94A3B8'} /> TÉRMICA
                                                </span>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: (formData as any).requires_label ? '#15803D' : '#94A3B8' }} />
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.68rem', color: '#6B7280', lineHeight: '1.2' }}>Sticker de despacho</p>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, requires_label: !(formData as any).requires_label } as any)}
                                                style={{ 
                                                    width: '100%',
                                                    padding: '6px 0', 
                                                    borderRadius: '8px', 
                                                    border: 'none', 
                                                    backgroundColor: (formData as any).requires_label ? '#15803D' : '#94A3B8', 
                                                    color: 'white', 
                                                    fontWeight: '900', 
                                                    fontSize: '0.75rem', 
                                                    cursor: 'pointer',
                                                    boxShadow: (formData as any).requires_label ? '0 2px 6px rgba(21, 128, 61, 0.25)' : 'none',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                {(formData as any).requires_label ? 'SÍ' : 'NO'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ==================================================== */}
                        {/* TAB 2: JERARQUÍA PADRE / HIJOS (INLINE EXPANDED) */}
                        {/* ==================================================== */}
                        {activeTab === 'jerarquia' && (
                            <div>
                                {/* SECCIÓN DE JERARQUÍA (PADRE / HIJO) */}
                    {isParent ? (
                        <div style={{
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '12px',
                            padding: '0.9rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                        }}>
                            {/* Cabecera del Bloque de Hijos */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '8px',
                                        backgroundColor: '#EEF2FF',
                                        color: '#4F46E5',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <GitFork size={16} strokeWidth={2.2} style={{ transform: 'rotate(180deg)' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#1E293B', margin: 0 }}>
                                            Productos Hijos Vinculados (Fraccionados)
                                        </label>
                                        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                            SKUs derivados que dependen de este producto padre
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{
                                        fontSize: '0.65rem',
                                        fontWeight: '800',
                                        padding: '2px 8px',
                                        borderRadius: '9999px',
                                        backgroundColor: '#4F46E5',
                                        color: 'white',
                                        letterSpacing: '0.04em'
                                    }}>
                                        {isSelfChild ? 'PADRE E HIJO' : 'PADRE'}
                                    </span>
                                    <span style={{
                                        fontSize: '0.72rem',
                                        fontWeight: '800',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        backgroundColor: '#ECFDF5',
                                        color: '#065F46',
                                        border: '1px solid #A7F3D0'
                                    }}>
                                        {activeChildrenCount} {activeChildrenCount === 1 ? 'Activo' : 'Activos'}
                                    </span>
                                    {inactiveChildrenCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setFilterOnlyActiveChildren(!filterOnlyActiveChildren)}
                                            style={{
                                                fontSize: '0.68rem',
                                                fontWeight: filterOnlyActiveChildren ? '600' : '700',
                                                padding: '2px 8px',
                                                borderRadius: '8px',
                                                border: filterOnlyActiveChildren ? '1px solid #CBD5E1' : '1px solid #A7F3D0',
                                                backgroundColor: filterOnlyActiveChildren ? '#F8FAFC' : '#ECFDF5',
                                                color: filterOnlyActiveChildren ? '#64748B' : '#065F46',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '3px',
                                                transition: 'all 0.15s ease'
                                            }}
                                            title={filterOnlyActiveChildren ? 'Clic para ver también SKUs inactivos' : 'Clic para filtrar únicamente activos'}
                                        >
                                            {filterOnlyActiveChildren ? (
                                                <span>Ver Todos ({localChildren.length})</span>
                                            ) : (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                    <Check size={11} strokeWidth={2.5} /> Solo Activos
                                                </span>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Lista de Hijos */}
                            {displayedChildren.length === 0 ? (
                                <div style={{
                                    padding: '1rem',
                                    textAlign: 'center',
                                    backgroundColor: 'white',
                                    border: '1px dashed #CBD5E1',
                                    borderRadius: '8px',
                                    color: '#64748B',
                                    fontSize: '0.78rem'
                                }}>
                                    <p style={{ margin: 0, fontWeight: '600' }}>
                                        {localChildren.length === 0 
                                            ? "Este producto es una referencia PADRE, pero aún no tiene SKUs hijos vinculados."
                                            : "No hay productos hijos en estado activo actualmente."}
                                    </p>
                                    {localChildren.length > 0 && filterOnlyActiveChildren ? (
                                        <button
                                            type="button"
                                            onClick={() => setFilterOnlyActiveChildren(false)}
                                            style={{
                                                marginTop: '6px',
                                                padding: '2px 8px',
                                                fontSize: '0.7rem',
                                                color: '#2563EB',
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                textDecoration: 'underline'
                                            }}
                                        >
                                            Ver {localChildren.length} SKUs inactivos
                                        </button>
                                    ) : (
                                        <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#94A3B8' }}>
                                            Usa el botón inferior para buscar y vincular un producto hijo.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                    maxHeight: '220px',
                                    overflowY: 'auto',
                                    paddingRight: '2px'
                                }}>
                                    {displayedChildren.map((child) => (
                                        <div 
                                            key={child.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '8px 10px',
                                                backgroundColor: 'white',
                                                border: '1px solid #E2E8F0',
                                                borderRadius: '8px',
                                                gap: '8px',
                                                transition: 'all 0.15s ease'
                                            }}
                                            onMouseOver={(e) => {
                                                e.currentTarget.style.borderColor = '#93C5FD';
                                                e.currentTarget.style.backgroundColor = '#F0F7FF';
                                            }}
                                            onMouseOut={(e) => {
                                                e.currentTarget.style.borderColor = '#E2E8F0';
                                                e.currentTarget.style.backgroundColor = 'white';
                                            }}
                                        >
                                            {/* Thumbnail + SKU + Nombre */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '6px',
                                                    overflow: 'hidden',
                                                    backgroundColor: '#F8FAFC',
                                                    flexShrink: 0,
                                                    border: '1px solid #E2E8F0',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    {child.image_url ? (
                                                        <img 
                                                            src={child.image_url} 
                                                            alt={child.name} 
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                        />
                                                    ) : (
                                                        <Package size={16} strokeWidth={1.5} style={{ color: '#94A3B8' }} />
                                                    )}
                                                </div>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{
                                                            fontSize: '0.68rem',
                                                            fontWeight: '800',
                                                            color: '#1E40AF',
                                                            backgroundColor: '#EFF6FF',
                                                            padding: '1px 5px',
                                                            borderRadius: '4px',
                                                            border: '1px solid #DBEAFE',
                                                            fontFamily: 'monospace'
                                                        }}>
                                                            #{child.accounting_id || child.sku}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.8rem',
                                                            fontWeight: '700',
                                                            color: '#1E293B',
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis'
                                                        }} title={child.name}>
                                                            {child.name}
                                                        </span>
                                                        {child.id === product.id && (
                                                            <span style={{
                                                                fontSize: '0.62rem',
                                                                fontWeight: '800',
                                                                backgroundColor: '#EDE9FE',
                                                                color: '#6D28D9',
                                                                padding: '1px 5px',
                                                                borderRadius: '4px',
                                                                border: '1px solid #DDD6FE',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                SKU Base
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', fontSize: '0.68rem', color: '#64748B' }}>
                                                        <span>Unidad: <strong>{child.unit_of_measure || 'Kg'}</strong></span>
                                                        {(child as any).inherit_price ? (
                                                            <span style={{ color: '#2563EB', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                <Zap size={11} strokeWidth={2} /> Hereda costo {child.utility_deviation_pct ? `(+${child.utility_deviation_pct}%)` : ''}
                                                            </span>
                                                        ) : (
                                                            <span>Base: <strong>${(child.base_price || 0).toLocaleString('es-CO')}</strong></span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Badges & Acciones */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: '700',
                                                    padding: '2px 6px',
                                                    borderRadius: '8px',
                                                    backgroundColor: child.is_active ? '#ECFDF5' : '#F1F5F9',
                                                    color: child.is_active ? '#065F46' : '#64748B',
                                                    border: `1px solid ${child.is_active ? '#A7F3D0' : '#E2E8F0'}`
                                                }}>
                                                    {child.is_active ? 'Activo' : 'Inactivo'}
                                                </span>

                                                {onSelectProduct && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onSelectProduct(child)}
                                                        title="Editar este SKU hijo"
                                                        style={{
                                                            padding: '3px 8px',
                                                            fontSize: '0.68rem',
                                                            fontWeight: '700',
                                                            borderRadius: '6px',
                                                            border: '1px solid #BFDBFE',
                                                            backgroundColor: '#EFF6FF',
                                                            color: '#1D4ED8',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px'
                                                        }}
                                                    >
                                                        <Edit3 size={11} /> Editar
                                                    </button>
                                                )}

                                                {!readOnly && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUnlinkChild(child.id, child.name)}
                                                        disabled={unlinkingChildId === child.id}
                                                        title="Desvincular de este padre"
                                                        style={{
                                                            padding: '3px 6px',
                                                            fontSize: '0.68rem',
                                                            fontWeight: '700',
                                                            borderRadius: '6px',
                                                            border: '1px solid #FECACA',
                                                            backgroundColor: '#FEF2F2',
                                                            color: '#DC2626',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center'
                                                        }}
                                                    >
                                                        <X size={11} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Vincular Nuevo Hijo */}
                            {!readOnly && (
                                <div style={{ position: 'relative', marginTop: '2px' }}>
                                    {!showAddChildSearch ? (
                                        <button
                                            type="button"
                                            onClick={() => setShowAddChildSearch(true)}
                                            style={{
                                                width: '100%',
                                                padding: '6px 10px',
                                                backgroundColor: 'white',
                                                border: '1px dashed #94A3B8',
                                                borderRadius: '8px',
                                                color: '#2563EB',
                                                fontSize: '0.75rem',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                transition: 'all 0.15s ease'
                                            }}
                                            onMouseOver={(e) => {
                                                e.currentTarget.style.borderColor = '#2563EB';
                                                e.currentTarget.style.backgroundColor = '#EFF6FF';
                                            }}
                                            onMouseOut={(e) => {
                                                e.currentTarget.style.borderColor = '#94A3B8';
                                                e.currentTarget.style.backgroundColor = 'white';
                                            }}
                                        >
                                            <Plus size={13} /> Vincular otro producto hijo
                                        </button>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                <div style={{ position: 'relative', flex: 1 }}>
                                                    <input
                                                        type="text"
                                                        autoFocus
                                                        placeholder="Buscar producto por nombre o ID Contable..."
                                                        value={addChildQuery}
                                                        onChange={(e) => setAddChildQuery(e.target.value)}
                                                        style={{
                                                            width: '100%',
                                                            padding: '6px 8px 6px 28px',
                                                            borderRadius: '6px',
                                                            border: '1px solid #2563EB',
                                                            fontSize: '0.78rem',
                                                            fontWeight: '600',
                                                            outline: 'none'
                                                        }}
                                                    />
                                                    <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#6B7280' }} />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowAddChildSearch(false);
                                                        setAddChildQuery('');
                                                    }}
                                                    style={{
                                                        padding: '6px 10px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #D1D5DB',
                                                        backgroundColor: 'white',
                                                        color: '#6B7280',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Cancelar
                                                </button>
                                            </div>

                                            {/* Resultados de Búsqueda de Hijos */}
                                            {addChildQuery.trim() && (
                                                <div style={{
                                                    backgroundColor: 'white',
                                                    border: '1px solid #D1D5DB',
                                                    borderRadius: '8px',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                                    maxHeight: '180px',
                                                    overflowY: 'auto',
                                                    zIndex: 10
                                                }}>
                                                    {availableChildrenCandidates.length === 0 ? (
                                                        <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#9CA3AF', textAlign: 'center' }}>
                                                            No se encontraron productos disponibles para vincular como hijo.
                                                        </div>
                                                    ) : (
                                                        availableChildrenCandidates.map((candidate) => (
                                                            <div
                                                                key={candidate.id}
                                                                onClick={() => handleLinkChild(candidate)}
                                                                style={{
                                                                    padding: '6px 10px',
                                                                    borderBottom: '1px solid #F1F5F9',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'space-between',
                                                                    fontSize: '0.75rem'
                                                                }}
                                                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#EFF6FF'}
                                                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                            >
                                                                <div>
                                                                    <span style={{ fontWeight: '800', color: '#2563EB', marginRight: '6px' }}>
                                                                        #{candidate.accounting_id || candidate.sku}
                                                                    </span>
                                                                    <span style={{ fontWeight: '600', color: '#1E293B' }}>
                                                                        {candidate.name}
                                                                    </span>
                                                                    {candidate.id === product.id && (
                                                                        <span style={{ marginLeft: '6px', fontSize: '0.65rem', fontWeight: '800', backgroundColor: '#EDE9FE', color: '#6D28D9', padding: '1px 5px', borderRadius: '4px', border: '1px solid #DDD6FE' }}>
                                                                            SKU Base
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span style={{ fontSize: '0.7rem', color: candidate.id === product.id ? '#6D28D9' : '#059669', fontWeight: '700' }}>
                                                                    {candidate.id === product.id ? '+ Vincular como SKU Hijo' : '+ Vincular'}
                                                                </span>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* SI ES HIJO O STANDALONE, NO HABRÍAN CAMBIOS */
                        <div style={{ position: 'relative' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Vincular a Producto Padre (Hijo de...)</label>
                            <input
                                type="text"
                                placeholder={hasChildren ? "Bloqueado: Este producto ya es PADRE" : "Buscar padre por nombre o ID Contable..."}
                                value={parentSearch || (formData.parent_id ? (() => {
                                    const p = allProducts.find(i => i.id === formData.parent_id);
                                    return p ? `ID: #${p.accounting_id || p.sku} - ${p.name}` : '';
                                })() : '')}
                                onChange={(e) => {
                                    setParentSearch(e.target.value);
                                    setShowParentResults(true);
                                }}
                                onFocus={() => !hasChildren && setShowParentResults(true)}
                                disabled={hasChildren}
                                style={{ 
                                    width: '100%', 
                                    padding: '0.8rem', 
                                    borderRadius: '8px', 
                                    border: '1px solid #D1D5DB', 
                                    fontSize: '0.95rem', 
                                    fontWeight: 'bold', 
                                    color: formData.parent_id ? '#1E40AF' : 'inherit',
                                    backgroundColor: hasChildren ? '#F3F4F6' : 'white',
                                    cursor: hasChildren ? 'not-allowed' : 'text'
                                }}
                            />
                            {hasChildren && (
                                <p style={{ fontSize: '0.7rem', color: '#EF4444', marginTop: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <AlertTriangle size={12} strokeWidth={2} /> Este producto ya es PADRE de otros productos. No puede ser vinculado a otro nivel superior.
                                </p>
                            )}
                            {showParentResults && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #D1D5DB', borderRadius: '8px', marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
                                    <div 
                                        onClick={() => {
                                            setFormData({ ...formData, parent_id: null });
                                            setParentSearch('');
                                            setShowParentResults(false);
                                        }}
                                        style={{ padding: '0.8rem', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', color: '#EF4444', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        <X size={14} strokeWidth={2.2} /> Desvincular Padre
                                    </div>
                                    {allProducts
                                        .filter(p => 
                                            p.id !== product.id && 
                                            p.parent_id !== product.id &&
                                            (p.name.toLowerCase().includes(parentSearch.toLowerCase()) || (p.accounting_id?.toString() || '').includes(parentSearch) || p.sku.toLowerCase().includes(parentSearch.toLowerCase()))
                                        )
                                        .slice(0, 10)
                                        .map(p => (
                                            <div 
                                                key={p.id}
                                                onClick={() => {
                                                    setFormData({ ...formData, parent_id: p.id });
                                                    setParentSearch(`ID: #${p.accounting_id || p.sku} - ${p.name}`);
                                                    setShowParentResults(false);
                                                }}
                                                style={{ padding: '0.8rem', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', transition: 'background 0.2s' }}
                                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                                <div style={{ fontWeight: '800', color: '#2563EB' }}>ID: #{p.accounting_id || p.sku}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>{p.name}</div>
                                            </div>
                                        ))
                                    }
                                </div>
                            )}
                        </div>
                    )}

                    {/* Lógica de Desviación de Utilidad (Solo si es Hijo y NO es Padre de otros) */}
                    {!isParent && formData.parent_id && formData.parent_id !== product.id && (
                        <div style={{ padding: '1.2rem', backgroundColor: '#EFF6FF', borderRadius: '16px', border: '1px solid #BFDBFE', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1E40AF', fontWeight: '800', fontSize: '0.85rem' }}>
                                    <Sliders size={16} strokeWidth={2} />
                                    <span>CONFIGURACIÓN DE HIJO (FRACCIONADO)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', color: (formData as any).inherit_price ? '#2563EB' : '#6B7280' }}>
                                        {(formData as any).inherit_price ? 'HEREDAR PRECIO' : 'PRECIO INDEPENDIENTE'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, inherit_price: !(formData as any).inherit_price } as any)}
                                        style={{
                                            width: '40px',
                                            height: '20px',
                                            borderRadius: '10px',
                                            backgroundColor: (formData as any).inherit_price ? '#2563EB' : '#D1D5DB',
                                            border: 'none',
                                            position: 'relative',
                                            cursor: 'pointer',
                                            transition: 'background-color 0.2s'
                                        }}
                                    >
                                        <div style={{
                                            width: '16px',
                                            height: '16px',
                                            borderRadius: '50%',
                                            backgroundColor: 'white',
                                            position: 'absolute',
                                            top: '2px',
                                            left: (formData as any).inherit_price ? '22px' : '2px',
                                            transition: 'left 0.2s'
                                        }} />
                                    </button>
                                </div>
                            </div>

                            <p style={{ fontSize: '0.75rem', color: '#6B7280', margin: 0 }}>
                                {(formData as any).inherit_price 
                                    ? "Este producto hereda los costos del Padre. Define aquí la utilidad adicional." 
                                    : "Este producto tiene un precio independiente. No se verá afectado por cambios en el padre."}
                            </p>

                            {(formData as any).inherit_price && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '900', color: '#1E40AF', marginBottom: '4px' }}>Ajuste de Utilidad (%)</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input 
                                                type="number"
                                                value={formData.utility_deviation_pct}
                                                onChange={(e) => setFormData({ ...formData, utility_deviation_pct: parseFloat(e.target.value) || 0 })}
                                                style={{ width: '80px', padding: '0.6rem', borderRadius: '8px', border: '2px solid #2563EB', fontWeight: '900', textAlign: 'center' }}
                                            />
                                            <span style={{ fontWeight: '800', color: '#2563EB' }}>% ADICIONAL</span>
                                        </div>
                                    </div>
                                    {(() => {
                                        const parent = allProducts.find(p => p.id === formData.parent_id);
                                        return (
                                            <div style={{ flex: 1, textAlign: 'right', fontSize: '0.75rem', color: '#1E40AF' }}>
                                                Padre vinculado: <br />
                                                <strong style={{ fontSize: '0.85rem' }}>{parent?.sku || 'Cargando...'}</strong>
                                                {parent && <span style={{ display: 'block', opacity: 0.8, fontSize: '0.75rem', fontWeight: 'bold' }}>{parent.name}</span>}
                                                {parent && onSelectProduct && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onSelectProduct(parent)}
                                                        style={{
                                                            marginTop: '4px',
                                                            padding: '2px 8px',
                                                            fontSize: '0.68rem',
                                                            fontWeight: '700',
                                                            borderRadius: '4px',
                                                            border: '1px solid #93C5FD',
                                                            backgroundColor: '#DBEAFE',
                                                            color: '#1E40AF',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px'
                                                        }}
                                                    >
                                                        Ver Padre ↗
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    )}
                            </div>
                        )}

                        {/* ==================================================== */}
                        {/* TAB 3: E-COMMERCE HOGAR (POKA-YOKE) */}
                        {/* ==================================================== */}
                        {activeTab === 'ecommerce' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', backgroundColor: '#FFFDF9', padding: '1.5rem', borderRadius: '20px', border: '1.5px solid #FED7AA' }}>
                                
                                {/* Header Comercial con Botón de Guía */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #FFEDD5', paddingBottom: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ backgroundColor: '#FFEDD5', padding: '10px', borderRadius: '12px', color: '#C2410C' }}>
                                            <ShoppingCart size={22} strokeWidth={2.2} />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: '#9A3412' }}>
                                                Asistente Comercial Poka-Yoke (Web Hogar B2C)
                                            </h3>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#7C2D12' }}>
                                                Configuración guiada para clientes en línea. Protegido contra errores y aislado del canal B2B.
                                            </p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {/* Botón de Guía */}
                                        <button
                                            type="button"
                                            onClick={() => setShowEcommerceGuideModal(true)}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '8px 16px',
                                                backgroundColor: '#FFFFFF',
                                                border: '1.5px solid #FDBA74',
                                                borderRadius: '12px',
                                                color: '#C2410C',
                                                fontSize: '0.82rem',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                boxShadow: '0 2px 5px rgba(194, 65, 12, 0.08)',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            <HelpCircle size={16} strokeWidth={2.2} />
                                            <span>Guía de Estrategia E-Commerce</span>
                                        </button>

                                        {/* Toggle Visible en Web */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'white', padding: '6px 12px', borderRadius: '12px', border: '1px solid #FED7AA' }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#9A3412' }}>TIENDA WEB:</span>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, show_on_web: !(formData as any).show_on_web } as any)}
                                                style={{
                                                    padding: '4px 12px',
                                                    borderRadius: '16px',
                                                    border: 'none',
                                                    backgroundColor: (formData as any).show_on_web !== false ? '#2563EB' : '#9CA3AF',
                                                    color: 'white',
                                                    fontWeight: '900',
                                                    fontSize: '0.75rem',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {(formData as any).show_on_web !== false ? 'VISIBLE' : 'OCULTO'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Nombres Comerciales Públicos (ES & EN) */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: '800', color: '#9A3412', fontFamily: 'var(--font-outfit), sans-serif', margin: 0 }}>
                                                <span style={{ padding: '1px 6px', backgroundColor: '#FEF3C7', color: '#B45309', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '900' }}>ES</span>
                                                Nombre Público en la Tienda (Español)
                                            </label>

                                            {hasSpellingSuggestion(formData.display_name || '') && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const corrected = normalizeCatalogSpelling(formData.display_name || '');
                                                        setFormData(prev => ({ ...prev, display_name: corrected }));
                                                    }}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        padding: '2px 8px',
                                                        backgroundColor: '#FEF3C7',
                                                        border: '1px solid #FCD34D',
                                                        borderRadius: '6px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: '800',
                                                        color: '#B45309',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s'
                                                    }}
                                                    title="Clic para aplicar corrección ortográfica oficial"
                                                >
                                                    <Sparkles size={11} color="#D97706" />
                                                    Sugerencia: {getSpellingSuggestion(formData.display_name || '')} (Aplicar)
                                                </button>
                                            )}
                                        </div>
                                        <input
                                            type="text"
                                            lang="es"
                                            spellCheck={true}
                                            placeholder="Ej: Tomate Chonto Madurado, Melón Cantaloupe Seleccionado..."
                                            value={formData.display_name || ''}
                                            onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                                            onBlur={() => {
                                                if (formData.display_name) {
                                                    const normalized = normalizeCatalogSpelling(formData.display_name);
                                                    if (normalized !== formData.display_name) {
                                                        setFormData(prev => ({ ...prev, display_name: normalized }));
                                                    }
                                                }
                                            }}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1.5px solid #FDBA74', fontSize: '0.95rem', fontWeight: '700', backgroundColor: 'white' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: '800', color: '#1E40AF', marginBottom: '4px', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            <span style={{ padding: '1px 6px', backgroundColor: '#DBEAFE', color: '#1E40AF', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '900' }}>EN</span>
                                            English Product Name (?lang=en)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Selected Ripe Chonto Tomato, Fresh Cantaloupe Melon..."
                                            value={formData.name_en || ''}
                                            onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1.5px solid #BFDBFE', fontSize: '0.95rem', fontWeight: '700', backgroundColor: '#F8FAFC' }}
                                        />
                                    </div>
                                </div>

                                {/* CANDADO DE TIPOLOGÍA COMERCIAL (POKA-YOKE) */}
                                {!isTypologyUnlocked ? (
                                    <div style={{
                                        border: '1.5px solid #E2E8F0',
                                        borderRadius: '16px',
                                        backgroundColor: '#FFFFFF',
                                        overflow: 'hidden',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                    }}>
                                        {/* Barra de cabecera protegida */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.75rem 1.15rem',
                                            backgroundColor: '#F8FAFC',
                                            borderBottom: '1.5px solid #E2E8F0'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{
                                                    backgroundColor: '#F1F5F9',
                                                    padding: '4px 8px',
                                                    borderRadius: '6px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '800',
                                                    color: '#475569',
                                                    border: '1px solid #CBD5E1'
                                                }}>
                                                    <Lock size={12} color="#64748B" />
                                                    TIPOLOGÍA ASIGNADA Y PROTEGIDA
                                                </div>
                                                <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: '500' }}>
                                                    • Poka-Yoke contra desconfiguración accidental
                                                </span>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const confirmed = window.confirm(
                                                        '⚠️ ATENCIÓN: Modificar la tipología estructural alterará las reglas de venta web, unidades permitidas y validaciones de este producto.\n\n¿Estás seguro de que deseas desbloquear y cambiar la tipología comercial?'
                                                    );
                                                    if (confirmed) {
                                                        setIsTypologyUnlocked(true);
                                                    }
                                                }}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '0.42rem 0.85rem',
                                                    backgroundColor: 'white',
                                                    border: '1.5px solid #CBD5E1',
                                                    borderRadius: '8px',
                                                    fontSize: '0.76rem',
                                                    fontWeight: '700',
                                                    color: '#334155',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s'
                                                }}
                                                onMouseOver={(e) => {
                                                    e.currentTarget.style.borderColor = '#94A3B8';
                                                    e.currentTarget.style.backgroundColor = '#F1F5F9';
                                                }}
                                                onMouseOut={(e) => {
                                                    e.currentTarget.style.borderColor = '#CBD5E1';
                                                    e.currentTarget.style.backgroundColor = 'white';
                                                }}
                                            >
                                                <Unlock size={13} color="#64748B" />
                                                Cambiar Tipología
                                            </button>
                                        </div>

                                        {/* Vista detallada de la tipología actual activa */}
                                        <div style={{ padding: '1rem 1.15rem' }}>
                                            {commercialTypology === 'bimodal' && (
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '0.9rem 1.15rem',
                                                    borderRadius: '12px',
                                                    border: '1.5px solid #FECACA',
                                                    backgroundColor: '#FEF2F2'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                                                        <div style={{ backgroundColor: '#FEE2E2', padding: '10px', borderRadius: '10px', color: '#DC2626' }}>
                                                            <Tag size={22} strokeWidth={2.5} />
                                                        </div>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#991B1B' }}>
                                                                    Pieza Calibrada &lt; 500g
                                                                </h4>
                                                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#B91C1C', backgroundColor: '#FEE2E2', padding: '2px 7px', borderRadius: '6px' }}>
                                                                    Venta Bimodal (Libra + Unidad)
                                                                </span>
                                                            </div>
                                                            <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#7F1D1D', lineHeight: '1.35' }}>
                                                                Tomate chonto, Hass, Pimentón, Pepino. Permite comprar por <strong>Libra</strong> y por <strong>Unidad</strong> calibrada simultáneamente.
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#DC2626', fontSize: '0.78rem', fontWeight: '700' }}>
                                                        <CheckCircle2 size={16} />
                                                        Activa
                                                    </div>
                                                </div>
                                            )}

                                            {commercialTypology === 'monounidad' && (
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '0.9rem 1.15rem',
                                                    borderRadius: '12px',
                                                    border: '1.5px solid #A7F3D0',
                                                    backgroundColor: '#ECFDF5'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                                                        <div style={{ backgroundColor: '#D1FAE5', padding: '10px', borderRadius: '10px', color: '#059669' }}>
                                                            <ShieldCheck size={22} strokeWidth={2.5} />
                                                        </div>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#065F46' }}>
                                                                    Pieza Grande &ge; 500g
                                                                </h4>
                                                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#047857', backgroundColor: '#D1FAE5', padding: '2px 7px', borderRadius: '6px' }}>
                                                                    Monounidad Blindada
                                                                </span>
                                                            </div>
                                                            <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#064E3B', lineHeight: '1.35' }}>
                                                                Melón, Patilla, Piña, Papaya, Lechuga. <strong>Libra prohibida</strong> por seguridad física en bodega. Solo piezas enteras con calibres oficiales.
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontSize: '0.78rem', fontWeight: '700' }}>
                                                        <CheckCircle2 size={16} />
                                                        Activa
                                                    </div>
                                                </div>
                                            )}

                                            {commercialTypology === 'empaque' && (
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '0.9rem 1.15rem',
                                                    borderRadius: '12px',
                                                    border: '1.5px solid #BFDBFE',
                                                    backgroundColor: '#EFF6FF'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                                                        <div style={{ backgroundColor: '#DBEAFE', padding: '10px', borderRadius: '10px', color: '#2563EB' }}>
                                                            <Package size={22} strokeWidth={2.5} />
                                                        </div>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#1E40AF' }}>
                                                                    Empaque Cerrado
                                                                </h4>
                                                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#1D4ED8', backgroundColor: '#DBEAFE', padding: '2px 7px', borderRadius: '6px' }}>
                                                                    Bandeja / Caja Sellada
                                                                </span>
                                                            </div>
                                                            <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#1E3A8A', lineHeight: '1.35' }}>
                                                                Arándano, Champiñones, Frambuesas, Huevos. Venta exclusiva por empaque con peso de referencia fijo.
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2563EB', fontSize: '0.78rem', fontWeight: '700' }}>
                                                        <CheckCircle2 size={16} />
                                                        Activa
                                                    </div>
                                                </div>
                                            )}

                                            {commercialTypology === 'granel' && (
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '0.9rem 1.15rem',
                                                    borderRadius: '12px',
                                                    border: '1.5px solid #FDE68A',
                                                    backgroundColor: '#FFFBEB'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                                                        <div style={{ backgroundColor: '#FEF3C7', padding: '10px', borderRadius: '10px', color: '#D97706' }}>
                                                            <Scale size={22} strokeWidth={2.5} />
                                                        </div>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#B45309' }}>
                                                                    Granel Continuo
                                                                </h4>
                                                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#B45309', backgroundColor: '#FEF3C7', padding: '2px 7px', borderRadius: '6px' }}>
                                                                    Por Peso / Libra
                                                                </span>
                                                            </div>
                                                            <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#78350F', lineHeight: '1.35' }}>
                                                                Papas, Arvejas, Habichuelas, Uvas. Venta estándar continua por peso / libra (500g).
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#D97706', fontSize: '0.78rem', fontWeight: '700' }}>
                                                        <CheckCircle2 size={16} />
                                                        Activa
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    /* MODO SELECCIÓN DESBLOQUEADO */
                                    <div>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.75rem 1rem',
                                            backgroundColor: '#FFFBEB',
                                            border: '1.5px solid #FDE68A',
                                            borderRadius: '12px',
                                            marginBottom: '10px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <AlertTriangle size={18} color="#D97706" />
                                                <div>
                                                    <strong style={{ fontSize: '0.82rem', color: '#92400E', display: 'block' }}>
                                                        Modo Selección de Tipología Comercial Desbloqueado
                                                    </strong>
                                                    <span style={{ fontSize: '0.72rem', color: '#B45309' }}>
                                                        Selecciona la nueva tipología para este producto o haz clic en Bloquear para proteger la actual.
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setIsTypologyUnlocked(false)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '0.45rem 0.85rem',
                                                    backgroundColor: '#0F172A',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    fontSize: '0.76rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <Lock size={13} color="white" />
                                                Bloquear y Proteger
                                            </button>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                                            {/* 1. Bimodal */}
                                            <div
                                                onClick={() => updatePokaYoke('bimodal', targetGrams < 500 && targetGrams > 0 ? targetGrams : 350, packageType, secondaryGrams && secondaryGrams < 500 ? secondaryGrams : null)}
                                                style={{
                                                    padding: '1rem',
                                                    borderRadius: '14px',
                                                    cursor: 'pointer',
                                                    border: commercialTypology === 'bimodal' ? '2.5px solid #DC2626' : '1.5px solid #E2E8F0',
                                                    backgroundColor: commercialTypology === 'bimodal' ? '#FEF2F2' : 'white',
                                                    boxShadow: commercialTypology === 'bimodal' ? '0 4px 12px rgba(220, 38, 38, 0.15)' : 'none',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                    <div style={{ backgroundColor: '#FEE2E2', padding: '6px', borderRadius: '8px', color: '#DC2626' }}>
                                                        <Tag size={16} strokeWidth={2.5} />
                                                    </div>
                                                    {commercialTypology === 'bimodal' && (
                                                        <CheckCircle2 size={18} color="#DC2626" strokeWidth={2.5} />
                                                    )}
                                                </div>
                                                <strong style={{ fontSize: '0.88rem', color: '#991B1B', display: 'block' }}>
                                                    Pieza Calibrada &lt; 500g
                                                </strong>
                                                <span style={{ fontSize: '0.72rem', color: '#7F1D1D', fontWeight: '800', display: 'block', marginTop: '2px' }}>
                                                    (Venta Bimodal)
                                                </span>
                                                <p style={{ fontSize: '0.7rem', color: '#6B7280', margin: '6px 0 0', lineHeight: '1.3' }}>
                                                    Tomate chonto, Hass, Pimentón, Pepino. Permite comprar por <strong>Libra</strong> Y por <strong>Unidad</strong>.
                                                </p>
                                            </div>

                                            {/* 2. Monounidad */}
                                            <div
                                                onClick={() => updatePokaYoke('monounidad', targetGrams >= 500 ? targetGrams : 2000, packageType, secondaryGrams && secondaryGrams >= 500 ? secondaryGrams : null)}
                                                style={{
                                                    padding: '1rem',
                                                    borderRadius: '14px',
                                                    cursor: 'pointer',
                                                    border: commercialTypology === 'monounidad' ? '2.5px solid #059669' : '1.5px solid #E2E8F0',
                                                    backgroundColor: commercialTypology === 'monounidad' ? '#ECFDF5' : 'white',
                                                    boxShadow: commercialTypology === 'monounidad' ? '0 4px 12px rgba(5, 150, 105, 0.15)' : 'none',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                    <div style={{ backgroundColor: '#D1FAE5', padding: '6px', borderRadius: '8px', color: '#059669' }}>
                                                        <ShieldCheck size={16} strokeWidth={2.5} />
                                                    </div>
                                                    {commercialTypology === 'monounidad' && (
                                                        <CheckCircle2 size={18} color="#059669" strokeWidth={2.5} />
                                                    )}
                                                </div>
                                                <strong style={{ fontSize: '0.88rem', color: '#065F46', display: 'block' }}>
                                                    Pieza Grande &ge; 500g
                                                </strong>
                                                <span style={{ fontSize: '0.72rem', color: '#064E3B', fontWeight: '800', display: 'block', marginTop: '2px' }}>
                                                    (Monounidad)
                                                </span>
                                                <p style={{ fontSize: '0.7rem', color: '#6B7280', margin: '6px 0 0', lineHeight: '1.3' }}>
                                                    Melón, Patilla, Piña, Papaya, Lechuga. <strong>Libra prohibida.</strong> Solo piezas enteras.
                                                </p>
                                            </div>

                                            {/* 3. Empaque Cerrado */}
                                            <div
                                                onClick={() => updatePokaYoke('empaque', targetGrams > 0 && targetGrams < 500 ? targetGrams : 125, packageType || 'Bandeja', secondaryGrams)}
                                                style={{
                                                    padding: '1rem',
                                                    borderRadius: '14px',
                                                    cursor: 'pointer',
                                                    border: commercialTypology === 'empaque' ? '2.5px solid #2563EB' : '1.5px solid #E2E8F0',
                                                    backgroundColor: commercialTypology === 'empaque' ? '#EFF6FF' : 'white',
                                                    boxShadow: commercialTypology === 'empaque' ? '0 4px 12px rgba(37, 99, 235, 0.15)' : 'none',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                    <div style={{ backgroundColor: '#DBEAFE', padding: '6px', borderRadius: '8px', color: '#2563EB' }}>
                                                        <Package size={16} strokeWidth={2.5} />
                                                    </div>
                                                    {commercialTypology === 'empaque' && (
                                                        <CheckCircle2 size={18} color="#2563EB" strokeWidth={2.5} />
                                                    )}
                                                </div>
                                                <strong style={{ fontSize: '0.88rem', color: '#1E40AF', display: 'block' }}>
                                                    Empaque Cerrado
                                                </strong>
                                                <span style={{ fontSize: '0.72rem', color: '#1E3A8A', fontWeight: '800', display: 'block', marginTop: '2px' }}>
                                                    (Bandeja / Caja)
                                                </span>
                                                <p style={{ fontSize: '0.7rem', color: '#6B7280', margin: '6px 0 0', lineHeight: '1.3' }}>
                                                    Arándano, Champiñones, Frambuesas, Huevos. Venta exclusiva por paquete sellado.
                                                </p>
                                            </div>

                                            {/* 4. Granel */}
                                            <div
                                                onClick={() => updatePokaYoke('granel', 500, packageType)}
                                                style={{
                                                    padding: '1rem',
                                                    borderRadius: '14px',
                                                    cursor: 'pointer',
                                                    border: commercialTypology === 'granel' ? '2.5px solid #D97706' : '1.5px solid #E2E8F0',
                                                    backgroundColor: commercialTypology === 'granel' ? '#FFFBEB' : 'white',
                                                    boxShadow: commercialTypology === 'granel' ? '0 4px 12px rgba(217, 119, 6, 0.15)' : 'none',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                    <div style={{ backgroundColor: '#FEF3C7', padding: '6px', borderRadius: '8px', color: '#D97706' }}>
                                                        <Scale size={16} strokeWidth={2.5} />
                                                    </div>
                                                    {commercialTypology === 'granel' && (
                                                        <CheckCircle2 size={18} color="#D97706" strokeWidth={2.5} />
                                                    )}
                                                </div>
                                                <strong style={{ fontSize: '0.88rem', color: '#B45309', display: 'block' }}>
                                                    Granel Continuo
                                                </strong>
                                                <span style={{ fontSize: '0.72rem', color: '#78350F', fontWeight: '800', display: 'block', marginTop: '2px' }}>
                                                    (Por Peso / Libra)
                                                </span>
                                                <p style={{ fontSize: '0.7rem', color: '#6B7280', margin: '6px 0 0', lineHeight: '1.3' }}>
                                                    Papas, Arvejas, Habichuelas, Uvas. Venta estándar continua por Libra (500g).
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* CAMPOS DINÁMICOS GUIADOS SEGÚN LA TIPOLOGÍA CON GOBERNANZA CENTRALIZADA */}
                                <div style={{ backgroundColor: 'white', padding: '1.2rem', borderRadius: '16px', border: '1.5px solid #FED7AA' }}>
                                    
                                    {/* Caso 1: Bimodal */}
                                    {commercialTypology === 'bimodal' && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', alignItems: 'flex-start' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                                {/* Calibre Principal */}
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                        <span style={{ padding: '1px 6px', backgroundColor: '#FEE2E2', color: '#991B1B', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '900' }}>
                                                            Calibre 1 (Principal)
                                                        </span>
                                                        <label style={{ fontSize: '0.82rem', fontWeight: '800', color: '#9A3412', margin: 0 }}>
                                                            Peso por Unidad:
                                                        </label>
                                                    </div>
                                                    <select
                                                        value={targetGrams}
                                                        onChange={(e) => updatePokaYoke('bimodal', parseInt(e.target.value) || 350, packageType, secondaryGrams)}
                                                        style={{ 
                                                            padding: '0.6rem 0.9rem', 
                                                            borderRadius: '8px', 
                                                            border: '2px solid #DC2626', 
                                                            fontSize: '0.95rem', 
                                                            fontWeight: '800', 
                                                            color: '#991B1B', 
                                                            backgroundColor: 'white',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {bimodalOptions.map(g => (
                                                            <option key={g} value={g}>
                                                                {g} gramos (≈ {(g / 1000).toFixed(3)} kg)
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Calibre Secundario Opcional */}
                                                {secondaryGrams !== null ? (
                                                    <div style={{ backgroundColor: '#FEF2F2', padding: '0.65rem 0.8rem', borderRadius: '8px', border: '1.5px dashed #F87171' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={{ padding: '1px 6px', backgroundColor: '#DC2626', color: 'white', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '900' }}>
                                                                    Calibre 2 (Opcional)
                                                                </span>
                                                                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#991B1B' }}>
                                                                    Segundo Peso:
                                                                </span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => updatePokaYoke('bimodal', targetGrams, packageType, null)}
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', backgroundColor: '#FFFFFF', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '5px', fontSize: '0.68rem', fontWeight: '800', cursor: 'pointer' }}
                                                            >
                                                                <Trash2 size={11} strokeWidth={2.5} /> Quitar
                                                            </button>
                                                        </div>
                                                        <select
                                                            value={secondaryGrams || ''}
                                                            onChange={(e) => updatePokaYoke('bimodal', targetGrams, packageType, parseInt(e.target.value) || null)}
                                                            style={{ 
                                                                width: '100%',
                                                                padding: '0.5rem 0.8rem', 
                                                                borderRadius: '6px', 
                                                                border: '1.5px solid #DC2626', 
                                                                fontSize: '0.9rem', 
                                                                fontWeight: '800', 
                                                                color: '#991B1B', 
                                                                backgroundColor: 'white',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            {bimodalOptions.filter(g => g !== targetGrams).map(g => (
                                                                <option key={g} value={g}>
                                                                    {g} gramos (≈ {(g / 1000).toFixed(3)} kg)
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const candidate = bimodalOptions.find(g => g > targetGrams) || bimodalOptions[bimodalOptions.length - 1] || 450;
                                                                updatePokaYoke('bimodal', targetGrams, packageType, candidate);
                                                            }}
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                padding: '5px 12px',
                                                                backgroundColor: '#FFF1F2',
                                                                color: '#991B1B',
                                                                border: '1.5px dashed #FCA5A5',
                                                                borderRadius: '8px',
                                                                fontSize: '0.74rem',
                                                                fontWeight: '800',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.15s'
                                                            }}
                                                        >
                                                            <Plus size={13} strokeWidth={2.5} /> Añadir 2° Calibre (Opcional)
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ backgroundColor: '#FEF2F2', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #FECACA' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991B1B', fontWeight: '800', fontSize: '0.84rem' }}>
                                                    <Check size={16} strokeWidth={3} /> Venta Bimodal Activa
                                                </div>
                                                <p style={{ margin: '4px 0 0', fontSize: '0.74rem', color: '#7F1D1D', lineHeight: '1.35' }}>
                                                    El cliente puede comprar por <strong>1 Libra (500g)</strong> o por <strong>Unidad</strong>
                                                    {secondaryGrams ? ` (±${targetGrams}g y ±${secondaryGrams}g)` : ` (±${targetGrams}g)`}.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Caso 2: Monounidad */}
                                    {commercialTypology === 'monounidad' && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', alignItems: 'flex-start' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                                {/* Calibre Principal */}
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                        <span style={{ padding: '1px 6px', backgroundColor: '#D1FAE5', color: '#065F46', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '900' }}>
                                                            Calibre 1 (Principal)
                                                        </span>
                                                        <label style={{ fontSize: '0.82rem', fontWeight: '800', color: '#065F46', margin: 0 }}>
                                                            Peso por Unidad:
                                                        </label>
                                                    </div>
                                                    <select
                                                        value={targetGrams}
                                                        onChange={(e) => updatePokaYoke('monounidad', parseInt(e.target.value) || 2000, packageType, secondaryGrams)}
                                                        style={{ 
                                                            padding: '0.6rem 0.9rem', 
                                                            borderRadius: '8px', 
                                                            border: '2px solid #059669', 
                                                            fontSize: '0.95rem', 
                                                            fontWeight: '800', 
                                                            color: '#065F46', 
                                                            backgroundColor: 'white',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {monounidadOptions.map(g => (
                                                            <option key={g} value={g}>
                                                                {g >= 1000 ? `${(g / 1000).toFixed(1)} kg (${g} g)` : `${g} gramos`}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Calibre Secundario Opcional */}
                                                {secondaryGrams !== null ? (
                                                    <div style={{ backgroundColor: '#ECFDF5', padding: '0.65rem 0.8rem', borderRadius: '8px', border: '1.5px dashed #34D399' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={{ padding: '1px 6px', backgroundColor: '#059669', color: 'white', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '900' }}>
                                                                    Calibre 2 (Opcional)
                                                                </span>
                                                                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#065F46' }}>
                                                                    Segundo Peso:
                                                                </span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => updatePokaYoke('monounidad', targetGrams, packageType, null)}
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', backgroundColor: '#FFFFFF', color: '#059669', border: '1px solid #A7F3D0', borderRadius: '5px', fontSize: '0.68rem', fontWeight: '800', cursor: 'pointer' }}
                                                            >
                                                                <Trash2 size={11} strokeWidth={2.5} /> Quitar
                                                            </button>
                                                        </div>
                                                        <select
                                                            value={secondaryGrams || ''}
                                                            onChange={(e) => updatePokaYoke('monounidad', targetGrams, packageType, parseInt(e.target.value) || null)}
                                                            style={{ 
                                                                width: '100%',
                                                                padding: '0.5rem 0.8rem', 
                                                                borderRadius: '6px', 
                                                                border: '1.5px solid #059669', 
                                                                fontSize: '0.9rem', 
                                                                fontWeight: '800', 
                                                                color: '#065F46', 
                                                                backgroundColor: 'white',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            {monounidadOptions.filter(g => g !== targetGrams).map(g => (
                                                                <option key={g} value={g}>
                                                                    {g >= 1000 ? `${(g / 1000).toFixed(1)} kg (${g} g)` : `${g} gramos`}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const candidate = monounidadOptions.find(g => g > targetGrams) || monounidadOptions[monounidadOptions.length - 1] || (targetGrams + 1000);
                                                                updatePokaYoke('monounidad', targetGrams, packageType, candidate);
                                                            }}
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                padding: '5px 12px',
                                                                backgroundColor: '#ECFDF5',
                                                                color: '#065F46',
                                                                border: '1.5px dashed #6EE7B7',
                                                                borderRadius: '8px',
                                                                fontSize: '0.74rem',
                                                                fontWeight: '800',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.15s'
                                                            }}
                                                        >
                                                            <Plus size={13} strokeWidth={2.5} /> Añadir 2° Calibre (Opcional)
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ backgroundColor: '#ECFDF5', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #A7F3D0' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#065F46', fontWeight: '800', fontSize: '0.84rem' }}>
                                                    <ShieldCheck size={16} strokeWidth={2.2} /> Venta por Pieza Entera
                                                </div>
                                                <p style={{ margin: '4px 0 0', fontSize: '0.74rem', color: '#064E3B', lineHeight: '1.35' }}>
                                                    Se vende por unidad completa (±{targetGrams >= 1000 ? `${(targetGrams / 1000).toFixed(1)} kg` : `${targetGrams} g`}
                                                    {secondaryGrams ? ` y ±${secondaryGrams >= 1000 ? `${(secondaryGrams / 1000).toFixed(1)} kg` : `${secondaryGrams} g`}` : ''}).
                                                    Libra prohibida para evitar partir piezas en bodega.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Caso 3: Empaque */}
                                    {commercialTypology === 'empaque' && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', alignItems: 'flex-start' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#1E40AF', marginBottom: '4px' }}>
                                                    Tipo de Presentación:
                                                </label>
                                                <select
                                                    value={packageType}
                                                    onChange={(e) => updatePokaYoke('empaque', targetGrams, e.target.value, secondaryGrams)}
                                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '2px solid #2563EB', fontSize: '0.92rem', fontWeight: '800', color: '#1E40AF' }}
                                                >
                                                    <option value="Bandeja">Bandeja</option>
                                                    <option value="Cubeta">Cubeta</option>
                                                    <option value="Caja">Caja</option>
                                                    <option value="Paquete">Paquete</option>
                                                    <option value="Malla">Malla</option>
                                                </select>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#1E40AF', marginBottom: '4px' }}>
                                                        Contenido Neto 1:
                                                    </label>
                                                    <select
                                                        value={targetGrams}
                                                        onChange={(e) => updatePokaYoke('empaque', parseInt(e.target.value) || 125, packageType, secondaryGrams)}
                                                        style={{ 
                                                            width: '100%', 
                                                            padding: '0.55rem 0.7rem', 
                                                            borderRadius: '8px', 
                                                            border: '2px solid #2563EB', 
                                                            fontSize: '0.92rem', 
                                                            fontWeight: '800', 
                                                            color: '#1E40AF', 
                                                            backgroundColor: 'white',
                                                            cursor: 'pointer' 
                                                        }}
                                                    >
                                                        {empaqueOptions.map(g => (
                                                            <option key={g} value={g}>
                                                                {g} g ({g >= 1000 ? `${(g / 1000).toFixed(1)} kg` : ''})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {secondaryGrams !== null ? (
                                                    <div style={{ backgroundColor: '#EFF6FF', padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px dashed #93C5FD' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                                            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#1E40AF' }}>Tamaño 2:</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => updatePokaYoke('empaque', targetGrams, packageType, null)}
                                                                style={{ padding: '1px 5px', backgroundColor: 'white', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '800', cursor: 'pointer' }}
                                                            >
                                                                Quitar
                                                            </button>
                                                        </div>
                                                        <select
                                                            value={secondaryGrams || ''}
                                                            onChange={(e) => updatePokaYoke('empaque', targetGrams, packageType, parseInt(e.target.value) || null)}
                                                            style={{ 
                                                                width: '100%', 
                                                                padding: '0.45rem 0.6rem', 
                                                                borderRadius: '6px', 
                                                                border: '1.5px solid #2563EB', 
                                                                fontSize: '0.88rem', 
                                                                fontWeight: '800', 
                                                                color: '#1E40AF', 
                                                                backgroundColor: 'white',
                                                                cursor: 'pointer' 
                                                            }}
                                                        >
                                                            {empaqueOptions.filter(g => g !== targetGrams).map(g => (
                                                                <option key={g} value={g}>
                                                                    {g} g ({g >= 1000 ? `${(g / 1000).toFixed(1)} kg` : ''})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const candidate = empaqueOptions.find(g => g > targetGrams) || empaqueOptions[empaqueOptions.length - 1] || 250;
                                                            updatePokaYoke('empaque', targetGrams, packageType, candidate);
                                                        }}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', backgroundColor: '#EFF6FF', color: '#1E40AF', border: '1px dashed #93C5FD', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer' }}
                                                    >
                                                        <Plus size={12} strokeWidth={2.5} /> 2° Tamaño (Opcional)
                                                    </button>
                                                )}
                                            </div>

                                            <div style={{ backgroundColor: '#EFF6FF', padding: '0.8rem', borderRadius: '10px', border: '1px solid #BFDBFE' }}>
                                                <span style={{ fontSize: '0.75rem', color: '#1E3A8A', fontWeight: '800', display: 'block' }}>
                                                    Venta Exclusiva por {packageType}
                                                </span>
                                                <span style={{ fontSize: '0.72rem', color: '#3B82F6', display: 'block', marginTop: '2px' }}>
                                                    Factor: {(targetGrams / 1000).toFixed(3)} kg
                                                </span>
                                                {secondaryGrams && secondaryGrams > 0 && (
                                                    <span style={{ fontSize: '0.72rem', color: '#3B82F6', display: 'block' }}>
                                                        Factor 2: {(secondaryGrams / 1000).toFixed(3)} kg
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Caso 4: Granel */}
                                    {commercialTypology === 'granel' && (
                                        <div style={{ backgroundColor: '#FFFBEB', padding: '0.8rem 1.2rem', borderRadius: '10px', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <strong style={{ color: '#B45309', fontSize: '0.9rem' }}>Venta Continua por Libra (500 gramos)</strong>
                                                <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#78350F' }}>
                                                    Unidad web fijada en Libra con factor 0.5 kg. Ideal para raíces, tubérculos y legumbres a granel.
                                                </p>
                                            </div>
                                            <span style={{ padding: '4px 12px', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '900', color: '#B45309' }}>
                                                Factor: 0.5 kg
                                            </span>
                                        </div>
                                    )}

                                    {/* Nota de Integridad de Gobernanza Simplificada */}
                                    <div style={{ 
                                        marginTop: '0.75rem', 
                                        padding: '0.5rem 0.8rem', 
                                        backgroundColor: '#F8FAFC', 
                                        borderRadius: '8px', 
                                        border: '1px solid #E2E8F0', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '8px'
                                    }}>
                                        <ShieldCheck size={15} color="#059669" style={{ flexShrink: 0 }} />
                                        <span style={{ fontSize: '0.73rem', color: '#475569' }}>
                                            <strong>Calibres Oficiales:</strong> Opciones sincronizadas con la Gobernanza de Variantes del Centro de Mando.
                                        </span>
                                    </div>

                                </div>

                                {/* SIMULADOR DE PRECIO & LIVE PREVIEW DE LA TIENDA */}
                                <div style={{ backgroundColor: '#1E293B', color: 'white', padding: '1.2rem 1.5rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div>
                                        <span style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '800' }}>
                                            Simulación de Precios al Cliente (Base Kg: ${baseKgPrice.toLocaleString('es-CO')})
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                                            {commercialTypology === 'bimodal' && (
                                                <>
                                                    <span style={{ fontSize: '1rem', fontWeight: '800', color: '#FCD34D' }}>
                                                        Libra (500g): <strong style={{ color: 'white' }}>${priceLibra.toLocaleString('es-CO')}</strong>
                                                    </span>
                                                    <span style={{ color: '#64748B' }}>|</span>
                                                    <span style={{ fontSize: '1rem', fontWeight: '800', color: '#67E8F9' }}>
                                                        Unidad ({targetGrams}g): <strong style={{ color: 'white' }}>${priceUnit.toLocaleString('es-CO')}</strong>
                                                    </span>
                                                    {secondaryGrams && secondaryGrams > 0 && (
                                                        <>
                                                            <span style={{ color: '#64748B' }}>|</span>
                                                            <span style={{ fontSize: '1rem', fontWeight: '800', color: '#A5F3FC' }}>
                                                                2° Calibre ({secondaryGrams}g): <strong style={{ color: 'white' }}>${priceSecondary.toLocaleString('es-CO')}</strong>
                                                            </span>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                            {commercialTypology === 'monounidad' && (
                                                <>
                                                    <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#A7F3D0' }}>
                                                        Pieza ({targetGrams >= 1000 ? `${(targetGrams / 1000).toFixed(1)} kg` : `${targetGrams} g`}): <strong style={{ color: 'white' }}>${priceUnit.toLocaleString('es-CO')}</strong>
                                                    </span>
                                                    {secondaryGrams && secondaryGrams > 0 && (
                                                        <>
                                                            <span style={{ color: '#64748B' }}>|</span>
                                                            <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#6EE7B7' }}>
                                                                2° Calibre ({secondaryGrams >= 1000 ? `${(secondaryGrams / 1000).toFixed(1)} kg` : `${secondaryGrams} g`}): <strong style={{ color: 'white' }}>${priceSecondary.toLocaleString('es-CO')}</strong>
                                                            </span>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                            {commercialTypology === 'empaque' && (
                                                <>
                                                    <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#93C5FD' }}>
                                                        {packageType} ({targetGrams}g): <strong style={{ color: 'white' }}>${priceUnit.toLocaleString('es-CO')}</strong>
                                                    </span>
                                                    {secondaryGrams && secondaryGrams > 0 && (
                                                        <>
                                                            <span style={{ color: '#64748B' }}>|</span>
                                                            <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#BFDBFE' }}>
                                                                2° {packageType} ({secondaryGrams}g): <strong style={{ color: 'white' }}>${priceSecondary.toLocaleString('es-CO')}</strong>
                                                            </span>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                            {commercialTypology === 'granel' && (
                                                <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#FDE68A' }}>
                                                    Libra (500g): <strong style={{ color: 'white' }}>${priceLibra.toLocaleString('es-CO')}</strong>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Preview de Botones Web */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                        <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: '700' }}>ASÍ LO VERÁ EL CLIENTE:</span>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {commercialTypology === 'bimodal' && (
                                                <>
                                                    <div style={{ padding: '6px 12px', backgroundColor: '#059669', color: 'white', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '800' }}>
                                                        Libra 500g - ${priceLibra.toLocaleString('es-CO')}
                                                    </div>
                                                    <div style={{ padding: '6px 12px', backgroundColor: '#334155', color: '#CBD5E1', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '800', border: '1px solid #475569' }}>
                                                        Unidad ±{targetGrams}g - ${priceUnit.toLocaleString('es-CO')}
                                                    </div>
                                                    {secondaryGrams && secondaryGrams > 0 && (
                                                        <div style={{ padding: '6px 12px', backgroundColor: '#1E293B', color: '#A5F3FC', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '800', border: '1.5px dashed #06B6D4' }}>
                                                            Unidad ±{secondaryGrams}g - ${priceSecondary.toLocaleString('es-CO')}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            {commercialTypology === 'monounidad' && (
                                                <>
                                                    <div style={{ padding: '6px 14px', backgroundColor: '#059669', color: 'white', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '800' }}>
                                                        Unidad entera (±{targetGrams >= 1000 ? `${(targetGrams / 1000).toFixed(1)} kg` : `${targetGrams} g`}) - ${priceUnit.toLocaleString('es-CO')}
                                                    </div>
                                                    {secondaryGrams && secondaryGrams > 0 && (
                                                        <div style={{ padding: '6px 14px', backgroundColor: '#1E293B', color: '#A7F3D0', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '800', border: '1.5px dashed #10B981' }}>
                                                            Unidad entera (±{secondaryGrams >= 1000 ? `${(secondaryGrams / 1000).toFixed(1)} kg` : `${secondaryGrams} g`}) - ${priceSecondary.toLocaleString('es-CO')}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            {commercialTypology === 'empaque' && (
                                                <>
                                                    <div style={{ padding: '6px 14px', backgroundColor: '#2563EB', color: 'white', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '800' }}>
                                                        {packageType} (±{targetGrams}g) - ${priceUnit.toLocaleString('es-CO')}
                                                    </div>
                                                    {secondaryGrams && secondaryGrams > 0 && (
                                                        <div style={{ padding: '6px 14px', backgroundColor: '#1E293B', color: '#93C5FD', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '800', border: '1.5px dashed #3B82F6' }}>
                                                            {packageType} (±{secondaryGrams}g) - ${priceSecondary.toLocaleString('es-CO')}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            {commercialTypology === 'granel' && (
                                                <div style={{ padding: '6px 14px', backgroundColor: '#D97706', color: 'white', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '800' }}>
                                                    Libra 500g - ${priceLibra.toLocaleString('es-CO')}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* PANEL BILINGÜE: DESCRIPCIONES (ES / EN) CON GENERACIÓN IA */}
                                <div style={{ backgroundColor: 'white', padding: '1.2rem', borderRadius: '16px', border: '1.5px solid #FED7AA', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ backgroundColor: '#FFEDD5', padding: '6px', borderRadius: '8px', color: '#C2410C' }}>
                                                <Globe size={18} strokeWidth={2.2} />
                                            </div>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#9A3412', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                    Narrativa Comercial & Descripciones Bilingües (Tienda Web B2C)
                                                </h4>
                                                <p style={{ margin: 0, fontSize: '0.72rem', color: '#7C2D12' }}>
                                                    Textos optimizados para cautivar al cliente en español y en inglés.
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleGenerateAI}
                                            disabled={generatingAI}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '6px 14px',
                                                borderRadius: '10px',
                                                border: 'none',
                                                backgroundColor: generatingAI ? '#F1F5F9' : '#4F46E5',
                                                color: generatingAI ? '#94A3B8' : 'white',
                                                fontSize: '0.78rem',
                                                fontWeight: '800',
                                                fontFamily: 'var(--font-outfit), sans-serif',
                                                cursor: generatingAI ? 'not-allowed' : 'pointer',
                                                boxShadow: generatingAI ? 'none' : '0 2px 6px rgba(79, 70, 229, 0.25)',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {generatingAI ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                                            <span>{generatingAI ? 'Generando Contenido...' : 'Optimizar con IA (ES & EN)'}</span>
                                        </button>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        {/* Columna Español */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                    <span style={{ padding: '2px 6px', backgroundColor: '#FEF3C7', color: '#B45309', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '900' }}>ES</span>
                                                    Descripción en Español (Tienda Web)
                                                </span>
                                            </div>
                                            <textarea
                                                value={formData.description || ''}
                                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                rows={4}
                                                placeholder="Descripción sensorial y comercial para el consumidor colombiano..."
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.85rem', resize: 'none', fontFamily: 'inherit', lineHeight: '1.45', backgroundColor: '#FFFFFF' }}
                                            />
                                        </div>

                                        {/* Columna Inglés */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                    <span style={{ padding: '2px 6px', backgroundColor: '#DBEAFE', color: '#1E40AF', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '900' }}>EN</span>
                                                    English Description (Storefront EN)
                                                </span>
                                            </div>
                                            <textarea
                                                value={formData.description_en || ''}
                                                onChange={(e) => setFormData({ ...formData, description_en: e.target.value })}
                                                rows={4}
                                                placeholder="Sensory and commercial description for international clients (?lang=en)..."
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.85rem', resize: 'none', fontFamily: 'inherit', lineHeight: '1.45', backgroundColor: '#F8FAFC' }}
                                            />
                                        </div>
                                    </div>
                                </div>

                            </div>
                        )}

                        {/* ==================================================== */}
                        {/* TAB 4: MADURACIÓN, RECETAS & SEO */}
                        {/* ==================================================== */}
                        {activeTab === 'variantes' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
                                
                                {/* Columna Izquierda: Atributos Físicos */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <div style={{ backgroundColor: '#F9FAFB', borderRadius: '16px', padding: '1.2rem', border: '1px solid #E5E7EB' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#1F2937', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Sliders size={16} strokeWidth={2} /> Atributos Físicos (Maduración, Calibre)
                                                </h4>
                                                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#6B7280' }}>
                                                    Define estados físicos del producto (ej: Verde, Pintón, Maduro). La presentación se maneja automáticamente en la pestaña E-Commerce.
                                                </p>
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={addOption}
                                                disabled={options.filter(o => !((o.name || '').toLowerCase().includes('presentaci'))).length >= 2}
                                                style={{ padding: '0.4rem 0.8rem', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}
                                            >
                                                + Añadir Atributo
                                            </button>
                                        </div>

                                        {/* Resumen de Presentación Comercial Web Activa (Poka-Yoke) */}
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'space-between',
                                            backgroundColor: '#FFF7ED', 
                                            padding: '0.75rem 1rem', 
                                            borderRadius: '12px', 
                                            border: '1.5px solid #FED7AA',
                                            marginBottom: '1rem',
                                            gap: '10px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Package size={18} color="#EA580C" style={{ flexShrink: 0 }} />
                                                <div>
                                                    <span style={{ fontSize: '0.76rem', fontWeight: '800', color: '#9A3412', display: 'block', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                        Presentaciones de Venta Web Activas:
                                                    </span>
                                                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                        {commercialTypology === 'bimodal' && (
                                                            <>
                                                                <span style={{ padding: '2px 8px', backgroundColor: '#FFFFFF', color: '#9A3412', borderRadius: '12px', fontSize: '0.72rem', fontWeight: '800', border: '1px solid #FDBA74' }}>
                                                                    1 Libra (500g)
                                                                </span>
                                                                <span style={{ padding: '2px 8px', backgroundColor: '#FFFFFF', color: '#9A3412', borderRadius: '12px', fontSize: '0.72rem', fontWeight: '800', border: '1px solid #FDBA74' }}>
                                                                    1 Unidad (±{targetGrams} g)
                                                                </span>
                                                                {secondaryGrams && secondaryGrams > 0 && (
                                                                    <span style={{ padding: '2px 8px', backgroundColor: '#FFF1F2', color: '#BE123C', borderRadius: '12px', fontSize: '0.72rem', fontWeight: '800', border: '1px solid #FDA4AF' }}>
                                                                        2° Calibre: 1 Unidad (±{secondaryGrams} g)
                                                                    </span>
                                                                )}
                                                            </>
                                                        )}
                                                        {commercialTypology === 'monounidad' && (
                                                            <>
                                                                <span style={{ padding: '2px 8px', backgroundColor: '#FFFFFF', color: '#065F46', borderRadius: '12px', fontSize: '0.72rem', fontWeight: '800', border: '1px solid #86EFAC' }}>
                                                                    Unidad Entera (±{targetGrams >= 1000 ? `${(targetGrams / 1000).toFixed(1)} kg` : `${targetGrams} g`})
                                                                </span>
                                                                {secondaryGrams && secondaryGrams > 0 && (
                                                                    <span style={{ padding: '2px 8px', backgroundColor: '#ECFDF5', color: '#047857', borderRadius: '12px', fontSize: '0.72rem', fontWeight: '800', border: '1px solid #6EE7B7' }}>
                                                                        2° Calibre: (±{secondaryGrams >= 1000 ? `${(secondaryGrams / 1000).toFixed(1)} kg` : `${secondaryGrams} g`})
                                                                    </span>
                                                                )}
                                                            </>
                                                        )}
                                                        {commercialTypology === 'empaque' && (
                                                            <>
                                                                <span style={{ padding: '2px 8px', backgroundColor: '#FFFFFF', color: '#1E40AF', borderRadius: '12px', fontSize: '0.72rem', fontWeight: '800', border: '1px solid #BFDBFE' }}>
                                                                    {packageType} (±{targetGrams} g)
                                                                </span>
                                                                {secondaryGrams && secondaryGrams > 0 && (
                                                                    <span style={{ padding: '2px 8px', backgroundColor: '#EFF6FF', color: '#1D4ED8', borderRadius: '12px', fontSize: '0.72rem', fontWeight: '800', border: '1px solid #93C5FD' }}>
                                                                        2° {packageType} (±{secondaryGrams} g)
                                                                    </span>
                                                                )}
                                                            </>
                                                        )}
                                                        {commercialTypology === 'granel' && (
                                                            <span style={{ padding: '2px 8px', backgroundColor: '#FFFFFF', color: '#9A3412', borderRadius: '12px', fontSize: '0.72rem', fontWeight: '800', border: '1px solid #FDBA74' }}>
                                                                1 Libra (500g granel)
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('ecommerce')}
                                                style={{ 
                                                    padding: '4px 10px', 
                                                    backgroundColor: '#FFFFFF', 
                                                    color: '#EA580C', 
                                                    border: '1px solid #FDBA74', 
                                                    borderRadius: '8px', 
                                                    fontSize: '0.72rem', 
                                                    fontWeight: '800', 
                                                    cursor: 'pointer',
                                                    whiteSpace: 'nowrap',
                                                    boxShadow: '0 1px 3px rgba(234, 88, 12, 0.1)',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                Configurar en Pestaña 3 ↗
                                            </button>
                                        </div>

                                        {/* Opciones de Atributos */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {options
                                                .map((opt: any, origIdx: number) => ({ opt, origIdx }))
                                                .filter(({ opt }: any) => !((opt.name || '').toLowerCase().includes('presentaci')))
                                                .map(({ opt, origIdx }: any) => (
                                                    <div key={origIdx} style={{ padding: '1rem', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #D1D5DB', position: 'relative' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeOption(origIdx)}
                                                            style={{ position: 'absolute', right: '8px', top: '8px', border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer' }}
                                                            title="Eliminar atributo"
                                                        >
                                                            <X size={15} />
                                                        </button>

                                                        <div style={{ marginBottom: '0.8rem' }}>
                                                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', marginBottom: '4px' }}>
                                                                Tipo de Atributo
                                                            </label>
                                                            <select
                                                                value={opt.name}
                                                                onChange={(e) => updateOption(origIdx, e.target.value, '')}
                                                                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700' }}
                                                            >
                                                                <option value="">-- Seleccionar --</option>
                                                                {masterAttributes
                                                                    .filter(a => !a.name.toLowerCase().includes('presentaci'))
                                                                    .map(attr => <option key={attr.name} value={attr.name}>{attr.name}</option>)
                                                                }
                                                            </select>
                                                        </div>

                                                        {masterAttributes.some(a => a.name === opt.name) && (
                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', marginBottom: '6px' }}>
                                                                    Valores Disponibles
                                                                </label>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                    {(masterAttributes.find(a => a.name === opt.name)?.values || []).map(val => (
                                                                        <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '4px 8px', borderRadius: '6px', backgroundColor: opt.values.includes(val) ? '#ECFDF5' : '#F3F4F6', border: `1px solid ${opt.values.includes(val) ? '#10B981' : '#E5E7EB'}`, cursor: 'pointer' }}>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={opt.values.includes(val)}
                                                                                onChange={(e) => {
                                                                                    const newVals = e.target.checked
                                                                                        ? [...opt.values, val]
                                                                                        : opt.values.filter((v: string) => v !== val);
                                                                                    updateOptionValues(origIdx, newVals);
                                                                                }}
                                                                            />
                                                                            {val}
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))
                                            }
                                        </div>

                                        {options.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => generateVariants()}
                                                style={{ 
                                                    padding: '0.65rem 1.2rem', 
                                                    backgroundColor: '#FFFFFF', 
                                                    color: '#334155', 
                                                    border: '1.5px solid #CBD5E1', 
                                                    borderRadius: '10px', 
                                                    fontWeight: '700', 
                                                    fontSize: '0.82rem', 
                                                    fontFamily: 'var(--font-outfit), sans-serif',
                                                    cursor: 'pointer', 
                                                    marginTop: '1rem', 
                                                    width: '100%', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'center', 
                                                    gap: '8px',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                <RefreshCw size={15} color="#475569" /> 
                                                <span>Regenerar Combinaciones Físicas</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Columna Derecha: Recetas Típicas & SEO */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    {/* SECCIÓN RECETAS TÍPICAS & KEYWORDS */}
                                    <div style={{ backgroundColor: '#F0FDF4', padding: '1.2rem', borderRadius: '14px', border: '1px solid #BBF7D0' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <label style={{ fontSize: '0.82rem', fontWeight: '800', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                                <ChefHat size={16} /> Recetas Típicas & Keywords de Búsqueda
                                            </label>
                                            <span style={{ fontSize: '0.72rem', color: '#15803D', fontStyle: 'italic' }}>Asocia el producto a recetas colombianas para el buscador</span>
                                        </div>

                                        {/* PRESETS DE PLATOS TÍPICOS */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                                            {TYPICAL_RECIPES.map(({ id, label, Icon }) => {
                                                const currentList = (formData.keywords || '')
                                                    .split(',')
                                                    .map(k => k.trim().toLowerCase())
                                                    .filter(Boolean);
                                                const isAssigned = currentList.includes(id) || currentList.includes(label.toLowerCase());

                                                return (
                                                    <button
                                                        key={id}
                                                        type="button"
                                                        onClick={() => {
                                                            let updated: string[];
                                                            if (isAssigned) {
                                                                updated = currentList.filter(k => k !== id && k !== label.toLowerCase());
                                                            } else {
                                                                updated = Array.from(new Set([...currentList, id]));
                                                            }
                                                            setFormData({ ...formData, keywords: updated.join(', ') });
                                                        }}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            padding: '4px 10px',
                                                            borderRadius: '16px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: '700',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.15s',
                                                            backgroundColor: isAssigned ? '#15803D' : '#FFFFFF',
                                                            color: isAssigned ? '#FFFFFF' : '#166534',
                                                            border: isAssigned ? '1.5px solid #15803D' : '1px solid #86EFAC',
                                                            boxShadow: isAssigned ? '0 2px 4px rgba(21, 128, 61, 0.2)' : 'none'
                                                        }}
                                                    >
                                                        <Icon size={12} strokeWidth={isAssigned ? 2.5 : 2} />
                                                        <span>{label}</span>
                                                        {isAssigned ? (
                                                            <Check size={12} strokeWidth={3} style={{ marginLeft: '2px' }} />
                                                        ) : (
                                                            <Plus size={12} strokeWidth={2.5} style={{ marginLeft: '2px' }} />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* LISTA DE KEYWORDS ACTIVOS Y CAMPO MANUAL */}
                            <div style={{ 
                                display: 'flex', 
                                flexWrap: 'wrap', 
                                gap: '6px', 
                                padding: '0.5rem', 
                                border: '1px solid #86EFAC', 
                                borderRadius: '8px', 
                                backgroundColor: 'white',
                                minHeight: '40px',
                                alignItems: 'center'
                            }}>
                                {(formData.keywords || '')
                                    .split(',')
                                    .map(k => k.trim())
                                    .filter(Boolean)
                                    .map((kw, idx) => (
                                        <div key={idx} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            backgroundColor: '#DCFCE7',
                                            color: '#166534',
                                            padding: '2px 8px',
                                            borderRadius: '14px',
                                            fontSize: '0.75rem',
                                            fontWeight: '700',
                                            border: '1px solid #86EFAC'
                                        }}>
                                            <ChefHat size={10} />
                                            <span>{kw}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const current = (formData.keywords || '').split(',').map(k => k.trim()).filter(Boolean);
                                                    const updated = current.filter((_, i) => i !== idx);
                                                    setFormData({ ...formData, keywords: updated.join(', ') });
                                                }}
                                                style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ))}
                                <input
                                    type="text"
                                    placeholder={(!formData.keywords || formData.keywords.trim() === '') ? "Ej: ajiaco, sancocho, sopa, guiso..." : "Agregar keyword manual..."}
                                    value={keywordInput}
                                    onChange={(e) => setKeywordInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ',') {
                                            e.preventDefault();
                                            const newKw = keywordInput.trim().toLowerCase().replace(',', '');
                                            if (newKw) {
                                                const current = (formData.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                                                if (!current.includes(newKw)) {
                                                    const updated = [...current, newKw].join(', ');
                                                    setFormData({ ...formData, keywords: updated });
                                                }
                                                setKeywordInput('');
                                            }
                                        } else if (e.key === 'Backspace' && keywordInput === '') {
                                            const current = (formData.keywords || '').split(',').map(k => k.trim()).filter(Boolean);
                                            if (current.length > 0) {
                                                setFormData({ ...formData, keywords: current.slice(0, -1).join(', ') });
                                            }
                                        }
                                    }}
                                    style={{ 
                                        flex: 1, 
                                        minWidth: '130px', 
                                        border: 'none', 
                                        outline: 'none', 
                                        fontSize: '0.82rem', 
                                        backgroundColor: 'transparent',
                                        color: '#166534',
                                        fontWeight: '600'
                                    }}
                                />
                            </div>
                            <p style={{ fontSize: '0.7rem', color: '#15803D', marginTop: '4px', marginBottom: 0 }}>
                                Escribe palabras clave y presiona <strong>Enter</strong> o <strong>Coma (,)</strong> para añadirlas a la indexación del buscador.
                            </p>
                        </div>
                        
                        {/* SECCIÓN ETIQUETAS COMERCIALES & BÚSQUEDA */}
                        <div style={{ backgroundColor: '#FFF7ED', padding: '1.2rem', borderRadius: '14px', border: '1px solid #FED7AA' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label style={{ fontSize: '0.82rem', fontWeight: '800', color: '#9A3412', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                    <Tag size={16} /> Etiquetas Comerciales & Búsqueda Web
                                </label>
                                <span style={{ fontSize: '0.72rem', color: '#7C2D12', fontStyle: 'italic' }}>Activan badges automáticos en carrusel y catálogo</span>
                            </div>

                            {/* PRESETS RÁPIDOS DE CAMPAÑAS */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                {[
{ label: 'PROMOCION', type: 'promo', activeBg: '#FEF2F2', activeColor: '#DC2626', activeBorder: '#FCA5A5' },
                                    { label: 'COSECHA', type: 'harvest', activeBg: '#ECFDF5', activeColor: '#059669', activeBorder: '#A7F3D0' },
                                    { label: 'TEMPORADA', type: 'season', activeBg: '#ECFDF5', activeColor: '#059669', activeBorder: '#A7F3D0' },
                                    { label: 'BEST SELLER', type: 'bestseller', activeBg: '#FFFBEB', activeColor: '#D97706', activeBorder: '#FDE68A' },
                                    { label: 'OFERTA', type: 'flash', activeBg: '#FEF2F2', activeColor: '#DC2626', activeBorder: '#FCA5A5' },
                                    { label: 'GOURMET', type: 'gourmet', activeBg: '#F5F3FF', activeColor: '#7C3AED', activeBorder: '#DDD6FE' }
                                ].map((preset) => {
                                    const isSelected = (formData.tags || []).some(t => t.toUpperCase() === preset.label);
                                    return (
                                        <button
                                            key={preset.label}
                                            type="button"
                                            onClick={() => {
                                                const currentTags = formData.tags || [];
                                                if (isSelected) {
                                                    setFormData({
                                                        ...formData,
                                                        tags: currentTags.filter(t => t.toUpperCase() !== preset.label)
                                                    });
                                                } else {
                                                    setFormData({
                                                        ...formData,
                                                        tags: [...currentTags, preset.label]
                                                    });
                                                }
                                            }}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                padding: '4px 10px',
                                                borderRadius: '20px',
                                                fontSize: '0.72rem',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                backgroundColor: isSelected ? preset.activeBg : '#FFFFFF',
                                                color: isSelected ? preset.activeColor : '#6B7280',
                                                border: isSelected ? `1.5px solid ${preset.activeBorder}` : '1px solid #E5E7EB',
                                                boxShadow: isSelected ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                                            }}
                                        >
                                            {preset.type === 'promo' ? (
                                                <Tag size={12} strokeWidth={2.5} />
                                            ) : preset.type === 'harvest' || preset.type === 'season' ? (
                                                <Leaf size={12} strokeWidth={2.5} />
                                            ) : preset.type === 'bestseller' ? (
                                                <Flame size={12} strokeWidth={2.5} />
                                            ) : preset.type === 'flash' ? (
                                                <Zap size={12} strokeWidth={2.5} />
                                            ) : (
                                                <Sparkles size={12} strokeWidth={2.5} />
                                            )}
                                            <span>{preset.label}</span>
                                            {isSelected ? (
                                                <Check size={12} strokeWidth={3} style={{ marginLeft: '2px' }} />
                                            ) : (
                                                <Plus size={12} strokeWidth={2.5} style={{ marginLeft: '2px' }} />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div style={{ 
                                display: 'flex', 
                                flexWrap: 'wrap', 
                                gap: '8px', 
                                padding: '0.5rem', 
                                border: '1px solid #FFD8A8', 
                                borderRadius: '10px', 
                                backgroundColor: 'white',
                                minHeight: '45px',
                                alignItems: 'center'
                            }}>
                                {(formData.tags || []).map((tag, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        backgroundColor: '#FFF7ED',
                                        color: '#C2410C',
                                        padding: '4px 10px',
                                        borderRadius: '20px',
                                        fontSize: '0.8rem',
                                        fontWeight: '700',
                                        border: '1px solid #FED7AA'
                                    }}>
                                        {tag}
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, tags: (formData.tags || []).filter((_, i) => i !== idx) })}
                                            style={{ background: 'none', border: 'none', color: '#EA580C', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                                            title="Eliminar tag"
                                        >
                                            <X size={12} strokeWidth={2.5} />
                                        </button>
                                    </div>
                                ))}
                                <input
                                    type="text"
                                    placeholder={(!formData.tags || formData.tags.length === 0) ? "Ej: organico, oferta, temporada..." : "Agregar tag manual..."}
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ',') {
                                            e.preventDefault();
                                            const newTag = tagInput.trim().toUpperCase();
                                            if (newTag && !(formData.tags || []).some(t => t.toUpperCase() === newTag)) {
                                                setFormData({ ...formData, tags: [...(formData.tags || []), newTag] });
                                                setTagInput('');
                                            }
                                        } else if (e.key === 'Backspace' && tagInput === '' && (formData.tags || []).length > 0) {
                                            setFormData({ ...formData, tags: (formData.tags || []).slice(0, -1) });
                                        }
                                    }}
                                    style={{ 
                                        flex: 1, 
                                        minWidth: '120px', 
                                        border: 'none', 
                                        outline: 'none', 
                                        fontSize: '0.9rem', 
                                        backgroundColor: 'transparent',
                                        color: '#9A3412',
                                        fontWeight: '600'
                                    }}
                                />
                            </div>
                            <p style={{ fontSize: '0.7rem', color: '#7C2D12', marginTop: '4px' }}>Presiona <strong>Enter</strong> o <strong>Coma (,)</strong> para añadir tags personalizados adicionales.</p>
                        </div>
                                </div>
                            </div>
                        )}

                    </div>

                    {/* FOOTER NAVEGACIÓN Y GUARDADO */}
                    <footer style={{
                        marginTop: '1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderTop: '1.5px solid #F1F5F9',
                        paddingTop: '1rem',
                        flexShrink: 0
                    }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ 
                                padding: '0.7rem 1.8rem', 
                                background: '#F8FAFC', 
                                border: '1.5px solid #CBD5E1', 
                                borderRadius: '10px', 
                                color: '#475569', 
                                cursor: 'pointer', 
                                fontWeight: '700',
                                fontFamily: 'var(--font-outfit), sans-serif',
                                fontSize: '0.88rem',
                                transition: 'all 0.15s'
                            }}
                        >
                            {readOnly ? 'Cerrar' : 'Cancelar'}
                        </button>

                        <div style={{ display: 'flex', gap: '0.85rem' }}>
                            {activeTab !== 'tecnica' && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (activeTab === 'variantes') setActiveTab('ecommerce');
                                        else if (activeTab === 'ecommerce') setActiveTab('jerarquia');
                                        else if (activeTab === 'jerarquia') setActiveTab('tecnica');
                                    }}
                                    style={{ 
                                        padding: '0.7rem 1.5rem', 
                                        backgroundColor: '#F1F5F9', 
                                        border: '1.5px solid #CBD5E1', 
                                        borderRadius: '10px', 
                                        fontWeight: '700', 
                                        cursor: 'pointer', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '6px', 
                                        color: '#334155',
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        fontSize: '0.88rem'
                                    }}
                                >
                                    <ArrowLeft size={16} /> Anterior
                                </button>
                            )}

                            {activeTab !== 'variantes' ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (activeTab === 'tecnica') setActiveTab('jerarquia');
                                        else if (activeTab === 'jerarquia') setActiveTab('ecommerce');
                                        else if (activeTab === 'ecommerce') setActiveTab('variantes');
                                    }}
                                    style={{ 
                                        padding: '0.7rem 1.6rem', 
                                        backgroundColor: '#0F172A', 
                                        color: 'white', 
                                        border: 'none', 
                                        borderRadius: '10px', 
                                        fontWeight: '700', 
                                        cursor: 'pointer', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '6px',
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        fontSize: '0.88rem',
                                        boxShadow: '0 2px 6px rgba(15, 23, 42, 0.2)'
                                    }}
                                >
                                    Siguiente Paso <ArrowRight size={16} />
                                </button>
                            ) : null}

                            {!readOnly && (
                                <button
                                    type="submit"
                                    disabled={loading || uploading}
                                    style={{
                                        padding: '0.7rem 2.2rem',
                                        backgroundColor: '#1A4D2E',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '10px',
                                        fontWeight: '800',
                                        cursor: loading || uploading ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 4px 14px rgba(26, 77, 46, 0.3)',
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        fontSize: '0.9rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        opacity: loading || uploading ? 0.7 : 1
                                    }}
                                >
                                    {loading || uploading ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            <span>Guardando...</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 size={16} />
                                            <span>Guardar Cambios</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </footer>
                </form>
            </div>

            {/* MODAL GUÍA DE UNIDADES DE COMPRA LOGÍSTICA (EXISTENTE) */}
            {showUnitGuideModal && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.65)',
                        backdropFilter: 'blur(6px)',
                        zIndex: 10005,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem'
                    }}
                    onClick={() => setShowUnitGuideModal(false)}
                >
                    <div
                        style={{
                            backgroundColor: 'white',
                            borderRadius: '18px',
                            maxWidth: '720px',
                            width: '100%',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            overflow: 'hidden'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <BookOpen size={20} color="#4F46E5" />
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#111827' }}>Guía de Unidades de Compras</h3>
                            </div>
                            <button type="button" onClick={() => setShowUnitGuideModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ backgroundColor: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: '12px', padding: '1rem' }}>
                                <strong style={{ color: '#B45309' }}>Kg (Compras Corabastos / Peso)</strong>
                                <p style={{ fontSize: '0.8rem', color: '#92400E', margin: '4px 0 0' }}>El insumo se compra y costea por kilogramos. Permite decimales en pedidos de clientes.</p>
                            </div>
                            <div style={{ backgroundColor: '#EFF6FF', border: '1.5px solid #93C5FD', borderRadius: '12px', padding: '1rem' }}>
                                <strong style={{ color: '#1D4ED8' }}>Unidad (Discreto / Presentación)</strong>
                                <p style={{ fontSize: '0.8rem', color: '#1E40AF', margin: '4px 0 0' }}>El insumo se compra por conteo unitario. Exige números enteros en pedidos.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL GUÍA DE ESTRATEGIA E-COMMERCE (NUEVO POKA-YOKE) */}
            {showEcommerceGuideModal && (
                <EcommerceGuideModal onClose={() => setShowEcommerceGuideModal(false)} />
            )}

        </div>
    );
}
