import React from 'react';

export interface PQR {
    id: string;
    client_id: string;
    order_id: string | null;
    type: 'queja' | 'reclamo' | 'peticion' | 'sugerencia' | 'felicitacion';
    category: 'producto' | 'entrega' | 'facturacion' | 'otro';
    subject: string;
    description: string;
    primary_photo_url: string | null;
    additional_photos: string[] | null;
    status: 'pending' | 'in_progress' | 'resolved' | 'rejected';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    created_at: string;
    resolved_at: string | null;
    resolution_notes: string | null;
    defect_category_l1?: string | null;
    defect_subtype_l2?: string | null;
    imputed_responsible?: string | null;
    imputation_evidence_notes?: string | null;
    is_replacement_rejection?: boolean | null;
    profiles?: {
        id?: string;
        company_name: string;
        contact_name: string;
        role: string;
        nit: string;
        email?: string;
        phone?: string;
        contact_phone?: string;
        corporate_role?: string;
    } | null;
    orders?: {
        id?: string;
        sequence_id: number;
        total: number;
        created_at: string;
        origin_source?: string;
        admin_notes?: string;
        shipping_address?: string;
        delivery_date?: string;
    } | null;
    sequence_number?: number;
}

export const formatPqrFolio = (pqr?: PQR | null): string => {
    if (!pqr) return 'SAC-0000';
    if (pqr.sequence_number && pqr.sequence_number > 0) {
        return `SAC-${String(pqr.sequence_number).padStart(4, '0')}`;
    }
    if (pqr.orders?.sequence_id) {
        return `SAC-${String(pqr.orders.sequence_id).padStart(4, '0')}`;
    }
    const numericHash = parseInt((pqr.id || '').replace(/[^0-9]/g, '').substring(0, 4) || '1', 10);
    return `SAC-${String(numericHash).padStart(4, '0')}`;
};

export const getClientInitials = (name?: string): string => {
    if (!name) return 'CL';
    const stopWords = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E', 'SAS', 'S.A.S.', 'S.A.', 'SA', 'LTDA', 'CIA']);
    const clean = name.trim().replace(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ0-9\s]/g, ' ');
    const parts = clean.split(/\s+/).filter(Boolean);
    const meaningful = parts.filter(w => !stopWords.has(w.toUpperCase()));
    const target = meaningful.length >= 2 ? meaningful : parts;
    if (target.length === 0) return 'CL';
    if (target.length === 1) return target[0].substring(0, 2).toUpperCase();
    return (target[0][0] + target[1][0]).toUpperCase();
};

