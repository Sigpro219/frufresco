/**
 * Conector Directo de Canal 3 (Hostinger IMAPS -> Instrumento 4)
 * Especificación Canónica: SPEC.md Escenario 397 (SDD v1.9.375)
 *
 * Responsabilidad:
 * - Conectar directamente vía Node.js `node:tls` (puerto 993) a `pedidos@frufresco.co` en `imap.hostinger.com`.
 * - Descargar incrementalmente correos nuevos (máximo 3 por corrida, presupuesto de 40s) en modo `BODY.PEEK[]`.
 * - Cerrar el socket TLS inmediatamente antes de invocar el pipeline de IA (`/api/orders/email-ingest`).
 * - Parsear MIME RFC822 en memoria (cabeceras RFC 2047, texto plano/HTML, adjuntos Base64).
 * - Inyectar en `POST /api/orders/email-ingest` con `ingestChannel: 'channel_3_co'` y avanzar `lastSyncedUid` correo por correo.
 */

import * as tls from 'tls';
import { createClient } from '@supabase/supabase-js';
import { POST as emailIngestPost } from '@/app/api/orders/email-ingest/route';

export interface HostingerSyncState {
  account: string;
  lastSyncedUid: number;
  lastRunAt: string | null;
  inFlightUntil?: string | null;
  transitionEpochAt: string;
  totalIngested: number;
}

export interface ParsedMimeAttachment {
  filename: string;
  file_name: string;
  content_type: string;
  content: string; // base64
  size: number;
  content_id?: string;
  disposition?: string;
}

export interface ParsedMimeEmail {
  headers: Record<string, string>;
  plain: string;
  html: string;
  attachments: ParsedMimeAttachment[];
}

const SYNC_SETTINGS_KEY = 'hostinger_imap_sync_state';
const MAX_BATCH_SIZE = 3;
const MAX_EXECUTION_BUDGET_MS = 40_000;
const COOLDOWN_MS = 20_000;
const LEASE_LOCK_MS = 55_000;
const IMAP_CMD_TIMEOUT_MS = 15_000;

let inFlightHostingerSync = false;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase credentials for Hostinger IMAP Sync');
  }
  return createClient(url, key);
}

/**
 * Decodifica palabras codificadas según RFC 2047 (`=?UTF-8?B?...?=` o `=?UTF-8?Q?...?=`).
 */
export function decodeRfc2047(input: string): string {
  if (!input) return '';
  return input.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, encoding, text) => {
    try {
      const enc = String(encoding).toUpperCase();
      const normCharset: BufferEncoding =
        String(charset).toLowerCase().includes('iso-8859-1') || String(charset).toLowerCase().includes('latin1')
          ? 'latin1'
          : 'utf8';
      if (enc === 'B') {
        return Buffer.from(text, 'base64').toString(normCharset);
      }
      if (enc === 'Q') {
        const qText = String(text).replace(/_/g, ' ');
        const bytes: number[] = [];
        for (let i = 0; i < qText.length; i++) {
          if (qText[i] === '=' && i + 2 < qText.length) {
            const hex = qText.substring(i + 1, i + 3);
            const val = parseInt(hex, 16);
            if (!isNaN(val)) {
              bytes.push(val);
              i += 2;
              continue;
            }
          }
          bytes.push(qText.charCodeAt(i));
        }
        return Buffer.from(bytes).toString(normCharset);
      }
    } catch (_) {}
    return text;
  });
}

/**
 * Decodifica contenido `quoted-printable` a UTF-8.
 */
