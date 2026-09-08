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
            { code: 'corte_raspadura', label: 'Corte / Raspadura en corteza', typicalResponsible: 'picking', description: 'Heridas abiertas provocadas por herramientas, uñas o canastillas rotas.' }
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
        label: '6. Error en Montaje de Pedido (Ventas)',
        description: 'Inconsistencias al momento de capturar, digitar o programar la orden del cliente.',
        subtypes: [
            { code: 'sku_equivocado_captura', label: 'SKU o variedad errada en captura', typicalResponsible: 'comercial', description: 'Asesor digitó una variedad diferente a la solicitada por el cliente.' },
            { code: 'unidad_cantidad_errada', label: 'Unidad o cantidad digitada errada', typicalResponsible: 'comercial', description: 'Confusión entre caja, kilo o atado, o exceso de ceros en cantidad.' },
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

// Helpers to encode & decode RCA metadata from resolution notes/descriptions
// Ensuring 100% backward compatibility even before DB migrations are run
export function parseRcaFromRecord(record: any): {
    categoryL1: string;
    subtypeL2: string;
    responsible: 'proveedor' | 'bodega' | 'picking' | 'transporte' | 'comercial' | 'cliente' | 'no_definido';
    notes: string;
    isReplacementRejection: boolean;
} {
    // 1. Direct columns if present in DB
    if (record.defect_category_l1) {
        return {
            categoryL1: record.defect_category_l1,
            subtypeL2: record.defect_subtype_l2 || '',
            responsible: (record.imputed_responsible as any) || 'no_definido',
            notes: record.imputation_evidence_notes || '',
            isReplacementRejection: Boolean(record.is_replacement_rejection)
        };
    }

    // 2. Fallback to parsing embedded tags in resolution_notes or description
    const textToSearch = `${record.resolution_notes || ''} \n ${record.description || ''}`;
    const rcaMatch = textToSearch.match(/\[RCA_METADATA:\s*({.*?})\]/);
    if (rcaMatch && rcaMatch[1]) {
        try {
            const parsed = JSON.parse(rcaMatch[1]);
            return {
                categoryL1: parsed.categoryL1 || 'otro',
                subtypeL2: parsed.subtypeL2 || '',
                responsible: parsed.responsible || 'no_definido',
                notes: parsed.notes || '',
                isReplacementRejection: Boolean(parsed.isReplacementRejection)
            };
        } catch {
            // Ignore parse error and continue
        }
    }

    // Intelligent Heuristic Classification for legacy records without RCA tags
    const sub = (record.subject || '').toLowerCase();
    const desc = textToSearch.toLowerCase();
    const fullText = `${sub} ${desc}`;

    let inferredCatL1 = 'dano_mecanico';
    let inferredSubtype = 'golpe_magulladura';
    let inferredResponsible: any = 'transporte';

    if (fullText.includes('montaje') || fullText.includes('pedido errado') || fullText.includes('no pedí') || fullText.includes('no pedi') || fullText.includes('digit') || fullText.includes('precio incorrecto')) {
        inferredCatL1 = 'error_montaje_pedido';
        inferredSubtype = 'sku_equivocado_captura';
        inferredResponsible = 'comercial';
    } else if (fullText.includes('faltaron') || fullText.includes('faltante') || fullText.includes('incompleto') || fullText.includes('no me entregaron')) {
        inferredCatL1 = 'dano_mecanico';
        inferredSubtype = 'corte_raspadura';
        inferredResponsible = 'picking';
    } else if (fullText.includes('podr') || fullText.includes('moho') || fullText.includes('hongo') || fullText.includes('gusano') || fullText.includes('plaga') || fullText.includes('corazon negro')) {
        inferredCatL1 = 'fitopatologia';
        inferredSubtype = 'pudricion_origen';
        inferredResponsible = 'proveedor';
    } else if (fullText.includes('verde') || fullText.includes('madur') || fullText.includes('blando') || fullText.includes('mango') || fullText.includes('tommy') || fullText.includes('firmeza')) {
        inferredCatL1 = 'fisiologia_maduracion';
        inferredSubtype = 'sobremaduro_blando';
        inferredResponsible = 'bodega';
    } else if (fullText.includes('frio') || fullText.includes('frío') || fullText.includes('termic') || fullText.includes('térmic') || fullText.includes('quemad') || fullText.includes('deshidrat')) {
        inferredCatL1 = 'cadena_frio';
        inferredSubtype = 'dano_por_frio_ennegrecimiento';
        inferredResponsible = 'transporte';
    } else if (fullText.includes('calibre') || fullText.includes('pequeñ') || fullText.includes('tamaño') || fullText.includes('ceballa') || fullText.includes('cebolla')) {
        inferredCatL1 = 'calibre_especificacion';
        inferredSubtype = 'calibre_fuera_rango';
        inferredResponsible = 'proveedor';
    } else if (fullText.includes('cliente') || fullText.includes('menu') || fullText.includes('menú') || fullText.includes('local cerrado')) {
        inferredCatL1 = 'comercial_cliente';
        inferredSubtype = 'rechazo_subjetivo';
        inferredResponsible = 'cliente';
    } else if (sub.includes('[conductor]') || desc.includes('cancelación') || desc.includes('volcada')) {
        inferredCatL1 = 'dano_mecanico';
        inferredSubtype = 'aplastamiento_sobreestiba';
        inferredResponsible = 'transporte';
    }

    const isReplacement = (record.orders?.admin_notes || '').toLowerCase().includes('reposic') ||
                          fullText.includes('reposic') ||
                          fullText.includes('bucle') ||
                          fullText.includes('ping-pong');

    return {
        categoryL1: inferredCatL1,
        subtypeL2: inferredSubtype,
        responsible: inferredResponsible,
        notes: '',
        isReplacementRejection: isReplacement
    };
}

export function buildRcaMetadataTag(data: {
    categoryL1: string;
    subtypeL2: string;
    responsible: string;
    notes?: string;
    isReplacementRejection?: boolean;
}): string {
    const json = JSON.stringify({
        categoryL1: data.categoryL1,
        subtypeL2: data.subtypeL2,
        responsible: data.responsible,
        notes: data.notes || '',
        isReplacementRejection: Boolean(data.isReplacementRejection)
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
    textTemplate: string;
}

export const DISPOSICION_SANITARIA_TEMPLATES: SanitaryDisposalTemplate[] = [
    {
        id: 'destruccion_biologica',
        title: 'Baja Total / Destrucción Física (Contaminación / Moho)',
        icon: 'Trash2',
        category: 'destruccion',
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
        textTemplate: `[DISPOSICIÓN SANITARIA: APROVECHAMIENTO AGROECOLÓGICO / COMPOSTAJE]
- Dictamen: Merma vegetal vegetal limpia no apta para consumo, apta para reincorporación al ciclo de nutrientes.
- Acción: Trituración y almacenamiento en tolva de biodegradación.
- Destino final: Proveedor agroecológico aliado para generación de compost orgánico y lombricultura.
- Responsable de entrega: Líder de Economía Circular FruFresco.`
    }
];