export const formatCleanPqrSubject = (subject?: string | null): string => {
    if (!subject) return 'Sin asunto';
    const cleaned = subject
        .replace(/^(\[(?:Garant[ií]a Cliente|Portal B2B|Portal B2C|Tienda B2C|Conductor|Mesa SAC)\]\s*)+/gi, '')
        .replace(/\s*[-–•]\s*Pedido\s*#[A-Za-z0-9-]+.*$/i, '')
        .trim();
    return cleaned || subject;
};

export const getTypeBadgeStyle = (type: string) => {
    switch (type) {
        case 'reclamo':
            return { bg: '#FEF2F2', text: '#991B1B', border: '#FCA5A5', label: 'Reclamo' };
        case 'peticion':
            return { bg: '#F8FAFC', text: '#334155', border: '#CBD5E1', label: 'Petición' };
        case 'queja':
            return { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A', label: 'Queja' };
        case 'felicitacion':
            return { bg: '#EAEFEA', text: '#0D7A57', border: '#C4D7C4', label: 'Felicitación' };
        case 'sugerencia':
            return { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0', label: 'Sugerencia' };
        default:
            return { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0', label: type };
    }
};

export const formatDateFriendly = (dateStr: string): string => {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
    } catch {
        return dateStr;
    }
};

export const cleanColombianPhone = (phoneRaw?: string | null): { display: string; waNumber: string; isValid: boolean } => {
    if (!phoneRaw) return { display: '', waNumber: '', isValid: false };
    const digits = phoneRaw.replace(/\D/g, '');
    
    if (digits.startsWith('57') && digits.length === 12 && digits[2] === '3') {
        const local = digits.substring(2);
        return { display: local, waNumber: digits, isValid: true };
    }
    
    if (digits.length === 10 && digits.startsWith('3')) {
        return { display: digits, waNumber: `57${digits}`, isValid: true };
    }

    if (digits.length >= 7) {
        return { display: digits, waNumber: `57${digits}`, isValid: digits.length === 10 && digits.startsWith('3') };
    }
    
    return { display: '', waNumber: '', isValid: false };
};

export const getPqrPhotos = (p: PQR | null | undefined): string[] => {
    if (!p) return [];
    const photos: string[] = [];
    if (p.primary_photo_url && typeof p.primary_photo_url === 'string' && p.primary_photo_url.trim().length > 0) {
        photos.push(p.primary_photo_url.trim());
    }
    if (Array.isArray(p.additional_photos)) {
        p.additional_photos.forEach(url => {
            if (url && typeof url === 'string' && url.trim().length > 0 && !photos.includes(url.trim())) {
                photos.push(url.trim());
            }
        });
    }
    return photos;
};

export interface PqrAuthorInfo {
    channel: 'portal_b2b' | 'portal_b2c' | 'conductor' | 'mesa_ayuda';
    channelLabel: string;
    channelBadgeColor: string;
    channelBadgeBg: string;
    channelBadgeBorder: string;
    authorTitle: string;
    authorName: string;
    authorRole: string;
    authorInitials: string;
    receptionChannel: string;
    companyName: string;
    clientDisplayName: string;
    sedeOrBranch?: string;
    clientContact: string;
    nit: string;
    email: string;
    phone: string;
    phoneRaw: string;
    phoneParsed: { display: string; waNumber: string; isValid: boolean };
    isPhoneValid: boolean;
    isDriver: boolean;
    isClient: boolean;
    isColleagueLogged: boolean;
    colleagueName?: string;
}

export const getPqrAuthorInfo = (p: PQR): PqrAuthorInfo => {
    const subject = p.subject || '';
    const desc = p.description || '';
    const company = p.profiles?.company_name || 'Empresa No Especificada';

    // Extract filing contact & phone embedded in PQR description if present
    const filingContactMatch = desc.match(/•\s*Contacto de radicaci[oó]n:\s*([^\n]+?)(?:\s*\(Tel:\s*([0-9+\s-]+)\))?(?:\r?\n|$)/i);
    const extractedContact = filingContactMatch?.[1]?.trim() || '';
    const extractedPhone = filingContactMatch?.[2]?.trim() || '';

    const contact = extractedContact || p.profiles?.contact_name || 'Ecónomo / Contacto en Sitio';
    const nit = p.profiles?.nit || '';
    const email = p.profiles?.email || '';
    const rawPhone = extractedPhone || p.profiles?.contact_phone || p.profiles?.phone || '';
    const phoneParsed = cleanColombianPhone(rawPhone);

    const clientDisplayName = company && company !== 'Empresa No Especificada' ? company : contact;
    const sedeOrBranch = contact && contact !== 'Ecónomo / Contacto en Sitio' && contact !== clientDisplayName ? contact : undefined;

    // Explicit Collaborator
    const collabMatch = desc.match(/\[Radicado por Colaborador FruFresco:\s*([^\]]+)\]/i) || desc.match(/\[Radicado por:\s*([^\]]+)\]/i);
    if (collabMatch) {
        const collabRaw = collabMatch[1].trim();
        return {
            channel: 'mesa_ayuda',
            channelLabel: 'Módulo Operaciones / SAC',
            channelBadgeColor: '#7C3AED',
            channelBadgeBg: '#F3E8FF',
            channelBadgeBorder: '#DDD6FE',
            authorTitle: 'Radicado Internamente por FruFresco',
            authorName: collabRaw,
            authorRole: 'Equipo de Operaciones & Mesa de Experiencia FruFresco',
            authorInitials: getClientInitials(collabRaw.split('(')[0]),
            receptionChannel: 'Mesa de Ayuda / Chat Interno FruFresco',
            companyName: company,
            clientDisplayName,
            sedeOrBranch,
            clientContact: contact,
            nit,
            email,
            phone: phoneParsed.display || rawPhone,
            phoneRaw: rawPhone,
            phoneParsed,
            isPhoneValid: phoneParsed.isValid,
            isDriver: false,
            isClient: false,
            isColleagueLogged: true,
            colleagueName: collabRaw
        };
    }

    // Driver App
    if (subject.startsWith('[Conductor]') || desc.includes('El conductor reportó') || desc.includes('Cancelación total reportada por conductor')) {
        return {
            channel: 'conductor',
            channelLabel: 'App Móvil Conductor',
            channelBadgeColor: '#1D4ED8',
            channelBadgeBg: '#EFF6FF',
            channelBadgeBorder: '#BFDBFE',
            authorTitle: 'Novedad Reportada en Entrega Física',
            authorName: 'Conductor Asignado en Ruta',
            authorRole: 'Transportista de Última Milla — Logística FruFresco',
            authorInitials: 'TR',
            receptionChannel: 'App Móvil Conductor (Novedad en Sitio de Entrega)',
            companyName: company,
            clientDisplayName,
            sedeOrBranch,
            clientContact: contact,
            nit,
            email,
            phone: phoneParsed.display || rawPhone,
            phoneRaw: rawPhone,
            phoneParsed,
            isPhoneValid: phoneParsed.isValid,
            isDriver: true,
            isClient: false,
            isColleagueLogged: false
        };
    }

    // B2B Portal
    if (subject.startsWith('[Portal B2B]') || desc.includes('Reporte de autoservicio B2B')) {
        return {
            channel: 'portal_b2b',
            channelLabel: 'Portal Autogestión B2B',
            channelBadgeColor: '#047857',
            channelBadgeBg: '#ECFDF5',
            channelBadgeBorder: '#A7F3D0',
            authorTitle: 'Radicado Directamente por Cliente B2B',
            authorName: contact || clientDisplayName,
            authorRole: `Ecónomo / Encargado de Compras (${company})`,
            authorInitials: getClientInitials(company),
            receptionChannel: 'Portal Institucional B2B (Radicación Digital Autogestión)',
            companyName: company,
            clientDisplayName,
            sedeOrBranch,
            clientContact: contact,
            nit,
            email,
            phone: phoneParsed.display || rawPhone,
            phoneRaw: rawPhone,
            phoneParsed,
            isPhoneValid: phoneParsed.isValid,
            isDriver: false,
            isClient: true,
            isColleagueLogged: false
        };
    }

    // B2C Portal
    if (subject.startsWith('[Portal B2C]') || subject.startsWith('[Tienda B2C]') || desc.includes('Reporte de autoservicio B2C') || desc.includes('Reporte Tienda Online B2C')) {
        const b2cName = contact || company || 'Cliente Consumidor Final';
        return {
            channel: 'portal_b2c',
            channelLabel: 'Tienda Online B2C',
            channelBadgeColor: '#2563EB',
            channelBadgeBg: '#EFF6FF',
            channelBadgeBorder: '#BFDBFE',
            authorTitle: 'Radicado por Cliente B2C (Tienda Online)',
            authorName: b2cName,
            authorRole: 'Cliente Consumidor Final (E-Commerce FruFresco)',
            authorInitials: getClientInitials(b2cName),
            receptionChannel: 'Tienda Web E-Commerce B2C (Autogestión)',
            companyName: company,
            clientDisplayName: b2cName,
            sedeOrBranch: company && company !== b2cName && company !== 'Empresa No Especificada' ? company : undefined,
            clientContact: contact,
            nit,
            email,
            phone: phoneParsed.display || rawPhone,
            phoneRaw: rawPhone,
            phoneParsed,
            isPhoneValid: phoneParsed.isValid,
            isDriver: false,
            isClient: true,
            isColleagueLogged: false
        };
    }

    // Mesa de Ayuda SAC (Default)
    return {
        channel: 'mesa_ayuda',
        channelLabel: 'Mesa de Ayuda SAC',
        channelBadgeColor: '#7C3AED',
        channelBadgeBg: '#F3E8FF',
        channelBadgeBorder: '#DDD6FE',
        authorTitle: 'Radicado Internamente en Mesa SAC',
        authorName: 'Mesa de Experiencia FruFresco',
        authorRole: 'Gestión de Calidad & No Conformidades FruFresco',
        authorInitials: 'SAC',
        receptionChannel: 'Llamada Telefónica / WhatsApp Directo SAC',
        companyName: company,
        clientDisplayName,
        sedeOrBranch,
        clientContact: contact,
        nit,
        email,
        phone: phoneParsed.display || rawPhone,
        phoneRaw: rawPhone,
        phoneParsed,
        isPhoneValid: phoneParsed.isValid,
        isDriver: false,
        isClient: false,
        isColleagueLogged: false
    };
};

export const getReplacementOrderUrl = (
    pqr: PQR | null | undefined, 
    selItemId?: string | null, 
    items: any[] = [], 
    novQty: number = 0
): string => {
    if (!pqr) return '/admin/orders/create';
    const params = new URLSearchParams();
    if (pqr.client_id) params.set('clientId', pqr.client_id);
    params.set('type', pqr.profiles?.role === 'b2c_client' ? 'B2C' : 'B2B');
    params.set('pqrId', pqr.id);
    params.set('replacement', 'true');

    const selItem = items.find(i => i.id === selItemId);
    if (selItem && selItem.products) {
        params.set('productId', selItem.product_id);
        params.set('productQuery', selItem.products.name || '');
        params.set('quantity', String(novQty > 0 ? novQty : selItem.quantity || 1));
    } else {
        const combined = `${pqr.subject || ''} ${pqr.description || ''}`;
        const qtyMatch = combined.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?|kls?|und|unidades?|libras?|paquetes?|bolsas?)/i);
        if (qtyMatch) {
            params.set('quantity', qtyMatch[1].replace(',', '.'));
        }
        const cleanKeyword = (pqr.subject || '')
            .replace(/\[[^\]]+\]/g, '')
            .replace(/(de mala calidad|mala calidad|calidad|averiado|averia|danado|dano|dañado|daño|faltante|reclamo|queja|novedad|en mal estado|mal estado|podrido|inconforme|no llego|no llego el|no llegaron)/gi, '')
            .trim();
        if (cleanKeyword) {
            params.set('productQuery', cleanKeyword);
        }
    }
    const shortId = pqr.id ? pqr.id.substring(0, 8) : '';
    params.set('notes', `Reposición de garantía $0 COP autorizada por PQR #${shortId} (${pqr.subject || ''})`);
    return `/admin/orders/create?${params.toString()}`;
};

