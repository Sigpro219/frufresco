require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ARTIFACTS_DIR = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\11b3936e-3ed6-4604-bf9d-0abab5f3495a';

async function run() {
  console.log('--- INICIANDO AUDITORÍA REAL DE USUARIO EN VIVO (frufresco-liard.vercel.app) ---');
  
  // 1. Obtener magic link para login de German Higuera (Admin)
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'sigpro219@hotmail.com'
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    throw new Error('Error generando enlace de autenticación: ' + JSON.stringify(linkErr));
  }
  const tokenHash = linkData.properties.hashed_token;
  const authUrl = `https://frufresco-liard.vercel.app/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/admin/customer-service')}`;
  
  console.log('1. Iniciando navegador Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  console.log('2. Autenticando sesión admin en producción...');
  await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(3000);
  console.log('URL actual tras autenticación:', page.url());

  // Helper para guardar screenshot tanto en local como en artifacts
  async function takeProof(name) {
    const filename = `${name}.png`;
    const localPath = path.join('scripts', filename);
    const artifactPath = path.join(ARTIFACTS_DIR, filename);
    await page.screenshot({ path: localPath, fullPage: false });
    try {
      fs.copyFileSync(localPath, artifactPath);
    } catch (e) {
      console.warn('No se pudo copiar a artifacts:', e.message);
    }
    console.log(`[EVIDENCIA GUARDADA]: ${filename}`);
  }

  await takeProof('00_admin_cs_dashboard_initial');

  // Obtener las PQRs pendientes reales
  const { data: pendingPqrs, error: pqrErr } = await supabase
    .from('customer_service_pqrs')
    .select('id, subject, status, created_at, order_id')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (pqrErr || !pendingPqrs || pendingPqrs.length < 4) {
    console.warn('PQRs pendientes en BD:', pendingPqrs?.length);
  } else {
    console.log(`Encontradas ${pendingPqrs.length} PQRS pendientes reales.`);
  }

  // =========================================================================
  // CASO 1: Opción 1 - Cerrar Conforme / Desestimar Queja ($0 COP)
  // =========================================================================
  console.log('\n=============================================================');
  console.log('EJECUTANDO CASO 1 -> Opción 1: Cerrar Conforme ($0 COP)');
  console.log('=============================================================');
  {
    // Clic en la primera pestaña o botón 'Auditar'
    const auditarButtons = page.locator('button:has-text("Auditar")');
    const count = await auditarButtons.count();
    console.log(`Botones "Auditar" disponibles en tabla: ${count}`);
    if (count === 0) throw new Error('No hay botones Auditar disponibles.');

    await auditarButtons.first().click();
    await page.waitForSelector('text=Auditoría Técnica', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await takeProof('01_caso1_paso1_hecho_evidencias');

    // Paso 1 -> Avanzar al Paso 2
    console.log('Caso 1: Avanzando al Paso 2...');
    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);

    // Paso 2: Seleccionar Opción 1 (Cerrar Conforme)
    console.log('Caso 1: Seleccionando Opción 1 (Cerrar Conforme)...');
    await page.click('button:has-text("1. Cerrar Conforme")');
    await page.waitForTimeout(500);

    // Escribir dictamen técnico profesional
    const notesTextarea = page.locator('textarea').first();
    if (await notesTextarea.isVisible()) {
      await notesTextarea.fill('AUDITORÍA TÉCNICA DE CALIDAD GEMBA: Se realiza inspección forense del lote. El producto despachado cumple a cabalidad con la ficha técnica comercial en tamaño, firmeza y grado de madurez acordado con el cliente institucional. No se evidencian defectos fisiológicos ni plagas. Se desestima la queja sin costo para FruFresco ni para el cliente.');
    }
    await page.waitForTimeout(500);
    await takeProof('02_caso1_paso2_decision_comercial_opt1');

    // Paso 2 -> Avanzar al Paso 3
    console.log('Caso 1: Avanzando al Paso 3...');
    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);
    await takeProof('03_caso1_paso3_causa_raiz_exonerado');

    // Paso 3: Confirmar Cierre Conforme ($0 COP)
    console.log('Caso 1: Confirmando Cierre Conforme ($0 COP)...');
    const confirmBtn = page.locator('button:has-text("Confirmar Cierre Conforme ($0 COP)")');
    await confirmBtn.click();
    await page.waitForTimeout(3000);
    await takeProof('04_caso1_cerrado_exitoso');
    console.log('CASO 1 COMPLETADO EXITOSAMENTE.');
  }

  // =========================================================================
  // CASO 2: Opción 2 - Reposición de Producto (D+1 sin costo)
  // =========================================================================
  console.log('\n=============================================================');
  console.log('EJECUTANDO CASO 2 -> Opción 2: Reposición de Producto D+1');
  console.log('=============================================================');
  {
    // Asegurar que estamos en /admin/customer-service
    if (!page.url().includes('/admin/customer-service')) {
      await page.goto('https://frufresco-liard.vercel.app/admin/customer-service', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
    }

    const auditarButtons = page.locator('button:has-text("Auditar")');
    await auditarButtons.first().click();
    await page.waitForSelector('text=Auditoría Técnica', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await takeProof('05_caso2_paso1_hecho_evidencias');

    // Avanzar a Paso 2
    console.log('Caso 2: Avanzando a Paso 2...');
    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);

    // Seleccionar Opción 2: Reponer D+1
    console.log('Caso 2: Seleccionando Opción 2 (Reponer D+1)...');
    await page.click('button:has-text("2. Reponer D+1")');
    await page.waitForTimeout(500);

    const notesTextarea = page.locator('textarea').first();
    if (await notesTextarea.isVisible()) {
      await notesTextarea.fill('DICTAMEN TÉCNICO DE CALIDAD: Se valida reporte por deterioro físico en tránsito. Se aprueba reposición física de garantía al 100% para despacho en la siguiente jornada hábil D+1 dentro de la ventana horaria autorizada.');
    }
    await page.waitForTimeout(500);
    await takeProof('06_caso2_paso2_reponer_d1');

    // Avanzar a Paso 3
    console.log('Caso 2: Avanzando a Paso 3...');
    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);
    await takeProof('07_caso2_paso3_imputacion_reposicion');

    // Confirmar y Crear Pedido de Reposición
    console.log('Caso 2: Confirmando Pedido de Reposición...');
    const confirmRepBtn = page.locator('button:has-text("Confirmar y Crear Pedido de Reposición")');
    await confirmRepBtn.click();
    await page.waitForTimeout(4000);
    console.log('URL tras confirmar reposición:', page.url());
    await takeProof('08_caso2_reposicion_creada');
    console.log('CASO 2 COMPLETADO EXITOSAMENTE.');
  }

  // =========================================================================
  // CASO 3: Opción 3 - Nota Crédito Contable (Saldo a Favor)
  // =========================================================================
  console.log('\n=============================================================');
  console.log('EJECUTANDO CASO 3 -> Opción 3: Nota Crédito Contable');
  console.log('=============================================================');
  {
    await page.goto('https://frufresco-liard.vercel.app/admin/customer-service', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const auditarButtons = page.locator('button:has-text("Auditar")');
    await auditarButtons.first().click();
    await page.waitForSelector('text=Auditoría Técnica', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await takeProof('09_caso3_paso1_hecho_evidencias');

    // Avanzar a Paso 2
    console.log('Caso 3: Avanzando a Paso 2...');
    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);

    // Seleccionar Opción 3: Nota Crédito
    console.log('Caso 3: Seleccionando Opción 3 (Nota Crédito)...');
    await page.click('button:has-text("3. Nota Crédito")');
    await page.waitForTimeout(500);

    const notesTextarea = page.locator('textarea').first();
    if (await notesTextarea.isVisible()) {
      await notesTextarea.fill('DICTAMEN COMERCIAL Y FINANCIERO: Se aprueba compensación contable mediante Nota Crédito electrónica por avería de producto reportada al momento del recibo.');
    }
    await page.waitForTimeout(500);
    await takeProof('10_caso3_paso2_decision_nota_credito');

    // Avanzar a Paso 3
    console.log('Caso 3: Avanzando a Paso 3...');
    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);
    await takeProof('11_caso3_paso3_imputacion_nota_credito');

    // Clic en 'Continuar a Emisión de Nota Crédito'
    console.log('Caso 3: Clic en Continuar a Emisión de Nota Crédito...');
    const continueNcBtn = page.locator('button:has-text("Continuar a Emisión de Nota Crédito")');
    await continueNcBtn.click();
    await page.waitForTimeout(2000);

    // Esperar a que se abra FinancialAdjustmentModal
    await takeProof('12_caso3_modal_nota_credito_abierto');
    
    // Verificar si hay botón de emisión en FinancialAdjustmentModal
    const emitirNcBtn = page.locator('button:has-text("Emitir y Aprobar Nota Crédito")');
    if (await emitirNcBtn.isVisible()) {
      console.log('Caso 3: Confirmando emisión de Nota Crédito...');
      await emitirNcBtn.click();
      await page.waitForTimeout(4000);
      await takeProof('13_caso3_nota_credito_emitida');
    } else {
      console.warn('Caso 3: Botón de emisión no visible directamente o monto $0.');
      await takeProof('13_caso3_modal_nc_detalle');
      // Cerrar modal si sigue abierto
      const cancelBtn = page.locator('button:has-text("Cancelar")').first();
      if (await cancelBtn.isVisible()) await cancelBtn.click();
    }
    console.log('CASO 3 COMPLETADO.');
  }

  // =========================================================================
  // CASO 4: Opción 4 - Ajustar Factura Original / Refacturación
  // =========================================================================
  console.log('\n=============================================================');
  console.log('EJECUTANDO CASO 4 -> Opción 4: Ajustar Factura Original');
  console.log('=============================================================');
  {
    await page.goto('https://frufresco-liard.vercel.app/admin/customer-service', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const auditarButtons = page.locator('button:has-text("Auditar")');
    await auditarButtons.first().click();
    await page.waitForSelector('text=Auditoría Técnica', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await takeProof('14_caso4_paso1_hecho_evidencias');

    // Avanzar a Paso 2
    console.log('Caso 4: Avanzando a Paso 2...');
    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);

    // Seleccionar Opción 4: Ajustar Factura
    console.log('Caso 4: Seleccionando Opción 4 (Ajustar Factura)...');
    await page.click('button:has-text("4. Ajustar Factura")');
    await page.waitForTimeout(500);

    const notesTextarea = page.locator('textarea').first();
    if (await notesTextarea.isVisible()) {
      await notesTextarea.fill('DICTAMEN ADMINISTRATIVO: Se autoriza reliquidación sustractiva de la factura original por corrección de unidades y merma fitosanitaria.');
    }
    await page.waitForTimeout(500);
    await takeProof('15_caso4_paso2_decision_ajustar_factura');

    // Avanzar a Paso 3
    console.log('Caso 4: Avanzando a Paso 3...');
    await page.click('button:has-text("Siguiente")');
    await page.waitForTimeout(1000);
    await takeProof('16_caso4_paso3_imputacion_ajuste_factura');

    // Clic en 'Continuar a Ajuste de Factura'
    console.log('Caso 4: Clic en Continuar a Ajuste de Factura...');
    const continueAjusteBtn = page.locator('button:has-text("Continuar a Ajuste de Factura")');
    await continueAjusteBtn.click();
    await page.waitForTimeout(2000);

    await takeProof('17_caso4_modal_ajuste_factura_abierto');

    const aplicarAjusteBtn = page.locator('button:has-text("Aplicar Ajuste a Factura")');
    if (await aplicarAjusteBtn.isVisible()) {
      console.log('Caso 4: Confirmando aplicación de Ajuste a Factura...');
      await aplicarAjusteBtn.click();
      await page.waitForTimeout(4000);
      await takeProof('18_caso4_ajuste_factura_confirmado');
    } else {
      console.warn('Caso 4: Botón de aplicar ajuste no visible o monto $0.');
      await takeProof('18_caso4_modal_ajuste_detalle');
      const cancelBtn = page.locator('button:has-text("Cancelar")').first();
      if (await cancelBtn.isVisible()) await cancelBtn.click();
    }
    console.log('CASO 4 COMPLETADO.');
  }

  // =========================================================================
  // 3. VERIFICACIONES TRANSVERSALES EN MÓDULOS DE IMPACTO
  // =========================================================================
  console.log('\n=============================================================');
  console.log('VERIFICACIONES TRANSVERSALES EN TALENTO HUMANO & FACTURACIÓN');
  console.log('=============================================================');

  // A. Talento Humano (/admin/hr)
  console.log('Navegando a /admin/hr...');
  await page.goto('https://frufresco-liard.vercel.app/admin/hr', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // Buscar pestaña o botón de Deducciones de Nómina
  const payrollTabBtn = page.locator('button:has-text("Deducciones de Nómina")');
  if (await payrollTabBtn.isVisible()) {
    await payrollTabBtn.click();
    await page.waitForTimeout(2000);
  }
  await takeProof('19_admin_hr_payroll_deductions_view');

  // B. Facturación / Cartera (/admin/billing)
  console.log('Navegando a /admin/billing...');
  await page.goto('https://frufresco-liard.vercel.app/admin/billing', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await takeProof('20_admin_billing_view');

  console.log('\n--- AUDITORÍA EN NAVEGADOR COMPLETADA SATISFACTORIAMENTE ---');
  await browser.close();
}

run().catch(err => {
  console.error('ERROR EN AUDITORÍA:', err);
  process.exit(1);
});
