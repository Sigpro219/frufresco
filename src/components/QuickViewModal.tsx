'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { createPortal } from 'react-dom';
import { useCart } from '../lib/cartContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { translations, Locale } from '../lib/translations';

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
}

interface QuickViewModalProps {
    product: Product;
    onClose: () => void;
    initialQuantity?: number;
    onUpdateQuantity?: (qty: number) => void;
}

const ModalContent: React.FC<QuickViewModalProps> = ({ product, onClose, initialQuantity, onUpdateQuantity }) => {
    const { addItem } = useCart();
    const router = useRouter();
    const searchParams = useSearchParams();
    const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
    const t = translations[locale];
    const [quantity, setQuantity] = useState(initialQuantity !== undefined ? initialQuantity : 1);
    const [inputValue, setInputValue] = useState(initialQuantity !== undefined ? String(initialQuantity).replace('.', ',') : '1');

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
    const displayOptions = product.options_config && product.options_config.length > 0
        ? product.options_config
            .filter((opt: any) => {
                const master = masterAttributes.find(m => m.name.toLowerCase() === opt.name.toLowerCase());
                return master ? master.show_on_web !== false : true;
            })
            .reduce((acc: any, opt: any) => ({ ...acc, [opt.name]: opt.values }), {})
        : product.options || {};

    const initialSelections: Record<string, string> = {};
    Object.entries(displayOptions).forEach(([key, values]: [string, any]) => {
        if (Array.isArray(values) && values.length > 0) {
            initialSelections[key] = values[0];
        }
    });

    const [selections, setSelections] = useState(initialSelections);

    const visibleVariants = (product.variants || []).filter(v => v.show_on_web !== false);

    const currentVariant = visibleVariants.find(v =>
        Object.entries(selections).every(([key, value]) => v.options[key] === value)
    );

    const isAvailable = product.variants && product.variants.length > 0 ? !!currentVariant : true;
    
    // Aplicar factor de conversión y redondeo a 50
    const rawPrice = currentVariant ? currentVariant.price : (product.pricing_model_prices?.[0]?.price || product.base_price || 0);
    const currentPrice = Math.ceil((rawPrice * (product.web_conversion_factor || 1)) / 50) * 50;

    const getFormattedName = () => {
        const optionString = Object.entries(selections)
            .map(([key, value]) => {
                const displayKey = key.toLowerCase().includes('presentaci') ? 'Presentación' : key;
                const displayVal = value.includes('|') ? value.split('|')[0] : value;
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
            let selectedPresentationVal: string | null = null;
            Object.entries(selections).forEach(([key, val]) => {
                if (key.toLowerCase().includes('presentaci')) {
                    selectedPresentationVal = val;
                }
            });

            const unitLower = (product.unit_of_measure || '').toLowerCase();
            const isWeightUnit = ['kg', 'kilo', 'kilos'].includes(unitLower);
            const isLibra = ['libra', 'libras'].includes(unitLower);

            let unitWeight = (product as any).weight_kg !== undefined && (product as any).weight_kg !== null ? (product as any).weight_kg : (isWeightUnit ? 1 : isLibra ? 0.5 : 0);
            let cartUnit = product.unit_of_measure;

            if (selectedPresentationVal && selectedPresentationVal.includes('|')) {
                const parts = selectedPresentationVal.split('|');
                const grams = parseFloat(parts[1]);
                if (!isNaN(grams) && grams > 0) {
                    unitWeight = grams / 1000;
                }
                cartUnit = parts[0];
            }

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

                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div style={{
                        width: '140px',
                        height: '140px',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        backgroundColor: '#F9FAFB',
                        border: '1px solid #F3F4F6'
                    }}>
                        <img
                            src={product.image_url}
                            alt={product.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => (e.currentTarget.src = 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?auto=format&fit=crop&q=80&w=400')}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: '0 0 0.5rem', color: '#111827' }}>
                            {locale === 'en' ? (product.name_en || product.display_name || product.name) : (product.display_name || product.name)}
                        </h2>
                        <p style={{
                            fontSize: '1.75rem',
                            fontWeight: '900',
                            color: 'var(--primary)',
                            margin: 0
                        }}>
                            ${(currentPrice || 0).toLocaleString('es-CO')}
                            <span style={{ fontSize: '0.9rem', color: '#6B7280', fontWeight: '500' }}> / {product.unit_of_measure}</span>
                        </p>
                    </div>
                </div>

                <div style={{ height: '1px', backgroundColor: '#F3F4F6', margin: '1.5rem 0' }}></div>

                <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '1.5rem', paddingRight: '0.5rem' }}>
                    {Object.entries(displayOptions).map(([optionName, values]: [string, any]) => {
                        const displayOptionName = optionName.toLowerCase().includes('presentaci') ? 'Presentación' : optionName;
                        return (
                            <div key={optionName} style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.6rem', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', color: '#9CA3AF' }}>
                                    {displayOptionName}
                                </label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                                    {Array.isArray(values) && values.map((val) => {
                                        const displayVal = val.includes('|') ? val.split('|')[0] : val;
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
                                    const isWeightUnit = ['kg', 'kilo', 'kilos', 'libra', 'libras', 'g', 'gr', 'gramos'].includes(unitLower);
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
                                    const isWeightUnit = ['kg', 'kilo', 'kilos', 'libra', 'libras', 'g', 'gr', 'gramos'].includes(unitLower);
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
                                    const isWeightUnit = ['kg', 'kilo', 'kilos', 'libra', 'libras', 'g', 'gr', 'gramos'].includes(unitLower);
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
