'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Apple,
  ArrowLeft,
  Beef,
  Carrot,
  Clock,
  LayoutGrid,
  Leaf,
  LogOut,
  Menu,
  Milk,
  Package,
  Phone,
  ShieldAlert,
  ShoppingBag,
  Snowflake,
  Sprout,
  Tag,
  User,
  Utensils,
  X,
} from 'lucide-react';
import { useCart } from '@/lib/cartContext';
import { useAuth } from '@/lib/authContext';
import { CATEGORY_MAP } from '@/lib/constants';
import { translations, type Locale } from '@/lib/translations';
import type { StorefrontRuntimeConfig } from '@/lib/storefront/storefrontContracts';
import SearchBar from '../SearchBar';
import ReorderHeroBanner from '../ReorderHeroBanner';

interface StorefrontHeaderProps {
  config: StorefrontRuntimeConfig;
}

const ORDERED_CATEGORY_CODES = ['FR', 'VE', 'HO', 'TU', 'LA', 'DE', 'CO', 'PR', 'CP'] as const;

function CategoryAvatar({ code }: { code: string }) {
  const s = 15;
  switch (code) {
    case 'FR': return <Apple size={s} aria-hidden="true" />;
    case 'VE': return <Carrot size={s} aria-hidden="true" />;
    case 'HO': return <Leaf size={s} aria-hidden="true" />;
    case 'TU': return <Sprout size={s} aria-hidden="true" />;
    case 'LA': return <Milk size={s} aria-hidden="true" />;
    case 'CO': return <Snowflake size={s} aria-hidden="true" />;
    case 'PR': return <Utensils size={s} aria-hidden="true" />;
    case 'CP': return <Beef size={s} aria-hidden="true" />;
    default: return <Package size={s} aria-hidden="true" />;
  }
}

function buildTopNotice(config: StorefrontRuntimeConfig, locale: Locale): string {
  const customBanner = (locale === 'en' ? config.globalBannerEn : config.globalBannerEs)?.trim();
  if (customBanner) return customBanner;
  if (config.storeStatus === 'closed') {
    return locale === 'en'
      ? 'Store temporarily paused · Consultation mode only'
      : 'Tienda cerrada temporalmente · Solo consultas';
  }
  if (config.storeStatus === 'vacation_preorder' && config.vacationConfigRaw) {
    try {
      const vac = JSON.parse(config.vacationConfigRaw) as { reasonTitle?: string; customMessage?: string; reopenTime?: string };
      if (vac?.reasonTitle || vac?.customMessage) {
        return `${vac.reasonTitle ? `${vac.reasonTitle}: ` : ''}${vac.customMessage || ''}${vac.reopenTime ? ` · Reapertura ${vac.reopenTime}` : ''}`.trim();
      }
    } catch (err) { console.warn('Malformed store_vacation_config JSON in StorefrontHeader:', err); }
  }
  const hh = String(config.cutoffHourPublic || 17).padStart(2, '0');
  return locale === 'en'
    ? `Bogota & Sabana · Order before ${hh}:00 for next-morning delivery`
    : `Bogotá y Sabana · Pide antes de las ${hh}:00 para entrega AM`;
}

