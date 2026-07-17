const projectPath = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco';
const { Client } = require(`${projectPath}/node_modules/pg`);

async function testConnection() {
    const project = 'csqurhdykbalvlnpowcz';
    const dbPass = encodeURIComponent('Frufresco2026*'); // URL encode the password to handle special characters!
    
    // List of all Supabase regions
    const regions = [
        { prov: 'aws-0', name: 'us-east-1' },
        { prov: 'aws-0', name: 'us-east-2' },
        { prov: 'aws-0', name: 'us-west-1' },
        { prov: 'aws-0', name: 'us-west-2' },
        { prov: 'aws-0', name: 'ca-central-1' },
        { prov: 'aws-0', name: 'sa-east-1' },
        { prov: 'aws-0', name: 'eu-west-1' },
        { prov: 'aws-0', name: 'eu-west-2' },
        { prov: 'aws-0', name: 'eu-west-3' },
        { prov: 'aws-0', name: 'eu-central-1' },
        { prov: 'aws-0', name: 'eu-north-1' },
        { prov: 'aws-0', name: 'ap-northeast-1' },
        { prov: 'aws-0', name: 'ap-northeast-2' },
        { prov: 'aws-0', name: 'ap-northeast-3' },
        { prov: 'aws-0', name: 'ap-southeast-1' },
        { prov: 'aws-0', name: 'ap-southeast-2' },
        { prov: 'aws-0', name: 'ap-south-1' },
        { prov: 'aws-0', name: 'me-central-1' },
        { prov: 'aws-0', name: 'af-south-1' },
        // GCP regions
        { prov: 'gcp-0', name: 'us-east4' },
        { prov: 'gcp-0', name: 'us-central1' },
        { prov: 'gcp-0', name: 'europe-west3' },
        { prov: 'gcp-0', name: 'europe-west2' },
        { prov: 'gcp-0', name: 'asia-northeast1' },
        { prov: 'gcp-0', name: 'asia-southeast1' },
        { prov: 'gcp-0', name: 'southamerica-east1' }
    ];
    
    const dns = require('dns').promises;
    
    for (const r of regions) {
        const host = `${r.prov}-${r.name}.pooler.supabase.com`;
        const connectionString = `postgresql://postgres.${project}:${dbPass}@${host}:6543/postgres?sslmode=disable`;
        
        // Resolve host to check if it has DNS
        try {
            await dns.lookup(host);
        } catch (e) {
            continue; // Host does not exist, skip
        }
        
        console.log(`📡 Trying ${host}...`);
        const client = new Client({ 
            connectionString,
            connectionTimeoutMillis: 3000
        });
        
        try {
            await client.connect();
            console.log(`✅ SUCCESS! Found active database region: ${r.prov}-${r.name}`);
            await client.end();
            return;
        } catch (e) {
            console.log(`❌ ${r.name}: ${e.message}`);
        }
    }
    console.log('Tested all Supabase pooler regions, none succeeded.');
}

testConnection();
