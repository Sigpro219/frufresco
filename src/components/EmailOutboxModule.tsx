'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import { 
  Mail, 
  Search, 
  RefreshCw, 
  Eye, 
  X, 
  Send, 
  Calendar, 
  Trash2, 
  Printer, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  Minus,
  Sparkles,
  Inbox
} from 'lucide-react';
import { generateOrderConfirmationHtml } from '@/lib/emailTemplates';

interface EmailOutboxModuleProps {
  onOutboxChange?: (count: number) => void;
  topOffset?: number;
}

type SortField = 'date' | 'recipient' | 'subject' | 'status';
type SortOrder = 'asc' | 'desc';
type StatusFilter = 'all' | 'sent' | 'pending' | 'failed';

// Componente de Checkbox de Grado Industrial (Estandar FruFresco / Swiss Precision)
function CustomCheckbox({
  checked,
  indeterminate = false,
  onChange,
  title,
  ariaLabel
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.MouseEvent) => void;
  title?: string;
  ariaLabel?: string;
}) {
  const isActive = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel || title}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onChange(e);
      }}
      style={{
        width: '18px',
        height: '18px',
        borderRadius: '5px',
        border: isActive ? '2px solid #0D7A57' : '2px solid #94A3B8',
        backgroundColor: isActive ? '#0D7A57' : '#FFFFFF',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        outline: 'none',
        transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: isActive ? '0 1px 3px rgba(13, 122, 87, 0.3)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
        verticalAlign: 'middle'
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.borderColor = '#0D7A57';
          e.currentTarget.style.backgroundColor = '#F0FDF4';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.borderColor = '#94A3B8';
          e.currentTarget.style.backgroundColor = '#FFFFFF';
        }
      }}
    >
      {checked && <Check size={12} strokeWidth={3.5} color="#FFFFFF" />}
      {!checked && indeterminate && <Minus size={12} strokeWidth={3.5} color="#FFFFFF" />}
    </button>
  );
}

