
const fetch = require('node-fetch');

async function syncAll() {
    try {
        const response = await fetch('http://localhost:3001/api/fleet/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                selectedIds: [
                    'da6c3dfe-dad9-49eb-877f-1481dab5d883', // Showcase
                    'b6c5875c-a271-4722-a5da-7fe5db64612c'  // Tenant 1
                ] 
            })
        });
        const result = await response.json();
        console.log('Sync Results:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('Sync Error:', err);
    }
}

syncAll();
