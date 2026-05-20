const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: '.env.local' });

async function main() {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    
    try {
        console.log('Fetching models...');
        // The SDK doesn't expose listModels directly on genAI easily in all versions, 
        // let's do a direct fetch to the endpoint with the API key to see the raw API response.
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        console.log('Response Status:', response.status);
        if (data.models) {
            console.log('Available Models:');
            data.models.forEach(m => console.log(`- ${m.name}`));
        } else {
            console.log('Raw Response:', JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error('Error listing models:', e);
    }
}

main();
