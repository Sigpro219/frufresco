'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { createPortal } from 'react-dom';
import { useCart } from '../lib/cartContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { translations, Locale } from '../lib/translations';
import { useAuth } from '../lib/authContext';
import { resolvePricingModelId } from '../lib/pricingUtils';
import { AlertTriangle, ShoppingCart } from 'lucide-react';

// Keep interface consistent with usage
interface Product {
    id: string;
    name: string;
    name_en?: string;
    base_price: number;
    unit_of_measure: string;
    image_url: string;
    sku?: string;
    iva_rate?: number;
    options?: any;
    options_config?: any[];
    variants?: any[];
    web_conversion_factor?: number;
    display_name?: string;
    pricing_model_prices?: { price: number }[];
    tags?: string[];
}

interface QuickViewModalProps {
    product: Product;
    onClose: () => void;
    initialQuantity?: number;
    onUpdateQuantity?: (qty: number) => void;
}

const ModalContent: React.FC<QuickViewModalProps> = ({ product: initialProduct, onClose, initialQuantity, onUpdateQuantity }) => {
    const { addItem, items } = useCart();
    const router = useRouter();
    const searchParams = useSearchParams();
    const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
    const t = translations[locale];
    const [quantity, setQuantity] = useState(initialQuantity !== undefined ? initialQuantity : 1);
    const [inputValue, setInputValue] = useState(initialQuantity !== undefined ? String(initialQuantity).replace('.', ',') : '1');

    const { profile } = useAuth();
    const [product, setProduct] = useState<Product>(initialProduct);

    useEffect(() => {
        const fetchFreshProduct = async () => {
            const pricingModelId = resolvePricingModelId(profile);
            const { data, error } = await supabase
                .from('products')
                .select('*, pricing_model_prices(price)')
                .eq('id', initialProduct.id)
                .eq('pricing_model_prices.model_id', pricingModelId)
                .single();
                
            if (!error && data) {
                setProduct(data as Product);
            }
        };
        fetchFreshProduct();
    }, [initialProduct.id, profile?.pricing_model_id]);

    const [masterAttributes, setMasterAttributes] = useState<any[]>([]);

    useEffect(() => {
        const fetchMaster = async () => {
            const { data } = await supabase
                .from('product_attributes_master')
                .select('name, show_on_web');
            if (data) setMasterAttributes(data);
        };
        fetchMaster();
    }, []);

    // Normalizar las opciones
    const displayOptions = useMemo(() => {
        const unitLower = ((product as any).web_unit || product.unit_of_measure || '').toLowerCase();
        const isBaseInKg = ['kg', 'kilo', 'kilos'].includes(unitLower);

        let opts = product.options_config && product.options_config.length > 0
            ? product.options_config
                .filter((opt: any) => {
                    const master = masterAttributes.find(m => m.name.toLowerCase() === opt.name.toLowerCase());
                    return master ? master.show_on_web !== false : true;
                })
                .reduce((acc: any, opt: any) => {
                    let values = opt.values || [];
                    if (opt.name.toLowerCase().includes('presentaci')) {
                        if (!values || values.length === 0) {
                            if (isBaseInKg) {
                                values = [locale === 'en' ? 'Pound (500g)|500' : 'Libra (500g)|500'];
                            } else {
                                const defaultVal = (product as any).web_unit || product.unit_of_measure || 'Unidad';
                                values = [defaultVal];
                            }
                        }
                    }
                    return { ...acc, [opt.name]: values };
                }, {})
            : product.options || {};

        const hasPresentationKey = Object.keys(opts).some(k => k.toLowerCase().includes('presentaci'));
        if (!hasPresentationKey && isBaseInKg) {
            opts = {
                ...opts,
                'Presentación': [locale === 'en' ? 'Pound (500g)|500' : 'Libra (500g)|500']
            };
        }
        return opts;
    }, [product, masterAttributes, locale]);

    // Helper para extraer peso en Kg
    const getParsedWeight = (text: string): number | null => {
        if (!text) return null;
        if (text.includes('|')) {
            const parts = text.split('|');
            const grams = parseFloat(parts[1]);
            if (!isNaN(grams) && grams > 0) return grams / 1000;
        }
        const clean = text.toLowerCase();
        const kgMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilos)/);
        if (kgMatch) {
            const val = parseFloat(kgMatch[1]);
            if (!isNaN(val) && val > 0) return val;
        }
        const gMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:g|gr|grs|gramos|grams|gramo|gram)/);
        if (gMatch) {
            const val = parseFloat(gMatch[1]);
            if (!isNaN(val) && val > 0) return val / 1000;
        }
        if (clean.includes('libra') || clean.includes('lb') || clean.includes('pound')) return 0.5;
        return null;
    };

    // Helper para formatear visualmente valores de opciones con peso en Kg
    const formatOptionDisplay = (val: string, isEn?: boolean): string => {
        if (!val) return '';
        if (val.includes('|')) {
            const parts = val.split('|');
            const rawUnit = parts[0].trim();
            const unitName = isEn ? (rawUnit.toLowerCase() === 'unidad' ? 'Unit' : rawUnit) : rawUnit;
            const rawWeight = parts[1]?.trim();
            if (rawWeight) {
                const grams = parseFloat(rawWeight);
                if (!isNaN(grams) && grams > 0) {
                    const kg = grams / 1000;
                    const formattedKg = kg % 1 === 0 ? kg.toString() : (isEn ? kg.toFixed(1) : kg.toFixed(1).replace('.', ','));
                    return `${unitName} (~${formattedKg} kg)`;
                }
                return `${unitName} (${rawWeight})`;
            }
            return unitName;
        }
        return val;
    };

    // Initialize selections with the first option of each category (sorted by weight/name)
    const initialSelections = useMemo(() => {
        const selections: Record<string, string> = {};
        const unitLower = ((product as any).web_unit || product.unit_of_measure || '').toLowerCase();
        const isBaseInKg = ['kg', 'kilo', 'kilos'].includes(unitLower);
        Object.entries(displayOptions).forEach(([key, values]: [string, any]) => {
            if (Array.isArray(values) && values.length > 0) {
                const defaultUnit = isBaseInKg ? (locale === 'en' ? 'pound (500g)' : 'libra (500g)') : ((product as any).web_unit || product.unit_of_measure || '').toLowerCase();
                const sortedValues = values.slice().sort((valA, valB) => {
                    const weightA = getParsedWeight(valA);
                    const weightB = getParsedWeight(valB);
                    if (weightA !== null && weightB !== null && weightA !== weightB) {
                        return weightA - weightB;
                    }
                    const cleanA = valA.includes('|') ? valA.split('|')[0] : valA;
                    const cleanB = valB.includes('|') ? valB.split('|')[0] : valB;
                    if (cleanA.toLowerCase() === defaultUnit) return -1;
                    if (cleanB.toLowerCase() === defaultUnit) return 1;
                    return cleanA.localeCompare(cleanB, undefined, { numeric: true, sensitivity: 'base' });
                });
                selections[key] = sortedValues[0];
            }
        });
        return selections;
    }, [displayOptions, product, locale]);

    const [selections, setSelections] = useState(initialSelections);

    useEffect(() => {
        setSelections(prev => {
            const hasChanges = Object.keys(initialSelections).some(k => prev[k] !== initialSelections[k]);
            return hasChanges ? { ...prev, ...initialSelections } : prev;
        });
    }, [initialSelections]);

    const visibleVariants = (product.variants || []).filter(v => v.show_on_web !== false);

    const currentVariant = visibleVariants.find(v =>
        Object.entries(selections).every(([key, value]) => v.options[key] === value)
    );

    // Obtener la presentación seleccionada
    let selectedPresentationVal: string | null = null;
    Object.entries(selections).forEach(([key, val]) => {
        if (key.toLowerCase().includes('presentaci')) {
            selectedPresentationVal = val;
        }
    });

    const unitLower = ((product as any).web_unit || product.unit_of_measure || '').toLowerCase();
    const isBaseInKg = ['kg', 'kilo', 'kilos'].includes(unitLower);
    const parsedWeight = selectedPresentationVal ? getParsedWeight(selectedPresentationVal) : null;
    const activeConversionFactor = parsedWeight !== null ? parsedWeight : (isBaseInKg ? 0.5 : (product.web_conversion_factor || 1));
    const activeUnit = selectedPresentationVal ? formatOptionDisplay(selectedPresentationVal, locale === 'en') : (isBaseInKg ? (locale === 'en' ? 'Pound (500g)' : 'Libra (500g)') : ((product as any).web_unit || product.unit_of_measure));

    const isSelectedPresentationLibra = selectedPresentationVal?.toLowerCase().includes('libra') || selectedPresentationVal?.toLowerCase().includes('lb');
    const isAvailable = product.variants && product.variants.length > 0 ? (isDefaultSelected || isSelectedPresentationLibra ? true : !!currentVariant) : true;
    
    // Aplicar factor de conversión y redondeo a 50
    const rawPrice = currentVariant ? (currentVariant.price || product.pricing_model_prices?.[0]?.price || product.base_price || 0) : (product.pricing_model_prices?.[0]?.price || product.base_price || 0);
    
    // Si la variante tiene price_adj_pct o price_adjustment_percent, aplicarlo al precio base
    const adjustmentPercent = currentVariant ? (currentVariant.price_adj_pct ?? currentVariant.price_adjustment_percent ?? 0) : 0;
    const priceWithAdjustment = rawPrice * (1 + adjustmentPercent / 100);

    const currentPrice = Math.ceil((priceWithAdjustment * activeConversionFactor) / 50) * 50;

    const getFormattedOptionName = (name: string, isEn?: boolean) => {
        const lower = name.toLowerCase();
        if (lower.includes('madura') || lower.includes('madurez')) {
            return isEn ? 'Ripeness level' : 'Punto de maduración';
        }
        if (lower.includes('presentaci')) {
            return isEn ? 'Presentation' : 'Presentación';
        }
        if (lower.includes('calidad') || lower.includes('grado')) {
            return isEn ? 'Grade / Quality' : 'Grado de calidad';
        }
        if (lower.includes('corte') || lower.includes('tamano') || lower.includes('tamaño')) {
            return isEn ? 'Size / Cut' : 'Tamaño / Corte';
        }
        return name.charAt(0).toUpperCase() + name.slice(1);
    };

    const getFormattedName = () => {
        const optionString = Object.entries(selections)
            .map(([key, value]) => {
                const rawKey = key.toLowerCase();
                const displayKey = (rawKey.includes('madura') || rawKey.includes('madurez'))
                    ? (locale === 'en' ? 'Ripeness' : 'Maduración')
                    : rawKey.includes('presentaci')
                        ? (locale === 'en' ? 'Presentation' : 'Presentación')
                        : key;
                const displayVal = formatOptionDisplay(value, locale === 'en');
                return `${displayKey}: ${displayVal}`;
            })
            .join(', ');
        const baseName = locale === 'en' ? (product.name_en || product.display_name || product.name) : (product.display_name || product.name);
        return optionString ? `${baseName} (${optionString})` : baseName;
    };

    const handleAddToCart = () => {
        if (onUpdateQuantity) {
            onUpdateQuantity(quantity);
        } else {
            const unitLower = (product.unit_of_measure || '').toLowerCase();
            const isWeightUnit = ['kg', 'kilo', 'kilos'].includes(unitLower);
            const isLibra = ['libra', 'libras'].includes(unitLower);

            const parsedWeight = selectedPresentationVal ? getParsedWeight(selectedPresentationVal) : null;
            let unitWeight = parsedWeight !== null ? parsedWeight : ((product as any).weight_kg !== undefined && (product as any).weight_kg !== null ? (product as any).weight_kg : (isWeightUnit ? 1 : isLibra ? 0.5 : 0));
            let cartUnit = activeUnit;

            addItem({
                id: product.id,
                name: getFormattedName(),
                price: currentPrice,
                iva_rate: product.iva_rate,
                unit: cartUnit,
                quantity: quantity,
                image_url: product.image_url,
                weight_kg: unitWeight
            });
        }
        onClose();
    };

    const handleBuyNow = () => {
        handleAddToCart();
        router.push('/checkout');
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)'
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div style={{
                backgroundColor: 'white',
                borderRadius: '24px',
                padding: '2rem',
                width: '90%',
                maxWidth: '480px',
                position: 'relative',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                animation: 'modalFadeUp 0.3s ease-out'
            }}>
                <style jsx>{`
                    @keyframes modalFadeUp {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '1.25rem',
                        right: '1.25rem',
                        background: '#F3F4F6',
                        border: 'none',
                        borderRadius: '50%',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#6B7280',
                        fontSize: '1rem',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E5E7EB'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                >
                    ✕
                </button>

                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem' }}>
                    <div style={{
                        width: '140px',
                        height: '140px',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        backgroundColor: '#F9FAFB',
                        border: '1px solid #F3F4F6',
                        position: 'relative',
                        flexShrink: 0
                    }}>
                        <img
                            src={product.image_url}
                            alt={product.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => (e.currentTarget.src = 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?auto=format&fit=crop&q=80&w=400')}
                        />
                        {/* BADGES EN IMAGEN MODAL */}
                        {product.tags && product.tags.length > 0 && (
                            <div style={{
                                position: 'absolute',
                                top: '6px',
                                right: '6px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '3px',
                                zIndex: 5
                            }}>
                                {product.tags.map((tag, i) => {
                                    const lower = (tag || '').toLowerCase();
                                    const isPromo = lower.includes('promo') || lower.includes('oferta') || lower.includes('descuento');
                                    const isHarvest = lower.includes('cosecha') || lower.includes('temporada') || lower.includes('fresco') || lower.includes('viva');
                                    const isBestSeller = lower.includes('vendido') || lower.includes('best') || lower.includes('top');
                                    const isGourmet = lower.includes('gourmet') || lower.includes('destacado') || lower.includes('premium');
                                    
                                    const bg = isPromo ? '#FEF2F2' : isHarvest ? '#ECFDF5' : isBestSeller ? '#FFFBEB' : isGourmet ? '#F5F3FF' : 'rgba(255, 255, 255, 0.95)';
                                    const color = isPromo ? '#DC2626' : isHarvest ? '#059669' : isBestSeller ? '#D97706' : isGourmet ? '#7C3AED' : 'var(--primary-dark)';
                                    const border = isPromo ? '1px solid #FCA5A5' : isHarvest ? '1px solid #A7F3D0' : isBestSeller ? '1px solid #FDE68A' : isGourmet ? '1px solid #DDD6FE' : '1px solid rgba(0, 0, 0, 0.08)';
                                    const icon = isPromo ? '🏷️ ' : isHarvest ? '🌾 ' : isBestSeller ? '🔥 ' : isGourmet ? '⭐ ' : '';
                                    
                                    return (
                                        <div key={i} style={{
                                            backgroundColor: bg,
                                            padding: '2px 6px',
                                            borderRadius: '50px',
                                            fontSize: '0.55rem',
                                            fontWeight: '800',
                                            color: color,
                                            backdropFilter: 'blur(8px)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.04em',
                                            border: border,
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '2px'
                                        }}>
                                            <span>{icon}</span>
                                            <span>{tag}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {/* BADGES ARRIBA DEL TÍTULO EN MODAL */}
                        {product.tags && product.tags.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                                {product.tags.map((tag, i) => {
                                    const lower = (tag || '').toLowerCase();
                                    const isPromo = lower.includes('promo') || lower.includes('oferta') || lower.includes('descuento');
                                    const isHarvest = lower.includes('cosecha') || lower.includes('temporada') || lower.includes('fresco') || lower.includes('viva');
                                    const isBestSeller = lower.includes('vendido') || lower.includes('best') || lower.includes('top');
                                    const isGourmet = lower.includes('gourmet') || lower.includes('destacado') || lower.includes('premium');
                                    
                                    const bg = isPromo ? '#FEF2F2' : isHarvest ? '#ECFDF5' : isBestSeller ? '#FFFBEB' : isGourmet ? '#F5F3FF' : 'rgba(0, 0, 0, 0.04)';
                                    const color = isPromo ? '#DC2626' : isHarvest ? '#059669' : isBestSeller ? '#D97706' : isGourmet ? '#7C3AED' : 'var(--primary-dark)';
                                    const border = isPromo ? '1px solid #FCA5A5' : isHarvest ? '1px solid #A7F3D0' : isBestSeller ? '1px solid #FDE68A' : isGourmet ? '1px solid #DDD6FE' : '1px solid rgba(0, 0, 0, 0.08)';
                                    const icon = isPromo ? '🏷️ ' : isHarvest ? '🌾 ' : isBestSeller ? '🔥 ' : isGourmet ? '⭐ ' : '';
                                    
                                    return (
                                        <span key={i} style={{
                                            backgroundColor: bg,
                                            padding: '2px 6px',
                                            borderRadius: '6px',
                                            fontSize: '0.62rem',
                                            fontWeight: '800',
                                            color: color,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.04em',
                                            border: border,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}>
                                            <span>{icon}</span>
                                            <span>{tag}</span>
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                        <h2 style={{ fontSize: '1.25rem', fontWeight: '800', margin: '0 0 0.4rem', color: '#111827', lineHeight: '1.3' }}>
                            {locale === 'en' ? (product.name_en || product.display_name || product.name) : (product.display_name || product.name)}
                        </h2>
                        <p style={{
                            fontSize: '1.6rem',
                            fontWeight: '900',
                            color: 'var(--primary)',
                            margin: 0
                        }}>
                            ${(currentPrice || 0).toLocaleString('es-CO')}
                            <span style={{ fontSize: '0.85rem', color: '#6B7280', fontWeight: '500' }}> / {activeUnit}</span>
                        </p>
                    </div>
                </div>

                {/* ALERTA DE PRODUCTO YA EXISTENTE EN EL CARRITO/PEDIDO */}
                {(() => {
                    const finalName = currentVariant
                        ? `${product.name} (${Object.values(selections).map(v => formatOptionDisplay(v, locale === 'en')).join(', ')})`
                        : product.name;
                    const existingInCart = items?.find(item => item.id === product.id && item.name === finalName)
                        || items?.find(item => item.id === product.id);
                    if (!existingInCart || onUpdateQuantity) return null;

                    const currentQty = Number(existingInCart.quantity || 0);
                    const addedNum = Number(quantity) || 0;
                    const newTotal = Math.round((currentQty + addedNum) * 100) / 100;
                    const productName = (locale === 'en' && product.name_en) ? product.name_en : (product.display_name || product.name);
                    const unitLabel = existingInCart.unit || activeUnit;

                    const titleStr = t.alreadyInCartTitle || 'Insumo ya incluido en tu pedido';
                    const msgStr = (t.alreadyInCartMsg || 'Ya tienes {qty} {unit} de {name} en tu pedido.')
                        .replace('{qty}', String(currentQty))
                        .replace('{unit}', unitLabel)
                        .replace('{name}', productName);
                    const badgeStr = (t.alreadyInCartBadge || 'Al adicionar {qty} {unit} el nuevo total será {total} {unit}')
                        .replace('{qty}', String(quantity))
                        .replace('{unit}', activeUnit)
                        .replace('{total}', String(newTotal))
                        .replace('{unit}', unitLabel);

                    return (
                        <div style={{
                            backgroundColor: '#FFFBEB',
                            border: '1.5px solid #F59E0B',
                            borderRadius: '14px',
                            padding: '0.85rem 1rem',
                            marginBottom: '1rem',
                            textAlign: 'left',
                            fontSize: '0.82rem',
                            color: '#92400E',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.12)'
                        }}>
                            <AlertTriangle size={20} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <div style={{ fontWeight: '900', fontSize: '0.86rem', color: '#B45309', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <ShoppingCart size={15} style={{ color: '#B45309' }} /> {titleStr}
                                </div>
                                <div style={{ marginTop: '3px', color: '#78350F', lineHeight: '1.4' }}>
                                    {msgStr}
                                </div>
                                <div style={{ marginTop: '6px', fontSize: '0.78rem', fontWeight: '800', color: '#065F46', backgroundColor: '#D1FAE5', border: '1px solid #A7F3D0', padding: '4px 8px', borderRadius: '8px', display: 'inline-block' }}>
                                    {badgeStr}
                                </div>
                            </div>
                        </div>
                    );
                })()}

                <div style={{ height: '1px', backgroundColor: '#F3F4F6', margin: '1.25rem 0' }}></div>

                <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '1.5rem', paddingRight: '0.5rem' }}>
                    {Object.entries(displayOptions)
                        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                        .map(([optionName, values]: [string, any]) => {
                            const displayOptionName = getFormattedOptionName(optionName, locale === 'en');
                            return (
                                <div key={optionName} style={{ marginBottom: '1.25rem' }}>
                                    <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.6rem', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', color: '#6B7280' }}>
                                        {displayOptionName}
                                    </label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                                        {Array.isArray(values) && values
                                            .slice()
                                            .sort((valA, valB) => {
                                                const weightA = getParsedWeight(valA);
                                                const weightB = getParsedWeight(valB);
                                                if (weightA !== null && weightB !== null && weightA !== weightB) {
                                                    return weightA - weightB;
                                                }
                                                const cleanA = valA.includes('|') ? valA.split('|')[0] : valA;
                                                const cleanB = valB.includes('|') ? valB.split('|')[0] : valB;
                                                const defaultUnit = ((product as any).web_unit || product.unit_of_measure || '').toLowerCase();
                                                if (cleanA.toLowerCase() === defaultUnit) return -1;
                                                if (cleanB.toLowerCase() === defaultUnit) return 1;
                                                return cleanA.localeCompare(cleanB, undefined, { numeric: true, sensitivity: 'base' });
                                            })
                                            .map((val) => {
                                        const displayVal = formatOptionDisplay(val, locale === 'en');
                                        return (
                                            <button
                                                key={val}
                                                onClick={() => setSelections({ ...selections, [optionName]: val })}
                                                style={{
                                                    padding: '0.5rem 1rem',
                                                    borderRadius: '10px',
                                                    border: selections[optionName] === val ? '2px solid var(--primary)' : '1px solid #E5E7EB',
                                                    backgroundColor: selections[optionName] === val ? 'var(--primary)' : 'white',
                                                    color: selections[optionName] === val ? 'white' : '#4B5563',
                                                    fontWeight: '700',
                                                    fontSize: '0.85rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                                }}
                                            >
                                                {displayVal}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div style={{ marginBottom: '2rem' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.75rem', color: '#6B7280', textTransform: 'uppercase' }}>
                        {t.selectionQuantity}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            border: '1.5px solid #F3F4F6', 
                            borderRadius: '12px', 
                            overflow: 'hidden',
                            backgroundColor: '#F9FAFB'
                        }}>
                            <button
                                onClick={() => {
                                    const unitLower = (product.unit_of_measure || '').toLowerCase();
                                    const isWeightUnit = ['kg', 'kilo', 'kilos', 'libra', 'libras', 'g', 'gr', 'gramos'].includes(unitLower) && !selectedPresentationVal;
                                    const step = isWeightUnit ? 0.5 : 1;
                                    const newQty = Math.max(step, parseFloat((quantity - step).toFixed(2)));
                                    setQuantity(newQty);
                                    setInputValue(String(newQty).replace('.', ','));
                                }}
                                style={{
                                    width: '44px', height: '44px',
                                    border: 'none',
                                    backgroundColor: 'transparent',
                                    fontSize: '1.2rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    color: '#4B5563',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >−</button>
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '') {
                                        setInputValue('');
                                        setQuantity(0);
                                        return;
                                    }
                                    const cleanVal = val.replace(',', '.');
                                    if (/^\d*\.?\d*$/.test(cleanVal)) {
                                        setInputValue(val);
                                        const num = parseFloat(cleanVal);
                                        if (!isNaN(num) && num > 0) {
                                            setQuantity(num);
                                        }
                                    }
                                }}
                                onBlur={() => {
                                    const unitLower = (product.unit_of_measure || '').toLowerCase();
                                    const isWeightUnit = ['kg', 'kilo', 'kilos', 'libra', 'libras', 'g', 'gr', 'gramos'].includes(unitLower) && !selectedPresentationVal;
                                    const step = isWeightUnit ? 0.5 : 1;
                                    if (quantity <= 0) {
                                        setQuantity(step);
                                        setInputValue(String(step).replace('.', ','));
                                    } else {
                                        setInputValue(String(quantity).replace('.', ','));
                                    }
                                }}
                                style={{
                                    width: '60px',
                                    textAlign: 'center',
                                    border: 'none',
                                    backgroundColor: 'transparent',
                                    fontSize: '1.1rem',
                                    fontWeight: '800',
                                    color: '#111827',
                                    outline: 'none'
                                }}
                            />
                            <button
                                onClick={() => {
                                    const unitLower = (product.unit_of_measure || '').toLowerCase();
                                    const isWeightUnit = ['kg', 'kilo', 'kilos', 'libra', 'libras', 'g', 'gr', 'gramos'].includes(unitLower) && !selectedPresentationVal;
                                    const step = isWeightUnit ? 0.5 : 1;
                                    const newQty = parseFloat((quantity + step).toFixed(2));
                                    setQuantity(newQty);
                                    setInputValue(String(newQty).replace('.', ','));
                                }}
                                style={{
                                    width: '44px', height: '44px',
                                    border: 'none',
                                    backgroundColor: 'transparent',
                                    fontSize: '1.2rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    color: '#4B5563',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >+</button>
                        </div>

                        <span style={{ 
                            fontSize: '0.9rem', 
                            fontWeight: '800', 
                            color: 'var(--primary)', 
                            textTransform: 'lowercase', 
                            backgroundColor: 'rgba(34, 197, 94, 0.08)', 
                            padding: '6px 12px', 
                            borderRadius: '10px', 
                            border: '1px solid rgba(34, 197, 94, 0.15)',
                            display: 'inline-flex',
                            alignItems: 'center'
                        }}>
                            {activeUnit}
                        </span>

                        <div style={{ flex: 1, textAlign: 'right' }}>
                             <span style={{ fontSize: '0.9rem', color: '#9CA3AF', fontWeight: '600' }}>{t.total}</span>
                             <div style={{ fontSize: '1.35rem', fontWeight: '900', color: isAvailable ? '#111827' : '#9CA3AF' }}>
                                 ${(currentPrice * (isAvailable ? quantity : 1)).toLocaleString('es-CO')}
                             </div>
                         </div>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {!isAvailable && (
                        <div style={{ 
                            backgroundColor: '#FEF2F2', 
                            color: '#EF4444', 
                            padding: '0.75rem', 
                            borderRadius: '10px', 
                            fontSize: '0.85rem', 
                            fontWeight: '700', 
                            textAlign: 'center',
                            border: '1px solid #FEE2E2',
                            marginBottom: '0.5rem'
                        }}>
                                                         ⚠️ {t.notAvailableAlt}
                        </div>
                    )}
                    <button
                        onClick={handleAddToCart}
                        disabled={!isAvailable}
                        style={{
                            width: '100%',
                            padding: '1.15rem',
                            backgroundColor: 'white',
                            border: `2.5px solid ${isAvailable ? 'var(--primary)' : '#E5E7EB'}`,
                            color: isAvailable ? 'var(--primary)' : '#9CA3AF',
                            borderRadius: '15px',
                            fontSize: '1rem',
                            fontWeight: '800',
                            cursor: isAvailable ? 'pointer' : 'not-allowed',
                            transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                        }}
                        onMouseEnter={(e) => {
                            if(isAvailable) {
                                e.currentTarget.style.transform = 'scale(1.02)';
                                e.currentTarget.style.backgroundColor = 'rgba(26, 77, 46, 0.05)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if(isAvailable) {
                                e.currentTarget.style.transform = 'scale(1)';
                                e.currentTarget.style.backgroundColor = 'white';
                            }
                        }}
                    >
                        {onUpdateQuantity 
                            ? (locale === 'en' ? 'Update Quantity' : 'Actualizar Cantidad') 
                            : (isAvailable ? t.addToOrder : t.unavailable)}
                    </button>
                    {!onUpdateQuantity && (
                        <button
                            onClick={handleBuyNow}
                            disabled={!isAvailable}
                            style={{
                                width: '100%',
                                padding: '1.15rem',
                                borderRadius: '15px',
                                fontSize: '1rem',
                                fontWeight: '800',
                                cursor: isAvailable ? 'pointer' : 'not-allowed',
                                backgroundColor: isAvailable ? 'var(--primary)' : '#F3F4F6',
                                color: isAvailable ? 'white' : '#9CA3AF',
                                border: 'none',
                                transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                boxShadow: isAvailable ? '0 10px 20px rgba(26, 77, 46, 0.2)' : 'none'
                            }}
                            onMouseEnter={(e) => {
                                if(isAvailable) {
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 15px 30px rgba(26, 77, 46, 0.3)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if(isAvailable) {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = '0 10px 20px rgba(26, 77, 46, 0.2)';
                                }
                            }}
                        >
                            {isAvailable ? t.payNow : t.outOfStock}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const QuickViewModal: React.FC<QuickViewModalProps> = (props) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow || 'unset';
        };
    }, []);

    if (!mounted) return null;

    return createPortal(
        <ModalContent {...props} />,
        document.body
    );
};

export default QuickViewModal;
