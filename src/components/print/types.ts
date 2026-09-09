export type PaperSize = 'letter' | 'a4';

export interface CorporateBrandConfig {
    companyName: string;            // Ej: "Investments Cortes S.A.S." | "Delta CoreTech S.A.S."
    legalId: string;                // Ej: "NIT 901.393.217-5"
    taxRegime?: string;             // Ej: "Régimen Común"
    businessLine?: string;          // Ej: "Operador Agro-Logístico • FruFresco Institucional"
    logoUrl: string;                // URL del isotipo (idealmente recortado sin márgenes y con fondo transparente)
    logoHeight?: string | number;   // Default: '52px'
    watermarkUrl?: string;          // Opcional, por defecto usa logoUrl
    watermarkOpacity?: number;      // Default: 0.025 (2.5%)
    watermarkRotation?: number;     // Default: -25 deg
    watermarkWidth?: string;        // Default: '320px'
    primaryColor?: string;          // Default: '#0F172A'
    accentColor?: string;           // Default: '#0D7A57'
    headquarters?: {
        label?: string;             // Default: "Sede Central • Bogotá D.C., Colombia"
        address?: string;           // Ej: "CL 12 B # 71 D - 31 Torre 4 Ap 101"
        city?: string;              // Ej: "Bogotá D.C. • Colombia"
        pbx?: string;               // Ej: "PBX: (601) 745 1400"
        mobile?: string;            // Ej: "Cel: 310 556 4160"
        email?: string;             // Ej: "contacto@investmentscortes.com"
        website?: string;           // Ej: "www.frufresco.com"
    };
    footerLegalNotice?: string;     // Aviso legal al pie
    footerContactLine?: string;     // Teléfonos y canales de atención al pie
}

export interface DocumentMetaConfig {
    title?: string;
    subtitle?: string;
    date?: string;
    reference?: string;
    badge?: string;
    badgeVariant?: 'dark' | 'light' | 'emerald' | 'amber';
    operationalTag?: {
        label: string;              // Ej: "Bahía de Piso" | "OT N°" | "Lote Industrial"
        value: string | number;     // Ej: "ESPACIO 21" | "4092"
    };
}

export interface UniversalLetterheadProps {
    children: React.ReactNode;
    brand: CorporateBrandConfig;
    meta?: DocumentMetaConfig;
    paperSize?: PaperSize;          // Default: 'letter'
    showWatermark?: boolean;        // Default: true
    showFooter?: boolean;           // Default: true
    footerCustomText?: React.ReactNode;
    className?: string;
    hideTopAccent?: boolean;
}