export type WhatsAppPqrTemplateType = 
    | 'initial' 
    | 'replacement' 
    | 'credit_note' 
    | 'closing'
    | 'shortage_substitution'
    | 'shortage_autorelease';

export interface WhatsAppTemplateOption {
    id: WhatsAppPqrTemplateType;
    label: string;
    description: string;
    icon?: string;
}

export const WHATSAPP_PQR_TEMPLATES: WhatsAppTemplateOption[] = [
    {
        id: 'initial',
        label: 'Caso Recibido & En Proceso',
        description: 'Mensaje ágil de tranquilidad confirmando que el caso ya se está gestionando.'
    },
    {
        id: 'shortage_substitution',
        label: 'Propuesta Sustitución HORECA (Quiebre Plaza)',
        description: 'Notificación ágil al chef proponiendo un SKU sustituto o retiro antes del despacho.'
    },
    {
        id: 'shortage_autorelease',
        label: 'Aviso Despacho Puntual (Auto-Retiro)',
        description: 'Aviso de salida en ruta protegiendo la puntualidad con remisión depurada.'
    },
    {
        id: 'replacement',
        label: 'Reposición Física ($0 COP)',
        description: 'Confirmación directa de la fecha y productos de reposición sin costo.'
    },
    {
        id: 'credit_note',
        label: 'Nota Crédito / Saldo a Favor',
        description: 'Confirmación de la aplicación del saldo a favor en cuenta.'
    },
    {
        id: 'closing',
        label: 'Caso Resuelto',
        description: 'Notificación de caso finalizado con éxito.'
    }
];

