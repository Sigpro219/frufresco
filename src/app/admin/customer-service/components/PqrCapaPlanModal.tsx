'use client';

import React, { useState, useEffect } from 'react';
import { 
    X, ShieldAlert, CheckCircle2, AlertTriangle, Clock, 
    Sparkles, ArrowRight, User, Calendar, Save, Trash2,
    Layers, Target, Wrench, HelpCircle
} from 'lucide-react';
import { THEME, formatMoney } from '@/lib/adminTheme';
import { DefectCategoryL1 } from '@/lib/rcaTaxonomy';

export interface CapaPlan {
    id: string;
    title: string;
    categoryL1: string;
    subtypeL2?: string;
    responsibleArea: 'proveedor' | 'bodega' | 'picking' | 'transporte' | 'comercial' | 'cliente';
    targetEntityName?: string;
    occurrencesCount: number;
    financialImpactCOP: number;
    // 5 Whys
    why1: string;
    why2: string;
    why3: string;
    why4: string;
    why5: string;
    // Actions
    containmentAction: string;
    pokaYokeAction: string;
    assignedTo: string;
    targetDate: string;
    status: 'diagnosing' | 'implementing' | 'verifying_15d' | 'effective_closed' | 'ineffective';
    verificationNotes?: string;
    createdAt: string;
    updatedAt: string;
}

interface PqrCapaPlanModalProps {
    isOpen: boolean;
    onClose: () => void;
    plan: CapaPlan | null;
    onSave: (savedPlan: CapaPlan) => void;
    onDelete?: (planId: string) => void;
    customTaxonomy: DefectCategoryL1[];
    prefillData?: {
        categoryL1?: string;
        subtypeL2?: string;
        responsibleArea?: any;
        occurrencesCount?: number;
        financialImpactCOP?: number;
    };
}

