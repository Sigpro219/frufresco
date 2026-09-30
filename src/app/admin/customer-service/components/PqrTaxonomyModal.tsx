'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, RotateCcw, Settings, Check } from 'lucide-react';
import {
    DefectCategoryL1,
    DefectSubtype,
    RESPONSIBLE_PARTIES,
    saveStoredTaxonomy,
    resetStoredTaxonomy
} from '@/lib/rcaTaxonomy';

interface PqrTaxonomyModalProps {
    isOpen: boolean;
    onClose: () => void;
    customTaxonomy: DefectCategoryL1[];
    onSaved: (updated: DefectCategoryL1[]) => void;
    showToast: (text: string, type?: 'success' | 'error' | 'warning') => void;
}

export default function PqrTaxonomyModal({
    isOpen,
    onClose,
    customTaxonomy,
    onSaved,
    showToast
}: PqrTaxonomyModalProps) {
    const [editingTaxonomy, setEditingTaxonomy] = useState<DefectCategoryL1[]>([]);
    const [selectedCatIdx, setSelectedCatIdx] = useState(0);

    // New Category Form
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCatCode, setNewCatCode] = useState('');
    const [newCatLabel, setNewCatLabel] = useState('');
    const [newCatDesc, setNewCatDesc] = useState('');

    // New Subtype Form
    const [newSubCode, setNewSubCode] = useState('');
    const [newSubLabel, setNewSubLabel] = useState('');
    const [newSubDesc, setNewSubDesc] = useState('');
    const [newSubResponsible, setNewSubResponsible] = useState<'proveedor' | 'bodega' | 'picking' | 'transporte' | 'comercial' | 'cliente'>('transporte');

    useEffect(() => {
        if (isOpen) {
            setEditingTaxonomy(JSON.parse(JSON.stringify(customTaxonomy)));
            setSelectedCatIdx(0);
            setIsAddingCategory(false);
        }
    }, [isOpen, customTaxonomy]);

    if (!isOpen) return null;

    const currentCat = editingTaxonomy[selectedCatIdx] || editingTaxonomy[0];

    const handleAddCategory = () => {
        if (!newCatLabel.trim()) {
            showToast('Ingresa el nombre de la macrocausa L1.', 'warning');
            return;
        }
        const generatedCode = newCatCode.trim() || newCatLabel.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
        if (editingTaxonomy.some(c => c.code === generatedCode)) {
            showToast('Ya existe una categoría con este código.', 'warning');
            return;
        }

        const newCat: DefectCategoryL1 = {
            code: generatedCode,
            label: newCatLabel.trim(),
            description: newCatDesc.trim() || 'Macrocausa personalizada',
            subtypes: []
        };

        const updated = [...editingTaxonomy, newCat];
        setEditingTaxonomy(updated);
        setSelectedCatIdx(updated.length - 1);
        setIsAddingCategory(false);
        setNewCatCode('');
        setNewCatLabel('');
        setNewCatDesc('');
        showToast('Macrocausa creada con éxito.', 'success');
    };

    const handleDeleteCategory = (idx: number) => {
        if (editingTaxonomy.length <= 1) {
            showToast('Debe existir al menos una macrocausa en la taxonomía.', 'warning');
            return;
        }
        if (window.confirm(`¿Eliminar la categoría "${editingTaxonomy[idx].label}" y todos sus subtipos?`)) {
            const updated = editingTaxonomy.filter((_, i) => i !== idx);
            setEditingTaxonomy(updated);
            setSelectedCatIdx(Math.max(0, idx - 1));
            showToast('Macrocausa eliminada.', 'success');
        }
    };

    const handleAddSubtype = () => {
        if (!newSubLabel.trim()) {
            showToast('Ingresa el nombre del subtipo L2.', 'warning');
            return;
        }
        const generatedCode = newSubCode.trim() || newSubLabel.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
        if (currentCat.subtypes.some(s => s.code === generatedCode)) {
            showToast('Ya existe un subtipo con este código en esta categoría.', 'warning');
            return;
        }

        const newSub: DefectSubtype = {
            code: generatedCode,
            label: newSubLabel.trim(),
            description: newSubDesc.trim() || 'Subtipo técnico personalizado',
            typicalResponsible: newSubResponsible
        };

        const updated = editingTaxonomy.map((cat, i) => {
            if (i === selectedCatIdx) {
                return {
                    ...cat,
                    subtypes: [...cat.subtypes, newSub]
                };
            }
            return cat;
        });

        setEditingTaxonomy(updated);
        setNewSubCode('');
        setNewSubLabel('');
        setNewSubDesc('');
        showToast('Subtipo agregado con éxito.', 'success');
    };

    const handleDeleteSubtype = (subCode: string) => {
        const updated = editingTaxonomy.map((cat, i) => {
            if (i === selectedCatIdx) {
                return {
                    ...cat,
                    subtypes: cat.subtypes.filter(s => s.code !== subCode)
                };
            }
            return cat;
        });
        setEditingTaxonomy(updated);
        showToast('Subtipo eliminado.', 'success');
    };

    const handleSave = () => {
        saveStoredTaxonomy(editingTaxonomy);
        onSaved(editingTaxonomy);
        showToast('Parámetros de taxonomía guardados exitosamente.', 'success');
        onClose();
    };

    const handleReset = () => {
        if (window.confirm('¿Restablecer toda la taxonomía a los valores predeterminados de fábrica de FruFresco?')) {
            const defaults = resetStoredTaxonomy();
            onSaved(defaults);
            showToast('Taxonomía restablecida a los valores de fábrica.', 'success');
            onClose();
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
            boxSizing: 'border-box'
        }}>
            <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: '960px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden',
                boxSizing: 'border-box'
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.5rem',
                    backgroundColor: '#0F172A',
                    color: 'white',
                    borderBottom: '1px solid #1E293B',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            padding: '8px',
                            backgroundColor: 'rgba(16, 185, 129, 0.2)',
                            color: '#34D399',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Settings size={20} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '0.95rem', fontWeight: '800', color: 'white', margin: 0 }}>
                                Parámetros de Taxonomía Técnica RCA
                            </h2>
                            <p style={{ fontSize: '0.72rem', color: '#94A3B8', margin: '2px 0 0 0' }}>
                                Configura las Macrocausas (L1), Subtipos (L2) y Áreas Responsables para la Matriz Lean.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ padding: '6px', color: '#94A3B8', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body Content */}
                <div style={{
                    flex: '1',
                    overflowY: 'auto',
                    padding: '1.25rem 1.5rem',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(260px, 1fr) minmax(360px, 1.4fr)',
                    gap: '24px',
                    boxSizing: 'border-box',
                    minHeight: 0
                }}>
                    {/* Left Column: Categories L1 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.04em' }}>
                                Macrocausas L1 ({editingTaxonomy.length})
                            </span>
                            <button
                                type="button"
                                onClick={() => setIsAddingCategory(true)}
                                style={{ fontSize: '0.72rem', color: '#0D7A57', fontWeight: '700', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                <Plus size={13} />
                                <span>Nueva L1</span>
                            </button>
                        </div>

                        {isAddingCategory && (
                            <div style={{ padding: '12px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '8px', boxSizing: 'border-box', width: '100%' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#065F46' }}>Nueva Macrocausa</span>
                                <input
                                    type="text"
                                    placeholder="Nombre visible (ej: 8. Empaque)"
                                    value={newCatLabel}
                                    onChange={e => setNewCatLabel(e.target.value)}
                                    style={{ width: '100%', boxSizing: 'border-box', minWidth: 0, padding: '7px 10px', fontSize: '0.75rem', border: '1px solid #A7F3D0', borderRadius: '6px', backgroundColor: 'white', outline: 'none' }}
                                />
                                <input
                                    type="text"
                                    placeholder="Código clave (opcional)"
                                    value={newCatCode}
                                    onChange={e => setNewCatCode(e.target.value)}
                                    style={{ width: '100%', boxSizing: 'border-box', minWidth: 0, padding: '7px 10px', fontSize: '0.75rem', border: '1px solid #A7F3D0', borderRadius: '6px', backgroundColor: 'white', outline: 'none' }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', paddingTop: '4px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingCategory(false)}
                                        style={{ padding: '5px 10px', fontSize: '0.7rem', color: '#475569', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: '600' }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleAddCategory}
                                        style={{ padding: '5px 12px', backgroundColor: '#0D7A57', color: 'white', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '700', border: 'none', cursor: 'pointer' }}
                                    >
                                        Crear
                                    </button>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '380px', overflowY: 'auto', boxSizing: 'border-box' }}>
                            {editingTaxonomy.map((cat, idx) => (
                                <div
                                    key={cat.code}
                                    onClick={() => setSelectedCatIdx(idx)}
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        backgroundColor: selectedCatIdx === idx ? '#ECFDF5' : '#F8FAFC',
                                        border: selectedCatIdx === idx ? '1px solid #0D7A57' : '1px solid #E2E8F0',
                                        boxShadow: selectedCatIdx === idx ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
                                        boxSizing: 'border-box',
                                        width: '100%',
                                        gap: '8px'
                                    }}
                                >
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: selectedCatIdx === idx ? '800' : '600', color: selectedCatIdx === idx ? '#065F46' : '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {cat.label}
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{cat.subtypes?.length || 0} subtipos</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteCategory(idx);
                                        }}
                                        style={{ padding: '4px', color: '#94A3B8', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Column: Subtypes L2 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
                        {currentCat && (
                            <>
                                <div>
                                    <span style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0F172A', display: 'block' }}>
                                        {currentCat.label}
                                    </span>
                                    <p style={{ fontSize: '0.72rem', color: '#64748B', margin: '2px 0 0 0' }}>{currentCat.description}</p>
                                </div>

                                {/* Add Subtype Form */}
                                <div style={{
                                    padding: '12px 14px',
                                    backgroundColor: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px',
                                    boxSizing: 'border-box',
                                    width: '100%'
                                }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.04em' }}>
                                        + Agregar Subtipo L2
                                    </span>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.85fr)',
                                        gap: '8px',
                                        width: '100%',
                                        boxSizing: 'border-box'
                                    }}>
                                        <input
                                            type="text"
                                            placeholder="Nombre del subtipo (ej: Golpes en descarga)"
                                            value={newSubLabel}
                                            onChange={e => setNewSubLabel(e.target.value)}
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                minWidth: 0,
                                                padding: '7px 10px',
                                                fontSize: '0.72rem',
                                                backgroundColor: 'white',
                                                border: '1px solid #CBD5E1',
                                                borderRadius: '8px',
                                                outline: 'none'
                                            }}
                                        />
                                        <select
                                            value={newSubResponsible}
                                            onChange={e => setNewSubResponsible(e.target.value as any)}
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                minWidth: 0,
                                                padding: '7px 8px',
                                                fontSize: '0.72rem',
                                                backgroundColor: 'white',
                                                border: '1px solid #CBD5E1',
                                                borderRadius: '8px',
                                                outline: 'none',
                                                cursor: 'pointer',
                                                textOverflow: 'ellipsis',
                                                overflow: 'hidden',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {Object.entries(RESPONSIBLE_PARTIES).map(([k, v]) => (
                                                <option key={k} value={k}>
                                                    Área: {v.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
                                        <input
                                            type="text"
                                            placeholder="Descripción técnica o contexto de falla"
                                            value={newSubDesc}
                                            onChange={e => setNewSubDesc(e.target.value)}
                                            style={{
                                                flex: 1,
                                                minWidth: 0,
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                padding: '7px 10px',
                                                fontSize: '0.72rem',
                                                backgroundColor: 'white',
                                                border: '1px solid #CBD5E1',
                                                borderRadius: '8px',
                                                outline: 'none'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddSubtype}
                                            style={{
                                                padding: '7px 14px',
                                                backgroundColor: '#0F172A',
                                                color: 'white',
                                                borderRadius: '8px',
                                                fontSize: '0.72rem',
                                                fontWeight: '700',
                                                border: 'none',
                                                cursor: 'pointer',
                                                flexShrink: 0,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Plus size={13} />
                                            <span>Agregar</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Subtypes List */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto', boxSizing: 'border-box', width: '100%' }}>
                                    {currentCat.subtypes?.map(sub => (
                                        <div
                                            key={sub.code}
                                            style={{
                                                padding: '10px 12px',
                                                backgroundColor: 'white',
                                                border: '1px solid #E2E8F0',
                                                borderRadius: '10px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '10px',
                                                boxSizing: 'border-box',
                                                width: '100%'
                                            }}
                                        >
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0F172A' }}>{sub.label}</span>
                                                    <span style={{ fontSize: '0.65rem', fontWeight: '800', textTransform: 'uppercase', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                                                        {RESPONSIBLE_PARTIES[sub.typicalResponsible]?.label || sub.typicalResponsible}
                                                    </span>
                                                </div>
                                                <p style={{ fontSize: '0.7rem', color: '#64748B', margin: '2px 0 0 0', wordBreak: 'break-word' }}>{sub.description}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteSubtype(sub.code)}
                                                style={{ padding: '4px', color: '#94A3B8', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                    {(!currentCat.subtypes || currentCat.subtypes.length === 0) && (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.72rem', border: '1px dashed #E2E8F0', borderRadius: '10px' }}>
                                            No hay subtipos registrados en esta macrocausa.
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.5rem',
                    backgroundColor: '#F8FAFC',
                    borderTop: '1px solid #E2E8F0',
                    flexShrink: 0
                }}>
                    <button
                        type="button"
                        onClick={handleReset}
                        style={{
                            padding: '6px 12px',
                            fontSize: '0.72rem',
                            color: '#475569',
                            border: '1px solid #CBD5E1',
                            backgroundColor: 'white',
                            borderRadius: '8px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        <RotateCcw size={12} />
                        <span>Restablecer Fábrica</span>
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ padding: '7px 14px', fontSize: '0.75rem', color: '#334155', backgroundColor: 'transparent', border: 'none', fontWeight: '600', cursor: 'pointer' }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            style={{
                                padding: '8px 18px',
                                backgroundColor: '#0D7A57',
                                color: 'white',
                                borderRadius: '10px',
                                fontSize: '0.75rem',
                                fontWeight: '800',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 2px 6px rgba(13, 122, 87, 0.3)'
                            }}
                        >
                            <Check size={14} />
                            <span>Guardar Parámetros</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
