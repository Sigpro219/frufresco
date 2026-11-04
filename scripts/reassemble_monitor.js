const fs = require('fs');
const path = require('path');

const repoPath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Projects\\frufresco';
const monitorPath = path.join(repoPath, 'src\\components\\CommercialDailyMonitorModule.tsx');
let monitorContent = fs.readFileSync(monitorPath, 'utf8');

// Remove scratch files in repo
const scratch1 = path.join(repoPath, 'scratch_clients_block.tsx');
const scratch2 = path.join(repoPath, 'scratch_clean_monitor.tsx');
if (fs.existsSync(scratch1)) fs.unlinkSync(scratch1);
if (fs.existsSync(scratch2)) fs.unlinkSync(scratch2);

const clientMarker = "{/* VISTA 1: VENTAS POR CLIENTE */}";
const drilldownMarker = "{/* VISTA 3: PRODUCTO POR CLIENTE (DRILL-DOWN) */}";

const startClient = monitorContent.indexOf(clientMarker);
const startDrilldown = monitorContent.indexOf(drilldownMarker);

// Find activeView === 'products' in current monitorContent
const prodMarker = "{activeView === 'products' && (";
const startProd = monitorContent.indexOf(prodMarker);

const currentProductsTable = monitorContent.substring(startProd, startDrilldown);

