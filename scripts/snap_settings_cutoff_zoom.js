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
        const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
        const page = await context.newPage();

        await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 35000 });
        await page.waitForTimeout(2000);

        // Find the governance cutoff element
        const panel = await page.locator('text=Gobernanza de Horarios de Corte y Despachos').locator('xpath=ancestor::div[contains(@style, "grid-column: 1 / -1") or contains(@style, "gridColumn: 1 / -1") or contains(@style, "grid-column: span 2")]').first();
        
        const outPath = 'C:/Users/German Higuera/.gemini/antigravity/brain/f86d6b1c-600b-494c-a3fd-97ea999f69ef/cutoff_governance_panel_zoom.png';
        if (await panel.count() > 0) {
            await panel.screenshot({ path: outPath });
            console.log('Panel zoom screenshot saved to:', outPath);
        } else {
            // fallback: screenshot the operation container
            const opContainer = await page.locator('button:has-text("Operación de Tienda")').locator('xpath=following-sibling::div').first();
            await opContainer.screenshot({ path: outPath });
            console.log('Op container screenshot saved to:', outPath);
        }
    } catch (err) {
        console.error('Error taking zoom screenshot:', err);
    } finally {
        if (browser) await browser.close();
    }
})();
