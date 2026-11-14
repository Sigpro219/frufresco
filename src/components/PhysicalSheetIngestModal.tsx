'use client';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, UploadCloud, Sparkles, Truck, ClipboardCheck, Trash2, AlertTriangle, ZoomIn, ZoomOut, RotateCw, FileText, RefreshCw, ArrowRight, ShieldCheck, CheckCircle2, MessageSquare, Zap, Maximize2, Loader2, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { INVENTORY_MOVEMENT_SUBTYPES } from '@/lib/constants';
import { getBogotaDayRangeUtcIso } from '@/lib/dateUtils';
import PdfCanvasViewer from '@/components/PdfCanvasViewer';
import ExcelTableViewer from '@/components/ExcelTableViewer';
import PhysicalSheetStagingTable from '@/components/PhysicalSheetStagingTable';
import { PhysicalSheetType, TargetBalanceColumn, CatalogProductOption, ReconciledSheetRow, RawExtractedSheetRow, ArbitrationResolution, buildReconciledSheetRows, classifyWasteTargetColumn } from '@/lib/inventory/physical-sheet-parser';

interface PdfJsViewport {
  width: number;
  height: number;
}
interface PdfJsPage {
  getViewport: (opts: { scale: number }) => PdfJsViewport;
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: PdfJsViewport }) => { promise: Promise<void> };
}
interface PdfJsDocument {
  numPages: number;
  getPage: (pageNum: number) => Promise<PdfJsPage>;
}
interface PdfJsLibrary {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (opts: { data: Uint8Array }) => { promise: Promise<PdfJsDocument> };
}
interface WindowWithPdfJs extends Window {
  pdfjsLib?: PdfJsLibrary;
}
interface ExtractPhysicalSheetApiResponse {
  success?: boolean;
  error?: string;
  results?: Array<{ fileName: string; items: RawExtractedSheetRow[] }>;
}

interface CommittedItemSummary {
  productId: string;
  accountingId: string;
  productName: string;
  unit: string;
  targetColumn: TargetBalanceColumn;
  totalQuantity: number;
  rawDetails: string;
  status: 'inserted' | 'updated';
}

