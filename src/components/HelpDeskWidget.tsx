'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';

// ─── TICKET CATEGORIES ────────────────────────────────────────────────
const CATEGORIES = [
    { value: 'technical',   label: '🔧 Problema técnico' },
    { value: 'permissions', label: '🔐 Solicitud de acceso' },
    { value: 'geocerca',    label: '📍 Modificación de geocerca' },
    { value: 'billing',     label: '💳 Facturación / Pagos' },
    { value: 'general',     label: '💬 Consulta general' },
];

const PRIORITIES = [
    { value: 'low',    label: 'Baja',    color: '#166534' },
    { value: 'normal', label: 'Normal',  color: '#1D4ED8' },
    { value: 'high',   label: 'Alta',    color: '#C2410C' },
    { value: 'urgent', label: 'Urgente', color: '#991B1B' },
];

// ─── WIDGET COMPONENT ─────────────────────────────────────────────────
export default function HelpDeskWidget() {
    const { user, profile } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [submitting, setSubmitting] = useState(false);

    const [form, setForm] = useState({
        subject: '',
        description: '',
        category: 'general',
        priority: 'normal',
    });

    const panelRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Close on outside click (excluding the toggle button itself)
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                panelRef.current && !panelRef.current.contains(target) &&
                buttonRef.current && !buttonRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    // Reset form when closed
    useEffect(() => {
        if (!isOpen) {
            setTimeout(() => {
                setStep('form');
                setForm({ subject: '', description: '', category: 'general', priority: 'normal' });
            }, 300);
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        if (!form.subject.trim()) return;
        setSubmitting(true);
        try {
            const { error } = await supabase.from('support_tickets').insert({
                subject: form.subject.trim(),
                description: form.description.trim(),
                category: form.category,
                priority: form.priority,
                user_id: profile?.id ?? user?.id ?? null,
                user_email: user?.email ?? null,
                user_name: profile?.contact_name || profile?.company_name || null,
                status: 'open',
            });
            if (!error) {
                setStep('success');
            }
        } catch (e) {
            console.warn('HelpDeskWidget submit error:', e);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            {/* FLOATING BUTTON */}
            <button
                ref={buttonRef}
                id="helpdesk-widget-btn"
                onClick={() => setIsOpen(prev => !prev)}
                title="Mesa de Ayuda — Enviar solicitud"
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'rgba(30,41,59,0.82)',
                    backdropFilter: 'blur(8px)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.12)',
                    cursor: 'pointer',
                    zIndex: 8888,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.95rem',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
                    transition: 'all 0.2s ease',
                    opacity: isOpen ? 1 : 0.72,
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = isOpen ? '1' : '0.72'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
                {isOpen ? '✕' : '🎧'}
            </button>

            {/* PANEL */}
            <div
                ref={panelRef}
                style={{
                    position: 'fixed',
                    bottom: '66px',
                    right: '20px',
                    width: '360px',
                    backgroundColor: 'white',
                    borderRadius: '20px',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08)',
                    zIndex: 8889,
                    overflow: 'hidden',
                    opacity: isOpen ? 1 : 0,
                    transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.97)',
                    pointerEvents: isOpen ? 'all' : 'none',
                    transition: 'all 0.25s cubic-bezier(0.34,1.2,0.64,1)',
                }}
            >
                {/* HEADER */}
                <div style={{
                    background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)',
                    padding: '20px 20px 16px 20px',
                    color: 'white',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '1.3rem' }}>🎧</span>
                        <h3 style={{ margin: 0, fontWeight: '900', fontSize: '1rem', letterSpacing: '-0.02em' }}>
                            Mesa de Ayuda
                        </h3>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', fontWeight: '500' }}>
                        Tu solicitud llegará directo al Chief Engineer
                    </p>
                </div>

                {/* BODY */}
                <div style={{ padding: '20px' }}>
                    {step === 'success' ? (
                        // SUCCESS STATE
                        <div style={{ textAlign: 'center', padding: '20px 10px' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>✅</div>
                            <h4 style={{ fontWeight: '900', color: '#111827', margin: '0 0 8px 0', fontSize: '1.1rem' }}>
                                ¡Ticket registrado!
                            </h4>
                            <p style={{ fontSize: '0.8rem', color: '#6B7280', margin: '0 0 20px 0', lineHeight: '1.5' }}>
                                Recibirás respuesta a la brevedad. Puedes hacer seguimiento en tu perfil.
                            </p>
                            <button
                                onClick={() => setIsOpen(false)}
                                style={{
                                    width: '100%', backgroundColor: '#111827', color: 'white',
                                    border: 'none', borderRadius: '12px', padding: '11px',
                                    fontWeight: '900', cursor: 'pointer', fontSize: '0.875rem'
                                }}
                            >
                                Cerrar
                            </button>
                        </div>
                    ) : (
                        // FORM STATE
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Subject */}
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                                    Asunto *
                                </label>
                                <input
                                    value={form.subject}
                                    onChange={e => setForm({ ...form, subject: e.target.value })}
                                    placeholder="Describe brevemente tu solicitud..."
                                    maxLength={120}
                                    style={{
                                        width: '100%', padding: '10px 12px', borderRadius: '10px',
                                        border: '1.5px solid #E2E8F0', fontSize: '0.875rem',
                                        fontFamily: 'inherit', boxSizing: 'border-box',
                                        outline: 'none', transition: 'border-color 0.2s',
                                        color: '#111827', fontWeight: '600'
                                    }}
                                    onFocus={e => (e.currentTarget.style.borderColor = '#94A3B8')}
                                    onBlur={e => (e.currentTarget.style.borderColor = '#E2E8F0')}
                                />
                            </div>

                            {/* Category + Priority row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                                        Categoría
                                    </label>
                                    <select
                                        value={form.category}
                                        onChange={e => setForm({ ...form, category: e.target.value })}
                                        style={{
                                            width: '100%', padding: '9px 10px', borderRadius: '10px',
                                            border: '1.5px solid #E2E8F0', fontSize: '0.8rem',
                                            fontFamily: 'inherit', backgroundColor: 'white',
                                            color: '#111827', fontWeight: '600', cursor: 'pointer'
                                        }}
                                    >
                                        {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                                        Prioridad
                                    </label>
                                    <select
                                        value={form.priority}
                                        onChange={e => setForm({ ...form, priority: e.target.value })}
                                        style={{
                                            width: '100%', padding: '9px 10px', borderRadius: '10px',
                                            border: '1.5px solid #E2E8F0', fontSize: '0.8rem',
                                            fontFamily: 'inherit', backgroundColor: 'white',
                                            color: PRIORITIES.find(p => p.value === form.priority)?.color || '#111827',
                                            fontWeight: '800', cursor: 'pointer'
                                        }}
                                    >
                                        {PRIORITIES.map(p => (
                                            <option key={p.value} value={p.value} style={{ color: p.color }}>{p.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                                    Detalle (opcional)
                                </label>
                                <textarea
                                    value={form.description}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="¿Qué pasó? ¿Cuándo? ¿Qué estabas haciendo?"
                                    rows={3}
                                    style={{
                                        width: '100%', padding: '10px 12px', borderRadius: '10px',
                                        border: '1.5px solid #E2E8F0', fontSize: '0.85rem',
                                        fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box',
                                        outline: 'none', transition: 'border-color 0.2s', color: '#374151'
                                    }}
                                    onFocus={e => (e.currentTarget.style.borderColor = '#94A3B8')}
                                    onBlur={e => (e.currentTarget.style.borderColor = '#E2E8F0')}
                                />
                            </div>

                            {/* Submit button */}
                            <button
                                onClick={handleSubmit}
                                disabled={submitting || !form.subject.trim()}
                                style={{
                                    width: '100%', backgroundColor: form.subject.trim() ? '#111827' : '#E5E7EB',
                                    color: form.subject.trim() ? 'white' : '#9CA3AF',
                                    border: 'none', borderRadius: '12px', padding: '12px',
                                    fontWeight: '900', cursor: form.subject.trim() ? 'pointer' : 'not-allowed',
                                    fontSize: '0.9rem', transition: 'all 0.2s',
                                    boxShadow: form.subject.trim() ? '0 4px 12px rgba(0,0,0,0.15)' : 'none'
                                }}
                            >
                                {submitting ? '📨 Enviando...' : '📨 Enviar Solicitud'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
