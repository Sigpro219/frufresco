'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import { ShoppingBag, TrendingUp, AlertCircle, CheckCircle2, Receipt, Calendar, FileText, ChevronRight, Download, CreditCard, RefreshCw, Search, Plus, Trash2, Edit2, User, Users, Printer } from 'lucide-react';

interface BillingCut {
    id: string;
    cut_number: number;
    scheduled_date: string;
    cut_slot: 'AM' | 'PM' | 'ADJ';
    status: 'open' | 'processing' | 'closed' | 'exported';
    total_orders: number;
    total_amount: number;
    created_at: string;
}

interface BillingReturn {
    id: string;
    order_id: string;
    product_id: string;
    quantity_returned: number;
    reason: string;
    photo_url: string;
    status: string;
    products: { name: string };
    orders: { sequence_id: number, created_at: string };
}

interface Invoice {
    id: string;
    invoice_number: string;
    order_id: string;
    cut_id: string;
    total_base: number;
    total_tax: number;
    total_final: number;
    status: 'pending' | 'printed' | 'exported' | 'cancelled';
    payment_status: 'pending' | 'paid' | 'overdue';
    due_date: string;
    created_at: string;
    orders: {
        sequence_id: number;
        created_at: string;
        profiles: {
            company_name: string;
            nit: string;
            payment_days: number;
        } | null;
    } | null;
}

