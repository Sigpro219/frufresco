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

        console.log('Navigating to agreements...');
        await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);

        const artifactDir = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\f86d6b1c-600b-494c-a3fd-97ea999f69ef';
        const snapPath1 = path.join(artifactDir, 'verify_hallazgo2_kpi_and_table.png');
        await page.screenshot({ path: snapPath1, fullPage: false });
        console.log('Saved snap1 to:', snapPath1);

        // Click on 4th KPI card or text "Sin Acuerdo" to open modal
        const sinAcuerdoCard = page.locator('text=Sin Acuerdo').first();
        if (await sinAcuerdoCard.isVisible()) {
            await sinAcuerdoCard.click();
            await page.waitForTimeout(1000);
            const snapPath2 = path.join(artifactDir, 'verify_hallazgo2_modal_sin_acuerdo.png');
            await page.screenshot({ path: snapPath2, fullPage: false });
            console.log('Saved snap2 to:', snapPath2);
        }

    } catch (err) {
        console.error('Error snapping hallazgo 2:', err);
    } finally {
        if (browser) await browser.close();
    }
})();
