const fs = require('fs');
let code = fs.readFileSync('src/app/ops/picking/cliente/[id]/page.tsx', 'utf8');

// 1. Add ShieldAlert to imports
code = code.replace(
    "Scale\n} from 'lucide-react';",
    "Scale,\n    ShieldAlert\n} from 'lucide-react';"
);
if (!code.includes('ShieldAlert')) {
    code = code.replace(
        "Scale\r\n} from 'lucide-react';",
        "Scale,\r\n    ShieldAlert\r\n} from 'lucide-react';"
    );
}

// 2. Add Operational Special Care Banner right above the List
const listTarget = "{/* List */}";
const banner = `{/* Operational Special Care Banner */}
            {specialAttention?.isActive && (
                <div style={{
                    margin: '1rem 1rem 0 1rem',
                    padding: '0.85rem 1rem',
                    borderRadius: '14px',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1.5px solid #EF4444',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FCA5A5', fontWeight: '900', fontSize: '0.85rem' }}>
                            <ShieldAlert size={18} strokeWidth={2.4} />
                            <span>ATENCIÓN ESPECIAL AL CLIENTE: {specialAttention.title.toUpperCase()}</span>
                        </div>
                        <span style={{ fontSize: '0.68rem', fontWeight: '800', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#EF4444', color: '#FFFFFF' }}>
                            {specialAttention.progressLabel}
                        </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#E2E8F0', lineHeight: 1.3 }}>
                        {specialAttention.subtitle}
                    </div>
                    {/* Directives */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                        {specialAttention.directives.map((d) => (
                            <span key={d.key} style={{
                                fontSize: '0.66rem',
                                fontWeight: '800',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                color: '#F8FAFC',
                                border: '1px solid rgba(255, 255, 255, 0.2)'
                            }}>
                                ✓ {d.label}: {d.detail}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* List */}`;

if (code.includes(listTarget)) {
    code = code.replace(listTarget, banner);
    fs.writeFileSync('src/app/ops/picking/cliente/[id]/page.tsx', code, 'utf8');
    console.log('Successfully patched picking/cliente/[id]/page.tsx');
} else {
    console.error('List target not found in picking/cliente/[id]/page.tsx');
}
