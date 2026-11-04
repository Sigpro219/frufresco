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
        const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
        const page = await context.newPage();

        await page.goto(authUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(5000);

        // Click button containing "Ventas por Producto"
        const prodBtn = page.getByRole('button', { name: /Ventas por Producto/i });
        await prodBtn.click();
        await page.waitForTimeout(2000);

        // Scroll down
        await page.mouse.wheel(0, 500);
        await page.waitForTimeout(1000);

        const artifactDir = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\b4b05e76-9a5e-4dd8-bd55-f7f423a23770';
        const snap = path.join(artifactDir, 'verify_daily_monitor_products_real_data.png');
        await page.screenshot({ path: snap, fullPage: false });
        console.log('Saved snap to:', snap);

        await browser.close();
        console.log('Done!');
    } catch (err) {
        console.error('Error:', err);
        if (browser) await browser.close();
        process.exit(1);
    }
})();
