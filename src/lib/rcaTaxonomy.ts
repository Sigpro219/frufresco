// ==============================================================================
// TAXONOMÍA TÉCNICA DE DESVIACIONES DE CALIDAD & MATRIZ DE IMPUTABILIDAD (LEAN)
// Ecosistema FruFresco - Frutas y Verduras Frescas
// ==============================================================================

export interface DefectSubtype {
    code: string;
    label: string;
    typicalResponsible: 'proveedor' | 'bodega' | 'picking' | 'transporte' | 'comercial' | 'cliente';
    description: string;
}

export interface DefectCategoryL1 {
    code: string;
    label: string;
    description: string;
    subtypes: DefectSubtype[];
}

export const RCA_CATEGORIES_L1: DefectCategoryL1[] = [
    {
        code: 'fisiologia_maduracion',
        label: '1. Fisiología & Maduración',
        description: 'Evolución biológica del fruto, estado de madurez o senescencia.',
        subtypes: [
            { code: 'sobremaduro_blando', label: 'Sobremaduro / Pérdida de firmeza', typicalResponsible: 'bodega', description: 'Producto pasado de punto, pulpa blanda o fermentada.' },
            { code: 'verde_inmaduro', label: 'Verde / Inmaduro fisiológicamente', typicalResponsible: 'proveedor', description: 'Cosechado prematuramente, no desarrollará maduración comercial.' },
            { code: 'senescencia_arrugamiento', label: 'Senescente / Envejecimiento celular', typicalResponsible: 'bodega', description: 'Pérdida de turgencia por tiempo excesivo de almacenamiento.' }
        ]
    },
    {
        code: 'dano_mecanico',
        label: '2. Daño Físico & Mecánico',
        description: 'Lesiones causadas por impacto, compresión o fricción durante la manipulación o transporte.',
        subtypes: [
            { code: 'aplastamiento_sobreestiba', label: 'Aplastamiento por sobrepeso/sobreestiba', typicalResponsible: 'transporte', description: 'Canastillas sobrecargadas o furgón mal estibado.' },
            { code: 'golpe_magulladura', label: 'Golpe / Magulladura por caída', typicalResponsible: 'transporte', description: 'Hematomas en pulpa por frenazos bruscos o manipulación en descarga.' },
            { code: 'corte_raspadura', label: 'Corte / Raspadura en corteza', typicalResponsible: 'picking', description: 'Heridas abiertas provocadas por herramientas, uñas o canastillas rotas.' },
            { code: 'faltante_pesaje_báscula', label: 'Faltante de Kilos en Báscula / Picking', typicalResponsible: 'picking', description: 'Diferencia física entre lo pesado en célula y lo recibido por el cliente.' }
        ]
    },
    {
        code: 'fitopatologia',
        label: '3. Fitopatología & Sanidad',
        description: 'Presencia de hongos, bacterias, insectos o vicios ocultos de campo.',
        subtypes: [
            { code: 'pudricion_origen', label: 'Pudrición / Moho / Botrytis de origen', typicalResponsible: 'proveedor', description: 'Esporas u hongos desarrollados desde el cultivo o cosecha.' },
            { code: 'plaga_insecto_visible', label: 'Plaga viva o larvas en producto', typicalResponsible: 'proveedor', description: 'Presencia de insectos o daños biológicos no detectados en muelle.' },
            { code: 'corazon_negro_interno', label: 'Defecto interno / Corazón negro oculto', typicalResponsible: 'proveedor', description: 'Problema fisiológico o fúngico no visible en piel externa.' }
        ]
    },
    {
        code: 'cadena_frio',
        label: '4. Cadena de Frío & Humedad',
        description: 'Alteraciones por choque térmico, temperatura inadecuada o deshidratación.',
        subtypes: [
            { code: 'dano_por_frio_ennegrecimiento', label: 'Daño por frío (Chilling Injury)', typicalResponsible: 'bodega', description: 'Ennegrecimiento de piel por temperatura inferior al límite biológico.' },
            { code: 'deshidratacion_marchitez', label: 'Deshidratación / Marchitez foliar', typicalResponsible: 'transporte', description: 'Pérdida de agua por ventilación caliente en ruta o demora extrema.' },
            { code: 'condensacion_excesiva', label: 'Condensación excesiva / Asfixia', typicalResponsible: 'bodega', description: 'Sudoración en bolsa que acelera pudrición bacteriana.' }
        ]
    },
    {
        code: 'calibre_especificacion',
        label: '5. Calibre & Especificación',
        description: 'Discrepancias entre la ficha técnica comercial acordada y el producto físico.',
        subtypes: [
            { code: 'calibre_fuera_rango', label: 'Calibre fuera de ficha técnica', typicalResponsible: 'proveedor', description: 'Piezas notablemente más pequeñas o más grandes que lo contratado.' },
            { code: 'coloracion_no_comercial', label: 'Coloración heterogénea / No comercial', typicalResponsible: 'proveedor', description: 'Fruta manchada o con porcentaje de coloración deficiente.' },
            { code: 'cepa_variedad_trocada', label: 'Variedad equivocada desde origen', typicalResponsible: 'proveedor', description: 'Producto clasificado bajo una variedad biológica distinta.' }
        ]
    },
    {
        code: 'error_montaje_pedido',
        label: '6. Error en Montaje & Alistamiento',
        description: 'Inconsistencias al capturar la orden o rotular/armar los pedidos en célula.',
        subtypes: [
            { code: 'sku_equivocado_captura', label: 'SKU o variedad errada en captura', typicalResponsible: 'comercial', description: 'Asesor digitó una variedad diferente a la solicitada por el cliente.' },
            { code: 'unidad_cantidad_errada', label: 'Unidad o cantidad digitada errada', typicalResponsible: 'comercial', description: 'Confusión entre caja, kilo o atado, o exceso de ceros en cantidad.' },
            { code: 'rotulado_célula_trocado', label: 'Rótulo o canastilla trocada en célula', typicalResponsible: 'picking', description: 'Canastilla rotulada o empacada cruzada para otro cliente.' },
            { code: 'sede_sucursal_trocada', label: 'Sede o sucursal de entrega trocada', typicalResponsible: 'comercial', description: 'Pedido asignado a la sede norte en lugar de la sede sur del cliente.' },
            { code: 'fecha_ventana_invalida', label: 'Fecha o franja de entrega incorrecta', typicalResponsible: 'comercial', description: 'Programado para un día de cierre o fuera de la ventana pactada.' },
            { code: 'precio_desacuerdo_comercial', label: 'Precio no acorde al acuerdo comercial', typicalResponsible: 'comercial', description: 'Facturación con precio estándar obviando el acuerdo pactado.' },
            { code: 'pedido_duplicado', label: 'Pedido duplicado en sistema', typicalResponsible: 'comercial', description: 'Doble radicación del mismo pedido por error de digitación.' }
        ]
    },
    {
        code: 'comercial_cliente',
        label: '7. Desviación Comercial / Cliente',
        description: 'Decisiones y circunstancias exclusivas del cliente donde el producto cumplía la norma.',
        subtypes: [
            { code: 'producto_agotado_plaza', label: 'Desabastecimiento en Plaza / Agotado Corabastos', typicalResponsible: 'proveedor', description: 'Producto no disponible en la central mayorista durante el abastecimiento nocturno.' },
            { code: 'sobrestock_cliente', label: 'Sobrestock o falta de nevera en cliente', typicalResponsible: 'cliente', description: 'Cliente recibió producto conforme pero no tiene capacidad de guarda.' },
            { code: 'cambio_menu_restaurante', label: 'Cambio de minuta / menú del chef', typicalResponsible: 'cliente', description: 'Cancelación de recetas o eventos propios del restaurante.' },
            { code: 'error_autogestion_cliente', label: 'Error propio del cliente en portal B2B', typicalResponsible: 'cliente', description: 'El ecónomo del cliente digitó mal la cantidad en su propia cuenta.' },
            { code: 'rechazo_subjetivo', label: 'Rechazo por criterio subjetivo', typicalResponsible: 'cliente', description: 'Criterio estético personal que no viola la ficha técnica pactada.' }
        ]
    }
];

