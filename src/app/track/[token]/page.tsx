'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Radio, Navigation, Truck, AlertTriangle, CheckCircle2, Power, RefreshCw, ShieldAlert } from 'lucide-react';
import { useMobileGpsTracker } from '@/components/telemetry/MobileGpsTracker';

interface BeaconVerifyInfo {
    valid: boolean;
    plate: string;
    route_status: string;
    total_stops: number;
    expires_at: string;
}

export default function ExpressBeaconPage() {
    const params = useParams();
    const token = typeof params?.token === 'string' ? params.token : '';

    const [loading, setLoading] = useState(true);
    const [info, setInfo] = useState<BeaconVerifyInfo | null>(null);
    const [verifyError, setVerifyError] = useState<string | null>(null);
    const [active, setActive] = useState(false);

    useEffect(() => {
        if (!token) {
            setVerifyError('Enlace de baliza inválido.');
            setLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/transport/beacon/verify?token=${encodeURIComponent(token)}`, {
                    cache: 'no-store',
                });
                const data = await res.json().catch(() => null);
                if (cancelled) return;
                if (!res.ok || !data?.valid) {
                    setVerifyError(data?.error || 'Este enlace de ruta ya expiró o fue cerrado.');
                    setInfo(null);
                } else {
                    setInfo(data);
                    setVerifyError(null);
                }
            } catch {
                if (!cancelled) setVerifyError('No se pudo conectar con Torre de Control.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [token]);

    const { isTracking, lastPing, error, queueSize, revoked, sendNow } = useMobileGpsTracker({
        plate: info?.plate || '',
        enabled: active && Boolean(info?.plate),
        intervalMs: 60000,
        beaconToken: token,
    });

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: '#0B1120', color: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
                <RefreshCw size={28} className="animate-spin" color="#10B981" />
                <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: '#94A3B8' }}>Validando baliza de ruta...</p>
            </div>
        );
    }

    if (verifyError || !info || revoked) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: '#0B1120', color: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
                <div style={{ maxWidth: '420px', width: '100%', backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '20px', padding: '1.75rem', textAlign: 'center' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#F87171', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                        <ShieldAlert size={28} />
                    </div>
                    <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontWeight: 900 }}>Baliza No Disponible</h1>
                    <p style={{ margin: 0, fontSize: '0.88rem', color: '#9CA3AF', lineHeight: 1.5 }}>
                        {revoked ? 'La ruta finalizó o fue cerrada por Torre de Control.' : verifyError}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#0B1120', color: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
            <div style={{ maxWidth: '430px', width: '100%', backgroundColor: '#111827', border: `1px solid ${isTracking ? 'rgba(16, 185, 129, 0.5)' : '#1F2937'}`, borderRadius: '24px', padding: '1.5rem', boxShadow: '0 20px 45px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Truck size={20} color="#10B981" />
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em' }}>BALIZA MÓVIL FRUFRESCO</span>
                    </div>
                    <span style={{
                        fontSize: '0.7rem', fontWeight: 900, padding: '4px 10px', borderRadius: '999px',
                        backgroundColor: isTracking ? 'rgba(16, 185, 129, 0.18)' : 'rgba(148, 163, 184, 0.14)',
                        color: isTracking ? '#34D399' : '#94A3B8',
                        display: 'inline-flex', alignItems: 'center', gap: '5px'
                    }}>
                        <Radio size={12} />
                        {isTracking ? 'EN VIVO' : 'EN PAUSA'}
                    </span>
                </div>

                <div style={{ backgroundColor: '#0F172A', borderRadius: '16px', padding: '1rem 1.25rem', border: '1px solid #1E293B', marginBottom: '1.25rem' }}>
                    <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>Placa Asignada</div>
                    <div style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '0.04em', color: '#FFFFFF', marginTop: '2px' }}>{info.plate}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.65rem', fontSize: '0.78rem', color: '#CBD5E1' }}>
                        <span>Estado: <strong>{info.route_status.toUpperCase()}</strong></span>
                        <span>Paradas: <strong>{info.total_stops}</strong></span>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => setActive(prev => !prev)}
                    style={{
                        width: '100%', padding: '1rem', borderRadius: '16px', border: 'none',
                        backgroundColor: active ? '#DC2626' : '#059669',
                        color: '#FFFFFF', fontSize: '1rem', fontWeight: 900, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                        boxShadow: active ? '0 10px 25px rgba(220,38,38,0.35)' : '0 10px 25px rgba(5,150,105,0.35)'
                    }}
                >
                    {active ? <Power size={20} /> : <Navigation size={20} />}
                    {active ? 'DETENER GPS' : 'ACTIVAR GPS EN VIVO'}
                </button>

                {active && (
                    <button
                        type="button"
                        onClick={() => sendNow()}
                        style={{
                            width: '100%', marginTop: '0.75rem', padding: '0.75rem', borderRadius: '12px',
                            border: '1px solid #334155', backgroundColor: '#1E293B', color: '#E2E8F0',
                            fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                        }}
                    >
                        <RefreshCw size={15} />
                        Enviar ubicación ahora
                    </button>
                )}

                <div style={{ marginTop: '1.25rem', fontSize: '0.78rem', color: '#94A3B8', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {lastPing && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34D399', fontWeight: 700 }}>
                            <CheckCircle2 size={15} />
                            Último reporte: {lastPing.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                    )}
                    {queueSize > 0 && (
                        <div style={{ color: '#FBBF24' }}>Pendientes por red: {queueSize}</div>
                    )}
                    {error && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#F87171', fontWeight: 700 }}>
                            <AlertTriangle size={15} />
                            {error}
                        </div>
                    )}
                    <div style={{ marginTop: '0.35rem', padding: '0.75rem', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', color: '#BFDBFE', lineHeight: 1.45 }}>
                        Mantén esta pestaña abierta durante la ruta. Si pasas a Waze o Google Maps, al volver a esta ventana se enviará tu ubicación de inmediato.
                    </div>
                </div>
            </div>
        </div>
    );
}
