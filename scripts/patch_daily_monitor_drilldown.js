const fs = require('fs');
const file = 'src/components/CommercialDailyMonitorModule.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldDrilldown = `        dayOrders.forEach(ord => {
            const match = ord.items.find(it => it.productId === selectedDrilldownProductId);
            if (match) {
                rows.push({
                    orderSequenceId: ord.sequenceId,
                    orderId: ord.id,
                    clientName: ord.clientName,
                    zone: ord.zone,
                    quantity: match.quantity,
                    unit: match.unit,
                    unitPrice: match.unitPrice,
                    unitCost: match.unitCost,
                    totalSales: match.totalItemSales,
                    profit: match.itemProfit,
                    marginPct: match.itemMarginPct
                });
            }
        });

        return rows.sort((a, b) => b.quantity - a.quantity);
    }, [dayOrders, selectedDrilldownProductId]);`;

const newDrilldown = `        dayOrders.forEach(ord => {
            const matches = ord.items.filter(it => it.productId === selectedDrilldownProductId);
            matches.forEach(match => {
                rows.push({
                    orderSequenceId: ord.sequenceId,
                    orderId: ord.id,
                    clientName: ord.branchName || ord.clientName,
                    zone: ord.zone,
                    quantity: match.quantity,
                    unit: match.unit,
                    unitPrice: match.unitPrice,
                    unitCost: match.unitCost,
                    totalSales: match.totalItemSales,
                    profit: match.itemProfit,
                    marginPct: match.itemMarginPct
                });
            });
        });

        const term = searchTerm.trim().toLowerCase();
        return rows.filter(r => {
            if (!term) return true;
            return r.clientName.toLowerCase().includes(term) ||
                r.zone.toLowerCase().includes(term) ||
                r.orderSequenceId.toString().toLowerCase().includes(term);
        }).sort((a, b) => b.quantity - a.quantity);
    }, [dayOrders, selectedDrilldownProductId, searchTerm]);`;

if (content.includes(oldDrilldown)) {
    content = content.replace(oldDrilldown, newDrilldown);
    console.log('Replaced drilldown (LF)');
} else if (content.includes(oldDrilldown.replace(/\n/g, '\r\n'))) {
    content = content.replace(oldDrilldown.replace(/\n/g, '\r\n'), newDrilldown.replace(/\n/g, '\r\n'));
    console.log('Replaced drilldown (CRLF)');
} else {
    console.error('Could not find oldDrilldown');
    process.exit(1);
}

// Also update input placeholder
const oldPlaceholder = `placeholder={activeView === 'clients' ? 'Buscar cliente, pedido o zona...' : 'Buscar producto o SKU...'}`;
const newPlaceholder = `placeholder={activeView === 'clients' ? 'Buscar cliente, pedido o zona...' : activeView === 'products' ? 'Buscar producto o SKU...' : 'Buscar cliente, pedido o zona...'}`;

if (content.includes(oldPlaceholder)) {
    content = content.replace(oldPlaceholder, newPlaceholder);
    console.log('Replaced placeholder (LF)');
} else if (content.includes(oldPlaceholder.replace(/\n/g, '\r\n'))) {
    content = content.replace(oldPlaceholder.replace(/\n/g, '\r\n'), newPlaceholder.replace(/\n/g, '\r\n'));
    console.log('Replaced placeholder (CRLF)');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated CommercialDailyMonitorModule.tsx');