interface CommitSummaryData {
  balanceDate: string;
  sheetType: PhysicalSheetType;
  totalExtractedRows: number;
  omittedZeroOrUnmatchedRows: number;
  injectedProductsCount: number;
  insertedCount: number;
  updatedCount: number;
  durationSec: string;
  filesProcessed: string[];
  totalsByCol: Record<TargetBalanceColumn, { count: number; totalQty: number }>;
  items: CommittedItemSummary[];
}

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
  const [collapseTitleBar, setCollapseTitleBar] = useState<boolean>(false);
  const [collapseStatsBar, setCollapseStatsBar] = useState<boolean>(false);
  const [commitSummary, setCommitSummary] = useState<CommitSummaryData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendFileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  previewUrlsRef.current = previewUrls;
  const isStaging = reconciledRows.length > 0 && !commitSummary;

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    };
  }, []);

  // Si un PDF escaneado supera 3.2 MB (ej. CamScanner pesado), desglosar sus páginas en imágenes JPEG ligeras (~220 KB c/u) usando el mismo motor PDF.js 3.11.174 de PdfCanvasViewer
  const sliceHeavyPdfIntoPageJpegs = async (file: File): Promise<{ pages: File[]; warning: string | null }> => {
    const MAX_VERCEL_SAFE_BYTES = 3.2 * 1024 * 1024;
    const MAX_PDF_PAGES = 50;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf || file.size <= MAX_VERCEL_SAFE_BYTES || typeof window === 'undefined') {
      return { pages: [file], warning: null };
    }
    try {
      setExtractionProgress(`Optimizando páginas de ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`);
      const win = window as unknown as WindowWithPdfJs;
      if (!win.pdfjsLib) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.async = true;
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
        if (win.pdfjsLib) {
          win.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
      }
      if (!win.pdfjsLib) {
        return { pages: [file], warning: null };
      }
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await win.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const rawNumPages = pdf.numPages || 1;
      const totalPages = Math.min(rawNumPages, MAX_PDF_PAGES);
      const pageLimitWarning =
        rawNumPages > MAX_PDF_PAGES
          ? `Advertencia: El archivo ${file.name} contiene ${rawNumPages} páginas; se procesaron las primeras ${MAX_PDF_PAGES} páginas permitidas por lote.`
          : null;
      const baseName = file.name.replace(/\.pdf$/i, '');
      const pageFiles: File[] = [];

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        setExtractionProgress(`Preparando página ${pageNum} de ${totalPages} (${file.name})...`);
        const page = await pdf.getPage(pageNum);
        const unscaledVp = page.getViewport({ scale: 1 });
        const maxDim = 1600;
        const scale = Math.min(2.0, maxDim / Math.max(unscaledVp.width, unscaledVp.height, 1));
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob: Blob | null = await new Promise(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.78));
        if (blob) {
          pageFiles.push(
            new File([blob], `${baseName} - Pág ${pageNum}.jpg`, { type: 'image/jpeg' })
          );
        }
      }
      return { pages: pageFiles.length > 0 ? pageFiles : [file], warning: pageLimitWarning };
    } catch (pdfErr) {
      console.warn('Fallback a archivo PDF original:', pdfErr);
      return { pages: [file], warning: null };
    }
  };

  // Si una foto individual supera 3.2 MB (límite de Vercel = 4.5 MB), comprimirla ligeramente para evitar HTTP 413; de lo contrario enviarla intacta igual que en /admin/orders/create
  const ensureFileUnderVercelLimit = async (file: File): Promise<File> => {
    const MAX_VERCEL_SAFE_BYTES = 3.2 * 1024 * 1024;
    if (file.size <= MAX_VERCEL_SAFE_BYTES || !file.type.startsWith('image/')) {
      return file;
    }
    return new Promise<File>((resolve) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        const maxDim = 1600;
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
          resolve(file);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file);
              return;
            }
            const baseName = file.name.replace(/\.[^.]+$/, '');
            resolve(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          0.78
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve(file);
      };
      img.src = objUrl;
    });
  };

  // Arquitectura 1:1 copiada de parseOrderWithAI (/admin/orders/create/page.tsx)
  const executeAiExtraction = async (targetFiles: File[], targetText: string, targetSheetType: PhysicalSheetType, appendMode = false) => {
    if (targetFiles.length === 0 && !targetText.trim()) {
      setErrorMsg('Selecciona al menos un archivo (Foto, PDF o Excel) o pega el texto de la planilla.');
      return;
    }
    setIsExtracting(true);
    setErrorMsg(null);
    setExtractionProgress('Analizando documento con IA...');
    const startMs = performance.now();

    try {
      // 1. Obtener token de sesión idéntico a /admin/orders/create/page.tsx (líneas 3172-3200)
      let token: string | null = null;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.access_token) {
          token = sessionData.session.access_token;
        } else {
          const { data: refreshData } = await supabase.auth.refreshSession();
          token = refreshData?.session?.access_token || null;
        }
      } catch (authErr) {
        console.warn('Error al verificar sesión con Supabase Auth:', authErr);
      }

      if (!token && typeof window !== 'undefined') {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.includes('sb-') || k.includes('supabase.auth.token'))) {
              const parsed = JSON.parse(localStorage.getItem(k) || '{}') as { access_token?: string; currentSession?: { access_token?: string } };
              const found = parsed?.access_token || parsed?.currentSession?.access_token || null;
              if (found) {
                token = found;
                break;
              }
            }
          }
        } catch (storageErr) {
          console.warn('No se pudo leer token de respaldo en localStorage:', storageErr);
        }
      }

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const extractedRows: ReconciledSheetRow[] = [];
      let accumulatedWarning: string | null = null;

      // 2. Preparar archivos (si algún PDF supera 3.2 MB, desglosar sus páginas en JPEGs ligeros ~220 KB c/u para no chocar jamás con el límite de 4.5 MB de Vercel)
      if (targetFiles.length > 0) {
        const expandedFiles: File[] = [];
        for (const f of targetFiles) {
          const { pages: pagesOrFile, warning } = await sliceHeavyPdfIntoPageJpegs(f);
          if (warning) accumulatedWarning = warning;
          for (const pf of pagesOrFile) {
            expandedFiles.push(await ensureFileUnderVercelLimit(pf));
          }
        }

        // Agrupar páginas/archivos en lotes seguros de máximo 2 archivos y máximo 2.8 MB por petición HTTP
        const requestBatches: File[][] = [];
        let currentBatch: File[] = [];
        let currentBatchBytes = 0;
        const MAX_BATCH_BYTES = 2.8 * 1024 * 1024;

        for (const ef of expandedFiles) {
          if (
            currentBatch.length > 0 &&
            (currentBatch.length >= 2 || currentBatchBytes + ef.size > MAX_BATCH_BYTES)
          ) {
            requestBatches.push(currentBatch);
            currentBatch = [];
            currentBatchBytes = 0;
          }
          currentBatch.push(ef);
          currentBatchBytes += ef.size;
        }
        if (currentBatch.length > 0) {
          requestBatches.push(currentBatch);
        }

        for (let bIdx = 0; bIdx < requestBatches.length; bIdx++) {
          const batch = requestBatches[bIdx];
          const batchLabel = batch.map(f => f.name).join(', ');
          setExtractionProgress(
            requestBatches.length > 1
              ? `Interpretando con IA bloque ${bIdx + 1} de ${requestBatches.length} (${batchLabel})...`
              : `Interpretando ${batchLabel} con IA...`
          );

          const formData = new FormData();
          formData.append('sheetType', targetSheetType);
          formData.append('balanceDate', balanceDate);
          if (bIdx === 0 && targetText.trim()) {
            formData.append('text', targetText.trim());
          }

          // Si un archivo individual aún supera 3.2 MB, usar URL firmada con service_role en el servidor
          const singleHeavyFile = batch.length === 1 && batch[0].size > 3.2 * 1024 * 1024 ? batch[0] : null;
          if (singleHeavyFile) {
            setExtractionProgress(`Subiendo documento (${(singleHeavyFile.size / (1024 * 1024)).toFixed(1)} MB) por canal seguro...`);
            const signedRes = await fetch(
              `/api/commercial/inventory/extract-physical-sheet?fileName=${encodeURIComponent(singleHeavyFile.name)}`,
              { method: 'GET', headers, credentials: 'include' }
            );
            const signedData = await signedRes.json().catch(() => null);
            if (signedRes.ok && signedData?.path && signedData?.token) {
              const { error: upErr } = await supabase.storage
                .from('inventory-evidence')
                .uploadToSignedUrl(signedData.path, signedData.token, singleHeavyFile);
              if (!upErr) {
                formData.append('fileUrl', signedData.publicUrl);
                formData.append('storagePath', signedData.path);
                formData.append('fileName', singleHeavyFile.name);
                formData.append('fileMimeType', singleHeavyFile.type || 'application/pdf');
              } else {
                formData.append('file', singleHeavyFile);
              }
            } else {
              formData.append('file', singleHeavyFile);
            }
          } else if (batch.length === 1) {
            formData.append('file', batch[0]);
          } else {
            batch.forEach(f => formData.append('files', f));
          }

          const response = await fetch('/api/commercial/inventory/extract-physical-sheet', {
            method: 'POST',
            headers,
            credentials: 'include',
            body: formData
          });

          const responseText = await response.text();
          let data: ExtractPhysicalSheetApiResponse | null = null;
          try {
            data = JSON.parse(responseText) as ExtractPhysicalSheetApiResponse;
          } catch {
            if (response.status === 413) {
              throw new Error(`El bloque (${batchLabel}) excedió el límite de red (413). Intenta nuevamente.`);
            }
            if (!response.ok) {
              throw new Error(responseText || `Error de servidor (${response.status})`);
            }
            throw new Error('Respuesta no válida de la API de extracción');
          }

          if (!response.ok || !data?.success) {
            throw new Error(data?.error || 'No fue posible extraer la planilla física.');
          }

          (data.results || []).forEach((fileRes: { fileName: string; items: RawExtractedSheetRow[] }) => {
            extractedRows.push(...buildReconciledSheetRows(fileRes.items || [], targetSheetType, fileRes.fileName, catalog, opsCurrentByProductAndCol));
          });
        }
      } else if (targetText.trim()) {
        const formData = new FormData();
        formData.append('sheetType', targetSheetType);
        formData.append('balanceDate', balanceDate);
        formData.append('text', targetText.trim());

        const response = await fetch('/api/commercial/inventory/extract-physical-sheet', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: formData
        });

        const responseText = await response.text();
        let data: ExtractPhysicalSheetApiResponse | null = null;
        try {
          data = JSON.parse(responseText) as ExtractPhysicalSheetApiResponse;
        } catch {
          if (!response.ok) {
            throw new Error(responseText || `Error de servidor (${response.status})`);
          }
          throw new Error('Respuesta no válida de la API de extracción');
        }

        if (!response.ok || !data?.success) {
          throw new Error(data?.error || 'No fue posible extraer la planilla física.');
        }

        (data.results || []).forEach((fileRes: { fileName: string; items: RawExtractedSheetRow[] }) => {
          extractedRows.push(...buildReconciledSheetRows(fileRes.items || [], targetSheetType, fileRes.fileName, catalog, opsCurrentByProductAndCol));
        });
      }

      setDigestionDuration(((performance.now() - startMs) / 1000).toFixed(1));
      setReconciledRows(prev => (appendMode ? [...prev, ...extractedRows] : extractedRows));
      if (extractedRows.length > 0) {
        setCollapseTitleBar(true);
        setCollapseStatsBar(true);
      }
      if (accumulatedWarning) {
        setErrorMsg(accumulatedWarning);
      } else if (extractedRows.length === 0 && !appendMode) {
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
    previewUrls.forEach(u => URL.revokeObjectURL(u));
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
    setCommitSummary(null);
    setErrorMsg(null);
    setDigestionDuration(null);
    setActiveFileIdx(0);
    setCollapseTitleBar(false);
    setCollapseStatsBar(false);
  };
  const handleCloseModal = () => {
    previewUrls.forEach(u => URL.revokeObjectURL(u));
    setCommitSummary(null);
    onClose();
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
        return {
          ...r,
          quantity: safeQty,
          conciliationStatus: status,
          selected: safeQty > 0 ? Boolean(r.matchedProductId) : false
        };
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
        selected: false
      }
    ]);
  };
  const stats = useMemo(() => {
    const active = reconciledRows.filter(r => r.selected && r.matchedProductId && r.quantity > 0);
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
      setErrorMsg('No hay filas activas con cantidad mayor a cero (> 0) para inyectar a la Sábana.');
      return;
    }
    setIsSaving(true);
    setErrorMsg(null);
    const commitStartMs = performance.now();
    try {
      const { data: whData } = await supabase.from('warehouses').select('id').limit(1).single();
      const warehouseId = whData?.id || null;
      const grouped = new Map<
        string,
        {
          productId: string;
          accountingId: string;
          productName: string;
          unit: string;
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
          accountingId: r.matchedAccountingId || 'S/N',
          productName: r.matchedProductName || r.rawProductName,
          unit: r.matchedUnit || 'Kg',
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

      const validItems = Array.from(grouped.values()).filter(item => item.totalQuantity > 0);
      const { startUtcIso: startIso, endUtcIso: endIso } = getBogotaDayRangeUtcIso(balanceDate);
      const timestampIso = new Date(`${balanceDate}T12:00:00.000-05:00`).toISOString();

      const getRefType = (col: TargetBalanceColumn): string =>
        col === 'G'
          ? 'purchase_reception'
          : col === 'Q'
          ? INVENTORY_MOVEMENT_SUBTYPES.WASTE_DAMAGE
          : col === 'R'
          ? INVENTORY_MOVEMENT_SUBTYPES.WASTE_CLEANING
          : col === 'X'
          ? INVENTORY_MOVEMENT_SUBTYPES.FOOD_BANK
          : INVENTORY_MOVEMENT_SUBTYPES.BLIND_COUNT;

      // 1. Consultar en 1 sola petición todos los movimientos existentes de la jornada para los productos afectados
      const uniqueProductIds = Array.from(new Set(validItems.map(i => i.productId)));
      const { data: allExistingDayMovs } = await supabase
        .from('inventory_movements')
        .select('id, product_id, reference_type')
        .in('product_id', uniqueProductIds)
        .gte('created_at', startIso)
        .lte('created_at', endIso);

      const existingByProdAndRef = new Map<string, string[]>();
      (allExistingDayMovs || []).forEach((m: { id: string; product_id: string | null; reference_type: string | null }) => {
        if (!m.product_id || !m.reference_type) return;
        const k = `${m.product_id}__${m.reference_type}`;
        const arr = existingByProdAndRef.get(k) || [];
        arr.push(m.id);
        existingByProdAndRef.set(k, arr);
      });

      const toInsert: Array<{
        product_id: string;
        warehouse_id: string | null;
        quantity: number;
        type: 'entry' | 'exit' | 'adjustment';
        reference_type: string;
        notes: string;
        created_at: string;
      }> = [];
      const toUpdate: Array<{ id: string; quantity: number; type: 'entry' | 'exit' | 'adjustment'; notes: string }> = [];
      const duplicateIdsToDelete: string[] = [];
      const committedItems: CommittedItemSummary[] = [];
      const totalsByCol: Record<TargetBalanceColumn, { count: number; totalQty: number }> = {
        G: { count: 0, totalQty: 0 },
        T: { count: 0, totalQty: 0 },
        Q: { count: 0, totalQty: 0 },
        R: { count: 0, totalQty: 0 },
        X: { count: 0, totalQty: 0 }
      };
      const allFilesSet = new Set<string>();

      for (const item of validItems) {
        const movType: 'entry' | 'exit' | 'adjustment' =
          item.targetColumn === 'G' ? 'entry' : item.targetColumn === 'T' ? 'adjustment' : 'exit';
        const refType = getRefType(item.targetColumn);
        const signedQty =
          item.targetColumn === 'G' ? item.totalQuantity : item.targetColumn === 'T' ? 0 : -item.totalQuantity;
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
        const existingIds = existingByProdAndRef.get(`${item.productId}__${refType}`) || [];
        const isUpdate = existingIds.length > 0;

        if (isUpdate) {
          toUpdate.push({ id: existingIds[0], quantity: signedQty, type: movType, notes: noteDesc });
          if (existingIds.length > 1) {
            duplicateIdsToDelete.push(...existingIds.slice(1));
          }
        } else {
          toInsert.push({
            product_id: item.productId,
            warehouse_id: warehouseId,
            quantity: signedQty,
            type: movType,
            reference_type: refType,
            notes: noteDesc,
            created_at: timestampIso
          });
        }

        item.files.forEach(f => allFilesSet.add(f));
        totalsByCol[item.targetColumn].count += 1;
        totalsByCol[item.targetColumn].totalQty =
          Math.round((totalsByCol[item.targetColumn].totalQty + item.totalQuantity) * 100) / 100;

        committedItems.push({
          productId: item.productId,
          accountingId: item.accountingId,
          productName: item.productName,
          unit: item.unit,
          targetColumn: item.targetColumn,
          totalQuantity: item.totalQuantity,
          rawDetails: item.rawDetails.join(' + '),
          status: isUpdate ? 'updated' : 'inserted'
        });
      }

      // 2. Ejecutar inserciones en bloque y actualizaciones en paralelo
      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from('inventory_movements').insert(toInsert);
        if (insErr) throw insErr;
      }
      if (duplicateIdsToDelete.length > 0) {
        await supabase.from('inventory_movements').delete().in('id', duplicateIdsToDelete);
      }
      if (toUpdate.length > 0) {
        const CHUNK_SIZE = 20;
        for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
          const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
          await Promise.all(
            chunk.map(u =>
              supabase
                .from('inventory_movements')
                .update({ quantity: u.quantity, type: u.type, notes: u.notes })
                .eq('id', u.id)
            )
          );
        }
      }

      // 3. Actualizar matriz de costos PPP si hubo entradas en Col G con costo
      for (const item of validItems) {
        const pppCost =
          item.weightedCostDenominator > 0
            ? Math.round((item.weightedCostNumerator / item.weightedCostDenominator) * 100) / 100
            : null;
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

      const durationSec = ((performance.now() - commitStartMs) / 1000).toFixed(1);
      setCollapseTitleBar(false);
      setCommitSummary({
        balanceDate,
        sheetType,
        totalExtractedRows: reconciledRows.length,
        omittedZeroOrUnmatchedRows: Math.max(0, reconciledRows.length - rowsToApply.length),
        injectedProductsCount: committedItems.length,
        insertedCount: toInsert.length,
        updatedCount: toUpdate.length,
        durationSec,
        filesProcessed: Array.from(allFilesSet),
        totalsByCol,
        items: committedItems.sort((a, b) => a.productName.localeCompare(b.productName, 'es', { sensitivity: 'base' }))
      });
      onSuccess();
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
  const isCompactMode = collapseTitleBar && (collapseStatsBar || !isStaging);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isStaging ? '0.25rem 0.35rem' : '1rem' }}>
      <div style={{ width: '100%', maxWidth: isStaging ? '99vw' : '1600px', height: isStaging ? '97.5vh' : '93vh', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: isStaging ? '14px' : '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
        {/* FILA 1 (COLAPSIBLE): CABECERA PRINCIPAL */}
        {!collapseTitleBar && (
          <div style={{ padding: '0.7rem 1.25rem', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#ECFDF5', border: '1.5px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                <Sparkles size={18} strokeWidth={2.2} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#0F172A' }}>
                    Mesa de Trabajo Inteligente — Planillas Físicas de Bodega (IA)
                  </h2>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 9px', borderRadius: '999px', backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <ShieldCheck size={12} /> Arbitraje Anti-Colisión OPS Activo
                  </span>
                </div>
                <p style={{ margin: '1px 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                  Jornada contable destino: <strong style={{ color: '#0F172A' }}>{balanceDate}</strong> · Vista dividida Lado a Lado idéntica al Módulo de Pedidos
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setCollapseTitleBar(true)}
                title="Colapsar esta cabecera para ganar espacio de trabajo"
                style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <ChevronUp size={14} />
                <span>Ocultar título</span>
              </button>
              <button type="button" onClick={handleCloseModal} title="Cerrar ventana" style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#64748B', borderRadius: '9px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        {/* FILA 2 (FIJA / COMPACTA): SELECTOR DE LAS 5 MODALIDADES + CONTROLES COMPACTOS CUANDO LAS BARRAS CON X ESTÁN COLAPSADAS */}
        <div style={{ padding: isStaging ? '0.4rem 1rem' : '0.55rem 1.25rem', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '0.45rem' }}>
            {[
              { id: 'entrada' as PhysicalSheetType, title: '1. Entradas Muelle', subtitle: 'Unidad compra directa', colBadge: 'Col G (+)', color: '#059669', bg: '#ECFDF5', Icon: Truck },
              { id: 'inv_manual' as PhysicalSheetType, title: '2. Conteo Fin Turno', subtitle: 'Cierre bodega 7:00 PM', colBadge: 'Col T (Físico)', color: '#0284C7', bg: '#E0F2FE', Icon: ClipboardCheck },
              { id: 'pedidos_desperdicio' as PhysicalSheetType, title: '3. Formato Pedidos', subtitle: 'Desperdicio y Basura', colBadge: 'Cols Q y R (-)', color: '#D97706', bg: '#FEF3C7', Icon: FileText },
              { id: 'desperdicio' as PhysicalSheetType, title: '4. Desperdicio Gral.', subtitle: 'Avería y descapote', colBadge: 'Cols Q y R (-)', color: '#E11D48', bg: '#FFE4E6', Icon: Trash2 },
              { id: 'donaciones' as PhysicalSheetType, title: '5. Donaciones', subtitle: 'Autorizadas Planta', colBadge: 'Col X (-)', color: '#7C3AED', bg: '#F3E8FF', Icon: ShieldCheck }
            ].map(card => {
              const active = sheetType === card.id;
              const IconComp = card.Icon;
              return (
                <button key={card.id} type="button" onClick={() => {
                    const prevType = sheetType;
                    setSheetType(card.id);
                    setCommitSummary(null);
                    if (reconciledRows.length > 0 && prevType !== 'pedidos_desperdicio' && card.id !== 'pedidos_desperdicio') {
                      setReconciledRows(prev =>
                        prev.map(r => {
                          const newCol: TargetBalanceColumn =
                            card.id === 'entrada'
                              ? 'G'
                              : card.id === 'inv_manual'
                              ? 'T'
                              : card.id === 'donaciones'
                              ? 'X'
                              : classifyWasteTargetColumn(r.rawProductName, null);
                          const opsVal = r.matchedProductId
                            ? Number(opsCurrentByProductAndCol.get(r.matchedProductId)?.[newCol] || 0)
                            : 0;
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
                    } else if (files.length > 0 || rawText.trim()) {
                      void executeAiExtraction(files, rawText, card.id, false);
                    }
                  }}
                  style={{ textAlign: 'left', padding: isStaging ? '0.35rem 0.55rem' : '0.45rem 0.65rem', borderRadius: '10px', border: active ? `2px solid ${card.color}` : '1px solid #E2E8F0', backgroundColor: active ? card.bg : '#F8FAFC', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.45rem' }}
                >
                  <div style={{ padding: '0.28rem', borderRadius: '7px', backgroundColor: active ? '#FFFFFF' : '#E2E8F0', color: active ? card.color : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IconComp size={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px' }}>
                      <span style={{ fontSize: '0.73rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.title}</span>
                      <span style={{ fontSize: '0.58rem', fontWeight: 900, padding: '1px 5px', borderRadius: '5px', backgroundColor: '#FFFFFF', color: card.color, border: `1px solid ${card.color}44`, whiteSpace: 'nowrap' }}>
                        {card.colBadge}
                      </span>
                    </div>
                    {!isStaging && (
                      <p style={{ margin: '1px 0 0', fontSize: '0.64rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.subtitle}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {/* CLUSTER DERECHO ULTRA-COMPACTO CUANDO LAS BARRAS CON X ESTÁN COLAPSADAS */}
          {(collapseTitleBar || (isStaging && collapseStatsBar)) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
              {isStaging && collapseStatsBar && (
                <>
                  <span
                    onClick={() => setCollapseStatsBar(false)}
                    title="Clic para desplegar detalle de validación"
                    style={{ fontSize: '0.7rem', fontWeight: 900, padding: '4px 9px', borderRadius: '8px', backgroundColor: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                  >
                    <CheckCircle2 size={12} color="#16A34A" />
                    <span>{stats.total} renglones ({stats.newEntries} nuevos)</span>
                  </span>
                  {digestionDuration && (
                    <span style={{ backgroundColor: '#ECFDF5', color: '#065F46', border: '1px solid #6EE7B7', padding: '4px 8px', borderRadius: '8px', fontSize: '0.68rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
                      <Zap size={11} fill="#059669" color="#059669" />
                      <span>{digestionDuration}s</span>
                    </span>
                  )}
                  <button type="button" onClick={() => appendFileInputRef.current?.click()} title="Añadir Otra Hoja / Foto" style={{ padding: '4px 9px', backgroundColor: '#FFFFFF', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 800, color: '#0F766E', border: '1px solid #99F6E4', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                    <Plus size={12} /><span>+ Hoja</span>
                  </button>
                  <button type="button" disabled={isExtracting} onClick={() => void executeAiExtraction(files, rawText, sheetType, false)} title="Re-analizar con IA" style={{ padding: '4px 9px', backgroundColor: '#F8FAFC', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 800, color: '#334155', border: '1px solid #CBD5E1', cursor: isExtracting ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                    <RefreshCw size={12} className={isExtracting ? 'animate-spin' : ''} />
                    <span>{isExtracting ? '...' : 'Re-analizar'}</span>
                  </button>
                  <button type="button" onClick={() => setShowSideDocPreview(prev => !prev)} style={{ padding: '4px 9px', backgroundColor: showSideDocPreview ? '#DBEAFE' : '#EFF6FF', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 800, color: '#1D4ED8', border: '1px solid #93C5FD', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                    <FileText size={12} />
                    <span>{showSideDocPreview ? `Ocultar ${docTypeLabel}` : `Ver ${docTypeLabel}`}</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  const nextCollapsed = !isCompactMode;
                  setCollapseTitleBar(nextCollapsed);
                  if (isStaging) setCollapseStatsBar(nextCollapsed);
                }}
                title={isCompactMode ? 'Expandir barras de título y validación' : 'Colapsar barras de título y validación para ganar más espacio'}
                style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', color: '#334155', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}
              >
                {isCompactMode ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                <span>{isCompactMode ? 'Expandir' : 'Compactar'}</span>
              </button>
              {collapseTitleBar && (
                <button type="button" onClick={handleCloseModal} title="Cerrar ventana" style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#64748B', borderRadius: '8px', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={15} />
                </button>
              )}
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv,application/pdf,image/*" style={{ display: 'none' }} onChange={e => { handleInitialFilesSelected(e.target.files); e.target.value = ''; }} />
        <input ref={appendFileInputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv,application/pdf,image/*" style={{ display: 'none' }} onChange={e => { handleAppendFilesSelected(e.target.files); e.target.value = ''; }} />
        {/* FASE 3 (commitSummary): MENSAJE DE ÉXITO Y RESUMEN EJECUTIVO DE LO CARGADO A LA SÁBANA */}
        {commitSummary ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#F8FAFC' }}>
            <div style={{ padding: '1.1rem 1.5rem', backgroundColor: '#ECFDF5', borderBottom: '2px solid #6EE7B7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#16A34A', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' }}>
                  <CheckCircle2 size={26} strokeWidth={2.5} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#064E3B' }}>
                      Planilla Inyectada con Éxito al Balance Diario
                    </h3>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 9px', borderRadius: '999px', backgroundColor: '#D1FAE5', color: '#065F46', border: '1px solid #34D399' }}>
                      Jornada: {commitSummary.balanceDate}
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 9px', borderRadius: '999px', backgroundColor: '#FFFFFF', color: '#047857', border: '1px solid #6EE7B7' }}>
                      Tiempo de inyección: {commitSummary.durationSec}s
                    </span>
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#047857', fontWeight: 600 }}>
                    Se cargaron únicamente los productos parametrizados con cantidad mayor a cero (&gt; 0). La Sábana de 24 Columnas ya fue actualizada.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <button
                  type="button"
                  onClick={handleResetWorkspace}
                  style={{ padding: '8px 14px', borderRadius: '10px', border: '1.5px solid #059669', backgroundColor: '#FFFFFF', color: '#065F46', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={15} />
                  <span>Cargar Otra Planilla / Hoja</span>
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  style={{ padding: '9px 18px', borderRadius: '10px', border: 'none', backgroundColor: '#16A34A', color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' }}
                >
                  <span>Cerrar y Ver en la Sábana</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>

            {/* TARJETAS KPI DEL RESUMEN DE CARGUE */}
            <div style={{ padding: '0.9rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', borderBottom: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
              <div style={{ padding: '0.75rem 1rem', borderRadius: '12px', backgroundColor: '#F0FDF4', border: '1.5px solid #86EFAC' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>Productos Inyectados (&gt; 0)</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#14532D', marginTop: '2px' }}>
                  {commitSummary.injectedProductsCount} <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>SKUs</span>
                </div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803D', marginTop: '2px' }}>
                  {commitSummary.insertedCount} nuevos · {commitSummary.updatedCount} actualizados
                </div>
              </div>

              {(['G', 'T', 'Q', 'R', 'X'] as TargetBalanceColumn[])
                .filter(col => commitSummary.totalsByCol[col].count > 0)
                .map(col => (
                  <div key={col} style={{ padding: '0.75rem 1rem', borderRadius: '12px', backgroundColor: '#EFF6FF', border: '1.5px solid #93C5FD' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase' }}>
                      Total Cargado en Columna {col}
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#1E3A8A', marginTop: '2px' }}>
                      {commitSummary.totalsByCol[col].totalQty.toLocaleString('es-CO', { maximumFractionDigits: 2 })}{' '}
                      <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Kg / Und</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1D4ED8', marginTop: '2px' }}>
                      En {commitSummary.totalsByCol[col].count} productos de Col {col}
                    </div>
                  </div>
                ))}

              <div style={{ padding: '0.75rem 1rem', borderRadius: '12px', backgroundColor: '#F8FAFC', border: '1.5px solid #CBD5E1' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Renglones en Cero Omitidos</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#334155', marginTop: '2px' }}>
                  {commitSummary.omittedZeroOrUnmatchedRows} <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>de {commitSummary.totalExtractedRows}</span>
                </div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B', marginTop: '2px' }}>
                  Descartados por tener raya (&mdash;) o valor 0
                </div>
              </div>
            </div>

            {/* TABLA DETALLADA DE LOS PRODUCTOS CARGADOS */}
            <div style={{ flex: 1, padding: '0.85rem 1.5rem', overflowY: 'auto' }}>
              <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #CBD5E1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', top: 0, backgroundColor: '#F8FAFC', padding: '0.6rem 0.85rem', borderBottom: '2px solid #E2E8F0', fontSize: '0.7rem', fontWeight: 800, color: '#475569' }}>#</th>
                      <th style={{ position: 'sticky', top: 0, backgroundColor: '#F8FAFC', padding: '0.6rem 0.85rem', borderBottom: '2px solid #E2E8F0', fontSize: '0.7rem', fontWeight: 800, color: '#475569' }}>ID CONTABLE</th>
                      <th style={{ position: 'sticky', top: 0, backgroundColor: '#F8FAFC', padding: '0.6rem 0.85rem', borderBottom: '2px solid #E2E8F0', fontSize: '0.7rem', fontWeight: 800, color: '#475569' }}>PRODUCTO HOMOLOGADO</th>
                      <th style={{ position: 'sticky', top: 0, backgroundColor: '#F8FAFC', padding: '0.6rem 0.85rem', borderBottom: '2px solid #E2E8F0', fontSize: '0.7rem', fontWeight: 800, color: '#475569' }}>DETALLE EN PLANILLA</th>
                      <th style={{ position: 'sticky', top: 0, backgroundColor: '#F8FAFC', padding: '0.6rem 0.85rem', borderBottom: '2px solid #E2E8F0', fontSize: '0.7rem', fontWeight: 800, color: '#475569', textAlign: 'center' }}>COLUMNA</th>
                      <th style={{ position: 'sticky', top: 0, backgroundColor: '#F8FAFC', padding: '0.6rem 0.85rem', borderBottom: '2px solid #E2E8F0', fontSize: '0.7rem', fontWeight: 800, color: '#475569', textAlign: 'right' }}>CANTIDAD INYECTADA</th>
                      <th style={{ position: 'sticky', top: 0, backgroundColor: '#F8FAFC', padding: '0.6rem 0.85rem', borderBottom: '2px solid #E2E8F0', fontSize: '0.7rem', fontWeight: 800, color: '#475569', textAlign: 'center' }}>OPERACIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commitSummary.items.map((item, idx) => (
                      <tr key={`${item.productId}-${item.targetColumn}`} style={{ backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                        <td style={{ padding: '0.5rem 0.85rem', borderBottom: '1px solid #F1F5F9', color: '#64748B', fontWeight: 700 }}>{idx + 1}</td>
                        <td style={{ padding: '0.5rem 0.85rem', borderBottom: '1px solid #F1F5F9', fontWeight: 800, color: '#0F172A' }}>{item.accountingId}</td>
                        <td style={{ padding: '0.5rem 0.85rem', borderBottom: '1px solid #F1F5F9', fontWeight: 800, color: '#0F172A' }}>{item.productName}</td>
                        <td style={{ padding: '0.5rem 0.85rem', borderBottom: '1px solid #F1F5F9', color: '#475569', fontSize: '0.76rem' }}>{item.rawDetails}</td>
                        <td style={{ padding: '0.5rem 0.85rem', borderBottom: '1px solid #F1F5F9', textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, backgroundColor: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD' }}>
                            Col {item.targetColumn}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem 0.85rem', borderBottom: '1px solid #F1F5F9', textAlign: 'right', fontWeight: 900, color: '#065F46', fontSize: '0.88rem' }}>
                          {item.totalQuantity.toLocaleString('es-CO', { maximumFractionDigits: 2 })} {item.unit}
                        </td>
                        <td style={{ padding: '0.5rem 0.85rem', borderBottom: '1px solid #F1F5F9', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              backgroundColor: item.status === 'inserted' ? '#DCFCE7' : '#FEF3C7',
                              color: item.status === 'inserted' ? '#15803D' : '#B45309',
                              border: item.status === 'inserted' ? '1px solid #86EFAC' : '1px solid #FDE68A'
                            }}
                          >
                            {item.status === 'inserted' ? 'Nuevo registro' : 'Actualizado'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : !isStaging ? (
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
            {/* FILA 3 (COLAPSIBLE): BARRA VERDE DE VALIDACIÓN */}
            {!collapseStatsBar && (
              <div style={{ padding: '0.55rem 1.25rem', backgroundColor: '#F0FDF4', borderBottom: '1px solid #BBF7D0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <CheckCircle2 size={20} color="#16A34A" />
                  <div>
                    <div style={{ fontSize: '0.64rem', fontWeight: 900, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Validación de Planilla Física (Auditoría Lado a Lado en Vivo)
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '1px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.84rem', fontWeight: 900, color: '#0F172A' }}>{stats.total} renglones extraídos</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '1px 7px', borderRadius: '6px', backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' }}>Nuevos: {stats.newEntries}</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '1px 7px', borderRadius: '6px', backgroundColor: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD' }}>Conciliados OPS: {stats.matched}</span>
                      {stats.discrepancies > 0 && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '1px 7px', borderRadius: '6px', backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>Discrepancias OPS: {stats.discrepancies}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {digestionDuration && (
                    <span style={{ backgroundColor: '#ECFDF5', color: '#065F46', border: '1.5px solid #6EE7B7', padding: '4px 10px', borderRadius: '100px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Zap size={12} fill="#059669" color="#059669" />
                      <span>Digestión: <strong>{digestionDuration}s</strong></span>
                    </span>
                  )}
                  <button type="button" onClick={() => appendFileInputRef.current?.click()} style={{ padding: '5px 11px', backgroundColor: '#FFFFFF', borderRadius: '100px', fontSize: '0.72rem', fontWeight: 800, color: '#0F766E', border: '1.5px solid #99F6E4', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Plus size={12} /><span>Añadir Otra Hoja / Foto</span>
                  </button>
                  <button type="button" disabled={isExtracting} onClick={() => void executeAiExtraction(files, rawText, sheetType, false)} style={{ padding: '5px 12px', backgroundColor: '#F8FAFC', borderRadius: '100px', fontSize: '0.72rem', fontWeight: 800, color: '#334155', border: '1.5px solid #CBD5E1', cursor: isExtracting ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <RefreshCw size={12} className={isExtracting ? 'animate-spin' : ''} />
                    <span>{isExtracting ? 'Re-analizando...' : 'Re-analizar con IA'}</span>
                  </button>
                  <button type="button" onClick={() => setShowSideDocPreview(prev => !prev)} style={{ padding: '5px 12px', backgroundColor: showSideDocPreview ? '#DBEAFE' : '#EFF6FF', borderRadius: '100px', fontSize: '0.72rem', fontWeight: 800, color: '#1D4ED8', border: '1.5px solid #93C5FD', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <FileText size={13} />
                    <span>{showSideDocPreview ? `Ocultar Visor ${docTypeLabel}` : `Ver ${docTypeLabel} Lado a Lado`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollapseStatsBar(true)}
                    title="Ocultar esta barra de resumen para ganar espacio vertical"
                    style={{ padding: '5px 9px', backgroundColor: '#FFFFFF', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 800, color: '#166534', border: '1px solid #86EFAC', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                  >
                    <ChevronUp size={13} />
                    <span>Ocultar</span>
                  </button>
                </div>
              </div>
            )}
            {errorMsg && (
              <div style={{ margin: '0.4rem 1rem 0', padding: '0.5rem 0.85rem', borderRadius: '8px', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', fontSize: '0.76rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={14} /><span>{errorMsg}</span>
              </div>
            )}
            {/* CUERPO SPLIT-SCREEN: DOCUMENTO ORIGINAL A LA IZQUIERDA + TABLA IA A LA DERECHA */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', overflow: 'hidden' }}>
              {showSideDocPreview && (
                <div style={{ width: '54%', minWidth: '460px', borderRight: '2px solid #E2E8F0', backgroundColor: '#F8FAFC', padding: '0.35rem 0.5rem', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '6px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.71rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <FileText size={13} />{rawText && files.length === 0 ? 'Texto Original' : `${docTypeLabel} Original`}
                      </span>
                      {files.length > 1 && files.map((f, idx) => (
                        <button key={`${f.name}-${idx}`} type="button" onClick={() => { setActiveFileIdx(idx); setStackedView(false); }} style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer', border: activeFileIdx === idx && !stackedView ? '1.5px solid #2563EB' : '1px solid #CBD5E1', backgroundColor: activeFileIdx === idx && !stackedView ? '#DBEAFE' : '#FFFFFF', color: activeFileIdx === idx && !stackedView ? '#1E40AF' : '#475569' }}>
                          Pág {idx + 1}
                        </button>
                      ))}
                      {files.length > 1 && !isActivePdf && !isActiveExcel && (
                        <button type="button" onClick={() => setStackedView(prev => !prev)} style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer', border: stackedView ? '1.5px solid #059669' : '1px solid #CBD5E1', backgroundColor: stackedView ? '#ECFDF5' : '#FFFFFF', color: stackedView ? '#065F46' : '#475569' }}>
                          {stackedView ? 'Vista Individual' : `Apilar (${files.length})`}
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {!isActivePdf && !isActiveExcel && activePreviewUrl && (
                        <>
                          <button type="button" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} style={{ padding: '2px 5px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer' }} title="Alejar"><ZoomOut size={12} /></button>
                          <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#475569' }}>{Math.round(zoom * 100)}%</span>
                          <button type="button" onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))} style={{ padding: '2px 5px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer' }} title="Acercar"><ZoomIn size={12} /></button>
                          <button type="button" onClick={() => setRotation(r => (r + 90) % 360)} style={{ padding: '2px 5px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer' }} title="Rotar"><RotateCw size={12} /></button>
                        </>
                      )}
                      {activePreviewUrl && (
                        <a href={activePreviewUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                          <button type="button" style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#FFFFFF', border: '1px solid #CBD5E1', color: '#1E293B', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Maximize2 size={11} /> Abrir Pestaña
                          </button>
                        </a>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: 1, borderRadius: '10px', overflow: 'hidden', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', display: 'flex', flexDirection: 'column' }}>
                    {rawText && files.length === 0 ? (
                      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', backgroundColor: '#F0FDF4', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '0.84rem', whiteSpace: 'pre-wrap', color: '#0F172A' }}>{rawText}</div>
                    ) : isActiveExcel ? (
                      <ExcelTableViewer file={activeFile} fileUrl={activePreviewUrl} />
                    ) : isActivePdf ? (
                      <PdfCanvasViewer file={activeFile} fileUrl={activePreviewUrl} />
                    ) : stackedView && previewUrls.length > 1 ? (
                      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', backgroundColor: '#F1F5F9', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {previewUrls.map((url, idx) => (
                          <div key={url} style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                            <div style={{ padding: '4px 10px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '0.68rem', fontWeight: 700, color: '#64748B' }}>Página {idx + 1} — {files[idx]?.name}</div>
                            <img src={url} alt={`Página ${idx + 1}`} style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }} />
                          </div>
                        ))}
                      </div>
                    ) : activePreviewUrl ? (
                      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', backgroundColor: '#F8FAFC' }}>
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
                onToggleSelect={(rowId, selected) =>
                  setReconciledRows(prev =>
                    prev.map(r =>
                      r.rowId === rowId
                        ? { ...r, selected: selected && r.quantity > 0 && Boolean(r.matchedProductId) }
                        : r
                    )
                  )
                }
                onToggleSelectAll={selected => setReconciledRows(prev => prev.map(r => ({ ...r, selected: selected && r.quantity > 0 && Boolean(r.matchedProductId) })))}
                onProductChange={handleRowProductChange}
                onColChange={handleRowColChange}
                onQtyChange={handleRowQtyChange}
                onResolutionChange={(rowId: string, resolution: ArbitrationResolution) => setReconciledRows(prev => prev.map(r => (r.rowId === rowId ? { ...r, resolution } : r)))}
                onAddManualRow={handleAddManualRow}
                onDeleteRow={rowId => setReconciledRows(prev => prev.filter(r => r.rowId !== rowId))}
              />
            </div>
            <div style={{ padding: '0.6rem 1.25rem', backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" onClick={handleResetWorkspace} style={{ padding: '7px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#64748B', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                Cancelar y Limpiar
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>Renglones Homologados a Inyectar</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#0F172A' }}>{stats.active} de {stats.total} productos listos ({balanceDate})</div>
                </div>
                <button type="button" disabled={isSaving || stats.active === 0} onClick={handleApproveAndCommit} style={{ padding: '9px 20px', borderRadius: '12px', border: 'none', backgroundColor: stats.active === 0 || isSaving ? '#94A3B8' : '#16A34A', color: '#FFFFFF', fontSize: '0.86rem', fontWeight: 900, cursor: stats.active === 0 || isSaving ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: stats.active === 0 || isSaving ? 'none' : '0 4px 12px rgba(22, 163, 74, 0.3)' }}>
                  <span>{isSaving ? 'Inyectando a la Sábana...' : 'Confirmar e Inyectar a la Sábana'}</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
