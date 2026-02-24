
export const config = {
    brand: {
        name: process.env.NEXT_PUBLIC_APP_NAME || 'FruFresco',
        shortName: process.env.NEXT_PUBLIC_APP_SHORT_NAME || 'FruFresco',
        logoAlt: process.env.NEXT_PUBLIC_APP_LOGO_ALT || 'FruFresco Logo',
        footerDescription: process.env.NEXT_PUBLIC_APP_FOOTER_DESC || 'Tu despensa gourmet del campo a la ciudad.',
    },
    features: {
        // ACTIVAR/DESACTIVAR EL MECANISMO DE CAPTURA DE LEADS (B2B/Institucional)
        // Cambia a 'false' para ocultar los botones y desactivar la página de registro.
        enableLeadCapture: true, 
    }
};
