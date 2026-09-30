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
    } | null;
}

export const getClientInitials = (name?: string): string => {
    if (!name) return 'CL';
    const clean = name.trim();
    const parts = clean.split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
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
    const contact = p.profiles?.contact_name || 'Ecónomo / Contacto en Sitio';
    const nit = p.profiles?.nit || '';
    const email = p.profiles?.email || '';
    const rawPhone = p.profiles?.contact_phone || p.profiles?.phone || '';
    const phoneParsed = cleanColombianPhone(rawPhone);

    const clientDisplayName = contact && contact !== 'Ecónomo / Contacto en Sitio' && contact !== company ? contact : company;

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
            authorName: clientDisplayName,
            authorRole: `Ecónomo / Encargado de Compras (${company})`,
            authorInitials: getClientInitials(company),
            receptionChannel: 'Portal Institucional B2B (Radicación Digital Autogestión)',
            companyName: company,
            clientDisplayName,
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

export type WhatsAppPqrTemplateType = 'initial' | 'replacement' | 'credit_note' | 'closing';

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
        id: 'replacement',
        label: 'Reposición D+1 ($0 COP)',
        description: 'Confirmación directa de la reposición física en la próxima ruta.'
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

export const buildPqrWhatsAppMessage = (
    pqr: PQR, 
    templateType: WhatsAppPqrTemplateType = 'initial'
): string => {
    const author = getPqrAuthorInfo(pqr);
    const clientName = author.clientContact && author.clientContact !== 'Ecónomo / Contacto en Sitio' 
        ? author.clientContact 
        : author.clientDisplayName;
    
    const company = author.companyName && author.companyName !== 'Empresa No Especificada' && author.companyName !== clientName
        ? ` (${author.companyName})`
        : '';
        
    const orderSeq = pqr.orders?.sequence_id ? `Pedido #${pqr.orders.sequence_id}` : 'tu pedido';
    const subjectClean = (pqr.subject || '').replace(/^\[[^\]]+\]\s*/, '').trim() || 'Novedad de entrega/calidad';

    switch (templateType) {
        case 'replacement':
            return `Hola *${clientName}*${company} 👋, te saludamos de *FruFresco* 🌿.\n\nTe confirmamos que ya dejamos programada la *reposición sin costo ($0 COP)* correspondiente a tu *${orderSeq}* ("${subjectClean}") para tu próxima entrega en ruta.\n\n¡Seguimos atentos para apoyarte en lo que necesites!`;

        case 'credit_note':
            return `Hola *${clientName}*${company} 👋, te saludamos de *FruFresco* 🌿.\n\nTe confirmamos que ya aplicamos el *ajuste financiero / Nota Crédito* por la novedad en tu *${orderSeq}* ("${subjectClean}") a tu estado de cuenta.\n\n¡Cualquier duda adicional, con gusto te atendemos por aquí!`;

        case 'closing':
            return `Hola *${clientName}*${company} 👋, te saludamos de *FruFresco* 🌿.\n\nTe confirmamos que tu caso sobre el *${orderSeq}* ("${subjectClean}") ya quedó resuelto con éxito.\n\n¡Muchas gracias por tu confianza y que tengas un excelente día!`;

        case 'initial':
        default:
            if (pqr.orders?.sequence_id) {
                return `Hola *${clientName}*${company} 👋, te saludamos de *FruFresco* 🌿.\n\nYa tenemos tu caso sobre el *${orderSeq}* ("${subjectClean}") y estamos trabajando en darte una solución lo más pronto posible.\n\nTe mantendremos informado por este medio. ¡Muchas gracias por tu paciencia!`;
            } else {
                return `Hola *${clientName}*${company} 👋, te saludamos de *FruFresco* 🌿.\n\nYa tenemos tu caso ("${subjectClean}") y estamos trabajando en solucionarlo lo antes posible.\n\nTe mantendremos informado por este medio. ¡Muchas gracias por tu paciencia!`;
            }
    }
};
