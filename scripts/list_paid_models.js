try {
    require('dotenv').config({ path: '.env.local' });
} catch (e) {}

const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listPaidModels() {
    const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!API_KEY) {
        console.error("❌ ERROR: GOOGLE_GENERATIVE_AI_API_KEY no definida en .env.local");
        return;
    }
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.log("❌ ERROR:", e.message);
    }
}

listPaidModels();