export default function PqrCapaPlanModal({
    isOpen,
    onClose,
    plan,
    onSave,
    onDelete,
    customTaxonomy,
    prefillData
}: PqrCapaPlanModalProps) {
    const [title, setTitle] = useState('');
    const [categoryL1, setCategoryL1] = useState('dano_mecanico');
    const [subtypeL2, setSubtypeL2] = useState('');
    const [responsibleArea, setResponsibleArea] = useState<'proveedor' | 'bodega' | 'picking' | 'transporte' | 'comercial' | 'cliente'>('transporte');
    const [targetEntityName, setTargetEntityName] = useState('');
    const [occurrencesCount, setOccurrencesCount] = useState(0);
    const [financialImpactCOP, setFinancialImpactCOP] = useState(0);

    const [why1, setWhy1] = useState('');
    const [why2, setWhy2] = useState('');
    const [why3, setWhy3] = useState('');
    const [why4, setWhy4] = useState('');
    const [why5, setWhy5] = useState('');

    const [containmentAction, setContainmentAction] = useState('');
    const [pokaYokeAction, setPokaYokeAction] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [targetDate, setTargetDate] = useState('');
    const [status, setStatus] = useState<CapaPlan['status']>('diagnosing');
    const [verificationNotes, setVerificationNotes] = useState('');

    useEffect(() => {
        if (!isOpen) return;

        if (plan) {
            setTitle(plan.title || '');
            setCategoryL1(plan.categoryL1 || 'dano_mecanico');
            setSubtypeL2(plan.subtypeL2 || '');
            setResponsibleArea(plan.responsibleArea || 'transporte');
            setTargetEntityName(plan.targetEntityName || '');
            setOccurrencesCount(plan.occurrencesCount || 0);
            setFinancialImpactCOP(plan.financialImpactCOP || 0);
            setWhy1(plan.why1 || '');
            setWhy2(plan.why2 || '');
            setWhy3(plan.why3 || '');
            setWhy4(plan.why4 || '');
            setWhy5(plan.why5 || '');
            setContainmentAction(plan.containmentAction || '');
            setPokaYokeAction(plan.pokaYokeAction || '');
            setAssignedTo(plan.assignedTo || '');
            setTargetDate(plan.targetDate || '');
            setStatus(plan.status || 'diagnosing');
            setVerificationNotes(plan.verificationNotes || '');
        } else {
            const defCat = prefillData?.categoryL1 || 'dano_mecanico';
            const defSub = prefillData?.subtypeL2 || '';
            const defResp = prefillData?.responsibleArea || 'transporte';
            const catObj = customTaxonomy.find(c => c.code === defCat);
            const subObj = catObj?.subtypes.find(s => s.code === defSub);

            setTitle(subObj ? `Plan CAPA: ${subObj.label}` : `Plan de Mejora: ${catObj?.label || 'Calidad'}`);
            setCategoryL1(defCat);
            setSubtypeL2(defSub);
            setResponsibleArea(defResp);
            setTargetEntityName('');
            setOccurrencesCount(prefillData?.occurrencesCount || 0);
            setFinancialImpactCOP(prefillData?.financialImpactCOP || 0);
            setWhy1('');
            setWhy2('');
            setWhy3('');
            setWhy4('');
            setWhy5('');
            setContainmentAction('');
            setPokaYokeAction('');
            setAssignedTo('');
            // Default 15 days ahead
            const future = new Date();
            future.setDate(future.getDate() + 15);
            setTargetDate(future.toISOString().split('T')[0]);
            setStatus('diagnosing');
            setVerificationNotes('');
        }
    }, [isOpen, plan, prefillData, customTaxonomy]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        const now = new Date().toISOString();
        const saved: CapaPlan = {
            id: plan ? plan.id : `capa-${Date.now()}`,
            title: title.trim(),
            categoryL1,
            subtypeL2,
            responsibleArea,
            targetEntityName: targetEntityName.trim() || undefined,
            occurrencesCount: Number(occurrencesCount) || 0,
            financialImpactCOP: Number(financialImpactCOP) || 0,
            why1: why1.trim(),
            why2: why2.trim(),
            why3: why3.trim(),
            why4: why4.trim(),
            why5: why5.trim(),
            containmentAction: containmentAction.trim(),
            pokaYokeAction: pokaYokeAction.trim(),
            assignedTo: assignedTo.trim(),
            targetDate,
            status,
            verificationNotes: verificationNotes.trim(),
            createdAt: plan ? plan.createdAt : now,
            updatedAt: now
        };

        onSave(saved);
        onClose();
    };

    const activeCatObj = customTaxonomy.find(c => c.code === categoryL1);
    const availableSubtypes = activeCatObj?.subtypes || [];

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
        }}>
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '18px',
                width: '100%',
                maxWidth: '900px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid #E2E8F0',
                    backgroundColor: '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            padding: '8px',
                            backgroundColor: '#0D7A57',
                            color: 'white',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Target size={20} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#1A231E', margin: 0 }}>
                                    {plan ? 'Editar Plan de Acción Correctiva (CAPA)' : 'Nuevo Plan de Mejora Continua (CAPA Lean)'}
                                </h2>
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    backgroundColor: status === 'effective_closed' ? '#EAEFEA' : status === 'verifying_15d' ? '#FEF3C7' : '#F1F5F9',
                                    color: status === 'effective_closed' ? '#0D7A57' : status === 'verifying_15d' ? '#92400E' : '#334155',
                                    border: '1px solid #CBD5E1'
                                }}>
                                    {status === 'diagnosing' ? '1. Diagnóstico' : status === 'implementing' ? '2. En Implementación' : status === 'verifying_15d' ? '3. Verificación 15D' : status === 'effective_closed' ? '4. Cerrado Eficaz' : 'Ineficaz'}
                                </span>
                            </div>
                            <p style={{ fontSize: '0.72rem', color: '#64748B', margin: '2px 0 0 0' }}>
                                Metodología 5 Porqués (5 Whys), Acción de Contención Inmediata y Dispositivo Poka-Yoke de Raíz
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#64748B',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '6px'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* 1. General Meta */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', display: 'block', marginBottom: '4px' }}>
                                Título del Plan CAPA *
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="Ej. Eliminación de sobreestiba en furgones norte"
                                required
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8rem',
                                    fontWeight: '600',
                                    color: '#1A231E',
                                    backgroundColor: '#FFFFFF'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', display: 'block', marginBottom: '4px' }}>
                                Estado del Ciclo PDCA
                            </label>
                            <select
                                value={status}
                                onChange={e => setStatus(e.target.value as any)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8rem',
                                    fontWeight: '700',
                                    color: '#1A231E',
                                    backgroundColor: '#FFFFFF'
                                }}
                            >
                                <option value="diagnosing">1. En Diagnóstico (5 Porqués)</option>
                                <option value="implementing">2. En Implementación (Poka-Yoke)</option>
                                <option value="verifying_15d">3. Verificación de Efectividad (15 Días)</option>
                                <option value="effective_closed">4. Cerrado Eficaz (Cero Reincidencias)</option>
                                <option value="ineffective">5. Ineficaz / Requiere Re-análisis</option>
                            </select>
                        </div>
                    </div>

                    {/* 2. Taxonomy & Imputability */}
                    <div style={{ backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                        <div>
                            <label style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', display: 'block', marginBottom: '3px' }}>
                                Macrocausa Pareto (L1)
                            </label>
                            <select
                                value={categoryL1}
                                onChange={e => {
                                    setCategoryL1(e.target.value);
                                    setSubtypeL2('');
                                }}
                                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.75rem', fontWeight: '600' }}
                            >
                                {customTaxonomy.map(cat => (
                                    <option key={cat.code} value={cat.code}>{cat.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', display: 'block', marginBottom: '3px' }}>
                                Subtipo de Falla (L2)
                            </label>
                            <select
                                value={subtypeL2}
                                onChange={e => setSubtypeL2(e.target.value)}
                                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.75rem', fontWeight: '600' }}
                            >
                                <option value="">-- Seleccionar Subtipo --</option>
                                {availableSubtypes.map(sub => (
                                    <option key={sub.code} value={sub.code}>{sub.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', display: 'block', marginBottom: '3px' }}>
                                Área Responsable
                            </label>
                            <select
                                value={responsibleArea}
                                onChange={e => setResponsibleArea(e.target.value as any)}
                                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.75rem', fontWeight: '600' }}
                            >
                                <option value="transporte">Transporte & Rutas</option>
                                <option value="picking">Picking & Báscula</option>
                                <option value="bodega">Bodega & Cavas Frío</option>
                                <option value="proveedor">Proveedor / Campo</option>
                                <option value="comercial">Comercial & Captura</option>
                                <option value="cliente">Cliente / Recepción</option>
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', display: 'block', marginBottom: '3px' }}>
                                Impacto Registrado ($ COP)
                            </label>
                            <input
                                type="number"
                                value={financialImpactCOP}
                                onChange={e => setFinancialImpactCOP(Number(e.target.value))}
                                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.75rem', fontWeight: '700' }}
                            />
                        </div>
                    </div>

                    {/* 3. The 5 Whys (5 Porqués) Root Cause Analysis */}
                    <div style={{ backgroundColor: '#FFFFFF', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                            <HelpCircle size={16} style={{ color: '#0D7A57' }} />
                            <span style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', color: '#1A231E' }}>
                                Análisis de Causa Raíz (Los 5 Porqués - Lean RCA)
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#0D7A57', width: '22px' }}>1.</span>
                                <input
                                    type="text"
                                    value={why1}
                                    onChange={e => setWhy1(e.target.value)}
                                    placeholder="¿Por qué ocurrió el defecto? (Síntoma inicial)..."
                                    style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#0D7A57', width: '22px' }}>2.</span>
                                <input
                                    type="text"
                                    value={why2}
                                    onChange={e => setWhy2(e.target.value)}
                                    placeholder="¿Por qué sucedió lo anterior?..."
                                    style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#0D7A57', width: '22px' }}>3.</span>
                                <input
                                    type="text"
                                    value={why3}
                                    onChange={e => setWhy3(e.target.value)}
                                    placeholder="¿Por qué falló el control?..."
                                    style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#0D7A57', width: '22px' }}>4.</span>
                                <input
                                    type="text"
                                    value={why4}
                                    onChange={e => setWhy4(e.target.value)}
                                    placeholder="¿Por qué el proceso lo permitió?..."
                                    style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#0D7A57', width: '22px' }}>5.</span>
                                <input
                                    type="text"
                                    value={why5}
                                    onChange={e => setWhy5(e.target.value)}
                                    placeholder="¿Por qué es la Causa Raíz Fundamental? (Falla sistémica)..."
                                    style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '2px solid #C4D7C4', backgroundColor: '#F4F7F6', fontSize: '0.78rem', fontWeight: '700' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* 4. Action Plan: Containment vs Poka-Yoke */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                        <div style={{ backgroundColor: '#FEF3C7', padding: '12px', borderRadius: '10px', border: '1px solid #FDE68A' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', color: '#92400E', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                                <AlertTriangle size={14} />
                                Acción de Contención Inmediata (Parche / 24h)
                            </label>
                            <textarea
                                value={containmentAction}
                                onChange={e => setContainmentAction(e.target.value)}
                                placeholder="Ej. Inspección al 100% de canastillas en muelle antes de cargar furgones..."
                                rows={2}
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #FCD34D', fontSize: '0.78rem' }}
                            />
                        </div>

                        <div style={{ backgroundColor: '#EAEFEA', padding: '12px', borderRadius: '10px', border: '1px solid #C4D7C4' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', color: '#0D7A57', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                                <Wrench size={14} />
                                Acción Correctiva Poka-Yoke (A Prueba de Error)
                            </label>
                            <textarea
                                value={pokaYokeAction}
                                onChange={e => setPokaYokeAction(e.target.value)}
                                placeholder="Ej. Instalar barras de tope de altura fija en furgón para impedir estibar > 5 canastillas..."
                                rows={2}
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #A7F3D0', fontSize: '0.78rem', fontWeight: '600' }}
                            />
                        </div>
                    </div>

                    {/* 5. Assignment, Deadlines & Verification */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', display: 'block', marginBottom: '4px' }}>
                                Responsable del Plan *
                            </label>
                            <input
                                type="text"
                                value={assignedTo}
                                onChange={e => setAssignedTo(e.target.value)}
                                placeholder="Ej. Carlos Rodríguez (Jefe Transporte)"
                                required
                                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem', fontWeight: '600' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', display: 'block', marginBottom: '4px' }}>
                                Fecha Límite de Implementación *
                            </label>
                            <input
                                type="date"
                                value={targetDate}
                                onChange={e => setTargetDate(e.target.value)}
                                required
                                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem', fontWeight: '600' }}
                            />
                        </div>

                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', display: 'block', marginBottom: '4px' }}>
                                Notas de Verificación de Eficacia (Auditoría a 15/30 Días)
                            </label>
                            <input
                                type="text"
                                value={verificationNotes}
                                onChange={e => setVerificationNotes(e.target.value)}
                                placeholder="Ej. Verificado en auditoría de ruta: 0 incidencias en 20 despachos posteriores."
                                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem' }}
                            />
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div style={{
                        paddingTop: '1rem',
                        borderTop: '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px'
                    }}>
                        {plan && onDelete ? (
                            <button
                                type="button"
                                onClick={() => {
                                    if (window.confirm('¿Seguro que deseas eliminar este Plan CAPA?')) {
                                        onDelete(plan.id);
                                        onClose();
                                    }
                                }}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    backgroundColor: '#FEF2F2',
                                    color: '#991B1B',
                                    border: '1px solid #FECDD3',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                <Trash2 size={14} />
                                <span>Eliminar Plan</span>
                            </button>
                        ) : <div />}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    padding: '8px 14px',
                                    backgroundColor: 'white',
                                    color: '#475569',
                                    border: '1px solid #CBD5E1',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>

                            <button
                                type="submit"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 18px',
                                    backgroundColor: '#0D7A57',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(13, 122, 87, 0.3)'
                                }}
                            >
                                <Save size={14} />
                                <span>Guardar Plan CAPA</span>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
