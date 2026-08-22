'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useCart } from '@/lib/cartContext';
import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag, Zap, Plus, Minus, ChevronRight, Apple, AlertTriangle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { translations, Locale } from '@/lib/translations';

interface Product {
    id: string;
    name: string;
    display_name?: string;
    base_price: number;
    unit_of_measure: string;
    web_unit?: string;
    web_conversion_factor?: number;
    image_url: string;
    description: string;
    description_en?: string | null;
    name_en?: string | null;
    options?: any;
    options_config?: any[];
    variants?: any[];
    show_on_web?: boolean;
    iva_rate?: number;
    pricing_model_prices?: { price: number }[];
    weight_kg?: number | null;
    campaign_info?: any;
}

export default function ProductDetailClient({ product }: { product: Product }) {
    const { addItem, items } = useCart();
    const router = useRouter();
    const searchParams = useSearchParams();
    const lang = searchParams.get('lang') || 'es';
    const isEn = lang === 'en';
    const t = translations[lang as Locale] || translations.es;

    const [quantity, setQuantity] = useState(1);
    const [inputValue, setInputValue] = useState('1');

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

    const unitLower = (product.web_unit || product.unit_of_measure || '').toLowerCase();
    const isBaseInKg = ['kg', 'kilo', 'kilos'].includes(unitLower);

    // Normalizar las opciones (viniendo de options o de options_config del Admin)
    let displayOptions = product.options_config && product.options_config.length > 0
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
                            values = [isEn ? 'Pound (500g)|500' : 'Libra (500g)|500'];
                        } else {
                            const defaultVal = product.web_unit || product.unit_of_measure || 'Unidad';
                            values = [defaultVal];
                        }
                    }
                }
                return { ...acc, [opt.name]: values };
            }, {})
        : product.options || {};

    const hasPresentationKey = Object.keys(displayOptions).some(k => k.toLowerCase().includes('presentaci'));
    if (!hasPresentationKey && isBaseInKg) {
        displayOptions = {
            ...displayOptions,
            'Presentación': [isEn ? 'Pound (500g)|500' : 'Libra (500g)|500']
        };
    }

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
    const initialSelections: Record<string, string> = {};
    Object.entries(displayOptions).forEach(([key, values]: [string, any]) => {
        if (Array.isArray(values) && values.length > 0) {
            const defaultUnit = isBaseInKg ? (isEn ? 'pound (500g)' : 'libra (500g)') : (product.web_unit || product.unit_of_measure || '').toLowerCase();
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
            initialSelections[key] = sortedValues[0];
        }
    });

    const [selections, setSelections] = useState(initialSelections);

    // Obtener la presentación seleccionada
    let selectedPresentationVal: string | null = null;
    Object.entries(selections).forEach(([key, val]) => {
        if (key.toLowerCase().includes('presentaci')) {
            selectedPresentationVal = val;
        }
    });

    const defaultUnit = isBaseInKg ? (isEn ? 'pound (500g)' : 'libra (500g)') : (product.web_unit || product.unit_of_measure || '').toLowerCase();
    const isDefaultSelected = selectedPresentationVal?.toLowerCase() === defaultUnit;
    const parsedWeight = selectedPresentationVal ? getParsedWeight(selectedPresentationVal) : null;
    const activeConversionFactor = parsedWeight !== null ? parsedWeight : (isBaseInKg ? 0.5 : (product.web_conversion_factor || 1));
    const activeUnit = selectedPresentationVal ? formatOptionDisplay(selectedPresentationVal, isEn) : (isBaseInKg ? (isEn ? 'Libra (500g)' : 'Libra (500g)') : (product.web_unit || product.unit_of_measure));

    // Solo considerar variantes que estén marcadas para mostrarse en web
    const visibleVariants = (product.variants || []).filter(v => (v as any).show_on_web !== false);

    // Calcular el precio actual basado en la variante seleccionada (solo de las visibles)
    const currentVariant = visibleVariants.find(v =>
        Object.entries(selections).every(([key, value]) => v.options[key] === value)
    );

    // Aplicar factor de conversión comercial
    const basePrice = currentVariant ? (currentVariant.price || product.pricing_model_prices?.[0]?.price || product.base_price) : (product.pricing_model_prices?.[0]?.price || product.base_price);
    
    // Si la variante tiene price_adj_pct o price_adjustment_percent, aplicarlo al precio base
    const adjustmentPercent = currentVariant ? (currentVariant.price_adj_pct ?? currentVariant.price_adjustment_percent ?? 0) : 0;
    const priceWithAdjustment = basePrice * (1 + adjustmentPercent / 100);

    const currentPrice = Math.ceil((priceWithAdjustment * activeConversionFactor) / 50) * 50;

    // Calcular el precio original si hay campaña activa
    const originalBasePrice = product.campaign_info ? product.campaign_info.originalPrice : basePrice;
    const originalPriceWithAdjustment = originalBasePrice * (1 + adjustmentPercent / 100);
    const originalPrice = Math.ceil((originalPriceWithAdjustment * activeConversionFactor) / 50) * 50;

    const isSelectedPresentationLibra = selectedPresentationVal?.toLowerCase().includes('libra') || selectedPresentationVal?.toLowerCase().includes('lb');
    const isPriceValid = (currentPrice || 0) > 0;
    const isAvailable = product.variants && product.variants.length > 0 ? (isDefaultSelected || isSelectedPresentationLibra ? isPriceValid : (!!currentVariant && isPriceValid)) : isPriceValid;

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
                    ? (isEn ? 'Ripeness' : 'Maduración')
                    : rawKey.includes('presentaci')
                        ? (isEn ? 'Presentation' : 'Presentación')
                        : key;
                const displayVal = formatOptionDisplay(value, isEn);
                return `${displayKey}: ${displayVal}`;
            })
            .join(', ');
        const baseName = (isEn && product.name_en) ? product.name_en : (product.display_name || product.name);
        return optionString ? `${baseName} (${optionString})` : baseName;
    };

    const handleAdd = () => {
        let selectedPresentationVal: string | null = null;
        Object.entries(selections).forEach(([key, val]) => {
            if (key.toLowerCase().includes('presentaci')) {
                selectedPresentationVal = val;
            }
        });

        const unitLower = (product.web_unit || product.unit_of_measure || '').toLowerCase();
        const isWeightUnit = ['kg', 'kilo', 'kilos'].includes(unitLower);
        const isLibra = ['libra', 'libras'].includes(unitLower);

        const parsedWeight = selectedPresentationVal ? getParsedWeight(selectedPresentationVal) : null;
        let unitWeight = parsedWeight !== null ? parsedWeight : (product.weight_kg !== undefined && product.weight_kg !== null ? product.weight_kg : (isWeightUnit ? 1 : isLibra ? 0.5 : 0));
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

        const name = (isEn && product.name_en) ? product.name_en : (product.display_name || product.name);
        if (typeof window !== 'undefined' && (window as any).showToast) {
            (window as any).showToast(t.addedToCart.replace('{name}', name), 'success');
        }
        router.push(isEn ? '/?lang=en#catalog' : '/#catalog');
    };

    const handleBuyNow = () => {
        let selectedPresentationVal: string | null = null;
        Object.entries(selections).forEach(([key, val]) => {
            if (key.toLowerCase().includes('presentaci')) {
                selectedPresentationVal = val;
            }
        });

        const unitLower = (product.web_unit || product.unit_of_measure || '').toLowerCase();
        const isWeightUnit = ['kg', 'kilo', 'kilos'].includes(unitLower);
        const isLibra = ['libra', 'libras'].includes(unitLower);

        const parsedWeight = selectedPresentationVal ? getParsedWeight(selectedPresentationVal) : null;
        let unitWeight = parsedWeight !== null ? parsedWeight : (product.weight_kg !== undefined && product.weight_kg !== null ? product.weight_kg : (isWeightUnit ? 1 : isLibra ? 0.5 : 0));
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
        router.push('/checkout');
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1rem' }}>
            {/* Breadcrumbs */}
            <nav style={{ marginBottom: '2.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Link href={`/${isEn ? '?lang=en' : ''}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: '500' }}>
                    {t.navHome}
                </Link> 
                <ChevronRight size={14} />
                <Link 
                    href={`/${isEn ? '?lang=en' : ''}#catalog`} 
                    style={{ color: 'inherit', textDecoration: 'none', fontWeight: '500' }}
                    onClick={() => {
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('focus-catalog-search'));
                        }
                    }}
                >
                    {t.navCatalog || 'Catálogo'}
                </Link> 
                <ChevronRight size={14} />
                <span style={{ fontWeight: '700', color: 'var(--primary)' }}>
                    {(isEn && product.name_en) ? product.name_en : (product.display_name || product.name)}
                </span>
            </nav>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)', gap: '4rem', alignItems: 'start' }}>
                {/* Left: Image Container */}
                <div style={{
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-premium)',
                    backgroundColor: '#f9f9f9',
                    position: 'relative',
                    aspectRatio: '1/1'
                }}>
                    <Image
                        src={product.image_url || '/placeholder_produce.png'}
                        alt={product.display_name || product.name}
                        fill
                        style={{ objectFit: 'cover' }}
                        priority
                    />
                    {product.image_url && (product.image_url.includes('clean') || product.image_url.includes('overlay')) && (
                        <div style={{
                            position: 'absolute',
                            bottom: '4%',
                            right: '4%',
                            width: '18%',
                            height: '18%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 8,
                            pointerEvents: 'none'
                        }}>
                            <img 
                                src="/logo_simbolo.png" 
                                alt="FruFresco" 
                                style={{ 
                                    width: '100%', 
                                    height: '100%', 
                                    objectFit: 'contain' 
                                }} 
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Right: Product Info */}
                <div>
                    {/* ALERTA DE PRODUCTO YA EXISTENTE EN EL CARRITO/PEDIDO */}
                    {(() => {
                        const finalName = currentVariant
                            ? `${product.name} (${Object.values(selections).map(v => formatOptionDisplay(v, isEn)).join(', ')})`
                            : product.name;
                        const existingInCart = items?.find(item => item.id === product.id && item.name === finalName)
                            || items?.find(item => item.id === product.id);
                        if (!existingInCart) return null;

                        const currentQty = Number(existingInCart.quantity || 0);
                        const addedNum = Number(quantity) || 0;
                        const newTotal = Math.round((currentQty + addedNum) * 100) / 100;
                        const productName = (isEn && product.name_en) ? product.name_en : (product.display_name || product.name);
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
                                marginBottom: '1.25rem',
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
                                    <div style={{ fontWeight: '900', fontSize: '0.86rem', color: '#B45309' }}>
                                        🛒 {titleStr}
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

                    <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                        {(isEn && product.name_en) ? product.name_en : (product.display_name || product.name)}
                    </h1>

                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--primary-dark)', marginBottom: '1.5rem' }}>
                        {currentPrice !== undefined && currentPrice > 0 ? (
                            product.campaign_info ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                                        <span style={{ fontSize: '2rem', fontWeight: '950', color: '#DC2626', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                            ${currentPrice.toLocaleString('es-CO')}
                                        </span>
                                        <span style={{ fontSize: '1.25rem', textDecoration: 'line-through', color: '#94A3B8', fontWeight: '500' }}>
                                            ${originalPrice.toLocaleString('es-CO')}
                                        </span>
                                        <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: '400' }}>
                                            {t.perUnit} {activeUnit}
                                        </span>
                                    </div>
                                    <span style={{ 
                                        fontSize: '0.8rem', 
                                        backgroundColor: '#FEE2E2', 
                                        color: '#EF4444', 
                                        padding: '4px 10px', 
                                        borderRadius: '8px', 
                                        fontWeight: 'bold', 
                                        display: 'inline-block',
                                        alignSelf: 'flex-start',
                                        marginTop: '4px'
                                    }}>
                                        ⚡ {product.campaign_info.campaignName} ({product.campaign_info.adjustmentValue > 0 ? '+' : ''}{product.campaign_info.adjustmentValue}{product.campaign_info.type === 'margin_adjustment' ? '%' : '$'})
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <span>
                                        ${currentPrice.toLocaleString('es-CO')}
                                    </span>
                                    <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: '400', marginLeft: '0.5rem' }}>
                                        {t.perUnit} {activeUnit}
                                    </span>
                                </>
                            )
                        ) : (
                            <>
                                <span style={{ fontSize: '1.15rem', color: '#666', fontStyle: 'italic', fontWeight: '800' }}>
                                    {isEn ? 'Price on request' : 'Precio a consultar'}
                                </span>
                                <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: '400', marginLeft: '0.5rem' }}>
                                    {t.perUnit} {activeUnit}
                                </span>
                            </>
                        )}
                    </div>

                    <div style={{ marginBottom: '2rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                        {(isEn && product.description_en) ? product.description_en : (product.description || 'Producto fresco de alta calidad.')}
                    </div>

                    <hr style={{ border: 'none', borderTop: '1px solid var(--border)', marginBottom: '2rem' }} />

                    {/* Dynamic Variant Selectors (Sorted alphabetically) */}
                    {Object.entries(displayOptions)
                        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                        .map(([optionName, values]: [string, any]) => {
                            const displayOptionName = getFormattedOptionName(optionName, isEn);
                            return (
                                <div key={optionName} style={{ marginBottom: '2rem' }}>
                                    <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.75rem', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em', color: '#1F2937' }}>
                                        {displayOptionName}
                                    </label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
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
                                                const defaultUnit = (product.web_unit || product.unit_of_measure || '').toLowerCase();
                                                if (cleanA.toLowerCase() === defaultUnit) return -1;
                                                if (cleanB.toLowerCase() === defaultUnit) return 1;
                                                return cleanA.localeCompare(cleanB, undefined, { numeric: true, sensitivity: 'base' });
                                            })
                                            .map((val) => {
                                                const displayVal = formatOptionDisplay(val, isEn);
                                                return (
                                                    <button
                                                key={val}
                                                onClick={() => setSelections({ ...selections, [optionName]: val })}
                                                style={{
                                                    padding: '0.75rem 1.5rem',
                                                    borderRadius: 'var(--radius-md)',
                                                    border: selections[optionName] === val ? '2px solid black' : '1px solid var(--border)',
                                                    backgroundColor: selections[optionName] === val ? 'black' : 'white',
                                                    color: selections[optionName] === val ? 'white' : 'var(--text-main)',
                                                    fontWeight: '600',
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

                    {/* Quantity Section */}
                    <div style={{ marginBottom: '2.5rem' }}>
                        <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.75rem', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                            {t.quantity}
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid var(--border)', width: 'fit-content', padding: '0.4rem', borderRadius: 'var(--radius-md)', backgroundColor: 'white' }}>
                                <button
                                    onClick={() => {
                                        const unitLower = (product.web_unit || product.unit_of_measure || '').toLowerCase();
                                        const isWeightUnit = ['kg', 'kilo', 'kilos', 'libra', 'libras', 'g', 'gr', 'gramos'].includes(unitLower) && !selectedPresentationVal;
                                        const step = isWeightUnit ? 0.5 : 1;
                                        const newQty = Math.max(step, parseFloat((quantity - step).toFixed(2)));
                                        setQuantity(newQty);
                                        setInputValue(String(newQty).replace('.', ','));
                                    }}
                                    style={{ width: '40px', height: '40px', border: 'none', background: 'rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 'var(--radius-sm)', transition: 'all 0.2s' }}>
                                    <Minus size={18} strokeWidth={2.5} />
                                </button>
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
                                        const unitLower = (product.web_unit || product.unit_of_measure || '').toLowerCase();
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
                                        fontWeight: '800',
                                        fontSize: '1.2rem',
                                        color: 'var(--primary-dark)',
                                        border: 'none',
                                        outline: 'none',
                                        background: 'transparent'
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        const unitLower = (product.web_unit || product.unit_of_measure || '').toLowerCase();
                                        const isWeightUnit = ['kg', 'kilo', 'kilos', 'libra', 'libras', 'g', 'gr', 'gramos'].includes(unitLower) && !selectedPresentationVal;
                                        const step = isWeightUnit ? 0.5 : 1;
                                        const newQty = parseFloat((quantity + step).toFixed(2));
                                        setQuantity(newQty);
                                        setInputValue(String(newQty).replace('.', ','));
                                    }}
                                    style={{ width: '40px', height: '40px', border: 'none', background: 'rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 'var(--radius-sm)', transition: 'all 0.2s' }}>
                                    <Plus size={18} strokeWidth={2.5} />
                                </button>
                            </div>
                            <span style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--primary)', textTransform: 'lowercase', backgroundColor: 'rgba(34, 197, 94, 0.08)', padding: '8px 16px', borderRadius: '12px', border: '1px solid rgba(34, 197, 94, 0.15)' }}>
                                {activeUnit}
                            </span>
                        </div>
                    </div>

                    {/* Total Price & Availability */}
                    <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: isAvailable ? '#F3F4F6' : '#FEF2F2', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            {!isAvailable && <span style={{ color: '#EF4444', fontWeight: '800', fontSize: '0.9rem', display: 'block' }}>⚠️ {!isPriceValid ? (isEn ? 'Price on request' : 'Precio a consultar') : t.notAvailableAlt}</span>}
                            <span style={{ fontSize: '1.1rem', fontWeight: '600', color: '#4B5563' }}>{t.subtotal}:</span>
                        </div>
                        <span style={{ fontSize: isPriceValid ? '1.8rem' : '1.2rem', fontWeight: '800', color: isAvailable ? 'var(--primary-dark)' : '#9CA3AF' }}>
                            {isPriceValid ? (
                                `$${(currentPrice * (isAvailable ? quantity : 1)).toLocaleString('es-CO')}`
                            ) : (
                                isEn ? 'Price on request' : 'Precio a consultar'
                            )}
                        </span>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <button
                            onClick={handleAdd}
                            disabled={!isAvailable}
                            className="btn btn-premium"
                            style={{
                                padding: '1.25rem',
                                fontSize: '1.1rem',
                                borderRadius: 'var(--radius-lg)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.8rem',
                                border: `2px solid ${isAvailable ? 'var(--primary)' : '#D1D5DB'}`,
                                backgroundColor: 'white',
                                color: isAvailable ? 'var(--primary-dark)' : '#9CA3AF',
                                fontWeight: '700',
                                cursor: isAvailable ? 'pointer' : 'not-allowed',
                                transition: 'all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1)'
                            }}
                        >
                            <ShoppingBag size={20} strokeWidth={2.5} /> 
                            {isAvailable ? t.addToOrder : (!isPriceValid ? (isEn ? 'Price on request' : 'Precio a consultar') : t.unavailable)}
                        </button>
                        <button
                            onClick={handleBuyNow}
                            disabled={!isAvailable}
                            className={isAvailable ? "btn btn-primary btn-premium" : ""}
                            style={{
                                padding: '1.25rem',
                                fontSize: '1.1rem',
                                borderRadius: 'var(--radius-lg)',
                                fontWeight: '800',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.8rem',
                                boxShadow: isAvailable ? '0 10px 20px rgba(26, 77, 46, 0.15)' : 'none',
                                backgroundColor: isAvailable ? 'var(--primary)' : '#F3F4F6',
                                color: isAvailable ? 'white' : '#9CA3AF',
                                border: 'none',
                                cursor: isAvailable ? 'pointer' : 'not-allowed',
                                transition: 'all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1)'
                            }}
                        >
                            <Zap size={20} strokeWidth={2.5} fill={isAvailable ? "currentColor" : "none"} /> 
                            {isAvailable ? t.payNow : (!isPriceValid ? (isEn ? 'Price on request' : 'Precio a consultar') : t.outOfStock)}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
