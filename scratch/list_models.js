const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: '.env.local' });

async function listModels() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
        // We use a different way to list models if available, or just try to hit a generic endpoint
        console.log('Fetching available models for your API Key...');
        
        // The SDK doesn't have a direct 'listModels' in the main client sometimes, 
        // but we can try to use the fetch API to the Discovery endpoint
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`);
        const data = await resp.json();
        
        if (data.models) {
            console.log('Available Models:');
            data.models.forEach(m => console.log(`- ${m.name}`));
        } else {
            console.log('Full Response:', JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('Error listing models:', err.message);
    }
}

listModels();
