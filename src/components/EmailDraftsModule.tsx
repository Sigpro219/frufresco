'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import { Mail, ArrowRight, Trash2, MapPin, Phone, Hash, X, Check, Calendar, Search, ChevronDown, Info, List, Grid, AlertTriangle, MessageSquare, UploadCloud, Home, Building2, Globe, Edit2, FileText, Send, Keyboard } from 'lucide-react';
import { Map, Marker } from '@vis.gl/react-google-maps';
import Link from 'next/link';

const getChannelBadge = (source: string) => {
    switch (source) {
        case 'whatsapp': 
            return <span style={{ backgroundColor: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MessageSquare size={10} strokeWidth={1.5} /> WhatsApp</span>;
        case 'phone': 
            return <span style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Phone size={10} strokeWidth={1.5} /> Teléfono</span>;
        case 'email': 
            return <span style={{ backgroundColor: '#F3E8FF', color: '#6B21A8', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Mail size={10} strokeWidth={1.5} /> Correo</span>;
        case 'file_upload': 
            return <span style={{ backgroundColor: '#FEF3C7', color: '#B45309', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><UploadCloud size={10} strokeWidth={1.5} /> Carga</span>;
        case 'web_b2c': 
            return <span style={{ backgroundColor: '#FCE7F3', color: '#9D174D', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Home size={10} strokeWidth={1.5} /> Web Hogar</span>;
        case 'web_b2b': 
            return <span style={{ backgroundColor: '#E0F2FE', color: '#0369A1', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Building2 size={10} strokeWidth={1.5} /> Web Horeca</span>;
        default: 
            return <span style={{ backgroundColor: '#F3F4F6', color: '#4B5563', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Globe size={10} strokeWidth={1.5} /> {source || 'Web'}</span>;
    }
};

const getSpanishStem = (word: string) => {
  const norm = word.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '').trim();
  if (norm.length <= 2) return norm;
  if (norm.endsWith('as') || norm.endsWith('os') || norm.endsWith('es')) {
    return norm.slice(0, -2);
  }
  if (norm.endsWith('a') || norm.endsWith('o') || norm.endsWith('e')) {
    return norm.slice(0, -1);
  }
  return norm;
};

// Returns { matched: boolean, matchedTextInSearch: string | null }
const matchVariantOption = (searchText: string, optionValue: string) => {
  const optLower = String(optionValue).toLowerCase().trim();
  if (!optLower) return { matched: false, matchedTextInSearch: null };
  const optStem = getSpanishStem(optLower);
  if (!optStem) return { matched: false, matchedTextInSearch: null };

  const wordRegex = /[a-zA-Z0-9\u00C0-\u017F]+/g;
  let match;
  while ((match = wordRegex.exec(searchText)) !== null) {
    const word = match[0];
    const wordStem = getSpanishStem(word);
    if (wordStem === optStem && wordStem.length >= 2) {
      return { matched: true, matchedTextInSearch: word };
    }
  }
  return { matched: false, matchedTextInSearch: null };
};

const getSmartFallbackUnit = (prodName: string, databaseUnit: string): string => {
  const name = prodName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (name.includes('huevo')) {
    return 'Unidad';
  }
  if (name.includes('leche') || name.includes('yogurt') || name.includes('crema de leche') || name.includes('jugo')) {
    return 'Litro';
  }
  if (name.includes('pan ') || name.includes('panes') || name.includes('tajado') || name.includes('tostada') || name.includes('arepa') || name.includes('galleta')) {
    return 'Unidad';
  }
  if (name.includes('aceite')) {
    return 'Litro';
  }
  return databaseUnit || 'Kg';
};

interface EmailDraftsModuleProps {
  onDraftsChange?: (count: number) => void;
}

export default function EmailDraftsModule({ onDraftsChange }: EmailDraftsModuleProps = {}) {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState<any>(null);
  const [draftCoordinates, setDraftCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [editableItems, setEditableItems] = useState<any[]>([]);
  const [recentlyDeletedItems, setRecentlyDeletedItems] = useState<string[]>([]);
  const [deliveryDate, setDeliveryDate] = useState<string>(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [b2cPolygon, setB2cPolygon] = useState<any[]>([]);
  const [editableAddress, setEditableAddress] = useState<string>('');
  const [editableClientName, setEditableClientName] = useState<string>('');
  const [editableClientPhone, setEditableClientPhone] = useState<string>('');
  const [editableClientNit, setEditableClientNit] = useState<string>('');
  const [editableClientType, setEditableClientType] = useState<'b2b_client' | 'b2c_client'>('b2c_client');
  const [editableDeliverySlot, setEditableDeliverySlot] = useState<string>('');
  const [priceList, setPriceList] = useState<string>('');
  const [orderDocument, setOrderDocument] = useState<string>('Remisión');
  const [purchaseOrder, setPurchaseOrder] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const productInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [obsModal, setObsModal] = useState<{
    isOpen: boolean;
    rowIndex: number;
    text: string;
  } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [receiptSent, setReceiptSent] = useState(false);
  
  useEffect(() => {
    if (selectedDraft) {
      const metadata = getDraftMetadata(selectedDraft);
      setReceiptSent(metadata?.receiptEmailSent || false);
    }
  }, [selectedDraft]);

  useEffect(() => {
    setRecentlyDeletedItems([]);
    setScrollPercent(0);
    setIsScrolled(false);
    setActiveVariantRow(null);
    setActiveEquivalenceRow(null);
  }, [selectedDraft?.id]);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    step: 1 | 2;
    productName: string;
    onConfirmNotify: () => Promise<void>;
    onConfirmOnlyDelete: () => Promise<void>;
  } | null>(null);
  const [actionConfirm, setActionConfirm] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([]);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeVariantRow, setActiveVariantRow] = useState<number | null>(null);
  const [activeEquivalenceRow, setActiveEquivalenceRow] = useState<number | null>(null);
  useEffect(() => {
    setSelectedRowIndices([]);
  }, [isEditing, selectedDraft?.id]);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejectModal, setRejectModal] = useState<{
    isOpen: boolean;
    draftId: string;
    address: string;
    sourceEmail: string;
    totalValue: number;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => { setToast({ message, type }); };



  const getRowBgColor = (idx: number) => {
    if (focusedRowIndex === idx) return '#EFF6FF'; // Soft blue for currently focused/edited row
    if (activeEquivalenceRow === idx) return '#EEF2FF'; // Soft indigo for equivalence row
    if (activeVariantRow === idx) return '#F0FDF4'; // Soft green for variant row
    return null;
  };

  const getCellBgColor = (idx: number, isLightGrayCol = false) => {
    const rowBg = getRowBgColor(idx);
    if (rowBg) return rowBg;
    return isLightGrayCol ? '#F9FAFB' : 'transparent';
  };
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const DEFAULT_B2C_POLYGON = [
    { lat: 4.647, lng: -74.062 },
    { lat: 4.685, lng: -74.030 },
    { lat: 4.760, lng: -74.045 },
    { lat: 4.720, lng: -74.095 },
    { lat: 4.665, lng: -74.080 }
  ];

  const checkIsNewClient = (draft: any) => {
    if (!draft) return false;
    if (draft.profile_id === null) return true;
    
    if (draft.profiles) {
      if (draft.profiles.is_active === false) return true;
      if (draft.profiles.role === 'b2c_client') {
        const detectedName = draft.client_detected_name || '';
        const profileName = draft.profiles.contact_name || draft.profiles.company_name || '';
        if (!detectedName) return false;
        
        const norm1 = detectedName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const norm2 = profileName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        
        const words1 = norm1.split(/\s+/).filter(w => w.length > 2);
        const words2 = norm2.split(/\s+/).filter(w => w.length > 2);
        
        if (words1.length > 0 && words2.length > 0) {
          const shareWord = words1.some(w => words2.includes(w));
          if (!shareWord) return true;
        }
      }
    }
    return false;
  };

  useEffect(() => {
    fetchDrafts();
    fetchProducts();
    fetchAliases();
    fetchGeofence();

    const channel = supabase.channel('realtime-drafts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_drafts' },
        (payload) => {
          console.log('[Email Inbound] Realtime update received:', payload);
          fetchDrafts(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (onDraftsChange) {
      const pendingCount = drafts.filter((d: any) => d.status === 'pending').length;
      onDraftsChange(pendingCount);
    }
  }, [drafts, onDraftsChange]);

  useEffect(() => {
    // Refresh every 30s only when modal is not open to avoid any interruption
    if (selectedDraft) return;

    const interval = setInterval(() => {
      fetchDrafts(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedDraft]);



  const fetchGeofence = async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'geofence_b2c_poly')
        .single();
      if (data && data.value) {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        if (Array.isArray(parsed)) {
          setB2cPolygon(parsed);
        }
      }
    } catch (e) {
      console.error('Error fetching geofence', e);
    }
  };

  const checkIfInCoverage = (lat: number, lng: number) => {
    const polygon = b2cPolygon.length > 0 ? b2cPolygon : DEFAULT_B2C_POLYGON;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;

      const intersect = ((yi > lat) !== (yj > lat))
          && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const handleRejectForCoverage = () => {
    if (!selectedDraft) return;
    setActionConfirm({
      isOpen: true,
      title: '¿Rechazar por falta de cobertura?',
      message: '¿Estás seguro de que deseas rechazar este pedido por falta de cobertura? Se enviará un correo electrónico de notificación al cliente.',
      confirmText: 'Rechazar',
      cancelText: 'Cancelar',
      isDanger: true,
      onConfirm: async () => {
        setSaving(true);
        try {
          const addressStr = getDraftMetadata(selectedDraft).address || 'No especificada';
          const res = await fetch('/api/orders/reject-draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              draftId: selectedDraft.id,
              address: addressStr,
              sourceEmail: selectedDraft.source_email,
              reason: 'cobertura'
            })
          });

          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Error en el servidor');
          }

          showToast('Borrador de pedido rechazado. Se ha enviado el correo electrónico de notificación al cliente. ✉️', 'success');
          setSelectedDraft(null);
          fetchDrafts();
        } catch (e: any) {
          console.error('Error in handleRejectForCoverage:', e);
          showToast(`Error al rechazar el borrador: ${e.message}. Por favor intenta de nuevo.`, 'error');
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const fetchProducts = async () => {
    try {
      const { data } = await supabase.from('products').select('*').eq('is_active', true);
      if (data) setProducts(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleEdit = async () => {
    if (isEditing) {
      setSaving(true);
      try {
        const metaItem = selectedDraft.extracted_items?.find((i: any) => i.isMetadata) || { isMetadata: true };
        const updatedMetaItem = {
          ...metaItem,
          address: editableAddress,
          deliverySlot: editableDeliverySlot || null,
          deliveryDate: deliveryDate,
          priceList: priceList,
          orderDocument: orderDocument,
          purchaseOrder: purchaseOrder,
          latitude: draftCoordinates?.lat || metaItem.latitude || null,
          longitude: draftCoordinates?.lng || metaItem.longitude || null
        };
        const updatedExtractedItems = [
          updatedMetaItem,
          ...editableItems
        ];

        const { error } = await supabase
          .from('order_drafts')
          .update({ extracted_items: updatedExtractedItems })
          .eq('id', selectedDraft.id);

        if (error) throw error;
        
        setSelectedDraft((prev: any) => ({
          ...prev,
          extracted_items: updatedExtractedItems
        }));
        setDrafts(prev => prev.map(d => d.id === selectedDraft.id ? { ...d, extracted_items: updatedExtractedItems } : d));
        showToast('Borrador de pedido guardado exitosamente.', 'success');
      } catch (e: any) {
        console.warn('Error saving edits:', e?.message || e);
        showToast('Error al guardar las modificaciones del borrador: ' + (e?.message || e), 'error');
        return;
      } finally {
        setSaving(false);
      }
    }
    setIsEditing(!isEditing);
  };

  const handleBatchDelete = () => {
    if (selectedRowIndices.length === 0) return;
    const namesToDelete = selectedRowIndices.map(idx => {
      const item = editableItems[idx];
      if (!item) return '';
      const mProd = products.find(p => p.id === item.matched_product_id);
      return mProd ? mProd.name : (item.searchQuery || item.originalName || 'Producto sin nombre');
    }).filter(Boolean);

    setDeleteConfirm({
      isOpen: true,
      step: 1,
      productName: namesToDelete.join(', '),
      onConfirmNotify: async () => {
        setSaving(true);
        try {
          const updatedDeleted = [...recentlyDeletedItems, ...namesToDelete];
          setRecentlyDeletedItems(updatedDeleted);

          const remainingItems = editableItems.filter((_, idx) => !selectedRowIndices.includes(idx));
          setEditableItems(remainingItems);
          setSelectedRowIndices([]);

          const emailItems = remainingItems.map(itm => {
            const mProd = products.find(p => p.id === itm.matched_product_id);
            return {
              productName: mProd ? mProd.name : (itm.searchQuery || itm.originalName || 'No especificado'),
              quantity: itm.quantity,
              unitPrice: mProd ? mProd.base_price : 0,
              unitOfMeasure: itm.unit || (mProd ? mProd.unit_of_measure : 'und')
            };
          });

          const metaItem = selectedDraft.extracted_items?.find((itm: any) => itm.isMetadata) || { isMetadata: true };
          const dbItems = [
            { ...metaItem, deliveryDate: deliveryDate },
            ...remainingItems.map(itm => ({
              originalName: itm.originalName || '',
              quantity: itm.quantity,
              matched_product_id: itm.matched_product_id
            }))
          ];

          const res = await fetch('/api/orders/notify-deleted-item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              draftId: selectedDraft.id,
              deletedItem: updatedDeleted,
              sourceEmail: selectedDraft.source_email,
              clientName: selectedDraft.client_detected_name || 'Cliente',
              dbItems,
              emailItems
            })
          });

          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Error en el servidor');
          }

          setRecentlyDeletedItems([]);
          setSelectedDraft((prev: any) => ({
            ...prev,
            extracted_items: dbItems
          }));
          setDrafts(prev => prev.map(d => d.id === selectedDraft.id ? { ...d, extracted_items: dbItems } : d));
          showToast('Productos eliminados y novedades notificadas por correo. ✉️', 'success');
        } catch (err: any) {
          console.warn('Error deleting and notifying:', err);
          showToast(`Error al notificar al cliente: ${err.message || 'Error de conexión'}`, 'error');
        } finally {
          setSaving(false);
        }
      },
      onConfirmOnlyDelete: async () => {
        const updatedDeleted = [...recentlyDeletedItems, ...namesToDelete];
        setRecentlyDeletedItems(updatedDeleted);
        
        const remainingItems = editableItems.filter((_, idx) => !selectedRowIndices.includes(idx));
        setEditableItems(remainingItems);
        setSelectedRowIndices([]);
        showToast('Productos eliminados de la lista (novedades pendientes de notificar). ⚠️', 'success');
      }
    });
  };

  const fetchAliases = async () => {
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'ai_product_aliases').single();
      if (data && data.value) {
        setAliases(typeof data.value === 'string' ? JSON.parse(data.value) : data.value);
      }
    } catch (e) {
      console.error('Error fetching aliases', e);
    }
  };

  const fetchDrafts = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('order_drafts')
        .select('*, profiles:profile_id(id, company_name, contact_name, role, is_active)')
        .in('status', ['pending', 'approved', 'rejected'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDrafts(data || []);
    } catch (err) {
      console.error('Error fetching drafts:', err);
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const draftToModify = drafts.find(d => d.id === id);
    const isAlreadyRejected = draftToModify?.status === 'rejected';

    setActionConfirm({
      isOpen: true,
      title: isAlreadyRejected ? '¿Eliminar borrador permanentemente?' : '¿Rechazar y eliminar borrador?',
      message: isAlreadyRejected 
        ? 'Este borrador ya está rechazado. ¿Deseas eliminarlo de forma permanente del sistema?' 
        : '¿Estás seguro de que deseas rechazar y eliminar este borrador de pedido?',
      confirmText: isAlreadyRejected ? 'Eliminar Permanentemente' : 'Rechazar y Eliminar',
      cancelText: 'Cancelar',
      isDanger: true,
      onConfirm: async () => {
        try {
          if (isAlreadyRejected) {
            const { error } = await supabase
              .from('order_drafts')
              .delete()
              .eq('id', id);

            if (error) throw error;
            setDrafts(prev => prev.filter(d => d.id !== id));
            showToast('Borrador eliminado permanentemente.', 'success');
          } else {
            const { error } = await supabase
              .from('order_drafts')
              .update({ status: 'rejected' })
              .eq('id', id);

            if (error) throw error;
            setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: 'rejected' } : d));
            showToast('Borrador rechazado.', 'success');
          }
          if (selectedDraft?.id === id) setSelectedDraft(null);
        } catch (err) {
          console.error('Error deleting draft:', err);
          showToast('Error al procesar la solicitud.', 'error');
        }
      }
    });
  };

  const triggerGeocoding = (addressVal: string) => {
    if (addressVal && addressVal !== 'No detectado') {
      setGeocoding(true);
      setDraftCoordinates(null);
      fetch(`/api/geocode?address=${encodeURIComponent(addressVal)}&city=Bogotá`)
        .then(res => res.json())
        .then(data => {
          if (data.status === 'OK' && data.results && data.results.length > 0) {
            const loc = data.results[0].geometry.location;
            setDraftCoordinates({ lat: loc.lat, lng: loc.lng });
          }
        })
        .catch(err => console.error("Geocode error", err))
        .finally(() => setGeocoding(false));
    } else {
      setDraftCoordinates(null);
      setGeocoding(false);
    }
  };

  useEffect(() => {
    if (selectedDraft) {
      setIsEditing(true);
      const meta = getDraftMetadata(selectedDraft);
      setEditableAddress(meta.address || '');
      
      setEditableClientName(selectedDraft.client_detected_name || '');
      setEditableClientPhone(meta.phone && meta.phone !== 'No detectado' ? meta.phone : '');
      setEditableClientNit(meta.nit && meta.nit !== 'No detectado' ? meta.nit : '');
      setEditableClientType(meta.clientType || 'b2c_client');
      
      if (meta.latitude && meta.longitude) {
        setDraftCoordinates({ lat: meta.latitude, lng: meta.longitude });
      } else {
        triggerGeocoding(meta.address);
      }
      
      // Initialize editable items
      const rawItems = getDraftItems(selectedDraft);
      const initialEdits = rawItems.map((item: any) => {
        let cleanName = item.originalName || item.name || '';
        const rawOriginalName = cleanName;
        if (cleanName) {
          cleanName = cleanName
            .replace(/^[0-9]+(?:[\.,][0-9]+)?(?:\s*(?:kg|kls?|kilos?|g|gr|gramos?|litros?|l|lbs?|libras?|unidades?|uds?|unds?|paquetes?))?\s+(?:de\s+)?/i, '')
            .replace(/^(libras?\s+de\s+|libra\s+de\s+|unidades?\s+de\s+|litros?\s+de\s+|paquetes?\s+de\s+)/i, '')
            .trim();
        }

        let matchedId = item.matched_product_id || null;
        
        // Load preference from memory/localStorage first
        if (typeof window !== 'undefined') {
          const clientName = selectedDraft.client_detected_name || 'default';
          const prefKey = `frufresco_pref_${clientName}_${cleanName}`;
          const savedPrefId = localStorage.getItem(prefKey);
          if (savedPrefId) {
            matchedId = savedPrefId;
          }
        }

        if (!matchedId) {
          const matchedProd = findMatchedProduct(cleanName);
          if (matchedProd) matchedId = matchedProd.id;
        }
        const prod = products.find(p => p.id === matchedId);
        
        const parsedUnit = (() => {
          const u = (item.unit || '').toLowerCase().trim();
          if (u === 'libra' || u === 'libras' || u === 'lb') return 'Lb';
          if (u === 'litro' || u === 'litros' || u === 'l' || u === 'lt') return 'Litro';
          if (u === 'unidad' || u === 'unidades' || u === 'ud' || u === 'und') return 'Unidad';
          if (u.includes('500 g') || u.includes('500g') || u.includes('500 gramos')) return 'Paquete 500 gramos';
          if (u.includes('250 g') || u.includes('250g') || u.includes('250 gramos')) return 'Paquete 250 gramos';
          if (u === 'kg' || u === 'kilo' || u === 'kilos' || u === 'kilogramo' || u === 'kilogramos' || u === 'kl' || u === 'kls') return 'Kg';
          if (u === 'g' || u === 'gr' || u === 'gramo' || u === 'gramos') {
            const qty = Number(item.quantity || 1);
            if (qty === 500) return 'Paquete 500 gramos';
            if (qty === 250) return 'Paquete 250 gramos';
            return 'Kg';
          }
          if (u === 'atado' || u === 'atados') return 'Atado';
          if (u === 'bulto' || u === 'bultos') return 'Bulto';
          if (u === 'canastilla' || u === 'canastillas') return 'Canastilla';
          if (u === 'paquete' || u === 'paquetes') {
            const qty = Number(item.quantity || 1);
            if (qty === 500) return 'Paquete 500 gramos';
            if (qty === 250) return 'Paquete 250 gramos';
            return prod?.unit_of_measure || 'Kg';
          }
          
          const origLower = rawOriginalName.toLowerCase();
          if (origLower.includes('libra')) return 'Lb';
          if (origLower.includes('500 g') || origLower.includes('500g') || origLower.includes('500 gramos')) return 'Paquete 500 gramos';
          if (origLower.includes('250 g') || origLower.includes('250g') || origLower.includes('250 gramos')) return 'Paquete 250 gramos';
          if (origLower.includes('litro') || origLower.includes('litros') || origLower.includes(' l ') || origLower.includes(' lt')) return 'Litro';
          if (origLower.includes('kg') || origLower.includes('kilo') || origLower.includes('kilogramo') || origLower.includes('gramo') || origLower.includes(' g ')) return 'Kg';
          if (origLower.includes('paquete') || origLower.includes('atado') || origLower.includes('bulto') || origLower.includes('canastilla') || origLower.includes('cubeta') || origLower.includes('racimo')) {
            return prod?.unit_of_measure || 'Kg';
          }
          
          return prod ? getSmartFallbackUnit(prod.name, prod.unit_of_measure || 'Kg') : 'Unidad';
        })();

        const isLibra = parsedUnit === 'Lb';
        const initialQty = parseFloat(item.quantity || 1);
        let conversionFactor = isLibra ? 0.5 : (item.conversion_factor || 1);
        let finalQty = isLibra ? parseFloat((initialQty * 0.5).toFixed(2)) : initialQty;
        let finalUnit = prod?.unit_of_measure || (isLibra ? 'Kg' : parsedUnit);

        if (initialQty >= 100 && !isLibra) {
          const targetUnit = prod?.unit_of_measure || 'Kg';
          if (targetUnit === 'Kg') {
            conversionFactor = 0.001;
            finalQty = parseFloat((initialQty * 0.001).toFixed(3));
            finalUnit = 'Kg';
          } else if (targetUnit === 'Atado') {
            conversionFactor = 0.002; // 500g = 1 Atado
            finalQty = parseFloat((initialQty * 0.002).toFixed(2));
            finalUnit = 'Atado';
          }
        }

        return {
            ...item,
            originalName: cleanName,
            originalQuantity: initialQty,
            quantity: finalQty,
            conversion_factor: conversionFactor,
            originalUnit: parsedUnit,
            originalMatchedProductId: matchedId,
            matched_product_id: matchedId,
            skuQuery: prod?.sku || '',
            unit: finalUnit,
            observations: (() => {
              let extraDescription = '';
              if (prod && prod.name) {
                const origClean = rawOriginalName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
                const prodClean = prod.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
                const origWords = origClean.split(/\s+/).filter(w => w.length > 0);
                const prodWords = prodClean.split(/\s+/).filter(w => w.length > 0);
                const extraWords = origWords.filter(w => !prodWords.includes(w) && !['de', 'para', 'con', 'el', 'la', 'los', 'las', 'un', 'una', 'en'].includes(w));
                extraDescription = extraWords.join(' ');
              }
              let finalObservations = [item.observations || '', extraDescription].filter(Boolean).join(' ').trim();

              if (prod && prod.variants && prod.variants.length > 0) {
                const variantOptionNames = new Set<string>();
                let isOldFormat = false;
                prod.variants.forEach((v: any) => {
                  if (v.name && Array.isArray(v.options)) {
                    isOldFormat = true;
                  } else if (v.options && typeof v.options === 'object' && !Array.isArray(v.options)) {
                    Object.keys(v.options).forEach(k => variantOptionNames.add(k));
                  }
                });

                let variantOptionsList = prod.variants;
                if (!isOldFormat) {
                  variantOptionsList = Array.from(variantOptionNames).map(name => {
                    const values = new Set<string>();
                    prod.variants.forEach((v: any) => {
                      if (v.options && v.options[name]) values.add(v.options[name]);
                    });
                    return { name, options: Array.from(values) };
                  });
                }

                const searchText = `${rawOriginalName} ${finalObservations}`.toLowerCase();
                variantOptionsList.forEach((v: any) => {
                  if (Array.isArray(v.options)) {
                    for (const optVal of v.options) {
                      const matchResult = matchVariantOption(searchText, String(optVal));
                      if (matchResult.matched && matchResult.matchedTextInSearch) {
                        const escapeRegex = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                        const regex = new RegExp(`\\b${escapeRegex(matchResult.matchedTextInSearch)}\\b`, 'gi');
                        finalObservations = finalObservations.replace(regex, '').replace(/\s+/g, ' ').trim();
                        break;
                      }
                    }
                  }
                });
              }
              return finalObservations;
            })(),
            selected_options: (() => {
              const autoSelectedOptions: Record<string, string> = { ...(item.selected_options || {}) };
              if (prod && prod.variants && prod.variants.length > 0) {
                const variantOptionNames = new Set<string>();
                let isOldFormat = false;
                prod.variants.forEach((v: any) => {
                  if (v.name && Array.isArray(v.options)) {
                    isOldFormat = true;
                  } else if (v.options && typeof v.options === 'object' && !Array.isArray(v.options)) {
                    Object.keys(v.options).forEach(k => variantOptionNames.add(k));
                  }
                });

                let variantOptionsList = prod.variants;
                if (!isOldFormat) {
                  variantOptionsList = Array.from(variantOptionNames).map(name => {
                    const values = new Set<string>();
                    prod.variants.forEach((v: any) => {
                      if (v.options && v.options[name]) values.add(v.options[name]);
                    });
                    return { name, options: Array.from(values) };
                  });
                }

                let extraDescription = '';
                if (prod && prod.name) {
                  const origClean = rawOriginalName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
                  const prodClean = prod.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
                  const origWords = origClean.split(/\s+/).filter(w => w.length > 0);
                  const prodWords = prodClean.split(/\s+/).filter(w => w.length > 0);
                  const extraWords = origWords.filter(w => !prodWords.includes(w) && !['de', 'para', 'con', 'el', 'la', 'los', 'las', 'un', 'una', 'en'].includes(w));
                  extraDescription = extraWords.join(' ');
                }
                const searchText = `${rawOriginalName} ${(item.observations || '')} ${extraDescription}`.toLowerCase();

                variantOptionsList.forEach((v: any) => {
                  if (!autoSelectedOptions[v.name] && Array.isArray(v.options)) {
                    for (const optVal of v.options) {
                      const matchResult = matchVariantOption(searchText, String(optVal));
                      if (matchResult.matched) {
                        autoSelectedOptions[v.name] = optVal;
                        break;
                      }
                    }
                  }
                });
              }
              return autoSelectedOptions;
            })()
        };
      });
      setEditableItems(initialEdits);

      // Initialize delivery date from metadata if present
      const metadata = getDraftMetadata(selectedDraft);
      setEditableDeliverySlot(metadata.deliverySlot || '');
      setPriceList(metadata.priceList || '');
      setOrderDocument(metadata.orderDocument || 'Remisión');
      setPurchaseOrder(metadata.purchaseOrder || '');
      if (metadata.deliveryDate) {
        setDeliveryDate(metadata.deliveryDate);
      } else {
        setDeliveryDate(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
      }
      
      setEditableClientName('');
      setEditableClientPhone('');
      setEditableClientNit('');
      setEditableClientType('b2c_client');
    } else {
      setDraftCoordinates(null);
      setGeocoding(false);
      setEditableItems([]);
      setEditableClientName('');
      setEditableClientPhone('');
      setEditableClientNit('');
      setEditableClientType('b2c_client');
      setEditableDeliverySlot('');
      setPriceList('');
      setOrderDocument('Remisión');
      setPurchaseOrder('');
      setDeliveryDate(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
    }
  }, [selectedDraft, products, aliases]);

  // Funciones de ayuda para extraer metadata (soportando ambas formas, DB column o JSON metadata)
  const getDraftItems = (draft: any) => {
    const raw = draft.extracted_items || [];
    return raw.filter((i: any) => !i.isMetadata);
  };
  
  const getDraftMetadata = (draft: any) => {
    const raw = draft.extracted_items || [];
    const meta = raw.find((i: any) => i.isMetadata);
    
    // Normalize and/or assume delivery slot based on metadata or email content
    let deliverySlot = meta?.deliverySlot || draft.delivery_slot || null;
    
    if (deliverySlot) {
      const lowerSlot = deliverySlot.toString().toLowerCase().trim();
      if (lowerSlot.includes('am') || lowerSlot.includes('mañana') || lowerSlot.includes('morning') || lowerSlot.includes('mñn') || lowerSlot.includes('7:00') || lowerSlot.includes('7:30') || lowerSlot.includes('8:00') || lowerSlot.includes('11:00') || lowerSlot.includes('11:50')) {
        deliverySlot = 'AM';
      } else if (lowerSlot.includes('pm') || lowerSlot.includes('tarde') || lowerSlot.includes('afternoon') || lowerSlot.includes('12:') || lowerSlot.includes('13:') || lowerSlot.includes('14:') || lowerSlot.includes('15:') || lowerSlot.includes('16:') || lowerSlot.includes('17:')) {
        deliverySlot = 'PM';
      } else if (lowerSlot.includes('cualquier') || lowerSlot.includes('todo') || lowerSlot.includes('any') || lowerSlot.includes('all')) {
        deliverySlot = 'Cualquier hora';
      } else {
        if (deliverySlot !== 'AM' && deliverySlot !== 'PM' && deliverySlot !== 'Cualquier hora') {
          deliverySlot = null;
        }
      }
    }
    
    if (!deliverySlot && draft.email_body) {
      const bodyLower = draft.email_body.toLowerCase();
      const address = (meta?.address || draft.extracted_address || '').toLowerCase();
      const clientName = (draft.client_detected_name || '').toLowerCase();
      
      if (address.includes('athan') || clientName.includes('athan') || address.includes('bosques') || clientName.includes('bosques')) {
        // "Bosques de Athan" schedule: 7:00am a 04:00pm -> Cualquier hora
        deliverySlot = 'Cualquier hora';
      } else if (address.includes('roma') || clientName.includes('roma') || address.includes('clínica') || clientName.includes('clínica')) {
        // "Clínica Roma" schedule: 7:30am a 8:00am y 11:00am a 11:50am -> AM
        deliverySlot = 'AM';
      } else {
        // General schedule or standard range check in email text
        if (bodyLower.includes('7:00 a 11:00') || bodyLower.includes('7:00am a 11:00am') || bodyLower.includes('7:00 a.m. a 11:00 a.m.') || bodyLower.includes('7:00 a 11:00 de la mañana')) {
          deliverySlot = 'AM';
        } else if (bodyLower.includes('7:00am a 04:00pm') || bodyLower.includes('7:00 am a 4:00 pm') || bodyLower.includes('7:00am a 4:00pm')) {
          deliverySlot = 'Cualquier hora';
        } else if (bodyLower.includes('7:30am a 8:00am') || bodyLower.includes('11:00am a 11:50am')) {
          deliverySlot = 'AM';
        } else if (bodyLower.includes('mañana') || bodyLower.includes('morning') || bodyLower.includes('am')) {
          deliverySlot = 'AM';
        } else if (bodyLower.includes('tarde') || bodyLower.includes('pm')) {
          deliverySlot = 'PM';
        }
      }
    }

    return {
      address: meta?.address || draft.extracted_address || 'No detectado',
      phone: meta?.phone || draft.extracted_phone || 'No detectado',
      nit: meta?.nit || draft.extracted_nit || 'No detectado',
      clientType: meta?.clientType || draft.profiles?.role || 'b2c_client',
      deliveryDate: meta?.deliveryDate || null,
      deliverySlot: deliverySlot,
      attachmentUrl: meta?.attachmentUrl || null,
      attachmentName: meta?.attachmentName || null,
      rejectReason: meta?.rejectReason || null,
      latitude: meta?.latitude || null,
      longitude: meta?.longitude || null,
      priceList: meta?.priceList || null,
      orderDocument: meta?.orderDocument || null,
      purchaseOrder: meta?.purchaseOrder || null,
      receiptEmailSent: meta?.receiptEmailSent || false
    };
  };

  const findMatchedProduct = (originalName: string) => {
    if (!originalName) return null;
    const cleanName = originalName.toLowerCase().trim();
    
    const aliasMatch = aliases[cleanName];
    if (aliasMatch) {
      const prod = products.find(p => p.id === aliasMatch);
      if (prod) return prod;
    }

    const cleanText = (txt: string) => {
      return txt
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "")
        .trim();
    };

    const originalClean = cleanText(originalName);
    const originalWords = originalClean.split(/\s+/).filter(w => w.length > 1);

    let bestMatch: any = null;
    let highestScore = -999;

    for (const p of products) {
      const productClean = cleanText(p.name);
      
      if (productClean === originalClean) {
        return p;
      }

      const productWords = productClean.split(/\s+/).filter(w => w.length > 1);
      const sharedWords = originalWords.filter(w => productWords.includes(w));
      
      if (sharedWords.length > 0) {
        const extraWords = Math.abs(productWords.length - sharedWords.length);
        const score = sharedWords.length * 10 - extraWords;
        if (score > highestScore) {
          highestScore = score;
          bestMatch = p;
        }
      }
    }

    if (bestMatch) {
      const hasOnlyGenericSharedWords = originalWords.filter(w => {
        const productClean = cleanText(bestMatch.name || '');
        return productClean.split(/\s+/).includes(w);
      }).every(w => ['tipo', 'de', 'con', 'para', 'el', 'la', 'los', 'las', 'un', 'una', 'en', 'bulto', 'bultos', 'kilo', 'kilos', 'kg', 'g', 'gr', 'gramos', 'libra', 'libras', 'lb', 'litro', 'litros', 'l', 'lt', 'unidad', 'unidades', 'paquete', 'paquetes', 'atado', 'atados', 'canastilla', 'canastillas', 'caja', 'cajas', 'bolsa', 'bolsas', 'x'].includes(w));

      if (highestScore < 8 || hasOnlyGenericSharedWords) {
        bestMatch = null;
      }
    }

    if (!bestMatch) {
      if (originalClean.length >= 3 && !['tipo', 'para', 'con'].includes(originalClean)) {
        bestMatch = products.find((p: any) => {
          const productClean = cleanText(p.name);
          return productClean.includes(originalClean) || originalClean.includes(productClean);
        });
      }
    }

    return bestMatch;
  };

  // --- INVOICE FLOATING APPROVAL MODAL ---
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('contra_entrega');
  const [deliverySlot, setDeliverySlot] = useState('AM');
  const [confirmingOrder, setConfirmingOrder] = useState(false);
  const [sendConfirmationEmail, setSendConfirmationEmail] = useState(true);
  const [isAuthorizedForChanges, setIsAuthorizedForChanges] = useState(false);

  const stateRef = useRef({
    isEditing,
    focusedRowIndex,
    products,
    editableItems,
    selectedDraft,
    showConfirmModal,
    activeEquivalenceRow,
    activeVariantRow,
    actionConfirm,
    deleteConfirm,
    obsModal,
    rejectModal,
    showShortcuts,
    selectedDraftIds
  });

  useEffect(() => {
    stateRef.current = {
      isEditing,
      focusedRowIndex,
      products,
      editableItems,
      selectedDraft,
      showConfirmModal,
      activeEquivalenceRow,
      activeVariantRow,
      actionConfirm,
      deleteConfirm,
      obsModal,
      rejectModal,
      showShortcuts,
      selectedDraftIds
    };
  }, [
    isEditing, focusedRowIndex, products, editableItems, selectedDraft, showConfirmModal,
    activeEquivalenceRow, activeVariantRow, actionConfirm, deleteConfirm, obsModal,
    rejectModal, showShortcuts, selectedDraftIds
  ]);

  useEffect(() => {
    const isAnyModalOpen = !!(selectedDraft || showConfirmModal || rejectModal || obsModal || actionConfirm || deleteConfirm || showShortcuts);
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedDraft, showConfirmModal, rejectModal, obsModal, actionConfirm, deleteConfirm, showShortcuts]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      const {
        isEditing,
        focusedRowIndex,
        products,
        editableItems,
        selectedDraft,
        showConfirmModal,
        actionConfirm,
        deleteConfirm,
        obsModal,
        rejectModal,
        showShortcuts,
        selectedDraftIds
      } = stateRef.current;

      const isAltShortcut = e.altKey && (
        e.code === 'KeyE' || e.key === 'e' || e.key === 'E' ||
        e.code === 'KeyV' || e.key === 'v' || e.key === 'V'
      );

      const isTextInput = (target.tagName === 'INPUT' && (
        (target as HTMLInputElement).type === 'text' ||
        (target as HTMLInputElement).type === 'number' ||
        (target as HTMLInputElement).type === 'search' ||
        (target as HTMLInputElement).type === 'email' ||
        (target as HTMLInputElement).type === 'password'
      )) || target.tagName === 'TEXTAREA';

      const isBypassKey = isAltShortcut || e.ctrlKey || e.metaKey || e.key === 'Escape' ||
        (e.key === 'Enter' && (!!actionConfirm || !!deleteConfirm || !!rejectModal || !!showConfirmModal || !!obsModal)) ||
        (e.key === 'Delete' && !isTextInput);

      if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') && !isBypassKey) return;

      // Handle Enter key for confirmation modals
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (target.tagName === 'TEXTAREA') return;

        if (actionConfirm && actionConfirm.isOpen) {
          e.preventDefault();
          actionConfirm.onConfirm();
          setActionConfirm(null);
          return;
        }
        if (deleteConfirm && deleteConfirm.isOpen) {
          e.preventDefault();
          if (deleteConfirm.step === 1) {
            setDeleteConfirm(prev => prev ? { ...prev, step: 2 } : null);
          } else {
            const runConfirm = async () => {
              await deleteConfirm.onConfirmNotify();
              setDeleteConfirm(null);
            };
            runConfirm();
          }
          return;
        }
        if (rejectModal && rejectModal.isOpen) {
          e.preventDefault();
          const confirmBtn = document.getElementById('btn-confirm-reject') as HTMLButtonElement | null;
          if (confirmBtn && !confirmBtn.disabled) {
            confirmBtn.click();
          }
          return;
        }
        if (showConfirmModal && selectedDraft) {
          e.preventDefault();
          const confirmBtn = document.getElementById('btn-confirm-order-final') as HTMLButtonElement | null;
          if (confirmBtn && !confirmBtn.disabled) {
            confirmBtn.click();
          }
          return;
        }
        if (obsModal && obsModal.isOpen) {
          e.preventDefault();
          const newEdits = [...editableItems];
          newEdits[obsModal.rowIndex].observations = obsModal.text;
          setEditableItems(newEdits);
          setObsModal(null);
          return;
        }
      }

      // Handle Alt+E shortcut globally
      if (e.altKey && (e.code === 'KeyE' || e.key === 'e' || e.key === 'E')) {
        if (selectedDraft && isEditing && focusedRowIndex !== null && !showConfirmModal) {
          e.preventDefault();
          const i = focusedRowIndex;
          setActiveEquivalenceRow(prev => {
            const next = prev === i ? null : i;
            setTimeout(() => {
              if (next === i) {
                const equivInput = document.getElementById(`equiv-input-${i}`);
                if (equivInput) {
                  equivInput.focus();
                  setFocusedRowIndex(i);
                }
              } else {
                if (productInputRefs.current[i]) productInputRefs.current[i]?.focus();
              }
            }, 50);
            return next;
          });
          setActiveVariantRow(null);
          return;
        }
      }

      // Handle Alt+V shortcut globally
      if (e.altKey && (e.code === 'KeyV' || e.key === 'v' || e.key === 'V')) {
        if (selectedDraft && isEditing && focusedRowIndex !== null && !showConfirmModal) {
          e.preventDefault();
          const i = focusedRowIndex;
          const matched = products.find(p => p.id === editableItems[i]?.matched_product_id);
          if (matched && matched.variants && matched.variants.length > 0) {
            setActiveVariantRow(prev => {
              const next = prev === i ? null : i;
              setTimeout(() => {
                if (next === i) {
                  const firstSelect = document.getElementById(`variant-select-${i}-0`);
                  if (firstSelect) {
                    firstSelect.focus();
                    setFocusedRowIndex(i);
                  }
                } else {
                  if (productInputRefs.current[i]) productInputRefs.current[i]?.focus();
                }
              }, 50);
              return next;
            });
            setActiveEquivalenceRow(null);
          }
          return;
        }
      }

      if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (actionConfirm) { setActionConfirm(null); return; }
        if (deleteConfirm) { setDeleteConfirm(null); return; }
        if (obsModal) { setObsModal(null); return; }
        if (rejectModal) { setRejectModal(null); return; }
        if (showConfirmModal) { setShowConfirmModal(false); return; }
        if (selectedDraft) { setSelectedDraft(null); return; }
      }
      
      if (e.key === '?' && e.shiftKey) {
        setShowShortcuts(prev => !prev);
        e.preventDefault();
      }
      
      if (e.key.toLowerCase() === 'f' && (e.ctrlKey || e.metaKey)) {
        if (!selectedDraft) {
          document.getElementById('search-input')?.focus();
          e.preventDefault();
        }
      }

      if (e.key.toLowerCase() === 'e' && (e.ctrlKey || e.metaKey)) {
        if (selectedDraft && !showConfirmModal) {
          document.getElementById('btn-edit-draft')?.click();
          e.preventDefault();
        }
      }

      if (e.key === 'Backspace' && (e.ctrlKey || e.metaKey)) {
        if (selectedDraft && !showConfirmModal) {
          document.getElementById('btn-reject-draft')?.click();
          e.preventDefault();
        }
      }
      
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        if (selectedDraft && !showConfirmModal) {
          document.getElementById('btn-approve-draft')?.click();
          e.preventDefault();
        }
      }
      
      if (e.key === 'Delete') {
        // 1. If any delete-related confirmation modal is open, confirm the action
        if (actionConfirm && actionConfirm.isOpen && actionConfirm.isDanger) {
          e.preventDefault();
          actionConfirm.onConfirm();
          setActionConfirm(null);
          return;
        }
        if (deleteConfirm && deleteConfirm.isOpen) {
          e.preventDefault();
          if (deleteConfirm.step === 1) {
            setDeleteConfirm(prev => prev ? { ...prev, step: 2 } : null);
          } else {
            const runConfirm = async () => {
              await deleteConfirm.onConfirmNotify();
              setDeleteConfirm(null);
            };
            runConfirm();
          }
          return;
        }
        if (rejectModal && rejectModal.isOpen) {
          e.preventDefault();
          const confirmBtn = document.getElementById('btn-confirm-reject') as HTMLButtonElement | null;
          if (confirmBtn && !confirmBtn.disabled) {
            confirmBtn.click();
          }
          return;
        }
        
        // 2. If the main draft details modal is open, trigger the rejection flow
        if (selectedDraft && !showConfirmModal) {
          e.preventDefault();
          document.getElementById('btn-reject-draft')?.click();
          return;
        }

        // 3. If selected drafts are present in the list, trigger the bulk delete
        if (selectedDraftIds.length > 0 && !actionConfirm) {
           e.preventDefault();
           document.getElementById('btn-bulk-reject-delete')?.click();
           return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isInvoiceModified = () => {
    if (!selectedDraft) return false;
    const originalItems = (selectedDraft.extracted_items || []).filter((item: any) => !item.isMetadata);
    if (editableItems.length !== originalItems.length) return true;
    for (let i = 0; i < editableItems.length; i++) {
      const editItem = editableItems[i];
      const origItem = originalItems[i];
      if (!origItem) return true;
      if (editItem.originalName !== origItem.originalName) return true;
      const editQty = parseFloat(editItem.quantity?.toString() || '0');
      const origQty = parseFloat(origItem.quantity?.toString() || '0');
      if (editQty !== origQty) return true;
      if (editItem.matched_product_id !== editItem.originalMatchedProductId) return true;
    }
    return false;
  };

  const handleSendManualReceipt = async () => {
    if (!selectedDraft) return;

    // --- 1. Validaciones ---
    const isAddressMissingVal = !editableAddress || 
      editableAddress.trim() === '' || 
      editableAddress.toLowerCase().includes('no detectad') || 
      editableAddress.toLowerCase() === 'null';

    if (isAddressMissingVal) {
      showToast('Por favor, ingresa una dirección de entrega válida antes de continuar.', 'error');
      return;
    }

    const hasUnmatchedProducts = editableItems.some(item => !item.isMetadata && !item.matched_product_id);
    if (hasUnmatchedProducts) {
      showToast('Error: Existen productos sin emparejar. Por favor, asocia todos los productos a nuestro catálogo o elimínalos.', 'error');
      return;
    }

    const metadataForValidations = getDraftMetadata(selectedDraft);
    const currentDeliverySlot = editableDeliverySlot || metadataForValidations?.deliverySlot;
    if (!deliveryDate || !currentDeliverySlot) {
      showToast('Error: Debes seleccionar una fecha y franja de entrega válida.', 'error');
      return;
    }

    if (!selectedDraft.profile_id) {
      if (!editableClientName || !editableClientPhone || !editableClientNit) {
        showToast('Error: Para registrar un cliente nuevo, debes proporcionar un Nombre, Teléfono y NIT válidos.', 'error');
        return;
      }
    }

    setActionConfirm({
      isOpen: true,
      title: 'Aprobar Pedido y Enviar Acuse',
      message: `¿Deseas procesar este pedido, registrarlo en la base de datos y enviar el acuse de recibo al correo ${selectedDraft.source_email || 'del cliente'}?`,
      confirmText: 'Procesar y Enviar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        setSendingReceipt(true);
        try {
          const shortCode = selectedDraft.id.slice(0, 6).toUpperCase();
          const clientName = !selectedDraft.profile_id ? editableClientName : (selectedDraft.client_detected_name || 'Cliente');
          
          let finalProfileId = selectedDraft.profile_id;
          let finalAdminNotes = `[PEDIDO CORREO] Asunto: ${selectedDraft.email_subject || ''}\n---\n${selectedDraft.email_body || ''}\n---\n`;

          // A. Crear perfil de cliente si no existe
          if (!finalProfileId) {
            finalProfileId = crypto.randomUUID();
            const { error: profileError } = await supabase
              .from('profiles')
              .insert({
                id: finalProfileId,
                role: editableClientType,
                contact_name: editableClientName,
                contact_phone: editableClientPhone,
                phone: editableClientPhone,
                address: editableAddress || '',
                city: 'Bogotá',
                company_name: editableClientName,
                created_at: new Date().toISOString(),
                email: selectedDraft.source_email || null,
                nit: editableClientNit,
                is_active: true,
                latitude: draftCoordinates?.lat || null,
                longitude: draftCoordinates?.lng || null
              });

            if (profileError) {
              throw new Error('Error al crear perfil de cliente: ' + profileError.message);
            }
          } else {
            // Actualizar dirección y coordenadas en perfil existente
            const { error: profileUpdateError } = await supabase
              .from('profiles')
              .update({
                address: editableAddress || metadataForValidations?.address || '',
                latitude: draftCoordinates?.lat || metadataForValidations?.latitude || null,
                longitude: draftCoordinates?.lng || metadataForValidations?.longitude || null
              })
              .eq('id', finalProfileId);

            if (profileUpdateError) {
              console.error('Error updating profile coordinates:', profileUpdateError);
            }
          }

          // B. Calcular montos e ítems
          let totalAmount = 0;
          let totalWeight = 0;
          const itemsData: any[] = [];

          editableItems.forEach(item => {
            if (item.matched_product_id) {
              const prod = products.find(p => p.id === item.matched_product_id);
              if (prod) {
                const qtyNum = parseFloat(item.quantity?.toString().replace(',', '.') || '0');
                totalAmount += prod.base_price * qtyNum;
                const w = prod.weight_kg || (prod.unit_of_measure?.toLowerCase() === 'kg' ? 1 : 0);
                totalWeight += qtyNum * w;

                itemsData.push({
                  product_id: prod.id,
                  quantity: qtyNum,
                  unit_price: prod.base_price,
                  nickname: item.observations ? `${item.originalName || prod.name} (${item.observations})` : (item.originalName || null),
                  variant_label: item.observations || null,
                  unit: item.unit || prod.unit_of_measure || 'Kg',
                  selected_options: item.selected_options || {}
                });
              }
            }
          });

          // C. Registrar pedido en base de datos
          const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
              profile_id: finalProfileId,
              total: totalAmount,
              total_weight_kg: totalWeight,
              status: 'pending_approval',
              payment_status: 'Pendiente',
              payment_method: paymentMethod,
              origin: 'Email Ingest',
              origin_source: 'email',
              delivery_date: deliveryDate,
              delivery_slot: editableDeliverySlot || metadataForValidations?.deliverySlot || 'AM',
              admin_notes: finalAdminNotes,
              shipping_address: editableAddress || metadataForValidations?.address || 'Dirección por definir',
              latitude: draftCoordinates?.lat || metadataForValidations?.latitude || null,
              longitude: draftCoordinates?.lng || metadataForValidations?.longitude || null
            })
            .select()
            .single();

          if (orderError) {
            throw new Error('Error al registrar pedido: ' + orderError.message);
          }

          // D. Registrar ítems en base de datos
          const finalItemsData = itemsData.map(itm => ({
            order_id: order.id,
            ...itm
          }));

          const { error: itemsError } = await supabase
            .from('order_items')
            .insert(finalItemsData);

          if (itemsError) {
            throw new Error('Error al registrar ítems: ' + itemsError.message);
          }

          // E. Guardar nuevos aliases/mapeos
          const newAliases: Record<string, string> = {};
          editableItems.forEach(item => {
            const originalText = item.originalName?.toLowerCase()?.trim();
            if (originalText && item.matched_product_id) {
              if (aliases[originalText] !== item.matched_product_id) {
                newAliases[originalText] = item.matched_product_id;
              }
            }
          });
          if (Object.keys(newAliases).length > 0) {
            await fetch('/api/orders/aliases', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ newAliases })
            });
          }

          // F. Actualizar borrador a aprobado
          const metaItem = selectedDraft.extracted_items?.find((i: any) => i.isMetadata) || { isMetadata: true };
          const updatedMetaItem = {
            ...metaItem,
            address: editableAddress,
            deliverySlot: editableDeliverySlot || null,
            deliveryDate: deliveryDate,
            priceList: priceList,
            orderDocument: orderDocument,
            purchaseOrder: purchaseOrder,
            latitude: draftCoordinates?.lat || metaItem.latitude || null,
            longitude: draftCoordinates?.lng || metaItem.longitude || null,
            receiptEmailSent: true
          };
          const updatedExtractedItems = [
            updatedMetaItem,
            ...editableItems
          ];

          await supabase
            .from('order_drafts')
            .update({ 
              status: 'approved',
              extracted_items: updatedExtractedItems
            })
            .eq('id', selectedDraft.id);

          // G. Enviar correo HTML de acuse de recibo con resumen de pedido
          const itemsHtml = editableItems.map((item: any) => {
            const prod = products.find(p => p.id === item.matched_product_id);
            const qtyNum = parseFloat(item.quantity?.toString().replace(',', '.') || '0');
            const unitPrice = prod?.base_price || 0;
            const lineTotal = unitPrice * qtyNum;
            const lineTotalDisplay = lineTotal > 0 ? formatMoney(lineTotal) : 'Por confirmar';
            const productNameDisplay = `${prod?.name || item.originalName || 'Producto'}${item.unit ? ` (${item.unit})` : ''}`;
            return `
              <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 12px 0; color: #111827; font-family: sans-serif; font-size: 14px;">${productNameDisplay}</td>
                  <td style="padding: 12px 0; text-align: center; color: #4B5563; font-family: sans-serif; font-size: 14px; font-weight: bold;">${qtyNum}</td>
                  <td style="padding: 12px 0; text-align: right; color: #111827; font-family: sans-serif; font-size: 14px; font-weight: bold;">${lineTotalDisplay}</td>
              </tr>
            `;
          }).join('');

          const totalOrderDisplay = totalAmount > 0 ? `Total Aprox: ${formatMoney(totalAmount)}` : 'Total: A confirmar en despacho';

          const emailHtml = `
            <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
            <div style="font-family: 'Playfair Display', Georgia, serif; color: #286a36; padding: 40px; background-color: #ffffff; max-width: 600px; margin: auto;">
                <center>
                    <img src="https://frufresco-liard.vercel.app/logo-investments.png" width="150" style="margin-bottom: 20px;" alt="Investments Cortés Logo">
                    <h1 style="color: #286a36; font-size: 28px; margin-bottom: 10px;">¡Gracias por tu compra, ${clientName}!</h1>
                    <p style="font-size: 16px; color: #555; margin-top: 0;">Hemos recibido tu pedido con éxito y ya está en preparación.</p>
                </center>
                
                <div style="background: white; padding: 30px; border-radius: 15px; margin-top: 30px; border-left: 5px solid #1f9040; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
                    <h3 style="color: #286a36; margin-top: 0; font-size: 18px; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px;">Resumen del Pedido #${shortCode}</h3>
                    <p style="font-size: 13px; color: #666; margin-bottom: 20px;"><b>Fecha:</b> ${new Date().toLocaleDateString('es-CO')}</p>
                    
                    <table style="width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 14px;">
                        <thead>
                            <tr style="border-bottom: 2px solid #286a36; color: #286a36; text-align: left;">
                                <th style="padding: 10px 5px; font-weight: bold;">Producto</th>
                                <th style="padding: 10px 5px; font-weight: bold; text-align: center;">Cant.</th>
                                <th style="padding: 10px 5px; font-weight: bold; text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>
                    
                    <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #286a36; text-align: right;">
                        <p style="font-size: 16px; color: #286a36; margin: 0; font-weight: 800;">
                            <span>${totalOrderDisplay}</span>
                        </p>
                    </div>
                </div>

                <p style="margin-top: 30px; text-align: center; color: #666; font-size: 14px;">
                    Te enviaremos otra notificación cuando tu pedido esté en camino.<br>
                    Si tienes alguna duda o deseas realizar cambios, puedes responder a este correo.
                </p>
                
                <hr style="border: 0; border-top: 1px solid #1f9040; margin: 40px 0;">
                
                <center>
                    <p style="font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px;">Investments Cortés SAS • Del Campo a tu Negocio</p>
                </center>
            </div>
          `;

          const { data: insertedMail, error: mailError } = await supabase.from('mail').insert({
            to_email: selectedDraft.source_email,
            subject: `¡Hemos recibido tu pedido! (#${shortCode})`,
            message: { html: emailHtml, text: `Hemos recibido tu pedido con éxito y ya está en preparación.` },
            status: 'pending'
          }).select().single();

          if (!mailError && insertedMail) {
            fetch('/api/mail/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ record: insertedMail })
            }).catch(e => console.error('Failed to trigger mail processor', e));
          }

          showToast('Pedido registrado y acuse de recibo enviado con éxito 📧✅', 'success');
          setSelectedDraft(null);
          fetchDrafts();
        } catch (err: any) {
          console.error('Error unifying order processing and receipt:', err);
          showToast('Error al procesar: ' + err.message, 'error');
        } finally {
          setSendingReceipt(false);
        }
      }
    });
  };
 
  const handleApprove = async () => {
    if (!selectedDraft) return;
    
    // 1. Validación de Dirección
    const isAddressMissingVal = !editableAddress || 
      editableAddress.trim() === '' || 
      editableAddress.toLowerCase().includes('no detectad') || 
      editableAddress.toLowerCase() === 'null';

    if (isAddressMissingVal) {
      showToast('Por favor, ingresa una dirección de entrega válida antes de continuar.', 'error');
      return;
    }

    // 2. Validación de Productos Emparejados
    const hasUnmatchedProducts = editableItems.some(item => !item.isMetadata && !item.matched_product_id);
    if (hasUnmatchedProducts) {
      showToast('Error: Existen productos sin emparejar. Por favor, asocia todos los productos a nuestro catálogo o elimínalos.', 'error');
      return;
    }

    // 3. Validación de Fecha y Franja de Entrega
    const metadataForValidations = getDraftMetadata(selectedDraft);
    const currentDeliverySlot = editableDeliverySlot || metadataForValidations?.deliverySlot;
    if (!deliveryDate || !currentDeliverySlot) {
      showToast('Error: Debes seleccionar una fecha y franja de entrega válida.', 'error');
      return;
    }

    // 4. Validación de Cliente Nuevo (NIT y Teléfono)
    if (!selectedDraft.profile_id) {
      const phoneVal = metadataForValidations?.phone;
      const nitVal = metadataForValidations?.nit;
      if (!phoneVal || !nitVal) {
        showToast('Error: Para registrar un cliente nuevo, debes proporcionar un Teléfono y un NIT válidos.', 'error');
        return;
      }
    }


    setSaving(true);
    
    // 1. Prepare new aliases to save
    const newAliases: Record<string, string> = {};
    editableItems.forEach(item => {
      const originalText = item.originalName?.toLowerCase()?.trim();
      if (originalText && item.matched_product_id) {
        // Solo guardamos si no estaba en la memoria o si cambió
        if (aliases[originalText] !== item.matched_product_id) {
          newAliases[originalText] = item.matched_product_id;
        }
      }
    });

    try {
      // 2. Save aliases via our new API
      if (Object.keys(newAliases).length > 0) {
        await fetch('/api/orders/aliases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newAliases })
        });
      }

      // 3. Update the draft's extracted_items to include our manual edits
      const metaItem = selectedDraft.extracted_items?.find((i: any) => i.isMetadata) || { isMetadata: true };
      const updatedMetaItem = {
        ...metaItem,
        address: editableAddress,
        deliverySlot: editableDeliverySlot || null,
        deliveryDate: deliveryDate,
        priceList: priceList,
        orderDocument: orderDocument,
        purchaseOrder: purchaseOrder,
        latitude: draftCoordinates?.lat || metaItem.latitude || null,
        longitude: draftCoordinates?.lng || metaItem.longitude || null
      };
      const updatedExtractedItems = [
        updatedMetaItem,
        ...editableItems
      ];

      await supabase
        .from('order_drafts')
        .update({ extracted_items: updatedExtractedItems })
        .eq('id', selectedDraft.id);

      setSelectedDraft((prev: any) => ({
        ...prev,
        extracted_items: updatedExtractedItems
      }));
      setDrafts(prev => prev.map(d => d.id === selectedDraft.id ? { ...d, extracted_items: updatedExtractedItems } : d));

      // 4. Open floating modal confirmation (invoice) instead of redirecting
      setSaving(false);
      setSendConfirmationEmail(true);
      setIsAuthorizedForChanges(false);
      setShowConfirmModal(true);
    } catch (e) {
      console.error('Error in handleApprove:', e);
      showToast('Error al procesar el pedido. Por favor intenta de nuevo.', 'error');
      setSaving(false);
    }
  };

  const handleConfirmOrderDirectly = async () => {
    if (!selectedDraft) return;
    setConfirmingOrder(true);

    try {
      const metadata = getDraftMetadata(selectedDraft);
      let finalProfileId = selectedDraft.profile_id;
      let finalAdminNotes = `[PEDIDO CORREO] Asunto: ${selectedDraft.email_subject || ''}\n---\n${selectedDraft.email_body || ''}\n---\n`;

      // 1. If no profile exists (new client), create one
      if (!finalProfileId) {
        finalProfileId = crypto.randomUUID();
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: finalProfileId,
            role: metadata?.clientType || 'b2c_client',
            contact_name: selectedDraft.client_detected_name || 'Cliente por Correo',
            contact_phone: metadata?.phone || '',
            phone: metadata?.phone || '',
            address: editableAddress || metadata?.address || '',
            city: 'Bogotá',
            company_name: selectedDraft.client_detected_name || 'Cliente por Correo',
            created_at: new Date().toISOString(),
            email: selectedDraft.source_email || null,
            nit: metadata?.nit || null,
            is_active: true,
            latitude: draftCoordinates?.lat || metadata?.latitude || null,
            longitude: draftCoordinates?.lng || metadata?.longitude || null
          });

        if (profileError) {
          throw new Error('Error al crear perfil de cliente: ' + profileError.message);
        }
      } else {
        // Update existing profile's address and coordinates
        const { error: profileUpdateError } = await supabase
          .from('profiles')
          .update({
            address: editableAddress || metadata?.address || '',
            latitude: draftCoordinates?.lat || metadata?.latitude || null,
            longitude: draftCoordinates?.lng || metadata?.longitude || null
          })
          .eq('id', finalProfileId);

        if (profileUpdateError) {
          console.error('Error updating profile with new address and coordinates:', profileUpdateError);
        }
      }

      // Calculate totals
      let totalAmount = 0;
      let totalWeight = 0;
      const itemsData: any[] = [];

      editableItems.forEach(item => {
        if (item.matched_product_id) {
          const prod = products.find(p => p.id === item.matched_product_id);
          if (prod) {
            const qtyNum = parseFloat(item.quantity?.toString().replace(',', '.') || '0');
            totalAmount += prod.base_price * qtyNum;
            const w = prod.weight_kg || (prod.unit_of_measure?.toLowerCase() === 'kg' ? 1 : 0);
            totalWeight += qtyNum * w;

            itemsData.push({
              product_id: prod.id,
              quantity: qtyNum,
              unit_price: prod.base_price,
              nickname: item.observations ? `${item.originalName || prod.name} (${item.observations})` : (item.originalName || null),
              variant_label: item.observations || null,
              unit: item.unit || prod.unit_of_measure || 'Kg',
              selected_options: item.selected_options || {}
            });
          }
        }
      });

      // 2. Create the order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          profile_id: finalProfileId,
          total: totalAmount,
          total_weight_kg: totalWeight,
          status: 'pending_approval',
          payment_status: 'Pendiente',
          payment_method: paymentMethod,
          origin: 'Email Ingest',
          origin_source: 'email',
          delivery_date: deliveryDate,
          delivery_slot: editableDeliverySlot || metadata?.deliverySlot || 'AM',
          admin_notes: finalAdminNotes,
          shipping_address: editableAddress || metadata?.address || 'Dirección por definir',
          latitude: draftCoordinates?.lat || metadata?.latitude || null,
          longitude: draftCoordinates?.lng || metadata?.longitude || null
        })
        .select()
        .single();

      if (orderError) {
        throw new Error('Error al registrar pedido: ' + orderError.message);
      }

      // 3. Create order items
      const finalItemsData = itemsData.map(itm => ({
        order_id: order.id,
        ...itm
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(finalItemsData);

      if (itemsError) {
        throw new Error('Error al registrar ítems: ' + itemsError.message);
      }

      // 4. Update the draft status to approved
      await supabase
        .from('order_drafts')
        .update({ status: 'approved' })
        .eq('id', selectedDraft.id);

      // 5. Send confirmation email (queue in mail table)
      if (selectedDraft.source_email && sendConfirmationEmail) {
        const formattedItems = editableItems.map(item => {
          const prod = products.find(p => p.id === item.matched_product_id);
          const qtyNum = parseFloat(item.quantity?.toString().replace(',', '.') || '0');
          const unitPrice = prod?.base_price || 0;
          return {
            name: prod?.name || item.originalName || 'Producto',
            quantity: qtyNum,
            price: formatNumber(unitPrice),
            total: formatNumber(unitPrice * qtyNum)
          };
        });

        await supabase.from('mail').insert({
          to_email: selectedDraft.source_email,
          subject: `¡Confirmación de Pedido FruFresco N° ${order.id.slice(0, 6).toUpperCase()}!`,
          template: {
            name: 'order_confirmation',
            data: {
              client: selectedDraft.client_detected_name || 'Cliente',
              order_number: order.id.slice(0, 6).toUpperCase(),
              total_amount: formatNumber(totalAmount),
              items: formattedItems
            }
          }
        });
      }

      showToast('Pedido registrado exitosamente ✅', 'success');
      setShowConfirmModal(false);
      setSelectedDraft(null);
      fetchDrafts();
    } catch (e: any) {
      console.error('Error creating order directly:', e);
      showToast('Error: ' + e.message, 'error');
    } finally {
      setConfirmingOrder(false);
    }
  };

  const filteredDrafts = drafts.filter(draft => {
    // 1. Search Query
    const matchesSearch = searchQuery === '' || 
      draft.client_detected_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      draft.source_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      draft.email_subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      draft.email_body?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getDraftMetadata(draft).address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      draft.id.toLowerCase().includes(searchQuery.toLowerCase());

    // 2. Date Filter
    let matchesDate = true;
    if (selectedDate) {
      const draftDate = new Date(draft.created_at).toISOString().split('T')[0];
      matchesDate = draftDate === selectedDate;
    }

    // 3. Channel Filter
    let matchesChannel = true;
    if (selectedChannel === 'email') {
      matchesChannel = true; // All are email inbound
    }

    // 4. Status Filter
    let matchesStatus = true;
    if (selectedStatus !== 'all') {
      matchesStatus = draft.status === selectedStatus;
    }

    return matchesSearch && matchesDate && matchesChannel && matchesStatus;
  });

  // Calculate status counts ignoring status filter itself to show counts dynamically in sidebar cards
  const draftsBeforeStatusFilter = drafts.filter(draft => {
    const matchesSearch = searchQuery === '' || 
      draft.client_detected_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      draft.source_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      draft.email_subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      draft.email_body?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getDraftMetadata(draft).address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      draft.id.toLowerCase().includes(searchQuery.toLowerCase());

    let matchesDate = true;
    if (selectedDate) {
      const draftDate = new Date(draft.created_at).toISOString().split('T')[0];
      matchesDate = draftDate === selectedDate;
    }

    let matchesChannel = true;
    if (selectedChannel === 'email') {
      matchesChannel = true;
    }

    return matchesSearch && matchesDate && matchesChannel;
  });

  const countAll = draftsBeforeStatusFilter.length;
  const countPending = draftsBeforeStatusFilter.filter(d => d.status === 'pending').length;
  const countApproved = draftsBeforeStatusFilter.filter(d => d.status === 'approved').length;
  const countRejected = draftsBeforeStatusFilter.filter(d => d.status === 'rejected').length;

  const STATUS_PRIORITY: Record<string, number> = {
    pending: 1,
    rejected: 2,
    approved: 3
  };

  const sortedFilteredDrafts = [...filteredDrafts].sort((a, b) => {
    const priorityA = STATUS_PRIORITY[a.status] || 99;
    const priorityB = STATUS_PRIORITY[b.status] || 99;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const totalValue = editableItems.reduce((acc, item) => {
    const matchedProd = products.find(p => p.id === item.matched_product_id);
    return acc + (matchedProd ? ((matchedProd.base_price || 0) * (item.quantity || 0)) : 0);
  }, 0);

  const hasUnmatchedItems = editableItems.some(item => !item.matched_product_id);

  return (
    <div style={{ padding: '0', maxWidth: '100%', margin: '0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={20} style={{ color: THEME.colors.primary }} /> Pedidos por Procesar (Email Inbound)
          </h1>
        </div>
        <button 
          onClick={() => fetchDrafts()}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'white',
            border: `1px solid ${THEME.colors.border}`,
            borderRadius: THEME.radius.md,
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '0.85rem'
          }}
        >
          Actualizar Bandeja
        </button>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center', minHeight: '42px' }}>
        {selectedDraftIds.length > 0 ? (
          <div style={{
            flex: 1,
            backgroundColor: '#FFFBEB',
            border: '1px solid #FCD34D',
            borderRadius: THEME.radius.md,
            padding: '0.3rem 1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: THEME.shadow.sm
          }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#92400E' }}>
              {selectedDraftIds.length} {selectedDraftIds.length === 1 ? 'borrador seleccionado' : 'borradores seleccionados'}
            </span>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => {
                  setActionConfirm({
                    isOpen: true,
                    title: '¿Rechazar borradores seleccionados?',
                    message: `¿Estás seguro de que deseas rechazar y eliminar los ${selectedDraftIds.length} borradores seleccionados?`,
                    confirmText: 'Rechazar y Eliminar',
                    cancelText: 'Cancelar',
                    isDanger: true,
                    onConfirm: async () => {
                      try {
                        const draftsToProcess = drafts.filter(d => selectedDraftIds.includes(d.id));
                        const alreadyRejectedIds = draftsToProcess.filter(d => d.status === 'rejected').map(d => d.id);
                        const otherIds = draftsToProcess.filter(d => d.status !== 'rejected').map(d => d.id);

                        if (otherIds.length > 0) {
                          const { error: err1 } = await supabase
                            .from('order_drafts')
                            .update({ status: 'rejected' })
                            .in('id', otherIds);
                          if (err1) throw err1;
                        }

                        if (alreadyRejectedIds.length > 0) {
                          const { error: err2 } = await supabase
                            .from('order_drafts')
                            .delete()
                            .in('id', alreadyRejectedIds);
                          if (err2) throw err2;
                        }

                        setDrafts(prev => prev
                          .filter(d => !alreadyRejectedIds.includes(d.id))
                          .map(d => otherIds.includes(d.id) ? { ...d, status: 'rejected' } : d)
                        );
                        setSelectedDraftIds([]);
                        
                        const msg = alreadyRejectedIds.length > 0 
                          ? (otherIds.length > 0 ? 'Borradores procesados (eliminados y rechazados).' : 'Borradores eliminados permanentemente.')
                          : 'Borradores rechazados con éxito.';
                          
                        showToast(msg, 'success');
                      } catch (err: any) {
                        console.error('Error rejecting/deleting multiple drafts:', err);
                        showToast('Error al procesar los borradores seleccionados.', 'error');
                      }
                    }
                  });
                }}
                id="btn-bulk-reject-delete"
                style={{
                  backgroundColor: '#EF4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.4rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Trash2 size={16} /> Rechazar/Eliminar Seleccionados
              </button>
              <button
                onClick={() => setSelectedDraftIds([])}
                style={{
                  backgroundColor: 'white',
                  color: '#4B5563',
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: '8px',
                  padding: '0.4rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Deseleccionar
              </button>
            </div>
          </div>
        ) : (
          <>
        {/* Date Filter */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          backgroundColor: 'white', 
          border: `1px solid ${THEME.colors.border}`, 
          borderRadius: THEME.radius.md,
          padding: '0.4rem 0.8rem',
          gap: '8px'
        }}>
          <Calendar size={16} color="#6B7280" />
          <input 
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              fontWeight: 800,
              fontSize: '0.85rem',
              color: '#111827',
              fontFamily: 'inherit',
              cursor: 'pointer'
            }}
          />
          {selectedDate && (
            <button 
              onClick={() => setSelectedDate('')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#9CA3AF',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Search Input */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          backgroundColor: '#F9FAFB', 
          border: 'none', 
          borderRadius: THEME.radius.md,
          padding: '0.6rem 1rem',
          gap: '8px'
        }}>
          <Search size={16} color="#6B7280" />
          <input 
            id="search-input"
            type="text" 
            placeholder="Buscar por ID, empresa, @estado..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              border: 'none', 
              background: 'transparent', 
              outline: 'none', 
              width: '100%', 
              fontSize: '0.85rem',
              color: '#4B5563',
              fontWeight: 600
            }} 
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#9CA3AF',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Channel Dropdown Removed */}

        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Tab: Pendientes */}
          <button
            type="button"
            onClick={() => setSelectedStatus('pending')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.5rem 1rem',
              backgroundColor: selectedStatus === 'pending' ? '#FFFBEB' : 'white',
              border: selectedStatus === 'pending' ? '2px solid #D97706' : '1px solid #E5E7EB',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.8rem',
              color: selectedStatus === 'pending' ? '#B45309' : '#4B5563',
              cursor: 'pointer',
              boxShadow: selectedStatus === 'pending' ? '0 2px 4px rgba(217, 119, 6, 0.15)' : 'none',
              transition: 'all 0.15s',
              height: '38px',
              boxSizing: 'border-box'
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#D97706' }}></span>
            Pendientes
            <span style={{
              marginLeft: '4px',
              fontSize: '0.75rem',
              backgroundColor: selectedStatus === 'pending' ? '#FBBF24' : '#F3F4F6',
              color: selectedStatus === 'pending' ? '#78350F' : '#6B7280',
              padding: '2px 6px',
              borderRadius: '9999px',
              fontWeight: 800
            }}>{countPending}</span>
          </button>

          {/* Tab: Gestionados */}
          <button
            type="button"
            onClick={() => setSelectedStatus('approved')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.5rem 1rem',
              backgroundColor: selectedStatus === 'approved' ? '#ECFDF5' : 'white',
              border: selectedStatus === 'approved' ? '2px solid #059669' : '1px solid #E5E7EB',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.8rem',
              color: selectedStatus === 'approved' ? '#047857' : '#4B5563',
              cursor: 'pointer',
              boxShadow: selectedStatus === 'approved' ? '0 2px 4px rgba(5, 150, 105, 0.15)' : 'none',
              transition: 'all 0.15s',
              height: '38px',
              boxSizing: 'border-box'
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#059669' }}></span>
            Gestionados
            <span style={{
              marginLeft: '4px',
              fontSize: '0.75rem',
              backgroundColor: selectedStatus === 'approved' ? '#A7F3D0' : '#F3F4F6',
              color: selectedStatus === 'approved' ? '#064E3B' : '#6B7280',
              padding: '2px 6px',
              borderRadius: '9999px',
              fontWeight: 800
            }}>{countApproved}</span>
          </button>

          {/* Tab: Rechazados */}
          <button
            type="button"
            onClick={() => setSelectedStatus('rejected')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.5rem 1rem',
              backgroundColor: selectedStatus === 'rejected' ? '#FEF2F2' : 'white',
              border: selectedStatus === 'rejected' ? '2px solid #DC2626' : '1px solid #E5E7EB',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.8rem',
              color: selectedStatus === 'rejected' ? '#B91C1C' : '#4B5563',
              cursor: 'pointer',
              boxShadow: selectedStatus === 'rejected' ? '0 2px 4px rgba(220, 38, 38, 0.15)' : 'none',
              transition: 'all 0.15s',
              height: '38px',
              boxSizing: 'border-box'
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#EF4444' }}></span>
            Rechazados
            <span style={{
              marginLeft: '4px',
              fontSize: '0.75rem',
              backgroundColor: selectedStatus === 'rejected' ? '#FCA5A5' : '#F3F4F6',
              color: selectedStatus === 'rejected' ? '#7F1D1D' : '#6B7280',
              padding: '2px 6px',
              borderRadius: '9999px',
              fontWeight: 800
            }}>{countRejected}</span>
          </button>

          {/* Tab: Todos */}
          <button
            type="button"
            onClick={() => setSelectedStatus('all')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.5rem 1rem',
              backgroundColor: selectedStatus === 'all' ? '#F3F4F6' : 'white',
              border: selectedStatus === 'all' ? '2px solid #4B5563' : '1px solid #E5E7EB',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.8rem',
              color: selectedStatus === 'all' ? '#1F2937' : '#4B5563',
              cursor: 'pointer',
              boxShadow: selectedStatus === 'all' ? '0 2px 4px rgba(75, 85, 99, 0.15)' : 'none',
              transition: 'all 0.15s',
              height: '38px',
              boxSizing: 'border-box'
            }}
          >
            Todos
            <span style={{
              marginLeft: '4px',
              fontSize: '0.75rem',
              backgroundColor: selectedStatus === 'all' ? '#D1D5DB' : '#F3F4F6',
              color: selectedStatus === 'all' ? '#1F2937' : '#6B7280',
              padding: '2px 6px',
              borderRadius: '9999px',
              fontWeight: 800
            }}>{countAll}</span>
          </button>
        </div>
        </>
        )}

        {/* Shortcuts Icon */}
        <div 
          onClick={() => setShowShortcuts(true)}
          title="Manual de Atajos de Teclado (Shift + ?)"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            backgroundColor: '#F3E8FF', 
            borderRadius: THEME.radius.md,
            width: '38px',
            height: '38px',
            cursor: 'pointer',
            transition: 'background-color 0.15s'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#E9D5FF'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F3E8FF'}
        >
          <Keyboard size={20} color="#9333EA" strokeWidth={2.5} />
        </div>

        {/* Info Icon */}
        <div 
          onClick={() => showToast('Este módulo muestra los correos electrónicos entrantes (inbound) procesados automáticamente por la IA. Aquí puedes revisar los borradores de pedidos, mapear productos con el inventario, validar la cobertura geográfica del cliente en Bogotá y aprobarlos para crear órdenes.', 'info')}
          title="Ayuda del módulo"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            backgroundColor: '#EFF6FF', 
            borderRadius: THEME.radius.md,
            width: '38px',
            height: '38px',
            cursor: 'pointer',
            transition: 'background-color 0.15s'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#DBEAFE'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#EFF6FF'}
        >
          <Info size={20} color="#3B82F6" strokeWidth={3} />
        </div>

        {/* View Toggle */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          backgroundColor: '#F3F4F6', 
          borderRadius: THEME.radius.md,
          padding: '4px',
          gap: '4px'
        }}>
          <div 
            onClick={() => setViewMode('list')}
            style={{ 
              backgroundColor: viewMode === 'list' ? 'white' : 'transparent', 
              borderRadius: '6px', 
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              cursor: 'pointer',
              opacity: viewMode === 'list' ? 1 : 0.5
            }}
          >
            <List size={16} color={viewMode === 'list' ? "#111827" : "#6B7280"} />
          </div>
          <div 
            onClick={() => setViewMode('grid')}
            style={{ 
              backgroundColor: viewMode === 'grid' ? 'white' : 'transparent', 
              borderRadius: '6px', 
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              cursor: 'pointer',
              opacity: viewMode === 'grid' ? 1 : 0.5
            }}
          >
            <Grid size={16} color={viewMode === 'grid' ? "#111827" : "#6B7280"} />
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: THEME.colors.textSecondary }}>Cargando correos...</div>
      ) : sortedFilteredDrafts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}` }}>
          <Mail size={32} style={{ opacity: 0.3, marginBottom: '1rem', color: '#9CA3AF' }} />
          <h3 style={{ fontSize: '1.1rem', color: '#4B5563', margin: '0 0 4px 0' }}>Bandeja Vacía</h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#9CA3AF' }}>No se encontraron correos con los filtros actuales.</p>
        </div>
      ) : viewMode === 'list' ? (
        <>

          <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, overflow: 'hidden', boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ padding: '1rem', width: '40px', textAlign: 'center', ...THEME.typography?.tableHeader }}>
                    <input
                      type="checkbox"
                      checked={sortedFilteredDrafts.length > 0 && selectedDraftIds.length === sortedFilteredDrafts.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDraftIds(sortedFilteredDrafts.map(d => d.id));
                        } else {
                          setSelectedDraftIds([]);
                        }
                      }}
                      style={{ cursor: 'pointer', transform: 'scale(1.1)' }}
                    />
                  </th>
                  <th style={{ padding: '1rem', width: '12%', textAlign: 'left', ...THEME.typography?.tableHeader }}>FECHA / TIPO</th>
                  <th style={{ padding: '1rem', width: '22%', textAlign: 'left', ...THEME.typography?.tableHeader }}>CLIENTE</th>
                  <th style={{ padding: '1rem', width: '24%', textAlign: 'left', ...THEME.typography?.tableHeader }}>DIRECCIÓN / GPS</th>
                  <th style={{ padding: '1rem', width: '15%', textAlign: 'left', ...THEME.typography?.tableHeader }}>ASUNTO / ORIGEN</th>
                  <th style={{ padding: '1rem', width: '10%', textAlign: 'center', ...THEME.typography?.tableHeader }}>ITEMS / PESO</th>
                  <th style={{ padding: '1rem', width: '10%', textAlign: 'right', ...THEME.typography?.tableHeader }}>VALOR</th>
                  <th style={{ padding: '1rem', width: '10%', textAlign: 'center', ...THEME.typography?.tableHeader }}>ESTADO</th>
                  <th style={{ padding: '1rem', width: '10%', textAlign: 'center', ...THEME.typography?.tableHeader }}>ACCIONES</th>
                </tr>
              </thead>
            <tbody>
              {sortedFilteredDrafts.map((draft) => {
                const meta = getDraftMetadata(draft);
                const items = getDraftItems(draft);
                const itemsCount = items.length;
                const estimatedTotal = items.reduce((acc: number, item: any) => {
                  let matchedProd = products.find(p => p.id === item.matched_product_id);
                  if (!matchedProd && !item.matched_product_id && item.originalName) {
                    matchedProd = findMatchedProduct(item.originalName);
                    console.log(`[TABLE] Draft ${draft.id} - ${item.originalName} matched dynamically to: ${matchedProd ? matchedProd.name : 'NULL'} (Price: ${matchedProd ? matchedProd.base_price : 0})`);
                  } else if (matchedProd) {
                    console.log(`[TABLE] Draft ${draft.id} - ${item.originalName} matched from DB to: ${matchedProd.name} (Price: ${matchedProd.base_price})`);
                  } else {
                    console.log(`[TABLE] Draft ${draft.id} - ${item.originalName} has NO MATCH (matched_product_id: ${item.matched_product_id})`);
                  }
                  return acc + (matchedProd ? ((matchedProd.base_price || 0) * (item.quantity || 0)) : 0);
                }, 0);

                const estimatedWeight = items.reduce((acc: number, item: any) => {
                  let matchedProd = products.find(p => p.id === item.matched_product_id);
                  if (!matchedProd && !item.matched_product_id && item.originalName) {
                    matchedProd = findMatchedProduct(item.originalName);
                  }
                  const unit = (matchedProd?.unit_of_measure || '').toLowerCase();
                  const weightFactor = (unit === 'kg' || unit === 'kilo' || unit === 'kilos') ? 1 : (matchedProd?.weight_kg || 0);
                  return acc + (weightFactor * (item.quantity || 0));
                }, 0);

                return (
                <tr 
                  key={draft.id} 
                  onClick={() => setSelectedDraft(draft)}
                  style={{ 
                    borderBottom: '1px solid #F1F5F9', 
                    cursor: 'pointer', 
                    transition: 'all 0.1s',
                    backgroundColor: 'transparent'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '0.8rem 1rem', textAlign: 'center', width: '40px', borderLeft: draft.status === 'pending' ? '4px solid #D97706' : draft.status === 'rejected' ? '4px solid #EF4444' : '4px solid #059669' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedDraftIds.includes(draft.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDraftIds(prev => [...prev, draft.id]);
                        } else {
                          setSelectedDraftIds(prev => prev.filter(id => id !== draft.id));
                        }
                      }}
                      style={{ cursor: 'pointer', transform: 'scale(1.1)' }}
                    />
                  </td>
                  <td style={{ padding: '0.8rem 1rem' }}>
                    <div style={{ fontWeight: '900', fontSize: '0.85rem', color: '#111827' }}>
                      {new Date(draft.created_at).toLocaleDateString()}
                    </div>
                    <div style={{ fontSize: '0.65rem', fontWeight: '800', color: meta.clientType === 'b2b_client' ? '#6366F1' : '#EC4899' }}>
                      {meta.clientType === 'b2b_client' ? 'EMAIL B2B' : 'EMAIL B2C'}
                    </div>
                  </td>
                  <td style={{ padding: '0.8rem 1rem' }}>
                    <div style={{ fontWeight: '800', fontSize: '0.9rem', color: '#111827' }}>
                      {draft.client_detected_name || 'Desconocido'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <Mail size={10} strokeWidth={1.5} /> {draft.source_email}
                      {meta.phone && meta.phone !== 'No detectado' && (
                        <>
                          <span style={{ margin: '0 4px', color: '#94A3B8' }}>|</span>
                          <Phone size={10} strokeWidth={1.5} /> {meta.phone}
                        </>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '0.8rem 1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#374151', fontWeight: '600' }}>
                      {meta.address !== 'No detectado' ? (meta.address.slice(0, 35) + '...') : '-'}
                    </div>
                    {meta.address !== 'No detectado' ? (
                      <span style={{ fontSize: '0.6rem', color: '#059669', fontWeight: '900' }}>📍 GPS OK</span>
                    ) : (
                      <span style={{ fontSize: '0.6rem', color: '#9CA3AF', fontWeight: '700' }}>⚠ SIN GPS</span>
                    )}
                  </td>
                  <td style={{ padding: '0.8rem 1rem', textAlign: 'left' }}>
                    <div style={{ fontSize: '0.8rem', color: '#4B5563', fontWeight: '500', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {draft.email_subject || '-'}
                    </div>
                    <div style={{ marginTop: '2px' }}>
                      {getChannelBadge('email')}
                    </div>
                  </td>
                  <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                    <div style={{ fontWeight: '800', color: '#4B5563', fontSize: '0.85rem' }}>
                      {itemsCount} <span style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: 'normal' }}>prods</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: '700', marginTop: '2px' }}>
                      {formatNumber(estimatedWeight, 1)} kg
                    </div>
                  </td>
                  <td style={{ padding: '0.8rem 1rem', textAlign: 'right', fontWeight: '900', color: '#10B981', fontSize: '0.95rem' }}>
                    {formatMoney(estimatedTotal)}
                  </td>
                  <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                    {draft.status === 'approved' ? (
                      <div style={{
                        padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: '900',
                        backgroundColor: '#DEF7EC',
                        color: '#03543F'
                      }}>
                        GESTIONADO
                      </div>
                    ) : draft.status === 'rejected' ? (
                      <div style={{
                        padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: '900',
                        backgroundColor: '#FDE8E8',
                        color: '#9B1C1C'
                      }}>
                        RECHAZADO
                      </div>
                    ) : (
                      <div style={{
                        padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: '900',
                        backgroundColor: '#FEF3C7',
                        color: '#92400E'
                      }}>
                        PENDIENTE
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={(e) => handleDelete(draft.id, e)}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: '#EF4444', 
                        cursor: 'pointer', 
                        padding: '5px', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      title="Rechazar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {sortedFilteredDrafts.map((draft) => {
            const meta = getDraftMetadata(draft);
            const itemsCount = getDraftItems(draft).length;
            return (
              <div 
                key={draft.id} 
                onClick={() => setSelectedDraft(draft)}
                style={{ 
                  backgroundColor: 'white', 
                  borderRadius: THEME.radius.lg, 
                  border: `1px solid ${THEME.colors.border}`, 
                  borderLeft: draft.status === 'pending' ? '4px solid #D97706' : draft.status === 'rejected' ? '4px solid #EF4444' : '4px solid #059669',
                  padding: '1.25rem', 
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  textAlign: 'left'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderTopColor = THEME.colors.primary;
                  e.currentTarget.style.borderRightColor = THEME.colors.primary;
                  e.currentTarget.style.borderBottomColor = THEME.colors.primary;
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderTopColor = THEME.colors.border;
                  e.currentTarget.style.borderRightColor = THEME.colors.border;
                  e.currentTarget.style.borderBottomColor = THEME.colors.border;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ 
                      backgroundColor: meta.clientType === 'b2b_client' ? '#EFF6FF' : '#ECFDF5', 
                      color: meta.clientType === 'b2b_client' ? '#2563EB' : THEME.colors.primary, 
                      padding: '2px 8px', 
                      borderRadius: '12px', 
                      fontSize: '0.7rem', 
                      fontWeight: 800 
                    }}>
                      {meta.clientType === 'b2b_client' ? 'EMAIL B2B' : 'EMAIL B2C'}
                    </span>
                    {draft.status === 'approved' && (
                      <span style={{ backgroundColor: '#DEF7EC', color: '#03543F', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 800 }}>
                        GESTIONADO
                      </span>
                    )}
                    {draft.status === 'rejected' && (
                      <span style={{ backgroundColor: '#FDE8E8', color: '#9B1C1C', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 800 }}>
                        RECHAZADO
                      </span>
                    )}
                    {draft.status === 'pending' && (
                      <span style={{ backgroundColor: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 800 }}>
                        PENDIENTE
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#9CA3AF', fontWeight: 600 }}>
                    {new Date(draft.created_at).toLocaleDateString()}
                  </span>
                </div>
                
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#111827', marginTop: '4px' }}>
                  {draft.client_detected_name || 'Desconocido'}
                </div>
                
                <div style={{ fontSize: '0.8rem', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Mail size={12} /> {draft.source_email}
                </div>
                
                <div style={{ fontSize: '0.8rem', color: '#4B5563', borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '8px', marginTop: '4px' }}>
                  <strong>Dirección:</strong> {meta.address !== 'No detectado' ? meta.address : '-'}
                </div>

                <div style={{ fontSize: '0.8rem', color: '#4B5563' }}>
                  <strong>Asunto:</strong> {draft.email_subject || '-'}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: 600 }}>
                      {itemsCount} productos
                    </span>
                    <span style={{ fontSize: '0.85rem', color: '#10B981', fontWeight: 800, marginTop: '2px' }}>
                      {(() => {
                        const estimatedTotal = getDraftItems(draft).reduce((acc: number, item: any) => {
                          let matchedProd = products.find(p => p.id === item.matched_product_id);
                          if (!matchedProd && !item.matched_product_id && item.originalName) {
                            matchedProd = findMatchedProduct(item.originalName);
                          }
                          return acc + (matchedProd ? ((matchedProd.base_price || 0) * (item.quantity || 0)) : 0);
                        }, 0);
                        return formatMoney(estimatedTotal);
                      })()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setSelectedDraft(draft)}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: THEME.colors.primary, 
                        cursor: 'pointer', 
                        padding: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ECFDF5'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      title="Revisar / Editar"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={(e) => handleDelete(draft.id, e)}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: '#EF4444', 
                        cursor: 'pointer', 
                        padding: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      title="Rechazar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Aprobación */}
      {selectedDraft && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <style>{`
            /* Estilos para Scrollbar Premium */
            .premium-scrollbar::-webkit-scrollbar {
              width: 6px;
              height: 6px;
            }
            .premium-scrollbar::-webkit-scrollbar-track {
              background: transparent;
            }
            .premium-scrollbar::-webkit-scrollbar-thumb {
              background: rgba(16, 185, 129, 0.25);
              border-radius: 10px;
              transition: all 0.3s ease;
            }
            .premium-scrollbar::-webkit-scrollbar-thumb:hover {
              background: rgba(16, 185, 129, 0.6);
            }
            
            /* Animación de entrada suave para filas */
            @keyframes fadeInUp {
              from {
                opacity: 0;
                transform: translateY(8px) scale(0.99);
              }
              to {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }
            
            .scroll-row-animate {
              animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
            }
          `}</style>
          <div style={{
            backgroundColor: 'white',
            borderRadius: THEME.radius.xl,
            width: '100%',
            maxWidth: '1300px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.5rem',
              borderBottom: `1px solid ${THEME.colors.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              position: 'sticky',
              top: 0,
              zIndex: 10,
              backgroundColor: isScrolled ? 'rgba(255, 255, 255, 0.85)' : 'white',
              backdropFilter: isScrolled ? 'blur(12px)' : 'none',
              transition: 'all 0.3s ease',
              boxShadow: isScrolled ? '0 4px 20px -5px rgba(0, 0, 0, 0.08)' : 'none',
              borderTopLeftRadius: THEME.radius.xl,
              borderTopRightRadius: THEME.radius.xl
            }}>
              {/* Barra de progreso de lectura premium */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: `${scrollPercent}%`,
                height: '3px',
                background: 'linear-gradient(to right, #10B981, #34D399)',
                transition: 'width 0.1s ease-out',
                zIndex: 11
              }} />
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#111827', fontWeight: 800 }}>Revisión de Correo</h2>
                <p style={{ margin: '4px 0 0 0', color: '#6B7280', fontSize: '0.85rem' }}>De: {selectedDraft.source_email}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button onClick={() => setSelectedDraft(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div 
              className="premium-scrollbar"
              onScroll={(e) => {
                const target = e.currentTarget;
                const pct = (target.scrollTop / (target.scrollHeight - target.clientHeight)) * 100;
                setScrollPercent(isNaN(pct) ? 0 : pct);
                setIsScrolled(target.scrollTop > 10);
              }}
              style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}
            >
              {selectedDraft.status === 'rejected' && (
                <div style={{
                  padding: '1rem',
                  backgroundColor: '#FEF2F2',
                  borderLeft: '4px solid #EF4444',
                  borderRadius: '8px',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  textAlign: 'left'
                }}>
                  <AlertTriangle size={24} style={{ color: '#EF4444', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 800, color: '#991B1B', fontSize: '0.9rem' }}>
                      🚫 BORRADOR DE PEDIDO RECHAZADO
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#B91C1C', fontWeight: 600, marginTop: '2px' }}>
                      Motivo: <strong>{
                        (() => {
                          const r = getDraftMetadata(selectedDraft).rejectReason;
                          if (r === 'cobertura') return 'Dirección fuera de la zona de cobertura en Bogotá';
                          if (r === 'monto_minimo') return 'El pedido no cumple con el monto mínimo de entrega de $100.000 COP';
                          if (r === 'no_comercializado') return 'Productos no comercializados por FruFresco (ej. materiales de construcción)';
                          if (r === 'datos_incompletos') return 'Datos de contacto o dirección insuficientes en la solicitud';
                          if (r === 'pedido_duplicado') return 'Solicitud ya procesada anteriormente (Pedido duplicado)';
                          if (r === 'bloqueo_cartera') return 'Cliente con bloqueo de cartera o saldo vencido en mora';
                          if (r === 'sin_stock') return 'Agotamiento de inventario en productos principales del pedido';
                          if (r === 'fuera_de_horario') return 'Pedido recibido fuera del horario límite de programación operativa';
                          return r || 'No especificado';
                        })()
                      }</strong>
                    </div>
                  </div>
                </div>
              )}

              {draftCoordinates && !checkIfInCoverage(draftCoordinates.lat, draftCoordinates.lng) && (
                <div style={{
                  backgroundColor: '#FEE2E2',
                  borderLeft: '4px solid #EF4444',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  textAlign: 'left'
                }}>
                  <AlertTriangle size={24} style={{ color: '#EF4444', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 800, color: '#991B1B', fontSize: '0.9rem' }}>
                      ⚠️ DIRECCIÓN FUERA DE COBERTURA
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#B91C1C', fontWeight: 600, marginTop: '2px' }}>
                      La dirección ingresada ({editableAddress}) se encuentra fuera del área de cobertura de FruFresco. Por favor valida o rechaza el pedido.
                    </div>
                  </div>
                </div>
              )}

              {checkIsNewClient(selectedDraft) && (
                <div style={{
                  backgroundColor: '#FEF3C7',
                  borderLeft: '4px solid #D97706',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  textAlign: 'left'
                }}>
                  <Info size={24} style={{ color: '#D97706', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 800, color: '#92400E', fontSize: '0.9rem' }}>
                      ⚠️ CLIENTE NUEVO DETECTADO
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#B45309', fontWeight: 600, marginTop: '2px' }}>
                      {getDraftMetadata(selectedDraft).clientType === 'b2b_client' 
                        ? 'Este cliente comercial no está registrado en el sistema.'
                        : 'Este cliente no está registrado en el sistema. Es necesario verificar su cobertura en Bogotá antes de procesar el pedido.'
                      }
                    </div>
                  </div>
                </div>
              )}
              
              {/* Encabezado Estilo Pedido */}
              <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#111827', fontWeight: 900 }}>
                    Revisión de Pedido por Correo
                  </h2>
                  <span style={{ backgroundColor: '#FEF3C7', color: '#B45309', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800 }}>NUEVO BORRADOR</span>
                  <span style={{ 
                    backgroundColor: getDraftMetadata(selectedDraft).clientType === 'b2b_client' ? '#EFF6FF' : '#ECFDF5', 
                    color: getDraftMetadata(selectedDraft).clientType === 'b2b_client' ? '#2563EB' : '#059669', 
                    padding: '4px 10px', 
                    borderRadius: '12px', 
                    fontSize: '0.75rem', 
                    fontWeight: 800 
                  }}>
                    {getDraftMetadata(selectedDraft).clientType === 'b2b_client' ? 'B2B / HORECA' : 'B2C / HOGAR'}
                  </span>
                </div>
                
                <div style={{ backgroundColor: 'white', border: `1px solid ${THEME.colors.border}`, borderRadius: '12px', overflow: 'hidden', marginBottom: '24px', marginTop: '16px' }}>
                  <div style={{ backgroundColor: '#10B981', color: 'white', padding: '10px 16px', fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Información del pedido
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
                    
                    {/* Cliente */}
                    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid #F3F4F6' }}>
                      <div style={{ padding: '12px 16px', fontWeight: 700, color: '#4B5563', backgroundColor: '#F9FAFB', display: 'flex', alignItems: 'center' }}>Cliente</div>
                      <div style={{ padding: '8px 16px', color: '#111827', fontWeight: 600 }}>
                        {!selectedDraft.profile_id ? (
                          <input
                            type="text"
                            value={editableClientName}
                            onChange={(e) => setEditableClientName(e.target.value)}
                            style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, width: '100%', maxWidth: '400px', outline: 'none' }}
                            placeholder="Nombre del nuevo cliente..."
                          />
                        ) : (
                          <>
                            {selectedDraft.client_detected_name || 'CLIENTE NO DETECTADO'} 
                            <span style={{ color: '#6B7280', fontWeight: 'normal' }}> ({getDraftMetadata(selectedDraft).clientType === 'b2b_client' ? 'NIT' : 'CC'}: {getDraftMetadata(selectedDraft).nit || 'No detectado'})</span>
                          </>
                        )}
                      </div>
                    </div>

                    {!selectedDraft.profile_id && (
                      <>
                        {/* Celular de Cliente Nuevo */}
                        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid #F3F4F6' }}>
                          <div style={{ padding: '12px 16px', fontWeight: 700, color: '#4B5563', backgroundColor: '#F9FAFB', display: 'flex', alignItems: 'center' }}>Celular</div>
                          <div style={{ padding: '8px 16px' }}>
                            <input
                              type="text"
                              value={editableClientPhone}
                              onChange={(e) => setEditableClientPhone(e.target.value)}
                              style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, width: '100%', maxWidth: '400px', outline: 'none' }}
                              placeholder="Celular del nuevo cliente..."
                            />
                          </div>
                        </div>

                        {/* NIT / CC de Cliente Nuevo */}
                        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid #F3F4F6' }}>
                          <div style={{ padding: '12px 16px', fontWeight: 700, color: '#4B5563', backgroundColor: '#F9FAFB', display: 'flex', alignItems: 'center' }}>NIT / CC</div>
                          <div style={{ padding: '8px 16px' }}>
                            <input
                              type="text"
                              value={editableClientNit}
                              onChange={(e) => setEditableClientNit(e.target.value)}
                              style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, width: '100%', maxWidth: '400px', outline: 'none' }}
                              placeholder="NIT o Documento..."
                            />
                          </div>
                        </div>

                        {/* Tipo de Cliente Nuevo */}
                        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid #F3F4F6' }}>
                          <div style={{ padding: '12px 16px', fontWeight: 700, color: '#4B5563', backgroundColor: '#F9FAFB', display: 'flex', alignItems: 'center' }}>Tipo de Cliente</div>
                          <div style={{ padding: '8px 16px' }}>
                            <select
                              value={editableClientType}
                              onChange={(e) => setEditableClientType(e.target.value as any)}
                              style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, width: '100%', maxWidth: '400px', outline: 'none', fontWeight: 600 }}
                            >
                              <option value="b2c_client">Hogar / B2C</option>
                              <option value="b2b_client">B2B / HORECA</option>
                            </select>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Asunto */}
                    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid #F3F4F6' }}>
                      <div style={{ padding: '12px 16px', fontWeight: 700, color: '#4B5563', backgroundColor: '#F9FAFB' }}>Asunto del Correo</div>
                      <div style={{ padding: '12px 16px', color: '#374151', fontWeight: 500, fontStyle: selectedDraft.email_subject ? 'normal' : 'italic' }}>
                        {selectedDraft.email_subject || '(Sin Asunto)'}
                      </div>
                    </div>

                    {/* Sucursal / Dirección */}
                    {(() => {
                      const cleanForComparison = (str: string) => {
                        return str
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .replace(/[^a-z0-9]/g, '');
                      };
                      
                      const addressVal = editableAddress || '';
                      const cleanBody = cleanForComparison(selectedDraft.email_body || '');
                      const cleanSubject = cleanForComparison(selectedDraft.email_subject || '');
                      const cleanAddress = cleanForComparison(addressVal);
                      
                      const isAddressMissing = !addressVal || 
                        addressVal.trim() === '' || 
                        addressVal.toLowerCase().includes('no detectado') || 
                        addressVal.toLowerCase().includes('no detectada') || 
                        addressVal.toLowerCase() === 'null';
                        
                      const meta = getDraftMetadata(selectedDraft);
                      const wasAddressAssumed = isAddressMissing || 
                        ((meta as any).addressDetected === false) || 
                        (cleanAddress && !cleanBody.includes(cleanAddress) && !cleanSubject.includes(cleanAddress));

                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid #F3F4F6' }}>
                          <div style={{ padding: '12px 16px', fontWeight: 700, color: '#4B5563', backgroundColor: '#F9FAFB', display: 'flex', alignItems: 'center' }}>Sucursal/Dirección</div>
                          <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px', width: '100%', boxSizing: 'border-box' }}>
                            {isEditing ? (
                              <div style={{ width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                  <input
                                    type="text"
                                    value={editableAddress}
                                    onChange={(e) => setEditableAddress(e.target.value)}
                                    onBlur={() => triggerGeocoding(editableAddress)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); triggerGeocoding(editableAddress); } }}
                                    style={{ 
                                      padding: '8px 12px', 
                                      borderRadius: '6px', 
                                      border: wasAddressAssumed ? '1px solid #EF4444' : `1px solid ${THEME.colors.border}`, 
                                      backgroundColor: wasAddressAssumed ? '#FEF2F2' : '#FFFFFF',
                                      width: '100%', 
                                      outline: 'none',
                                      transition: 'all 0.2s ease-in-out'
                                    }}
                                    placeholder="Editar dirección de entrega..."
                                  />
                                  {geocoding && <span style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 600, flexShrink: 0 }}>🔍 Validando...</span>}
                                </div>
                                {wasAddressAssumed && (
                                  <div style={{ 
                                    marginTop: '6px', 
                                    padding: '6px 12px', 
                                    borderRadius: '4px', 
                                    backgroundColor: isAddressMissing ? '#FEF2F2' : '#FFFBEB', 
                                    borderLeft: `3px solid ${isAddressMissing ? '#EF4444' : '#D97706'}`,
                                    color: isAddressMissing ? '#991B1B' : '#92400E',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    width: '100%',
                                    boxSizing: 'border-box'
                                  }}>
                                    <span>{isAddressMissing ? '⚠️ Dirección requerida. No se detectó ninguna dirección en el pedido.' : '⚠️ Dirección no detectada en el correo/documento. Se cargó la dirección por defecto del cliente.'}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <span style={{ 
                                  color: wasAddressAssumed ? '#EF4444' : 'inherit', 
                                  fontWeight: wasAddressAssumed ? 600 : 'normal' 
                                }}>
                                  {editableAddress || meta.address || 'No detectada'}
                                </span>
                                {wasAddressAssumed && (
                                  <div style={{ 
                                    marginTop: '4px',
                                    color: isAddressMissing ? '#EF4444' : '#D97706',
                                    fontSize: '0.75rem',
                                    fontWeight: 600
                                  }}>
                                    {isAddressMissing ? '⚠️ Dirección requerida (No detectada)' : '⚠️ Dirección no detectada (Cargada de perfil)'}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Lista de precios */}
                    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid #F3F4F6' }}>
                      <div style={{ padding: '12px 16px', fontWeight: 700, color: '#4B5563', backgroundColor: '#F9FAFB', display: 'flex', alignItems: 'center' }}>Lista de precios</div>
                      <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center' }}>
                        {isEditing ? (
                          <input type="text" value={priceList} onChange={(e) => setPriceList(e.target.value)} placeholder="Ej. NUTRESA -CORRAL..." style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, width: '100%' }} />
                        ) : (
                          <span>{priceList || 'No especificada'}</span>
                        )}
                      </div>
                    </div>

                    {/* Fecha de envío (Entrega) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid #F3F4F6' }}>
                      <div style={{ padding: '12px 16px', fontWeight: 700, color: '#4B5563', backgroundColor: '#F9FAFB', display: 'flex', alignItems: 'center' }}>Fecha de envío</div>
                      <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center' }}>
                        <input type="date" value={deliveryDate} disabled={!isEditing} onChange={(e) => setDeliveryDate(e.target.value)} style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, cursor: isEditing ? 'pointer' : 'default', backgroundColor: isEditing ? 'white' : '#F9FAFB' }} />
                      </div>
                    </div>

                    {/* Documento del pedido */}
                    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid #F3F4F6' }}>
                      <div style={{ padding: '12px 16px', fontWeight: 700, color: '#4B5563', backgroundColor: '#F9FAFB', display: 'flex', alignItems: 'center' }}>Documento del pedido</div>
                      <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center' }}>
                        {isEditing ? (
                          <select value={orderDocument} onChange={(e) => setOrderDocument(e.target.value)} style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', minWidth: '200px' }}>
                            <option value="Remisión">Remisión</option>
                            <option value="Factura Electrónica">Factura Electrónica</option>
                            <option value="Cotización">Cotización</option>
                          </select>
                        ) : (
                          <span>{orderDocument}</span>
                        )}
                      </div>
                    </div>

                    {/* Hora de entrega */}
                    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid #F3F4F6' }}>
                      <div style={{ padding: '12px 16px', fontWeight: 700, color: '#4B5563', backgroundColor: '#F9FAFB', display: 'flex', alignItems: 'center' }}>Hora de entrega</div>
                      <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center' }}>
                        {isEditing ? (
                          <select value={editableDeliverySlot} onChange={(e) => setEditableDeliverySlot(e.target.value)} style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', minWidth: '150px' }}>
                            <option value="">-- -- : -- --</option>
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                            <option value="Cualquier hora">Cualquier hora</option>
                          </select>
                        ) : (
                          <span>{editableDeliverySlot || '-- -- : -- --'}</span>
                        )}
                        {!editableDeliverySlot && <span style={{ marginLeft: '12px', color: '#DC2626', fontSize: '0.75rem' }}>La hora de entrega del pedido es obligatoria</span>}
                      </div>
                    </div>

                    {/* Orden de compra */}
                    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid #F3F4F6' }}>
                      <div style={{ padding: '12px 16px', fontWeight: 700, color: '#4B5563', backgroundColor: '#F9FAFB', display: 'flex', alignItems: 'center' }}>Orden de compra</div>
                      <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center' }}>
                        {isEditing ? (
                          <input type="text" value={purchaseOrder} onChange={(e) => setPurchaseOrder(e.target.value)} style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${THEME.colors.border}`, width: '100%', maxWidth: '300px' }} />
                        ) : (
                          <span>{purchaseOrder || ''}</span>
                        )}
                      </div>
                    </div>

                    {/* Contacto */}
                    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid #F3F4F6' }}>
                      <div style={{ padding: '12px 16px', fontWeight: 700, color: '#4B5563', backgroundColor: '#F9FAFB' }}>Contacto</div>
                      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '4px', color: '#374151' }}>
                        <div><strong>Correo del pedido:</strong> {selectedDraft.source_email}</div>
                        <div><strong>Teléfono:</strong> {getDraftMetadata(selectedDraft).phone || '0'}</div>
                        <div><strong>Hora de recepción:</strong> {new Date(selectedDraft.created_at).toLocaleString('es-CO')}</div>
                        {draftCoordinates && (
                          <div 
                            onClick={() => setShowMapModal(true)}
                            style={{
                              color: checkIsNewClient(selectedDraft) ? (checkIfInCoverage(draftCoordinates.lat, draftCoordinates.lng) ? '#059669' : '#DC2626') : '#059669',
                              fontWeight: 600, 
                              marginTop: '4px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              textDecoration: 'underline'
                            }}
                            title="Haz clic para ver la ubicación exacta en el mapa"
                          >
                            {checkIsNewClient(selectedDraft) && (checkIfInCoverage(draftCoordinates.lat, draftCoordinates.lng) ? '✅ En Zona de Cobertura ' : '❌ Fuera de Zona de Cobertura ')}
                            📍 (Lat: {draftCoordinates.lat.toFixed(6)}, Lng: {draftCoordinates.lng.toFixed(6)})
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Auditoría */}
                    <div style={{ borderTop: `1px solid ${THEME.colors.border}` }}>
                      <details style={{ backgroundColor: '#F9FAFB', padding: '0.75rem 1rem', cursor: 'pointer' }}>
                        <summary style={{ fontWeight: 700, color: '#4B5563', fontSize: '0.85rem', outline: 'none' }}>
                          ▶ Ver información de auditoría
                        </summary>
                        <div style={{ padding: '1rem 0 0.5rem 0', display: 'flex', flexDirection: 'column', gap: '4px', color: '#1E3A8A', fontSize: '0.85rem' }}>
                          <div><strong>Persona que agrega el pedido:</strong> Sistema Inteligencia Artificial (IA)</div>
                          <div><strong>Fecha y hora de creación:</strong> {new Date(selectedDraft.created_at).toLocaleString('es-CO')}</div>
                          <div><strong>Última actualización:</strong> {selectedDraft.updated_at ? new Date(selectedDraft.updated_at).toLocaleString('es-CO') : 'Sin actualizaciones manuales'}</div>
                        </div>
                      </details>
                    </div>

                  </div>
                </div>
              </div>



              {/* Tabla de Productos Estilo Pedido */}
              <div style={{ marginBottom: '2rem' }}>

                 <div style={{ overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                     <thead>
                      <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                        {isEditing && (
                          <th style={{ padding: '1rem 0.5rem', textAlign: 'center', width: '40px', backgroundColor: '#F3F4F6' }}>
                            <input
                              type="checkbox"
                              checked={editableItems.length > 0 && selectedRowIndices.length === editableItems.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRowIndices(editableItems.map((_, idx) => idx));
                                } else {
                                  setSelectedRowIndices([]);
                                }
                              }}
                              style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                            />
                          </th>
                        )}
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'left', fontWeight: 800, color: '#4B5563', fontSize: '0.75rem', letterSpacing: '0.05em', backgroundColor: '#F3F4F6', width: '15%' }}>PRODUCTO ORIGINAL</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'center', fontWeight: 800, color: '#4B5563', fontSize: '0.75rem', letterSpacing: '0.05em', backgroundColor: '#F3F4F6', width: '6%' }}>CANT. ORIG.</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'left', fontWeight: 800, color: '#10B981', fontSize: '0.75rem', letterSpacing: '0.05em' }}>MATCH INVENTARIO</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'center', fontWeight: 800, color: '#10B981', fontSize: '0.75rem', letterSpacing: '0.05em', width: '130px' }}>UNIDADES</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'center', fontWeight: 800, color: '#10B981', fontSize: '0.75rem', letterSpacing: '0.05em' }}>CANTIDAD FINAL</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#6B7280', fontSize: '0.75rem', letterSpacing: '0.05em' }}>PRECIO U.</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#6B7280', fontSize: '0.75rem', letterSpacing: '0.05em' }}>SUBTOTAL</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'center', fontWeight: 800, color: '#6B7280', fontSize: '0.75rem', letterSpacing: '0.05em', width: '80px' }}>OBS.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        return (
                          <>
                            {editableItems.map((item: any, i: number) => {
                              const matchedProd = products.find(p => p.id === item.matched_product_id);
                              const itemTotal = matchedProd ? ((matchedProd.base_price || 0) * (item.quantity || 0)) : 0;

                              return (
                                <React.Fragment key={i}>
                                  <tr 
                                    className="scroll-row-animate"
                                    style={{ 
                                      borderBottom: `1px solid ${THEME.colors.border}`,
                                      animationDelay: `${i * 0.04}s`,
                                      backgroundColor: getRowBgColor(i) || 'transparent',
                                      transition: 'background-color 0.2s'
                                    }}
                                  >
                                      {isEditing && (
                                        <td style={{ 
                                          padding: '1rem 0.5rem', 
                                          textAlign: 'center', 
                                          width: '40px', 
                                          backgroundColor: getCellBgColor(i, true),
                                          transition: 'background-color 0.2s'
                                        }}>
                                          <input
                                            type="checkbox"
                                            checked={selectedRowIndices.includes(i)}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setSelectedRowIndices(prev => [...prev, i]);
                                              } else {
                                                setSelectedRowIndices(prev => prev.filter(idx => idx !== i));
                                              }
                                            }}
                                            style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                                          />
                                        </td>
                                      )}
                                      <td style={{ 
                                        padding: '1rem 0.5rem', 
                                        width: '15%', 
                                        backgroundColor: getCellBgColor(i, true),
                                        transition: 'background-color 0.2s'
                                      }}>
                                        <div style={{ fontSize: '0.85rem', color: '#4B5563', textTransform: 'uppercase', fontWeight: 700 }}>
                                          {item.originalName || item.name || item.producto || item.item || ''}
                                        </div>
                                      </td>
                                      <td style={{ 
                                        padding: '1rem 0.5rem', 
                                        textAlign: 'center', 
                                        width: '6%', 
                                        backgroundColor: getCellBgColor(i, true),
                                        transition: 'background-color 0.2s'
                                      }}>
                                        <div style={{ fontSize: '1rem', color: '#4B5563', fontWeight: 800 }}>
                                          {item.originalQuantity || item.quantity || item.cant || item.cantidad || ''}
                                        </div>
                                      </td>
                                    <td style={{ 
                                      padding: '1rem 0.5rem', 
                                      width: '30%', 
                                      backgroundColor: getCellBgColor(i, false),
                                      transition: 'background-color 0.2s'
                                    }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <input
                                            ref={el => { productInputRefs.current[i] = el; }}
                                            list={`products-list-${i}`}
                                            disabled={!isEditing}
                                            value={matchedProd ? matchedProd.name : (item.searchQuery || '')}
                                            placeholder="-- Buscar Producto --"
                                            onFocus={() => setFocusedRowIndex(i)}
                                            onBlur={() => setFocusedRowIndex(null)}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              const found = products.find(p => p.name === val);
                                              const newEdits = [...editableItems];
                                              if (found) {
                                                newEdits[i].matched_product_id = found.id;
                                                newEdits[i].searchQuery = found.name;
                                                newEdits[i].skuQuery = found.sku || '';
                                                
                                                const u = (found.unit_of_measure || '').toLowerCase().trim();
                                                let normalizedUnit = 'Kg';
                                                if (u === 'libra' || u === 'libras' || u === 'lb') normalizedUnit = 'Lb';
                                                else if (u === 'litro' || u === 'litros' || u === 'l' || u === 'lt') normalizedUnit = 'Litro';
                                                else if (u === 'unidad' || u === 'unidades' || u === 'ud' || u === 'und') normalizedUnit = 'Unidad';
                                                else if (u.includes('500 g') || u.includes('500g') || u.includes('500 gramos')) normalizedUnit = 'Paquete 500 gramos';
                                                else if (u.includes('250 g') || u.includes('250g') || u.includes('250 gramos')) normalizedUnit = 'Paquete 250 gramos';
                                                else if (u === 'kg' || u === 'kilo' || u === 'kilos' || u === 'kilogramo' || u === 'kilogramos') {
                                                  normalizedUnit = getSmartFallbackUnit(found.name, 'Kg');
                                                }
                                                else if (found.unit_of_measure) {
                                                  normalizedUnit = getSmartFallbackUnit(found.name, found.unit_of_measure);
                                                }
                                                
                                                newEdits[i].unit = normalizedUnit;
                                                // Extract variants from observations/originalName
                                                const autoSelectedOptions: Record<string, string> = {};
                                                const rawOriginalName = newEdits[i].originalName || '';
                                                let extraDescription = '';
                                                if (found && found.name) {
                                                  const origClean = rawOriginalName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
                                                  const prodClean = found.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
                                                  const origWords = origClean.split(/\s+/).filter(w => w.length > 0);
                                                  const prodWords = prodClean.split(/\s+/).filter(w => w.length > 0);
                                                  const extraWords = origWords.filter(w => !prodWords.includes(w) && !['de', 'para', 'con', 'el', 'la', 'los', 'las', 'un', 'una', 'en'].includes(w));
                                                  extraDescription = extraWords.join(' ');
                                                }
                                                let finalObservations = [newEdits[i].observations || '', extraDescription].filter(Boolean).join(' ').trim();
                                                
                                                if (found.variants && found.variants.length > 0) {
                                                  const variantOptionNames = new Set<string>();
                                                  let isOldFormat = false;
                                                  found.variants.forEach((v: any) => {
                                                    if (v.name && Array.isArray(v.options)) {
                                                      isOldFormat = true;
                                                    } else if (v.options && typeof v.options === 'object' && !Array.isArray(v.options)) {
                                                      Object.keys(v.options).forEach(k => variantOptionNames.add(k));
                                                    }
                                                  });

                                                  let variantOptionsList = found.variants;
                                                  if (!isOldFormat) {
                                                    variantOptionsList = Array.from(variantOptionNames).map(name => {
                                                      const values = new Set<string>();
                                                      found.variants.forEach((v: any) => {
                                                        if (v.options && v.options[name]) values.add(v.options[name]);
                                                      });
                                                      return { name, options: Array.from(values) };
                                                    });
                                                  }
                                                  
                                                  const searchText = `${rawOriginalName} ${finalObservations}`.toLowerCase();
                                                  variantOptionsList.forEach((v: any) => {
                                                    if (Array.isArray(v.options)) {
                                                      for (const optVal of v.options) {
                                                        const matchResult = matchVariantOption(searchText, String(optVal));
                                                        if (matchResult.matched && matchResult.matchedTextInSearch) {
                                                          autoSelectedOptions[v.name] = optVal;
                                                          const escapeRegex = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                                                          const regex = new RegExp(`\\b${escapeRegex(matchResult.matchedTextInSearch)}\\b`, 'gi');
                                                          finalObservations = finalObservations.replace(regex, '').replace(/\s+/g, ' ').trim();
                                                          break;
                                                        }
                                                      }
                                                    }
                                                  });
                                                }
                                                
                                                newEdits[i].selected_options = autoSelectedOptions;
                                                newEdits[i].observations = finalObservations;
                                              } else {
                                                newEdits[i].matched_product_id = null;
                                                newEdits[i].searchQuery = val;
                                                newEdits[i].skuQuery = '';
                                                newEdits[i].selected_options = {};
                                              }
                                              setEditableItems(newEdits);
                                            }}

                                            style={{
                                              flex: 1,
                                              padding: '0.5rem',
                                              borderRadius: '6px',
                                              border: '1px solid #D1D5DB',
                                              fontSize: '0.9rem',
                                              backgroundColor: item.matched_product_id ? '#ECFDF5' : '#FEF2F2',
                                              fontWeight: 600,
                                              color: '#111827',
                                              minWidth: '0'
                                            }}
                                          />
                                          

                                        </div>
                                      </div>
                                      <datalist id={`products-list-${i}`}>
                                        {products
                                          .filter(p => {
                                            const query = (matchedProd ? matchedProd.name : (item.searchQuery || '')).toLowerCase().trim();
                                            if (!query) return true;
                                            return p.name.toLowerCase().includes(query) || p.sku?.toLowerCase().includes(query);
                                          })
                                          .slice(0, 15)
                                          .map(p => (
                                            <option key={p.id} value={p.name} />
                                          ))
                                        }
                                      </datalist>
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem', textAlign: 'center', width: '130px' }}>
                                      {isEditing ? (
                                        <select
                                          value={item.unit || (matchedProd ? matchedProd.unit_of_measure : 'Kg')}
                                          onFocus={() => setFocusedRowIndex(i)}
                                          onBlur={() => setFocusedRowIndex(null)}
                                          onChange={(e) => {
                                            const newEdits = [...editableItems];
                                            newEdits[i].unit = e.target.value;
                                            setEditableItems(newEdits);
                                          }}
                                          style={{
                                            width: '100%',
                                            padding: '0.5rem 0.25rem',
                                            borderRadius: '6px',
                                            border: '1px solid #D1D5DB',
                                            fontSize: '0.9rem',
                                            backgroundColor: 'white',
                                            fontWeight: 600,
                                            color: '#111827'
                                          }}
                                        >
                                          {Array.from(new Set(['Kg', 'Lb', 'Unidad', 'Litro', 'Paquete 250 gramos', 'Paquete 500 gramos', 'Atado', 'Bulto', 'Canastilla', item.unit || 'Kg'])).map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <div style={{ fontSize: '0.9rem', color: '#374151', fontWeight: 600 }}>
                                          {item.unit || (matchedProd ? matchedProd.unit_of_measure : 'Kg')}
                                        </div>
                                      )}
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem', textAlign: 'center', width: '15%' }}>
                                      <input 
                                        type="number"
                                        disabled={!isEditing}
                                        value={item.quantity === 0 ? '' : (item.quantity || item.cant || item.cantidad || '')}
                                        onFocus={() => setFocusedRowIndex(i)}
                                        onBlur={() => setFocusedRowIndex(null)}
                                        onChange={(e) => {
                                          const newEdits = [...editableItems];
                                          newEdits[i].quantity = parseFloat(e.target.value) || 0;
                                          setEditableItems(newEdits);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            // Añadir nueva fila
                                            const newEdits = [...editableItems, { originalName: '', quantity: 1, matched_product_id: null, searchQuery: '', skuQuery: '', unit: 'Kg', observations: '' }];
                                            setEditableItems(newEdits);
                                            // Focus el nuevo input en el siguiente render
                                            setTimeout(() => {
                                              const nextInput = productInputRefs.current[i + 1];
                                              if (nextInput) nextInput.focus();
                                            }, 50);
                                          }
                                        }}
                                        style={{
                                          width: '90px',
                                          padding: '0.5rem 0.25rem',
                                          textAlign: 'center',
                                          borderRadius: '6px',
                                          border: '1px solid #10B981',
                                          fontWeight: 800,
                                          fontSize: '1rem'
                                        }}
                                      />
                                    </td>
                                    <td style={{ padding: '1.2rem 0.5rem', textAlign: 'right', color: '#4B5563', fontWeight: 600 }}>
                                      {matchedProd ? formatMoney(matchedProd.base_price || 0) : '-'}
                                    </td>
                                    <td style={{ padding: '1.2rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '1.1rem' }}>
                                      {matchedProd ? formatMoney(itemTotal) : '-'}
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem', textAlign: 'center', width: 'auto' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                        {/* Botón de Equivalencias */}
                                        {isEditing && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActiveEquivalenceRow(prev => prev === i ? null : i);
                                              setActiveVariantRow(null);
                                              setTimeout(() => {
                                                const equivInput = document.getElementById(`equiv-input-${i}`);
                                                if (equivInput) equivInput.focus();
                                              }, 50);
                                            }}
                                            style={{
                                              padding: '0.25rem 0.5rem',
                                              backgroundColor: activeEquivalenceRow === i
                                                ? '#4338CA'
                                                : item.conversion_factor && item.conversion_factor !== 1
                                                  ? '#EEF2FF'
                                                  : '#F3F4F6',
                                              color: activeEquivalenceRow === i
                                                ? '#FFFFFF'
                                                : item.conversion_factor && item.conversion_factor !== 1
                                                  ? '#4338CA'
                                                  : '#4B5563',
                                              border: activeEquivalenceRow === i
                                                ? '1px solid #4338CA'
                                                : item.conversion_factor && item.conversion_factor !== 1
                                                  ? '1px solid #C7D2FE'
                                                  : '1px solid #D1D5DB',
                                              borderRadius: '6px',
                                              cursor: 'pointer',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              transition: 'all 0.2s',
                                              outline: 'none',
                                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                            }}
                                            onFocus={(e) => {
                                              e.currentTarget.style.borderColor = '#6366F1';
                                              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
                                            }}
                                            onBlur={(e) => {
                                              e.currentTarget.style.borderColor = activeEquivalenceRow === i ? '#4338CA' : item.conversion_factor && item.conversion_factor !== 1 ? '#C7D2FE' : '#D1D5DB';
                                              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                                            }}
                                            title="Equivalencias (Alt+E)"
                                          >
                                            <span style={{ fontSize: '0.95rem' }}>⚖️</span>
                                            <span style={{ 
                                              fontSize: '0.75rem', 
                                              fontWeight: 700,
                                              color: activeEquivalenceRow === i ? '#FFFFFF' : '#4338CA'
                                            }}>Equivalencias</span>
                                            {item.conversion_factor && item.conversion_factor !== 1 && (
                                              <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>
                                                x{item.conversion_factor}
                                              </span>
                                            )}
                                          </button>
                                        )}

                                        {/* Botón de variantes si aplica */}
                                        {isEditing && matchedProd && matchedProd.variants && matchedProd.variants.length > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActiveVariantRow(prev => prev === i ? null : i);
                                              setTimeout(() => {
                                                const firstSelect = document.getElementById(`variant-select-${i}-0`);
                                                if (firstSelect) firstSelect.focus();
                                              }, 50);
                                            }}
                                            style={{
                                              padding: '0.2rem 0.4rem',
                                              backgroundColor: activeVariantRow === i
                                                ? '#059669'
                                                : Object.keys(item.selected_options || {}).length > 0 
                                                  ? '#ECFDF5' 
                                                  : '#F3F4F6',
                                              color: activeVariantRow === i
                                                ? '#FFFFFF'
                                                : Object.keys(item.selected_options || {}).length > 0 
                                                  ? '#047857' 
                                                  : '#374151',
                                              border: activeVariantRow === i
                                                ? '1px solid #047857'
                                                : Object.keys(item.selected_options || {}).length > 0 
                                                  ? '1px solid #A7F3D0' 
                                                  : '1px solid #D1D5DB',
                                              borderRadius: '20px',
                                              fontSize: '0.75rem',
                                              fontWeight: 700,
                                              cursor: 'pointer',
                                              whiteSpace: 'nowrap',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              transition: 'all 0.2s',
                                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                            }}
                                            title="Ver / Modificar Variantes (Alt + V)"
                                          >
                                            <span style={{ fontSize: '0.9rem' }}>⚡</span>
                                            {Object.keys(item.selected_options || {}).length > 0 ? (
                                              <span>
                                                {Object.values(item.selected_options).join(', ')}
                                              </span>
                                            ) : (
                                              <span style={{ fontSize: '0.75rem' }}>Variantes</span>
                                            )}
                                          </button>
                                        )}

                                        {/* En modo lectura, si tiene opciones elegidas, las mostramos como etiqueta */}
                                        {!isEditing && item.selected_options && Object.keys(item.selected_options).length > 0 && (
                                          <span style={{
                                            padding: '4px 8px',
                                            backgroundColor: '#E6F4EA',
                                            color: '#137333',
                                            borderRadius: '6px',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            whiteSpace: 'nowrap',
                                            display: 'inline-flex',
                                            alignItems: 'center'
                                          }}>
                                            {Object.values(item.selected_options).join(' | ')}
                                          </span>
                                        )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setObsModal({
                                            isOpen: true,
                                            rowIndex: i,
                                            text: item.observations || ''
                                          });
                                        }}
                                        title={item.observations ? `Observaciones: ${item.observations}` : 'Agregar observaciones'}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          cursor: 'pointer',
                                          color: item.observations ? THEME.colors.primary : '#9CA3AF',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          padding: '4px',
                                          borderRadius: '6px',
                                          backgroundColor: item.observations ? '#ECFDF5' : 'transparent',
                                          transition: 'all 0.2s',
                                          borderWidth: '1px',
                                          borderStyle: item.observations ? 'solid' : 'dashed',
                                          borderColor: item.observations ? THEME.colors.primary : '#D1D5DB'
                                        }}
                                      >
                                        <MessageSquare size={18} fill={item.observations ? THEME.colors.primary : 'none'} />
                                      </button>
                                      </div>
                                    </td>
                                  </tr>
                                  
                                  {/* Fila Inline de Expansión para Selección de Variantes */}
                                  {isEditing && activeVariantRow === i && matchedProd && matchedProd.variants && matchedProd.variants.length > 0 && (
                                    <tr style={{ backgroundColor: '#F0FDF4' }}>
                                      <td colSpan={isEditing ? 9 : 8} style={{ padding: '0.5rem 1rem 0.75rem 1rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                        <div style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '24px',
                                          backgroundColor: '#FFFFFF',
                                          border: '1.5px solid #10B981',
                                          borderRadius: '10px',
                                          padding: '0.65rem 1rem',
                                          boxShadow: '0 4px 10px rgba(16, 185, 129, 0.06)'
                                        }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '140px' }}>
                                            <span style={{ fontSize: '0.95rem' }}>⚡</span>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#065F46' }}>
                                              VARIABLES:
                                            </span>
                                          </div>
                                          
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1, flexWrap: 'wrap' }}>
                                            {(() => {
                                              const variantOptionNames = new Set<string>();
                                              let isOldFormat = false;
                                              matchedProd.variants.forEach((v: any) => {
                                                if (v.name && Array.isArray(v.options)) {
                                                  isOldFormat = true;
                                                } else if (v.options && typeof v.options === 'object' && !Array.isArray(v.options)) {
                                                  Object.keys(v.options).forEach(k => variantOptionNames.add(k));
                                                }
                                              });

                                              let variantOptionsList = matchedProd.variants;
                                              if (!isOldFormat) {
                                                variantOptionsList = Array.from(variantOptionNames).map(name => {
                                                  const values = new Set<string>();
                                                  matchedProd.variants.forEach((v: any) => {
                                                    if (v.options && v.options[name]) values.add(v.options[name]);
                                                  });
                                                  return { name, options: Array.from(values) };
                                                });
                                              }

                                              return variantOptionsList.map((v: any, vIdx: number) => {
                                                const currentValue = (item.selected_options || {})[v.name] || '';
                                                return (
                                                  <div key={vIdx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', whiteSpace: 'nowrap' }}>
                                                      {v.name}:
                                                    </label>
                                                    <select
                                                      id={`variant-select-${i}-${vIdx}`}
                                                      value={currentValue}
                                                      onFocus={() => setFocusedRowIndex(i)}
                                                      onBlur={() => setFocusedRowIndex(null)}
                                                      onChange={(e) => {
                                                        const val = e.target.value;
                                                        const newEdits = [...editableItems];
                                                        if (!newEdits[i].selected_options) {
                                                          newEdits[i].selected_options = {};
                                                        }
                                                        newEdits[i].selected_options[v.name] = val;
                                                        setEditableItems(newEdits);
                                                      }}
                                                      onKeyDown={(e) => {
                                                        if (e.key === 'Escape') {
                                                          setActiveVariantRow(null);
                                                          setTimeout(() => {
                                                            if (productInputRefs.current[i]) productInputRefs.current[i]?.focus();
                                                          }, 50);
                                                        } else if (e.key === 'Enter') {
                                                          e.preventDefault();
                                                          const nextSelect = document.getElementById(`variant-select-${i}-${vIdx + 1}`);
                                                          if (nextSelect) {
                                                            nextSelect.focus();
                                                          } else {
                                                            setActiveVariantRow(null);
                                                            setTimeout(() => {
                                                              if (productInputRefs.current[i]) productInputRefs.current[i]?.focus();
                                                            }, 50);
                                                          }
                                                        } else if (e.key === 'ArrowRight' && !e.altKey) {
                                                          const nextSelect = document.getElementById(`variant-select-${i}-${vIdx + 1}`);
                                                          if (nextSelect) {
                                                            e.preventDefault();
                                                            nextSelect.focus();
                                                          }
                                                        } else if (e.key === 'ArrowLeft' && !e.altKey) {
                                                          const prevSelect = document.getElementById(`variant-select-${i}-${vIdx - 1}`);
                                                          if (prevSelect) {
                                                            e.preventDefault();
                                                            prevSelect.focus();
                                                          }
                                                        }
                                                      }}
                                                      style={{
                                                        padding: '0.3rem 1.5rem 0.3rem 0.5rem',
                                                        borderRadius: '6px',
                                                        border: currentValue ? '1.5px solid #10B981' : '1px solid #D1D5DB',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        backgroundColor: currentValue ? '#ECFDF5' : 'white',
                                                        color: '#111827',
                                                        outline: 'none',
                                                        cursor: 'pointer'
                                                      }}
                                                    >
                                                      <option value="">-- Seleccionar {v.name} --</option>
                                                      {(Array.isArray(v.options) ? v.options : []).map((opt: string, optIdx: number) => (
                                                        <option key={optIdx} value={opt}>{opt}</option>
                                                      ))}
                                                    </select>
                                                  </div>
                                                );
                                              });
                                            })()}
                                          </div>
                                          
                                          <div style={{ fontSize: '0.65rem', color: '#6B7280', fontWeight: 500 }}>
                                            [Alt+V / Enter] para cerrar
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}

                                  {/* Fila Inline de Expansión para Equivalencias */}
                                  {isEditing && activeEquivalenceRow === i && (
                                    <tr style={{ backgroundColor: '#EEF2FF' }}>
                                      <td colSpan={isEditing ? 9 : 8} style={{ padding: '0.5rem 1rem 0.75rem 1rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                        <div style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '24px',
                                          backgroundColor: '#FFFFFF',
                                          border: '1.5px solid #6366F1',
                                          borderRadius: '10px',
                                          padding: '0.65rem 1rem',
                                          boxShadow: '0 4px 10px rgba(99, 102, 241, 0.06)'
                                        }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '140px' }}>
                                            <span style={{ fontSize: '0.95rem' }}>⚖️</span>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#4338CA' }}>
                                              EQUIVALENCIA:
                                            </span>
                                          </div>
                                          
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4B5563' }}>
                                              {item.originalQuantity || item.cant || item.cantidad || 1} {item.originalUnit || item.unit || 'Unidades'}
                                            </div>
                                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#9CA3AF' }}>x</div>
                                            <div>
                                              <input
                                                id={`equiv-input-${i}`}
                                                type="number"
                                                step="0.01"
                                                min="0.01"
                                                value={item.conversion_factor || 1}
                                                onFocus={() => setFocusedRowIndex(i)}
                                                onBlur={() => setFocusedRowIndex(null)}
                                                onChange={(e) => {
                                                  const factor = parseFloat(e.target.value) || 1;
                                                  const newEdits = [...editableItems];
                                                  newEdits[i].conversion_factor = factor;
                                                  const origQty = parseFloat(newEdits[i].originalQuantity || newEdits[i].cant || newEdits[i].cantidad || 1);
                                                  newEdits[i].quantity = parseFloat((origQty * factor).toFixed(2));
                                                  setEditableItems(newEdits);
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Escape' || e.key === 'Enter') {
                                                    setActiveEquivalenceRow(null);
                                                    setTimeout(() => {
                                                      if (productInputRefs.current[i]) productInputRefs.current[i]?.focus();
                                                    }, 50);
                                                  }
                                                }}
                                                style={{
                                                  width: '80px',
                                                  padding: '0.3rem 0.5rem',
                                                  borderRadius: '6px',
                                                  border: '1.5px solid #6366F1',
                                                  textAlign: 'center',
                                                  fontWeight: 'bold',
                                                  outline: 'none'
                                                }}
                                              />
                                            </div>
                                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#9CA3AF' }}>=</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#6366F1' }}>
                                              {item.quantity} {item.unit || (matchedProd ? matchedProd.unit_of_measure : 'Kg')}
                                            </div>
                                          </div>
                                          
                                          <div style={{ fontSize: '0.65rem', color: '#6B7280', fontWeight: 500 }}>
                                            [Enter / Esc] para cerrar
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}

                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
                
                {isEditing && (
                  <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-start', gap: '0.75rem', alignItems: 'center' }}>
                    <button
                      onClick={() => {
                        const newEdits = [...editableItems, { originalName: '', quantity: 1, matched_product_id: null, searchQuery: '', skuQuery: '', unit: 'Kg', observations: '' }];
                        setEditableItems(newEdits);
                        setTimeout(() => {
                          const nextInput = productInputRefs.current[newEdits.length - 1];
                          if (nextInput) nextInput.focus();
                        }, 50);
                      }}
                      style={{
                        padding: '0.6rem 1rem',
                        backgroundColor: '#F3F4F6',
                        color: '#4B5563',
                        border: '1px dashed #D1D5DB',
                        borderRadius: '8px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      + Añadir Producto Manualmente
                    </button>


                    {recentlyDeletedItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setActionConfirm({
                            isOpen: true,
                            title: '¿Notificar novedades de productos agotados?',
                            message: `Se enviará un correo electrónico de notificación consolidado al cliente por los siguientes productos que no están disponibles:\n\n${recentlyDeletedItems.map(item => `• ${item}`).join('\n')}\n\n¿Estás seguro de que deseas proceder?`,
                            confirmText: 'Enviar Notificación',
                            cancelText: 'Cancelar',
                            isDanger: false,
                            onConfirm: async () => {
                              // Preparar ítems para tabla de correo
                              const emailItems = editableItems.map(itm => {
                                const mProd = products.find(p => p.id === itm.matched_product_id);
                                return {
                                  productName: mProd ? mProd.name : (itm.searchQuery || itm.originalName || 'No especificado'),
                                  quantity: itm.quantity,
                                  unitPrice: mProd ? mProd.base_price : 0,
                                  unitOfMeasure: itm.unit || (mProd ? mProd.unit_of_measure : 'und')
                                };
                              });

                              // Preparar dbItems (ya están actualizados en la base de datos)
                              const metaItem = selectedDraft.extracted_items?.find((itm: any) => itm.isMetadata) || { isMetadata: true };
                              const dbItems = [
                                { ...metaItem, deliveryDate: deliveryDate },
                                ...editableItems.map(itm => ({
                                  originalName: itm.originalName || '',
                                  quantity: itm.quantity,
                                  matched_product_id: itm.matched_product_id
                                }))
                              ];

                              setSaving(true);
                              try {
                                const res = await fetch('/api/orders/notify-deleted-item', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    draftId: selectedDraft.id,
                                    deletedItem: recentlyDeletedItems,
                                    sourceEmail: selectedDraft.source_email,
                                    clientName: selectedDraft.client_detected_name || 'Cliente',
                                    dbItems,
                                    emailItems
                                  })
                                });

                                if (!res.ok) {
                                  const errData = await res.json();
                                  throw new Error(errData.error || 'Error en el servidor');
                                }

                                setRecentlyDeletedItems([]);
                                showToast('Novedades notificadas consolidadas al cliente por correo. ✉️', 'success');
                              } catch (err: any) {
                                console.warn('Error sending batch notification:', err);
                                showToast(`Error al notificar al cliente: ${err.message || 'Error de conexión'}`, 'error');
                              } finally {
                                setSaving(false);
                              }
                            }
                          });
                        }}
                        style={{
                          padding: '0.6rem 1rem',
                          backgroundColor: '#FEF3C7',
                          color: '#B45309',
                          border: '1px solid #FCD34D',
                          borderRadius: '8px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                        }}
                      >
                        <Mail size={16} />
                        Notificar Novedades ({recentlyDeletedItems.length})
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Cuerpo del correo / Adjuntos ocultos en un acordeón al final */}
              <details style={{ backgroundColor: '#F3F4F6', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', border: '1px solid #E5E7EB' }}>
                <summary style={{ fontWeight: 700, color: '#4B5563', fontSize: '0.85rem', outline: 'none' }}>Ver texto original / adjunto del correo enviado por el cliente</summary>
                <div style={{ padding: '1rem 0 0.5rem 0', fontSize: '0.85rem', color: '#6B7280', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {(() => {
                    const metadata = getDraftMetadata(selectedDraft);
                    if (!metadata.attachmentUrl) return null;
                    const attachmentName = metadata.attachmentName || 'documento_adjunto.pdf';
                    const lowercaseName = attachmentName.toLowerCase();
                    const isExcel = lowercaseName.endsWith('.xlsx') || lowercaseName.endsWith('.xls') || lowercaseName.endsWith('.csv');
                    const isImage = lowercaseName.endsWith('.png') || lowercaseName.endsWith('.jpg') || lowercaseName.endsWith('.jpeg') || lowercaseName.endsWith('.webp') || lowercaseName.endsWith('.gif');
                    
                    const badgeText = isExcel ? 'EXCEL' : isImage ? 'IMG' : 'PDF';
                    const badgeBg = isExcel ? '#DCFCE7' : isImage ? '#F3E8FF' : '#FEE2E2';
                    const badgeColor = isExcel ? '#15803D' : isImage ? '#6B21A8' : '#EF4444';
                    
                    const buttonText = isExcel ? 'Ver Excel Original' : isImage ? 'Ver Imagen Original' : 'Ver PDF Original';
                    const buttonBg = isExcel ? '#10B981' : isImage ? '#8B5CF6' : '#EF4444';
                    const buttonHoverBg = isExcel ? '#059669' : isImage ? '#7C3AED' : '#DC2626';

                    return (
                      <div style={{
                        backgroundColor: 'white',
                        border: '1.5px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        cursor: 'default'
                      }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            backgroundColor: badgeBg,
                            color: badgeColor,
                            width: '40px',
                            height: '40px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: '0.8rem'
                          }}>
                            {badgeText}
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1E293B', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {attachmentName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>Documento original de solicitud</div>
                          </div>
                        </div>
                        <a 
                          href={metadata.attachmentUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: buttonBg,
                            color: 'white',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            textDecoration: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'background-color 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = buttonHoverBg}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = buttonBg}
                        >
                          {isExcel ? <Grid size={14} /> : <FileText size={14} />} {buttonText}
                        </a>
                      </div>
                    );
                  })()}
                  <div style={{ whiteSpace: 'pre-wrap', cursor: 'text', borderTop: getDraftMetadata(selectedDraft).attachmentUrl ? '1px solid #E5E7EB' : 'none', paddingTop: getDraftMetadata(selectedDraft).attachmentUrl ? '12px' : '0' }}>
                    {selectedDraft.email_body || '(Sin cuerpo)'}
                  </div>
                </div>
              </details>

            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1.5rem',
              borderTop: `1px solid ${THEME.colors.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#F9FAFB',
              borderBottomLeftRadius: THEME.radius.xl,
              borderBottomRightRadius: THEME.radius.xl
            }}>
              {/* Botones de acción reubicados al footer */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {isEditing && selectedRowIndices.length > 0 && (
                  <button
                    type="button"
                    onClick={handleBatchDelete}
                    style={{
                      background: 'none', border: 'none', color: '#DC2626', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                  >
                    <Trash2 size={16} /> Eliminar Seleccionados ({selectedRowIndices.length})
                  </button>
                )}
                
                {selectedDraft.status === 'pending' && (
                  <button
                    id="btn-edit-draft"
                    type="button"
                    disabled={saving}
                    onClick={handleToggleEdit}
                    style={{
                      background: 'none', border: 'none', color: isEditing ? '#059669' : '#4B5563', fontWeight: 600, fontSize: '0.85rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                  >
                    {isEditing ? <><Check size={16} /> {saving ? 'Guardando...' : 'Finalizar Edición'}</> : <><Edit2 size={16} /> Modificar Pedido</>}
                  </button>
                 )}
 
                 {selectedDraft.status === 'pending' && (
                  <button
                    id="btn-reject-draft"
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setRejectReason('');
                      setRejectModal({
                        isOpen: true, draftId: selectedDraft.id, address: getDraftMetadata(selectedDraft).address || 'No detectada', sourceEmail: selectedDraft.source_email, totalValue: totalValue
                      });
                    }}
                    style={{
                      background: 'none', border: 'none', color: '#DC2626', fontWeight: 600, fontSize: '0.85rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                  >
                    <Trash2 size={16} /> Rechazar Pedido
                  </button>
                 )}

                 {selectedDraft.status === 'pending' && selectedDraft.source_email && (
                   <button
                     id="btn-send-receipt"
                     type="button"
                     disabled={sendingReceipt}
                     onClick={handleSendManualReceipt}
                     style={{
                       background: 'none',
                       border: 'none',
                       color: receiptSent ? '#059669' : '#2563EB',
                       fontWeight: 600,
                       fontSize: '0.85rem',
                       cursor: sendingReceipt ? 'not-allowed' : 'pointer',
                       display: 'flex',
                       alignItems: 'center',
                       gap: '4px'
                     }}
                   >
                     <Send size={16} />
                     {sendingReceipt ? 'Enviando...' : receiptSent ? 'Acuse Enviado ✓' : 'Enviar Acuse de Recibo 📧'}
                   </button>
                 )}
              </div>

              {/* Right Side: Standard Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ marginRight: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6B7280', letterSpacing: '0.05em' }}>TOTAL ESTIMADO</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#059669' }}>{formatMoney(totalValue)}</span>
                </div>

                {hasUnmatchedItems && (
                  <span style={{ color: '#EF4444', fontSize: '0.8rem', fontWeight: 800 }}>
                    ⚠️ Debe mapear todos los productos
                  </span>
                )}

                <button 
                  onClick={() => setSelectedDraft(null)}
                  style={{ padding: '0.75rem 1.5rem', backgroundColor: 'white', border: `1px solid ${THEME.colors.border}`, borderRadius: '10px', fontWeight: 600, color: '#4B5563', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                {selectedDraft.status === 'pending' && (
                  <button 
                    id="btn-approve-draft"
                    onClick={handleSendManualReceipt}
                    disabled={saving || hasUnmatchedItems}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: hasUnmatchedItems ? '#9CA3AF' : THEME.colors.primary,
                      color: 'white',
                      borderRadius: '10px',
                      fontWeight: '700',
                      border: 'none',
                      cursor: (saving || hasUnmatchedItems) ? 'not-allowed' : 'pointer',
                      opacity: (saving || hasUnmatchedItems) ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: hasUnmatchedItems ? 'none' : undefined
                    }}
                  >
                    {saving ? 'Procesando...' : 'Aprobar y Procesar Pedido'} <ArrowRight size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showMapModal && draftCoordinates && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(17, 24, 39, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 15000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '600px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
            border: '1px solid #E5E7EB'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #F3F4F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#FFFFFF'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📍 Ubicación del Pedido
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#6B7280' }}>
                  {editableAddress}
                </p>
              </div>
              <button 
                onClick={() => setShowMapModal(false)}
                style={{
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#9CA3AF',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.2s',
                  outline: 'none'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <X size={20} />
              </button>
            </div>

            {/* Map Container */}
            <div style={{ width: '100%', height: '400px', backgroundColor: '#F3F4F6', position: 'relative' }}>
              <Map
                key={`${draftCoordinates.lat}-${draftCoordinates.lng}`}
                defaultCenter={draftCoordinates}
                defaultZoom={15}
                gestureHandling={'greedy'}
                style={{ width: '100%', height: '100%' }}
              >
                <Marker position={draftCoordinates} />
              </Map>
            </div>

            {/* Footer / Actions */}
            <div style={{
              padding: '12px 20px',
              backgroundColor: '#F9FAFB',
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px'
            }}>
              <span style={{
                marginRight: 'auto',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: checkIfInCoverage(draftCoordinates.lat, draftCoordinates.lng) ? '#059669' : '#DC2626',
                display: 'flex',
                alignItems: 'center'
              }}>
                {checkIfInCoverage(draftCoordinates.lat, draftCoordinates.lng) ? '✅ Dirección en cobertura de FruFresco' : '❌ Dirección fuera de cobertura'}
              </span>
              <button
                onClick={() => setShowMapModal(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#374151',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                  e.currentTarget.style.borderColor = '#C5C7CD';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                  e.currentTarget.style.borderColor = '#D1D5DB';
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {obsModal && obsModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 12000
        }} onClick={() => setObsModal(null)}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '20px',
            padding: '2rem',
            width: '90%',
            maxWidth: '450px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            textAlign: 'left'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', margin: 0 }}>
                Observaciones del Producto
              </h3>
              <button
                onClick={() => setObsModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}
              >
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#6B7280', marginBottom: '1rem' }}>
              Agrega indicaciones o notas específicas para este producto (ej: "tomates bien maduros", "cebolla sin tallo", etc.).
            </p>
            <textarea
              value={obsModal.text}
              onChange={(e) => setObsModal(prev => prev ? { ...prev, text: e.target.value } : null)}
              placeholder="Escribe las observaciones aquí..."
              style={{
                width: '100%',
                height: '100px',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1.5px solid #D1D5DB',
                fontSize: '0.9rem',
                color: '#1F2937',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                marginBottom: '1.5rem'
              }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setObsModal(null)}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: 'white',
                  color: '#4B5563',
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const newEdits = [...editableItems];
                  newEdits[obsModal.rowIndex].observations = obsModal.text;
                  setEditableItems(newEdits);
                  setObsModal(null);
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: THEME.colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Guardar Observación
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && deleteConfirm.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 11000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '20px',
            padding: '2rem',
            width: '90%',
            maxWidth: '400px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            textAlign: 'center'
          }}>
            {deleteConfirm.step === 1 ? (
              <>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#FEF2F2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.5rem',
                  color: '#EF4444'
                }}>
                  <AlertTriangle size={28} />
                </div>
                <h3 style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: '#111827',
                  margin: '0 0 0.5rem 0'
                }}>
                  ¿Eliminar producto?
                </h3>
                <p style={{
                  fontSize: '0.9rem',
                  color: '#6B7280',
                  margin: '0 0 1.5rem 0',
                  lineHeight: '1.5'
                }}>
                  ¿Estás seguro de que deseas eliminar <strong>{deleteConfirm.productName}</strong> de la lista?
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setDeleteConfirm(null)}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#F3F4F6',
                      border: 'none',
                      borderRadius: '12px',
                      fontWeight: 700,
                      color: '#4B5563',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setDeleteConfirm(prev => prev ? { ...prev, step: 2 } : null)}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#EF4444',
                      border: 'none',
                      borderRadius: '12px',
                      fontWeight: 700,
                      color: 'white',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#FEF3C7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.5rem',
                  color: '#D97706'
                }}>
                  <Mail size={28} />
                </div>
                <h3 style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: '#111827',
                  margin: '0 0 0.5rem 0'
                }}>
                  ¿Notificar al cliente?
                </h3>
                <p style={{
                  fontSize: '0.9rem',
                  color: '#6B7280',
                  margin: '0 0 1.5rem 0',
                  lineHeight: '1.5'
                }}>
                  ¿Deseas enviar el correo de notificación por <strong>{deleteConfirm.productName}</strong> ahora, o prefieres solo eliminarlo de la lista y notificar más tarde?
                  {recentlyDeletedItems.length > 0 && (
                    <span style={{ display: 'block', marginTop: '8px', fontSize: '0.85rem', color: '#B45309', fontWeight: 600 }}>
                      ⚠️ Se enviará junto con los productos ya eliminados: {recentlyDeletedItems.join(', ')}
                    </span>
                  )}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      await deleteConfirm.onConfirmNotify();
                      setDeleteConfirm(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#D97706',
                      border: 'none',
                      borderRadius: '12px',
                      fontWeight: 700,
                      color: 'white',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1
                    }}
                  >
                    {saving ? 'Enviando...' : 'Eliminar y Enviar Correo'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      await deleteConfirm.onConfirmOnlyDelete();
                      setDeleteConfirm(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#10B981',
                      border: 'none',
                      borderRadius: '12px',
                      fontWeight: 700,
                      color: 'white',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1
                    }}
                  >
                    {saving ? 'Eliminando...' : 'Solo Eliminar (Notificar Después)'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setDeleteConfirm(prev => prev ? { ...prev, step: 1 } : null)}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#F3F4F6',
                      border: 'none',
                      borderRadius: '12px',
                      fontWeight: 700,
                      color: '#4B5563',
                      cursor: saving ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Atrás
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {actionConfirm && actionConfirm.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 11000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '20px',
            padding: '2rem',
            width: '90%',
            maxWidth: '400px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: actionConfirm.isDanger ? '#FEF2F2' : '#ECFDF5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              color: actionConfirm.isDanger ? '#EF4444' : THEME.colors.primary
            }}>
              <AlertTriangle size={28} />
            </div>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#111827',
              margin: '0 0 0.5rem 0'
            }}>
              {actionConfirm.title}
            </h3>
            <p style={{
              fontSize: '0.9rem',
              color: '#6B7280',
              margin: '0 0 1.5rem 0',
              lineHeight: '1.5'
            }}>
              {actionConfirm.message}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setActionConfirm(null)}
                style={{
                  flex: 1,
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#F3F4F6',
                  border: 'none',
                  borderRadius: '12px',
                  fontWeight: 700,
                  color: '#4B5563',
                  cursor: 'pointer'
                }}
              >
                {actionConfirm.cancelText || 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  actionConfirm.onConfirm();
                  setActionConfirm(null);
                }}
                style={{
                  flex: 1,
                  padding: '0.75rem 1.5rem',
                  backgroundColor: actionConfirm.isDanger ? '#EF4444' : THEME.colors.primary,
                  border: 'none',
                  borderRadius: '12px',
                  fontWeight: 700,
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                {actionConfirm.confirmText || 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectModal && rejectModal.isOpen && (() => {
        const isRejectionInvalid = (() => {
          if (!rejectReason) return true;
          if (rejectReason === 'monto_minimo' && rejectModal.totalValue >= 100000) return true;
          if (rejectReason === 'cobertura' && draftCoordinates && checkIfInCoverage(draftCoordinates.lat, draftCoordinates.lng)) return true;
          if (rejectReason === 'no_comercializado' && editableItems.length > 0 && editableItems.some(itm => itm.matched_product_id !== null)) return true;
          if (rejectReason === 'datos_incompletos' && editableAddress && editableAddress.toLowerCase() !== 'no detectada' && rejectModal.sourceEmail && getDraftMetadata(selectedDraft).phone && getDraftMetadata(selectedDraft).phone !== '0') return true;
          if (rejectReason === 'pedido_duplicado' && !drafts.some(d => d.id !== selectedDraft.id && d.source_email === selectedDraft.source_email && new Date(d.created_at).toDateString() === new Date(selectedDraft.created_at).toDateString())) return true;
          if (rejectReason === 'bloqueo_cartera' && selectedDraft?.profiles?.is_active === true) return true;
          if (rejectReason === 'sin_stock' && editableItems.length > 0 && editableItems.some(itm => itm.matched_product_id !== null)) return true;
          if (rejectReason === 'fuera_de_horario' && new Date(selectedDraft.created_at).getHours() < 20) return true;
          return false;
        })();

        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 11000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '20px',
              padding: '2rem',
              width: '90%',
              maxWidth: '420px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              textAlign: 'left'
            }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#FEF2F2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
                color: '#EF4444'
              }}>
                <AlertTriangle size={28} />
              </div>
              
              <h3 style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: '#111827',
                margin: '0 0 1rem 0',
                textAlign: 'center'
              }}>
                Rechazar Solicitud de Pedido
              </h3>
              
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.5rem' }}>
                  Causa de Reclamación / Cancelación:
                </label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 1rem',
                    borderRadius: '10px',
                    border: `1px solid ${THEME.colors.border}`,
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">-- Selecciona una causa --</option>
                  <option value="cobertura">Falta de cobertura geográfica</option>
                  <option value="monto_minimo">Monto menor al mínimo ($100.000)</option>
                  <option value="no_comercializado">Productos no comercializados (Construcción, etc.)</option>
                  <option value="datos_incompletos">Datos de contacto o dirección insuficientes</option>
                  <option value="pedido_duplicado">Solicitud ya procesada (Pedido duplicado)</option>
                  <option value="bloqueo_cartera">Cliente con bloqueo de cartera o saldo en mora</option>
                  <option value="sin_stock">Agotamiento de inventario en productos principales</option>
                  <option value="fuera_de_horario">Pedido recibido fuera del horario límite de programación</option>
                </select>
              </div>

              {rejectReason === 'monto_minimo' && rejectModal.totalValue >= 100000 && (
                <div style={{
                  backgroundColor: '#FEF2F2',
                  borderLeft: '4px solid #EF4444',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#991B1B',
                  marginBottom: '1.25rem'
                }}>
                  ⚠️ No es posible rechazar por monto mínimo ya que el valor estimado de este pedido es de {formatMoney(rejectModal.totalValue)} (igual o mayor a $100.000).
                </div>
              )}

              {rejectReason === 'cobertura' && draftCoordinates && checkIfInCoverage(draftCoordinates.lat, draftCoordinates.lng) && (
                <div style={{
                  backgroundColor: '#FEF2F2',
                  borderLeft: '4px solid #EF4444',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#991B1B',
                  marginBottom: '1.25rem'
                }}>
                  ⚠️ No es posible rechazar por falta de cobertura ya que la dirección se encuentra dentro de la zona de cobertura actual de FruFresco.
                </div>
              )}

              {rejectReason === 'no_comercializado' && editableItems.length > 0 && editableItems.some(itm => itm.matched_product_id !== null) && (
                <div style={{
                  backgroundColor: '#FEF2F2',
                  borderLeft: '4px solid #EF4444',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#991B1B',
                  marginBottom: '1.25rem'
                }}>
                  ⚠️ No es posible rechazar la totalidad del pedido por productos no comercializados ya que tienes productos homologados válidos. Elimina del listado los productos no comercializados y procesa el resto.
                </div>
              )}

              {rejectReason === 'datos_incompletos' && editableAddress && editableAddress.toLowerCase() !== 'no detectada' && rejectModal.sourceEmail && getDraftMetadata(selectedDraft).phone && getDraftMetadata(selectedDraft).phone !== '0' && (
                <div style={{
                  backgroundColor: '#FEF2F2',
                  borderLeft: '4px solid #EF4444',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#991B1B',
                  marginBottom: '1.25rem'
                }}>
                  ⚠️ No es posible rechazar por datos insuficientes ya que se cuenta con dirección de entrega, correo y teléfono de contacto completos.
                </div>
              )}

              {rejectReason === 'pedido_duplicado' && !drafts.some(d => d.id !== selectedDraft.id && d.source_email === selectedDraft.source_email && new Date(d.created_at).toDateString() === new Date(selectedDraft.created_at).toDateString()) && (
                <div style={{
                  backgroundColor: '#FEF2F2',
                  borderLeft: '4px solid #EF4444',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#991B1B',
                  marginBottom: '1.25rem'
                }}>
                  ⚠️ No es posible rechazar por duplicado ya que no se encontraron otras solicitudes del mismo remitente el día de hoy.
                </div>
              )}

              {rejectReason === 'bloqueo_cartera' && selectedDraft?.profiles?.is_active === true && (
                <div style={{
                  backgroundColor: '#FEF2F2',
                  borderLeft: '4px solid #EF4444',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#991B1B',
                  marginBottom: '1.25rem'
                }}>
                  ⚠️ El perfil del cliente se encuentra activo y no registra bloqueos vigentes en la base de datos.
                </div>
              )}

              {rejectReason === 'sin_stock' && editableItems.length > 0 && editableItems.some(itm => itm.matched_product_id !== null) && (
                <div style={{
                  backgroundColor: '#FEF2F2',
                  borderLeft: '4px solid #EF4444',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#991B1B',
                  marginBottom: '1.25rem'
                }}>
                  ⚠️ No es posible rechazar la totalidad del pedido por falta de stock ya que tienes productos disponibles. Elimina del listado los productos sin stock y procesa el resto.
                </div>
              )}

              {rejectReason === 'fuera_de_horario' && new Date(selectedDraft.created_at).getHours() < 20 && (
                <div style={{
                  backgroundColor: '#FEF2F2',
                  borderLeft: '4px solid #EF4444',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#991B1B',
                  marginBottom: '1.25rem'
                }}>
                  ⚠️ El correo del pedido fue recibido antes de la hora de corte operativa (8:00 PM), por lo que se encuentra dentro del horario para entrega de mañana.
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setRejectModal(null)}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#F3F4F6',
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: 700,
                    color: '#4B5563',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  id="btn-confirm-reject"
                  type="button"
                  disabled={isRejectionInvalid || saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const res = await fetch('/api/orders/reject-draft', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          draftId: rejectModal.draftId,
                          address: rejectModal.address,
                          sourceEmail: rejectModal.sourceEmail,
                          reason: rejectReason
                        })
                      });

                      if (!res.ok) {
                        const errData = await res.json();
                        throw new Error(errData.error || 'Error en el servidor');
                      }

                      const data = await res.json();
                      if (data.warning) {
                        showToast(data.warning, 'info');
                      } else {
                        showToast(`Borrador de pedido rechazado por ${rejectReason === 'cobertura' ? 'falta de cobertura' : rejectReason === 'monto_minimo' ? 'monto mínimo' : 'productos no comercializados'}. Se ha notificado al cliente. ✉️`, 'success');
                      }
                      setRejectModal(null);
                      setSelectedDraft(null);
                      fetchDrafts();
                    } catch (e: any) {
                      console.error('Error rejecting draft:', e);
                      showToast(`Error al rechazar el borrador: ${e.message}`, 'error');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#EF4444',
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: 700,
                    color: 'white',
                    cursor: 'pointer',
                    opacity: (isRejectionInvalid || saving) ? 0.5 : 1
                  }}
                >
                  {saving ? 'Procesando...' : 'Rechazar'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showConfirmModal && selectedDraft && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 11000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '24px',
            padding: '2rem 2.5rem',
            width: '90%',
            maxWidth: '580px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: `1px solid ${THEME.colors.border}`,
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <div style={{ backgroundColor: '#D1FAE5', color: '#059669', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={20} />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Previsualización de Factura / Pedido
                </h3>
              </div>
              <button 
                onClick={() => setShowConfirmModal(false)}
                disabled={confirmingOrder}
                style={{ background: '#F8FAF9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Client info summary */}
            <div style={{ backgroundColor: '#F8FAF9', borderRadius: '12px', padding: '1rem', border: '1px solid #E2E8F0', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#4B5563' }}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1E293B', marginBottom: '0.5rem', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
                <span>CLIENTE DETECTADO</span>
                <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: getDraftMetadata(selectedDraft).clientType === 'b2b_client' ? '#E0F2FE' : '#FCE7F3', color: getDraftMetadata(selectedDraft).clientType === 'b2b_client' ? '#0369A1' : '#9D174D', fontWeight: '900' }}>
                  {getDraftMetadata(selectedDraft).clientType === 'b2b_client' ? 'B2B / HORECA' : 'HOGAR / B2C'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem' }}>
                <div><strong>Nombre:</strong> {selectedDraft.client_detected_name || 'Desconocido'}</div>
                <div><strong>Celular:</strong> {getDraftMetadata(selectedDraft).phone || 'No especificado'}</div>
                <div><strong>NIT/Cédula:</strong> {getDraftMetadata(selectedDraft).nit || 'No especificado'}</div>
                <div><strong>Email:</strong> {selectedDraft.source_email || 'No especificado'}</div>
                <div style={{ gridColumn: 'span 2' }}><strong>Dirección:</strong> {getDraftMetadata(selectedDraft).address || 'No especificada'}</div>
              </div>
            </div>

            {/* Items details list */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.05em', marginBottom: '0.5rem', textTransform: 'uppercase' }}>PRODUCTOS DEL PEDIDO</div>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAF9', borderBottom: '1px solid #E2E8F0', textAlign: 'left', fontWeight: 800, color: '#4B5563' }}>
                      <th style={{ padding: '0.65rem 1rem' }}>Producto (Mapeado)</th>
                      <th style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>Cant.</th>
                      <th style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableItems.map((item: any, idx: number) => {
                      if (!item.matched_product_id) return null;
                      const prod = products.find(p => p.id === item.matched_product_id);
                      const qty = parseFloat(item.quantity?.toString() || '0');
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', color: '#1E293B' }}>
                          <td style={{ padding: '0.65rem 1rem' }}>
                            <div style={{ fontWeight: 600 }}>{prod?.name}</div>
                            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{item.originalName}</div>
                          </td>
                          <td style={{ padding: '0.65rem 1rem', textAlign: 'center', fontWeight: 'bold' }}>{qty}</td>
                          <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 'bold' }}>{formatMoney((prod?.base_price || 0) * qty)}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ backgroundColor: '#F8FAF9', borderTop: '2px solid #E2E8F0', fontWeight: 'bold', fontSize: '0.95rem', color: '#111827' }}>
                      <td style={{ padding: '0.8rem 1rem' }}>TOTAL</td>
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>-</td>
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'right', color: '#059669', fontSize: '1.05rem', fontWeight: 900 }}>{formatMoney(totalValue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Delivery and payment inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem' }}>FECHA DE ENTREGA:</label>
                <input 
                  type="date" 
                  value={deliveryDate} 
                  onChange={(e) => setDeliveryDate(e.target.value)} 
                  style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: '10px', border: `1.5px solid ${THEME.colors.border}`, outline: 'none', fontSize: '0.85rem', fontWeight: 700 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem' }}>FRANJA HORARIA:</label>
                <select 
                  value={deliverySlot} 
                  onChange={(e) => setDeliverySlot(e.target.value)} 
                  style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: '10px', border: `1.5px solid ${THEME.colors.border}`, outline: 'none', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', backgroundColor: 'white' }}
                >
                  <option value="AM">Mañana (AM)</option>
                  <option value="PM">Tarde (PM)</option>
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem' }}>MÉTODO DE PAGO:</label>
                <select 
                  value={paymentMethod} 
                  onChange={(e) => setPaymentMethod(e.target.value)} 
                  style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: '10px', border: `1.5px solid ${THEME.colors.border}`, outline: 'none', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', backgroundColor: 'white' }}
                >
                  <option value="contra_entrega">Efectivo / Contra Entrega</option>
                  <option value="transferencia">Transferencia Bancaria Bancolombia</option>
                  <option value="wompi">Link de Pago / Tarjeta (Wompi)</option>
                </select>
              </div>

              <div style={{ 
                gridColumn: 'span 2', 
                marginTop: '0.5rem', 
                borderTop: '1px solid #E2E8F0', 
                paddingTop: '1.25rem' 
              }}>
                <div style={{
                  backgroundColor: sendConfirmationEmail ? '#F0FDF4' : '#F8FAF9',
                  border: `1.5px solid ${sendConfirmationEmail ? '#86EFAC' : '#E2E8F0'}`,
                  borderRadius: '12px',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => {
                  const newVal = !sendConfirmationEmail;
                  setSendConfirmationEmail(newVal);
                  if (!newVal) setIsAuthorizedForChanges(false);
                }}
                >
                  <input 
                    type="checkbox" 
                    checked={sendConfirmationEmail} 
                    onChange={(e) => {
                      // Handled by parent div
                    }} 
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#10B981' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: '800', color: sendConfirmationEmail ? '#065F46' : '#4B5563', marginBottom: '2px' }}>
                      Enviar correo de confirmación al cliente
                    </div>
                    <div style={{ fontSize: '0.75rem', color: sendConfirmationEmail ? '#047857' : '#9CA3AF', fontWeight: '600' }}>
                      {sendConfirmationEmail 
                        ? 'Se enviará un correo con el resumen y estado final del pedido.' 
                        : 'No se notificará al cliente sobre la creación de este pedido.'}
                    </div>
                  </div>
                </div>
              </div>

              {isInvoiceModified() && sendConfirmationEmail && (
                <div style={{
                  gridColumn: 'span 2',
                  padding: '0.8rem',
                  backgroundColor: '#FEF3C7',
                  borderRadius: '10px',
                  border: '1.5px solid #FCD34D',
                  fontSize: '0.8rem',
                  color: '#92400E',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  textAlign: 'left'
                }}>
                  <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle size={14} /> Se han detectado cambios respecto al correo original.
                  </div>
                  <div>Para poder enviar la notificación con los cambios al cliente, debes confirmar que estás autorizado:</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none', fontWeight: 800 }}>
                    <input 
                      type="checkbox" 
                      checked={isAuthorizedForChanges} 
                      onChange={(e) => setIsAuthorizedForChanges(e.target.checked)} 
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    Confirmo que tengo autorización para notificar estos cambios al cliente.
                  </label>
                </div>
              )}
            </div>

            {/* Confirm Actions */}
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={confirmingOrder}
                style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', color: '#4B5563', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s' }}
              >
                Cancelar
              </button>
              <button
                id="btn-confirm-order-final"
                onClick={handleConfirmOrderDirectly}
                disabled={confirmingOrder || (isInvoiceModified() && sendConfirmationEmail && !isAuthorizedForChanges)}
                style={{
                  flex: 2,
                  padding: '0.8rem',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: (isInvoiceModified() && sendConfirmationEmail && !isAuthorizedForChanges) ? '#D1D5DB' : '#059669',
                  color: (isInvoiceModified() && sendConfirmationEmail && !isAuthorizedForChanges) ? '#9CA3AF' : 'white',
                  fontWeight: '800',
                  cursor: (confirmingOrder || (isInvoiceModified() && sendConfirmationEmail && !isAuthorizedForChanges)) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: (isInvoiceModified() && sendConfirmationEmail && !isAuthorizedForChanges) ? 'none' : '0 4px 6px -1px rgba(5, 150, 105, 0.2)'
                }}
              >
                {confirmingOrder ? 'Procesando Pedido...' : 'CONFIRMAR Y CREAR PEDIDO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: toast.type === 'success' ? 'rgba(6, 78, 59, 0.95)' : toast.type === 'error' ? 'rgba(153, 27, 27, 0.95)' : 'rgba(30, 41, 59, 0.95)',
          backdropFilter: 'blur(8px)',
          color: 'white',
          padding: '1rem 1.5rem',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          maxWidth: '400px',
          animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          border: `1px solid ${toast.type === 'success' ? '#059669' : toast.type === 'error' ? '#EF4444' : '#475569'}`
        }}>
          <style>{`
            @keyframes slideIn {
              from { transform: translateY(-20px) scale(0.95); opacity: 0; }
              to { transform: translateY(0) scale(1); opacity: 1; }
            }
          `}</style>
          <div style={{ flexShrink: 0 }}>
            {toast.type === 'success' && <Check size={20} />}
            {toast.type === 'error' && <AlertTriangle size={20} />}
            {toast.type === 'info' && <Info size={20} />}
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.4 }}>
            {toast.message}
          </div>
          <button 
            onClick={() => setToast(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.6)',
              cursor: 'pointer',
              marginLeft: 'auto',
              padding: '4px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* SHORTCUTS MANUAL MODAL */}
      {showShortcuts && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '500px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FAFAFA' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Keyboard size={24} color="#9333EA" /> Manual de Atajos
              </h2>
              <button 
                onClick={() => setShowShortcuts(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: '0.95rem', color: '#4B5563', fontWeight: 600 }}>Cerrar ventanas y modales</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <kbd style={{ backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#374151', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Esc</kbd>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: '0.95rem', color: '#4B5563', fontWeight: 600 }}>Abrir este manual</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <kbd style={{ backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#374151', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Shift</kbd>
                    <span style={{ color: '#9CA3AF' }}>+</span>
                    <kbd style={{ backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#374151', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>?</kbd>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: '0.95rem', color: '#4B5563', fontWeight: 600 }}>Aprobar y procesar pedido</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <kbd style={{ backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#374151', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Ctrl</kbd>
                    <span style={{ color: '#9CA3AF' }}>+</span>
                    <kbd style={{ backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#374151', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Enter</kbd>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: '0.95rem', color: '#4B5563', fontWeight: 600 }}>Rechazar/Eliminar selección masiva</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <kbd style={{ backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#EF4444', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Supr / Del</kbd>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: '0.95rem', color: '#4B5563', fontWeight: 600 }}>Buscar pedido</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <kbd style={{ backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#374151', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Ctrl</kbd>
                    <span style={{ color: '#9CA3AF' }}>+</span>
                    <kbd style={{ backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#374151', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>F</kbd>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: '0.95rem', color: '#4B5563', fontWeight: 600 }}>Modificar pedido actual</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <kbd style={{ backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#374151', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Ctrl</kbd>
                    <span style={{ color: '#9CA3AF' }}>+</span>
                    <kbd style={{ backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#374151', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>E</kbd>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.95rem', color: '#4B5563', fontWeight: 600 }}>Rechazar pedido actual</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <kbd style={{ backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#EF4444', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Ctrl</kbd>
                    <span style={{ color: '#9CA3AF' }}>+</span>
                    <kbd style={{ backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#EF4444', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Retroceso (Back)</kbd>
                  </div>
                </div>

              </div>
            </div>
            
            <div style={{ padding: '1rem 1.5rem', backgroundColor: '#F9FAFB', display: 'flex', justifyContent: 'center' }}>
              <button 
                onClick={() => setShowShortcuts(false)}
                style={{
                  backgroundColor: '#9333EA', color: 'white', border: 'none', borderRadius: '8px', padding: '0.6rem 2rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 4px rgba(147, 51, 234, 0.2)'
                }}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
