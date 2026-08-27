'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChefHat } from 'lucide-react';
import { Locale } from '@/lib/translations';

export const TYPICAL_RECIPES = [
  { id: 'ajiaco', name: 'Ajiaco Santafereño', label: 'Ajiaco', emoji: '🥣', desc: 'Papas criolla, pastusa, guascas, mazorca...' },
  { id: 'sancocho', name: 'Sancocho Criollo', label: 'Sancocho', emoji: '🍲', desc: 'Plátano verde, yuca, mazorca, ahuyama...' },
  { id: 'bandeja paisa', name: 'Bandeja Paisa', label: 'Bandeja Paisa', emoji: '🍛', desc: 'Fríjol, arroz, plátano maduro, aguacate...' },
  { id: 'mondongo', name: 'Mondongo Tradicional', label: 'Mondongo', emoji: '🥘', desc: 'Yuca, arveja, zanahoria, papas...' },
  { id: 'mute', name: 'Mute Santandereano', label: 'Mute', emoji: '🍲', desc: 'Maíz pelado, garbanzo, papas, ahuyama...' },
  { id: 'tamal', name: 'Tamal Tolimense', label: 'Tamal', emoji: '🫔', desc: 'Harina de maíz, arroz, arveja, hojas de plátano...' },
  { id: 'arroz con pollo', name: 'Arroz con Pollo', label: 'Arroz con Pollo', emoji: '🍗', desc: 'Arroz, arveja, zanahoria, pimentón, habichuela...' }
];

export default function TypicalRecipesBar({ currentQ, locale }: { currentQ?: string, locale: Locale }) {
  const searchParams = useSearchParams();
  const activeQuery = (currentQ || searchParams.get('q') || '').toLowerCase().trim();

  return (
    <div style={{
      maxWidth: '1200px',
      margin: '1.1rem auto 0.5rem',
      width: '100%',
      padding: '0 1rem'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        marginBottom: '0.65rem'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: 'rgba(21, 128, 61, 0.08)',
          border: '1px solid rgba(21, 128, 61, 0.2)',
          padding: '3px 10px',
          borderRadius: '99px',
          color: '#15803D',
          fontSize: '0.76rem',
          fontWeight: '700'
        }}>
          <ChefHat size={14} />
          <span>🇨🇴 Cocina Tradicional en Casa</span>
        </div>
        <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '500' }}>
          Arma los ingredientes de tu plato típico en 1 clic:
        </span>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '0.45rem'
      }}>
        {TYPICAL_RECIPES.map((recipe) => {
          const isActive = activeQuery === recipe.id || activeQuery === recipe.label.toLowerCase();

          return (
            <Link
              key={recipe.id}
              href={'/?q=' + encodeURIComponent(recipe.id) + '#catalog'}
              scroll={false}
              title={recipe.desc}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '99px',
                fontSize: '0.82rem',
                fontWeight: isActive ? '800' : '600',
                backgroundColor: isActive ? '#15803D' : '#FFFFFF',
                color: isActive ? '#FFFFFF' : '#334155',
                border: isActive ? '1px solid #15803D' : '1px solid #E2E8F0',
                boxShadow: isActive ? '0 3px 10px rgba(21, 128, 61, 0.25)' : '0 1px 3px rgba(0,0,0,0.03)',
                transition: 'all 0.2s ease',
                textDecoration: 'none',
                cursor: 'pointer'
              }}
            >
              <span>{recipe.emoji}</span>
              <span>{recipe.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}