const clientsTableHtml = `{/* VISTA 1: VENTAS POR CLIENTE */}
                    {activeView === 'clients' && (
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: \`0 0 \${THEME.radius.lg} \${THEME.radius.lg}\`,
                            border: \`1px solid \${THEME.colors.border}\`,
                            borderTop: 'none',
                            overflow: 'visible'
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.85rem', textAlign: 'left' }}>
                                <thead style={{ position: 'sticky', top: '137px', zIndex: 35 }}>
                                    <tr style={{ backgroundColor: '#F8FAFC' }}>
                                        <th 
                                            onClick={() => handleOrderSort('consecutivo')}
                                            title="Ordenar por Consecutivo de Planta"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 1rem', width: '14%', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>Consecutivo & Zona</span>
                                                {orderSortColumn === 'consecutivo' ? (
                                                    orderSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleOrderSort('client')}
                                            title="Ordenar por Cliente / Sucursal"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 1rem', width: '36%', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>Cliente & Sucursal</span>
                                                {orderSortColumn === 'client' ? (
                                                    orderSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleOrderSort('document')}
                                            title="Ordenar por Modalidad Documental y Pago"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 1rem', width: '16%', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>Documento & Pago</span>
                                                {orderSortColumn === 'document' ? (
                                                    orderSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleOrderSort('total')}
                                            title="Ordenar por Total Facturado"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 1rem', width: '14%', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Facturación & Carga</span>
                                                {orderSortColumn === 'total' ? (
                                                    orderSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleOrderSort('margin')}
                                            title="Ordenar por Utilidad / Margen"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 1rem', width: '13%', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Rentabilidad BI</span>
                                                {orderSortColumn === 'margin' ? (
                                                    orderSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 1rem', width: '7%', textAlign: 'center', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                            Acción
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedFilteredOrders.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '3.5rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                                No se encontraron pedidos para los filtros aplicados.
                                            </td>
                                        </tr>
                                    ) : (
                                        sortedFilteredOrders.map((ord) => (
                                            <tr
                                                key={ord.id}
                                                style={{
                                                    borderBottom: '1px solid #F1F5F9',
                                                    backgroundColor: ord.hasEqualValueAlert ? '#FEF2F2' : (ord.hasMultipleOrdersAlert ? '#FAF5FF' : 'white'),
                                                    transition: 'background-color 0.15s ease'
                                                }}
                                            >
                                                {/* 1. Consecutivo & Zona */}
                                                <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top' }}>
                                                    <div style={{ fontWeight: '800', color: THEME.colors.primary, fontFamily: 'monospace', fontSize: '0.90rem', letterSpacing: '0.02em' }}>
                                                        {ord.friendlyId || ord.sequenceId}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        <span style={{ fontWeight: '600' }}>#{ord.sequenceId}</span>
                                                        <span>•</span>
                                                        <span style={{ backgroundColor: '#F1F5F9', color: '#475569', padding: '1px 5px', borderRadius: '4px', fontWeight: '600', fontSize: '0.70rem' }}>
                                                            {ord.zone}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* 2. Cliente & Sucursal */}
                                                <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top' }}>
                                                    <div style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.88rem' }}>
                                                        {ord.branchName}
                                                    </div>
                                                    {ord.parentName && (
                                                        <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '2px', fontWeight: '500' }}>
                                                            🏢 {ord.parentName}
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '2px' }}>
                                                        {ord.address}
                                                    </div>
                                                </td>

                                                {/* 3. Documento & Pago */}
                                                <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top' }}>
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        <span style={{
                                                            fontSize: '0.72rem',
                                                            fontWeight: '800',
                                                            padding: '2px 7px',
                                                            borderRadius: '4px',
                                                            backgroundColor: ord.documentType === 'Factura Electrónica' ? '#EFF6FF' : '#FEF3C7',
                                                            color: ord.documentType === 'Factura Electrónica' ? '#1D4ED8' : '#B45309'
                                                        }}>
                                                            {ord.documentType === 'Factura Electrónica' ? 'FE' : 'REM'}
                                                        </span>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary }}>
                                                            {ord.paymentMethod}
                                                        </span>
                                                    </div>
                                                    <div style={{ marginTop: '4px' }}>
                                                        <span style={{
                                                            fontSize: '0.70rem',
                                                            padding: '2px 6px',
                                                            borderRadius: '4px',
                                                            fontWeight: '700',
                                                            backgroundColor: ord.status === 'Entregado' ? '#DCFCE7' : '#F1F5F9',
                                                            color: ord.status === 'Entregado' ? '#15803D' : '#475569'
                                                        }}>
                                                            {ord.status || 'Confirmado'}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* 4. Facturación & Carga */}
                                                <td style={{ padding: '0.85rem 1rem', textAlign: 'right', verticalAlign: 'top' }}>
                                                    <div style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.92rem' }}>
                                                        {formatMoney(ord.total)}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '2px', fontWeight: '600' }}>
                                                        ⚖️ {ord.totalWeightKg.toFixed(1)} Kg
                                                    </div>
                                                </td>

                                                {/* 5. Rentabilidad BI */}
                                                <td style={{ padding: '0.85rem 1rem', textAlign: 'right', verticalAlign: 'top' }}>
                                                    <div style={{ fontWeight: '800', color: ord.grossProfit >= 0 ? '#0D7A57' : '#DC2626', fontSize: '0.88rem' }}>
                                                        {formatMoney(ord.grossProfit)}
                                                    </div>
                                                    <div style={{ fontSize: '0.74rem', fontWeight: '700', color: ord.marginPct >= 20 ? '#0D7A57' : '#D97706', marginTop: '2px' }}>
                                                        {ord.marginPct.toFixed(1)}% margen
                                                    </div>
                                                </td>

                                                {/* 6. Acción */}
                                                <td style={{ padding: '0.85rem 1rem', textAlign: 'center', verticalAlign: 'middle' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                        {ord.hasEqualValueAlert && (
                                                            <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '0.64rem', fontWeight: '800', backgroundColor: '#FEE2E2', color: '#B91C1C' }}>
                                                                Duplicado
                                                            </span>
                                                        )}
                                                        {ord.hasMultipleOrdersAlert && !ord.hasEqualValueAlert && (
                                                            <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '0.64rem', fontWeight: '800', backgroundColor: '#F3E8FF', color: '#7E22CE' }}>
                                                                Multipedido
                                                            </span>
                                                        )}
                                                        <a
                                                            href={\`/admin/orders/contingency-print?mode=remissions&orderId=\${ord.id}\`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{
                                                                color: THEME.colors.primary,
                                                                padding: '5px 10px',
                                                                borderRadius: '6px',
                                                                backgroundColor: THEME.colors.primaryLight,
                                                                fontSize: '0.74rem',
                                                                fontWeight: '700',
                                                                textDecoration: 'none',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '3px',
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                        >
                                                            Verificar <ChevronRight size={13} />
                                                        </a>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* VISTA 2: VENTAS POR PRODUCTO (CONSOLIDADO) */}
                    ` + currentProductsTable;

const newMonitorContent = monitorContent.substring(0, startClient) + clientsTableHtml;

fs.writeFileSync(monitorPath, newMonitorContent, 'utf8');
console.log('Successfully written clean monitor with both View 1 and View 2!');
