'use client';
import React, { useState, useMemo, useRef } from 'react';
import { X, UploadCloud, Sparkles, Truck, ClipboardCheck, Trash2, AlertTriangle, ZoomIn, ZoomOut, RotateCw, FileText, RefreshCw, ArrowRight, ShieldCheck, CheckCircle2, MessageSquare, Zap, Maximize2, Loader2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { INVENTORY_MOVEMENT_SUBTYPES } from '@/lib/constants';
import PdfCanvasViewer from '@/components/PdfCanvasViewer';
import ExcelTableViewer from '@/components/ExcelTableViewer';
import PhysicalSheetStagingTable from '@/components/PhysicalSheetStagingTable';
import { PhysicalSheetType, TargetBalanceColumn, CatalogProductOption, ReconciledSheetRow, RawExtractedSheetRow, ArbitrationResolution, buildReconciledSheetRows } from '@/lib/inventory/physical-sheet-parser';
interface PhysicalSheetIngestModalProps { isOpen: boolean; onClose: () => void; balanceDate: string; catalog: CatalogProductOption[]; opsCurrentByProductAndCol: Map<string, { G: number; T: number; Q: number; R: number; X?: number }>; supervisorName: string; onSuccess: () => void; }
export default function PhysicalSheetIngestModal({ isOpen, onClose, balanceDate, catalog, opsCurrentByProductAndCol, supervisorName, onSuccess }: PhysicalSheetIngestModalProps) {
  const [sheetType, setSheetType] = useState<PhysicalSheetType>('entrada');
  const [aiInputTab, setAiInputTab] = useState<'file' | 'text'>('file');
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [activeFileIdx, setActiveFileIdx] = useState<number>(0);
  const [rawText, setRawText] = useState<string>('');
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [stackedView, setStackedView] = useState<boolean>(false);
  const [showSideDocPreview, setShowSideDocPreview] = useState<boolean>(true);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionProgress, setExtractionProgress] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [digestionDuration, setDigestionDuration] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reconciledRows, setReconciledRows] = useState<ReconciledSheetRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendFileInputRef = useRef<HTMLInputElement>(null);
  const isStaging = reconciledRows.length > 0;

  // Optimización cliente de imágenes y división de PDFs escaneados multipágina en JPEGs ligeros (~200KB/pág) para evitar timeouts de 45s
  const prepareOptimizedFilesForOcr = async (rawFiles: File[]): Promise<File[]> => {
    const optimized: File[] = [];

    const compressImageFile = async (imgFile: File): Promise<File> => {
      if (imgFile.size < 350 * 1024) return imgFile;
      return new Promise<File>((resolve) => {
        const img = new Image();
        const objUrl = URL.createObjectURL(imgFile);
        img.onload = () => {
          URL.revokeObjectURL(objUrl);
          const maxDim = 1650;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(imgFile);
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(imgFile);
                return;
              }
              const baseName = imgFile.name.replace(/\.[^.]+$/, '');
              resolve(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }));
            },
            'image/jpeg',
            0.82
          );
        };
        img.onerror = () => {
          URL.revokeObjectURL(objUrl);
          resolve(imgFile);
        };
        img.src = objUrl;
      });
    };

    const splitPdfIntoPageImages = async (pdfFile: File): Promise<File[]> => {
      try {
        if (!(window as any).pdfjsLib) {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          script.async = true;
          await new Promise((res, rej) => {
            script.onload = res;
            script.onerror = rej;
            document.head.appendChild(script);
          });
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const arrayBuffer = await pdfFile.arrayBuffer();
        const pdf = await (window as any).pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const pageFiles: File[] = [];
        const baseName = pdfFile.name.replace(/\.pdf$/i, '');

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const unscaledViewport = page.getViewport({ scale: 1 });
          const maxDim = 1650;
          const scale = Math.min(2.0, maxDim / Math.max(unscaledViewport.width, unscaledViewport.height, 1));
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;

          const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
          if (blob) {
            const pageLabel = pdf.numPages > 1 ? `${baseName} (Pág ${pageNum}).jpg` : `${baseName}.jpg`;
            pageFiles.push(new File([blob], pageLabel, { type: 'image/jpeg' }));
          }
        }
        return pageFiles.length > 0 ? pageFiles : [pdfFile];
      } catch (err) {
        console.warn('Fallback a PDF original:', err);
        return [pdfFile];
      }
    };

    for (const f of rawFiles) {
      const lower = f.name.toLowerCase();
      if (f.type === 'application/pdf' || lower.endsWith('.pdf')) {
        setExtractionProgress(`Optimizando páginas escaneadas de ${f.name}...`);
        const pages = await splitPdfIntoPageImages(f);
        optimized.push(...pages);
      } else if (f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp)$/i.test(lower)) {
        setExtractionProgress(`Optimizando resolución de imagen ${f.name}...`);
        const compressed = await compressImageFile(f);
        optimized.push(compressed);
      } else {
        optimized.push(f);
      }
    }

    return optimized;
  };

  const executeAiExtraction = async (targetFiles: File[], targetText: string, targetSheetType: PhysicalSheetType, appendMode = false) => {
    if (targetFiles.length === 0 && !targetText.trim()) { setErrorMsg('Selecciona al menos un archivo (Foto, PDF o Excel) o pega el texto de la planilla.'); return; }
    setIsExtracting(true); setErrorMsg(null); setExtractionProgress('Preparando documentos...');
    const startMs = performance.now();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || '';
      const optimizedFiles = targetFiles.length > 0 ? await prepareOptimizedFilesForOcr(targetFiles) : [];
      const extractedRows: ReconciledSheetRow[] = [];

      // Procesar en bloques de máximo 2 páginas por petición para evitar timeouts en documentos multipágina densos
      const batchSize = 2;
      const totalBatches = Math.max(1, Math.ceil(optimizedFiles.length / batchSize));

      if (optimizedFiles.length > 0) {
        for (let i = 0; i < optimizedFiles.length; i += batchSize) {
          const batch = optimizedFiles.slice(i, i + batchSize);
          const batchNum = Math.floor(i / batchSize) + 1;
          setExtractionProgress(
            optimizedFiles.length > 1
              ? `Digitalizando con IA página ${Math.min(i + 1, optimizedFiles.length)}–${Math.min(i + batch.length, optimizedFiles.length)} de ${optimizedFiles.length} (Lote ${batchNum}/${totalBatches})...`
              : `Analizando caligrafía y homologando SKUs de ${batch[0].name}...`
          );

          const formData = new FormData();
          formData.append('sheetType', targetSheetType);
          formData.append('balanceDate', balanceDate);
          if (i === 0 && targetText.trim()) formData.append('text', targetText.trim());
          batch.forEach(f => formData.append('files', f));

          const res = await fetch('/api/commercial/inventory/extract-physical-sheet', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: formData
          });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error || 'No fue posible extraer la planilla física.');

          (data.results || []).forEach((fileRes: { fileName: string; items: RawExtractedSheetRow[] }) => {
            extractedRows.push(...buildReconciledSheetRows(fileRes.items || [], targetSheetType, fileRes.fileName, catalog, opsCurrentByProductAndCol));
          });
        }
      } else if (targetText.trim()) {
        setExtractionProgress('Analizando texto con IA...');
        const formData = new FormData();
        formData.append('sheetType', targetSheetType);
        formData.append('balanceDate', balanceDate);
        formData.append('text', targetText.trim());
        const res = await fetch('/api/commercial/inventory/extract-physical-sheet', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: formData
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'No fue posible extraer la planilla física.');
        (data.results || []).forEach((fileRes: { fileName: string; items: RawExtractedSheetRow[] }) => {
          extractedRows.push(...buildReconciledSheetRows(fileRes.items || [], targetSheetType, fileRes.fileName, catalog, opsCurrentByProductAndCol));
        });
      }

      setDigestionDuration(((performance.now() - startMs) / 1000).toFixed(1));
      setReconciledRows(prev => (appendMode ? [...prev, ...extractedRows] : extractedRows));
      if (extractedRows.length === 0 && !appendMode) {
        setErrorMsg('No se detectaron renglones con cantidades diligenciadas en el documento.');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error durante la lectura IA');
    } finally {
      setIsExtracting(false);
      setExtractionProgress('');
    }
  };
  const handleInitialFilesSelected = (selectedList: FileList | null) => {
    if (!selectedList || selectedList.length === 0) return;
    const newFiles = Array.from(selectedList);
    setFiles(newFiles);
    setPreviewUrls(newFiles.map(f => URL.createObjectURL(f)));
    setActiveFileIdx(0);
    setZoom(1);
    setRotation(0);
    setShowSideDocPreview(true);
    void executeAiExtraction(newFiles, '', sheetType, false);
  };
  const handleAppendFilesSelected = (selectedList: FileList | null) => {
    if (!selectedList || selectedList.length === 0) return;
    const newFiles = Array.from(selectedList);
    const nextIdx = files.length;
    setFiles(prev => [...prev, ...newFiles]);
    setPreviewUrls(prev => [...prev, ...newFiles.map(f => URL.createObjectURL(f))]);
    setActiveFileIdx(nextIdx);
    void executeAiExtraction(newFiles, '', sheetType, true);
  };
  const handleResetWorkspace = () => {
    previewUrls.forEach(u => URL.revokeObjectURL(u));
    setFiles([]);
    setPreviewUrls([]);
    setRawText('');
    setReconciledRows([]);
    setErrorMsg(null);
    setDigestionDuration(null);
    setActiveFileIdx(0);
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
  const handleAddManualRow = () => {
    const defaultCol: TargetBalanceColumn =
      sheetType === 'entrada' ? 'G' : sheetType === 'inv_manual' ? 'T' : sheetType === 'donaciones' ? 'X' : 'Q';
    setReconciledRows(prev => [
      ...prev,
      {
        rowId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sourceFileName: files[activeFileIdx]?.name || 'Manual',
        rawProductName: 'Ítem agregado manualmente',
        rawQuantityText: '1',
        rawPresentation: null,
        quantity: 1,
        unitCostPaid: null,
        supplierName: null,
        sourceNote: null,
        targetColumn: defaultCol,
        matchedProductId: null,
        matchedProductName: 'Sin homologar',
        matchedAccountingId: 'S/N',
        matchedUnit: 'Kg',
        confidence: 0,
        opsCurrentValue: 0,
        conciliationStatus: 'new_entry',
        resolution: 'use_sheet',
        selected: true
      }
    ]);
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
      setErrorMsg('No hay filas activas homologadas con cantidad > 0 para inyectar a la Sábana.');
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
        if (r.conciliationStatus === 'discrepancy' && r.resolution === 'use_sheet') existing.replacesOpsDiscrepancy = true;
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
            : item.targetColumn === 'X'
            ? INVENTORY_MOVEMENT_SUBTYPES.FOOD_BANK
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
          let sumTotalCost = item.weightedCostNumerator;
          let sumQuantity = item.weightedCostDenominator;
          const { data: dayTaskRows } = await supabase
            .from('procurement_tasks')
            .select('id')
            .eq('product_id', item.productId)
            .eq('delivery_date', balanceDate);
          const dayTaskIds = (dayTaskRows || []).map(r => r.id);
          if (dayTaskIds.length > 0 && !item.replacesOpsDiscrepancy) {
            const { data: dayPurchases } = await supabase
              .from('purchases')
              .select('quantity, unit_price, total_cost')
              .eq('product_id', item.productId)
              .in('task_id', dayTaskIds);
            (dayPurchases || []).forEach(pur => {
              const q = Number(pur.quantity) || 0;
              const tCost = Number(pur.total_cost) || q * (Number(pur.unit_price) || 0);
              if (q > 0 && tCost > 0) {
                sumQuantity += q;
                sumTotalCost += tCost;
              }
            });
          }
          const finalPppCost = sumQuantity > 0 ? Math.round((sumTotalCost / sumQuantity) * 100) / 100 : pppCost;
          await supabase.from('commercial_cost_matrix').upsert(
            {
              product_id: item.productId,
              manual_cost: finalPppCost,
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
  const activeFile = files[activeFileIdx] || null;
  const activePreviewUrl = previewUrls[activeFileIdx] || null;
  const activeFileName = activeFile?.name?.toLowerCase() || '';
  const isActiveExcel =
    activeFileName.endsWith('.xlsx') || activeFileName.endsWith('.xls') || activeFileName.endsWith('.csv');
  const isActivePdf = activeFile?.type === 'application/pdf' || activeFileName.endsWith('.pdf');
  const docTypeLabel = isActiveExcel ? 'Excel' : isActivePdf ? 'PDF' : 'Imagen';
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '1600px', height: '93vh', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
        {/* CABECERA PRINCIPAL (ESTILO PEDIDOS) */}
        <div style={{ padding: '1rem 1.75rem', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#ECFDF5', border: '1.5px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <Sparkles size={20} strokeWidth={2.2} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#0F172A' }}>
                  Mesa de Trabajo Inteligente — Planillas Físicas de Bodega (IA)
                </h2>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '3px 10px', borderRadius: '999px', backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={13} /> Arbitraje Anti-Colisión OPS Activo
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                Jornada contable destino: <strong style={{ color: '#0F172A' }}>{balanceDate}</strong> · Vista dividida Lado a Lado idéntica al Módulo de Pedidos
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#64748B', borderRadius: '10px', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} />
          </button>
        </div>
        {/* SELECTOR DE LAS 5 MODALIDADES DE PLANILLA */}
        <div style={{ padding: '0.65rem 1.75rem', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.6rem' }}>
          {[
            { id: 'entrada' as PhysicalSheetType, title: '1. Entradas Muelle', subtitle: 'Unidad compra directa (cero recálculos)', colBadge: 'Col G (+)', color: '#059669', bg: '#ECFDF5', Icon: Truck },
            { id: 'inv_manual' as PhysicalSheetType, title: '2. Conteo Fin Turno', subtitle: 'Planillas cierre de bodega 7:00 PM', colBadge: 'Col T (Físico)', color: '#0284C7', bg: '#E0F2FE', Icon: ClipboardCheck },
            { id: 'pedidos_desperdicio' as PhysicalSheetType, title: '3. Formato Pedidos (2 Cols)', subtitle: 'Susceptibles: Desperdicio y Basura', colBadge: 'Cols Q y R (-)', color: '#D97706', bg: '#FEF3C7', Icon: FileText },
            { id: 'desperdicio' as PhysicalSheetType, title: '4. Desperdicio General', subtitle: 'Planilla libre de avería y descapote', colBadge: 'Cols Q y R (-)', color: '#E11D48', bg: '#FFE4E6', Icon: Trash2 },
            { id: 'donaciones' as PhysicalSheetType, title: '5. Plantilla Donaciones', subtitle: 'Autorizadas por Supervisor de Planta', colBadge: 'Col X (-)', color: '#7C3AED', bg: '#F3E8FF', Icon: ShieldCheck }
          ].map(card => {
            const active = sheetType === card.id;
            const IconComp = card.Icon;
            return (
              <button key={card.id} type="button" onClick={() => {
                  setSheetType(card.id);
                  if (files.length > 0 || rawText.trim()) void executeAiExtraction(files, rawText, card.id, false);
                }}
                style={{ textAlign: 'left', padding: '0.55rem 0.75rem', borderRadius: '12px', border: active ? `2px solid ${card.color}` : '1px solid #E2E8F0', backgroundColor: active ? card.bg : '#F8FAFC', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '0.55rem' }}
              >
                <div style={{ padding: '0.35rem', borderRadius: '8px', backgroundColor: active ? '#FFFFFF' : '#E2E8F0', color: active ? card.color : '#64748B' }}>
                  <IconComp size={16} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>{card.title}</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 900, padding: '1px 6px', borderRadius: '6px', backgroundColor: '#FFFFFF', color: card.color, border: `1px solid ${card.color}44` }}>
                      {card.colBadge}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#475569' }}>{card.subtitle}</p>
                </div>
              </button>
            );
          })}
        </div>
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv,application/pdf,image/*" style={{ display: 'none' }} onChange={e => { handleInitialFilesSelected(e.target.files); e.target.value = ''; }} />
        <input ref={appendFileInputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv,application/pdf,image/*" style={{ display: 'none' }} onChange={e => { handleAppendFilesSelected(e.target.files); e.target.value = ''; }} />
        {/* FASE 1 (!isStaging): DROPZONE Y SELECTOR DE CANAL IDÉNTICO A /admin/orders/create */}
        {!isStaging ? (
          <div style={{ flex: 1, padding: '1.75rem 2.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', backgroundColor: '#FFFFFF' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ display: 'inline-flex', padding: '4px', backgroundColor: '#E2E8F0', borderRadius: '12px', gap: '4px' }}>
                <button type="button" onClick={() => setAiInputTab('file')} style={{ padding: '0.45rem 1.1rem', borderRadius: '8px', border: 'none', backgroundColor: aiInputTab === 'file' ? '#FFFFFF' : 'transparent', color: aiInputTab === 'file' ? '#1E293B' : '#64748B', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: aiInputTab === 'file' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                  <UploadCloud size={15} strokeWidth={2} />
                  <span>Subir Archivo (PDF / Excel / Foto)</span>
                </button>
                <button type="button" onClick={() => setAiInputTab('text')} style={{ padding: '0.45rem 1.1rem', borderRadius: '8px', border: 'none', backgroundColor: aiInputTab === 'text' ? '#16A34A' : 'transparent', color: aiInputTab === 'text' ? '#FFFFFF' : '#64748B', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: aiInputTab === 'text' ? '0 2px 4px rgba(22,163,74,0.25)' : 'none' }}>
                  <MessageSquare size={15} strokeWidth={2} />
                  <span>Pegar Texto / WhatsApp</span>
                </button>
              </div>
            </div>
            {errorMsg && (
              <div style={{ padding: '0.85rem 1.25rem', borderRadius: '12px', backgroundColor: '#FEF2F2', border: '1.5px solid #FCA5A5', color: '#991B1B', fontSize: '0.84rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color="#DC2626" />
                <span>{errorMsg}</span>
              </div>
            )}
            {aiInputTab === 'file' ? (
              <div style={{ flex: 1, minHeight: '360px', padding: '3rem', border: isExtracting ? '3px solid #3B82F6' : '2px dashed #CBD5E1', borderRadius: '24px', backgroundColor: isExtracting ? '#EFF6FF' : '#F8FAFC', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.backgroundColor = '#EFF6FF'; }}
                onDragLeave={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                onDrop={e => { e.preventDefault(); handleInitialFilesSelected(e.dataTransfer.files); }}
              >
                {isExtracting ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={56} color="#3B82F6" className="animate-spin" style={{ marginBottom: '1.25rem' }} />
                    <h3 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#1E40AF', marginBottom: '0.4rem' }}>Procesando Documento...</h3>
                    <p style={{ color: '#64748B', fontSize: '0.95rem' }}>{extractionProgress || 'La IA está leyendo la caligrafía de la planilla física y homologando SKUs del catálogo.'}</p>
                  </div>
                ) : (
                  <>
                    <div style={{ color: '#64748B', marginBottom: '1rem' }}><UploadCloud size={52} strokeWidth={1.5} /></div>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#1E293B', marginBottom: '0.5rem' }}>
                      Mesa de Trabajo Inteligente (Planillas Físicas de Bodega)
                    </h3>
                    <p style={{ color: '#64748B', fontSize: '0.95rem', maxWidth: '540px', margin: '0 auto' }}>
                      Arrastra la Foto de la Planilla, PDF o Excel aquí (soporta múltiples páginas). El sistema la tabulará automáticamente y abrirá el visor original Lado a Lado con la entrada de IA.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div style={{ padding: '1.75rem', border: isExtracting ? '3px solid #16A34A' : '2px solid #BBF7D0', borderRadius: '24px', backgroundColor: isExtracting ? '#F0FDF4' : '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <textarea value={rawText} onChange={e => setRawText(e.target.value)} placeholder="Pega aquí el texto de WhatsApp o listado de entradas/conteos/mermas..." rows={9} style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #CBD5E1', fontSize: '0.88rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', color: '#0F172A', backgroundColor: '#FFFFFF', outline: 'none' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" disabled={!rawText.trim() || isExtracting} onClick={() => void executeAiExtraction([], rawText, sheetType, false)} style={{ padding: '0.75rem 1.75rem', borderRadius: '12px', border: 'none', backgroundColor: !rawText.trim() || isExtracting ? '#94A3B8' : '#16A34A', color: '#FFFFFF', fontSize: '0.9rem', fontWeight: 800, cursor: !rawText.trim() || isExtracting ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={17} />
                    <span>{isExtracting ? 'Interpretando con IA...' : 'Interpretar Planilla con IA'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* FASE 2 (isStaging): MESA DE TRABAJO SPLIT-SCREEN LADO A LADO IDÉNTICA A /admin/orders/create */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1.75rem', backgroundColor: '#F0FDF4', borderBottom: '1px solid #BBF7D0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <CheckCircle2 size={24} color="#16A34A" />
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 900, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Validación de Planilla Física (Auditoría Lado a Lado en Vivo)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 900, color: '#0F172A' }}>{stats.total} renglones extraídos</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' }}>Nuevos: {stats.newEntries}</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', backgroundColor: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD' }}>Conciliados OPS: {stats.matched}</span>
                    {stats.discrepancies > 0 && (
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>Discrepancias OPS: {stats.discrepancies}</span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                {digestionDuration && (
                  <span style={{ backgroundColor: '#ECFDF5', color: '#065F46', border: '1.5px solid #6EE7B7', padding: '5px 12px', borderRadius: '100px', fontSize: '0.76rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <Zap size={13} fill="#059669" color="#059669" />
                    <span>Digestión: <strong>{digestionDuration}s</strong></span>
                  </span>
                )}
                <button type="button" onClick={() => appendFileInputRef.current?.click()} style={{ padding: '6px 12px', backgroundColor: '#FFFFFF', borderRadius: '100px', fontSize: '0.76rem', fontWeight: 800, color: '#0F766E', border: '1.5px solid #99F6E4', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <Plus size={13} /><span>Añadir Otra Hoja / Foto</span>
                </button>
                <button type="button" disabled={isExtracting} onClick={() => void executeAiExtraction(files, rawText, sheetType, false)} style={{ padding: '6px 14px', backgroundColor: '#F8FAFC', borderRadius: '100px', fontSize: '0.76rem', fontWeight: 800, color: '#334155', border: '1.5px solid #CBD5E1', cursor: isExtracting ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <RefreshCw size={13} className={isExtracting ? 'animate-spin' : ''} />
                  <span>{isExtracting ? 'Re-analizando...' : 'Re-analizar con IA'}</span>
                </button>
                <button type="button" onClick={() => setShowSideDocPreview(prev => !prev)} style={{ padding: '6px 14px', backgroundColor: showSideDocPreview ? '#DBEAFE' : '#EFF6FF', borderRadius: '100px', fontSize: '0.76rem', fontWeight: 800, color: '#1D4ED8', border: '1.5px solid #93C5FD', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={14} />
                  <span>{showSideDocPreview ? `Ocultar Visor ${docTypeLabel}` : `Ver ${docTypeLabel} Lado a Lado`}</span>
                </button>
              </div>
            </div>
            {errorMsg && (
              <div style={{ margin: '0.5rem 1.5rem 0', padding: '0.6rem 1rem', borderRadius: '10px', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={15} /><span>{errorMsg}</span>
              </div>
            )}
            {/* CUERPO SPLIT-SCREEN: DOCUMENTO ORIGINAL A LA IZQUIERDA + TABLA IA A LA DERECHA */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', overflow: 'hidden' }}>
              {showSideDocPreview && (
                <div style={{ width: '48%', minWidth: '420px', borderRight: '2px solid #E2E8F0', backgroundColor: '#F8FAFC', padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <FileText size={14} />{rawText && files.length === 0 ? 'Texto Original' : `${docTypeLabel} Original`}
                      </span>
                      {files.length > 1 && files.map((f, idx) => (
                        <button key={`${f.name}-${idx}`} type="button" onClick={() => { setActiveFileIdx(idx); setStackedView(false); }} style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', border: activeFileIdx === idx && !stackedView ? '1.5px solid #2563EB' : '1px solid #CBD5E1', backgroundColor: activeFileIdx === idx && !stackedView ? '#DBEAFE' : '#FFFFFF', color: activeFileIdx === idx && !stackedView ? '#1E40AF' : '#475569' }}>
                          Pág {idx + 1}
                        </button>
                      ))}
                      {files.length > 1 && !isActivePdf && !isActiveExcel && (
                        <button type="button" onClick={() => setStackedView(prev => !prev)} style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', border: stackedView ? '1.5px solid #059669' : '1px solid #CBD5E1', backgroundColor: stackedView ? '#ECFDF5' : '#FFFFFF', color: stackedView ? '#065F46' : '#475569' }}>
                          {stackedView ? 'Vista Individual' : `Apilar (${files.length})`}
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {!isActivePdf && !isActiveExcel && activePreviewUrl && (
                        <>
                          <button type="button" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} style={{ padding: '3px 6px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer' }} title="Alejar"><ZoomOut size={13} /></button>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#475569' }}>{Math.round(zoom * 100)}%</span>
                          <button type="button" onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))} style={{ padding: '3px 6px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer' }} title="Acercar"><ZoomIn size={13} /></button>
                          <button type="button" onClick={() => setRotation(r => (r + 90) % 360)} style={{ padding: '3px 6px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer' }} title="Rotar"><RotateCw size={13} /></button>
                        </>
                      )}
                      {activePreviewUrl && (
                        <a href={activePreviewUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                          <button type="button" style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, backgroundColor: '#FFFFFF', border: '1px solid #CBD5E1', color: '#1E293B', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Maximize2 size={11} /> Abrir Pestaña
                          </button>
                        </a>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: 1, borderRadius: '12px', overflow: 'hidden', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', display: 'flex', flexDirection: 'column' }}>
                    {rawText && files.length === 0 ? (
                      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', backgroundColor: '#F0FDF4', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '0.84rem', whiteSpace: 'pre-wrap', color: '#0F172A' }}>{rawText}</div>
                    ) : isActiveExcel ? (
                      <ExcelTableViewer file={activeFile} fileUrl={activePreviewUrl} />
                    ) : isActivePdf ? (
                      <PdfCanvasViewer file={activeFile} fileUrl={activePreviewUrl} />
                    ) : stackedView && previewUrls.length > 1 ? (
                      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', backgroundColor: '#F1F5F9', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {previewUrls.map((url, idx) => (
                          <div key={url} style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                            <div style={{ padding: '4px 10px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '0.68rem', fontWeight: 700, color: '#64748B' }}>Página {idx + 1} — {files[idx]?.name}</div>
                            <img src={url} alt={`Página ${idx + 1}`} style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }} />
                          </div>
                        ))}
                      </div>
                    ) : activePreviewUrl ? (
                      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', backgroundColor: '#F8FAFC' }}>
                        <img src={activePreviewUrl} alt="Planilla Original" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px', transform: `scale(${zoom}) rotate(${rotation}deg)`, transition: 'transform 0.15s ease' }} />
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
              <PhysicalSheetStagingTable
                sheetType={sheetType}
                reconciledRows={reconciledRows}
                filteredCatalog={catalog}
                onToggleSelect={(rowId, selected) => setReconciledRows(prev => prev.map(r => (r.rowId === rowId ? { ...r, selected } : r)))}
                onToggleSelectAll={selected => setReconciledRows(prev => prev.map(r => ({ ...r, selected })))}
                onProductChange={handleRowProductChange}
                onColChange={handleRowColChange}
                onQtyChange={handleRowQtyChange}
                onResolutionChange={(rowId: string, resolution: ArbitrationResolution) => setReconciledRows(prev => prev.map(r => (r.rowId === rowId ? { ...r, resolution } : r)))}
                onAddManualRow={handleAddManualRow}
                onDeleteRow={rowId => setReconciledRows(prev => prev.filter(r => r.rowId !== rowId))}
              />
            </div>
            <div style={{ padding: '1rem 1.75rem', backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" onClick={handleResetWorkspace} style={{ padding: '9px 18px', borderRadius: '12px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#64748B', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>
                Cancelar y Limpiar
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>Renglones Homologados a Inyectar</div>
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0F172A' }}>{stats.active} de {stats.total} productos listos ({balanceDate})</div>
                </div>
                <button type="button" disabled={isSaving || stats.active === 0} onClick={handleApproveAndCommit} style={{ padding: '11px 24px', borderRadius: '14px', border: 'none', backgroundColor: stats.active === 0 || isSaving ? '#94A3B8' : '#16A34A', color: '#FFFFFF', fontSize: '0.9rem', fontWeight: 900, cursor: stats.active === 0 || isSaving ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: stats.active === 0 || isSaving ? 'none' : '0 4px 12px rgba(22, 163, 74, 0.3)' }}>
                  <span>{isSaving ? 'Inyectando a la Sábana...' : 'Confirmar e Inyectar a la Sábana'}</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
