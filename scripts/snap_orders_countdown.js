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
        const targetPath = '/admin/orders/loading';
        const authUrl = `http://localhost:3001/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(targetPath)}`;

        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
        const page = await context.newPage();

        await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 35000 });
        await page.waitForTimeout(3000);

        const outPath = 'C:/Users/German Higuera/.gemini/antigravity/brain/f86d6b1c-600b-494c-a3fd-97ea999f69ef/orders_loading_countdown_verified.png';
        await page.screenshot({ path: outPath });
        console.log('Orders loading countdown screenshot saved to:', outPath);
    } catch (err) {
        console.error('Error taking orders loading screenshot:', err);
    } finally {
        if (browser) await browser.close();
    }
})();
