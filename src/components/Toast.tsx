'use client';

import { useState, useEffect } from 'react';

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

export default function Toast() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    // Exponer la función globalmente para facilitar la depuración y el uso sin Context por ahora
    useEffect(() => {
        (window as any).showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
            const id = Math.random().toString(36).substr(2, 9);
            setToasts(prev => [...prev, { id, message, type }]);
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, 3000);
        };
    }, []);

    if (toasts.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            zIndex: 9999
        }}>
            {toasts.map(toast => (
                <div key={toast.id} style={{
                    padding: '1rem 1.5rem',
                    borderRadius: '12px',
                    backgroundColor: toast.type === 'success' ? '#10B981' : toast.type === 'error' ? '#EF4444' : '#3B82F6',
                    color: 'white',
                    fontWeight: '700',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    <style>{`
                        @keyframes slideIn {
                            from { transform: translateX(100%); opacity: 0; }
                            to { transform: translateX(0); opacity: 1; }
                        }
                    `}</style>
                    {toast.type === 'success' && '✅'}
                    {toast.type === 'error' && '❌'}
                    {toast.type === 'info' && 'ℹ️'}
                    {toast.message}
                </div>
            ))}
        </div>
    );
}
