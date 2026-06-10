'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense, useEffect } from 'react';
import { Search, X, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { translations, Locale } from '../lib/translations';
import { useAuth } from '@/lib/authContext';

function SearchBarContent({ placeholder }: { placeholder?: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
    const t = translations[locale];
    const { profile } = useAuth();
    const [query, setQuery] = useState(searchParams.get('q') || '');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);

    // 1. Detect page reload ONCE on mount
    useEffect(() => {
        const isReload = window.performance.getEntriesByType('navigation')
            .map((nav) => (nav as any).type)
            .includes('reload');

        if (isReload) {
            const params = new URLSearchParams(window.location.search);
            if (params.has('q')) {
                params.delete('q');
                router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
                setQuery('');
            }
        }
    }, []); // Only on mount

    // 2. Sync input with URL changes
    useEffect(() => {
        setQuery(searchParams.get('q') || '');
    }, [searchParams]);

    // 3. Sync suggestions based on query and user profile pricing model
    useEffect(() => {
        const fetchSuggestions = async () => {
            if (query.trim().length < 2) {
                setSuggestions([]);
                setShowDropdown(false);
                return;
            }

            const pricingModelId = profile?.pricing_model_id || 'f7043ca1-94d5-4d25-bd10-fbf30ce120ee';

            let fetchedData: any[] = [];
            const { data, error } = await supabase
                .from('products')
                .select('id, name, category, base_price, image_url, display_name, web_conversion_factor, pricing_model_prices(price)')
                .eq('is_active', true)
                .eq('show_on_web', true)
                .eq('pricing_model_prices.model_id', pricingModelId)
                .ilike('name', `%${query}%`)
                .order('image_url', { ascending: false, nullsFirst: false })
                .limit(6);

            if (error) {
                console.error("Predictive query error, using fallback:", error.message);
                const { data: fallbackData } = await supabase
                    .from('products')
                    .select('id, name, category, base_price, image_url, display_name, web_conversion_factor')
                    .eq('is_active', true)
                    .eq('show_on_web', true)
                    .ilike('name', `%${query}%`)
                    .order('image_url', { ascending: false, nullsFirst: false })
                    .limit(6);
                fetchedData = fallbackData || [];
            } else {
                fetchedData = data || [];
            }

            setSuggestions(fetchedData);
            setShowDropdown(true);
        };

        const timer = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timer);
    }, [query, profile]);

    // Handle manual search
    const handleSearch = () => {
        const currentQ = searchParams.get('q') || '';
        setShowDropdown(false);
        if (query !== currentQ) {
            const params = new URLSearchParams(searchParams.toString());
            if (query) {
                params.set('q', query);
            } else {
                params.delete('q');
            }
            router.replace(`/?${params.toString()}#catalog`, { scroll: false });
        }
    };

    const clearSearch = () => {
        setQuery('');
        const params = new URLSearchParams(searchParams.toString());
        params.delete('q');
        router.replace(`/?${params.toString()}#catalog`, { scroll: false });
    };

    return (
        <div style={{ position: 'relative', width: '100%', maxWidth: '750px', margin: '0 auto 2.5rem' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder={placeholder || "Buscar productos (ej: Tomate, Cebolla...)"}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '1.2rem 4.5rem 1.2rem 3.8rem', // Reduced right padding further
                        borderRadius: 'var(--radius-full)',
                        border: '1px solid rgba(0,0,0,0.06)',
                        background: 'white',
                        color: 'var(--text-main)',
                        fontSize: '1.15rem',
                        fontWeight: '500',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.02)',
                        outline: 'none',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearch();
                        }
                    }}
                    onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(26, 77, 46, 0.2)';
                        e.currentTarget.style.boxShadow = '0 15px 40px rgba(26, 77, 46, 0.06), 0 0 0 4px rgba(26, 77, 46, 0.04)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)';
                        e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.02)';
                        e.currentTarget.style.transform = 'translateY(0)';
                    }}
                />
                
                <div style={{
                    position: 'absolute',
                    left: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: query ? 'var(--primary)' : 'var(--text-muted)',
                    transition: 'color 0.3s ease',
                    pointerEvents: 'none'
                }}>
                    <Search size={22} strokeWidth={2.5} />
                </div>

                <div style={{
                    position: 'absolute',
                    right: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    {query && (
                        <button
                            onClick={clearSearch}
                            style={{
                                background: '#f3f4f6',
                                border: 'none',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#6b7280',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                padding: 0
                            }}
                        >
                            <X size={18} strokeWidth={2.5} />
                        </button>
                    )}

                    <button
                        onClick={handleSearch}
                        style={{
                            background: 'var(--primary)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '45px',
                            height: '45px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 4px 12px rgba(26, 77, 46, 0.2)',
                            flexShrink: 0
                        }}
                    >
                        <Search size={20} strokeWidth={3} />
                    </button>
                </div>

                </div>

                {/* --- PREDICTIVE SEARCH DROPDOWN --- */}
                {showDropdown && suggestions.length > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: '20px',
                        right: '20px',
                        backgroundColor: 'rgba(255, 255, 255, 0.85)',
                        backdropFilter: 'blur(20px)',
                        borderRadius: '24px',
                        marginTop: '10px',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.02)',
                        zIndex: 1000,
                        overflow: 'hidden',
                        border: '1px solid rgba(0,0,0,0.05)',
                        animation: 'fadeInScale 0.2s ease-out'
                    }}>
                        {/* Section 1: Product Previews */}
                        <div style={{ padding: '10px' }}>
                            {suggestions.map(p => (
                                <div 
                                    key={`prod-${p.id}`}
                                    className="suggestion-row"
                                    onClick={() => {
                                        setShowDropdown(false);
                                        router.push(`/products/${p.id}`);
                                    }}
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '15px', 
                                        padding: '12px', 
                                        borderRadius: '16px',
                                        cursor: 'pointer',
                                        transition: 'all 0.25s ease'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.02)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <div style={{ width: '50px', height: '50px', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#f3f4f6', flexShrink: 0 }}>
                                        <img className="suggestion-thumb" src={p.image_url || '/placeholder.png'} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '700', color: '#111827', fontSize: '0.95rem' }}>{p.display_name || p.name}</div>
                                        <div style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '0.9rem' }}>
                                            ${(Math.ceil(((p.pricing_model_prices?.[0]?.price || p.base_price || 0) * (p.web_conversion_factor || 1)) / 50) * 50).toLocaleString()}
                                        </div>
                                    </div>
                                    <ChevronRight size={18} color="#d1d5db" />
                                </div>
                            ))}
                        </div>
                        
                        <div 
                            onClick={handleSearch}
                            style={{ 
                                padding: '15px', 
                                textAlign: 'center', 
                                backgroundColor: 'rgba(0,0,0,0.01)', 
                                borderTop: '1px solid rgba(0,0,0,0.03)',
                                color: '#6b7280', 
                                fontSize: '0.85rem', 
                                fontWeight: '700', 
                                cursor: 'pointer',
                                transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.03)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.01)'}
                        >
                            Ver todos los resultados para "{query}"
                        </div>
                    </div>
                )}
                
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes fadeInScale {
                        from { opacity: 0; transform: translateY(-10px) scale(0.98); }
                        to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                    .suggestion-row:hover .suggestion-thumb {
                        transform: scale(1.06);
                    }
                    .suggestion-thumb {
                        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    }
                `}} />
            </div>
    );
}

export default function SearchBar({ placeholder }: { placeholder?: string }) {
    return (
        <Suspense fallback={
            <div style={{ marginBottom: '2.5rem', height: '64px', backgroundColor: '#F3F4F6', borderRadius: 'var(--radius-full)', maxWidth: '750px', margin: '0 auto' }}></div>
        }>
            <SearchBarContent placeholder={placeholder} />
        </Suspense>
    );
}
