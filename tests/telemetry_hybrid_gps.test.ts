import { describe, it } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';
import { 
    extractCleanPlate, 
    parseTelemetryDate, 
    isValidTelemetryTimestamp, 
    normalizeApps360Device 
} from '../src/lib/telemetry/apps360';

describe('🛰️ Hybrid Telemetry & GPS Ingestion Engine', () => {

    describe('1. Extracción y Limpieza de Placas Colombianas', () => {
        it('debe limpiar placas con guión o espacios', () => {
            assert.strictEqual(extractCleanPlate('WFW-369'), 'WFW369');
            assert.strictEqual(extractCleanPlate('wfw 369'), 'WFW369');
            assert.strictEqual(extractCleanPlate('Camión 2 - TRK-456'), 'TRK456');
        });

        it('debe soportar placas puras alfanuméricas', () => {
            assert.strictEqual(extractCleanPlate('WFW369'), 'WFW369');
            assert.strictEqual(extractCleanPlate('SKR902'), 'SKR902');
        });

        it('debe descartar strings vacíos o sin placa válida', () => {
            assert.strictEqual(extractCleanPlate(''), null);
            assert.strictEqual(extractCleanPlate('AB'), null);
        });
    });

    describe('2. Sanitización y Sanidad de Fechas de Telemetría', () => {
        it('debe rechazar timestamps del año 1970 (batería CMOS / GPS no sincronizado)', () => {
            const epochDate = new Date('1970-01-01T00:00:00Z');
            assert.strictEqual(isValidTelemetryTimestamp(epochDate), false);
        });

        it('debe rechazar fechas con deriva superior a 24 horas hacia el futuro', () => {
            const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
            assert.strictEqual(isValidTelemetryTimestamp(futureDate), false);
        });

        it('debe aceptar fechas recientes válidas', () => {
            const validDate = new Date();
            assert.strictEqual(isValidTelemetryTimestamp(validDate), true);
        });

        it('debe parsear formato Bogotá local DD-MM-YYYY HH:mm:ss a ISO UTC', () => {
            const rawBogota = '07-10-2026 14:30:00';
            const parsed = parseTelemetryDate(rawBogota);
            assert.ok(parsed.includes('2026-10-07T'));
        });

        it('debe caer en fecha actual si el timestamp reportado es corrupto (1970)', () => {
            const corruptTimestamp = 0; // Unix 0 = 1970
            const result = parseTelemetryDate(corruptTimestamp);
            const parsedYear = new Date(result).getFullYear();
            assert.ok(parsedYear >= 2026, 'Debe haber caído a la fecha actual y no a 1970');
        });
    });

    describe('3. Normalización y Filtro Poka-Yoke de Dispositivos', () => {
        it('debe descartar coordenadas Null Island (0, 0)', () => {
            const nullIslandDevice = {
                name: 'Camión WFW369',
                lat: 0,
                lng: 0,
                speed: 45
            };
            const result = normalizeApps360Device(nullIslandDevice);
            assert.strictEqual(result, null, 'Null Island (0,0) debe ser descartado');
        });

        it('debe descartar coordenadas geográficas imposibles fuera de rango WGS84', () => {
            const impossibleDevice = {
                name: 'Camión WFW369',
                lat: 120.5,
                lng: -74.08,
                speed: 0
            };
            assert.strictEqual(normalizeApps360Device(impossibleDevice), null);
        });

        it('debe normalizar exitosamente un vehículo con coordenadas válidas de Bogotá', () => {
            const validDevice = {
                name: 'Furgón 1 WFW-369',
                lat: 4.6097,
                lng: -74.0817,
                speed: 38.5,
                course: 180,
                params: {
                    acc: '1'
                },
                odometer: 145200.5
            };
            const result = normalizeApps360Device(validDevice);
            assert.ok(result !== null);
            assert.strictEqual(result.plate, 'WFW369');
            assert.strictEqual(result.latitude, 4.6097);
            assert.strictEqual(result.longitude, -74.0817);
            assert.strictEqual(result.speed, 38.5);
            assert.strictEqual(result.heading, 180);
            assert.strictEqual(result.ignition_status, true);
            assert.strictEqual(result.odometer_km, 145200.5);
            assert.strictEqual(result.tracking_source, 'hardware_gps');
        });

        it('debe detectar ignición apagada si sensor reporta 0 o false', () => {
            const stoppedDevice = {
                name: 'Furgón WFW369',
                lat: 4.65,
                lng: -74.1,
                speed: 0,
                params: {
                    acc: '0'
                }
            };
            const result = normalizeApps360Device(stoppedDevice);
            assert.ok(result !== null);
            assert.strictEqual(result.ignition_status, false);
        });
    });

    describe('4. Camiones Alquilados y Baliza Móvil PWA (Mobile App Tracker)', () => {
        const PingItemSchema = z.object({
            plate: z.string().min(3).max(10),
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
            speed: z.number().min(0).max(250).optional().default(0),
            heading: z.number().min(0).max(360).optional().default(0),
            accuracy: z.number().optional(),
            battery_level: z.number().min(0).max(100).optional(),
            ignition_status: z.boolean().optional().default(true),
            tracking_source: z.enum(['hardware_gps', 'mobile_app']).optional().default('mobile_app'),
            timestamp: z.string().optional()
        });

        const TelemetryPayloadSchema = z.union([
            PingItemSchema,
            z.array(PingItemSchema).min(1)
        ]);

        it('debe validar y etiquetar exitosamente un ping emitido desde celular de conductor de camión alquilado', () => {
            const mobilePing = {
                plate: 'ALQ-777',
                latitude: 4.6725,
                longitude: -74.0558,
                speed: 42,
                heading: 90,
                accuracy: 12,
                battery_level: 84,
                tracking_source: 'mobile_app' as const,
                timestamp: new Date().toISOString()
            };

            const parsed = PingItemSchema.safeParse(mobilePing);
            assert.strictEqual(parsed.success, true);
            if (parsed.success) {
                assert.strictEqual(parsed.data.plate, 'ALQ-777');
                assert.strictEqual(parsed.data.tracking_source, 'mobile_app');
                assert.strictEqual(parsed.data.battery_level, 84);
                assert.strictEqual(parsed.data.accuracy, 12);
            }
        });

        it('debe admitir ráfagas de pings acumulados offline cuando el camión sale de zona muerta sin señal', () => {
            const burstQueue = [
                { plate: 'ALQ-777', latitude: 4.670, longitude: -74.050, speed: 30, tracking_source: 'mobile_app' as const },
                { plate: 'ALQ-777', latitude: 4.672, longitude: -74.052, speed: 35, tracking_source: 'mobile_app' as const },
                { plate: 'ALQ-777', latitude: 4.675, longitude: -74.055, speed: 40, tracking_source: 'mobile_app' as const }
            ];

            const parsed = TelemetryPayloadSchema.safeParse(burstQueue);
            assert.strictEqual(parsed.success, true);
            if (parsed.success && Array.isArray(parsed.data)) {
                assert.strictEqual(parsed.data.length, 3);
                assert.strictEqual(parsed.data[2].speed, 40);
            }
        });

        it('debe rechazar niveles de batería inválidos menores a 0 o superiores a 100', () => {
            const corruptPing = {
                plate: 'ALQ-777',
                latitude: 4.670,
                longitude: -74.050,
                battery_level: 150 // Imposible > 100%
            };

            const parsed = PingItemSchema.safeParse(corruptPing);
            assert.strictEqual(parsed.success, false);
        });

        it('debe aplicar tracking_source = mobile_app por defecto si no es provisto por el celular', () => {
            const simplePing = {
                plate: 'ALQ-999',
                latitude: 4.61,
                longitude: -74.08
            };

            const parsed = PingItemSchema.safeParse(simplePing);
            assert.strictEqual(parsed.success, true);
            if (parsed.success) {
                assert.strictEqual(parsed.data.tracking_source, 'mobile_app');
            }
        });
    });

});
