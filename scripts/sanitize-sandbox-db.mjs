import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const sbxEnvPath = path.resolve(process.cwd(), '.env.sandbox');
  if (!fs.existsSync(sbxEnvPath)) {
    console.error('[ABORT] No existe .env.sandbox en la raiz del proyecto.');
    process.exit(1);
  }

  const sbxEnv = dotenv.parse(fs.readFileSync(sbxEnvPath, 'utf8'));
  const sandboxUrl = (sbxEnv.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceKey = (sbxEnv.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (
    !sandboxUrl.includes('xqhjlfhjnnrmwvklppsh') ||
    sandboxUrl.includes('csqurhdykbalvlnpowcz') ||
    !serviceKey
  ) {
    console.error('[ABORT] Validacion de seguridad fallida: solo se permite ejecutar sobre FruFrescoSandbox.');
    console.error('URL detectada:', sandboxUrl);
    process.exit(1);
  }

  const sbx = createClient(sandboxUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Eliminar credenciales IMAP/SMTP heredadas en app_settings del Sandbox
  const { error: delErr } = await sbx
    .from('app_settings')
    .delete()
    .in('key', ['hostinger_imap_credentials', 'hostinger_smtp_credentials']);
  if (delErr) throw delErr;

  // 2. Forzar bandera de modo sandbox en app_settings
  const { error: upsErr } = await sbx.from('app_settings').upsert(
    [
      { key: 'email_notifications_mode', value: 'sandbox' },
      { key: 'email_sandbox_recipient', value: 'sandbox@frufresco.co' },
    ],
    { onConflict: 'key' }
  );
  if (upsErr) throw upsErr;

  // 3. Cancelar cualquier correo pendiente en public.mail dentro de Sandbox
  const { data: cancelledMails, error: mailErr } = await sbx
    .from('mail')
    .update({ status: 'cancelled', error_message: 'Purged in Sandbox sanitization' })
    .eq('status', 'pending')
    .select('id');
  if (mailErr) throw mailErr;

  // 4. Verificacion post-limpieza en FruFrescoSandbox
  const { data: remainingCreds, error: verCredErr } = await sbx
    .from('app_settings')
    .select('key')
    .in('key', ['hostinger_imap_credentials', 'hostinger_smtp_credentials']);
  if (verCredErr) throw verCredErr;

  const { data: sandboxFlags, error: verFlagErr } = await sbx
    .from('app_settings')
    .select('key, value')
    .in('key', ['email_notifications_mode', 'email_sandbox_recipient']);
  if (verFlagErr) throw verFlagErr;

  const { count: remainingPendingMail, error: verMailErr } = await sbx
    .from('mail')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (verMailErr) throw verMailErr;

  console.log('\n[SANITIZE SANDBOX DB] Resultado en FruFrescoSandbox (xqhjlfhjnnrmwvklppsh):');
  console.log('Credenciales IMAP/SMTP restantes :', (remainingCreds || []).length);
  console.log('Correos pending cancelados       :', (cancelledMails || []).length);
  console.log('Correos pending restantes        :', remainingPendingMail ?? 0);
  console.table(sandboxFlags || []);

  if ((remainingCreds || []).length > 0) {
    console.error('[ERROR] Aun existen credenciales IMAP/SMTP en FruFrescoSandbox.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[SANITIZE SANDBOX DB ERROR]', err);
  process.exit(1);
});
