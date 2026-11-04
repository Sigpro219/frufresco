require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: 'sigpro219@hotmail.com' });
  const tokenHash = linkData.properties.hashed_token;
  const authUrl = `https://frufresco-liard.vercel.app/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/admin/customer-service')}`;
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(2000);

  const auditarButtons = page.locator('button:has-text("Auditar")');
  await auditarButtons.first().click();
  await page.waitForTimeout(2000);

  // Take screenshot of step 1
  await page.screenshot({ path: 'scripts/debug_modal_step1.png' });

  // Check what buttons exist in modal
  const modalButtons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim().replace(/\n/g, ' '));
  });
  console.log('Modal buttons in step 1:', modalButtons);

  // Click siguiente
  const nextBtn = page.locator('button:has-text("Siguiente")');
  console.log('Is nextBtn visible?', await nextBtn.isVisible());
  if (await nextBtn.isVisible()) {
    await nextBtn.click();
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: 'scripts/debug_modal_after_next.png' });

  const buttonsAfterNext = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim().replace(/\n/g, ' '));
  });
  console.log('Buttons after next:', buttonsAfterNext);

  await browser.close();
})().catch(console.error);
