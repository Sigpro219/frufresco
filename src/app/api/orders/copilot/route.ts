import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyStaffBearer } from '@/lib/auth/verifyStaffBearer';
import { buildOrdersCopilotContext } from '@/lib/orders/ordersCopilotContextBuilder';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase admin environment variables are missing');
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const auth = await verifyStaffBearer(req, supabaseAdmin);
    if (auth.ok === false) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const targetDate = typeof body?.targetDate === 'string' ? body.targetDate : undefined;

    const lastUserMsg = [...messages].reverse().find((m: any) => m?.role === 'user')?.content || '';
    if (!lastUserMsg.trim()) {
      return NextResponse.json({ success: false, error: 'Mensaje requerido' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Gemini API Key no configurada' }, { status: 500 });
    }

    const ctx = await buildOrdersCopilotContext({
      supabaseAdmin,
      targetDate,
      focusQuery: lastUserMsg,
    });

    const systemPrompt = `Eres el Copiloto Operativo de Pedidos y Correos de FruFresco (Ciclo Cerrado, Solo Lectura).
REGLAS ESTRICTAS:
1. Tu ÚNICA fuente de verdad es el SNAPSHOT OPERATIVO DE SUPABASE adjunto abajo. Jamás inventes números de pedido, fechas, correos ni clientes que no aparezcan en el snapshot.
2. Si te preguntan por un cliente o pedido que no aparece en el snapshot, dilo explícitamente sin adivinar.
3. Cita siempre los identificadores exactos (#sequence_id, fecha YYYY-MM-DD, estado, asunto de correo) para que el operador pueda actuar de inmediato.
4. Responde en español conciso, directo y ejecutivo (viñetas cortas, sin relleno).

${ctx.promptText}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 900,
      },
    });

    const history = messages.slice(-6, -1).map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '') }],
    }));

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastUserMsg);
    const reply = result.response.text();

    return NextResponse.json({
      success: true,
      reply,
      stats: ctx.stats,
      targetDate: ctx.targetDate,
      generatedAtBogota: ctx.generatedAtBogota,
    });
  } catch (err: any) {
    console.error('[POST /api/orders/copilot] error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error en Copiloto de Pedidos' },
      { status: 500 }
    );
  }
}
