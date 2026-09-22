'use client';

import { useState, useEffect } from 'react';

import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';

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
                    padding: '0.85rem 1.35rem',
                    borderRadius: '12px',
                    backgroundColor: toast.type === 'success' ? '#065F46' : toast.type === 'error' ? '#991B1B' : '#1E40AF',
                    color: 'white',
                    fontWeight: '700',
                    fontSize: '0.85rem',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    <style>{`
                        @keyframes slideIn {
                            from { transform: translateX(100%); opacity: 0; }
                            to { transform: translateX(0); opacity: 1; }
                        }
                    `}</style>
                    {toast.type === 'success' && <CheckCircle2 size={18} strokeWidth={2.2} />}
                    {toast.type === 'error' && <AlertTriangle size={18} strokeWidth={2.2} />}
                    {toast.type === 'info' && <Info size={18} strokeWidth={2.2} />}
                    <span>{toast.message}</span>
                </div>
            ))}
        </div>
    );
}
