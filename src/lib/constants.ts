
export const CATEGORY_MAP: Record<string, string> = {
    'FR': 'Frutas',
    'VE': 'Vegetales',
    'TU': 'Tubérculos',
    'HO': 'Hortalizas',
    'LA': 'Lácteos',
    'DE': 'Despensa'
};

// Business Logic Cutoff Rules
export const DEFAULT_CUTOFF_HOUR = 17; // 5:00 PM - Sale cut for tomorrow delivery
export const ADMIN_EDIT_CUTOFF_HOUR = 20; // 8:00 PM - Admin edit lock for next day delivery


export const REVERSE_CATEGORY_MAP: Record<string, string> = {
    'Frutas': 'FR',
    'Vegetales': 'VE',
    'Verduras': 'VE',
    'Tubérculos': 'TU',
    'Hortalizas': 'HO',
    'Lácteos': 'LA',
    'Despensa': 'DE'
};
