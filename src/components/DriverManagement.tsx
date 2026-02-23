'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Driver {
    id: string;
    contact_name: string;
    phone?: string;
    avatar_url?: string;
    is_active?: boolean;
}

export default function DriverManagement() {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);

    const loadDrivers = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase
            .from('profiles')
            .select('id, contact_name, phone, avatar_url, is_active')
            .eq('role', 'driver')
            .order('contact_name');
        
        setDrivers(data || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadDrivers();
    }, [loadDrivers]);

    const getInitials = (name: string) => {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
        }
        return parts[0].charAt(0).toUpperCase();
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
                <div style={{ textAlign: 'center', color: '#6B7280' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔄</div>
                    <div>Cargando conductores...</div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '900', color: '#111827' }}>
                    Conductores <span style={{ color: '#0891B2' }}>Activos</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#6B7280', marginLeft: '0.5rem' }}>
                        ({drivers.filter(d => d.is_active !== false).length})
                    </span>
                </h2>
                <button 
                    onClick={loadDrivers}
                    style={{ 
                        padding: '0.6rem 1.2rem', 
                        borderRadius: '12px', 
                        backgroundColor: 'white', 
                        border: '1px solid #E5E7EB', 
                        cursor: 'pointer', 
                        fontWeight: '700',
                        fontSize: '0.85rem',
                        color: '#374151',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                >
                    <span>🔄</span> Actualizar Lista
                </button>
            </div>

            {drivers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: '#F9FAFB', borderRadius: '24px', border: '1px dashed #E5E7EB' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚛</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem' }}>
                        No hay conductores registrados.
                    </div>
                    <div style={{ color: '#6B7280', fontSize: '0.9rem' }}>
                        Ve a <strong>Talento Humano</strong> y asigna conductores allí.
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    {drivers.filter(d => d.is_active !== false).map(driver => (
                        <div 
                            key={driver.id} 
                            style={{ 
                                backgroundColor: 'white', 
                                borderRadius: '24px', 
                                padding: '1.5rem', 
                                border: '1px solid #E5E7EB',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1.2rem',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: '0 2px 4px -1px rgba(0,0,0,0.02), 0 4px 6px -1px rgba(0,0,0,0.05)'
                            }}
                        >
                            <div style={{ 
                                width: '60px', 
                                height: '60px', 
                                borderRadius: '20px', 
                                background: 'linear-gradient(135deg, #0891B2 0%, #22D3EE 100%)', 
                                display: 'flex', 
                                justifyContent: 'center', 
                                alignItems: 'center',
                                color: 'white',
                                fontWeight: '900',
                                fontSize: '1.3rem',
                                letterSpacing: '0.05rem',
                                boxShadow: '0 10px 15px -3px rgba(8, 145, 178, 0.2)'
                            }}>
                                {getInitials(driver.contact_name)}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '900', color: '#111827', fontSize: '1.1rem', letterSpacing: '-0.02rem' }}>
                                    {driver.contact_name || 'Sin nombre'}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: '600', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span>📞</span> {driver.phone || 'N/A'}
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                                <span style={{ 
                                    backgroundColor: '#DCFCE7', 
                                    color: '#166534', 
                                    padding: '0.4rem 0.8rem', 
                                    borderRadius: '12px', 
                                    fontSize: '0.65rem', 
                                    fontWeight: '900',
                                    letterSpacing: '0.05rem'
                                }}>
                                    EN LÍNEA
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
