'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  Sparkles,
  Truck,
  ClipboardCheck,
  Trash2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileText,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Search
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { INVENTORY_MOVEMENT_SUBTYPES } from '@/lib/constants';
import PhysicalSheetStagingTable from '@/components/PhysicalSheetStagingTable';
import {
  PhysicalSheetType,
  TargetBalanceColumn,
  CatalogProductOption,
  ReconciledSheetRow,
  RawExtractedSheetRow,
  ArbitrationResolution,
  buildReconciledSheetRows
} from '@/lib/inventory/physical-sheet-parser';

interface PhysicalSheetIngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  balanceDate: string;
  catalog: CatalogProductOption[];
  opsCurrentByProductAndCol: Map<string, { G: number; T: number; Q: number; R: number }>;
  supervisorName: string;
  onSuccess: () => void;
}

export default function PhysicalSheetIngestModal({
  isOpen,
  onClose,
  balanceDate,
  catalog,
  opsCurrentByProductAndCol,
  supervisorName,
  onSuccess
}: PhysicalSheetIngestModalProps) {
  const [sheetType, setSheetType] = useState<PhysicalSheetType>('entrada');
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [activeFileIdx, setActiveFileIdx] = useState<number>(0);
  const [rawText, setRawText] = useState<string>('');
  const [showTextTab, setShowTextTab] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reconciledRows, setReconciledRows] = useState<ReconciledSheetRow[]>([]);
  const [skuSearchFilter, setSkuSearchFilter] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = (selectedList: FileList | null) => {
    if (!selectedList || selectedList.length === 0) return;
    const newFiles = Array.from(selectedList);
    setFiles(prev => [...prev, ...newFiles]);
    setPreviewUrls(prev => [...prev, ...newFiles.map(f => URL.createObjectURL(f))]);
    setErrorMsg(null);
  };

  const handleRemoveFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviewUrls(prev => prev.filter((_, i) => i !== idx));
    if (activeFileIdx >= idx && activeFileIdx > 0) setActiveFileIdx(prev => prev - 1);
  };

  const handleRunExtraction = async () => {
    if (files.length === 0 && !rawText.trim()) {
      setErrorMsg('Selecciona al menos una imagen/PDF de la planilla física o pega texto para analizar.');
      return;
    }
    setIsExtracting(true);
    setErrorMsg(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || '';
      const formData = new FormData();
      formData.append('sheetType', sheetType);
      formData.append('balanceDate', balanceDate);
      if (rawText.trim()) formData.append('text', rawText.trim());
      files.forEach(f => formData.append('files', f));

      const res = await fetch('/api/commercial/inventory/extract-physical-sheet', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No fue posible extraer la planilla física.');

      const allReconciled: ReconciledSheetRow[] = [];
      (data.results || []).forEach((fileRes: { fileName: string; items: RawExtractedSheetRow[] }) => {
        allReconciled.push(
          ...buildReconciledSheetRows(fileRes.items || [], sheetType, fileRes.fileName, catalog, opsCurrentByProductAndCol)
        );
      });
      setReconciledRows(allReconciled);
      if (allReconciled.length === 0) setErrorMsg('No se detectaron renglones con cantidades manuscritas.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error durante la lectura IA');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleRowProductChange = (rowId: string, newProductId: string) => {
    const prod = catalog.find(c => c.id === newProductId) || null;
    setReconciledRows(prev =>
      prev.map(r => {
        if (r.rowId !== rowId) return r;
        const opsVal = prod ? Number(opsCurrentByProductAndCol.get(prod.id)?.[r.targetColumn] || 0) : 0;
        const status = opsVal <= 0.001 ? 'new_entry' : Math.abs(opsVal - r.quantity) <= 0.05 ? 'matched_ops' : 'discrepancy';
        return {
          ...r,
          matchedProductId: prod?.id || null,
          matchedProductName: prod?.name || 'Sin homologar',
          matchedAccountingId: prod?.accounting_id || prod?.sku || 'S/N',
          matchedUnit: prod?.unit_of_measure || 'Kg',
          confidence: prod ? 100 : 0,
          opsCurrentValue: Math.round(opsVal * 100) / 100,
          conciliationStatus: status,
          selected: Boolean(prod?.id) && r.quantity > 0
        };
      })
    );
  };

  const handleRowQtyChange = (rowId: string, newQty: number) => {
    const safeQty = Number.isFinite(newQty) ? Math.max(0, newQty) : 0;
    setReconciledRows(prev =>
      prev.map(r => {
        if (r.rowId !== rowId) return r;
        const status =
          r.opsCurrentValue <= 0.001 ? 'new_entry' : Math.abs(r.opsCurrentValue - safeQty) <= 0.05 ? 'matched_ops' : 'discrepancy';
        return { ...r, quantity: safeQty, conciliationStatus: status };
      })
    );
  };

  const handleRowColChange = (rowId: string, newCol: TargetBalanceColumn) => {
    setReconciledRows(prev =>
      prev.map(r => {
        if (r.rowId !== rowId) return r;
        const opsVal = r.matchedProductId ? Number(opsCurrentByProductAndCol.get(r.matchedProductId)?.[newCol] || 0) : 0;
        const status = opsVal <= 0.001 ? 'new_entry' : Math.abs(opsVal - r.quantity) <= 0.05 ? 'matched_ops' : 'discrepancy';
        return { ...r, targetColumn: newCol, opsCurrentValue: Math.round(opsVal * 100) / 100, conciliationStatus: status };
      })
    );
  };

  const stats = useMemo(() => {
    const active = reconciledRows.filter(r => r.selected && r.matchedProductId);
    return {
      total: reconciledRows.length,
      active: active.length,
      newEntries: active.filter(r => r.conciliationStatus === 'new_entry').length,
      matched: active.filter(r => r.conciliationStatus === 'matched_ops').length,
      discrepancies: active.filter(r => r.conciliationStatus === 'discrepancy').length
    };
  }, [reconciledRows]);

  const handleApproveAndCommit = async () => {
    const rowsToApply = reconciledRows.filter(
      r => r.selected && r.matchedProductId && r.quantity > 0 && r.resolution === 'use_sheet'
    );
    if (rowsToApply.length === 0) {
      setErrorMsg('No hay filas activas con [Usar Papel] para aplicar a la sábana.');
      return;
    }
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const { data: whData } = await supabase.from('warehouses').select('id').limit(1).single();
      const warehouseId = whData?.id || null;

      const grouped = new Map<
        string,
        {
          productId: string;
          targetColumn: TargetBalanceColumn;
          totalQuantity: number;
          weightedCostNumerator: number;
          weightedCostDenominator: number;
          replacesOpsDiscrepancy: boolean;
          suppliers: string[];
          rawDetails: string[];
          files: string[];
        }
      >();

      rowsToApply.forEach(r => {
        if (!r.matchedProductId) return;
        const key = `${r.matchedProductId}__${r.targetColumn}`;
        const existing = grouped.get(key) || {
          productId: r.matchedProductId,
          targetColumn: r.targetColumn,
          totalQuantity: 0,
          weightedCostNumerator: 0,
          weightedCostDenominator: 0,
          replacesOpsDiscrepancy: false,
          suppliers: [],
          rawDetails: [],
          files: []
        };
        existing.totalQuantity = Math.round((existing.totalQuantity + r.quantity) * 100) / 100;
        if (r.conciliationStatus === 'discrepancy' && r.resolution === 'use_sheet') {
          existing.replacesOpsDiscrepancy = true;
        }
        if (r.unitCostPaid && r.unitCostPaid > 0) {
          existing.weightedCostNumerator += r.quantity * r.unitCostPaid;
          existing.weightedCostDenominator += r.quantity;
        }
        if (r.supplierName && !existing.suppliers.includes(r.supplierName)) existing.suppliers.push(r.supplierName);
        existing.rawDetails.push(`${r.rawProductName}: ${r.quantity}${r.sourceNote ? ` (${r.sourceNote})` : ''}`);
        if (!existing.files.includes(r.sourceFileName)) existing.files.push(r.sourceFileName);
        grouped.set(key, existing);
      });

      const startIso = `${balanceDate}T00:00:00.000Z`;
      const endIso = `${balanceDate}T23:59:59.999Z`;
      const timestampIso = `${balanceDate}T12:00:00.000Z`;

      for (const item of grouped.values()) {
        const movType: 'entry' | 'exit' | 'adjustment' =
          item.targetColumn === 'G' ? 'entry' : item.targetColumn === 'T' ? 'adjustment' : 'exit';
        const refType =
          item.targetColumn === 'G'
            ? 'purchase_reception'
            : item.targetColumn === 'Q'
            ? INVENTORY_MOVEMENT_SUBTYPES.WASTE_DAMAGE
            : item.targetColumn === 'R'
            ? INVENTORY_MOVEMENT_SUBTYPES.WASTE_CLEANING
            : INVENTORY_MOVEMENT_SUBTYPES.BLIND_COUNT;
        const signedQty =
          item.targetColumn === 'G' ? item.totalQuantity : item.targetColumn === 'T' ? 0 : -item.totalQuantity;

        const pppCost =
          item.weightedCostDenominator > 0
            ? Math.round((item.weightedCostNumerator / item.weightedCostDenominator) * 100) / 100
            : null;
        const replaceTag = item.replacesOpsDiscrepancy ? ' [CONCILIACION_REEMPLAZO_OPS]' : '';
        const blindMeta =
          item.targetColumn === 'T'
            ? ` [BLIND_COUNT_META: ${JSON.stringify({
                counted_quantity: item.totalQuantity,
                operator: supervisorName,
                origin_source: 'physical_sheet_ocr'
              })}]`
            : '';

        const noteDesc = `[ORIGEN: PHYSICAL_SHEET_OCR - ${supervisorName}]${replaceTag} Col ${item.targetColumn}: ${item.totalQuantity.toFixed(2)} (${item.rawDetails.join(' + ')}) [Archivo: ${item.files.join(', ')}]${blindMeta}`;

        const { data: existingMovs } = await supabase
          .from('inventory_movements')
          .select('id')
          .eq('product_id', item.productId)
          .eq('reference_type', refType)
          .gte('created_at', startIso)
          .lte('created_at', endIso);

        if (existingMovs && existingMovs.length > 0) {
          await supabase
            .from('inventory_movements')
            .update({ quantity: signedQty, type: movType, notes: noteDesc })
            .eq('id', existingMovs[0].id);
          if (existingMovs.length > 1) {
            await supabase.from('inventory_movements').delete().in('id', existingMovs.slice(1).map(x => x.id));
          }
        } else {
          await supabase.from('inventory_movements').insert({
            product_id: item.productId,
            warehouse_id: warehouseId,
            quantity: signedQty,
            type: movType,
            reference_type: refType,
            notes: noteDesc,
            created_at: timestampIso
          });
        }

        if (item.targetColumn === 'G' && pppCost && pppCost > 0) {
          await supabase.from('commercial_cost_matrix').upsert(
            {
              product_id: item.productId,
              manual_cost: pppCost,
              effective_date: balanceDate,
              is_active: true,
              notes: `[PPP PLANILLA MUELLE ${balanceDate}] Prov: ${item.suppliers.join(', ') || 'Corabastos'}`,
              updated_at: new Date().toISOString()
            },
            { onConflict: 'product_id' }
          );
        }
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error guardando en la base de datos.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const filteredCatalog = skuSearchFilter.trim()
    ? catalog.filter(
        c =>
          c.name.toLowerCase().includes(skuSearchFilter.toLowerCase()) ||
          (c.accounting_id && c.accounting_id.toLowerCase().includes(skuSearchFilter.toLowerCase()))
      )
    : catalog;

  const activeFile = files[activeFileIdx];
  const isActivePdf = Boolean(
    activeFile && (activeFile.type === 'application/pdf' || activeFile.name.toLowerCase().endsWith('.pdf'))
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(2, 6, 23, 0.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '1540px', height: '92vh', backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)' }}>
        {/* CABECERA */}
        <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #1E293B', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#020617' }}>
              <Sparkles size={19} strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#F8FAFC' }}>
                  Lector Multimodal de Planillas Físicas de Bodega (IA)
                </h2>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.12rem 0.5rem', borderRadius: '999px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34D399', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <ShieldCheck size={12} /> Arbitraje Anti-Colisión OPS Activo
                </span>
              </div>
              <p style={{ margin: '0.12rem 0 0', fontSize: '0.74rem', color: '#94A3B8' }}>
                Jornada contable destino: <strong style={{ color: '#FBBF24' }}>{balanceDate}</strong>
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: '1px solid #334155', color: '#94A3B8', borderRadius: '8px', padding: '0.35rem', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* PASO 1: SELECTOR DE LAS 3 SUBCARPETAS */}
        <div style={{ padding: '0.65rem 1.25rem', backgroundColor: '#0B1120', borderBottom: '1px solid #1E293B', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.7rem' }}>
          {[
            { id: 'entrada' as PhysicalSheetType, title: '1. Entradas / Recepción Muelle (Entrada/)', subtitle: 'Control de llegada en Kg, proveedores y precios PPP -> Columna G', colBadge: 'Columna G (+)', color: '#10B981', Icon: Truck },
            { id: 'inv_manual' as PhysicalSheetType, title: '2. Conteo Físico Fin de Turno (Inv manual/)', subtitle: 'Planillas de bodega por categorías -> Alimenta Columna T', colBadge: 'Columna T (Físico)', color: '#38BDF8', Icon: ClipboardCheck },
            { id: 'desperdicio' as PhysicalSheetType, title: '3. Formato Desperdicio y Arreglo (Desperdicio/)', subtitle: 'Bifurca Avería a Columna Q (-) y Cáscaras/Descapote a Columna R (-)', colBadge: 'Cols Q y R (-)', color: '#F43F5E', Icon: Trash2 }
          ].map(card => {
            const active = sheetType === card.id;
            const IconComp = card.Icon;
            return (
              <button key={card.id} type="button" onClick={() => { setSheetType(card.id); setReconciledRows([]); }} style={{ textAlign: 'left', padding: '0.6rem 0.85rem', borderRadius: '10px', border: active ? `2px solid ${card.color}` : '1px solid #1E293B', backgroundColor: active ? 'rgba(15, 23, 42, 0.95)' : 'rgba(15, 23, 42, 0.4)', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                <div style={{ padding: '0.4rem', borderRadius: '8px', backgroundColor: active ? `${card.color}22` : '#1E293B', color: active ? card.color : '#64748B' }}>
                  <IconComp size={17} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: active ? '#F8FAFC' : '#CBD5E1' }}>{card.title}</span>
                    <span style={{ fontSize: '0.64rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: `${card.color}22`, color: card.color }}>{card.colBadge}</span>
                  </div>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.7rem', color: '#94A3B8' }}>{card.subtitle}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* CUERPO DIVIDIDO: VISOR + TABLA STAGING */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '440px 1fr', overflow: 'hidden' }}>
          <div style={{ borderRight: '1px solid #1E293B', backgroundColor: '#020617', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '0.6rem 0.85rem', borderBottom: '1px solid #1E293B', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button type="button" onClick={() => setShowTextTab(false)} style={{ padding: '0.28rem 0.6rem', fontSize: '0.72rem', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: !showTextTab ? '#1E293B' : 'transparent', color: !showTextTab ? '#F8FAFC' : '#64748B' }}>
                  Fotos / PDF ({files.length})
                </button>
                <button type="button" onClick={() => setShowTextTab(true)} style={{ padding: '0.28rem 0.6rem', fontSize: '0.72rem', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: showTextTab ? '#1E293B' : 'transparent', color: showTextTab ? '#F8FAFC' : '#64748B' }}>
                  Texto / WhatsApp
                </button>
              </div>
              <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => handleFilesSelected(e.target.files)} />
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: 700, borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#1E293B', color: '#E2E8F0', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <Upload size={13} /> Añadir Hojas
              </button>
            </div>

            {showTextTab ? (
              <div style={{ flex: 1, padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <textarea value={rawText} onChange={e => setRawText(e.target.value)} placeholder="Pega aquí listas de precios, entradas o conteos..." style={{ flex: 1, width: '100%', borderRadius: '8px', backgroundColor: '#0F172A', border: '1px solid #334155', color: '#F8FAFC', padding: '0.75rem', fontSize: '0.8rem', resize: 'none' }} />
              </div>
            ) : files.length === 0 ? (
              <div onClick={() => fileInputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleFilesSelected(e.dataTransfer.files); }} style={{ flex: 1, margin: '0.85rem', border: '2px dashed #334155', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center', cursor: 'pointer', backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
                <Upload size={32} color="#F59E0B" style={{ marginBottom: '0.5rem' }} />
                <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#F1F5F9' }}>Arrastra las fotos o PDF de la planilla física aquí</div>
                <p style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '0.3rem' }}>Soporta múltiples páginas JPG, PNG, WebP o PDF escaneado.</p>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: '0.35rem', padding: '0.4rem 0.7rem', overflowX: 'auto', borderBottom: '1px solid #1E293B', backgroundColor: '#0F172A' }}>
                  {files.map((f, i) => (
                    <div key={`${f.name}-${i}`} onClick={() => { setActiveFileIdx(i); setZoom(1); setRotation(0); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.22rem 0.5rem', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', border: activeFileIdx === i ? '1px solid #F59E0B' : '1px solid #334155', backgroundColor: activeFileIdx === i ? 'rgba(245, 158, 11, 0.15)' : '#020617', color: activeFileIdx === i ? '#FBBF24' : '#94A3B8' }}>
                      <FileText size={11} />
                      <span>Pág {i + 1}</span>
                      <X size={11} onClick={e => { e.stopPropagation(); handleRemoveFile(i); }} style={{ color: '#EF4444' }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.3rem 0.7rem', backgroundColor: '#090D16', borderBottom: '1px solid #1E293B' }}>
                  <span style={{ fontSize: '0.68rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeFile?.name}</span>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button type="button" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} style={{ background: '#1E293B', border: 'none', color: '#CBD5E1', borderRadius: '4px', padding: '0.2rem', cursor: 'pointer' }}><ZoomOut size={13} /></button>
                    <button type="button" onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))} style={{ background: '#1E293B', border: 'none', color: '#CBD5E1', borderRadius: '4px', padding: '0.2rem', cursor: 'pointer' }}><ZoomIn size={13} /></button>
                    <button type="button" onClick={() => setRotation(r => (r + 90) % 360)} style={{ background: '#1E293B', border: 'none', color: '#CBD5E1', borderRadius: '4px', padding: '0.2rem', cursor: 'pointer' }}><RotateCw size={13} /></button>
                  </div>
                </div>
                <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.4rem' }}>
                  {previewUrls[activeFileIdx] && (
                    isActivePdf ? (
                      <iframe src={previewUrls[activeFileIdx]} title="PDF Preview" style={{ width: '100%', height: '100%', border: 'none', borderRadius: '6px' }} />
                    ) : (
                      <img src={previewUrls[activeFileIdx]} alt="Planilla física" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform: `scale(${zoom}) rotate(${rotation}deg)`, transition: 'transform 0.15s ease' }} />
                    )
                  )}
                </div>
              </div>
            )}

            <div style={{ padding: '0.75rem', borderTop: '1px solid #1E293B', backgroundColor: '#0B1120' }}>
              <button type="button" disabled={isExtracting || (files.length === 0 && !rawText.trim())} onClick={handleRunExtraction} style={{ width: '100%', padding: '0.62rem 1rem', borderRadius: '8px', border: 'none', background: isExtracting ? '#334155' : 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', color: '#020617', fontWeight: 800, fontSize: '0.8rem', cursor: isExtracting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}>
                {isExtracting ? <><RefreshCw size={14} className="animate-spin" /><span>Analizando caligrafía y homologando SKUs...</span></> : <><Sparkles size={14} /><span>Procesar Planilla Física con IA ({files.length || 1} doc)</span></>}
              </button>
            </div>
          </div>

          {/* PANEL DERECHO: STAGING */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#0F172A' }}>
            <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #1E293B', backgroundColor: '#090D16', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#E2E8F0' }}>Renglones: <strong>{stats.total}</strong></span>
                <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.45rem', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.14)', color: '#34D399', fontWeight: 700 }}>Nuevos: {stats.newEntries}</span>
                <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.45rem', borderRadius: '6px', backgroundColor: 'rgba(56, 189, 248, 0.14)', color: '#38BDF8', fontWeight: 700 }}>Conciliados OPS: {stats.matched}</span>
                {stats.discrepancies > 0 && <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.45rem', borderRadius: '6px', backgroundColor: 'rgba(245, 158, 11, 0.18)', color: '#FBBF24', fontWeight: 700 }}>Discrepancias OPS: {stats.discrepancies}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Search size={13} color="#64748B" />
                <input type="text" value={skuSearchFilter} onChange={e => setSkuSearchFilter(e.target.value)} placeholder="Filtrar catálogo SKU..." style={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '6px', padding: '0.22rem 0.5rem', fontSize: '0.72rem', color: '#F8FAFC', width: '165px' }} />
              </div>
            </div>

            {errorMsg && (
              <div style={{ margin: '0.65rem 1rem 0', padding: '0.55rem 0.85rem', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', color: '#FCA5A5', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <AlertTriangle size={14} /><span>{errorMsg}</span>
              </div>
            )}

            <div style={{ flex: 1, overflow: 'auto', padding: '0.65rem 1rem' }}>
              <PhysicalSheetStagingTable
                sheetType={sheetType}
                reconciledRows={reconciledRows}
                filteredCatalog={filteredCatalog}
                onToggleSelect={(rowId, selected) => setReconciledRows(prev => prev.map(r => r.rowId === rowId ? { ...r, selected } : r))}
                onProductChange={handleRowProductChange}
                onColChange={handleRowColChange}
                onQtyChange={handleRowQtyChange}
                onResolutionChange={(rowId: string, resolution: ArbitrationResolution) => setReconciledRows(prev => prev.map(r => r.rowId === rowId ? { ...r, resolution } : r))}
              />
            </div>

            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #1E293B', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                Se aplicarán <strong style={{ color: '#F8FAFC' }}>{stats.active}</strong> registros homologados a <strong style={{ color: '#FBBF24' }}>{balanceDate}</strong> (<code>physical_sheet_ocr</code>).
              </div>
              <div style={{ display: 'flex', gap: '0.55rem' }}>
                <button type="button" onClick={onClose} style={{ padding: '0.5rem 0.95rem', borderRadius: '8px', border: '1px solid #334155', backgroundColor: 'transparent', color: '#CBD5E1', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                <button type="button" disabled={isSaving || stats.active === 0} onClick={handleApproveAndCommit} style={{ padding: '0.5rem 1.15rem', borderRadius: '8px', border: 'none', background: stats.active === 0 ? '#1E293B' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)', color: stats.active === 0 ? '#64748B' : '#022C22', fontSize: '0.78rem', fontWeight: 800, cursor: stats.active === 0 || isSaving ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>{isSaving ? 'Guardando...' : 'Aprobar y Aplicar a la Sábana'}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
