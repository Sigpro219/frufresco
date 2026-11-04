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
        const targetPath = '/admin/commercial?tab=clients&clientTab=agreements';
        const authUrl = `http://localhost:3001/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(targetPath)}`;

        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
        const page = await context.newPage();

        console.log('Navigating to authUrl...');
        await page.goto(authUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        // Click "Vencidos" or "Todos"
        const filterBtns = await page.$$('button');
        for (const btn of filterBtns) {
            const txt = await page.evaluate(el => el.textContent, btn);
            if (txt && (txt.includes('Vencidos') || txt.includes('Todos'))) {
                await btn.click();
                await page.waitForTimeout(2000);
                break;
            }
        }

        // Check if quotes exist in DB
        const { data: quotes } = await supabase.from('quotes').select('id, quote_number, status, client_id').limit(5);
        console.log('Quotes in DB:', quotes);

        const rows = await page.$$('table tbody tr');
        console.log('Found gallery rows:', rows.length);
        if (rows.length > 0) {
            await rows[0].click();
            await page.waitForTimeout(3000);
        }

        const artifactDir = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\f86d6b1c-600b-494c-a3fd-97ea999f69ef';
        const snapPath = path.join(artifactDir, 'verify_agreement_drawer_sorting.png');
        await page.screenshot({ path: snapPath, fullPage: false });
        console.log('Screenshot saved to:', snapPath);

    } catch (err) {
        console.error('Playwright error:', err);
    } finally {
        if (browser) await browser.close();
    }
})();