export default function BillingDashboard() {
    const [cuts, setCuts] = useState<BillingCut[]>([]);
    const [returns, setReturns] = useState<BillingReturn[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'invoicing' | 'portfolio' | 'configuration'>('invoicing');
    const [subTab, setSubTab] = useState<'cuts' | 'returns'>('cuts');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [paymentMethod, setPaymentMethod] = useState('Transferencia');
    const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

    const [portfolioSubTab, setPortfolioSubTab] = useState<'invoices' | 'dossiers'>('invoices');
    const [b2bClients, setB2bClients] = useState<any[]>([]);
    const [dossiersDataMap, setDossiersDataMap] = useState<Record<string, any>>({});
    const [dossiersSearchTerm, setDossiersSearchTerm] = useState('');
    const [selectedB2bClient, setSelectedB2bClient] = useState<any>(null);
    const [isDossierModalOpen, setIsDossierModalOpen] = useState(false);
    const [isSavingDossier, setIsSavingDossier] = useState(false);
    const [activeDossierSection, setActiveDossierSection] = useState<'general' | 'contacts' | 'financial' | 'references' | 'negociacion' | 'codeudores'>('general');
    
    const initialDossierForm = {
        agencia: false,
        supermercado: false,
        ciudad: '',
        cupo_solicitado: 0,
        plazo_solicitado: 0,
        fecha_solicitud: new Date().toISOString().split('T')[0],
        tipo_solicitud: 'creacion',
        
        razon_social: '',
        nombre_comercial: '',
        nit: '',
        direccion: '',
        ciudad_info: '',
        departamento_info: '',
        telefono: '',
        actividad_economica_principal: '',
        ciiu_principal: '',
        actividad_economica_secundaria: '',
        ciiu_secundario: '',
        rep_legal_nombre: '',
        rep_legal_identificacion: '',
        rep_legal_direccion: '',
        rep_legal_telefono: '',
        rep_legal_celular: '',
        rep_legal_email: '',
        rep_legal_es_pep: false,
        
        sucursales_a_crear: ['', '', '', '', '', ''],
        
        contactos: [
            { area: 'Compras/pedidos', nombre: '', telefono: '', celular: '', email: '' },
            { area: 'Contabilidad/tesoreria', nombre: '', telefono: '', celular: '', email: '' },
            { area: 'Oficial de Cumplimiento', nombre: '', telefono: '', celular: '', email: '' }
        ],
        
        participacion_accionaria: [
            { nombre: '', tipo_id: 'CC', numero_id: '', participacion_pct: 0, es_pep: false }
        ],
        
        realiza_operaciones_internacionales: false,
        operaciones_internacionales_detalle: {
            transferencias: false,
            importaciones: false,
            exportaciones: false,
            inversiones: false,
            giros: false,
            pago_servicio: false,
            otros: ''
        },
        tiene_productos_financieros_internacionales: false,
        productos_financieros_internacionales_detalle: {
            productos: []
        },
        
        tipo_contribuyente: 'persona_juridica',
        clase_contribuyente: {
            gran_contribuyente: false,
            auto_retenedor: false,
            regimen_comun: false,
            regimen_simplificado: false,
            sin_animo_lucro: false,
            regimen_especial: false,
            regimen_simple: false,
            no_contribuyente: false,
            no_responsable: false
        },
        codigo_ica: '',
        fecha_corte_financiero: '',
        ingresos_mensuales: 0,
        egresos_mensuales: 0,
        otros_ingresos: 0,
        otros_ingresos_concepto: '',
        activo: 0,
        pasivo: 0,
        patrimonio: 0,
        
        responsable_factura_nombre: '',
        responsable_factura_email: '',
        responsable_factura_telefono: '',
        
        referencias_comerciales: [
            { entidad: '', contacto: '', telefono: '', ciudad: '', cupo: 0, plazo: '' },
            { entidad: '', contacto: '', telefono: '', ciudad: '', cupo: 0, plazo: '' }
        ],
        referencias_personales: [
            { nombre: '', direccion: '', telefono: '', celular: '', relacion: '' }
        ],
        
        condiciones_pago: {
            consignacion: false,
            transferencia: false,
            cheque: false,
            otro: ''
        },
        plazo_pago_dias: 0,
        negociacion_observaciones: '',
        negociacion_dias_pago_soporte: '',
        negociacion_seccion: '',
        negociacion_responsable: '',
        declaracion_origen_fondos_fuentes: '',
        
        credito_aprobado: false,
        cupo_aprobado: 0,
        plazo_aprobado: 0,
        vo_bo: '',
        autorizacion_gerencia: '',
        observaciones_director: '',
        concepto_coordinador: '',
        
        pagare_numero: '',
        pagare_acreedor: 'INVESTMENTS CORTES S.A.S.',
        pagare_ciudad_firma: 'Cali',
        pagare_fecha_firma: new Date().toISOString().split('T')[0],
        pagare_firma_deudor: { nombre: '', identificacion: '', direccion: '', barrio: '', celular: '', telefono: '', email: '' },
        pagare_firma_codeudor: { nombre: '', identificacion: '', direccion: '', barrio: '', celular: '', telefono: '', email: '' }
    };

    const [dossierForm, setDossierForm] = useState<any>(initialDossierForm);

    const fetchDossiersData = useCallback(async () => {
        try {
            const { data: profilesData } = await supabase
                .from('profiles')
                .eq('role', 'b2b_client')
                .order('company_name');
            setB2bClients(profilesData || []);

            const { data: dossiers } = await supabase
                .from('client_credit_dossiers')
                .select('*');
            
            const map: Record<string, any> = {};
            dossiers?.forEach(d => {
                map[d.profile_id] = d;
            });
            setDossiersDataMap(map);
        } catch (err) {
            console.error('Error fetching dossiers data:', err);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'portfolio' && portfolioSubTab === 'dossiers') {
            fetchDossiersData();
        }
    }, [activeTab, portfolioSubTab, fetchDossiersData]);

    const handleOpenDossierModal = (client: any) => {
        const existing = dossiersDataMap[client.id];
        
        if (existing) {
            setDossierForm({
                ...initialDossierForm,
                ...existing,
                contactos: existing.contactos || initialDossierForm.contactos,
                participacion_accionaria: existing.participacion_accionaria || initialDossierForm.participacion_accionaria,
                operaciones_internacionales_detalle: existing.operaciones_internacionales_detalle || initialDossierForm.operaciones_internacionales_detalle,
                productos_financieros_internacionales_detalle: existing.productos_financieros_internacionales_detalle || initialDossierForm.productos_financieros_internacionales_detalle,
                clase_contribuyente: existing.clase_contribuyente || initialDossierForm.clase_contribuyente,
                referencias_comerciales: existing.referencias_comerciales || initialDossierForm.referencias_comerciales,
                referencias_personales: existing.referencias_personales || initialDossierForm.referencias_personales,
                condiciones_pago: existing.condiciones_pago || initialDossierForm.condiciones_pago,
                pagare_firma_deudor: existing.pagare_firma_deudor || { ...initialDossierForm.pagare_firma_deudor, nombre: client.contact_name || '', identificacion: client.nit || '', direccion: client.address || '', celular: client.contact_phone || '', email: client.email || '' },
                pagare_firma_codeudor: existing.pagare_firma_codeudor || initialDossierForm.pagare_firma_codeudor,
            });
        } else {
            setDossierForm({
                ...initialDossierForm,
                profile_id: client.id,
                razon_social: client.razon_social || client.company_name || '',
                nombre_comercial: client.company_name || '',
                nit: client.nit || '',
                direccion: client.address || '',
                ciudad: client.city || '',
                ciudad_info: client.city || '',
                departamento_info: client.department || '',
                telefono: client.phone || client.contact_phone || '',
                rep_legal_nombre: client.contact_name || '',
                rep_legal_email: client.email || '',
                rep_legal_celular: client.contact_phone || '',
                pagare_firma_deudor: {
                    nombre: client.contact_name || '',
                    identificacion: client.nit || '',
                    direccion: client.address || '',
                    barrio: client.municipality || '',
                    celular: client.contact_phone || '',
                    telefono: client.phone || '',
                    email: client.email || ''
                }
            });
        }
        
        setSelectedB2bClient(client);
        setIsDossierModalOpen(true);
        setActiveDossierSection('general');
    };

    const handleSaveDossier = async () => {
        setIsSavingDossier(true);
        try {
            const { error } = await supabase
                .from('client_credit_dossiers')
                .upsert({
                    ...dossierForm,
                    profile_id: selectedB2bClient.id,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'profile_id' });

            if (error) throw error;
            
            alert('Formulario de crédito guardado exitosamente.');
            setIsDossierModalOpen(false);
            fetchDossiersData();
        } catch (err: any) {
            console.error('Error saving dossier:', err);
            alert('Error al guardar el formulario: ' + err.message);
        } finally {
            setIsSavingDossier(false);
        }
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch cuts
            const { data: cutsData, error: cutsError } = await supabase
                .from('billing_cuts')
                .select('*')
                .order('created_at', { ascending: false });
            if (cutsError) throw cutsError;
            setCuts(cutsData || []);

            // 2. Fetch returns
            const { data: returnsData, error: returnsError } = await supabase
                .from('billing_returns')
                .select(`
                    *,
                    products (name),
                    orders (sequence_id, created_at)
                `)
                .eq('status', 'pending_review');
            if (returnsError) throw returnsError;
            setReturns(returnsData || []);

            // 3. Fetch invoices with profile data
            const { data: invoicesData, error: invoicesError } = await supabase
                .from('billing_invoices')
                .select(`
                    *,
                    orders:orders!billing_invoices_order_id_fkey (
                        sequence_id,
                        created_at,
                        profiles (
                            company_name,
                            nit,
                            payment_days
                        )
                    )
                `)
                .order('created_at', { ascending: false });
            if (invoicesError) throw invoicesError;
            setInvoices(invoicesData || []);

            // 4. Fetch pending orders count
            const { count: ordersCount } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'delivered')
                .is('billing_cut_id', null);
            setPendingOrdersCount(ordersCount || 0);
        } catch (err: any) {
            console.error('Error fetching billing data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCreateCut = async (slot: 'AM' | 'PM') => {
        setIsProcessing(true);
        try {
            // Fetch eligible orders
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select(`
                    id, 
                    total, 
                    profile_id,
                    sequence_id,
                    created_at,
                    profiles (
                        payment_days,
                        iva_responsible
                    )
                `)
                .eq('status', 'delivered')
                .is('billing_cut_id', null);

            if (ordersError) throw ordersError;
            if (!orders || orders.length === 0) {
                alert('No hay pedidos listos para facturar en este momento.');
                return;
            }

            const totalAmount = orders.reduce((sum, o) => sum + (o.total || 0), 0);

            // 1. Create the cut
            const { data: newCut, error: cutError } = await supabase
                .from('billing_cuts')
                .insert([{
                    cut_slot: slot,
                    status: 'open',
                    total_orders: orders.length,
                    total_amount: totalAmount
                }])
                .select()
                .single();

            if (cutError) throw cutError;

            // 2. Link orders to the cut
            const orderIds = orders.map(o => o.id);
            const { error: linkError } = await supabase
                .from('orders')
                .update({ billing_cut_id: newCut.id })
                .in('id', orderIds);

            if (linkError) throw linkError;

            // 3. Generate sequential invoices for each order in the cut
            for (let i = 0; i < orders.length; i++) {
                const order = orders[i];
                const cleanSeq = order.sequence_id.toString().padStart(4, '0');
                const invoiceNumber = `FE-${cleanSeq}-${Date.now().toString().slice(-4)}`;
                
                // Calculate tax base & IVA
                const total = order.total || 0;
                const isIva = order.profiles?.iva_responsible || false;
                const totalBase = isIva ? total / 1.19 : total;
                const totalTax = isIva ? total - totalBase : 0;

                // Calculate due date based on profile payment_days
                const creditDays = order.profiles?.payment_days || 0;
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + creditDays);

                await supabase.from('billing_invoices').insert([{
                    order_id: order.id,
                    cut_id: newCut.id,
                    invoice_number: invoiceNumber,
                    total_base: totalBase,
                    total_tax: totalTax,
                    total_final: total,
                    status: 'pending',
                    payment_status: 'pending',
                    due_date: dueDate.toISOString().split('T')[0]
                }]);
            }

            alert(`¡Corte ${slot} generado con éxito! ${orders.length} facturas emitidas.`);
            fetchData();
        } catch (err: any) {
            console.error('Error generating cut:', err);
            alert('Error al generar el corte: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleProcessReturn = async (ret: BillingReturn, decision: 'approved' | 'rejected') => {
        setIsProcessing(true);
        try {
            if (decision === 'rejected') {
                const { error } = await supabase
                    .from('billing_returns')
                    .update({ status: 'rejected' })
                    .eq('id', ret.id);
                if (error) throw error;
            } else {
                // Get unit price
                const { data: itemData, error: itemError } = await supabase
                    .from('order_items')
                    .select('unit_price, quantity')
                    .eq('order_id', ret.order_id)
                    .eq('product_id', ret.product_id)
                    .single();
                if (itemError) throw itemError;

                const newQty = Math.max(0, Number(itemData.quantity) - Number(ret.quantity_returned));
                const priceCredit = Number(ret.quantity_returned) * Number(itemData.unit_price);

                // Subtract from items
                const { error: updateItemError } = await supabase
                    .from('order_items')
                    .update({ quantity: newQty })
                    .eq('order_id', ret.order_id)
                    .eq('product_id', ret.product_id);
                if (updateItemError) throw updateItemError;

                // Subtract from order total
                const { data: orderData } = await supabase.from('orders').select('total').eq('id', ret.order_id).single();
                const newTotal = Math.max(0, (Number(orderData?.total) || 0) - priceCredit);
                const { error: updateOrderError } = await supabase
                    .from('orders')
                    .update({ total: newTotal })
                    .eq('id', ret.order_id);
                if (updateOrderError) throw updateOrderError;

                // Recalculate billing_invoices details for this order
                const { data: invoiceData } = await supabase.from('billing_invoices').select('id, order_id').eq('order_id', ret.order_id).single();
                if (invoiceData) {
                    // Fetch if client is iva responsible to adjust bases
                    const { data: orderProf } = await supabase
                        .from('orders')
                        .select('profiles(iva_responsible)')
                        .eq('id', ret.order_id)
                        .single();
                    const isIva = (orderProf as any)?.profiles?.iva_responsible || false;
                    const totalBase = isIva ? newTotal / 1.19 : newTotal;
                    const totalTax = isIva ? newTotal - totalBase : 0;

                    await supabase
                        .from('billing_invoices')
                        .update({
                            total_base: totalBase,
                            total_tax: totalTax,
                            total_final: newTotal
                        })
                        .eq('id', invoiceData.id);
                }

                // Update status of return
                await supabase.from('billing_returns').update({ status: 'approved' }).eq('id', ret.id);
            }
            alert(`✅ Novedad procesada: ${decision === 'approved' ? 'Aprobada y descontada' : 'Rechazada'}`);
            fetchData();
        } catch (err: any) {
            console.error('Error processing return:', err);
            alert('Error al procesar la devolución: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRegisterPayment = async () => {
        if (!selectedInvoice) return;
        setIsProcessing(true);
        try {
            const { error } = await supabase
                .from('billing_invoices')
                .update({
                    payment_status: 'paid',
                    paid_at: new Date().toISOString(),
                    payment_method: paymentMethod
                })
                .eq('id', selectedInvoice.id);

            if (error) throw error;
            alert('✅ Pago registrado exitosamente.');
            setIsPaymentModalOpen(false);
            setSelectedInvoice(null);
            fetchData();
        } catch (err: any) {
            console.error('Error registering payment:', err);
            alert('Error al registrar el pago: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const exportToWorldOffice = async (cutId: string) => {
        try {
            const { data: items, error } = await supabase
                .from('order_items')
                .select(`
                    id, quantity, unit_price, nickname,
                    orders!inner(id, billing_cut_id, sequence_id, profiles(nit, company_name)),
                    products(sku, name)
                `)
                .eq('orders.billing_cut_id', cutId);

            if (error) throw error;
            if (!items || items.length === 0) {
                alert('No hay datos para exportar.');
                return;
            }

            const headers = ['Nit', 'Cliente', 'Referencia', 'Nombre', 'Cantidad', 'PrecioUnitario', 'Total'];
            const rows = items.map((item: any) => [
                item.orders.profiles?.nit || 'N/A',
                item.orders.profiles?.company_name || 'Invitado',
                item.products?.sku || 'Ref-00',
                item.nickname || item.products?.name || '',
                item.quantity,
                item.unit_price,
                (item.quantity * item.unit_price).toFixed(2)
            ]);

            const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `Corte_WO_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            await supabase.from('billing_cuts').update({ status: 'exported', exported_at: new Date().toISOString() }).eq('id', cutId);
            fetchData();
        } catch (err) {
            console.error('Export error:', err);
            alert('Error al exportar.');
        }
    };

    // Ageing Receivable Totals
    const calculateAging = () => {
        let alDia = 0;
        let vencido1_15 = 0;
        let vencido16_30 = 0;
        let vencido30Mas = 0;
        const today = new Date();
        today.setHours(0,0,0,0);

        invoices.forEach(inv => {
            if (inv.payment_status === 'paid') return;
            const due = new Date(inv.due_date);
            due.setHours(0,0,0,0);
            
            const diffTime = today.getTime() - due.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 0) {
                alDia += Number(inv.total_final || 0);
            } else if (diffDays <= 15) {
                vencido1_15 += Number(inv.total_final || 0);
            } else if (diffDays <= 30) {
                vencido16_30 += Number(inv.total_final || 0);
            } else {
                vencido30Mas += Number(inv.total_final || 0);
            }
        });

        return { alDia, vencido1_15, vencido16_30, vencido30Mas };
    };

    const aging = calculateAging();

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, padding: '2rem 1.5rem', fontFamily: THEME.typography.fontFamilyMain }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                
                {/* Header */}
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.8rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Receipt color={THEME.colors.primary} size={30} /> Facturación y Cartera
                        </h1>
                        <p style={{ color: THEME.colors.textSecondary, fontSize: '0.9rem', marginTop: '0.2rem' }}>
                            Gestión integral de cortes diarios, emisión de facturas y control de cartera de clientes.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                        <button
                            onClick={() => handleCreateCut('AM')}
                            disabled={isProcessing}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: THEME.colors.primary, color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: THEME.radius.lg, fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer', boxShadow: THEME.shadow.sm }}
                        >
                            ☀️ Generar Corte AM
                        </button>
                        <button
                            onClick={() => handleCreateCut('PM')}
                            disabled={isProcessing}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: THEME.colors.primaryHover, color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: THEME.radius.lg, fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer', boxShadow: THEME.shadow.sm }}
                        >
                            🌙 Generar Corte PM
                        </button>
                    </div>
                </header>

                {/* Submodule Main Tabs */}
                <div style={{ display: 'flex', gap: '1rem', borderBottom: `1px solid ${THEME.colors.border}`, marginBottom: '1.5rem' }}>
                    <button
                        onClick={() => setActiveTab('invoicing')}
                        style={{ padding: '0.8rem 1rem', border: 'none', background: 'none', fontWeight: '750', fontSize: '0.95rem', cursor: 'pointer', borderBottom: activeTab === 'invoicing' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent', color: activeTab === 'invoicing' ? THEME.colors.primary : THEME.colors.textSecondary, transition: 'all 0.15s' }}
                    >
                        📝 Submódulo Facturación
                    </button>
                    <button
                        onClick={() => setActiveTab('portfolio')}
                        style={{ padding: '0.8rem 1rem', border: 'none', background: 'none', fontWeight: '750', fontSize: '0.95rem', cursor: 'pointer', borderBottom: activeTab === 'portfolio' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent', color: activeTab === 'portfolio' ? THEME.colors.primary : THEME.colors.textSecondary, transition: 'all 0.15s' }}
                    >
                        💰 Submódulo Cartera
                    </button>
                    <button
                        onClick={() => setActiveTab('configuration')}
                        style={{ padding: '0.8rem 1rem', border: 'none', background: 'none', fontWeight: '750', fontSize: '0.95rem', cursor: 'pointer', borderBottom: activeTab === 'configuration' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent', color: activeTab === 'configuration' ? THEME.colors.primary : THEME.colors.textSecondary, transition: 'all 0.15s' }}
                    >
                        ⚙️ Configuración
                    </button>
                </div>

                {/* INVOICING SUBMODULE */}
                {activeTab === 'invoicing' && (
                    <div>
                        {/* Sub-tabs cuts / returns */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <button
                                onClick={() => setSubTab('cuts')}
                                style={{ backgroundColor: subTab === 'cuts' ? THEME.colors.primaryLight : 'transparent', color: subTab === 'cuts' ? THEME.colors.primary : THEME.colors.textSecondary, padding: '0.4rem 1rem', borderRadius: THEME.radius.md, border: 'none', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
                            >
                                Cortes Generales ({cuts.length})
                            </button>
                            <button
                                onClick={() => setSubTab('returns')}
                                style={{ backgroundColor: subTab === 'returns' ? THEME.colors.primaryLight : 'transparent', color: subTab === 'returns' ? THEME.colors.primary : THEME.colors.textSecondary, padding: '0.4rem 1rem', borderRadius: THEME.radius.md, border: 'none', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
                            >
                                Devoluciones Pendientes ({returns.length})
                            </button>
                        </div>

                        {subTab === 'cuts' && (
                            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', boxShadow: THEME.shadow.md }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                <th style={thStyle}># Corte</th>
                                                <th style={thStyle}>Fecha y Franja</th>
                                                <th style={thStyle}>Pedidos</th>
                                                <th style={thStyle}>Total Bruto</th>
                                                <th style={thStyle}>Estado</th>
                                                <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {loading ? (
                                                <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>Cargando cortes...</td></tr>
                                            ) : cuts.length === 0 ? (
                                                <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>No hay cortes generados aún.</td></tr>
                                            ) : cuts.map((cut) => {
                                                const openCut = cut.status === 'open';
                                                return (
                                                    <tr key={cut.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background 0.2s' }}>
                                                        <td style={tdStyle}><span style={{ fontWeight: '800' }}>{cut.cut_number.toString().padStart(4, '0')}</span></td>
                                                        <td style={tdStyle}>
                                                            <div style={{ fontWeight: '700' }}>{new Date(cut.scheduled_date).toLocaleDateString()}</div>
                                                            <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>Franja: {cut.cut_slot}</div>
                                                        </td>
                                                        <td style={tdStyle}>{cut.total_orders} pedidos</td>
                                                        <td style={{ ...tdStyle, fontWeight: '750' }}>{formatMoney(cut.total_amount)}</td>
                                                        <td style={tdStyle}>
                                                            <span style={{ backgroundColor: cut.status === 'exported' ? '#DCFCE7' : '#FEF3C7', color: cut.status === 'exported' ? '#166534' : '#92400E', padding: '0.2rem 0.6rem', borderRadius: THEME.radius.md, fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase' }}>
                                                                {cut.status}
                                                            </span>
                                                        </td>
                                                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                            <button 
                                                                onClick={() => exportToWorldOffice(cut.id)}
                                                                style={{ backgroundColor: THEME.colors.background, color: THEME.colors.textMain, padding: '0.4rem 0.8rem', borderRadius: THEME.radius.md, border: 'none', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer', marginRight: '0.4rem' }}
                                                            >
                                                                <Download size={13} style={{ marginRight: '3px', verticalAlign: 'middle' }} /> WO CSV
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {subTab === 'returns' && (
                            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, padding: '1.5rem', boxShadow: THEME.shadow.md }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem' }}>
                                    {returns.length === 0 ? (
                                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: THEME.colors.textSecondary }}>
                                            <CheckCircle2 color={THEME.colors.primary} size={40} style={{ marginBottom: '0.5rem' }} />
                                            <h3 style={{ fontWeight: '700', margin: 0 }}>No hay devoluciones pendientes</h3>
                                            <p style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>Todas las novedades de transportadores al día.</p>
                                        </div>
                                    ) : returns.map((ret) => (
                                        <div key={ret.id} style={{ border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.lg, padding: '1rem', backgroundColor: 'white', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.textSecondary }}>Pedido #{getFriendlyOrderId({ created_at: ret.orders.created_at, sequence_id: ret.orders.sequence_id })}</div>
                                                    <h4 style={{ margin: '0.1rem 0', fontWeight: '750', fontSize: '0.95rem' }}>{ret.products.name}</h4>
                                                </div>
                                                <span style={{ backgroundColor: '#FEF2F2', color: '#991B1B', padding: '0.1rem 0.4rem', borderRadius: THEME.radius.sm, fontSize: '0.7rem', fontWeight: '800' }}>
                                                    -{ret.quantity_returned} Uds
                                                </span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: THEME.colors.textSecondary, fontStyle: 'italic' }}>
                                                &quot;{ret.reason || 'Sin observación'}&quot;
                                            </p>
                                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: 'auto' }}>
                                                <button
                                                    onClick={() => handleProcessReturn(ret, 'rejected')}
                                                    style={{ flex: 1, padding: '0.4rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, background: 'white', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}
                                                >
                                                    Rechazar
                                                </button>
                                                <button
                                                    onClick={() => handleProcessReturn(ret, 'approved')}
                                                    style={{ flex: 2, padding: '0.4rem', borderRadius: THEME.radius.md, border: 'none', background: THEME.colors.primary, color: 'white', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}
                                                >
                                                    Aprobar Ajuste
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'portfolio' && (
                    <div>
                        {/* Sub-tab selection bar */}
                        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: `1px solid ${THEME.colors.border}`, marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
                            <button
                                onClick={() => setPortfolioSubTab('invoices')}
                                style={{ padding: '0.6rem 1.2rem', border: 'none', background: 'none', fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer', borderBottom: portfolioSubTab === 'invoices' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent', color: portfolioSubTab === 'invoices' ? THEME.colors.primary : THEME.colors.textSecondary, transition: 'all 0.15s' }}
                            >
                                Cuentas por Cobrar
                            </button>
                            <button
                                onClick={() => setPortfolioSubTab('dossiers')}
                                style={{ padding: '0.6rem 1.2rem', border: 'none', background: 'none', fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer', borderBottom: portfolioSubTab === 'dossiers' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent', color: portfolioSubTab === 'dossiers' ? THEME.colors.primary : THEME.colors.textSecondary, transition: 'all 0.15s' }}
                            >
                                Solicitudes de Crédito y Pagarés
                            </button>
                        </div>

                        {portfolioSubTab === 'invoices' ? (
                            <>
                                {/* Ageing Portfolio Widgets */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                                    <div style={kpiCardStyle}>
                                        <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>SALDOS AL DÍA</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: '850', color: THEME.colors.primary, marginTop: '0.4rem' }}>{formatMoney(aging.alDia)}</div>
                                    </div>
                                    <div style={kpiCardStyle}>
                                        <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>VENCIDO 1 - 15 DÍAS</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: '850', color: '#D97706', marginTop: '0.4rem' }}>{formatMoney(aging.vencido1_15)}</div>
                                    </div>
                                    <div style={kpiCardStyle}>
                                        <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>VENCIDO 16 - 30 DÍAS</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: '850', color: '#EA580C', marginTop: '0.4rem' }}>{formatMoney(aging.vencido16_30)}</div>
                                    </div>
                                    <div style={kpiCardStyle}>
                                        <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>VENCIDO +30 DÍAS</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: '850', color: '#DC2626', marginTop: '0.4rem' }}>{formatMoney(aging.vencido30Mas)}</div>
                                    </div>
                                </div>

                                {/* Invoices Accounts Receivable list */}
                                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', boxShadow: THEME.shadow.md }}>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                    <th style={thStyle}>Prefijo FE</th>
                                                    <th style={thStyle}>Cliente</th>
                                                    <th style={thStyle}>Vencimiento</th>
                                                    <th style={thStyle}>Base Imponible</th>
                                                    <th style={thStyle}>IVA</th>
                                                    <th style={thStyle}>Total Neto</th>
                                                    <th style={thStyle}>Estado Cartera</th>
                                                    <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {invoices.length === 0 ? (
                                                    <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>No hay facturas registradas en el sistema.</td></tr>
                                                ) : invoices.map((inv) => {
                                                    const isOverdue = inv.payment_status === 'pending' && new Date(inv.due_date) < new Date();
                                                    const statusLabel = inv.payment_status === 'paid' ? 'Pagada' : isOverdue ? 'Vencida' : 'Pendiente';
                                                    const overdueDays = Math.ceil((new Date().getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24));

                                                    return (
                                                        <tr key={inv.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background 0.2s' }}>
                                                            <td style={tdStyle}><span style={{ fontWeight: '800' }}>{inv.invoice_number}</span></td>
                                                            <td style={tdStyle}>
                                                                <div style={{ fontWeight: '700' }}>{inv.orders?.profiles?.company_name || 'Consumidor Final'}</div>
                                                                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>NIT: {inv.orders?.profiles?.nit || 'N/A'}</div>
                                                            </td>
                                                            <td style={tdStyle}>
                                                                <div style={{ fontWeight: '700' }}>{new Date(inv.due_date).toLocaleDateString()}</div>
                                                                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>Plazo: {inv.orders?.profiles?.payment_days || 0} días</div>
                                                            </td>
                                                            <td style={tdStyle}>{formatMoney(inv.total_base)}</td>
                                                            <td style={tdStyle}>{formatMoney(inv.total_tax)}</td>
                                                            <td style={{ ...tdStyle, fontWeight: '750' }}>{formatMoney(inv.total_final)}</td>
                                                            <td style={tdStyle}>
                                                                <span style={{ 
                                                                    backgroundColor: inv.payment_status === 'paid' ? '#DCFCE7' : isOverdue ? '#FEE2E2' : '#FEF3C7', 
                                                                    color: inv.payment_status === 'paid' ? '#166534' : isOverdue ? '#991B1B' : '#92400E', 
                                                                    padding: '0.2rem 0.6rem', 
                                                                    borderRadius: THEME.radius.md, 
                                                                    fontSize: '0.75rem', 
                                                                    fontWeight: '800' 
                                                                }}>
                                                                    {statusLabel} {isOverdue && `(Hace ${overdueDays}d)`}
                                                                </span>
                                                            </td>
                                                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                                {inv.payment_status !== 'paid' && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedInvoice(inv);
                                                                            setIsPaymentModalOpen(true);
                                                                        }}
                                                                        style={{ backgroundColor: THEME.colors.primary, color: 'white', padding: '0.4rem 0.8rem', borderRadius: THEME.radius.md, border: 'none', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}
                                                                    >
                                                                        <CreditCard size={13} style={{ marginRight: '3px', verticalAlign: 'middle' }} /> Registrar Pago
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        ) : (
                            /* Dossiers Sub-tab View */
                            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, padding: '1.5rem', boxShadow: THEME.shadow.md }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '850', margin: 0 }}>Fichas de Conocimiento y Pagarés de Clientes B2B</h3>
                                    <div style={{ position: 'relative', width: '300px' }}>
                                        <input
                                            type="text"
                                            placeholder="Buscar cliente por nombre o NIT..."
                                            value={dossiersSearchTerm}
                                            onChange={(e) => setDossiersSearchTerm(e.target.value)}
                                            style={{ ...inputStyle, paddingLeft: '2.2rem' }}
                                        />
                                        <Search size={15} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                                    </div>
                                </div>

                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                <th style={thStyle}>Cliente / Razón Social</th>
                                                <th style={thStyle}>NIT</th>
                                                <th style={thStyle}>Límite de Crédito Actual</th>
                                                <th style={thStyle}>Estado Ficha</th>
                                                <th style={thStyle}>Cupo Solicitado</th>
                                                <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {b2bClients.filter(c => {
                                                const search = dossiersSearchTerm.toLowerCase();
                                                return (c.company_name?.toLowerCase().includes(search) || 
                                                        c.razon_social?.toLowerCase().includes(search) || 
                                                        c.nit?.includes(search));
                                            }).length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                                        No se encontraron clientes B2B registrados.
                                                    </td>
                                                </tr>
                                            ) : b2bClients.filter(c => {
                                                const search = dossiersSearchTerm.toLowerCase();
                                                return (c.company_name?.toLowerCase().includes(search) || 
                                                        c.razon_social?.toLowerCase().includes(search) || 
                                                        c.nit?.includes(search));
                                            }).map((client) => {
                                                const dossier = dossiersDataMap[client.id];
                                                const hasDossier = !!dossier;
                                                const isApproved = dossier?.credito_aprobado;
                                                const statusColor = hasDossier ? (isApproved ? '#DCFCE7' : '#FEF3C7') : '#F1F5F9';
                                                const statusTextColor = hasDossier ? (isApproved ? '#166534' : '#92400E') : '#64748B';
                                                const statusText = hasDossier ? (isApproved ? 'Aprobado' : 'Pendiente') : 'Sin Crear';

                                                return (
                                                    <tr key={client.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background 0.2s' }}>
                                                        <td style={tdStyle}>
                                                            <div style={{ fontWeight: '750' }}>{client.company_name || client.razon_social}</div>
                                                            <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>{client.contact_name || 'Sin contacto'}</div>
                                                        </td>
                                                        <td style={tdStyle}>{client.nit || 'N/A'}</td>
                                                        <td style={tdStyle}>{formatMoney(client.credit_limit || 0)}</td>
                                                        <td style={tdStyle}>
                                                            <span style={{ backgroundColor: statusColor, color: statusTextColor, padding: '0.25rem 0.6rem', borderRadius: THEME.radius.md, fontSize: '0.75rem', fontWeight: '800' }}>
                                                                {statusText}
                                                            </span>
                                                        </td>
                                                        <td style={tdStyle}>
                                                            {hasDossier ? formatMoney(dossier.cupo_solicitado) : 'N/A'}
                                                        </td>
                                                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                            <button
                                                                onClick={() => handleOpenDossierModal(client)}
                                                                style={{ backgroundColor: 'white', border: `1px solid ${THEME.colors.border}`, padding: '0.4rem 0.8rem', borderRadius: THEME.radius.md, fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer', marginRight: '0.5rem', transition: 'all 0.2s' }}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                                            >
                                                                📝 Diligenciar / Editar
                                                            </button>
                                                            {hasDossier && (
                                                                <a
                                                                    href={`/admin/commercial/billing/print-credit/${client.id}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    style={{ display: 'inline-block', backgroundColor: THEME.colors.primary, color: 'white', padding: '0.4rem 0.8rem', borderRadius: THEME.radius.md, fontWeight: '750', fontSize: '0.75rem', textDecoration: 'none', transition: 'all 0.2s' }}
                                                                >
                                                                    🖨️ Imprimir
                                                                </a>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* CONFIGURATION */}
                {activeTab === 'configuration' && (
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, padding: '2rem', boxShadow: THEME.shadow.md, maxWidth: '800px', margin: '0 auto' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            Configuración del Sistema
                        </h2>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                            <div>
                                <label style={labelStyle}>Prefijo FE</label>
                                <input type="text" defaultValue="FE-BOG" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Número Inicial</label>
                                <input type="number" defaultValue="1001" style={inputStyle} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '1.2rem' }}>
                            <button
                                onClick={() => alert('Configuración guardada exitosamente.')}
                                style={{ backgroundColor: THEME.colors.primary, color: 'white', border: 'none', padding: '0.6rem 1.5rem', borderRadius: THEME.radius.lg, fontWeight: '700', cursor: 'pointer' }}
                            >
                                Guardar Parámetros
                            </button>
                        </div>
                    </div>
                )}

                {/* MODAL REGISTRAR PAGO */}
                {isPaymentModalOpen && selectedInvoice && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                        <div style={{ backgroundColor: 'white', borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, padding: '2rem', maxWidth: '450px', width: '100%', margin: 'auto', boxShadow: THEME.shadow.lg, position: 'relative' }}>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', margin: '0 0 1rem 0' }}>Registrar Recaudo de Factura</h3>
                            
                            <div style={{ backgroundColor: THEME.colors.background, padding: '1rem', borderRadius: THEME.radius.lg, marginBottom: '1.2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                    <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary }}>Factura</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: '750' }}>{selectedInvoice.invoice_number}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                    <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary }}>Cliente</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>{selectedInvoice.orders?.profiles?.company_name || 'Final Client'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary }}>Total a Pagar</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: '850', color: THEME.colors.primary }}>{formatMoney(selectedInvoice.total_final)}</span>
                                </div>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={labelStyle}>Método de Pago</label>
                                <select 
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="Transferencia">Transferencia Bancaria (Bancolombia)</option>
                                    <option value="Efectivo">Efectivo (Entregado a Conductor)</option>
                                    <option value="Cheque">Cheque</option>
                                    <option value="Daviplata">Daviplata / Nequi</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => {
                                        setIsPaymentModalOpen(false);
                                        setSelectedInvoice(null);
                                    }}
                                    style={{ flex: 1, padding: '0.6rem', border: `1px solid ${THEME.colors.border}`, background: 'white', borderRadius: THEME.radius.md, fontWeight: '700', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleRegisterPayment}
                                    disabled={isProcessing}
                                    style={{ flex: 2, padding: '0.6rem', border: 'none', background: THEME.colors.primary, color: 'white', borderRadius: THEME.radius.md, fontWeight: '700', cursor: 'pointer' }}
                                >
                                    Confirmar Recaudo
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* MODAL DILIGENCIAR EXPEDIENTE DE CRÉDITO */}
                {isDossierModalOpen && selectedB2bClient && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                        <div style={{ backgroundColor: 'white', borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, padding: '2rem', maxWidth: '1000px', width: '100%', height: '90vh', display: 'flex', flexDirection: 'column', boxShadow: THEME.shadow.lg, position: 'relative' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0 }}>Dossier de Crédito y Pagarés</h3>
                                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary }}>Cliente: {selectedB2bClient.company_name} | NIT: {selectedB2bClient.nit}</p>
                                </div>
                                <button 
                                    onClick={() => setIsDossierModalOpen(false)}
                                    style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: THEME.colors.textSecondary }}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Section Navigation Tabs */}
                            <div style={{ display: 'flex', gap: '0.3rem', borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.5rem', marginBottom: '1.2rem', overflowX: 'auto' }}>
                                <button type="button" onClick={() => setActiveDossierSection('general')} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: THEME.radius.md, background: activeDossierSection === 'general' ? THEME.colors.primaryLight : 'none', color: activeDossierSection === 'general' ? THEME.colors.primary : THEME.colors.textSecondary, fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    1. Datos Básicos
                                </button>
                                <button type="button" onClick={() => setActiveDossierSection('contacts')} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: THEME.radius.md, background: activeDossierSection === 'contacts' ? THEME.colors.primaryLight : 'none', color: activeDossierSection === 'contacts' ? THEME.colors.primary : THEME.colors.textSecondary, fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    2. Contactos y Socios
                                </button>
                                <button type="button" onClick={() => setActiveDossierSection('financial')} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: THEME.radius.md, background: activeDossierSection === 'financial' ? THEME.colors.primaryLight : 'none', color: activeDossierSection === 'financial' ? THEME.colors.primary : THEME.colors.textSecondary, fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    3. Info Financiera
                                </button>
                                <button type="button" onClick={() => setActiveDossierSection('references')} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: THEME.radius.md, background: activeDossierSection === 'references' ? THEME.colors.primaryLight : 'none', color: activeDossierSection === 'references' ? THEME.colors.primary : THEME.colors.textSecondary, fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    4. Referencias
                                </button>
                                <button type="button" onClick={() => setActiveDossierSection('negociacion')} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: THEME.radius.md, background: activeDossierSection === 'negociacion' ? THEME.colors.primaryLight : 'none', color: activeDossierSection === 'negociacion' ? THEME.colors.primary : THEME.colors.textSecondary, fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    5. Negociación y Pagaré
                                </button>
                                <button type="button" onClick={() => setActiveDossierSection('codeudores')} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: THEME.radius.md, background: activeDossierSection === 'codeudores' ? THEME.colors.primaryLight : 'none', color: activeDossierSection === 'codeudores' ? THEME.colors.primary : THEME.colors.textSecondary, fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    6. Aprobación y Codeudor
                                </button>
                            </div>

                            {/* Form Body Container */}
                            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', marginBottom: '1rem' }}>
                                {activeDossierSection === 'general' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                                        <div>
                                            <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary }}>Solicitud de Crédito</h4>
                                            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.8rem' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                    <input type="checkbox" checked={dossierForm.agencia} onChange={(e) => setDossierForm({ ...dossierForm, agencia: e.target.checked })} /> Agencia
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                    <input type="checkbox" checked={dossierForm.supermercado} onChange={(e) => setDossierForm({ ...dossierForm, supermercado: e.target.checked })} /> Supermercado
                                                </label>
                                            </div>
                                            <div style={{ marginBottom: '0.8rem' }}>
                                                <label style={labelStyle}>Ciudad de Solicitud</label>
                                                <input type="text" value={dossierForm.ciudad} onChange={(e) => setDossierForm({ ...dossierForm, ciudad: e.target.value })} style={inputStyle} />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Cupo Solicitado ($)</label>
                                                    <input type="number" value={dossierForm.cupo_solicitado} onChange={(e) => setDossierForm({ ...dossierForm, cupo_solicitado: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Plazo Solicitado (Días)</label>
                                                    <input type="number" value={dossierForm.plazo_solicitado} onChange={(e) => setDossierForm({ ...dossierForm, plazo_solicitado: parseInt(e.target.value) || 0 })} style={inputStyle} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Fecha Solicitud</label>
                                                    <input type="date" value={dossierForm.fecha_solicitud} onChange={(e) => setDossierForm({ ...dossierForm, fecha_solicitud: e.target.value })} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Tipo Solicitud</label>
                                                    <select value={dossierForm.tipo_solicitud} onChange={(e) => setDossierForm({ ...dossierForm, tipo_solicitud: e.target.value })} style={inputStyle}>
                                                        <option value="creacion">Creación</option>
                                                        <option value="actualizacion">Actualización</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary }}>Información Básica</h4>
                                            <div style={{ marginBottom: '0.8rem' }}>
                                                <label style={labelStyle}>Razón Social</label>
                                                <input type="text" value={dossierForm.razon_social} onChange={(e) => setDossierForm({ ...dossierForm, razon_social: e.target.value })} style={inputStyle} />
                                            </div>
                                            <div style={{ marginBottom: '0.8rem' }}>
                                                <label style={labelStyle}>Nombre Comercial</label>
                                                <input type="text" value={dossierForm.nombre_comercial} onChange={(e) => setDossierForm({ ...dossierForm, nombre_comercial: e.target.value })} style={inputStyle} />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>NIT</label>
                                                    <input type="text" value={dossierForm.nit} onChange={(e) => setDossierForm({ ...dossierForm, nit: e.target.value })} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Teléfono Principal</label>
                                                    <input type="text" value={dossierForm.telefono} onChange={(e) => setDossierForm({ ...dossierForm, telefono: e.target.value })} style={inputStyle} />
                                                </div>
                                            </div>
                                            <div style={{ marginBottom: '0.8rem' }}>
                                                <label style={labelStyle}>Dirección Principal</label>
                                                <input type="text" value={dossierForm.direccion} onChange={(e) => setDossierForm({ ...dossierForm, direccion: e.target.value })} style={inputStyle} />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Ciudad</label>
                                                    <input type="text" value={dossierForm.ciudad_info} onChange={(e) => setDossierForm({ ...dossierForm, ciudad_info: e.target.value })} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Departamento</label>
                                                    <input type="text" value={dossierForm.departamento_info} onChange={(e) => setDossierForm({ ...dossierForm, departamento_info: e.target.value })} style={inputStyle} />
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ gridColumn: 'span 2', borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '1rem', marginTop: '0.5rem' }}>
                                            <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary }}>Actividad Económica y Representante Legal</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                                                <div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                        <div>
                                                            <label style={labelStyle}>Actividad Económica Principal</label>
                                                            <input type="text" value={dossierForm.actividad_economica_principal} onChange={(e) => setDossierForm({ ...dossierForm, actividad_economica_principal: e.target.value })} style={inputStyle} />
                                                        </div>
                                                        <div>
                                                            <label style={labelStyle}>Código CIIU</label>
                                                            <input type="text" value={dossierForm.ciiu_principal} onChange={(e) => setDossierForm({ ...dossierForm, ciiu_principal: e.target.value })} style={inputStyle} />
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                        <div>
                                                            <label style={labelStyle}>Actividad Económica Secundaría</label>
                                                            <input type="text" value={dossierForm.actividad_economica_secundaria} onChange={(e) => setDossierForm({ ...dossierForm, actividad_economica_secundaria: e.target.value })} style={inputStyle} />
                                                        </div>
                                                        <div>
                                                            <label style={labelStyle}>Código CIIU</label>
                                                            <input type="text" value={dossierForm.ciiu_secundario} onChange={(e) => setDossierForm({ ...dossierForm, ciiu_secundario: e.target.value })} style={inputStyle} />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                        <div>
                                                            <label style={labelStyle}>Nombre Representante Legal</label>
                                                            <input type="text" value={dossierForm.rep_legal_nombre} onChange={(e) => setDossierForm({ ...dossierForm, rep_legal_nombre: e.target.value })} style={inputStyle} />
                                                        </div>
                                                        <div>
                                                            <label style={labelStyle}>Identificación (C.C.)</label>
                                                            <input type="text" value={dossierForm.rep_legal_identificacion} onChange={(e) => setDossierForm({ ...dossierForm, rep_legal_identificacion: e.target.value })} style={inputStyle} />
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                        <div>
                                                            <label style={labelStyle}>Dirección Residencia</label>
                                                            <input type="text" value={dossierForm.rep_legal_direccion} onChange={(e) => setDossierForm({ ...dossierForm, rep_legal_direccion: e.target.value })} style={inputStyle} />
                                                        </div>
                                                        <div>
                                                            <label style={labelStyle}>Teléfono Residencia</label>
                                                            <input type="text" value={dossierForm.rep_legal_telefono} onChange={(e) => setDossierForm({ ...dossierForm, rep_legal_telefono: e.target.value })} style={inputStyle} />
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.8rem' }}>
                                                        <div>
                                                            <label style={labelStyle}>Correo Electrónico</label>
                                                            <input type="email" value={dossierForm.rep_legal_email} onChange={(e) => setDossierForm({ ...dossierForm, rep_legal_email: e.target.value })} style={inputStyle} />
                                                        </div>
                                                        <div>
                                                            <label style={labelStyle}>Celular</label>
                                                            <input type="text" value={dossierForm.rep_legal_celular} onChange={(e) => setDossierForm({ ...dossierForm, rep_legal_celular: e.target.value })} style={inputStyle} />
                                                        </div>
                                                    </div>
                                                    <div style={{ marginTop: '0.8rem' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                            <input type="checkbox" checked={dossierForm.rep_legal_es_pep} onChange={(e) => setDossierForm({ ...dossierForm, rep_legal_es_pep: e.target.checked })} /> ¿Es Persona Públicamente Expuesta (PEP)?
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeDossierSection === 'contacts' && (
                                    <div>
                                        <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary }}>Contactos de la Empresa</h4>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', border: `1px solid ${THEME.colors.border}` }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Área o Proceso</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Nombre Completo</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Teléfono</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Celular</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Email</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {dossierForm.contactos.map((contact: any, index: number) => (
                                                    <tr key={index} style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                        <td style={{ padding: '0.4rem', fontSize: '0.8rem', fontWeight: 'bold' }}>{contact.area}</td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={contact.nombre} onChange={(e) => {
                                                                const newContacts = [...dossierForm.contactos];
                                                                newContacts[index].nombre = e.target.value;
                                                                setDossierForm({ ...dossierForm, contactos: newContacts });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={contact.telefono} onChange={(e) => {
                                                                const newContacts = [...dossierForm.contactos];
                                                                newContacts[index].telefono = e.target.value;
                                                                setDossierForm({ ...dossierForm, contactos: newContacts });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={contact.celular} onChange={(e) => {
                                                                const newContacts = [...dossierForm.contactos];
                                                                newContacts[index].celular = e.target.value;
                                                                setDossierForm({ ...dossierForm, contactos: newContacts });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="email" value={contact.email} onChange={(e) => {
                                                                const newContacts = [...dossierForm.contactos];
                                                                newContacts[index].email = e.target.value;
                                                                setDossierForm({ ...dossierForm, contactos: newContacts });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        <h4 style={{ margin: '1.5rem 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Participación Accionaria (Socios con más del 5% del capital)</span>
                                            <button type="button" onClick={() => {
                                                const list = [...dossierForm.participacion_accionaria, { nombre: '', tipo_id: 'CC', numero_id: '', participacion_pct: 0, es_pep: false }];
                                                setDossierForm({ ...dossierForm, participacion_accionaria: list });
                                            }} style={{ padding: '0.3rem 0.8rem', fontSize: '0.7rem', background: THEME.colors.primaryLight, color: THEME.colors.primary, border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                ＋ Agregar Socio
                                            </button>
                                        </h4>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${THEME.colors.border}` }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Nombre Completo / Razón Social</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem', width: '120px' }}>Tipo ID</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Número ID</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem', width: '120px' }}>% Participación</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem', width: '100px' }}>¿Es PEP?</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem', width: '80px', textAlign: 'right' }}>Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {dossierForm.participacion_accionaria.map((socio: any, index: number) => (
                                                    <tr key={index} style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={socio.nombre} onChange={(e) => {
                                                                const list = [...dossierForm.participacion_accionaria];
                                                                list[index].nombre = e.target.value;
                                                                setDossierForm({ ...dossierForm, participacion_accionaria: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <select value={socio.tipo_id} onChange={(e) => {
                                                                const list = [...dossierForm.participacion_accionaria];
                                                                list[index].tipo_id = e.target.value;
                                                                setDossierForm({ ...dossierForm, participacion_accionaria: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }}>
                                                                <option value="CC">CC</option>
                                                                <option value="NIT">NIT</option>
                                                                <option value="TI">TI</option>
                                                                <option value="CE">CE</option>
                                                                <option value="Pasaporte">Pasaporte</option>
                                                                <option value="OTRO">Otro</option>
                                                            </select>
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={socio.numero_id} onChange={(e) => {
                                                                const list = [...dossierForm.participacion_accionaria];
                                                                list[index].numero_id = e.target.value;
                                                                setDossierForm({ ...dossierForm, participacion_accionaria: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="number" value={socio.participacion_pct} onChange={(e) => {
                                                                const list = [...dossierForm.participacion_accionaria];
                                                                list[index].participacion_pct = parseFloat(e.target.value) || 0;
                                                                setDossierForm({ ...dossierForm, participacion_accionaria: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                                                            <input type="checkbox" checked={socio.es_pep} onChange={(e) => {
                                                                const list = [...dossierForm.participacion_accionaria];
                                                                list[index].es_pep = e.target.checked;
                                                                setDossierForm({ ...dossierForm, participacion_accionaria: list });
                                                            }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem', textAlign: 'right' }}>
                                                            <button type="button" onClick={() => {
                                                                const list = dossierForm.participacion_accionaria.filter((_: any, i: number) => i !== index);
                                                                setDossierForm({ ...dossierForm, participacion_accionaria: list });
                                                            }} style={{ padding: '0.3rem 0.5rem', background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}>
                                                                Eliminar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        <h4 style={{ margin: '1.5rem 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary }}>Sucursales a crear (especificar ciudades o direcciones)</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
                                            {dossierForm.sucursales_a_crear.map((suc: string, idx: number) => (
                                                <div key={idx}>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>Sucursal {idx + 1}</label>
                                                    <input type="text" value={suc || ''} onChange={(e) => {
                                                        const list = [...dossierForm.sucursales_a_crear];
                                                        list[idx] = e.target.value;
                                                        setDossierForm({ ...dossierForm, sucursales_a_crear: list });
                                                    }} style={inputStyle} placeholder={`Ej: Bodega Norte / Sucursal ${idx+1}`} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeDossierSection === 'financial' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                        <div>
                                            <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary }}>Información Financiera</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Ingresos Mensuales ($)</label>
                                                    <input type="number" value={dossierForm.ingresos_mensuales} onChange={(e) => setDossierForm({ ...dossierForm, ingresos_mensuales: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Egresos Mensuales ($)</label>
                                                    <input type="number" value={dossierForm.egresos_mensuales} onChange={(e) => setDossierForm({ ...dossierForm, egresos_mensuales: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Otros Ingresos ($)</label>
                                                    <input type="number" value={dossierForm.otros_ingresos} onChange={(e) => setDossierForm({ ...dossierForm, otros_ingresos: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Concepto Otros Ingresos</label>
                                                    <input type="text" value={dossierForm.otros_ingresos_concepto} onChange={(e) => setDossierForm({ ...dossierForm, otros_ingresos_concepto: e.target.value })} style={inputStyle} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Activo ($)</label>
                                                    <input type="number" value={dossierForm.activo} onChange={(e) => setDossierForm({ ...dossierForm, activo: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Pasivo ($)</label>
                                                    <input type="number" value={dossierForm.pasivo} onChange={(e) => setDossierForm({ ...dossierForm, pasivo: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Patrimonio ($)</label>
                                                    <input type="number" value={dossierForm.patrimonio} onChange={(e) => setDossierForm({ ...dossierForm, patrimonio: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Fecha Corte Financiero</label>
                                                    <input type="text" placeholder="Ej: Dic 2025" value={dossierForm.fecha_corte_financiero} onChange={(e) => setDossierForm({ ...dossierForm, fecha_corte_financiero: e.target.value })} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Código de ICA</label>
                                                    <input type="text" value={dossierForm.codigo_ica} onChange={(e) => setDossierForm({ ...dossierForm, codigo_ica: e.target.value })} style={inputStyle} />
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary }}>Información Tributaria y Responsabilidad</h4>
                                            <div style={{ marginBottom: '0.8rem' }}>
                                                <label style={labelStyle}>Tipo de Contribuyente</label>
                                                <select value={dossierForm.tipo_contribuyente} onChange={(e) => setDossierForm({ ...dossierForm, tipo_contribuyente: e.target.value })} style={inputStyle}>
                                                    <option value="persona_juridica">Persona Jurídica</option>
                                                    <option value="persona_natural">Persona Natural</option>
                                                </select>
                                            </div>
                                            
                                            <label style={labelStyle}>Clase de Contribuyente / Responsabilidades (Selecciona todos los que apliquen)</label>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', backgroundColor: THEME.colors.background, padding: '0.8rem', borderRadius: THEME.radius.md, marginBottom: '1rem' }}>
                                                {Object.keys(dossierForm.clase_contribuyente).map((key) => (
                                                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', textTransform: 'capitalize', cursor: 'pointer' }}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={dossierForm.clase_contribuyente[key]} 
                                                            onChange={(e) => {
                                                                const updated = { ...dossierForm.clase_contribuyente, [key]: e.target.checked };
                                                                setDossierForm({ ...dossierForm, clase_contribuyente: updated });
                                                            }} 
                                                        />
                                                        {key.replace('_', ' ')}
                                                    </label>
                                                ))}
                                            </div>

                                            <h4 style={{ margin: '1rem 0 0.6rem 0', fontSize: '0.85rem', color: THEME.colors.primary }}>Responsable de Recibir Facturación Electrónica</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Nombre Responsable</label>
                                                    <input type="text" value={dossierForm.responsable_factura_nombre} onChange={(e) => setDossierForm({ ...dossierForm, responsable_factura_nombre: e.target.value })} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Teléfono Responsable</label>
                                                    <input type="text" value={dossierForm.responsable_factura_telefono} onChange={(e) => setDossierForm({ ...dossierForm, responsable_factura_telefono: e.target.value })} style={inputStyle} />
                                                </div>
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Email Facturación Electrónica</label>
                                                <input type="email" value={dossierForm.responsable_factura_email} onChange={(e) => setDossierForm({ ...dossierForm, responsable_factura_email: e.target.value })} style={inputStyle} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeDossierSection === 'references' && (
                                    <div>
                                        <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary }}>Referencias Comerciales (Clientes / Proveedores actuales)</h4>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', border: `1px solid ${THEME.colors.border}` }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                    <th style={{ ...thStyle, padding: '0.5rem', width: '30px' }}>#</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Entidad / Razón Social</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Nombre de Contacto</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Teléfono</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Ciudad</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem', width: '150px' }}>Cupo Otorgado</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem', width: '100px' }}>Plazo (Días)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {dossierForm.referencias_comerciales.map((ref: any, idx: number) => (
                                                    <tr key={idx} style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                        <td style={{ padding: '0.4rem', fontSize: '0.8rem', fontWeight: 'bold', textAlign: 'center' }}>{idx + 1}</td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={ref.entidad} onChange={(e) => {
                                                                const list = [...dossierForm.referencias_comerciales];
                                                                list[idx].entidad = e.target.value;
                                                                setDossierForm({ ...dossierForm, referencias_comerciales: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={ref.contacto} onChange={(e) => {
                                                                const list = [...dossierForm.referencias_comerciales];
                                                                list[idx].contacto = e.target.value;
                                                                setDossierForm({ ...dossierForm, referencias_comerciales: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={ref.telefono} onChange={(e) => {
                                                                const list = [...dossierForm.referencias_comerciales];
                                                                list[idx].telefono = e.target.value;
                                                                setDossierForm({ ...dossierForm, referencias_comerciales: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={ref.ciudad} onChange={(e) => {
                                                                const list = [...dossierForm.referencias_comerciales];
                                                                list[idx].ciudad = e.target.value;
                                                                setDossierForm({ ...dossierForm, referencias_comerciales: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="number" value={ref.cupo} onChange={(e) => {
                                                                const list = [...dossierForm.referencias_comerciales];
                                                                list[idx].cupo = parseFloat(e.target.value) || 0;
                                                                setDossierForm({ ...dossierForm, referencias_comerciales: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={ref.plazo} onChange={(e) => {
                                                                const list = [...dossierForm.referencias_comerciales];
                                                                list[idx].plazo = e.target.value;
                                                                setDossierForm({ ...dossierForm, referencias_comerciales: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        <h4 style={{ margin: '1.5rem 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Referencias Personales (Solo Persona Natural)</span>
                                            <button type="button" onClick={() => {
                                                const list = [...dossierForm.referencias_personales, { nombre: '', direccion: '', telefono: '', celular: '', relacion: '' }];
                                                setDossierForm({ ...dossierForm, referencias_personales: list });
                                            }} style={{ padding: '0.3rem 0.8rem', fontSize: '0.7rem', background: THEME.colors.primaryLight, color: THEME.colors.primary, border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                ＋ Agregar Referencia
                                            </button>
                                        </h4>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${THEME.colors.border}` }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Nombre Completo</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Dirección</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Teléfono</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Celular</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem' }}>Relación / Parentesco</th>
                                                    <th style={{ ...thStyle, padding: '0.5rem', width: '80px', textAlign: 'right' }}>Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {dossierForm.referencias_personales.map((ref: any, idx: number) => (
                                                    <tr key={idx} style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={ref.nombre} onChange={(e) => {
                                                                const list = [...dossierForm.referencias_personales];
                                                                list[idx].nombre = e.target.value;
                                                                setDossierForm({ ...dossierForm, referencias_personales: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={ref.direccion} onChange={(e) => {
                                                                const list = [...dossierForm.referencias_personales];
                                                                list[idx].direccion = e.target.value;
                                                                setDossierForm({ ...dossierForm, referencias_personales: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={ref.telefono} onChange={(e) => {
                                                                const list = [...dossierForm.referencias_personales];
                                                                list[idx].telefono = e.target.value;
                                                                setDossierForm({ ...dossierForm, referencias_personales: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={ref.celular} onChange={(e) => {
                                                                const list = [...dossierForm.referencias_personales];
                                                                list[idx].celular = e.target.value;
                                                                setDossierForm({ ...dossierForm, referencias_personales: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem' }}>
                                                            <input type="text" value={ref.relacion} onChange={(e) => {
                                                                const list = [...dossierForm.referencias_personales];
                                                                list[idx].relacion = e.target.value;
                                                                setDossierForm({ ...dossierForm, referencias_personales: list });
                                                            }} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                        </td>
                                                        <td style={{ padding: '0.4rem', textAlign: 'right' }}>
                                                            <button type="button" onClick={() => {
                                                                const list = dossierForm.referencias_personales.filter((_: any, i: number) => i !== idx);
                                                                setDossierForm({ ...dossierForm, referencias_personales: list });
                                                            }} style={{ padding: '0.3rem 0.5rem', background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}>
                                                                Eliminar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {activeDossierSection === 'negociacion' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                        <div>
                                            <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary }}>Negociación Comercial</h4>
                                            
                                            <label style={labelStyle}>Condiciones de Pago (Medio de pago)</label>
                                            <div style={{ display: 'flex', gap: '1rem', backgroundColor: THEME.colors.background, padding: '0.8rem', borderRadius: THEME.radius.md, marginBottom: '1rem' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                    <input type="checkbox" checked={dossierForm.condiciones_pago.consignacion} onChange={(e) => setDossierForm({ ...dossierForm, condiciones_pago: { ...dossierForm.condiciones_pago, consignacion: e.target.checked } })} /> Consignación
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                    <input type="checkbox" checked={dossierForm.condiciones_pago.transferencia} onChange={(e) => setDossierForm({ ...dossierForm, condiciones_pago: { ...dossierForm.condiciones_pago, transferencia: e.target.checked } })} /> Transferencia Electrónica
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                    <input type="checkbox" checked={dossierForm.condiciones_pago.cheque} onChange={(e) => setDossierForm({ ...dossierForm, condiciones_pago: { ...dossierForm.condiciones_pago, cheque: e.target.checked } })} /> Cheque
                                                </label>
                                            </div>
                                            <div style={{ marginBottom: '0.8rem' }}>
                                                <label style={labelStyle}>Otro Medio de Pago</label>
                                                <input type="text" value={dossierForm.condiciones_pago.otro || ''} onChange={(e) => setDossierForm({ ...dossierForm, condiciones_pago: { ...dossierForm.condiciones_pago, otro: e.target.value } })} style={inputStyle} />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Días de Plazo de Pago</label>
                                                    <input type="number" value={dossierForm.plazo_pago_dias} onChange={(e) => setDossierForm({ ...dossierForm, plazo_pago_dias: parseInt(e.target.value) || 0 })} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Días de Pago y Soportes (Observaciones Plazos)</label>
                                                    <input type="text" placeholder="Ej: Martes y Jueves" value={dossierForm.negociacion_dias_pago_soporte} onChange={(e) => setDossierForm({ ...dossierForm, negociacion_dias_pago_soporte: e.target.value })} style={inputStyle} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Sección / Sector Comercial</label>
                                                    <input type="text" value={dossierForm.negociacion_seccion} onChange={(e) => setDossierForm({ ...dossierForm, negociacion_seccion: e.target.value })} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Responsable Negociación</label>
                                                    <input type="text" value={dossierForm.negociacion_responsable} onChange={(e) => setDossierForm({ ...dossierForm, negociacion_responsable: e.target.value })} style={inputStyle} />
                                                </div>
                                            </div>
                                            <div style={{ marginBottom: '0.8rem' }}>
                                                <label style={labelStyle}>Observaciones Comerciales</label>
                                                <textarea value={dossierForm.negociacion_observaciones} onChange={(e) => setDossierForm({ ...dossierForm, negociacion_observaciones: e.target.value })} style={{ ...inputStyle, height: '60px', fontFamily: 'inherit' }} />
                                            </div>
                                        </div>

                                        <div>
                                            <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary }}>Declaración de Origen de Fondos</h4>
                                            <div style={{ marginBottom: '0.8rem' }}>
                                                <label style={labelStyle}>Fuentes / Origen de Recursos</label>
                                                <textarea 
                                                    value={dossierForm.declaracion_origen_fondos_fuentes} 
                                                    onChange={(e) => setDossierForm({ ...dossierForm, declaracion_origen_fondos_fuentes: e.target.value })} 
                                                    style={{ ...inputStyle, height: '80px', fontFamily: 'inherit' }} 
                                                    placeholder="Ej: Comercialización de frutas y verduras, recursos propios de la actividad comercial."
                                                />
                                            </div>

                                            <h4 style={{ margin: '1.2rem 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary }}>Operaciones Internacionales</h4>
                                            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.8rem' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                    <input type="checkbox" checked={dossierForm.realiza_operaciones_internacionales} onChange={(e) => setDossierForm({ ...dossierForm, realiza_operaciones_internacionales: e.target.checked })} /> ¿Realiza Operaciones Internacionales?
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                    <input type="checkbox" checked={dossierForm.tiene_productos_financieros_internacionales} onChange={(e) => setDossierForm({ ...dossierForm, tiene_productos_financieros_internacionales: e.target.checked })} /> ¿Tiene cuentas o productos financieros en el exterior?
                                                </label>
                                            </div>

                                            {dossierForm.realiza_operaciones_internacionales && (
                                                <div style={{ backgroundColor: THEME.colors.background, padding: '0.8rem', borderRadius: THEME.radius.md, marginBottom: '0.8rem' }}>
                                                    <label style={{ ...labelStyle, fontSize: '0.7rem' }}>Tipos de Operación</label>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.75rem' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <input type="checkbox" checked={dossierForm.operaciones_internacionales_detalle.transferencias} onChange={(e) => setDossierForm({ ...dossierForm, operaciones_internacionales_detalle: { ...dossierForm.operaciones_internacionales_detalle, transferencias: e.target.checked } })} /> Transferencias
                                                        </label>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <input type="checkbox" checked={dossierForm.operaciones_internacionales_detalle.importaciones} onChange={(e) => setDossierForm({ ...dossierForm, operaciones_internacionales_detalle: { ...dossierForm.operaciones_internacionales_detalle, importaciones: e.target.checked } })} /> Importaciones
                                                        </label>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <input type="checkbox" checked={dossierForm.operaciones_internacionales_detalle.exportaciones} onChange={(e) => setDossierForm({ ...dossierForm, operaciones_internacionales_detalle: { ...dossierForm.operaciones_internacionales_detalle, exportaciones: e.target.checked } })} /> Exportaciones
                                                        </label>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <input type="checkbox" checked={dossierForm.operaciones_internacionales_detalle.inversiones} onChange={(e) => setDossierForm({ ...dossierForm, operaciones_internacionales_detalle: { ...dossierForm.operaciones_internacionales_detalle, inversiones: e.target.checked } })} /> Inversiones
                                                        </label>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <input type="checkbox" checked={dossierForm.operaciones_internacionales_detalle.giros} onChange={(e) => setDossierForm({ ...dossierForm, operaciones_internacionales_detalle: { ...dossierForm.operaciones_internacionales_detalle, giros: e.target.checked } })} /> Giros
                                                        </label>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <input type="checkbox" checked={dossierForm.operaciones_internacionales_detalle.pago_servicio} onChange={(e) => setDossierForm({ ...dossierForm, operaciones_internacionales_detalle: { ...dossierForm.operaciones_internacionales_detalle, pago_servicio: e.target.checked } })} /> Pago de servicio
                                                        </label>
                                                    </div>
                                                    <div style={{ marginTop: '0.4rem' }}>
                                                        <label style={{ ...labelStyle, fontSize: '0.65rem' }}>Otros detalles</label>
                                                        <input type="text" value={dossierForm.operaciones_internacionales_detalle.otros || ''} onChange={(e) => setDossierForm({ ...dossierForm, operaciones_internacionales_detalle: { ...dossierForm.operaciones_internacionales_detalle, otros: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeDossierSection === 'codeudores' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                        <div>
                                            <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary }}>Información del Pagaré y Firmantes</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Número de Pagaré</label>
                                                    <input type="text" value={dossierForm.pagare_numero} onChange={(e) => setDossierForm({ ...dossierForm, pagare_numero: e.target.value })} style={inputStyle} placeholder="Ej: PAG-2026-001" />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Entidad Acreedora</label>
                                                    <input type="text" value={dossierForm.pagare_acreedor} onChange={(e) => setDossierForm({ ...dossierForm, pagare_acreedor: e.target.value })} style={inputStyle} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Ciudad de Firma</label>
                                                    <input type="text" value={dossierForm.pagare_ciudad_firma} onChange={(e) => setDossierForm({ ...dossierForm, pagare_ciudad_firma: e.target.value })} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Fecha de Firma</label>
                                                    <input type="date" value={dossierForm.pagare_fecha_firma} onChange={(e) => setDossierForm({ ...dossierForm, pagare_fecha_firma: e.target.value })} style={inputStyle} />
                                                </div>
                                            </div>

                                            <h5 style={{ margin: '1rem 0 0.5rem 0', fontSize: '0.8rem', fontWeight: 'bold', borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.2rem' }}>Firma del Deudor (Datos Ficha)</h5>
                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                <div>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>Nombre Completo</label>
                                                    <input type="text" value={dossierForm.pagare_firma_deudor.nombre} onChange={(e) => setDossierForm({ ...dossierForm, pagare_firma_deudor: { ...dossierForm.pagare_firma_deudor, nombre: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                </div>
                                                <div>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>ID / C.C.</label>
                                                    <input type="text" value={dossierForm.pagare_firma_deudor.identificacion} onChange={(e) => setDossierForm({ ...dossierForm, pagare_firma_deudor: { ...dossierForm.pagare_firma_deudor, identificacion: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                <div>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>Dirección Residencia</label>
                                                    <input type="text" value={dossierForm.pagare_firma_deudor.direccion} onChange={(e) => setDossierForm({ ...dossierForm, pagare_firma_deudor: { ...dossierForm.pagare_firma_deudor, direccion: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                </div>
                                                <div>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>Barrio / Ciudad</label>
                                                    <input type="text" value={dossierForm.pagare_firma_deudor.barrio} onChange={(e) => setDossierForm({ ...dossierForm, pagare_firma_deudor: { ...dossierForm.pagare_firma_deudor, barrio: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                                                <div>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>Celular</label>
                                                    <input type="text" value={dossierForm.pagare_firma_deudor.celular} onChange={(e) => setDossierForm({ ...dossierForm, pagare_firma_deudor: { ...dossierForm.pagare_firma_deudor, celular: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                </div>
                                                <div>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>Teléfono Fijo</label>
                                                    <input type="text" value={dossierForm.pagare_firma_deudor.telefono} onChange={(e) => setDossierForm({ ...dossierForm, pagare_firma_deudor: { ...dossierForm.pagare_firma_deudor, telefono: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                </div>
                                                <div>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>Email</label>
                                                    <input type="email" value={dossierForm.pagare_firma_deudor.email} onChange={(e) => setDossierForm({ ...dossierForm, pagare_firma_deudor: { ...dossierForm.pagare_firma_deudor, email: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary }}>Firma del Codeudor (Garantía)</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                <div>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>Nombre Completo Codeudor</label>
                                                    <input type="text" value={dossierForm.pagare_firma_codeudor.nombre} onChange={(e) => setDossierForm({ ...dossierForm, pagare_firma_codeudor: { ...dossierForm.pagare_firma_codeudor, nombre: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                </div>
                                                <div>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>C.C. Codeudor</label>
                                                    <input type="text" value={dossierForm.pagare_firma_codeudor.identificacion} onChange={(e) => setDossierForm({ ...dossierForm, pagare_firma_codeudor: { ...dossierForm.pagare_firma_codeudor, identificacion: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                <div>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>Dirección Residencia</label>
                                                    <input type="text" value={dossierForm.pagare_firma_codeudor.direccion} onChange={(e) => setDossierForm({ ...dossierForm, pagare_firma_codeudor: { ...dossierForm.pagare_firma_codeudor, direccion: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                </div>
                                                <div>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>Barrio / Ciudad</label>
                                                    <input type="text" value={dossierForm.pagare_firma_codeudor.barrio} onChange={(e) => setDossierForm({ ...dossierForm, pagare_firma_codeudor: { ...dossierForm.pagare_firma_codeudor, barrio: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', marginBottom: '1.2rem' }}>
                                                <div>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>Celular</label>
                                                    <input type="text" value={dossierForm.pagare_firma_codeudor.celular} onChange={(e) => setDossierForm({ ...dossierForm, pagare_firma_codeudor: { ...dossierForm.pagare_firma_codeudor, celular: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                </div>
                                                <div>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>Teléfono Fijo</label>
                                                    <input type="text" value={dossierForm.pagare_firma_codeudor.telefono} onChange={(e) => setDossierForm({ ...dossierForm, pagare_firma_codeudor: { ...dossierForm.pagare_firma_codeudor, telefono: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                </div>
                                                <div>
                                                    <label style={{ ...labelStyle, fontSize: '0.65rem' }}>Email</label>
                                                    <input type="email" value={dossierForm.pagare_firma_codeudor.email} onChange={(e) => setDossierForm({ ...dossierForm, pagare_firma_codeudor: { ...dossierForm.pagare_firma_codeudor, email: e.target.value } })} style={{ ...inputStyle, padding: '0.4rem' }} />
                                                </div>
                                            </div>

                                            <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: THEME.colors.primary, borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '0.8rem' }}>Exclusivo para la Empresa (Aprobación Administrativa)</h4>
                                            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.8rem' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                    <input type="checkbox" checked={dossierForm.credito_aprobado} onChange={(e) => setDossierForm({ ...dossierForm, credito_aprobado: e.target.checked })} /> ¿Crédito Aprobado?
                                                </label>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Cupo Aprobado ($)</label>
                                                    <input type="number" value={dossierForm.cupo_aprobado} onChange={(e) => setDossierForm({ ...dossierForm, cupo_aprobado: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Plazo Aprobado (Días)</label>
                                                    <input type="number" value={dossierForm.plazo_aprobado} onChange={(e) => setDossierForm({ ...dossierForm, plazo_aprobado: parseInt(e.target.value) || 0 })} style={inputStyle} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Visto Bueno Comercial</label>
                                                    <input type="text" value={dossierForm.vo_bo} onChange={(e) => setDossierForm({ ...dossierForm, vo_bo: e.target.value })} style={inputStyle} placeholder="Nombre / Firma" />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Autorización Gerencia</label>
                                                    <input type="text" value={dossierForm.autorizacion_gerencia} onChange={(e) => setDossierForm({ ...dossierForm, autorizacion_gerencia: e.target.value })} style={inputStyle} placeholder="Nombre / Firma" />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Observaciones Director Agencia</label>
                                                    <textarea value={dossierForm.observaciones_director} onChange={(e) => setDossierForm({ ...dossierForm, observaciones_director: e.target.value })} style={{ ...inputStyle, height: '50px', fontFamily: 'inherit' }} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Concepto Coordinador Comercial</label>
                                                    <textarea value={dossierForm.concepto_coordinador} onChange={(e) => setDossierForm({ ...dossierForm, concepto_coordinador: e.target.value })} style={{ ...inputStyle, height: '50px', fontFamily: 'inherit' }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer Buttons */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '1.2rem', marginTop: 'auto' }}>
                                <button
                                    onClick={() => setIsDossierModalOpen(false)}
                                    style={{ padding: '0.6rem 1.5rem', border: `1px solid ${THEME.colors.border}`, background: 'white', borderRadius: THEME.radius.lg, fontWeight: '750', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveDossier}
                                    disabled={isSavingDossier}
                                    style={{ backgroundColor: THEME.colors.primary, color: 'white', border: 'none', padding: '0.6rem 2rem', borderRadius: THEME.radius.lg, fontWeight: '750', cursor: 'pointer' }}
                                >
                                    {isSavingDossier ? 'Guardando...' : 'Guardar Dossier de Crédito'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </main>
    );
}

const kpiCardStyle: React.CSSProperties = {
    backgroundColor: THEME.colors.surface,
    border: `1px solid ${THEME.colors.border}`,
    borderRadius: '20px',
    padding: '1.2rem',
    boxShadow: THEME.shadow.sm,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
};

const thStyle: React.CSSProperties = {
    padding: '0.8rem 1rem',
    textAlign: 'left',
    fontSize: THEME.typography.tableHeader.fontSize,
    color: THEME.typography.tableHeader.color,
    fontWeight: THEME.typography.tableHeader.fontWeight,
    textTransform: THEME.typography.tableHeader.textTransform,
    letterSpacing: THEME.typography.tableHeader.letterSpacing
};

const tdStyle: React.CSSProperties = {
    padding: '1rem',
    fontSize: '0.85rem',
    color: THEME.colors.textMain
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    marginBottom: '0.4rem',
    textTransform: 'uppercase'
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem',
    borderRadius: THEME.radius.md,
    border: `1px solid ${THEME.colors.border}`,
    fontSize: '0.85rem',
    backgroundColor: 'white'
};
