'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';

export default function CommandCenter() {
    const { profile, loading: authLoading } = useAuth();
    const router = useRouter();
    const [settings, setSettings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });

    // Cargar solo lo necesario para el Chief Engineer
    useEffect(() => {
        if (!authLoading && profile?.role !== 'admin') {
            router.push('/admin'); // Protección básica por ahora
        }
        fetchSettings();
    }, [profile, authLoading, router]);

    const fetchSettings = async () => {
        try {
            const { data, error } = await supabase.from('settings').select('*');
            if (error) throw error;
            setSettings(data || []);
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateSetting = async (key: string, newValue: string) => {
        try {
            const { error } = await supabase.from('settings').upsert({ key, value: newValue });
            if (error) throw error;
            setSettings(prev => prev.map(s => s.key === key ? { ...s, value: newValue } : s));
            setStatusMessage({ text: 'Gobernanza actualizada correctamente', type: 'success' });
            setTimeout(() => setStatusMessage({ text: '', type: '' }), 3000);
        } catch (error) {
            console.error('Error updating setting:', error);
            setStatusMessage({ text: 'Error al actualizar gobernanza', type: 'error' });
        }
    };

    // Lógica de Unidades (Migrada de settings)
    const getActiveUnits = () => {
        const standard = settings.find(s => s.key === 'standard_units')?.value || '';
        const suspended = settings.find(s => s.key === 'suspended_units')?.value || '';
        const suspendedList = suspended ? suspended.split(',') : [];
        return standard ? standard.split(',').filter(u => !suspendedList.includes(u)) : [];
    };

    const addNewUnit = async (unit: string) => {
        const standard = settings.find(s => s.key === 'standard_units')?.value || '';
        const list = standard ? standard.split(',') : [];
        if (!list.includes(unit)) {
            const newList = [...list, unit].join(',');
            await handleUpdateSetting('standard_units', newList);
        }
    };

    const removeUnitPermanently = async (unit: string) => {
        if (!window.confirm(`¿Estás SEGURO de eliminar "${unit}" permanentemente? Esto es irreversible y puede romper el inventario histórico.`)) return;
        
        const standard = settings.find(s => s.key === 'standard_units')?.value || '';
        const newList = standard.split(',').filter(u => u !== unit).join(',');
        await handleUpdateSetting('standard_units', newList);
    };

    if (authLoading || loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando Centro de Mando Técnico...</div>;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', padding: '2rem' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', margin: 0, letterSpacing: '-1px' }}>
                            DELTA <span style={{ color: '#D4AF37' }}>Command Center</span>
                        </h1>
                        <p style={{ color: '#6B7280', fontSize: '1rem', marginTop: '8px' }}>
                            Consola Maestra de Gobernanza del Motor FruFresco CORE.
                        </p>
                    </div>
                </header>

                {statusMessage.text && (
                    <div style={{ 
                        position: 'fixed', top: '20px', right: '20px', 
                        padding: '1rem 2rem', borderRadius: '12px', 
                        backgroundColor: statusMessage.type === 'success' ? '#DEF7EC' : '#FDE8E8',
                        color: statusMessage.type === 'success' ? '#03543F' : '#9B1C1C',
                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                        zIndex: 1000, fontWeight: '700'
                    }}>
                        {statusMessage.text}
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                    
                    {/* COLUMNA IZQUIERDA: GOBERNANZA TÉCNICA */}
                    <div>
                        {/* UNIDADES DE MEDIDA */}
                        <section style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #E5E7EB', marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
                                <span style={{ fontSize: '1.5rem' }}>📏</span>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#111827', margin: 0 }}>Gobernanza de Unidades</h2>
                            </div>
                            <p style={{ color: '#4B5563', fontSize: '0.9rem', marginBottom: '2rem' }}>
                                Define las unidades de medida oficiales. <strong style={{ color: '#EF4444' }}>Precaución:</strong> Eliminar una unidad puede afectar el inventario histórico.
                            </p>

                            <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
                                <input 
                                    placeholder="+ Registrar nueva unidad técnica..." 
                                    style={{ flex: 1, padding: '12px 1rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '0.9rem', fontWeight: '600' }} 
                                    onKeyDown={(e) => { if(e.key==='Enter' && e.currentTarget.value) { addNewUnit(e.currentTarget.value); e.currentTarget.value=''; } }} 
                                />
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {getActiveUnits().map((u: string) => (
                                    <div key={u} style={{ backgroundColor: '#F0F9FF', padding: '10px 1.2rem', borderRadius: '15px', border: '1px solid #BAE6FD', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span style={{ fontWeight: '800', color: '#0369A1' }}>{u}</span>
                                        <button 
                                            onClick={() => removeUnitPermanently(u)} 
                                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#EF4444', fontSize: '1.2rem', padding: 0, display: 'flex' }}
                                            title="Eliminar permanentemente"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* COLUMNA DERECHA: SALUD DEL SISTEMA */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ backgroundColor: '#111827', borderRadius: '24px', padding: '2rem', color: 'white' }}>
                            <h3 style={{ fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase', color: '#9CA3AF', margin: '0 0 1rem 0', letterSpacing: '1px' }}>Salud del Motor</h3>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#10B981', boxShadow: '0 0 10px #10B981' }}></div>
                                <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>Conexión Supabase Activa</span>
                            </div>

                            <div style={{ padding: '1rem', backgroundColor: '#1F2937', borderRadius: '16px', border: '1px solid #374151' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ color: '#9CA3AF', fontSize: '0.8rem' }}>Versión CORE</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>v1.0.0-gold</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#9CA3AF', fontSize: '0.8rem' }}>Tenant ID</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>delta_coretech</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '1.5rem', border: '1px solid #E5E7EB' }}>
                            <h3 style={{ fontSize: '0.85rem', fontWeight: '800', color: '#111827', margin: '0 0 12px 0' }}>💡 Nota del Sistema</h3>
                            <p style={{ fontSize: '0.8rem', color: '#6B7280', margin: 0, lineHeight: '1.5' }}>
                                Estás operando en nivel <strong>Chief Engineer</strong>. Cualquier cambio aquí se propaga a todas las capas de la aplicación inmediatamente.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
