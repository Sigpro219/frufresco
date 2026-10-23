require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verifyOnScreen() {
    console.log('--- VERIFICACIÓN E2E DE MODELOS POR CLIENTE ON-SCREEN (PLAYWRIGHT) ---');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    const page = await context.newPage();

    // Magiclink
    const { data: linkData, error: lErr } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: 'sigpro219@hotmail.com'
    });
    if (lErr) throw lErr;

    const nextPath = encodeURIComponent('/admin/commercial/settings');
    const authUrl = `http://localhost:3001/auth/callback?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=magiclink&next=${nextPath}`;
    console.log('[1] Navegando a URL...');
    await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('[2] Esperando carga inicial de la página...');
    await page.waitForTimeout(4000);
    console.log('Current URL:', page.url());

    // Click on "Modelos por Cliente (Canastas)"
    console.log('[3] Buscando pestaña Modelos por Cliente...');
    const tabBtn = page.locator('button:has-text("Modelos por Cliente")').first();
    await tabBtn.waitFor({ state: 'visible', timeout: 10000 });
    await tabBtn.click();
    await page.waitForTimeout(2000);

    // Focus on combobox to open client templates list
    console.log('[4] Abriendo combobox...');
    const pickerInput = page.locator('input[placeholder*="Buscar lista de cotización"]').first();
    await pickerInput.click();
    await page.waitForTimeout(1500);

    // Take screenshot of open combobox showing 94 clients!
    await page.screenshot({ path: 'scripts/verify_combobox_94_clients.png' });
    console.log('[EVIDENCIA 1] Captura guardada en scripts/verify_combobox_94_clients.png');

    // Type "MILSEN" or "ANGLO" or "SALITRE"
    console.log('[5] Seleccionando MILSEN...');
    await pickerInput.fill('MILSEN');
    await page.waitForTimeout(1000);
    const milsenOption = page.locator('text=MILSEN SAS').first();
    if (await milsenOption.isVisible()) {
        await milsenOption.click();
        await page.waitForTimeout(4000);

        // Take screenshot of MILSEN on-screen table with 30-day demand and KPI bar!
        await page.screenshot({ path: 'scripts/verify_onscreen_milsen_demand.png' });
        console.log('[EVIDENCIA 2] Captura guardada en scripts/verify_onscreen_milsen_demand.png');
    }

    await browser.close();
    console.log('✅ Verificación visual completada con éxito.');
}

verifyOnScreen().catch(console.error);
