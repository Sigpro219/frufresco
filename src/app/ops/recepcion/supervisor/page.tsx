'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { isAbortError } from '@/lib/errorUtils';
import { 
  ShieldAlert, 
  Scale, 
  CheckCircle, 
  XCircle, 
  ChevronLeft, 
  RefreshCw, 
  Search, 
  AlertTriangle,
  FileText,
  User,
  Clock,
  Calendar,
  AlertCircle,
  TrendingUp,
  Inbox,
  Sparkles,
  Camera,
  ArrowRight,
  QrCode,
  Users,
  Check
} from 'lucide-react';

// Types and Interfaces
interface Product {
  name: string;
  unit_of_measure: string;
  category: string;
  image_url?: string;
  sku: string;
}

interface Provider {
  name: string;
}

interface PurchaseQuarantine {
  id: string;
  product_id: string;
  product: Product;
  quantity: number; // Cantidad original
  picked_up_quantity?: number; // Cantidad recogida (si aplica)
  received_quantity?: number; // Cantidad pesada en bodega
  status: string;
  variant_label?: string;
  task_id?: string;
  provider_id?: string;
  provider?: Provider;
  quality_notes?: string;
  created_at: string;
}

interface DiscrepancyItem {
  id: string;
  purchase_id: string;
  product_id: string;
  expected_quantity: number;
  received_quantity: number;
  excess_quantity: number;
  status: string;
  supervisor_notes?: string;
  created_at: string;
  product: Product;
  purchase: {
    variant_label?: string;
    task_id?: string;
    provider_id?: string;
    provider?: Provider;
  };
}

interface CollaboratorProfile {
  id: string;
  contact_name: string;
  role: string;
  specialty?: string;
  allowed_modules: string[];
  document_id?: string;
  is_active: boolean;
  active_shift?: {
    id: string;
    started_at: string;
  } | null;
}

