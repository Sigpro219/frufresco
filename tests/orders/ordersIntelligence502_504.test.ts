import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBogotaCalendarContext,
  hasExplicitNumericDate,
  resolveExplicitRelativeDeliveryDate,
  stripQuotedEmailHistory,
} from '../../src/lib/orders/bogotaDateParser';
import {
  computeFrequencyRadar,
  type FrequencyRadarOrderInput,
  type FrequencyRadarProfileInput,
} from '../../src/lib/orders/frequencyEngine';
import { detectDraftDateDiscrepancies } from '../../src/lib/orders/ordersCopilotContextBuilder';
import { sanitizeGeminiHistory } from '../../src/app/api/orders/copilot/route';

test('Escenario 502: Gourmet Titán 2026-11-25 "para el jueves" -> 2026-11-26', () => {
  const ref = new Date('2026-11-25T20:20:06Z');
  const cal = buildBogotaCalendarContext(ref);
  assert.match(cal, /FECHA ACTUAL EN BOGOTÁ \(UTC-5\): miércoles 2026-11-25/);
  assert.match(cal, /mañana jueves = 2026-11-26/);

  const res = resolveExplicitRelativeDeliveryDate('Buenas tardes envió pedido para el jueves gracias', ref);
  assert.deepEqual(res, {
    date: '2026-11-26',
    matchedPhrase: 'para el jueves',
    isSameDay: false,
  });
});

test('Escenario 502: "para hoy" y "para mañana" + stripQuotedEmailHistory + hasExplicitNumericDate', () => {
  const ref = new Date('2026-11-26T21:00:00-05:00');
  const hoy = resolveExplicitRelativeDeliveryDate('Pedido urgente para hoy', ref);
  assert.equal(hoy?.date, '2026-11-26');
  assert.equal(hoy?.isSameDay, true);

  const manana = resolveExplicitRelativeDeliveryDate('Despacho para mañana temprano', ref);
  assert.equal(manana?.date, '2026-11-27');
  assert.equal(manana?.isSameDay, false);

  const rawBody = 'Pedido 20 kilos tomate\n\n-----Original Message-----\nDe: alguien\nEnviado: lunes\npara el martes';
  const stripped = stripQuotedEmailHistory(rawBody);
  assert.equal(stripped.includes('para el martes'), false);

  assert.equal(hasExplicitNumericDate('Pedido 28/11/2026 urgente'), true);
  assert.equal(hasExplicitNumericDate('Pedido para el jueves'), false);
});

test('Escenario 503 v2: Denominador progresivo, logistics_data informativo, other_date forward-only y reloj +30m', () => {
  const profiles: FrequencyRadarProfileInput[] = [
    {
      id: 'titan',
      company_name: 'EL CORRAL GOURMET TITAN',
      role: 'b2b_client',
      is_active: true,
      logistics_data: { days: [2, 4, 6] },
    },
    {
      id: 'ocasional',
      company_name: 'HOTEL OCASIONAL',
      role: 'b2b_client',
      is_active: true,
      logistics_data: { days: [1, 2, 3, 4, 5, 6] }, // Configurado todos los días pero solo pidió 1 vez -> NO debe alertar
    },
    {
      id: 'cesne',
      company_name: 'CESNE',
      role: 'b2b_client',
      is_active: true,
      logistics_data: { days: [5] },
    },
  ];

  const orders: FrequencyRadarOrderInput[] = [
    // Gourmet Titán: pidió los 2 jueves previos (100% de 2 semanas activas), hoy #2312 quedó para 2026-11-28 (hacia adelante)
    { id: 't1', sequence_id: 1921, profile_id: 'titan', status: 'para_compra', delivery_date: '2026-11-19', created_at: '2026-11-18T22:00:00Z', total: 100000 },
    { id: 't2', sequence_id: 1600, profile_id: 'titan', status: 'para_compra', delivery_date: '2026-11-12', created_at: '2026-11-11T22:00:00Z', total: 100000 },
    { id: 't3', sequence_id: 2312, profile_id: 'titan', status: 'pending_approval', delivery_date: '2026-11-28', created_at: '2026-11-25T22:31:26Z', total: 1290274 },
    // Hotel ocasional: solo 1 jueves
    { id: 'o1', sequence_id: 1700, profile_id: 'ocasional', status: 'para_compra', delivery_date: '2026-11-19', created_at: '2026-11-18T20:00:00Z', total: 50000 },
    // CESNE: habitual los viernes (2/2), hora promedio 8:08 PM COT (01:08 UTC del día sig)
    { id: 'c1', sequence_id: 1990, profile_id: 'cesne', status: 'para_compra', delivery_date: '2026-11-20', created_at: '2026-11-20T01:08:00Z', total: 80000 },
    { id: 'c2', sequence_id: 1710, profile_id: 'cesne', status: 'para_compra', delivery_date: '2026-11-13', created_at: '2026-11-13T01:08:00Z', total: 80000 },
    // Pedido de ayer (2026-11-26) NO debe disparar other_date_anomaly al evaluar 2026-11-27
    { id: 'c_past', sequence_id: 2303, profile_id: 'cesne', status: 'para_compra', delivery_date: '2026-11-26', created_at: '2026-11-26T15:00:00Z', total: 80000 },
  ];

  // Corte jueves 2026-11-26
  const radarThu = computeFrequencyRadar({
    targetDate: '2026-11-26',
    profiles,
    recentOrders: orders,
    recentDrafts: [],
    now: new Date('2026-11-26T14:00:00-05:00'),
  });
  assert.equal(radarThu.summary.habitualCount, 1);
  assert.equal(radarThu.summary.otherDateAnomalyCount, 1);
  assert.equal(radarThu.anomalies[0].otherDateOrder?.sequenceId, 2312);
  assert.equal(radarThu.anomalies[0].expectedReason, '2/2 jueves (100%)');

  // Corte viernes 2026-11-27 evaluado a las 7:00 PM del 26-nov -> CESNE (8:08 PM) está EN VENTANA (isOverdue = false)
  const radarFriBefore = computeFrequencyRadar({
    targetDate: '2026-11-27',
    profiles,
    recentOrders: orders,
    recentDrafts: [],
    now: new Date('2026-11-26T19:00:00-05:00'),
  });
  assert.equal(radarFriBefore.summary.silentMissingCount, 1);
  assert.equal(radarFriBefore.summary.inWindowCount, 1);
  assert.equal(radarFriBefore.summary.urgentAnomaliesCount, 0);
  assert.equal(radarFriBefore.anomalies[0].isOverdue, false);

  // Corte viernes 2026-11-27 evaluado a las 9:00 PM del 26-nov -> CESNE (8:08 PM + 30m = 8:38 PM) ya está VENCIDO
  const radarFriAfter = computeFrequencyRadar({
    targetDate: '2026-11-27',
    profiles,
    recentOrders: orders,
    recentDrafts: [],
    now: new Date('2026-11-26T21:00:00-05:00'),
  });
  assert.equal(radarFriAfter.summary.overdueSilentMissingCount, 1);
  assert.equal(radarFriAfter.summary.urgentAnomaliesCount, 1);
  assert.equal(radarFriAfter.anomalies[0].isOverdue, true);
});

