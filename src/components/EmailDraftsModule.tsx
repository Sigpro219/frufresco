'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import { Mail, ArrowRight, Trash2, MapPin, Phone, Hash, X, Check, Calendar, Search, ChevronDown, Info, List, Grid, AlertTriangle, MessageSquare, UploadCloud, Home, Building2, Globe } from 'lucide-react';
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
  const [deliveryDate, setDeliveryDate] = useState<string>(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [b2cPolygon, setB2cPolygon] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const productInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    productName: string;
    onConfirm: () => void;
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
      onDraftsChange(drafts.length);
    }
  }, [drafts.length, onDraftsChange]);

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

          alert('Borrador de pedido rechazado. Se ha enviado el correo electrónico de notificación al cliente. ✉️');
          setSelectedDraft(null);
          fetchDrafts();
        } catch (e: any) {
          console.error('Error in handleRejectForCoverage:', e);
          alert(`Error al rechazar el borrador: ${e.message}. Por favor intenta de nuevo.`);
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
        .eq('status', 'pending')
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
          setDrafts(prev => prev.filter(d => d.id !== id));
          if (selectedDraft?.id === id) setSelectedDraft(null);
        } catch (err) {
          console.error('Error deleting draft:', err);
        }
      }
    });
  };

  useEffect(() => {
    if (selectedDraft) {
      const meta = getDraftMetadata(selectedDraft);
      if (meta.address && meta.address !== 'No detectado') {
        setGeocoding(true);
        setDraftCoordinates(null);
        fetch(`/api/geocode?address=${encodeURIComponent(meta.address)}&city=Bogotá`)
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
      
      // Initialize editable items
      const rawItems = getDraftItems(selectedDraft);
      const initialEdits = rawItems.map((item: any) => {
        // Try to find a match using aliases first, then by name
        let matchedId = item.matched_product_id || null;
        if (!matchedId) {
            const aliasMatch = aliases[item.originalName?.toLowerCase()?.trim()];
            if (aliasMatch) {
                matchedId = aliasMatch;
            } else {
                const cleanText = (txt: string) => {
                  return txt
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9\s]/g, "")
                    .trim();
                };

                const originalClean = cleanText(item.originalName || '');
                const originalWords = originalClean.split(/\s+/).filter(w => w.length > 1);

                let bestMatch: any = null;
                let highestScore = -999;

                for (const p of products) {
                  const productClean = cleanText(p.name);
                  
                  if (productClean === originalClean) {
                    bestMatch = p;
                    break;
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

                if (!bestMatch) {
                  bestMatch = products.find((p: any) => {
                    const productClean = cleanText(p.name);
                    return productClean.includes(originalClean) || originalClean.includes(productClean);
                  });
                }

                if (bestMatch) {
                  matchedId = bestMatch.id;
                }
            }
        }
        return {
            ...item,
            originalQuantity: item.quantity || 1,
            quantity: item.quantity || 1,
            matched_product_id: matchedId
        };
      });
      setEditableItems(initialEdits);

      // Initialize delivery date from metadata if present
      const metadata = getDraftMetadata(selectedDraft);
      if (metadata.deliveryDate) {
        setDeliveryDate(metadata.deliveryDate);
      } else {
        setDeliveryDate(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
      }
      
    } else {
      setDraftCoordinates(null);
      setGeocoding(false);
      setEditableItems([]);
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
      deliveryDate: meta?.deliveryDate || null
    };
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

      // 4. Redirect
      window.location.href = `/admin/orders/create?draft_id=${selectedDraft.id}`;
    } catch (e) {
      console.error('Error in handleApprove:', e);
      alert('Error al guardar. Por favor intenta de nuevo.');
      setSaving(false);
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

    return matchesSearch && matchesDate && matchesChannel;
  });

  const totalValue = editableItems.reduce((acc, item) => {
    const matchedProd = products.find(p => p.id === item.matched_product_id);
    return acc + (matchedProd ? ((matchedProd.base_price || 0) * (item.quantity || 0)) : 0);
  }, 0);

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

        {/* Info Icon */}
        <div 
          onClick={() => alert('Este módulo muestra los correos electrónicos entrantes (inbound) procesados automáticamente por la IA. Aquí puedes revisar los borradores de pedidos, mapear productos con el inventario, validar la cobertura geográfica del cliente en Bogotá y aprobarlos para crear órdenes.')}
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
      ) : filteredDrafts.length === 0 ? (
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
                <th style={{ padding: '1rem', width: '7%', textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredDrafts.map((draft) => {
                const meta = getDraftMetadata(draft);
                const items = getDraftItems(draft);
                const itemsCount = items.length;
                const estimatedTotal = items.reduce((acc: number, item: any) => {
                  const matchedProd = products.find(p => p.id === item.matched_product_id);
                  return acc + (matchedProd ? ((matchedProd.base_price || 0) * (item.quantity || 0)) : 0);
                }, 0);

                const estimatedWeight = items.reduce((acc: number, item: any) => {
                  const matchedProd = products.find(p => p.id === item.matched_product_id);
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
                    {estimatedTotal > 0 ? formatMoney(estimatedTotal) : '-'}
                  </td>
                  <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                    <div style={{
                      padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: '900',
                      backgroundColor: '#FEF3C7',
                      color: '#92400E'
                    }}>
                      PENDIENTE
                    </div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={(e) => handleDelete(draft.id, e)}
                      style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
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
          {filteredDrafts.map((draft) => {
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
                  <span style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: 600 }}>
                    {itemsCount} productos
                  </span>
                  <button 
                    onClick={(e) => handleDelete(draft.id, e)}
                    style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '4px' }}
                    title="Rechazar"
                  >
                    <Trash2 size={16} />
                  </button>
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
            maxWidth: '800px',
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
              <button onClick={() => setSelectedDraft(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                <X size={24} />
              </button>
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
                    {getDraftMetadata(selectedDraft).address ? (
                      <a
                        href={draftCoordinates 
                          ? `https://www.google.com/maps/search/?api=1&query=${draftCoordinates.lat},${draftCoordinates.lng}` 
                          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(getDraftMetadata(selectedDraft).address)}`
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
                        {getDraftMetadata(selectedDraft).address}
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
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'left', fontWeight: 800, color: '#4B5563', fontSize: '0.75rem', letterSpacing: '0.05em', backgroundColor: '#F3F4F6' }}>PRODUCTO ORIGINAL</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'center', fontWeight: 800, color: '#4B5563', fontSize: '0.75rem', letterSpacing: '0.05em', backgroundColor: '#F3F4F6' }}>CANT. ORIG.</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'left', fontWeight: 800, color: '#10B981', fontSize: '0.75rem', letterSpacing: '0.05em' }}>MATCH INVENTARIO</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'center', fontWeight: 800, color: '#10B981', fontSize: '0.75rem', letterSpacing: '0.05em' }}>CANTIDAD FINAL</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#6B7280', fontSize: '0.75rem', letterSpacing: '0.05em' }}>PRECIO U.</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#6B7280', fontSize: '0.75rem', letterSpacing: '0.05em' }}>SUBTOTAL</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'center', fontWeight: 800, color: '#6B7280', fontSize: '0.75rem', letterSpacing: '0.05em', width: '50px' }}></th>
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
                                        width: '60px',
                                        padding: '0.5rem',
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
                                  <td style={{ padding: '1rem 0.5rem', textAlign: 'center', width: '50px' }}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const itemLabel = item.originalName || (matchedProd ? matchedProd.name : 'este producto');
                                        setDeleteConfirm({
                                          isOpen: true,
                                          productName: itemLabel,
                                          onConfirm: async () => {
                                            const newEdits = editableItems.filter((_, idx) => idx !== i);
                                            
                                            // 1. Preparar ítems para base de datos
                                            const metaItem = selectedDraft.extracted_items?.find((itm: any) => itm.isMetadata) || { isMetadata: true };
                                            const updatedMetaItem = {
                                              ...metaItem,
                                              deliveryDate: deliveryDate
                                            };
                                            const dbItems = [
                                              updatedMetaItem,
                                              ...newEdits.map(itm => ({
                                                originalName: itm.originalName || '',
                                                quantity: itm.quantity,
                                                matched_product_id: itm.matched_product_id
                                              }))
                                            ];

                                            // 2. Preparar ítems para tabla de correo
                                            const emailItems = newEdits.map(itm => {
                                              const mProd = products.find(p => p.id === itm.matched_product_id);
                                              return {
                                                productName: mProd ? mProd.name : (itm.searchQuery || itm.originalName || 'No especificado'),
                                                quantity: itm.quantity,
                                                unitPrice: mProd ? mProd.base_price : 0,
                                                unitOfMeasure: mProd ? mProd.unit_of_measure : 'und'
                                              };
                                            });

                                            setSaving(true);
                                            try {
                                              const res = await fetch('/api/orders/notify-deleted-item', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                  draftId: selectedDraft.id,
                                                  deletedItem: itemLabel,
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

                                              // 3. Actualizar estado local
                                              setEditableItems(newEdits);
                                              setSelectedDraft((prev: any) => {
                                                if (!prev) return null;
                                                return {
                                                  ...prev,
                                                  extracted_items: dbItems
                                                };
                                              });
                                              setDrafts(prev => prev.map(d => d.id === selectedDraft.id ? { ...d, extracted_items: dbItems } : d));

                                              alert('Novedad notificada al cliente por correo y borrador actualizado. ✉️');
                                            } catch (err: any) {
                                              console.error('Error notifying deleted item:', err);
                                              alert(`Error al notificar al cliente: ${err.message || 'Error de conexión'}`);
                                            } finally {
                                              setSaving(false);
                                            }
                                          }
                                        });
                                      }}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#EF4444',
                                        cursor: 'pointer',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'background-color 0.2s'
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FEE2E2'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                      title="Eliminar producto"
                                    >
                                      <X size={16} strokeWidth={2.5} />
                                    </button>
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
                
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-start' }}>
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
                </div>
              </div>

              {/* Cuerpo del correo oculto en un acordeón al final */}
              <details style={{ backgroundColor: '#F3F4F6', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', border: '1px solid #E5E7EB' }}>
                <summary style={{ fontWeight: 700, color: '#4B5563', fontSize: '0.85rem', outline: 'none' }}>Ver texto original del correo enviado por el cliente</summary>
                <div style={{ padding: '1rem 0 0.5rem 0', fontSize: '0.85rem', color: '#6B7280', whiteSpace: 'pre-wrap', cursor: 'text' }}>
                  {selectedDraft.email_body || '(Sin cuerpo)'}
                </div>
              </details>

            </div>

            {/* Modal Footer */}
            {(() => {
              const meta = getDraftMetadata(selectedDraft);
              const isB2c = meta.clientType === 'b2c_client';
              const isNewClient = checkIsNewClient(selectedDraft);
              const hasCoords = draftCoordinates !== null;
              const isCovered = hasCoords ? checkIfInCoverage(draftCoordinates.lat, draftCoordinates.lng) : false;

              // If it's a new client AND we have coordinates AND it's OUT of coverage
              if (isNewClient && hasCoords && !isCovered) {
                return (
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
                    {/* Left Side: Coverage Status */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#9CA3AF', letterSpacing: '0.05em' }}>ESTADO DE COBERTURA</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#DC2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <X size={16} strokeWidth={3} /> Fuera de Zona de Cobertura
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: '600' }}>
                          ({draftCoordinates.lat.toFixed(5)}, {draftCoordinates.lng.toFixed(5)})
                        </span>
                      </div>
                    </div>

                    {/* Right Side: Decision Buttons */}
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button 
                        onClick={handleRejectForCoverage}
                        disabled={saving}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '0.65rem 1.25rem',
                          backgroundColor: '#FAF5F5',
                          border: '1px solid #FECACA',
                          borderRadius: '24px',
                          color: '#DC2626',
                          fontWeight: '700',
                          cursor: saving ? 'not-allowed' : 'pointer',
                          fontSize: '0.85rem',
                          transition: 'background-color 0.15s',
                          opacity: saving ? 0.7 : 1
                        }}
                        onMouseEnter={e => { if(!saving) { e.currentTarget.style.backgroundColor = '#FEE2E2'; } }}
                        onMouseLeave={e => { if(!saving) { e.currentTarget.style.backgroundColor = '#FAF5F5'; } }}
                      >
                        <X size={16} strokeWidth={3} /> Rechazar Dirección
                      </button>
                      
                      <div style={{ marginLeft: '1rem', marginRight: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6B7280', letterSpacing: '0.05em' }}>TOTAL ESTIMADO</span>
                        <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#059669' }}>{formatMoney(totalValue)}</span>
                      </div>

                      <button 
                        onClick={handleApprove}
                        disabled={saving}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '0.65rem 1.25rem',
                          backgroundColor: '#F59E0B',
                          border: 'none',
                          borderRadius: '24px',
                          color: 'white',
                          fontWeight: '800',
                          cursor: saving ? 'not-allowed' : 'pointer',
                          fontSize: '0.85rem',
                          transition: 'all 0.15s',
                          opacity: saving ? 0.7 : 1,
                          boxShadow: '0 4px 6px -1px rgba(245, 158, 11, 0.2)'
                        }}
                        onMouseEnter={e => { if(!saving) { e.currentTarget.style.backgroundColor = '#D97706'; } }}
                        onMouseLeave={e => { if(!saving) { e.currentTarget.style.backgroundColor = '#F59E0B'; } }}
                      >
                        <AlertTriangle size={16} /> Autorizar Excepción
                      </button>
                    </div>
                  </div>
                );
              }

              // Otherwise, render the standard footer but include coverage status if coordinates are available or loading
              return (
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
                  {/* Left Side: Coverage status (only if new client) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                    {isNewClient && (
                      <>
                        <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#9CA3AF', letterSpacing: '0.05em' }}>ESTADO DE COBERTURA</span>
                        {geocoding ? (
                          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#D97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            🔍 Validando cobertura...
                          </span>
                        ) : hasCoords && isCovered ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Check size={16} strokeWidth={3} /> En Zona de Cobertura
                            </span>
                            <span style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: '500' }}>
                              ({draftCoordinates!.lat.toFixed(5)}, {draftCoordinates!.lng.toFixed(5)})
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.85rem', color: '#6B7280', fontWeight: '600' }}>
                            ⚠️ Sin dirección o coordenadas detectadas
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Right Side: Standard Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ marginRight: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6B7280', letterSpacing: '0.05em' }}>TOTAL ESTIMADO</span>
                      <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#059669' }}>{formatMoney(totalValue)}</span>
                    </div>

                    <button 
                      onClick={() => setSelectedDraft(null)}
                      style={{ padding: '0.75rem 1.5rem', backgroundColor: 'white', border: `1px solid ${THEME.colors.border}`, borderRadius: '10px', fontWeight: 600, color: '#4B5563', cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleApprove}
                      disabled={saving}
                      style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: THEME.colors.primary,
                        color: 'white',
                        borderRadius: '10px',
                        fontWeight: '700',
                        border: 'none',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.7 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      {saving ? 'Procesando...' : 'Aprobar y Procesar Pedido'} <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              );
            })()}
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
                onClick={async () => {
                  await deleteConfirm.onConfirm();
                  setDeleteConfirm(null);
                }}
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
                {saving ? 'Enviando...' : 'Eliminar'}
              </button>
            </div>
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
    </div>
  );
}
