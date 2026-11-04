const fs = require('fs');

const filePath = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/src/components/admin/StrategyControlTower.tsx';
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Refine sorting of criticalStocks so partial-stock alerts (Cebolla puerro 6.4/150, Albahacon 1.5/30) and covered benchmarks (Papaya maradol 380/50) are visible alongside critical out-of-stock items
const oldCriticalSort = `        // Alerta temprana conectada exclusivamente a productos con min_inventory_level > 0 real en catálogo (cero mocks)
        const criticalStocks = products
            .filter(p => Number(p.min_inventory_level) > 0)
            .map(p => {
                const q = stockByProductMap.get(p.id) || 0;
                const min = Number(p.min_inventory_level);
                const ratio = min > 0 ? (q / min) : 1;
                const deficit = Math.max(min - q, 0);
                return {
                    id: p.id,
                    name: p.name,
                    accountingId: p.accounting_id || null,
                    inventoryGroup: p.inventory_group || 'General',
                    unit: p.unit_of_measure || 'Kg',
                    currentStock: q,
                    minStock: min,
                    deficit,
                    ratio,
                    status: q === 0 ? 'AGOTADO' : q <= min ? 'BAJO MÍNIMO' : 'CUBIERTO'
                };
            })
            .sort((a, b) => a.ratio - b.ratio);`;

const newCriticalSort = `        // Alerta temprana conectada exclusivamente a productos con min_inventory_level > 0 real en catálogo (cero mocks)
        const criticalStocks = products
            .filter(p => Number(p.min_inventory_level) > 0)
            .map(p => {
                const q = stockByProductMap.get(p.id) || 0;
                const min = Number(p.min_inventory_level);
                const ratio = min > 0 ? (q / min) : 1;
                const deficit = Math.max(min - q, 0);
                // Prioridad visual: 1. Bajo mínimo con saldo físico parcial, 2. Agotados de mayor volumen mínimo, 3. Cubiertos
                const priority = (q > 0 && q <= min) ? 1 : (q === 0 ? 2 : 3);
                return {
                    id: p.id,
                    name: p.name,
                    accountingId: p.accounting_id || null,
                    inventoryGroup: p.inventory_group || 'General',
                    unit: p.unit_of_measure || 'Kg',
                    currentStock: q,
                    minStock: min,
                    deficit,
                    ratio,
                    priority,
                    status: q === 0 ? 'AGOTADO' : q <= min ? 'BAJO MÍNIMO' : 'CUBIERTO'
                };
            })
            .sort((a, b) => {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return b.minStock - a.minStock;
            })
            .slice(0, 6);`;

if (!content.includes(oldCriticalSort)) {
    console.error('oldCriticalSort not found!');
    process.exit(1);
}
content = content.replace(oldCriticalSort, newCriticalSort);

// 2. Refine the right card row styling to clinical #F8FAFC surface with subtle left semantic indicator (no heavy pink background)
const oldRightRows = `                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                    {inventoryMetrics.criticalStocks.map((p, idx) => {
                                        const isOut = p.currentStock === 0;
                                        const isLow = p.currentStock <= p.minStock;
                                        return (
                                            <div key={idx} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '0.55rem 0.85rem',
                                                backgroundColor: isOut ? '#FEF2F2' : (isLow ? '#FFFBEB' : '#ECFDF5'),
                                                borderRadius: '8px',
                                                border: \`1px solid \${isOut ? '#FECACA' : (isLow ? '#FDE68A' : '#BBF7D0')}\`
                                            }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0F172A' }}>{p.name}</span>
                                                        {p.accountingId && (
                                                            <span style={{
                                                                fontSize: '0.64rem',
                                                                fontWeight: '700',
                                                                color: '#475569',
                                                                backgroundColor: '#FFFFFF',
                                                                border: '1px solid #E2E8F0',
                                                                padding: '1px 5px',
                                                                borderRadius: '4px',
                                                                fontVariantNumeric: 'tabular-nums'
                                                            }}>
                                                                Cód: {p.accountingId}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.66rem', fontWeight: '600', color: '#64748B', marginTop: '2px' }}>
                                                        {p.inventoryGroup}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                                        <span style={{
                                                            fontSize: '0.62rem',
                                                            fontWeight: '800',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            backgroundColor: isOut ? '#FEE2E2' : (isLow ? '#FEF3C7' : '#DCFCE7'),
                                                            color: isOut ? '#DC2626' : (isLow ? '#92400E' : '#065F46')
                                                        }}>
                                                            {p.status}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.8rem',
                                                            fontWeight: '900',
                                                            color: isOut ? '#DC2626' : (isLow ? '#92400E' : '#065F46')
                                                        }}>
                                                            {formatNumber(p.currentStock, 1)} {p.unit}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B', marginTop: '1px' }}>
                                                        Mínimo real: {formatNumber(p.minStock, 0)} {p.unit}
                                                        {p.deficit > 0 ? \` (Faltan \${formatNumber(p.deficit, 1)} \${p.unit})\` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>`;

const newRightRows = `                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    {inventoryMetrics.criticalStocks.map((p, idx) => {
                                        const isOut = p.currentStock === 0;
                                        const isLow = p.currentStock <= p.minStock;
                                        const accentColor = isOut ? '#DC2626' : (isLow ? '#D97706' : '#0D7A57');
                                        return (
                                            <div key={idx} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '0.68rem 0.9rem',
                                                backgroundColor: '#F8FAFC',
                                                borderRadius: '10px',
                                                border: '1px solid #E2E8F0',
                                                borderLeft: \`3.5px solid \${accentColor}\`
                                            }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0F172A' }}>{p.name}</span>
                                                        {p.accountingId && (
                                                            <span style={{
                                                                fontSize: '0.64rem',
                                                                fontWeight: '700',
                                                                color: '#475569',
                                                                backgroundColor: '#FFFFFF',
                                                                border: '1px solid #E2E8F0',
                                                                padding: '1px 5px',
                                                                borderRadius: '4px',
                                                                fontVariantNumeric: 'tabular-nums'
                                                            }}>
                                                                Cód: {p.accountingId}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.66rem', fontWeight: '600', color: '#64748B', marginTop: '2px' }}>
                                                        {p.inventoryGroup}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                                        <span style={{
                                                            fontSize: '0.62rem',
                                                            fontWeight: '800',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            backgroundColor: isOut ? '#FEF2F2' : (isLow ? '#FFFBEB' : '#ECFDF5'),
                                                            border: \`1px solid \${isOut ? '#FECACA' : (isLow ? '#FDE68A' : '#BBF7D0')}\`,
                                                            color: isOut ? '#DC2626' : (isLow ? '#92400E' : '#065F46')
                                                        }}>
                                                            {p.status}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.8rem',
                                                            fontWeight: '900',
                                                            color: isOut ? '#DC2626' : (isLow ? '#92400E' : '#065F46')
                                                        }}>
                                                            {formatNumber(p.currentStock, 1)} {p.unit}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#64748B', marginTop: '2px' }}>
                                                        Mínimo: {formatNumber(p.minStock, 0)} {p.unit}
                                                        {p.deficit > 0 ? \` • Déficit: \${formatNumber(p.deficit, 1)} \${p.unit}\` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>`;

if (!content.includes(oldRightRows)) {
    console.error('oldRightRows not found!');
    process.exit(1);
}
content = content.replace(oldRightRows, newRightRows);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Refined Alerta Temprana rows and clinical FruFresco styling!');
