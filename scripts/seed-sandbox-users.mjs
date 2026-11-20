import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const SANDBOX_PASSWORD = process.env.SANDBOX_TEST_PASSWORD || 'Sandbox2026!';

const FLOOR_TEST_USERS = [
  {
    email: 'conductor@sandbox.frufresco.co',
    role: 'CONDUCTOR',
    profile_type: 'employee',
    contact_name: 'Conductor Sandbox',
    company_name: 'FruFresco Sandbox Piso',
    custom_permissions: ['ops.driver', 'admin.transport.view'],
  },
  {
    email: 'alistador@sandbox.frufresco.co',
    role: 'AUX DE BODEGA',
    profile_type: 'employee',
    contact_name: 'Alistador Sandbox',
    company_name: 'FruFresco Sandbox Bodega',
    custom_permissions: [
      'ops.picking',
      'ops.picking.terminal',
      'ops.picking.dashboard',
      'ops.recepcion',
    ],
  },
  {
    email: 'comprador@sandbox.frufresco.co',
    role: 'COMPRADOR',
    profile_type: 'employee',
    contact_name: 'Comprador Sandbox',
    company_name: 'FruFresco Sandbox Compras',
    custom_permissions: ['ops.compras', 'ops.recogida', 'ops.recepcion'],
  },
];

async function findAllAuthUsers(sbx) {
  const byEmail = new Map();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await sbx.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    for (const u of users) {
      if (u.email) byEmail.set(u.email.toLowerCase(), u);
    }
    if (users.length < perPage) break;
    page += 1;
  }

  return byEmail;
}

async function main() {
  const sbxEnvPath = path.resolve(process.cwd(), '.env.sandbox');
  if (!fs.existsSync(sbxEnvPath)) {
    console.error('[ABORT] No existe .env.sandbox.');
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
    process.exit(1);
  }

  const sbx = createClient(sandboxUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const existingUsers = await findAllAuthUsers(sbx);
  const verificationRows = [];

  for (const spec of FLOOR_TEST_USERS) {
    const existing = existingUsers.get(spec.email.toLowerCase());
    let userId;
    let action;

    if (existing) {
      const { data: updated, error: updErr } = await sbx.auth.admin.updateUserById(existing.id, {
        password: SANDBOX_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: spec.contact_name,
          sandbox: true,
        },
      });
      if (updErr) throw updErr;
      userId = updated.user.id;
      action = 'updated';
    } else {
      const { data: created, error: createErr } = await sbx.auth.admin.createUser({
        email: spec.email,
        password: SANDBOX_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: spec.contact_name,
          sandbox: true,
        },
      });
      if (createErr) throw createErr;
      userId = created.user.id;
      action = 'created';
    }

    const { error: profErr } = await sbx.from('profiles').upsert(
      {
        id: userId,
        email: spec.email,
        role: spec.role,
        profile_type: spec.profile_type,
        contact_name: spec.contact_name,
        company_name: spec.company_name,
        custom_permissions: spec.custom_permissions,
        is_active: true,
        needs_password_change: false,
      },
      { onConflict: 'id' }
    );
    if (profErr) throw profErr;

    const { data: verifiedProfile, error: verErr } = await sbx
      .from('profiles')
      .select('id, email, role, profile_type, custom_permissions')
      .eq('id', userId)
      .single();
    if (verErr) throw verErr;

    verificationRows.push({
      action,
      email: verifiedProfile.email,
      role: verifiedProfile.role,
      profile_type: verifiedProfile.profile_type,
      permissions: (verifiedProfile.custom_permissions || []).join(', '),
    });
  }

  console.log('\n[SEED SANDBOX USERS] Cuentas verificadas en FruFrescoSandbox:');
  console.table(verificationRows);
  console.log(`Password configurado para las 3 cuentas de piso: ${SANDBOX_PASSWORD}`);
}

main().catch((err) => {
  console.error('[SEED USERS ERROR]', err);
  process.exit(1);
});
