const { chromium } = require('playwright');
const path = require('path');

async function snap() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  try {
    console.log('Navigating to settings...');
    await page.goto('http://localhost:3001/admin/commercial?tab=operations&subtab=settings', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Click on "Modelos por Cliente (Canastas)" tab button
    const canastasTab = page.locator('button:has-text("Modelos por Cliente (Canastas)")');
    if (await canastasTab.count() > 0) {
      await canastasTab.first().click();
      await page.waitForTimeout(2000);
    }

    // Capture screenshot of current view
    const artifactDir = 'C:/Users/German Higuera/.gemini/antigravity/brain/8761bca4-9359-4dfb-8da2-b45fea38b9a1';
    await page.screenshot({ path: path.join(artifactDir, 'verify_canastas_san_jorge.png'), fullPage: false });
    console.log('Saved verify_canastas_san_jorge.png');

    // Try selecting San Jorge from the template dropdown/selector if available
    const selectTrigger = page.locator('button:has-text("LISTA DE COTIZACIÓN"), div:has-text("LISTA DE COTIZACIÓN")');
    console.log('Trigger count:', await selectTrigger.count());

  } catch (err) {
    console.error('Error in snapshot:', err);
  } finally {
    await browser.close();
  }
}

snap();
