const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testGeneration() {
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
    const genAI = new GoogleGenerativeAI(API_KEY);
    
    console.log("--- PROBANDO GENERACIÓN CON GEMINI 3 FLASH ---");
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
        const result = await model.generateContent("Di hola");
        const response = await result.response;
        console.log("✅ ÉXITO FLASH:", response.text());
    } catch (e) {
        console.log("❌ FALLÓ FLASH:", e.message);
    }

    console.log("\n--- PROBANDO GENERACIÓN CON GEMINI 1.5 PRO ---");
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const result = await model.generateContent("Di hola");
        const response = await result.response;
        console.log("✅ ÉXITO PRO:", response.text());
    } catch (e) {
        console.log("❌ FALLÓ PRO:", e.message);
    }
}

testGeneration();
