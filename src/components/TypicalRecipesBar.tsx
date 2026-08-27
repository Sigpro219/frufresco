'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChefHat, Soup, Flame, UtensilsCrossed, Wheat, Sparkles, Drumstick } from 'lucide-react';
import { Locale } from '@/lib/translations';

export const TYPICAL_RECIPES = [
  { id: 'ajiaco', label: 'Ajiaco', Icon: Soup },
  { id: 'sancocho', label: 'Sancocho', Icon: Flame },
  { id: 'bandeja paisa', label: 'Bandeja Paisa', Icon: UtensilsCrossed },
  { id: 'mondongo', label: 'Mondongo', Icon: Soup },
  { id: 'mute', label: 'Mute', Icon: Wheat },
  { id: 'tamal', label: 'Tamal', Icon: Sparkles },
  { id: 'arroz con pollo', label: 'Arroz con Pollo', Icon: Drumstick },
];

export default function TypicalRecipesBar({ currentQ }: { currentQ?: string, locale: Locale }) {
  const searchParams = useSearchParams();
  const activeQuery = (currentQ || searchParams.get('q') || '').toLowerCase().trim();

  return (
    <div style={{
      maxWidth: '1200px',
      margin: '0.45rem auto 0',
      width: '100%',
      padding: '0 0.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: '0.35rem'
    }}>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        marginRight: '4px',
        color: '#15803D',
        fontSize: '0.72rem',
        fontWeight: '700'
      }}>
        <ChefHat size={13} strokeWidth={2.2} />
        <span>Platos Típicos:</span>
      </div>

      {TYPICAL_RECIPES.map(({ id, label, Icon }) => {
        const isActive = activeQuery === id || activeQuery === label.toLowerCase();

        return (
          <Link
            key={id}
            href={`/?q=${encodeURIComponent(id)}#catalog`}
            scroll={false}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 9px',
              borderRadius: '99px',
              fontSize: '0.73rem',
              fontWeight: isActive ? '700' : '500',
              backgroundColor: isActive ? '#15803D' : '#FFFFFF',
              color: isActive ? '#FFFFFF' : '#475569',
              border: isActive ? '1px solid #15803D' : '1px solid #E2E8F0',
              boxShadow: isActive ? '0 2px 6px rgba(21, 128, 61, 0.2)' : '0 1px 2px rgba(0,0,0,0.02)',
              transition: 'all 0.15s ease',
              textDecoration: 'none',
              cursor: 'pointer'
            }}
          >
            <Icon size={11} strokeWidth={isActive ? 2.5 : 1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}