'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { THEME, formatMoney } from '@/lib/adminTheme';

export default function CreditPrintPage() {
    const { id } = useParams();
    const [client, setClient] = useState<any>(null);
    const [dossier, setDossier] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const isBlankMode = id === 'blank';

    useEffect(() => {
        const fetchDossierData = async () => {
            try {
                if (id === 'blank') {
                    setClient({
                        company_name: '________________________________________',
                        nit: '____________________',
                        razon_social: '________________________________________',
                        address: '________________________________________',
                        city: '____________________',
                        department: '____________________',
                        phone: '____________________',
                        contact_name: '________________________________________',
                        contact_phone: '____________________',
                        email: '____________________'
                    });
                    setDossier({});
                    setLoading(false);
                    return;
                }
                // 1. Fetch client profile
                const { data: clientData } = await supabase
                    .from('profiles')
                    .eq('id', id)
                    .single();
                setClient(clientData);

                // 2. Fetch credit dossier
                const { data: dossierData } = await supabase
                    .from('client_credit_dossiers')
                    .eq('profile_id', id)
                    .single();
                setDossier(dossierData);
            } catch (err) {
                console.error('Error fetching dossier:', err);
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchDossierData();
    }, [id]);

    if (loading) return <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>Cargando expediente de crédito...</div>;
    if (!client) return <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>Cliente no encontrado.</div>;

    // Pre-populate fields from dossier or fallback to profile or blank
    const d = dossier || {};
    const contacts = d.contactos || [
        { area: 'Compras/pedidos', nombre: '', telefono: '', celular: '', email: '' },
        { area: 'Contabilidad/tesoreria', nombre: '', telefono: '', celular: '', email: '' },
        { area: 'Oficial de Cumplimiento', nombre: '', telefono: '', celular: '', email: '' }
    ];
    const shareholders = isBlankMode ? [
        { nombre: '________________________________________', tipo_id: '_____', numero_id: '____________________', participacion_pct: '____', es_pep: false },
        { nombre: '________________________________________', tipo_id: '_____', numero_id: '____________________', participacion_pct: '____', es_pep: false },
        { nombre: '________________________________________', tipo_id: '_____', numero_id: '____________________', participacion_pct: '____', es_pep: false }
    ] : (d.participacion_accionaria || []);

    const internationalOps = d.operaciones_internacionales_detalle || { transferencias: false, importaciones: false, exportaciones: false, inversiones: false, giros: false, pago_servicio: false, otros: '' };
    const taxClasses = d.clase_contribuyente || {};
    const commercialRefs = d.referencias_comerciales || [
        { entidad: '', contacto: '', telefono: '', ciudad: '', cupo: '', plazo: '' },
        { entidad: '', contacto: '', telefono: '', ciudad: '', cupo: '', plazo: '' }
    ];
    const personalRefs = isBlankMode ? [
        { nombre: '________________________________________', direccion: '________________________________________', telefono: '________________', celular: '________________', relacion: '________________' },
        { nombre: '________________________________________', direccion: '________________________________________', telefono: '________________', celular: '________________', relacion: '________________' }
    ] : (d.referencias_personales || []);

    const paymentCond = d.condiciones_pago || { consignacion: false, transferencia: false, cheque: false, otro: '' };
    const pagareDeudor = isBlankMode ? { nombre: '________________________________________', identificacion: '____________________', direccion: '________________________________________', barrio: '____________________', celular: '____________________', telefono: '____________________', email: '____________________' } : (d.pagare_firma_deudor || { nombre: client.contact_name || '', identificacion: client.nit || '', direccion: client.address || '', barrio: '', celular: client.contact_phone || '', telefono: '', email: client.email || '' });
    const pagareCodeudor = d.pagare_firma_codeudor || { nombre: '', identificacion: '', direccion: '', barrio: '', celular: '', telefono: '', email: '' };

    const formatDate = (dateStr?: string) => {
        if (!dateStr || isBlankMode) return '______ de _________________ de 202__';
        return new Date(dateStr).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const displayVal = (val: any, placeholder: string = '____________________') => {
        return isBlankMode ? placeholder : (val || placeholder);
    };


    return (
        <div style={{ backgroundColor: '#fff', color: '#000', fontFamily: 'Arial, sans-serif', fontSize: '8.5px', lineHeight: '1.2' }}>
            <style>
                {`
                @page {
                    size: letter portrait;
                    margin: 8mm 10mm;
                }
                @media print {
                    .no-print { display: none !important; }
                    .page-break { page-break-after: always; display: block; clear: both; }
                    body { background: white; margin: 0; padding: 0; }
                }
                .form-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 6px;
                }
                .form-table td, .form-table th {
                    border: 1px solid #000;
                    padding: 3px 5px;
                    vertical-align: middle;
                }
                .form-table th {
                    background-color: #f2f2f2;
                    text-align: left;
                    font-weight: bold;
                    text-transform: uppercase;
                }
                .section-header {
                    background-color: #f2f2f2;
                    border: 1px solid #000;
                    text-align: center;
                    font-weight: bold;
                    font-size: 9.5px;
                    padding: 3px;
                    margin-bottom: 3px;
                    text-transform: uppercase;
                }
                .signature-box {
                    border: 1px solid #000;
                    height: 40px;
                    margin-top: 4px;
                }
                .checkbox-container {
                    display: inline-flex;
                    align-items: center;
                    margin-right: 8px;
                }
                .checkbox-container input {
                    margin-right: 2px;
                }
                `}
            </style>

            {/* Float Toolbar */}
            <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, backgroundColor: '#f8f9fa', borderBottom: '1px solid #dee2e6', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2000 }}>
                <h3 style={{ margin: 0, fontFamily: 'sans-serif', fontSize: '14px' }}>Documentos de Crédito - {client.company_name}</h3>
                <button onClick={() => window.print()} style={{ padding: '8px 16px', background: '#0D7A57', color: '#fff', borderRadius: '6px', cursor: 'pointer', border: 'none', fontWeight: 'bold', fontSize: '12px' }}>
                    🖨️ Imprimir Expediente
                </button>
            </div>

            {/* Offset for toolbar */}
            <div className="no-print" style={{ height: '50px' }}></div>

            {/* PAGE 1: SOLICITUD DE CRÉDITO / CONOCIMIENTO DE CLIENTES */}
            <div className="page-break" style={{ padding: '8px 12px' }}>
                {/* Header Table */}
                <table className="form-table" style={{ marginBottom: '10px' }}>
                    <tbody>
                        <tr>
                            <td rowSpan={4} style={{ width: '180px', textAlign: 'center' }}>
                                <img src="/logo-investments.png" alt="Investments Cortés" style={{ height: '45px', objectFit: 'contain' }} />
                                <div style={{ fontSize: '7px', fontWeight: 'bold', marginTop: '2px' }}>INVESTMENTS CORTES S.A.S.</div>
                                <div style={{ fontSize: '6px', color: '#555' }}>NIT: 901.393.217-1 | Tel: 3154063876</div>
                            </td>
                            <td rowSpan={4} style={{ textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                                SOLICITUD DE CRÉDITO Y<br />CONOCIMIENTO DE CLIENTES
                            </td>
                            <td style={{ width: '150px', fontWeight: 'bold' }}>CÓDIGO: CA-FO-001</td>
                        </tr>
                        <tr>
                            <td style={{ fontWeight: 'bold' }}>VERSIÓN: 07</td>
                        </tr>
                        <tr>
                            <td style={{ fontWeight: 'bold' }}>PÁGINA: 1 de 4</td>
                        </tr>
                        <tr>
                            <td style={{ fontWeight: 'bold' }}>FECHA: ENE 2025</td>
                        </tr>
                    </tbody>
                </table>

                {/* Form Header Info */}
                <table className="form-table">
                    <tbody>
                        <tr>
                            <td style={{ width: '15%' }}><b>AGENCIA:</b></td>
                            <td style={{ width: '10%' }}>{!isBlankMode && d.agencia ? '[X]' : '[ ]'}</td>
                            <td style={{ width: '15%' }}><b>SUPERMERCADO:</b></td>
                            <td style={{ width: '10%' }}>{!isBlankMode && d.supermercado ? '[X]' : '[ ]'}</td>
                            <td style={{ width: '10%' }}><b>CIUDAD:</b></td>
                            <td style={{ width: '15%' }}>{displayVal(d.ciudad, '____________________')}</td>
                            <td style={{ width: '10%' }}><b>CUPO:</b></td>
                            <td style={{ width: '15%' }}>{(!isBlankMode && d.cupo_solicitado) ? `$${d.cupo_solicitado.toLocaleString('es-CO')}` : '____________________'}</td>
                        </tr>
                        <tr>
                            <td><b>PLAZO:</b></td>
                            <td>{(!isBlankMode && d.plazo_solicitado) ? `${d.plazo_solicitado} Días` : '____________________'}</td>
                            <td><b>FECHA SOLICITUD:</b></td>
                            <td>{displayVal(d.fecha_solicitud, '____________________')}</td>
                            <td><b>SOLICITUD:</b></td>
                            <td colSpan={3}>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && d.tipo_solicitud === 'creacion'} /> Creación</span>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && d.tipo_solicitud === 'actualizacion'} /> Actualización</span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* BASIC INFO */}
                <div className="section-header">1. Información Básica</div>
                <table className="form-table">
                    <tbody>
                        <tr>
                            <td style={{ width: '15%' }}><b>Razón Social:</b></td>
                            <td colSpan={3} style={{ fontSize: '10px', fontWeight: 'bold' }}>{displayVal(d.razon_social || client.razon_social || client.company_name, '__________________________________________________')}</td>
                            <td style={{ width: '10%' }}><b>NIT / C.C:</b></td>
                            <td style={{ width: '25%', fontSize: '10px', fontWeight: 'bold' }}>{displayVal(d.nit || client.nit, '____________________')}</td>
                        </tr>
                        <tr>
                            <td><b>Nombre Comercial:</b></td>
                            <td colSpan={5}>{displayVal(d.nombre_comercial || client.company_name, '__________________________________________________')}</td>
                        </tr>
                        <tr>
                            <td><b>Dirección:</b></td>
                            <td colSpan={2}>{displayVal(d.direccion || client.address, '________________________________________')}</td>
                            <td><b>Ciudad:</b></td>
                            <td>{displayVal(d.ciudad_info || client.city, '____________________')}</td>
                            <td><b>Dpto:</b></td>
                            <td>{displayVal(d.departamento_info || client.department, '____________________')}</td>
                        </tr>
                        <tr>
                            <td><b>Teléfono:</b></td>
                            <td>{displayVal(d.telefono || client.phone || client.contact_phone, '____________________')}</td>
                            <td><b>Celular:</b></td>
                            <td>{displayVal(pagareDeudor.celular, '____________________')}</td>
                            <td><b>E-mail:</b></td>
                            <td colSpan={2}>{displayVal(pagareDeudor.email, '________________________________________')}</td>
                        </tr>
                        <tr>
                            <td><b>Actividad Econ. Ppal:</b></td>
                            <td colSpan={2}>{displayVal(d.actividad_economica_principal, '________________________________________')}</td>
                            <td><b>CIIU:</b></td>
                            <td>{displayVal(d.ciiu_principal, '____________')}</td>
                            <td><b>¿Es PEP?:</b></td>
                            <td>{isBlankMode ? 'SI [ ] NO [ ]' : (d.rep_legal_es_pep ? 'SI [X] NO [ ]' : 'SI [ ] NO [X]')}</td>
                        </tr>
                        <tr>
                            <td><b>Representante Legal:</b></td>
                            <td colSpan={2} style={{ fontWeight: 'bold' }}>{displayVal(d.rep_legal_nombre || client.contact_name, '__________________________________________________')}</td>
                            <td><b>Identificación:</b></td>
                            <td>{displayVal(d.rep_legal_identificacion, '____________________')}</td>
                            <td><b>Dir. Residencia:</b></td>
                            <td>{displayVal(d.rep_legal_direccion, '________________________________________')}</td>
                        </tr>
                    </tbody>
                </table>

                {/* SUCURSALES */}
                <div className="section-header">Sucursales (especificar sucursales a crear)</div>
                <table className="form-table">
                    <tbody>
                        <tr>
                            <td style={{ width: '33%' }}><b>1.</b> {d.sucursales_a_crear?.[0] || '____________________'}</td>
                            <td style={{ width: '33%' }}><b>2.</b> {d.sucursales_a_crear?.[1] || '____________________'}</td>
                            <td style={{ width: '33%' }}><b>3.</b> {d.sucursales_a_crear?.[2] || '____________________'}</td>
                        </tr>
                        <tr>
                            <td><b>4.</b> {d.sucursales_a_crear?.[3] || '____________________'}</td>
                            <td><b>5.</b> {d.sucursales_a_crear?.[4] || '____________________'}</td>
                            <td><b>6.</b> {d.sucursales_a_crear?.[5] || '____________________'}</td>
                        </tr>
                    </tbody>
                </table>

                {/* CONTACTS */}
                <div className="section-header">2. Contactos Autorizados</div>
                <table className="form-table">
                    <thead>
                        <tr>
                            <th style={{ width: '20%' }}>Área o Proceso</th>
                            <th style={{ width: '30%' }}>Nombre Completo</th>
                            <th style={{ width: '15%' }}>Teléfono</th>
                            <th style={{ width: '15%' }}>Celular</th>
                            <th style={{ width: '20%' }}>Email</th>
                        </tr>
                    </thead>
                    <tbody>
                        {contacts.map((contact: any, i: number) => (
                            <tr key={i}>
                                <td><b>{contact.area}</b></td>
                                <td>{contact.nombre || '________________________________'}</td>
                                <td>{contact.telefono || '_____________'}</td>
                                <td>{contact.celular || '_____________'}</td>
                                <td>{contact.email || '________________________'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* SHAREHOLDERS */}
                <div className="section-header">3. Participación Accionaria (Accionistas con &gt; 5% capital social)</div>
                <table className="form-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40%' }}>Nombre Completo o Razón Social</th>
                            <th style={{ width: '15%' }}>Tipo ID</th>
                            <th style={{ width: '20%' }}>Número ID</th>
                            <th style={{ width: '15%' }}>% Participación</th>
                            <th style={{ width: '10%' }}>Es PEP</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shareholders.length === 0 ? (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', color: '#666', height: '28px' }}>Ningún socio registrado</td>
                            </tr>
                        ) : shareholders.map((sh: any, i: number) => (
                            <tr key={i}>
                                <td style={{ fontWeight: 'bold' }}>{sh.nombre}</td>
                                <td>{sh.tipo_id}</td>
                                <td>{sh.numero_id}</td>
                                <td>{sh.participacion_pct}%</td>
                                <td>{sh.es_pep ? 'SI' : 'NO'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* PAGE 2: OPERATIONS, FINANCIAL, REFERENCES, NEGOCIACIÓN */}
            <div className="page-break" style={{ padding: '8px 12px' }}>
                <div className="section-header">4. Información de Operaciones Internacionales</div>
                <table className="form-table">
                    <tbody>
                        <tr>
                            <td style={{ width: '35%' }}><b>¿Realiza Operaciones Internacionales?</b></td>
                            <td style={{ width: '15%' }}>{isBlankMode ? 'SI [ ] NO [ ]' : (d.realiza_operaciones_internacionales ? 'SI [X] NO [ ]' : 'SI [ ] NO [X]')}</td>
                            <td style={{ width: '15%' }}><b>Tipo de Operación:</b></td>
                            <td colSpan={3}>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && !!internationalOps.transferencias} /> Transferencias</span>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && !!internationalOps.importaciones} /> Importaciones</span>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && !!internationalOps.exportaciones} /> Exportaciones</span>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && !!internationalOps.giros} /> Giros</span>
                            </td>
                        </tr>
                        <tr>
                            <td><b>¿Tiene Cuentas en el Exterior?</b></td>
                            <td>{isBlankMode ? 'SI [ ] NO [ ]' : (d.tiene_productos_financieros_internacionales ? 'SI [X] NO [ ]' : 'SI [ ] NO [X]')}</td>
                            <td><b>Detalles Operación:</b></td>
                            <td colSpan={3}>{displayVal(internationalOps.otros, '________________________________________')}</td>
                        </tr>
                    </tbody>
                </table>

                <div className="section-header">5. Información Financiera y Tributaria</div>
                <table className="form-table">
                    <tbody>
                        <tr>
                            <td style={{ width: '15%' }}><b>Tipo de Persona:</b></td>
                            <td colSpan={2}>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && d.tipo_contribuyente === 'persona_natural'} /> Persona Natural</span>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && d.tipo_contribuyente === 'persona_juridica'} /> Persona Jurídica</span>
                            </td>
                            <td style={{ width: '15%' }}><b>Responsable de IVA:</b></td>
                            <td colSpan={2}>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && !!taxClasses.regimen_comun} /> Régimen Común</span>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && !!taxClasses.regimen_simplificado} /> Simplificado</span>
                            </td>
                        </tr>
                        <tr>
                            <td><b>Clase Contribuyente:</b></td>
                            <td colSpan={5}>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && !!taxClasses.gran_contribuyente} /> Gran Contribuyente</span>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && !!taxClasses.auto_retenedor} /> Autorretenedor</span>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && !!taxClasses.regimen_simple} /> Régimen Simple</span>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && !!taxClasses.sin_animo_lucro} /> Sin Ánimo de Lucro</span>
                            </td>
                        </tr>
                        <tr>
                            <td><b>Ingresos Mensuales:</b></td>
                            <td>{isBlankMode ? '____________________' : (d.ingresos_mensuales ? `$${d.ingresos_mensuales.toLocaleString('es-CO')}` : '$ 0')}</td>
                            <td><b>Egresos Mensuales:</b></td>
                            <td>{isBlankMode ? '____________________' : (d.egresos_mensuales ? `$${d.egresos_mensuales.toLocaleString('es-CO')}` : '$ 0')}</td>
                            <td><b>Fecha de Corte:</b></td>
                            <td>{displayVal(d.fecha_corte_financiero, '____________________')}</td>
                        </tr>
                        <tr>
                            <td><b>Activos:</b></td>
                            <td>{isBlankMode ? '____________________' : (d.activo ? `$${d.activo.toLocaleString('es-CO')}` : '$ 0')}</td>
                            <td><b>Pasivos:</b></td>
                            <td>{isBlankMode ? '____________________' : (d.pasivo ? `$${d.pasivo.toLocaleString('es-CO')}` : '$ 0')}</td>
                            <td><b>Patrimonio:</b></td>
                            <td>{isBlankMode ? '____________________' : (d.patrimonio ? `$${d.patrimonio.toLocaleString('es-CO')}` : '$ 0')}</td>
                        </tr>
                        <tr>
                            <td><b>Responsable FE:</b></td>
                            <td colSpan={2}>{displayVal(d.responsable_factura_nombre, '________________________________________')}</td>
                            <td><b>Email FE:</b></td>
                            <td colSpan={2}>{displayVal(d.responsable_factura_email, '________________________________________')}</td>
                        </tr>
                    </tbody>
                </table>

                <div className="section-header">6. Referencias Comerciales y Personales</div>
                <table className="form-table">
                    <thead>
                        <tr>
                            <th colSpan={7}>Referencias Comerciales</th>
                        </tr>
                        <tr>
                            <th>Entidad / Proveedor</th>
                            <th>Contacto</th>
                            <th>Teléfono</th>
                            <th>Ciudad</th>
                            <th>Cupo</th>
                            <th>Plazo (Días)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {commercialRefs.map((ref: any, idx: number) => (
                            <tr key={idx}>
                                <td>{displayVal(ref.entidad, '__________________________')}</td>
                                <td>{displayVal(ref.contacto, '__________________')}</td>
                                <td>{displayVal(ref.telefono, '___________')}</td>
                                <td>{displayVal(ref.ciudad, '__________')}</td>
                                <td>{(!isBlankMode && ref.cupo) ? `$${ref.cupo.toLocaleString('es-CO')}` : '___________'}</td>
                                <td>{displayVal(ref.plazo, '_____')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <table className="form-table">
                    <thead>
                        <tr>
                            <th colSpan={5}>Referencias Personales (Solo Persona Natural)</th>
                        </tr>
                        <tr>
                            <th>Nombre Completo</th>
                            <th>Dirección</th>
                            <th>Teléfono</th>
                            <th>Celular</th>
                            <th>Relación / Parentesco</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(!isBlankMode && personalRefs.length === 0) ? (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', color: '#666', height: '24px' }}>No aplica (Persona Jurídica)</td>
                            </tr>
                        ) : (isBlankMode ? personalRefs : personalRefs).map((ref: any, idx: number) => (
                            <tr key={idx}>
                                <td>{displayVal(ref.nombre, '________________________________________')}</td>
                                <td>{displayVal(ref.direccion, '________________________________________')}</td>
                                <td>{displayVal(ref.telefono, '________________')}</td>
                                <td>{displayVal(ref.celular, '________________')}</td>
                                <td>{displayVal(ref.relacion, '________________')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="section-header">7. Condiciones de Negociación Comercial</div>
                <table className="form-table">
                    <tbody>
                        <tr>
                            <td style={{ width: '20%' }}><b>Condición de Pago:</b></td>
                            <td colSpan={2}>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && !!paymentCond.consignacion} /> Consignación</span>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && !!paymentCond.transferencia} /> Transferencia Electrónica</span>
                                <span className="checkbox-container"><input type="checkbox" readOnly checked={!isBlankMode && !!paymentCond.cheque} /> Cheque</span>
                            </td>
                            <td style={{ width: '15%' }}><b>Plazo Aprobado:</b></td>
                            <td style={{ width: '15%', fontWeight: 'bold' }}>{isBlankMode ? '______' : (d.plazo_pago_dias || 0)} Días</td>
                        </tr>
                        <tr>
                            <td><b>Observaciones Pago:</b></td>
                            <td colSpan={4}>{displayVal(d.negociacion_dias_pago_soporte, '________________________________________')}</td>
                        </tr>
                    </tbody>
                </table>

                <div className="section-header">8. Declaraciones, Firmas y Autorizaciones</div>
                <div style={{ border: '1px solid #000', padding: '8px', fontSize: '7.5px', textAlign: 'justify', marginBottom: '8px' }}>
                    <b>Declaración de Origen de Recursos:</b> Yo, el abajo firmante, actuando en nombre propio y/o en representación de la persona jurídica solicitante, declaro de manera libre y voluntaria que los recursos que manejo provienen del giro ordinario de mis negocios lícitos ({displayVal(d.declaracion_origen_fondos_fuentes, 'Actividad comercial ordinaria')}), y no provienen de ninguna actividad ilegal contemplada en el código penal colombiano. Autorizo a <b>INVESTMENTS CORTES S.A.S.</b> a consultar ante las centrales de riesgo y bases de datos crediticias mi comportamiento financiero, comercial y de pago, así como el historial de las cuentas.
                </div>

                <table style={{ width: '100%' }}>
                    <tbody>
                        <tr>
                            <td style={{ width: '50%', paddingRight: '20px' }}>
                                <div style={{ borderBottom: '1px solid #000', height: '40px', marginTop: '20px' }}></div>
                                <div style={{ marginTop: '5px' }}>
                                    <b>Firma Representante Legal / Cliente</b><br />
                                    Nombre: {pagareDeudor.nombre}<br />
                                    NIT / C.C: {pagareDeudor.identificacion}
                                </div>
                            </td>
                            <td style={{ width: '50%', paddingLeft: '20px' }}>
                                <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                                    <div style={{ border: '1px solid #000', width: '60px', height: '70px', textAlign: 'center', fontSize: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                                        HUELLA INDICE<br />DERECHO
                                    </div>
                                    <div style={{ fontSize: '8px', flex: 1 }}>
                                        <b>Fecha de Firma:</b> {formatDate(d.pagare_fecha_firma)}<br />
                                        <b>Ciudad:</b> {displayVal(d.pagare_ciudad_firma, 'Cali')}
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* PAGE 3: PAGARÉ */}
            <div className="page-break" style={{ padding: '20px 30px', fontSize: '9.5px', lineHeight: '1.3' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '20px' }}>
                    <img src="/logo-investments.png" alt="Investments Cortés" style={{ height: '40px', objectFit: 'contain' }} />
                    <div style={{ textAlign: 'right' }}>
                        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>PAGARÉ</h2>
                        <div style={{ fontWeight: 'bold', fontSize: '12px' }}>PAGARÉ No. {displayVal(d.pagare_numero, '____________________')}</div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px', backgroundColor: '#f9f9f9', padding: '10px', border: '1px solid #ddd' }}>
                    <div>
                        <b>ACREEDOR:</b> INVESTMENTS CORTES S.A.S.<br />
                        <b>NIT:</b> 901.393.217-1
                    </div>
                    <div>
                        <b>DEUDOR / SOLICITANTE:</b> {displayVal(pagareDeudor.nombre, '________________________________')}<br />
                        <b>NIT / C.C:</b> {displayVal(pagareDeudor.identificacion, '____________________')}
                    </div>
                </div>

                <div style={{ textAlign: 'justify', marginBottom: '25px' }}>
                    <p>
                        <b>PRIMERO - OBJETO:</b> Que por virtud del presente título valor (Pagaré), me obligo (nos obligamos) a pagar solidaria e incondicionalmente a la orden de <b>INVESTMENTS CORTES S.A.S.</b>, o a quien sus derechos represente, en la ciudad de <b>{displayVal(d.pagare_ciudad_firma, 'Cali')}</b>, el día __________ del mes ____________________ del año __________, la suma de: ____________________________________________________________________________ ($______________________) moneda legal colombiana, más los intereses de ley a la tasa máxima permitida por la Superintendencia Financiera de Colombia.
                    </p>
                    <p>
                        <b>SEGUNDA - INTERESES MORATORIOS:</b> A partir del vencimiento de este Pagaré, reconoceré un interés moratorio a la tasa máxima autorizada por la ley mercantil aplicable.
                    </p>
                    <p>
                        <b>TERCERA - CLÁUSULA ACELERATORIA:</b> El tenedor de este Pagaré podrá declarar vencido el plazo y exigir el pago total de la obligación en caso de mora en el pago de facturas correspondientes a despachos de mercancía, giro de cheques sin provisión de fondos, o incumplimiento de cualquier otra obligación mercantil o tributaria.
                    </p>
                    <p>
                        <b>CUARTO:</b> Para constancia de lo anterior se firma y otorga el presente pagaré en la ciudad de <b>{displayVal(d.pagare_ciudad_firma, 'Cali')}</b>, hoy: {formatDate(d.pagare_fecha_firma)}.
                    </p>
                </div>

                {/* Signatures */}
                <table style={{ width: '100%', marginTop: '30px' }}>
                    <tbody>
                        <tr>
                            <td style={{ width: '50%', paddingRight: '20px', verticalAlign: 'top' }}>
                                <div style={{ borderTop: '1px solid #000', paddingTop: '10px' }}>
                                    <b>DEUDOR (FIRMA)</b><br />
                                    Nombre: {pagareDeudor.nombre}<br />
                                    C.C./NIT: {pagareDeudor.identificacion}<br />
                                    Dirección: {pagareDeudor.direccion || '____________________'}<br />
                                    Barrio: {pagareDeudor.barrio || '____________________'}<br />
                                    Teléfono / Celular: {pagareDeudor.celular || '____________________'}<br />
                                    Email: {pagareDeudor.email || '____________________'}
                                </div>
                            </td>
                            <td style={{ width: '50%', paddingLeft: '20px', verticalAlign: 'top' }}>
                                <div style={{ borderTop: '1px solid #000', paddingTop: '10px' }}>
                                    <b>CODEUDOR / GARANTE (FIRMA)</b><br />
                                    Nombre: {pagareCodeudor.nombre || '________________________________'}<br />
                                    C.C.: {pagareCodeudor.identificacion || '____________________'}<br />
                                    Dirección: {pagareCodeudor.direccion || '____________________'}<br />
                                    Barrio: {pagareCodeudor.barrio || '____________________'}<br />
                                    Teléfono / Celular: {pagareCodeudor.celular || '____________________'}<br />
                                    Email: {pagareCodeudor.email || '____________________'}
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* PAGE 4: CARTA DE INSTRUCCIONES */}
            <div className="page-break" style={{ padding: '20px 30px', fontSize: '9.5px', lineHeight: '1.3' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '20px' }}>
                    <img src="/logo-investments.png" alt="Investments Cortés" style={{ height: '40px', objectFit: 'contain' }} />
                    <div style={{ textAlign: 'right' }}>
                        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>CARTA DE INSTRUCCIONES</h2>
                        <div style={{ fontWeight: 'bold' }}>ANEXA AL PAGARÉ No. {displayVal(d.pagare_numero, '____________________')}</div>
                    </div>
                </div>

                <div style={{ textAlign: 'justify', marginBottom: '20px' }}>
                    <p>Señores:<br /><b>INVESTMENTS CORTES S.A.S.</b><br />Ciudad.</p>
                    <p>
                        Yo (Nosotros), <b>{displayVal(pagareDeudor.nombre, '________________________________')}</b>, identificado(s) como aparece al pie de mi (nuestras) firma(s), en calidad de Deudor(es), autorizo(amos) de manera expresa e irrevocable a <b>INVESTMENTS CORTES S.A.S.</b> para llenar los espacios que han sido dejados en blanco en el Pagaré adjunto, que he (hemos) firmado a su favor, con arreglo a las siguientes instrucciones:
                    </p>
                    <p>
                        <b>1. IMPORTE:</b> El importe del pagaré será igual al total de las obligaciones vigentes, exigibles y no pagadas que en cualquier momento tenga el deudor a favor de <b>INVESTMENTS CORTES S.A.S.</b> por concepto de compra de mercancías (frutas, verduras, procesados), facturas pendientes, intereses moratorios y gastos de cobranza.
                    </p>
                    <p>
                        <b>2. FECHA DE VENCIMIENTO:</b> La fecha de vencimiento será aquella que determine el acreedor <b>INVESTMENTS CORTES S.A.S.</b>, la cual corresponderá al día siguiente en el que ocurra la mora en el pago de una o más obligaciones.
                    </p>
                    <p>
                        <b>3. LUGAR DE PAGO:</b> El lugar de pago será la ciudad de <b>{displayVal(d.pagare_ciudad_firma, 'Cali')}</b> en las oficinas del acreedor.
                    </p>
                    <p>
                        Para constancia de lo anterior, se firma en la ciudad de <b>{displayVal(d.pagare_ciudad_firma, 'Cali')}</b>, hoy: {formatDate(d.pagare_fecha_firma)}.
                    </p>
                </div>

                {/* Signatures */}
                <table style={{ width: '100%', marginTop: '30px' }}>
                    <tbody>
                        <tr>
                            <td style={{ width: '50%', paddingRight: '20px', verticalAlign: 'top' }}>
                                <div style={{ borderTop: '1px solid #000', paddingTop: '10px' }}>
                                    <b>FIRMA DEL DEUDOR</b><br />
                                    Nombre: {pagareDeudor.nombre}<br />
                                    C.C./NIT: {pagareDeudor.identificacion}
                                </div>
                                <div style={{ border: '1px solid #000', width: '50px', height: '60px', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '6px', color: '#666', textAlign: 'center' }}>
                                    HUELLA INDICE<br />DERECHO
                                </div>
                            </td>
                            <td style={{ width: '50%', paddingLeft: '20px', verticalAlign: 'top' }}>
                                <div style={{ borderTop: '1px solid #000', paddingTop: '10px' }}>
                                    <b>FIRMA DEL CODEUDOR</b><br />
                                    Nombre: {pagareCodeudor.nombre || '____________________'}<br />
                                    C.C.: {pagareCodeudor.identificacion || '____________________'}
                                </div>
                                <div style={{ border: '1px solid #000', width: '50px', height: '60px', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '6px', color: '#666', textAlign: 'center' }}>
                                    HUELLA INDICE<br />DERECHO
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* PAGE 5: USO EXCLUSIVO Y DOCUMENTACIÓN */}
            <div style={{ padding: '8px 12px' }}>
                <div className="section-header" style={{ marginBottom: '15px' }}>8. Espacio Exclusivo de la Administración (Investments Cortés)</div>
                <table className="form-table">
                    <tbody>
                        <tr>
                            <td style={{ width: '30%' }}><b>Crédito Aprobado:</b></td>
                            <td style={{ width: '20%', fontWeight: 'bold' }}>{isBlankMode ? 'SÍ [ ] NO [ ]' : (d.credito_aprobado ? 'SÍ [X] NO [ ]' : 'SÍ [ ] NO [X]')}</td>
                            <td style={{ width: '20%' }}><b>Cupo Autorizado:</b></td>
                            <td style={{ width: '30%', fontWeight: 'bold', fontSize: '11px', color: THEME.colors.primary }}>{isBlankMode ? '____________________' : (d.cupo_aprobado ? `$${d.cupo_aprobado.toLocaleString('es-CO')}` : 'N/A')}</td>
                        </tr>
                        <tr>
                            <td><b>Plazo Aprobado:</b></td>
                            <td style={{ fontWeight: 'bold' }}>{isBlankMode ? '____________________' : (d.plazo_aprobado ? `${d.plazo_aprobado} Días` : 'N/A')}</td>
                            <td><b>Visto Bueno Comercial:</b></td>
                            <td>{displayVal(d.vo_bo, '____________________')}</td>
                        </tr>
                        <tr>
                            <td><b>Autorización Gerencia:</b></td>
                            <td colSpan={3}>{displayVal(d.autorizacion_gerencia, '____________________')}</td>
                        </tr>
                        <tr>
                            <td><b>Concepto Coord. Comercial:</b></td>
                            <td colSpan={3} style={{ height: '40px' }}>{displayVal(d.concepto_coordinador, '________________________________________')}</td>
                        </tr>
                        <tr>
                            <td><b>Observaciones Director:</b></td>
                            <td colSpan={3} style={{ height: '40px' }}>{displayVal(d.observaciones_director, '________________________________________')}</td>
                        </tr>
                    </tbody>
                </table>

                <div className="section-header" style={{ marginTop: '20px' }}>Lista de Documentos Requeridos</div>
                <table className="form-table">
                    <thead>
                        <tr>
                            <th style={{ width: '50%' }}>PERSONA NATURAL</th>
                            <th style={{ width: '50%' }}>PERSONA JURÍDICA</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                [ ] Copia de cédula de ciudadanía<br />
                                [ ] RUT actualizado<br />
                                [ ] Extractos bancarios últimos 3 meses<br />
                                [ ] Última declaración de renta<br />
                                [ ] Cámara de Comercio menor a 30 días<br />
                                [ ] Pagaré y Carta de instrucciones firmados
                            </td>
                            <td>
                                [ ] Copia de cédula del Representante Legal<br />
                                [ ] RUT actualizado de la empresa<br />
                                [ ] Cámara de Comercio menor a 30 días<br />
                                [ ] Estados Financieros del último período<br />
                                [ ] 2 Referencias comerciales recientes<br />
                                [ ] 1 Referencia bancaria<br />
                                [ ] Pagaré y Carta de instrucciones firmados
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
