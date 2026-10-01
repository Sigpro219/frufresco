'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseMobileGpsTrackerProps {
    plate: string;
    enabled: boolean;
    intervalMs?: number; // Default: 60000 (60s)
}

interface QueuedPing {
    plate: string;
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
    accuracy?: number;
    battery_level?: number;
    tracking_source: 'mobile_app';
    timestamp: string;
}

export function useMobileGpsTracker({ plate, enabled, intervalMs = 60000 }: UseMobileGpsTrackerProps) {
    const [isTracking, setIsTracking] = useState(false);
    const [lastPing, setLastPing] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [queueSize, setQueueSize] = useState(0);

    const latestCoords = useRef<{ lat: number; lng: number; speed?: number; heading?: number; accuracy?: number } | null>(null);
    const offlineQueue = useRef<QueuedPing[]>([]);
    const wakeLockRef = useRef<any>(null);
    const watchIdRef = useRef<number | null>(null);
    const intervalRef = useRef<any>(null);

    // 1. Manejo de WakeLock para prevenir suspensión de pantalla
    const requestWakeLock = useCallback(async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                console.log('[GPS Tracker] Screen WakeLock acquired');
            }
        } catch (e: any) {
            console.warn('[GPS Tracker] WakeLock not supported or denied:', e.message);
        }
    }, []);

    // 2. Envío de pings (individual o por lote en ráfaga)
    const sendTelemetry = useCallback(async (pings: QueuedPing[]) => {
        if (!pings || pings.length === 0) return;

        try {
            const res = await fetch('/api/transport/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pings)
            });

            if (res.ok) {
                setLastPing(new Date());
                offlineQueue.current = [];
                setQueueSize(0);
                setError(null);
            } else {
                throw new Error(`Server returned HTTP ${res.status}`);
            }
        } catch (err: any) {
            console.warn('[GPS Tracker] Network error sending ping. Enqueuing offline:', err.message);
            setQueueSize(offlineQueue.current.length);
        }
    }, []);

    // 3. Función de emisión de un latido (Heartbeat)
    const emitHeartbeat = useCallback(async () => {
        if (!plate || !latestCoords.current) return;

        let batteryLevel: number | undefined = undefined;
        try {
            if ('getBattery' in navigator) {
                const battery: any = await (navigator as any).getBattery();
                batteryLevel = Math.round(battery.level * 100);
            }
        } catch {
            // Non-critical
        }

        const newPing: QueuedPing = {
            plate: plate.toUpperCase(),
            latitude: latestCoords.current.lat,
            longitude: latestCoords.current.lng,
            speed: latestCoords.current.speed,
            heading: latestCoords.current.heading,
            accuracy: latestCoords.current.accuracy,
            battery_level: batteryLevel,
            tracking_source: 'mobile_app',
            timestamp: new Date().toISOString()
        };

        offlineQueue.current.push(newPing);
        setQueueSize(offlineQueue.current.length);

        // Intentar enviar todo el lote acumulado
        await sendTelemetry([...offlineQueue.current]);
    }, [plate, sendTelemetry]);

    // 4. Ciclo de vida del observador de geolocalización
    useEffect(() => {
        if (!enabled || !plate) {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => {});
                wakeLockRef.current = null;
            }
            setIsTracking(false);
            return;
        }

        if (!navigator.geolocation) {
            setError('Geolocalización no soportada en este dispositivo.');
            return;
        }

        requestWakeLock();
        setIsTracking(true);

        // Iniciar observación de alta precisión
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                latestCoords.current = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    speed: pos.coords.speed !== null ? Math.round(pos.coords.speed * 3.6) : 0, // m/s a km/h
                    heading: pos.coords.heading !== null ? Math.round(pos.coords.heading) : 0,
                    accuracy: Math.round(pos.coords.accuracy)
                };
            },
            (err) => {
                console.warn('[GPS Tracker] Geolocation warning:', err.message);
                setError(err.message);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 10000,
                timeout: 20000
            }
        );

        // Latido inicial inmediato tras 3 segundos
        const initialTimer = setTimeout(() => {
            emitHeartbeat();
        }, 3000);

        // Temporizador periódico (Heartbeat cada 60s)
        intervalRef.current = setInterval(() => {
            emitHeartbeat();
        }, intervalMs);

        // Listener de reconexión online para vaciar cola
        const handleOnline = () => {
            if (offlineQueue.current.length > 0) {
                sendTelemetry([...offlineQueue.current]);
            }
        };
        window.addEventListener('online', handleOnline);

        return () => {
            clearTimeout(initialTimer);
            if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {});
            window.removeEventListener('online', handleOnline);
        };
    }, [enabled, plate, intervalMs, requestWakeLock, emitHeartbeat, sendTelemetry]);

    return {
        isTracking,
        lastPing,
        queueSize,
        error,
        forcePingNow: emitHeartbeat
    };
}
