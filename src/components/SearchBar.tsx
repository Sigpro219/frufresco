'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, Suspense } from 'react';

function SearchBarContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState(searchParams.get('q') || '');

    // Debounce logic could be added here, but for simplicity we'll search on Enter or Button click
    // or just simple onChange for small delay.

    const handleSearch = (term: string) => {
        setQuery(term);
        const params = new URLSearchParams(searchParams.toString());
        if (term) {
            params.set('q', term);
        } else {
            params.delete('q');
        }

        // El parámetro category se mantiene automáticamente al usar params de searchParams.toString()
        router.replace(`/?${params.toString()}`);
    };

    return (
        <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', width: '100%' }}>
            <div style={{ position: 'relative', flex: 1 }}>
                <input
                    type="text"
                    placeholder="Buscar productos (ej: Mora, Tomate)..."
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '1rem 3rem 1rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                        fontSize: '1rem',
                        boxShadow: 'var(--shadow-sm)',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
                {query && (
                    <button
                        onClick={() => handleSearch('')}
                        style={{
                            position: 'absolute',
                            right: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: '#f3f4f6',
                            border: 'none',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#6b7280',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            zIndex: 5
                        }}
                        title="Limpiar búsqueda"
                    >
                        ✕
                    </button>
                )}
            </div>
        </div>
    );
}

export default function SearchBar() {
    return (
        <Suspense fallback={
            <div style={{ marginBottom: '2rem', height: '58px', backgroundColor: '#F3F4F6', borderRadius: 'var(--radius-md)' }}></div>
        }>
            <SearchBarContent />
        </Suspense>
    );
}
