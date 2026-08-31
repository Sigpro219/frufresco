'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import { 
    Mail, ArrowRight, Trash2, RotateCcw, MapPin, Phone, Hash, X, Check, Calendar, Search, 
    ChevronDown, Info, List, Grid, AlertTriangle, MessageSquare, UploadCloud, Home, Building2, 
    Globe, Edit2, FileText, Send, Keyboard, Eraser, Paperclip, Download, Loader2, Maximize2, 
    Minimize2, Scale, Zap, ShieldAlert, CheckCircle2, AlertCircle, Sparkles, Pin, Tag, 
    Settings, Plus, Package, Filter, User, ExternalLink, Clock, ShoppingCart,
    ZoomIn, ZoomOut, RotateCw, RefreshCw 
} from 'lucide-react';
import { Map as GoogleMapComponent, Marker } from '@vis.gl/react-google-maps';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import VariantModal from './VariantModal';
import PdfCanvasViewer from './PdfCanvasViewer';

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

const getDeliverySlotFromLogistics = (logisticsData: any): string | null => {
  if (!logisticsData) return null;
  const startTime = logisticsData.start_time;
  const endTime = logisticsData.end_time;
  
  if (!startTime && !endTime) return null;
  
  const parseTimeToDecimal = (timeStr: string) => {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    return hours + minutes / 60;
  };

  const startDecimal = parseTimeToDecimal(startTime);
  const endDecimal = parseTimeToDecimal(endTime);

  if (endDecimal !== null && endDecimal <= 12.5) {
    return 'AM';
  }
  if (startDecimal !== null && startDecimal >= 12.0) {
    return 'PM';
  }
  return 'Cualquier hora';
};

const formatLogisticsTime = (timeStr: string): string => {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  let hours = parseInt(parts[0], 10) || 0;
  const minutes = parts[1] || '00';
  const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minStr = minutes.substring(0, 2);
  return `${hours.toString().padStart(2, '0')}:${minStr} ${ampm}`;
};

const formatDeliverySlot = (slot: string): string => {
  if (!slot) return '--:-- --';
  if (slot === 'AM') return 'Mañana (AM)';
  if (slot === 'PM') return 'Tarde (PM)';
  if (slot === 'Cualquier hora') return 'Cualquier hora';
  if (slot.includes(':')) return formatLogisticsTime(slot);
  return slot;
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

const getNextAllowedDeliveryDate = (baseDateStr: string, allowedDays: number[]): string => {
  if (!allowedDays || allowedDays.length === 0) return baseDateStr;
  
  const jDays = allowedDays.map(d => d === 7 ? 0 : d);
  
  let date = new Date(baseDateStr + 'T12:00:00');
  if (isNaN(date.getTime())) {
    date = new Date();
  }
  
  for (let k = 0; k < 7; k++) {
    const currentDay = date.getDay();
    if (jDays.includes(currentDay)) {
      return date.toISOString().split('T')[0];
    }
    date.setDate(date.getDate() + 1);
  }
  return baseDateStr;
};

const getAccountingIdDisplay = (product: any) => {
    if (!product) return '';
    if (product.accounting_id) {
        if (typeof product.accounting_id === 'number') {
            return product.accounting_id.toString();
        }
        const match = String(product.accounting_id).match(/\d+/);
        if (match) {
            return parseInt(match[0], 10).toString();
        }
        return String(product.accounting_id);
    }
    if (product.sku) {
        const skuMatch = product.sku.match(/^[A-Z]{2}-(\d+)/i);
        if (skuMatch) {
            return parseInt(skuMatch[1], 10).toString();
        }
    }
    return product.id || '';
};

const formatDetectedUnit = (qty: number, unit: string) => {
    const u = (unit || '').toLowerCase();
    let cleanUnit = u;
    let suffix = qty === 1 ? 'detectado' : 'detectados';
    
    if (u.includes('libra') || u.includes('lb')) {
        cleanUnit = qty === 1 ? 'libra' : 'libras';
        suffix = qty === 1 ? 'detectada' : 'detectadas';
    } else if (u.includes('unidad') || u.includes('und') || u.includes('ud') || u.includes('un')) {
        cleanUnit = qty === 1 ? 'unidad' : 'unidades';
        suffix = qty === 1 ? 'detectada' : 'detectadas';
    } else if (u.includes('kilo') || u.includes('kg')) {
        cleanUnit = qty === 1 ? 'kilo' : 'kilos';
        suffix = qty === 1 ? 'detectado' : 'detectados';
    } else if (u.includes('paquete') || u.includes('paq') || u.includes('pq')) {
        cleanUnit = qty === 1 ? 'paquete' : 'paquetes';
        suffix = qty === 1 ? 'detectado' : 'detectados';
    } else if (u.includes('litro') || u.includes('lt')) {
        cleanUnit = qty === 1 ? 'litro' : 'litros';
        suffix = qty === 1 ? 'detectado' : 'detectados';
    } else if (u.includes('frasco')) {
        cleanUnit = qty === 1 ? 'frasco' : 'frascos';
        suffix = qty === 1 ? 'detectado' : 'detectados';
    } else if (u.includes('bolsa')) {
        cleanUnit = qty === 1 ? 'bolsa' : 'bolsas';
        suffix = qty === 1 ? 'detectada' : 'detectadas';
    } else if (u.includes('caja')) {
        cleanUnit = qty === 1 ? 'caja' : 'cajas';
        suffix = qty === 1 ? 'detectada' : 'detectadas';
    } else if (u.includes('atado')) {
        cleanUnit = qty === 1 ? 'atado' : 'atados';
        suffix = qty === 1 ? 'detectado' : 'detectados';
    } else {
        cleanUnit = qty === 1 ? 'unidad' : 'unidades';
        suffix = qty === 1 ? 'detectada' : 'detectadas';
    }
    
    return `${qty} ${cleanUnit} ${suffix}`;
};

const detectUnitFromName = (originalName: string, product: any, productConversions: any[]) => {
    const cleanName = originalName.toLowerCase();
    
    // 1. Obtener todas las unidades posibles para este producto
    const possibleUnits: { unit: string; factor: number }[] = [];
    
    if (product.web_unit && product.web_conversion_factor) {
        possibleUnits.push({
            unit: product.web_unit,
            factor: parseFloat(product.web_conversion_factor) || 1
        });
    }
    
    if (product.unit_of_measure) {
        possibleUnits.push({
            unit: product.unit_of_measure,
            factor: 1
        });
    }
    
    productConversions.forEach(c => {
        if (!possibleUnits.some(u => u.unit.toLowerCase() === c.from_unit.toLowerCase())) {
            possibleUnits.push({
                unit: c.from_unit,
                factor: parseFloat(c.conversion_factor) || 1
            });
        }
    });
    
    // También agregar variantes del options_config
    if (product.options_config) {
        product.options_config.forEach((opt: any) => {
            if (opt.name.toLowerCase().includes('presentaci')) {
                opt.values?.forEach((val: string) => {
                    const cleanUnit = val.includes('|') ? val.split('|')[0] : val;
                    if (!possibleUnits.some(u => u.unit.toLowerCase() === cleanUnit.toLowerCase())) {
                        let factor = 1;
                        const defaultUnit = product.web_unit || product.unit_of_measure;
                        if (cleanUnit.toLowerCase() === defaultUnit.toLowerCase()) {
                            factor = parseFloat(product.web_conversion_factor) || 1;
                        } else {
                            // Intentar calcular factor dinámico usando parseWeight
                            if (val.includes('|')) {
                                const grams = parseFloat(val.split('|')[1]);
                                if (!isNaN(grams) && grams > 0) factor = grams / 1000;
                            } else {
                                const clean = cleanUnit.toLowerCase();
                                const kgMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilos)/);
                                if (kgMatch) factor = parseFloat(kgMatch[1]);
                                const gMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:g|gr|grs|gramos|grams|gramo|gram)/);
                                if (gMatch) factor = parseFloat(gMatch[1]) / 1000;
                                if (clean.includes('libra') || clean.includes('lb')) factor = 0.5;
                            }
                        }
                        possibleUnits.push({ unit: cleanUnit, factor });
                    }
                });
            }
        });
    }
    
    // 2. Buscar en originalName qué unidad coincide mejor
    for (const u of possibleUnits) {
        const unitLower = u.unit.toLowerCase();
        if (unitLower.length > 2) {
            if (cleanName.includes(unitLower)) {
                return u;
            }
        }
    }
    
    if (cleanName.includes('libra') || cleanName.includes('lb')) {
        const lbUnit = possibleUnits.find(u => u.unit.toLowerCase().includes('libra') || u.unit.toLowerCase().includes('lb'));
        if (lbUnit) return lbUnit;
    }
    if (cleanName.includes('kilo') || cleanName.includes('kg')) {
        const kgUnit = possibleUnits.find(u => u.unit.toLowerCase().includes('kilo') || u.unit.toLowerCase().includes('kg'));
        if (kgUnit) return kgUnit;
    }
    if (cleanName.includes('unidad') || cleanName.includes('ud') || cleanName.includes('und')) {
        const undUnit = possibleUnits.find(u => u.unit.toLowerCase().includes('unidad') || u.unit.toLowerCase().includes('und') || u.unit.toLowerCase().includes('ud'));
        if (undUnit) return undUnit;
    }
    
    return null;
};

const cleanSubject = (subject?: string | null): string => {
  if (!subject) return '-';
  // Strip technical prefix tags like [RAW_WEBHOOK], [EML-0A7C0D], [TAG], etc.
  const cleaned = subject.replace(/^(\[[^\]]+\]\s*)+/gi, '').trim();
  return cleaned || subject;
};

const ProductsDatalist = React.memo(({ products }: { products: any[] }) => {
  return (
    <datalist id="all-products-list">
      {products.map(p => (
        <option key={p.id} value={`${p.name} (${getAccountingIdDisplay(p)})`} />
      ))}
    </datalist>
  );
});
ProductsDatalist.displayName = 'ProductsDatalist';

const ImageZoomViewer = ({ src, alt }: { src: string; alt: string }) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = () => setScale(prev => Math.min(Number((prev + 0.25).toFixed(2)), 4));
  const handleZoomOut = () => setScale(prev => Math.max(Number((prev - 0.25).toFixed(2)), 0.5));
  const handleReset = () => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1 || isFullscreen) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    if (e.deltaY < 0) {
      setScale(prev => Math.min(Number((prev + 0.15).toFixed(2)), 4));
    } else {
      setScale(prev => Math.max(Number((prev - 0.15).toFixed(2)), 0.5));
    }
  };

  return (
    <div 
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : undefined,
        left: isFullscreen ? 0 : undefined,
        width: isFullscreen ? '100vw' : '100%',
        height: isFullscreen ? '100vh' : '100%',
        zIndex: isFullscreen ? 99999 : 1,
        backgroundColor: '#0F172A',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        borderRadius: isFullscreen ? '0' : '8px',
        userSelect: 'none'
      }}
    >
      {/* Floating Interactive Toolbar */}
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          backgroundColor: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          borderRadius: '30px',
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          color: 'white'
        }}
      >
        <button
          type="button"
          onClick={handleZoomOut}
          title="Alejar (-)"
          style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '6px' }}
        >
          <ZoomOut size={16} />
        </button>

        <span 
          onClick={handleReset}
          title="Click para restablecer al 100%"
          style={{ fontSize: '0.76rem', fontWeight: '800', color: '#38BDF8', minWidth: '44px', textAlign: 'center', cursor: 'pointer' }}
        >
          {Math.round(scale * 100)}%
        </span>

        <button
          type="button"
          onClick={handleZoomIn}
          title="Acercar (+)"
          style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '6px' }}
        >
          <ZoomIn size={16} />
        </button>

        <div style={{ width: '1px', height: '14px', backgroundColor: 'rgba(255, 255, 255, 0.2)' }} />

        <button
          type="button"
          onClick={handleRotate}
          title="Girar 90°"
          style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '6px' }}
        >
          <RotateCw size={15} />
        </button>

        <button
          type="button"
          onClick={handleReset}
          title="Restablecer posición y zoom"
          style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '6px' }}
        >
          <RefreshCw size={13} />
        </button>

        <div style={{ width: '1px', height: '14px', backgroundColor: 'rgba(255, 255, 255, 0.2)' }} />

        <button
          type="button"
          onClick={() => setIsFullscreen(!isFullscreen)}
          title={isFullscreen ? "Cerrar Pantalla Completa" : "Ver en Pantalla Completa"}
          style={{ background: 'none', border: 'none', color: '#FCD34D', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '6px' }}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* Image with Dynamic Transforms */}
      <div
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
          transition: isDragging ? 'none' : 'transform 0.15s ease-out',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: '100%',
          maxHeight: '100%'
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            maxWidth: isFullscreen ? '90vw' : '100%',
            maxHeight: isFullscreen ? '90vh' : '100%',
            objectFit: 'contain',
            borderRadius: '6px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            pointerEvents: 'none'
          }}
        />
      </div>

      {/* Instructions footer */}
      <div style={{ position: 'absolute', bottom: '8px', right: '12px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }}>
        Rueda: Zoom • Arrastrar: Mover
      </div>
    </div>
  );
};

