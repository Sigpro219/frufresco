import { GoogleGenerativeAI } from "@google/generative-ai";

async function checkModels() {
    const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!API_KEY) {
        console.error("❌ No API KEY found in ENV");
        return;
    }

    console.log("🔍 Investigando modelos disponibles para tu API KEY...");
    
    try {
        // Probamos con v1
        const res = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${API_KEY}`);
        const data = await res.json();
        
        if (data.models) {
            console.log("✅ Modelos encontrados en V1:");
            data.models.forEach((m: any) => console.log(`   - ${m.name}`));
        } else {
            console.log("❌ No se listaron modelos en V1. Respuesta:", JSON.stringify(data));
        }

        // Probamos con v1beta por si acaso
        const resBeta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const dataBeta = await resBeta.json();
        if (dataBeta.models) {
            console.log("✅ Modelos encontrados en V1BETA:");
            dataBeta.models.forEach((m: any) => console.log(`   - ${m.name}`));
        }
    } catch (err) {
        console.error("❌ Error durante el diagnóstico:", err);
    }
}

checkModels();
