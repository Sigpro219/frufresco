require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const path = require('path');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    let browser;
    try {
        const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
            type: 'magiclink',
            email: 'sigpro219@hotmail.com'
        });
        if (linkErr) throw linkErr;

        const tokenHash = linkData.properties.hashed_token;
        const targetPath = '/admin/commercial?tab=daily-monitor';
        const authUrl = `http://localhost:3001/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(targetPath)}`;

        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
        const page = await context.newPage();

        console.log('Navigating to auth callback...');
        await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);

        console.log('Current URL:', page.url());

        // Wait for table to load
        await page.waitForSelector('table', { timeout: 15000 });
        console.log('Table found for View 1 (Clients)!');

        const artifactDir = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\b4b05e76-9a5e-4dd8-bd55-f7f423a23770';
        await page.screenshot({ path: path.join(artifactDir, 'verify_daily_monitor_view1_clients.png'), fullPage: false });
        console.log('Screenshot of View 1 saved!');

        // Now click on View 2: Ventas por Producto
        const productBtn = await page.locator('button:has-text("2. Ventas por Producto")');
        await productBtn.click();
        await page.waitForTimeout(2000);

        await page.screenshot({ path: path.join(artifactDir, 'verify_daily_monitor_view2_products.png'), fullPage: false });
        console.log('Screenshot of View 2 saved!');

        // Check if "Producto Agro" is in page text
        const content = await page.content();
        const hasProductoAgro = content.includes('Producto Agro');
        const hasCebolla = content.includes('Cebolla cabezona');
        const hasHortalizas = content.includes('Hortalizas');
        const hasCod = content.includes('Cód:');
        console.log({ hasProductoAgro, hasCebolla, hasHortalizas, hasCod });

    } catch (e) {
        console.error('Error during QA snap:', e);
    } finally {
        if (browser) await browser.close();
    }
})();
