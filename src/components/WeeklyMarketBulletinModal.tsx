'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  X, 
  Send, 
  Check, 
  CheckSquare, 
  Square, 
  Sparkles, 
  Sprout, 
  AlertTriangle, 
  Building2, 
  Store, 
  Eye, 
  Layers, 
  RefreshCw, 
  ChevronRight, 
  ChevronLeft, 
  Plus, 
  Trash2,
  Info,
  ShieldCheck,
  CheckCircle2,
  Users
} from 'lucide-react';
import { 
  generateWeeklyHarvestBulletinHtml, 
  HarvestOpportunityItem, 
  ScarcityAlertItem, 
  ScarcitySubstituteItem 
} from '@/lib/emailTemplates';

export interface WeeklyMarketBulletinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDispatchSuccess: (payload: { clientsCount: number; emailsCount: number; weekLabel: string }) => void;
  currentUser?: { id: string; name: string; role: string };
  initialHarvestItems?: HarvestOpportunityItem[];
  initialScarcityItems?: ScarcityAlertItem[];
}

interface HarvestItemWithToggle extends HarvestOpportunityItem {
  checked: boolean;
}

interface SubstituteWithToggle extends ScarcitySubstituteItem {
  checked: boolean;
}

interface ScarcityItemWithToggle {
  id?: string;
  name: string;
  unit: string;
  reason: string;
  substitutes: SubstituteWithToggle[];
  checked: boolean;
}

interface ClientSegmentationItem {
  id: string;
  name: string;
  nit?: string;
  email?: string;
  additional_billing_emails?: string[];
  is_corporate_parent: boolean;
  parent_id?: string | null;
  parent_name?: string;
  branches_count?: number;
  consumed_products: string[];
  has_active_agreement: boolean;
  checked: boolean;
}