export default function EmailOutboxModule({ onOutboxChange, topOffset = 133 }: EmailOutboxModuleProps = {}) {
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; emailId: string | null }>({ isOpen: false, emailId: null });
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(50);

  useEffect(() => {
    if (!toolbarRef.current) return;
    const updateH = () => {
      if (toolbarRef.current) {
        setToolbarHeight(toolbarRef.current.offsetHeight);
      }
    };
    updateH();
    const obs = new ResizeObserver(updateH);
    obs.observe(toolbarRef.current);
    return () => obs.disconnect();
  }, []);

  const handleDeleteEmail = async () => {
    if (!deleteConfirm.emailId) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('mail')
        .delete()
        .eq('id', deleteConfirm.emailId);

      if (error) throw error;

      const updatedList = emails.filter(email => email.id !== deleteConfirm.emailId);
      setEmails(updatedList);
      setSelectedIds(prev => prev.filter(id => id !== deleteConfirm.emailId));
      if (onOutboxChange) {
        onOutboxChange(updatedList.length);
      }

      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('Correo eliminado con éxito de la bandeja de salida', 'success');
      }
    } catch (err: any) {
      console.error('Error deleting email:', err);
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('Error al eliminar el correo: ' + (err.message || err), 'error');
      }
    } finally {
      setDeleting(false);
      setDeleteConfirm({ isOpen: false, emailId: null });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const { error } = await supabase
        .from('mail')
        .delete()
        .in('id', selectedIds);

      if (error) throw error;

      const updatedList = emails.filter(email => !selectedIds.includes(email.id));
      setEmails(updatedList);
      setSelectedIds([]);
      if (onOutboxChange) {
        onOutboxChange(updatedList.length);
      }

      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast(`${selectedIds.length} correos eliminados de la bandeja de salida`, 'success');
      }
    } catch (err: any) {
      console.error('Error bulk deleting emails:', err);
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('Error al eliminar los correos: ' + (err.message || err), 'error');
      }
    } finally {
      setBulkDeleting(false);
      setBulkDeleteConfirm(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mail')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list = data || [];
      setEmails(list);
      if (onOutboxChange) {
        onOutboxChange(list.length);
      }
    } catch (err) {
      console.error('Error fetching outbox emails:', err);
    } finally {
      setLoading(false);
    }
  };

  // Keyboard navigation & Shortcuts (Esc, Enter, Delete, /)
  const stateRef = useRef({
    selectedEmail,
    deleteConfirm,
    bulkDeleteConfirm,
    selectedIds
  });

  useEffect(() => {
    stateRef.current = {
      selectedEmail,
      deleteConfirm,
      bulkDeleteConfirm,
      selectedIds
    };
  }, [selectedEmail, deleteConfirm, bulkDeleteConfirm, selectedIds]);

  const actionsRef = useRef({ handleDeleteEmail, handleBulkDelete });
  useEffect(() => {
    actionsRef.current = { handleDeleteEmail, handleBulkDelete };
  }, [handleDeleteEmail, handleBulkDelete]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      const {
        selectedEmail,
        deleteConfirm,
        bulkDeleteConfirm,
        selectedIds
      } = stateRef.current;

      const isTextInput = (target.tagName === 'INPUT' && (
        (target as HTMLInputElement).type === 'text' ||
        (target as HTMLInputElement).type === 'number' ||
        (target as HTMLInputElement).type === 'search' ||
        (target as HTMLInputElement).type === 'email' ||
        (target as HTMLInputElement).type === 'password'
      )) || target.tagName === 'TEXTAREA';

      // Omnibox shortcut '/' or 'Ctrl+K'
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && !isTextInput && !selectedEmail && !deleteConfirm.isOpen && !bulkDeleteConfirm) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      const isBypassKey = e.key === 'Escape' ||
        (e.key === 'Enter' && (!!selectedEmail || deleteConfirm.isOpen || bulkDeleteConfirm)) ||
        (e.key === 'Delete' && !isTextInput && (deleteConfirm.isOpen || bulkDeleteConfirm || selectedIds.length > 0 || !!selectedEmail));

      if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') && !isBypassKey) return;

      if (e.key === 'Escape') {
        if (bulkDeleteConfirm) { setBulkDeleteConfirm(false); return; }
        if (deleteConfirm.isOpen) { setDeleteConfirm({ isOpen: false, emailId: null }); return; }
        if (selectedEmail) { setSelectedEmail(null); return; }
        if (selectedIds.length > 0) { setSelectedIds([]); return; }
        if (searchQuery) { setSearchQuery(''); return; }
      }

      if (e.key === 'Enter') {
        if (bulkDeleteConfirm) {
          e.preventDefault();
          actionsRef.current.handleBulkDelete();
          return;
        }
        if (deleteConfirm.isOpen) {
          e.preventDefault();
          actionsRef.current.handleDeleteEmail();
          return;
        }
        if (selectedEmail) {
          e.preventDefault();
          setSelectedEmail(null);
          return;
        }
      }

      if (e.key === 'Delete') {
        if (bulkDeleteConfirm) {
          e.preventDefault();
          actionsRef.current.handleBulkDelete();
          return;
        }
        if (deleteConfirm.isOpen) {
          e.preventDefault();
          actionsRef.current.handleDeleteEmail();
          return;
        }
        if (selectedEmail) {
          e.preventDefault();
          setSelectedEmail(null);
          return;
        }
        if (selectedIds.length > 0 && !deleteConfirm.isOpen && !bulkDeleteConfirm) {
          e.preventDefault();
          setBulkDeleteConfirm(true);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery]);

  // Telemetría de contadores
  const telemetry = useMemo(() => {
    let sentCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    emails.forEach(email => {
      const isFailed = email.status === 'failed';
      const isPending = email.status === 'pending' || email.status === 'processing';
      if (isFailed) {
        failedCount++;
      } else if (isPending) {
        pendingCount++;
      } else {
        sentCount++;
      }
    });

    return {
      total: emails.length,
      sent: sentCount,
      pending: pendingCount,
      failed: failedCount
    };
  }, [emails]);

  // Filtrado y Ordenamiento
  const filteredAndSortedEmails = useMemo(() => {
    // 1. Filtrado
    const query = searchQuery.toLowerCase().trim();

    const filtered = emails.filter(email => {
      // Estado
      if (statusFilter === 'sent') {
        const isPending = email.status === 'pending' || email.status === 'processing';
        const isFailed = email.status === 'failed';
        if (isPending || isFailed) return false;
      } else if (statusFilter === 'pending') {
        const isPending = email.status === 'pending' || email.status === 'processing';
        if (!isPending) return false;
      } else if (statusFilter === 'failed') {
        if (email.status !== 'failed') return false;
      }

      // Fecha
      if (selectedDate) {
        const emailDate = new Date(email.sent_at || email.created_at || Date.now()).toISOString().split('T')[0];
        if (emailDate !== selectedDate) return false;
      }

      // Búsqueda de texto
      if (query) {
        const to = (email.to_email || '').toLowerCase();
        const sub = (email.subject || '').toLowerCase();
        const stat = (email.status || '').toLowerCase();
        const orderNum = email.template?.data?.order_number ? String(email.template.data.order_number).toLowerCase() : '';
        const matches = to.includes(query) || sub.includes(query) || stat.includes(query) || orderNum.includes(query);
        if (!matches) return false;
      }

      return true;
    });

    // 2. Ordenamiento
    return filtered.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        const timeA = new Date(a.sent_at || a.created_at || 0).getTime();
        const timeB = new Date(b.sent_at || b.created_at || 0).getTime();
        comparison = timeA - timeB;
      } else if (sortField === 'recipient') {
        comparison = (a.to_email || '').localeCompare(b.to_email || '');
      } else if (sortField === 'subject') {
        comparison = (a.subject || '').localeCompare(b.subject || '');
      } else if (sortField === 'status') {
        comparison = (a.status || '').localeCompare(b.status || '');
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [emails, searchQuery, selectedDate, statusFilter, sortField, sortOrder]);

  // Selección maestra
  const isAllSelected = filteredAndSortedEmails.length > 0 && filteredAndSortedEmails.every(e => selectedIds.includes(e.id));
  const isSomeSelected = filteredAndSortedEmails.some(e => selectedIds.includes(e.id)) && !isAllSelected;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const visibleIds = new Set(filteredAndSortedEmails.map(e => e.id));
      setSelectedIds(prev => prev.filter(id => !visibleIds.has(id)));
    } else {
      const currentIds = new Set(selectedIds);
      filteredAndSortedEmails.forEach(e => currentIds.add(e.id));
      setSelectedIds(Array.from(currentIds));
    }
  };

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const theadTop = `${topOffset + toolbarHeight}px`;

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', width: '100%', padding: '0 0.25rem' }}>
      
      {/* 1. Header Toolbar (Línea 2 Sticky - Acople Magnético) */}
      <div
        ref={toolbarRef}
        style={{
          position: 'sticky',
          top: `${topOffset}px`,
          zIndex: 40,
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          padding: '0.65rem 1rem',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.05)',
          marginBottom: '0.5rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          
          {/* Lado Izquierdo: Titulo + Píldoras de Telemetría Reactiva */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '6px' }}>
              <div style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                backgroundColor: '#ECFDF5',
                color: '#0D7A57',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #A7F3D0'
              }}>
                <Send size={15} strokeWidth={2.4} />
              </div>
              <div>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>
                  Bandeja de Salida Email
                </h2>
              </div>
            </div>

            {/* Píldoras de Filtro con Telemetría Reactiva */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                style={{
                  padding: '3px 9px',
                  borderRadius: '7px',
                  border: 'none',
                  backgroundColor: statusFilter === 'all' ? '#FFFFFF' : 'transparent',
                  color: statusFilter === 'all' ? '#0F172A' : '#64748B',
                  fontWeight: statusFilter === 'all' ? 800 : 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: statusFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                <span>Todos</span>
                <span style={{
                  padding: '1px 5px',
                  borderRadius: '999px',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  backgroundColor: statusFilter === 'all' ? '#0F172A' : '#E2E8F0',
                  color: statusFilter === 'all' ? '#FFFFFF' : '#475569'
                }}>
                  {telemetry.total}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('sent')}
                style={{
                  padding: '3px 9px',
                  borderRadius: '7px',
                  border: 'none',
                  backgroundColor: statusFilter === 'sent' ? '#FFFFFF' : 'transparent',
                  color: statusFilter === 'sent' ? '#065F46' : '#64748B',
                  fontWeight: statusFilter === 'sent' ? 800 : 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: statusFilter === 'sent' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                <span>Enviados</span>
                <span style={{
                  padding: '1px 5px',
                  borderRadius: '999px',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  backgroundColor: statusFilter === 'sent' ? '#D1FAE5' : '#E2E8F0',
                  color: statusFilter === 'sent' ? '#065F46' : '#475569'
                }}>
                  {telemetry.sent}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                style={{
                  padding: '3px 9px',
                  borderRadius: '7px',
                  border: 'none',
                  backgroundColor: statusFilter === 'pending' ? '#FFFFFF' : 'transparent',
                  color: statusFilter === 'pending' ? '#92400E' : '#64748B',
                  fontWeight: statusFilter === 'pending' ? 800 : 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: statusFilter === 'pending' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#F59E0B' }} />
                <span>En Cola</span>
                <span style={{
                  padding: '1px 5px',
                  borderRadius: '999px',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  backgroundColor: statusFilter === 'pending' ? '#FEF3C7' : '#E2E8F0',
                  color: statusFilter === 'pending' ? '#92400E' : '#475569'
                }}>
                  {telemetry.pending}
                </span>
              </button>

              {telemetry.failed > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('failed')}
                  style={{
                    padding: '3px 9px',
                    borderRadius: '7px',
                    border: 'none',
                    backgroundColor: statusFilter === 'failed' ? '#FEF2F2' : 'transparent',
                    color: statusFilter === 'failed' ? '#991B1B' : '#DC2626',
                    fontWeight: statusFilter === 'failed' ? 800 : 600,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: statusFilter === 'failed' ? '0 1px 3px rgba(239, 68, 68, 0.2)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#EF4444' }} />
                  <span>Fallidos</span>
                  <span style={{
                    padding: '1px 5px',
                    borderRadius: '999px',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    backgroundColor: '#FEE2E2',
                    color: '#991B1B'
                  }}>
                    {telemetry.failed}
                  </span>
                </button>
              )}
            </div>

            {/* Barra de Acciones por Lote (cuando hay seleccionados) */}
            {selectedIds.length > 0 && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#F0FDF4',
                border: '1.5px solid #86EFAC',
                borderRadius: '8px',
                padding: '3px 10px',
                animation: 'fadeIn 0.2s ease-in-out'
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#166534' }}>
                  {selectedIds.length} {selectedIds.length === 1 ? 'correo' : 'correos'}
                </span>
                <button
                  onClick={() => setBulkDeleteConfirm(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FCA5A5',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    color: '#DC2626',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                  title="Eliminar correos seleccionados (Delete)"
                >
                  <Trash2 size={12} />
                  Eliminar
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748B',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '4px'
                  }}
                  title="Deseleccionar todos (Esc)"
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Lado Derecho: Superbuscador Omnibox + Filtro Fecha + Botón Actualizar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            
            {/* Superbuscador Omnibox */}
            <div style={{ position: 'relative', width: '280px', minWidth: '220px' }}>
              <span style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94A3B8',
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none'
              }}>
                <Search size={14} />
              </span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar destinatario, asunto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem 2.2rem 0.45rem 2rem',
                  borderRadius: '9px',
                  border: '1.5px solid #CBD5E1',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  outline: 'none',
                  transition: 'all 0.15s',
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  height: '34px',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#0D7A57';
                  e.target.style.boxShadow = '0 0 0 3px rgba(13, 122, 87, 0.12)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#CBD5E1';
                  e.target.style.boxShadow = 'none';
                }}
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94A3B8',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '4px'
                  }}
                  title="Limpiar búsqueda (Esc)"
                >
                  <X size={13} />
                </button>
              ) : (
                <span style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  backgroundColor: '#F1F5F9',
                  color: '#64748B',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  border: '1px solid #E2E8F0',
                  pointerEvents: 'none'
                }}>
                  /
                </span>
              )}
            </div>

            {/* Date Filter Picker */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#FFFFFF',
              border: '1.5px solid #CBD5E1',
              borderRadius: '9px',
              padding: '0.25rem 0.6rem',
              gap: '6px',
              height: '34px',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s'
            }}>
              <Calendar size={14} color="#64748B" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  color: '#0F172A',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  backgroundColor: 'transparent'
                }}
              />
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94A3B8',
                    padding: '1px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Quitar filtro de fecha"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchEmails}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0.45rem 0.85rem',
                backgroundColor: '#FFFFFF',
                border: '1.5px solid #CBD5E1',
                borderRadius: '9px',
                fontWeight: 700,
                fontSize: '0.78rem',
                color: '#334155',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                height: '34px',
                boxSizing: 'border-box'
              }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#F8FAFC')}
              onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#FFFFFF')}
              title="Refrescar bandeja de salida"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} color={loading ? '#0D7A57' : '#64748B'} />
              <span>{loading ? 'Cargando...' : 'Actualizar'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Tabla Industrial con Thead Sticky WCAG AAA */}
      {loading && emails.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          color: '#64748B',
          fontWeight: 600,
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#0D7A57' }} />
          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0F172A' }}>
            Sincronizando bandeja de salida...
          </p>
          <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>Consultando eventos de despacho en tiempo real</span>
        </div>
      ) : filteredAndSortedEmails.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1.5px dashed #CBD5E1',
          color: '#64748B',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <Inbox size={42} style={{ opacity: 0.4, margin: '0 auto 12px auto', color: '#94A3B8' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
            No se encontraron correos
          </h3>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.82rem', color: '#64748B' }}>
            {searchQuery || selectedDate || statusFilter !== 'all' 
              ? 'No hay registros que coincidan con los filtros aplicados.' 
              : 'La bandeja de salida está limpia. No hay correos registrados en el historial.'}
          </p>
          {(searchQuery || selectedDate || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedDate('');
                setStatusFilter('all');
              }}
              style={{
                padding: '0.45rem 1rem',
                backgroundColor: '#F1F5F9',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              Restablecer filtros
            </button>
          )}
        </div>
      ) : (
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)',
          position: 'relative',
          overflow: 'visible'
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0,
            fontSize: '0.85rem',
            textAlign: 'left'
          }}>
            <thead style={{
              position: 'sticky',
              top: theadTop,
              zIndex: 35,
              backgroundColor: '#F1F5F9'
            }}>
              <tr style={{
                backgroundColor: '#F1F5F9',
                borderBottom: '2px solid #CBD5E1'
              }}>
                {/* Master Checkbox Header */}
                <th style={{
                  position: 'sticky',
                  top: theadTop,
                  zIndex: 35,
                  backgroundColor: '#F1F5F9',
                  borderBottom: '2px solid #CBD5E1',
                  borderTopLeftRadius: '14px',
                  padding: '0.75rem 0.85rem',
                  width: '46px',
                  textAlign: 'center',
                  verticalAlign: 'middle'
                }}>
                  <CustomCheckbox
                    checked={isAllSelected}
                    indeterminate={isSomeSelected}
                    onChange={handleToggleSelectAll}
                    title={isAllSelected ? "Deseleccionar todos" : "Seleccionar todos"}
                    ariaLabel="Seleccionar todos los correos"
                  />
                </th>

                {/* Columna Fecha / Hora */}
                <th
                  onClick={() => handleToggleSort('date')}
                  style={{
                    position: 'sticky',
                    top: theadTop,
                    zIndex: 35,
                    backgroundColor: '#F1F5F9',
                    borderBottom: '2px solid #CBD5E1',
                    padding: '0.75rem 1rem',
                    fontWeight: 800,
                    color: '#0F172A',
                    width: '180px',
                    fontSize: '0.72rem',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap'
                  }}
                  title="Ordenar por fecha de emisión"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span>FECHA / HORA</span>
                    {sortField === 'date' ? (
                      sortOrder === 'asc' ? <ArrowUp size={13} color="#0D7A57" strokeWidth={2.5} /> : <ArrowDown size={13} color="#0D7A57" strokeWidth={2.5} />
                    ) : (
                      <ArrowUpDown size={12} color="#94A3B8" />
                    )}
                  </div>
                </th>

                {/* Columna Destinatario */}
                <th
                  onClick={() => handleToggleSort('recipient')}
                  style={{
                    position: 'sticky',
                    top: theadTop,
                    zIndex: 35,
                    backgroundColor: '#F1F5F9',
                    borderBottom: '2px solid #CBD5E1',
                    padding: '0.75rem 1rem',
                    fontWeight: 800,
                    color: '#0F172A',
                    width: '280px',
                    fontSize: '0.72rem',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                  title="Ordenar por destinatario"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span>DESTINATARIO</span>
                    {sortField === 'recipient' ? (
                      sortOrder === 'asc' ? <ArrowUp size={13} color="#0D7A57" strokeWidth={2.5} /> : <ArrowDown size={13} color="#0D7A57" strokeWidth={2.5} />
                    ) : (
                      <ArrowUpDown size={12} color="#94A3B8" />
                    )}
                  </div>
                </th>

                {/* Columna Asunto */}
                <th
                  onClick={() => handleToggleSort('subject')}
                  style={{
                    position: 'sticky',
                    top: theadTop,
                    zIndex: 35,
                    backgroundColor: '#F1F5F9',
                    borderBottom: '2px solid #CBD5E1',
                    padding: '0.75rem 1rem',
                    fontWeight: 800,
                    color: '#0F172A',
                    fontSize: '0.72rem',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                  title="Ordenar por asunto"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span>ASUNTO</span>
                    {sortField === 'subject' ? (
                      sortOrder === 'asc' ? <ArrowUp size={13} color="#0D7A57" strokeWidth={2.5} /> : <ArrowDown size={13} color="#0D7A57" strokeWidth={2.5} />
                    ) : (
                      <ArrowUpDown size={12} color="#94A3B8" />
                    )}
                  </div>
                </th>

                {/* Columna Estado */}
                <th
                  onClick={() => handleToggleSort('status')}
                  style={{
                    position: 'sticky',
                    top: theadTop,
                    zIndex: 35,
                    backgroundColor: '#F1F5F9',
                    borderBottom: '2px solid #CBD5E1',
                    padding: '0.75rem 1rem',
                    fontWeight: 800,
                    color: '#0F172A',
                    width: '150px',
                    textAlign: 'center',
                    fontSize: '0.72rem',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                  title="Ordenar por estado"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <span>ESTADO</span>
                    {sortField === 'status' ? (
                      sortOrder === 'asc' ? <ArrowUp size={13} color="#0D7A57" strokeWidth={2.5} /> : <ArrowDown size={13} color="#0D7A57" strokeWidth={2.5} />
                    ) : (
                      <ArrowUpDown size={12} color="#94A3B8" />
                    )}
                  </div>
                </th>

                {/* Columna Acciones */}
                <th style={{
                  position: 'sticky',
                  top: theadTop,
                  zIndex: 35,
                  backgroundColor: '#F1F5F9',
                  borderBottom: '2px solid #CBD5E1',
                  borderTopRightRadius: '14px',
                  padding: '0.75rem 0.85rem',
                  width: '85px',
                  textAlign: 'center',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  color: '#64748B'
                }}>
                  ACCIONES
                </th>
              </tr>
            </thead>

              <tbody>
                {filteredAndSortedEmails.map((email, idx) => {
                  const date = new Date(email.sent_at || email.created_at || Date.now());
                  const isSandbox = email.status === 'sandbox_sent' || (email.subject && email.subject.includes('[PRUEBAS')) || (email.error_message && email.error_message.includes('buzón de pruebas'));
                  const isSimulated = email.status === 'simulated' || email.subject?.toLowerCase().includes('(simulado)') || email.message?.text?.includes('[SIMULADO]');
                  const isFailed = email.status === 'failed';
                  const isPending = email.status === 'pending' || email.status === 'processing';
                  const isSelected = selectedIds.includes(email.id);

                  // Extracción de número de pedido en asunto para highlight visual
                  const orderMatch = (email.subject || '').match(/#(\d+)/);
                  const orderNumberBadge = orderMatch ? `#${orderMatch[1]}` : null;

                  return (
                    <tr
                      key={email.id}
                      style={{
                        backgroundColor: isSelected ? '#F0FDF4' : idx % 2 === 0 ? '#FFFFFF' : '#FBFDFB',
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background-color 0.12s ease'
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#FFFFFF' : '#FBFDFB';
                      }}
                    >
                      {/* Row Checkbox */}
                      <td style={{
                        padding: '0.75rem 0.85rem',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        borderBottom: '1px solid #F1F5F9'
                      }}>
                        <CustomCheckbox
                          checked={isSelected}
                          onChange={() => {
                            setSelectedIds(prev => 
                              isSelected ? prev.filter(id => id !== email.id) : [...prev, email.id]
                            );
                          }}
                          title={`Seleccionar correo para ${email.to_email}`}
                          ariaLabel={`Seleccionar correo ${email.id}`}
                        />
                      </td>

                      {/* Fecha / Hora */}
                      <td style={{
                        padding: '0.75rem 1rem',
                        verticalAlign: 'middle',
                        borderBottom: '1px solid #F1F5F9',
                        whiteSpace: 'nowrap'
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.82rem', letterSpacing: '-0.01em' }}>
                            {date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </span>
                          <span style={{
                            color: '#64748B',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            fontFamily: 'monospace'
                          }}>
                            {date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                          </span>
                        </div>
                      </td>

                      {/* Destinatario */}
                      <td style={{
                        padding: '0.75rem 1rem',
                        verticalAlign: 'middle',
                        borderBottom: '1px solid #F1F5F9'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: '#E2E8F0',
                            color: '#475569',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {(email.to_email || 'U')[0].toUpperCase()}
                          </div>
                          <span style={{
                            fontWeight: 700,
                            color: '#0F172A',
                            fontSize: '0.84rem',
                            wordBreak: 'break-word',
                            lineHeight: 1.3
                          }}>
                            {email.to_email}
                          </span>
                        </div>
                      </td>

                      {/* Asunto */}
                      <td style={{
                        padding: '0.75rem 1rem',
                        verticalAlign: 'middle',
                        borderBottom: '1px solid #F1F5F9'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {orderNumberBadge && (
                            <span style={{
                              padding: '2px 7px',
                              borderRadius: '6px',
                              backgroundColor: '#ECFDF5',
                              border: '1px solid #A7F3D0',
                              color: '#065F46',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              fontFamily: 'monospace'
                            }}>
                              {orderNumberBadge}
                            </span>
                          )}
                          <span style={{
                            color: '#334155',
                            fontWeight: 600,
                            fontSize: '0.83rem',
                            lineHeight: 1.35
                          }}>
                            {email.subject}
                          </span>
                        </div>
                      </td>

                      {/* Estado WCAG AAA Badges */}
                      <td style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        borderBottom: '1px solid #F1F5F9',
                        whiteSpace: 'nowrap'
                      }}>
                        {isFailed ? (
                          <span style={{
                            backgroundColor: '#FEF2F2',
                            color: '#991B1B',
                            border: '1px solid #FECDD3',
                            padding: '3px 9px',
                            borderRadius: '999px',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <AlertTriangle size={11} strokeWidth={2.6} />
                            FALLIDO
                          </span>
                        ) : isSandbox ? (
                          <span style={{
                            backgroundColor: '#FEF3C7',
                            color: '#92400E',
                            border: '1px solid #FCD34D',
                            padding: '3px 9px',
                            borderRadius: '999px',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#D97706' }} />
                            MODO PRUEBAS
                          </span>
                        ) : isSimulated ? (
                          <span style={{
                            backgroundColor: '#F1F5F9',
                            color: '#334155',
                            border: '1px solid #CBD5E1',
                            padding: '3px 9px',
                            borderRadius: '999px',
                            fontSize: '0.7rem',
                            fontWeight: 800
                          }}>
                            SIMULADO
                          </span>
                        ) : isPending ? (
                          <span style={{
                            backgroundColor: '#FFFBEB',
                            color: '#92400E',
                            border: '1px solid #FDE68A',
                            padding: '3px 9px',
                            borderRadius: '999px',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}>
                            <Clock size={11} strokeWidth={2.4} />
                            EN COLA
                          </span>
                        ) : (
                          <span style={{
                            backgroundColor: '#ECFDF5',
                            color: '#065F46',
                            border: '1px solid #A7F3D0',
                            padding: '3px 9px',
                            borderRadius: '999px',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}>
                            <CheckCircle2 size={12} strokeWidth={2.6} />
                            ENVIADO REAL
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td style={{
                        padding: '0.75rem 0.85rem',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        borderBottom: '1px solid #F1F5F9'
                      }}>
                        <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedEmail(email)}
                            style={{
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #CBD5E1',
                              color: '#334155',
                              cursor: 'pointer',
                              padding: '5px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '7px',
                              transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.backgroundColor = '#ECFDF5';
                              e.currentTarget.style.borderColor = '#A7F3D0';
                              e.currentTarget.style.color = '#0D7A57';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.backgroundColor = '#FFFFFF';
                              e.currentTarget.style.borderColor = '#CBD5E1';
                              e.currentTarget.style.color = '#334155';
                            }}
                            title="Ver vista previa del correo (Enter)"
                          >
                            <Eye size={15} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteConfirm({ isOpen: true, emailId: email.id })}
                            style={{
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #CBD5E1',
                              color: '#64748B',
                              cursor: 'pointer',
                              padding: '5px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '7px',
                              transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.backgroundColor = '#FEF2F2';
                              e.currentTarget.style.borderColor = '#FECDD3';
                              e.currentTarget.style.color = '#DC2626';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.backgroundColor = '#FFFFFF';
                              e.currentTarget.style.borderColor = '#CBD5E1';
                              e.currentTarget.style.color = '#64748B';
                            }}
                            title="Eliminar este correo de la bandeja"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

          {/* Table Footer Summary Bar */}
          <div style={{
            padding: '0.65rem 1.25rem',
            backgroundColor: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.78rem',
            color: '#64748B',
            fontWeight: 600
          }}>
            <div>
              Mostrando <strong style={{ color: '#0F172A' }}>{filteredAndSortedEmails.length}</strong> de <strong style={{ color: '#0F172A' }}>{emails.length}</strong> correos en bandeja
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span>Hostinger SMTP SSL 465 • Canal Oficial FruFresco</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Detail Preview Modal */}
      {selectedEmail && (() => {
        const previewHtml = selectedEmail.message?.html || (selectedEmail.template?.name === 'order_confirmation' ? generateOrderConfirmationHtml(selectedEmail.template.data) : null);
        const isSandboxModal = selectedEmail.status === 'sandbox_sent' || (selectedEmail.subject && selectedEmail.subject.includes('[PRUEBAS')) || (selectedEmail.error_message && emailOutboxIncludesSandbox(selectedEmail.error_message));

        return (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1.25rem'
          }}>
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '20px',
              width: '95%',
              maxWidth: '1100px',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              textAlign: 'left',
              overflow: 'hidden'
            }}>
              {/* Modal Header */}
              <div style={{
                padding: '1.25rem 1.75rem',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#FFFFFF'
              }}>
                <div style={{ minWidth: 0, paddingRight: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      backgroundColor: '#ECFDF5',
                      color: '#065F46',
                      fontWeight: 800,
                      fontSize: '0.72rem',
                      fontFamily: 'monospace'
                    }}>
                      OUTBOX AUDIT
                    </span>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0F172A', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedEmail.subject}
                    </h3>
                  </div>
                  <p style={{ margin: 0, color: '#64748B', fontSize: '0.82rem', fontWeight: 600 }}>
                    Para: <strong style={{ color: '#0F172A' }}>{selectedEmail.to_email}</strong> • Enviado: {new Date(selectedEmail.sent_at || selectedEmail.created_at || Date.now()).toLocaleString('es-CO')}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {previewHtml && (
                    <>
                      <button
                        onClick={() => {
                          const fileName = `Pedido_${(selectedEmail.template?.data?.order_number || selectedEmail.subject || 'confirmacion').toString().replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;
                          const blob = new Blob([previewHtml], { type: 'text/html;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = fileName;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          URL.revokeObjectURL(url);
                        }}
                        style={{
                          padding: '0.45rem 0.85rem',
                          backgroundColor: '#F8FAFC',
                          border: '1.5px solid #CBD5E1',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          color: '#334155',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#E2E8F0'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                        title="Descargar HTML"
                      >
                        <Download size={14} />
                        Descargar
                      </button>

                      <button
                        onClick={() => {
                          const printWindow = window.open('', '_blank');
                          if (printWindow) {
                            printWindow.document.write(previewHtml);
                            printWindow.document.close();
                            printWindow.focus();
                            setTimeout(() => {
                              printWindow.print();
                              printWindow.close();
                            }, 350);
                          }
                        }}
                        style={{
                          padding: '0.45rem 0.95rem',
                          backgroundColor: '#0D7A57',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 800,
                          fontSize: '0.78rem',
                          color: '#FFFFFF',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#0B6447'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0D7A57'}
                        title="Imprimir o guardar como PDF"
                      >
                        <Printer size={14} />
                        Imprimir
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => setSelectedEmail(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#64748B',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '6px',
                      borderRadius: '8px'
                    }}
                    title="Cerrar (Esc)"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1, backgroundColor: '#F8FAFC' }}>
                {isSandboxModal && (
                  <div style={{
                    backgroundColor: '#FEF3C7',
                    border: '1px solid #FCD34D',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    marginBottom: '1rem',
                    fontSize: '0.8rem',
                    color: '#92400E',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <AlertTriangle size={18} strokeWidth={2.2} style={{ color: '#D97706', flexShrink: 0 }} />
                    <div>
                      <strong>MODO PRUEBAS ACTIVO:</strong> Este correo fue generado en entorno de pruebas y redirigido a tu buzón de auditoría (<u>no</u> fue enviado al cliente real).
                    </div>
                  </div>
                )}

                {previewHtml ? (
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden', backgroundColor: '#FFFFFF', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
                    <iframe
                      srcDoc={previewHtml}
                      title="Vista previa del correo"
                      style={{
                        width: '100%',
                        height: '620px',
                        border: 'none',
                        display: 'block'
                      }}
                    />
                  </div>
                ) : (
                  <div style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '2rem',
                    fontSize: '0.88rem',
                    lineHeight: '1.6',
                    color: '#0F172A',
                    whiteSpace: 'pre-wrap',
                    minHeight: '200px'
                  }}>
                    {selectedEmail.message?.text || 'Sin contenido de texto alternativo'}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '1rem 1.75rem',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#FFFFFF'
              }}>
                <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>
                  Investments Cortés S.A.S • Confirmación Oficial de Pedido
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    onClick={() => setSelectedEmail(null)}
                    style={{
                      padding: '0.45rem 1.1rem',
                      backgroundColor: '#FFFFFF',
                      border: '1.5px solid #CBD5E1',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      color: '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFFFFF'}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 4. Delete Single Email Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '2rem'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '440px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
            textAlign: 'left',
            padding: '1.5rem',
            border: '1px solid #E2E8F0'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
              color: '#DC2626'
            }}>
              <Trash2 size={20} strokeWidth={2.4} />
            </div>
            <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '1.15rem', color: '#0F172A', fontWeight: 800 }}>
              ¿Eliminar registro de correo?
            </h3>
            <p style={{ margin: '0 0 1.5rem 0', color: '#64748B', fontSize: '0.85rem', lineHeight: '1.5' }}>
              Esta acción eliminará de forma permanente el registro de este correo enviado de la bandeja de salida. No se puede deshacer.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setDeleteConfirm({ isOpen: false, emailId: null })}
                disabled={deleting}
                style={{
                  padding: '0.5rem 1.1rem',
                  backgroundColor: '#FFFFFF',
                  border: '1.5px solid #CBD5E1',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  color: '#475569',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => !deleting && (e.currentTarget.style.backgroundColor = '#F1F5F9')}
                onMouseLeave={e => !deleting && (e.currentTarget.style.backgroundColor = '#FFFFFF')}
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteEmail}
                disabled={deleting}
                style={{
                  padding: '0.5rem 1.15rem',
                  backgroundColor: deleting ? '#FDA4AF' : '#DC2626',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  color: '#FFFFFF',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                  boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)'
                }}
                onMouseEnter={e => !deleting && (e.currentTarget.style.backgroundColor = '#B91C1C')}
                onMouseLeave={e => !deleting && (e.currentTarget.style.backgroundColor = '#DC2626')}
              >
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '2rem'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '450px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
            textAlign: 'left',
            padding: '1.5rem',
            border: '1px solid #E2E8F0'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
              color: '#DC2626'
            }}>
              <Trash2 size={20} strokeWidth={2.4} />
            </div>
            <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '1.15rem', color: '#0F172A', fontWeight: 800 }}>
              ¿Eliminar {selectedIds.length} correos seleccionados?
            </h3>
            <p style={{ margin: '0 0 1.5rem 0', color: '#64748B', fontSize: '0.85rem', lineHeight: '1.5' }}>
              Esta acción eliminará de forma permanente los <strong>{selectedIds.length}</strong> correos seleccionados de la bandeja de salida. No se puede deshacer.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
                style={{
                  padding: '0.5rem 1.1rem',
                  backgroundColor: '#FFFFFF',
                  border: '1.5px solid #CBD5E1',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  color: '#475569',
                  cursor: bulkDeleting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => !bulkDeleting && (e.currentTarget.style.backgroundColor = '#F1F5F9')}
                onMouseLeave={e => !bulkDeleting && (e.currentTarget.style.backgroundColor = '#FFFFFF')}
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                style={{
                  padding: '0.5rem 1.15rem',
                  backgroundColor: bulkDeleting ? '#FDA4AF' : '#DC2626',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  color: '#FFFFFF',
                  cursor: bulkDeleting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                  boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)'
                }}
                onMouseEnter={e => !bulkDeleting && (e.currentTarget.style.backgroundColor = '#B91C1C')}
                onMouseLeave={e => !bulkDeleting && (e.currentTarget.style.backgroundColor = '#DC2626')}
              >
                {bulkDeleting ? 'Eliminando...' : `Sí, eliminar (${selectedIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function emailOutboxIncludesSandbox(errorMessage?: string | null): boolean {
  if (!errorMessage) return false;
  return errorMessage.includes('buzón de pruebas');
}
