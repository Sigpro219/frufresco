'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSearchParams } from 'next/navigation';
import { translations, Locale } from '../lib/translations';

export default function OrderTracking() {
    const searchParams = useSearchParams();
    const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
    const t = translations[locale];
    const [orderId, setOrderId] = useState('');
    const [trackingData, setTrackingData] = useState<{
        status: string;
        sequence_number: number;
        routes: {
            vehicle_plate: string;
            status: string;
        } | {
            vehicle_plate: string;
            status: string;
        }[];
    } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleTrack = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orderId) return;

        setLoading(true);
        setError(null);
        try {
            const { data: stop, error: stopErr } = await supabase
                .from('route_stops')
                .select(`
                    status, sequence_number,
                    routes (vehicle_plate, status)
                `)
                .eq('order_id', orderId)
                .single();

            if (stopErr || !stop) {
                setError(t.trackingError);
                setTrackingData(null);
                return;
            }

            setTrackingData(stop);
        } catch {
            setError(t.trackingQueryError);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ color: '#F9FAFB' }}>
            <div style={{ 
                display: 'flex', 
                flexDirection: 'row', 
                flexWrap: 'wrap',
                alignItems: 'center', 
                justifyContent: 'center',
                gap: '1.5rem',
                padding: '0.5rem 0'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: '850', color: 'white', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t.orderTracking}</h3>
                </div>

                <form onSubmit={handleTrack} style={{ display: 'flex', gap: '0.4rem', maxWidth: '400px', flex: '1' }}>
                    <input 
                        type="text" 
                        placeholder={t.orderIdPlaceholder} 
                        value={orderId}
                        onChange={(e) => setOrderId(e.target.value)}
                        style={{ 
                            flex: 1, padding: '0.5rem 0.8rem', borderRadius: '8px', 
                            border: '1px solid rgba(255, 255, 255, 0.15)', backgroundColor: 'rgba(255,255,255,0.03)',
                            color: 'white', fontSize: '0.8rem', outline: 'none'
                        }}
                    />
                    <button 
                        type="submit" 
                        disabled={loading}
                        style={{ 
                            padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', 
                            backgroundColor: '#0EA5E9', color: 'white', fontWeight: '800', 
                            cursor: 'pointer', fontSize: '0.75rem'
                        }}>
                        {loading ? '...' : 'OK'}
                    </button>
                </form>

                {error && (
                    <span style={{ color: '#FCA5A5', fontSize: '0.7rem', fontWeight: '600' }}>⚠️ {error}</span>
                )}

                {trackingData && (
                    <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '0.4rem 1rem', borderRadius: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>🚛</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: '850' }}>
                                {Array.isArray(trackingData.routes) ? trackingData.routes[0]?.vehicle_plate : trackingData.routes?.vehicle_plate}
                            </span>
                        </div>
                        <div style={{ height: '12px', width: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <CompactStep active={true} completed={true} title={t.trackingStepLoad} />
                            <CompactStep 
                                active={(Array.isArray(trackingData.routes) ? trackingData.routes[0]?.status : trackingData.routes?.status) === 'in_transit'} 
                                completed={trackingData.status === 'delivered'} 
                                title={t.trackingStepRoute} 
                            />
                            <CompactStep active={trackingData.status === 'delivered'} completed={trackingData.status === 'delivered'} title={t.trackingStepDelivered} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function CompactStep({ title, active, completed }: { title: string, active: boolean, completed: boolean }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ 
                width: '10px', height: '10px', 
                borderRadius: '50%', backgroundColor: completed ? '#0EA5E9' : active ? '#0EA5E9' : 'transparent', 
                border: `2px solid ${completed || active ? '#0EA5E9' : 'rgba(255, 255, 255, 0.2)'}`
            }} />
            <span style={{ fontSize: '0.75rem', color: active ? 'white' : 'rgba(255, 255, 255, 0.4)', fontWeight: '700' }}>{title}</span>
        </div>
    );
}
