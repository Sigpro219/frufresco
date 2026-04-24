const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listPaidModels() {
    const API_KEY = "AIzaSyAyEecFLG76siiuaoAb722VGc-URrpPe4o";
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.log("❌ ERROR:", e.message);
    }
}

listPaidModels();
