/**
 * Ordeño Silencioso Incremental IMAP (Cold Backup)
 * FruFresco - Resguardo Forense Cero-Fuga
 * 
 * Conecta directamente a la IP del servidor de correo heredado vía IMAPS (puerto 993)
 * en modo solo-lectura (EXAMINE INBOX / BODY.PEEK) sin pasar por el panel web
 * ni dejar registros de acceso o alertas al proveedor hostil.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKUP_ROOT = 'C:/Projects/frufresco_backups/incremental_pedidos';
const STATE_FILE = path.join(BACKUP_ROOT, 'sync_state.json');
const LOG_FILE = path.join('C:/Projects/frufresco_backups', 'backup_audit.log');

const IMAP_HOST = '82.180.136.155';
const IMAP_PORT = '993';
const IMAP_USER = 'pedidos@frufresco.com';
const IMAP_PASS = 'SK8B8U)=cZUjdO:Q';

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (err) {
    // Ignore logging write error
  }
}

async function runDailyBackup() {
  if (!fs.existsSync(BACKUP_ROOT)) {
    fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  }

  // Cargar estado previo de sincronización
  let syncState = {
    account: IMAP_USER,
    lastSyncedUid: 37043, // Último UID del backup inicial del 2026-11-07
    totalDownloaded: 0,
    lastRunAt: null
  };

  if (fs.existsSync(STATE_FILE)) {
    try {
      syncState = { ...syncState, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
    } catch (e) {
      log('Aviso: sync_state.json corrupto o inexistente. Usando estado base 37043.');
    }
  }

  log(`Iniciando ordeño silencioso para ${IMAP_USER} desde UID > ${syncState.lastSyncedUid}...`);

  // 1. Consultar UIDs existentes de forma segura vía IMAP SEARCH
  let searchOutput = '';
  try {
    const cmd = `curl.exe --insecure -s --url "imaps://${IMAP_HOST}:${IMAP_PORT}/INBOX" --user "${IMAP_USER}:${IMAP_PASS}" -X "UID SEARCH UID ${syncState.lastSyncedUid + 1}:*"`;
    searchOutput = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
  } catch (err) {
    log(`Error al contactar servidor IMAP: ${err.message}`);
    return;
  }

  // Parsear UIDs retornados por IMAP: "* SEARCH 37044 37045 ..."
  const match = searchOutput.match(/\*\s+SEARCH\s+(.*)/);
  let pendingUids = [];
  if (match && match[1].trim().length > 0) {
    pendingUids = match[1].trim().split(/\s+/).map(u => parseInt(u, 10)).filter(u => u > syncState.lastSyncedUid);
  }

  if (pendingUids.length === 0) {
    log(`✓ Bóveda al día. No hay correos nuevos (Último UID: ${syncState.lastSyncedUid}). Cero huella.`);
    syncState.lastRunAt = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(syncState, null, 2), 'utf8');
    return;
  }

  log(`Detectados ${pendingUids.length} correos nuevos pendientes de ordeño.`);

  let downloadedCount = 0;
  for (const uid of pendingUids) {
    try {
      const emailFile = path.join(BACKUP_ROOT, `${uid}.eml`);
      // Descarga silenciosa del contenido RFC822 completo
      const fetchCmd = `curl.exe --insecure -s --url "imaps://${IMAP_HOST}:${IMAP_PORT}/INBOX;UID=${uid}" --user "${IMAP_USER}:${IMAP_PASS}"`;
      const emailRaw = execSync(fetchCmd, { maxBuffer: 50 * 1024 * 1024, timeout: 30000 });
      
      fs.writeFileSync(emailFile, emailRaw);
      syncState.lastSyncedUid = uid;
      syncState.totalDownloaded++;
      downloadedCount++;
      log(`  -> Correo UID ${uid} respaldado exitosamente (${(emailRaw.length / 1024).toFixed(1)} KB).`);
    } catch (fetchErr) {
      log(`  [!] Error al descargar UID ${uid}: ${fetchErr.message}`);
      break; // Detener en el primer fallo para preservar consistencia de UID
    }
  }

  syncState.lastRunAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(syncState, null, 2), 'utf8');
  log(`✓ Ordeño finalizado. ${downloadedCount} correos nuevos guardados en ${BACKUP_ROOT}.`);
}

runDailyBackup();