export interface ResponsibleParty {
    code: 'proveedor' | 'bodega' | 'picking' | 'transporte' | 'comercial' | 'cliente';
    label: string;
    department: string;
    color: string;
    bgLight: string;
    border: string;
    description: string;
    operationalConsequence: string;
}

export const RESPONSIBLE_PARTIES: Record<string, ResponsibleParty> = {
    proveedor: {
        code: 'proveedor',
        label: 'Proveedor (Campo / Origen)',
        department: 'Compras & Abastecimiento',
        color: '#B45309', // Amber dark
        bgLight: '#FEF3C7',
        border: '#FDE68A',
        description: 'Vicio oculto, plaga o daño biológico proveniente del cultivo.',
        operationalConsequence: 'Genera Nota Débito al proveedor en Compras y penaliza su score de calidad.'
    },
    bodega: {
        code: 'bodega',
        label: 'Bodega (Almacenamiento)',
        department: 'Operaciones & Postcosecha',
        color: '#4338CA', // Indigo
        bgLight: '#EEF2FF',
        border: '#C7D2FE',
        description: 'Violación de rotación FIFO/FEFO, daño térmico en cámara o humedad inadecuada.',
        operationalConsequence: 'Se asienta como Merma Operativa de Bodega y audita el control de inventario.'
    },
    picking: {
        code: 'picking',
        label: 'Picking (Alistamiento)',
        department: 'Operaciones Bodega',
        color: '#7C3AED', // Purple
        bgLight: '#F5F3FF',
        border: '#DDD6FE',
        description: 'Producto visiblemente dañado despachado, mala estiba en canastilla o peso inexacto.',
        operationalConsequence: 'Incidencia directa para la cuadrilla de alistamiento y refuerzo de Poka-Yoke.'
    },
    transporte: {
        code: 'transporte',
        label: 'Transporte (Conductor / Flota)',
        department: 'Logística & Distribución',
        color: '#1D4ED8', // Blue
        bgLight: '#EFF6FF',
        border: '#BFDBFE',
        description: 'Canastillas volcadas, trato brusco en viaje o retraso extremo en la ventana de entrega.',
        operationalConsequence: 'Afecta la liquidación del flete y evalúa la ruta del transportista.'
    },
    comercial: {
        code: 'comercial',
        label: 'Comercial (Montaje de Pedido)',
        department: 'Ventas & KAMs',
        color: '#D97706', // Orange
        bgLight: '#FFFBEB',
        border: '#FDE68A',
        description: 'Digitación errónea de producto, cantidad, precio o sede en el pedido original.',
        operationalConsequence: 'Alimenta el indicador de error de captura en ventas y previene retrabajos logísticos.'
    },
    cliente: {
        code: 'cliente',
        label: 'Cliente (Comercial / Autogestión)',
        department: 'Relación con Cliente',
        color: '#4B5563', // Gray
        bgLight: '#F3F4F6',
        border: '#E5E7EB',
        description: 'Decisión unilateral del cliente o error propio en el portal web (producto conforme).',
        operationalConsequence: 'No castiga el OEE ni la calidad de FruFresco; se evalúa cobro de flete correctivo.'
    }
};

