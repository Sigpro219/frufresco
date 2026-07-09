const https = require('https');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

function fetchGemini(model, prompt) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const data = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        const duration = Date.now() - start;
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ model, success: true, duration, statusCode: res.statusCode });
        } else {
          resolve({ model, success: false, duration, statusCode: res.statusCode, error: body });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

async function run() {
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
  const prompt = 'Return a JSON with {"hello": "world"}';
  
  console.log("Testing Gemini models latency and availability...");
  for (const model of models) {
    try {
      const res = await fetchGemini(model, prompt);
      console.log(`Model: ${res.model} | Success: ${res.success} | Status: ${res.statusCode} | Duration: ${res.duration}ms`);
      if (!res.success) {
        console.log(`   Error: ${res.error.substring(0, 200)}`);
      }
    } catch (e) {
      console.log(`Model: ${model} | Exception: ${e.message}`);
    }
  }
}

run();
