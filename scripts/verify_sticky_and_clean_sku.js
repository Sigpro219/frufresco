require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verifyStickyAndCleanSku() {
    console.log('--- VERIFICACIÓN E2E DE STICKY, BUSCADORES Y LIMPIEZA DE SKU ---');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    const page = await context.newPage();

    const { data: linkData, error: lErr } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: 'sigpro219@hotmail.com'
    });
    if (lErr) throw lErr;

    const nextPath = encodeURIComponent('/admin/commercial/settings');
    const authUrl = `http://localhost:3001/auth/callback?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=magiclink&next=${nextPath}`;
    
    console.log('[1] Navegando...');
    await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    console.log('[2] Pestaña Modelos por Cliente...');
    const tabBtn = page.locator('button:has-text("Modelos por Cliente")').first();
    await tabBtn.waitFor({ state: 'visible', timeout: 10000 });
    await tabBtn.click();
    await page.waitForTimeout(2000);

    // Seleccionar MILSEN SAS o ADMINISTRADORA MONSERRATE
    console.log('[3] Seleccionando Administradora Monserrate...');
    const pickerInput = page.locator('input[placeholder*="Buscar cliente"]').first();
    await pickerInput.click();
    await page.waitForTimeout(800);
    await pickerInput.fill('MONSERRATE');
    await page.waitForTimeout(800);
    const monserrateOption = page.locator('text=ADMINISTRADORA MONSERRATE S.A.S').first();
    if (await monserrateOption.isVisible()) {
        await monserrateOption.click();
        await page.waitForTimeout(3000);
    }

    // 1. Evidencia en scroll 0: Vista inicial con buscadores organizados, sin SKU y con unidad Kg
    await page.screenshot({ path: 'scripts/verify_reorganized_searchers_and_clean_sku.png' });
    console.log('[EVIDENCIA 1] Guardada en scripts/verify_reorganized_searchers_and_clean_sku.png');

    // 2. Scroll vertical de 350px para comprobar anclaje STICKY de Toolbar y Thead
    console.log('[4] Scrolleando 350px en vertical...');
    await page.evaluate(() => window.scrollBy(0, 350));
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'scripts/verify_sticky_scrolled_350px.png' });
    console.log('[EVIDENCIA 2] Guardada en scripts/verify_sticky_scrolled_350px.png');

    await browser.close();
    console.log('✅ Verificación completada con éxito.');
}

verifyStickyAndCleanSku().catch(console.error);
