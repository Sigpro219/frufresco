import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyStaffBearer } from '@/lib/auth/verifyStaffBearer';
import { buildOrdersCopilotContext } from '@/lib/orders/ordersCopilotContextBuilder';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export interface CopilotInputMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GeminiHistoryItem {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

/**
 * Sanitizes chat history for Gemini `startChat({ history })`:
 * - Locates the last non-empty `user` message as `lastUserMsg`.
 * - Drops leading `model` turns so history always starts with `user`.
 * - Merges consecutive identical roles (e.g. orphaned `user` turns after client errors).
 * - Ensures history ends with `model` (or is empty) before `chat.sendMessage(lastUserMsg)`.
 */
export function sanitizeGeminiHistory(messages: CopilotInputMessage[]): {
  history: GeminiHistoryItem[];
  lastUserMsg: string;
} {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && messages[i].content.trim().length > 0) {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx === -1) {
    return { history: [], lastUserMsg: '' };
  }

  const lastUserMsg = messages[lastUserIdx].content.trim();
  const prior = messages
    .slice(0, lastUserIdx)
    .filter(m => m.content.trim().length > 0)
    .slice(-10);

  const collapsed: GeminiHistoryItem[] = [];
  for (const m of prior) {
    const geminiRole: 'user' | 'model' = m.role === 'assistant' ? 'model' : 'user';
    const text = m.content.trim();
    if (collapsed.length > 0 && collapsed[collapsed.length - 1].role === geminiRole) {
      collapsed[collapsed.length - 1].parts[0].text += `\n${text}`;
    } else {
      collapsed.push({ role: geminiRole, parts: [{ text }] });
    }
  }

  while (collapsed.length > 0 && collapsed[0].role !== 'user') {
    collapsed.shift();
  }
  if (collapsed.length > 0 && collapsed[collapsed.length - 1].role === 'user') {
    collapsed.pop();
  }

  return { history: collapsed, lastUserMsg };
}

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

    const body = (await req.json()) as { messages?: unknown; targetDate?: unknown };
    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
    const messages: CopilotInputMessage[] = rawMessages
      .filter(
        (m): m is CopilotInputMessage =>
          Boolean(m && typeof m === 'object' && 'content' in m && 'role' in m)
      )
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || ''),
      }));
    const targetDate = typeof body?.targetDate === 'string' ? body.targetDate : undefined;

    const { history, lastUserMsg } = sanitizeGeminiHistory(messages);
    if (!lastUserMsg) {
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

    const systemPrompt = `Eres el Copiloto Operativo de Pedidos, Correos y Acuerdos de FruFresco (Ciclo Cerrado, Solo Lectura).
REGLAS ESTRICTAS:
1. Tu ÚNICA fuente de verdad es el SNAPSHOT OPERATIVO DE SUPABASE adjunto abajo. Jamás inventes números de pedido, fechas, precios, correos ni clientes que no aparezcan en el snapshot.
2. En Bandeja de Entrada Email distingue SIEMPRE con exactitud entre HOY, AYER y 48H, separando: Legalizados (approved), Pendientes por legalizar (pending) y Descartados/Rechazados (rejected). NUNCA sumes rejected como legalizados.
3. Prioriza reportar primero alertas críticas: [DISCREPANCIA_FECHA], [DUPLICADO_POSIBLE], [CAIDA_ANORMAL], [BORRADOR_PENDIENTE], [FALTA_POR_PEDIR_VENCIDO] (ordenado por impacto COP), [ACUERDO_VENCIDO_CRITICO] (>30d), [ENTREGA_POST_VENCIMIENTO] e ítems en $0. Distingue [EN_VENTANA] y [VENCIDO_GRACIA <=30d] con claridad.
4. Si te preguntan por un cliente, pedido, OC o precio (Acuerdo / General Institucional / Clientes Hogar) que no aparece en el snapshot, dilo explícitamente sin adivinar.
5. Cita siempre los identificadores exactos (#sequence_id, #accounting_id para productos, fecha YYYY-MM-DD, estado, OC, asunto de correo). NUNCA uses la sigla "SKU" ni menciones "base_price".
6. Responde en español conciso, directo y ejecutivo (viñetas cortas, sin relleno). Si se pide redactar recordatorio para un cliente faltante, entrégalo listo para copiar en WhatsApp.

${ctx.promptText}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    });

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastUserMsg);
    const reply = result.response.text();

    return NextResponse.json({
      success: true,
      reply,
      stats: ctx.stats,
      targetDate: ctx.targetDate,
      generatedAtBogota: ctx.generatedAtBogota,
      lastDraftReceivedAt: ctx.lastDraftReceivedAt,
      lastDraftReceivedAtBogota: ctx.lastDraftReceivedAtBogota,
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : 'Error en Copiloto de Pedidos';
    console.error('[POST /api/orders/copilot] error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
