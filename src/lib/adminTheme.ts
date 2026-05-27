// Shared Design System Tokens for FruFresco Admin Portal
// Ref: design_manual.md

export const THEME = {
    colors: {
        background: '#F4F7F6',      // Gris claro tierra (Fondo principal)
        surface: '#FFFFFF',         // Blanco (Tarjetas, contenedores)
        primary: '#0D7A57',         // Verde bosque/albahaca (Botones primarios, acentos activos)
        primaryHover: '#0A5F43',    // Verde oscuro para estados hover
        primaryLight: '#EAEFEA',    // Verde ultra-claro para badges y acentos secundarios
        textMain: '#1A231E',        // Carbón orgánico para títulos y lecturas principales
        textSecondary: '#64748B',   // Gris slate para textos secundarios y etiquetas
        border: '#E5E7EB',          // Gris claro para líneas divisorias y bordes sutiles
        borderActive: '#D1D5DB'     // Gris medio para bordes con hover o interacción
    },
    radius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px'
    },
    shadow: {
        sm: '0 1px 3px rgba(0,0,0,0.02)',
        md: '0 2px 8px rgba(0,0,0,0.04)',      // Sombra ambiental estándar
        lg: '0 4px 12px rgba(0,0,0,0.06)'      // Sombra de elevación hover
    }
};

// Numeric formatting helpers (Spanish Latinoamerica conventions)
// Thousands: '.' | Decimals: ',' | Currency: '$'
export const formatNumber = (num: number, decimals: number = 0): string => {
    if (num === null || num === undefined || isNaN(num)) return '-';
    const parts = num.toFixed(decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parts.join(',');
};

export const formatMoney = (num: number): string => {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return `$${formatNumber(Math.round(num))}`;
};