test('Escenario 504 v2: detectDraftDateDiscrepancies atrapa #2312 y omite fechas numéricas explícitas', () => {
  const ordersById = new Map<string, FrequencyRadarOrderInput>([
    ['ord-2312', { id: 'ord-2312', sequence_id: 2312, status: 'pending_approval', delivery_date: '2026-11-28' }],
    ['ord-ok', { id: 'ord-ok', sequence_id: 2350, status: 'para_compra', delivery_date: '2026-11-28' }],
  ]);

  const discrepancies = detectDraftDateDiscrepancies({
    ordersById,
    now: new Date('2026-11-26T19:00:00-05:00'),
    recentDrafts: [
      {
        id: 'd-2312',
        client_detected_name: 'GOURMET TITAN',
        email_subject: '[EML-462DBB] Pedido',
        email_body: 'Buenas tardes envió pedido para el jueves gracias',
        status: 'approved',
        created_at: '2026-11-25T20:20:06Z',
        extracted_items: [{ isMetadata: true, orderId: 'ord-2312', deliveryDate: '2026-11-28' }],
      },
      {
        id: 'd-num',
        client_detected_name: 'CLIENTE NUMERICO',
        email_subject: 'Pedido 28/11/2026',
        email_body: 'Confirmar para hoy si hay inventario',
        status: 'approved',
        created_at: '2026-11-26T15:00:00Z',
        extracted_items: [{ isMetadata: true, attachments: [{ orderId: 'ord-ok' }], deliveryDate: '2026-11-28' }],
      },
    ],
  });

  assert.equal(discrepancies.length, 1);
  assert.equal(discrepancies[0].draftId, 'd-2312');
  assert.equal(discrepancies[0].expectedDate, '2026-11-26');
  assert.equal(discrepancies[0].savedDate, '2026-11-28');
});

test('Escenario 505: sanitizeGeminiHistory garantiza primer rol user, alternancia estricta y sin HTTP 500', () => {
  // Caso 1: empieza en assistant (model) tras saludo inicial o recorte
  const c1 = sanitizeGeminiHistory([
    { role: 'assistant', content: 'Hola, soy el Copiloto' },
    { role: 'user', content: 'cuantos correos hay?' },
    { role: 'assistant', content: 'Hay 69 correos.' },
    { role: 'user', content: 'y cuantos pendientes?' },
  ]);
  assert.equal(c1.lastUserMsg, 'y cuantos pendientes?');
  assert.equal(c1.history.length, 2);
  assert.equal(c1.history[0].role, 'user');
  assert.equal(c1.history[1].role, 'model');

  // Caso 2: 2 user consecutivos por error previo en cliente
  const c2 = sanitizeGeminiHistory([
    { role: 'user', content: 'pregunta fallida' },
    { role: 'user', content: 'pregunta actual' },
  ]);
  assert.equal(c2.lastUserMsg, 'pregunta actual');
  assert.equal(c2.history.length, 0);

  // Caso 3: 6 mensajes con alternancia y múltiples user seguidos en medio
  const c3 = sanitizeGeminiHistory([
    { role: 'assistant', content: 'Saludo' },
    { role: 'user', content: 'u1' },
    { role: 'assistant', content: 'm1' },
    { role: 'user', content: 'u2 fallido' },
    { role: 'user', content: 'u3' },
    { role: 'assistant', content: 'm2' },
    { role: 'user', content: 'u4 final' },
  ]);
  assert.equal(c3.lastUserMsg, 'u4 final');
  assert.equal(c3.history[0].role, 'user');
  assert.equal(c3.history[c3.history.length - 1].role, 'model');
  for (let i = 1; i < c3.history.length; i++) {
    assert.notEqual(c3.history[i].role, c3.history[i - 1].role);
  }
});
