import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';

const envPath = path.resolve(process.cwd(), '.env.sandbox');
if (!fs.existsSync(envPath)) {
  console.error('[SANDBOX ABORT] No existe .env.sandbox en la raiz del proyecto.');
  process.exit(1);
}

const sandboxEnv = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
const supabaseUrl = sandboxEnv.NEXT_PUBLIC_SUPABASE_URL || '';
const sandboxMode = sandboxEnv.NEXT_PUBLIC_SANDBOX_MODE || '';

if (
  !supabaseUrl.includes('xqhjlfhjnnrmwvklppsh') ||
  supabaseUrl.includes('csqurhdykbalvlnpowcz') ||
  sandboxMode !== 'true'
) {
  console.error('[SANDBOX ABORT] Validacion de seguridad fallida en .env.sandbox.');
  console.error('URL detectada:', supabaseUrl, 'SANDBOX_MODE:', sandboxMode);
  process.exit(1);
}

const port = process.env.SANDBOX_PORT || '3001';
const nets = os.networkInterfaces();
const lanAddresses = [];

for (const [name, addrs] of Object.entries(nets)) {
  for (const net of addrs || []) {
    if (
      !net.internal &&
      net.family === 'IPv4' &&
      !net.address.startsWith('169.254.') &&
      !/vEthernet|WSL|Docker/i.test(name)
    ) {
      lanAddresses.push({ name, address: net.address });
    }
  }
}

console.log('========================================================================');
console.log('  onFRU SANDBOX — ENTORNO AISLADO DE PRUEBAS (BD: xqhjlfhjnnrmwvklppsh)');
console.log('========================================================================');
console.log(`  PC Local : http://localhost:${port}`);
if (lanAddresses.length > 0) {
  for (const item of lanAddresses) {
    console.log(`  Red (${item.name}): http://${item.address}:${port}`);
  }
} else {
  console.log(`  Red LAN  : http://0.0.0.0:${port}`);
}
console.log('  IMAP/SMTP: DESHABILITADOS (cero correos reales ni lectura de bandeja)');
console.log('========================================================================');

const nextBin = path.resolve(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
if (!fs.existsSync(nextBin)) {
  console.error('[SANDBOX ABORT] No se encontro node_modules/next/dist/bin/next.');
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [nextBin, 'dev', '-H', '0.0.0.0', '-p', String(port)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...sandboxEnv,
    },
  }
);

const forwardSignal = (sig) => {
  if (!child.killed) {
    child.kill(sig);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