export interface ShortageTimeoutInfo {
    isShortage: boolean;
    minutesRemaining: number;
    isExpired: boolean;
    formattedCountdown: string;
    deadlineText: string;
}

export const getShortageTimeoutInfo = (pqr: PQR | null | undefined): ShortageTimeoutInfo => {
    if (!pqr) {
        return { isShortage: false, minutesRemaining: 0, isExpired: false, formattedCountdown: '--:--', deadlineText: '' };
    }

    const isShortage = pqr.defect_subtype_l2 === 'producto_agotado_plaza' ||
        (pqr.subject || '').includes('Quiebre en Plaza') ||
        (pqr.description || '').includes('ESCASEZ EN PLAZA') ||
        (pqr.description || '').includes('Agotado en plaza');

    if (!isShortage) {
        return { isShortage: false, minutesRemaining: 0, isExpired: false, formattedCountdown: '--:--', deadlineText: '' };
    }

    const createdAt = new Date(pqr.created_at).getTime();
    const timeoutDurationMs = 30 * 60 * 1000; // 30 minutos de SLA para consulta
    const deadlineMs = createdAt + timeoutDurationMs;
    const now = Date.now();
    const diffMs = deadlineMs - now;

    if (diffMs <= 0 || pqr.status === 'resolved' || pqr.status === 'rejected') {
        return {
            isShortage: true,
            minutesRemaining: 0,
            isExpired: true,
            formattedCountdown: '00:00',
            deadlineText: 'Ventana de consulta expirada (Auto-Liberación Poka-Yoke)'
        };
    }

    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    const formattedCountdown = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    return {
        isShortage: true,
        minutesRemaining: minutes,
        isExpired: false,
        formattedCountdown,
        deadlineText: `${minutes}m restantes para autorizar sustitución antes de salida de ruta`
    };
};

