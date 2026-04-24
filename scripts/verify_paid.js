const { GoogleGenerativeAI } = require("@google/generative-ai");

async function verifyPaidKey() {
    const API_KEY = "AIzaSyAyEecFLG76siiuaoAb722VGc-URrpPe4o";
    const genAI = new GoogleGenerativeAI(API_KEY);
    
    console.log("--- PROBANDO LLAVE DE PAGO CON GEMINI 3 ---");
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
        const result = await model.generateContent("Di 'Sistema FruFresco Activo'");
        const response = await result.response;
        console.log("✅ RESPUESTA IA:", response.text());
    } catch (e) {
        console.log("❌ ERROR:", e.message);
    }
}

verifyPaidKey();
