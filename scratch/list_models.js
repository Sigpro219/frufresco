require('dotenv').config({ path: '.env.local' });
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

const req = require('https').request({
  hostname: 'generativelanguage.googleapis.com',
  path: `/v1beta/models?key=${apiKey}`,
  method: 'GET'
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      if (parsed.models) {
        const geminiModels = parsed.models
          .map(m => m.name)
          .filter(n => n.includes('gemini'));
        console.log(geminiModels);
      } else {
        console.log(parsed);
      }
    } catch(e) {
      console.error("Parse error:", body);
    }
  });
});

req.on('error', console.error);
req.end();