export function decodeQuotedPrintable(input: string, charset: string = 'utf-8'): string {
  if (!input) return '';
  const softLineBreaksRemoved = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < softLineBreaksRemoved.length; i++) {
    if (softLineBreaksRemoved[i] === '=' && i + 2 < softLineBreaksRemoved.length) {
      const hex = softLineBreaksRemoved.substring(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(softLineBreaksRemoved.charCodeAt(i) & 0xff);
  }
  const normCharset: BufferEncoding =
    charset.toLowerCase().includes('iso-8859-1') || charset.toLowerCase().includes('latin1') ? 'latin1' : 'utf8';
  return Buffer.from(bytes).toString(normCharset);
}

/**
 * Separa un bloque MIME en cabeceras desplegadas y cuerpo crudo.
 */
function splitHeadersAndBody(rawBlock: string): { headers: Record<string, string>; body: string } {
  const match = rawBlock.match(/\r?\n\r?\n/);
  let rawHeaders = rawBlock;
  let body = '';
  if (match && match.index !== undefined) {
    rawHeaders = rawBlock.slice(0, match.index);
    body = rawBlock.slice(match.index + match[0].length);
  }

  // Desplegar cabeceras multi-línea (folded headers)
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, ' ');
  const headers: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = decodeRfc2047(line.slice(colonIdx + 1).trim());
      const lowerKey = key.toLowerCase();
      headers[lowerKey] = val;
      headers[key] = val;
    }
  }
  return { headers, body };
}

function extractParam(headerVal: string | undefined, paramName: string): string | null {
  if (!headerVal) return null;
  const regex = new RegExp(`${paramName}\\*?\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^;\\s]+))`, 'i');
  const m = headerVal.match(regex);
  if (!m) return null;
  const raw = m[1] || m[2] || m[3] || '';
  if (raw.toLowerCase().startsWith("utf-8''")) {
    try {
      return decodeURIComponent(raw.slice(7));
    } catch (_) {}
  }
  return decodeRfc2047(raw);
}

/**
 * Parser MIME RFC822 recursivo en memoria (sin dependencias nativas ni de sistema operativo).
 */
export function parseRfc822Email(rawEml: string): ParsedMimeEmail {
  const { headers, body } = splitHeadersAndBody(rawEml);
  const plainParts: string[] = [];
  const htmlParts: string[] = [];
  const attachments: ParsedMimeAttachment[] = [];

  function processPart(partHeaders: Record<string, string>, partBody: string) {
    const contentTypeHeader = partHeaders['content-type'] || 'text/plain; charset=utf-8';
    const contentType = contentTypeHeader.split(';')[0].trim().toLowerCase();
    const charset = extractParam(contentTypeHeader, 'charset') || 'utf-8';
    const transferEncoding = (partHeaders['content-transfer-encoding'] || '7bit').trim().toLowerCase();
    const dispositionHeader = partHeaders['content-disposition'] || '';
    const disposition = dispositionHeader.split(';')[0].trim().toLowerCase();
    const filename =
      extractParam(dispositionHeader, 'filename') ||
      extractParam(contentTypeHeader, 'name') ||
      null;
    const contentId = (partHeaders['content-id'] || '').replace(/^<|>$/g, '').trim() || undefined;

    if (contentType.startsWith('multipart/')) {
      const boundary = extractParam(contentTypeHeader, 'boundary');
      if (boundary) {
        const escapedBoundary = boundary.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const splitter = new RegExp(`--${escapedBoundary}(?:--)?\\r?\\n?`);
        const subParts = partBody.split(splitter);
        // El primer elemento es el preámbulo antes del primer boundary; el último es el epílogo tras `--boundary--`
        for (let i = 1; i < subParts.length - 1; i++) {
          const subRaw = subParts[i].replace(/\r?\n$/, '');
          if (!subRaw.trim()) continue;
          const { headers: subH, body: subB } = splitHeadersAndBody(subRaw);
          processPart(subH, subB);
        }
      }
      return;
    }

    const isAttachment =
      disposition === 'attachment' ||
      Boolean(filename) ||
      contentType === 'application/pdf' ||
      contentType.includes('spreadsheet') ||
      contentType.includes('excel') ||
      contentType.includes('csv') ||
      contentType.startsWith('image/');

    if (isAttachment && contentType !== 'text/plain' && contentType !== 'text/html') {
      let base64Content = '';
      if (transferEncoding === 'base64') {
        base64Content = partBody.replace(/\s+/g, '');
      } else if (transferEncoding === 'quoted-printable') {
        const decoded = decodeQuotedPrintable(partBody, 'latin1');
        base64Content = Buffer.from(decoded, 'latin1').toString('base64');
      } else {
        base64Content = Buffer.from(partBody, 'utf8').toString('base64');
      }

      if (base64Content.length > 0) {
        const resolvedName = filename || `adjunto_${attachments.length + 1}.bin`;
        attachments.push({
          filename: resolvedName,
          file_name: resolvedName,
          content_type: contentType || 'application/octet-stream',
          content: base64Content,
          size: Math.floor((base64Content.length * 3) / 4),
          content_id: contentId,
          disposition: disposition || 'attachment',
        });
      }
      return;
    }

    // Decodificar texto (plain / html)
    let decodedText = '';
    if (transferEncoding === 'base64') {
      const cleanB64 = partBody.replace(/\s+/g, '');
      const normCharset: BufferEncoding =
        charset.toLowerCase().includes('iso-8859-1') || charset.toLowerCase().includes('latin1') ? 'latin1' : 'utf8';
      decodedText = Buffer.from(cleanB64, 'base64').toString(normCharset);
    } else if (transferEncoding === 'quoted-printable') {
      decodedText = decodeQuotedPrintable(partBody, charset);
    } else {
      decodedText = partBody;
    }

    // Si es un archivo CSV/texto adjunto explícito con filename
    if (filename && (filename.toLowerCase().endsWith('.csv') || disposition === 'attachment')) {
      const b64 = Buffer.from(decodedText, 'utf8').toString('base64');
      attachments.push({
        filename,
        file_name: filename,
        content_type: contentType || 'text/csv',
        content: b64,
        size: Buffer.byteLength(decodedText, 'utf8'),
        disposition: 'attachment',
      });
      return;
    }

    if (contentType === 'text/html') {
      htmlParts.push(decodedText);
    } else {
      plainParts.push(decodedText);
    }
  }

  processPart(headers, body);

  return {
    headers,
    plain: plainParts.join('\n').trim(),
    html: htmlParts.join('\n').trim(),
    attachments,
  };
}

