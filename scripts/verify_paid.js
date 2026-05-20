try {
    require('dotenv').config({ path: '.env.local' });
} catch (e) {}

const { GoogleGenerativeAI } = require("@google/generative-ai");

async function verifyPaidKey() {
    const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!API_KEY) {
        console.error("❌ ERROR: GOOGLE_GENERATIVE_AI_API_KEY no definida en .env.local");
        return;
    }
    const genAI = new GoogleGenerativeAI(API_KEY);
    
    console.log("--- PROBANDO LLAVE DE PAGO CON GEMINI ---");
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent("Di 'Sistema FruFresco Activo'");
        const response = await result.response;
        console.log("✅ RESPUESTA IA:", response.text());
    } catch (e) {
        console.log("❌ ERROR:", e.message);
    }
}

verifyPaidKey();
