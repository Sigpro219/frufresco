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
        const targetPath = '/admin/commercial?tab=operations&subtab=agreements';
        const authUrl = `http://localhost:3001/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(targetPath)}`;

        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
        const page = await context.newPage();

        console.log('Navigating to special agreements...');
        await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);

        const artifactDir = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\b4b05e76-9a5e-4dd8-bd55-f7f423a23770';
        await page.screenshot({ path: path.join(artifactDir, 'verify_special_agreements_4models.png'), fullPage: false });
        console.log('Screenshot of Special Agreements saved!');
    } catch (e) {
        console.error('Error during special agreements snap:', e);
    } finally {
        if (browser) await browser.close();
    }
})();
