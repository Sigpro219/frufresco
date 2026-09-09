'use client';

import React from 'react';
import GoldenPrintStyles from './GoldenPrintStyles';
import { UniversalLetterheadProps } from './types';

export default function UniversalLetterhead({
    children,
    brand,
    meta,
    paperSize = 'letter',
    showWatermark = true,
    showFooter = true,
    footerCustomText,
    className = '',
    hideTopAccent = false
}: UniversalLetterheadProps) {
    const isCopy = meta?.badge && meta.badge.toLowerCase().includes('copia');

    const getBadgeStyle = () => {
        if (meta?.badgeVariant === 'emerald') {
            return { bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0' };
        }
        if (meta?.badgeVariant === 'amber') {
            return { bg: '#FEF3C7', color: '#92400E', border: '#FCD34D' };
        }
        if (isCopy || meta?.badgeVariant === 'light') {
            return { bg: '#F1F5F9', color: '#0F172A', border: '#94A3B8' };
        }
        return { bg: '#0F172A', color: '#FFFFFF', border: '#0F172A' };
    };

    const badgeStyle = getBadgeStyle();
    const primaryColor = brand.primaryColor || '#0F172A';
    const accentColor = brand.accentColor || '#0D7A57';
    const logoHeight = brand.logoHeight || '52px';
    const watermarkUrl = brand.watermarkUrl || brand.logoUrl;
    const watermarkOpacity = brand.watermarkOpacity ?? 0.025;
    const watermarkRotation = brand.watermarkRotation ?? -25;
    const watermarkWidth = brand.watermarkWidth || '320px';

    return (
        <div className={`letterhead-container ${className}`}>
            {/* Scoped CSS for Golden Print Standard & Table Compaction */}
            <GoldenPrintStyles 
                paperSize={paperSize}
                primaryColor={primaryColor}
                accentColor={accentColor}
            />

            {/* Top Multi-tone Accent Line (Non-printable) */}
            {!hideTopAccent && <div className="letterhead-top-stripe no-print" />}

            {/* Subtle Luxury Watermark */}
            {showWatermark && watermarkUrl && (
                <div className="letterhead-watermark" aria-hidden="true">
                    <img 
                        src={watermarkUrl} 
                        alt="" 
                        style={{ 
                            width: watermarkWidth, 
                            height: 'auto', 
                            opacity: watermarkOpacity, 
                            transform: `rotate(${watermarkRotation}deg)`, 
                            pointerEvents: 'none' 
                        }} 
                    />
                </div>
            )}

            {/* Executive Corporate Header */}
            <header className="letterhead-header">
                <div className="letterhead-logo-wrap">
                    <img 
                        src={brand.logoUrl} 
                        alt={brand.companyName} 
                        style={{ height: logoHeight, width: 'auto', objectFit: 'contain', flexShrink: 0 }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div className="letterhead-company-name">{brand.companyName}</div>
                        <div className="letterhead-company-nit">
                            {brand.legalId} {brand.taxRegime ? `• ${brand.taxRegime}` : ''}
                        </div>
                        {brand.businessLine && (
                            <div style={{ fontSize: '0.62rem', color: '#64748B', marginTop: '1px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {brand.businessLine}
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {meta?.operationalTag && (
                        <div style={{
                            border: `1.8px solid ${primaryColor}`,
                            backgroundColor: '#F8FAFC',
                            borderRadius: '5px',
                            padding: '3px 8px',
                            textAlign: 'center',
                            minWidth: '82px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            flexShrink: 0
                        }}>
                            <div style={{ fontSize: '0.50rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.06em' }}>
                                {meta.operationalTag.label}
                            </div>
                            <div style={{ fontSize: '0.96rem', fontWeight: 900, color: primaryColor, letterSpacing: '0.01em', lineHeight: 1.1 }}>
                                {meta.operationalTag.value}
                            </div>
                        </div>
                    )}

                    {brand.headquarters && (
                        <div className="letterhead-company-info" suppressHydrationWarning>
                            {brand.headquarters.label && (
                                <div style={{ fontWeight: 700, color: '#1E293B' }}>{brand.headquarters.label}</div>
                            )}
                            {brand.headquarters.address && <div>{brand.headquarters.address}</div>}
                            {(brand.headquarters.pbx || brand.headquarters.mobile) && (
                                <div>
                                    {brand.headquarters.pbx} {brand.headquarters.mobile ? `• ${brand.headquarters.mobile}` : ''}
                                </div>
                            )}
                            {(brand.headquarters.email || brand.headquarters.website) && (
                                <div style={{ color: accentColor, fontWeight: 600 }}>
                                    {brand.headquarters.email} {brand.headquarters.website ? `• ${brand.headquarters.website}` : ''}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {/* Document Title / Meta Strip */}
            {(meta?.title || meta?.subtitle || meta?.date || meta?.reference || meta?.badge) && (
                <div className="letterhead-meta-strip">
                    <div>
                        {meta.title && (
                            <div style={{ fontSize: '0.90rem', fontWeight: 900, color: primaryColor, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
                                {meta.title}
                            </div>
                        )}
                        {meta.subtitle && (
                            <div style={{ fontSize: '0.64rem', color: '#64748B', marginTop: '1px', fontWeight: 600 }}>
                                {meta.subtitle}
                            </div>
                        )}
                    </div>

                    <div style={{ textAlign: 'right', display: 'flex', gap: '12px', alignItems: 'center' }}>
                        {meta.badge && (
                            <span style={{
                                fontSize: '0.60rem',
                                fontWeight: 800,
                                padding: '1.5px 7px',
                                borderRadius: '3px',
                                backgroundColor: badgeStyle.bg,
                                color: badgeStyle.color,
                                border: `1px solid ${badgeStyle.border}`,
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase'
                            }}>
                                {meta.badge}
                            </span>
                        )}
                        {meta.date && (
                            <div>
                                <span style={{ color: '#64748B', fontSize: '0.64rem', textTransform: 'uppercase', fontWeight: 700 }}>Fecha: </span>
                                <strong style={{ color: primaryColor }}>{meta.date}</strong>
                            </div>
                        )}
                        {meta.reference && (
                            <div>
                                <span style={{ color: '#64748B', fontSize: '0.64rem', textTransform: 'uppercase', fontWeight: 700 }}>Ref: </span>
                                <strong style={{ color: accentColor, fontFamily: 'monospace', fontSize: '0.74rem' }}>{meta.reference}</strong>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Document Body (Children Content) */}
            <main style={{ flexGrow: 1, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column' }}>
                {children}
            </main>

            {/* Executive Legal & Verification Footer */}
            {showFooter && (
                <footer className="letterhead-footer">
                    <div>
                        {footerCustomText || (
                            brand.footerLegalNotice ? (
                                <strong>{brand.companyName}</strong>
                            ) : (
                                <>
                                    <strong>{brand.companyName}</strong> • Documento Oficial de Operación • Sistema Integrado
                                </>
                            )
                        )}
                        {brand.footerLegalNotice && ` • ${brand.footerLegalNotice}`}
                    </div>
                    {brand.footerContactLine && (
                        <div style={{ marginTop: '2px', color: '#94A3B8' }}>
                            {brand.footerContactLine}
                        </div>
                    )}
                </footer>
            )}
        </div>
    );
}