const GmailMessageViewer = ({
  draft,
  metadata,
  onSwitchToAttachment
}: {
  draft: any;
  metadata: any;
  onSwitchToAttachment?: (index?: number) => void;
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const senderEmail = draft.source_email || 'desconocido';
  const clientName = draft.client_detected_name || 'Cliente';
  const subject = cleanSubject(draft.email_subject);
  const rawHtml = metadata?.emailHtml || draft?.extracted_items?.debug_payload?.html || null;
  const rawPlain = draft?.email_body || draft?.extracted_items?.debug_payload?.plain || null;
  const attachments = metadata?.attachments || [];

  // Generate avatar initial and color
  const initial = (clientName || senderEmail || 'U').charAt(0).toUpperCase();
  const avatarColors = ['#EA4335', '#FBBC05', '#34A853', '#4285F4', '#9333EA', '#0D9488', '#E11D48'];
  const charCode = (clientName || 'U').charCodeAt(0);
  const avatarBg = avatarColors[charCode % avatarColors.length];

  // Resolve CID inline images in HTML
  const resolvedHtml = (() => {
    if (!rawHtml) return null;
    let html = rawHtml;
    if (attachments.length > 0) {
      attachments.forEach((att: any) => {
        const name = att.name || att.file_name || att.filename;
        if (name && att.url) {
          const cleanName = name.replace(/[^a-zA-Z0-9.-]/g, '');
          html = html.replace(new RegExp(`src=["']cid:[^"']*${cleanName}[^"']*["']`, 'gi'), `src="${att.url}"`);
          html = html.replace(new RegExp(`src=["']cid:${name}["']`, 'gi'), `src="${att.url}"`);
        }
      });
    }
    return html;
  })();

  const dateStr = draft.created_at ? new Date(draft.created_at).toLocaleString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) : '';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#FFFFFF', overflow: 'hidden', height: '100%' }}>
      {/* Gmail Top Subject Bar */}
      <div style={{ padding: '14px 20px 10px 20px', borderBottom: '1px solid #F1F5F9', backgroundColor: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {subject}
          </h2>
          <span style={{ backgroundColor: '#E2E8F0', color: '#475569', padding: '1px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700 }}>
            Recibidos
          </span>
        </div>
      </div>

      {/* Gmail Sender Header Row */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #F1F5F9', backgroundColor: '#FAFAFA' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            {/* Avatar Circle */}
            <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: avatarBg, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1rem', flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              {initial}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0F172A' }}>
                  {clientName}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  &lt;{senderEmail}&gt;
                </span>
              </div>

              <div 
                onClick={() => setShowDetails(!showDetails)}
                style={{ fontSize: '0.72rem', color: '#64748B', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '2px' }}
              >
                <span>para mi</span>
                <ChevronDown size={12} style={{ transform: showDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </div>

              {/* Collapsible Email Details Card */}
              {showDetails && (
                <div style={{ marginTop: '8px', padding: '10px 14px', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '0.75rem', color: '#334155', lineHeight: '1.6', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                  <div><strong>De:</strong> {clientName} &lt;{senderEmail}&gt;</div>
                  <div><strong>Para:</strong> pedidos@frufresco.com</div>
                  <div><strong>Fecha:</strong> {dateStr}</div>
                  <div><strong>Asunto:</strong> {draft.email_subject}</div>
                </div>
              )}
            </div>
          </div>

          {/* Date Stamp */}
          <div style={{ fontSize: '0.75rem', color: '#64748B', whiteSpace: 'nowrap', fontWeight: 600 }}>
            {dateStr}
          </div>
        </div>
      </div>

      {/* Gmail Message Body Area */}
      <div className="premium-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', backgroundColor: '#FFFFFF' }}>
        {resolvedHtml ? (
          <div style={{ width: '100%', minHeight: '260px' }}>
            <iframe
              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#202124;line-height:1.6;margin:0;padding:8px;}table{border-collapse:collapse;}img{max-width:100%;height:auto;border-radius:6px;}</style></head><body>${resolvedHtml}</body></html>`}
              style={{ width: '100%', minHeight: '380px', border: 'none', backgroundColor: 'transparent' }}
              sandbox="allow-same-origin allow-popups"
            />
          </div>
        ) : rawPlain ? (
          <div style={{ fontSize: '0.86rem', color: '#1E293B', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
            {rawPlain}
          </div>
        ) : (
          <div style={{ padding: '30px', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
            (Sin contenido en el cuerpo del correo)
          </div>
        )}

        {/* Gmail Attachment Chips Strip */}
        {attachments.length > 0 && (
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#475569', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Paperclip size={14} color="#64748B" />
              <span>{attachments.length} archivo{attachments.length > 1 ? 's' : ''} adjunto{attachments.length > 1 ? 's' : ''}</span>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {attachments.map((att: any, attIdx: number) => {
                const name = att.name || att.file_name || att.filename || `Adjunto_${attIdx + 1}`;
                const lowerName = name.toLowerCase();
                const isImg = lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.webp');
                const isPdf = lowerName.endsWith('.pdf');
                const isXls = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');

                return (
                  <div
                    key={attIdx}
                    onClick={() => onSwitchToAttachment && onSwitchToAttachment(attIdx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      maxWidth: '260px'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.backgroundColor = '#EFF6FF'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                    title={`Ver adjunto: ${name}`}
                  >
                    {isImg ? (
                      <span style={{ color: '#059669', display: 'flex', alignItems: 'center' }}><FileText size={18} /></span>
                    ) : isPdf ? (
                      <span style={{ color: '#DC2626', display: 'flex', alignItems: 'center' }}><FileText size={18} /></span>
                    ) : isXls ? (
                      <span style={{ color: '#16A34A', display: 'flex', alignItems: 'center' }}><FileText size={18} /></span>
                    ) : (
                      <span style={{ color: '#64748B', display: 'flex', alignItems: 'center' }}><Paperclip size={18} /></span>
                    )}

                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#2563EB', fontWeight: 600 }}>
                        Click para ver en Visor
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface EmailDraftsModuleProps {
  onDraftsChange?: (count: number) => void;
}

export default function EmailDraftsModule({ onDraftsChange }: EmailDraftsModuleProps = {}) {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [conversions, setConversions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState<any>(null);
  const [draftCoordinates, setDraftCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const matchCacheRef = useRef<Record<string, any>>({});

  const [showMapModal, setShowMapModal] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [aliases, setAliases] = useState<Record<string, string>>({});

  useEffect(() => {
    matchCacheRef.current = {};
  }, [products, aliases]);
  const [editableItems, setEditableItems] = useState<any[]>([]);
  const [recentlyDeletedItems, setRecentlyDeletedItems] = useState<string[]>([]);
  const [duplicateMatchConfirm, setDuplicateMatchConfirm] = useState<{
    isOpen: boolean;
    product: any;
    rowIndex: number;
    duplicateIndex: number;
  } | null>(null);
  const [showFloatingEmail, setShowFloatingEmail] = useState(true);
  const [activeTab, setActiveTab] = useState<'email' | 'attachment'>('email');
  const [attachmentHtml, setAttachmentHtml] = useState<string | null>(null);
  const [excelSheetsData, setExcelSheetsData] = useState<any[]>([]);
  const [selectedExcelSheetIndex, setSelectedExcelSheetIndex] = useState<number>(0);
  const [excelFilterOnlyWithQty, setExcelFilterOnlyWithQty] = useState<boolean>(false);
  const [excelSearchTerm, setExcelSearchTerm] = useState<string>('');
  const [excelZoomLevel, setExcelZoomLevel] = useState<number>(100);
  const [loadingAttachment, setLoadingAttachment] = useState(false);
  const [isReparsingDraft, setIsReparsingDraft] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isAttachmentZoomed, setIsAttachmentZoomed] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  const [selectedAttachmentIndex, setSelectedAttachmentIndex] = useState<number>(0);
  const [variantConfigProduct, setVariantConfigProduct] = useState<any | null>(null);
  const [manageConversionsProduct, setManageConversionsProduct] = useState<any | null>(null);

  // Client Pareto & Selection States
  const [clientExceptions, setClientExceptions] = useState<any[]>([]);
  const [clientFrequentProductMap, setClientFrequentProductMap] = useState<Record<string, { count: number; totalQty: number; nickname?: string }>>({});
  const [clientFrequentProductIds, setClientFrequentProductIds] = useState<string[]>([]);
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
  const [isClientDetailsExpanded, setIsClientDetailsExpanded] = useState(false);

  // Custom Floating SKU Dropdown States
  const [activeDropdownRowIndex, setActiveDropdownRowIndex] = useState<number | null>(null);
  const [focusedDropdownItemIndex, setFocusedDropdownItemIndex] = useState<number>(0);

  // Product Customization Modal State (Image 1 replica)
  const [customizingModalItem, setCustomizingModalItem] = useState<{
    rowIndex: number;
    product: any;
    originalText: string;
    originalQuantity: number;
    originalUnit: string;
    options: Record<string, string>;
    quantity: string;
    unit: string;
    factor: number;
  } | null>(null);

  const [isFloatingExpanded, setIsFloatingExpanded] = useState(false);

  useEffect(() => {
    setActiveTab('email');
    setAttachmentHtml(null);
    setExcelSheetsData([]);
    setSelectedExcelSheetIndex(0);
    setExcelFilterOnlyWithQty(false);
    setExcelSearchTerm('');
    setExcelZoomLevel(100);
    setAttachmentError(null);
    setPdfBlobUrl(null);
    setIsFloatingExpanded(false);
    
    let defaultIndex = 0;
    if (selectedDraft) {
      const metadata = getDraftMetadata(selectedDraft);
      if (metadata.attachments && Array.isArray(metadata.attachments)) {
        const firstWithItems = metadata.attachments.findIndex((att: any) => att.items && Array.isArray(att.items) && att.items.length > 0 && att.processed !== true);
        if (firstWithItems !== -1) {
          defaultIndex = firstWithItems;
        } else {
          const firstUnprocessed = metadata.attachments.findIndex((att: any) => att.processed !== true);
          if (firstUnprocessed !== -1) {
            defaultIndex = firstUnprocessed;
          }
        }
      }
    }
    
    setSelectedAttachmentIndex(defaultIndex);
    setIsAttachmentZoomed(false);
  }, [selectedDraft?.id]);

  useEffect(() => {
    setIsAttachmentZoomed(false);
  }, [selectedAttachmentIndex]);

  useEffect(() => {
    if (!selectedDraft || activeTab !== 'attachment') return;
    const metadata = getDraftMetadata(selectedDraft);
    
    // Choose correct attachment URL and Name based on selectedAttachmentIndex
    let currentUrl = metadata.attachmentUrl;
    let currentName = metadata.attachmentName;
    if (metadata.attachments && Array.isArray(metadata.attachments) && metadata.attachments.length > 0) {
      const selectedAtt = metadata.attachments[selectedAttachmentIndex];
      if (selectedAtt) {
        currentUrl = selectedAtt.url;
        currentName = selectedAtt.name;
      }
    }
    
    if (!currentUrl) return;
    
    const attachmentName = currentName || '';
    const ext = attachmentName.split('.').pop()?.toLowerCase() || '';
    
    let activeBlobUrl: string | null = null;

    if (ext === 'xlsx' || ext === 'xls') {
      setLoadingAttachment(true);
      setAttachmentError(null);
      setAttachmentHtml(null);
      setExcelSheetsData([]);
      
      fetch(currentUrl)
        .then(res => {
          if (!res.ok) throw new Error("No se pudo descargar el archivo Excel.");
          return res.arrayBuffer();
        })
        .then(buffer => {
          const workbook = XLSX.read(buffer, { type: 'array' });
          const parsedSheets: any[] = [];
          
          workbook.SheetNames.forEach((sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
            const validRows = rawData.filter(row => row && row.length > 0 && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''));
            
            if (validRows.length === 0) return;

            // Find header row (row containing PLU, PRODUCTO, PRODCUTO, DESCRIPCION, CANT, CAN, etc.)
            let headerRowIdx = 0;
            for (let r = 0; r < Math.min(15, validRows.length); r++) {
              const rowStr = validRows[r].map(c => String(c || '').toLowerCase()).join(' ');
              if ((rowStr.includes('prod') || rowStr.includes('descrip') || rowStr.includes('item') || rowStr.includes('articulo')) && 
                  (rowStr.includes('can') || rowStr.includes('cant') || rowStr.includes('ubm') || rowStr.includes('plu') || rowStr.includes('unid'))) {
                headerRowIdx = r;
                break;
              }
            }

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

            let qtyCol = -1;
            let nameCol = -1;
            let unitCol = -1;
            let pluCol = -1;
            const headerRow = validRows[headerRowIdx] || [];
            headerRow.forEach((cellVal: any, colIdx: number) => {
              const s = String(cellVal || '').toLowerCase().trim();
              if (s === 'ca' || s === 'can' || s === 'cant' || s.includes('cantid') || s.includes('cantidad') || s === 'qty' || s === 'pedido') {
                qtyCol = colIdx;
              } else if (s.includes('prod') || s.includes('descrip') || s.includes('nombre') || s.includes('articulo')) {
                nameCol = colIdx;
              } else if (s === 'ubm' || s.includes('unidad') || s === 'und' || s === 'u.m') {
                unitCol = colIdx;
              } else if (s.includes('plu') || s.includes('codigo') || s.includes('cod') || s === 'id') {
                pluCol = colIdx;
              }
            });

            const parsedRows = validRows.map((row, rIdx) => {
              const isHeader = rIdx === headerRowIdx;
              const isMeta = rIdx < headerRowIdx;
              
              let qtyNum: number | null = null;
              let rawQty = '';
              if (!isHeader && !isMeta && qtyCol !== -1 && row[qtyCol] !== undefined && row[qtyCol] !== null) {
                rawQty = String(row[qtyCol]).trim();
                const cleaned = rawQty.replace(',', '.').replace(/[^0-9.]/g, '');
                const parsed = parseFloat(cleaned);
                if (!isNaN(parsed) && parsed > 0 && rawQty !== '') {
                  qtyNum = parsed;
                }
              }

              const rowName = nameCol !== -1 ? String(row[nameCol] || '').trim() : '';
              const rowUnit = unitCol !== -1 ? String(row[unitCol] || '').trim() : 'Kg';
              const rowPlu = pluCol !== -1 ? String(row[pluCol] || '').trim() : '';

              return {
                rowIndex: rIdx + 1,
                isHeader,
                isMeta,
                hasQty: qtyNum !== null && qtyNum > 0,
                qtyVal: qtyNum,
                nameVal: rowName,
                unitVal: rowUnit,
                pluVal: rowPlu,
                cells: activeCols.map(c => {
                  const v = row[c];
                  return v !== null && v !== undefined ? String(v).trim() : '';
                })
              };
            });

            const countWithQty = parsedRows.filter(r => r.hasQty).length;

            parsedSheets.push({
              sheetName,
              activeCols,
              headerRowIdx,
              qtyCol,
              nameCol,
              unitCol,
              pluCol,
              countWithQty,
              totalRows: parsedRows.filter(r => !r.isHeader && !r.isMeta).length,
              rows: parsedRows
            });
          });

          setExcelSheetsData(parsedSheets);
          setAttachmentHtml(parsedSheets.length > 0 ? 'parsed' : null);
        })
        .catch(err => {
          console.error("Error loading attachment:", err);
          setAttachmentError(err.message || "Error al procesar el archivo Excel.");
        })
        .finally(() => {
          setLoadingAttachment(false);
        });
    } else if (ext === 'pdf') {
      setLoadingAttachment(true);
      setAttachmentError(null);
      setPdfBlobUrl(null);
      
      fetch(currentUrl)
        .then(res => {
          if (!res.ok) throw new Error("No se pudo descargar el archivo PDF.");
          return res.arrayBuffer();
        })
        .then(buffer => {
          const uint8 = new Uint8Array(buffer);
          let binary = "";
          const len = uint8.length;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          
          // Replace auto-print actions 1-to-1 to keep PDF offsets intact
          binary = binary.replace(/\/S\s*\/Named\s*\/N\s*\/Print/g, '/S /Named /N /P_int');
          binary = binary.replace(/\/S\s*\/JavaScript\s*\/JS\s*\(([^)]*this\.print[^)]*)\)/gi, (match) => {
            return match.replace(/this\.print/g, 'this.p_int');
          });
          binary = binary.replace(/this\.print\s*\(/g, 'this.p_int(');
          binary = binary.replace(/\/Print\b/g, '/P_int');
          
          const newUint8 = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            newUint8[i] = binary.charCodeAt(i);
          }
          
          const blob = new Blob([newUint8], { type: 'application/pdf' });
          const blobUrl = URL.createObjectURL(blob);
          activeBlobUrl = blobUrl;
          setPdfBlobUrl(blobUrl);
          setLoadingAttachment(false);
        })
        .catch(err => {
          console.error("Error loading PDF:", err);
          // Fallback to direct URL (ensures PDF remains visible even if fetch fails due to CORS)
          setPdfBlobUrl(currentUrl);
          setLoadingAttachment(false);
        });
    }

    return () => {
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
      }
    };
  }, [selectedDraft, activeTab, selectedAttachmentIndex]);

  const handleSelectAttachment = (idx: number) => {
    if (!selectedDraft) return;
    
    // Save current changes to the previous index
    const metadata = getDraftMetadata(selectedDraft);
    if (metadata.attachments && Array.isArray(metadata.attachments)) {
      const updatedAttachments = [...metadata.attachments];
      if (updatedAttachments[selectedAttachmentIndex]) {
        updatedAttachments[selectedAttachmentIndex] = {
          ...updatedAttachments[selectedAttachmentIndex],
          deliveryDate: deliveryDate,
          deliverySlot: editableDeliverySlot,
          items: editableItems.map(itm => ({
            name: itm.name || itm.originalName,
            originalName: itm.originalName,
            quantity: itm.quantity,
            unit: itm.unit,
            matched_product_id: itm.matched_product_id,
            observations: itm.observations,
            selected_options: itm.selected_options,
            isDeleted: itm.isDeleted
          }))
        };
      }
      
      const updatedExtractedItems = selectedDraft.extracted_items.map((itm: any) => {
        if (itm.isMetadata) {
          return {
            ...itm,
            attachments: updatedAttachments
          };
        }
        return itm;
      });
      
      // Update local state without hitting DB yet (we will persist when they approve the order)
      setSelectedDraft((prev: any) => ({
        ...prev,
        extracted_items: updatedExtractedItems
      }));
      setDrafts(prev => prev.map(d => d.id === selectedDraft.id ? { ...d, extracted_items: updatedExtractedItems } : d));
    }
    
    // Switch to new attachment index
    setSelectedAttachmentIndex(idx);
  };

  const handleSplitAttachmentByDate = () => {
    if (!selectedDraft) return;
    const metadata = getDraftMetadata(selectedDraft);
    const meta = selectedDraft.extracted_items?.find((i: any) => i.isMetadata) || {};
    
    // Get currently loaded items in editableItems (which includes user edits)
    const activeItems = editableItems.filter(itm => !itm.isDeleted);
    
    // Group activeItems by item.deliveryDate (fall back to the global deliveryDate)
    const groups: Record<string, any[]> = {};
    for (const item of activeItems) {
      const itemDate = item.deliveryDate || deliveryDate;
      if (!groups[itemDate]) {
        groups[itemDate] = [];
      }
      groups[itemDate].push(item);
    }
    
    const uniqueDates = Object.keys(groups);
    if (uniqueDates.length <= 1) {
      showToast('No se encontraron múltiples fechas de entrega distintas entre los productos para dividir.', 'info');
      return;
    }
    
    // We will build a list of virtual attachments
    let currentUrl = metadata.attachmentUrl;
    let currentName = metadata.attachmentName || 'documento.pdf';
    if (metadata.attachments && Array.isArray(metadata.attachments) && metadata.attachments.length > 0) {
      const selectedAtt = metadata.attachments[selectedAttachmentIndex];
      if (selectedAtt) {
        currentUrl = selectedAtt.url;
        currentName = selectedAtt.name;
      }
    }
    
    const nameWithoutExt = currentName.replace(/\.[^/.]+$/, "");
    const ext = currentName.split('.').pop()?.toLowerCase() || 'pdf';
    
    const newVirtualAttachments = uniqueDates.map((groupDate) => {
      const groupItems = groups[groupDate];
      return {
        name: `${nameWithoutExt} [${groupDate}].${ext}`,
        url: currentUrl,
        processed: false,
        orderId: null,
        deliveryDate: groupDate,
        deliverySlot: editableDeliverySlot || metadata.deliverySlot || 'AM',
        clientInDocument: selectedDraft.client_detected_name || meta.clientInDocument || null,
        documentType: meta.documentType || 'PDF',
        address: editableAddress || metadata.address,
        phone: editableClientPhone || metadata.phone,
        nit: editableClientNit || metadata.nit,
        clientType: editableClientType || metadata.clientType,
        items: groupItems.map(itm => ({
          originalName: itm.originalName || itm.name,
          quantity: itm.quantity,
          unit: itm.unit,
          observations: itm.observations,
          deliveryDate: groupDate
        }))
      };
    });
    
    // We will replace the attachments list in metadata with this new list of virtual attachments
    const updatedExtractedItems = selectedDraft.extracted_items.map((itm: any) => {
      if (itm.isMetadata) {
        return {
          ...itm,
          attachments: newVirtualAttachments
        };
      }
      return itm;
    });
    
    // Save to local state
    const localDraftUpdated = {
      ...selectedDraft,
      extracted_items: updatedExtractedItems
    };
    setSelectedDraft(localDraftUpdated);
    setDrafts(prev => prev.map(d => d.id === selectedDraft.id ? localDraftUpdated : d));
    
    // Reset selectedAttachmentIndex to the first new virtual attachment
    setSelectedAttachmentIndex(0);
    showToast(`¡Se dividió el documento en ${newVirtualAttachments.length} adjuntos virtuales según sus fechas de entrega!`, 'success');
  };

  const getMinDeliveryDate = () => {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const bogotaNow = new Date(utc + (3600000 * -5));
    const currentHour = bogotaNow.getHours();
    const daysToAdd = currentHour >= 17 ? 2 : 1;
    const result = new Date(bogotaNow);
    result.setDate(bogotaNow.getDate() + daysToAdd);
    return result.toISOString().split('T')[0];
  };
  const minDeliveryDate = getMinDeliveryDate();
  const lastDraftIdRef = useRef<string | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<string>(minDeliveryDate);
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
  const [profiles, setProfiles] = useState<any[]>([]);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [focusedClientSearchIndex, setFocusedClientSearchIndex] = useState<number>(-1);

  const parentMatrixIds = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach(c => {
      if (c.parent_id) set.add(c.parent_id);
    });
    return set;
  }, [profiles]);

  const matrixClientsMap = useMemo(() => {
    const map = new Map<string, any>();
    profiles.forEach(c => {
      map.set(c.id, c);
    });
    return map;
  }, [profiles]);

  const filteredClientProfiles = useMemo(() => {
    if (!clientSearchQuery || clientSearchQuery.trim().length < 2) {
      return profiles.filter(c => !parentMatrixIds.has(c.id)).slice(0, 15);
    }
    const query = clientSearchQuery.toLowerCase().trim();

    const matchedParentMatrixIds = new Set<string>();
    profiles.forEach(c => {
      if (parentMatrixIds.has(c.id)) {
        const nameMatch = (c.company_name?.toLowerCase() || '').includes(query);
        const nitMatch = (c.nit?.toString() || '').includes(query);
        if (nameMatch || nitMatch) matchedParentMatrixIds.add(c.id);
      }
    });

    const deliverableClients = profiles.filter(c => !parentMatrixIds.has(c.id));

    const groupA: any[] = [];
    const groupB: any[] = [];

    deliverableClients.forEach(c => {
      const isDirectMatch = (c.company_name?.toLowerCase() || '').includes(query) ||
                            (c.contact_name?.toLowerCase() || '').includes(query) ||
                            (c.nit?.toString() || '').includes(query) ||
                            (c.address?.toLowerCase() || '').includes(query) ||
                            (c.phone?.toString() || '').includes(query) ||
                            (c.contact_phone?.toString() || '').includes(query);

      if (c.parent_id && matchedParentMatrixIds.has(c.parent_id)) {
        groupA.push({ ...c, isDirectSearchedBranch: isDirectMatch });
      } else if (isDirectMatch) {
        groupB.push(c);
      }
    });

    return [...groupA, ...groupB].slice(0, 20);
  }, [profiles, clientSearchQuery, parentMatrixIds]);
  const productInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const quantityInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const firstModalSelectRef = useRef<HTMLSelectElement | null>(null);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [obsModal, setObsModal] = useState<{
    isOpen: boolean;
    rowIndex: number;
    text: string;
  } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [receiptSent, setReceiptSent] = useState(false);
  const [isManualDelivery, setIsManualDelivery] = useState(false);
  const [manualDeliveryTime, setManualDeliveryTime] = useState('');
  const [manualDeliveryMargin, setManualDeliveryMargin] = useState(30);
  const [showDeliveryTimeModal, setShowDeliveryTimeModal] = useState(false);
  const [tempDeliveryTime, setTempDeliveryTime] = useState('07:30');
  const [tempDeliveryMargin, setTempDeliveryMargin] = useState(30);

  const scrollToDraftRow = (targetIdx: number) => {
    const container = document.getElementById('email-draft-scroll-container');
    const row = document.getElementById(`draft-row-${targetIdx}`);
    if (!container || !row) return;

    if (targetIdx < 3) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const anchorHeight = 220;
      const targetTop = row.offsetTop - anchorHeight;
      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth'
      });
    }
  };
  
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

  const [activeSearchRowIndex, setActiveSearchRowIndex] = useState<number | null>(null);
  const [focusedProductIndex, setFocusedProductIndex] = useState<number>(-1);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<any | null>(null);
  const [selectedRowForVariant, setSelectedRowForVariant] = useState<number | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [variantQuantity, setVariantQuantity] = useState<string>('1');
  const [selectedUnit, setSelectedUnit] = useState<string>('Kg');
  const [selectedConversionFactor, setSelectedConversionFactor] = useState<number>(1);

  useEffect(() => {
    if (selectedProductForVariant) {
      const timer = setTimeout(() => {
        if (selectedProductForVariant.options_config && selectedProductForVariant.options_config.length > 0) {
          const firstSelect = document.getElementById('modal-select-0');
          if (firstSelect) firstSelect.focus();
        } else {
          const qtyInput = document.getElementById('modal-qty-input');
          if (qtyInput) {
            qtyInput.focus();
            (qtyInput as HTMLInputElement).select();
          }
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [selectedProductForVariant]);

  const normalizeUnitName = (u: string): string => {
    const normalized = (u || '').toLowerCase().trim();
    if (['libra', 'libras', 'lb', 'lbs', 'libra.', 'libras.'].includes(normalized)) return 'libra';
    if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(normalized)) return 'kg';
    if (['unidad', 'unidades', 'und', 'unds', 'ud', 'uds'].includes(normalized)) return 'unidad';
    if (['litro', 'litros', 'lt', 'lts', 'l'].includes(normalized)) return 'litro';
    return normalized;
  };

  const formatQuantity = (val: number | string | null | undefined): string => {
    if (val === undefined || val === null || val === '') return '';
    const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : val;
    if (isNaN(num)) return '';
    return num.toLocaleString('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3
    });
  };

  const parseQuantity = (val: string): number => {
    if (!val) return 0;
    const normalized = val.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  };

  const safeFetchJson = async (res: Response) => {
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
      if (!res.ok) {
        throw new Error(text || `Error de servidor (${res.status})`);
      }
      throw new Error(`Respuesta no válida del servidor: ${text.slice(0, 100)}`);
    }
    
    if (!res.ok) {
      throw new Error(json.error || `Error del servidor (${res.status})`);
    }
    
    return json;
  };

  useEffect(() => {
    async function loadClientExceptions() {
      if (!selectedDraft || !selectedDraft.profile_id) {
        setClientExceptions([]);
        return;
      }
      const { data: excs } = await supabase
        .from('product_nicknames')
        .select('*')
        .eq('customer_id', selectedDraft.profile_id);
      if (excs) {
        setClientExceptions(excs);
      } else {
        setClientExceptions([]);
      }
    }
    loadClientExceptions();
  }, [selectedDraft?.profile_id]);

  const handleSaveVariantsFromEmail = async (productId: string, optionsConfig: any[] | null, variants: any[] | null): Promise<boolean> => {
    try {
      const { error: prodError } = await supabase
        .from('products')
        .update({
          options_config: optionsConfig,
          variants: variants
        })
        .eq('id', productId);
      
      if (prodError) throw prodError;
      return true;
    } catch (e: any) {
      console.error('Error saving variants:', e);
      return false;
    }
  };

  const handleVariantImageUploadFromEmail = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (e: any) {
      console.error('Error uploading variant image:', e);
      return null;
    }
  };

  const openVariantModalForItem = (product: any, rowIndex: number) => {
    setSelectedProductForVariant(product);
    setSelectedRowForVariant(rowIndex);
    
    const item = editableItems[rowIndex];
    setVariantQuantity(item.quantity ? String(item.quantity).replace('.', ',') : '1');
    setSelectedUnit(item.unit || product.unit_of_measure || 'Kg');
    setSelectedConversionFactor(item.conversion_factor || 1);
    setSelectedOptions(item.selected_options || {});
  };

  const closeVariantModal = () => {
    const idx = selectedRowForVariant;
    setSelectedProductForVariant(null);
    setSelectedRowForVariant(null);
    if (idx !== null) {
      setTimeout(() => {
        const currentInput = productInputRefs.current[idx];
        if (currentInput) {
          currentInput.focus();
          currentInput.select();
        }
      }, 80);
    }
  };

  const confirmVariantAdd = () => {
    if (selectedRowForVariant === null || !selectedProductForVariant) return;
    
    const idx = selectedRowForVariant;
    const newEdits = [...editableItems];
    const qty = parseQuantity(variantQuantity) || 0;
    
    newEdits[idx].quantity = qty;
    newEdits[idx].quantity_text = undefined;
    newEdits[idx].unit = selectedUnit;
    newEdits[idx].conversion_factor = selectedConversionFactor;
    newEdits[idx].selected_options = selectedOptions;
    newEdits[idx].isConfirmed = true;
    
    const origQty = parseFloat(newEdits[idx].originalQuantity || newEdits[idx].quantity || 1);
    if (newEdits[idx].originalQuantity) {
      newEdits[idx].conversion_factor = parseFloat((qty / origQty).toFixed(3));
    }
    
    setEditableItems(newEdits);
    setSelectedProductForVariant(null);
    setSelectedRowForVariant(null);

    // Auto-focus next row's product input
    setTimeout(() => {
      const nextInput = productInputRefs.current[idx + 1];
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      } else {
        const approveBtn = document.getElementById('btn-approve-draft');
        if (approveBtn) approveBtn.focus();
      }
    }, 80);
  };

  const selectProduct = (product: any, rowIndex: number) => {
    // Check if product is already matched in another row
    const duplicateIndex = editableItems.findIndex((item, idx) =>
      idx !== rowIndex && !item.isDeleted && !item.isMetadata && item.matched_product_id === product.id
    );

    if (duplicateIndex >= 0) {
      setDuplicateMatchConfirm({
        isOpen: true,
        product,
        rowIndex,
        duplicateIndex
      });
      return;
    }

    executeSelectProduct(product, rowIndex);
  };

  const executeSelectProduct = (product: any, rowIndex: number) => {
    const newEdits = [...editableItems];
    newEdits[rowIndex].matched_product_id = product.id;
    newEdits[rowIndex].name = product.name;
    newEdits[rowIndex].searchQuery = `${product.name} (${getAccountingIdDisplay(product)})`;
    newEdits[rowIndex].skuQuery = product.sku || '';
    newEdits[rowIndex].isConfirmed = true;
    
    const currentOriginalUnit = newEdits[rowIndex].originalUnit || newEdits[rowIndex].unit || 'Kg';
    let conversionFactor = 1;
    let targetUnit = product.unit_of_measure || 'Kg';
    let foundDbConversion = false;

    if (conversions && conversions.length > 0) {
      const dbConv = conversions.find(c => 
        c.product_id === product.id &&
        normalizeUnitName(c.from_unit) === normalizeUnitName(currentOriginalUnit) &&
        normalizeUnitName(c.to_unit) === normalizeUnitName(targetUnit)
      );
      if (dbConv) {
        conversionFactor = parseFloat(dbConv.conversion_factor) || 1;
        targetUnit = dbConv.to_unit || product.unit_of_measure;
        foundDbConversion = true;
      }
    }

    if (!foundDbConversion) {
      const u = (product.unit_of_measure || '').toLowerCase().trim();
      let normalizedUnit = 'Kg';
      if (u === 'libra' || u === 'libras' || u === 'lb') normalizedUnit = 'Lb';
      else if (u === 'litro' || u === 'litros' || u === 'l' || u === 'lt') normalizedUnit = 'Litro';
      else if (u === 'unidad' || u === 'unidades' || u === 'ud' || u === 'und') normalizedUnit = 'Unidad';
      else if (u.includes('500 g') || u.includes('500g') || u.includes('500 gramos')) normalizedUnit = 'Paquete 500 gramos';
      else if (u.includes('250 g') || u.includes('250g') || u.includes('250 gramos')) normalizedUnit = 'Paquete 250 gramos';
      else if (u === 'kg' || u === 'kilo' || u === 'kilos' || u === 'kilogramo' || u === 'kilogramos') {
        normalizedUnit = getSmartFallbackUnit(product.name, 'Kg');
      }
      else if (product.unit_of_measure) {
        normalizedUnit = getSmartFallbackUnit(product.name, product.unit_of_measure);
      }
      targetUnit = normalizedUnit;

      const isLibra = currentOriginalUnit === 'Lb';
      conversionFactor = isLibra ? 0.5 : 1;
      
      const origQty = parseFloat(newEdits[rowIndex].originalQuantity || newEdits[rowIndex].quantity || 1);
      if (origQty >= 100 && !isLibra) {
        if (targetUnit === 'Kg') {
          conversionFactor = 0.001;
        } else if (targetUnit === 'Atado') {
          conversionFactor = 0.002;
        }
      }
    }

    newEdits[rowIndex].conversion_factor = conversionFactor;
    newEdits[rowIndex].unit = targetUnit;
    const origQty = parseFloat(newEdits[rowIndex].originalQuantity || newEdits[rowIndex].quantity || 1);
    newEdits[rowIndex].quantity = parseFloat((origQty * conversionFactor).toFixed(3));
    
    const autoSelectedOptions: Record<string, string> = {};
    const rawOriginalName = newEdits[rowIndex].originalName || '';
    let extraDescription = '';
    if (product && product.name) {
      const origClean = rawOriginalName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
      const prodClean = product.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
      const origWords = origClean.split(/\s+/).filter(w => w.length > 0);
      const prodWords = prodClean.split(/\s+/).filter(w => w.length > 0);
      const extraWords = origWords.filter(w => !prodWords.includes(w) && !['de', 'para', 'con', 'el', 'la', 'los', 'las', 'un', 'una', 'en'].includes(w));
      extraDescription = extraWords.join(' ');
    }
    let finalObservations = [newEdits[rowIndex].observations || '', extraDescription].filter(Boolean).join(' ').trim();
    
    if (product.variants && product.variants.length > 0) {
      const variantOptionNames = new Set<string>();
      let isOldFormat = false;
      product.variants.forEach((v: any) => {
        if (v.name && Array.isArray(v.options)) {
          isOldFormat = true;
        } else if (v.options && typeof v.options === 'object' && !Array.isArray(v.options)) {
          Object.keys(v.options).forEach(k => variantOptionNames.add(k));
        }
      });

      let variantOptionsList = product.variants;
      if (!isOldFormat) {
        variantOptionsList = Array.from(variantOptionNames).map(name => {
          const values = new Set<string>();
          product.variants.forEach((v: any) => {
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
    
    newEdits[rowIndex].selected_options = autoSelectedOptions;
    newEdits[rowIndex].observations = finalObservations;
    
    setEditableItems(newEdits);
    setActiveSearchRowIndex(null);
  };

  const handleMergeDuplicateMatch = () => {
    if (!duplicateMatchConfirm) return;
    const { product, rowIndex, duplicateIndex } = duplicateMatchConfirm;
    
    const newEdits = [...editableItems];
    
    const currentOriginalQty = parseFloat(newEdits[rowIndex].originalQuantity || newEdits[rowIndex].quantity || '0');
    const existingOriginalQty = parseFloat(newEdits[duplicateIndex].originalQuantity || newEdits[duplicateIndex].quantity || '0');
    const sumOriginalQty = parseFloat((existingOriginalQty + currentOriginalQty).toFixed(3));
    
    const factor = newEdits[duplicateIndex].conversion_factor || 1;
    newEdits[duplicateIndex].originalQuantity = sumOriginalQty;
    newEdits[duplicateIndex].quantity = parseFloat((sumOriginalQty * factor).toFixed(3));
    newEdits[duplicateIndex].isConfirmed = true;
    
    newEdits[rowIndex].isDeleted = true;
    newEdits[rowIndex].matched_product_id = null;
    
    if (newEdits[rowIndex].observations) {
      newEdits[duplicateIndex].observations = [
        newEdits[duplicateIndex].observations,
        newEdits[rowIndex].observations
      ].filter(Boolean).join(' | ');
    }
    
    setEditableItems(newEdits);
    setDuplicateMatchConfirm(null);
    setActiveSearchRowIndex(null);
    showToast('Cantidad acumulada en la línea existente y fila duplicada descartada.', 'success');
  };

  const handleKeepBothMatches = () => {
    if (!duplicateMatchConfirm) return;
    const { product, rowIndex } = duplicateMatchConfirm;
    executeSelectProduct(product, rowIndex);
    setDuplicateMatchConfirm(null);
  };

  const handleAddManualItem = () => {
    setEditableItems(prev => [
      ...prev,
      {
        originalName: '',
        name: '',
        quantity: 1,
        matched_product_id: null,
        searchQuery: '',
        skuQuery: '',
        unit: 'Kg',
        observations: '',
        isConfirmed: false
      }
    ]);
    setTimeout(() => {
      const nextIdx = editableItems.length;
      const nextInput = document.getElementById(`sku-input-${nextIdx}`) as HTMLInputElement | null;
      if (nextInput) {
        nextInput.focus();
        scrollToDraftRow(nextIdx);
      }
    }, 50);
  };

  const handleOpenExcelInNewTab = (currentUrl: string, currentName: string) => {
    if (!excelSheetsData || excelSheetsData.length === 0) {
      window.open(currentUrl, '_blank');
      return;
    }

    const win = window.open('', '_blank');
    if (!win) {
      window.open(currentUrl, '_blank');
      return;
    }

    const clientName = selectedDraft?.client_detected_name || 'Cliente';
    const sheetHtml = excelSheetsData.map((sheet: any, sIdx: number) => {
      return `
        <div class="sheet-container" id="sheet-${sIdx}" style="${sIdx > 0 ? 'display: none;' : ''}">
          <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 0.95rem; font-weight: 800; color: #0D7A57;">
              📄 Hoja: ${sheet.sheetName} · <span style="color: #10B981;">${sheet.countWithQty} ítems con pedido</span> / ${sheet.totalRows} filas
            </div>
            <div style="font-size: 0.8rem; color: #64748B;">
              ${sheet.countWithQty > 0 ? '🟢 Filas con cantidad resaltadas en verde' : ''}
            </div>
          </div>
          <table class="sheets-table">
            <tbody>
              ${sheet.rows.map((r: any) => `
                <tr class="${r.isHeader ? 'header-row' : ''} ${r.hasQty ? 'qty-row' : ''} ${r.isMeta ? 'meta-row' : ''}">
                  <td class="row-num">${r.rowIndex}</td>
                  ${r.cells.map((c: string, cIdx: number) => {
                    const isQty = cIdx === sheet.qtyCol && !r.isHeader && !r.isMeta;
                    const isName = cIdx === sheet.nameCol && !r.isHeader && !r.isMeta;
                    const hasValidQty = isQty && r.hasQty && r.qtyVal;
                    return `
                      <td class="${hasValidQty ? 'qty-cell' : ''} ${isName && r.hasQty ? 'name-cell' : ''}">
                        ${hasValidQty ? `<span class="badge-qty">${r.qtyVal} ${r.unitVal}</span>` : c}
                      </td>
                    `;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }).join('');

    win.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>${currentName} - ${clientName} | FruFresco</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #F8FAFC; color: #1E293B; }
          .topbar { background: linear-gradient(135deg, #0D7A57, #15803D); color: white; padding: 14px 28px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; box-shadow: 0 4px 15px rgba(0,0,0,0.12); }
          .topbar h1 { font-size: 1.15rem; font-weight: 800; display: flex; align-items: center; gap: 10px; letter-spacing: -0.02em; }
          .topbar-actions { display: flex; align-items: center; gap: 10px; }
          .btn { padding: 7px 16px; border-radius: 8px; font-weight: 800; font-size: 0.82rem; cursor: pointer; border: none; transition: all 0.15s; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
          .btn-white { background: white; color: #0D7A57; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
          .btn-white:hover { background: #ECFDF5; transform: translateY(-1px); }
          .btn-outline { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.4); color: white; }
          .btn-outline:hover { background: rgba(255,255,255,0.25); }
          .tabs-bar { background-color: #F1F5F9; padding: 10px 28px; display: flex; gap: 8px; border-bottom: 1px solid #CBD5E1; }
          .tab-btn { padding: 6px 18px; border-radius: 6px; font-size: 0.82rem; font-weight: 700; border: 1px solid #CBD5E1; background: white; cursor: pointer; color: #475569; transition: all 0.15s; }
          .tab-btn.active { background: #0D7A57; color: white; border-color: #0D7A57; box-shadow: 0 2px 6px rgba(13,122,87,0.2); }
          .content { padding: 24px 28px; overflow-x: auto; }
          .sheets-table { border-collapse: collapse; width: 100%; min-width: max-content; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); font-size: 0.82rem; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; border: 1px solid #E2E8F0; }
          .sheets-table td, .sheets-table th { border: 1px solid #E2E8F0; padding: 8px 12px; text-align: left; }
          .header-row { background-color: #E2E8F0; font-weight: 800; color: #0F172A; position: sticky; top: 60px; z-index: 10; }
          .meta-row { background-color: #F8FAFC; color: #64748B; font-weight: 600; }
          .row-num { background-color: #F1F5F9; color: #64748B; text-align: center; font-weight: 700; width: 44px; font-size: 0.72rem; border-right: 1px solid #CBD5E1; user-select: none; }
          .qty-row { background-color: #ECFDF5 !important; border-bottom: 1.5px solid #86EFAC !important; }
          .name-cell { font-weight: 800; color: #065F46; }
          .qty-cell { text-align: center; }
          .badge-qty { background-color: #FEF3C7; color: #B45309; border: 1.5px solid #FCD34D; padding: 2px 8px; border-radius: 6px; font-weight: 900; font-size: 0.85rem; display: inline-block; }
          @media print {
            .topbar, .tabs-bar { display: none !important; }
            .content { padding: 0 !important; }
          }
        </style>
      </head>
      <body>
        <div class="topbar">
          <h1>📊 Documento Excel: ${currentName} · <span style="font-weight: 500; font-size: 0.95rem; opacity: 0.9;">${clientName}</span></h1>
          <div class="topbar-actions">
            <button class="btn btn-outline" onclick="window.print()">🖨️ Imprimir Hoja</button>
            <a class="btn btn-white" href="${currentUrl}" download="${currentName}">⬇️ Descargar .xlsx Original</a>
          </div>
        </div>
        ${excelSheetsData.length > 1 ? `
          <div class="tabs-bar">
            ${excelSheetsData.map((s: any, idx: number) => `
              <button class="tab-btn ${idx === 0 ? 'active' : ''}" onclick="showSheet(${idx})">📄 ${s.sheetName} (${s.countWithQty} pedidos)</button>
            `).join('')}
          </div>
        ` : ''}
        <div class="content">
          ${sheetHtml}
        </div>
        <script>
          function showSheet(idx) {
            document.querySelectorAll('.sheet-container').forEach((el, i) => {
              el.style.display = i === idx ? 'block' : 'none';
            });
            document.querySelectorAll('.tab-btn').forEach((btn, i) => {
              if (i === idx) btn.classList.add('active');
              else btn.classList.remove('active');
            });
          }
        </script>
      </body>
      </html>
    `);
    win.document.close();
  };

  const handleProductSearchKeyDown = (e: React.KeyboardEvent, rowIndex: number, filtered: any[]) => {
    if (filtered.length === 0) return;
    
    let nextIndex = focusedProductIndex;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = focusedProductIndex < filtered.length - 1 ? focusedProductIndex + 1 : focusedProductIndex;
      setFocusedProductIndex(nextIndex);
      setTimeout(() => {
        const el = document.getElementById(`search-item-${rowIndex}-${nextIndex}`);
        if (el) el.scrollIntoView({ block: 'nearest' });
      }, 10);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = focusedProductIndex > 0 ? focusedProductIndex - 1 : focusedProductIndex;
      setFocusedProductIndex(nextIndex);
      setTimeout(() => {
        const el = document.getElementById(`search-item-${rowIndex}-${nextIndex}`);
        if (el) el.scrollIntoView({ block: 'nearest' });
      }, 10);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (focusedProductIndex >= 0 && focusedProductIndex < filtered.length) {
        e.preventDefault();
        selectProduct(filtered[focusedProductIndex], rowIndex);
        setFocusedProductIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setActiveSearchRowIndex(null);
      setFocusedProductIndex(-1);
    }
  };

  const handleReparseDraft = async () => {
    if (!selectedDraft) return;
    setIsReparsingDraft(true);
    try {
      showToast("Extrayendo productos con Gemini...", "info");
      const res = await fetch('/api/orders/reparse-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: selectedDraft.id })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "No se pudo re-extraer el documento");
      }
      
      if (Array.isArray(data.items) && data.items.length > 0) {
        setEditableItems(data.items);
        setSelectedDraft(prev => {
          if (!prev) return null;
          const raw = prev.extracted_items || [];
          const meta = (Array.isArray(raw) ? raw.find((it: any) => it.isMetadata) : {}) || {};
          if (data.clientName) meta.clientInDocument = data.clientName;
          if (data.address) meta.address = data.address;
          if (data.nit) meta.nit = data.nit;
          return {
            ...prev,
            client_detected_name: data.clientName || prev.client_detected_name,
            extracted_items: [meta, ...data.items]
          };
        });
        if (data.clientName) {
          setEditableClientName(data.clientName);
        }
        if (data.address) {
          setEditableAddress(data.address);
        }
        showToast(`¡Éxito! Se extrajeron ${data.items.length} productos con IA`, "success");
      } else {
        showToast("No se detectaron productos en el documento", "warning");
      }
    } catch (err: any) {
      console.error("Error reparsing draft:", err);
      showToast(err.message || "Error al re-extraer con IA", "error");
    } finally {
      setIsReparsingDraft(false);
    }
  };

  const optionsList = (() => {
    if (!selectedProductForVariant) return [];
    const list = [{ unit: selectedProductForVariant.unit_of_measure || 'Kg', factor: 1, label: `${selectedProductForVariant.unit_of_measure || 'Kg'} (Base)` }];
    const prodConvs = conversions ? conversions.filter(c => c.product_id === selectedProductForVariant.id) : [];
    prodConvs.forEach(c => {
      let displayUnit = c.from_unit || '';
      const norm = normalizeUnitName(displayUnit);
      if (norm === 'libra') displayUnit = 'libra';
      else if (norm === 'kg') displayUnit = 'Kg';
      else if (norm === 'unidad') displayUnit = 'Unidad';
      else if (norm === 'litro') displayUnit = 'Litro';

      if (!list.some(l => normalizeUnitName(l.unit) === norm)) {
        list.push({
          unit: displayUnit,
          factor: parseFloat(c.conversion_factor) || 1,
          label: `${displayUnit} (${parseFloat(c.conversion_factor)} ${selectedProductForVariant.unit_of_measure || 'Kg'})`
        });
      }
    });
    return list;
  })();

  const fetchClientFrequentProducts = async (profileId: string) => {
    if (!profileId) {
      setClientExceptions([]);
      setClientFrequentProductMap({});
      setClientFrequentProductIds([]);
      return;
    }
    try {
      const targetProfile = profiles.find(p => p.id === profileId);
      const relevantCustomerIds = [profileId];
      if (targetProfile?.parent_id) {
        if (!relevantCustomerIds.includes(targetProfile.parent_id)) {
          relevantCustomerIds.push(targetProfile.parent_id);
        }
        profiles.filter(p => p.parent_id === targetProfile.parent_id).forEach(p => {
          if (!relevantCustomerIds.includes(p.id)) relevantCustomerIds.push(p.id);
        });
      }

      // 1. Nicknames & Exceptions
      const { data: nicknames } = await supabase
        .from('product_nicknames')
        .select('*')
        .in('customer_id', relevantCustomerIds);
      if (nicknames) setClientExceptions(nicknames);

      // 2. Client recent orders & Pareto frequencies
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('id')
        .in('profile_id', relevantCustomerIds)
        .order('created_at', { ascending: false })
        .limit(60);

      if (recentOrders && recentOrders.length > 0) {
        const orderIds = recentOrders.map(o => o.id);
        const { data: items } = await supabase
          .from('order_items')
          .select('product_id, quantity, nickname')
          .in('order_id', orderIds);

        if (items && items.length > 0) {
          const freqMap: Record<string, { count: number; totalQty: number; nickname?: string }> = {};
          items.forEach(it => {
            if (!it.product_id) return;
            if (!freqMap[it.product_id]) {
              freqMap[it.product_id] = { count: 0, totalQty: 0, nickname: it.nickname || undefined };
            }
            freqMap[it.product_id].count += 1;
            freqMap[it.product_id].totalQty += (Number(it.quantity) || 0);
          });
          setClientFrequentProductMap(freqMap);
          const sortedIds = Object.keys(freqMap).sort((a, b) => freqMap[b].count - freqMap[a].count);
          setClientFrequentProductIds(sortedIds);
          return;
        }
      }
      setClientFrequentProductMap({});
      setClientFrequentProductIds([]);
    } catch (err) {
      console.warn('Error fetching client frequent products & exceptions:', err);
      setClientExceptions([]);
      setClientFrequentProductMap({});
      setClientFrequentProductIds([]);
    }
  };

  const getScoredProductsForQuery = (query: string) => {
    const cleanQuery = (query || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    if (!cleanQuery) {
      return [...products].sort((a, b) => {
        const freqA = clientFrequentProductMap[a.id]?.count || 0;
        const freqB = clientFrequentProductMap[b.id]?.count || 0;
        if (freqB !== freqA) return freqB - freqA;
        return (a.name || '').localeCompare(b.name || '');
      }).slice(0, 12);
    }

    const matched = products.filter(p => {
      const normName = (p.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const normSku = (p.sku || '').toLowerCase();
      const normAcc = (getAccountingIdDisplay(p) || '').toLowerCase();
      const exc = clientExceptions.find(e => e.product_id === p.id);
      const normNickname = exc?.nickname ? exc.nickname.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';

      return normName.includes(cleanQuery) ||
             normSku.includes(cleanQuery) ||
             normAcc.includes(cleanQuery) ||
             normNickname.includes(cleanQuery);
    });

    return matched.sort((a, b) => {
      const excA = clientExceptions.find(e => e.product_id === a.id);
      const excB = clientExceptions.find(e => e.product_id === b.id);
      const freqA = clientFrequentProductMap[a.id];
      const freqB = clientFrequentProductMap[b.id];

      let scoreA = 0;
      let scoreB = 0;

      // Prioritize client exceptions/nicknames (highest boost)
      if (excA) scoreA += 1000;
      if (excB) scoreB += 1000;

      // Prioritize historical purchase frequency and volume
      if (freqA) scoreA += (freqA.count * 100) + Math.min(freqA.totalQty, 500);
      if (freqB) scoreB += (freqB.count * 100) + Math.min(freqB.totalQty, 500);

      // Name match prefix boost
      const normNameA = (a.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const normNameB = (b.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normNameA.startsWith(cleanQuery)) scoreA += 50;
      if (normNameB.startsWith(cleanQuery)) scoreB += 50;
      if (normNameA === cleanQuery) scoreA += 100;
      if (normNameB === cleanQuery) scoreB += 100;

      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return normNameA.localeCompare(normNameB);
    }).slice(0, 12);
  };

  useEffect(() => {
    if (selectedDraft?.profile_id) {
      fetchClientFrequentProducts(selectedDraft.profile_id);
    } else {
      setClientFrequentProductIds([]);
    }
  }, [selectedDraft?.profile_id, profiles]);

  const handleSelectClientProfile = async (profile: any) => {
    if (!selectedDraft) return;
    const clientName = profile.company_name || profile.contact_name || profile.name || 'Cliente';
    const updatedDraft = {
      ...selectedDraft,
      profile_id: profile.id,
      client_detected_name: clientName,
      profiles: profile
    };
    setSelectedDraft(updatedDraft);
    setDrafts(prev => prev.map(d => d.id === selectedDraft.id ? updatedDraft : d));

    // Persist immediately in Supabase
    try {
      await supabase.from('order_drafts').update({
        profile_id: profile.id,
        client_detected_name: clientName
      }).eq('id', selectedDraft.id);
    } catch (e) {
      console.warn('Error persisting profile_id to draft:', e);
    }

    // Immediately trigger Pareto loading
    fetchClientFrequentProducts(profile.id);

    if (profile.address) {
      setEditableAddress(profile.address);
    }
    if (profile.phone || profile.contact_phone) {
      setEditableClientPhone(profile.phone || profile.contact_phone);
    }
    if (profile.nit) {
      setEditableClientNit(profile.nit);
    }
    setIsClientSearchOpen(false);
    setClientSearchQuery('');
    showToast(`Cliente asignado: ${clientName}`, 'success');
  };

  const openCustomizingModal = (product: any, rowIndex: number) => {
    if (!product) return;
    const item = editableItems[rowIndex] || {};
    const rawQty = item.quantity !== undefined && item.quantity !== null ? String(item.quantity) : '1';
    const unit = item.originalUnit || item.unit || product.unit_of_measure || 'Kg';
    const opts = { ...(item.selected_options || {}) };

    setCustomizingModalItem({
      rowIndex,
      product,
      originalText: item.originalName || item.name || product.name,
      originalQuantity: item.originalQuantity || item.quantity || 1,
      originalUnit: item.originalUnit || item.unit || 'Kg',
      options: opts,
      quantity: rawQty,
      unit,
      factor: item.conversion_factor || 1
    });
  };

  useEffect(() => {
    if (customizingModalItem) {
      setTimeout(() => {
        if (firstModalSelectRef.current) {
          firstModalSelectRef.current.focus();
        } else {
          const firstSelect = document.getElementById('modal-opt-select-0') as HTMLSelectElement | null;
          if (firstSelect) {
            firstSelect.focus();
          } else {
            const qtyInput = document.getElementById('modal-qty-input') as HTMLInputElement | null;
            if (qtyInput) {
              qtyInput.focus();
              qtyInput.select();
            }
          }
        }
      }, 50);
    }
  }, [customizingModalItem]);

  const saveCustomizingModal = () => {
    if (!customizingModalItem) return;
    const { rowIndex, product, options, quantity, unit, factor } = customizingModalItem;
    const parsedQty = parseFloat(quantity.replace(',', '.')) || 1;
    
    const optionValues = Object.values(options).filter(Boolean);
    const variantLabel = optionValues.join(' - ');

    const newEdits = [...editableItems];
    newEdits[rowIndex] = {
      ...newEdits[rowIndex],
      matched_product_id: product.id,
      name: product.name,
      searchQuery: `${product.name} (${getAccountingIdDisplay(product)})`,
      skuQuery: product.sku || '',
      quantity: parsedQty,
      originalQuantity: parsedQty,
      unit: unit,
      originalUnit: unit,
      conversion_factor: factor,
      selected_options: options,
      variant_label: variantLabel || newEdits[rowIndex].observations || undefined,
      isConfirmed: true
    };

    setEditableItems(newEdits);
    setCustomizingModalItem(null);
    showToast(`Producto ${product.name} actualizado ✅`, 'success');

    setTimeout(() => {
      const nextIdx = rowIndex + 1;
      const nextInput = document.getElementById(`sku-input-${nextIdx}`) as HTMLInputElement | null;
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
        scrollToDraftRow(nextIdx);
      }
    }, 50);
  };

  const [pricingModels, setPricingModels] = useState<any[]>([]);
  const [allModelPrices, setAllModelPrices] = useState<Record<string, Record<string, number>>>({});
  const [agreements, setAgreements] = useState<any[]>([]);
  const [agreementPrices, setAgreementPrices] = useState<Record<string, Record<string, number>>>({});
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignTargets, setCampaignTargets] = useState<any[]>([]);
  const [campaignItems, setCampaignItems] = useState<any[]>([]);

  const formatAgreementNumber = (seq: number, dateStr?: string) => {
    const date = dateStr ? new Date(dateStr) : new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const paddedSeq = String(seq).padStart(4, '0');
    return `ACI ${day}${month} ${paddedSeq}`;
  };

  const [contractPrices, setContractPrices] = useState<Record<string, number>>({});
  const [activePricingModel, setActivePricingModel] = useState<any>(null);
  const [isB2CDefault, setIsB2CDefault] = useState(false);
  const [isContractExpired, setIsContractExpired] = useState(false);

  const currentProfileForContract = selectedDraft ? profiles.find(p => p.id === selectedDraft.profile_id) : null;
  const contractModelId = currentProfileForContract?.pricing_model_id || null;

  useEffect(() => {
    async function resolveContract() {
      if (!selectedDraft) {
        setContractPrices({});
        setActivePricingModel(null);
        setIsB2CDefault(false);
        setIsContractExpired(false);
        return;
      }

      let resolvedModel: any = null;
      let expired = false;
      let b2cFallback = false;
      let loadedPrices: Record<string, number> = {};

      const effectiveClientId = currentProfileForContract?.parent_id || currentProfileForContract?.id;

      // 1. Check for Active Agreement Quotes first
      const activeAgreement = effectiveClientId 
        ? agreements.find(q => q.client_id === effectiveClientId)
        : null;

      if (activeAgreement) {
        resolvedModel = {
          id: activeAgreement.id,
          name: `Acuerdo ${activeAgreement.quote_number}`,
          is_agreement: true
        };

        const agreementMap = agreementPrices[activeAgreement.id];
        if (agreementMap) {
          loadedPrices = { ...agreementMap };
        }

        // Check expiration
        if (deliveryDate) {
          const delivery = deliveryDate.split('T')[0];
          const start = activeAgreement.start_date?.split('T')[0];
          const end = activeAgreement.valid_until?.split('T')[0];
          if (start && start > delivery) {
            expired = true;
          }
          if (end && end < delivery) {
            expired = true;
          }
        }
      } else {
        // 2. Fetch pricing model if no agreement
        const parentProfile = currentProfileForContract?.parent_id ? profiles.find(p => p.id === currentProfileForContract.parent_id) : null;
        const resolvedModelId = currentProfileForContract?.pricing_model_id || parentProfile?.pricing_model_id || null;

        if (resolvedModelId) {
          const pm = pricingModels.find(m => m.id === resolvedModelId);
          if (pm) {
            resolvedModel = pm;
            if (deliveryDate) {
              const delivery = deliveryDate.split('T')[0];
              const start = pm.start_date?.split('T')[0];
              const end = pm.end_date?.split('T')[0];
              if (start && start > delivery) {
                expired = true;
              }
              if (end && end < delivery) {
                expired = true;
              }
            }
          }
        }

        // Fallback to Clientes B2C if no model or if expired
        if (!resolvedModel || expired) {
          b2cFallback = true;
          const b2cModel = pricingModels.find(m => m.name === 'Clientes B2C');
          if (b2cModel) {
            resolvedModel = b2cModel;
            expired = false;
          }
        }

        // Load prices for resolved pricing model
        if (resolvedModel) {
          const pmPrices = allModelPrices[resolvedModel.id];
          if (pmPrices) {
            loadedPrices = { ...pmPrices };
          }
        }
      }

      setActivePricingModel(resolvedModel);
      setIsB2CDefault(b2cFallback);
      setIsContractExpired(expired);
      setContractPrices(loadedPrices);
    }

    resolveContract();
  }, [selectedDraft?.id, currentProfileForContract?.id, currentProfileForContract?.parent_id, deliveryDate, agreements, agreementPrices, pricingModels, allModelPrices]);
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
    if (editableItems[idx]?.isConfirmed) return '#F0FDF4'; // Soft green for confirmed row
    if (focusedRowIndex === idx) return THEME.colors.primaryLight; // Soft brand green for currently focused/edited row
    if (activeEquivalenceRow === idx) return THEME.colors.primaryLight; // Soft brand green for equivalence row
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
    fetchConversions();
    fetchAliases();
    fetchGeofence();
    fetchProfiles();
    fetchPricingData();

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

          await safeFetchJson(res);

          showToast('Borrador de pedido rechazado. Se ha enviado el correo electrónico de notificación al cliente.', 'success');
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

  const handleApproveDraft = async () => {
    if (!selectedDraft) return;
    const clientId = selectedDraft.profile_id;
    if (!clientId) {
      showToast('Por favor selecciona un cliente antes de aprobar la orden.', 'error');
      return;
    }
    if (hasUnmatchedItems) {
      showToast('Debe mapear todos los productos antes de aprobar la orden.', 'error');
      return;
    }

    setSaving(true);
    try {
      const validItems = editableItems
        .filter(itm => !itm.isDeleted && itm.matched_product_id)
        .map(itm => {
          const mProd = products.find(p => p.id === itm.matched_product_id);
          const resolvedPrice = getResolvedPriceForItem(itm, mProd);
          return {
            productId: itm.matched_product_id,
            productName: mProd?.name || itm.searchQuery || itm.originalName,
            quantity: itm.quantity,
            unit: itm.unit || mProd?.unit_of_measure || 'Kg',
            unitPrice: resolvedPrice,
            observations: itm.observations || null,
            deliveryDate: itm.deliveryDate || null
          };
        });

      const matchedProfile = profiles.find(p => p.id === clientId);
      const isB2C = matchedProfile?.role === 'b2c_client' || editableClientType === 'b2c_client';

      const payload = {
        draftId: selectedDraft.id,
        clientId: clientId,
        clientType: isB2C ? 'b2c_client' : 'b2b_client',
        deliveryDate: deliveryDate,
        deliverySlot: isManualDelivery ? manualDeliveryTime : (editableDeliverySlot || 'AM'),
        manual_delivery_time: isManualDelivery ? manualDeliveryTime : null,
        manual_delivery_margin: isManualDelivery ? manualDeliveryMargin : null,
        address: editableAddress || selectedDraft.address || 'Bogotá',
        notes: adminNotes || '',
        items: validItems,
        channel: 'email',
        originSource: 'email'
      };

      const res = await fetch('/api/orders/email-drafts/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error al aprobar borrador');
      }

      showToast(`¡Pedido #${data.orderNumber || data.orderId} aprobado y procesado exitosamente!`, 'success');
      setSelectedDraft(null);
      fetchDrafts(true);

    } catch (err: any) {
      console.error('Error al aprobar el borrador de correo:', err);
      showToast(`Error al aprobar borrador: ${err.message || 'Error desconocido'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data } = await supabase.from('products').select('*').eq('is_active', true);
      if (data) setProducts(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchConversions = async () => {
    try {
      let allConvs: any[] = [];
      let hasMoreConvs = true;
      let fromConv = 0;
      const limitConv = 1000;
      while (hasMoreConvs) {
        const { data: convData } = await supabase
          .from('product_conversions')
          .select('*')
          .range(fromConv, fromConv + limitConv - 1);
        if (convData && convData.length > 0) {
          allConvs = [...allConvs, ...convData];
          fromConv += limitConv;
          if (convData.length < limitConv) hasMoreConvs = false;
        } else {
          hasMoreConvs = false;
        }
      }
      setConversions(allConvs);
    } catch (e) {
      console.error('Error loading product conversions:', e);
    }
  };

  const fetchProfiles = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, company_name, contact_name, address, nit, role, phone, logistics_data, city, municipality, department, pricing_model_id, parent_id')
        .eq('is_active', true)
        .order('company_name', { ascending: true });
      if (data) setProfiles(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPricingData = async () => {
    try {
      const { data: models } = await supabase.from('pricing_models').select('*');
      if (models) setPricingModels(models);

      const { data: prices } = await supabase.from('pricing_model_prices').select('*');
      const map: Record<string, Record<string, number>> = {};
      prices?.forEach((row: any) => {
        if (!map[row.model_id]) {
          map[row.model_id] = {};
        }
        map[row.model_id][row.product_id] = row.price;
      });
      setAllModelPrices(map);

      // Fetch all active agreement quotes
      const { data: quotesData } = await supabase
        .from('quotes')
        .select('id, client_id, quote_number, start_date, valid_until')
        .eq('status', 'agreement');

      if (quotesData && quotesData.length > 0) {
        setAgreements(quotesData);
        const quoteIds = quotesData.map(q => q.id);
        const { data: itemsData } = await supabase
          .from('quote_items')
          .select('quote_id, product_id, unit_price')
          .in('quote_id', quoteIds);

        const aMap: Record<string, Record<string, number>> = {};
        itemsData?.forEach((row: any) => {
          if (!aMap[row.quote_id]) {
            aMap[row.quote_id] = {};
          }
          aMap[row.quote_id][row.product_id] = row.unit_price;
        });
        setAgreementPrices(aMap);
      } else {
        setAgreements([]);
        setAgreementPrices({});
      }

      // Fetch commercial campaigns
      const { data: campaignData } = await supabase
        .from('commercial_campaigns')
        .select('*')
        .eq('status', 'active');
      if (campaignData) setCampaigns(campaignData);

      if (campaignData && campaignData.length > 0) {
        const campaignIds = campaignData.map(c => c.id);
        
        const { data: targetData } = await supabase
          .from('campaign_targets')
          .select('*')
          .in('campaign_id', campaignIds);
        if (targetData) setCampaignTargets(targetData);

        const { data: itemData } = await supabase
          .from('campaign_items')
          .select('*')
          .in('campaign_id', campaignIds);
        if (itemData) setCampaignItems(itemData);
      } else {
        setCampaigns([]);
        setCampaignTargets([]);
        setCampaignItems([]);
      }
    } catch (e) {
      console.error('Error fetching pricing data:', e);
    }
  };

  const getResolvedPriceForDraft = (draft: any, productId: string) => {
    const profile = profiles.find(p => p.id === draft.profile_id);
    const effectiveClientId = profile?.parent_id || profile?.id || null;

    let basePrice = 0;
    let foundBase = false;

    // Check if there is an active agreement for this client (or their parent)
    const activeAgreement = effectiveClientId 
      ? agreements.find(q => q.client_id === effectiveClientId)
      : null;

    if (activeAgreement) {
      let expired = false;
      const metadata = getDraftMetadata(draft);
      const deliveryDateStr = deliveryDate || metadata?.deliveryDate;
      if (deliveryDateStr) {
        const delivery = deliveryDateStr.split('T')[0];
        const start = activeAgreement.start_date?.split('T')[0];
        const end = activeAgreement.valid_until?.split('T')[0];
        if (start && start > delivery) expired = true;
        if (end && end < delivery) expired = true;
      }

      if (!expired) {
        const agreementMap = agreementPrices[activeAgreement.id];
        if (agreementMap) {
          const pr = agreementMap[productId];
          if (pr !== undefined && pr !== null) {
            basePrice = pr;
            foundBase = true;
          }
        }
      }
    }

    if (!foundBase) {
      // Fallback to pricing model or parent pricing model
      let modelId = profile?.pricing_model_id || null;
      if (!modelId && profile?.parent_id) {
        const parent = profiles.find(p => p.id === profile.parent_id);
        if (parent) {
          modelId = parent.pricing_model_id || null;
        }
      }

      let resolvedModelId = modelId;
      let expiredModel = false;

      // Verify expiration of pricing model
      if (modelId && pricingModels.length > 0) {
        const pm = pricingModels.find(m => m.id === modelId);
        if (pm) {
          const metadata = getDraftMetadata(draft);
          const deliveryDateStr = deliveryDate || metadata?.deliveryDate;
          if (deliveryDateStr) {
            const delivery = deliveryDateStr.split('T')[0];
            const start = pm.start_date?.split('T')[0];
            const end = pm.end_date?.split('T')[0];
            if (start && start > delivery) expiredModel = true;
            if (end && end < delivery) expiredModel = true;
          }
        }
      }

      if (!resolvedModelId || expiredModel) {
        const b2cModel = pricingModels.find(m => m.name === 'Clientes B2C');
        resolvedModelId = b2cModel?.id || null;
      }

      if (resolvedModelId && allModelPrices[resolvedModelId]) {
        const pr = allModelPrices[resolvedModelId][productId];
        if (pr !== undefined && pr !== null) {
          basePrice = pr;
          foundBase = true;
        }
      }
    }

    if (!foundBase) {
      const prod = products.find(p => p.id === productId);
      basePrice = prod?.base_price || 0;
    }

    // Apply Active Campaign if applicable
    if (effectiveClientId && campaigns.length > 0) {
      const metadata = getDraftMetadata(draft);
      const deliveryDateStr = deliveryDate || metadata?.deliveryDate;
      const delivery = deliveryDateStr ? deliveryDateStr.split('T')[0] : new Date().toISOString().split('T')[0];

      // Find targets mapping this client/parent to active campaigns
      const clientTargets = campaignTargets.filter(t => t.profile_id === effectiveClientId);
      const clientCampaignIds = clientTargets.map(t => t.campaign_id);

      // Find active campaigns that are currently valid on the delivery date
      const activeCamps = campaigns.filter(c => {
        if (!clientCampaignIds.includes(c.id)) return false;
        if (c.status !== 'active') return false;
        const start = c.start_date?.split('T')[0];
        const end = c.end_date?.split('T')[0];
        if (start && start > delivery) return false;
        if (end && end < delivery) return false;
        return true;
      });

      if (activeCamps.length > 0) {
        const activeCampIds = activeCamps.map(c => c.id);
        // Find campaign items for this product
        const items = campaignItems.filter(item => item.product_id === productId && activeCampIds.includes(item.campaign_id));
        
        if (items.length > 0) {
          const item = items[0];
          const camp = activeCamps.find(c => c.id === item.campaign_id);
          if (camp) {
            if (camp.type === 'fixed_price') {
              return item.adjustment_value;
            } else if (camp.type === 'margin_adjustment') {
              return basePrice * (1 + item.adjustment_value / 100);
            }
          }
        }
      }
    }

    return basePrice;
  };
  const handleToggleEdit = async () => {
    if (isEditing) {
      setSaving(true);
      try {
        const metaItem = selectedDraft.extracted_items?.find((i: any) => i.isMetadata) || { isMetadata: true };
        const selectedProfile = profiles.find(p => p.id === selectedDraft.profile_id);
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
          nit: selectedProfile ? selectedProfile.nit : metaItem.nit,
          phone: selectedProfile ? selectedProfile.phone : metaItem.phone,
          clientType: selectedProfile ? selectedProfile.role : metaItem.clientType
        };
        const updatedExtractedItems = [
          updatedMetaItem,
          ...editableItems
        ];

        const { error } = await supabase
          .from('order_drafts')
          .update({ 
            extracted_items: updatedExtractedItems,
            profile_id: selectedDraft.profile_id,
            client_detected_name: selectedDraft.client_detected_name
          })
          .eq('id', selectedDraft.id);

        if (error) throw error;
        
        setSelectedDraft((prev: any) => ({
          ...prev,
          profile_id: selectedDraft.profile_id,
          client_detected_name: selectedDraft.client_detected_name,
          extracted_items: updatedExtractedItems
        }));
        setDrafts(prev => prev.map(d => d.id === selectedDraft.id ? { 
          ...d, 
          profile_id: selectedDraft.profile_id,
          client_detected_name: selectedDraft.client_detected_name,
          extracted_items: updatedExtractedItems 
        } : d));
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

          await safeFetchJson(res);

          setRecentlyDeletedItems([]);
          setSelectedDraft((prev: any) => ({
            ...prev,
            extracted_items: dbItems
          }));
          setDrafts(prev => prev.map(d => d.id === selectedDraft.id ? { ...d, extracted_items: dbItems } : d));
          showToast('Productos eliminados y novedades notificadas por correo.', 'success');
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
        showToast('Productos eliminados de la lista (novedades pendientes de notificar).', 'success');
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
        .select('*, profiles:profile_id(id, company_name, contact_name, role, is_active, logistics_data, address, city, municipality, department)')
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
        .then(async res => {
          const text = await res.text();
          try {
            const data = JSON.parse(text);
            if (!res.ok) throw new Error(data.error || `Error (${res.status})`);
            return data;
          } catch {
            if (!res.ok) throw new Error(text || `Error (${res.status})`);
            throw new Error('Respuesta no válida del geocodificador');
          }
        })
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
      const isNewDraft = lastDraftIdRef.current !== selectedDraft.id;
      lastDraftIdRef.current = selectedDraft.id;
      setIsEditing(true);
      const meta = getDraftMetadata(selectedDraft);
      const currentAtt = meta.attachments && Array.isArray(meta.attachments) ? meta.attachments[selectedAttachmentIndex] : null;
      const matchedProfile = profiles.find(p => p.id === selectedDraft.profile_id);
      
      if (matchedProfile && matchedProfile.address) {
        const fullAddress = `${matchedProfile.address}${matchedProfile.municipality || matchedProfile.city ? `, ${matchedProfile.municipality || matchedProfile.city}` : ''}${matchedProfile.department ? `, ${matchedProfile.department}` : ''}`;
        setEditableAddress(fullAddress);
      } else {
        setEditableAddress(meta.address || '');
      }
      
      const initialClientName = matchedProfile ? (matchedProfile.company_name || matchedProfile.contact_name || '') : (selectedDraft.client_detected_name || '');
      setClientSearchQuery(initialClientName);
      
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
      const rawItems = (() => {
        if (meta.attachments && Array.isArray(meta.attachments) && meta.attachments[selectedAttachmentIndex]?.items?.length > 0) {
          return meta.attachments[selectedAttachmentIndex].items;
        }
        return getDraftItems(selectedDraft);
      })();
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
        const productConversions = prod ? conversions.filter(c => c.product_id === prod.id) : [];
        const detectedUnit = prod ? detectUnitFromName(rawOriginalName, prod, productConversions) : null;
        
        const parsedUnit = (() => {
          if (detectedUnit) return detectedUnit.unit;
          
          const origLower = rawOriginalName.toLowerCase();
          
          // Priorizar unidades explícitas en el nombre original del producto (por ejemplo "1000 G", "Lb", "Kilo", "500g")
          // sobre lo que sea que haya detectado el parser IA por defecto, ya que a veces detecta "Unidad" para nombres que terminan en "1000 G".
          if (origLower.includes('libra') || origLower.includes(' lb ')) return 'Lb';
          if (origLower.includes('500 g') || origLower.includes('500g') || origLower.includes('500 gramos') || origLower.includes('500 gms') || origLower.includes('500 gr')) return 'Paquete 500 gramos';
          if (origLower.includes('250 g') || origLower.includes('250g') || origLower.includes('250 gramos') || origLower.includes('250 gms') || origLower.includes('250 gr')) return 'Paquete 250 gramos';
          if (origLower.includes('1000 g') || origLower.includes('1000g') || origLower.includes('1000 gramos') || origLower.includes('1000 gms') || origLower.includes('1000 gr') || origLower.includes('1000gms') || origLower.includes('1000gr')) return 'Kg';
          if (origLower.includes('litro') || origLower.includes('litros') || origLower.includes(' l ') || origLower.includes(' lt')) return 'Litro';
          if (origLower.includes('kg') || origLower.includes('kilo') || origLower.includes('kilos') || origLower.includes('kilogramo') || origLower.includes('kilogramos')) return 'Kg';

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
          
          if (origLower.includes('paquete') || origLower.includes('atado') || origLower.includes('bulto') || origLower.includes('canastilla') || origLower.includes('cubeta') || origLower.includes('racimo')) {
            return prod?.unit_of_measure || 'Kg';
          }
          
          return prod ? getSmartFallbackUnit(prod.name, prod.unit_of_measure || 'Kg') : 'Unidad';
        })();

        const initialQty = parseFloat(item.quantity || 1);
        let conversionFactor = detectedUnit ? detectedUnit.factor : 1;
        let finalUnit = prod?.unit_of_measure || parsedUnit;
        let foundDbConversion = detectedUnit ? true : false;

        if (!foundDbConversion) {
          if (prod && conversions && conversions.length > 0) {
            const dbConv = conversions.find(c => 
              c.product_id === prod.id &&
              normalizeUnitName(c.from_unit) === normalizeUnitName(parsedUnit) &&
              normalizeUnitName(c.to_unit) === normalizeUnitName(prod.unit_of_measure)
            );
            if (dbConv) {
              conversionFactor = parseFloat(dbConv.conversion_factor) || 1;
              finalUnit = dbConv.to_unit || prod.unit_of_measure;
              foundDbConversion = true;
            }
          }
        }

        if (!foundDbConversion) {
          const isLibra = parsedUnit === 'Lb';
          conversionFactor = isLibra ? 0.5 : (item.conversion_factor || 1);
          finalUnit = prod?.unit_of_measure || (isLibra ? 'Kg' : parsedUnit);

          if (initialQty >= 100 && !isLibra) {
            const targetUnit = prod?.unit_of_measure || 'Kg';
            if (targetUnit === 'Kg') {
              conversionFactor = 0.001;
              finalUnit = 'Kg';
            } else if (targetUnit === 'Atado') {
              conversionFactor = 0.002;
              finalUnit = 'Atado';
            }
          }
        }

        let finalQty = parseFloat((initialQty * conversionFactor).toFixed(3));

        return {
            ...item,
            originalName: cleanName,
            originalQuantity: initialQty,
            quantity: finalQty,
            conversion_factor: conversionFactor,
            originalUnit: parsedUnit,
            originalMatchedProductId: matchedId,
            matched_product_id: matchedId,
            name: prod ? prod.name : cleanName,
            searchQuery: prod ? `${prod.name} (${getAccountingIdDisplay(prod)})` : '',
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

      const computedSlot = getDeliverySlotFromLogistics(matchedProfile?.logistics_data);
      if (isNewDraft) {
        setEditableDeliverySlot(computedSlot || currentAtt?.deliverySlot || meta.deliverySlot || '');
        if (meta.priceList) {
          setPriceList(meta.priceList);
        } else if (matchedProfile) {
          const effectiveClientId = matchedProfile.parent_id || matchedProfile.id;
          const activeAgreement = effectiveClientId 
            ? agreements.find(q => q.client_id === effectiveClientId)
            : null;
          if (activeAgreement) {
            setPriceList(formatAgreementNumber(activeAgreement.quote_number, activeAgreement.start_date));
          } else {
            const parentProfile = matchedProfile.parent_id ? profiles.find(p => p.id === matchedProfile.parent_id) : null;
            const resolvedModelId = matchedProfile.pricing_model_id || parentProfile?.pricing_model_id || null;
            const pm = resolvedModelId ? pricingModels.find(m => m.id === resolvedModelId) : null;
            setPriceList(pm ? pm.name : 'Clientes B2C');
          }
        } else {
          setPriceList('');
        }
        setOrderDocument(meta.orderDocument || 'Remisión');
        setPurchaseOrder(meta.purchaseOrder || '');
      } else {
        if (currentAtt && currentAtt.deliverySlot) {
          setEditableDeliverySlot(currentAtt.deliverySlot);
        } else if (!editableDeliverySlot || editableDeliverySlot.trim() === '' || editableDeliverySlot.trim() === '--:--') {
          setEditableDeliverySlot(computedSlot || meta.deliverySlot || '');
        }
        
        if (!priceList && meta.priceList) {
          setPriceList(meta.priceList);
        }
        if (!purchaseOrder && meta.purchaseOrder) {
          setPurchaseOrder(meta.purchaseOrder);
        }
      }
      let initialDateStr = currentAtt?.deliveryDate || meta.deliveryDate || minDeliveryDate;
      if (initialDateStr < minDeliveryDate) {
        initialDateStr = minDeliveryDate;
      }
      if (matchedProfile?.logistics_data) {
        const allowedDays = matchedProfile.logistics_data.allowed_days || matchedProfile.logistics_data.days;
        if (allowedDays && allowedDays.length > 0) {
          initialDateStr = getNextAllowedDeliveryDate(initialDateStr, allowedDays);
        }
      }
      setDeliveryDate(initialDateStr);
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
      setDeliveryDate(minDeliveryDate);
    }
  }, [selectedDraft, products, aliases, conversions, profiles, selectedAttachmentIndex]);

  // Funciones de ayuda para extraer metadata (soportando ambas formas, DB column o JSON metadata)
  const getDraftItems = (draft: any) => {
    const raw = draft.extracted_items || [];
    if (!Array.isArray(raw)) return [];
    return raw.filter((i: any) => !i.isMetadata);
  };
  
  const getDraftMetadata = (draft: any) => {
    const raw = draft.extracted_items || [];
    const meta = Array.isArray(raw) ? raw.find((i: any) => i.isMetadata) : undefined;
    
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
      attachments: meta?.attachments || null,
      rejectReason: meta?.rejectReason || null,
      latitude: meta?.latitude || null,
      longitude: meta?.longitude || null,
      priceList: meta?.priceList || null,
      orderDocument: meta?.orderDocument || null,
      purchaseOrder: meta?.purchaseOrder || null,
      receiptEmailSent: meta?.receiptEmailSent || false,
      emailHtml: meta?.emailHtml || null
    };
  };

  const findMatchedProduct = useCallback((originalName: string) => {
    if (!originalName) return null;

    const cleanName = originalName.toLowerCase().trim();
    if (matchCacheRef.current[cleanName] !== undefined) {
      return matchCacheRef.current[cleanName];
    }

    const result = (() => {
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
    })();

    matchCacheRef.current[cleanName] = result;
    return result;
  }, [products, aliases]);

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
    selectedDraftIds,
    selectedProductForVariant: null as any,
    selectedRowForVariant: null as any,
    variantConfigProduct: null as any,
    manageConversionsProduct: null as any
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
      selectedDraftIds,
      selectedProductForVariant,
      selectedRowForVariant,
      variantConfigProduct,
      manageConversionsProduct
    };
  }, [
    isEditing, focusedRowIndex, products, editableItems, selectedDraft, showConfirmModal,
    activeEquivalenceRow, activeVariantRow, actionConfirm, deleteConfirm, obsModal,
    rejectModal, showShortcuts, selectedDraftIds, selectedProductForVariant, selectedRowForVariant,
    variantConfigProduct, manageConversionsProduct
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
    if (manageConversionsProduct) {
      setTimeout(() => {
        const qty1 = document.getElementById('new-conv-qty-1') as HTMLInputElement | null;
        if (qty1) {
          qty1.focus();
          qty1.select();
        }
      }, 100);
    }
  }, [manageConversionsProduct]);

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
        selectedDraftIds,
        selectedProductForVariant,
        selectedRowForVariant,
        variantConfigProduct,
        manageConversionsProduct
      } = stateRef.current;

      if (variantConfigProduct || manageConversionsProduct) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (variantConfigProduct) setVariantConfigProduct(null);
          else if (manageConversionsProduct) setManageConversionsProduct(null);
        }
        return;
      }

      const isAltShortcut = e.altKey && (
        e.code === 'KeyA' || e.key === 'a' || e.key === 'A' ||
        e.code === 'KeyE' || e.key === 'e' || e.key === 'E' ||
        e.code === 'KeyV' || e.key === 'v' || e.key === 'V' ||
        e.code === 'KeyO' || e.key === 'o' || e.key === 'O'
      );

      const isTextInput = (target.tagName === 'INPUT' && (
        (target as HTMLInputElement).type === 'text' ||
        (target as HTMLInputElement).type === 'number' ||
        (target as HTMLInputElement).type === 'search' ||
        (target as HTMLInputElement).type === 'email' ||
        (target as HTMLInputElement).type === 'password'
      )) || target.tagName === 'TEXTAREA';

      if (target.tagName === 'SELECT') return;

      const isBypassKey = isAltShortcut || e.ctrlKey || e.metaKey || e.key === 'Escape' ||
        (e.key === 'Enter' && (!!actionConfirm || !!deleteConfirm || !!rejectModal || !!showConfirmModal || !!obsModal)) ||
        (e.key === 'Delete' && !isTextInput);

      if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !isBypassKey) return;

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

      // Handle Alt+A shortcut globally (Actualizar Bandeja)
      if (e.altKey && (e.code === 'KeyA' || e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        fetchDrafts();
        return;
      }

      // Handle Alt+O shortcut globally
      if (e.altKey && (e.code === 'KeyO' || e.key === 'o' || e.key === 'O')) {
        if (selectedDraft && isEditing && !showConfirmModal) {
          e.preventDefault();
          setShowFloatingEmail(prev => !prev);
          return;
        }
      }

      // Handle Alt+E shortcut globally
      if (e.altKey && (e.code === 'KeyE' || e.key === 'e' || e.key === 'E')) {
        if (selectedProductForVariant) {
          e.preventDefault();
          setManageConversionsProduct(selectedProductForVariant);
          return;
        }
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
        if (selectedProductForVariant) {
          e.preventDefault();
          setVariantConfigProduct(selectedProductForVariant);
          return;
        }
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
        if (variantConfigProduct) { setVariantConfigProduct(null); return; }
        if (manageConversionsProduct) { setManageConversionsProduct(null); return; }
        if (selectedProductForVariant) { closeVariantModal(); return; }
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

    const hasUnmatchedProducts = editableItems.some(item => !item.isDeleted && !item.isMetadata && !item.matched_product_id);
    if (hasUnmatchedProducts) {
      showToast('Error: Existen productos sin emparejar. Por favor, asocia todos los productos a nuestro catálogo o elimínalos.', 'error');
      return;
    }

    const metadataForValidations = getDraftMetadata(selectedDraft);
    
    if (!deliveryDate) {
      showToast('Error: Debes seleccionar una fecha de entrega válida.', 'error');
      return;
    }

    if (!editableDeliverySlot || editableDeliverySlot.trim() === '' || editableDeliverySlot.trim() === '--:--') {
      showToast('Error: Debes indicar una hora de entrega válida.', 'error');
      return;
    }

    if (!priceList || priceList.trim() === '') {
      showToast('Error: La lista de precios no puede estar vacía.', 'error');
      return;
    }

    if (!purchaseOrder || purchaseOrder.trim() === '') {
      showToast('Error: La orden de compra no puede estar vacía.', 'error');
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

          editableItems.filter(item => !item.isDeleted).forEach(item => {
            if (item.matched_product_id) {
              const prod = products.find(p => p.id === item.matched_product_id);
              if (prod) {
                const qtyNum = parseFloat(item.quantity?.toString().replace(',', '.') || '0');
                const resolvedPrice = getResolvedPriceForDraft(selectedDraft, prod.id);
                totalAmount += resolvedPrice * qtyNum;
                const unit = (item.originalUnit || prod.unit_of_measure || '').toLowerCase().trim();
                const isKgUnit = ['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'kg.'].includes(unit);
                const isLibraUnit = ['libra', 'libras', 'lb', 'lbs', '500g'].includes(unit);
                let w = 1.0;
                if (isKgUnit) {
                  w = 1.0;
                } else if (isLibraUnit) {
                  w = 0.5;
                } else if (prod.weight_kg && Number(prod.weight_kg) > 0) {
                  w = Number(prod.weight_kg);
                }
                totalWeight += qtyNum * w;

                itemsData.push({
                  product_id: prod.id,
                  quantity: qtyNum,
                  unit_price: resolvedPrice,
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
          editableItems.filter(item => !item.isDeleted).forEach(item => {
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

          // F. Actualizar borrador
          const metaItem = selectedDraft.extracted_items?.find((i: any) => i.isMetadata) || { isMetadata: true };
          const updatedAttachments = metaItem.attachments && Array.isArray(metaItem.attachments) ? [...metaItem.attachments] : [];
          let isLastAttachment = true;
          let nextUnprocessedIdx = -1;

          if (updatedAttachments.length > 0 && updatedAttachments[selectedAttachmentIndex]) {
            updatedAttachments[selectedAttachmentIndex] = {
              ...updatedAttachments[selectedAttachmentIndex],
              processed: true,
              orderId: order.id,
              deliveryDate: deliveryDate,
              deliverySlot: editableDeliverySlot || null,
              items: editableItems.map(itm => ({
                name: itm.name || itm.originalName,
                originalName: itm.originalName,
                quantity: itm.quantity,
                unit: itm.unit,
                matched_product_id: itm.matched_product_id,
                observations: itm.observations,
                selected_options: itm.selected_options,
                isDeleted: itm.isDeleted,
                deliveryDate: itm.deliveryDate || null
              }))
            };

            for (let i = 0; i < updatedAttachments.length; i++) {
              if (!updatedAttachments[i].processed) {
                isLastAttachment = false;
                if (nextUnprocessedIdx === -1) {
                  nextUnprocessedIdx = i;
                }
              }
            }
          }

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
            receiptEmailSent: true,
            attachments: updatedAttachments
          };
          const updatedExtractedItems = [
            updatedMetaItem,
            ...editableItems
          ];

          const genOrderNumber = order.order_number || ('PED-' + order.id.slice(0, 8).toUpperCase());

          if (isLastAttachment) {
            await supabase
              .from('order_drafts')
              .update({ 
                status: 'approved',
                order_id: order.id,
                order_number: genOrderNumber,
                delivery_date: deliveryDate,
                extracted_items: updatedExtractedItems
              })
              .eq('id', selectedDraft.id);
          } else {
            await supabase
              .from('order_drafts')
              .update({ 
                extracted_items: updatedExtractedItems
              })
              .eq('id', selectedDraft.id);
          }

          // G. Enviar correo HTML de acuse de recibo con resumen de pedido
          const itemsHtml = editableItems.filter((item: any) => !item.isDeleted).map((item: any) => {
            const prod = products.find(p => p.id === item.matched_product_id);
            const qtyNum = parseFloat(item.quantity?.toString().replace(',', '.') || '0');
            const unitPrice = prod ? getResolvedPriceForDraft(selectedDraft, prod.id) : 0;
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

          if (isLastAttachment) {
            showToast('Pedido registrado y acuse de recibo enviado con éxito.', 'success');
            setSelectedDraft(null);
          } else {
            showToast(`Pedido registrado para "${updatedAttachments[selectedAttachmentIndex]?.name || 'documento'}". Avanzando al siguiente...`, 'success');
            const localDraftUpdated = {
              ...selectedDraft,
              extracted_items: updatedExtractedItems
            };
            setSelectedDraft(localDraftUpdated);
            setDrafts(prev => prev.map(d => d.id === selectedDraft.id ? localDraftUpdated : d));
            if (nextUnprocessedIdx !== -1) {
              setSelectedAttachmentIndex(nextUnprocessedIdx);
            }
          }
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
    const hasUnmatchedProducts = editableItems.some(item => !item.isDeleted && !item.isMetadata && !item.matched_product_id);
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
    editableItems.filter(item => !item.isDeleted).forEach(item => {
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
      
      let updatedAttachments = metaItem.attachments && Array.isArray(metaItem.attachments) ? [...metaItem.attachments] : [];
      if (updatedAttachments.length > 0 && updatedAttachments[selectedAttachmentIndex]) {
        updatedAttachments[selectedAttachmentIndex] = {
          ...updatedAttachments[selectedAttachmentIndex],
          deliveryDate: deliveryDate,
          deliverySlot: editableDeliverySlot || metaItem.deliverySlot || 'AM',
          items: editableItems.map(itm => ({
            name: itm.name || itm.originalName,
            originalName: itm.originalName,
            quantity: itm.quantity,
            unit: itm.unit,
            matched_product_id: itm.matched_product_id,
            observations: itm.observations,
            selected_options: itm.selected_options,
            isDeleted: itm.isDeleted
          }))
        };
      }

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
        attachments: updatedAttachments.length > 0 ? updatedAttachments : undefined
      };
      
      const updatedExtractedItems = selectedDraft.extracted_items.map((itm: any) => {
        if (itm.isMetadata) {
          return updatedMetaItem;
        }
        return itm;
      });

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
      setDeliverySlot(editableDeliverySlot === 'PM' ? 'PM' : 'AM');
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
      let hasZeroPriceItem = false;
      let zeroPriceItemName = '';

      for (const item of editableItems.filter(itm => !itm.isDeleted)) {
        if (item.matched_product_id) {
          const prod = products.find(p => p.id === item.matched_product_id);
          if (prod) {
            const resolvedPrice = contractPrices[prod.id] !== undefined && contractPrices[prod.id] !== null ? contractPrices[prod.id] : prod.base_price;
            if (!resolvedPrice || parseFloat(resolvedPrice.toString()) === 0) {
              hasZeroPriceItem = true;
              zeroPriceItemName = prod.name;
              break;
            }
            const qtyNum = parseFloat(item.quantity?.toString().replace(',', '.') || '0');
            totalAmount += resolvedPrice * qtyNum;
            const unit = (item.originalUnit || prod.unit_of_measure || '').toLowerCase().trim();
            const isKgUnit = ['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'kg.'].includes(unit);
            const isLibraUnit = ['libra', 'libras', 'lb', 'lbs', '500g'].includes(unit);
            let w = 1.0;
            if (isKgUnit) {
              w = 1.0;
            } else if (isLibraUnit) {
              w = 0.5;
            } else if (prod.weight_kg && Number(prod.weight_kg) > 0) {
              w = Number(prod.weight_kg);
            }
            totalWeight += qtyNum * w;

            itemsData.push({
              product_id: prod.id,
              quantity: qtyNum,
              unit_price: resolvedPrice,
              nickname: item.observations ? `${item.originalName || prod.name} (${item.observations})` : (item.originalName || null),
              variant_label: item.observations || null,
              unit: item.unit || prod.unit_of_measure || 'Kg',
              selected_options: item.selected_options || {}
            });
          }
        }
      }

      if (hasZeroPriceItem) {
        setConfirmingOrder(false);
        showToast(`Aprobación bloqueada: El producto "${zeroPriceItemName}" no tiene tarifa en contrato ni B2C (precio $0). Por favor asigne precio manualmente antes de aprobar.`, 'error');
        return;
      }

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

      // 4. Update the draft status to approved and save updated attachments list
      const updatedAttachments = metadata.attachments && Array.isArray(metadata.attachments) ? [...metadata.attachments] : [];
      let isLastAttachment = true;
      let nextUnprocessedIdx = -1;

      if (updatedAttachments.length > 0 && updatedAttachments[selectedAttachmentIndex]) {
        updatedAttachments[selectedAttachmentIndex] = {
          ...updatedAttachments[selectedAttachmentIndex],
          processed: true,
          orderId: order.id,
          deliveryDate: deliveryDate,
          deliverySlot: editableDeliverySlot || metadata?.deliverySlot || 'AM',
          items: editableItems.map(itm => ({
            name: itm.name || itm.originalName,
            originalName: itm.originalName,
            quantity: itm.quantity,
            unit: itm.unit,
            matched_product_id: itm.matched_product_id,
            observations: itm.observations,
            selected_options: itm.selected_options,
            isDeleted: itm.isDeleted
          }))
        };

        for (let i = 0; i < updatedAttachments.length; i++) {
          if (!updatedAttachments[i].processed) {
            isLastAttachment = false;
            if (nextUnprocessedIdx === -1) {
              nextUnprocessedIdx = i;
            }
          }
        }
      }

      const updatedExtractedItems = selectedDraft.extracted_items.map((itm: any) => {
        if (itm.isMetadata) {
          return {
            ...itm,
            attachments: updatedAttachments
          };
        }
        return itm;
      });

      const genOrderNumber = order.order_number || ('PED-' + order.id.slice(0, 8).toUpperCase());

      if (isLastAttachment) {
        await supabase
          .from('order_drafts')
          .update({ 
            status: 'approved',
            order_id: order.id,
            order_number: genOrderNumber,
            delivery_date: deliveryDate,
            extracted_items: updatedExtractedItems
          })
          .eq('id', selectedDraft.id);
      } else {
        await supabase
          .from('order_drafts')
          .update({ 
            extracted_items: updatedExtractedItems
          })
          .eq('id', selectedDraft.id);
      }

      // 5. Send confirmation email (queue in mail table)
      if (selectedDraft.source_email && sendConfirmationEmail) {
        const formattedItems = editableItems.map(item => {
          const prod = products.find(p => p.id === item.matched_product_id);
          const qtyNum = parseFloat(item.quantity?.toString().replace(',', '.') || '0');
          const unitPrice = prod ? getResolvedPriceForDraft(selectedDraft, prod.id) : 0;
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

      if (isLastAttachment) {
        showToast('¡Todos los pedidos registrados exitosamente! Borrador aprobado', 'success');
        setShowConfirmModal(false);
        setSelectedDraft(null);
      } else {
        showToast(`Pedido registrado para "${metadata.attachments[selectedAttachmentIndex]?.name || 'documento'}". Avanzando al siguiente...`, 'success');
        setShowConfirmModal(false);
        
        // Update local selectedDraft state with updated attachments
        const localDraftUpdated = {
          ...selectedDraft,
          extracted_items: updatedExtractedItems
        };
        setSelectedDraft(localDraftUpdated);
        
        // Update draft in parent drafts list
        setDrafts(prev => prev.map(d => d.id === selectedDraft.id ? localDraftUpdated : d));
        
        // Advance to next unprocessed attachment index
        if (nextUnprocessedIdx !== -1) {
          setSelectedAttachmentIndex(nextUnprocessedIdx);
        }
      }
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

  const totalValue = editableItems.filter(item => !item.isDeleted).reduce((acc, item) => {
    const matchedProd = products.find(p => p.id === item.matched_product_id);
    const resolvedPrice = matchedProd ? (contractPrices[matchedProd.id] !== undefined && contractPrices[matchedProd.id] !== null ? contractPrices[matchedProd.id] : (matchedProd.base_price || 0)) : 0;
    return acc + (matchedProd ? (resolvedPrice * (item.quantity || 0)) : 0);
  }, 0);

  const hasUnmatchedItems = editableItems.some(item => !item.isDeleted && !item.matched_product_id);

  return (
    <div style={{ padding: '0', maxWidth: '100%', margin: '0' }}>
      {/* Sticky Banner: Pedidos por Procesar + Barra de Filtros (Fijado debajo del Navbar a top: 85px) */}
      <div style={{
        position: 'sticky',
        top: '85px',
        zIndex: 40,
        backgroundColor: '#FFFFFF',
        padding: '1rem 1.25rem',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 4px 16px -2px rgba(0, 0, 0, 0.06)',
        marginBottom: '1.25rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={20} style={{ color: THEME.colors.primary }} /> Pedidos por Procesar (Email Inbound)
          </h1>
        </div>
        <button 
          onClick={() => fetchDrafts()}
          title="Alt+A"
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
          Actualizar Bandeja <span style={{ opacity: 0.4, fontSize: '0.75rem', marginLeft: '0.3rem' }}>(Alt+A)</span>
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
          <Calendar size={16} color={THEME.colors.textSecondary} />
          <input 
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              fontWeight: 800,
              fontSize: '0.85rem',
              color: THEME.colors.textMain,
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
                color: THEME.colors.textSecondary,
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
          backgroundColor: THEME.colors.background, 
          border: 'none', 
          borderRadius: THEME.radius.md,
          padding: '0.6rem 1rem',
          gap: '8px'
        }}>
          <Search size={16} color={THEME.colors.textSecondary} />
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
              color: THEME.colors.textMain,
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
                color: THEME.colors.textSecondary,
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
              border: selectedStatus === 'pending' ? '2px solid #D97706' : `1px solid ${THEME.colors.border}`,
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.8rem',
              color: selectedStatus === 'pending' ? '#B45309' : THEME.colors.textSecondary,
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
              backgroundColor: selectedStatus === 'pending' ? '#FBBF24' : THEME.colors.background,
              color: selectedStatus === 'pending' ? '#78350F' : THEME.colors.textSecondary,
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
              border: selectedStatus === 'approved' ? '2px solid #059669' : `1px solid ${THEME.colors.border}`,
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.8rem',
              color: selectedStatus === 'approved' ? '#047857' : THEME.colors.textSecondary,
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
              backgroundColor: selectedStatus === 'approved' ? '#A7F3D0' : THEME.colors.background,
              color: selectedStatus === 'approved' ? '#064E3B' : THEME.colors.textSecondary,
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
              border: selectedStatus === 'rejected' ? '2px solid #DC2626' : `1px solid ${THEME.colors.border}`,
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.8rem',
              color: selectedStatus === 'rejected' ? '#B91C1C' : THEME.colors.textSecondary,
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
              backgroundColor: selectedStatus === 'rejected' ? '#FCA5A5' : THEME.colors.background,
              color: selectedStatus === 'rejected' ? '#7F1D1D' : THEME.colors.textSecondary,
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
              backgroundColor: selectedStatus === 'all' ? THEME.colors.background : 'white',
              border: selectedStatus === 'all' ? '2px solid #4B5563' : `1px solid ${THEME.colors.border}`,
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.8rem',
              color: selectedStatus === 'all' ? '#1F2937' : THEME.colors.textSecondary,
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
              backgroundColor: selectedStatus === 'all' ? '#D1D5DB' : THEME.colors.background,
              color: selectedStatus === 'all' ? '#1F2937' : THEME.colors.textSecondary,
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
            backgroundColor: THEME.colors.primaryLight, 
            borderRadius: THEME.radius.md,
            width: '38px',
            height: '38px',
            cursor: 'pointer',
            transition: 'background-color 0.15s'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(13, 122, 87, 0.15)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryLight}
        >
          <Keyboard size={20} color={THEME.colors.primary} strokeWidth={2.5} />
        </div>

        {/* Info Icon */}
        <div 
          onClick={() => showToast('Este módulo muestra los correos electrónicos entrantes (inbound) procesados automáticamente por la IA. Aquí puedes revisar los borradores de pedidos, mapear productos con el inventario, validar la cobertura geográfica del cliente en Bogotá y aprobarlos para crear órdenes.', 'info')}
          title="Ayuda del módulo"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            backgroundColor: THEME.colors.primaryLight, 
            borderRadius: THEME.radius.md,
            width: '38px',
            height: '38px',
            cursor: 'pointer',
            transition: 'background-color 0.15s'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(13, 122, 87, 0.15)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryLight}
        >
          <Info size={20} color={THEME.colors.primary} strokeWidth={3} />
        </div>

        {/* View Toggle */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          backgroundColor: THEME.colors.background, 
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
            <List size={16} color={viewMode === 'list' ? THEME.colors.textMain : THEME.colors.textSecondary} />
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
            <Grid size={16} color={viewMode === 'grid' ? THEME.colors.textMain : THEME.colors.textSecondary} />
          </div>
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
          <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}`, position: 'relative' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ position: 'sticky', top: '236px', zIndex: 20, backgroundColor: '#F8FAFB', padding: '0.85rem 1rem', width: '40px', textAlign: 'center', borderBottom: '2px solid #E2E8F0', boxShadow: '0 4px 6px -2px rgba(0,0,0,0.04)', ...THEME.typography?.tableHeader }}>
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
                  <th style={{ position: 'sticky', top: '236px', zIndex: 20, backgroundColor: '#F8FAFB', padding: '0.85rem 1rem', width: '12%', textAlign: 'left', borderBottom: '2px solid #E2E8F0', boxShadow: '0 4px 6px -2px rgba(0,0,0,0.04)', ...THEME.typography?.tableHeader }}>FECHA / TIPO</th>
                  <th style={{ position: 'sticky', top: '236px', zIndex: 20, backgroundColor: '#F8FAFB', padding: '0.85rem 1rem', width: '22%', textAlign: 'left', borderBottom: '2px solid #E2E8F0', boxShadow: '0 4px 6px -2px rgba(0,0,0,0.04)', ...THEME.typography?.tableHeader }}>CLIENTE</th>
                  <th style={{ position: 'sticky', top: '236px', zIndex: 20, backgroundColor: '#F8FAFB', padding: '0.85rem 1rem', width: '24%', textAlign: 'left', borderBottom: '2px solid #E2E8F0', boxShadow: '0 4px 6px -2px rgba(0,0,0,0.04)', ...THEME.typography?.tableHeader }}>DIRECCIÓN / GPS</th>
                  <th style={{ position: 'sticky', top: '236px', zIndex: 20, backgroundColor: '#F8FAFB', padding: '0.85rem 1rem', width: '15%', textAlign: 'left', borderBottom: '2px solid #E2E8F0', boxShadow: '0 4px 6px -2px rgba(0,0,0,0.04)', ...THEME.typography?.tableHeader }}>ASUNTO / ORIGEN</th>
                  <th style={{ position: 'sticky', top: '236px', zIndex: 20, backgroundColor: '#F8FAFB', padding: '0.85rem 1rem', width: '10%', textAlign: 'center', borderBottom: '2px solid #E2E8F0', boxShadow: '0 4px 6px -2px rgba(0,0,0,0.04)', ...THEME.typography?.tableHeader }}>ITEMS / PESO</th>
                  <th style={{ position: 'sticky', top: '236px', zIndex: 20, backgroundColor: '#F8FAFB', padding: '0.85rem 1rem', width: '10%', textAlign: 'right', borderBottom: '2px solid #E2E8F0', boxShadow: '0 4px 6px -2px rgba(0,0,0,0.04)', ...THEME.typography?.tableHeader }}>VALOR</th>
                  <th style={{ position: 'sticky', top: '236px', zIndex: 20, backgroundColor: '#F8FAFB', padding: '0.85rem 1rem', width: '10%', textAlign: 'center', borderBottom: '2px solid #E2E8F0', boxShadow: '0 4px 6px -2px rgba(0,0,0,0.04)', ...THEME.typography?.tableHeader }}>ESTADO</th>
                  <th style={{ position: 'sticky', top: '236px', zIndex: 20, backgroundColor: '#F8FAFB', padding: '0.85rem 1rem', width: '10%', textAlign: 'center', borderBottom: '2px solid #E2E8F0', boxShadow: '0 4px 6px -2px rgba(0,0,0,0.04)', ...THEME.typography?.tableHeader }}>ACCIONES</th>
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
                  }
                  const resolvedPrice = matchedProd ? getResolvedPriceForDraft(draft, matchedProd.id) : 0;
                  return acc + (resolvedPrice * (item.quantity || 0));
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
                      <span style={{ fontSize: '0.65rem', color: '#059669', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <MapPin size={10} color="#059669" /> GPS OK
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <AlertTriangle size={10} color="#9CA3AF" /> SIN GPS
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.8rem 1rem', textAlign: 'left' }}>
                    <div 
                      title={draft.email_subject || ''} 
                      style={{ fontSize: '0.82rem', color: '#1E293B', fontWeight: '600', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {cleanSubject(draft.email_subject)}
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
                        padding: '3px 8px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: '900',
                        backgroundColor: '#DEF7EC',
                        color: '#03543F',
                        border: '1px solid #86EFAC',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}>
                        <CheckCircle2 size={11} color="#059669" />
                        <span>INYECTADO {draft.order_number ? `(${draft.order_number})` : ''}</span>
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

                <div style={{ fontSize: '0.8rem', color: '#4B5563' }} title={draft.email_subject || ''}>
                  <strong>Asunto:</strong> {cleanSubject(draft.email_subject)}
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
                          const resolvedPrice = matchedProd ? getResolvedPriceForDraft(draft, matchedProd.id) : 0;
                          return acc + (resolvedPrice * (item.quantity || 0));
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
      {selectedDraft && (() => {
        const matchedProfile = profiles.find(p => p.id === selectedDraft.profile_id);
        return (
          <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1.25rem',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
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
            
            /* Hide spin buttons in number inputs */
            input::-webkit-outer-spin-button,
            input::-webkit-inner-spin-button {
              -webkit-appearance: none;
              margin: 0;
            }
            input[type=number] {
              -moz-appearance: textfield;
            }
          `}</style>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '24px',
            width: '98%',
            maxWidth: showFloatingEmail ? '1750px' : '1280px',
            height: '93vh',
            maxHeight: '93vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
            position: 'relative',
            overflow: 'hidden',
            border: `1px solid ${THEME.colors.border}`,
            transition: 'max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}>
            {/* Mesa de Trabajo Header: TIER 1 (Ultra Clean, Compact & Powerful) */}
            <div style={{ 
              padding: '0.85rem 1.5rem', 
              backgroundColor: matchedProfile ? '#F0FDF4' : '#FFF7ED', 
              borderBottom: `1px solid ${matchedProfile ? '#BBF7D0' : '#FFEDD5'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              flexShrink: 0
            }}>
              {/* Left Side: Client Selector, Delivery Date, Real Reception Window & Tier 2 Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ color: matchedProfile ? '#16A34A' : '#D97706', display: 'flex', alignItems: 'center' }}>
                  {matchedProfile ? <CheckCircle2 size={24} strokeWidth={2} /> : <AlertTriangle size={24} strokeWidth={2} />}
                </div>

                {/* Interactive Client Selector */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsClientSearchOpen(prev => !prev);
                      setFocusedClientSearchIndex(-1);
                    }}
                    style={{
                      background: matchedProfile ? '#FFFFFF' : '#FEF3C7',
                      border: `1.5px solid ${matchedProfile ? '#86EFAC' : '#F59E0B'}`,
                      borderRadius: '10px',
                      padding: '6px 14px',
                      fontSize: '0.9rem',
                      fontWeight: '900',
                      color: matchedProfile ? '#065F46' : '#92400E',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                      transition: 'all 0.15s ease'
                    }}
                    title="Clic para cambiar o buscar cliente"
                  >
                    <Building2 size={16} color={matchedProfile ? '#059669' : '#D97706'} />
                    <span style={{ maxWidth: '480px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {matchedProfile 
                        ? (matchedProfile.company_name || matchedProfile.contact_name)
                        : (selectedDraft.client_detected_name ? `Asignar: ${selectedDraft.client_detected_name}` : 'Seleccionar Cliente')}
                    </span>
                    <ChevronDown size={14} color={matchedProfile ? '#059669' : '#B45309'} />
                  </button>

                  {isClientSearchOpen && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '8px',
                      width: '450px',
                      maxHeight: '380px',
                      backgroundColor: 'white',
                      borderRadius: '14px',
                      boxShadow: '0 15px 35px -5px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.08)',
                      border: '1px solid #CBD5E1',
                      zIndex: 10000,
                      padding: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1.5px solid #3B82F6' }}>
                        <Search size={16} color="#3B82F6" />
                        <input
                          autoFocus
                          type="text"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          placeholder="Buscar Empresa, Sucursal, NIT, Dirección..."
                          value={clientSearchQuery}
                          onChange={e => {
                            setClientSearchQuery(e.target.value);
                            setFocusedClientSearchIndex(0);
                          }}
                          onKeyDown={e => {
                            if (filteredClientProfiles.length === 0) return;
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setFocusedClientSearchIndex(prev => Math.min(prev + 1, filteredClientProfiles.length - 1));
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setFocusedClientSearchIndex(prev => Math.max(prev - 1, 0));
                            } else if (e.key === 'Enter' || e.key === 'Tab') {
                              const targetIdx = focusedClientSearchIndex >= 0 ? focusedClientSearchIndex : 0;
                              if (filteredClientProfiles[targetIdx]) {
                                e.preventDefault();
                                handleSelectClientProfile(filteredClientProfiles[targetIdx]);
                              }
                            } else if (e.key === 'Escape') {
                              setIsClientSearchOpen(false);
                            }
                          }}
                          style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.88rem', fontWeight: 600, color: '#0F172A' }}
                        />
                        {clientSearchQuery && (
                          <button onClick={() => setClientSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8' }}><X size={14} /></button>
                        )}
                      </div>

                      <div style={{ overflowY: 'auto', maxHeight: '300px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {filteredClientProfiles.length === 0 ? (
                          <div style={{ padding: '16px', textAlign: 'center', color: '#94A3B8', fontSize: '0.82rem' }}>
                            No se encontraron clientes para &quot;{clientSearchQuery}&quot;
                          </div>
                        ) : (
                          filteredClientProfiles.map((p: any, pIdx: number) => {
                            const isFocused = pIdx === focusedClientSearchIndex;
                            const parentMatrix = p.parent_id ? matrixClientsMap.get(p.parent_id) : null;
                            const isDirectBranch = Boolean(p.isDirectSearchedBranch && parentMatrix);

                            return (
                              <div
                                key={p.id}
                                onClick={() => handleSelectClientProfile(p)}
                                onMouseEnter={() => setFocusedClientSearchIndex(pIdx)}
                                style={{
                                  padding: '10px 12px',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  backgroundColor: isFocused ? '#DBEAFE' : (isDirectBranch ? '#F0FDF4' : 'transparent'),
                                  borderLeft: isFocused ? '4px solid #2563EB' : '4px solid transparent',
                                  borderBottom: '1px solid #F1F5F9',
                                  transition: 'all 0.12s ease'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                  <div style={{ fontWeight: isFocused ? 800 : 700, color: isFocused ? '#1E3A8A' : '#0F172A', fontSize: '0.86rem' }}>
                                    {p.company_name || p.contact_name}
                                  </div>
                                  {parentMatrix && (
                                    <span style={{ fontSize: '0.66rem', backgroundColor: '#DCFCE7', color: '#15803D', padding: '2px 6px', borderRadius: '4px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                      Sucursal
                                    </span>
                                  )}
                                </div>

                                {parentMatrix && (
                                  <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600, marginTop: '2px' }}>
                                    Matriz: {parentMatrix.company_name}
                                  </div>
                                )}

                                <div style={{ fontSize: '0.74rem', color: isFocused ? '#1E40AF' : '#64748B', marginTop: '3px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                  {p.nit && <span><strong>NIT:</strong> {p.nit}</span>}
                                  {p.address && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><MapPin size={11} color="#64748B" /> {p.address} {p.city ? `(${p.city})` : ''}</span>}
                                  {p.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Phone size={11} color="#64748B" /> {p.phone}</span>}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Delivery Date Picker */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#FFFFFF',
                  border: '1.5px solid #CBD5E1',
                  padding: '4px 10px',
                  borderRadius: '10px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}>
                  <Calendar size={14} color="#0D7A57" />
                  <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569' }}>Entrega:</span>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={e => setDeliveryDate(e.target.value)}
                    style={{
                      border: 'none',
                      fontSize: '0.85rem',
                      fontWeight: '800',
                      color: '#0F172A',
                      outline: 'none',
                      cursor: 'pointer',
                      background: 'transparent'
                    }}
                  />
                </div>

                {/* GPS Status Badge */}
                {draftCoordinates && checkIfInCoverage(draftCoordinates.lat, draftCoordinates.lng) ? (
                  <span style={{ backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', padding: '4px 8px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} color="#15803D" /> GPS OK
                  </span>
                ) : (
                  <span style={{ backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', padding: '4px 8px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} color="#D97706" /> Sin GPS
                  </span>
                )}

                {/* Toggle Button for Tier 2 Details Drawer */}
                <button
                  type="button"
                  onClick={() => setIsClientDetailsExpanded(prev => !prev)}
                  style={{
                    backgroundColor: isClientDetailsExpanded ? '#0D7A57' : '#FFFFFF',
                    color: isClientDetailsExpanded ? 'white' : '#0D7A57',
                    border: '1.5px solid #0D7A57',
                    borderRadius: '10px',
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                >
                  <Info size={13} />
                  <span>{isClientDetailsExpanded ? 'Ocultar Ficha' : 'Ficha & Logística'}</span>
                  <span style={{ transform: isClientDetailsExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', fontSize: '0.75rem' }}>▾</span>
                </button>
              </div>

              {/* Right Side: Quick Action Buttons & Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                {/* Real-Time Audit Progress Badge */}
                {(() => {
                  const activeItems = editableItems.filter(it => !it.isDeleted);
                  const matchedCount = activeItems.filter(it => it.matched_product_id).length;
                  const isAllMatched = activeItems.length > 0 && matchedCount === activeItems.length;

                  return (
                    <span style={{ 
                      backgroundColor: isAllMatched ? '#ECFDF5' : '#FFFBEB', 
                      color: isAllMatched ? '#065F46' : '#B45309', 
                      border: `1.5px solid ${isAllMatched ? '#6EE7B7' : '#FCD34D'}`, 
                      padding: '4px 10px', 
                      borderRadius: '100px', 
                      fontSize: '0.76rem', 
                      fontWeight: '800',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}>
                      {isAllMatched ? <CheckCircle2 size={13} color="#059669" /> : <AlertTriangle size={13} color="#D97706" />}
                      <span>{isAllMatched ? `100% Auditado (${matchedCount}/${activeItems.length})` : `${matchedCount}/${activeItems.length} SKUs listos`}</span>
                    </span>
                  );
                })()}

                <button 
                  onClick={handleReparseDraft}
                  disabled={isReparsingDraft}
                  title="Re-extraer productos y cliente usando Inteligencia Artificial"
                  style={{ 
                    padding: '5px 12px', 
                    backgroundColor: isReparsingDraft ? '#DDD6FE' : '#7C3AED', 
                    borderRadius: '100px', 
                    fontSize: '0.76rem', 
                    fontWeight: '800', 
                    color: 'white',
                    border: '1.5px solid #6D28D9',
                    cursor: isReparsingDraft ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: '0 2px 4px rgba(124, 58, 237, 0.2)',
                    transition: 'all 0.2s'
                  }}
                >
                  <Sparkles size={13} className={isReparsingDraft ? 'animate-spin' : ''} />
                  {isReparsingDraft ? 'Extrayendo...' : '⚡ Re-extraer con IA'}
                </button>
                <button 
                  onClick={() => setSelectedDraft(null)} 
                  style={{ 
                    border: 'none', 
                    background: '#F8FAFC', 
                    cursor: 'pointer', 
                    color: '#64748B', 
                    width: '30px', 
                    height: '30px', 
                    borderRadius: '100px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    transition: 'all 0.15s' 
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#FEF2F2'; e.currentTarget.style.color = '#EF4444'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#F8FAFC'; e.currentTarget.style.color = '#64748B'; }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* TIER 2: DESPLEGABLE CON DETALLES COMPLETOS DE CLIENTE, GPS & LOGÍSTICA */}
            {isClientDetailsExpanded && (
              <div style={{
                backgroundColor: '#F8FAFC',
                borderBottom: '2px solid #E2E8F0',
                padding: '0.85rem 1.75rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '1rem',
                fontSize: '0.8rem',
                color: '#334155',
                animation: 'fadeInUp 0.25s ease-out',
                flexShrink: 0
              }}>
                {/* Columna 1: Dirección y GPS */}
                <div style={{ backgroundColor: 'white', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: '900', color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={13} color="#15803D" /> Dirección de Entrega & GPS
                  </div>
                  <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.86rem' }}>
                    {editableAddress || 'Dirección no registrada'}
                    <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#64748B', marginLeft: '4px' }}>
                      ({matchedProfile?.city || 'Bogotá'})
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span><strong>GPS:</strong> {draftCoordinates ? `${draftCoordinates.lat.toFixed(5)}, ${draftCoordinates.lng.toFixed(5)}` : 'Sin geocodificar'}</span>
                    {draftCoordinates && checkIfInCoverage(draftCoordinates.lat, draftCoordinates.lng) && (
                      <span style={{ color: '#15803D', fontWeight: '800' }}>● En Cobertura</span>
                    )}
                  </div>
                </div>

                {/* Columna 2: Logística y Horario de Recepción */}
                <div style={{ 
                  backgroundColor: 'white', 
                  padding: '0.75rem 1rem', 
                  borderRadius: '12px', 
                  border: isManualDelivery ? '1.5px solid #10B981' : '1px solid #E2E8F0', 
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  position: 'relative'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: '900', color: isManualDelivery ? '#15803D' : '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={13} color={isManualDelivery ? '#15803D' : '#0369A1'} /> 
                      {isManualDelivery ? 'Hora de Entrega Prioritaria' : 'Horario & Restricciones'}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTempDeliveryTime(manualDeliveryTime || '07:30');
                        setTempDeliveryMargin(manualDeliveryMargin || 30);
                        setShowDeliveryTimeModal(true);
                      }}
                      style={{
                        background: isManualDelivery ? '#DCFCE7' : '#F1F5F9',
                        color: isManualDelivery ? '#166534' : '#0F172A',
                        border: `1px solid ${isManualDelivery ? '#86EFAC' : '#CBD5E1'}`,
                        borderRadius: '6px',
                        padding: '2px 8px',
                        fontSize: '0.7rem',
                        fontWeight: '800',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease'
                      }}
                      title="Cambiar hora de entrega y tolerancia"
                    >
                      <Edit2 size={10} />
                      {isManualDelivery ? 'Modificar' : 'Cambiar hora de entrega'}
                    </button>
                  </div>
                  <div style={{ fontWeight: '900', color: isManualDelivery ? '#166534' : '#0F172A', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isManualDelivery ? (
                      <>
                        <span>{manualDeliveryTime} (±{manualDeliveryMargin} min)</span>
                        <span style={{ fontSize: '0.65rem', backgroundColor: '#10B981', color: 'white', padding: '1px 6px', borderRadius: '4px', fontWeight: '900' }}>PRIORITARIO</span>
                      </>
                    ) : (
                      <span>{matchedProfile?.delivery_restrictions || (matchedProfile?.logistics_data?.start_time ? `${matchedProfile.logistics_data.start_time} - ${matchedProfile.logistics_data.end_time}` : '06:30 - 11:00')}</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span><strong>Canastillas:</strong> {matchedProfile?.needs_crates ? 'Requiere canastillas' : 'No requiere'}</span>
                    <span>•</span>
                    <span><strong>Tipo:</strong> {matchedProfile?.role === 'b2b_client' ? 'B2B Horeca' : 'B2C Hogar'}</span>
                  </div>
                </div>

                {/* Columna 3: Contacto, NIT y Origen */}
                <div style={{ backgroundColor: 'white', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: '900', color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <User size={13} color="#7C3AED" /> Encargado & Origen del Pedido
                  </div>
                  <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.86rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{matchedProfile?.contact_name || editableClientName || 'Encargado no asignado'}</span>
                    {matchedProfile?.nit && <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 'normal' }}>NIT: {matchedProfile.nit}</span>}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span><strong>Tel:</strong> {matchedProfile?.phone || matchedProfile?.contact_phone || editableClientPhone || '-'}</span>
                    <span>•</span>
                    <span style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedDraft.email_subject}>
                      <strong>Asunto:</strong> {cleanSubject(selectedDraft.email_subject)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* If Order is already approved/injected, show protected notice banner */}
            {(selectedDraft.status === 'approved' || selectedDraft.order_id) && (
              <div style={{
                backgroundColor: '#ECFDF5',
                borderBottom: '2px solid #86EFAC',
                padding: '0.85rem 1.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle2 size={24} color="#059669" />
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#065F46' }}>
                      Este pedido ya fue procesado con la orden #{selectedDraft.order_number || selectedDraft.order_id?.slice(0, 8).toUpperCase() || 'PED-PROCESADO'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#047857', marginTop: '1px' }}>
                      Fecha de entrega programada: <strong>{selectedDraft.delivery_date || deliveryDate}</strong>. Si necesitas modificar cantidades o agregar productos, puedes editarlo directamente en la sección de pedidos de ese día.
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <a
                    href={`/admin/orders?date=${selectedDraft.delivery_date || deliveryDate}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '6px 14px',
                      backgroundColor: '#059669',
                      color: 'white',
                      borderRadius: '8px',
                      fontWeight: '800',
                      fontSize: '0.78rem',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)'
                    }}
                  >
                    <ExternalLink size={13} /> Ir a Gestión de Pedidos de ese día
                  </a>
                </div>
              </div>
            )}

            {/* Split Canvas Body: Left (Document/Email Viewer 48%) & Right (Products Table 52%) */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'row',
              overflow: 'hidden',
              position: 'relative'
            }}>
              {/* Left Side: Document / Email Preview (Side-by-Side) */}
              {showFloatingEmail && (
                <div style={{ 
                  width: isFloatingExpanded ? '52%' : '48%', 
                  minWidth: '420px', 
                  borderRight: '2px solid #E2E8F0', 
                  backgroundColor: '#F8FAFC', 
                  padding: '1rem', 
                  display: 'flex', 
                  flexDirection: 'column',
                  overflow: 'hidden',
                  transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  flexShrink: 0 
                }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <FileText size={14} /> Documento Original
                      </span>
                      {(() => {
                        const metadata = getDraftMetadata(selectedDraft);
                        if (!metadata.attachmentUrl) return null;
                        return (
                          <div style={{ display: 'inline-flex', backgroundColor: '#E2E8F0', borderRadius: '6px', padding: '2px', marginLeft: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setActiveTab('email')}
                              style={{
                                padding: '3px 8px',
                                border: 'none',
                                borderRadius: '4px',
                                backgroundColor: activeTab === 'email' ? 'white' : 'transparent',
                                color: activeTab === 'email' ? '#1E293B' : '#64748B',
                                fontWeight: activeTab === 'email' ? 700 : 500,
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              <Mail size={11} /> Correo
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveTab('attachment')}
                              style={{
                                padding: '3px 8px',
                                border: 'none',
                                borderRadius: '4px',
                                backgroundColor: activeTab === 'attachment' ? 'white' : 'transparent',
                                color: activeTab === 'attachment' ? '#1E293B' : '#64748B',
                                fontWeight: activeTab === 'attachment' ? 700 : 500,
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              <Paperclip size={11} /> Adjunto
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {(() => {
                        const metadata = getDraftMetadata(selectedDraft);
                        let currentUrl = metadata.attachmentUrl;
                        let currentName = metadata.attachmentName;
                        if (metadata.attachments && metadata.attachments[selectedAttachmentIndex]) {
                          currentUrl = metadata.attachments[selectedAttachmentIndex].url;
                          currentName = metadata.attachments[selectedAttachmentIndex].name;
                        }
                        if (!currentUrl) return null;

                        const ext = (currentName || '').split('.').pop()?.toLowerCase() || '';
                        const isExcel = ext === 'xlsx' || ext === 'xls';

                        if (isExcel) {
                          return (
                            <button
                              type="button"
                              onClick={() => handleOpenExcelInNewTab(currentUrl, currentName || 'documento.xlsx')}
                              style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '800', backgroundColor: 'white', border: '1px solid #CBD5E1', color: '#1E293B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                              title="Abrir hoja de cálculo completa en una pestaña nueva"
                            >
                              <Maximize2 size={11} /> Abrir Pestaña Completa ↗
                            </button>
                          );
                        }

                        return (
                          <a href={currentUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                            <button style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '800', backgroundColor: 'white', border: '1px solid #CBD5E1', color: '#1E293B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                              <Maximize2 size={11} /> Abrir Pestaña ↗
                            </button>
                          </a>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => setIsFloatingExpanded(prev => !prev)}
                        style={{ padding: '3px 6px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '700', backgroundColor: 'white', border: '1px solid #CBD5E1', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title={isFloatingExpanded ? "Contraer" : "Expandir"}
                      >
                        {isFloatingExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                      </button>
                    </div>
                  </div>

                  {/* Document Content Viewport */}
                  <div style={{ flex: 1, minHeight: '520px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
                    {(() => {
                      const metadata = getDraftMetadata(selectedDraft);
                      
                      // PESTAÑA: Adjunto
                      if (activeTab === 'attachment') {
                        let currentUrl = metadata.attachmentUrl;
                        let currentName = metadata.attachmentName;
                        if (metadata.attachments && Array.isArray(metadata.attachments) && metadata.attachments.length > 0) {
                          const selectedAtt = metadata.attachments[selectedAttachmentIndex];
                          if (selectedAtt) {
                            currentUrl = selectedAtt.url;
                            currentName = selectedAtt.name;
                          }
                        }

                        if (!currentUrl) {
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '24px', backgroundColor: '#F8FAFC', color: '#64748B' }}>
                              <span>No hay documentos adjuntos.</span>
                            </div>
                          );
                        }

                        const attachmentName = currentName || '';
                        const ext = attachmentName.split('.').pop()?.toLowerCase() || '';

                        const renderSelector = () => {
                          if (!metadata.attachments || !Array.isArray(metadata.attachments) || metadata.attachments.length <= 1) return null;
                          return (
                            <div style={{
                              display: 'flex',
                              gap: '6px',
                              padding: '6px 10px',
                              backgroundColor: '#F1F5F9',
                              borderBottom: '1px solid #E2E8F0',
                              overflowX: 'auto',
                              whiteSpace: 'nowrap'
                            }} className="premium-scrollbar">
                              {metadata.attachments.map((att: any, idx: number) => {
                                const isActive = idx === selectedAttachmentIndex;
                                const isProcessed = att.processed === true;
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleSelectAttachment(idx)}
                                    style={{
                                      padding: '4px 10px',
                                      borderRadius: '16px',
                                      border: '1px solid',
                                      borderColor: isActive ? '#2563EB' : (isProcessed ? '#10B981' : '#CBD5E1'),
                                      backgroundColor: isActive ? '#EFF6FF' : (isProcessed ? '#ECFDF5' : 'white'),
                                      color: isActive ? '#2563EB' : (isProcessed ? '#047857' : '#475569'),
                                      fontSize: '0.7rem',
                                      fontWeight: isActive ? 800 : 500,
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    <span>{isProcessed ? <CheckCircle2 size={12} color="#10B981" /> : <Paperclip size={12} />}</span>
                                    <span style={{ maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={att.name}>
                                      {att.name}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        };

                        const wrapContent = (content: React.ReactNode) => (
                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                            {renderSelector()}
                            {content}
                          </div>
                        );

                        // PDF
                        if (ext === 'pdf') {
                          return wrapContent(
                            <div style={{ flex: 1, backgroundColor: '#F8FAFC', position: 'relative', overflow: 'hidden' }}>
                              <PdfCanvasViewer file={null} fileUrl={currentUrl} />
                            </div>
                          );
                        }

                        // Excel (.xlsx, .xls)
                        if (ext === 'xlsx' || ext === 'xls') {
                          if (loadingAttachment) {
                            return wrapContent(
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '12px', padding: '24px', backgroundColor: '#F8FAFC' }}>
                                <Loader2 size={32} color="#2563EB" className="animate-spin" />
                                <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>Cargando tabla Excel...</span>
                              </div>
                            );
                          }
                          
                          if (excelSheetsData && excelSheetsData.length > 0) {
                            const currentSheet = excelSheetsData[selectedExcelSheetIndex] || excelSheetsData[0];
                            const filteredRows = (currentSheet.rows || []).filter((r: any) => {
                              if (excelFilterOnlyWithQty && !r.hasQty && !r.isHeader && !r.isMeta) return false;
                              if (excelSearchTerm) {
                                const term = excelSearchTerm.toLowerCase();
                                const textMatch = r.cells.some((c: string) => c.toLowerCase().includes(term));
                                return textMatch || r.isHeader;
                              }
                              return true;
                            });

                            return wrapContent(
                              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
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
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {excelSheetsData.map((s: any, sIdx: number) => (
                                      <button
                                        key={sIdx}
                                        type="button"
                                        onClick={() => setSelectedExcelSheetIndex(sIdx)}
                                        style={{
                                          padding: '4px 10px',
                                          borderRadius: '6px',
                                          border: selectedExcelSheetIndex === sIdx ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                                          backgroundColor: selectedExcelSheetIndex === sIdx ? '#EFF6FF' : '#FFFFFF',
                                          color: selectedExcelSheetIndex === sIdx ? '#1D4ED8' : '#475569',
                                          fontWeight: selectedExcelSheetIndex === sIdx ? 800 : 600,
                                          fontSize: '0.72rem',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        📄 {s.sheetName} ({s.countWithQty} pedidos)
                                      </button>
                                    ))}
                                  </div>

                                  {/* Filter & Zoom Controls */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <button
                                      type="button"
                                      onClick={() => setExcelFilterOnlyWithQty(prev => !prev)}
                                      style={{
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        border: excelFilterOnlyWithQty ? '1.5px solid #059669' : '1px solid #CBD5E1',
                                        backgroundColor: excelFilterOnlyWithQty ? '#ECFDF5' : '#FFFFFF',
                                        color: excelFilterOnlyWithQty ? '#065F46' : '#334155',
                                        fontWeight: 800,
                                        fontSize: '0.72rem',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        boxShadow: excelFilterOnlyWithQty ? '0 1px 3px rgba(16, 185, 129, 0.15)' : 'none'
                                      }}
                                    >
                                      {excelFilterOnlyWithQty ? <CheckCircle2 size={12} color="#059669" /> : <Filter size={12} />}
                                      {excelFilterOnlyWithQty 
                                        ? `Mostrando ${currentSheet.countWithQty} con cantidad` 
                                        : `Ver solo ${currentSheet.countWithQty} con cantidad`}
                                    </button>

                                    <input
                                      type="text"
                                      value={excelSearchTerm}
                                      onChange={e => setExcelSearchTerm(e.target.value)}
                                      placeholder="Buscar en Excel..."
                                      style={{
                                        padding: '3px 8px',
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
                                        onClick={() => setExcelZoomLevel(prev => Math.max(70, prev - 10))}
                                        style={{ padding: '2px 6px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 800 }}
                                        title="Reducir zoom"
                                      >-</button>
                                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0 4px', color: '#475569' }}>{excelZoomLevel}%</span>
                                      <button
                                        type="button"
                                        onClick={() => setExcelZoomLevel(prev => Math.min(140, prev + 10))}
                                        style={{ padding: '2px 6px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 800 }}
                                        title="Aumentar zoom"
                                      >+</button>
                                    </div>
                                  </div>
                                </div>

                                {/* Modern Google Sheets Table */}
                                <div className="premium-scrollbar" style={{ flex: 1, overflow: 'auto', backgroundColor: '#F8FAFC' }}>
                                  <table style={{
                                    borderCollapse: 'collapse',
                                    width: '100%',
                                    minWidth: 'max-content',
                                    fontSize: `${0.75 * (excelZoomLevel / 100)}rem`,
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
                                              const isQtyCell = cIdx === currentSheet.qtyCol && !isRowHeader && !isRowMeta;
                                              const isNameCell = cIdx === currentSheet.nameCol && !isRowHeader && !isRowMeta;

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
                                                      {r.qtyVal} {r.unitVal}
                                                    </span>
                                                  ) : (
                                                    cellText
                                                  )}
                                                </td>
                                              );
                                            })}

                                            {/* Quick Add Button for manual inspection */}
                                            {!isRowHeader && !isRowMeta && (
                                              <td style={{ padding: '2px 6px', textAlign: 'center', width: '50px' }}>
                                                <button
                                                  type="button"
                                                  title={`Añadir "${r.nameVal || 'fila ' + r.rowIndex}" al pedido`}
                                                  onClick={() => {
                                                    const prodName = r.nameVal || `Item fila ${r.rowIndex}`;
                                                    const prodQty = r.qtyVal || 1;
                                                    const prodUnit = r.unitVal || 'Kg';
                                                    
                                                    // Add to editableItems
                                                    setEditableItems(prev => [
                                                      ...prev,
                                                      {
                                                        originalName: prodName,
                                                        name: prodName,
                                                        quantity: prodQty,
                                                        unit: prodUnit,
                                                        matched_product_id: null,
                                                        searchQuery: prodName,
                                                        skuQuery: '',
                                                        isConfirmed: false
                                                      }
                                                    ]);
                                                    showToast(`Añadido "${prodName}" (${prodQty} ${prodUnit}) a la tabla de productos`, 'info');
                                                  }}
                                                  style={{
                                                    padding: '2px 6px',
                                                    backgroundColor: hasRowQty ? '#EFF6FF' : '#F1F5F9',
                                                    border: hasRowQty ? '1px solid #BFDBFE' : '1px solid #E2E8F0',
                                                    borderRadius: '4px',
                                                    color: hasRowQty ? '#1D4ED8' : '#64748B',
                                                    fontSize: '0.65rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer'
                                                  }}
                                                >
                                                  + Sumar
                                                </button>
                                              </td>
                                            )}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          }
                          
                          if (attachmentHtml) {
                            return wrapContent(
                              <div className="premium-scrollbar" style={{ flex: 1, overflow: 'auto', backgroundColor: '#F8FAFC', padding: '10px' }}>
                                <div dangerouslySetInnerHTML={{ __html: attachmentHtml }} />
                              </div>
                            );
                          }
                        }

                        // Imagen con Sistema de Zoom, Panorámica y Rotación
                        if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
                          return wrapContent(
                            <div style={{ flex: 1, backgroundColor: '#0F172A', display: 'flex', position: 'relative', overflow: 'hidden', minHeight: '380px' }}>
                              <ImageZoomViewer src={currentUrl} alt={attachmentName} />
                            </div>
                          );
                        }

                        // Office u otros
                        return wrapContent(
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '12px', padding: '24px', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                            <FileText size={40} color="#2563EB" />
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B' }}>{attachmentName}</span>
                            <a href={currentUrl} target="_blank" rel="noopener noreferrer" style={{ backgroundColor: '#2563EB', color: 'white', padding: '6px 14px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none' }}>
                              Descargar Documento
                            </a>
                          </div>
                        );
                      }

                      // PESTAÑA: Correo (Default - Réplica Fiel a Gmail)
                      return (
                        <GmailMessageViewer
                          draft={selectedDraft}
                          metadata={metadata}
                          onSwitchToAttachment={(idx) => {
                            if (typeof idx === 'number') {
                              setSelectedAttachmentIndex(idx);
                            }
                            setActiveTab('attachment');
                          }}
                        />
                      );
                    })()}
                  </div>

                  {/* Attachment footer label */}
                  {(() => {
                    const metadata = getDraftMetadata(selectedDraft);
                    let currentName = metadata.attachmentName;
                    if (metadata.attachments && metadata.attachments[selectedAttachmentIndex]) {
                      currentName = metadata.attachments[selectedAttachmentIndex].name;
                    }
                    if (!currentName) return null;
                    return (
                      <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#64748B' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }} title={currentName}>
                          <Paperclip size={12} /> {currentName}
                        </span>
                        <span style={{ fontWeight: 600 }}>Adjunto {selectedAttachmentIndex + 1} de {metadata.attachments?.length || 1}</span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Right Side: Products Table (Split-Screen Master Workspace) */}
              <div 
                id="email-draft-scroll-container"
                className="premium-scrollbar"
                style={{ flex: 1, minWidth: '460px', padding: '0', overflowY: 'auto', maxHeight: 'calc(93vh - 150px)', position: 'relative', scrollBehavior: 'smooth', backgroundColor: '#FFFFFF' }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', position: 'relative' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #F1F5F9' }}>
                      <th style={{ padding: '1rem', textAlign: 'center', width: '35px' }}>
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
                      <th style={{ ...THEME.typography?.tableHeader, padding: '1rem 1.25rem', textAlign: 'left', width: '35%' }}>NOMBRE EN DOCUMENTO</th>
                      <th style={{ ...THEME.typography?.tableHeader, padding: '1rem', textAlign: 'left', width: '42%' }}>TU PRODUCTO (ID)</th>
                      <th style={{ ...THEME.typography?.tableHeader, padding: '1rem', textAlign: 'center', width: '23%' }}>CANT.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableItems.map((item: any, i: number) => {
                      const matchedProd = products.find(p => p.id === item.matched_product_id);
                      const isConfidenceHigh = !!matchedProd && !item.isDeleted;

                      return (
                        <tr 
                          key={i} 
                          id={`draft-row-${i}`}
                          style={{ 
                            borderBottom: '1px solid #F8FAFC',
                            backgroundColor: item.isConfirmed 
                              ? '#F0FDF4' 
                              : (matchedProd ? (isConfidenceHigh ? 'white' : '#FEFCE8') : '#FFF7ED'),
                            transition: 'background-color 0.2s'
                          }}
                        >
                          <td style={{ padding: '0.8rem 0.5rem', textAlign: 'center', width: '35px' }}>
                            <input
                              type="checkbox"
                              disabled={item.isDeleted}
                              checked={selectedRowIndices.includes(i)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRowIndices(prev => [...prev, i]);
                                } else {
                                  setSelectedRowIndices(prev => prev.filter(idx => idx !== i));
                                }
                              }}
                              style={{ transform: 'scale(1.2)', cursor: item.isDeleted ? 'not-allowed' : 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '0.8rem 1.25rem', width: '35%' }}>
                            <div 
                              onClick={() => matchedProd && openCustomizingModal(matchedProd, i)}
                              style={{ 
                                fontSize: '0.88rem', 
                                fontWeight: '700', 
                                color: '#1E293B',
                                cursor: matchedProd ? 'pointer' : 'default'
                              }}
                              title={matchedProd ? 'Clic para personalizar producto' : undefined}
                            >
                              {item.originalName || item.name || item.producto || item.item || ''}
                            </div>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ backgroundColor: '#FFFBEB', color: '#B45309', border: '1.5px solid #FBBF24', boxShadow: '0 2px 4px rgba(245, 158, 11, 0.06)', padding: '2px 7px', borderRadius: '6px', fontWeight: '900' }}>
                                {formatDetectedUnit(item.originalQuantity || item.quantity || 1, item.originalUnit || item.unit)}
                              </span>
                              {matchedProd ? (
                                <span 
                                  onClick={() => openCustomizingModal(matchedProd, i)}
                                  style={{ backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', padding: '1px 6px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}
                                  title="Personalizar variantes / equivalencias"
                                >
                                  <CheckCircle2 size={11} color="#15803D" /> {item.confidenceScore ? `${item.confidenceScore}%` : '98%'}
                                  {clientFrequentProductIds.includes(matchedProd.id) && <span style={{ marginLeft: '2px', color: '#D97706' }}>⭐</span>}
                                </span>
                              ) : (
                                <span style={{ backgroundColor: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5', padding: '1px 6px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <AlertCircle size={11} color="#B91C1C" /> Sin Match
                                </span>
                              )}
                              {item.variant_label && (
                                <span style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', padding: '1px 6px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: '800' }}>
                                  {item.variant_label}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '0.5rem 1rem', position: 'relative', width: '42%' }}>
                            <input 
                              ref={el => { productInputRefs.current[i] = el; }}
                              type="text"
                              placeholder="Buscar ID..."
                              autoComplete="off"
                              autoCorrect="off"
                              spellCheck={false}
                              data-lpignore="true"
                              value={item.searchQuery !== undefined ? item.searchQuery : (matchedProd ? `${matchedProd.name} (${getAccountingIdDisplay(matchedProd)})` : '')}
                              onFocus={(e) => {
                                e.target.select();
                                setActiveDropdownRowIndex(i);
                                setFocusedDropdownItemIndex(0);
                                scrollToDraftRow(i);
                              }}
                              onBlur={() => {
                                setTimeout(() => {
                                  setActiveDropdownRowIndex(prev => prev === i ? null : prev);
                                }, 250);
                              }}
                              className="sku-search-input"
                              id={`sku-input-${i}`}
                              onKeyDown={(e) => {
                                const currentQuery = item.searchQuery !== undefined ? item.searchQuery : (matchedProd ? matchedProd.name : '');
                                const scoredList = getScoredProductsForQuery(currentQuery);

                                if (e.key === 'Tab') {
                                  const val = e.currentTarget.value;
                                  const p = (scoredList && scoredList[focusedDropdownItemIndex]) || products.find(prod => `${prod.name} (${getAccountingIdDisplay(prod)})` === val) || matchedProd;
                                  if (p) {
                                    e.preventDefault(); 
                                    selectProduct(p, i);
                                    setActiveDropdownRowIndex(null);
                                    openCustomizingModal(p, i);
                                  }
                                } else if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const selectedProd = (scoredList && scoredList[focusedDropdownItemIndex]) || products.find(prod => `${prod.name} (${getAccountingIdDisplay(prod)})` === e.currentTarget.value) || matchedProd;
                                  if (selectedProd) {
                                    selectProduct(selectedProd, i);
                                  }
                                  setActiveDropdownRowIndex(null);
                                  
                                  const nextIdx = i + 1;
                                  const nextInput = document.getElementById(`sku-input-${nextIdx}`) as HTMLInputElement | null;
                                  if (nextInput) {
                                    nextInput.focus();
                                    nextInput.select();
                                    scrollToDraftRow(nextIdx);
                                  } else {
                                    document.getElementById('btn-approve-draft')?.focus();
                                  }
                                } else if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  if (activeDropdownRowIndex === i && scoredList.length > 0) {
                                    setFocusedDropdownItemIndex(prev => Math.min(prev + 1, scoredList.length - 1));
                                  } else {
                                    const nextIdx = i + 1;
                                    const nextInput = document.getElementById(`sku-input-${nextIdx}`) as HTMLInputElement | null;
                                    if (nextInput) {
                                      nextInput.focus();
                                      nextInput.select();
                                      scrollToDraftRow(nextIdx);
                                    }
                                  }
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  if (activeDropdownRowIndex === i && focusedDropdownItemIndex > 0) {
                                    setFocusedDropdownItemIndex(prev => Math.max(prev - 1, 0));
                                  } else {
                                    const prevIdx = i - 1;
                                    if (prevIdx >= 0) {
                                      const prevInput = document.getElementById(`sku-input-${prevIdx}`) as HTMLInputElement | null;
                                      if (prevInput) {
                                        prevInput.focus();
                                        prevInput.select();
                                        scrollToDraftRow(prevIdx);
                                      }
                                    }
                                  }
                                } else if (e.key === 'Escape') {
                                  setActiveDropdownRowIndex(null);
                                }
                              }}
                              onChange={(e) => {
                                const val = e.target.value;
                                setActiveDropdownRowIndex(i);
                                setFocusedDropdownItemIndex(0);
                                const exactProduct = products.find(prod => `${prod.name} (${getAccountingIdDisplay(prod)})` === val || prod.name.toLowerCase() === val.toLowerCase());
                                
                                const newEdits = [...editableItems];
                                if (exactProduct) {
                                  newEdits[i].matched_product_id = exactProduct.id;
                                  newEdits[i].searchQuery = `${exactProduct.name} (${getAccountingIdDisplay(exactProduct)})`;
                                  newEdits[i].skuQuery = exactProduct.sku || '';
                                } else {
                                  newEdits[i].matched_product_id = null;
                                  newEdits[i].searchQuery = val;
                                  newEdits[i].skuQuery = '';
                                }
                                setEditableItems(newEdits);
                              }}
                              style={{ 
                                width: '100%', 
                                padding: '9px 12px', 
                                borderRadius: '10px', 
                                border: matchedProd ? (isConfidenceHigh ? '2px solid #E2E8F0' : '2px solid #FCD34D') : '2px solid #F97316',
                                fontSize: '0.92rem',
                                fontWeight: '700',
                                backgroundColor: matchedProd ? '#FFFFFF' : '#FFFBEB',
                                outline: 'none',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                              }}
                            />

                            {/* Custom Pareto Floating Dropdown (Exact Replica of Ingesta PDF - Imagen 2) */}
                            {activeDropdownRowIndex === i && (
                              <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                minWidth: '520px',
                                zIndex: 9999,
                                backgroundColor: 'white',
                                borderRadius: '12px',
                                boxShadow: '0 15px 35px -5px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0,0,0,0.08)',
                                border: '1px solid #CBD5E1',
                                marginTop: '4px',
                                maxHeight: '310px',
                                overflowY: 'auto'
                              }}>
                                {(() => {
                                  const currentQuery = item.searchQuery !== undefined ? item.searchQuery : (matchedProd ? matchedProd.name : '');
                                  const scoredList = getScoredProductsForQuery(currentQuery);

                                  if (scoredList.length === 0) {
                                    return (
                                      <div style={{ padding: '14px', fontSize: '0.85rem', color: '#94A3B8', textAlign: 'center', fontWeight: '600' }}>
                                        No se encontraron productos coincidentes
                                      </div>
                                    );
                                  }

                                  return scoredList.map((p, idx) => {
                                    const exc = clientExceptions.find(e => e.product_id === p.id);
                                    const freq = clientFrequentProductMap[p.id];
                                    const isClientHabitual = Boolean(exc || freq);
                                    const isFocused = idx === focusedDropdownItemIndex;

                                    return (
                                      <div
                                        key={p.id}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          selectProduct(p, i);
                                          setActiveDropdownRowIndex(null);
                                          if (p.options_config && p.options_config.length > 0) {
                                            openCustomizingModal(p, i);
                                          }
                                        }}
                                        onMouseEnter={() => setFocusedDropdownItemIndex(idx)}
                                        style={{
                                          padding: '0.85rem 1.15rem',
                                          cursor: 'pointer',
                                          borderBottom: '1px solid #E2E8F0',
                                          borderLeft: isFocused ? '6px solid #2563EB' : '6px solid transparent',
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                          backgroundColor: isFocused 
                                            ? '#DBEAFE' 
                                            : (isClientHabitual ? '#F0FDF4' : 'white'),
                                          boxShadow: isFocused ? 'inset 0 0 0 1px #93C5FD, 0 2px 4px rgba(37, 99, 235, 0.08)' : 'none',
                                          transition: 'all 0.12s ease-in-out'
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                          <span style={{ 
                                            fontWeight: isFocused ? '900' : '700', 
                                            color: isFocused ? '#1E3A8A' : '#111827',
                                            fontSize: '0.9rem'
                                          }}>
                                            {p.name} <span style={{ fontSize: '0.8em', color: isFocused ? '#2563EB' : '#6B7280', fontWeight: '600' }}>(ID Contable: {getAccountingIdDisplay(p)})</span>
                                          </span>
                                          {isClientHabitual && (
                                            <span style={{ 
                                              fontSize: '0.7rem', 
                                              backgroundColor: isFocused ? '#BBF7D0' : '#DCFCE7', 
                                              color: '#15803D', 
                                              padding: '2px 8px', 
                                              borderRadius: '999px', 
                                              fontWeight: '800', 
                                              display: 'inline-flex', 
                                              alignItems: 'center', 
                                              gap: '4px',
                                              border: isFocused ? '1.5px solid #22C55E' : '1px solid #86EFAC'
                                            }}>
                                              ⭐ Habitual {exc?.nickname && exc.nickname.trim().toLowerCase() !== p.name.trim().toLowerCase() ? `(Alias: ${exc.nickname})` : ''}
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px', flexShrink: 0 }}>
                                          <span style={{ fontSize: '0.85rem', fontWeight: isFocused ? '800' : '700', color: isFocused ? '#1E40AF' : '#166534' }}>
                                            {formatMoney(contractPrices[p.id] || p.base_price)}/{p.unit_of_measure}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.5rem 1rem', textAlign: 'center', width: '23%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                              <input 
                                ref={el => { quantityInputRefs.current[i] = el; }}
                                type="text"
                                id={`draft-qty-input-${i}`}
                                value={focusedRowIndex === i ? (item.quantity_text !== undefined ? item.quantity_text : String(item.quantity || '').replace('.', ',')) : (item.quantity !== undefined && item.quantity !== null ? formatQuantity(item.quantity) : '')}
                                onFocus={(e) => {
                                  setFocusedRowIndex(i);
                                  e.target.select();
                                  scrollToDraftRow(i);
                                }}
                                onBlur={() => {
                                  setFocusedRowIndex(null);
                                  const newEdits = [...editableItems];
                                  newEdits[i].quantity_text = undefined;
                                  setEditableItems(newEdits);
                                }}
                                onChange={(e) => {
                                  const rawVal = e.target.value;
                                  const parsed = parseQuantity(rawVal);
                                  const newEdits = [...editableItems];
                                  newEdits[i].quantity_text = rawVal;
                                  newEdits[i].quantity = parsed;
                                  setEditableItems(newEdits);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === '.' || e.key === ',') {
                                    e.preventDefault();
                                    const input = e.currentTarget;
                                    const start = input.selectionStart ?? 0;
                                    const end = input.selectionEnd ?? 0;
                                    const val = input.value;
                                    const newVal = val.substring(0, start) + ',' + val.substring(end);
                                    
                                    const parsed = parseQuantity(newVal);
                                    const newEdits = [...editableItems];
                                    newEdits[i].quantity_text = newVal;
                                    newEdits[i].quantity = parsed;
                                    setEditableItems(newEdits);
                                    
                                    setTimeout(() => {
                                      input.setSelectionRange(start + 1, start + 1);
                                    }, 10);
                                  } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const nextIdx = i + 1;
                                    const nextInput = document.getElementById(`sku-input-${nextIdx}`) as HTMLInputElement | null;
                                    if (nextInput) {
                                      nextInput.focus();
                                      nextInput.select();
                                      scrollToDraftRow(nextIdx);
                                    } else {
                                      document.getElementById('btn-approve-draft')?.focus();
                                    }
                                  }
                                }}
                                style={{ 
                                  width: '75px', 
                                  padding: '9px', 
                                  borderRadius: '8px', 
                                  border: '2px solid #E2E8F0', 
                                  textAlign: 'center',
                                  fontWeight: '800',
                                  fontSize: '1rem',
                                  backgroundColor: 'white'
                                }}
                              />
                              <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#475569', minWidth: '40px', textAlign: 'left' }}>
                                {item.originalUnit || item.unit || (matchedProd ? matchedProd.unit_of_measure : 'Kg')}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Bottom of Right Panel: Add Row & Actions */}
                <div style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F1F5F9' }}>
                  <button
                    type="button"
                    onClick={handleAddManualItem}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#EFF6FF',
                      color: '#1D4ED8',
                      border: '1px solid #BFDBFE',
                      borderRadius: '8px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Plus size={16} /> Agregar Producto Manual
                  </button>

                  {recentlyDeletedItems.length > 0 && selectedDraft?.source_email && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setActionConfirm({
                          isOpen: true,
                          title: 'Notificar Novedades de Productos',
                          message: `¿Deseas enviar un correo al cliente (${selectedDraft.source_email}) notificando los ${recentlyDeletedItems.length} productos no disponibles o eliminados?`,
                          confirmText: 'Enviar Notificación',
                          onConfirm: async () => {
                            try {
                              setSaving(true);
                              await handleSendBatchNovedadEmail();
                              setRecentlyDeletedItems([]);
                              showToast('Novedades notificadas consolidadas al cliente por correo.', 'success');
                            } catch (err: any) {
                              showToast(`Error al notificar al cliente: ${err.message || 'Error de conexión'}`, 'error');
                            } finally {
                              setSaving(false);
                            }
                          }
                        });
                      }}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#FEF3C7',
                        color: '#B45309',
                        border: '1px solid #FCD34D',
                        borderRadius: '8px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Mail size={16} /> Notificar Novedades ({recentlyDeletedItems.length})
                    </button>
                  )}
                </div>
              </div>
            </div> {/* Closes Split Canvas Body */}

          {/* Master Sticky Bottom Floating Ribbon (Exact Replica of Ingesta PDF - Imagen 3) */}
          {(() => {
            const activeItems = editableItems.filter(itm => !itm.isDeleted);
            let subtotal = 0;
            let totalTax = 0;

            activeItems.forEach(item => {
              const prod = products.find(p => p.id === item.matched_product_id);
              const qty = Number(item.quantity) || 0;
              const price = prod ? (contractPrices[prod.id] || prod.base_price || 0) : 0;
              const lineSubtotal = qty * price;
              const ivaRate = prod?.iva_rate ? (Number(prod.iva_rate) / 100) : 0;
              subtotal += lineSubtotal;
              totalTax += lineSubtotal * ivaRate;
            });

            const totalPayable = subtotal + totalTax;

            return (
              <div style={{
                padding: '0.85rem 2rem',
                borderTop: `1.5px solid #E2E8F0`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#FFFFFF',
                flexShrink: 0,
                boxShadow: '0 -6px 25px rgba(0, 0, 0, 0.06)',
                flexWrap: 'wrap',
                gap: '1.25rem',
                borderRadius: '0 0 24px 24px'
              }}>
                {/* LEFT: Quick Items & Financial Badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.4rem', flexWrap: 'wrap' }}>
                  {/* Items Badge */}
                  <div style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.55rem', 
                    backgroundColor: activeItems.length > 0 ? '#E8F5EE' : '#F1F5F9', 
                    color: activeItems.length > 0 ? '#0D7A57' : '#64748B', 
                    padding: '0.5rem 1.15rem', 
                    borderRadius: '100px', 
                    fontWeight: '800', 
                    fontSize: '0.88rem',
                    border: `1.5px solid ${activeItems.length > 0 ? '#A7D7C5' : '#E2E8F0'}`,
                    boxShadow: activeItems.length > 0 ? '0 2px 8px rgba(13, 122, 87, 0.1)' : 'none'
                  }}>
                    <ShoppingCart size={17} />
                    <span>{activeItems.length} {activeItems.length === 1 ? 'Ítem' : 'Ítems en Pedido'}</span>
                  </div>

                  {/* Subtotal & IVA */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.88rem', color: '#4B5563' }}>
                    <span>Subtotal: <strong style={{ color: '#1A231E', fontWeight: '800' }}>{formatMoney(subtotal)}</strong></span>
                    <span style={{ color: '#CBD5E1' }}>•</span>
                    <span>IVA Est.: <strong style={{ color: '#1A231E', fontWeight: '800' }}>{formatMoney(totalTax)}</strong></span>
                  </div>

                  {/* Action: Delete selected */}
                  {isEditing && selectedRowIndices.length > 0 && (
                    <button
                      type="button"
                      onClick={handleBatchDelete}
                      style={{
                        background: 'none', border: 'none', color: '#DC2626', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '0.5rem'
                      }}
                    >
                      <Trash2 size={15} /> Eliminar ({selectedRowIndices.length})
                    </button>
                  )}
                </div>

                {/* RIGHT: Big Total & Action Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.6rem', flexWrap: 'wrap' }}>
                  {hasUnmatchedItems && (
                    <span style={{ color: '#EF4444', fontSize: '0.8rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={14} color="#EF4444" /> Debe mapear todos los productos
                    </span>
                  )}

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#0D7A57', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      TOTAL A PAGAR
                    </span>
                    <span style={{ fontSize: '1.6rem', fontWeight: '900', color: '#0D7A57', letterSpacing: '-0.02em', lineHeight: '1.2' }}>
                      {formatMoney(totalPayable)}
                    </span>
                  </div>

                  <button 
                    onClick={() => setSelectedDraft(null)}
                    style={{ padding: '0.85rem 1.4rem', backgroundColor: '#F8FAFC', border: `1.5px solid #CBD5E1`, borderRadius: '14px', fontWeight: 700, color: '#475569', cursor: 'pointer', transition: 'all 0.15s', fontSize: '0.92rem' }}
                  >
                    Cancelar
                  </button>

                  {selectedDraft.status === 'pending' && (
                    <button 
                      id="btn-approve-draft"
                      onClick={handleApprove}
                      disabled={saving || hasUnmatchedItems || activeItems.length === 0}
                      style={{
                        padding: '0.9rem 2.2rem',
                        borderRadius: '16px',
                        background: (!hasUnmatchedItems && activeItems.length > 0) ? 'linear-gradient(135deg, #0D7A57 0%, #064E3B 100%)' : '#94A3B8',
                        color: 'white',
                        border: 'none',
                        fontWeight: '800',
                        fontSize: '1.05rem',
                        letterSpacing: '0.02em',
                        cursor: (saving || hasUnmatchedItems || activeItems.length === 0) ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        boxShadow: (!hasUnmatchedItems && activeItems.length > 0) ? '0 6px 20px -2px rgba(13, 122, 87, 0.45)' : 'none',
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                      onMouseOver={(e) => {
                        if (!hasUnmatchedItems && activeItems.length > 0 && !saving) {
                          e.currentTarget.style.background = 'linear-gradient(135deg, #0A5F43 0%, #04382A 100%)';
                          e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                          e.currentTarget.style.boxShadow = '0 10px 25px -2px rgba(13, 122, 87, 0.55)';
                        }
                      }}
                      onMouseOut={(e) => {
                        if (!hasUnmatchedItems && activeItems.length > 0 && !saving) {
                          e.currentTarget.style.background = 'linear-gradient(135deg, #0D7A57 0%, #064E3B 100%)';
                          e.currentTarget.style.transform = 'translateY(0) scale(1)';
                          e.currentTarget.style.boxShadow = '0 6px 20px -2px rgba(13, 122, 87, 0.45)';
                        }
                      }}
                    >
                      {saving ? (
                        <>
                          <Loader2 size={19} style={{ animation: 'spin 1s linear infinite' }} />
                          <span>Creando...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={19} />
                          <span>CONFIRMAR PEDIDO</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  })()}

      {duplicateMatchConfirm && duplicateMatchConfirm.isOpen && (
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
          zIndex: 16000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            width: '90%',
            maxWidth: '480px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            padding: '24px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#FEF3C7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#D97706'
            }}>
              <AlertTriangle size={28} />
            </div>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#111827',
              margin: '0 0 8px 0'
            }}>
              Producto Duplicado Detectado
            </h3>
            <p style={{
              fontSize: '0.9rem',
              color: '#4B5563',
              margin: '0 0 24px 0',
              lineHeight: '1.6'
            }}>
              El producto <strong>{duplicateMatchConfirm.product.name}</strong> 
              {(() => {
                const acctId = getAccountingIdDisplay(duplicateMatchConfirm.product);
                return acctId && acctId !== duplicateMatchConfirm.product.id ? ` (ID Contable: ${acctId})` : '';
              })()} 
              ya está asignado a otra línea activa de este pedido. ¿Cómo deseas proceder?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={handleMergeDuplicateMatch}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  backgroundColor: '#10B981',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                }}
              >
                Sumar y unificar cantidades
              </button>
              <button
                type="button"
                onClick={handleKeepBothMatches}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  backgroundColor: '#2563EB',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
                }}
              >
                Mantener filas separadas
              </button>
              <button
                type="button"
                onClick={() => setDuplicateMatchConfirm(null)}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  backgroundColor: '#F3F4F6',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 700,
                  color: '#4B5563',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
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
                  <MapPin size={16} color="#059669" /> Ubicación del Pedido
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
              <GoogleMapComponent
                key={`${draftCoordinates.lat}-${draftCoordinates.lng}`}
                defaultCenter={draftCoordinates}
                defaultZoom={15}
                gestureHandling={'greedy'}
                style={{ width: '100%', height: '100%' }}
              >
                <Marker position={draftCoordinates} />
              </GoogleMapComponent>
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
                {checkIfInCoverage(draftCoordinates.lat, draftCoordinates.lng) ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={13} color="#059669" /> Dirección en cobertura de FruFresco
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={13} color="#DC2626" /> Dirección fuera de cobertura
                  </span>
                )}
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
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', fontSize: '0.85rem', color: '#B45309', fontWeight: 600 }}>
                      <AlertTriangle size={13} color="#D97706" /> Se enviará junto con los productos ya eliminados: {recentlyDeletedItems.join(', ')}
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
                color: THEME.colors.textMain,
                fontFamily: 'var(--font-outfit), sans-serif',
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
                  autoFocus
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
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <AlertTriangle size={14} color="#EF4444" style={{ flexShrink: 0 }} />
                  <span>No es posible rechazar por monto mínimo ya que el valor estimado de este pedido es de {formatMoney(rejectModal.totalValue)} (igual o mayor a $100.000).</span>
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
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <AlertTriangle size={14} color="#EF4444" style={{ flexShrink: 0 }} />
                  <span>No es posible rechazar por falta de cobertura ya que la dirección se encuentra dentro de la zona de cobertura actual de FruFresco.</span>
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
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <AlertTriangle size={14} color="#EF4444" style={{ flexShrink: 0 }} />
                  <span>No es posible rechazar la totalidad del pedido por productos no comercializados ya que tienes productos homologados válidos. Elimina del listado los productos no comercializados y procesa el resto.</span>
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
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <AlertTriangle size={14} color="#EF4444" style={{ flexShrink: 0 }} />
                  <span>No es posible rechazar por datos insuficientes ya que se cuenta con dirección de entrega, correo y teléfono de contacto completos.</span>
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
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <AlertTriangle size={14} color="#EF4444" style={{ flexShrink: 0 }} />
                  <span>No es posible rechazar por duplicado ya que no se encontraron otras solicitudes del mismo remitente el día de hoy.</span>
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
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <AlertTriangle size={14} color="#EF4444" style={{ flexShrink: 0 }} />
                  <span>El perfil del cliente se encuentra activo y no registra bloqueos vigentes en la base de datos.</span>
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
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <AlertTriangle size={14} color="#EF4444" style={{ flexShrink: 0 }} />
                  <span>No es posible rechazar la totalidad del pedido por falta de stock ya que tienes productos disponibles. Elimina del listado los productos sin stock y procesa el resto.</span>
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
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <AlertTriangle size={14} color="#EF4444" style={{ flexShrink: 0 }} />
                  <span>El correo del pedido fue recibido antes de la hora de corte operativa (8:00 PM), por lo que se encuentra dentro del horario para entrega de mañana.</span>
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

                      const data = await safeFetchJson(res);
                      if (data.warning) {
                        showToast(data.warning, 'info');
                      } else {
                        showToast(`Borrador de pedido rechazado por ${rejectReason === 'cobertura' ? 'falta de cobertura' : rejectReason === 'monto_minimo' ? 'monto mínimo' : 'productos no comercializados'}. Se ha notificado al cliente.`, 'success');
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
                <div style={{ backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={20} />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: THEME.colors.textMain, margin: 0, fontFamily: 'var(--font-outfit), sans-serif' }}>
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
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: THEME.colors.textMain, marginBottom: '0.5rem', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontFamily: 'var(--font-outfit), sans-serif' }}>
                <span>CLIENTE DETECTADO</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: getDraftMetadata(selectedDraft).clientType === 'b2b_client' ? '#E0F2FE' : '#FCE7F3', color: getDraftMetadata(selectedDraft).clientType === 'b2b_client' ? '#0369A1' : '#9D174D', fontWeight: '900' }}>
                    {getDraftMetadata(selectedDraft).clientType === 'b2b_client' ? 'B2B / HORECA' : 'HOGAR / B2C'}
                  </span>
                  {activePricingModel && (
                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: isB2CDefault ? '#FFF7ED' : '#E0F2FE', color: isB2CDefault ? '#C2410C' : '#0369A1', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Tag size={11} /> {isB2CDefault ? 'Tarifa B2C (Defecto)' : `Modelo: ${activePricingModel.name}`}
                    </span>
                  )}
                </div>
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
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.05em', marginBottom: '0.5rem', textTransform: 'uppercase', fontFamily: 'var(--font-outfit), sans-serif' }}>PRODUCTOS DEL PEDIDO</div>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAF9', borderBottom: '1px solid #E2E8F0', textAlign: 'left', fontWeight: 800, color: '#4B5563', fontFamily: 'var(--font-outfit), sans-serif' }}>
                      <th style={{ padding: '0.65rem 1rem' }}>Producto (Mapeado)</th>
                      <th style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>Cant.</th>
                      <th style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableItems.filter(item => !item.isDeleted).map((item: any, idx: number) => {
                      if (!item.matched_product_id) return null;
                      const prod = products.find(p => p.id === item.matched_product_id);
                      const qty = parseFloat(item.quantity?.toString() || '0');
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', color: '#1E293B' }}>
                          <td style={{ padding: '0.65rem 1rem' }}>
                            <div style={{ fontWeight: 600 }}>{prod?.name}</div>
                            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{item.originalName}</div>
                          </td>
                          <td style={{ padding: '0.65rem 1rem', textAlign: 'center', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>{qty}</td>
                          <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>{formatMoney((prod?.base_price || 0) * qty)}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ backgroundColor: '#F8FAF9', borderTop: '2px solid #E2E8F0', fontWeight: 'bold', fontSize: '0.95rem', color: THEME.colors.textMain }}>
                      <td style={{ padding: '0.8rem 1rem', fontFamily: 'var(--font-outfit), sans-serif' }}>TOTAL</td>
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>-</td>
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'right', color: THEME.colors.primary, fontSize: '1.15rem', fontWeight: 900, fontFamily: 'var(--font-outfit), sans-serif', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(totalValue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Delivery and payment inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem', fontFamily: 'var(--font-outfit), sans-serif' }}>FECHA DE ENTREGA:</label>
                <input 
                  type="date" 
                  value={deliveryDate} 
                  min={minDeliveryDate}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    const minDate = getMinDeliveryDate();
                    if (newDate < minDate) {
                      showToast(`La fecha mínima de entrega permitida es ${minDate}.`, 'error');
                      setDeliveryDate(minDate);
                      return;
                    }
                    setDeliveryDate(newDate);
                  }} 
                  style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: '10px', border: `1.5px solid ${THEME.colors.border}`, outline: 'none', fontSize: '0.85rem', fontWeight: 700 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem', fontFamily: 'var(--font-outfit), sans-serif' }}>FRANJA HORARIA:</label>
                {(() => {
                  const matchedProfile = profiles.find(p => p.id === selectedDraft?.profile_id);
                  const hasCustomSchedule = matchedProfile?.logistics_data && 
                    (matchedProfile.logistics_data.start_time || matchedProfile.logistics_data.end_time);
                  return (
                    <>
                      <select 
                        value={deliverySlot} 
                        onChange={(e) => setDeliverySlot(e.target.value)} 
                        disabled={!!hasCustomSchedule}
                        style={{ 
                          width: '100%', 
                          padding: '0.65rem 0.8rem', 
                          borderRadius: '10px', 
                          border: `1.5px solid ${THEME.colors.border}`, 
                          outline: 'none', 
                          fontSize: '0.85rem', 
                          fontWeight: 700, 
                          cursor: hasCustomSchedule ? 'not-allowed' : 'pointer', 
                          backgroundColor: hasCustomSchedule ? '#F3F4F6' : 'white',
                          color: hasCustomSchedule ? '#9CA3AF' : '#111827'
                        }}
                      >
                        <option value="AM">Mañana (AM)</option>
                        <option value="PM">Tarde (PM)</option>
                      </select>
                      {hasCustomSchedule && (
                        <div style={{ fontSize: '0.75rem', color: THEME.colors.primary, marginTop: '0.25rem', fontWeight: 500 }}>
                          Horario establecido: {formatLogisticsTime(matchedProfile.logistics_data.start_time) || '00:00'} - {formatLogisticsTime(matchedProfile.logistics_data.end_time) || '00:00'}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem', fontFamily: 'var(--font-outfit), sans-serif' }}>MÉTODO DE PAGO:</label>
                <select 
                  value={paymentMethod} 
                  onChange={(e) => setPaymentMethod(e.target.value)} 
                  style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: '10px', border: `1.5px solid ${THEME.colors.border}`, outline: 'none', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', backgroundColor: 'white' }}
                >
                  <option value="credit">Crédito Comercial (B2B)</option>
                  <option value="cash_on_delivery">Contra Entrega / Efectivo</option>
                  <option value="transfer">Transferencia Bancaria (Bancolombia)</option>
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
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: THEME.colors.primary }}
                  />
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: '800', color: sendConfirmationEmail ? '#065F46' : '#4B5563', marginBottom: '2px', fontFamily: 'var(--font-outfit), sans-serif' }}>
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
                  backgroundColor: '#FFFBEB',
                  border: '1.5px solid #FCD34D',
                  borderRadius: '12px',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}>
                  <input 
                    type="checkbox" 
                    id="chk-authorize-changes"
                    checked={isAuthorizedForChanges} 
                    onChange={(e) => setIsAuthorizedForChanges(e.target.checked)} 
                    style={{ width: '18px', height: '18px', cursor: 'pointer', marginTop: '2px', accentColor: '#D97706' }}
                  />
                  <label htmlFor="chk-authorize-changes" style={{ fontSize: '0.8rem', color: '#92400E', fontWeight: 600, cursor: 'pointer', lineHeight: '1.4' }}>
                    <strong>Confirmación de novedades:</strong> Se detectaron modificaciones en los productos originales de la orden. Confirmo que las novedades reflejadas son las autorizadas para notificar al cliente.
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
                  backgroundColor: (isInvoiceModified() && sendConfirmationEmail && !isAuthorizedForChanges) ? '#D1D5DB' : THEME.colors.primary,
                  color: (isInvoiceModified() && sendConfirmationEmail && !isAuthorizedForChanges) ? '#9CA3AF' : 'white',
                  fontWeight: '800',
                  fontFamily: 'var(--font-outfit), sans-serif',
                  cursor: (confirmingOrder || (isInvoiceModified() && sendConfirmationEmail && !isAuthorizedForChanges)) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: (isInvoiceModified() && sendConfirmationEmail && !isAuthorizedForChanges) ? 'none' : '0 4px 12px rgba(13, 122, 87, 0.25)',
                  transition: 'all 0.2s'
                }}
              >
                {confirmingOrder ? 'Procesando Pedido...' : 'CONFIRMAR Y CREAR PEDIDO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT VARIANT CUSTOM SUB-MODAL */}
      {selectedProductForVariant && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000, // Above revision modal (which is 9999)
          padding: '1rem',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '820px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            position: 'relative',
            padding: '2.5rem',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <button 
              onClick={closeVariantModal}
              style={{
                position: 'absolute',
                top: '1.5rem',
                right: '1.5rem',
                border: 'none',
                background: '#F1F5F9',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                cursor: 'pointer',
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9CA3AF',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>

            {/* Flex container for header */}
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                {selectedProductForVariant.image_url ? (
                  <img 
                    src={selectedProductForVariant.image_url} 
                    alt={selectedProductForVariant.name}
                    style={{ width: '80px', height: '80px', borderRadius: '16px', objectFit: 'cover', boxShadow: '0 4px 10px rgba(0,0,0,0.08)' }}
                  />
                ) : (
                  <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '16px',
                    backgroundColor: '#F3F4F6',
                    border: '1px solid #E5E7EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.04)'
                  }}>
                    <Package size={32} color="#9CA3AF" />
                  </div>
                )}
                <div>
                  <h3 style={{ fontSize: '1.6rem', fontWeight: '900', color: THEME.colors.textMain, margin: 0, fontFamily: 'var(--font-outfit), sans-serif' }}>{selectedProductForVariant.name}</h3>
                  <p style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem', margin: '4px 0 0 0', fontWeight: '600' }}>
                    Personaliza tu producto:
                  </p>
                </div>
              </div>

              {/* Right side: Helper box with detected information */}
              {selectedRowForVariant !== null && editableItems[selectedRowForVariant] && (
                <div style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px dashed #CBD5E1',
                  borderRadius: '12px',
                  padding: '0.8rem 1.2rem',
                  textAlign: 'left',
                  fontSize: '0.85rem',
                  color: '#475569',
                  minWidth: '280px',
                  flex: '1 1 auto',
                  maxWidth: '360px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '8px' }}>
                    <span style={{ fontWeight: '800', color: '#1E293B' }}>Texto detectado:</span>
                    <span style={{ backgroundColor: '#FFFBEB', color: '#B45309', border: '1.5px solid #FBBF24', boxShadow: '0 2px 6px rgba(245, 158, 11, 0.1)', padding: '2px 8px', borderRadius: '6px', fontWeight: '900', fontSize: '0.75rem' }}>
                      {formatDetectedUnit(editableItems[selectedRowForVariant].originalQuantity !== undefined ? editableItems[selectedRowForVariant].originalQuantity : editableItems[selectedRowForVariant].quantity, editableItems[selectedRowForVariant].originalUnit || 'uds')}
                    </span>
                  </div>
                  <div style={{ fontStyle: 'italic', color: '#64748B', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={editableItems[selectedRowForVariant].originalName}>
                    &quot;{editableItems[selectedRowForVariant].originalName}&quot;
                  </div>
                </div>
              )}
            </div>

            {/* Client notes box */}
            {(() => {
              const exc = clientExceptions.find(e => e.product_id === selectedProductForVariant.id);
              if (!exc) return null;
              return (
                <div style={{
                  backgroundColor: '#FEF3C7',
                  border: '1px solid #FCD34D',
                  borderRadius: '12px',
                  padding: '0.8rem 1.2rem',
                  margin: '0.5rem 0 1.2rem 0',
                  textAlign: 'left',
                  fontSize: '0.8rem',
                  color: '#92400E',
                  lineHeight: '1.4'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase', fontSize: '0.7rem', color: '#B45309', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Pin size={12} /> REQUERIMIENTOS DEL CLIENTE:
                  </div>
                  {exc.nickname && exc.nickname.trim().toLowerCase() !== selectedProductForVariant.name.trim().toLowerCase() && (
                    <div><strong>Nombre/Alias:</strong> {exc.nickname}</div>
                  )}
                  {exc.picking_note && <div><strong>Nota:</strong> {exc.picking_note}</div>}
                  {exc.delivery_note && <div><strong>Nota Entrega:</strong> {exc.delivery_note}</div>}
                </div>
              );
            })()}

            {/* ACTION BAR */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '12px',
              fontSize: '0.75rem',
              color: '#9CA3AF',
              marginBottom: '1.5rem',
              alignItems: 'center'
            }}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setVariantConfigProduct(selectedProductForVariant)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#4B5563',
                  fontWeight: '700',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 'inherit',
                  textDecoration: 'underline',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Settings size={12} /> Editar Variantes
              </button>
              <span>|</span>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setManageConversionsProduct(selectedProductForVariant)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#4B5563',
                  fontWeight: '700',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 'inherit',
                  textDecoration: 'underline',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Scale size={12} /> Editar Equivalencias
              </button>
            </div>

            {/* Options Rendering */}
            {selectedProductForVariant.options_config?.map((opt: any, index: number) => (
              <div key={opt.name} style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {opt.name}
                </label>
                <select
                  id={`modal-select-${index}`}
                  tabIndex={index + 1}
                  value={selectedOptions[opt.name] || ''}
                  onChange={(e) => setSelectedOptions(prev => ({ ...prev, [opt.name]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (index < (selectedProductForVariant.options_config?.length || 0) - 1) {
                        const nextSelect = document.getElementById(`modal-select-${index + 1}`);
                        if (nextSelect) nextSelect.focus();
                      } else {
                        const qtyInput = document.getElementById('modal-qty-input');
                        if (qtyInput) {
                          qtyInput.focus();
                          (qtyInput as HTMLInputElement).select();
                        }
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.8rem',
                    border: '2px solid #E2E8F0',
                    borderRadius: '10px',
                    fontSize: '1rem',
                    backgroundColor: '#F9FAFB',
                    outline: 'none',
                    transition: 'all 0.2s ease-in-out'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#3B82F6';
                    e.target.style.backgroundColor = 'white';
                    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E2E8F0';
                    e.target.style.backgroundColor = '#F9FAFB';
                    e.target.style.boxShadow = 'none';
                  }}
                >
                  <option value="">Seleccionar {opt.name}...</option>
                  {opt.values?.map((val: string) => (
                    <option key={val} value={val}>{val}</option>
                  ))}
                </select>
              </div>
            ))}

            {/* Quantity & Unit select grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', margin: '1.5rem 0', textAlign: 'left' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Cantidad
                </label>
                <input
                  id="modal-qty-input"
                  autoComplete="off"
                  tabIndex={(selectedProductForVariant.options_config?.length || 0) + 1}
                  type="text"
                  value={variantQuantity}
                  onChange={(e) => {
                    setVariantQuantity(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === '.' || e.key === ',') {
                      e.preventDefault();
                      const input = e.currentTarget;
                      const start = input.selectionStart ?? 0;
                      const end = input.selectionEnd ?? 0;
                      const val = input.value;
                      const newVal = val.substring(0, start) + ',' + val.substring(end);
                      setVariantQuantity(newVal);
                      
                      setTimeout(() => {
                        input.setSelectionRange(start + 1, start + 1);
                      }, 10);
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const unitSel = document.getElementById('modal-unit-select');
                      if (unitSel) {
                        unitSel.focus();
                      } else {
                        confirmVariantAdd();
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.8rem',
                    borderRadius: '10px',
                    border: '2px solid #E2E8F0',
                    fontWeight: '700',
                    fontSize: '1.1rem',
                    textAlign: 'center',
                    outline: 'none',
                    backgroundColor: '#F9FAFB',
                    transition: 'all 0.2s ease-in-out'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#3B82F6';
                    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.15)';
                    e.target.select();
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E2E8F0';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#4B5563', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Unidad de Medida
                </label>
                <select
                  id="modal-unit-select"
                  tabIndex={(selectedProductForVariant.options_config?.length || 0) + 2}
                  value={selectedUnit}
                  onChange={(e) => {
                    const opt = optionsList.find(o => o.unit === e.target.value);
                    if (opt) {
                      setSelectedUnit(opt.unit);
                      setSelectedConversionFactor(opt.factor);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirmVariantAdd();
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.8rem',
                    border: '2px solid #E2E8F0',
                    borderRadius: '10px',
                    fontSize: '1rem',
                    backgroundColor: '#F9FAFB',
                    outline: 'none',
                    transition: 'all 0.2s ease-in-out'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#3B82F6';
                    e.target.style.backgroundColor = 'white';
                    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E2E8F0';
                    e.target.style.backgroundColor = '#F9FAFB';
                    e.target.style.boxShadow = 'none';
                  }}
                >
                  {optionsList.map(o => (
                    <option key={o.unit} value={o.unit}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Footer buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
              <button 
                tabIndex={(selectedProductForVariant.options_config?.length || 0) + 4}
                onClick={() => {
                  const idx = selectedRowForVariant;
                  setSelectedProductForVariant(null);
                  setSelectedRowForVariant(null);
                  if (idx !== null) {
                    setTimeout(() => {
                      const currentInput = productInputRefs.current[idx];
                      if (currentInput) {
                        currentInput.focus();
                        currentInput.select();
                      }
                    }, 80);
                  }
                }}
                style={{ padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', backgroundColor: 'white', fontWeight: '700', color: '#64748B', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button 
                id="modal-add-button"
                tabIndex={(selectedProductForVariant.options_config?.length || 0) + 3}
                onClick={confirmVariantAdd}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    confirmVariantAdd();
                  }
                }}
                style={{ padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: '#059669', color: 'white', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(5, 150, 105, 0.2)' }}
              >
                Agregar
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
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Keyboard size={24} color={THEME.colors.primary} /> Manual de Atajos
              </h2>
              <button 
                onClick={() => setShowShortcuts(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.colors.textSecondary, display: 'flex', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                  <span style={{ fontSize: '0.95rem', color: THEME.colors.textSecondary, fontWeight: 600 }}>Cerrar ventanas y modales</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <kbd style={{ backgroundColor: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: THEME.colors.textMain, boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Esc</kbd>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                  <span style={{ fontSize: '0.95rem', color: THEME.colors.textSecondary, fontWeight: 600 }}>Abrir este manual</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <kbd style={{ backgroundColor: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: THEME.colors.textMain, boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Shift</kbd>
                    <span style={{ color: THEME.colors.textSecondary }}>+</span>
                    <kbd style={{ backgroundColor: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: THEME.colors.textMain, boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>?</kbd>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                  <span style={{ fontSize: '0.95rem', color: THEME.colors.textSecondary, fontWeight: 600 }}>Aprobar y procesar pedido</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <kbd style={{ backgroundColor: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: THEME.colors.textMain, boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Ctrl</kbd>
                    <span style={{ color: THEME.colors.textSecondary }}>+</span>
                    <kbd style={{ backgroundColor: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: THEME.colors.textMain, boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Enter</kbd>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                  <span style={{ fontSize: '0.95rem', color: THEME.colors.textSecondary, fontWeight: 600 }}>Rechazar/Eliminar selección masiva</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <kbd style={{ backgroundColor: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#EF4444', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Supr / Del</kbd>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                  <span style={{ fontSize: '0.95rem', color: THEME.colors.textSecondary, fontWeight: 600 }}>Buscar pedido</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <kbd style={{ backgroundColor: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: THEME.colors.textMain, boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Ctrl</kbd>
                    <span style={{ color: THEME.colors.textSecondary }}>+</span>
                    <kbd style={{ backgroundColor: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: THEME.colors.textMain, boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>F</kbd>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                  <span style={{ fontSize: '0.95rem', color: THEME.colors.textSecondary, fontWeight: 600 }}>Modificar pedido actual</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <kbd style={{ backgroundColor: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: THEME.colors.textMain, boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Ctrl</kbd>
                    <span style={{ color: THEME.colors.textSecondary }}>+</span>
                    <kbd style={{ backgroundColor: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: THEME.colors.textMain, boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>E</kbd>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.95rem', color: THEME.colors.textSecondary, fontWeight: 600 }}>Rechazar pedido actual</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <kbd style={{ backgroundColor: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#EF4444', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Ctrl</kbd>
                    <span style={{ color: THEME.colors.textSecondary }}>+</span>
                    <kbd style={{ backgroundColor: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700, color: '#EF4444', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>Retroceso (Back)</kbd>
                  </div>
                </div>

              </div>
            </div>
            
            <div style={{ padding: '1rem 1.5rem', backgroundColor: '#F9FAFB', display: 'flex', justifyContent: 'center' }}>
              <button 
                onClick={() => setShowShortcuts(false)}
                style={{
                  backgroundColor: THEME.colors.primary, color: 'white', border: 'none', borderRadius: '8px', padding: '0.6rem 2rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', boxShadow: `0 2px 4px ${THEME.colors.primary}33`
                }}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
      <ProductsDatalist products={products} />

      {/* --- CONVERSIONS MANAGEMENT MODAL --- */}
      {manageConversionsProduct && (() => {
          const productConvs = conversions.filter(c => c.product_id === manageConversionsProduct.id);
          const DYNAMIC_UNITS = [
              'Unidad', 'Lata', 'Bandeja', 'Atado', 'Malla', 'Caja', 'Bolsa', 
              'Saco', 'Canastilla', 'Libras', 'Gramos', 'Kilos', 'Paquete', 'Bloque'
          ];

          const handleDelete = async (id: string) => {
              const { error } = await supabase
                  .from('product_conversions')
                  .delete()
                  .eq('id', id);
              if (!error) {
                  setConversions(prev => prev.filter(c => c.id !== id));
                  
                  // Trigger local storage for cross-tab sync (same browser)
                  localStorage.setItem('conversions_changed', Date.now().toString());
                  
                  // Trigger Supabase broadcast for cross-device sync
                  const chan = supabase.channel('master_conversions_changes');
                  chan.subscribe((status) => {
                      if (status === 'SUBSCRIBED') {
                          chan.send({ type: 'broadcast', event: 'conversion_update', payload: { action: 'refresh' } }).then(() => supabase.removeChannel(chan));
                      }
                  });
              }
          };

          const handleAdd = async () => {
              const qty1Input = document.getElementById('new-conv-qty-1') as HTMLInputElement;
              const unit1Input = document.getElementById('new-conv-unit-1') as HTMLSelectElement;
              const qty2Input = document.getElementById('new-conv-qty-2') as HTMLInputElement;

              if (!qty1Input || !unit1Input || !qty2Input) return;

              const qty1 = parseFloat(qty1Input.value);
              const unit1 = unit1Input.value;
              const qty2 = parseFloat(qty2Input.value);

              if (!unit1) {
                  alert('Por favor, selecciona una unidad de origen.');
                  return;
              }
              if (isNaN(qty1) || qty1 <= 0 || isNaN(qty2) || qty2 <= 0) {
                  alert('Las cantidades deben ser válidas y mayores a cero.');
                  return;
              }

              const factor = qty2 / qty1;

              const { data, error } = await supabase
                  .from('product_conversions')
                  .insert([{
                      product_id: manageConversionsProduct.id,
                      from_unit: unit1,
                      to_unit: manageConversionsProduct.unit_of_measure || 'Kg',
                      conversion_factor: factor
                  }])
                  .select();

              if (!error && data && data.length > 0) {
                  setConversions(prev => [...prev, data[0]]);
                  qty1Input.value = '1';
                  unit1Input.value = '';
                  qty2Input.value = '';
                  
                  // Trigger local storage for cross-tab sync (same browser)
                  localStorage.setItem('conversions_changed', Date.now().toString());
                  
                  // Trigger Supabase broadcast for cross-device sync
                  const chan = supabase.channel('master_conversions_changes');
                  chan.subscribe((status) => {
                      if (status === 'SUBSCRIBED') {
                          chan.send({ type: 'broadcast', event: 'conversion_update', payload: { action: 'refresh' } }).then(() => supabase.removeChannel(chan));
                      }
                  });
              } else {
                  alert('Ocurrió un error al guardar la equivalencia.');
              }
          };

          return (
              <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 25000, backdropFilter: 'blur(3px)'
              }} onClick={() => setManageConversionsProduct(null)}>

                  <div
                      style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '24px', width: '95%', maxWidth: '550px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', textAlign: 'center' }}
                      onClick={e => e.stopPropagation()} // Prevent close
                  >
                      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                          <div style={{ textAlign: 'left' }}>
                              <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                  <Scale size={20} color={THEME.colors.primary} /> Equivalencias y Conversiones
                              </h3>
                              <span style={{ fontSize: '0.85rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>
                                  {manageConversionsProduct.name}
                              </span>
                          </div>
                          <button
                              onClick={() => setManageConversionsProduct(null)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex', alignItems: 'center' }}
                          >
                              <X size={20} />
                          </button>
                      </header>

                      {/* SECCIÓN DE UNIDAD BASE */}
                      <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid #E2E8F0', textAlign: 'left' }}>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Unidad de Inventario (Base)
                          </label>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                              <div style={{ 
                                  padding: '0.5rem 1.25rem', 
                                  backgroundColor: '#EFF6FF', 
                                  border: '1px solid #BFDBFE', 
                                  borderRadius: '8px', 
                                  fontSize: '0.9rem', 
                                  fontWeight: '800', 
                                  color: '#1D4ED8',
                                  minWidth: '100px',
                                  textAlign: 'center'
                              }}>
                                  {manageConversionsProduct.unit_of_measure}
                              </div>
                              <div style={{ flex: 1, fontSize: '0.75rem', color: '#6B7280', lineHeight: '1.4' }}>
                                  Unidad base configurada para este SKU. Todas las equivalencias ingresadas abajo se convertirán a esta unidad base para el stock.
                              </div>
                          </div>
                      </div>

                      {/* EQUIVALENCIAS EXISTENTES */}
                      <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
                          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '800' }}>
                              Equivalencias de Compra
                          </h4>
                          {productConvs.length === 0 ? (
                              <div style={{ fontSize: '0.85rem', color: '#6B7280', textAlign: 'center', padding: '1rem', border: '1px dashed #D1D5DB', borderRadius: '12px' }}>
                                  Solo se opera en {manageConversionsProduct.unit_of_measure}.
                              </div>
                          ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {productConvs.map(c => (
                                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                                              <span style={{ fontWeight: '700', color: '#1F2937' }}>1 {c.from_unit}</span>
                                              <span style={{ color: '#9CA3AF' }}>=</span>
                                              <span style={{ fontWeight: '700', color: '#10B981' }}>{c.conversion_factor} {manageConversionsProduct.unit_of_measure}</span>
                                          </div>
                                          <button 
                                              onClick={() => handleDelete(c.id)} 
                                              style={{ color: '#EF4444', background: '#FEF2F2', border: '1px solid #FECACA', padding: '4px 10px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.75rem', transition: 'all 0.15s' }}
                                          >
                                              Eliminar
                                          </button>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>

                      {/* AGREGAR NUEVA RELACIÓN */}
                      <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '1.25rem', textAlign: 'left' }}>
                          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '800', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                              <Plus size={14} /> DEFINIR NUEVA RELACIÓN
                          </h4>
                          
                          <div style={{ 
                              display: 'flex', 
                              flexDirection: 'column',
                              gap: '8px', 
                              backgroundColor: '#F0FDF4', 
                              padding: '1.2rem', 
                              borderRadius: '12px',
                              border: '1px solid #DCFCE7'
                          }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ flex: 1 }}>
                                      <input 
                                          id="new-conv-qty-1" 
                                          type="number" 
                                          defaultValue="1" 
                                          onKeyDown={(e) => {
                                              if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                                                  e.preventDefault();
                                                  document.getElementById('new-conv-unit-1')?.focus();
                                              }
                                          }}
                                          style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700', textAlign: 'center', fontSize: '0.9rem' }} 
                                      />
                                  </div>
                                  <div style={{ flex: 2 }}>
                                      <select 
                                          id="new-conv-unit-1" 
                                          onKeyDown={(e) => {
                                              if (e.key === 'Enter' || e.key === 'ArrowRight') {
                                                  e.preventDefault();
                                                  const qty2 = document.getElementById('new-conv-qty-2');
                                                  if (qty2) {
                                                      qty2.focus();
                                                      (qty2 as HTMLInputElement).select();
                                                  }
                                              } else if (e.key === 'ArrowLeft') {
                                                  e.preventDefault();
                                                  document.getElementById('new-conv-qty-1')?.focus();
                                              }
                                          }}
                                          style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700', backgroundColor: 'white', fontSize: '0.9rem' }}
                                      >
                                          <option value="">Selecciona unidad</option>
                                          {DYNAMIC_UNITS.map(u => (
                                              <option key={u} value={u}>{u}</option>
                                          ))}
                                      </select>
                                  </div>
                              </div>

                              <div style={{ textAlign: 'center', color: '#15803D', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                  EQUIVALE A
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ flex: 1 }}>
                                      <input 
                                          id="new-conv-qty-2" 
                                          type="number" 
                                          placeholder="Ej: 0.3" 
                                          onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  handleAdd();
                                              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                                                  e.preventDefault();
                                                  document.getElementById('new-conv-unit-1')?.focus();
                                              }
                                          }}
                                          style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700', textAlign: 'center', fontSize: '0.9rem' }} 
                                      />
                                  </div>
                                  <div style={{ flex: 2 }}>
                                      <div style={{ width: '100%', padding: '0.5rem', backgroundColor: '#FFFFFF', border: '1px solid #D1D5DB', borderRadius: '8px', fontWeight: '800', textAlign: 'center', color: '#15803D', fontSize: '0.9rem' }}>
                                          {manageConversionsProduct.unit_of_measure}
                                      </div>
                                  </div>
                              </div>
                          </div>

                          <button 
                              onClick={handleAdd} 
                              style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', borderRadius: '10px', border: 'none', backgroundColor: '#059669', color: 'white', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.15s' }}
                          >
                              Vincular Unidades
                          </button>
                      </div>
                  </div>
              </div>
          );
      })()}

      {/* PRODUCT CUSTOMIZATION MODAL (EXACT REPLICA OF PDF INGEST WORKSTATION - IMAGE 1) */}
      {customizingModalItem && (() => {
        const { product, originalText, originalQuantity, originalUnit, options, quantity, unit, factor } = customizingModalItem;
        const normalizedOptionsConfig = (product.options_config || []).slice().sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

        const modalOptionsList = [{ unit: product.unit_of_measure || 'Kg', factor: 1, label: `${product.unit_of_measure || 'Kg'} (Base)` }];
        const prodConvs = conversions ? conversions.filter(c => c.product_id === product.id) : [];
        prodConvs.forEach(c => {
          let displayUnit = c.from_unit || '';
          const norm = normalizeUnitName(displayUnit);
          if (norm === 'libra') displayUnit = 'libra';
          else if (norm === 'kg') displayUnit = 'Kg';
          else if (norm === 'unidad') displayUnit = 'Unidad';
          else if (norm === 'litro') displayUnit = 'Litro';

          if (!modalOptionsList.some(l => normalizeUnitName(l.unit) === norm)) {
            modalOptionsList.push({
              unit: displayUnit,
              factor: parseFloat(c.conversion_factor) || 1,
              label: `${displayUnit} (${parseFloat(c.conversion_factor)} ${product.unit_of_measure || 'Kg'})`
            });
          }
        });

        const parsedQty = parseFloat(quantity.replace(',', '.')) || 0;
        const calculatedTotalKg = parsedQty * factor;

        return (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 15000,
            padding: '1.5rem'
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '24px',
              width: '100%',
              maxWidth: '560px',
              padding: '2rem',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3)',
              position: 'relative',
              animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
              {/* Close Button */}
              <button
                onClick={() => setCustomizingModalItem(null)}
                style={{
                  position: 'absolute',
                  top: '1.25rem',
                  right: '1.25rem',
                  border: 'none',
                  background: '#F1F5F9',
                  borderRadius: '100px',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748B'
                }}
              >
                <X size={16} />
              </button>

              {/* Header: Product Icon + Title + Detected Text Box */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '16px',
                    backgroundColor: '#F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0D7A57'
                  }}>
                    <Package size={28} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0F172A', margin: 0, fontFamily: 'var(--font-outfit), sans-serif' }}>
                      {product.name}
                    </h2>
                    <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '3px 0 0 0', fontWeight: '600' }}>
                      Personaliza tu producto:
                    </p>
                  </div>
                </div>

                {/* Detected Context Box */}
                {originalText && (
                  <div style={{
                    backgroundColor: '#F8FAFC',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '14px',
                    padding: '8px 12px',
                    textAlign: 'right',
                    maxWidth: '220px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B' }}>Texto detectado:</span>
                      <span style={{ backgroundColor: '#FFFBEB', color: '#B45309', border: '1px solid #FCD34D', padding: '1px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '900' }}>
                        {formatDetectedUnit(originalQuantity, originalUnit)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', fontStyle: 'italic', color: '#334155', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={originalText}>
                      &quot;{originalText}&quot;
                    </div>
                  </div>
                )}
              </div>

              {/* Action Links */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', fontSize: '0.75rem', color: '#94A3B8', marginBottom: '1.25rem', fontWeight: '700' }}>
                <button
                  type="button"
                  onClick={() => setVariantConfigProduct(product)}
                  style={{ background: 'none', border: 'none', color: '#475569', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <Settings size={12} /> Editar Variantes
                </button>
                <span>|</span>
                <button
                  type="button"
                  onClick={() => setManageConversionsProduct(product)}
                  style={{ background: 'none', border: 'none', color: '#475569', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <Scale size={12} /> Editar Equivalencias
                </button>
              </div>

              {/* Dynamic Options Dropdowns */}
              {normalizedOptionsConfig && normalizedOptionsConfig.length > 0 && normalizedOptionsConfig.map((opt: any, optIdx: number) => {
                const currentVal = options[opt.name] || '';
                return (
                  <div key={opt.name} style={{ marginBottom: '1rem', textAlign: 'left' }}>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '900', color: '#475569', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {opt.name}
                    </label>
                    <select
                      ref={optIdx === 0 ? firstModalSelectRef : undefined}
                      autoFocus={optIdx === 0}
                      id={`modal-opt-select-${optIdx}`}
                      tabIndex={optIdx + 1}
                      value={currentVal}
                      onChange={e => {
                        const val = e.target.value;
                        setCustomizingModalItem(prev => prev ? {
                          ...prev,
                          options: { ...prev.options, [opt.name]: val }
                        } : null);
                        if (val) {
                          setTimeout(() => {
                            const nextOpt = document.getElementById(`modal-opt-select-${optIdx + 1}`) as HTMLSelectElement | null;
                            if (nextOpt) {
                              nextOpt.focus();
                            } else {
                              const qtyInput = document.getElementById('modal-qty-input') as HTMLInputElement | null;
                              if (qtyInput) {
                                qtyInput.focus();
                                qtyInput.select();
                              }
                            }
                          }, 50);
                        }
                      }}
                      onFocus={e => {
                        e.currentTarget.style.borderColor = '#2563EB';
                        e.currentTarget.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.25)';
                        e.currentTarget.style.backgroundColor = '#FFFFFF';
                      }}
                      onBlur={e => {
                        e.currentTarget.style.borderColor = '#CBD5E1';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                          e.preventDefault();
                          const nextOpt = document.getElementById(`modal-opt-select-${optIdx + 1}`) as HTMLSelectElement | null;
                          if (nextOpt) {
                            nextOpt.focus();
                          } else {
                            const qtyInput = document.getElementById('modal-qty-input') as HTMLInputElement | null;
                            if (qtyInput) {
                              qtyInput.focus();
                              qtyInput.select();
                            }
                          }
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        border: '2px solid #CBD5E1',
                        borderRadius: '10px',
                        fontSize: '0.95rem',
                        fontWeight: '800',
                        backgroundColor: '#F8FAFC',
                        outline: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <option value="">Seleccionar {opt.name}...</option>
                      {(opt.values || []).map((v: string) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                );
              })}

              {/* Quantity and Fixed Unit Row (Exact Ingesta PDF Flow) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', margin: '1.25rem 0', textAlign: 'left' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '900', color: '#475569', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Cantidad
                  </label>
                  <input
                    id="modal-qty-input"
                    tabIndex={(normalizedOptionsConfig?.length || 0) + 1}
                    type="text"
                    inputMode="decimal"
                    value={quantity}
                    onFocus={e => {
                      e.target.select();
                      e.target.style.borderColor = '#2563EB';
                      e.target.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.25)';
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = '#E2E8F0';
                      e.target.style.boxShadow = 'none';
                    }}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9.,]/g, '');
                      setCustomizingModalItem(prev => prev ? { ...prev, quantity: val } : null);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveCustomizingModal();
                      } else if (e.key === 'Tab' && !e.shiftKey) {
                        e.preventDefault();
                        const addBtn = document.getElementById('btn-modal-add') as HTMLButtonElement | null;
                        if (addBtn) addBtn.focus();
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '0.7rem 0.8rem',
                      borderRadius: '10px',
                      border: '2px solid #E2E8F0',
                      fontWeight: '800',
                      fontSize: '1.1rem',
                      textAlign: 'center',
                      outline: 'none',
                      transition: 'all 0.15s ease'
                    }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '900', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                      Unidad de Medida
                    </label>
                    {calculatedTotalKg > 0 && factor !== 1 && (
                      <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#059669', backgroundColor: '#ECFDF5', padding: '1px 6px', borderRadius: '6px' }}>
                        Total: {calculatedTotalKg.toFixed(2)} kg
                      </span>
                    )}
                  </div>
                  <input
                    readOnly
                    tabIndex={-1}
                    value={modalOptionsList.find(o => o.unit === unit)?.label || `${unit} (Base)`}
                    style={{
                      width: '100%',
                      padding: '0.7rem 0.8rem',
                      borderRadius: '10px',
                      border: '2px solid #E2E8F0',
                      fontWeight: '800',
                      fontSize: '0.95rem',
                      backgroundColor: '#F1F5F9',
                      color: '#475569',
                      outline: 'none',
                      cursor: 'default'
                    }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  tabIndex={(normalizedOptionsConfig?.length || 0) + 3}
                  onClick={() => setCustomizingModalItem(null)}
                  style={{
                    padding: '0.85rem',
                    borderRadius: '12px',
                    border: '1.5px solid #CBD5E1',
                    backgroundColor: 'white',
                    color: '#475569',
                    fontWeight: '800',
                    fontSize: '0.95rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  id="btn-modal-add"
                  type="button"
                  tabIndex={(normalizedOptionsConfig?.length || 0) + 2}
                  onClick={saveCustomizingModal}
                  onFocus={e => {
                    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(13, 122, 87, 0.4)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(13, 122, 87, 0.25)';
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      saveCustomizingModal();
                    }
                  }}
                  style={{
                    padding: '0.85rem',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: '#0D7A57',
                    color: 'white',
                    fontWeight: '800',
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Agregar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* DELIVERY TIME & TOLERANCE MODAL (EXACT INGESTA PDF REPLICA) */}
      {showDeliveryTimeModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 16000,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '440px',
            padding: '1.75rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #E2E8F0',
            animation: 'fadeInUp 0.2s ease-out'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
                  <Clock size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#0F172A' }}>Hora de Entrega</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>Configura la hora y tolerancia para este pedido</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeliveryTimeModal(false)}
                style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '900', color: '#475569', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                  Hora Específica de Entrega
                </label>
                <input
                  type="time"
                  value={tempDeliveryTime}
                  onChange={e => setTempDeliveryTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.9rem',
                    borderRadius: '10px',
                    border: '2px solid #CBD5E1',
                    fontSize: '1.1rem',
                    fontWeight: '800',
                    color: '#0F172A',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '900', color: '#475569', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                  Margen de Tolerancia (± Minutos)
                </label>
                <select
                  value={tempDeliveryMargin}
                  onChange={e => setTempDeliveryMargin(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.9rem',
                    borderRadius: '10px',
                    border: '2px solid #CBD5E1',
                    fontSize: '0.95rem',
                    fontWeight: '700',
                    color: '#0F172A',
                    outline: 'none',
                    backgroundColor: '#F8FAFC'
                  }}
                >
                  <option value={15}>± 15 Minutos</option>
                  <option value={30}>± 30 Minutos (Recomendado)</option>
                  <option value={45}>± 45 Minutos</option>
                  <option value={60}>± 60 Minutos (1 Hora)</option>
                </select>
              </div>

              {matchedProfile && (
                <div style={{ padding: '0.75rem', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.75rem', color: '#64748B' }}>
                  <strong>Horario habitual del cliente:</strong> {matchedProfile?.delivery_restrictions || '06:30 - 11:00'}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsManualDelivery(false);
                    setManualDeliveryTime('');
                    setShowDeliveryTimeModal(false);
                  }}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '10px',
                    border: '1.5px solid #CBD5E1',
                    backgroundColor: 'white',
                    color: '#475569',
                    fontWeight: '800',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Restablecer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (tempDeliveryTime) {
                      setIsManualDelivery(true);
                      setManualDeliveryTime(tempDeliveryTime);
                      setManualDeliveryMargin(tempDeliveryMargin);
                      setShowDeliveryTimeModal(false);
                      showToast(`Hora de entrega fijada: ${tempDeliveryTime} (±${tempDeliveryMargin} min)`, 'success');
                    } else {
                      showToast('Por favor selecciona una hora', 'warning');
                    }
                  }}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: '#0D7A57',
                    color: 'white',
                    fontWeight: '800',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(13, 122, 87, 0.2)'
                  }}
                >
                  Guardar Horario
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {variantConfigProduct && (
          <VariantModal
              product={variantConfigProduct}
              onClose={() => setVariantConfigProduct(null)}
              onSave={async (optionsConfig, variants) => {
                  const success = await handleSaveVariantsFromEmail(variantConfigProduct.id, optionsConfig, variants);
                  if (success) {
                      setProducts(prev => prev.map(p => 
                          p.id === variantConfigProduct.id 
                              ? { ...p, options_config: optionsConfig, variants: variants } 
                              : p
                      ));
                      if (selectedProductForVariant && selectedProductForVariant.id === variantConfigProduct.id) {
                          setSelectedProductForVariant((prev: any) => ({ ...prev, options_config: optionsConfig, variants: variants }));
                      }
                      showToast('Variantes del producto actualizadas', 'success');
                  }
                  return success;
              }}
              onUploadImage={handleVariantImageUploadFromEmail}
              readOnly={false}
          />
      )}
    </div>
  );
}
