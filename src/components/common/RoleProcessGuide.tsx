'use client';

import React, { useState } from 'react';
import { 
    BookOpen, HelpCircle, X, CheckCircle2, AlertTriangle, 
    Camera, Clock, ShieldCheck, ArrowRight, Truck, Building2, 
    Layers, AlertCircle, FileSpreadsheet
} from 'lucide-react';
import { THEME } from '@/lib/adminTheme';

export type SystemRoleType = 
    | 'b2b_client' 
    | 'driver' 
    | 'customer_service_agent' 
    | 'quality_auditor';

interface RoleProcessGuideProps {
    role: SystemRoleType;
    sectionTitle?: string;
    compact?: boolean;
}

interface GuideContent {
    roleTitle: string;
    badgeText: string;
    purpose: string;
    steps: { title: string; instruction: string; tip?: string }[];
    criteria: { good: string[]; bad: string[] };
    sla: string;
    differentialRule?: { title: string; explanation: string };
}

const GUIDES_BY_ROLE: Record<SystemRoleType, GuideContent> = {
    b2b_client: {
        roleTitle: 'Cliente B2B / Restaurante / Institucional',
        badgeText: 'Procedimiento de Radicación de Novedades',
        purpose: 'Garantizar la reposición de producto o compensación contable (Nota Crédito) antes del cierre de facturación diario, reportando cualquier anomalía de calidad o faltante.',
        steps: [
            {
                title: '1. Verificación en Recepción',
                instruction: 'Pesa y revisa el producto en el momento de la descarga junto al transportador de FruFresco.',
                tip: 'Anota cualquier inconformidad en el albarán físico y no recibas producto en mal estado.'
            },
            {
                title: '2. Toma de Evidencia Fotográfica',
                instruction: 'Toma 1 a 3 fotos claras: 1) Vista general del producto en su canastilla/empaque, 2) Corte transversal si el daño es interno (ej. corazón negro), 3) Foto de la etiqueta si aplica.',
                tip: 'Evita fotos oscuras o borrosas, ya que son indispensables para sustentar el cobro al productor de campo.'
            },
            {
                title: '3. Radicación en el Portal',
                instruction: 'Selecciona el pedido en tu historial, pulsa "Reportar Novedad", escoge el producto afectado y digita la cantidad exacta devuelta.',
                tip: 'Especifica claramente si fue una avería de calidad o si el producto no coincide con tu orden de compra.'
            }
        ],
        criteria: {
            good: [
                'Fotos con buena iluminación donde se aprecia el defecto.',
                'Corte de fruta para evidenciar vicios internos.',
                'Reporte dentro de las primeras 4 horas tras la entrega.'
            ],
            bad: [
                'Reportes tardíos (>24 horas) donde el producto sufrió deterioro en la cocina del cliente.',
                'Fotos sin mostrar el producto afectado o de bolsas cerradas.',
                'Rechazos por cambios repentinos de menú ajenos a la calidad del fruto.'
            ]
        },
        sla: 'Máximo 4 horas post-entrega para radicar. Respuesta y compensación garantizada en menos de 60 minutos hábiles.'
    },

    driver: {
        roleTitle: 'Conductor / Transportista de Última Milla',
        badgeText: 'Protocolo de Rechazos y Devoluciones en Sitio',
        purpose: 'Registrar con precisión las novedades que se presentan durante la entrega física, evitando pérdidas de canastillas y asegurando que el cliente solo firme por lo recibido.',
        steps: [
            {
                title: '1. Validación de Cantidades con el Ecónomo',
                instruction: 'Acompaña el pesaje de canastillas y valida la conformidad del cliente antes de solicitar la firma digital.',
                tip: 'Si el cliente rechaza parte del producto, no discutas: abre de inmediato el módulo de entrega en la App.'
            },
            {
                title: '2. Registro de Novedad a Nivel de Producto',
                instruction: 'En la pantalla de entrega, ubica el producto afectado e ingresa la cantidad devuelta y el motivo.',
                tip: 'Toma la fotografía del producto devuelto directamente con la cámara del celular.'
            },
            {
                title: '3. Poka-Yoke Anti-Ping-Pong en Reposiciones',
                instruction: 'Si el pedido que estás entregando es una REPOSICIÓN previa y el cliente vuelve a rechazar producto, infórmale que el saldo restante NO se reprogramará de nuevo, sino que se abonará a su factura mediante Nota Crédito automática.',
                tip: 'Reingresa la fruta devuelta al furgón para su retorno a bodega al final de la ruta.'
            }
        ],
        criteria: {
            good: [
                'Capturar la novedad inmediatamente en el punto de entrega.',
                'Foto clara de la fruta rechazada sobre la canastilla.',
                'Firma del cliente en el resumen de entrega ajustada.'
            ],
            bad: [
                'Reportar la novedad horas después de haber abandonado el restaurante.',
                'Dejar producto regalado o tirado sin sustento fotográfico.',
                'Prometer al cliente nuevas reprogramaciones sin autorización de la central.'
            ]
        },
        sla: 'Registro inmediato antes de cerrar la parada de entrega en el GPS.'
    },

    customer_service_agent: {
        roleTitle: 'Agente de Atención al Cliente / Posventa',
        badgeText: 'Manual Operativo de Resolución de PQRs (4 Opciones)',
        purpose: 'Evaluar con imparcialidad técnica cada reclamo, aplicar el concepto de compensación adecuado y retroalimentar a Bodega, Compras o Ventas para eliminar causas raíz.',
        steps: [
            {
                title: '1. Triaje de Evidencia e Inspección',
                instruction: 'Revisa las fotos en el carrusel y contrasta la cantidad reclamada contra la cantidad vendida original.',
                tip: 'Usa los atajos 1, 2, 3, 4 para cambiar la opción de resolución y Ctrl+Enter para resolver.'
            },
            {
                title: '2. Selección de Concepto de Resolución',
                instruction: 'Aplica una de las 4 opciones según el acuerdo comercial:',
                tip: 'Opción 1: Entregado Conforme | Opción 2: Reprogramar Reposición (D+1) | Opción 3: Nota Crédito | Opción 4: Cerrar con cantidad real (Ajuste Factura inmediato).'
            },
            {
                title: '3. Asignación del Responsable Imputable (RCA)',
                instruction: 'Identifica quién causó la falla: Proveedor (Campo), Bodega (FIFO/Frío), Picking (Alistamiento), Transporte (Trato/Ruta), Comercial (Montaje erróneo) o Cliente.',
                tip: 'Aplica la regla de oro: ¿El pedido decía lo que bodega empacó? Si sí, la culpa es de Montaje (Comercial).'
            }
        ],
        criteria: {
            good: [
                'Revisión minuciosa antes de reprogramar para no duplicar fletes.',
                'Asignación justa de responsabilidad con notas técnicas claras.',
                'Resolución en menos de 2 horas hábiles tras la radicación.'
            ],
            bad: [
                'Reprogramar el 100% de la orden cuando el cliente solo reclamó un producto.',
                'Cerrar casos como "Opción 1" cuando hay fotos evidentes de fruta podrida.',
                'Culpar a bodega cuando el asesor comercial montó un SKU equivocado en la orden.'
            ]
        },
        differentialRule: {
            title: '⚖️ Diagnóstico Diferencial: ¿Error de Montaje o Error de Picking?',
            explanation: 'Contrasta la orden original de compra (WhatsApp/Portal) contra el albarán impreso de bodega:\n• Si el albarán decía "Tomate Chonto" y bodega empacó "Tomate Chonto", pero el cliente había pedido "Tomate Larga Vida": Falla 100% de MONTAJE (Comercial).\n• Si el albarán decía "Tomate Larga Vida" y bodega empacó "Tomate Chonto": Falla 100% de PICKING (Bodega).'
        },
        sla: 'SLA de resolución comercial: Menos de 60 minutos hábiles.'
    },

    quality_auditor: {
        roleTitle: 'Auditor de Calidad / Gerente de Operaciones',
        badgeText: 'Gobierno de Causa Raíz & Excelencia Operativa Lean',
        purpose: 'Monitorear la salud operativa del flujo de valor, eliminar desperdicios (Muda), auditar el Costo de No Calidad (CoQ) y retroalimentar a Compras para penalizar proveedores deficientes.',
        steps: [
            {
                title: '1. Monitoreo de KPIs de Clase Mundial (HUD)',
                instruction: 'Audita diariamente: % FTR/OTIF (Meta >98%), Costo de No Calidad (CoQ <1.2% de venta) y Tasa de Ping-Pong (<2%).',
                tip: 'Si FTR cae a zona roja (<95%), activa de inmediato el análisis 5 Porqués en la categoría crítica.'
            },
            {
                title: '2. Análisis de Pareto 80/20 & Ishikawa 6M',
                instruction: 'Focaliza los recursos en el 20% de las causas que originan el 80% de las pérdidas financieras.',
                tip: 'Revisa la Matriz de Imputabilidad para auditar si las pérdidas están concentradas en Proveedores o en Errores de Montaje Comercial.'
            },
            {
                title: '3. Cierre de Ciclo con Compras & Ventas',
                instruction: 'Emite informe de penalización a proveedores con más de 3% de rechazo y coordina capacitaciones para asesores comerciales con alta tasa de error de captura.',
                tip: 'Exporta el soporte de fotos para respaldar la aplicación de Notas Débito en compras.'
            }
        ],
        criteria: {
            good: [
                'Toma de decisiones basada en datos empíricos y no en suposiciones.',
                'Auditoría cruzada periódica entre albaranes y facturas.',
                'Retroalimentación constructiva hacia la cuadrilla de alistamiento y choferes.'
            ],
            bad: [
                'Ignorar reclamos recurrentes de un mismo proveedor o SKU.',
                'Permitir que las quejas queden sin asignación de responsable imputable.',
                'Asumir el costo de fletes de reposición sin auditar el índice de ping-pong.'
            ]
        },
        sla: 'Revisión ejecutiva semanal de tendencias de calidad y cierre de mermas.'
    }
};

