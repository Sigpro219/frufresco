require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    try {
        const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
            type: 'magiclink',
            email: 'sigpro219@hotmail.com'
        });
        if (linkErr) throw linkErr;

        const tokenHash = linkData.properties.hashed_token;
        const targetPath = '/admin/commercial?tab=operations&subtab=settings';
        const authUrl = `http://localhost:3001/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(targetPath)}`;

        const browser = await chromium.launch();
        const context = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
        const page = await context.newPage();

        console.log('Navigating to authUrl...');
        await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 35000 });
        await page.waitForTimeout(3000);

        // Por defecto arranca en 'models'
        const outPathModels = 'C:/Users/German Higuera/.gemini/antigravity/brain/b4b05e76-9a5e-4dd8-bd55-f7f423a23770/verify_compact_models_true.png';
        await page.screenshot({ path: outPathModels, fullPage: false });
        console.log('Models compact screenshot saved to:', outPathModels);

        await browser.close();
    } catch (err) {
        console.error('Snapshot failed:', err);
    }
})();
