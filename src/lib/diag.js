try {
    require('dotenv').config({ path: '.env.local' });
} catch (e) {}

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

async function check() {
    if (!API_KEY) {
        console.error("❌ ERROR: GOOGLE_GENERATIVE_AI_API_KEY no definida en el entorno.");
        return;
    }
    console.log("--- PROBANDO V1 ---");
    try {
        const r1 = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${API_KEY}`);
        const d1 = await r1.json();
        if (d1.models) d1.models.forEach(m => console.log(m.name));
        else console.log("V1 falló:", d1);
    } catch(e) { console.log("V1 error", e); }

    console.log("\n--- PROBANDO V1BETA ---");
    try {
        const r2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const d2 = await r2.json();
        if (d2.models) d2.models.forEach(m => console.log(m.name));
        else console.log("V1BETA falló:", d2);
    } catch(e) { console.log("V1BETA error", e); }
}

check();
