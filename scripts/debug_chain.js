require('dotenv').config({ path: '.env.local' });
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: 'sigpro219@hotmail.com' });
    await page.goto('http://localhost:3001/auth/callback?token_hash=' + encodeURIComponent(linkData.properties.hashed_token) + '&type=magiclink&next=/admin/commercial/billing');
    await page.waitForTimeout(2000);

    const chain = await page.evaluate(() => {
        const line1 = document.querySelector('div[style*="top: 85px"]') || document.querySelector('div[style*="top:85px"]');
        const list = [];
        let curr = line1;
        while (curr) {
            const r = curr.getBoundingClientRect();
            const cs = window.getComputedStyle(curr);
            list.push({
                tag: curr.tagName,
                id: curr.id,
                className: curr.className,
                styleAttr: curr.getAttribute('style'),
                position: cs.position,
                top: cs.top,
                rectTop: r.top,
                rectHeight: r.height,
                paddingTop: cs.paddingTop,
                marginTop: cs.marginTop
            });
            curr = curr.parentElement;
        }
        return list;
    });

    console.log(JSON.stringify(chain, null, 2));
    await browser.close();
})();
