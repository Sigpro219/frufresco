'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import { Mail, ArrowRight, Trash2, MapPin, Phone, Hash, X, Check, Calendar, Search, ChevronDown, Info, List, Grid, AlertTriangle, MessageSquare, UploadCloud, Home, Building2, Globe, Edit2, FileText, Send } from 'lucide-react';
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

interface EmailDraftsModuleProps {
  onDraftsChange?: (count: number) => void;
}

export default function EmailDraftsModule({ onDraftsChange }: EmailDraftsModuleProps = {}) {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState<any>(null);
  const [draftCoordinates, setDraftCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [editableItems, setEditableItems] = useState<any[]>([]);
  const [recentlyDeletedItems, setRecentlyDeletedItems] = useState<string[]>([]);
  const [deliveryDate, setDeliveryDate] = useState<string>(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [b2cPolygon, setB2cPolygon] = useState<any[]>([]);
  const [editableAddress, setEditableAddress] = useState<string>('');
  const [editableDeliverySlot, setEditableDeliverySlot] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const productInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  useEffect(() => {
    setRecentlyDeletedItems([]);
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
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => { setToast({ message, type }); };
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
              sourceEmail: selectedDraft.source_email
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
          deliveryDate: deliveryDate
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
              unitOfMeasure: mProd ? mProd.unit_of_measure : 'und'
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
    setActionConfirm({
      isOpen: true,
      title: '¿Rechazar y eliminar borrador?',
      message: '¿Estás seguro de que deseas rechazar y eliminar este borrador de pedido?',
      confirmText: 'Rechazar y Eliminar',
      cancelText: 'Cancelar',
      isDanger: true,
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('order_drafts')
            .update({ status: 'rejected' })
            .eq('id', id);

          if (error) throw error;
          setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: 'rejected' } : d));
          if (selectedDraft?.id === id) setSelectedDraft(null);
        } catch (err) {
          console.error('Error deleting draft:', err);
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
      setIsEditing(false);
      const meta = getDraftMetadata(selectedDraft);
      setEditableAddress(meta.address || '');
      triggerGeocoding(meta.address);
      
      // Initialize editable items
      const rawItems = getDraftItems(selectedDraft);
      const initialEdits = rawItems.map((item: any) => {
        let matchedId = item.matched_product_id || null;
        if (!matchedId) {
          const matchedProd = findMatchedProduct(item.originalName);
          if (matchedProd) matchedId = matchedProd.id;
        }
        return {
            ...item,
            originalQuantity: item.quantity || 1,
            quantity: item.quantity || 1,
            originalMatchedProductId: matchedId,
            matched_product_id: matchedId
        };
      });
      setEditableItems(initialEdits);

      // Initialize delivery date from metadata if present
      const metadata = getDraftMetadata(selectedDraft);
      setEditableDeliverySlot(metadata.deliverySlot || '');
      if (metadata.deliveryDate) {
        setDeliveryDate(metadata.deliveryDate);
      } else {
        setDeliveryDate(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
      }
      
    } else {
      setDraftCoordinates(null);
      setGeocoding(false);
      setEditableItems([]);
      setEditableDeliverySlot('');
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
    return {
      address: meta?.address || draft.extracted_address || 'No detectado',
      phone: meta?.phone || draft.extracted_phone || 'No detectado',
      nit: meta?.nit || draft.extracted_nit || 'No detectado',
      clientType: meta?.clientType || draft.profiles?.role || 'b2c_client',
      deliveryDate: meta?.deliveryDate || null,
      deliverySlot: meta?.deliverySlot || null,
      attachmentUrl: meta?.attachmentUrl || null,
      attachmentName: meta?.attachmentName || null
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
      }).every(w => ['tipo', 'de', 'con', 'para', 'el', 'la', 'los', 'las', 'un', 'una', 'en'].includes(w));

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

  const handleApprove = async () => {
    if (!selectedDraft) return;
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
        deliveryDate: deliveryDate
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
            address: metadata?.address || '',
            city: 'Bogotá',
            company_name: selectedDraft.client_detected_name || 'Cliente por Correo',
            created_at: new Date().toISOString(),
            email: selectedDraft.source_email || null,
            nit: metadata?.nit || null,
            is_active: true
          });

        if (profileError) {
          throw new Error('Error al crear perfil de cliente: ' + profileError.message);
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
              nickname: item.originalName || null,
              variant_label: null
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
          shipping_address: metadata?.address || 'Dirección por definir'
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
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
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

        {/* Channel Dropdown */}
        <div 
          onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)}
          style={{ 
            position: 'relative',
            display: 'flex', 
            alignItems: 'center', 
            backgroundColor: '#F9FAFB', 
            border: 'none', 
            borderRadius: THEME.radius.md,
            padding: '0.6rem 1rem',
            gap: '12px',
            cursor: 'pointer'
          }}
        >
          <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#111827' }}>
            {selectedChannel === 'all' ? 'Todos los canales' : selectedChannel === 'email' ? 'Email Inbound' : 'Otros'}
          </span>
          <ChevronDown size={16} color="#6B7280" />
          
          {isChannelDropdownOpen && (
            <div style={{
              position: 'absolute',
              top: '45px',
              right: 0,
              backgroundColor: 'white',
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.md,
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              zIndex: 10,
              minWidth: '160px',
              overflow: 'hidden'
            }}>
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedChannel('all');
                  setIsChannelDropdownOpen(false);
                }}
                style={{
                  padding: '0.75rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: selectedChannel === 'all' ? THEME.colors.primary : '#4B5563',
                  backgroundColor: selectedChannel === 'all' ? '#ECFDF5' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = selectedChannel === 'all' ? '#ECFDF5' : '#F9FAFB'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedChannel === 'all' ? '#ECFDF5' : 'transparent'}
              >
                Todos los canales
              </div>
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedChannel('email');
                  setIsChannelDropdownOpen(false);
                }}
                style={{
                  padding: '0.75rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: selectedChannel === 'email' ? THEME.colors.primary : '#4B5563',
                  backgroundColor: selectedChannel === 'email' ? '#ECFDF5' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = selectedChannel === 'email' ? '#ECFDF5' : '#F9FAFB'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedChannel === 'email' ? '#ECFDF5' : 'transparent'}
              >
                Email Inbound
              </div>
            </div>
          )}
        </div>

        {/* Status Dropdown */}
        <div 
          onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
          style={{ 
            position: 'relative',
            display: 'flex', 
            alignItems: 'center', 
            backgroundColor: '#F9FAFB', 
            border: 'none', 
            borderRadius: THEME.radius.md,
            padding: '0.6rem 1rem',
            gap: '12px',
            cursor: 'pointer'
          }}
        >
          <span style={{ 
            fontWeight: 800, 
            fontSize: '0.85rem', 
            color: selectedStatus === 'pending' ? '#B45309' : selectedStatus === 'rejected' ? '#DC2626' : selectedStatus === 'approved' ? '#059669' : '#111827',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            {selectedStatus === 'pending' && <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#D97706' }}></span>}
            {selectedStatus === 'rejected' && <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#EF4444' }}></span>}
            {selectedStatus === 'approved' && <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#059669' }}></span>}
            {selectedStatus === 'all' ? `Todos (${countAll})` : selectedStatus === 'pending' ? `Pendientes (${countPending})` : selectedStatus === 'rejected' ? `Rechazados (${countRejected})` : `Gestionados (${countApproved})`}
          </span>
          <ChevronDown size={16} color="#6B7280" />
          
          {isStatusDropdownOpen && (
            <div style={{
              position: 'absolute',
              top: '45px',
              right: 0,
              backgroundColor: 'white',
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.md,
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              zIndex: 100,
              minWidth: '200px',
              overflow: 'hidden'
            }}>
              {/* Todos */}
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedStatus('all');
                  setIsStatusDropdownOpen(false);
                }}
                style={{
                  padding: '0.75rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: selectedStatus === 'all' ? THEME.colors.primary : '#4B5563',
                  backgroundColor: selectedStatus === 'all' ? '#ECFDF5' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = selectedStatus === 'all' ? '#ECFDF5' : '#F9FAFB'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedStatus === 'all' ? '#ECFDF5' : 'transparent'}
              >
                <span>Todos los correos</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6B7280' }}>{countAll}</span>
              </div>
              
              {/* Pendientes */}
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedStatus('pending');
                  setIsStatusDropdownOpen(false);
                }}
                style={{
                  padding: '0.75rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: selectedStatus === 'pending' ? '#B45309' : '#4B5563',
                  backgroundColor: selectedStatus === 'pending' ? '#FFFBEB' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = selectedStatus === 'pending' ? '#FFFBEB' : '#F9FAFB'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedStatus === 'pending' ? '#FFFBEB' : 'transparent'}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#D97706' }}></span>
                  Pendientes
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#B45309' }}>{countPending}</span>
              </div>

              {/* Rechazados */}
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedStatus('rejected');
                  setIsStatusDropdownOpen(false);
                }}
                style={{
                  padding: '0.75rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: selectedStatus === 'rejected' ? '#DC2626' : '#4B5563',
                  backgroundColor: selectedStatus === 'rejected' ? '#FEF2F2' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = selectedStatus === 'rejected' ? '#FEF2F2' : '#F9FAFB'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedStatus === 'rejected' ? '#FEF2F2' : 'transparent'}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#EF4444' }}></span>
                  Rechazados
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#DC2626' }}>{countRejected}</span>
              </div>

              {/* Gestionados */}
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedStatus('approved');
                  setIsStatusDropdownOpen(false);
                }}
                style={{
                  padding: '0.75rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: selectedStatus === 'approved' ? '#059669' : '#4B5563',
                  backgroundColor: selectedStatus === 'approved' ? '#E6F4EA' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = selectedStatus === 'approved' ? '#E6F4EA' : '#F9FAFB'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedStatus === 'approved' ? '#E6F4EA' : 'transparent'}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#059669' }}></span>
                  Gestionados
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#059669' }}>{countApproved}</span>
              </div>
            </div>
          )}
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
        <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, overflow: 'hidden', boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFB', borderBottom: '1px solid #E5E7EB' }}>
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
                      onClick={() => setSelectedDraft(draft)}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: THEME.colors.primary, 
                        cursor: 'pointer', 
                        padding: '5px', 
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
                  padding: '1.25rem', 
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  textAlign: 'left'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = THEME.colors.primary;
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = THEME.colors.border;
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
          <div style={{
            backgroundColor: 'white',
            borderRadius: THEME.radius.xl,
            width: '100%',
            maxWidth: '1150px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#111827', fontWeight: 800 }}>Revisión de Correo</h2>
                <p style={{ margin: '4px 0 0 0', color: '#6B7280', fontSize: '0.85rem' }}>De: {selectedDraft.source_email}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {isEditing && selectedRowIndices.length > 0 && (
                  <button
                    type="button"
                    onClick={handleBatchDelete}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#FEE2E2',
                      color: '#991B1B',
                      border: '1px solid #FCA5A5',
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
                    <Trash2 size={16} />
                    Eliminar Seleccionados ({selectedRowIndices.length})
                  </button>
                )}
                
                {/* Modificar Pedido button */}
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleToggleEdit}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '0.5rem 1rem',
                    backgroundColor: isEditing ? '#DEF7EC' : 'white',
                    border: `1.5px solid ${isEditing ? '#31C48D' : THEME.colors.border}`,
                    borderRadius: '8px',
                    color: isEditing ? '#03543F' : '#4B5563',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                  }}
                >
                  {isEditing ? (
                    <>
                      <Check size={16} />
                      {saving ? 'Guardando...' : 'Finalizar Edición'}
                    </>
                  ) : (
                    <>
                      <Edit2 size={16} />
                      Modificar Pedido
                    </>
                  )}
                </button>

                {/* Rechazar Pedido button */}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setRejectReason('');
                    setRejectModal({
                      isOpen: true,
                      draftId: selectedDraft.id,
                      address: getDraftMetadata(selectedDraft).address || 'No detectada',
                      sourceEmail: selectedDraft.source_email,
                      totalValue: totalValue
                    });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '0.5rem 1.25rem',
                    backgroundColor: '#FEF2F2',
                    border: '1.5px solid #FCA5A5',
                    borderRadius: '8px',
                    color: '#DC2626',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                  }}
                  onMouseEnter={e => { if(!saving) { e.currentTarget.style.backgroundColor = '#FEE2E2'; } }}
                  onMouseLeave={e => { if(!saving) { e.currentTarget.style.backgroundColor = '#FEF2F2'; } }}
                >
                  <Trash2 size={16} />
                  Rechazar Pedido
                </button>

                <button onClick={() => setSelectedDraft(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
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
                
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase', marginBottom: '8px' }}>
                  {selectedDraft.client_detected_name || 'CLIENTE NO DETECTADO'} 
                  <span style={{ fontSize: '0.9rem', color: '#6B7280', fontWeight: 600 }}> (NIT: {getDraftMetadata(selectedDraft).nit || 'No detectado'})</span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#4B5563', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={16} style={{ color: THEME.colors.primary }} />
                    {isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <input
                          type="text"
                          value={editableAddress}
                          onChange={(e) => setEditableAddress(e.target.value)}
                          onBlur={() => triggerGeocoding(editableAddress)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              triggerGeocoding(editableAddress);
                            }
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: `1.5px solid ${THEME.colors.primary}`,
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: '#111827',
                            width: '100%',
                            outline: 'none',
                            backgroundColor: '#F0FDF4'
                          }}
                          placeholder="Editar dirección de entrega..."
                        />
                        {geocoding && <span style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 600, whiteSpace: 'nowrap' }}>🔍 Validando...</span>}
                      </div>
                    ) : (editableAddress || getDraftMetadata(selectedDraft).address) ? (
                      <a
                        href={draftCoordinates 
                          ? `https://www.google.com/maps/search/?api=1&query=${draftCoordinates.lat},${draftCoordinates.lng}` 
                          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(editableAddress || getDraftMetadata(selectedDraft).address)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: THEME.colors.primary,
                          textDecoration: 'underline',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Ver ubicación en Google Maps"
                      >
                        {editableAddress || getDraftMetadata(selectedDraft).address}
                        <span style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>↗</span>
                      </a>
                    ) : (
                      <span>Dirección no detectada</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={16} /> {getDraftMetadata(selectedDraft).phone || 'Teléfono no detectado'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={16} /> {selectedDraft.source_email}</div>
                  
                  {/* Delivery Date Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
                    <Calendar size={16} style={{ color: THEME.colors.primary }} />
                    <span style={{ fontWeight: 700, color: '#374151', fontSize: '0.85rem' }}>Fecha de Entrega:</span>
                    <input
                      type="date"
                      value={deliveryDate}
                      disabled={!isEditing}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${THEME.colors.border}`,
                        fontSize: '0.85rem',
                        color: '#374151',
                        outline: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}
                    />
                  </div>

                  {/* Horario de Entrega Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
                    <Send size={16} style={{ color: THEME.colors.primary }} />
                    <span style={{ fontWeight: 700, color: '#374151', fontSize: '0.85rem' }}>Horario de Entrega:</span>
                    {isEditing ? (
                      <select
                        value={editableDeliverySlot}
                        onChange={(e) => setEditableDeliverySlot(e.target.value)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: `1.5px solid ${THEME.colors.primary}`,
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: '#111827',
                          backgroundColor: '#F0FDF4',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">-- PENDIENTE --</option>
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                        <option value="Cualquier hora">Cualquier hora</option>
                      </select>
                    ) : (
                      <span style={{ 
                        fontWeight: 700, 
                        color: editableDeliverySlot ? '#059669' : '#D97706',
                        fontSize: '0.85rem',
                        backgroundColor: editableDeliverySlot ? '#E6F4EA' : '#FFF3CD',
                        padding: '2px 8px',
                        borderRadius: '6px'
                      }}>
                        {editableDeliverySlot || 'PENDIENTE'}
                      </span>
                    )}
                  </div>

                  {geocoding && <div style={{ fontSize: '0.8rem', color: '#D97706', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14}/> Buscando coordenadas...</div>}
                  {draftCoordinates && (
                    <div style={{
                      fontSize: '0.8rem',
                      color: checkIsNewClient(selectedDraft)
                        ? (checkIfInCoverage(draftCoordinates.lat, draftCoordinates.lng) ? '#059669' : '#DC2626')
                        : '#059669',
                      fontWeight: 600,
                      display: 'flex',
                      gap: '12px',
                      marginTop: '4px'
                    }}>
                      <span>Lat: {draftCoordinates.lat.toFixed(6)}</span>
                      <span>Lng: {draftCoordinates.lng.toFixed(6)}</span>
                      {checkIsNewClient(selectedDraft) && (
                        <span>
                          {checkIfInCoverage(draftCoordinates.lat, draftCoordinates.lng)
                            ? '✅ En Zona de Cobertura'
                            : '❌ Fuera de Zona de Cobertura'}
                        </span>
                      )}
                    </div>
                  )}
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
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'left', fontWeight: 800, color: '#4B5563', fontSize: '0.75rem', letterSpacing: '0.05em', backgroundColor: '#F3F4F6' }}>PRODUCTO ORIGINAL</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'center', fontWeight: 800, color: '#4B5563', fontSize: '0.75rem', letterSpacing: '0.05em', backgroundColor: '#F3F4F6' }}>CANT. ORIG.</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'left', fontWeight: 800, color: '#10B981', fontSize: '0.75rem', letterSpacing: '0.05em' }}>MATCH INVENTARIO</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'center', fontWeight: 800, color: '#10B981', fontSize: '0.75rem', letterSpacing: '0.05em' }}>CANTIDAD FINAL</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#6B7280', fontSize: '0.75rem', letterSpacing: '0.05em' }}>PRECIO U.</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#6B7280', fontSize: '0.75rem', letterSpacing: '0.05em' }}>SUBTOTAL</th>
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
                                <tr key={i} style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                    {isEditing && (
                                      <td style={{ padding: '1rem 0.5rem', textAlign: 'center', width: '40px', backgroundColor: '#F9FAFB' }}>
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
                                    <td style={{ padding: '1rem 0.5rem', width: '25%', backgroundColor: '#F9FAFB' }}>
                                      <div style={{ fontSize: '0.85rem', color: '#4B5563', textTransform: 'uppercase', fontWeight: 700 }}>
                                        {item.originalName || item.name || item.producto || item.item || ''}
                                      </div>
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem', textAlign: 'center', width: '10%', backgroundColor: '#F9FAFB' }}>
                                      <div style={{ fontSize: '1rem', color: '#4B5563', fontWeight: 800 }}>
                                        {item.originalQuantity || item.quantity || item.cant || item.cantidad || ''}
                                      </div>
                                    </td>
                                  <td style={{ padding: '1rem 0.5rem', width: '30%' }}>
                                    <input
                                      ref={el => { productInputRefs.current[i] = el; }}
                                      list={`products-list-${i}`}
                                      disabled={!isEditing}
                                      value={matchedProd ? matchedProd.name : (item.searchQuery || '')}
                                      placeholder="-- Buscar Producto --"
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const found = products.find(p => p.name === val);
                                        const newEdits = [...editableItems];
                                        if (found) {
                                          newEdits[i].matched_product_id = found.id;
                                          newEdits[i].searchQuery = found.name;
                                        } else {
                                          newEdits[i].matched_product_id = null;
                                          newEdits[i].searchQuery = val;
                                        }
                                        setEditableItems(newEdits);
                                      }}
                                      style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        borderRadius: '6px',
                                        border: '1px solid #D1D5DB',
                                        fontSize: '0.9rem',
                                        backgroundColor: item.matched_product_id ? '#ECFDF5' : '#FEF2F2',
                                        fontWeight: 600,
                                        color: '#111827'
                                      }}
                                    />
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
                                    <td style={{ padding: '1rem 0.5rem', textAlign: 'center', width: '15%' }}>
                                      <input 
                                        type="number"
                                        disabled={!isEditing}
                                        value={item.quantity === 0 ? '' : (item.quantity || item.cant || item.cantidad || '')}
                                        onChange={(e) => {
                                        const newEdits = [...editableItems];
                                        newEdits[i].quantity = parseFloat(e.target.value) || 0;
                                        setEditableItems(newEdits);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          // Añadir nueva fila
                                          const newEdits = [...editableItems, { originalName: '', quantity: 1, matched_product_id: null, searchQuery: '' }];
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
                                </tr>
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
                        const newEdits = [...editableItems, { originalName: '', quantity: 1, matched_product_id: null, searchQuery: '' }];
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
                                  unitOfMeasure: mProd ? mProd.unit_of_measure : 'und'
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
                  {getDraftMetadata(selectedDraft).attachmentUrl && (
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
                          backgroundColor: '#FEE2E2',
                          color: '#EF4444',
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          fontSize: '0.8rem'
                        }}>
                          PDF
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1E293B', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {getDraftMetadata(selectedDraft).attachmentName || 'documento_adjunto.pdf'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>Documento original de solicitud</div>
                        </div>
                      </div>
                      <a 
                        href={getDraftMetadata(selectedDraft).attachmentUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#EF4444',
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
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#DC2626'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#EF4444'}
                      >
                        <FileText size={14} /> Ver PDF Original
                      </a>
                    </div>
                  )}
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
              {/* Left Side: Empty space to push buttons to the right */}
              <div></div>

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
                <button 
                  onClick={handleApprove}
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
              </div>
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

      {rejectModal && rejectModal.isOpen && (
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
                type="button"
                disabled={
                  !rejectReason || 
                  (rejectReason === 'monto_minimo' && rejectModal.totalValue >= 100000) ||
                  saving
                }
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

                    showToast(`Borrador de pedido rechazado por ${rejectReason === 'cobertura' ? 'falta de cobertura' : rejectReason === 'monto_minimo' ? 'monto mínimo' : 'productos no comercializados'}. Se ha notificado al cliente. ✉️`, 'success');
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
                  opacity: (!rejectReason || (rejectReason === 'monto_minimo' && rejectModal.totalValue >= 100000) || saving) ? 0.5 : 1
                }}
              >
                {saving ? 'Procesando...' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}

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

              <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: '800', color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                  <input 
                    type="checkbox" 
                    checked={sendConfirmationEmail} 
                    onChange={(e) => {
                      setSendConfirmationEmail(e.target.checked);
                      if (!e.target.checked) setIsAuthorizedForChanges(false);
                    }} 
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  Enviar correo de confirmación de pedido al cliente
                </label>
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
    </div>
  );
}
