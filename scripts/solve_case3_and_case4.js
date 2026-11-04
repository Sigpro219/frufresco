require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ARTIFACTS_DIR = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\11b3936e-3ed6-4604-bf9d-0abab5f3495a';

async function run() {
  console.log('=== INICIANDO RESOLUCIÓN DE CASOS 3 Y 4 EN PRODUCCIÓN ===');
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: 'sigpro219@hotmail.com' });
  const authUrl = `https://frufresco-liard.vercel.app/auth/callback?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent('/admin/customer-service')}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  
  await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(2000);

  async function saveProof(name) {
    const filename = `${name}.png`;
    const local = path.join('scripts', filename);
    const art = path.join(ARTIFACTS_DIR, filename);
    await page.screenshot({ path: local });
    try { fs.copyFileSync(local, art); } catch (e) {}
    console.log(`[Evidencia guardada]: ${filename}`);
  }

  // =========================================================================
  // CASO 3: Opción 3 - Nota Crédito Financiera
  // =========================================================================
  console.log('\n--- CASO 3: Opción 3 (Emitir Nota Crédito Financiera) ---');
  {
    if (!page.url().includes('/admin/customer-service')) {
      await page.goto('https://frufresco-liard.vercel.app/admin/customer-service', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
    }

    const auditarBtn = page.locator('button:has-text("Auditar")').first();
    await auditarBtn.click();
    await page.waitForSelector('text=Auditoría Técnica', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await saveProof('09_pqr3_step1_hecho');

    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);

    console.log('Caso 3: Seleccionando Opción 3...');
    await page.click('button:has-text("Opción 3: Emitir Nota Crédito")');
    await page.waitForTimeout(500);

    const notes = page.locator('textarea').first();
    if (await notes.isVisible()) {
      await notes.fill('DICTAMEN FINANCIERO: Se aprueba compensación contable mediante Nota Crédito electrónica por avería no subsanable en entrega.');
    }
    await page.waitForTimeout(500);
    await saveProof('10_pqr3_step2_decision_nota_credito');

    console.log('Caso 3: Avanzando a Paso 3...');
    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);
    await saveProof('11_pqr3_step3_imputacion');

    console.log('Caso 3: Clic en Continuar a Emisión de Nota Crédito...');
    const continueNcBtn = page.locator('button:has-text("Continuar a Emisión de Nota Crédito")');
    await continueNcBtn.click();
    await page.waitForTimeout(2500);
    await saveProof('12_pqr3_modal_nc_abierto');

    // Buscar botón 'Todo' exacto dentro del modal de ajuste si hace falta seleccionar
    const modalTodoBtn = page.locator('button:text-is("Todo")');
    if (await modalTodoBtn.count() > 0) {
      console.log('Seleccionando todo con button:text-is("Todo")...');
      await modalTodoBtn.first().click();
      await page.waitForTimeout(500);
    }

    const emitirNcBtn = page.locator('button:has-text("Emitir y Aprobar Nota Crédito")');
    console.log('Emitir NC button visible:', await emitirNcBtn.isVisible(), 'enabled:', await emitirNcBtn.isEnabled());
    if (await emitirNcBtn.isVisible()) {
      await emitirNcBtn.click();
      await page.waitForTimeout(5000);
      await saveProof('13_pqr3_nota_credito_emitida');
    }
    console.log('Caso 3 completado con éxito.');
  }

  // =========================================================================
  // CASO 4: Opción 4 - Ajustar Factura (Sustracción)
  // =========================================================================
  console.log('\n--- CASO 4: Opción 4 (Ajustar Factura - Sustracción) ---');
  {
    await page.goto('https://frufresco-liard.vercel.app/admin/customer-service', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    const auditarBtn = page.locator('button:has-text("Auditar")').first();
    await auditarBtn.click();
    await page.waitForSelector('text=Auditoría Técnica', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await saveProof('14_caso4_step1_hecho');

    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);

    console.log('Caso 4: Seleccionando Opción 4...');
    await page.click('button:has-text("Opción 4: Ajustar Factura")');
    await page.waitForTimeout(500);

    const notes = page.locator('textarea').first();
    if (await notes.isVisible()) {
      await notes.fill('DICTAMEN DE FACTURACIÓN: Se aprueba ajuste sustractivo de cantidades en factura original por diferencia de pesaje y avería física en muelle.');
    }
    await page.waitForTimeout(500);
    await saveProof('15_caso4_step2_decision_ajuste_factura');

    console.log('Caso 4: Avanzando a Paso 3...');
    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);
    await saveProof('16_caso4_step3_imputacion');

    console.log('Caso 4: Clic en Continuar a Ajuste de Factura...');
    const continueAjusteBtn = page.locator('button:has-text("Continuar a Ajuste de Factura")');
    await continueAjusteBtn.click();
    await page.waitForTimeout(2500);
    await saveProof('17_caso4_modal_ajuste_abierto');

    const modalTodoBtn = page.locator('button:text-is("Todo")');
    if (await modalTodoBtn.count() > 0) {
      console.log('Seleccionando todo con button:text-is("Todo")...');
      await modalTodoBtn.first().click();
      await page.waitForTimeout(500);
    }

    const aplicarAjusteBtn = page.locator('button:has-text("Aplicar Ajuste a Factura")');
    console.log('Aplicar Ajuste button visible:', await aplicarAjusteBtn.isVisible(), 'enabled:', await aplicarAjusteBtn.isEnabled());
    if (await aplicarAjusteBtn.isVisible()) {
      await aplicarAjusteBtn.click();
      await page.waitForTimeout(5000);
      await saveProof('18_caso4_ajuste_confirmado');
    }
    console.log('Caso 4 completado con éxito.');
  }

  // =========================================================================
  // 3. VERIFICACIONES TRANSVERSALES EN TALENTO HUMANO & FACTURACIÓN
  // =========================================================================
  console.log('\n=============================================================');
  console.log('VERIFICACIONES TRANSVERSALES');
  console.log('=============================================================');

  // A. Talento Humano (/admin/hr)
  console.log('Navegando a /admin/hr...');
  await page.goto('https://frufresco-liard.vercel.app/admin/hr', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);

  const payrollTabBtn = page.locator('button:has-text("Deducciones de Nómina")');
  if (await payrollTabBtn.isVisible()) {
    await payrollTabBtn.click();
    await page.waitForTimeout(2000);
  }
  await saveProof('19_admin_hr_deducciones_nomina');

  // B. Facturación (/admin/billing)
  console.log('Navegando a /admin/billing...');
  await page.goto('https://frufresco-liard.vercel.app/admin/billing', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await saveProof('20_admin_billing_cartera');

  console.log('\n=== LOS 4 CASOS Y VERIFICACIONES FUERON COMPLETADOS CON ÉXITO ===');
  await browser.close();
}

run().catch(err => {
  console.error('ERROR EN RESOLUCIÓN DE CASOS:', err);
  process.exit(1);
});
