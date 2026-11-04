const fs = require('fs');
let code = fs.readFileSync('src/app/admin/orders/loading/page.tsx', 'utf8');

const targetStr = `                                                    <button
                                                        type="button"
                                                        onClick={handleOpenReplacementModal}
                                                        style={{
                                                            backgroundColor: selectedOrder.logistics_data?.is_replacement ? '#EEF2FF' : '#FEF3C7',
                                                            color: selectedOrder.logistics_data?.is_replacement ? '#4338CA' : '#B45309',
                                                            border: selectedOrder.logistics_data?.is_replacement ? '1.5px solid #818CF8' : '1.5px solid #FCD34D',
                                                            borderRadius: '8px',
                                                            padding: '3px 10px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: '800',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            transition: 'all 0.15s',
                                                            boxShadow: '0 1px 2px rgba(180, 83, 9, 0.08)'
                                                        }}
                                                        title="Marcar o modificar condición de Reposición en Garantía ($0 COP) y vincular con pedido original"
                                                    >
                                                        <RotateCcw size={12} strokeWidth={2.2} /> 
                                                        {selectedOrder.logistics_data?.is_replacement ? 'Modificar Vínculo Reposición ($0 COP)' : 'Marcar como Reposición ($0 COP)'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>`;

const replacement = `                                                    <button
                                                        type="button"
                                                        onClick={handleOpenReplacementModal}
                                                        style={{
                                                            backgroundColor: selectedOrder.logistics_data?.is_replacement ? '#EEF2FF' : '#FEF3C7',
                                                            color: selectedOrder.logistics_data?.is_replacement ? '#4338CA' : '#B45309',
                                                            border: selectedOrder.logistics_data?.is_replacement ? '1.5px solid #818CF8' : '1.5px solid #FCD34D',
                                                            borderRadius: '8px',
                                                            padding: '3px 10px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: '800',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            transition: 'all 0.15s',
                                                            boxShadow: '0 1px 2px rgba(180, 83, 9, 0.08)'
                                                        }}
                                                        title="Marcar o modificar condición de Reposición en Garantía ($0 COP) y vincular con pedido original"
                                                    >
                                                        <RotateCcw size={12} strokeWidth={2.2} /> 
                                                        {selectedOrder.logistics_data?.is_replacement ? 'Modificar Vínculo Reposición ($0 COP)' : 'Marcar como Reposición ($0 COP)'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Banner Operativo Atención Especial */}
                                        {selectedOrder.special_attention?.isActive && (
                                            <div style={{
                                                marginTop: '6px',
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

// Match with regex to ignore CRLF
const targetRegex = /<RotateCcw size=\{12\} strokeWidth=\{2\.2\} \/>\s*\{selectedOrder\.logistics_data\?\.is_replacement \? 'Modificar Vínculo Reposición \(\$0 COP\)' : 'Marcar como Reposición \(\$0 COP\)'\}\s*<\/button>\s*<\/div>\s*\}\)\s*<\/div>/;

if (targetRegex.test(code)) {
    const matched = code.match(targetRegex)[0];
    const insertion = matched + `\n\n                                        {/* Banner Operativo Atención Especial */}
                                        {selectedOrder.special_attention?.isActive && (
                                            <div style={{
                                                marginTop: '6px',
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
    code = code.replace(targetRegex, insertion);
    fs.writeFileSync('src/app/admin/orders/loading/page.tsx', code, 'utf8');
    console.log('Successfully inserted banner in loading/page.tsx');
} else {
    console.error('Target regex not matched in loading/page.tsx');
}
