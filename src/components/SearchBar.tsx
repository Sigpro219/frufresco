'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense, useEffect } from 'react';
import { Search, X, Info } from 'lucide-react';
import { translations, Locale } from '../lib/translations';

function SearchBarContent({ placeholder }: { placeholder?: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
    const t = translations[locale];
    const [query, setQuery] = useState(searchParams.get('q') || '');

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

    // Debounce to avoid excessive router calls
    useEffect(() => {
        const timer = setTimeout(() => {
            const currentQ = searchParams.get('q') || '';
            if (query !== currentQ) {
                const params = new URLSearchParams(searchParams.toString());
                if (query) {
                    params.set('q', query);
                } else {
                    params.delete('q');
                }
                router.replace(`/?${params.toString()}#catalog`, { scroll: false });
            }
        }, 600);

        return () => clearTimeout(timer);
    }, [query, router, searchParams]);

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
                        padding: '1.2rem 3.5rem 1.2rem 3.8rem',
                        borderRadius: 'var(--radius-full)',
                        border: '2px solid var(--border)',
                        background: 'white',
                        color: 'var(--text-main)',
                        fontSize: '1.15rem',
                        fontWeight: '500',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.05)',
                        outline: 'none',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                    onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.boxShadow = '0 15px 40px rgba(26, 77, 46, 0.12)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.05)';
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

                {query && (
                    <button
                        onClick={clearSearch}
                        style={{
                            position: 'absolute',
                            right: '20px',
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

                <style dangerouslySetInnerHTML={{ __html: `
                    .search-tooltip {
                        position: absolute;
                        bottom: calc(100% + 12px);
                        right: -10px;
                        background-color: #1F2937;
                        color: white;
                        padding: 8px 14px;
                        border-radius: 8px;
                        font-size: 0.8rem;
                        font-weight: 500;
                        white-space: nowrap;
                        opacity: 0;
                        visibility: hidden;
                        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                        box-shadow: 0 10px 20px rgba(0, 0, 0, 0.15);
                        pointer-events: none;
                        z-index: 50;
                        transform: translateY(4px);
                    }
                    .search-tooltip::after {
                        content: '';
                        position: absolute;
                        top: 100%;
                        right: 16px;
                        border-width: 6px;
                        border-style: solid;
                        border-color: #1F2937 transparent transparent transparent;
                    }
                    .info-icon-container:hover .search-tooltip {
                        opacity: 1;
                        visibility: visible;
                        transform: translateY(0);
                    }
                `}} />

                <div className="info-icon-container" style={{
                    position: 'absolute',
                    right: query ? '60px' : '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9CA3AF',
                    cursor: 'help',
                    padding: '8px',
                    transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#4B5563'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}
                >
                    <Info size={20} strokeWidth={2.5} />
                    <div className="search-tooltip">
                        {t.searchTip}
                    </div>
                </div>
            </div>
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
