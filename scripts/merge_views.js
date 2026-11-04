const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoPath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Projects\\frufresco';
const monitorPath = path.join(repoPath, 'src\\components\\CommercialDailyMonitorModule.tsx');
let currentContent = fs.readFileSync(monitorPath, 'utf8');

// 1. Get clean client view from git 896365b1
const gitClean = execSync('git show 896365b1:src/components/CommercialDailyMonitorModule.tsx', {
    cwd: repoPath,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
});
const gitLines = gitClean.split(/\r?\n/);
const clientIdx = gitLines.findIndex(l => l.includes("activeView === 'clients' && ("));
const prodIdx = gitLines.findIndex(l => l.includes("activeView === 'products' && ("));

// Extract original clients view
let origClientsView = gitLines.slice(clientIdx, prodIdx).join('\n');

// 2. Upgrade the clients view:
// Replace filteredOrders.length with sortedFilteredOrders.length
origClientsView = origClientsView.replace(/filteredOrders\.length/g, 'sortedFilteredOrders.length');
// Replace filteredOrders.map with sortedFilteredOrders.map
origClientsView = origClientsView.replace(/filteredOrders\.map/g, 'sortedFilteredOrders.map');

// Upgrade the thead in clients view to have sticky docking & column sorters
const newClientThead = `                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.85rem', textAlign: 'left' }}>
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
                                </thead>`;

// Replace table header in origClientsView:
const oldTheadRegex = /<table[^>]*>[\s\S]*?<\/thead>/;
origClientsView = origClientsView.replace(oldTheadRegex, newClientThead);

// Also set overflow: 'visible' and borderTop: 'none' on container:
origClientsView = origClientsView.replace("overflowX: 'auto'", "overflow: 'visible',\n                            borderTop: 'none'");

// 3. Now in currentContent:
// Find where `{/* VISTA 1: VENTAS POR CLIENTE */}` starts, and `{/* VISTA 3: PRODUCTO POR CLIENTE (DRILL-DOWN) */}` starts
const v1Marker = "{/* VISTA 1: VENTAS POR CLIENTE */}";
const v3Marker = "{/* VISTA 3: PRODUCTO POR CLIENTE (DRILL-DOWN) */}";

const startV1 = currentContent.indexOf(v1Marker);
const startV3 = currentContent.indexOf(v3Marker);

if (startV1 === -1 || startV3 === -1) {
    console.error('Markers not found!');
    process.exit(1);
}

// Extract current products table (which was placed inside activeView === 'clients')
let currentProductsBlock = currentContent.substring(startV1, startV3);

// Convert `{activeView === 'clients' && (` to `{activeView === 'products' && (` in products block
currentProductsBlock = currentProductsBlock.replace(v1Marker, "{/* VISTA 2: VENTAS POR PRODUCTO (CONSOLIDADO) */}");
currentProductsBlock = currentProductsBlock.replace("{activeView === 'clients' && (", "{activeView === 'products' && (");

// Combine View 1 and View 2
const combinedViews = `                    ${origClientsView.trim()}

${currentProductsBlock.trim()}

                    `;

const finalContent = currentContent.substring(0, startV1) + combinedViews + currentContent.substring(startV3);

fs.writeFileSync(monitorPath, finalContent, 'utf8');
console.log('Successfully merged View 1 and View 2 in CommercialDailyMonitorModule.tsx!');
