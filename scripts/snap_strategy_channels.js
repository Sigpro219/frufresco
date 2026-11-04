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
        const targetPath = '/admin/strategy';
        const authUrl = `http://localhost:3001/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(targetPath)}`;

        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
        const page = await context.newPage();

        console.log('Navigating to Strategy Control Tower...');
        await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(4000);

        // Find the Channel card
        const channelHeading = await page.locator('text=Participación & Rentabilidad por Canal');
        await channelHeading.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);

        const artifactDir = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\b4b05e76-9a5e-4dd8-bd55-f7f423a23770';
        await page.screenshot({ path: path.join(artifactDir, 'verify_strategy_channel_matrix_redesign.png'), fullPage: false });
        console.log('Screenshot saved to verify_strategy_channel_matrix_redesign.png successfully!');
    } catch (e) {
        console.error('Error during strategy channels snap:', e);
    } finally {
        if (browser) await browser.close();
    }
})();
