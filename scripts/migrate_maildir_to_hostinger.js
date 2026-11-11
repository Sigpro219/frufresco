/**
 * Migración Automática Maildir Local -> Hostinger IMAPS (APPEND Directo)
 * FruFresco — Soberanía Digital @frufresco.co
 *
 * Sube de forma idempotente todos los correos históricos (INBOX cur/new + Sent)
 * desde C:/Projects/frufresco_backups/extracted_2026_11_07/mailboxes
 * directamente a los buzones @frufresco.co en imap.hostinger.com:993,
 * preservando flags (\Seen) y fecha original (INTERNALDATE).
 */

const tls = require('tls');
const fs = require('fs');
const path = require('path');

const MAILBOXES_ROOT = 'C:/Projects/frufresco_backups/extracted_2026_11_07/mailboxes';
const STATE_FILE = 'C:/Projects/frufresco_backups/hostinger_migration_state.json';
const IMAP_HOST = 'imap.hostinger.com';
const IMAP_PORT = 993;

const MIGRATION_PLAN = [
  {
    targetEmail: 'direccion.operaciones@frufresco.co',
    password: 'FruFresco.Ops*2026!',
    sourceFolders: ['direccion.operaciones'],
  },
  {
    targetEmail: 'gestion.comercial@frufresco.co',
    password: 'FruFresco.Ventas*2026!',
    sourceFolders: ['gestion.comercial'],
  },
  {
    targetEmail: 'facturacion.electronica@frufresco.co',
    password: 'FruFresco.Dian*2026!',
    sourceFolders: ['facturacion.electronica'],
  },
  {
    targetEmail: 'gestion.humana@frufresco.co',
    password: 'FruFresco.GTH*2026!',
    sourceFolders: ['gestion.humana'],
  },
  {
    targetEmail: 'gestion.clientes@frufresco.co',
    password: 'FruFresco.Info*2026!',
    sourceFolders: ['info'],
  },
  {
    targetEmail: 'contador@frufresco.co',
    password: 'FruFresco.Audit*2026!',
    sourceFolders: ['contador'],
  },
  {
    targetEmail: 'gestion.facturacion@frufresco.co',
    password: 'FruFresco.Fact*2026!',
    sourceFolders: ['gestion.facturacion'],
  },
  {
    targetEmail: 'gestion.tesoreria@frufresco.co',
    password: 'FruFresco.Ventas*2026!',
    sourceFolders: ['gestion.cartera'],
  },
  {
    targetEmail: 'gestion.contable@frufresco.co',
    password: 'FruFresco.Conta*2026!',
    sourceFolders: ['gestion.contable', 'asistente.contable1', 'asistente.contable2'],
  },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatImapDateTime(dateObj) {
  const d = isNaN(dateObj.getTime()) ? new Date() : dateObj;
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `"${day}-${mon}-${year} ${hh}:${mm}:${ss} +0000"`;
}

function extractInternalDate(fileName, rawBuffer, statMtime) {
  // 1. Intentar extraer epoch del nombre Maildir: "1738701234.M..."
  const m = fileName.match(/^(\d{10})\./);
  if (m) {
    const sec = parseInt(m[1], 10);
    if (sec > 946684800 && sec < 2147483647) {
      return formatImapDateTime(new Date(sec * 1000));
    }
  }
  // 2. Intentar leer cabecera Date:
  const headStr = rawBuffer.slice(0, Math.min(rawBuffer.length, 4096)).toString('utf8');
  const dateHeader = headStr.match(/^Date:\s*(.+)$/im);
  if (dateHeader && dateHeader[1]) {
    const parsed = new Date(dateHeader[1].trim());
    if (!isNaN(parsed.getTime())) {
      return formatImapDateTime(parsed);
    }
  }
  return formatImapDateTime(statMtime || new Date());
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (_) {}
  }
  return { uploadedKeys: {} };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function collectMaildirFiles(sourceFolderName) {
  const baseDir = path.join(MAILBOXES_ROOT, sourceFolderName);
  if (!fs.existsSync(baseDir)) return [];

  const items = [];
  const subTargets = [
    { relDir: 'cur', imapBox: 'INBOX', flags: '(\\Seen)' },
    { relDir: 'new', imapBox: 'INBOX', flags: '()' },
    { relDir: path.join('.Sent', 'cur'), imapBox: 'Sent', flags: '(\\Seen)' },
    { relDir: path.join('.Sent', 'new'), imapBox: 'Sent', flags: '(\\Seen)' },
  ];

  for (const st of subTargets) {
    const fullDir = path.join(baseDir, st.relDir);
    if (!fs.existsSync(fullDir)) continue;
    const files = fs.readdirSync(fullDir);
    for (const f of files) {
      if (f.startsWith('dovecot') || f === 'maildirfolder') continue;
      const fullPath = path.join(fullDir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && stat.size > 0) {
        items.push({
          key: `${sourceFolderName}/${st.relDir}/${f}`,
          fileName: f,
          fullPath,
          imapBox: st.imapBox,
          flags: st.flags,
          mtime: stat.mtime,
        });
      }
    }
  }
  return items;
}

function createImapSession(email, password) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let currentWait = null;
    let greeted = false;

    const socket = tls.connect({
      host: IMAP_HOST,
      port: IMAP_PORT,
      servername: IMAP_HOST,
      rejectUnauthorized: false,
    });

    socket.setTimeout(25000);

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (!greeted) {
        if (/^\* OK/m.test(buffer)) {
          greeted = true;
          resolve(api);
        }
        return;
      }
      if (currentWait) {
        const tagRegex = new RegExp(`^${currentWait.tag} (OK|NO|BAD)(.*)$`, 'm');
        const m = buffer.match(tagRegex);
        if (m) {
          const status = m[1];
          const resp = buffer;
          const w = currentWait;
          currentWait = null;
          if (status === 'OK') w.onOk(resp);
          else w.onErr(new Error(`IMAP ${w.tag} ${status}: ${m[2]}`));
        }
      }
    });

    socket.on('error', (err) => {
      if (!greeted) reject(err);
      else if (currentWait) currentWait.onErr(err);
    });

    socket.on('timeout', () => {
      const err = new Error('IMAP socket timeout');
      if (!greeted) reject(err);
      else if (currentWait) currentWait.onErr(err);
    });

    const api = {
      sendCmd(tag, cmd) {
        return new Promise((onOk, onErr) => {
          currentWait = { tag, onOk, onErr };
          buffer = '';
          socket.write(`${tag} ${cmd}\r\n`);
        });
      },
      appendLiteralPlus(tag, mailboxName, flags, dateTimeStr, rawBuffer) {
        return new Promise((onOk, onErr) => {
          currentWait = { tag, onOk, onErr };
          buffer = '';
          const headerCmd = `${tag} APPEND "${mailboxName}" ${flags} ${dateTimeStr} {${rawBuffer.length}+}\r\n`;
          socket.write(headerCmd);
          socket.write(rawBuffer);
          socket.write('\r\n');
        });
      },
      close() {
        try {
          socket.write('ZZZZ LOGOUT\r\n');
        } catch (_) {}
        try {
          socket.destroy();
        } catch (_) {}
      },
    };
  });
}

