/**
 * Golden Dataset & BDD-Guard Harness para Instrumento 4:
 * Conciliador Transaccional Dual-Agent (Gemini Maker + DeepSeek Checker)
 *
 * Verifica determinísticamente los 5 escenarios del contrato SDD v1.9.374 (Escenario 396):
 * 1. Fast-Path (0 candidatos previos del cliente en 24h -> INSERT_NEW sin red)
 * 2. IGNORE_DUPLICATE (Mismo cliente, misma sede y mismos ítems por .com y .co)
 * 3. UPDATE_DELTA (Mismo cliente, misma OC/sede pero cantidad modificada o ítem agregado)
 * 4. INSERT_NEW Multi-Sucursal / Multi-OC (Colsubsidio / Aldimark con distinta sede u OC)
 * 5. Fail-Open Seguro (Timeout o HTTP 500 en DeepSeek -> INSERT_NEW con fallbackUsed: true)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Cargar variables de entorno de .env.local si existen
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

import {
  extractDraftSummary,
  filterCandidateDraftsForClient,
  evaluateDraftWithDeepSeekReconciler,
  resolveIngestChannel,
  resolvePrimaryRecipientEmail,
  mergeSeenChannels,
  appendChannelToDraftRecord,
} from '../src/lib/orders/dualAgentReconciler';
import { parseRfc822Email, syncHostingerChannel3Orders } from '../src/lib/orders/hostingerImapSync';

async function runTests() {
  console.log('🧪 Iniciando Suite de Verificación Determinística — Instrumento 4 (Escenario 396)...\n');

  // ---------------------------------------------------------------------------
  // CASO 1: FAST-PATH (Cliente sin pedidos previos en las últimas 24h)
  // ---------------------------------------------------------------------------
  const incomingDraft1 = {
    id: 'draft-incoming-1',
    profile_id: 'prof-restaurante-1',
    client_detected_name: 'RESTAURANTE EL CIELO',
    source_email: 'compras@elcielo.com',
    email_subject: '[EML-111111] Pedido Viernes',
    extracted_items: [
      {
        isMetadata: true,
        purchaseOrder: 'OC-9001',
        deliveryDate: '2026-11-10',
        address: 'Calle 70 # 5-20',
      },
      { matched_product_id: 'prod-tomate', originalName: 'Tomate Chonto', quantity: 25, unit: 'Kg' },
      { matched_product_id: 'prod-cebolla', originalName: 'Cebolla Cabezona', quantity: 10, unit: 'Kg' },
    ],
  };

  const recent24hOtherClients = [
    {
      id: 'draft-other-client',
      profile_id: 'prof-otro-99',
      client_detected_name: 'HOTEL TEQUENDAMA',
      source_email: 'compras@tequendama.com',
      status: 'pending',
      email_subject: '[EML-222222] Pedido',
      extracted_items: [
        { isMetadata: true, purchaseOrder: 'OC-500', deliveryDate: '2026-11-10' },
        { matched_product_id: 'prod-papa', originalName: 'Papa Pastusa', quantity: 50, unit: 'Kg' },
      ],
    },
  ];

  const candidates1 = filterCandidateDraftsForClient(incomingDraft1, recent24hOtherClients, 'draft-incoming-1');
  assert.equal(candidates1.length, 0, 'Caso 1: No debe encontrar candidatos de otros clientes');

  const summary1 = extractDraftSummary(incomingDraft1);
  const res1 = await evaluateDraftWithDeepSeekReconciler(
    {
      client_detected_name: summary1.client_detected_name,
      source_email: incomingDraft1.source_email,
      purchase_order: summary1.purchase_order,
      delivery_date: summary1.delivery_date,
      address: summary1.address,
      email_subject: summary1.email_subject,
      items: summary1.items,
    },
    candidates1
  );

  assert.equal(res1.verdict, 'INSERT_NEW');
  assert.equal(res1.fastPath, true);
  assert.equal(res1.fallbackUsed, false);
  assert.equal(res1.target_draft_id, null);
  console.log('✅ Caso 1 PASÓ: Fast-Path directo (0 candidatos -> INSERT_NEW, fastPath=true).');

  // ---------------------------------------------------------------------------
  // CASO 2: IGNORE_DUPLICATE CON API REAL DE DEEPSEEK (Espejo .com vs .co)
  // ---------------------------------------------------------------------------
  const existingSameOrder = [
    {
      id: 'draft-existing-uuid-001',
      profile_id: 'prof-restaurante-1',
      client_detected_name: 'RESTAURANTE EL CIELO',
      source_email: 'compras@elcielo.com',
      status: 'pending',
      email_subject: '[EML-000001] Pedido Viernes',
      extracted_items: [
        {
          isMetadata: true,
          purchaseOrder: 'OC-9001',
          deliveryDate: '2026-11-10',
          address: 'Calle 70 # 5-20',
        },
        { matched_product_id: 'prod-tomate', originalName: 'Tomate Chonto', quantity: 25, unit: 'Kg' },
        { matched_product_id: 'prod-cebolla', originalName: 'Cebolla Cabezona Blanca', quantity: 10, unit: 'Kg' },
      ],
    },
  ];

  const candidates2 = filterCandidateDraftsForClient(incomingDraft1, existingSameOrder, 'draft-incoming-1');
  assert.equal(candidates2.length, 1, 'Caso 2: Debe detectar el candidato previo del mismo cliente');

  const res2 = await evaluateDraftWithDeepSeekReconciler(
    {
      client_detected_name: summary1.client_detected_name,
      source_email: incomingDraft1.source_email,
      purchase_order: summary1.purchase_order,
      delivery_date: summary1.delivery_date,
      address: summary1.address,
      email_subject: 'RV: Pedido Viernes (Copia enviada a frufresco.co)',
      items: summary1.items,
    },
    candidates2
  );

  assert.equal(res2.verdict, 'IGNORE_DUPLICATE', `Esperado IGNORE_DUPLICATE, recibido ${res2.verdict} (${res2.reason})`);
  assert.equal(res2.target_draft_id, 'draft-existing-uuid-001');
  assert.equal(res2.fastPath, false);
  assert.equal(res2.fallbackUsed, false);
  console.log(`✅ Caso 2 PASÓ (DeepSeek Live): IGNORE_DUPLICATE detectado -> target=${res2.target_draft_id} (${res2.reason})`);

  // ---------------------------------------------------------------------------
  // CASO 3: UPDATE_DELTA CON API REAL DE DEEPSEEK (Adición/Modificación de ítems)
  // ---------------------------------------------------------------------------
  const res3 = await evaluateDraftWithDeepSeekReconciler(
    {
      client_detected_name: summary1.client_detected_name,
      source_email: incomingDraft1.source_email,
      purchase_order: 'OC-9001',
      delivery_date: '2026-11-10',
      address: 'Calle 70 # 5-20',
      email_subject: 'RE: Pedido Viernes OC-9001 - Corrección cantidades y agregamos fresa',
      items: [
        { matched_product_id: 'prod-tomate', name: 'Tomate Chonto', quantity: 40, unit: 'Kg' },
        { matched_product_id: 'prod-cebolla', name: 'Cebolla Cabezona', quantity: 10, unit: 'Kg' },
        { matched_product_id: 'prod-fresa', name: 'Fresa Extra', quantity: 15, unit: 'Kg' },
      ],
    },
    candidates2
  );

  assert.equal(res3.verdict, 'UPDATE_DELTA', `Esperado UPDATE_DELTA, recibido ${res3.verdict} (${res3.reason})`);
  assert.equal(res3.target_draft_id, 'draft-existing-uuid-001');
  assert.equal(res3.fallbackUsed, false);
  console.log(`✅ Caso 3 PASÓ (DeepSeek Live): UPDATE_DELTA detectado -> target=${res3.target_draft_id} (${res3.reason})`);

  // ---------------------------------------------------------------------------
  // CASO 4: MULTI-SUCURSAL / MULTI-OC (Colsubsidio otra sede y otra OC -> INSERT_NEW)
  // ---------------------------------------------------------------------------
  const existingColsubsidioSedeA = [
    {
      id: 'draft-colsubsidio-sede-calle26',
      profile_id: 'prof-colsubsidio',
      client_detected_name: 'COLSUBSIDIO - HOTEL EL CUBO',
      source_email: 'compras.alimentos@colsubsidio.com',
      status: 'pending',
      email_subject: '[EML-333333] OC 4500111222',
      extracted_items: [
        {
          isMetadata: true,
          purchaseOrder: '4500111222',
          deliveryDate: '2026-11-10',
          address: 'Carrera 30 # 52-77 El Cubo',
        },
        { matched_product_id: 'prod-tomate', originalName: 'Tomate Chonto', quantity: 25, unit: 'Kg' },
        { matched_product_id: 'prod-cebolla', originalName: 'Cebolla Cabezona', quantity: 10, unit: 'Kg' },
      ],
    },
  ];

  const incomingColsubsidioSedeB = {
    id: 'draft-colsubsidio-sede-piscilago',
    profile_id: 'prof-colsubsidio',
    client_detected_name: 'COLSUBSIDIO - CLUB BELLAVISTA',
    source_email: 'compras.alimentos@colsubsidio.com',
  };

  const candidates4 = filterCandidateDraftsForClient(
    incomingColsubsidioSedeB,
    existingColsubsidioSedeA,
    'draft-colsubsidio-sede-piscilago'
  );
  assert.equal(candidates4.length, 1);

  const res4 = await evaluateDraftWithDeepSeekReconciler(
    {
      client_detected_name: 'COLSUBSIDIO - CLUB BELLAVISTA',
      source_email: 'compras.alimentos@colsubsidio.com',
      purchase_order: '4500999888',
      delivery_date: '2026-11-10',
      address: 'Autopista Norte Km 14 Club Bellavista',
      email_subject: '[EML-444444] OC 4500999888',
      items: [
        { matched_product_id: 'prod-tomate', name: 'Tomate Chonto', quantity: 25, unit: 'Kg' },
        { matched_product_id: 'prod-cebolla', name: 'Cebolla Cabezona', quantity: 10, unit: 'Kg' },
      ],
    },
    candidates4
  );

  assert.equal(res4.verdict, 'INSERT_NEW', `Esperado INSERT_NEW para otra sede/OC, recibido ${res4.verdict}`);
  assert.equal(res4.target_draft_id, null);
  assert.equal(res4.fallbackUsed, false);
  console.log(`✅ Caso 4 PASÓ (DeepSeek Live): Multi-Sucursal/Multi-OC -> INSERT_NEW (${res4.reason})`);

  // ---------------------------------------------------------------------------
  // CASO 5: FAIL-OPEN ANTE CAÍDA DE RED / HTTP 500 DE DEEPSEEK
  // ---------------------------------------------------------------------------
  const failingFetch = async () => {
    return new Response('Internal Server Error', { status: 500 });
  };

  const res5 = await evaluateDraftWithDeepSeekReconciler(
    {
      client_detected_name: summary1.client_detected_name,
      source_email: incomingDraft1.source_email,
      purchase_order: summary1.purchase_order,
      delivery_date: summary1.delivery_date,
      address: summary1.address,
      email_subject: summary1.email_subject,
      items: summary1.items,
    },
    candidates2,
    { customFetch: failingFetch as any }
  );

  assert.equal(res5.verdict, 'INSERT_NEW');
  assert.equal(res5.fallbackUsed, true);
  assert.equal(res5.target_draft_id, null);
  console.log(`✅ Caso 5 PASÓ: Fail-Open Seguro ante HTTP 500 -> INSERT_NEW con fallbackUsed=true (${res5.reason})`);

  // ---------------------------------------------------------------------------
  // CASO 6: ESCENARIO 397 — CLASIFICACIÓN DETERMINISTA DE CANAL (GRIETA #3)
  //         & RESOLUCIÓN MULTI-DESTINATARIO (GRIETA #7)
  // ---------------------------------------------------------------------------
  // Un correo enviado por google_apps_script_bridge.js (Canal 2) donde el cliente puso
  // `To: pedidos@frufresco.co, pedidos@frufresco.com` NO debe clasificarse falsamente como channel_3_co
  const bridgePayloadWithCoInTo = {
    headers: {
      subject: 'Pedido Sabado',
      from: 'compras@cliente.com',
      to: 'pedidos@frufresco.co, pedidos@frufresco.com',
    },
    envelope: {
      from: 'compras@cliente.com',
      to: 'pedidos@frufresco.co, pedidos@frufresco.com',
    },
  };
  assert.equal(
    resolveIngestChannel(bridgePayloadWithCoInTo),
    'channel_1_2_legacy',
    'Grieta #3: Payload de Apps Script sin ingestChannel ni Delivered-To debe ser channel_1_2_legacy'
  );

  // Un correo de Hostinger directo (`ingestChannel: 'channel_3_co'` o `Delivered-To: copia.pedidos@frufresco.co`)
  assert.equal(
    resolveIngestChannel({ ingestChannel: 'channel_3_co', headers: {} }),
    'channel_3_co'
  );
  assert.equal(
    resolveIngestChannel({ headers: { 'Delivered-To': 'copia.pedidos@frufresco.co' } }),
    'channel_3_co'
  );

  // Grieta #7: Pedido con `To: contabilidad@cliente.com` y `Cc: pedidos@frufresco.co`
  const resolvedRecip = resolvePrimaryRecipientEmail(
    {
      To: 'Contabilidad <contabilidad@cliente.com>',
      Cc: 'FruFresco Pedidos <pedidos@frufresco.co>',
    },
    {}
  );
  assert.equal(resolvedRecip, 'pedidos@frufresco.co', 'Grieta #7: Debe priorizar el buzón oficial en Cc:');
  console.log('✅ Caso 6 PASÓ: Clasificación de canal (Grieta #3) y resolución multi-destinatario Cc (Grieta #7).');

  // ---------------------------------------------------------------------------
  // CASO 7: ESCENARIO 397 — FUSIÓN POLIMÓRFICA DE `seenInChannels` EN ARRAY Y `[RAW_WEBHOOK]` (GRIETA #1)
  // ---------------------------------------------------------------------------
  const updatedRecords: Record<string, any> = {};
  const mockSupabaseAdmin = {
    from: () => ({
      update: (patch: any) => ({
        eq: async (_col: string, id: string) => {
          updatedRecords[id] = patch.extracted_items;
          return { error: null };
        },
      }),
    }),
  };

  // Subcaso 7A: Borrador en vuelo `[RAW_WEBHOOK]` (extracted_items es Objeto, NO Array)
  const rawWebhookDraft = {
    id: 'draft-in-flight-webhook',
    extracted_items: {
      debug_payload: { plain: 'test' },
      ingestChannel: 'channel_3_co',
      seenInChannels: ['channel_3_co'],
    },
  };
  await appendChannelToDraftRecord(
    mockSupabaseAdmin,
    rawWebhookDraft,
    'channel_1_2_legacy',
    'SYNTACTIC_DUPLICATE_ABSORBED',
    'compras@elcielo.com'
  );
  assert.deepEqual(
    updatedRecords['draft-in-flight-webhook'].seenInChannels,
    ['channel_3_co', 'channel_1_2_legacy'],
    'Grieta #1A: Objeto [RAW_WEBHOOK] debe fusionar ambos canales sin arrojar TypeError'
  );

  // Subcaso 7B: Borrador ya estructurado por Gemini (extracted_items es Array)
  const structuredDraft = {
    id: 'draft-structured-array',
    extracted_items: [
      {
        isMetadata: true,
        ingestChannel: 'channel_1_2_legacy',
        seenInChannels: ['channel_1_2_legacy'],
      },
      { matched_product_id: 'prod-1', quantity: 10 },
    ],
  };
  await appendChannelToDraftRecord(
    mockSupabaseAdmin,
    structuredDraft,
    'channel_3_co',
    'SYNTACTIC_DUPLICATE_ABSORBED',
    'compras@elcielo.com'
  );
  assert.deepEqual(
    updatedRecords['draft-structured-array'][0].seenInChannels,
    ['channel_1_2_legacy', 'channel_3_co'],
    'Grieta #1B: Array extracted_items[0] debe fusionar ambos canales (Partición Violeta)'
  );
  console.log('✅ Caso 7 PASÓ: Fusión polimórfica de seenInChannels en [RAW_WEBHOOK] (Objeto) y Array (Grieta #1).');

  // ---------------------------------------------------------------------------
  // CASO 8: ESCENARIO 397 — PARSER MIME RFC822 EN MEMORIA (RFC 2047 + MULTIPART + ADJUNTO BASE64)
  // ---------------------------------------------------------------------------
  const sampleEml = [
    'From: "Compras El Cielo" <compras@elcielo.com>',
    'To: pedidos@frufresco.co',
    'Delivered-To: copia.pedidos@frufresco.co',
    'Subject: =?UTF-8?B?UGVkaWRvIEZyZXNjbyBTYWJhZG8gT0MtOTAwMQ==?=',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="BOUNDARY_123"',
    '',
    '--BOUNDARY_123',
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    'Buen d=C3=ADa, adjunto orden de compra OC-9001 para entrega ma=C3=B1ana.',
    '--BOUNDARY_123',
    'Content-Type: application/pdf; name="OC_9001.pdf"',
    'Content-Disposition: attachment; filename="OC_9001.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('%PDF-1.4 dummy pdf content').toString('base64'),
    '--BOUNDARY_123--',
    '',
  ].join('\r\n');

  const parsedMime = parseRfc822Email(sampleEml);
  assert.equal(parsedMime.headers['subject'], 'Pedido Fresco Sabado OC-9001');
  assert.ok(parsedMime.plain.includes('Buen día, adjunto orden de compra OC-9001'));
  assert.equal(parsedMime.attachments.length, 1);
  assert.equal(parsedMime.attachments[0].filename, 'OC_9001.pdf');
  console.log('✅ Caso 8 PASÓ: Parser MIME RFC822 nativo decodifica RFC 2047, quoted-printable y adjuntos PDF Base64.');

  // ---------------------------------------------------------------------------
  // CASO 9: ESCENARIO 397 — CONEXIÓN DIRECTA IMAPS REAL CONTRA HOSTINGER (`copia.pedidos@frufresco.co`)
  // ---------------------------------------------------------------------------
  const syncRes = await syncHostingerChannel3Orders({ force: true });
  assert.equal(syncRes.success, true, `Fallo en conexión IMAPS Hostinger: ${syncRes.reason}`);
  console.log(
    `✅ Caso 9 PASÓ (Hostinger IMAPS Live): Conexión TLS 993 a copia.pedidos@frufresco.co exitosa (lastSyncedUid=${syncRes.lastSyncedUid}, ingested=${syncRes.ingestedCount}, epoch=${syncRes.transitionEpochAt}).`
  );

  console.log('\n🏆 TODOS LOS 9 ESCENARIOS (INSTRUMENTO 4 + CANAL 3 DIRECTO + TELEMETRÍA 3 PARTICIONES) PASARON CON ÉXITO (EXIT 0).');
}

runTests().catch((err) => {
  console.error('❌ FALLO EN SUITE DE VERIFICACIÓN INSTRUMENTO 4:', err);
  process.exit(1);
});
