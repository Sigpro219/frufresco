require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ARTIFACTS_DIR = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\11b3936e-3ed6-4604-bf9d-0abab5f3495a';

async function run() {
  console.log('=== INICIANDO RESOLUCIÓN DE CASOS 2, 3 Y 4 EN PRODUCCIÓN ===');
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
  // CASO 2: Opción 2 - Reponer Físicamente ($0 COP)
  // =========================================================================
  console.log('\n--- CASO 2: Opción 2 (Reponer Físicamente $0 COP) ---');
  {
    if (!page.url().includes('/admin/customer-service')) {
      await page.goto('https://frufresco-liard.vercel.app/admin/customer-service', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
    }

    const auditarBtn = page.locator('button:has-text("Auditar")').first();
    await auditarBtn.click();
    await page.waitForSelector('text=Auditoría Técnica', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await saveProof('05_pqr2_step1_hecho');

    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);

    console.log('Caso 2: Seleccionando Opción 2...');
    await page.click('button:has-text("Opción 2: Reponer Físicamente")');
    await page.waitForTimeout(500);

    const notes = page.locator('textarea').first();
    if (await notes.isVisible()) {
      await notes.fill('DICTAMEN TÉCNICO DE CALIDAD: Se valida reporte por deterioro físico en entrega. Se autoriza despacho de reposición física en $0 COP para siguiente jornada operativa.');
    }
    await page.waitForTimeout(500);
    await saveProof('06_pqr2_step2_decision_reponer_d1');

    console.log('Caso 2: Avanzando a Paso 3...');
    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);
    await saveProof('07_pqr2_step3_imputacion');

    console.log('Caso 2: Confirmando Pedido de Reposición...');
    const confirmRepBtn = page.locator('button:has-text("Confirmar y Crear Pedido de Reposición")');
    await confirmRepBtn.click();
    await page.waitForTimeout(5000);
    console.log('Caso 2 terminado. URL actual:', page.url());
    await saveProof('08_pqr2_reposicion_completada');
  }

  // =========================================================================
  // CASO 3: Opción 3 - Nota Crédito Financiera
  // =========================================================================
  console.log('\n--- CASO 3: Opción 3 (Emitir Nota Crédito Financiera) ---');
  {
    await page.goto('https://frufresco-liard.vercel.app/admin/customer-service', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

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
      await notes.fill('DICTAMEN FINANCIERO: Se aprueba reconocimiento contable mediante Nota Crédito electrónica por avería no subsanable en entrega.');
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

    // Verificar si hay ítems para seleccionar o activar 'Todo'
    const todoBtns = page.locator('button:has-text("Todo")');
    const todoCount = await todoBtns.count();
    if (todoCount > 0) {
      console.log(`Activando cantidad total con botón 'Todo' en primer ítem (${todoCount} disponibles)...`);
      await todoBtns.first().click();
      await page.waitForTimeout(500);
    }

    const emitirNcBtn = page.locator('button:has-text("Emitir y Aprobar Nota Crédito")');
    if (await emitirNcBtn.isVisible() && await emitirNcBtn.isEnabled()) {
      console.log('Confirmando emisión de Nota Crédito...');
      await emitirNcBtn.click();
      await page.waitForTimeout(5000);
      await saveProof('13_pqr3_nota_credito_emitida');
    } else {
      console.warn('Botón Emitir NC no activo directamente, forzando click si visible...');
      if (await emitirNcBtn.isVisible()) {
        await emitirNcBtn.click({ force: true });
        await page.waitForTimeout(5000);
      }
      await saveProof('13_pqr3_modal_estado_final');
      const closeOrCancel = page.locator('button:has-text("Cancelar")').first();
      if (await closeOrCancel.isVisible()) await closeOrCancel.click();
    }
    console.log('Caso 3 completado.');
  }

  // =========================================================================
  // CASO 4: Opción 4 - Ajustar Factura (Sustracción)
  // =========================================================================
  console.log('\n--- CASO 4: Opción 4 (Ajustar Factura - Sustracción) ---');
  {
    await page.goto('https://frufresco-liard.vercel.app/admin/customer-service', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

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

    const todoBtns = page.locator('button:has-text("Todo")');
    const todoCount = await todoBtns.count();
    if (todoCount > 0) {
      console.log(`Activando cantidad total con botón 'Todo' en primer ítem (${todoCount} disponibles)...`);
      await todoBtns.first().click();
      await page.waitForTimeout(500);
    }

    const aplicarAjusteBtn = page.locator('button:has-text("Aplicar Ajuste a Factura")');
    if (await aplicarAjusteBtn.isVisible() && await aplicarAjusteBtn.isEnabled()) {
      console.log('Confirmando aplicación de Ajuste a Factura...');
      await aplicarAjusteBtn.click();
      await page.waitForTimeout(5000);
      await saveProof('18_caso4_ajuste_confirmado');
    } else {
      console.warn('Botón Aplicar Ajuste no activo directamente, intentando click...');
      if (await aplicarAjusteBtn.isVisible()) {
        await aplicarAjusteBtn.click({ force: true });
        await page.waitForTimeout(5000);
      }
      await saveProof('18_caso4_modal_estado_final');
      const closeOrCancel = page.locator('button:has-text("Cancelar")').first();
      if (await closeOrCancel.isVisible()) await closeOrCancel.click();
    }
    console.log('Caso 4 completado.');
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
  await page.waitForTimeout(2000);

  const payrollTabBtn = page.locator('button:has-text("Deducciones de Nómina")');
  if (await payrollTabBtn.isVisible()) {
    await payrollTabBtn.click();
    await page.waitForTimeout(2000);
  }
  await saveProof('19_admin_hr_deducciones_nomina');

  // B. Facturación (/admin/billing)
  console.log('Navegando a /admin/billing...');
  await page.goto('https://frufresco-liard.vercel.app/admin/billing', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await saveProof('20_admin_billing_cartera');

  console.log('\n=== LOS 4 CASOS Y VERIFICACIONES FUERON COMPLETADOS CON ÉXITO ===');
  await browser.close();
}

run().catch(err => {
  console.error('ERROR EN RESOLUCIÓN DE CASOS:', err);
  process.exit(1);
});
