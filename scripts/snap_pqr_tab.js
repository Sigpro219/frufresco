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
        await page.waitForTimeout(2000);

        // 1. Screenshot resting state
        const outResting = 'C:/Users/German Higuera/.gemini/antigravity/brain/f86d6b1c-600b-494c-a3fd-97ea999f69ef/pqr_tab_resting.png';
        await page.screenshot({ path: outResting });
        console.log('Resting screenshot saved to:', outResting);

        // 2. Hover over the tab
        const tabBtn = await page.locator('button:has-text("PQR")').first();
        if (await tabBtn.count() > 0) {
            await tabBtn.hover();
            await page.waitForTimeout(500);
            const outHover = 'C:/Users/German Higuera/.gemini/antigravity/brain/f86d6b1c-600b-494c-a3fd-97ea999f69ef/pqr_tab_hover.png';
            await page.screenshot({ path: outHover });
            console.log('Hover screenshot saved to:', outHover);
        }
    } catch (err) {
        console.error('Error taking PQR tab screenshot:', err);
    } finally {
        if (browser) await browser.close();
    }
})();
