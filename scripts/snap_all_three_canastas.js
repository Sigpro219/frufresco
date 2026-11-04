require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const path = require('path');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const artifactDir = 'C:/Users/German Higuera/.gemini/antigravity/brain/8761bca4-9359-4dfb-8da2-b45fea38b9a1';

(async () => {
    let browser;
    try {
        console.log('Generando enlace mágico para admin...');
        const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
            type: 'magiclink',
            email: 'sigpro219@hotmail.com'
        });
        if (linkErr) throw linkErr;

        const tokenHash = linkData.properties.hashed_token;
        const targetPath = '/admin/commercial?tab=operations&subtab=settings';
        const authUrl = `http://localhost:3001/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(targetPath)}`;

        console.log('Iniciando Chromium...');
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
        const page = await context.newPage();

        console.log('Navegando vía Auth Callback...');
        await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);

        console.log('Haciendo clic en Modelos por Cliente (Canastas)...');
        const canastasTab = page.locator('button:has-text("Modelos por Cliente (Canastas)")');
        await canastasTab.waitFor({ state: 'visible', timeout: 10000 });
        await canastasTab.click();
        await page.waitForTimeout(2000);

        const clientsToTest = [
            { search: 'SAN JORGE', name: 'san_jorge', file: 'verify_canastas_san_jorge.png' },
            { search: 'CORFERIAS', name: 'corferias', file: 'verify_canastas_corferias.png' },
            { search: 'MONTAÑA', name: 'montana', file: 'verify_canastas_montana.png' }
        ];

        for (const c of clientsToTest) {
            console.log(`Buscando y seleccionando ${c.search}...`);
            const pickerInput = page.locator('input[placeholder*="Buscar cliente matriz"]');
            await pickerInput.click();
            await pickerInput.fill(c.search);
            await page.waitForTimeout(1000);

            // Click option in dropdown
            const option = page.locator('div[style*="cursor: pointer"]').filter({ hasText: c.search }).first();
            await option.click();
            await page.waitForTimeout(2000);

            const outPath = path.join(artifactDir, c.file);
            await page.screenshot({ path: outPath, fullPage: false });
            console.log(`✓ Captura guardada: ${c.file}`);
        }

        console.log('¡Prueba E2E completada con éxito!');
    } catch (err) {
        console.error('Error en captura:', err);
    } finally {
        if (browser) await browser.close();
    }
})();