/**
 * Formatea fecha en formato IMAP `DD-Mon-YYYY` (ej. `08-Nov-2026`).
 */
function formatImapDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = months[date.getUTCMonth()];
  const y = date.getUTCFullYear();
  return `${d}-${m}-${y}`;
}

/**
 * Verifica que las cabeceras de un correo en Hostinger correspondan genuinamente
 * a un correo dirigido al dominio `@frufresco.co` (Canal 3), descartando:
 * 1. Correos históricos migrados por "Importación de email" desde `@frufresco.com` (sin `@frufresco.co` en cabeceras).
 * 2. Correos automáticos de bienvenida/sistema de Hostinger (`team@email.hostinger.com`, `mailer-daemon`, etc.).
 */
export function isGenuineChannel3CoEmail(headers: Record<string, string>, rawHeaderBlock = ''): boolean {
  const fromHeader = (headers['from'] || '').toLowerCase();
  if (
    fromHeader.includes('@email.hostinger.com') ||
    fromHeader.includes('no-reply@hostinger.com') ||
    fromHeader.includes('mailer-daemon@') ||
    fromHeader.includes('postmaster@')
  ) {
    return false;
  }

  const candidateRecipientBlock = [
    headers['delivered-to'] || '',
    headers['envelope-to'] || '',
    headers['x-original-to'] || '',
    headers['to'] || '',
    headers['cc'] || '',
    rawHeaderBlock,
  ].join('\n');

  // Debe contener explícitamente `@frufresco.co` con límite de dominio (no `@frufresco.com`)
  return /@frufresco\.co(?![a-z0-9])/i.test(candidateRecipientBlock);
}

/**
 * Cliente ligero IMAPS sobre `node:tls` con timeouts por comando y cierre garantizado.
 * Descarga en memoria los mensajes con `UID > lastSyncedUid` y cierra la sesión antes de retornar.
 */