export default function StorefrontHeader({ config }: StorefrontHeaderProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const locale: Locale = searchParams.get('lang') === 'en' ? 'en' : 'es';
  const t = translations[locale];
  const currentCategory = searchParams.get('category') || 'Todos';
  const isHomePage = pathname === '/';
  const isB2bRegister = pathname?.startsWith('/b2b/register') ?? false;

  const { lineCount, totalPrice, openDrawer, sanitizeForFrioganMode, isCartLoaded } = useCart();
  const { user, profile, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const displayLineCount = hydrated ? lineCount : 0;
  const displayTotalPrice = hydrated ? totalPrice : 0;

  useEffect(() => {
    if (isCartLoaded) {
      sanitizeForFrioganMode(config.frioganMode);
    }
  }, [isCartLoaded, config.frioganMode, sanitizeForFrioganMode]);

  const dashboardHref = useMemo(() => {
    const role = (profile?.role || '').toLowerCase();
    if (role === 'admin' || role === 'sysadmin' || role === 'sys_admin' || role === 'manager') return '/admin';
    if (role === 'ops' || role === 'warehouse' || role === 'picker' || role === 'driver') return '/ops';
    if (role === 'client' || role === 'b2b' || role === 'b2b_client') return '/b2b/dashboard';
    return '/orders';
  }, [profile?.role]);

  const isB2bUser = ['client', 'b2b', 'b2b_client'].includes((profile?.role || '').toLowerCase());
  const portalHref = user
    ? '/b2b/dashboard'
    : locale === 'en'
      ? '/login?lang=en'
      : '/login';

  const switchLocale = (targetLocale: Locale) => {
    if (targetLocale === locale) return;
    const params = new URLSearchParams(searchParams.toString());
    if (targetLocale === 'en') params.set('lang', 'en');
    else params.delete('lang');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const buildCategoryHref = (code?: string) => {
    const params = new URLSearchParams();
    if (locale === 'en') params.set('lang', 'en');
    if (code && code !== 'Todos') params.set('category', code);
    const qs = params.toString();
    return qs ? `/?${qs}#catalog` : '/#catalog';
  };

  const visibleCodes = ORDERED_CATEGORY_CODES.filter((code) =>
    code === 'CP' ? config.frioganMode === 'LIVE' : Boolean(CATEGORY_MAP[code])
  );
  const topNotice = buildTopNotice(config, locale);

  return (
    <>
      <header className="sf-header-root">
        {/* Top operational announcement bar */}
        <div style={{ backgroundColor: config.storeStatus === 'closed' ? '#7F1D1D' : '#081C15', color: '#F8FAFC', fontSize: '0.8125rem' }}>
          <div className="sf-container" style={{ padding: '7px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
              {config.storeStatus === 'closed' ? <ShieldAlert size={15} aria-hidden="true" /> : <Clock size={15} color="#6EE7B7" aria-hidden="true" />}
              <span>{topNotice}</span>
              <span className="sf-hide-sm" style={{ color: '#A7F3D0', fontVariantNumeric: 'tabular-nums' }}>
                · {locale === 'en' ? `Home min. $${config.minOrderHogar.toLocaleString('es-CO')}` : `Mín. Hogar $${config.minOrderHogar.toLocaleString('es-CO')}`}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Link href={portalHref} style={{ color: '#D1FAE5', fontWeight: 700, fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                {locale === 'en'
                  ? (isB2bUser ? 'My Institutional Portal' : 'Institutional Portal')
                  : (isB2bUser ? 'Mi Portal Institucional' : 'Portal Institucional')}
              </Link>
              {config.contactPhone && (
                <a href={`tel:${config.contactPhone.replace(/\s+/g, '')}`} className="sf-hide-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#E2E8F0', fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                  <Phone size={14} aria-hidden="true" />
                  <span>{config.contactPhone}</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Level 1: Primary sticky commerce row with Official Logo & Prominent Language Toggle */}
        <div className="sf-container sf-main-row" style={{ padding: '7px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="sf-show-mobile-only"
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: '10px', padding: '8px', color: '#081C15' }}
          >
            {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>

          <Link href={locale === 'en' ? '/?lang=en' : '/'} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <img
              src={config.logoUrl || '/logo.png'}
              alt="FruFresco"
              className="sf-brand-logo"
              onError={(e) => {
                if (!e.currentTarget.src.endsWith('/logo.png')) {
                  e.currentTarget.src = '/logo.png';
                }
              }}
            />
            {config.frioganMode === 'LIVE' && (
              <span className="sf-hide-sm" style={{ backgroundColor: '#FFF5F5', color: '#7F1D1D', border: '1px solid rgba(127,29,29,0.25)', borderRadius: '9999px', padding: '3px 10px', fontSize: '0.8125rem', fontWeight: 800 }}>
                + Friogan
              </span>
            )}
          </Link>

          {!isB2bRegister ? (
            <div className="sf-search-slot" style={{ flex: 1, minWidth: 0, maxWidth: '520px', marginLeft: '4px' }}>
              <SearchBar
                frioganMode={config.frioganMode}
                placeholder={locale === 'en' ? 'Search avocado, cilantro, potatoes, dairy...' : 'Busca aguacate, cilantro, papa pastusa, quesos...'}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: '12px' }}>
              <Link
                href={locale === 'en' ? '/?lang=en' : '/'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '9999px',
                  backgroundColor: '#F4F1EA',
                  border: '1px solid #E5DFD3',
                  color: '#081C15',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                }}
              >
                <ArrowLeft size={15} aria-hidden="true" />
                <span>{locale === 'en' ? 'Back to Catalog' : 'Volver al Catálogo'}</span>
              </Link>
            </div>
          )}

          <div className="sf-hide-md" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: 'auto' }}>
            {!isB2bRegister && <ReorderHeroBanner variant="compact-trigger" />}

            {/* Segmented ES / EN Language Selector */}
            <div role="group" aria-label={locale === 'en' ? 'Language selector' : 'Selector de idioma'} style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: '#EFECE6', borderRadius: '9999px', padding: '3px', border: '1px solid #E5E0D8' }}>
              {(['es', 'en'] as const).map((code) => {
                const active = locale === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => switchLocale(code)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '9999px',
                      border: 'none',
                      backgroundColor: active ? '#FFFFFF' : 'transparent',
                      color: active ? '#081C15' : '#64748B',
                      fontWeight: 800,
                      fontSize: '0.8125rem',
                      boxShadow: active ? '0 1px 3px rgba(8,28,21,0.12)' : 'none',
                      transition: 'background-color 140ms ease, color 140ms ease',
                    }}
                  >
                    {code.toUpperCase()}
                  </button>
                );
              })}
            </div>

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Link href={dashboardHref} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 13px', borderRadius: '9999px', backgroundColor: '#FFFFFF', border: '1px solid #E5E0D8', color: '#081C15', fontSize: '0.875rem', fontWeight: 600, maxWidth: '160px' }}>
                  <User size={15} color="#0D7A57" aria-hidden="true" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {profile?.company_name || profile?.contact_name || t.navCatalog}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => signOut()}
                  aria-label={locale === 'en' ? 'Sign out' : 'Cerrar sesión'}
                  style={{ width: '36px', height: '36px', borderRadius: '9999px', backgroundColor: '#FFFFFF', border: '1px solid #E5E0D8', color: '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '9999px', backgroundColor: '#FFFFFF', border: '1px solid #E5E0D8', color: '#081C15', fontSize: '0.875rem', fontWeight: 600 }}>
                <User size={15} aria-hidden="true" />
                <span>{locale === 'en' ? 'Sign In' : 'Ingresar'}</span>
              </Link>
            )}
          </div>

          {!isB2bRegister && (
            <button
              type="button"
              onClick={openDrawer}
              className="sf-cart-btn"
              aria-label={locale === 'en' ? 'Open cart drawer' : 'Abrir carrito'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#0D7A57',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '9999px',
                padding: '9px 16px',
                fontWeight: 800,
                fontSize: '0.875rem',
                fontVariantNumeric: 'tabular-nums',
                boxShadow: '0 4px 12px rgba(13, 122, 87, 0.22)',
                flexShrink: 0,
                transition: 'background-color 150ms ease, transform 150ms ease',
              }}
            >
              <ShoppingBag size={17} aria-hidden="true" />
              <span className="sf-hide-sm">${displayTotalPrice.toLocaleString('es-CO')}</span>
              <span>({displayLineCount})</span>
            </button>
          )}
        </div>

        {/* Level 2: Airy Gourmet Department Strip (omitted on /b2b/register to avoid distraction) */}
        {!isB2bRegister && (
          <nav aria-label={locale === 'en' ? 'Catalog categories' : 'Categorías'} style={{ borderTop: '1px solid rgba(8,28,21,0.06)', backgroundColor: '#FFFFFF' }}>
          <div className="sf-container sf-cat-rail">
            <Link href={buildCategoryHref('Todos')} className={`sf-cat-pill ${isHomePage && currentCategory === 'Todos' ? 'sf-cat-pill-active' : ''}`}>
              <LayoutGrid size={15} aria-hidden="true" />
              <span>{locale === 'en' ? 'All' : 'Todo'}</span>
            </Link>

            <Link href={buildCategoryHref('OFERTAS')} className={`sf-cat-pill sf-cat-pill-promo ${isHomePage && currentCategory === 'OFERTAS' ? 'sf-cat-pill-promo-active' : ''}`}>
              <Tag size={15} aria-hidden="true" />
              <span>{locale === 'en' ? 'Deals' : 'Ofertas'}</span>
            </Link>

            {visibleCodes.map((code) => {
              const isProtein = code === 'CP';
              const active = isHomePage && currentCategory === code;
              const esLabel = isProtein ? 'Carnicería Friogan' : CATEGORY_MAP[code] || code;
              const label =
                locale === 'en'
                  ? translations.en.categories[code as keyof typeof translations.en.categories] || esLabel
                  : esLabel;

              return (
                <Link
                  key={code}
                  href={buildCategoryHref(code)}
                  className={`sf-cat-pill ${active ? 'sf-cat-pill-active' : ''} ${isProtein ? 'sf-cat-pill-friogan' : ''}`}
                >
                  <CategoryAvatar code={code} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
          </nav>
        )}

        {mobileMenuOpen && (
          <div style={{ backgroundColor: '#FFFFFF', borderTop: '1px solid rgba(8,28,21,0.08)', padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <ReorderHeroBanner variant="compact-trigger" />
              <div role="group" aria-label="Idioma" style={{ display: 'inline-flex', backgroundColor: '#EFECE6', borderRadius: '9999px', padding: '3px', border: '1px solid #E5E0D8' }}>
                {(['es', 'en'] as const).map((code) => (
                  <button key={code} type="button" onClick={() => { switchLocale(code); setMobileMenuOpen(false); }} style={{ padding: '5px 11px', borderRadius: '9999px', border: 'none', backgroundColor: locale === code ? '#FFFFFF' : 'transparent', color: locale === code ? '#081C15' : '#64748B', fontWeight: 800, fontSize: '0.8125rem' }}>
                    {code.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Link href={user ? dashboardHref : '/login'} onClick={() => setMobileMenuOpen(false)} style={{ flex: 1, textAlign: 'center', padding: '9px 12px', borderRadius: '10px', backgroundColor: '#F4F1EA', color: '#081C15', fontWeight: 700, fontSize: '0.875rem' }}>
                {user ? profile?.company_name || 'Mi Cuenta' : 'Ingresar'}
              </Link>
              <Link href={portalHref} onClick={() => setMobileMenuOpen(false)} style={{ flex: 1, textAlign: 'center', padding: '9px 12px', borderRadius: '10px', backgroundColor: '#ECFDF5', color: '#0D7A57', fontWeight: 700, fontSize: '0.875rem' }}>
                {isB2bUser ? 'Mi Portal Institucional' : 'Portal Institucional'}
              </Link>
            </div>
          </div>
        )}
      </header>

      <style jsx global>{`
        .sf-header-root { position: sticky; top: 0; z-index: 80; max-width: 100%; overflow-x: clip; background-color: rgba(250, 249, 246, 0.97); backdrop-filter: blur(12px); border-bottom: 1px solid #E7E3DA; }
        .sf-container { max-width: 1440px; width: 100%; margin: 0 auto; box-sizing: border-box; }
        .sf-brand-logo { height: 74px; width: auto; max-width: 280px; object-fit: contain; display: block; }
        .sf-cat-rail { padding: 10px 20px; display: flex; align-items: center; justify-content: center; gap: 10px; overflow-x: auto; max-width: 100%; scrollbar-width: none; }
        @media (max-width: 1180px) { .sf-cat-rail { justify-content: flex-start; } }
        @media (max-width: 900px) { .sf-brand-logo { height: 54px; max-width: 195px; } }
        .sf-cat-rail::-webkit-scrollbar { display: none; }
        .sf-cat-pill { display: inline-flex; align-items: center; gap: 7px; padding: 8px 15px; border-radius: 9999px; font-size: 0.875rem; font-weight: 600; color: #1E293B; background-color: #F7F4ED; border: 1px solid #E5DFD3; white-space: nowrap; text-decoration: none; transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease, box-shadow 150ms ease; }
        .sf-cat-pill:hover { background-color: #ECFDF5; border-color: rgba(13, 122, 87, 0.4); color: #0D7A57; box-shadow: 0 2px 6px rgba(13, 122, 87, 0.08); }
        .sf-cat-pill-active { background-color: #081C15 !important; color: #FFFFFF !important; border-color: #081C15 !important; box-shadow: 0 3px 10px rgba(8, 28, 21, 0.16); }
        .sf-cat-pill-promo { color: #92400E; background-color: #FEF3C7; border-color: #FCD34D; }
        .sf-cat-pill-promo-active { background-color: #B45309 !important; color: #FFFFFF !important; border-color: #B45309 !important; }
        .sf-cat-pill-friogan { color: #7F1D1D; background-color: #FFF5F5; border-color: rgba(127, 29, 29, 0.3); }
        .sf-show-mobile-only { display: none; }
        @media (max-width: 900px) {
          .sf-hide-md { display: none !important; }
          .sf-show-mobile-only { display: inline-flex; }
          .sf-main-row { flex-wrap: wrap; row-gap: 10px; }
          .sf-cart-btn { margin-left: auto; }
          .sf-search-slot { order: 4; flex: 1 0 100% !important; max-width: 100% !important; margin-left: 0 !important; }
        }
        @media (max-width: 640px) { .sf-hide-sm { display: none !important; } }
      `}</style>
    </>
  );
}
