'use client';

import { useState } from 'react';
import { supabase, Product } from '@/lib/supabase';

interface EditProductModalProps {
    product: Product;
    onClose: () => void;
    onSave: () => void;
}

export default function EditProductModal({ product, onClose, onSave }: EditProductModalProps) {
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [formData, setFormData] = useState<Product>({ ...product });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(product.image_url);

    const categories = ['Frutas', 'Hortalizas', 'Verduras', 'Tubérculos', 'Despensa', 'Lácteos'];
    const baseUnits = ['Kg', 'G', 'Lb', 'Lt', 'Un', 'Atado', 'Bulto', 'Caja', 'Saco', 'Cubeta'];

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const uploadImage = async () => {
        if (!imageFile) return formData.image_url;

        setUploading(true);
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `master/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(filePath, imageFile);

        if (uploadError) {
            console.error('Error subiendo imagen:', uploadError);
            setUploading(false);
            return formData.image_url;
        }

        const { data: { publicUrl } } = supabase.storage
            .from('product-images')
            .getPublicUrl(filePath);

        setUploading(false);
        return publicUrl;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const uploadedImageUrl = await uploadImage();
            
            const { error } = await supabase
                .from('products')
                .update({
                    name: formData.name,
                    sku: formData.sku,
                    category: formData.category,
                    unit_of_measure: formData.unit_of_measure,
                    description: formData.description,
                    min_inventory_level: formData.min_inventory_level,
                    is_active: formData.is_active,
                    image_url: uploadedImageUrl
                })
                .eq('id', product.id);

            if (error) throw error;

            onSave();
            onClose();
        } catch (error: any) {
            alert('Error al actualizar producto: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            backdropFilter: 'blur(8px)',
            padding: '2rem'
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '2.5rem',
                borderRadius: '24px',
                width: '100%',
                maxWidth: '600px',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
            }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', borderBottom: '1px solid #eee', paddingBottom: '1.5rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: '900', color: '#111827' }}>⚙️ Editar Maestro</h2>
                        <p style={{ fontSize: '0.9rem', color: '#6B7280', marginTop: '4px' }}>Actualizando SKU: {product.sku}</p>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '2rem', cursor: 'pointer', color: '#6B7280' }}>✕</button>
                </header>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', backgroundColor: '#F9FAFB', padding: '1rem', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
                        <div style={{ width: '100px', height: '100px', borderRadius: '12px', overflow: 'hidden', border: '2px solid #D1D5DB', position: 'relative', flexShrink: 0 }}>
                            <img src={previewUrl || ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <input type="file" accept="image/*" onChange={handleFileChange} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '0.6rem', padding: '4px', textAlign: 'center' }}>CAMBIAR</div>
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Nombre Técnico</label>
                            <input
                                required
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '1.1rem', fontWeight: '700' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>SKU Código</label>
                            <input
                                required
                                type="text"
                                value={formData.sku}
                                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #2563EB', fontSize: '1rem', fontWeight: '800', backgroundColor: '#EFF6FF', color: '#1E40AF' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Categoría</label>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '1rem', cursor: 'pointer' }}
                            >
                                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Unidad de Medida</label>
                            <select
                                value={formData.unit_of_measure}
                                onChange={(e) => setFormData({ ...formData, unit_of_measure: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '1rem', cursor: 'pointer' }}
                            >
                                {baseUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Inventario Mínimo</label>
                            <input
                                type="number"
                                value={formData.min_inventory_level}
                                onChange={(e) => setFormData({ ...formData, min_inventory_level: parseInt(e.target.value) || 0 })}
                                style={{ 
                                    width: '100%', 
                                    padding: '0.8rem', 
                                    borderRadius: '8px', 
                                    border: '1px solid #D1D5DB', 
                                    fontSize: '1.2rem', 
                                    fontWeight: '900',
                                    color: formData.min_inventory_level > 0 ? '#B91C1C' : '#6B7280',
                                    backgroundColor: formData.min_inventory_level > 0 ? '#FEF2F2' : 'white'
                                }}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#6B7280', marginBottom: '4px' }}>Descripción Técnica</label>
                        <textarea
                            value={formData.description || ''}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={4}
                            style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '0.9rem', resize: 'none', fontFamily: 'inherit' }}
                        />
                    </div>

                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        padding: '1rem', 
                        backgroundColor: formData.is_active ? '#ECFDF5' : '#FEF2F2', 
                        borderRadius: '12px',
                        border: `1px solid ${formData.is_active ? '#A7F3D0' : '#FECACA'}`
                    }}>
                        <div>
                            <span style={{ fontWeight: '800', color: formData.is_active ? '#065F46' : '#991B1B' }}>ESTADO DEL SKU</span>
                            <p style={{ fontSize: '0.75rem', color: '#6B7280' }}>Si está OFF, no se verá en ninguna bodega comercial.</p>
                        </div>
                        <button 
                            type="button"
                            onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '20px',
                                border: 'none',
                                backgroundColor: formData.is_active ? '#10B981' : '#EF4444',
                                color: 'white',
                                fontWeight: '900',
                                cursor: 'pointer',
                                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                            }}
                        >
                            {formData.is_active ? 'HABILITADO' : 'SUSPENDIDO'}
                        </button>
                    </div>

                    <footer style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid #eee', paddingTop: '1.5rem' }}>
                        <button type="button" onClick={onClose} style={{ padding: '0.8rem 2rem', background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontWeight: '600' }}>Cancelar</button>
                        <button
                            type="submit"
                            disabled={loading || uploading}
                            style={{
                                padding: '0.8rem 3rem',
                                backgroundColor: '#111827',
                                color: 'white',
                                border: 'none',
                                borderRadius: '10px',
                                fontWeight: '700',
                                cursor: 'pointer'
                            }}
                        >
                            {loading || uploading ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </footer>
                </form>
            </div>
        </div>
    );
}
