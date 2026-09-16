'use client';

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
    FileText, 
    Filter, 
    CheckCircle2, 
    Loader2, 
    AlertCircle 
} from 'lucide-react';

interface ExcelTableViewerProps {
    file?: File | Blob | null;
    fileUrl?: string | null;
}

export default function ExcelTableViewer({ file, fileUrl }: ExcelTableViewerProps) {
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [sheetsData, setSheetsData] = useState<any[]>([]);
    const [selectedSheetIndex, setSelectedSheetIndex] = useState<number>(0);
    const [filterOnlyWithQty, setFilterOnlyWithQty] = useState<boolean>(false);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [zoomLevel, setZoomLevel] = useState<number>(100);

    useEffect(() => {
        let isMounted = true;

        const loadExcel = async () => {
            try {
                setLoading(true);
                setError(null);
                setSheetsData([]);

                let buffer: ArrayBuffer;
                if (file) {
                    buffer = await file.arrayBuffer();
                } else if (fileUrl) {
                    const res = await fetch(fileUrl);
                    if (!res.ok) throw new Error("No se pudo descargar el archivo Excel.");
                    buffer = await res.arrayBuffer();
                } else {
                    setLoading(false);
                    return;
                }

                const workbook = XLSX.read(buffer, { type: 'array' });
                const parsedSheets: any[] = [];

                workbook.SheetNames.forEach((sheetName) => {
                    const worksheet = workbook.Sheets[sheetName];
                    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                    const validRows = rawData.filter(row => row && row.length > 0 && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''));

                    if (validRows.length === 0) return;

                    // 1. Score each row to find the true header row
                    let headerRowIdx = 0;
                    let bestHeaderScore = -1;
                    for (let r = 0; r < Math.min(15, validRows.length); r++) {
                        let score = 0;
                        const row = validRows[r];
                        row.forEach((cell: any) => {
                            const s = String(cell || '').toLowerCase().trim();
                            if (s.includes('plu') || s.includes('codigo') || s.includes('cod')) score += 3;
                            if (s.includes('descrip') || s.includes('prod') || s.includes('articulo') || s.includes('item') || s.includes('nombre')) score += 3;
                            if (s.includes('present') || s.includes('ubm') || s.includes('unidad') || s.includes('medida')) score += 3;
                            if (s.includes('cant') || s.includes('qty') || s.includes('pedido') || s.includes('total')) score += 3;
                        });
                        if (score > bestHeaderScore) {
                            bestHeaderScore = score;
                            headerRowIdx = r;
                        }
                    }

                    // 2. Detectar columnas activas
                    const maxCols = Math.max(...validRows.map(r => r.length));
                    const activeCols: number[] = [];
                    for (let c = 0; c < maxCols; c++) {
                        for (let r = 0; r < validRows.length; r++) {
                            const val = validRows[r][c];
                            if (val !== null && val !== undefined && String(val).trim() !== '') {
                                activeCols.push(c);
                                break;
                            }
                        }
                    }

                    // 3. Detectar columnas clave
                    const headerRow = validRows[headerRowIdx] || [];
                    let nameCol = -1;
                    let unitCol = -1;
                    let pluCol = -1;
                    const qtyCandidates: number[] = [];

                    headerRow.forEach((cellVal: any, colIdx: number) => {
                        const s = String(cellVal || '').toLowerCase().trim();
                        if (s.includes('plu') || s === 'id' || s.includes('codigo') || s.includes('cod') || s.includes('ref')) {
                            pluCol = colIdx;
                        } else if (s.includes('present') || s.includes('ubm') || s.includes('unidad') || s.includes('und') || s.includes('medida') || s.includes('uom') || s.includes('empaque')) {
                            unitCol = colIdx;
                        } else if (s.includes('descrip') || s.includes('prod') || s.includes('articulo') || s.includes('item') || s.includes('nombre')) {
                            nameCol = colIdx;
                        } else if (s.includes('cant') || s === 'qty' || s === 'pedido' || s.includes('total') || s.includes('solic') || s.includes('requer')) {
                            qtyCandidates.push(colIdx);
                        }
                    });

                    // If nameCol not found from header keywords, scan columns for highest text frequency (not pure numbers)
                    if (nameCol === -1) {
                        let bestTextRatio = -1;
                        activeCols.forEach(colIdx => {
                            if (colIdx === pluCol || colIdx === unitCol) return;
                            let textCount = 0;
                            let totalData = 0;
                            for (let r = headerRowIdx + 1; r < validRows.length; r++) {
                                const val = validRows[r]?.[colIdx];
                                if (val !== undefined && val !== null && String(val).trim() !== '') {
                                    totalData++;
                                    const s = String(val).trim();
                                    if (isNaN(Number(s.replace(',', '.'))) && s.length > 2) {
                                        textCount++;
                                    }
                                }
                            }
                            const ratio = totalData > 0 ? textCount / totalData : 0;
                            if (ratio > 0.6 && textCount > bestTextRatio) {
                                bestTextRatio = textCount;
                                nameCol = colIdx;
                            }
                        });
                    }

                    // Find qtyCol: column with the highest count of pure numeric quantities (>0 and <50000)
                    let qtyCol = -1;
                    let bestQtyCount = -1;
                    activeCols.forEach(colIdx => {
                        if (colIdx === pluCol || colIdx === nameCol || colIdx === unitCol) return;
                        let numericCount = 0;
                        for (let r = headerRowIdx + 1; r < validRows.length; r++) {
                            const val = validRows[r]?.[colIdx];
                            if (val !== undefined && val !== null && String(val).trim() !== '') {
                                const s = String(val).trim().replace(',', '.');
                                const num = Number(s);
                                if (!isNaN(num) && num > 0 && num < 50000) {
                                    numericCount++;
                                }
                            }
                        }
                        if (numericCount > bestQtyCount && numericCount > 0) {
                            bestQtyCount = numericCount;
                            qtyCol = colIdx;
                        }
                    });

                    if (qtyCol !== -1 && !qtyCandidates.includes(qtyCol)) {
                        qtyCandidates.push(qtyCol);
                    }

                    // 4. Parsear filas
                    const parsedRows = validRows.map((row, rIdx) => {
                        const isHeader = rIdx === headerRowIdx;
                        const isMeta = rIdx < headerRowIdx;

                        let qtyNum: number | null = null;
                        if (!isHeader && !isMeta) {
                            if (qtyCol !== -1 && row[qtyCol] !== undefined && row[qtyCol] !== null) {
                                const s = String(row[qtyCol]).trim().replace(',', '.');
                                const parsed = Number(s);
                                if (!isNaN(parsed) && parsed > 0 && parsed <= 50000) {
                                    qtyNum = parsed;
                                }
                            }

                            if (qtyNum === null) {
                                for (const candCol of qtyCandidates) {
                                    if (candCol === qtyCol) continue;
                                    const cVal = row[candCol];
                                    if (cVal !== undefined && cVal !== null && String(cVal).trim() !== '') {
                                        const s = String(cVal).trim().replace(',', '.');
                                        const parsed = Number(s);
                                        if (!isNaN(parsed) && parsed > 0 && parsed <= 50000) {
                                            qtyNum = parsed;
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        const rowName = nameCol !== -1 ? String(row[nameCol] || '').trim() : '';
                        const rowUnit = unitCol !== -1 ? String(row[unitCol] || '').trim() : 'Kg';
                        const rowPlu = pluCol !== -1 ? String(row[pluCol] || '').trim() : '';

                        // Filter out metadata rows (like "DESCRIPCION", "FECHA DE CONSUMO", etc.)
                        const isMetaRowText = ['descripcion', 'descripción', 'fecha', 'plu', 'presentacion', 'presentación'].includes(rowName.toLowerCase());

                        const isDateRow = row.some(cell => {
                            const s = String(cell || '').toLowerCase();
                            return s.includes('fecha') || s.includes('solicitud') || s.includes('entrega');
                        });

                        return {
                            rowIndex: rIdx + 1,
                            isHeader,
                            isMeta: isMeta || isMetaRowText,
                            hasQty: !isMetaRowText && qtyNum !== null && qtyNum > 0,
                            qtyVal: isMetaRowText ? null : qtyNum,
                            nameVal: isMetaRowText ? '' : rowName,
                            unitVal: rowUnit,
                            pluVal: rowPlu,
                            cells: activeCols.map(c => {
                                const v = row[c];
                                if (v === null || v === undefined) return '';
                                const s = String(v).trim();
                                const num = Number(s);
                                if (!isNaN(num) && (isDateRow || (num >= 35000 && num <= 60000 && Number.isInteger(num)))) {
                                    try {
                                        const utc_days = Math.floor(num - 25569);
                                        const utc_value = utc_days * 86400;
                                        const date_info = new Date(utc_value * 1000);
                                        const day = String(date_info.getUTCDate()).padStart(2, '0');
                                        const month = String(date_info.getUTCMonth() + 1).padStart(2, '0');
                                        const year = date_info.getUTCFullYear();
                                        if (year >= 2020 && year <= 2035) {
                                            return `${day}/${month}/${year}`;
                                        }
                                    } catch {}
                                }
                                return s;
                            })
                        };
                    });

                    const countWithQty = parsedRows.filter(r => r.hasQty).length;

                    parsedSheets.push({
                        sheetName,
                        activeCols,
                        headerRowIdx,
                        qtyCol: qtyCol !== -1 ? qtyCol : 0,
                        nameCol,
                        unitCol,
                        pluCol,
                        countWithQty,
                        totalRows: parsedRows.filter(r => !r.isHeader && !r.isMeta).length,
                        rows: parsedRows
                    });
                });

                if (!isMounted) return;
                setSheetsData(parsedSheets);
                setSelectedSheetIndex(0);
                setLoading(false);
            } catch (err: any) {
                console.error("Error al procesar el archivo Excel:", err);
                if (isMounted) {
                    setError(err.message || "Error al procesar el archivo Excel.");
                    setLoading(false);
                }
            }
        };

        loadExcel();

        return () => {
            isMounted = false;
        };
    }, [file, fileUrl]);

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '380px', gap: '12px', padding: '24px', backgroundColor: '#F8FAFC' }}>
                <Loader2 size={32} color="#059669" className="animate-spin" />
                <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>Cargando tabla Excel...</span>
            </div>
        );
    }

    if (error || sheetsData.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '380px', gap: '8px', padding: '24px', backgroundColor: '#F8FAFC', color: '#DC2626' }}>
                <AlertCircle size={28} />
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{error || 'No se pudieron extraer hojas de cálculo del archivo.'}</span>
            </div>
        );
    }

    const currentSheet = sheetsData[selectedSheetIndex] || sheetsData[0];
    const filteredRows = (currentSheet.rows || []).filter((r: any) => {
        if (filterOnlyWithQty && !r.hasQty && !r.isHeader && !r.isMeta) return false;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const textMatch = r.cells.some((c: string) => c.toLowerCase().includes(term));
            return textMatch || r.isHeader;
        }
        return true;
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
            {/* Excel Toolbar */}
            <div style={{
                padding: '8px 12px',
                backgroundColor: '#F1F5F9',
                borderBottom: '1px solid #CBD5E1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px'
            }}>
                {/* Sheet selector tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', maxWidth: '100%' }}>
                    {sheetsData.map((s: any, sIdx: number) => (
                        <button
                            key={sIdx}
                            type="button"
                            onClick={() => setSelectedSheetIndex(sIdx)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                fontWeight: '800',
                                border: selectedSheetIndex === sIdx ? '2px solid #059669' : '1px solid #CBD5E1',
                                backgroundColor: selectedSheetIndex === sIdx ? '#ECFDF5' : '#FFFFFF',
                                color: selectedSheetIndex === sIdx ? '#065F46' : '#475569',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            <FileText size={13} strokeWidth={2} />
                            <span>{s.sheetName} ({s.countWithQty} pedidos)</span>
                        </button>
                    ))}
                </div>

                {/* Filter & Zoom Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => setFilterOnlyWithQty(prev => !prev)}
                        style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: filterOnlyWithQty ? '1.5px solid #059669' : '1px solid #CBD5E1',
                            backgroundColor: filterOnlyWithQty ? '#ECFDF5' : '#FFFFFF',
                            color: filterOnlyWithQty ? '#065F46' : '#334155',
                            fontWeight: 800,
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            boxShadow: filterOnlyWithQty ? '0 1px 3px rgba(16, 185, 129, 0.15)' : 'none'
                        }}
                    >
                        {filterOnlyWithQty ? <CheckCircle2 size={12} color="#059669" /> : <Filter size={12} />}
                        {filterOnlyWithQty 
                            ? `Mostrando ${currentSheet.countWithQty} con cantidad` 
                            : `Ver solo ${currentSheet.countWithQty} con cantidad`}
                    </button>

                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Buscar en Excel..."
                        style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.72rem',
                            width: '120px',
                            outline: 'none',
                            backgroundColor: '#FFFFFF'
                        }}
                    />

                    <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
                        <button
                            type="button"
                            onClick={() => setZoomLevel(prev => Math.max(70, prev - 10))}
                            style={{ padding: '2px 8px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 800 }}
                            title="Reducir zoom"
                        >-</button>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0 4px', color: '#475569' }}>{zoomLevel}%</span>
                        <button
                            type="button"
                            onClick={() => setZoomLevel(prev => Math.min(140, prev + 10))}
                            style={{ padding: '2px 8px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 800 }}
                            title="Aumentar zoom"
                        >+</button>
                    </div>
                </div>
            </div>

            {/* Modern Google Sheets Table */}
            <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#F8FAFC' }}>
                <table style={{
                    borderCollapse: 'collapse',
                    width: '100%',
                    minWidth: 'max-content',
                    fontSize: `${0.75 * (zoomLevel / 100)}rem`,
                    fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace'
                }}>
                    <tbody>
                        {filteredRows.map((r: any, rowIdx: number) => {
                            const isRowHeader = r.isHeader;
                            const isRowMeta = r.isMeta;
                            const hasRowQty = r.hasQty;

                            return (
                                <tr
                                    key={rowIdx}
                                    style={{
                                        backgroundColor: isRowHeader 
                                            ? '#E2E8F0' 
                                            : (hasRowQty ? '#ECFDF5' : (isRowMeta ? '#F8FAFC' : (rowIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'))),
                                        fontWeight: isRowHeader ? 800 : (hasRowQty ? 700 : 500),
                                        color: isRowHeader ? '#0F172A' : (hasRowQty ? '#065F46' : '#334155'),
                                        borderBottom: hasRowQty ? '1.5px solid #86EFAC' : '1px solid #E2E8F0',
                                        transition: 'background-color 0.15s'
                                    }}
                                >
                                    {/* Row Number */}
                                    <td style={{
                                        padding: '4px 8px',
                                        textAlign: 'center',
                                        backgroundColor: isRowHeader ? '#CBD5E1' : '#F1F5F9',
                                        color: '#64748B',
                                        borderRight: '1px solid #CBD5E1',
                                        borderBottom: '1px solid #E2E8F0',
                                        fontSize: '0.65rem',
                                        userSelect: 'none',
                                        width: '32px'
                                    }}>
                                        {r.rowIndex}
                                    </td>

                                    {/* Cells */}
                                    {r.cells.map((cellText: string, cIdx: number) => {
                                        const realCol = currentSheet.activeCols ? currentSheet.activeCols[cIdx] : cIdx;
                                        const isQtyCell = realCol === currentSheet.qtyCol && !isRowHeader && !isRowMeta;
                                        const isNameCell = realCol === currentSheet.nameCol && !isRowHeader && !isRowMeta;

                                        return (
                                            <td
                                                key={cIdx}
                                                style={{
                                                    padding: '5px 8px',
                                                    borderRight: '1px solid #E2E8F0',
                                                    whiteSpace: 'nowrap',
                                                    fontWeight: isQtyCell && hasRowQty && r.qtyVal ? 900 : (isNameCell && hasRowQty ? 800 : 'inherit'),
                                                    color: isQtyCell && hasRowQty && r.qtyVal ? '#047857' : (hasRowQty ? '#065F46' : 'inherit'),
                                                    backgroundColor: isQtyCell && hasRowQty && r.qtyVal ? '#D1FAE5' : 'transparent',
                                                    textAlign: isQtyCell ? 'center' : 'left'
                                                }}
                                            >
                                                {isQtyCell && hasRowQty && r.qtyVal ? (
                                                    <span style={{
                                                        backgroundColor: '#FEF3C7',
                                                        color: '#B45309',
                                                        border: '1px solid #FCD34D',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        fontWeight: 900
                                                    }}>
                                                        {cellText}
                                                    </span>
                                                ) : (
                                                    cellText
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan={10} style={{ padding: '12px 16px', textAlign: 'center', backgroundColor: '#F1F5F9', color: '#64748B', fontSize: '0.72rem', fontWeight: 600, borderTop: '2px solid #CBD5E1' }}>
                                Fin de la hoja · {currentSheet.countWithQty} ítems con cantidad encontrados ({filteredRows.length} filas en total)
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
