const fs = require('fs');
let code = fs.readFileSync('src/app/ops/picking/page.tsx', 'utf8');

// 1. Imports
if (!code.includes('SpecialClientBadge')) {
    code = code.replace(
        "import { useAuth } from '@/lib/authContext';",
        `import { useAuth } from '@/lib/authContext';
import SpecialClientBadge from '@/components/SpecialClientBadge';
import { buildSpecialAttentionByProfileMap, SpecialAttentionState } from '@/lib/specialClientAttention';`
    );
    console.log('Added imports to ops/picking/page.tsx');
}

// 2. Interface PickingTask
if (!code.includes('special_attention?: SpecialAttentionState | null;')) {
    code = code.replace(
        "hasAlert?: boolean;\n}",
        "hasAlert?: boolean;\n    special_attention?: SpecialAttentionState | null;\n}"
    );
    if (!code.includes('special_attention?: SpecialAttentionState | null;')) {
        code = code.replace(
            "hasAlert?: boolean;\r\n}",
            "hasAlert?: boolean;\r\n    special_attention?: SpecialAttentionState | null;\r\n}"
        );
    }
    console.log('Updated PickingTask interface');
}

// 3. Update query to select logistics_data & profile_id
const oldSelect = `                    id, status, warehouse_spaces, crates_count,
                    profiles:profiles(id, company_name, contact_name, role, id_zr),`;
const newSelect = `                    id, status, warehouse_spaces, crates_count, delivery_date, created_at, profile_id, logistics_data,
                    profiles:profiles(id, company_name, contact_name, role, id_zr, logistics_data),`;

if (code.includes(oldSelect)) {
    code = code.replace(oldSelect, newSelect);
    console.log('Updated orders select in ops/picking/page.tsx');
} else {
    // Try regex
    const selectRegex = /id,\s*status,\s*warehouse_spaces,\s*crates_count,\s*profiles:profiles\(id,\s*company_name,\s*contact_name,\s*role,\s*id_zr\),/;
    if (selectRegex.test(code)) {
        code = code.replace(selectRegex, newSelect);
        console.log('Updated orders select via regex');
    }
}

// 4. Fetch specialAttentionMap right after activeOrders
const targetAfterActiveOrders = `            // Fetch inventory stocks for all products in active orders`;

const specialAttentionFetchLogic = `            // Build Special Client Attention Map for Logistics & Picking
            const profileIds = Array.from(new Set((activeOrders || []).map((o: any) => o.profile_id || o.profiles?.id).filter(Boolean)));
            const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const [histOrdersRes, histPqrsRes] = await Promise.all([
                profileIds.length > 0
                    ? supabase.from('orders').select('id, profile_id, status, delivery_date, created_at, total, subtotal, logistics_data').in('profile_id', profileIds).gte('delivery_date', sixtyDaysAgo)
                    : Promise.resolve({ data: [] }),
                profileIds.length > 0
                    ? supabase.from('customer_service_pqrs').select('id, client_id, order_id, subject, created_at, status, primary_photo_url').in('client_id', profileIds).gte('created_at', sixtyDaysAgo)
                    : Promise.resolve({ data: [] })
            ]);

            const profilesByProfileId: Record<string, any> = {};
            (activeOrders || []).forEach((o: any) => {
                const pid = o.profile_id || o.profiles?.id;
                if (pid && o.profiles) {
                    profilesByProfileId[pid] = {
                        ...o.profiles,
                        logistics_data: {
                            ...(o.profiles?.logistics_data || {}),
                            ...(o.logistics_data?.special_attention ? { special_attention: o.logistics_data.special_attention } : {})
                        }
                    };
                }
            });

            const specialAttentionMap = buildSpecialAttentionByProfileMap(
                profileIds as string[],
                (histOrdersRes.data || []) as any[],
                (histPqrsRes.data || []) as any[],
                profilesByProfileId
            );

            // Fetch inventory stocks for all products in active orders`;

if (code.includes(targetAfterActiveOrders)) {
    code = code.replace(targetAfterActiveOrders, specialAttentionFetchLogic);
    console.log('Inserted specialAttentionMap logic in ops/picking/page.tsx');
}

// 5. Add special_attention to formattedTasks
const formattedTasksTarget = `                            zone: zone,
                            items: itemsInCategory,
                            status: 'pending'
                        };`;

const formattedTasksReplacement = `                            zone: zone,
                            items: itemsInCategory,
                            status: 'pending',
                            special_attention: ((order as any).profiles?.id || order.profile_id) ? specialAttentionMap[(order as any).profiles?.id || order.profile_id] : null
                        };`;

if (code.includes(formattedTasksTarget)) {
    code = code.replace(formattedTasksTarget, formattedTasksReplacement);
    console.log('Added special_attention to formattedTasks');
} else {
    const ftRegex = /zone:\s*zone,\s*items:\s*itemsInCategory,\s*status:\s*'pending'\s*\};/;
    if (ftRegex.test(code)) {
        code = code.replace(ftRegex, formattedTasksReplacement);
        console.log('Added special_attention to formattedTasks via regex');
    }
}

// 6. Add SpecialClientBadge to task card
const cardTarget = `<div style={{ fontSize: '1rem', fontWeight: '800', color: '#F8FAFC' }}>{task.company_name?.toUpperCase() || 'CLIENTE SIN NOMBRE'}</div>`;
const cardReplacement = `<div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <div style={{ fontSize: '1rem', fontWeight: '800', color: '#F8FAFC' }}>{task.company_name?.toUpperCase() || 'CLIENTE SIN NOMBRE'}</div>
                                                    <SpecialClientBadge state={task.special_attention} darkMode />
                                                </div>`;

if (code.includes(cardTarget)) {
    code = code.replace(cardTarget, cardReplacement);
    console.log('Added SpecialClientBadge to task card in ops/picking/page.tsx');
}

fs.writeFileSync('src/app/ops/picking/page.tsx', code, 'utf8');
console.log('ops/picking/page.tsx patched successfully');