/**
 * Extrae de forma limpia el nombre del producto, la cantidad reclamada y el folio del pedido
 * para que las plantillas de WhatsApp suenen humanas y no repitan el asunto crudo de la PQR.
 */
const extractPqrNarrativeContext = (pqr: PQR) => {
    const author = getPqrAuthorInfo(pqr);
    const rawContact = author.clientContact && author.clientContact !== 'Ecónomo / Contacto en Sitio'
        ? author.clientContact
        : author.clientDisplayName;

    // Evitar doble paréntesis consecutivo: "Claudia Rincón (Supervisora...) (EMPRESA)"
    const cleanPersonName = rawContact.replace(/\s*\([^)]*\)\s*/g, '').trim() || rawContact;

    const company = author.companyName && author.companyName !== 'Empresa No Especificada' && author.companyName !== cleanPersonName
        ? ` (${author.companyName})`
        : '';

    const desc = pqr.description || '';
    const subj = pqr.subject || '';

    // 1. Extraer producto real desde "Producto: X" en descripción o limpiando el asunto
    const prodMatch = desc.match(/Producto:\s*([^•\n]+)/i);
    let productName = prodMatch ? prodMatch[1].trim() : '';

    if (!productName) {
        productName = subj
            .replace(/^\[[^\]]+\]\s*/g, '')
            .replace(/^(Reclamo en|Faltante de|Avería en|Novedad en|Quiebre en Plaza:?)\s*/i, '')
            .replace(/\s*[-–•]\s*Pedido\s*#[A-Za-z0-9-]+.*$/i, '')
            .trim();
    }
    if (!productName) {
        productName = 'el producto reportado';
    }

    // 2. Extraer cantidad afectada si está declarada en la descripción (ej. "Cantidad: 4 Kg")
    const qtyMatch = desc.match(/Cantidad:\s*([0-9.,]+\s*[A-Za-z]+)/i);
    const qtyLabel = qtyMatch ? qtyMatch[1].trim() : '';
    const productWithQty = qtyLabel ? `${productName} (${qtyLabel})` : productName;

    // 3. Extraer folio limpio del pedido
    const subjOrderMatch = subj.match(/#(?:REM-)?(\d+)/i);
    const orderNumber = pqr.orders?.sequence_id || (subjOrderMatch ? subjOrderMatch[1] : null);
    const orderSeq = orderNumber ? `Pedido #${orderNumber}` : 'tu pedido';

    return {
        cleanPersonName,
        company,
        productName,
        qtyLabel,
        productWithQty,
        orderNumber,
        orderSeq
    };
};

