const fs = require('fs');
const path = require('path');

const targetFile = path.resolve('C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/src/app/admin/commercial/settings/page.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

const startMarker = '{/* Table */}';
const endMarker = '                            )}\r\n                        </div>\r\n                    ) : (\r\n                        <div style={{ padding: \'4rem 2rem\',';
const endMarkerLF = '                            )}\n                        </div>\n                    ) : (\n                        <div style={{ padding: \'4rem 2rem\',';

let startIdx = content.indexOf(startMarker);
let endIdx = content.indexOf(endMarker);
if (endIdx === -1) {
    endIdx = content.indexOf(endMarkerLF);
}

if (startIdx === -1 || endIdx === -1) {
    console.error('Could not find markers:', { startIdx, endIdx });
    process.exit(1);
}

const replacement = `{/* Table */}
                            {loadingTemplateItems ? (
                                <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary }}>Cargando canasta y telemetría de cliente...</div>
                            ) : templateItems.length === 0 ? (
                                <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary }}>Esta canasta no tiene productos asociados. Usa el buscador de arriba para agregar.</div>
                            ) : (() => {
                                const defaultMargin = 34.2;
                                const computedRows = templateItems.map(item => {
                                    const cost = templateCosts[item.product_id] || 0;
                                    const margin = templateMargins[item.product_id] !== undefined ? templateMargins[item.product_id] : defaultMargin;
                                    const projectedPrice = cost > 0 ? Math.ceil((cost * (1 + margin / 100)) / 50) * 50 : 0;
                                    const demandInfo = templateDemand[item.product_id] || { volume: 0, ordersCount: 0 };
                                    const monthlyVolume = demandInfo.volume;
                                    const projectedProfit = monthlyVolume > 0 && cost > 0 ? monthlyVolume * (projectedPrice - cost) : 0;
                                    const projectedRevenue = monthlyVolume > 0 && projectedPrice > 0 ? monthlyVolume * projectedPrice : 0;
                                    return {
                                        ...item,
                                        cost,
                                        margin,
                                        projectedPrice,
                                        monthlyVolume,
                                        ordersCount: demandInfo.ordersCount,
                                        projectedProfit,
                                        projectedRevenue
                                    };
                                });

                                const totalVolumeKg = computedRows.reduce((acc, r) => acc + (r.monthlyVolume || 0), 0);
                                const totalProfitCOP = computedRows.reduce((acc, r) => acc + (r.projectedProfit || 0), 0);
                                const totalRevenueCOP = computedRows.reduce((acc, r) => acc + (r.projectedRevenue || 0), 0);
                                const weightedMargin = totalRevenueCOP > 0 ? (totalProfitCOP / totalRevenueCOP) * 100 : (computedRows.length > 0 ? computedRows.reduce((acc, r) => acc + r.margin, 0) / computedRows.length : defaultMargin);

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                                        {/* CINTA KPI DE RENTABILIDAD Y DEMANDA ON-SCREEN */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            backgroundColor: '#F8FAFC',
                                            border: '1px solid #E2E8F0',
                                            borderRadius: '12px',
                                            padding: '0.85rem 1.25rem',
                                            flexWrap: 'wrap',
                                            gap: '12px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                                                <div>
                                                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Canasta de Cliente:</span>
                                                    <div style={{ fontSize: '0.92rem', fontWeight: '800', color: THEME.colors.textMain }}>
                                                        {selectedTemplate?.name}
                                                    </div>
                                                    {templateClientProfile ? (
                                                        <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: '700' }}>
                                                            ● Cuenta Matriz vinculada (Consumo consolidado matriz + sucursales)
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '600' }}>
                                                            Canasta institucional general
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ height: '32px', width: '1px', backgroundColor: '#E2E8F0' }} />
                                                <div>
                                                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>SKUs Activos:</span>
                                                    <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#1E293B' }}>{templateItems.length} prod.</div>
                                                </div>
                                                <div style={{ height: '32px', width: '1px', backgroundColor: '#E2E8F0' }} />
                                                <div>
                                                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Consumo 30 Días:</span>
                                                    <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0369A1' }}>
                                                        {totalVolumeKg >= 1000 ? \`\${(totalVolumeKg / 1000).toFixed(2)} Ton\` : \`\${Math.round(totalVolumeKg)} Kg/Und\`}
                                                    </div>
                                                </div>
                                                <div style={{ height: '32px', width: '1px', backgroundColor: '#E2E8F0' }} />
                                                <div>
                                                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Margen Ponderado:</span>
                                                    <div style={{ fontSize: '0.92rem', fontWeight: '800', color: weightedMargin >= 30 ? '#0D7A57' : '#D97706' }}>
                                                        {weightedMargin.toFixed(1)}%
                                                    </div>
                                                </div>
                                                <div style={{ height: '32px', width: '1px', backgroundColor: '#E2E8F0' }} />
                                                <div>
                                                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Utilidad Proyectada:</span>
                                                    <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0D7A57', fontFamily: 'monospace' }}>
                                                        {formatMoney(totalProfitCOP)}
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={handleSaveTemplateMargins}
                                                disabled={savingTemplateMargins}
                                                style={{
                                                    padding: '0.55rem 1.1rem',
                                                    backgroundColor: '#0D7A57',
                                                    color: 'white',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    fontSize: '0.8rem',
                                                    fontWeight: '700',
                                                    cursor: savingTemplateMargins ? 'not-allowed' : 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)'
                                                }}
                                            >
                                                {savingTemplateMargins ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                                {savingTemplateMargins ? 'Guardando...' : 'Guardar Márgenes'}
                                            </button>
                                        </div>

                                        <div style={{ overflowX: 'auto', width: '100%' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                                <thead>
                                                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: \`1px solid \${THEME.colors.border}\` }}>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '8%' }}>ID ERP</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '22%' }}>Producto</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '12%' }}>Categoría</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '11%', textAlign: 'right' }}>Costo Base</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '12%', textAlign: 'center' }}>Utilidad %</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '11%', textAlign: 'right' }}>Precio Final</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '12%', textAlign: 'right' }}>Consumo 30d</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '12%', textAlign: 'right' }}>Utilidad Total</th>
                                                        <th style={{ ...THEME.typography.tableHeader, padding: '0.65rem 1.25rem', width: '6%', textAlign: 'center' }}></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {computedRows
                                                        .filter(item => {
                                                            const term = templateSearchFilter.toLowerCase().trim();
                                                            if (!term) return true;
                                                            return (item.name || '').toLowerCase().includes(term) || 
                                                                   String(item.accounting_id || '').includes(term);
                                                        })
                                                        .map(item => (
                                                            <tr key={item.id} style={{ borderBottom: \`1px solid \${THEME.colors.border}\`, transition: 'background-color 0.15s' }}>
                                                                <td style={{ padding: '0.65rem 1.25rem', fontWeight: '800', fontFamily: 'monospace', color: '#475569', fontSize: '0.85rem' }}>
                                                                    {item.accounting_id || '—'}
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem', fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.9rem' }}>
                                                                    <div>{item.name}</div>
                                                                    <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '600' }}>
                                                                        {item.sku ? \`SKU: \${item.sku} • \` : ''}{item.unit_of_measure || 'Kg'}
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem' }}>
                                                                    <span style={{
                                                                        backgroundColor: '#F1F5F9',
                                                                        color: '#475569',
                                                                        padding: '0.15rem 0.45rem',
                                                                        borderRadius: '4px',
                                                                        fontSize: '0.72rem',
                                                                        fontWeight: '700'
                                                                    }}>
                                                                        {CATEGORY_MAP[item.category] || item.category || 'General'}
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right', fontWeight: '700', color: '#475569', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                                                                    {item.cost > 0 ? \`$\${formatNumber(item.cost)}\` : <span style={{ color: '#EF4444' }}>Sin Costo</span>}
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem', textAlign: 'center' }}>
                                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                        <input
                                                                            type="number"
                                                                            step="0.5"
                                                                            value={item.margin}
                                                                            onChange={(e) => handleUpdateItemMargin(item.product_id, parseFloat(e.target.value) || 0)}
                                                                            style={{
                                                                                width: '65px',
                                                                                padding: '4px 6px',
                                                                                borderRadius: '6px',
                                                                                border: '1.5px solid #CBD5E1',
                                                                                fontWeight: '800',
                                                                                textAlign: 'right',
                                                                                fontSize: '0.82rem',
                                                                                color: '#0D7A57',
                                                                                backgroundColor: '#F8FAFC'
                                                                            }}
                                                                        />
                                                                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748B' }}>%</span>
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right', fontWeight: '800', color: THEME.colors.primary, fontSize: '0.9rem', fontFamily: 'monospace' }}>
                                                                    {item.projectedPrice > 0 ? \`$\${formatNumber(item.projectedPrice)}\` : '—'}
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right' }}>
                                                                    <div>
                                                                        <span style={{ fontWeight: '800', fontSize: '0.85rem', color: item.monthlyVolume > 0 ? '#0284C7' : '#94A3B8' }}>
                                                                            {item.monthlyVolume > 0 ? \`\${formatNumber(item.monthlyVolume, 1)} \${item.unit_of_measure || 'Kg'}\` : '0'}
                                                                        </span>
                                                                        {item.ordersCount > 0 && (
                                                                            <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block' }}>
                                                                                {item.ordersCount} pedidos
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right', fontWeight: '800', color: item.projectedProfit > 0 ? '#0D7A57' : '#94A3B8', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                                                    {item.projectedProfit > 0 ? formatMoney(item.projectedProfit) : '—'}
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1.25rem', textAlign: 'center' }}>
                                                                    <button
                                                                        onClick={() => removeProductFromTemplate(item.product_id)}
                                                                        style={{
                                                                            background: 'none',
                                                                            border: 'none',
                                                                            color: '#DC2626',
                                                                            cursor: 'pointer',
                                                                            padding: '0.25rem',
                                                                            borderRadius: '4px'
                                                                        }}
                                                                        title="Remover de la lista"
                                                                    >
                                                                        <Trash2 size={15} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    }
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })()
`;

content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
fs.writeFileSync(targetFile, content, 'utf8');
console.log('Tabla On-Screen inyectada exitosamente!');
