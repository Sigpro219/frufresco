'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface UseMobileGpsTrackerProps {
    plate: string;
    enabled: boolean;
    intervalMs?: number; // Quiet default: 60000 (60s); moving uses 20000 (20s)
    beaconToken?: string | null;
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

export function useMobileGpsTracker({
    plate,
    enabled,
    intervalMs = 60000,
    beaconToken = null,
}: UseMobileGpsTrackerProps) {
    const [isTracking, setIsTracking] = useState(false);
    const [lastPing, setLastPing] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [revoked, setRevoked] = useState(false);
    const [queueSize, setQueueSize] = useState(0);

    const watchIdRef = useRef<number | null>(null);
    const latestCoords = useRef<{ lat: number; lng: number; speed: number; heading: number; accuracy: number } | null>(null);
    const offlineQueue = useRef<QueuedPing[]>([]);
    const wakeLockRef = useRef<any>(null);
    const lastSentAtRef = useRef<number>(0);

    const requestWakeLock = useCallback(async () => {
        try {
            if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && document.visibilityState === 'visible') {
                wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            }
        } catch (e: any) {
            console.warn('[GPS Tracker] WakeLock not supported or denied:', e?.message);
        }
    }, []);

    const stopWatch = useCallback(() => {
        if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        if (wakeLockRef.current) {
            wakeLockRef.current.release().catch(() => {});
            wakeLockRef.current = null;
        }
        setIsTracking(false);
    }, []);

    const sendTelemetry = useCallback(async (pings: QueuedPing[]) => {
        if (!pings || pings.length === 0) return;

        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (beaconToken) {
                headers['X-GPS-Beacon-Token'] = beaconToken;
            } else {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.access_token) {
                    headers['Authorization'] = `Bearer ${session.access_token}`;
                }
            }

            const res = await fetch('/api/transport/telemetry', {
                method: 'POST',
                headers,
                body: JSON.stringify(pings.slice(-50)),
            });

            if (res.status === 401 || res.status === 403 || res.status === 410) {
                const errBody = await res.json().catch(() => null);
                offlineQueue.current = [];
                setQueueSize(0);
                setRevoked(true);
                setError(errBody?.error?.message || 'Baliza revocada o sin autorización.');
                stopWatch();
                return;
            }

            if (res.ok) {
                const body = await res.json().catch(() => null);
                const results: Array<{ status?: string }> = body?.data?.results || body?.results || [];
                const allIgnored = results.length > 0 && results.every(r => r.status === 'ignored_unregistered');
                if (allIgnored) {
                    setError('Placa no registrada en Flota');
                    return;
                }
                lastSentAtRef.current = Date.now();
                setLastPing(new Date());
                offlineQueue.current = [];
                setQueueSize(0);
                setError(null);
            } else {
                throw new Error(`Server returned HTTP ${res.status}`);
            }
        } catch (err: any) {
            console.warn('[GPS Tracker] Network error sending ping. Enqueuing offline:', err?.message);
            setQueueSize(offlineQueue.current.length);
        }
    }, [beaconToken, stopWatch]);

    const emitHeartbeat = useCallback(async () => {
        if (!plate || !latestCoords.current || revoked) return;
        if (latestCoords.current.lat === 0 && latestCoords.current.lng === 0) return;

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
            plate: plate.trim().toUpperCase(),
            latitude: latestCoords.current.lat,
            longitude: latestCoords.current.lng,
            speed: latestCoords.current.speed,
            heading: latestCoords.current.heading,
            accuracy: latestCoords.current.accuracy,
            battery_level: batteryLevel,
            tracking_source: 'mobile_app',
            timestamp: new Date().toISOString(),
        };

        offlineQueue.current.push(newPing);
        if (offlineQueue.current.length > 50) {
            offlineQueue.current = offlineQueue.current.slice(-50);
        }
        setQueueSize(offlineQueue.current.length);
        await sendTelemetry([...offlineQueue.current]);
    }, [plate, revoked, sendTelemetry]);

    useEffect(() => {
        if (!enabled || !plate || revoked) {
            stopWatch();
            return;
        }

        if (!navigator.geolocation) {
            setError('Geolocalización no soportada en este dispositivo.');
            return;
        }

        requestWakeLock();
        setIsTracking(true);

        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                latestCoords.current = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    speed: pos.coords.speed !== null ? Math.round(pos.coords.speed * 3.6) : 0,
                    heading: pos.coords.heading !== null ? Math.round(pos.coords.heading) : 0,
                    accuracy: Math.round(pos.coords.accuracy),
                };
            },
            (err) => {
                console.warn('[GPS Tracker] Geolocation warning:', err.message);
                setError(err.message);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 10000,
                timeout: 20000,
            }
        );

        const initialTimer = setTimeout(() => {
            emitHeartbeat();
        }, 2500);

        const tickTimer = setInterval(() => {
            const speed = latestCoords.current?.speed || 0;
            const adaptiveMs = speed > 1 ? Math.min(intervalMs, 20000) : intervalMs;
            if (Date.now() - lastSentAtRef.current >= adaptiveMs) {
                emitHeartbeat();
            }
        }, 5000);

        const handleOnline = () => {
            if (offlineQueue.current.length > 0) {
                sendTelemetry([...offlineQueue.current]);
            }
        };

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                requestWakeLock();
                emitHeartbeat();
            }
        };

        window.addEventListener('online', handleOnline);
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearTimeout(initialTimer);
            clearInterval(tickTimer);
            window.removeEventListener('online', handleOnline);
            document.removeEventListener('visibilitychange', handleVisibility);
            stopWatch();
        };
    }, [enabled, plate, intervalMs, revoked, emitHeartbeat, sendTelemetry, requestWakeLock, stopWatch]);

    return { isTracking, lastPing, error, queueSize, revoked, sendNow: emitHeartbeat };
}