export default function SupervisorDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'quarantine' | 'discrepancy' | 'staff'>('quarantine');
  const [loading, setLoading] = useState(true);
  
  // Data lists
  const [quarantines, setQuarantines] = useState<PurchaseQuarantine[]>([]);
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyItem[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorProfile[]>([]);
  
  // Filter search
  const [searchQuery, setSearchQuery] = useState('');
  
  // Detail / Action Modals
  const [selectedQuarantine, setSelectedQuarantine] = useState<PurchaseQuarantine | null>(null);
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<DiscrepancyItem | null>(null);
  
  // Interaction form states
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('quality_defect');
  const [rejectionCustomText, setRejectionCustomText] = useState('');
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // File Upload for Rejections
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const showToastMsg = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Purchases in quarantine (received_review)
      const { data: purchaseData, error: purchaseError } = await supabase
        .from('purchases')
        .select(`
          id,
          product_id,
          quantity,
          picked_up_quantity,
          status,
          variant_label,
          task_id,
          provider_id,
          quality_notes,
          created_at,
          product:products (
            name,
            unit_of_measure,
            category,
            image_url,
            sku
          ),
          provider:providers (
            name
          )
        `)
        .eq('status', 'received_review')
        .order('created_at', { ascending: false });

      if (purchaseError) throw purchaseError;
      
      // Calculate received quantity if there's inventory movements
      const purchaseList = purchaseData || [];
      
      // Fetch received_quantity from inventory movements for these purchases to be accurate
      const purchaseIds = purchaseList.map(p => p.id);
      let movementsMap: Record<string, number> = {};
      
      if (purchaseIds.length > 0) {
        const { data: movementsData } = await supabase
          .from('inventory_movements')
          .select('reference_id, quantity')
          .in('reference_id', purchaseIds)
          .eq('reference_type', 'purchase_reception');
          
        if (movementsData) {
          movementsData.forEach((mv: any) => {
            movementsMap[mv.reference_id] = mv.quantity;
          });
        }
      }
      
      const formattedQuarantines = purchaseList.map((p: any) => ({
        ...p,
        received_quantity: movementsMap[p.id] || p.picked_up_quantity || p.quantity
      }));

      setQuarantines(formattedQuarantines);

      // 2. Fetch weight discrepancies (pending_approval)
      const { data: discData, error: discError } = await supabase
        .from('weight_discrepancies')
        .select(`
          id,
          purchase_id,
          product_id,
          expected_quantity,
          received_quantity,
          excess_quantity,
          status,
          supervisor_notes,
          created_at,
          product:products (
            name,
            unit_of_measure,
            category,
            image_url,
            sku
          ),
          purchase:purchases (
            variant_label,
            task_id,
            provider_id,
            provider:providers (
              name
            )
          )
        `)
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false });

      if (discError) throw discError;
      setDiscrepancies(discData || []);

      // 3. Fetch active floor collaborators and their current shifts
      const { data: collabData, error: collabError } = await supabase
        .from('collaborators')
        .select(`
          id,
          contact_name,
          role,
          specialty,
          allowed_modules,
          document_id,
          is_active
        `)
        .eq('is_active', true)
        .order('contact_name', { ascending: true });

      if (collabError) throw collabError;

      // Fetch active shifts in parallel
      const { data: activeShifts } = await supabase
        .from('collaborator_shifts')
        .select('id, collaborator_id, started_at')
        .eq('status', 'active');

      const shiftsMap: Record<string, { id: string; started_at: string }> = {};
      if (activeShifts) {
        activeShifts.forEach(shift => {
          shiftsMap[shift.collaborator_id] = {
            id: shift.id,
            started_at: shift.started_at
          };
        });
      }

      const formattedCollabs = (collabData || []).map((c: any) => ({
        ...c,
        allowed_modules: c.allowed_modules || [],
        active_shift: shiftsMap[c.id] || null
      }));

      setCollaborators(formattedCollabs);

    } catch (err: any) {
      if (!isAbortError(err)) {
        console.error('Error fetching supervisor data:', err);
        showToastMsg('Error al cargar datos del servidor', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Image Upload helper
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setEvidenceFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setEvidencePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // ----------------------------------------------------
  // SUBMODULE: CUARENTENAS - RESOLVE ACTION
  // ----------------------------------------------------
  const handleResolveQuarantine = async () => {
    if (!selectedQuarantine || !actionType) return;
    setSubmitting(true);

    try {
      const { data: warehouseData } = await supabase
        .from('warehouses')
        .select('id')
        .limit(1)
        .single();
        
      if (!warehouseData) throw new Error('No se encontró bodega activa');
      
      const warehouseId = warehouseData.id;
      const targetQty = selectedQuarantine.received_quantity || selectedQuarantine.picked_up_quantity || selectedQuarantine.quantity;
      let finalVoucherUrl = null;

      // Handle file upload if rejected
      if (actionType === 'reject' && evidenceFile) {
        const fileExt = evidenceFile.name.split('.').pop();
        const fileName = `supervisor_rej_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('vouchers')
          .upload(filePath, evidenceFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('vouchers')
          .getPublicUrl(filePath);
        
        finalVoucherUrl = publicUrl;
      }

      if (actionType === 'approve') {
        // 1. Update purchase status to received_ok
        const { error: pErr } = await supabase
          .from('purchases')
          .update({ 
            status: 'received_ok', 
            quality_notes: notes || 'Aprobado por supervisor posterior a revisión' 
          })
          .eq('id', selectedQuarantine.id);

        if (pErr) throw pErr;

        // 2. Transfer stock from in_process to available
        // Call handle_inventory_movement using RPC
        const { error: rpcErr } = await supabase.rpc('handle_inventory_movement', {
          p_product_id: selectedQuarantine.product_id,
          p_warehouse_id: warehouseId,
          p_quantity: targetQty,
          p_type: 'transfer',
          p_status_from: 'in_process',
          p_status_to: 'available',
          p_notes: `Liberado de cuarentena por supervisor. Notas: ${notes || 'Sin observaciones'}`,
          p_reference_type: 'purchase_reception',
          p_reference_id: selectedQuarantine.id
        });

        if (rpcErr) throw rpcErr;
        showToastMsg('Mercancía liberada de cuarentena exitosamente');

      } else if (actionType === 'reject') {
        const finalReason = rejectionReason === 'other' ? rejectionCustomText : rejectionReason;
        
        // 1. Update purchase status to received_rejected
        const { error: pErr } = await supabase
          .from('purchases')
          .update({ 
            status: 'received_rejected', 
            rejection_reason: finalReason,
            quality_notes: notes || 'Rechazado por supervisor posterior a cuarentena',
            voucher_image_url: finalVoucherUrl
          })
          .eq('id', selectedQuarantine.id);

        if (pErr) throw pErr;

        // 2. Discard/Exit from in_process stock
        const { error: rpcErr } = await supabase.rpc('handle_inventory_movement', {
          p_product_id: selectedQuarantine.product_id,
          p_warehouse_id: warehouseId,
          p_quantity: targetQty,
          p_type: 'exit',
          p_status_from: 'in_process',
          p_status_to: '',
          p_notes: `Rechazado en cuarentena. Notas: ${notes || 'Sin observaciones'}. Motivo: ${finalReason}`,
          p_reference_type: 'purchase_reception',
          p_reference_id: selectedQuarantine.id
        });

        if (rpcErr) throw rpcErr;

        // 3. Reopen procurement task
        if (selectedQuarantine.task_id) {
          const baseQtyToDeduct = selectedQuarantine.quantity;
          const { data: task, error: taskFetchErr } = await supabase
            .from('procurement_tasks')
            .select('id, total_requested, total_purchased, unit')
            .eq('id', selectedQuarantine.task_id)
            .single();

          if (!taskFetchErr && task) {
            let baseQtyToDeductConverted = baseQtyToDeduct;

            // Apply conversions if units differ
            if (selectedQuarantine.product.unit_of_measure && task.unit && selectedQuarantine.product.unit_of_measure !== task.unit) {
              const { data: convData } = await supabase
                .from('product_conversions')
                .select('conversion_factor')
                .eq('product_id', selectedQuarantine.product_id)
                .eq('from_unit', selectedQuarantine.product.unit_of_measure)
                .eq('to_unit', task.unit)
                .maybeSingle();

              if (convData && parseFloat(convData.conversion_factor) > 0) {
                baseQtyToDeductConverted = baseQtyToDeduct * parseFloat(convData.conversion_factor);
              }
            }

            const newPurchased = Math.max(0, (task.total_purchased || 0) - baseQtyToDeductConverted);
            const newTaskStatus = newPurchased <= 0 ? 'pending' : (newPurchased >= task.total_requested ? 'completed' : 'partial');

            await supabase
              .from('procurement_tasks')
              .update({
                total_purchased: newPurchased,
                status: newTaskStatus
              })
              .eq('id', task.id);
          }
        }

        // 4. Log provider novelty
        const noveltyPayload = {
          purchase_id: selectedQuarantine.id,
          task_id: selectedQuarantine.task_id || null,
          provider_id: selectedQuarantine.provider_id || null,
          product_id: selectedQuarantine.product_id,
          variant_label: selectedQuarantine.variant_label || null,
          novelty_type: 'rejection',
          quantity: selectedQuarantine.quantity,
          unit: selectedQuarantine.product.unit_of_measure || null,
          reason: finalReason,
          description: `Mercancía rechazada por el supervisor después de periodo de cuarentena. Notas: ${notes}`,
          evidence_url: finalVoucherUrl || null,
        };

        await supabase.from('provider_novelties').insert([noveltyPayload]);
        showToastMsg('Mercancía rechazada. Se reabrió la compra y se registró la novedad.', 'error');
      }

      // Close modal & reload
      setSelectedQuarantine(null);
      setNotes('');
      setActionType(null);
      setEvidenceFile(null);
      setEvidencePreview(null);
      fetchData();
    } catch (err: any) {
      console.error('Error resolving quarantine:', err);
      showToastMsg('Error al guardar decisión de cuarentena', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // SUBMODULE: EXCEDENTES - RESOLVE ACTION
  // ----------------------------------------------------
  const handleResolveDiscrepancy = async () => {
    if (!selectedDiscrepancy || !actionType) return;
    setSubmitting(true);

    try {
      const { data: warehouseData } = await supabase
        .from('warehouses')
        .select('id')
        .limit(1)
        .single();
        
      if (!warehouseData) throw new Error('No se encontró bodega activa');
      
      const warehouseId = warehouseData.id;
      const excessQty = parseFloat(selectedDiscrepancy.excess_quantity.toString());

      if (actionType === 'approve') {
        // 1. Update discrepancy status
        const { error: dErr } = await supabase
          .from('weight_discrepancies')
          .update({
            status: 'approved',
            supervisor_notes: notes || 'Excedente de peso aprobado por el supervisor',
            resolved_at: new Date().toISOString()
          })
          .eq('id', selectedDiscrepancy.id);

        if (dErr) throw dErr;

        // 2. Transfer excess quantity from in_process to available
        const { error: rpcErr } = await supabase.rpc('handle_inventory_movement', {
          p_product_id: selectedDiscrepancy.product_id,
          p_warehouse_id: warehouseId,
          p_quantity: excessQty,
          p_type: 'transfer',
          p_status_from: 'in_process',
          p_status_to: 'available',
          p_notes: `Excedente autorizado por supervisor: +${excessQty} ${selectedDiscrepancy.product.unit_of_measure}. Notas: ${notes}`,
          p_reference_type: 'purchase_reception',
          p_reference_id: selectedDiscrepancy.purchase_id
        });

        if (rpcErr) throw rpcErr;

        // 3. Consolidate purchase quantity in the record
        // Update purchase to contain the final full quantity (expected + excess = received)
        await supabase
          .from('purchases')
          .update({
            picked_up_quantity: selectedDiscrepancy.received_quantity
          })
          .eq('id', selectedDiscrepancy.purchase_id);

        showToastMsg('Excedente aprobado e ingresado a inventario disponible');

      } else if (actionType === 'reject') {
        // 1. Update discrepancy status
        const { error: dErr } = await supabase
          .from('weight_discrepancies')
          .update({
            status: 'rejected',
            supervisor_notes: notes || 'Excedente de peso rechazado por el supervisor',
            resolved_at: new Date().toISOString()
          })
          .eq('id', selectedDiscrepancy.id);

        if (dErr) throw dErr;

        // 2. Discard/Exit excess quantity from in_process stock
        const { error: rpcErr } = await supabase.rpc('handle_inventory_movement', {
          p_product_id: selectedDiscrepancy.product_id,
          p_warehouse_id: warehouseId,
          p_quantity: excessQty,
          p_type: 'exit',
          p_status_from: 'in_process',
          p_status_to: '',
          p_notes: `Excedente rechazado por supervisor: -${excessQty} ${selectedDiscrepancy.product.unit_of_measure}. Notas: ${notes}`,
          p_reference_type: 'purchase_reception',
          p_reference_id: selectedDiscrepancy.purchase_id
        });

        if (rpcErr) throw rpcErr;

        showToastMsg('Excedente rechazado. Inventario excedente descartado.', 'error');
      }

      // Close modal & reload
      setSelectedDiscrepancy(null);
      setNotes('');
      setActionType(null);
      fetchData();
    } catch (err: any) {
      console.error('Error resolving discrepancy:', err);
      showToastMsg('Error al resolver excedente', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleModuleAccess = async (collabId: string, moduleName: string, currentlyAllowed: boolean) => {
    try {
      const targetCollab = collaborators.find(c => c.id === collabId);
      if (!targetCollab) return;

      let updatedModules = [...targetCollab.allowed_modules];
      if (currentlyAllowed) {
        updatedModules = updatedModules.filter(m => m !== moduleName);
      } else {
        if (!updatedModules.includes(moduleName)) {
          updatedModules.push(moduleName);
        }
      }

      const { error } = await supabase
        .from('collaborators')
        .update({ allowed_modules: updatedModules })
        .eq('id', collabId);

      if (error) throw error;

      // Log assignment change to audits
      await supabase.from('audit_logs').insert([{
        action: 'UPDATE_PERMISSIONS',
        module: 'SUPERVISOR',
        collaborator_id: collabId,
        collaborator_name: targetCollab.contact_name,
        details: { allowed_modules: updatedModules, changed_module: moduleName, operation: currentlyAllowed ? 'remove' : 'add' }
      }]);

      showToastMsg('Permisos actualizados correctamente');
      
      // Update local state instantly
      setCollaborators(prev => prev.map(c => c.id === collabId ? { ...c, allowed_modules: updatedModules } : c));
    } catch (err: any) {
      console.error('Error updating permissions:', err);
      showToastMsg('No se pudieron actualizar los permisos', 'error');
    }
  };

  // Filter items based on search input
  const filteredQuarantines = quarantines.filter(item => 
    item.product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.provider?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDiscrepancies = discrepancies.filter(item => 
    item.product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.purchase?.provider?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ 
      fontFamily: 'Inter, sans-serif',
      padding: '1.25rem',
      maxWidth: '1200px',
      margin: '0 auto',
      minHeight: '100vh',
      paddingBottom: '6rem'
    }}>
      
      {/* Toast Alert */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: toast.type === 'success' ? '#10B981' : '#EF4444',
          color: 'white',
          padding: '1rem 1.5rem',
          borderRadius: '12px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 'bold',
          animation: 'fadeSlideIn 0.3s ease-out'
        }}>
          {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Breadcrumb Navigation & Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button 
          onClick={() => router.push('/ops/recepcion')}
          className="hover-bright"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            color: 'var(--ops-text-muted)',
            fontSize: '0.85rem',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          <ChevronLeft size={16} /> Volver a Recibo
        </button>

        <button 
          onClick={fetchData}
          disabled={loading}
          style={{
            background: 'var(--ops-surface)',
            border: '1px solid var(--ops-border)',
            color: 'var(--ops-text)',
            padding: '8px 12px',
            borderRadius: '10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
            fontWeight: '600'
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Header Info */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ 
          fontSize: '2rem', 
          fontWeight: '900', 
          fontFamily: 'Outfit, sans-serif', 
          margin: '0 0 0.5rem 0',
          letterSpacing: '-0.02em',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          Portal del <span style={{ color: 'var(--ops-primary)' }}>Supervisor</span>
        </h1>
        <p style={{ color: 'var(--ops-text-muted)', margin: 0, fontSize: '0.9rem' }}>
          Autorización y resolución de mercancías en cuarentena y discrepancias de peso en báscula.
        </p>
      </div>

      {/* Dashboard KPI Mini Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
        gap: '1rem',
        marginBottom: '2rem' 
      }}>
        <div style={{
          backgroundColor: 'var(--ops-surface)',
          border: '1px solid var(--ops-border)',
          borderRadius: '16px',
          padding: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.02)'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--ops-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cuarentenas Activas</div>
            <div style={{ fontSize: '2rem', fontWeight: '900', fontFamily: 'Outfit, sans-serif', margin: '4px 0', color: '#F59E0B' }}>
              {quarantines.length}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--ops-text-muted)' }}>Productos en revisión de calidad</div>
          </div>
          <div style={{ 
            backgroundColor: 'rgba(245, 158, 11, 0.1)', 
            color: '#F59E0B',
            padding: '12px', 
            borderRadius: '14px' 
          }}>
            <ShieldAlert size={24} />
          </div>
        </div>

        <div style={{
          backgroundColor: 'var(--ops-surface)',
          border: '1px solid var(--ops-border)',
          borderRadius: '16px',
          padding: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.02)'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--ops-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Excedentes Pendientes</div>
            <div style={{ fontSize: '2rem', fontWeight: '900', fontFamily: 'Outfit, sans-serif', margin: '4px 0', color: '#10B981' }}>
              {discrepancies.length}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--ops-text-muted)' }}>Autorizaciones de peso en báscula</div>
          </div>
          <div style={{ 
            backgroundColor: 'rgba(16, 185, 129, 0.1)', 
            color: '#10B981',
            padding: '12px', 
            borderRadius: '14px' 
          }}>
            <Scale size={24} />
          </div>
        </div>
      </div>

      {/* Tabs Selector style Glassmorphism */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        padding: '6px', 
        backgroundColor: 'rgba(255, 255, 255, 0.03)', 
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--ops-border)',
        borderRadius: '18px',
        marginBottom: '1.5rem'
      }}>
        <button 
          onClick={() => { setActiveTab('quarantine'); setSearchQuery(''); }}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '14px',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: '700',
            fontFamily: 'Outfit, sans-serif',
            cursor: 'pointer',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            backgroundColor: activeTab === 'quarantine' ? '#10B981' : 'transparent',
            color: activeTab === 'quarantine' ? 'white' : 'var(--ops-text-muted)'
          }}
        >
          🛡️ Cuarentenas ({quarantines.length})
        </button>
        <button 
          onClick={() => { setActiveTab('discrepancy'); setSearchQuery(''); }}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '14px',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: '700',
            fontFamily: 'Outfit, sans-serif',
            cursor: 'pointer',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            backgroundColor: activeTab === 'discrepancy' ? '#F59E0B' : 'transparent',
            color: activeTab === 'discrepancy' ? 'white' : 'var(--ops-text-muted)'
          }}
        >
          ⚖️ Excedentes ({discrepancies.length})
        </button>
        <button 
          onClick={() => { setActiveTab('staff'); setSearchQuery(''); }}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '14px',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: '700',
            fontFamily: 'Outfit, sans-serif',
            cursor: 'pointer',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            backgroundColor: activeTab === 'staff' ? 'var(--ops-primary)' : 'transparent',
            color: activeTab === 'staff' ? 'white' : 'var(--ops-text-muted)'
          }}
        >
          👥 Colaboradores ({collaborators.length})
        </button>
      </div>

      {/* Search Input Bar */}
      <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
        <input 
          type="text" 
          placeholder="Buscar por SKU, producto o proveedor..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            paddingLeft: '44px',
            borderRadius: '12px',
            border: '1px solid var(--ops-border)',
            backgroundColor: 'var(--ops-surface)',
            color: 'var(--ops-text)',
            fontSize: '0.9rem',
            boxSizing: 'border-box',
            outline: 'none'
          }}
        />
        <Search size={18} style={{ 
          position: 'absolute', 
          left: '16px', 
          top: '50%', 
          transform: 'translateY(-50%)', 
          color: 'var(--ops-text-muted)' 
        }} />
      </div>

      {/* Active module content rendering */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
          <RefreshCw className="animate-spin" size={36} style={{ color: 'var(--ops-primary)', marginBottom: '1rem' }} />
          <span style={{ color: 'var(--ops-text-muted)', fontSize: '0.9rem', fontWeight: 'bold' }}>Cargando información...</span>
        </div>
      ) : activeTab === 'quarantine' ? (
        // LIST OF QUARANTINES
        filteredQuarantines.length === 0 ? (
          <div style={{ 
            backgroundColor: 'var(--ops-surface)', 
            border: '1px dashed var(--ops-border)', 
            borderRadius: '16px', 
            padding: '4rem 2rem', 
            textAlign: 'center',
            color: 'var(--ops-text-muted)' 
          }}>
            <Inbox size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.6 }} />
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: '800' }}>Sin Cuarentenas</h3>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>No hay compras retenidas en cuarentena de calidad actualmente.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredQuarantines.map(item => (
              <div 
                key={item.id}
                style={{
                  backgroundColor: 'var(--ops-surface)',
                  border: '1px solid var(--ops-border)',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.02)'
                }}
              >
                {/* Product/Vendor Row */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ 
                    position: 'relative', 
                    width: '60px', 
                    height: '60px', 
                    borderRadius: '12px', 
                    overflow: 'hidden', 
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    flexShrink: 0
                  }}>
                    {item.product.image_url ? (
                      <img 
                        src={item.product.image_url} 
                        alt={item.product.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ops-text-muted)', fontSize: '1.5rem', fontWeight: 'bold' }}>
                        {item.product.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '4px' }}>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: '800' }}>{item.product.name}</h4>
                      <span style={{ 
                        fontSize: '0.65rem', 
                        fontWeight: '800', 
                        backgroundColor: 'rgba(245, 158, 11, 0.15)', 
                        color: '#F59E0B', 
                        padding: '2px 8px', 
                        borderRadius: '6px',
                        textTransform: 'uppercase'
                      }}>
                        ⚠️ Calidad Amarilla
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', color: 'var(--ops-text-muted)', fontSize: '0.75rem', flexWrap: 'wrap' }}>
                      <span>SKU: <strong>{item.product.sku}</strong></span>
                      <span>•</span>
                      <span>Proveedor: <strong>{item.provider?.name || 'No asignado'}</strong></span>
                      {item.variant_label && (
                        <>
                          <span>•</span>
                          <span>Var: <strong>{item.variant_label}</strong></span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Details grid */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '0.75rem',
                  padding: '10px 12px',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.03)'
                }}>
                  <div style={{ fontSize: '0.8rem' }}>
                    <div style={{ color: 'var(--ops-text-muted)', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}>CANTIDAD COMPRADA:</div>
                    <div style={{ fontWeight: 'bold', marginTop: '2px' }}>
                      {item.quantity} {item.product.unit_of_measure}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8rem' }}>
                    <div style={{ color: 'var(--ops-text-muted)', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}>CANTIDAD RECIBIDA:</div>
                    <div style={{ fontWeight: 'bold', marginTop: '2px', color: 'var(--ops-primary)' }}>
                      {item.received_quantity} {item.product.unit_of_measure}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8rem' }}>
                    <div style={{ color: 'var(--ops-text-muted)', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}>NOTAS DEL RECIBIDOR:</div>
                    <div style={{ marginTop: '2px', fontStyle: 'italic', color: '#F59E0B' }}>
                      "{item.quality_notes || 'Sin comentarios detallados'}"
                    </div>
                  </div>
                </div>

                {/* Actions row */}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <button 
                    onClick={() => { setSelectedQuarantine(item); setActionType('reject'); setNotes(''); }}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '10px',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      color: '#EF4444',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <XCircle size={15} /> Rechazar
                  </button>
                  
                  <button 
                    onClick={() => { setSelectedQuarantine(item); setActionType('approve'); setNotes(''); }}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '10px',
                      border: 'none',
                      backgroundColor: '#10B981',
                      color: 'white',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <CheckCircle size={15} /> Liberar a Inventario
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : activeTab === 'discrepancy' ? (
        // LIST OF WEIGHT DISCREPANCIES
        filteredDiscrepancies.length === 0 ? (
          <div style={{ 
            backgroundColor: 'var(--ops-surface)', 
            border: '1px dashed var(--ops-border)', 
            borderRadius: '16px', 
            padding: '4rem 2rem', 
            textAlign: 'center',
            color: 'var(--ops-text-muted)' 
          }}>
            <Inbox size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.6 }} />
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: '800' }}>Sin Excedentes</h3>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>No hay autorizaciones pendientes de excedentes de peso actualmente.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredDiscrepancies.map(item => (
              <div 
                key={item.id}
                style={{
                  backgroundColor: 'var(--ops-surface)',
                  border: '1px solid var(--ops-border)',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.02)'
                }}
              >
                {/* Product/Vendor Row */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ 
                    position: 'relative', 
                    width: '60px', 
                    height: '60px', 
                    borderRadius: '12px', 
                    overflow: 'hidden', 
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    flexShrink: 0
                  }}>
                    {item.product.image_url ? (
                      <img 
                        src={item.product.image_url} 
                        alt={item.product.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ops-text-muted)', fontSize: '1.5rem', fontWeight: 'bold' }}>
                        {item.product.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '4px' }}>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: '800' }}>{item.product.name}</h4>
                      <span style={{ 
                        fontSize: '0.65rem', 
                        fontWeight: '800', 
                        backgroundColor: 'rgba(16, 185, 129, 0.15)', 
                        color: '#10B981', 
                        padding: '2px 8px', 
                        borderRadius: '6px',
                        textTransform: 'uppercase',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        ⚖️ Excedente de Peso: +{item.excess_quantity} {item.product.unit_of_measure}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', color: 'var(--ops-text-muted)', fontSize: '0.75rem', flexWrap: 'wrap' }}>
                      <span>SKU: <strong>{item.product.sku}</strong></span>
                      <span>•</span>
                      <span>Proveedor: <strong>{item.purchase?.provider?.name || 'No asignado'}</strong></span>
                      {item.purchase?.variant_label && (
                        <>
                          <span>•</span>
                          <span>Var: <strong>{item.purchase.variant_label}</strong></span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Weight Details Grid */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(3, 1fr)', 
                  gap: '0.5rem',
                  padding: '10px 12px',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.03)',
                  textAlign: 'center'
                }}>
                  <div>
                    <div style={{ color: 'var(--ops-text-muted)', fontSize: '0.65rem', fontWeight: 'bold' }}>ESPERADO / COMPRA</div>
                    <div style={{ fontWeight: 'bold', fontSize: '1rem', marginTop: '2px' }}>
                      {item.expected_quantity} {item.product.unit_of_measure}
                    </div>
                  </div>
                  <div style={{ borderLeft: '1px solid var(--ops-border)', borderRight: '1px solid var(--ops-border)' }}>
                    <div style={{ color: 'var(--ops-text-muted)', fontSize: '0.65rem', fontWeight: 'bold' }}>RECIBIDO BÁSCULA</div>
                    <div style={{ fontWeight: 'bold', fontSize: '1rem', marginTop: '2px', color: '#F59E0B' }}>
                      {item.received_quantity} {item.product.unit_of_measure}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#10B981', fontSize: '0.65rem', fontWeight: 'bold' }}>SURPLUS / SOBRANTE</div>
                    <div style={{ fontWeight: 'bold', fontSize: '1rem', marginTop: '2px', color: '#10B981' }}>
                      +{item.excess_quantity} {item.product.unit_of_measure}
                    </div>
                  </div>
                </div>

                {/* Actions row */}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <button 
                    onClick={() => { setSelectedDiscrepancy(item); setActionType('reject'); setNotes(''); }}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '10px',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      color: '#EF4444',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <XCircle size={15} /> Rechazar Exceso
                  </button>
                  
                  <button 
                    onClick={() => { setSelectedDiscrepancy(item); setActionType('approve'); setNotes(''); }}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '10px',
                      border: 'none',
                      backgroundColor: '#10B981',
                      color: 'white',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <CheckCircle size={15} /> Autorizar Ingreso Excedente
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        // STAFF TAB VIEW
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {collaborators.filter(c => c.contact_name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
            <div style={{ 
              backgroundColor: 'var(--ops-surface)', 
              border: '1px dashed var(--ops-border)', 
              borderRadius: '16px', 
              padding: '4rem 2rem', 
              textAlign: 'center',
              color: 'var(--ops-text-muted)' 
            }}>
              <Users size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.6 }} />
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: '800' }}>Sin Resultados</h3>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>No se encontraron colaboradores activos que coincidan con la búsqueda.</p>
            </div>
          ) : (
            collaborators.filter(c => c.contact_name.toLowerCase().includes(searchQuery.toLowerCase())).map(collab => {
              const modules = [
                { value: 'Compras', label: 'Compras' },
                { value: 'Recogida', label: 'Recogida' },
                { value: 'Recepción', label: 'Recepción' },
                { value: 'Alistamiento', label: 'Picking' },
                { value: 'Despacho', label: 'Despacho' },
                { value: 'Inventarios', label: 'Inventario' }
              ];
              
              return (
                <div 
                  key={collab.id}
                  style={{
                    backgroundColor: 'var(--ops-surface)',
                    border: '1px solid var(--ops-border)',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.02)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: '800', fontFamily: 'Outfit, sans-serif', color: 'var(--ops-text)' }}>
                        {collab.contact_name}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: '900', color: 'var(--ops-primary)', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                          {collab.role}
                        </span>
                        {collab.specialty && (
                          <span style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--ops-text-muted)' }}>
                            📍 {collab.specialty}
                          </span>
                        )}
                        {collab.document_id && (
                          <span style={{ fontSize: '0.65rem', fontWeight: '600', color: 'var(--ops-text-muted)' }}>
                            ID: {collab.document_id}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      {collab.active_shift ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: '800', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10B981', padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                          <span style={{ width: '6px', height: '6px', backgroundColor: '#10B981', borderRadius: '50%' }}></span>
                          TURNO ACTIVO (Inició {new Date(collab.active_shift.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', fontWeight: '800', backgroundColor: 'rgba(0,0,0,0.04)', color: 'var(--ops-text-muted)', padding: '4px 10px', borderRadius: '8px' }}>
                          SIN TURNO ACTIVO
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Modules Selector Switches Grid */}
                  <div style={{ 
                    borderTop: '1px solid var(--ops-border)', 
                    paddingTop: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--ops-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                      Módulos Operativos Autorizados
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
                      {modules.map(mod => {
                        const isAllowed = collab.allowed_modules.includes(mod.value);
                        return (
                          <label 
                            key={mod.value}
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px', 
                              padding: '8px 12px', 
                              borderRadius: '10px', 
                              backgroundColor: isAllowed ? 'rgba(16, 185, 129, 0.04)' : 'var(--ops-bg)', 
                              border: `1px solid ${isAllowed ? 'rgba(16, 185, 129, 0.2)' : 'var(--ops-border)'}`,
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              fontWeight: '700',
                              color: isAllowed ? 'var(--ops-text)' : 'var(--ops-text-muted)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <input 
                              type="checkbox"
                              checked={isAllowed}
                              onChange={() => toggleModuleAccess(collab.id, mod.value, isAllowed)}
                              style={{ 
                                width: '16px', 
                                height: '16px', 
                                accentColor: 'var(--ops-primary)',
                                cursor: 'pointer'
                              }}
                            />
                            {mod.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ====================================================
          MODAL: CUARENTENAS APPROVE/REJECT CONFIRMATION
          ==================================================== */}
      {selectedQuarantine && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'var(--ops-surface)',
            border: '1px solid var(--ops-border)',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '500px',
            padding: '1.75rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            animation: 'modalScale 0.25s ease-out'
          }}>
            <h3 style={{ 
              margin: '0 0 12px 0', 
              fontSize: '1.25rem', 
              fontWeight: '900', 
              fontFamily: 'Outfit, sans-serif',
              color: actionType === 'approve' ? '#10B981' : '#EF4444'
            }}>
              {actionType === 'approve' ? '🛡️ Confirmar Aprobación de Cuarentena' : '🛑 Confirmar Rechazo de Mercancía'}
            </h3>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--ops-text-muted)', margin: '0 0 1rem 0', lineHeight: '1.4' }}>
              {actionType === 'approve' 
                ? `Está a punto de liberar ${selectedQuarantine.received_quantity} ${selectedQuarantine.product.unit_of_measure} de "${selectedQuarantine.product.name}" al inventario DISPONIBLE para venta.` 
                : `Se rechazará esta mercancía definitivamente. Esto reabrirá la tarea de compra del proveedor en el módulo correspondiente.`
              }
            </p>

            {/* If Reject: Show Reject reasons dropdown and evidence image uploader */}
            {actionType === 'reject' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--ops-text-muted)', display: 'block', marginBottom: '4px' }}>MOTIVO DE RECHAZO</label>
                  <select 
                    value={rejectionReason} 
                    onChange={(e) => setRejectionReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--ops-bg)',
                      border: '1px solid var(--ops-border)',
                      color: 'var(--ops-text)',
                      outline: 'none',
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="quality_defect">Defecto de Calidad (Madurez/Tamaño)</option>
                    <option value="plague_pest">Presencia de Plagas / Enfermedades</option>
                    <option value="bad_packaging">Empaque Dañado / Sucio</option>
                    <option value="temperature_break">Ruptura de Cadena de Frío</option>
                    <option value="other">Otro motivo (Especificar abajo)</option>
                  </select>
                </div>

                {rejectionReason === 'other' && (
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--ops-text-muted)', display: 'block', marginBottom: '4px' }}>ESPECIFICAR MOTIVO</label>
                    <input 
                      type="text" 
                      placeholder="Escriba el motivo detallado..." 
                      value={rejectionCustomText} 
                      onChange={(e) => setRejectionCustomText(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        backgroundColor: 'var(--ops-bg)',
                        border: '1px solid var(--ops-border)',
                        color: 'var(--ops-text)',
                        outline: 'none',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                )}

                {/* Evidence Image Uploader */}
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--ops-text-muted)', display: 'block', marginBottom: '4px' }}>EVIDENCIA FOTOGRÁFICA</label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '1px dashed var(--ops-border)',
                      borderRadius: '12px',
                      padding: '1.25rem',
                      textAlign: 'center',
                      cursor: 'pointer',
                      backgroundColor: 'rgba(255,255,255,0.01)',
                      transition: 'all 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept="image/*" 
                      style={{ display: 'none' }} 
                    />
                    {evidencePreview ? (
                      <div style={{ position: 'relative', width: '100%', height: '140px', borderRadius: '8px', overflow: 'hidden' }}>
                        <img src={evidencePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ) : (
                      <>
                        <Camera size={24} style={{ color: 'var(--ops-text-muted)' }} />
                        <span style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Haga clic para subir o tomar foto de evidencia</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Notes box */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--ops-text-muted)', display: 'block', marginBottom: '4px' }}>OBSERVACIONES DEL SUPERVISOR</label>
              <textarea 
                placeholder="Agregue observaciones o especificaciones sobre esta decisión..." 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  width: '100%',
                  height: '80px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--ops-bg)',
                  border: '1px solid var(--ops-border)',
                  color: 'var(--ops-text)',
                  outline: 'none',
                  fontSize: '0.85rem',
                  resize: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => { setSelectedQuarantine(null); setActionType(null); setNotes(''); setEvidenceFile(null); setEvidencePreview(null); }}
                disabled={submitting}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid var(--ops-border)',
                  backgroundColor: 'transparent',
                  color: 'var(--ops-text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              
              <button 
                onClick={handleResolveQuarantine}
                disabled={submitting || (actionType === 'reject' && rejectionReason === 'other' && !rejectionCustomText)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: actionType === 'approve' ? '#10B981' : '#EF4444',
                  color: 'white',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {submitting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Procesando...
                  </>
                ) : (
                  <>
                    {actionType === 'approve' ? <CheckCircle size={15} /> : <XCircle size={15} />}
                    {actionType === 'approve' ? 'Autorizar Ingreso' : 'Rechazar Producto'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================
          MODAL: EXCEDENTES APPROVE/REJECT CONFIRMATION
          ==================================================== */}
      {selectedDiscrepancy && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'var(--ops-surface)',
            border: '1px solid var(--ops-border)',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '500px',
            padding: '1.75rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            animation: 'modalScale 0.25s ease-out'
          }}>
            <h3 style={{ 
              margin: '0 0 12px 0', 
              fontSize: '1.25rem', 
              fontWeight: '900', 
              fontFamily: 'Outfit, sans-serif',
              color: actionType === 'approve' ? '#10B981' : '#EF4444'
            }}>
              {actionType === 'approve' ? '⚖️ Autorizar Peso Excedente' : '🛑 Confirmar Rechazo de Exceso'}
            </h3>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--ops-text-muted)', margin: '0 0 1.25rem 0', lineHeight: '1.4' }}>
              {actionType === 'approve' 
                ? `Está a punto de autorizar un ingreso extra de +${selectedDiscrepancy.excess_quantity} ${selectedDiscrepancy.product.unit_of_measure} de "${selectedDiscrepancy.product.name}" al inventario DISPONIBLE. Se consolidará el total de la compra por ${selectedDiscrepancy.received_quantity} ${selectedDiscrepancy.product.unit_of_measure}.` 
                : `Se rechazará la cantidad excedente de +${selectedDiscrepancy.excess_quantity} ${selectedDiscrepancy.product.unit_of_measure}. El excedente en cuarentena temporal será retirado y la compra quedará consolidada únicamente por el total esperado de ${selectedDiscrepancy.expected_quantity} ${selectedDiscrepancy.product.unit_of_measure}.`
              }
            </p>

            {/* Notes box */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--ops-text-muted)', display: 'block', marginBottom: '4px' }}>JUSTIFICACIÓN / NOTAS DEL SUPERVISOR</label>
              <textarea 
                placeholder="Explique brevemente el motivo de su decisión..." 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  width: '100%',
                  height: '80px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--ops-bg)',
                  border: '1px solid var(--ops-border)',
                  color: 'var(--ops-text)',
                  outline: 'none',
                  fontSize: '0.85rem',
                  resize: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => { setSelectedDiscrepancy(null); setActionType(null); setNotes(''); }}
                disabled={submitting}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid var(--ops-border)',
                  backgroundColor: 'transparent',
                  color: 'var(--ops-text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              
              <button 
                onClick={handleResolveDiscrepancy}
                disabled={submitting}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: actionType === 'approve' ? '#10B981' : '#EF4444',
                  color: 'white',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {submitting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Procesando...
                  </>
                ) : (
                  <>
                    {actionType === 'approve' ? <CheckCircle size={15} /> : <XCircle size={15} />}
                    {actionType === 'approve' ? 'Autorizar Excedente' : 'Rechazar Exceso'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS styles for animations */}
      <style jsx global>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes modalScale {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .hover-bright:hover {
          opacity: 0.85;
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