async function runMigration() {
  const state = loadState();
  let grandTotalUploaded = 0;
  let grandTotalSkipped = 0;

  for (const plan of MIGRATION_PLAN) {
    const allFiles = [];
    for (const sf of plan.sourceFolders) {
      allFiles.push(...collectMaildirFiles(sf));
    }

    const pendingFiles = allFiles.filter((it) => !state.uploadedKeys[`${plan.targetEmail}::${it.key}`]);
    if (pendingFiles.length === 0) {
      console.log(`✓ [${plan.targetEmail}] Ya está 100% al día (${allFiles.length} correos).`);
      grandTotalSkipped += allFiles.length;
      continue;
    }

    console.log(`\n🚀 [${plan.targetEmail}] Conectando a IMAPS para subir ${pendingFiles.length} correos pendientes...`);
    let session = null;
    try {
      session = await createImapSession(plan.targetEmail, plan.password);
      await session.sendCmd('A001', `LOGIN "${plan.targetEmail}" "${plan.password}"`);

      // Asegurar que exista carpeta Sent por si hay correos enviados
      try {
        await session.sendCmd('A002', 'CREATE "Sent"');
      } catch (_) {}

      let uploadedHere = 0;
      for (let i = 0; i < pendingFiles.length; i++) {
        const item = pendingFiles[i];
        const rawBuf = fs.readFileSync(item.fullPath);
        const internalDate = extractInternalDate(item.fileName, rawBuf, item.mtime);
        const tag = `AP${i + 1}`;
        try {
          await session.appendLiteralPlus(tag, item.imapBox, item.flags, internalDate, rawBuf);
          state.uploadedKeys[`${plan.targetEmail}::${item.key}`] = true;
          uploadedHere++;
          grandTotalUploaded++;
          if (uploadedHere % 25 === 0 || uploadedHere === pendingFiles.length) {
            saveState(state);
            console.log(`   -> [${plan.targetEmail}] Progreso: ${uploadedHere}/${pendingFiles.length} correos subidos...`);
          }
        } catch (appendErr) {
          // Si "Sent" se llama "INBOX.Sent", reintentar en "INBOX.Sent" o "INBOX"
          if (item.imapBox === 'Sent') {
            try {
              await session.appendLiteralPlus(`${tag}R`, 'INBOX', item.flags, internalDate, rawBuf);
              state.uploadedKeys[`${plan.targetEmail}::${item.key}`] = true;
              uploadedHere++;
              grandTotalUploaded++;
            } catch (e2) {
              console.warn(`   [!] Error subiendo ${item.fileName} en ${plan.targetEmail}: ${e2.message}`);
            }
          } else {
            console.warn(`   [!] Error subiendo ${item.fileName} en ${plan.targetEmail}: ${appendErr.message}`);
          }
        }
      }
      saveState(state);
      console.log(`✅ [${plan.targetEmail}] Completado: ${uploadedHere}/${pendingFiles.length} correos migrados.`);
    } catch (err) {
      console.warn(`⚠️ [${plan.targetEmail}] No se pudo autenticar o conectar (${err.message}).`);
    } finally {
      if (session) session.close();
    }
  }

  console.log(`\n🏁 RESUMEN MIGRACIÓN: ${grandTotalUploaded} correos nuevos subidos | ${grandTotalSkipped} ya existentes.`);
}

runMigration().catch((e) => {
  console.error('Error fatal en migración:', e);
  process.exit(1);
});
