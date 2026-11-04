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
  await page.waitForTimeout(1500);

  // Step 1 -> Step 2
  await page.click('button:has-text("Siguiente")');
  await page.waitForTimeout(1000);

  // Click Opción 1
  await page.click('button:has-text("Opción 1: Cerrar Conforme")');
  await page.waitForTimeout(1000);

  // Step 2 -> Step 3
  await page.click('button:has-text("Siguiente")');
  await page.waitForTimeout(1500);

  await page.screenshot({ path: 'scripts/debug_modal_step3.png' });

  const buttonsInStep3 = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim().replace(/\n/g, ' '));
  });
  console.log('Buttons in Step 3:', buttonsInStep3);

  const step3Text = await page.evaluate(() => {
    const modal = document.querySelector('div[style*="z-index: 9999"]') || document.body;
    return modal.innerText;
  });
  console.log('Step 3 Text Snippet:', step3Text.slice(0, 1500));

  await browser.close();
})().catch(console.error);
