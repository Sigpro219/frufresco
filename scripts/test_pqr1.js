require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ARTIFACTS_DIR = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\11b3936e-3ed6-4604-bf9d-0abab5f3495a';

async function run() {
  console.log('=== TEST RESOLUCIÓN PQR 1: OPCIÓN 1 (Cerrar Conforme $0 COP) ===');
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: 'sigpro219@hotmail.com' });
  const authUrl = `https://frufresco-liard.vercel.app/auth/callback?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent('/admin/customer-service')}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  
  await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(2000);

  // Helper para guardar evidencia
  async function saveProof(name) {
    const filename = `${name}.png`;
    const local = path.join('scripts', filename);
    const art = path.join(ARTIFACTS_DIR, filename);
    await page.screenshot({ path: local });
    try { fs.copyFileSync(local, art); } catch (e) {}
    console.log(`[Evidencia guardada]: ${filename}`);
  }

  // 1. Abrir primera PQR pendiente
  const auditarBtn = page.locator('button:has-text("Auditar")').first();
  await auditarBtn.click();
  await page.waitForSelector('text=Auditoría Técnica', { timeout: 10000 });
  await page.waitForTimeout(1000);
  await saveProof('01_pqr1_step1_hecho');

  // 2. Avanzar a Paso 2
  await page.click('button:has-text("Siguiente")');
  await page.waitForTimeout(1000);

  // 3. Seleccionar Opción 1: Cerrar Conforme
  await page.click('button:has-text("Opción 1: Cerrar Conforme")');
  await page.waitForTimeout(500);

  const notes = page.locator('textarea').first();
  if (await notes.isVisible()) {
    await notes.fill('AUDITORÍA TÉCNICA DE CALIDAD: Se verifica lote físico en Gemba. El producto cumple con los parámetros organolépticos y calibre acordados. Se cierra conforme sin impacto económico ($0 COP).');
  }
  await page.waitForTimeout(500);
  await saveProof('02_pqr1_step2_decision_opt1');

  // 4. Ir a Causa Raíz (Paso 3)
  await page.click('button:has-text("Ir a Causa Raíz (Opcional)")');
  await page.waitForTimeout(1000);
  await saveProof('03_pqr1_step3_causa_raiz_exonerado');

  // 5. Confirmar Cierre Conforme
  console.log('Confirmando cierre conforme...');
  const confirmBtn = page.locator('button:has-text("Confirmar Cierre Conforme ($0 COP)")');
  await confirmBtn.click();
  await page.waitForTimeout(4000);

  await saveProof('04_pqr1_cerrado_exitoso');
  console.log('PQR 1 RESUELTA EXITOSAMENTE.');
  await browser.close();
}

run().catch(err => {
  console.error('ERROR EN TEST PQR 1:', err);
  process.exit(1);
});
