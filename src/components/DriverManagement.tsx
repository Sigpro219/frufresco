'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

import { THEME } from '@/lib/adminTheme';

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
                <div style={{ textAlign: 'center', color: THEME.colors.textSecondary }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔄</div>
                    <div>Cargando conductores...</div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: THEME.colors.textMain }}>
                    Conductores <span style={{ color: THEME.colors.primary }}>Activos</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: THEME.colors.textSecondary, marginLeft: '0.5rem' }}>
                        ({drivers.filter(d => d.is_active !== false).length})
                    </span>
                </h2>
                <button 
                    onClick={loadDrivers}
                    style={{ 
                        padding: '0.45rem 0.9rem', 
                        borderRadius: THEME.radius.md, 
                        backgroundColor: 'white', 
                        border: `1px solid ${THEME.colors.border}`, 
                        cursor: 'pointer', 
                        fontWeight: '800',
                        fontSize: '0.78rem',
                        color: THEME.colors.textMain,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        boxShadow: THEME.shadow.sm
                    }}
                >
                    <span>🔄</span> Actualizar Lista
                </button>
            </div>

            {drivers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: '#F9FAFB', borderRadius: THEME.radius.lg, border: `1px dashed ${THEME.colors.border}` }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🚛</div>
                    <div style={{ fontSize: '1rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '0.4rem' }}>
                        No hay conductores registrados.
                    </div>
                    <div style={{ color: THEME.colors.textSecondary, fontSize: '0.82rem' }}>
                        Ve a <strong>Talento Humano</strong> y asigna conductores allí.
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                    {drivers.filter(d => d.is_active !== false).map(driver => (
                        <div 
                            key={driver.id} 
                            style={{ 
                                backgroundColor: 'white', 
                                borderRadius: THEME.radius.lg, 
                                padding: '1.25rem', 
                                border: `1px solid ${THEME.colors.border}`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: THEME.shadow.sm
                            }}
                        >
                            <div style={{ 
                                width: '50px', 
                                height: '50px', 
                                borderRadius: '12px', 
                                background: 'linear-gradient(135deg, #0D7A57 0%, #10B981 100%)', 
                                display: 'flex', 
                                justifyContent: 'center', 
                                alignItems: 'center', 
                                color: 'white', 
                                fontWeight: '900', 
                                fontSize: '1.1rem',
                                boxShadow: '0 4px 8px rgba(13, 122, 87, 0.25)'
                            }}>
                                {getInitials(driver.contact_name)}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '900', color: THEME.colors.textMain, fontSize: '0.95rem' }}>
                                    {driver.contact_name || 'Sin nombre'}
                                </div>
                                <div style={{ fontSize: '0.78rem', color: THEME.colors.textSecondary, fontWeight: '600', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span>📞</span> {driver.phone || 'N/A'}
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <span style={{ 
                                    backgroundColor: '#ECFDF5', 
                                    color: '#065F46', 
                                    border: '1px solid #A7F3D0',
                                    padding: '0.25rem 0.6rem', 
                                    borderRadius: '8px', 
                                    fontSize: '0.65rem', 
                                    fontWeight: '800'
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
