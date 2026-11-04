const fs = require('fs');
let code = fs.readFileSync('src/app/admin/orders/loading/page.tsx', 'utf8');

// First remove the improperly placed banner
const badBannerStart = code.indexOf('{selectedOrder.special_attention?.isActive && (');
const badBannerEnd = code.indexOf(')}', badBannerStart + 40);
const badBannerFull = code.slice(badBannerStart, badBannerEnd + 2);

code = code.replace(badBannerFull, '');

// Now find where {editMode && ( ... )} closes
const editModeTarget = `<RotateCcw size={12} strokeWidth={2.2} /> 
                                                        {selectedOrder.logistics_data?.is_replacement ? 'Modificar Vínculo Reposición ($0 COP)' : 'Marcar como Reposición ($0 COP)'}
                                                    </button>
                                                </div>
                                            )}`;

const editModeWithBanner = `<RotateCcw size={12} strokeWidth={2.2} /> 
                                                        {selectedOrder.logistics_data?.is_replacement ? 'Modificar Vínculo Reposición ($0 COP)' : 'Marcar como Reposición ($0 COP)'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Banner Operativo Atención Especial */}
                                        {selectedOrder.special_attention?.isActive && (
                                            <div style={{
                                                marginTop: '4px',
                                                marginBottom: '6px',
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

// In code, check how editModeTarget matches
const idx = code.indexOf('Modificar Vínculo Reposición ($0 COP)');
if (idx !== -1) {
    const afterBtn = code.indexOf('</button>', idx);
    const afterDiv = code.indexOf('</div>', afterBtn);
    const afterParen = code.indexOf(')}', afterDiv);
    
    const bannerHtml = `\n                                        {/* Banner Operativo Atención Especial */}
                                        {selectedOrder.special_attention?.isActive && (
                                            <div style={{
                                                marginTop: '4px',
                                                marginBottom: '6px',
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
    
    code = code.slice(0, afterParen + 2) + bannerHtml + code.slice(afterParen + 2);
    fs.writeFileSync('src/app/admin/orders/loading/page.tsx', code, 'utf8');
    console.log('Successfully repositioned banner in loading/page.tsx');
} else {
    console.error('Target not found in loading/page.tsx');
}
