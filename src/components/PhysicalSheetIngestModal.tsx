'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  Sparkles,
  Truck,
  ClipboardCheck,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileText,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Search,
  Layers
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { INVENTORY_MOVEMENT_SUBTYPES } from '@/lib/constants';
import {
  PhysicalSheetType,
  TargetBalanceColumn,
  CatalogProductOption,
  ReconciledSheetRow,
  RawExtractedSheetRow,
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
    const urls = newFiles.map(f => URL.createObjectURL(f));
    setFiles(prev => [...prev, ...newFiles]);
    setPreviewUrls(prev => [...prev, ...urls]);
    setErrorMsg(null);
  };

  const handleRemoveFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviewUrls(prev => prev.filter((_, i) => i !== idx));
    if (activeFileIdx >= idx && activeFileIdx > 0) {
      setActiveFileIdx(prev => prev - 1);
    }
  };

  const handleRunExtraction = async () => {
    if (files.length === 0 && !rawText.trim()) {
      setErrorMsg('Selecciona al menos una imagen/PDF de la planilla física o pega texto para analizar.');
      return;
    }

    setIsExtracting(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('sheetType', sheetType);
      formData.append('balanceDate', balanceDate);
      if (rawText.trim()) {
        formData.append('text', rawText.trim());
      }
      files.forEach(f => formData.append('files', f));

      const res = await fetch('/api/commercial/inventory/extract-physical-sheet', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No fue posible extraer los datos de la planilla física.');
      }

      const allReconciled: ReconciledSheetRow[] = [];
      (data.results || []).forEach(
        (fileRes: { fileName: string; items: RawExtractedSheetRow[] }) => {
          const built = buildReconciledSheetRows(
            fileRes.items || [],
            sheetType,
            fileRes.fileName,
            catalog,
            opsCurrentByProductAndCol
          );
          allReconciled.push(...built);
        }
      );

      setReconciledRows(allReconciled);
      if (allReconciled.length === 0) {
        setErrorMsg('No se detectaron renglones con cantidades manuscritas en las imágenes cargadas.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error durante la lectura IA';
      setErrorMsg(msg);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleRowProductChange = (rowId: string, newProductId: string) => {
    const prod = catalog.find(c => c.id === newProductId) || null;
    setReconciledRows(prev =>
      prev.map(r => {
        if (r.rowId !== rowId) return r;
        const opsMetrics = prod ? opsCurrentByProductAndCol.get(prod.id) : undefined;
        const opsVal = opsMetrics ? Number(opsMetrics[r.targetColumn] || 0) : 0;
        const status =
          opsVal <= 0.001
            ? 'new_entry'
            : Math.abs(opsVal - r.quantity) <= 0.05
            ? 'matched_ops'
            : 'discrepancy';
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
          r.opsCurrentValue <= 0.001
            ? 'new_entry'
            : Math.abs(r.opsCurrentValue - safeQty) <= 0.05
            ? 'matched_ops'
            : 'discrepancy';
        return {
          ...r,
          quantity: safeQty,
          conciliationStatus: status
        };
      })
    );
  };

  const handleRowColChange = (rowId: string, newCol: TargetBalanceColumn) => {
    setReconciledRows(prev =>
      prev.map(r => {
        if (r.rowId !== rowId) return r;
        const opsMetrics = r.matchedProductId ? opsCurrentByProductAndCol.get(r.matchedProductId) : undefined;
        const opsVal = opsMetrics ? Number(opsMetrics[newCol] || 0) : 0;
        const status =
          opsVal <= 0.001
            ? 'new_entry'
            : Math.abs(opsVal - r.quantity) <= 0.05
            ? 'matched_ops'
            : 'discrepancy';
        return {
          ...r,
          targetColumn: newCol,
          opsCurrentValue: Math.round(opsVal * 100) / 100,
          conciliationStatus: status
        };
      })
    );
  };

  const stats = useMemo(() => {
    const active = reconciledRows.filter(r => r.selected && r.matchedProductId);
    const newEntries = active.filter(r => r.conciliationStatus === 'new_entry').length;
    const matched = active.filter(r => r.conciliationStatus === 'matched_ops').length;
    const discrepancies = active.filter(r => r.conciliationStatus === 'discrepancy').length;
    return { total: reconciledRows.length, active: active.length, newEntries, matched, discrepancies };
  }, [reconciledRows]);

  const handleApproveAndCommit = async () => {
    const rowsToApply = reconciledRows.filter(
      r => r.selected && r.matchedProductId && r.quantity > 0 && r.resolution === 'use_sheet'
    );

    if (rowsToApply.length === 0) {
      setErrorMsg('No hay filas activas marcadas con [Usar Papel] para aplicar a la sábana.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const { data: whData } = await supabase.from('warehouses').select('id').limit(1).single();
      const warehouseId = whData?.id || null;

      // Consolidar múltiples renglones del mismo SKU y misma columna destino en la misma planilla
      // (Ej. "Acelga Inventario 5.2" + "Acelga Ingreso hoy 21.8" = 27.0 kg en Col Q)
      const grouped = new Map<
        string,
        {
          productId: string;
          targetColumn: TargetBalanceColumn;
          totalQuantity: number;
          unitCostPaid: number | null;
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
          unitCostPaid: null,
          suppliers: [],
          rawDetails: [],
          files: []
        };
        existing.totalQuantity = Math.round((existing.totalQuantity + r.quantity) * 100) / 100;
        if (r.unitCostPaid && r.unitCostPaid > 0) existing.unitCostPaid = r.unitCostPaid;
        if (r.supplierName && !existing.suppliers.includes(r.supplierName)) {
          existing.suppliers.push(r.supplierName);
        }
        existing.rawDetails.push(
          `${r.rawProductName}: ${r.quantity}${r.sourceNote ? ` (${r.sourceNote})` : ''}`
        );
        if (!existing.files.includes(r.sourceFileName)) {
          existing.files.push(r.sourceFileName);
        }
        grouped.set(key, existing);
      });

      const startIso = `${balanceDate}T00:00:00.000Z`;
      const endIso = `${balanceDate}T23:59:59.999Z`;
      const timestampIso = `${balanceDate}T12:00:00.000Z`;

      for (const item of grouped.values()) {
        let movType: 'entry' | 'exit' | 'adjustment' = 'entry';
        let refType = 'purchase_reception';
        let signedQty = item.totalQuantity;

        if (item.targetColumn === 'G') {
          movType = 'entry';
          refType = 'purchase_reception';
          signedQty = item.totalQuantity;
        } else if (item.targetColumn === 'Q') {
          movType = 'exit';
          refType = INVENTORY_MOVEMENT_SUBTYPES.WASTE_DAMAGE;
          signedQty = -item.totalQuantity;
        } else if (item.targetColumn === 'R') {
          movType = 'exit';
          refType = INVENTORY_MOVEMENT_SUBTYPES.WASTE_CLEANING;
          signedQty = -item.totalQuantity;
        } else if (item.targetColumn === 'T') {
          movType = 'adjustment';
          refType = INVENTORY_MOVEMENT_SUBTYPES.BLIND_COUNT;
          signedQty = 0;
        }

        const supplierInfo = item.suppliers.length > 0 ? ` | Prov: ${item.suppliers.join(', ')}` : '';
        const costInfo = item.unitCostPaid ? ` | Costo: $${item.unitCostPaid}` : '';
        const blindMeta =
          item.targetColumn === 'T'
            ? ` [BLIND_COUNT_META: ${JSON.stringify({
                counted_quantity: item.totalQuantity,
                operator: supervisorName,
                origin_source: 'physical_sheet_ocr'
              })}]`
            : '';

        const noteDesc = `[ORIGEN: PHYSICAL_SHEET_OCR - ${supervisorName}] Col ${item.targetColumn}: ${item.totalQuantity.toFixed(2)} (${item.rawDetails.join(' + ')})${supplierInfo}${costInfo} [Archivo: ${item.files.join(', ')}]${blindMeta}`;

        // Idempotencia (Regla 3 SDD 391): Upsert determinista por (product_id, reference_type, balanceDate)
        const { data: existingMovs } = await supabase
          .from('inventory_movements')
          .select('id')
          .eq('product_id', item.productId)
          .eq('reference_type', refType)
          .gte('created_at', startIso)
          .lte('created_at', endIso);

        if (existingMovs && existingMovs.length > 0) {
          const targetId = existingMovs[0].id;
          await supabase
            .from('inventory_movements')
            .update({
              quantity: signedQty,
              type: movType,
              notes: noteDesc
            })
            .eq('id', targetId);

          if (existingMovs.length > 1) {
            const extraIds = existingMovs.slice(1).map(x => x.id);
            await supabase.from('inventory_movements').delete().in('id', extraIds);
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

        // Si es planilla de Entrada y trae precio pagado, actualizar costo comercial base (DT-11)
        if (item.targetColumn === 'G' && item.unitCostPaid && item.unitCostPaid > 0) {
          await supabase
            .from('commercial_cost_matrix')
            .upsert(
              {
                product_id: item.productId,
                manual_cost: item.unitCostPaid,
                is_active: true,
                updated_at: new Date().toISOString()
              },
              { onConflict: 'product_id' }
            );
        }
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error guardando los datos en la base de datos.';
      setErrorMsg(msg);
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

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(2, 6, 23, 0.82)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1540px',
          height: '92vh',
          backgroundColor: '#0F172A',
          border: '1px solid #334155',
          borderRadius: '14px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)'
        }}
      >
        {/* CABECERA */}
        <div
          style={{
            padding: '0.9rem 1.25rem',
            borderBottom: '1px solid #1E293B',
            backgroundColor: '#020617',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#020617'
              }}
            >
              <Sparkles size={20} strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#F8FAFC' }}>
                  Lector Multimodal de Planillas Físicas de Bodega (IA)
                </h2>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.55rem',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: '#34D399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <ShieldCheck size={12} /> Arbitraje Anti-Colisión OPS Activo
                </span>
              </div>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.76rem', color: '#94A3B8' }}>
                Jornada contable destino: <strong style={{ color: '#FBBF24' }}>{balanceDate}</strong> · Misma experiencia de reconciliación visual de pedidos
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #334155',
              color: '#94A3B8',
              borderRadius: '8px',
              padding: '0.4rem',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* PASO 1: SELECTOR DE LAS 3 SUBCARPETAS / TIPOS DE PLANILLA */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
            backgroundColor: '#0B1120',
            borderBottom: '1px solid #1E293B',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.75rem'
          }}
        >
          {[
            {
              id: 'entrada' as PhysicalSheetType,
              title: '1. Entradas / Recepción Muelle (Entrada/)',
              subtitle: 'Control de llegada en Kg, proveedores y precios -> Alimenta Columna G (COMPRAS)',
              colBadge: 'Columna G (+)',
              color: '#10B981',
              Icon: Truck
            },
            {
              id: 'inv_manual' as PhysicalSheetType,
              title: '2. Conteo Físico Fin de Turno (Inv manual/)',
              subtitle: 'Planillas de bodega por categorías (Papas, Frutas, Hortalizas...) -> Alimenta Columna T',
              colBadge: 'Columna T (Físico)',
              color: '#38BDF8',
              Icon: ClipboardCheck
            },
            {
              id: 'desperdicio' as PhysicalSheetType,
              title: '3. Formato Desperdicio y Arreglo (Desperdicio/)',
              subtitle: 'Bifurca Avería/Podrido a Columna Q (-) y Cáscaras/Descapote a Columna R (-)',
              colBadge: 'Cols Q y R (-)',
              color: '#F43F5E',
              Icon: Trash2
            }
          ].map(card => {
            const active = sheetType === card.id;
            const IconComp = card.Icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  setSheetType(card.id);
                  setReconciledRows([]);
                }}
                style={{
                  textAlign: 'left',
                  padding: '0.65rem 0.9rem',
                  borderRadius: '10px',
                  border: active ? `2px solid ${card.color}` : '1px solid #1E293B',
                  backgroundColor: active ? 'rgba(15, 23, 42, 0.95)' : 'rgba(15, 23, 42, 0.4)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.7rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <div
                  style={{
                    padding: '0.45rem',
                    borderRadius: '8px',
                    backgroundColor: active ? `${card.color}22` : '#1E293B',
                    color: active ? card.color : '#64748B'
                  }}
                >
                  <IconComp size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: active ? '#F8FAFC' : '#CBD5E1' }}>
                      {card.title}
                    </span>
                    <span
                      style={{
                        fontSize: '0.66rem',
                        fontWeight: 800,
                        padding: '0.1rem 0.45rem',
                        borderRadius: '4px',
                        backgroundColor: `${card.color}22`,
                        color: card.color
                      }}
                    >
                      {card.colBadge}
                    </span>
                  </div>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.71rem', color: '#94A3B8', lineHeight: 1.3 }}>
                    {card.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* CUERPO PRINCIPAL DIVIDIDO (VISOR IZQUIERDA + STAGING DERECHA) */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '440px 1fr', overflow: 'hidden' }}>
          {/* PANEL IZQUIERDO: CARGA Y VISOR DE IMÁGENES / PDF */}
          <div
            style={{
              borderRight: '1px solid #1E293B',
              backgroundColor: '#020617',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '0.65rem 0.9rem',
                borderBottom: '1px solid #1E293B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem'
              }}
            >
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => setShowTextTab(false)}
                  style={{
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.73rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: !showTextTab ? '#1E293B' : 'transparent',
                    color: !showTextTab ? '#F8FAFC' : '#64748B'
                  }}
                >
                  Fotos / PDF ({files.length})
                </button>
                <button
                  type="button"
                  onClick={() => setShowTextTab(true)}
                  style={{
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.73rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: showTextTab ? '#1E293B' : 'transparent',
                    color: showTextTab ? '#F8FAFC' : '#64748B'
                  }}
                >
                  Texto / WhatsApp
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={e => handleFilesSelected(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '0.32rem 0.65rem',
                    fontSize: '0.73rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: '1px solid #334155',
                    backgroundColor: '#1E293B',
                    color: '#E2E8F0',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}
                >
                  <Upload size={13} /> Añadir Hojas
                </button>
              </div>
            </div>

            {showTextTab ? (
              <div style={{ flex: 1, padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8' }}>
                  Pega aquí listas de precios, entradas o conteos enviados por WhatsApp:
                </label>
                <textarea
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  placeholder="Ej:&#10;Papa pastusa 408 + 70 kg&#10;Tomate chonto 484 kg&#10;Aguacate 100k x 7000"
                  style={{
                    flex: 1,
                    width: '100%',
                    borderRadius: '8px',
                    backgroundColor: '#0F172A',
                    border: '1px solid #334155',
                    color: '#F8FAFC',
                    padding: '0.75rem',
                    fontSize: '0.82rem',
                    resize: 'none'
                  }}
                />
              </div>
            ) : files.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  handleFilesSelected(e.dataTransfer.files);
                }}
                style={{
                  flex: 1,
                  margin: '0.9rem',
                  border: '2px dashed #334155',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: 'rgba(15, 23, 42, 0.5)'
                }}
              >
                <Upload size={34} color="#F59E0B" style={{ marginBottom: '0.6rem' }} />
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#F1F5F9' }}>
                  Arrastra las fotos de la planilla física aquí
                </div>
                <p style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '0.35rem' }}>
                  Soporta múltiples páginas a la vez (JPG, PNG, WebP o PDF escaneado) de las carpetas Entrada, Inv manual o Desperdicio.
                </p>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Tira de miniaturas multi-página */}
                <div
                  style={{
                    display: 'flex',
                    gap: '0.4rem',
                    padding: '0.45rem 0.75rem',
                    overflowX: 'auto',
                    borderBottom: '1px solid #1E293B',
                    backgroundColor: '#0F172A'
                  }}
                >
                  {files.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      onClick={() => {
                        setActiveFileIdx(i);
                        setZoom(1);
                        setRotation(0);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.25rem 0.55rem',
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        border: activeFileIdx === i ? '1px solid #F59E0B' : '1px solid #334155',
                        backgroundColor: activeFileIdx === i ? 'rgba(245, 158, 11, 0.15)' : '#020617',
                        color: activeFileIdx === i ? '#FBBF24' : '#94A3B8'
                      }}
                    >
                      <FileText size={12} />
                      <span>Pág {i + 1}</span>
                      <span
                        onClick={e => {
                          e.stopPropagation();
                          handleRemoveFile(i);
                        }}
                        style={{ marginLeft: '0.2rem', color: '#EF4444', cursor: 'pointer' }}
                      >
                        ×
                      </span>
                    </div>
                  ))}
                </div>

                {/* Controles de zoom y rotación */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.35rem 0.75rem',
                    backgroundColor: '#090D16',
                    borderBottom: '1px solid #1E293B'
                  }}
                >
                  <span style={{ fontSize: '0.7rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {files[activeFileIdx]?.name}
                  </span>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button
                      type="button"
                      onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                      style={{ background: '#1E293B', border: 'none', color: '#CBD5E1', borderRadius: '4px', padding: '0.25rem', cursor: 'pointer' }}
                    >
                      <ZoomOut size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))}
                      style={{ background: '#1E293B', border: 'none', color: '#CBD5E1', borderRadius: '4px', padding: '0.25rem', cursor: 'pointer' }}
                    >
                      <ZoomIn size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRotation(r => (r + 90) % 360)}
                      style={{ background: '#1E293B', border: 'none', color: '#CBD5E1', borderRadius: '4px', padding: '0.25rem', cursor: 'pointer' }}
                    >
                      <RotateCw size={13} />
                    </button>
                  </div>
                </div>

                {/* Lienzo de imagen */}
                <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
                  {previewUrls[activeFileIdx] && (
                    <img
                      src={previewUrls[activeFileIdx]}
                      alt="Planilla física"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        transform: `scale(${zoom}) rotate(${rotation}deg)`,
                        transition: 'transform 0.15s ease'
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Botón Disparador de Lectura IA */}
            <div style={{ padding: '0.8rem', borderTop: '1px solid #1E293B', backgroundColor: '#0B1120' }}>
              <button
                type="button"
                disabled={isExtracting || (files.length === 0 && !rawText.trim())}
                onClick={handleRunExtraction}
                style={{
                  width: '100%',
                  padding: '0.68rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: isExtracting
                    ? '#334155'
                    : 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                  color: '#020617',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  cursor: isExtracting ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                {isExtracting ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>Analizando caligrafía y homologando contra 663 SKUs...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    <span>Procesar Planilla Física con IA ({files.length || 1} doc)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* PANEL DERECHO: MESA DE RECONCILIACIÓN Y ARBITRAJE ANTI-COLISIÓN OPS */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#0F172A' }}>
            {/* Barra de Resumen de Conciliación */}
            <div
              style={{
                padding: '0.65rem 1rem',
                borderBottom: '1px solid #1E293B',
                backgroundColor: '#090D16',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#E2E8F0' }}>
                  Renglones detectados: <strong>{stats.total}</strong>
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(16, 185, 129, 0.14)',
                    color: '#34D399',
                    fontWeight: 700
                  }}
                >
                  Nuevos ingresos (OPS vacío): {stats.newEntries}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(56, 189, 248, 0.14)',
                    color: '#38BDF8',
                    fontWeight: 700
                  }}
                >
                  Conciliados idénticos con OPS: {stats.matched}
                </span>
                {stats.discrepancies > 0 && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(245, 158, 11, 0.18)',
                      color: '#FBBF24',
                      fontWeight: 700
                    }}
                  >
                    Discrepancias OPS a decidir: {stats.discrepancies}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Search size={13} color="#64748B" />
                <input
                  type="text"
                  value={skuSearchFilter}
                  onChange={e => setSkuSearchFilter(e.target.value)}
                  placeholder="Filtrar catálogo SKU..."
                  style={{
                    backgroundColor: '#1E293B',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '0.25rem 0.55rem',
                    fontSize: '0.72rem',
                    color: '#F8FAFC',
                    width: '170px'
                  }}
                />
              </div>
            </div>

            {errorMsg && (
              <div
                style={{
                  margin: '0.75rem 1rem 0',
                  padding: '0.6rem 0.9rem',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#FCA5A5',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <AlertTriangle size={15} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Tabla de Staging */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0.75rem 1rem' }}>
              {reconciledRows.length === 0 ? (
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748B',
                    textAlign: 'center'
                  }}
                >
                  <Layers size={38} style={{ marginBottom: '0.6rem', opacity: 0.45 }} />
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#94A3B8' }}>
                    Mesa de Trabajo y Conciliación Lista
                  </div>
                  <p style={{ fontSize: '0.75rem', maxWidth: '420px', marginTop: '0.3rem' }}>
                    Selecciona el tipo de planilla arriba, carga las fotos del turno a la izquierda y pulsa &laquo;Procesar Planilla Física con IA&raquo;.
                  </p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                  <thead>
                    <tr
                      style={{
                        backgroundColor: '#020617',
                        color: '#94A3B8',
                        textAlign: 'left',
                        borderBottom: '1px solid #334155'
                      }}
                    >
                      <th style={{ padding: '0.55rem', width: '32px' }}>✓</th>
                      <th style={{ padding: '0.55rem' }}>Leído en Papel (Manuscrito)</th>
                      <th style={{ padding: '0.55rem' }}>SKU Homologado (Catálogo FruFresco)</th>
                      <th style={{ padding: '0.55rem', width: '110px' }}>Columna Destino</th>
                      <th style={{ padding: '0.55rem', width: '105px', textAlign: 'right' }}>Cant. Papel</th>
                      <th style={{ padding: '0.55rem', width: '230px' }}>Contraste OPS & Arbitraje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciledRows.map(row => {
                      const confColor =
                        row.confidence >= 90
                          ? '#10B981'
                          : row.confidence >= 70
                          ? '#F59E0B'
                          : '#EF4444';

                      return (
                        <tr
                          key={row.rowId}
                          style={{
                            borderBottom: '1px solid #1E293B',
                            backgroundColor:
                              row.conciliationStatus === 'discrepancy'
                                ? 'rgba(245, 158, 11, 0.06)'
                                : 'transparent',
                            opacity: row.selected ? 1 : 0.55
                          }}
                        >
                          <td style={{ padding: '0.5rem' }}>
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={e =>
                                setReconciledRows(prev =>
                                  prev.map(r =>
                                    r.rowId === row.rowId ? { ...r, selected: e.target.checked } : r
                                  )
                                )
                              }
                            />
                          </td>

                          {/* Texto original en papel */}
                          <td style={{ padding: '0.5rem' }}>
                            <div style={{ fontWeight: 700, color: '#F1F5F9' }}>{row.rawProductName}</div>
                            <div style={{ fontSize: '0.68rem', color: '#94A3B8', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span>Leído: <strong>{row.rawQuantityText}</strong></span>
                              {row.rawPresentation && <span>· Pres: {row.rawPresentation}</span>}
                              {row.supplierName && <span style={{ color: '#38BDF8' }}>· Prov: {row.supplierName}</span>}
                              {row.unitCostPaid && <span style={{ color: '#34D399' }}>· ${row.unitCostPaid.toLocaleString('es-CO')}</span>}
                              {row.sourceNote && <span style={{ color: '#FBBF24' }}>· ({row.sourceNote})</span>}
                            </div>
                          </td>

                          {/* Selector SKU homologado */}
                          <td style={{ padding: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span
                                style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  backgroundColor: confColor,
                                  flexShrink: 0
                                }}
                                title={`Confianza IA: ${row.confidence}%`}
                              />
                              <select
                                value={row.matchedProductId || ''}
                                onChange={e => handleRowProductChange(row.rowId, e.target.value)}
                                style={{
                                  width: '100%',
                                  backgroundColor: '#1E293B',
                                  border: `1px solid ${row.matchedProductId ? '#334155' : '#EF4444'}`,
                                  borderRadius: '6px',
                                  padding: '0.3rem 0.45rem',
                                  color: '#F8FAFC',
                                  fontSize: '0.74rem'
                                }}
                              >
                                <option value="">-- Seleccionar SKU manualmente --</option>
                                {filteredCatalog.map(c => (
                                  <option key={c.id} value={c.id}>
                                    #{c.accounting_id || c.sku} — {c.name} ({c.unit_of_measure})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>

                          {/* Columna Destino */}
                          <td style={{ padding: '0.5rem' }}>
                            {sheetType === 'desperdicio' ? (
                              <select
                                value={row.targetColumn}
                                onChange={e => handleRowColChange(row.rowId, e.target.value as TargetBalanceColumn)}
                                style={{
                                  backgroundColor: '#1E293B',
                                  border: '1px solid #334155',
                                  borderRadius: '6px',
                                  padding: '0.28rem 0.4rem',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  color: row.targetColumn === 'Q' ? '#F87171' : '#FB923C'
                                }}
                              >
                                <option value="Q">Col Q · Avería</option>
                                <option value="R">Col R · Basura</option>
                              </select>
                            ) : (
                              <span
                                style={{
                                  fontSize: '0.71rem',
                                  fontWeight: 800,
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '6px',
                                  backgroundColor: '#1E293B',
                                  color: row.targetColumn === 'G' ? '#34D399' : '#38BDF8'
                                }}
                              >
                                Col {row.targetColumn} ({row.matchedUnit})
                              </span>
                            )}
                          </td>

                          {/* Cantidad editable */}
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                            <input
                              type="number"
                              step="0.01"
                              value={row.quantity}
                              onChange={e => handleRowQtyChange(row.rowId, parseFloat(e.target.value))}
                              style={{
                                width: '88px',
                                textAlign: 'right',
                                backgroundColor: '#020617',
                                border: '1px solid #475569',
                                borderRadius: '6px',
                                padding: '0.3rem 0.45rem',
                                color: '#F8FAFC',
                                fontWeight: 800,
                                fontSize: '0.78rem'
                              }}
                            />
                          </td>

                          {/* Semáforo de coexistencia con OPS */}
                          <td style={{ padding: '0.5rem' }}>
                            {row.conciliationStatus === 'new_entry' && (
                              <span
                                style={{
                                  color: '#34D399',
                                  fontSize: '0.71rem',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem'
                                }}
                              >
                                <CheckCircle2 size={13} /> Nuevo ingreso (OPS: 0)
                              </span>
                            )}

                            {row.conciliationStatus === 'matched_ops' && (
                              <span
                                style={{
                                  color: '#38BDF8',
                                  fontSize: '0.71rem',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem'
                                }}
                              >
                                <CheckCircle2 size={13} /> Conciliado con OPS ({row.opsCurrentValue})
                              </span>
                            )}

                            {row.conciliationStatus === 'discrepancy' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <span style={{ fontSize: '0.68rem', color: '#FBBF24', fontWeight: 700 }}>
                                  OPS tiene: {row.opsCurrentValue} vs Papel: {row.quantity}
                                </span>
                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReconciledRows(prev =>
                                        prev.map(r =>
                                          r.rowId === row.rowId ? { ...r, resolution: 'use_sheet' } : r
                                        )
                                      )
                                    }
                                    style={{
                                      padding: '0.18rem 0.45rem',
                                      fontSize: '0.66rem',
                                      fontWeight: 700,
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      border: '1px solid #F59E0B',
                                      backgroundColor:
                                        row.resolution === 'use_sheet' ? '#F59E0B' : 'transparent',
                                      color: row.resolution === 'use_sheet' ? '#020617' : '#FBBF24'
                                    }}
                                  >
                                    Usar Papel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReconciledRows(prev =>
                                        prev.map(r =>
                                          r.rowId === row.rowId ? { ...r, resolution: 'keep_ops' } : r
                                        )
                                      )
                                    }
                                    style={{
                                      padding: '0.18rem 0.45rem',
                                      fontSize: '0.66rem',
                                      fontWeight: 700,
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      border: '1px solid #475569',
                                      backgroundColor:
                                        row.resolution === 'keep_ops' ? '#334155' : 'transparent',
                                      color: '#CBD5E1'
                                    }}
                                  >
                                    Mantener OPS
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* PIE DE MODAL: APROBACIÓN Y PERSISTENCIA */}
            <div
              style={{
                padding: '0.85rem 1.25rem',
                borderTop: '1px solid #1E293B',
                backgroundColor: '#020617',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
                Se aplicarán <strong style={{ color: '#F8FAFC' }}>{stats.active}</strong> registros homologados a la fecha{' '}
                <strong style={{ color: '#FBBF24' }}>{balanceDate}</strong> con firma de auditoría{' '}
                <code>physical_sheet_ocr</code>.
              </div>

              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '0.55rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    backgroundColor: 'transparent',
                    color: '#CBD5E1',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSaving || stats.active === 0}
                  onClick={handleApproveAndCommit}
                  style={{
                    padding: '0.55rem 1.2rem',
                    borderRadius: '8px',
                    border: 'none',
                    background:
                      stats.active === 0
                        ? '#1E293B'
                        : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    color: stats.active === 0 ? '#64748B' : '#022C22',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    cursor: stats.active === 0 || isSaving ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem'
                  }}
                >
                  <span>{isSaving ? 'Guardando en Base de Datos...' : 'Aprobar y Aplicar a la Sábana'}</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
