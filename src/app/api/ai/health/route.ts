import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      status: 'error',
      code: 'KEY_MISSING',
      message: 'No se ha configurado la clave de API de Gemini.'
    }, { status: 200 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent('ping');
    result.response.text();

    return NextResponse.json({
      ok: true,
      status: 'healthy',
      model: 'gemini-2.5-flash',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    const errMsg = error?.message || '';
    let code = 'AI_ERROR';
    let userMessage = 'El servicio de IA presentó una interrupción temporal.';

    if (errMsg.includes('429') || errMsg.includes('Quota exceeded') || errMsg.includes('Too Many Requests')) {
      code = 'QUOTA_EXCEEDED';
      userMessage = 'Límite de cuota alcanzado en la API de Google Gemini.';
    } else if (errMsg.includes('503') || errMsg.includes('Service Unavailable') || errMsg.includes('high demand')) {
      code = 'SERVICE_UNAVAILABLE';
      userMessage = 'Google Gemini está experimentando alta demanda momentánea.';
    } else if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid')) {
      code = 'INVALID_KEY';
      userMessage = 'La clave de API de Google Gemini no es válida.';
    }

    return NextResponse.json({
      ok: false,
      status: 'degraded',
      code,
      message: userMessage,
      details: errMsg.slice(0, 200),
      timestamp: new Date().toISOString()
    }, { status: 200 });
  }
}