export interface ImputedEntity {
    id: string;
    name: string;
    documentId?: string;
    role?: string;
    entityType: 'provider' | 'employee' | 'driver' | 'sales_rep' | 'client';
    sharePercent: number; // 0 a 100
    deductionAmount?: number; // Valor en COP
    notes?: string;
    waiveDeduction?: boolean;
    assignedItemNames?: string[];
}

export interface ItemImputation {
    returnId: string;
    productId?: string;
    productName: string;
    quantity: number;
    unitOfMeasure?: string;
    unitPrice?: number;
    amount: number;
    categoryL1?: string;
    subtypeL2?: string;
    responsible: 'proveedor' | 'bodega' | 'picking' | 'transporte' | 'comercial' | 'cliente';
    imputedEntity?: ImputedEntity;
    notes?: string;
}

export interface ParsedRcaResult {
    categoryL1: string;
    subtypeL2: string;
    responsible: 'proveedor' | 'bodega' | 'picking' | 'transporte' | 'comercial' | 'cliente' | 'no_definido';
    notes: string;
    isReplacementRejection: boolean;
    isExplicitRca: boolean;
    imputedTargetType?: 'provider' | 'employee' | 'driver' | 'sales_rep' | 'client' | 'none';
    imputedEntities: ImputedEntity[];
    imputedEntityId?: string;
    imputedEntityName?: string;
    imputedEvidenceNotes?: string;
    auditedBy?: string;
    imputationMode?: 'global' | 'by_item';
    itemImputations?: ItemImputation[];
}

// Helpers to encode & decode RCA metadata from resolution notes/descriptions
// Robust extractor for [RCA_METADATA: {...}] tags supporting nested arrays/objects and escaping
export function extractRcaJsonFromText(text: string): any {
    if (!text) return null;
    const prefix = '[RCA_METADATA:';
    const found: any[] = [];
    let searchFrom = 0;

    while (searchFrom < text.length) {
        const idx = text.indexOf(prefix, searchFrom);
        if (idx === -1) break;

        const jsonStart = text.indexOf('{', idx);
        if (jsonStart === -1) break;

        let depth = 0;
        let inString = false;
        let escape = false;
        let parsed: any = null;

        for (let i = jsonStart; i < text.length; i++) {
            const char = text[i];
            if (escape) {
                escape = false;
                continue;
            }
            if (char === '\\') {
                escape = true;
                continue;
            }
            if (char === '"') {
                inString = !inString;
                continue;
            }
            if (!inString) {
                if (char === '{') {
                    depth++;
                } else if (char === '}') {
                    depth--;
                    if (depth === 0) {
                        const jsonStr = text.substring(jsonStart, i + 1);
                        try {
                            parsed = JSON.parse(jsonStr);
                        } catch {
                            // ignore
                        }
                        searchFrom = i + 1;
                        break;
                    }
                }
            }
        }

        if (parsed) {
            found.push(parsed);
        } else {
            searchFrom = idx + prefix.length;
        }
    }

    if (found.length === 0) return null;
    // Prefer entry that has populated imputedEntities, otherwise take the latest entry
    const withEntities = [...found].reverse().find(f => Array.isArray(f.imputedEntities) && f.imputedEntities.length > 0);
    return withEntities || found[found.length - 1];
}

