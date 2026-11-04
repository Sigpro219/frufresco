const fs = require('fs');
const file = 'src/app/admin/orders/alistamiento-print/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const startIdx = content.indexOf('<table');
const endIdx = content.indexOf('</table>', startIdx) + 8;

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find start or end tags');
  process.exit(1);
}

const replacement = `<table style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '8pt',
                                    border: '2px solid #000000',
                                    backgroundColor: '#FFFFFF',
                                    color: '#000000'
                                }}>
                                    <thead>
                                        {/* Fila 1: Encabezados de Columna con ACCOUNTING ID Destacado */}
                                        <tr style={{ backgroundColor: '#E2E8F0', borderBottom: '2px solid #000000' }}>
                                            <th style={{ width: '44px', padding: '5px 2px', textAlign: 'center', fontWeight: 900, border: '1px solid #475569', color: '#000000', fontSize: '8pt' }}>
                                                LUGAR
                                            </th>
                                            <th style={{ width: '190px', padding: '5px 6px', textAlign: 'left', fontWeight: 900, border: '1px solid #475569', color: '#000000', fontSize: '8pt' }}>
                                                SUCURSAL / CLIENTE ({activeOrdersInCell.length})
                                            </th>
                                            <th style={{ width: '26px', padding: '5px 1px', textAlign: 'center', fontWeight: 900, border: '1px solid #475569', color: '#000000', fontSize: '8pt' }}>
                                                TIPO
                                            </th>
                                            {chunkProducts.map((prod) => {
                                                // null = sin registro en inventory_stocks → tratar como 0
                                                const invKg = prod.inventoryKg ?? 0;
                                                const invStr = invKg % 1 === 0 ? String(invKg) : invKg.toFixed(1);
                                                const invColor = invKg === 0 ? '#B91C1C' : '#15803D';
                                                return (
                                                    <th
                                                        key={prod.id}
                                                        style={{
                                                            padding: '4px 3px',
                                                            textAlign: 'center',
                                                            fontWeight: 900,
                                                            border: '1px solid #475569',
                                                            color: '#000000',
                                                            fontSize: '7.8pt',
                                                            lineHeight: '1.25'
                                                        }}
                                                    >
                                                        <span style={{ color: invColor, fontWeight: 900, fontSize: '7.5pt' }}>INV[{invStr}]</span>
                                                        {' '}{prod.displayName}
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {activeOrdersInCell.map((ord, oIdx) => {
                                            // Zebra striping industrial de alto contraste para visibilidad en planta
                                            const rowBg = oIdx % 2 === 0 ? '#FFFFFF' : '#F1F5F9';

                                            return (
                                                <tr key={ord.id} style={{ backgroundColor: rowBg, minHeight: '30px' }}>
                                                    {/* Bahía / Lugar en suelo (Numeración clara y prominente) */}
                                                    <td style={{ textAlign: 'center', padding: '4px 2px', border: '1px solid #64748B', fontWeight: 900, fontSize: '9.5pt', color: '#0F172A' }}>
                                                        {ord.space_label}
                                                    </td>

                                                    {/* Sucursal del Cliente (Estricto: solo nombre de sucursal + Sello Cuidado Especial) */}
                                                    <td style={{ textAlign: 'left', padding: '4px 6px', border: '1px solid #64748B', color: '#000000', maxWidth: '190px' }} title={ord.branch_name}>
                                                        <div style={{ fontWeight: 800, fontSize: '8.5pt', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px' }}>
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ord.branch_name}</span>
                                                            <SpecialClientBadge state={ord.special_attention} variant="print-stamp" />
                                                        </div>
                                                    </td>

                                                    {/* Tipo (I = Institucional, H = Hogar) */}
                                                    <td style={{ textAlign: 'center', padding: '4px 1px', border: '1px solid #64748B', fontWeight: 800, fontSize: '8.2pt', color: '#000000' }}>
                                                        {ord.client_type}
                                                    </td>

                                                    {/* Columnas de Productos (NORMALIZADO A KG + CASILLA CHECK LEAN) */}
                                                    {chunkProducts.map((prod) => {
                                                        const demand = prod.orderDemand[ord.id];
                                                        if (demand && demand.kgQuantity > 0) {
                                                            return (
                                                                <td
                                                                    key={prod.id}
                                                                    style={{
                                                                        textAlign: 'center',
                                                                        padding: '3px 2px',
                                                                        border: '1px solid #64748B',
                                                                        color: '#000000',
                                                                        position: 'relative',
                                                                        verticalAlign: 'middle'
                                                                    }}
                                                                >
                                                                    {/* Casilla de marcación física con bolígrafo para el alistador [ ] */}
                                                                    <div style={{ position: 'absolute', top: '1px', right: '3px', fontSize: '6.5pt', color: '#64748B', fontWeight: 700 }}>
                                                                        [  ]
                                                                    </div>

                                                                    {/* Cantidad Prominente en KG / UN (con espacio tipográfico Lean y alto contraste) */}
                                                                    <div style={{ fontWeight: 900, fontSize: '9.5pt', marginTop: '2px', color: '#000000', letterSpacing: '0.01em' }}>
                                                                        {demand.displayQty} {demand.unit}
                                                                    </div>

                                                                    {/* Especificación Culinaria/Operativa Limpia con Badge Ambar de Atención */}
                                                                    {demand.note && (
                                                                        <div style={{ fontSize: '6.8pt', color: '#1E293B', lineHeight: '1.15', marginTop: '2px', fontWeight: 700, backgroundColor: '#FEF3C7', padding: '1px 3px', borderRadius: '3px', display: 'inline-block' }}>
                                                                            {demand.note}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            );
                                                        }
                                                        return (
                                                            <td
                                                                key={prod.id}
                                                                style={{
                                                                    border: '1px solid #CBD5E1',
                                                                    padding: '3px 2px',
                                                                    textAlign: 'center'
                                                                }}
                                                            />
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>

                                    {/* Fila de Totales por Producto + GRAN TOTAL DE HOJA POKA-YOKE */}
                                    <tfoot>
                                        <tr style={{ backgroundColor: '#E2E8F0', borderTop: '2px solid #000000', fontWeight: 900 }}>
                                            <td colSpan={3} style={{ textAlign: 'left', padding: '4px 6px', border: '1px solid #475569', fontSize: '8pt', color: '#000000', letterSpacing: '0.02em' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span>PRODUCTOS ({chunkProducts.length})</span>
                                                    <span style={{ fontWeight: 900, color: '#0D7A57', backgroundColor: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', border: '1px solid #CBD5E1' }}>
                                                        TOTAL HOJA: {sheetTotalKg.toLocaleString('es-CO')} KG
                                                    </span>
                                                </div>
                                            </td>
                                            {chunkProducts.map((prod) => {
                                                const colSum = activeOrdersInCell.reduce((sum, ord) => sum + (prod.orderDemand[ord.id]?.kgQuantity || 0), 0);
                                                const sumStr = colSum > 0 
                                                    ? (colSum % 1 === 0 ? colSum.toString() : Number(colSum.toFixed(2)).toLocaleString('es-CO')) + ' ' + prod.unit 
                                                    : '-';

                                                return (
                                                    <td
                                                        key={prod.id}
                                                        style={{
                                                            textAlign: 'center',
                                                            padding: '4px 2px',
                                                            border: '1px solid #475569',
                                                            fontSize: '8.2pt',
                                                            color: '#000000',
                                                            fontWeight: 900,
                                                            backgroundColor: '#E2E8F0'
                                                        }}
                                                    >
                                                        {sumStr}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    </tfoot>
                                </table>`;

content = content.slice(0, startIdx) + replacement + content.slice(endIdx);
fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated alistamiento-print/page.tsx with Opción A');
