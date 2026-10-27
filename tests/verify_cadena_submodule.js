const { chromium } = require('playwright');
const fs = require('fs');
const XLSX = require('xlsx');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  const page = await context.newPage();

  console.log('Navigating to login page...');
  await page.goto('http://localhost:3001/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  console.log('Logging in...');
  await page.fill('input[type="email"]', 'sigpro219@hotmail.com');
  await page.fill('input[type="password"]', 'TestPassword2026!');
  await page.click('button[type="submit"]');

  console.log('Waiting for authentication...');
  await page.waitForTimeout(4000);

  console.log('Navigating to billing dashboard...');
  await page.goto('http://localhost:3001/admin/commercial/billing', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Click on the 'Conciliación Cadena & RADIAN' tab button
  console.log('Clicking Conciliación Cadena & RADIAN tab...');
  const tabBtn = page.locator('button:has-text("Conciliación Cadena & RADIAN")');
  await tabBtn.waitFor({ state: 'visible', timeout: 15000 });
  await tabBtn.click();
  await page.waitForTimeout(2500);

  // 1. Screenshot of the main live reconciler
  await page.screenshot({ path: 'C:/Users/German Higuera/.gemini/antigravity/brain/b4b05e76-9a5e-4dd8-bd55-f7f423a23770/verify_cadena_radian_submodule_main.png', fullPage: false });
  console.log('Saved verify_cadena_radian_submodule_main.png');

  // 2. Click on Instructivo Operativo
  console.log('Switching to Instructivo Operativo...');
  const guideTab = page.locator('button:has-text("Instructivo Operativo")');
  await guideTab.click();
  await page.waitForTimeout(1000);

  // Expand accordion sections
  const headers = page.locator('text=¿Qué es RADIAN');
  if (await headers.count() > 0) {
    await headers.first().click();
    await page.waitForTimeout(500);
  }
  const stepHeader = page.locator('text=Paso a Paso Operativo');
  if (await stepHeader.count() > 0) {
    await stepHeader.first().click();
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: 'C:/Users/German Higuera/.gemini/antigravity/brain/b4b05e76-9a5e-4dd8-bd55-f7f423a23770/verify_cadena_radian_submodule_instructivo.png', fullPage: false });
  console.log('Saved verify_cadena_radian_submodule_instructivo.png');

  // 3. Switch back to Conciliador en Vivo and simulate uploading an Excel file
  console.log('Switching back to Conciliador en Vivo and uploading test file...');
  const reconTab = page.locator('button:has-text("Conciliador en Vivo")');
  await reconTab.click();
  await page.waitForTimeout(1000);

  // Create a realistic Cadena Excel file
  const testWb = XLSX.utils.book_new();
  const testData = [
    {
      'Prefijo': 'SETT',
      'Consecutivo': 10001,
      'CUFE': 'e1161fc23a8f192b0c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      'Fecha Emisión': '2026-10-25',
      'NIT': '901234567',
      'Cliente': 'CLIENTE CONCILIADO EXITOSO',
      'Estado DIAN': 'Aprobada',
      'Evento 030': 'Si',
      'Evento 032': 'Si',
      'Evento 033': 'Si',
      'Total': 450000,
      'Observaciones': 'Pedido #e1161fc2'
    },
    {
      'Prefijo': 'SETT',
      'Consecutivo': 10002,
      'CUFE': '5abca8b7b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7',
      'Fecha Emisión': '2026-10-25',
      'NIT': '860001234',
      'Cliente': 'HOTEL RECHAZADO DIAN',
      'Estado DIAN': 'Rechazada',
      'Mensaje': 'Error DIAN 99: RUT suspendido',
      'Evento 030': 'No',
      'Evento 032': 'No',
      'Evento 033': 'No',
      'Total': 780000,
      'Observaciones': 'Pedido #5abca8b7'
    }
  ];
  const testWs = XLSX.utils.json_to_sheet(testData);
  XLSX.utils.book_append_sheet(testWb, testWs, 'Cadena');
  const tempFilePath = 'C:/Users/German Higuera/.gemini/antigravity/brain/b4b05e76-9a5e-4dd8-bd55-f7f423a23770/temp_cadena_test.xlsx';
  XLSX.writeFile(testWb, tempFilePath);

  // Set file into input
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(tempFilePath);
  await page.waitForTimeout(2500);

  // Screenshot after reconciliation
  await page.screenshot({ path: 'C:/Users/German Higuera/.gemini/antigravity/brain/b4b05e76-9a5e-4dd8-bd55-f7f423a23770/verify_cadena_radian_reconciliation_results.png', fullPage: false });
  console.log('Saved verify_cadena_radian_reconciliation_results.png');

  // Filter by 'Conciliadas' pill
  const reconciledPill = page.locator('button:has-text("Conciliadas")');
  if (await reconciledPill.count() > 0) {
    await reconciledPill.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'C:/Users/German Higuera/.gemini/antigravity/brain/b4b05e76-9a5e-4dd8-bd55-f7f423a23770/verify_cadena_radian_pill_conciliadas.png', fullPage: false });
    console.log('Saved verify_cadena_radian_pill_conciliadas.png');
  }

  await browser.close();
  console.log('Test completed successfully!');
}

run().catch(err => {
  console.error('Playwright script error:', err);
  process.exit(1);
});
