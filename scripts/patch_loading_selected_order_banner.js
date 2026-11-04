const fs = require('fs');
let code = fs.readFileSync('src/app/admin/orders/loading/page.tsx', 'utf8');

const targetRegex = /(<div style=\{\{\s*display:\s*'flex',\s*alignItems:\s*'center',\s*gap:\s*'10px',\s*flexWrap:\s*'wrap'\s*\}\}>[\s\S]*?<\/div>\s*<\/div>)/;

// Let's locate the exact target around line 5470
const searchStr = `<SpecialClientBadge state={selectedOrder.special_attention} />`;
const badgeIdx = code.indexOf(searchStr);
if (badgeIdx !== -1) {
    // Find closing of that header row
    const closingDiv = code.indexOf('</div>', badgeIdx);
    const closingOuter = code.indexOf('</div>', closingDiv + 6);
    
    const banner = `\n                                        {selectedOrder.special_attention?.isActive && (
                                            <div style={{
                                                marginTop: '8px',
                                                padding: '10px 14px',
                                                borderRadius: '12px',
                                                backgroundColor: '#FEF2F2',
                                                border: '1.5px solid #F87171',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '6px'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.82rem', fontWeight: '900', color: '#991B1B', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                        <ShieldAlert size={16} strokeWidth={2.4} /> ATENCIÓN OPERATIVA: {selectedOrder.special_attention.title.toUpperCase()}
                                                    </span>
                                                    <span style={{ fontSize: '0.68rem', fontWeight: '800', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#FEE2E2', color: '#B91C1C', border: '1px solid #F87171' }}>
                                                        {selectedOrder.special_attention.progressLabel}
                                                    </span>
                                                </div>
                                                <p style={{ margin: 0, fontSize: '0.74rem', color: '#7F1D1D', lineHeight: 1.3 }}>
                                                    {selectedOrder.special_attention.subtitle}
                                                </p>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                                                    {selectedOrder.special_attention.directives?.map((d: any) => (
                                                        <span key={d.key} style={{ fontSize: '0.68rem', fontWeight: '800', color: '#991B1B', backgroundColor: '#FFFFFF', padding: '3px 8px', borderRadius: '6px', border: '1px solid #FECACA' }}>
                                                            ✓ {d.label}: {d.detail}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}`;

    code = code.slice(0, closingOuter + 6) + banner + code.slice(closingOuter + 6);
    fs.writeFileSync('src/app/admin/orders/loading/page.tsx', code, 'utf8');
    console.log('Successfully inserted operational banner in selectedOrder modal in loading/page.tsx');
} else {
    console.error('searchStr not found in loading/page.tsx');
}
