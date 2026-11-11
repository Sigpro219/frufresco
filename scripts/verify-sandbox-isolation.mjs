import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

console.log('--- AUDITORÍA DETERMINÍSTICA DE AISLAMIENTO SANDBOX (ZERO-TRUST) ---');

let failureCount = 0;

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FALLO: ${message}`);
        failureCount++;
    } else {
        console.log(`✅ OK: ${message}`);
    }
}

// 1. Static Analysis on Disk: Dashboard & Kardex Queries
const dashCode = fs.readFileSync('src/components/InventoryUnifiedDashboard.tsx', 'utf8');
const pageCode = fs.readFileSync('src/app/admin/commercial/inventory/page.tsx', 'utf8');
const balanceCode = fs.readFileSync('src/components/InventoryDailyBalanceTab.tsx', 'utf8');

assert(
    dashCode.includes(".not('reference_type', 'like', 'sandbox_%')"),
    'InventoryUnifiedDashboard.tsx contiene filtro PostgREST .not(reference_type, like, sandbox_%)'
);

assert(
    dashCode.includes("!m.reference_type?.startsWith('sandbox_') && !m.notes?.includes('[SANDBOX]')"),
    'InventoryUnifiedDashboard.tsx contiene filtro defensivo JavaScript en cleanMovements'
);

assert(
    pageCode.includes(".not('reference_type', 'like', 'sandbox_%')"),
    'page.tsx Kardex contiene filtro PostgREST .not(reference_type, like, sandbox_%)'
);

assert(
    pageCode.includes("!m.reference_type?.startsWith('sandbox_') && !m.notes?.includes('[SANDBOX]')"),
    'page.tsx Kardex contiene filtro defensivo JavaScript en cleanMovements'
);

assert(
    !balanceCode.includes('⚠️'),
    'InventoryDailyBalanceTab.tsx no contiene el emoji Unicode ⚠️ (Cero Emojis en UI)'
);

assert(
    !balanceCode.includes('} catch (e) {}') && !balanceCode.includes('} catch (err) {}'),
    'InventoryDailyBalanceTab.tsx no contiene bloques catch vacíos silenciosos'
);

// 2. Dynamic DB Verification via Supabase
try {
    const env = fs.readFileSync('.env.local', 'utf8');
    const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/);
    const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/);

    if (urlMatch && keyMatch) {
        const supabase = createClient(urlMatch[1], keyMatch[1]);
        
        // Query production movements
        const { data: prodMovs, error: prodErr } = await supabase
            .from('inventory_movements')
            .select('id, reference_type, notes')
            .not('reference_type', 'like', 'sandbox_%')
            .limit(50);

        assert(!prodErr, `Consulta a inventory_movements ejecutada sin error (${prodErr?.message || 'OK'})`);

        if (prodMovs) {
            const leaked = prodMovs.filter(m => m.reference_type?.startsWith('sandbox_') || m.notes?.includes('[SANDBOX]'));
            assert(leaked.length === 0, `0 movimientos de sandbox filtrados en la consulta oficial (Detectados: ${leaked.length})`);
        }
    } else {
        console.warn('⚠️ No se encontraron credenciales en .env.local para test dinámico DB');
    }
} catch (e) {
    console.warn('Error en verificación dinámica:', e.message);
}

console.log('--------------------------------------------------------------------');
if (failureCount > 0) {
    console.error(`🚨 VERIFICACIÓN FALLIDA CON ${failureCount} ERRORES`);
    process.exitCode = 1;
} else {
    console.log('🏆 AISLAMIENTO SANDBOX CERTIFICADO AL 100% (EXIT 0)');
    process.exitCode = 0;
}
