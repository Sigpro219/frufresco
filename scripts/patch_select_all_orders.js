const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../src/app/admin/orders/loading/page.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

// 1. Patch toggleSelectAll and toggleSelectOrder
const oldToggleSelectBlock = `    const toggleSelectAll = () => {
        // Excluir pedidos express extemporáneos de la selección masiva de cadena logística estándar
        const launchableOrders = filteredOrders.filter(o => {
            const isSameDay = o.is_same_day || o.logistics_data?.is_same_day || o.admin_notes?.includes('SAME-DAY');
            return o.isComplete && o.status === 'pending_approval' && !isSameDay;
        });
        if (launchableOrders.length === 0) return;
        if (selectedOrders.size === launchableOrders.length) {
            setSelectedOrders(new Set());
        } else {
            setSelectedOrders(new Set(launchableOrders.map(o => o.id)));
        }
    };

    const toggleSelectOrder = (id: string) => {
        const order = orders.find(o => o.id === id);
        // Prevent selecting orders already processed into logistics
        if (order && order.status !== 'pending_approval') return;`;

const newToggleSelectBlock = `    const toggleSelectAll = () => {
        // Seleccionar el 100% de los pedidos pendientes por procesar de la vista activa (incluyendo extemporáneos y excepciones B2B)
        const launchableOrders = filteredOrders.filter(o => o.isComplete && ['pending_approval', 'pending', 'recibido'].includes(o.status));
        if (launchableOrders.length === 0) return;
        if (selectedOrders.size === launchableOrders.length) {
            setSelectedOrders(new Set());
        } else {
            setSelectedOrders(new Set(launchableOrders.map(o => o.id)));
        }
    };

    const toggleSelectOrder = (id: string) => {
        const order = orders.find(o => o.id === id);
        // Prevent selecting orders already processed into logistics
        if (order && !['pending_approval', 'pending', 'recibido'].includes(order.status)) return;`;

const normalize = str => str.replace(/\r\n/g, '\n');
content = normalize(content);

if (content.includes(normalize(oldToggleSelectBlock))) {
    content = content.replace(normalize(oldToggleSelectBlock), normalize(newToggleSelectBlock));
    console.log('toggleSelectAll & toggleSelectOrder patched successfully!');
} else {
    console.error('oldToggleSelectBlock not found!');
}

// 2. Patch the header th master checkbox filter
const oldHeaderTh = "const launchableOrders = filteredOrders.filter(o => o.isComplete && o.status === 'pending_approval');";
const newHeaderTh = "const launchableOrders = filteredOrders.filter(o => o.isComplete && ['pending_approval', 'pending', 'recibido'].includes(o.status));";

if (content.includes(oldHeaderTh)) {
    content = content.replace(oldHeaderTh, newHeaderTh);
    console.log('Header th patched successfully!');
}

// 3. Patch the row checkbox condition in desktop table
const oldRowCheck = "{order.status === 'pending_approval' ? (\n                                                            <input \n                                                                type=\"checkbox\" \n                                                                checked={selectedOrders.has(order.id)}";
const newRowCheck = "{['pending_approval', 'pending', 'recibido'].includes(order.status) ? (\n                                                            <input \n                                                                type=\"checkbox\" \n                                                                checked={selectedOrders.has(order.id)}";

if (content.includes(oldRowCheck)) {
    content = content.replace(oldRowCheck, newRowCheck);
    console.log('Desktop row checkbox patched successfully!');
}

// 4. Patch gallery card checkbox condition
const oldGalleryCheck = "{order.status === 'pending_approval' ? (\n                <div \n                    onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}";
const newGalleryCheck = "{['pending_approval', 'pending', 'recibido'].includes(order.status) ? (\n                <div \n                    onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}";

if (content.includes(oldGalleryCheck)) {
    content = content.replace(oldGalleryCheck, newGalleryCheck);
    console.log('Gallery card checkbox patched successfully!');
}

fs.writeFileSync(targetPath, content, 'utf8');
console.log('All patches written to page.tsx!');