export default function RoleProcessGuide({ role, sectionTitle, compact = false }: RoleProcessGuideProps) {
    const [isOpen, setIsOpen] = useState(false);
    const guide = GUIDES_BY_ROLE[role] || GUIDES_BY_ROLE.b2b_client;

    return (
        <>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                title="Abrir Guía del Proceso e Instrucciones de Rol"
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: '700',
                    fontSize: compact ? '0.72rem' : '0.8rem',
                    padding: compact ? '4px 10px' : '6px 14px',
                    borderRadius: '10px',
                    backgroundColor: compact ? '#EAEFEA' : '#DCFCE7',
                    color: '#0D7A57',
                    border: '1px solid #BBF7D0',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
            >
                <BookOpen size={14} color="#0D7A57" />
                <span>{sectionTitle || 'Guía del Proceso'}</span>
                <span style={{ 
                    fontSize: '0.62rem', 
                    padding: '2px 5px', 
                    borderRadius: '4px', 
                    backgroundColor: '#0D7A57', 
                    color: 'white', 
                    fontFamily: 'monospace',
                    fontWeight: '800'
                }}>
                    SOP
                </span>
            </button>

            {/* Slide-over / Modal */}
            {isOpen && (
                <div 
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 99999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                        backgroundColor: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(6px)'
                    }}
                    onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
                >
                    <div 
                        style={{
                            backgroundColor: 'white',
                            borderRadius: '20px',
                            maxWidth: '640px',
                            width: '100%',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
                            border: '1px solid #E2E8F0',
                            overflow: 'hidden',
                            color: '#1E293B'
                        }}
                        role="dialog"
                        aria-modal="true"
                    >
                        {/* Header */}
                        <div style={{
                            background: 'linear-gradient(135deg, #0A4D36 0%, #0D7A57 60%, #1E293B 100%)',
                            color: 'white',
                            padding: '1.25rem 1.5rem',
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '1rem'
                        }}>
                            <div>
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '2px 8px',
                                    borderRadius: '9999px',
                                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                                    color: '#A7F3D0',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    marginBottom: '6px'
                                }}>
                                    <ShieldCheck size={12} />
                                    {guide.badgeText}
                                </div>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: '900', margin: 0, color: 'white', letterSpacing: '-0.02em' }}>
                                    {guide.roleTitle}
                                </h3>
                                <p style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.78rem', margin: '4px 0 0 0', lineHeight: '1.4' }}>
                                    {guide.purpose}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                style={{
                                    color: 'white',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    border: 'none',
                                    padding: '6px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                aria-label="Cerrar guía"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Content Body */}
                        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1, fontSize: '0.8rem', lineHeight: '1.5' }}>
                            
                            {/* Differential Rule Alert if applicable */}
                            {guide.differentialRule && (
                                <div style={{
                                    backgroundColor: '#FFFBEB',
                                    borderLeft: '4px solid #F59E0B',
                                    borderRadius: '0 12px 12px 0',
                                    padding: '12px 16px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#92400E', fontWeight: '900', fontSize: '0.85rem', marginBottom: '4px' }}>
                                        <AlertTriangle size={16} color="#D97706" />
                                        {guide.differentialRule.title}
                                    </div>
                                    <p style={{ color: '#B45309', whiteSpace: 'pre-line', fontSize: '0.75rem', fontWeight: '500', margin: 0, lineHeight: '1.5' }}>
                                        {guide.differentialRule.explanation}
                                    </p>
                                </div>
                            )}

                            {/* Step-by-Step SOP */}
                            <div>
                                <h4 style={{ fontSize: '0.72rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Layers size={14} color="#0D7A57" />
                                    Paso a Paso del Procedimiento Estándar (SOP)
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {guide.steps.map((st, idx) => (
                                        <div key={idx} style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 14px' }}>
                                            <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.82rem', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#0D7A57', color: 'white', fontSize: '0.68rem', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {idx + 1}
                                                </span>
                                                {st.title}
                                            </div>
                                            <p style={{ color: '#475569', fontSize: '0.75rem', margin: 0, paddingLeft: '28px', lineHeight: '1.4' }}>
                                                {st.instruction}
                                            </p>
                                            {st.tip && (
                                                <div style={{ marginTop: '6px', paddingLeft: '28px', fontSize: '0.7rem', color: '#065F46', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontWeight: '800', textTransform: 'uppercase', fontSize: '0.62rem', backgroundColor: '#D1FAE5', color: '#065F46', padding: '2px 6px', borderRadius: '4px' }}>
                                                        Regla Clave:
                                                    </span>
                                                    {st.tip}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Good vs Bad Criteria */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '12px 14px' }}>
                                    <h5 style={{ fontWeight: '900', color: '#166534', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 8px 0' }}>
                                        <CheckCircle2 size={14} color="#16A34A" />
                                        Prácticas Conformes
                                    </h5>
                                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.72rem', color: '#14532D', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {guide.criteria.good.map((item, i) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </div>

                                <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '12px 14px' }}>
                                    <h5 style={{ fontWeight: '900', color: '#991B1B', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 8px 0' }}>
                                        <AlertCircle size={14} color="#DC2626" />
                                        Prácticas No Conformes
                                    </h5>
                                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.72rem', color: '#7F1D1D', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {guide.criteria.bad.map((item, i) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* SLA Box */}
                            <div style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '12px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'white', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0D7A57' }}>
                                    <Clock size={16} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B' }}>
                                        Compromiso de Nivel de Servicio (SLA)
                                    </div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#1E293B', marginTop: '1px' }}>
                                        {guide.sla}
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* Footer */}
                        <div style={{ backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#64748B' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
                                <ShieldCheck size={14} color="#0D7A57" />
                                Sistema de Gestión de Calidad FruFresco (Lean 6M)
                            </span>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                style={{
                                    padding: '6px 18px',
                                    borderRadius: '8px',
                                    backgroundColor: '#0D7A57',
                                    color: 'white',
                                    fontWeight: '800',
                                    fontSize: '0.75rem',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
