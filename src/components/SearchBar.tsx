'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { translations, Locale } from '../lib/translations';

function SearchBarContent({ placeholder }: { placeholder?: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
    const t = translations[locale];
    const [query, setQuery] = useState(searchParams.get('q') || '');

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
        }, 400);

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
            </div>
            
            <p style={{ 
                textAlign: 'center', 
                fontSize: '0.85rem', 
                color: 'var(--text-muted)', 
                marginTop: '0.75rem',
                opacity: 0.8
            }}>
                {t.searchTip}
            </p>
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