export function stripRcaMetadataTags(text: string): string {
    if (!text) return '';
    let res = '';
    let i = 0;
    while (i < text.length) {
        const start = text.indexOf('[RCA_METADATA:', i);
        if (start === -1) {
            res += text.slice(i);
            break;
        }
        res += text.slice(i, start);
        let depth = 0;
        let inString = false;
        let escape = false;
        let tagEnd = -1;
        for (let j = start; j < text.length; j++) {
            const c = text[j];
            if (escape) { escape = false; continue; }
            if (c === '\\') { escape = true; continue; }
            if (c === '"') { inString = !inString; continue; }
            if (!inString) {
                if (c === '[') depth++;
                else if (c === ']') {
                    depth--;
                    if (depth === 0) {
                        tagEnd = j + 1;
                        break;
                    }
                }
            }
        }
        if (tagEnd !== -1) {
            i = tagEnd;
        } else {
            i = text.length;
        }
    }
    return res;
}

export function cleanHumanResolutionNotes(text: string): string {
    if (!text) return '';
    let cleaned = stripRcaMetadataTags(text);
    cleaned = cleaned.replace(/\[RESPONSABLE IMPUTADO:[^\n]+\]/gi, '');
    cleaned = cleaned.replace(/\[CONCEPTO:[^\n]+\]/gi, '');
    cleaned = cleaned.replace(/\[DISPOSICIÓN SANITARIA:[\s\S]*?(?=\n\s*\[|\n\n|$)/gi, '');
    cleaned = cleaned.replace(/\{"categoryL1"[\s\S]*?\}/gi, '');
    cleaned = cleaned.replace(/,?\\?"?imputedEntityId[\s\S]*?(?:\n|$)/gi, '');
    cleaned = cleaned.replace(/\\n/g, '\n');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

    return cleaned.trim();
}

export interface ParsedSanitaryAndHumanNotes {
    sanitaryTitle: string;
    sanitaryDetails: string[];
    commercialConcept: string;
    humanNotes: string;
}

export function parseSanitaryAndHumanNotes(text: string, rcaNotes?: string): ParsedSanitaryAndHumanNotes {
    let sanitaryTitle = '';
    let sanitaryDetails: string[] = [];
    let commercialConcept = '';
    let humanNotes = '';

    if (!text) return { sanitaryTitle, sanitaryDetails, commercialConcept, humanNotes };

    // 1. Extract Concept
    const conceptMatch = text.match(/\[CONCEPTO:\s*([^\]]+)\]/i);
    if (conceptMatch) {
        commercialConcept = conceptMatch[1].trim();
    }

    // 2. Extract Sanitary Disposal
    const dispMatch = text.match(/\[DISPOSICIÓN SANITARIA:\s*([^\]]+)\]([\s\S]*?)(?=\n\s*\[|$)/i);
    if (dispMatch) {
        sanitaryTitle = dispMatch[1].trim();
        const body = dispMatch[2].trim();
        sanitaryDetails = body.split('\n')
            .map(line => line.replace(/^[-*•]\s*/, '').trim())
            .filter(Boolean);
    }

    // 3. Extract remaining human notes outside of tags
    let cleaned = stripRcaMetadataTags(text);
    cleaned = cleaned.replace(/\[RESPONSABLE IMPUTADO:[^\n]+\]/gi, '');
    cleaned = cleaned.replace(/\[CONCEPTO:[^\n]+\]/gi, '');
    cleaned = cleaned.replace(/\[DISPOSICIÓN SANITARIA:[\s\S]*?(?=\n\s*\[|\n\n|$)/gi, '');
    cleaned = cleaned.replace(/\{"categoryL1"[\s\S]*?\}/gi, '');
    cleaned = cleaned.replace(/,?\\?"?imputedEntityId[\s\S]*?(?:\n|$)/gi, '');
    cleaned = cleaned.replace(/\\n/g, '\n');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

    humanNotes = cleaned;
    if (!humanNotes && rcaNotes && !rcaNotes.includes('[RCA_METADATA:') && !rcaNotes.includes('[DISPOSICIÓN')) {
        humanNotes = rcaNotes.trim();
    }

    return { sanitaryTitle, sanitaryDetails, commercialConcept, humanNotes };
}

// Helpers to encode & decode RCA metadata from resolution notes/descriptions
// Ensuring 100% backward compatibility even before DB migrations are run
export function parseRcaFromRecord(record: any): ParsedRcaResult {
    const orderNotesUpper = (record.orders?.admin_notes || '').toUpperCase();
    const isStructuralReplacementOrder = Boolean(record.is_replacement_rejection) ||
        orderNotesUpper.includes('[REPOSICIÓN DE GARANTÍA') ||
        orderNotesUpper.includes('[REPOSICION DE GARANTIA') ||
        orderNotesUpper.includes('[ANEXIÓN D+1') ||
        (record.orders?.origin_source === 'customer_service' && Number(record.orders?.total) === 0) ||
        (record.subject || '').toUpperCase().includes('PING-PONG') ||
        (record.description || '').toUpperCase().includes('ALERTA CORTE DE BUCLE');

    // 1. Prioritize embedded [RCA_METADATA: ...] tag in resolution_notes or description (most recent audit state)
    const textToSearch = `${record.resolution_notes || ''} \n ${record.description || ''}`;
    const parsed = extractRcaJsonFromText(textToSearch);
    if (parsed && (parsed.categoryL1 || parsed.subtypeL2 || parsed.responsible)) {
        const effectiveResp = parsed.responsible || record.imputed_responsible || 'no_definido';
        const entities: ImputedEntity[] = Array.isArray(parsed.imputedEntities) && parsed.imputedEntities.length > 0
            ? parsed.imputedEntities
            : (parsed.imputedEntityName || record.imputed_entity_name) ? [{
                id: parsed.imputedEntityId || record.imputed_entity_id || 'entity-1',
                name: parsed.imputedEntityName || record.imputed_entity_name,
                role: effectiveResp,
                entityType: parsed.imputedTargetType || (
                    effectiveResp === 'proveedor' ? 'provider' :
                    effectiveResp === 'transporte' ? 'driver' :
                    effectiveResp === 'comercial' ? 'sales_rep' :
                    effectiveResp === 'cliente' ? 'client' : 'employee'
                ),
                sharePercent: 100
            }] : [];

        return {
            categoryL1: parsed.categoryL1 || record.defect_category_l1 || 'no_clasificado',
            subtypeL2: parsed.subtypeL2 || record.defect_subtype_l2 || '',
            responsible: effectiveResp,
            notes: parsed.notes !== undefined ? parsed.notes : (record.imputation_evidence_notes || ''),
            isReplacementRejection: Boolean(parsed.isReplacementRejection) || isStructuralReplacementOrder,
            isExplicitRca: true,
            imputedTargetType: parsed.imputedTargetType || (
                effectiveResp === 'proveedor' ? 'provider' :
                effectiveResp === 'transporte' ? 'driver' :
                effectiveResp === 'comercial' ? 'sales_rep' :
                effectiveResp === 'cliente' ? 'client' : 'employee'
            ),
            imputedEntities: entities,
            imputedEntityId: entities[0]?.id || parsed.imputedEntityId || record.imputed_entity_id,
            imputedEntityName: entities.map(e => e.name).join(', ') || parsed.imputedEntityName || record.imputed_entity_name,
            imputedEvidenceNotes: parsed.imputedEvidenceNotes || parsed.notes || record.imputation_evidence_notes || '',
            auditedBy: parsed.auditedBy || undefined,
            imputationMode: parsed.imputationMode || (Array.isArray(parsed.itemImputations) && parsed.itemImputations.length > 0 ? 'by_item' : 'global'),
            itemImputations: Array.isArray(parsed.itemImputations) ? parsed.itemImputations : undefined
        };
    }

    // 2. Direct columns if present in DB (and no [RCA_METADATA] override exists)
    if (record.defect_category_l1) {
        let parsedEntities: ImputedEntity[] = [];
        if (record.imputed_entity_name) {
            parsedEntities = [{
                id: record.imputed_entity_id || 'entity-1',
                name: record.imputed_entity_name,
                role: record.imputed_responsible,
                entityType: record.imputed_responsible === 'proveedor' ? 'provider' : 
                            record.imputed_responsible === 'transporte' ? 'driver' : 
                            record.imputed_responsible === 'comercial' ? 'sales_rep' : 
                            record.imputed_responsible === 'cliente' ? 'client' : 'employee',
                sharePercent: 100
            }];
        }

        return {
            categoryL1: record.defect_category_l1,
            subtypeL2: record.defect_subtype_l2 || '',
            responsible: (record.imputed_responsible as any) || 'no_definido',
            notes: record.imputation_evidence_notes || '',
            isReplacementRejection: isStructuralReplacementOrder,
            isExplicitRca: true,
            imputedTargetType: record.imputed_responsible === 'proveedor' ? 'provider' : 
                               record.imputed_responsible === 'transporte' ? 'driver' : 
                               record.imputed_responsible === 'comercial' ? 'sales_rep' : 
                               record.imputed_responsible === 'cliente' ? 'client' : 'employee',
            imputedEntities: parsedEntities,
            imputedEntityId: record.imputed_entity_id,
            imputedEntityName: record.imputed_entity_name,
            imputedEvidenceNotes: record.imputation_evidence_notes,
            auditedBy: parsed?.auditedBy || undefined
        };
    }

    // 3. Fallback to parsing embedded tags in resolution_notes or description
    if (parsed) {
        const entities: ImputedEntity[] = Array.isArray(parsed.imputedEntities) ? parsed.imputedEntities : 
            (parsed.imputedEntityName ? [{
                id: parsed.imputedEntityId || 'legacy-1',
                name: parsed.imputedEntityName,
                role: parsed.responsible,
                entityType: parsed.imputedTargetType || 'employee',
                sharePercent: 100,
                deductionAmount: parsed.deductionAmount
            }] : []);

        const cleanNotes = cleanHumanResolutionNotes(parsed.notes || '');

        return {
            categoryL1: parsed.categoryL1 || 'otro',
            subtypeL2: parsed.subtypeL2 || '',
            responsible: parsed.responsible || 'no_definido',
            notes: cleanNotes,
            isReplacementRejection: isStructuralReplacementOrder,
            isExplicitRca: true,
            imputedTargetType: parsed.imputedTargetType,
            imputedEntities: entities,
            imputedEntityId: parsed.imputedEntityId,
            imputedEntityName: parsed.imputedEntityName,
            imputedEvidenceNotes: parsed.imputedEvidenceNotes ? cleanHumanResolutionNotes(parsed.imputedEvidenceNotes) : cleanNotes,
            auditedBy: parsed.auditedBy || undefined
        };
    }

    // Intelligent Heuristic Classification for legacy records without RCA tags
    const sub = (record.subject || '').toLowerCase();
    const desc = textToSearch.toLowerCase();
    const fullText = `${sub} ${desc}`;

    let inferredCatL1 = 'sin_clasificar';
    let inferredSubtype = 'pendiente_dictamen';
    let inferredResponsible: any = 'no_definido';

    if ( fullText.includes('magulla') || fullText.includes('golpe') || fullText.includes('aplastad') || fullText.includes('partid') || fullText.includes('volcad') || fullText.includes('reventad') ) {
        inferredCatL1 = 'dano_mecanico';
        inferredSubtype = 'golpe_magulladura';
        inferredResponsible = 'transporte';
    } else if (fullText.includes('faltaron') || fullText.includes('faltante') || fullText.includes('incompleto') || fullText.includes('no me entregaron') || fullText.includes('no me llegó') || fullText.includes('no me llego')) {
        inferredCatL1 = 'error_montaje_pedido';
        inferredSubtype = 'pedido_incompleto_faltante';
        inferredResponsible = 'picking';
    } else if (fullText.includes('montaje') || fullText.includes('pedido errado') || fullText.includes('no pedí') || fullText.includes('no pedi') || fullText.includes('digit') || fullText.includes('precio incorrecto')) {
        inferredCatL1 = 'error_montaje_pedido';
        inferredSubtype = 'sku_equivocado_captura';
        inferredResponsible = 'comercial';
    } else if (fullText.includes('podr') || fullText.includes('moho') || fullText.includes('hongo') || fullText.includes('gusano') || fullText.includes('plaga') || fullText.includes('corazon negro')) {
        inferredCatL1 = 'fitopatologia';
        inferredSubtype = 'pudricion_origen';
        inferredResponsible = 'proveedor';
    } else if (fullText.includes('frio') || fullText.includes('frío') || fullText.includes('termic') || fullText.includes('térmic') || fullText.includes('quemad') || fullText.includes('deshidrat')) {
        inferredCatL1 = 'cadena_frio';
        inferredSubtype = 'dano_por_frio_ennegrecimiento';
        inferredResponsible = 'transporte';
    } else if (fullText.includes('calibre') || fullText.includes('tamaño') || fullText.includes('pequeñ') || fullText.includes('grande')) {
        inferredCatL1 = 'calibre_especificacion';
        inferredSubtype = 'calibre_fuera_rango';
        inferredResponsible = 'proveedor';
    } else if (fullText.includes('madur') || fullText.includes('blando') || fullText.includes('firmeza') || fullText.includes('biche') || fullText.includes('inmadur') || fullText.includes('pintón') || fullText.includes('pinton')) {
        inferredCatL1 = 'fisiologia_maduracion';
        inferredSubtype = 'sobremaduro_blando';
        inferredResponsible = 'bodega';
    } else if (fullText.includes('agotado') || fullText.includes('no lo hay') || fullText.includes('desabastecimiento') || fullText.includes('quiebre en plaza') || fullText.includes('escasez') || fullText.includes('quiebre de abastecimiento')) {
        inferredCatL1 = 'comercial_cliente';
        inferredSubtype = 'producto_agotado_plaza';
        inferredResponsible = 'proveedor';
    } else if (fullText.includes('cliente') || fullText.includes('menu') || fullText.includes('menú') || fullText.includes('local cerrado')) {
        inferredCatL1 = 'comercial_cliente';
        inferredSubtype = 'rechazo_subjetivo';
        inferredResponsible = 'cliente';
    } else if (sub.includes('[conductor]') || desc.includes('cancelación')) {
        inferredCatL1 = 'dano_mecanico';
        inferredSubtype = 'aplastamiento_sobreestiba';
        inferredResponsible = 'transporte';
    }

    return {
        categoryL1: inferredCatL1,
        subtypeL2: inferredSubtype,
        responsible: inferredResponsible,
        notes: '',
        isReplacementRejection: isStructuralReplacementOrder,
        isExplicitRca: false,
        imputedEntities: []
    };
}

export function buildRcaMetadataTag(data: {
    categoryL1: string;
    subtypeL2: string;
    responsible: string;
    notes?: string;
    waiveDeduction?: boolean;
    isReplacementRejection?: boolean;
    imputedTargetType?: string;
    imputedEntities?: ImputedEntity[];
    imputedEntityId?: string;
    imputedEntityName?: string;
    imputedEvidenceNotes?: string;
    deductionAmount?: number;
    auditedBy?: string;
    imputationMode?: 'global' | 'by_item';
    itemImputations?: ItemImputation[];
}): string {
    const cleanNotes = (data.notes || '')
        .replace(/\[RCA_METADATA:[\s\S]*$/gi, '')
        .replace(/\[DISPOSICIÓN SANITARIA:[\s\S]*$/gi, '')
        .replace(/\[RESPONSABLE IMPUTADO:[^\n]+\]/gi, '')
        .replace(/\[CONCEPTO:[^\n]+\]/gi, '')
        .trim();

    const json = JSON.stringify({
        categoryL1: data.categoryL1,
        subtypeL2: data.subtypeL2,
        responsible: data.responsible,
        notes: cleanNotes,
        isReplacementRejection: Boolean(data.isReplacementRejection),
        imputedTargetType: data.imputedTargetType || 'none',
        imputedEntities: data.imputedEntities || [],
        imputedEntityId: data.imputedEntityId || '',
        imputedEntityName: data.imputedEntityName || '',
        imputedEvidenceNotes: data.imputedEvidenceNotes || '',
        deductionAmount: data.deductionAmount || 0,
        auditedBy: data.auditedBy || undefined,
        imputationMode: data.imputationMode || 'global',
        itemImputations: data.itemImputations || undefined
    });
    return `[RCA_METADATA: ${json}]`;
}

// ==============================================================================
// PERSISTENCIA Y PARAMETRIZACIÓN DE TAXONOMÍA TÉCNICA (LOCAL STORAGE + FALLBACK)
// ==============================================================================
export const TAXONOMY_STORAGE_KEY = 'frufresco_custom_rca_taxonomy';

export function getStoredTaxonomy(): DefectCategoryL1[] {
    if (typeof window === 'undefined') {
        return RCA_CATEGORIES_L1;
    }
    try {
        const raw = window.localStorage.getItem(TAXONOMY_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Error leyendo taxonomía personalizada:', e);
    }
    return RCA_CATEGORIES_L1;
}

export function saveStoredTaxonomy(categories: DefectCategoryL1[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(TAXONOMY_STORAGE_KEY, JSON.stringify(categories));
    } catch (e) {
        console.error('Error guardando taxonomía personalizada:', e);
    }
}

export function resetStoredTaxonomy(): DefectCategoryL1[] {
    if (typeof window !== 'undefined') {
        try {
            window.localStorage.removeItem(TAXONOMY_STORAGE_KEY);
        } catch (e) {
            console.error('Error restableciendo taxonomía:', e);
        }
    }
    return RCA_CATEGORIES_L1;
}

// ==============================================================================
// PLANTILLAS SUGERIDAS DE DISPOSICIÓN SANITARIA DE MERMA (BPM / INVIMA)
// ==============================================================================
export interface SanitaryDisposalTemplate {
    id: string;
    title: string;
    icon: string;
    category: 'destruccion' | 'transformacion' | 'donacion' | 'compostaje';
    summary?: string;
    textTemplate: string;
}

export const DISPOSICION_SANITARIA_TEMPLATES: SanitaryDisposalTemplate[] = [
    {
        id: 'producto_conforme_sin_baja',
        title: 'Producto Conforme / Aceptado por el Cliente (Sin Baja Sanitaria)',
        icon: 'ShieldCheck',
        category: 'destruccion',
        summary: 'El producto cumple el estándar de calidad acordado o fue aceptado en sitio sin descarte ni destrucción física.',
        textTemplate: `[DISPOSICIÓN SANITARIA: PRODUCTO CONFORME ACEPTADO EN SITIO (SIN BAJA SANITARIA)]
- Dictamen: Producto verificado conforme a los parámetros técnicos y organolépticos acordados.
- Acción: El cliente conserva y aprovecha el producto en su operación normal sin requerir baja ni destrucción física.
- Destino final: Consumo / aprovechamiento normal en sede del cliente.`
    },
    {
        id: 'disposicion_cliente_sin_retorno',
        title: 'Disposición en Sitio por el Cliente (Sin Retorno a Bodega)',
        icon: 'Store',
        category: 'destruccion',
        summary: 'El cliente realiza la baja física en sus instalaciones. Prohibido retorno en camión para prevenir contaminación cruzada.',
        textTemplate: `[DISPOSICIÓN SANITARIA: DISPOSICIÓN EN SITIO POR EL CLIENTE (SIN RETORNO A BODEGA)]
- Dictamen: Producto afectado descartado directamente en las instalaciones del cliente.
- Acción: El cliente asume la disposición/destrucción física en su cocina o mermas. Prohibido reingreso al vehículo para evitar contaminación cruzada en ruta de alimentos limpios.
- Destino final: Disposición final de residuos a cargo del cliente en su sede.
- Responsable: Jefe de Cocina / Administrador del Cliente, validado fotográficamente por SAC FruFresco.`
    },
    {
        id: 'destruccion_biologica',
        title: 'Baja Total / Destrucción Física en Bodega (Contaminación / Moho)',
        icon: 'Trash2',
        category: 'destruccion',
        summary: 'Invasión fúngica o putrefacción avanzada no apta para consumo. Segregación en merma no recuperable en cuarentena.',
        textTemplate: `[DISPOSICIÓN SANITARIA: BAJA TOTAL POR DESCOMPOSICIÓN / NULIDAD BIOLÓGICA]
- Dictamen: Producto con invasión fúngica / putrefacción avanzada no apto para consumo humano ni animal.
- Acción: Segregación inmediata en contenedor de merma no recuperable en zona de cuarentena.
- Destino final: Disposición municipal en ruta de recolección de residuos orgánicos / compostaje cerrado.
- Responsable de baja: Supervisor de Almacén y Control de Inocuidad FruFresco.`
    },
    {
        id: 'transformacion_industrial',
        title: 'Reclasificación para Transformación Secundaria (Pulpas / Salsas)',
        icon: 'Layers',
        category: 'transformacion',
        summary: 'Producto inocuo con defecto estético o golpe. Traslado a cámara de reproceso para despulpado o cocción.',
        textTemplate: `[DISPOSICIÓN SANITARIA: RECLASIFICACIÓN PARA TRANSFORMACIÓN INDUSTRIAL]
- Dictamen: Producto inocuo microbiológicamente pero con defecto estético, maduración avanzada o golpe mecánico.
- Acción: Traslado de canastillas a cámara de reproceso para canal de despulpado / cocción.
- Destino final: Venta como materia prima para elaboración de jugos, pulpas congeladas o mermeladas.
- Responsable de despacho: Líder de Planta y Comercial Industrial.`
    },
    {
        id: 'donacion_banco_alimentos',
        title: 'Donación a Banco de Alimentos (Inocuo / Calibre No Comercial)',
        icon: 'HeartHandshake',
        category: 'donacion',
        summary: 'Producto fresco con desviación de calibre o fecha límite HORECA. Entrega al Banco de Alimentos con acta social.',
        textTemplate: `[DISPOSICIÓN SANITARIA: ENTREGA EN DONACIÓN A BANCO DE ALIMENTOS]
- Dictamen: Producto 100% inocuo y fresco con desviación exclusiva en calibre o fecha límite comercial HORECA.
- Acción: Embalaje en canastillas de donación con acta de entrega social.
- Destino final: Banco de Alimentos de Bogotá / Fundación comunitaria aliada sin fines de lucro.
- Responsable de entrega: Coordinador de Logística y Responsabilidad Social FruFresco.`
    },
    {
        id: 'compostaje_agricola',
        title: 'Compostaje Agroecológico / Enmienda de Suelos',
        icon: 'Sparkles',
        category: 'compostaje',
        summary: 'Merma vegetal limpia no apta para consumo. Trituración y biodegradación en compost orgánico y lombricultura.',
        textTemplate: `[DISPOSICIÓN SANITARIA: APROVECHAMIENTO AGROECOLÓGICO / COMPOSTAJE]
- Dictamen: Merma vegetal vegetal limpia no apta para consumo, apta para reincorporación al ciclo de nutrientes.
- Acción: Trituración y almacenamiento en tolva de biodegradación.
- Destino final: Proveedor agroecológico aliado para generación de compost orgánico y lombricultura.
- Responsable de entrega: Líder de Economía Circular FruFresco.`
    }
];