export const buildShortageWhatsAppMessage = (
    pqr: PQR,
    originalProduct?: string,
    suggestedSubstitute: string = 'una variedad equivalente de primera calidad',
    timeoutMinutes: number = 30
): string => {
    const ctx = extractPqrNarrativeContext(pqr);
    const targetProduct = originalProduct && !originalProduct.toLowerCase().includes('reclamo en') && !originalProduct.toLowerCase().includes('pedido #')
        ? originalProduct
        : ctx.productName;

    return `Hola ${ctx.cleanPersonName}${ctx.company}, te saludamos del equipo de Calidad de FruFresco.\n\nDurante nuestro abastecimiento de la madrugada en Corabastos, identificamos que ${targetProduct} para tu ${ctx.orderSeq} no cumplió nuestro estándar de selección y no hubo disponibilidad óptima en plaza.\n\nPara proteger tu operación de hoy te proponemos tres opciones:\n\n1. Sustitución inmediata: Enviarte ${suggestedSubstitute} alistado en bodega.\n2. Retiro limpio: Excluir el producto de la remisión sin ningún cobro en tu factura.\n3. Entrega en próximo pedido: Enviártelo consolidado en tu siguiente despacho programado.\n\nAgradecemos tu confirmación en los próximos ${timeoutMinutes} minutos para despachar tu ruta a tiempo.\n\n¡Quedamos atentos a tu indicación!`;
};

export const buildPqrWhatsAppMessage = (
    pqr: PQR, 
    templateType: WhatsAppPqrTemplateType = 'initial',
    replacementConfig?: { deliveryDate?: string; deliverySlot?: string; itemsSummary?: string }
): string => {
    const ctx = extractPqrNarrativeContext(pqr);

    switch (templateType) {
        case 'shortage_substitution':
            return buildShortageWhatsAppMessage(pqr, ctx.productName, 'una variedad equivalente de primera calidad', 30);

        case 'shortage_autorelease':
            return `Hola ${ctx.cleanPersonName}${ctx.company}, te saludamos del equipo de Calidad de FruFresco.\n\nPara garantizar que tu ${ctx.orderSeq} llegue puntualmente dentro de la franja horaria de tu cocina, despachamos tu ruta a tiempo retirando ${ctx.productName} de la remisión de hoy por no contar con calidad óptima en plaza.\n\nTu factura reflejará únicamente los productos efectivamente entregados, sin cobros por este ítem.\n\n¡Gracias por tu comprensión y que tengas un excelente servicio!`;

        case 'replacement': {
            const repItemsLabel = replacementConfig?.itemsSummary || ctx.productWithQty;
            const slotSuffix = replacementConfig?.deliverySlot
                ? (replacementConfig.deliverySlot === 'AM' || replacementConfig.deliverySlot === 'PM'
                    ? ` (Franja ${replacementConfig.deliverySlot})`
                    : ` (${replacementConfig.deliverySlot})`)
                : '';
            const repDateLabel = replacementConfig?.deliveryDate
                ? `para entrega el ${replacementConfig.deliveryDate}${slotSuffix}`
                : 'la cual será entregada en tu próxima ruta de despacho';
            return `Hola ${ctx.cleanPersonName}${ctx.company}, te saludamos del equipo de Calidad de FruFresco.\n\nTe confirmamos que ya dejamos programada sin costo ($0 COP) la reposición de ${repItemsLabel} correspondiente al ${ctx.orderSeq}, ${repDateLabel}.\n\n¡Seguimos atentos para apoyarte en lo que necesites!`;
        }

        case 'credit_note':
            return `Hola ${ctx.cleanPersonName}${ctx.company}, te saludamos del equipo de Calidad de FruFresco.\n\nTe confirmamos que ya aplicamos la Nota Crédito (saldo a favor) en tu estado de cuenta por la novedad reportada en ${ctx.productWithQty} del ${ctx.orderSeq}.\n\n¡Cualquier duda adicional, con gusto te atendemos por este medio!`;

        case 'closing':
            return `Hola ${ctx.cleanPersonName}${ctx.company}, te saludamos del equipo de Calidad de FruFresco.\n\nTe confirmamos que tu reporte sobre ${ctx.productWithQty} del ${ctx.orderSeq} ya quedó gestionado y resuelto con éxito.\n\n¡Muchas gracias por tu confianza y que tengas un excelente día!`;

        case 'initial':
        default:
            return `Hola ${ctx.cleanPersonName}${ctx.company}, te saludamos del equipo de Calidad de FruFresco.\n\nHemos recibido tu reporte sobre ${ctx.productWithQty} en el ${ctx.orderSeq}. Nuestro equipo ya está revisando el caso para darte una solución oportuna.\n\nTe mantendremos informado por este medio. ¡Muchas gracias por tu colaboración!`;
    }
};

