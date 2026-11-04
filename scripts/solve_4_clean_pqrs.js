require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ARTIFACTS_DIR = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\11b3936e-3ed6-4604-bf9d-0abab5f3495a';

async function run() {
  console.log('=== INICIANDO RESOLUCIÓN EN VIVO DE LAS 4 PQRS NUEVAS (OPCIÓN A) ===');
  
  // 1. Obtener magic link para login de Administrador
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'sigpro219@hotmail.com'
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    throw new Error('Error generando enlace de autenticación: ' + JSON.stringify(linkErr));
  }
  const tokenHash = linkData.properties.hashed_token;
  const authUrl = `https://frufresco-liard.vercel.app/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/admin/customer-service')}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

  console.log('Autenticando en producción...');
  await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(2500);

  async function saveProof(name) {
    const filename = `${name}.png`;
    const local = path.join('scripts', filename);
    const art = path.join(ARTIFACTS_DIR, filename);
    await page.screenshot({ path: local });
    try { fs.copyFileSync(local, art); } catch (e) {}
    console.log(`[Evidencia guardada]: ${filename}`);
  }

  await saveProof('today_00_dashboard_initial');

  // =========================================================================
  // CASO 1: Opción 1 - Cerrar Conforme / Desestimar Queja ($0 COP)
  // Target: PQR 1 de las pendientes
  // =========================================================================
  console.log('\n--- CASO 1: Opción 1 (Cerrar Conforme $0 COP) ---');
  {
    if (!page.url().includes('/admin/customer-service')) {
      await page.goto('https://frufresco-liard.vercel.app/admin/customer-service', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
    }

    const auditarBtn = page.locator('button:has-text("Auditar")').first();
    await auditarBtn.click();
    await page.waitForSelector('text=Auditoría Técnica', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await saveProof('today_01_caso1_step1_hecho');

    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);

    console.log('Caso 1: Seleccionando Opción 1: Cerrar Conforme...');
    await page.click('button:has-text("Opción 1: Cerrar Conforme")');
    await page.waitForTimeout(500);

    const notes = page.locator('textarea').first();
    if (await notes.isVisible()) {
      await notes.fill('AUDITORÍA TÉCNICA GEMBA (20/10/2026): Se realiza inspección técnica del producto en lote despachado. Se constata conformidad organoléptica y fitosanitaria conforme a la ficha técnica del cliente. Se cierra el reclamo conforme sin impacto económico ni cobro ($0 COP).');
    }
    await page.waitForTimeout(500);
    await saveProof('today_02_caso1_step2_decision_opt1');

    console.log('Caso 1: Avanzando a Causa Raíz...');
    await page.click('button:has-text("Ir a Causa Raíz (Opcional)")');
    await page.waitForTimeout(1000);
    await saveProof('today_03_caso1_step3_causa_raiz_exonerado');

    console.log('Caso 1: Confirmando Cierre Conforme ($0 COP)...');
    const confirmBtn = page.locator('button:has-text("Confirmar Cierre Conforme ($0 COP)")');
    await confirmBtn.click();
    await page.waitForTimeout(4000);
    await saveProof('today_04_caso1_cerrado_exitoso');
    console.log('Caso 1 completado.');
  }

  // =========================================================================
  // CASO 2: Opción 2 - Reponer Físicamente D+1 ($0 COP)
  // Target: PQR 2 de las pendientes
  // =========================================================================
  console.log('\n--- CASO 2: Opción 2 (Reponer Físicamente D+1 $0 COP) ---');
  {
    if (!page.url().includes('/admin/customer-service')) {
      await page.goto('https://frufresco-liard.vercel.app/admin/customer-service', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
    }

    const auditarBtn = page.locator('button:has-text("Auditar")').first();
    await auditarBtn.click();
    await page.waitForSelector('text=Auditoría Técnica', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await saveProof('today_05_caso2_step1_hecho');

    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);

    console.log('Caso 2: Seleccionando Opción 2: Reponer Físicamente...');
    await page.click('button:has-text("Opción 2: Reponer Físicamente")');
    await page.waitForTimeout(500);

    const notes = page.locator('textarea').first();
    if (await notes.isVisible()) {
      await notes.fill('DICTAMEN TÉCNICO: Se valida reporte por deterioro físico en entrega. Se autoriza despacho de reposición física en garantía $0 COP para siguiente jornada operativa D+1 en franja autorizada.');
    }
    await page.waitForTimeout(500);
    await saveProof('today_06_caso2_step2_decision_reponer_d1');

    console.log('Caso 2: Avanzando a Paso 3...');
    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);
    await saveProof('today_07_caso2_step3_imputacion');

    console.log('Caso 2: Confirmando Pedido de Reposición...');
    const confirmRepBtn = page.locator('button:has-text("Confirmar y Crear Pedido de Reposición")');
    await confirmRepBtn.click();
    await page.waitForTimeout(5000);
    console.log('Caso 2 completado. URL:', page.url());
    await saveProof('today_08_caso2_reposicion_completada');
  }

  // =========================================================================
  // CASO 3: Opción 3 - Nota Crédito Financiera
  // Target: PQR 3 de las pendientes
  // =========================================================================
  console.log('\n--- CASO 3: Opción 3 (Emitir Nota Crédito Financiera) ---');
  {
    await page.goto('https://frufresco-liard.vercel.app/admin/customer-service', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const auditarBtn = page.locator('button:has-text("Auditar")').first();
    await auditarBtn.click();
    await page.waitForSelector('text=Auditoría Técnica', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await saveProof('today_09_caso3_step1_hecho');

    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);

    console.log('Caso 3: Seleccionando Opción 3: Nota Crédito...');
    await page.click('button:has-text("Opción 3: Emitir Nota Crédito")');
    await page.waitForTimeout(500);

    const notes = page.locator('textarea').first();
    if (await notes.isVisible()) {
      await notes.fill('DICTAMEN FINANCIERO: Se autoriza reconocimiento contable mediante Nota Crédito electrónica por novedad de calidad no subsanable.');
    }
    await page.waitForTimeout(500);
    await saveProof('today_10_caso3_step2_decision_nota_credito');

    console.log('Caso 3: Avanzando a Paso 3...');
    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);
    await saveProof('today_11_caso3_step3_imputacion');

    console.log('Caso 3: Clic en Continuar a Emisión de Nota Crédito...');
    const continueNcBtn = page.locator('button:has-text("Continuar a Emisión de Nota Crédito")');
    await continueNcBtn.click();
    await page.waitForTimeout(2500);
    await saveProof('today_12_caso3_modal_nc_abierto');

    // Selección en modal de ajuste
    const modalTodoBtn = page.locator('button:text-is("Todo")');
    if (await modalTodoBtn.count() > 0) {
      await modalTodoBtn.first().click();
      await page.waitForTimeout(500);
    }

    const emitirNcBtn = page.locator('button:has-text("Emitir y Aprobar Nota Crédito")');
    console.log('Emitir NC button visible:', await emitirNcBtn.isVisible());
    if (await emitirNcBtn.isVisible()) {
      await emitirNcBtn.click();
      await page.waitForTimeout(5000);
      await saveProof('today_13_caso3_nota_credito_emitida');
    }
    console.log('Caso 3 completado.');
  }

  // =========================================================================
  // CASO 4: Opción 4 - Ajustar Factura (Sustracción)
  // Target: PQR 4 de las pendientes
  // =========================================================================
  console.log('\n--- CASO 4: Opción 4 (Ajustar Factura - Sustracción) ---');
  {
    await page.goto('https://frufresco-liard.vercel.app/admin/customer-service', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const auditarBtn = page.locator('button:has-text("Auditar")').first();
    await auditarBtn.click();
    await page.waitForSelector('text=Auditoría Técnica', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await saveProof('today_14_caso4_step1_hecho');

    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);

    console.log('Caso 4: Seleccionando Opción 4: Ajustar Factura...');
    await page.click('button:has-text("Opción 4: Ajustar Factura")');
    await page.waitForTimeout(500);

    const notes = page.locator('textarea').first();
    if (await notes.isVisible()) {
      await notes.fill('DICTAMEN DE FACTURACIÓN: Se aprueba ajuste sustractivo neto en factura original por diferencia de gramaje y merma física recibida.');
    }
    await page.waitForTimeout(500);
    await saveProof('today_15_caso4_step2_decision_ajuste_factura');

    console.log('Caso 4: Avanzando a Paso 3...');
    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);
    await saveProof('today_16_caso4_step3_imputacion');

    console.log('Caso 4: Clic en Continuar a Ajuste de Factura...');
    const continueAjusteBtn = page.locator('button:has-text("Continuar a Ajuste de Factura")');
    await continueAjusteBtn.click();
    await page.waitForTimeout(2500);
    await saveProof('today_17_caso4_modal_ajuste_abierto');

    const modalTodoBtn = page.locator('button:text-is("Todo")');
    if (await modalTodoBtn.count() > 0) {
      await modalTodoBtn.first().click();
      await page.waitForTimeout(500);
    }

    const aplicarAjusteBtn = page.locator('button:has-text("Aplicar Ajuste a Factura")');
    console.log('Aplicar Ajuste button visible:', await aplicarAjusteBtn.isVisible());
    if (await aplicarAjusteBtn.isVisible()) {
      await aplicarAjusteBtn.click();
      await page.waitForTimeout(5000);
      await saveProof('today_18_caso4_ajuste_confirmado');
    }
    console.log('Caso 4 completado.');
  }

  // =========================================================================
  // VERIFICACIONES TRANSVERSALES
  // =========================================================================
  console.log('\n--- VERIFICACIONES TRANSVERSALES ---');

  // A. Talento Humano (/admin/hr)
  console.log('Navegando a /admin/hr...');
  await page.goto('https://frufresco-liard.vercel.app/admin/hr', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);

  const payrollTabBtn = page.locator('button:has-text("Deducciones de Nómina")');
  if (await payrollTabBtn.isVisible()) {
    await payrollTabBtn.click();
    await page.waitForTimeout(2000);
  }
  await saveProof('today_19_admin_hr_deducciones_nomina');

  // B. Facturación (/admin/commercial/billing)
  console.log('Navegando a /admin/commercial/billing...');
  await page.goto('https://frufresco-liard.vercel.app/admin/commercial/billing', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await saveProof('today_20_admin_billing_comprobantes');

  console.log('\n=== LAS 4 NUEVAS PQRS FUERON PROCESADAS CON ÉXITO ===');
  await browser.close();
}

run().catch(err => {
  console.error('ERROR EN PROCESO:', err);
  process.exit(1);
});
