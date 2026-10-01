'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    X, 
    FileSpreadsheet, 
    Calendar, 
    User, 
    DollarSign, 
    Search,
    RefreshCw,
    Plus,
    Check,
    Edit3,
    AlertCircle,
    UserCheck,
    Clock,
    Scale,
    Users,
    Package,
    Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatNumber } from '@/lib/adminTheme';

interface EmployeeSaleRecord {
    id: string;
    product_id: string;
    quantity: number;
    notes?: string | null;
    created_at: string;
    products?: {
        name: string;
        sku?: string;
        unit_of_measure: string;
        base_price?: number;
    } | null;
}

interface StaffMember {
    id: string;
    contact_name: string;
    document_id?: string;
    role?: string;
    specialty?: string;
    phone?: string;
}

interface ProductItem {
    id: string;
    name: string;
    sku?: string;
    unit_of_measure: string;
    base_price?: number;
}

interface InventoryPayrollModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface AssignModalData {
    id: string;
    productName: string;
    qty: number;
    uom: string;
    totalVal: number;
    currentEmployee: string;
    date: string;
}

export default function InventoryPayrollModal({ isOpen, onClose }: InventoryPayrollModalProps) {
    const [sales, setSales] = useState<EmployeeSaleRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [staffList, setStaffList] = useState<StaffMember[]>([]);
    const [productsList, setProductsList] = useState<ProductItem[]>([]);
    
    // Superbuscador Omnibox Universal
    const [searchTerm, setSearchTerm] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Modal dedicado de asignación de colaborador
    const [assignModalData, setAssignModalData] = useState<AssignModalData | null>(null);
    const [assignSearchQuery, setAssignSearchQuery] = useState('');
    const [isSavingAssignment, setIsSavingAssignment] = useState(false);
    const assignInputRef = useRef<HTMLInputElement>(null);

    // Modal de nueva venta rápida
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newSaleDate, setNewSaleDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [newSaleProductId, setNewSaleProductId] = useState('');
    const [newSaleCollaborator, setNewSaleCollaborator] = useState('');
    const [newSaleCollabSearch, setNewSaleCollabSearch] = useState('');
    const [newSaleQty, setNewSaleQty] = useState('');
    const [isSubmittingSale, setIsSubmittingSale] = useState(false);

    // Rango de fechas por defecto: Mes actual
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(firstDayOfMonth);
    const [endDate, setEndDate] = useState(todayStr);
    const [activePreset, setActivePreset] = useState<'today' | 'yesterday' | 'fortnight' | 'month' | 'all' | 'custom'>('month');

    // Manejo de presets rápidos de fecha
    const handlePresetRange = (preset: 'today' | 'yesterday' | 'fortnight' | 'month' | 'all') => {
        setActivePreset(preset);
        const today = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        if (preset === 'today') {
            const dStr = toYMD(today);
            setStartDate(dStr);
            setEndDate(dStr);
        } else if (preset === 'yesterday') {
            const y = new Date(today);
            y.setDate(y.getDate() - 1);
            const yStr = toYMD(y);
            setStartDate(yStr);
            setEndDate(yStr);
        } else if (preset === 'fortnight') {
            const day = today.getDate();
            const year = today.getFullYear();
            const month = today.getMonth();
            if (day <= 15) {
                setStartDate(`${year}-${pad(month + 1)}-01`);
                setEndDate(`${year}-${pad(month + 1)}-15`);
            } else {
                const lastDay = new Date(year, month + 1, 0).getDate();
                setStartDate(`${year}-${pad(month + 1)}-16`);
                setEndDate(`${year}-${pad(month + 1)}-${pad(lastDay)}`);
            }
        } else if (preset === 'month') {
            const year = today.getFullYear();
            const month = today.getMonth();
            const lastDay = new Date(year, month + 1, 0).getDate();
            setStartDate(`${year}-${pad(month + 1)}-01`);
            setEndDate(`${year}-${pad(month + 1)}-${pad(lastDay)}`);
        } else if (preset === 'all') {
            setStartDate('2025-01-01');
            setEndDate(toYMD(today));
        }
    };

    // Cargar ventas de empleados
    const fetchEmployeeSales = async () => {
        setLoading(true);
        try {
            const startIso = `${startDate}T00:00:00.000Z`;
            const endIso = `${endDate}T23:59:59.999Z`;

            const { data, error } = await supabase
                .from('inventory_movements')
                .select(`
                    id, product_id, quantity, notes, created_at,
                    products (name, sku, unit_of_measure, base_price)
                `)
                .eq('reference_type', 'employee_sale')
                .gte('created_at', startIso)
                .lte('created_at', endIso)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setSales((data as any) || []);
        } catch (err: any) {
            console.error('Error fetching employee sales for payroll:', err);
        } finally {
            setLoading(false);
        }
    };

    // Cargar directorio unificado de colaboradores
    const fetchStaffMembers = async () => {
        try {
            const { data: collabData } = await supabase
                .from('collaborators')
                .select('id, contact_name, document_id, role, specialty, phone')
                .order('contact_name');

            const { data: profData } = await supabase
                .from('profiles')
                .select('id, contact_name, document_id, id_zr, role, specialty, phone')
                .not('contact_name', 'is', null)
                .order('contact_name');

            const existingNames = new Set((collabData || []).map(c => (c.contact_name || '').toLowerCase().trim()));
            const staffFromProfiles: StaffMember[] = (profData || [])
                .filter(p => p.role && p.role !== 'b2b_client' && p.role !== 'b2c_client')
                .filter(p => !existingNames.has((p.contact_name || '').toLowerCase().trim()))
                .map(p => ({
                    id: p.id,
                    contact_name: p.contact_name,
                    document_id: p.document_id || p.id_zr || '',
                    role: p.role || 'Colaborador',
                    specialty: p.specialty || '',
                    phone: p.phone || ''
                }));

            const unified: StaffMember[] = [...(collabData || []), ...staffFromProfiles].sort((a, b) => 
                (a.contact_name || '').localeCompare(b.contact_name || '')
            );

            setStaffList(unified);
        } catch (err) {
            console.error('Error fetching staff list for payroll:', err);
        }
    };

    // Cargar productos activos
    const fetchProducts = async () => {
        try {
            const { data } = await supabase
                .from('products')
                .select('id, name, sku, unit_of_measure, base_price')
                .eq('is_active', true)
                .order('name');
            if (data) setProductsList(data);
        } catch (err) {
            console.error('Error fetching products for employee sale:', err);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchEmployeeSales();
            fetchStaffMembers();
            fetchProducts();
        }
    }, [isOpen, startDate, endDate]);

    // Atajos de teclado
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
            if (e.key === 'Escape') {
                if (assignModalData) {
                    setAssignModalData(null);
                } else if (showCreateModal) {
                    setShowCreateModal(false);
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, assignModalData, showCreateModal, onClose]);

    // Auto-focus al abrir modal de asignación
    useEffect(() => {
        if (assignModalData) {
            setTimeout(() => assignInputRef.current?.focus(), 80);
        }
    }, [assignModalData]);

    if (!isOpen) return null;

    // Helper de normalización insensibles a tildes y mayúsculas
    const normalizeText = (val: any): string => {
        return (val || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    };

    // Parser para extraer nombre de empleado, valor y descomponer fecha/hora
    const parseEmployeeSale = (item: EmployeeSaleRecord) => {
        const notes = item.notes || '';
        let employee = 'Empleado no especificado';
        let isUnassigned = true;

        const isNumericString = (str: string) => /^[-+]?[0-9]+([.,][0-9]+)?$/.test(str.trim());

        const empMatch = notes.match(/(?:\|\s*)?Empleado:\s*([^|]+)/i);
        if (empMatch) {
            const candidate = empMatch[1].trim();
            if (
                candidate && 
                candidate.toLowerCase() !== 'empleado no especificado' && 
                !isNumericString(candidate)
            ) {
                employee = candidate;
                isUnassigned = false;
            }
        }

        const qty = Math.abs(item.quantity || 0);
        const basePrice = item.products?.base_price || 0;
        
        let totalVal = Math.round(qty * basePrice);
        const valMatch = notes.match(/Valor Nómina:\s*\$([0-9.,]+)/i);
        if (valMatch) {
            const parsed = parseInt(valMatch[1].replace(/\./g, ''), 10);
            if (!isNaN(parsed)) totalVal = parsed;
        }

        const createdAtDate = new Date(item.created_at);
        const datePart = createdAtDate.toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
        const timePart = createdAtDate.toLocaleTimeString('es-CO', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        return {
            employee,
            isUnassigned,
            qty,
            uom: item.products?.unit_of_measure || 'KG',
            productName: item.products?.name || 'Producto Desconocido',
            sku: item.products?.sku || '',
            unitPrice: basePrice,
            totalVal,
            datePart,
            timePart,
            fullDateStr: `${datePart} ${timePart}`
        };
    };

    const parsedRows = sales.map(s => ({ raw: s, ...parseEmployeeSale(s) }));

    // Superbuscador Omnibox Universal Multi-Criterio (FruFresco Gallery Standard)
    const filteredRows = parsedRows.filter(r => {
        if (!searchTerm.trim()) return true;

        const rawQuery = searchTerm.trim();
        const orSegments = rawQuery.split(',').map(s => s.trim()).filter(Boolean);

        return orSegments.some(segment => {
            const andTokens = segment.split(/\s+/).map(normalizeText).filter(Boolean);
            
            const fullSearchBlob = normalizeText([
                r.employee,
                r.productName,
                r.sku,
                r.uom,
                r.qty,
                r.unitPrice,
                r.totalVal,
                `$${r.totalVal}`,
                r.datePart,
                r.timePart,
                r.raw.notes || ''
            ].join(' '));

            return andTokens.every(token => fullSearchBlob.includes(token));
        });
    });

    const totalDeduction = filteredRows.reduce((acc, r) => acc + r.totalVal, 0);
    const totalKilos = filteredRows.reduce((acc, r) => acc + r.qty, 0);
    const uniqueEmployees = new Set(
        filteredRows
            .filter(r => !r.isUnassigned)
            .map(r => r.employee.toLowerCase())
    ).size;
    const unassignedCount = filteredRows.filter(r => r.isUnassigned).length;

    // Asignación atómica de colaborador
    const handleAssignCollaborator = async (rowId: string, collaboratorName: string, currentTotal: number) => {
        if (!collaboratorName.trim()) return;
        setIsSavingAssignment(true);

        try {
            const targetRow = sales.find(s => s.id === rowId);
            if (!targetRow) return;

            let currentNotes = targetRow.notes || '';
            let newNotes = '';

            if (currentNotes.includes('Empleado:')) {
                newNotes = currentNotes.replace(/Empleado:\s*[^|]+/i, `Empleado: ${collaboratorName.trim()}`);
            } else {
                newNotes = currentNotes.trim() ? `${currentNotes} | Empleado: ${collaboratorName.trim()}` : `[VENTA NÓMINA] Empleado: ${collaboratorName.trim()}`;
            }

            if (!newNotes.includes('Valor Nómina:')) {
                newNotes += ` | Valor Nómina: $${formatNumber(currentTotal)}`;
            }

            const { error } = await supabase
                .from('inventory_movements')
                .update({ notes: newNotes })
                .eq('id', rowId);

            if (error) throw error;

            setSales(prev => prev.map(s => s.id === rowId ? { ...s, notes: newNotes } : s));
            setAssignModalData(null);
            setAssignSearchQuery('');

            (window as any).showToast?.(`Colaborador "${collaboratorName.trim()}" asignado correctamente`, 'success');
        } catch (err: any) {
            console.error('Error asignando colaborador:', err);
            (window as any).showToast?.('Error al asignar colaborador: ' + (err.message || 'Error en red'), 'error');
        } finally {
            setIsSavingAssignment(false);
        }
    };

    // Creación de nueva venta directa a empleado
    const handleCreateEmployeeSale = async (e: React.FormEvent) => {
        e.preventDefault();
        const selectedProd = productsList.find(p => p.id === newSaleProductId);
        const qtyNum = parseFloat(newSaleQty.replace(',', '.'));
        const collabName = newSaleCollaborator.trim() || newSaleCollabSearch.trim();

        if (!selectedProd) {
            alert('Por favor selecciona un producto válido.');
            return;
        }
        if (isNaN(qtyNum) || qtyNum <= 0) {
            alert('Por favor ingresa una cantidad numérica válida mayor a 0.');
            return;
        }
        if (!collabName) {
            alert('Por favor indica el colaborador a quien se le descontará en nómina.');
            return;
        }

        setIsSubmittingSale(true);
        try {
            const { data: whData } = await supabase.from('warehouses').select('id').limit(1).single();
            const warehouseId = whData?.id;

            const unitPrice = selectedProd.base_price || 0;
            const totalCost = Math.round(qtyNum * unitPrice);
            const timestampIso = `${newSaleDate}T12:00:00.000Z`;

            const noteDesc = `[VENTA DIRECTA NÓMINA] Columna N: ${formatNumber(qtyNum, 2)} ${selectedProd.unit_of_measure} | Empleado: ${collabName} | Valor Nómina: $${formatNumber(totalCost)}`;

            const { error: insError } = await supabase
                .from('inventory_movements')
                .insert({
                    product_id: selectedProd.id,
                    warehouse_id: warehouseId,
                    quantity: -qtyNum,
                    type: 'exit',
                    reference_type: 'employee_sale',
                    notes: noteDesc,
                    created_at: timestampIso
                });

            if (insError) throw insError;

            (window as any).showToast?.(`Venta a ${collabName} registrada exitosamente`, 'success');
            setShowCreateModal(false);
            setNewSaleProductId('');
            setNewSaleCollaborator('');
            setNewSaleCollabSearch('');
            setNewSaleQty('');
            await fetchEmployeeSales();
        } catch (err: any) {
            console.error('Error registrando venta directa de nómina:', err);
            alert('Error al registrar venta: ' + (err.message || 'Error en BD'));
        } finally {
            setIsSubmittingSale(false);
        }
    };

    // Exportación a Excel
    const handleExportExcel = () => {
        try {
            const exportData = filteredRows.map(r => ({
                'Fecha': r.datePart,
                'Hora': r.timePart,
                'Colaborador (Nómina)': r.employee,
                'Producto': r.productName,
                'Cantidad Vendida': r.qty,
                'Unidad Medida': r.uom,
                'Precio Unitario COP': r.unitPrice,
                'Total a Descontar Nómina COP': r.totalVal,
                'Notas': r.raw.notes || ''
            }));

            // Fila de totales
            exportData.push({
                'Fecha': 'TOTAL GENERAL',
                'Hora': '',
                'Colaborador (Nómina)': `${uniqueEmployees} colaboradores (${unassignedCount} sin asignar)`,
                'Producto': '',
                'Cantidad Vendida': totalKilos,
                'Unidad Medida': '',
                'Precio Unitario COP': 0,
                'Total a Descontar Nómina COP': totalDeduction,
                'Notas': ''
            });

            const ws = XLSX.utils.json_to_sheet(exportData);
            ws['!cols'] = [
                { wch: 14 },
                { wch: 12 },
                { wch: 28 },
                { wch: 32 },
                { wch: 16 },
                { wch: 14 },
                { wch: 18 },
                { wch: 26 },
                { wch: 35 }
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Deducciones_Nomina');
            XLSX.writeFile(wb, `Reporte_Nomina_Ventas_Empleados_${startDate}_al_${endDate}.xlsx`);
        } catch (err: any) {
            console.error('Error exportando Excel nómina:', err);
            (window as any).showToast?.('Error al exportar reporte de nómina: ' + err.message, 'error');
        }
    };

    // Filtrado de colaboradores para el modal de asignación
    const assignQueryNorm = normalizeText(assignSearchQuery);
    const assignMatchingStaff = staffList.filter(s => {
        if (!assignQueryNorm) return true;
        return normalizeText(s.contact_name).includes(assignQueryNorm) ||
               normalizeText(s.document_id).includes(assignQueryNorm) ||
               normalizeText(s.role).includes(assignQueryNorm);
    });

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            fontFamily: 'var(--font-outfit), sans-serif'
        }}>
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '1120px',
                height: '92vh',
                maxHeight: '900px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                border: '1px solid #CBD5E1',
                overflow: 'hidden'
            }}>
                {/* Header Estilo Suizo Industrial */}
                <div style={{
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#FFFFFF'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            backgroundColor: '#EDF5F1',
                            color: '#0D7A57',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <UserCheck size={22} strokeWidth={2.2} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#0F172A', letterSpacing: '-0.01em' }}>
                                    Deducciones de Nómina • Ventas a Empleados (Col N)
                                </h3>
                                <span style={{
                                    backgroundColor: '#EFF6FF',
                                    color: '#1D4ED8',
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    textTransform: 'uppercase'
                                }}>
                                    RRHH & Bodega
                                </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748B', marginTop: '2px' }}>
                                Cruce contable de consumos de bodega con deducción quincenal en nómina
                            </p>
                        </div>
                    </div>
                    
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#64748B',
                            padding: '6px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        title="Cerrar ventana (Esc)"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Toolbar Compacto: Filtros de Fecha + Presets + Acciones */}
                <div style={{
                    padding: '0.65rem 1.5rem',
                    backgroundColor: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem'
                }}>
                    {/* Presets Rápidos + Rango */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {/* Píldoras de Preset */}
                        <div style={{ display: 'inline-flex', backgroundColor: '#E2E8F0', padding: '2px', borderRadius: '8px', gap: '2px' }}>
                            {[
                                { key: 'today', label: 'Hoy' },
                                { key: 'yesterday', label: 'Ayer' },
                                { key: 'fortnight', label: 'Esta Quincena' },
                                { key: 'month', label: 'Mes Actual' },
                                { key: 'all', label: 'Todo' }
                            ].map(p => (
                                <button
                                    key={p.key}
                                    type="button"
                                    onClick={() => handlePresetRange(p.key as any)}
                                    style={{
                                        border: 'none',
                                        backgroundColor: activePreset === p.key ? '#FFFFFF' : 'transparent',
                                        color: activePreset === p.key ? '#0F172A' : '#64748B',
                                        fontWeight: activePreset === p.key ? '800' : '600',
                                        fontSize: '0.72rem',
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        boxShadow: activePreset === p.key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => {
                                    setStartDate(e.target.value);
                                    setActivePreset('custom');
                                }}
                                style={{
                                    padding: '0.3rem 0.5rem',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.75rem',
                                    color: '#1E293B',
                                    outline: 'none',
                                    backgroundColor: '#FFFFFF'
                                }}
                            />
                            <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>—</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => {
                                    setEndDate(e.target.value);
                                    setActivePreset('custom');
                                }}
                                style={{
                                    padding: '0.3rem 0.5rem',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.75rem',
                                    color: '#1E293B',
                                    outline: 'none',
                                    backgroundColor: '#FFFFFF'
                                }}
                            />
                            <button
                                type="button"
                                onClick={fetchEmployeeSales}
                                title="Refrescar datos"
                                style={{
                                    padding: '0.3rem 0.55rem',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    fontSize: '0.72rem',
                                    fontWeight: '700',
                                    color: '#475569'
                                }}
                            >
                                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={() => setShowCreateModal(true)}
                            style={{
                                padding: '0.45rem 0.85rem',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: '#0D7A57',
                                color: '#FFFFFF',
                                fontSize: '0.76rem',
                                fontWeight: '700',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                cursor: 'pointer',
                                boxShadow: '0 1px 3px rgba(13, 122, 87, 0.25)',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#0B6648'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0D7A57'}
                        >
                            <Plus size={15} strokeWidth={2.5} />
                            <span>Registrar Venta</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleExportExcel}
                            disabled={filteredRows.length === 0}
                            style={{
                                padding: '0.45rem 0.85rem',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                color: '#1E293B',
                                fontSize: '0.76rem',
                                fontWeight: '700',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                cursor: filteredRows.length === 0 ? 'not-allowed' : 'pointer',
                                opacity: filteredRows.length === 0 ? 0.6 : 1,
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <FileSpreadsheet size={15} color="#0D7A57" />
                            <span>Excel (.xlsx)</span>
                        </button>
                    </div>
                </div>

                {/* 4 Métricas de Control Compactas */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '0.65rem',
                    padding: '0.65rem 1.5rem',
                    backgroundColor: '#FFFFFF',
                    borderBottom: '1px solid #E2E8F0'
                }}>
                    <div style={{ backgroundColor: '#F8FAFC', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>
                                Total a Deducir
                            </div>
                            <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0D7A57', marginTop: '1px', fontVariantNumeric: 'tabular-nums' }}>
                                ${totalDeduction.toLocaleString('es-CO')}
                            </div>
                        </div>
                        <div style={{ backgroundColor: '#EDF5F1', padding: '6px', borderRadius: '8px', color: '#0D7A57' }}>
                            <DollarSign size={16} />
                        </div>
                    </div>

                    <div style={{ backgroundColor: '#F8FAFC', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>
                                Volumen Despachado
                            </div>
                            <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#1E293B', marginTop: '1px', fontVariantNumeric: 'tabular-nums' }}>
                                {totalKilos.toFixed(2)} <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748B' }}>unid/kg</span>
                            </div>
                        </div>
                        <div style={{ backgroundColor: '#F1F5F9', padding: '6px', borderRadius: '8px', color: '#475569' }}>
                            <Scale size={16} />
                        </div>
                    </div>

                    <div style={{ backgroundColor: '#F8FAFC', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>
                                Colaboradores
                            </div>
                            <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#2563EB', marginTop: '1px', fontVariantNumeric: 'tabular-nums' }}>
                                {uniqueEmployees} <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748B' }}>con compras</span>
                            </div>
                        </div>
                        <div style={{ backgroundColor: '#EFF6FF', padding: '6px', borderRadius: '8px', color: '#2563EB' }}>
                            <Users size={16} />
                        </div>
                    </div>

                    <div style={{
                        backgroundColor: unassignedCount > 0 ? '#FFFBEB' : '#F8FAFC',
                        padding: '0.6rem 0.85rem',
                        borderRadius: '8px',
                        border: unassignedCount > 0 ? '1px solid #FCD34D' : '1px solid #E2E8F0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: '800', textTransform: 'uppercase', color: unassignedCount > 0 ? '#B45309' : '#64748B', letterSpacing: '0.04em' }}>
                                Por Identificar
                            </div>
                            <div style={{ fontSize: '1.2rem', fontWeight: '900', color: unassignedCount > 0 ? '#D97706' : '#10B981', marginTop: '1px', fontVariantNumeric: 'tabular-nums' }}>
                                {unassignedCount > 0 ? `${unassignedCount} sin asignar` : '0 pendientes'}
                            </div>
                        </div>
                        <div style={{ backgroundColor: unassignedCount > 0 ? '#FEF3C7' : '#EDF5F1', padding: '6px', borderRadius: '8px', color: unassignedCount > 0 ? '#D97706' : '#0D7A57' }}>
                            <AlertCircle size={16} />
                        </div>
                    </div>
                </div>

                {/* Superbuscador Omnibox Universal */}
                <div style={{ padding: '0.65rem 1.5rem 0.4rem 1.5rem', backgroundColor: '#FFFFFF' }}>
                    <div style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: '#FFFFFF',
                        borderRadius: '8px',
                        border: '1.5px solid #CBD5E1',
                        transition: 'all 0.15s ease'
                    }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', color: '#64748B' }} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Superbuscador: Busca por colaborador, producto, fecha, valor... (Presiona '/' para enfocar)"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.5rem 6.5rem 0.5rem 2.2rem',
                                borderRadius: '8px',
                                border: 'none',
                                fontSize: '0.8rem',
                                color: '#0F172A',
                                outline: 'none',
                                fontWeight: '500'
                            }}
                        />
                        <div style={{ position: 'absolute', right: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    style={{
                                        border: 'none',
                                        background: '#E2E8F0',
                                        borderRadius: '50%',
                                        width: '16px',
                                        height: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        color: '#475569'
                                    }}
                                >
                                    <X size={10} />
                                </button>
                            )}
                            <span style={{
                                fontSize: '0.68rem',
                                fontWeight: '700',
                                color: '#475569',
                                backgroundColor: '#F1F5F9',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontVariantNumeric: 'tabular-nums'
                            }}>
                                {filteredRows.length} / {parsedRows.length}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Tabla de Registros */}
                <div style={{ padding: '0.35rem 1.5rem 0.85rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px', backgroundColor: '#FFFFFF' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.8rem' }}>
                            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#F8FAFC', borderBottom: '1.5px solid #CBD5E1', zIndex: 5 }}>
                                <tr>
                                    <th style={{ padding: '0.6rem 0.85rem', textAlign: 'left', fontWeight: '800', color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '115px' }}>
                                        Fecha / Hora
                                    </th>
                                    <th style={{ padding: '0.6rem 0.85rem', textAlign: 'left', fontWeight: '800', color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: '220px' }}>
                                        Colaborador (Nómina)
                                    </th>
                                    <th style={{ padding: '0.6rem 0.85rem', textAlign: 'left', fontWeight: '800', color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        Producto
                                    </th>
                                    <th style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: '800', color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '110px' }}>
                                        Cantidad
                                    </th>
                                    <th style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: '800', color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '130px' }}>
                                        Total Deducir
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                <RefreshCw size={16} className="animate-spin" color="#0D7A57" />
                                                <span>Cargando transacciones de bodega...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8' }}>
                                            <Package size={28} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
                                            <div>No se encontraron deducciones de empleados en el periodo seleccionado.</div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRows.map((r) => {
                                        return (
                                            <tr 
                                                key={r.raw.id} 
                                                style={{ 
                                                    borderBottom: '1px solid #F1F5F9', 
                                                    backgroundColor: r.isUnassigned ? '#FEFDF8' : 'transparent',
                                                    transition: 'background-color 0.12s ease'
                                                }}
                                                onMouseEnter={e => {
                                                    if (!r.isUnassigned) e.currentTarget.style.backgroundColor = '#F8FAFC';
                                                }}
                                                onMouseLeave={e => {
                                                    if (!r.isUnassigned) e.currentTarget.style.backgroundColor = 'transparent';
                                                }}
                                            >
                                                {/* Fecha con Hora debajo para ahorrar espacio en X */}
                                                <td style={{ padding: '0.55rem 0.85rem', whiteSpace: 'nowrap' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                        <span style={{ fontWeight: '700', color: '#0F172A', fontSize: '0.78rem' }}>
                                                            {r.datePart}
                                                        </span>
                                                        <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                            <Clock size={11} color="#94A3B8" />
                                                            {r.timePart}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Colaborador con Asignador en Modal */}
                                                <td style={{ padding: '0.55rem 0.85rem' }}>
                                                    {r.isUnassigned ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setAssignModalData({
                                                                    id: r.raw.id,
                                                                    productName: r.productName,
                                                                    qty: r.qty,
                                                                    uom: r.uom,
                                                                    totalVal: r.totalVal,
                                                                    currentEmployee: r.employee,
                                                                    date: `${r.datePart} • ${r.timePart}`
                                                                });
                                                                setAssignSearchQuery('');
                                                            }}
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                backgroundColor: '#FEF3C7',
                                                                border: '1px solid #FCD34D',
                                                                color: '#92400E',
                                                                padding: '4px 9px',
                                                                borderRadius: '6px',
                                                                fontSize: '0.73rem',
                                                                fontWeight: '700',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                            title="Haz clic para seleccionar el colaborador"
                                                        >
                                                            <AlertCircle size={13} color="#D97706" />
                                                            <span>Sin asignar</span>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#B45309', fontWeight: '800' }}>
                                                                <Edit3 size={11} color="#B45309" />
                                                                <span>Asignar</span>
                                                            </span>
                                                        </button>
                                                    ) : (
                                                        <div
                                                            onClick={() => {
                                                                setAssignModalData({
                                                                    id: r.raw.id,
                                                                    productName: r.productName,
                                                                    qty: r.qty,
                                                                    uom: r.uom,
                                                                    totalVal: r.totalVal,
                                                                    currentEmployee: r.employee,
                                                                    date: `${r.datePart} • ${r.timePart}`
                                                                });
                                                                setAssignSearchQuery(r.employee);
                                                            }}
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                cursor: 'pointer',
                                                                padding: '3px 6px',
                                                                borderRadius: '6px',
                                                                transition: 'background 0.15s ease'
                                                            }}
                                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#EFF6FF'}
                                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                            title="Haz clic para cambiar colaborador"
                                                        >
                                                            <div style={{
                                                                width: '22px',
                                                                height: '22px',
                                                                borderRadius: '50%',
                                                                backgroundColor: '#EFF6FF',
                                                                color: '#1D4ED8',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: '0.62rem',
                                                                fontWeight: '800'
                                                            }}>
                                                                {r.employee.substring(0, 2).toUpperCase()}
                                                            </div>
                                                            <span style={{ fontWeight: '700', color: '#1E293B', fontSize: '0.8rem' }}>
                                                                {r.employee}
                                                            </span>
                                                            <Edit3 size={11} color="#94A3B8" />
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Producto Limpio (SIN ACCOUNTING_ID) */}
                                                <td style={{ padding: '0.55rem 0.85rem', color: '#1E293B' }}>
                                                    <span style={{ fontWeight: '700', color: '#0F172A', fontSize: '0.82rem' }}>
                                                        {r.productName}
                                                    </span>
                                                </td>

                                                {/* Cantidad */}
                                                <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: '700', color: '#1E293B', fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem' }}>
                                                    {r.qty.toFixed(2)} {r.uom}
                                                </td>

                                                {/* Total Deducir */}
                                                <td style={{ padding: '0.55rem 1rem', textAlign: 'right', fontWeight: '900', color: '#0D7A57', fontVariantNumeric: 'tabular-nums', fontSize: '0.86rem' }}>
                                                    ${r.totalVal.toLocaleString('es-CO')}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '0.65rem 1.5rem',
                    borderTop: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F8FAFC'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.73rem', color: '#64748B' }}>
                        <Info size={13} color="#64748B" style={{ flexShrink: 0 }} />
                        <span>Tip: Presiona </span>
                        <kbd style={{ backgroundColor: '#E2E8F0', padding: '1px 5px', borderRadius: '4px', fontWeight: '700', color: '#1E293B' }}>/</kbd>
                        <span> para buscar al instante. Haz clic en cualquier colaborador para modificar su asignación.</span>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.4rem 1.15rem',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#475569',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>

            {/* ========================================================
                MODAL DEDICADO DE SELECCIÓN DE COLABORADOR (SLEEK & FAST)
            ======================================================== */}
            {assignModalData && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10010,
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '480px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1px solid #CBD5E1',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        {/* Header del Selector */}
                        <div style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#F8FAFC'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ backgroundColor: '#EDF5F1', padding: '6px', borderRadius: '8px', color: '#0D7A57' }}>
                                    <UserCheck size={18} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#0F172A' }}>
                                        Asignar Colaborador a Nómina
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B' }}>
                                        Selecciona quién asumirá el descuento quincenal
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAssignModalData(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '4px' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Ficha Resumen de la Venta */}
                        <div style={{ padding: '0.85rem 1.25rem 0.5rem 1.25rem' }}>
                            <div style={{
                                backgroundColor: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '10px',
                                padding: '0.65rem 0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div>
                                    <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.82rem' }}>
                                        {assignModalData.productName}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '1px' }}>
                                        {assignModalData.qty.toFixed(2)} {assignModalData.uom} • {assignModalData.date}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', display: 'block' }}>
                                        Deducción
                                    </span>
                                    <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0D7A57', fontVariantNumeric: 'tabular-nums' }}>
                                        ${assignModalData.totalVal.toLocaleString('es-CO')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Input de Búsqueda Autocomplete */}
                        <div style={{ padding: '0.5rem 1.25rem 0.5rem 1.25rem' }}>
                            <div style={{
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                border: '1.5px solid #2563EB',
                                borderRadius: '8px',
                                boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.15)'
                            }}>
                                <Search size={15} style={{ position: 'absolute', left: '10px', color: '#2563EB' }} />
                                <input
                                    ref={assignInputRef}
                                    type="text"
                                    placeholder="Escribe nombre, cédula o cargo..."
                                    value={assignSearchQuery}
                                    onChange={e => setAssignSearchQuery(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const candidate = assignMatchingStaff[0]?.contact_name || assignSearchQuery.trim();
                                            if (candidate) handleAssignCollaborator(assignModalData.id, candidate, assignModalData.totalVal);
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '0.55rem 2rem 0.55rem 2.2rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        fontSize: '0.82rem',
                                        outline: 'none',
                                        fontWeight: '600'
                                    }}
                                />
                                {assignSearchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setAssignSearchQuery('')}
                                        style={{ position: 'absolute', right: '8px', border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8' }}
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Lista Scrollable de Colaboradores */}
                        <div style={{ padding: '0.25rem 1.25rem 1rem 1.25rem', maxHeight: '280px', overflowY: 'auto' }}>
                            {/* Opción libre para texto no encontrado */}
                            {assignSearchQuery.trim().length > 0 && (
                                <div
                                    onClick={() => handleAssignCollaborator(assignModalData.id, assignSearchQuery.trim(), assignModalData.totalVal)}
                                    style={{
                                        padding: '0.55rem 0.75rem',
                                        backgroundColor: '#EFF6FF',
                                        border: '1px dashed #93C5FD',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontSize: '0.78rem',
                                        color: '#1D4ED8',
                                        fontWeight: '700',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        marginBottom: '6px'
                                    }}
                                >
                                    <Plus size={14} />
                                    <span>Asignar nombre personalizado: "<strong>{assignSearchQuery.trim()}</strong>"</span>
                                </div>
                            )}

                            {assignMatchingStaff.length === 0 ? (
                                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.78rem' }}>
                                    No se encontraron colaboradores con "{assignSearchQuery}". Presiona Enter para usar el nombre escrito.
                                </div>
                            ) : (
                                assignMatchingStaff.map(s => {
                                    const isCurrent = assignModalData.currentEmployee.toLowerCase() === s.contact_name.toLowerCase();
                                    return (
                                        <div
                                            key={s.id}
                                            onClick={() => handleAssignCollaborator(assignModalData.id, s.contact_name, assignModalData.totalVal)}
                                            style={{
                                                padding: '0.55rem 0.75rem',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                marginBottom: '3px',
                                                backgroundColor: isCurrent ? '#F0FDF4' : 'transparent',
                                                border: isCurrent ? '1px solid #BBF7D0' : '1px solid transparent',
                                                transition: 'all 0.12s ease'
                                            }}
                                            onMouseEnter={e => {
                                                if (!isCurrent) e.currentTarget.style.backgroundColor = '#F8FAFC';
                                            }}
                                            onMouseLeave={e => {
                                                if (!isCurrent) e.currentTarget.style.backgroundColor = 'transparent';
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{
                                                    width: '28px',
                                                    height: '28px',
                                                    borderRadius: '50%',
                                                    backgroundColor: isCurrent ? '#DCFCE7' : '#F1F5F9',
                                                    color: isCurrent ? '#15803D' : '#475569',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '0.7rem',
                                                    fontWeight: '800'
                                                }}>
                                                    {s.contact_name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: '700', color: '#0F172A', fontSize: '0.8rem' }}>
                                                        {s.contact_name}
                                                    </div>
                                                    {s.document_id && (
                                                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                            CC: {s.document_id}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {s.role && (
                                                    <span style={{
                                                        fontSize: '0.65rem',
                                                        backgroundColor: '#F1F5F9',
                                                        color: '#475569',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        fontWeight: '700',
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        {s.role}
                                                    </span>
                                                )}
                                                {isCurrent && <Check size={14} color="#16A34A" />}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '0.75rem 1.25rem',
                            borderTop: '1px solid #E2E8F0',
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                                Presiona <kbd style={{ backgroundColor: '#E2E8F0', padding: '1px 4px', borderRadius: '3px', fontWeight: '700', color: '#334155' }}>Enter</kbd> para asignar
                            </span>
                            <button
                                type="button"
                                onClick={() => setAssignModalData(null)}
                                style={{
                                    padding: '0.4rem 0.9rem',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    color: '#475569',
                                    fontSize: '0.76rem',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================
                MODAL DE REGISTRO RÁPIDO DE VENTA A EMPLEADO
            ======================================================== */}
            {showCreateModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10005,
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '14px',
                        width: '100%',
                        maxWidth: '500px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                        border: '1px solid #CBD5E1',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#F8FAFC'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ backgroundColor: '#EDF5F1', padding: '6px', borderRadius: '8px', color: '#0D7A57' }}>
                                    <Plus size={18} strokeWidth={2.5} />
                                </div>
                                <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '800', color: '#0F172A' }}>
                                    Registrar Venta a Empleado (Col N)
                                </h4>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateEmployeeSale} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            {/* Fecha */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                                    Fecha de la Venta *
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={newSaleDate}
                                    onChange={e => setNewSaleDate(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.45rem 0.65rem',
                                        borderRadius: '6px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.82rem',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* Producto (Limpio, sin accounting_id) */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                                    Producto a Vender *
                                </label>
                                <select
                                    required
                                    value={newSaleProductId}
                                    onChange={e => setNewSaleProductId(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.45rem 0.65rem',
                                        borderRadius: '6px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.82rem',
                                        backgroundColor: '#FFFFFF',
                                        boxSizing: 'border-box'
                                    }}
                                >
                                    <option value="">-- Seleccionar producto del catálogo --</option>
                                    {productsList.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} (${formatNumber(p.base_price || 0)} / {p.unit_of_measure})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Colaborador con Combobox Reactivo */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                                    Colaborador para Nómina *
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Escribe para buscar colaborador o nuevo nombre..."
                                        value={newSaleCollabSearch}
                                        onChange={e => {
                                            setNewSaleCollabSearch(e.target.value);
                                            setNewSaleCollaborator(e.target.value);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '0.45rem 0.65rem',
                                            borderRadius: '6px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.82rem',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                    {newSaleCollabSearch.trim().length > 0 && !staffList.some(s => s.contact_name.toLowerCase() === newSaleCollabSearch.toLowerCase().trim()) && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            right: 0,
                                            marginTop: '3px',
                                            backgroundColor: '#FFFFFF',
                                            borderRadius: '6px',
                                            border: '1px solid #CBD5E1',
                                            boxShadow: '0 6px 12px rgba(0,0,0,0.1)',
                                            maxHeight: '140px',
                                            overflowY: 'auto',
                                            zIndex: 50
                                        }}>
                                            {staffList
                                                .filter(s => normalizeText(s.contact_name).includes(normalizeText(newSaleCollabSearch)))
                                                .slice(0, 6)
                                                .map(s => (
                                                    <div
                                                        key={s.id}
                                                        onClick={() => {
                                                            setNewSaleCollaborator(s.contact_name);
                                                            setNewSaleCollabSearch(s.contact_name);
                                                        }}
                                                        style={{
                                                            padding: '0.4rem 0.6rem',
                                                            cursor: 'pointer',
                                                            fontSize: '0.76rem',
                                                            borderBottom: '1px solid #F1F5F9'
                                                        }}
                                                    >
                                                        <strong>{s.contact_name}</strong> {s.role ? `(${s.role})` : ''}
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Cantidad y Preview de Total */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                                        Cantidad Vendida *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej: 3.5 o 10"
                                        value={newSaleQty}
                                        onChange={e => setNewSaleQty(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '0.45rem 0.65rem',
                                            borderRadius: '6px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.82rem',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                                        Total a Descontar Nómina
                                    </label>
                                    <div style={{
                                        padding: '0.45rem 0.65rem',
                                        borderRadius: '6px',
                                        backgroundColor: '#EDF5F1',
                                        border: '1px solid #A7F3D0',
                                        fontSize: '0.92rem',
                                        fontWeight: '900',
                                        color: '#0D7A57',
                                        textAlign: 'right',
                                        boxSizing: 'border-box'
                                    }}>
                                        {(() => {
                                            const p = productsList.find(x => x.id === newSaleProductId);
                                            const q = parseFloat(newSaleQty.replace(',', '.'));
                                            if (!p || isNaN(q) || q <= 0) return '$0 COP';
                                            const total = Math.round(q * (p.base_price || 0));
                                            return `$${formatNumber(total)} COP`;
                                        })()}
                                    </div>
                                </div>
                            </div>

                            {/* Botones */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.65rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    style={{
                                        padding: '0.4rem 0.95rem',
                                        borderRadius: '6px',
                                        border: '1px solid #CBD5E1',
                                        backgroundColor: '#FFFFFF',
                                        color: '#475569',
                                        fontSize: '0.76rem',
                                        fontWeight: '700',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingSale}
                                    style={{
                                        padding: '0.4rem 1.1rem',
                                        borderRadius: '6px',
                                        border: 'none',
                                        backgroundColor: '#0D7A57',
                                        color: '#FFFFFF',
                                        fontSize: '0.76rem',
                                        fontWeight: '700',
                                        cursor: isSubmittingSale ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 1px 3px rgba(13, 122, 87, 0.25)'
                                    }}
                                >
                                    {isSubmittingSale ? 'Guardando...' : 'Guardar y Descontar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
