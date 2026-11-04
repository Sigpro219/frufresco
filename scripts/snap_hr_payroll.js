require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const { data: linkData } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: 'sigpro219@hotmail.com'
    });
    const tokenHash = linkData.properties.hashed_token;
    const authUrl = `http://localhost:3001/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/admin/hr')}`;

    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1680, height: 1100 } });
    const page = await context.newPage();

    await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 35000 });
    await page.waitForTimeout(3000);

    // Click specifically on the button for payroll deductions
    await page.click('button:has-text("Deducciones de Nómina")');
    await page.waitForTimeout(4000);

    // Click on Auditar y Asignar to expand the reconciliation tray
    const auditBtn = await page.$('button:has-text("Auditar y Asignar")');
    if (auditBtn) {
        await auditBtn.click();
        await page.waitForTimeout(1000);
    }

    // Click on the first SearchableSelect in the table to open its dropdown with search input
    const selectTrigger = await page.$('button:has-text("Buscar o asignar colaborador")');
    if (selectTrigger) {
        await selectTrigger.click();
        await page.waitForTimeout(1000);
        // Type a couple letters to demonstrate live keyboard filter
        await page.keyboard.type('an');
        await page.waitForTimeout(1000);
        // Press ArrowDown to highlight the next option
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(1000);
    }

    await page.screenshot({ path: 'scripts/23_hr_searchableselect_open.png', fullPage: false });
    console.log('SCREENSHOT_OK: scripts/23_hr_searchableselect_open.png');
    await browser.close();
})();
