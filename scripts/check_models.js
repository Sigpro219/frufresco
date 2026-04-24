const fs = require('fs');
const path = require('path');

async function checkModels() {
    // Load .env.local manually
    const envPath = path.join(process.cwd(), '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const env = {};
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            env[match[1].trim()] = match[2].trim();
        }
    });

    const API_KEY = env.GOOGLE_GENERATIVE_AI_API_KEY;
    
    console.log("Checking models for key:", API_KEY.substring(0, 10) + "...");

    const versions = ['v1', 'v1beta'];
    
    for (const v of versions) {
        console.log(`\n--- Testing ${v} ---`);
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/${v}/models?key=${API_KEY}`);
            const data = await res.json();
            if (data.models) {
                console.log(`✅ ${v} success! Available models:`);
                data.models.forEach(m => console.log(` - ${m.name}`));
            } else {
                console.log(`❌ ${v} failed:`, JSON.stringify(data));
            }
        } catch (e) {
            console.log(`❌ ${v} error:`, e.message);
        }
    }
}

checkModels();
