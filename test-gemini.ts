import { GoogleGenerativeAI } from "@google/generative-ai"; 
async function run() { 
  try { 
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!); 
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" }); 
    const res = await model.generateContent("Hola"); 
    console.log(res.response.text()); 
  } catch (e) { 
    console.error(e); 
  } 
} 
run();