/**
 * Genera una respuesta ejecutiva y corta para el cliente por WhatsApp explicando exactamente lo sucedido con su caso.
 */
export const buildCaseResolutionWhatsAppSummary = (pqr: PQR): string => {
    const ctx = extractPqrNarrativeContext(pqr);
    const notes = (pqr.resolution_notes || '').toLowerCase();

    // 1. Escenario 1: Cerrado Conforme / Rechazo de solicitud sin impacto comercial
    if (
        pqr.status === 'rejected' ||
        notes.includes('cerrado conforme') ||
        notes.includes('rechazo de solicitud') ||
        notes.includes('desestimado') ||
        notes.includes('archivado sin costo')
    ) {
        return `Hola ${ctx.cleanPersonName}${ctx.company}, te saludamos del equipo de Calidad de FruFresco.\n\nRevisamos tu reporte sobre ${ctx.productWithQty} del ${ctx.orderSeq}. Tras la validación de Calidad, te confirmamos que la entrega fue verificada conforme al estándar comercial pactado, por lo que el caso se da por concluido sin alteraciones en tu facturación.\n\n¡Agradecemos tu retroalimentación y seguimos atentos a apoyarte!`;
    }

    // 2. Escenario 2: Reposición D+1 ($0 COP)
    if (
        notes.includes('reponer d+1') ||
        notes.includes('reposición') ||
        notes.includes('reposicion') ||
        notes.includes('folio #')
    ) {
        return `Hola ${ctx.cleanPersonName}${ctx.company}, te saludamos del equipo de Calidad de FruFresco.\n\nSobre la novedad reportada en ${ctx.productWithQty} del ${ctx.orderSeq}, te confirmamos que nuestro equipo de Calidad aprobó y programó la reposición sin costo ($0 COP) para ser entregada en tu próxima ruta de despacho.\n\n¡Gracias por tu confianza y seguimos a tu servicio!`;
    }

    // 3. Escenario 3: Nota Crédito
    if (
        notes.includes('nota crédito') ||
        notes.includes('nota credito') ||
        notes.includes('saldo a favor')
    ) {
        return `Hola ${ctx.cleanPersonName}${ctx.company}, te saludamos del equipo de Calidad de FruFresco.\n\nSobre la novedad reportada en ${ctx.productWithQty} del ${ctx.orderSeq}, te informamos que Calidad autorizó una Nota Crédito (saldo a favor) en tu cuenta por el valor correspondiente. Tu estado de cuenta ya refleja este ajuste.\n\n¡Gracias por tu confianza!`;
    }

    // 4. Escenario 4: Ajuste de Factura
    if (
        notes.includes('ajuste de factura') ||
        notes.includes('ajuste en factura')
    ) {
        return `Hola ${ctx.cleanPersonName}${ctx.company}, te saludamos del equipo de Calidad de FruFresco.\n\nSobre la novedad reportada en ${ctx.productWithQty} del ${ctx.orderSeq}, te confirmamos que realizamos el ajuste directo en tu factura descontando el valor correspondiente, para que tu cobro coincida exactamente con lo recibido.\n\n¡Gracias por tu comprensión!`;
    }

    // 5. Caso Resuelto Genérico
    if (pqr.status === 'resolved') {
        return `Hola ${ctx.cleanPersonName}${ctx.company}, te saludamos del equipo de Calidad de FruFresco.\n\nTe confirmamos que la novedad sobre ${ctx.productWithQty} del ${ctx.orderSeq} fue gestionada y cerrada exitosamente por nuestro equipo de Calidad.\n\n¡Muchas gracias y seguimos a tu entera disposición!`;
    }

    // 6. Caso Pendiente / En Gestión
    return `Hola ${ctx.cleanPersonName}${ctx.company}, te saludamos del equipo de Calidad de FruFresco.\n\nRecibimos tu reporte sobre ${ctx.productWithQty} del ${ctx.orderSeq}. Nuestro equipo de Calidad ya lo está gestionando para brindarte una solución oportuna.\n\n¡Te mantendremos informado!`;
};


