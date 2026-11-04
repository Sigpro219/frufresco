const fs = require('fs');
const path = require('path');

const filePath = path.join('C:', 'Users', 'German Higuera', 'OneDrive', 'Documentos', 'Projects', 'frufresco', 'src', 'components', 'CommercialDailyMonitorModule.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add accountingId to interface ProductConsolidated
content = content.replace(
    `interface ProductConsolidated {
    productId: string;
    productName: string;
    sku: string;
    category: string;`,
    `interface ProductConsolidated {
    productId: string;
    productName: string;
    sku: string;
    accountingId?: string | number | null;
    category: string;`
);

// 2. Add accountingId to prodAggMap type definition
content = content.replace(
    `                productName: string;
                sku: string;
                category: string;`,
    `                productName: string;
                sku: string;
                accountingId?: string | number | null;
                category: string;`
);

// 3. Populate accountingId in prodAggMap.set
content = content.replace(
    `                        prodAggMap.set(it.productId, {
                            productName: it.productName,
                            sku: it.sku,
                            category: it.category,`,
    `                        prodAggMap.set(it.productId, {
                            productName: it.productName,
                            sku: it.sku,
                            accountingId: it.accountingId,
                            category: it.category,`
);

// 4. Populate accountingId in consolidatedList return
content = content.replace(
    `                return {
                    productId: pId,
                    productName: val.productName,
                    sku: val.sku,
                    category: val.category,`,
    `                return {
                    productId: pId,
                    productName: val.productName,
                    sku: val.sku,
                    accountingId: val.accountingId,
                    category: val.category,`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed CommercialDailyMonitorModule.tsx accountingId types');
