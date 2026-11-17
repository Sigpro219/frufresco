/**
 * Watchdog Independiente Hostinger INBOX <-> Supabase `order_drafts` (Escenario 463).
 * Audita en solo lectura los correos reales de los últimos 7 días en `pedidos@frufresco.co`,
 * detecta faltantes (por Message-ID, UID o huella remitente+asunto) y los re-inyecta automáticamente.
 */

import * as tls from 'tls';
import { createClient } from '@supabase/supabase-js';
import { POST as emailIngestPost } from '@/app/api/orders/email-ingest/route';
import {
  formatImapDate,
  isGenuineChannel3CoEmail,
  parseRfc822Email,
  resolveHostingerImapCredentials,
  splitHeadersAndBody,
} from './hostingerImapSync';

const WATCHDOG_STATUS_KEY = 'hostinger_watchdog_status';
const WATCHDOG_COOLDOWN_MS = 120_000;
const MAX_RECOVER_PER_RUN = 5;

export interface WatchdogMissingSample {
  uid: number;
  subject: string;
  from: string;
  date: string;
  recovered: boolean;
}

export interface HostingerWatchdogStatus {
  lastCheckedAt: string;
  mailboxCount7d: number;
  matchedCount: number;
  missingCount: number;
  recoveredCount: number;
  missingSamples: WatchdogMissingSample[];
  error: string | null;
}

interface MailboxHeaderItem {
  uid: number;
  internalDate: string | null;
  headers: Record<string, string>;
  rawHeaderBlock: string;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials for Hostinger Watchdog');
  return createClient(url, key);
}

function extractBareEmail(raw: string): string {
  const m = String(raw || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(raw || '')).trim().toLowerCase();
}

function normalizeWatchdogSubject(raw: string): string {
  return String(raw || '')
    .replace(/\[(?:REVISIÓN CENTINELA PENDIENTE|DELTA DETECTADO POR CENTINELA|EML-[A-Z0-9]+|Adjunto\s+\d+\/\d+|RAW_WEBHOOK)\]/gi, ' ')
    .replace(/^(?:\s*(?:re|rv|fw|fwd)\s*:\s*)+/gi, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function fetchMailboxHeaders7d(params: {
  host: string;
  port: number;
  user: string;
  pass: string;
  sinceDate: Date;
}): Promise<{ activeUser: string; items: MailboxHeaderItem[] }> {
  const { host, port, user, pass, sinceDate } = params;

  return new Promise((resolve, reject) => {
    let settled = false;
    let buffer = '';
    let currentWait: {
      tag: string;
      onDone: (block: string) => void;
      onError: (err: Error) => void;
      timer: NodeJS.Timeout;
    } | null = null;

    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false });
    socket.setEncoding('utf8');
    socket.setTimeout(15_000);

    const finish = (err?: Error, res?: { activeUser: string; items: MailboxHeaderItem[] }) => {
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
      else resolve(res || { activeUser: user, items: [] });
    };

    const sendCmd = (tag: string, cmd: string): Promise<string> =>
      new Promise((resCmd, rejCmd) => {
        const timer = setTimeout(() => rejCmd(new Error(`Watchdog IMAP timeout (${tag})`)), 15_000);
        currentWait = {
          tag,
          onDone: (blk) => {
            clearTimeout(timer);
            resCmd(blk);
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

    let greeted = false;
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      if (!greeted) {
        if (/^\* OK/m.test(buffer)) {
          greeted = true;
          runSequence().catch((e) => finish(e));
        }
        return;
      }
      if (currentWait) {
        const m = buffer.match(new RegExp(`^${currentWait.tag} (OK|NO|BAD)(.*)$`, 'm'));
        if (m) {
          const full = buffer;
          const waitRef = currentWait;
          currentWait = null;
          if (m[1] === 'OK') waitRef.onDone(full);
          else waitRef.onError(new Error(`IMAP ${waitRef.tag} ${m[1]}: ${m[2] || ''}`));
        }
      }
    });

    socket.on('timeout', () => finish(new Error('Watchdog IMAP socket timeout')));
    socket.on('error', (e) => finish(e));
    socket.on('close', () => {
      if (!settled) finish(new Error('Watchdog IMAP closed unexpectedly'));
    });

    async function runSequence() {
      const esc = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      await sendCmd('W01', `LOGIN ${esc(user)} ${esc(pass)}`);
      await sendCmd('W02', 'EXAMINE INBOX');
      const searchResp = await sendCmd('W03', `UID SEARCH SINCE ${formatImapDate(sinceDate)}`);
      const m = searchResp.match(/\*\s+SEARCH\s+([0-9\s]+)/);
      const uids = m
        ? m[1]
            .trim()
            .split(/\s+/)
            .map((x) => parseInt(x, 10))
            .filter((x) => !isNaN(x))
            .sort((a, b) => a - b)
        : [];

      if (uids.length === 0) {
        finish(undefined, { activeUser: user, items: [] });
        return;
      }

      // Lote único de cabeceras para evitar múltiples round-trips
      const sliceUids = uids.slice(-150);
      const uidSet = sliceUids.join(',');
      const fetchResp = await sendCmd(
        'W04',
        `UID FETCH ${uidSet} (INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM TO CC DELIVERED-TO SUBJECT MESSAGE-ID DATE)])`
      );

      const items: MailboxHeaderItem[] = [];
      const blocks = fetchResp.split(/\*\s+\d+\s+FETCH\s+\(/i).slice(1);
      for (const blk of blocks) {
        const uidM = blk.match(/\bUID\s+(\d+)/i);
        if (!uidM) continue;
        const uid = parseInt(uidM[1], 10);
        const dtM = blk.match(/INTERNALDATE\s+"([^"]+)"/i);
        const hdrM = blk.match(/BODY\[HEADER[^\]]*\]\s*\{\d+\}\r?\n([\s\S]*)/i);
        const rawHdr = hdrM ? hdrM[1].replace(/\)\s*(\r?\nW04 OK[\s\S]*)?$/, '') : '';
        const { headers } = splitHeadersAndBody(rawHdr + '\r\n\r\n');
        items.push({
          uid,
          internalDate: dtM ? dtM[1] : null,
          headers,
          rawHeaderBlock: rawHdr,
        });
      }

      finish(undefined, { activeUser: user, items });
    }
  });
}

