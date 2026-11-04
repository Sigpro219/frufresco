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
        const targetPath = '/admin/settings';
        const authUrl = `http://localhost:3001/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(targetPath)}`;

        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
        const page = await context.newPage();

        console.log('Navigating to authUrl...');
        await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 35000 });
        await page.waitForTimeout(3000);

        // Operacion de Tienda might need to be opened if closed
        const opSectionBtn = await page.$('button:has-text("Operación de Tienda")');
        if (opSectionBtn) {
            console.log('Found Operacion de Tienda button...');
        }

        const outPath = path.join(__dirname, 'verify_settings_cutoff_ui.png');
        await page.screenshot({ path: outPath, fullPage: true });
        console.log('Settings screenshot saved to:', outPath);
    } catch (err) {
        console.error('Error taking screenshot:', err);
    } finally {
        if (browser) await browser.close();
    }
})();
