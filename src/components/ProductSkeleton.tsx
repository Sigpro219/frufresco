'use client';

export default function ProductSkeleton() {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '2rem',
            padding: '1.5rem',
            width: '100%'
        }}>
            {[...Array(8)].map((_, i) => (
                <div key={i} style={{
                    height: '400px',
                    backgroundColor: '#f3f4f6',
                    borderRadius: 'var(--radius-lg)',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                        animation: 'shimmer 1.5s infinite',
                        transform: 'translateX(-100%)'
                    }} />
                </div>
            ))}
            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes shimmer {
                    100% { transform: translateX(100%); }
                }
            `}} />
        </div>
    );
}