async function fetchNewMessagesFromHostingerImap(params: {
  host: string;
  port: number;
  user: string;
  pass: string;
  lastSyncedUid: number;
  maxBatch: number;
}): Promise<{
  activeUser: string;
  downloadedMessages: Array<{ uid: number; rawEml: string }>;
  skippedHistoricalToUid: number | null;
}> {
  const { host, port, user, pass, lastSyncedUid, maxBatch } = params;

  return new Promise((resolve, reject) => {
    let settled = false;
    let buffer = '';
    let currentWait: {
      tag: string;
      onDone: (responseBlock: string) => void;
      onError: (err: Error) => void;
      timer: NodeJS.Timeout;
    } | null = null;

    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        rejectUnauthorized: false,
      },
      () => {
        // Esperar saludo inicial `* OK`
      }
    );

    socket.setEncoding('utf8');
    socket.setTimeout(IMAP_CMD_TIMEOUT_MS);

    const cleanupAndFinish = (
      err?: Error,
      result?: {
        activeUser: string;
        downloadedMessages: Array<{ uid: number; rawEml: string }>;
        skippedHistoricalToUid: number | null;
      }
    ) => {
      if (settled) return;
      settled = true;
      if (currentWait) {
        clearTimeout(currentWait.timer);
        currentWait = null;
      }
      try {
        socket.write('ZZZZ LOGOUT\r\n');
      } catch (_) {}
      try {
        socket.destroy();
      } catch (_) {}
      if (err) reject(err);
      else resolve(result || { activeUser: user, downloadedMessages: [], skippedHistoricalToUid: null });
    };

    const sendCommand = (tag: string, cmd: string): Promise<string> => {
      return new Promise((resCmd, rejCmd) => {
        const timer = setTimeout(() => {
          rejCmd(new Error(`IMAP command timeout (${tag}) on ${host}:${port}`));
        }, IMAP_CMD_TIMEOUT_MS);

        currentWait = {
          tag,
          onDone: (block) => {
            clearTimeout(timer);
            resCmd(block);
          },
          onError: (e) => {
            clearTimeout(timer);
            rejCmd(e);
          },
          timer,
        };

        buffer = '';
        socket.write(`${tag} ${cmd}\r\n`);
      });
    };

    let greeted = false;

    socket.on('data', (chunk: string) => {
      buffer += chunk;

      if (!greeted) {
        if (/^\* OK/m.test(buffer)) {
          greeted = true;
          runImapSequence().catch((err) => cleanupAndFinish(err));
        }
        return;
      }

      if (currentWait) {
        const tagRegex = new RegExp(`^${currentWait.tag} (OK|NO|BAD)(.*)$`, 'm');
        const match = buffer.match(tagRegex);
        if (match) {
          const status = match[1];
          const fullBlock = buffer;
          const waitRef = currentWait;
          currentWait = null;
          if (status === 'OK') {
            waitRef.onDone(fullBlock);
          } else {
            waitRef.onError(new Error(`IMAP ${waitRef.tag} returned ${status}: ${match[2] || ''}`));
          }
        }
      }
    });

    socket.on('timeout', () => {
      cleanupAndFinish(new Error(`IMAP socket timeout on ${host}:${port}`));
    });

    socket.on('error', (err) => {
      cleanupAndFinish(err);
    });

    socket.on('close', () => {
      if (!settled) {
        cleanupAndFinish(new Error('IMAP socket closed unexpectedly'));
      }
    });

    async function runImapSequence() {
      let activeUser = user;
      const escapedUser = `"${user.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      const escapedPass = `"${pass.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

      try {
        await sendCommand('A001', `LOGIN ${escapedUser} ${escapedPass}`);
      } catch (loginErr: any) {
        const fallbackMailbox = process.env.HOSTINGER_IMAP_FALLBACK_USER || 'copia.pedidos@frufresco.co';
        if (
          String(loginErr?.message || '').includes('AUTHENTICATIONFAILED') &&
          user.toLowerCase() !== fallbackMailbox.toLowerCase()
        ) {
          activeUser = fallbackMailbox;
          const escapedFallback = `"${fallbackMailbox.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
          await sendCommand('A001B', `LOGIN ${escapedFallback} ${escapedPass}`);
        } else {
          throw loginErr;
        }
      }

      await sendCommand('A002', 'EXAMINE INBOX');

      // Filtro Anti-Histórico Masivo (últimas 48 horas en formato IMAP SINCE)
      const sinceDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const sinceStr = formatImapDate(sinceDate);
      const searchCmd =
        lastSyncedUid > 0
          ? `UID SEARCH UID ${lastSyncedUid + 1}:* SINCE ${sinceStr}`
          : `UID SEARCH SINCE ${sinceStr}`;

      const searchResp = await sendCommand('A003', searchCmd);
      const searchMatch = searchResp.match(/\*\s+SEARCH\s+([0-9\s]+)/);
      let allUids: number[] = [];
      if (searchMatch && searchMatch[1]) {
        allUids = searchMatch[1]
          .trim()
          .split(/\s+/)
          .map((u) => parseInt(u, 10))
          .filter((u) => !isNaN(u) && u > lastSyncedUid)
          .sort((a, b) => a - b);
      }

      if (allUids.length === 0) {
        cleanupAndFinish(undefined, { activeUser, downloadedMessages: [], skippedHistoricalToUid: null });
        return;
      }

      // Grieta #4 (Goldfish RFC): Si `lastSyncedUid === 0` y hay muchos correos, evaluar una ventana
      // acotada de los últimos 10 UIDs mediante inspección rápida de cabeceras (~2KB) y adelantar el resto
      let skippedHistoricalToUid: number | null = null;
      let candidateUids = allUids;
      const HEADER_SCAN_WINDOW = 10;
      if (lastSyncedUid === 0 && allUids.length > HEADER_SCAN_WINDOW) {
        const splitIdx = allUids.length - HEADER_SCAN_WINDOW;
        skippedHistoricalToUid = allUids[splitIdx - 1];
        candidateUids = allUids.slice(splitIdx);
      } else {
        candidateUids = allUids.slice(0, HEADER_SCAN_WINDOW);
      }

      const downloadedMessages: Array<{ uid: number; rawEml: string }> = [];
      for (let i = 0; i < candidateUids.length; i++) {
        if (downloadedMessages.length >= maxBatch) break;

        const uid = candidateUids[i];
        const hdrTag = `H10${i}`;
        const hdrResp = await sendCommand(hdrTag, `UID FETCH ${uid} (BODY.PEEK[HEADER])`);
        const hdrLiteral = hdrResp.match(/BODY\[HEADER\]\s*\{(\d+)\}\r?\n([\s\S]*)/i);
        let rawHeaderBlock = '';
        if (hdrLiteral) {
          const afterBrace = hdrLiteral[2];
          const endTagIdx = afterBrace.lastIndexOf(`\n${hdrTag} `);
          const clipped = endTagIdx >= 0 ? afterBrace.slice(0, endTagIdx) : afterBrace;
          rawHeaderBlock = clipped.replace(/\)\s*\r?\n?$/, '');
        }

        const { headers: parsedHeaders } = splitHeadersAndBody(rawHeaderBlock + '\r\n\r\n');

        // Si el correo proviene de una importación histórica `.com` (sin `@frufresco.co` en cabeceras)
        // o es un correo automático de bienvenida de Hostinger, saltar y avanzar el puntero UID
        if (!isGenuineChannel3CoEmail(parsedHeaders, rawHeaderBlock)) {
          skippedHistoricalToUid = Math.max(skippedHistoricalToUid ?? 0, uid);
          continue;
        }

        const tag = `A10${i}`;
        const fetchResp = await sendCommand(tag, `UID FETCH ${uid} (BODY.PEEK[])`);

        // Extraer el cuerpo literal entre `{size}\r\n` y el final antes del cierre `)\r\nA10x OK`
        const literalMatch = fetchResp.match(/BODY\[\]\s*\{(\d+)\}\r?\n([\s\S]*)/i);
        let rawEml = '';
        if (literalMatch) {
          const afterBrace = literalMatch[2];
          // Quitar la cola del protocolo IMAP (`)\r\nA10x OK ...`)
          const endTagIdx = afterBrace.lastIndexOf(`\n${tag} `);
          const clipped = endTagIdx >= 0 ? afterBrace.slice(0, endTagIdx) : afterBrace;
          rawEml = clipped.replace(/\)\s*\r?\n?$/, '');
        }

        if (rawEml.trim().length > 0) {
          downloadedMessages.push({ uid, rawEml });
        }
      }

      cleanupAndFinish(undefined, { activeUser, downloadedMessages, skippedHistoricalToUid });
    }
  });
}

/**
 * Ejecuta un ciclo de sincronización directa de Canal 3 (`pedidos@frufresco.co`) hacia `/api/orders/email-ingest`.
 */
export async function syncHostingerChannel3Orders(options?: { force?: boolean }): Promise<{
  success: boolean;
  skipped?: boolean;
  reason?: string;
  ingestedCount: number;
  lastSyncedUid: number;
  transitionEpochAt: string;
}> {
  const host = process.env.HOSTINGER_IMAP_HOST || 'imap.hostinger.com';
  const port = parseInt(process.env.HOSTINGER_IMAP_PORT || '993', 10);
  const user = process.env.HOSTINGER_IMAP_USER || 'pedidos@frufresco.co';
  const pass = process.env.HOSTINGER_IMAP_PASS || '';
  const defaultEpoch = process.env.NEXT_PUBLIC_CHANNEL_3_EPOCH || '2026-11-09T00:00:00-05:00';

  if (!pass) {
    return {
      success: true,
      skipped: true,
      reason: 'Credentials not configured (HOSTINGER_IMAP_PASS missing)',
      ingestedCount: 0,
      lastSyncedUid: 0,
      transitionEpochAt: defaultEpoch,
    };
  }

  if (inFlightHostingerSync) {
    return {
      success: true,
      skipped: true,
      reason: 'In-memory lock active (inFlightHostingerSync)',
      ingestedCount: 0,
      lastSyncedUid: 0,
      transitionEpochAt: defaultEpoch,
    };
  }

  inFlightHostingerSync = true;
  const startTime = Date.now();
  const supabaseAdmin = getSupabaseAdmin();

  let state: HostingerSyncState = {
    account: user,
    lastSyncedUid: 0,
    lastRunAt: null,
    inFlightUntil: null,
    transitionEpochAt: defaultEpoch,
    totalIngested: 0,
  };

  const persistState = async (patch: Partial<HostingerSyncState>) => {
    state = { ...state, ...patch };
    await supabaseAdmin.from('app_settings').upsert(
      {
        key: SYNC_SETTINGS_KEY,
        value: JSON.stringify(state),
      },
      { onConflict: 'key' }
    );
  };

  try {
    const { data: existingSetting } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', SYNC_SETTINGS_KEY)
      .single();

    if (existingSetting?.value) {
      try {
        const parsed =
          typeof existingSetting.value === 'string'
            ? JSON.parse(existingSetting.value)
            : existingSetting.value;
        state = {
          ...state,
          ...parsed,
          transitionEpochAt: parsed.transitionEpochAt || defaultEpoch,
        };
      } catch (_) {}
    }

    const nowMs = Date.now();

    // Verificar Lease Lock Distribuido (`inFlightUntil`)
    if (state.inFlightUntil) {
      const leaseExp = new Date(state.inFlightUntil).getTime();
      if (!isNaN(leaseExp) && leaseExp > nowMs) {
        return {
          success: true,
          skipped: true,
          reason: `Distributed lease lock active until ${state.inFlightUntil}`,
          ingestedCount: 0,
          lastSyncedUid: state.lastSyncedUid,
          transitionEpochAt: state.transitionEpochAt,
        };
      }
    }

    // Verificar Cooldown de 20s salvo `?force=true`
    if (!options?.force && state.lastRunAt) {
      const lastRunMs = new Date(state.lastRunAt).getTime();
      if (!isNaN(lastRunMs) && nowMs - lastRunMs < COOLDOWN_MS) {
        return {
          success: true,
          skipped: true,
          reason: 'Cooldown active (< 20s since last sync)',
          ingestedCount: 0,
          lastSyncedUid: state.lastSyncedUid,
          transitionEpochAt: state.transitionEpochAt,
        };
      }
    }

    // Adquirir Lease Lock de 55s antes de abrir conexión TLS
    await persistState({
      inFlightUntil: new Date(nowMs + LEASE_LOCK_MS).toISOString(),
    });

    // 1. Descargar hasta `MAX_BATCH_SIZE` (3) mensajes y CERRAR el socket TLS inmediatamente
    const { activeUser, downloadedMessages, skippedHistoricalToUid } = await fetchNewMessagesFromHostingerImap({
      host,
      port,
      user,
      pass,
      lastSyncedUid: state.lastSyncedUid,
      maxBatch: MAX_BATCH_SIZE,
    });

    if (state.account !== activeUser) {
      state.account = activeUser;
      state.lastSyncedUid = 0;
    }

    // Avance pre-lote seguro: nunca saltar por encima del primer UID pendiente en `downloadedMessages`
    const preBatchSafeUid =
      skippedHistoricalToUid !== null
        ? downloadedMessages.length > 0
          ? Math.min(skippedHistoricalToUid, downloadedMessages[0].uid - 1)
          : skippedHistoricalToUid
        : null;

    if (preBatchSafeUid !== null && preBatchSafeUid > state.lastSyncedUid) {
      await persistState({ account: activeUser, lastSyncedUid: preBatchSafeUid });
    }

    let ingestedCount = 0;
    let batchAborted = false;

    // 2. Con el socket TLS ya cerrado, procesar cada correo contra `/api/orders/email-ingest`
    for (const msg of downloadedMessages) {
      if (Date.now() - startTime > MAX_EXECUTION_BUDGET_MS) {
        console.warn(`[Hostinger Sync] Presupuesto de 40s alcanzado. Deteniendo lote en UID ${state.lastSyncedUid}.`);
        batchAborted = true;
        break;
      }

      const parsedMime = parseRfc822Email(msg.rawEml);
      const webhookSecret = process.env.WEBHOOK_SECRET || '';
      const internalUrl = webhookSecret
        ? `http://localhost:3001/api/orders/email-ingest?secret=${encodeURIComponent(webhookSecret)}`
        : 'http://localhost:3001/api/orders/email-ingest';

      const ingestPayload = {
        ingestChannel: 'channel_3_co' as const,
        hostingerUid: msg.uid,
        headers: {
          ...parsedMime.headers,
          'delivered-to': parsedMime.headers['delivered-to'] || activeUser,
        },
        envelope: {
          from: parsedMime.headers['from'] || '',
          to: activeUser, // Garantiza que el buzón `.co` activo figure siempre como receptor oficial (Grieta #7)
          id: parsedMime.headers['message-id'] || `hostinger-uid-${msg.uid}`,
        },
        plain: parsedMime.plain,
        html: parsedMime.html,
        attachments: parsedMime.attachments,
      };

      const syntheticReq = new Request(internalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ingestPayload),
      });

      const resp = await emailIngestPost(syntheticReq);
      if (resp.status >= 200 && resp.status < 300) {
        ingestedCount++;
        // Avance incremental inmediato y monotónico por UID (Grieta #4)
        await persistState({
          account: activeUser,
          lastSyncedUid: Math.max(state.lastSyncedUid, msg.uid),
          totalIngested: (state.totalIngested || 0) + 1,
          lastRunAt: new Date().toISOString(),
        });
      } else {
        const errBody = await resp.text().catch(() => '');
        console.error(`[Hostinger Sync] Error HTTP ${resp.status} en UID ${msg.uid}: ${errBody}`);
        batchAborted = true;
        break;
      }
    }

    // Si todos los mensajes descargados se procesaron sin abortos y había UIDs ignorados posteriores, avanzar hasta `skippedHistoricalToUid`
    const finalSyncedUid =
      !batchAborted && skippedHistoricalToUid !== null && skippedHistoricalToUid > state.lastSyncedUid
        ? skippedHistoricalToUid
        : state.lastSyncedUid;

    await persistState({
      account: activeUser,
      lastSyncedUid: finalSyncedUid,
      lastRunAt: new Date().toISOString(),
      inFlightUntil: null,
    });

    return {
      success: true,
      ingestedCount,
      lastSyncedUid: state.lastSyncedUid,
      transitionEpochAt: state.transitionEpochAt,
    };
  } catch (err: any) {
    console.warn('[Hostinger Sync] Warning en sincronización IMAPS:', err?.message || err);
    try {
      await persistState({
        lastRunAt: new Date().toISOString(),
        inFlightUntil: null,
      });
    } catch (_) {}
    return {
      success: false,
      reason: err?.message || 'Error en sincronización IMAPS Hostinger',
      ingestedCount: 0,
      lastSyncedUid: state.lastSyncedUid,
      transitionEpochAt: state.transitionEpochAt,
    };
  } finally {
    inFlightHostingerSync = false;
  }
}