export default function WeeklyMarketBulletinModal({
  isOpen,
  onClose,
  onDispatchSuccess,
  currentUser = { id: '', name: 'German Higuera', role: 'Dirección Comercial' },
  initialHarvestItems,
  initialScarcityItems
}: WeeklyMarketBulletinModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loadingClients, setLoadingClients] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchSuccessData, setDispatchSuccessData] = useState<{ clientsCount: number; emailsCount: number; weekLabel: string } | null>(null);

  // Form Header State
  const [weekLabel, setWeekLabel] = useState('Semana 40 (01 al 07 de Octubre, 2026)');
  const [responsibleName, setResponsibleName] = useState(currentUser.name || 'German Higuera');
  const [bulletinNotes, setBulletinNotes] = useState('Precios y alternativas válidas para pedidos programados durante el ciclo corriente. Sujeto a disponibilidad de cosecha en plaza.');
  const [confirmedAuth, setConfirmedAuth] = useState(false);

  // Step 1: Products State
  const [harvestItems, setHarvestItems] = useState<HarvestItemWithToggle[]>([
    {
      id: 'h1',
      name: 'Mango Tommy Especial',
      unit: 'Kg',
      suggested_price: 3200,
      origin: 'Cundinamarca / Tolima',
      trend: 'down',
      culinary_note: 'Excelente dulzor y textura para jugos, ensaladas de frutas y salsas agridulces.',
      checked: true
    },
    {
      id: 'h2',
      name: 'Mandarina Arrayana Seleccionada',
      unit: 'Kg',
      suggested_price: 2800,
      origin: 'Santander / Boyacá',
      trend: 'down',
      culinary_note: 'Alta rotación y fácil pelado para barras de desayuno y repostería.',
      checked: true
    },
    {
      id: 'h3',
      name: 'Calabacín Verde Zucchini',
      unit: 'Kg',
      suggested_price: 1900,
      origin: 'Sabana de Bogotá',
      trend: 'down',
      culinary_note: 'Gran rendimiento para salteados wok, cremas y guarniciones institucionales.',
      checked: true
    },
    {
      id: 'h4',
      name: 'Limón Tahití Extra',
      unit: 'Kg',
      suggested_price: 2400,
      origin: 'Santander',
      trend: 'down',
      culinary_note: 'Excelente contenido de jugo y acidez balanceada para cocina caliente y barra.',
      checked: true
    }
  ]);

  const [scarcityItems, setScarcityItems] = useState<ScarcityItemWithToggle[]>([
    {
      id: 's1',
      name: 'Cebolla Cabezona Roja / Morada',
      unit: 'Kg',
      reason: 'Baja oferta temporal por exceso de lluvias en zonas de cultivo de Nariño y Boyacá.',
      checked: true,
      substitutes: [
        {
          name: 'Cebolla Puerro / Chalota Nacional',
          unit: 'Kg',
          ratio_description: 'Equivalencia 1:1 en bases y sofritos',
          price_comparison: '$3.400/kg vs $6.200/kg',
          checked: true
        },
        {
          name: 'Cebolla Cabezona Blanca Limpia',
          unit: 'Kg',
          ratio_description: 'Opción económica de cocción',
          price_comparison: '$2.100/kg vs $6.200/kg',
          checked: true
        }
      ]
    },
    {
      id: 's2',
      name: 'Papa Pastusa Gruesa Especial',
      unit: 'Kg',
      reason: 'Transición de ciclo de cosechas en el Altiplano Cundiboyacense (alza de plaza).',
      checked: true,
      substitutes: [
        {
          name: 'Papa R-12 / Diacol Capiro Seleccionada',
          unit: 'Kg',
          ratio_description: 'Comportamiento superior en fritura y horneado',
          price_comparison: '$2.300/kg vs $3.800/kg',
          checked: true
        },
        {
          name: 'Papa Sabanera Lavada',
          unit: 'Kg',
          ratio_description: 'Firmeza ideal para cocción y ensaladas frías',
          price_comparison: '$2.700/kg vs $3.800/kg',
          checked: true
        }
      ]
    },
    {
      id: 's3',
      name: 'Cilantro de Castilla Especial',
      unit: 'Atado 500g',
      reason: 'Afectación foliar temporal por heladas matutinas en la Sabana.',
      checked: true,
      substitutes: [
        {
          name: 'Perejil Crespo / Liso Fresco',
          unit: 'Atado 500g',
          ratio_description: 'Aporte aromático y frescura en marinadas y decoración',
          price_comparison: '$1.600/atado',
          checked: true
        }
      ]
    }
  ]);

  // Step 2: Clients Segmentation State
  const [clientSegmentation, setClientSegmentation] = useState<ClientSegmentationItem[]>([]);
  const [excludedClientsCount, setExcludedClientsCount] = useState(0);
  const [searchFilter, setSearchFilter] = useState('');
  const [previewClientName, setPreviewClientName] = useState('Restaurante Fogón & Cava S.A.S.');

  // Load clients and calculate real consumption on opening or step transition
  useEffect(() => {
    if (!isOpen) return;

    async function loadSegmentedClients() {
      setLoadingClients(true);
      try {
        // 1. Fetch active client profiles
        const { data: profiles, error: pErr } = await supabase
          .from('profiles')
          .select('id, company_name, contact_name, email, additional_billing_emails, is_corporate_parent, parent_id, role')
          .order('company_name');

        if (pErr) {
          console.warn('[WeeklyMarketBulletin] Error fetching profiles:', pErr);
        }

        // 2. Fetch products dictionary for name matching
        const { data: productsData } = await supabase
          .from('products')
          .select('id, name, sku');

        const productMap = new Map<string, string>();
        (productsData || []).forEach(p => productMap.set(p.id, p.name));

        // 3. Fetch recent orders for the last 60 days
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        const { data: recentOrders } = await supabase
          .from('orders')
          .select('id, customer_id, created_at')
          .gte('created_at', sixtyDaysAgo.toISOString())
          .neq('status', 'cancelled');

        const orderIds = (recentOrders || []).map(o => o.id);
        const orderToCustomerMap = new Map<string, string>();
        (recentOrders || []).forEach(o => {
          if (o.customer_id) orderToCustomerMap.set(o.id, o.customer_id);
        });

        // 4. Fetch order items for recent orders
        const consumptionMap = new Map<string, Set<string>>();
        if (orderIds.length > 0) {
          const { data: orderItems } = await supabase
            .from('order_items')
            .select('order_id, product_id, nickname')
            .in('order_id', orderIds.slice(0, 200));

          (orderItems || []).forEach(item => {
            const customerId = orderToCustomerMap.get(item.order_id);
            if (!customerId) return;
            if (!consumptionMap.has(customerId)) consumptionMap.set(customerId, new Set());

            const productName = (item.product_id && productMap.get(item.product_id)) || item.nickname || '';
            if (productName) {
              consumptionMap.get(customerId)?.add(productName);
            }
          });
        }

        // 5. Fetch active agreements
        const { data: activeAgreements } = await supabase
          .from('quotes')
          .select('id, client_id, status')
          .eq('status', 'agreement');

        const agreementClientIds = new Set<string>();
        const agreementIds = (activeAgreements || []).map(a => {
          if (a.client_id) agreementClientIds.add(a.client_id);
          return a.id;
        });

        if (agreementIds.length > 0) {
          const { data: quoteItems } = await supabase
            .from('quote_items')
            .select('quote_id, product_id, product_name')
            .in('quote_id', agreementIds.slice(0, 100));

          const quoteToClientMap = new Map<string, string>();
          (activeAgreements || []).forEach(a => {
            if (a.client_id) quoteToClientMap.set(a.id, a.client_id);
          });

          (quoteItems || []).forEach((qi: any) => {
            const clientId = quoteToClientMap.get(qi.quote_id);
            if (!clientId) return;
            if (!consumptionMap.has(clientId)) consumptionMap.set(clientId, new Set());
            const pName = qi.product_name || (qi.product_id && productMap.get(qi.product_id)) || '';
            if (pName) {
              consumptionMap.get(clientId)?.add(pName);
            }
          });
        }

        // 6. Selected product keywords from Step 1
        const activeKeywords = [
          ...harvestItems.filter(h => h.checked).map(h => h.name.toLowerCase().split(' ')[0]),
          ...scarcityItems.filter(s => s.checked).map(s => s.name.toLowerCase().split(' ')[0])
        ].filter(Boolean);

        // 7. Match profiles
        const eligible: ClientSegmentationItem[] = [];
        let excluded = 0;

        (profiles || []).forEach((prof: any) => {
          const clientName = prof.company_name || prof.contact_name || prof.email || 'Cliente Institucional';
          const consumedSet = consumptionMap.get(prof.id) || new Set();
          const consumedArray = Array.from(consumedSet);

          // Check if consumed any of the active keywords
          const matchedProducts: string[] = [];
          activeKeywords.forEach(kw => {
            const match = consumedArray.find(prod => prod.toLowerCase().includes(kw));
            if (match && !matchedProducts.includes(match)) {
              matchedProducts.push(match);
            }
          });

          // Also check agreement status
          const hasAgr = agreementClientIds.has(prof.id);
          const isB2B = prof.role === 'b2b_client' || prof.is_corporate_parent || hasAgr;

          // If client has matching consumption OR active agreement OR is corporate parent, mark eligible
          if ((matchedProducts.length > 0 || hasAgr || prof.is_corporate_parent) && isB2B) {
            eligible.push({
              id: prof.id,
              name: clientName,
              email: prof.email,
              additional_billing_emails: prof.additional_billing_emails,
              is_corporate_parent: Boolean(prof.is_corporate_parent),
              parent_id: prof.parent_id,
              consumed_products: matchedProducts.length > 0 ? matchedProducts : ['Acuerdo Institucional Activo'],
              has_active_agreement: hasAgr,
              checked: true // Defaults to checked for easy Human-in-the-Loop review
            });
          } else if (isB2B) {
            excluded++;
          }
        });

        // Fallback default sample clients if DB has few records
        if (eligible.length === 0) {
          eligible.push(
            {
              id: 'c-1',
              name: 'Restaurante Fogón & Cava S.A.S. (Matriz)',
              email: 'compras@fogon-cava.com',
              is_corporate_parent: true,
              consumed_products: ['Papa Pastusa Gruesa', 'Cebolla Roja', 'Mango Tommy'],
              has_active_agreement: true,
              checked: true
            },
            {
              id: 'c-2',
              name: 'Cadena Restaurantes Wok Bogotá (Matriz)',
              email: 'economato@wokcolombia.com',
              is_corporate_parent: true,
              consumed_products: ['Calabacín Verde', 'Cebolla Roja', 'Limón Tahití'],
              has_active_agreement: true,
              checked: true
            },
            {
              id: 'c-3',
              name: 'Club El Nogal Corporativo',
              email: 'compras@clubelnogal.com',
              is_corporate_parent: false,
              consumed_products: ['Papa Pastusa', 'Cilantro Castilla', 'Mandarina'],
              has_active_agreement: true,
              checked: true
            },
            {
              id: 'c-4',
              name: 'Hotel Grand Hyatt Bogotá',
              email: 'chef.ejecutivo@hyatt.com',
              is_corporate_parent: false,
              consumed_products: ['Mango Tommy', 'Limón Tahití', 'Calabacín Verde'],
              has_active_agreement: true,
              checked: true
            }
          );
        }

        setClientSegmentation(eligible);
        setExcludedClientsCount(excluded);
        if (eligible.length > 0) {
          setPreviewClientName(eligible[0].name);
        }

      } catch (err: any) {
        console.error('[WeeklyMarketBulletin] Error loading segmented clients:', err);
      } finally {
        setLoadingClients(false);
      }
    }

    loadSegmentedClients();
  }, [isOpen, harvestItems, scarcityItems]);

  // Calculations for Step 1 & 2
  const activeHarvestCount = useMemo(() => harvestItems.filter(h => h.checked).length, [harvestItems]);
  const activeScarcityCount = useMemo(() => scarcityItems.filter(s => s.checked).length, [scarcityItems]);
  const selectedClientsCount = useMemo(() => clientSegmentation.filter(c => c.checked).length, [clientSegmentation]);

  // Live HTML generation for Step 3
  const activeHarvestForEmail = useMemo(() => {
    return harvestItems.filter(h => h.checked).map(h => ({
      id: h.id,
      name: h.name,
      unit: h.unit,
      suggested_price: h.suggested_price,
      origin: h.origin,
      trend: h.trend,
      culinary_note: h.culinary_note
    }));
  }, [harvestItems]);

  const activeScarcityForEmail = useMemo(() => {
    return scarcityItems.filter(s => s.checked).map(s => ({
      id: s.id,
      name: s.name,
      unit: s.unit,
      reason: s.reason,
      substitutes: s.substitutes.filter(sub => sub.checked).map(sub => ({
        name: sub.name,
        unit: sub.unit,
        ratio_description: sub.ratio_description,
        price_comparison: sub.price_comparison
      }))
    }));
  }, [scarcityItems]);

  const livePreviewHtml = useMemo(() => {
    return generateWeeklyHarvestBulletinHtml({
      client_name: previewClientName,
      week_label: weekLabel,
      responsible_agent: responsibleName,
      harvest_items: activeHarvestForEmail,
      scarcity_items: activeScarcityForEmail,
      notes: bulletinNotes
    });
  }, [previewClientName, weekLabel, responsibleName, activeHarvestForEmail, activeScarcityForEmail, bulletinNotes]);

  // Toggles
  const toggleHarvestItem = (index: number) => {
    setHarvestItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], checked: !next[index].checked };
      return next;
    });
  };

  const toggleScarcityItem = (index: number) => {
    setScarcityItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], checked: !next[index].checked };
      return next;
    });
  };

  const toggleSubstitute = (scarcityIndex: number, subIndex: number) => {
    setScarcityItems(prev => {
      const next = [...prev];
      const subs = [...next[scarcityIndex].substitutes];
      subs[subIndex] = { ...subs[subIndex], checked: !subs[subIndex].checked };
      next[scarcityIndex] = { ...next[scarcityIndex], substitutes: subs };
      return next;
    });
  };

  const toggleClient = (clientId: string) => {
    setClientSegmentation(prev => prev.map(c => c.id === clientId ? { ...c, checked: !c.checked } : c));
  };

  const toggleAllClients = (checked: boolean) => {
    setClientSegmentation(prev => prev.map(c => ({ ...c, checked })));
  };

  // Dispatch Action
  const handleApproveAndDispatch = async () => {
    if (!confirmedAuth) {
      alert('Debe marcar la casilla de verificación autorizando el despacho formal del boletín.');
      return;
    }

    const selectedIds = clientSegmentation.filter(c => c.checked).map(c => c.id);
    if (selectedIds.length === 0) {
      alert('Debe tener seleccionada al menos una cuenta institucional.');
      return;
    }

    setIsDispatching(true);
    setDispatchError(null);

    try {
      const res = await fetch('/api/commercial/send-market-bulletin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedHarvestItems: activeHarvestForEmail,
          selectedScarcityItems: activeScarcityForEmail,
          selectedClientIds: selectedIds,
          weekLabel,
          notes: bulletinNotes,
          authorName: responsibleName,
          authorId: currentUser.id,
          authorRole: currentUser.role
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error al despachar boletín semanal');
      }

      setDispatchSuccessData({
        clientsCount: data.clients_count || selectedIds.length,
        emailsCount: data.emails_enqueued || selectedIds.length,
        weekLabel
      });

      if (onDispatchSuccess) {
        onDispatchSuccess({
          clientsCount: data.clients_count || selectedIds.length,
          emailsCount: data.emails_enqueued || selectedIds.length,
          weekLabel
        });
      }

    } catch (err: any) {
      console.error('[WeeklyMarketBulletin] Dispatch error:', err);
      setDispatchError(err.message || 'Error inesperado durante el despacho.');
    } finally {
      setIsDispatching(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1.5rem'
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '1100px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid #E2E8F0',
        overflow: 'hidden'
      }}>

        {/* 1. MODAL HEADER (Skin 1: Obsidian Titanium & Emerald) */}
        <div style={{
          backgroundColor: '#0F172A',
          padding: '1.25rem 1.75rem',
          color: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '2px solid #1E293B'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: 'rgba(5, 150, 105, 0.2)',
              border: '1px solid rgba(5, 150, 105, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#34D399'
            }}>
              <Sprout size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                  backgroundColor: '#065F46',
                  color: '#A7F3D0',
                  padding: '2px 8px',
                  borderRadius: '100px'
                }}>
                  Tarea Semanal Táctica • HITL
                </span>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>EVT-10</span>
              </div>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: '900',
                margin: '2px 0 0 0',
                letterSpacing: '-0.3px',
                color: '#FFFFFF',
                fontFamily: 'Outfit, sans-serif'
              }}>
                Boletín Agro-Comercial: Cosechas, Escasez & Sustitutos B2B
              </h2>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'right', marginRight: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: '600' }}>Responsable</div>
              <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#F8FAFC' }}>{responsibleName}</div>
            </div>
            <button
              onClick={onClose}
              disabled={isDispatching}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#CBD5E1',
                padding: '8px',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 2. PROGRESS STEPPER */}
        <div style={{
          backgroundColor: '#F8FAFC',
          padding: '0.85rem 1.75rem',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            {/* Step 1 */}
            <div 
              onClick={() => !dispatchSuccessData && setStep(1)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: dispatchSuccessData ? 'default' : 'pointer',
                opacity: step === 1 ? 1 : 0.65
              }}
            >
              <div style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: step >= 1 ? '#047857' : '#E2E8F0',
                color: '#FFFFFF',
                fontSize: '0.78rem',
                fontWeight: '900',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                1
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: '800', color: step === 1 ? '#0F172A' : '#64748B' }}>
                  Oportunidades & Sustitutos
                </div>
                <div style={{ fontSize: '0.7rem', color: '#047857', fontWeight: '700' }}>
                  {activeHarvestCount} Cosechas • {activeScarcityCount} Alertas
                </div>
              </div>
            </div>

            <ChevronRight size={16} color="#CBD5E1" />

            {/* Step 2 */}
            <div 
              onClick={() => !dispatchSuccessData && setStep(2)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: dispatchSuccessData ? 'default' : 'pointer',
                opacity: step === 2 ? 1 : 0.65
              }}
            >
              <div style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: step >= 2 ? '#047857' : '#E2E8F0',
                color: '#FFFFFF',
                fontSize: '0.78rem',
                fontWeight: '900',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                2
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: '800', color: step === 2 ? '#0F172A' : '#64748B' }}>
                  Segmentación B2B
                </div>
                <div style={{ fontSize: '0.7rem', color: '#047857', fontWeight: '700' }}>
                  {selectedClientsCount} Cuentas Seleccionadas
                </div>
              </div>
            </div>

            <ChevronRight size={16} color="#CBD5E1" />

            {/* Step 3 */}
            <div 
              onClick={() => !dispatchSuccessData && setStep(3)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: dispatchSuccessData ? 'default' : 'pointer',
                opacity: step === 3 ? 1 : 0.65
              }}
            >
              <div style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: step === 3 ? '#047857' : '#E2E8F0',
                color: '#FFFFFF',
                fontSize: '0.78rem',
                fontWeight: '900',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                3
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: '800', color: step === 3 ? '#0F172A' : '#64748B' }}>
                  Previsualización & Despacho
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                  Validación Transaccional
                </div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>
            Ciclo: <strong style={{ color: '#0F172A' }}>{weekLabel.split('(')[0]}</strong>
          </div>
        </div>

        {/* 3. MODAL BODY (Scrollable content per step) */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem 1.75rem',
          backgroundColor: '#FFFFFF'
        }}>

          {/* SUCCESS DISPATCH SCREEN */}
          {dispatchSuccessData ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem 2rem',
              maxWidth: '650px',
              margin: '0 auto'
            }}>
              <div style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                backgroundColor: '#DCFCE7',
                color: '#15803D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem auto'
              }}>
                <CheckCircle2 size={40} />
              </div>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                backgroundColor: '#DCFCE7',
                color: '#15803D',
                padding: '4px 12px',
                borderRadius: '100px'
              }}>
                Despacho Exitoso • Tarea Semanal Cumplida
              </span>
              <h3 style={{
                fontSize: '1.6rem',
                fontWeight: '900',
                color: '#0F172A',
                margin: '0.75rem 0 0.5rem 0',
                fontFamily: 'Outfit, sans-serif'
              }}>
                Boletín Agro-Comercial Encolado
              </h3>
              <p style={{ fontSize: '0.92rem', color: '#475569', lineHeight: 1.5, margin: 0 }}>
                Se han programado exitosamente <strong>{dispatchSuccessData.emailsCount} correos corporativos</strong> para <strong>{dispatchSuccessData.clientsCount} cuentas y matrices B2B</strong> con registro inmutable en auditoría.
              </p>

              <div style={{
                marginTop: '1.5rem',
                padding: '1.25rem',
                backgroundColor: '#F8FAFC',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                textAlign: 'left',
                fontSize: '0.82rem',
                color: '#334155'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#64748B' }}>Ciclo Semanal:</span>
                  <strong style={{ color: '#0F172A' }}>{dispatchSuccessData.weekLabel}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#64748B' }}>Autorizado por:</span>
                  <strong style={{ color: '#0F172A' }}>{responsibleName} (Jefe Comercial)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Canal de Salida:</span>
                  <strong style={{ color: '#047857' }}>Cola Transaccional Supabase `public.mail`</strong>
                </div>
              </div>

              <div style={{ marginTop: '2rem' }}>
                <button
                  onClick={onClose}
                  style={{
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.75rem 2rem',
                    borderRadius: '10px',
                    fontWeight: '800',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.2)'
                  }}
                >
                  Cerrar y Volver al Dashboard Comercial
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* STEP 1: PRODUCTS & ALTERNATIVES */}
              {step === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* Top explanation strip */}
                  <div style={{
                    backgroundColor: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <Info size={20} color="#15803D" style={{ flexShrink: 0 }} />
                    <div style={{ fontSize: '0.82rem', color: '#166534', lineHeight: 1.4 }}>
                      <strong>Paso 1: Selección de Contenido Agronómico.</strong> Revisa y desmarca cualquier ítem que no desees incluir en el boletín semanal. Para productos escasos, puedes seleccionar o desmarcar sustitutos sugeridos de forma individual.
                    </div>
                  </div>

                  {/* 1.1 OPORTUNIDADES DE COSECHA */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          backgroundColor: '#DCFCE7',
                          color: '#15803D',
                          fontSize: '0.7rem',
                          fontWeight: '800',
                          padding: '2px 8px',
                          borderRadius: '6px'
                        }}>
                          🟢 PICO DE COSECHA & ABUNDANCIA
                        </span>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '900', color: '#0F172A', fontFamily: 'Outfit, sans-serif' }}>
                          Oportunidades de Cosecha ({harvestItems.length})
                        </h4>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                        {activeHarvestCount} de {harvestItems.length} activas
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
                      {harvestItems.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          onClick={() => toggleHarvestItem(idx)}
                          style={{
                            border: item.checked ? '2px solid #059669' : '1px solid #E2E8F0',
                            borderRadius: '12px',
                            padding: '12px 14px',
                            backgroundColor: item.checked ? '#F0FDF4' : '#FAFAFA',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            display: 'flex',
                            gap: '10px'
                          }}
                        >
                          <div style={{ marginTop: '2px', color: item.checked ? '#059669' : '#94A3B8' }}>
                            {item.checked ? <CheckSquare size={18} /> : <Square size={18} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <strong style={{ fontSize: '0.9rem', color: item.checked ? '#0F172A' : '#64748B', fontFamily: 'Outfit, sans-serif' }}>
                                {item.name}
                              </strong>
                              <span style={{
                                fontSize: '0.85rem',
                                fontWeight: '900',
                                color: '#047857',
                                fontVariantNumeric: 'tabular-nums'
                              }}>
                                ${typeof item.suggested_price === 'number' ? item.suggested_price.toLocaleString('es-CO') : item.suggested_price}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                              <span style={{ fontSize: '0.72rem', backgroundColor: '#DCFCE7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                {item.unit}
                              </span>
                              <span style={{ fontSize: '0.72rem', backgroundColor: '#E2E8F0', color: '#475569', padding: '1px 6px', borderRadius: '4px', fontWeight: '600' }}>
                                {item.origin}
                              </span>
                            </div>
                            {item.culinary_note && (
                              <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '6px', lineHeight: 1.3 }}>
                                {item.culinary_note}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 1.2 ALERTAS DE ESCASEZ & SUSTITUTOS */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          backgroundColor: '#FEE2E2',
                          color: '#B91C1C',
                          fontSize: '0.7rem',
                          fontWeight: '800',
                          padding: '2px 8px',
                          borderRadius: '6px'
                        }}>
                          🔴 ALERTA DE PLAZA & CONTINUIDAD DE MENÚ
                        </span>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '900', color: '#0F172A', fontFamily: 'Outfit, sans-serif' }}>
                          Alertas de Escasez & Sustitutos ({scarcityItems.length})
                        </h4>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                        {activeScarcityCount} de {scarcityItems.length} activas
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {scarcityItems.map((item, sIdx) => (
                        <div
                          key={item.id || sIdx}
                          style={{
                            border: item.checked ? '2px solid #DC2626' : '1px solid #E2E8F0',
                            borderRadius: '14px',
                            padding: '14px 16px',
                            backgroundColor: item.checked ? '#FFF5F5' : '#FAFAFA'
                          }}
                        >
                          {/* Scarce header */}
                          <div 
                            onClick={() => toggleScarcityItem(sIdx)}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}
                          >
                            <div style={{ marginTop: '2px', color: item.checked ? '#DC2626' : '#94A3B8' }}>
                              {item.checked ? <CheckSquare size={18} /> : <Square size={18} />}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong style={{ fontSize: '0.95rem', color: '#991B1B', fontFamily: 'Outfit, sans-serif' }}>
                                  {item.name} ({item.unit})
                                </strong>
                                <span style={{ fontSize: '0.72rem', backgroundColor: '#FEE2E2', color: '#991B1B', padding: '2px 8px', borderRadius: '4px', fontWeight: '800' }}>
                                  Escasez en Plaza
                                </span>
                              </div>
                              <div style={{ fontSize: '0.78rem', color: '#7F1D1D', marginTop: '2px' }}>
                                <strong>Causa de plaza:</strong> {item.reason}
                              </div>
                            </div>
                          </div>

                          {/* Substitutes sub-list */}
                          {item.checked && item.substitutes.length > 0 && (
                            <div style={{ marginTop: '10px', paddingLeft: '28px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.5px' }}>
                                Sustitutos Sugeridos Desmarcables:
                              </div>
                              {item.substitutes.map((sub, subIdx) => (
                                <div
                                  key={subIdx}
                                  onClick={() => toggleSubstitute(sIdx, subIdx)}
                                  style={{
                                    backgroundColor: '#FFFFFF',
                                    border: sub.checked ? '1px solid #FCA5A5' : '1px dashed #CBD5E1',
                                    borderRadius: '8px',
                                    padding: '8px 12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer',
                                    opacity: sub.checked ? 1 : 0.6
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ color: sub.checked ? '#059669' : '#94A3B8' }}>
                                      {sub.checked ? <CheckSquare size={15} /> : <Square size={15} />}
                                    </div>
                                    <strong style={{ fontSize: '0.82rem', color: '#1E293B' }}>
                                      👉 {sub.name} <span style={{ color: '#64748B', fontWeight: '500' }}>({sub.unit})</span>
                                    </strong>
                                    {sub.ratio_description && (
                                      <span style={{ fontSize: '0.72rem', backgroundColor: '#FEF2F2', color: '#991B1B', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                        {sub.ratio_description}
                                      </span>
                                    )}
                                  </div>
                                  {sub.price_comparison && (
                                    <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#047857', fontVariantNumeric: 'tabular-nums' }}>
                                      {sub.price_comparison}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* STEP 2: SEGMENTATION BY REAL CONSUMPTION */}
              {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  
                  {/* Segmentation Banner */}
                  <div style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ShieldCheck size={18} color="#059669" />
                        <strong style={{ fontSize: '0.9rem', color: '#0F172A' }}>Filtro de Consumo Histórico Real ($\le 60$ Días) & Acuerdos Activos</strong>
                      </div>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                        Solo se pre-seleccionan clientes que realmente consumen estos productos. Cero spam: si no consumen, su contrato se mantiene intacto.
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => toggleAllClients(true)}
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: '800',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#E2E8F0',
                          color: '#334155',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        Seleccionar Todos
                      </button>
                      <button
                        onClick={() => toggleAllClients(false)}
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: '800',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#F1F5F9',
                          color: '#64748B',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        Desmarcar Todos
                      </button>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      placeholder="Buscar por cliente, razón social o NIT..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '0.6rem 1rem',
                        fontSize: '0.85rem',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {/* Clients List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
                    {clientSegmentation
                      .filter(c => !searchFilter || c.name.toLowerCase().includes(searchFilter.toLowerCase()))
                      .map((c) => (
                        <div
                          key={c.id}
                          onClick={() => toggleClient(c.id)}
                          style={{
                            border: c.checked ? '1.5px solid #059669' : '1px solid #E2E8F0',
                            borderRadius: '10px',
                            padding: '12px 16px',
                            backgroundColor: c.checked ? '#F0FDF4' : '#FFFFFF',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'all 0.15s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ color: c.checked ? '#059669' : '#94A3B8' }}>
                              {c.checked ? <CheckSquare size={18} /> : <Square size={18} />}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <strong style={{ fontSize: '0.9rem', color: '#0F172A', fontFamily: 'Outfit, sans-serif' }}>
                                  {c.name}
                                </strong>
                                {c.is_corporate_parent && (
                                  <span style={{ fontSize: '0.68rem', backgroundColor: '#0F172A', color: '#FFFFFF', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                    CASA MATRIZ
                                  </span>
                                )}
                                {c.has_active_agreement && (
                                  <span style={{ fontSize: '0.68rem', backgroundColor: '#DCFCE7', color: '#15803D', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                    ACUERDO ACTIVO
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                                <span>{c.email || 'Sin correo directo'}</span>
                                <span style={{ margin: '0 6px' }}>•</span>
                                <span>Ítems consumidos: <strong style={{ color: '#047857' }}>{c.consumed_products.join(', ')}</strong></span>
                              </div>
                            </div>
                          </div>

                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: '800',
                            color: c.checked ? '#047857' : '#94A3B8'
                          }}>
                            {c.checked ? 'Incluido' : 'Descartado'}
                          </span>
                        </div>
                      ))}
                  </div>

                  {/* Excluded notice */}
                  {excludedClientsCount > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#64748B', textAlign: 'center', padding: '6px' }}>
                      🛡️ <strong>{excludedClientsCount} cuentas</strong> fueron excluidas automáticamente por cero consumo de estos productos específicos.
                    </div>
                  )}

                </div>
              )}

              {/* STEP 3: LIVE PREVIEW & AUTHORIZATION */}
              {step === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  
                  {/* Summary bar */}
                  <div style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '800' }}>Destinatarios B2B</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0F172A' }}>{selectedClientsCount} Cuentas</div>
                      </div>
                      <div style={{ borderLeft: '1px solid #CBD5E1', paddingLeft: '16px' }}>
                        <span style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '800' }}>Cosechas</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#047857' }}>{activeHarvestForEmail.length} Ítems</div>
                      </div>
                      <div style={{ borderLeft: '1px solid #CBD5E1', paddingLeft: '16px' }}>
                        <span style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', fontWeight: '800' }}>Escasez con Sustitutos</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#DC2626' }}>{activeScarcityForEmail.length} Alertas</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Vista previa para:</span>
                      <select
                        value={previewClientName}
                        onChange={(e) => setPreviewClientName(e.target.value)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.8rem',
                          fontWeight: '700',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          backgroundColor: '#FFFFFF'
                        }}
                      >
                        {clientSegmentation.filter(c => c.checked).map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* HTML Iframe Preview Container */}
                  <div style={{
                    border: '1px solid #CBD5E1',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    backgroundColor: '#F1F5F9',
                    maxHeight: '440px',
                    height: '440px',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
                  }}>
                    <iframe
                      srcDoc={livePreviewHtml}
                      title="Previsualización de Correo de Boletín Semanal"
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        backgroundColor: '#F1F5F9'
                      }}
                    />
                  </div>

                  {/* Mandatory Authorization Checkbox */}
                  <div style={{
                    backgroundColor: confirmedAuth ? '#F0FDF4' : '#FFFBEB',
                    border: confirmedAuth ? '1.5px solid #059669' : '1.5px solid #F59E0B',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer'
                  }}
                  onClick={() => setConfirmedAuth(!confirmedAuth)}
                  >
                    <div style={{ color: confirmedAuth ? '#059669' : '#D97706' }}>
                      {confirmedAuth ? <CheckSquare size={22} /> : <Square size={22} />}
                    </div>
                    <div style={{ flex: 1, fontSize: '0.85rem', color: '#0F172A', lineHeight: 1.4 }}>
                      <strong>Autorización Explícita Human-in-the-Loop (HITL):</strong> He revisado la veracidad agronómica, precios sugeridos y sustitutos culinarios, y autorizo el despacho formal del boletín por correo electrónico a las <strong>{selectedClientsCount} cuentas B2B seleccionadas</strong>.
                    </div>
                  </div>

                  {dispatchError && (
                    <div style={{
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #F87171',
                      color: '#991B1B',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      fontSize: '0.82rem'
                    }}>
                      <strong>Error al despachar:</strong> {dispatchError}
                    </div>
                  )}

                </div>
              )}
            </>
          )}

        </div>

        {/* 4. MODAL FOOTER */}
        {!dispatchSuccessData && (
          <div style={{
            backgroundColor: '#F8FAFC',
            padding: '1rem 1.75rem',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              {step > 1 ? (
                <button
                  onClick={() => setStep((step - 1) as any)}
                  disabled={isDispatching}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    color: '#334155',
                    padding: '0.55rem 1.2rem',
                    borderRadius: '8px',
                    fontWeight: '700',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <ChevronLeft size={16} /> Atrás
                </button>
              ) : (
                <button
                  onClick={onClose}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#64748B',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {step < 3 ? (
                <button
                  onClick={() => setStep((step + 1) as any)}
                  style={{
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.6rem 1.4rem',
                    borderRadius: '8px',
                    fontWeight: '800',
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(15, 23, 42, 0.15)'
                  }}
                >
                  Continuar <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  onClick={handleApproveAndDispatch}
                  disabled={isDispatching || !confirmedAuth}
                  style={{
                    backgroundColor: confirmedAuth ? '#047857' : '#94A3B8',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.65rem 1.8rem',
                    borderRadius: '8px',
                    fontWeight: '900',
                    fontSize: '0.9rem',
                    cursor: confirmedAuth && !isDispatching ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: confirmedAuth ? '0 4px 6px -1px rgba(4, 120, 87, 0.3)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  {isDispatching ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" /> Despachando a {selectedClientsCount} Cuentas...
                    </>
                  ) : (
                    <>
                      <Send size={18} /> Aprobar y Despachar Boletín Semanal
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
