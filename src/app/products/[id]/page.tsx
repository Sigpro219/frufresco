import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import ProductDetailClient from '@/components/ProductDetailClient';
import ProductCard from '@/components/ProductCard';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    // 1. Fetch Current Product
    const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !product) {
        return notFound();
    }

    // 2. Fetch "You May Also Like" (Top 10 other products)
    const { data: relatedProducts } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .neq('id', id)
        .limit(10);

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#FFFFFF', paddingBottom: '5rem' }}>
            <Navbar />
            <div className="container" style={{ paddingTop: '2rem' }}>
                <ProductDetailClient product={product} />

                {/* Related Products Section */}
                {relatedProducts && relatedProducts.length > 0 && (
                    <section style={{ marginTop: '6rem' }}>
                        <h2 style={{
                            fontSize: '1.75rem',
                            fontWeight: '800',
                            marginBottom: '2.5rem',
                            textAlign: 'center',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            También te podría interesar 🍇
                        </h2>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                            gap: '2rem'
                        }}>
                            {relatedProducts.map((p) => (
                                <ProductCard key={p.id} product={p} />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </main>
    );
}