async function fetchRawMessagesByUids(params: {
  host: string;
  port: number;
  user: string;
  pass: string;
  uids: number[];
}): Promise<Array<{ uid: number; rawEml: string }>> {
  const { host, port, user, pass, uids } = params;
  if (uids.length === 0) return [];

  return new Promise((resolve, reject) => {
    let settled = false;
    let buffer = '';
    let currentWait: {
      tag: string;
      onDone: (block: string) => void;
      onError: (err: Error) => void;
      timer: NodeJS.Timeout;
    } | null = null;

    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false });
    socket.setEncoding('utf8');
    socket.setTimeout(15_000);

    const finish = (err?: Error, res?: Array<{ uid: number; rawEml: string }>) => {
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
      else resolve(res || []);
    };

    const sendCmd = (tag: string, cmd: string): Promise<string> =>
      new Promise((resCmd, rejCmd) => {
        const timer = setTimeout(() => rejCmd(new Error(`Watchdog raw timeout (${tag})`)), 15_000);
        currentWait = {
          tag,
          onDone: (blk) => {
            clearTimeout(timer);
            resCmd(blk);
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

    let greeted = false;
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      if (!greeted) {
        if (/^\* OK/m.test(buffer)) {
          greeted = true;
          runSeq().catch((e) => finish(e));
        }
        return;
      }
      if (currentWait) {
        const m = buffer.match(new RegExp(`^${currentWait.tag} (OK|NO|BAD)(.*)$`, 'm'));
        if (m) {
          const full = buffer;
          const waitRef = currentWait;
          currentWait = null;
          if (m[1] === 'OK') waitRef.onDone(full);
          else waitRef.onError(new Error(`IMAP ${waitRef.tag} ${m[1]}: ${m[2] || ''}`));
        }
      }
    });

    socket.on('timeout', () => finish(new Error('Watchdog raw socket timeout')));
    socket.on('error', (e) => finish(e));
    socket.on('close', () => {
      if (!settled) finish(new Error('Watchdog raw socket closed'));
    });

    async function runSeq() {
      const esc = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      await sendCmd('R01', `LOGIN ${esc(user)} ${esc(pass)}`);
      await sendCmd('R02', 'EXAMINE INBOX');
      const out: Array<{ uid: number; rawEml: string }> = [];
      for (let i = 0; i < uids.length; i++) {
        const tag = `R1${i}`;
        const resp = await sendCmd(tag, `UID FETCH ${uids[i]} (BODY.PEEK[])`);
        const lit = resp.match(/BODY\[\]\s*\{(\d+)\}\r?\n([\s\S]*)/i);
        if (lit) {
          const after = lit[2];
          const endIdx = after.lastIndexOf(`\n${tag} `);
          const clipped = endIdx >= 0 ? after.slice(0, endIdx) : after;
          const rawEml = clipped.replace(/\)\s*\r?\n?$/, '');
          if (rawEml.trim()) out.push({ uid: uids[i], rawEml });
        }
      }
      finish(undefined, out);
    }
  });
}

