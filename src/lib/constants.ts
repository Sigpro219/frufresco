
export const CATEGORY_MAP: Record<string, string> = {
    'FR': 'Frutas',
    'VE': 'Verduras',
    'TU': 'Tubérculos',
    'HO': 'Hortalizas',
    'LA': 'Lácteos',
    'DE': 'Despensa',
    'CO': 'Congelados',
    'PR': 'Procesados'
};

// Business Logic Cutoff Rules
export const DEFAULT_CUTOFF_HOUR = 17; // 5:00 PM - Sale cut for tomorrow delivery
export const ADMIN_EDIT_CUTOFF_HOUR = 20; // 8:00 PM - Admin edit lock for next day delivery


export const REVERSE_CATEGORY_MAP: Record<string, string> = {
    'Frutas': 'FR',
    'Vegetales': 'VE',  // legacy alias
    'Verduras': 'VE',
    'Tubérculos': 'TU',
    'Hortalizas': 'HO',
    'Lácteos': 'LA',
    'Despensa': 'DE',
    'Congelados': 'CO',
    'Procesados': 'PR'
};

// --- SUBTIPOS DE MOVIMIENTOS & MERMAS LEAN (Auditoría 24 Columnas) ---
export const INVENTORY_MOVEMENT_SUBTYPES = {
    WASTE_DAMAGE: 'waste_damage',           // Desperdicio
    WASTE_CLEANING: 'waste_cleaning',       // Basura / Descapote
    WASTE_WEIGHING: 'waste_weighing',       // Pesada
    FOOD_BANK: 'food_bank',                 // Banco de alimentos
    EMPLOYEE_SALE: 'employee_sale',         // Venta a empleado
    ORDER_SHORTAGE: 'order_shortage',       // Producto escaso
    ORDER_UNSHIPPED: 'order_unshipped',     // Producto sin enviar
    ADDITIONAL_SALE: 'additional_sale',     // Venta adicional cliente
    BLIND_COUNT: 'blind_count_shift_close', // Conteo físico bodega
    CORRECTION: 'correction'                // Corrección de inventario
} as const;

export const INVENTORY_SUBTYPE_LABELS: Record<string, { label: string; icon: string; requiresPhoto: boolean; operation: 'add' | 'subtract' | 'adjust' }> = {
    waste_damage: { label: 'Desperdicio / Avería', icon: 'Trash2', requiresPhoto: true, operation: 'subtract' },
    waste_cleaning: { label: 'Basura / Descapote', icon: 'Brush', requiresPhoto: true, operation: 'subtract' },
    waste_weighing: { label: 'Pesada (Ajuste ≤ 2kg)', icon: 'Scale', requiresPhoto: false, operation: 'subtract' },
    food_bank: { label: 'Banco de Alimentos', icon: 'HeartHandshake', requiresPhoto: true, operation: 'subtract' },
    employee_sale: { label: 'Venta a Empleado (Nómina)', icon: 'UserCheck', requiresPhoto: false, operation: 'subtract' },
    order_shortage: { label: 'Producto Escaso en Plaza', icon: 'AlertTriangle', requiresPhoto: false, operation: 'subtract' },
    order_unshipped: { label: 'Producto Sin Enviar (Cancelación)', icon: 'Undo2', requiresPhoto: false, operation: 'add' },
    additional_sale: { label: 'Venta Adicional Cliente', icon: 'ShoppingCart', requiresPhoto: false, operation: 'subtract' },
    correction: { label: 'Corrección de Inventario', icon: 'Edit3', requiresPhoto: false, operation: 'adjust' },
    blind_count_shift_close: { label: 'Conteo Físico Fin de Turno', icon: 'Lock', requiresPhoto: false, operation: 'adjust' }
};

