'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Mic, MicOff, Minimize2, RotateCcw, Send, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface OrdersAiCopilotProps {
  targetDate: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SpeechRecognitionResultItem {
  transcript?: string;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultItem>>;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((evt: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface WindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

const QUICK_PROMPTS = [
  'Auditoría de cierre: ¿qué se voló o quedó en día equivocado?',
  '¿Qué clientes habituales ya están vencidos por pedir?',
  '¿Hay discrepancias entre el texto del correo y la fecha guardada?',
  '¿Cuándo entró el último correo y qué borradores faltan por aprobar?',
];

export default function OrdersAiCopilot({ targetDate }: OrdersAiCopilotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, error, isOpen]);

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? inputValue).trim();
    if (!text || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    if (!overrideText) setInputValue('');
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error('Sesión expirada. Recarga la página.');
      }

      const res = await fetch('/api/orders/copilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: nextMessages,
          targetDate,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Error consultando Copiloto');
      }

      setMessages([...nextMessages, { role: 'assistant', content: json.reply }]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error de conexión con Copiloto');
    } finally {
      setLoading(false);
    }
  };

  const toggleMic = () => {
    if (typeof window === 'undefined') return;
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const w = window as WindowWithSpeech;
    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRec) {
      setError('Tu navegador no soporta dictado por voz nativo.');
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'es-CO';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (evt: SpeechRecognitionEventLike) => {
      const transcript = Array.from(evt.results)
        .map(r => r[0]?.transcript || '')
        .join(' ')
        .trim();
      setInputValue(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      inputRef.current?.focus();
    };
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          zIndex: 60,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          borderRadius: '999px',
          backgroundColor: '#0F172A',
          color: '#FFFFFF',
          border: '1px solid #334155',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)',
          cursor: 'pointer',
          fontSize: '0.82rem',
          fontWeight: 700,
        }}
        title="Copiloto IA de Pedidos y Correos (Ciclo Cerrado)"
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '999px',
            backgroundColor: '#10B981',
          }}
        />
        <Bot size={16} />
        <span>Copiloto Pedidos</span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        zIndex: 60,
        width: 'min(420px, 94vw)',
        height: 'min(540px, 78vh)',
        backgroundColor: '#FFFFFF',
        border: '1px solid #CBD5E1',
        borderRadius: '14px',
        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.22)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: '#0F172A',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bot size={17} color="#34D399" />
          <div>
            <div style={{ fontSize: '0.84rem', fontWeight: 800 }}>Copiloto Pedidos &amp; Correos</div>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={11} color="#34D399" /> Ciclo Cerrado · Corte {targetDate}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            style={{
              background: 'transparent',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#CBD5E1',
              padding: '4px',
              cursor: 'pointer',
            }}
            title="Reiniciar conversación"
          >
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            style={{
              background: 'transparent',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#CBD5E1',
              padding: '4px',
              cursor: 'pointer',
            }}
            title="Minimizar"
          >
            <Minimize2 size={13} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#F8FAFC' }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.4 }}>
              Consulta en tiempo real sobre pedidos en Supabase, bandeja de correos (48h) y anomalías de frecuencia para <strong>{targetDate}</strong>.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
              {QUICK_PROMPTS.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  style={{
                    textAlign: 'left',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#0F172A',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              padding: '8px 11px',
              borderRadius: '10px',
              backgroundColor: m.role === 'user' ? '#0D7A57' : '#FFFFFF',
              color: m.role === 'user' ? '#FFFFFF' : '#0F172A',
              border: m.role === 'user' ? 'none' : '1px solid #E2E8F0',
              fontSize: '0.8rem',
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
            }}
          >
            {m.content}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#475569' }}>
            <Loader2 size={14} className="animate-spin" /> Auditando Supabase...
          </div>
        )}

        {error && (
          <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#FEF2F2', color: '#B91C1C', fontSize: '0.76rem', fontWeight: 600 }}>
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <form
        onSubmit={e => {
          e.preventDefault();
          sendMessage();
        }}
        style={{
          padding: '8px 10px',
          borderTop: '1px solid #E2E8F0',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <button
          type="button"
          onClick={toggleMic}
          style={{
            padding: '7px',
            borderRadius: '8px',
            border: '1px solid #CBD5E1',
            backgroundColor: listening ? '#FEE2E2' : '#F8FAFC',
            color: listening ? '#DC2626' : '#475569',
            cursor: 'pointer',
          }}
          title={listening ? 'Detener dictado' : 'Dictar pregunta (es-CO)'}
        >
          {listening ? <MicOff size={15} /> : <Mic size={15} />}
        </button>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder="Pregunta por #pedido, producto, acuerdo o correo..."
          style={{
            flex: 1,
            padding: '7px 10px',
            borderRadius: '8px',
            border: '1px solid #CBD5E1',
            fontSize: '0.8rem',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={loading || !inputValue.trim()}
          style={{
            padding: '7px 10px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: loading || !inputValue.trim() ? '#94A3B8' : '#0D7A57',
            color: '#FFFFFF',
            cursor: loading || !inputValue.trim() ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