export async function runHostingerImapWatchdog(options?: {
  force?: boolean;
  autoRecover?: boolean;
}): Promise<HostingerWatchdogStatus & { skipped?: boolean }> {
  const supabaseAdmin = getSupabaseAdmin();
  const force = Boolean(options?.force);
  const autoRecover = options?.autoRecover !== false;

  if (!force) {
    const { data: cached } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', WATCHDOG_STATUS_KEY)
      .maybeSingle();

    if (cached?.value) {
      try {
        const parsed: HostingerWatchdogStatus =
          typeof cached.value === 'string' ? JSON.parse(cached.value) : cached.value;
        if (parsed.lastCheckedAt && Date.now() - new Date(parsed.lastCheckedAt).getTime() < WATCHDOG_COOLDOWN_MS) {
          return { ...parsed, skipped: true };
        }
      } catch (_) {}
    }
  }

  const persistStatus = async (status: HostingerWatchdogStatus) => {
    await supabaseAdmin.from('app_settings').upsert(
      { key: WATCHDOG_STATUS_KEY, value: JSON.stringify(status) },
      { onConflict: 'key' }
    );
  };

  try {
    const { host, port, user, pass } = await resolveHostingerImapCredentials(supabaseAdmin);
    if (!pass) {
      const errStatus: HostingerWatchdogStatus = {
        lastCheckedAt: new Date().toISOString(),
        mailboxCount7d: 0,
        matchedCount: 0,
        missingCount: 0,
        recoveredCount: 0,
        missingSamples: [],
        error: 'Credenciales Hostinger IMAP no configuradas.',
      };
      await persistStatus(errStatus);
      return errStatus;
    }

    const epochStr = process.env.NEXT_PUBLIC_CHANNEL_3_EPOCH || '2026-11-09T00:00:00-05:00';
    const epochMs = new Date(epochStr).getTime();
    const sevenDaysAgoMs = Date.now() - 7 * 86_400_000;
    const sinceDate = new Date(Math.max(sevenDaysAgoMs, isNaN(epochMs) ? 0 : epochMs));

    const { activeUser, items } = await fetchMailboxHeaders7d({ host, port, user, pass, sinceDate });

    // Filtrar correos genuinos entrantes (excluye sistema y envíos propios de @frufresco.co)
    const relevantEmails = items.filter((item) => {
      if (!isGenuineChannel3CoEmail(item.headers, item.rawHeaderBlock, item.internalDate, epochStr)) {
        return false;
      }
      const fromEmail = extractBareEmail(item.headers['from'] || '');
      if (fromEmail.endsWith('@frufresco.co') || fromEmail.endsWith('@frufresco.com')) {
        return false;
      }
      if (item.internalDate && !isNaN(epochMs)) {
        const dtMs = new Date(item.internalDate).getTime();
        if (!isNaN(dtMs) && dtMs < epochMs) return false;
      }
      return true;
    });

    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data: recentDrafts, error: dErr } = await supabaseAdmin
      .from('order_drafts')
      .select('id, created_at, email_subject, source_email, status, extracted_items')
      .gte('created_at', fourteenDaysAgo)
      .limit(1500);

    if (dErr) throw dErr;

    const knownMessageIds = new Set<string>();
    const knownUids = new Set<number>();
    const knownFingerprints = new Set<string>();

    for (const d of recentDrafts || []) {
      const meta = Array.isArray(d.extracted_items) ? d.extracted_items[0] : d.extracted_items;
      if (meta?.messageId) knownMessageIds.add(String(meta.messageId).trim().toLowerCase());
      if (meta?.hostingerUid) knownUids.add(Number(meta.hostingerUid));

      const fp = `${extractBareEmail(d.source_email || '')}||${normalizeWatchdogSubject(d.email_subject || '')}`;
      if (fp !== '||') knownFingerprints.add(fp);
    }

    const missingItems: MailboxHeaderItem[] = [];
    for (const item of relevantEmails) {
      const msgId = String(item.headers['message-id'] || '').trim().toLowerCase();
      const fp = `${extractBareEmail(item.headers['from'] || '')}||${normalizeWatchdogSubject(item.headers['subject'] || '')}`;
      const isMatched =
        (msgId && knownMessageIds.has(msgId)) ||
        knownUids.has(item.uid) ||
        (fp !== '||' && knownFingerprints.has(fp));

      if (!isMatched) missingItems.push(item);
    }

    let recoveredCount = 0;
    const recoveredUids = new Set<number>();

    if (autoRecover && missingItems.length > 0) {
      const toRecover = missingItems.slice(0, MAX_RECOVER_PER_RUN);
      const rawMessages = await fetchRawMessagesByUids({
        host,
        port,
        user,
        pass,
        uids: toRecover.map((x) => x.uid),
      });

      const webhookSecret = process.env.WEBHOOK_SECRET || '';
      const internalUrl = webhookSecret
        ? `http://localhost:3001/api/orders/email-ingest?secret=${encodeURIComponent(webhookSecret)}`
        : 'http://localhost:3001/api/orders/email-ingest';

      for (const msg of rawMessages) {
        const parsedMime = parseRfc822Email(msg.rawEml);
        const req = new Request(internalUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ingestChannel: 'channel_3_co',
            hostingerUid: msg.uid,
            headers: {
              ...parsedMime.headers,
              'delivered-to': parsedMime.headers['delivered-to'] || activeUser,
            },
            envelope: {
              from: parsedMime.headers['from'] || '',
              to: activeUser,
              id: parsedMime.headers['message-id'] || `hostinger-uid-${msg.uid}`,
            },
            plain: parsedMime.plain,
            html: parsedMime.html,
            attachments: parsedMime.attachments,
          }),
        });
        const resp = await emailIngestPost(req);
        if (resp.status >= 200 && resp.status < 300) {
          recoveredCount++;
          recoveredUids.add(msg.uid);
        }
      }

      if (recoveredCount > 0) {
        await supabaseAdmin.from('audit_logs').insert([
          {
            collaborator_name: 'Hostinger IMAP Watchdog',
            action: 'WATCHDOG_RECOVER_EMAIL',
            module: 'ORDERS',
            details: {
              recovered_count: recoveredCount,
              total_missing_detected: missingItems.length,
              uids: Array.from(recoveredUids),
              subjects: toRecover
                .filter((x) => recoveredUids.has(x.uid))
                .map((x) => x.headers['subject'] || `UID ${x.uid}`),
            },
          },
        ]);
      }
    }

    const status: HostingerWatchdogStatus = {
      lastCheckedAt: new Date().toISOString(),
      mailboxCount7d: relevantEmails.length,
      matchedCount: relevantEmails.length - missingItems.length,
      missingCount: Math.max(0, missingItems.length - recoveredCount),
      recoveredCount,
      missingSamples: missingItems.slice(0, 10).map((m) => ({
        uid: m.uid,
        subject: m.headers['subject'] || 'Sin asunto',
        from: extractBareEmail(m.headers['from'] || ''),
        date: m.internalDate || m.headers['date'] || '',
        recovered: recoveredUids.has(m.uid),
      })),
      error: null,
    };

    await persistStatus(status);
    return status;
  } catch (err: any) {
    const errStatus: HostingerWatchdogStatus = {
      lastCheckedAt: new Date().toISOString(),
      mailboxCount7d: 0,
      matchedCount: 0,
      missingCount: 0,
      recoveredCount: 0,
      missingSamples: [],
      error: err?.message || 'Error ejecutando Watchdog Hostinger',
    };
    try {
      await persistStatus(errStatus);
    } catch (_) {}
    return errStatus;
  }
}
