'use client';

import React from 'react';
import Letterhead from './Letterhead';

interface QuoteItem {
    description: string;
    quantity: number;
    unitPrice: number;
}

interface QuoteTemplateProps {
    quoteNumber: string;
    date: string;
    validUntil: string;
    clientName: string;
    items: QuoteItem[];
    notes?: string[];
}

export default function QuoteTemplate({
    quoteNumber,
    date,
    validUntil,
    clientName,
    items,
    notes = [
        "Validez de la oferta: 15 días calendario.",
        "Forma de pago: 50% anticipo, 50% contra entrega.",
        "Tiempo de entrega: A convenir según disponibilidad."
    ]
}: QuoteTemplateProps) {
    const [hasMounted, setHasMounted] = React.useState(false);

    React.useEffect(() => {
        setHasMounted(true);
    }, []);

    const subtotal = items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
    const iva = subtotal * 0.19;
    const total = subtotal + iva;

    const formatCurrency = (val: number) => {
        if (!hasMounted) return val.toString();
        return val.toLocaleString();
    };

    return (
        <Letterhead 
            title="COTIZACIÓN" 
            date={date} 
            reference={`N° ${quoteNumber}`}
        >
            <style jsx>{`
                .client-section {
                    margin-bottom: 2rem;
                }
                .label {
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: #9ca3af;
                    text-transform: uppercase;
                    margin-bottom: 0.25rem;
                }
                .client-value {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #111827;
                }
                
                .quote-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 2rem;
                }
                .quote-table th {
                    background-color: #1e3a8a; /* Corporate Navy Blue */
                    color: white;
                    text-align: left;
                    padding: 0.75rem;
                    font-size: 0.85rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .quote-table td {
                    padding: 0.75rem;
                    border-bottom: 1px solid #f3f4f6;
                    font-size: 0.95rem;
                }
                .text-right {
                    text-align: right;
                }

                .summary-section {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 3rem;
                }
                .summary-table {
                    width: 250px;
                }
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 0.5rem 0;
                    font-size: 0.95rem;
                }
                .summary-row.total {
                    border-top: 2px solid #111827;
                    margin-top: 0.5rem;
                    padding-top: 1rem;
                    font-weight: 800;
                    font-size: 1.1rem;
                }

                .conditions-box {
                    background-color: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-radius: 0.75rem;
                    padding: 1.5rem;
                    margin-top: 2rem;
                }
                .conditions-title {
                    font-weight: 700;
                    font-size: 0.85rem;
                    margin-bottom: 1rem;
                    color: #374151;
                }
                .conditions-list {
                    margin: 0;
                    padding-left: 1.25rem;
                    font-size: 0.85rem;
                    color: #4b5563;
                }
                .conditions-list li {
                    margin-bottom: 0.5rem;
                }

                .watermark-pattern {
                    display: none;
                }
            `}</style>
            
            <div className="watermark-pattern"></div>

            <div className="client-section" style={{ position: 'relative', zIndex: 1 }}>
                <div className="label">CLIENTE</div>
                <div className="client-value">{clientName}</div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Válido hasta: {validUntil}
                </div>
            </div>

            <table className="quote-table" style={{ position: 'relative', zIndex: 1 }}>
                <thead>
                    <tr>
                        <th>DESCRIPCIÓN</th>
                        <th className="text-right">CANT</th>
                        <th className="text-right">V. UNITARIO</th>
                        <th className="text-right">TOTAL</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, idx) => (
                        <tr key={idx}>
                            <td>{item.description}</td>
                            <td className="text-right">{item.quantity}</td>
                            <td className="text-right">${formatCurrency(item.unitPrice)}</td>
                            <td className="text-right">${formatCurrency(item.quantity * item.unitPrice)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="summary-section" style={{ position: 'relative', zIndex: 1 }}>
                <div className="summary-table">
                    <div className="summary-row">
                        <span>Subtotal</span>
                        <span>${formatCurrency(subtotal)}</span>
                    </div>
                    <div className="summary-row">
                        <span>IVA (19%)</span>
                        <span>${formatCurrency(iva)}</span>
                    </div>
                    <div className="summary-row total">
                        <span>Total</span>
                        <span>${formatCurrency(total)}</span>
                    </div>
                </div>
            </div>

            <div className="conditions-box" style={{ position: 'relative', zIndex: 1 }}>
                <div className="conditions-title">Condiciones Comerciales</div>
                <ul className="conditions-list">
                    {notes.map((note, idx) => (
                        <li key={idx}>{note}</li>
                    ))}
                </ul>
            </div>
        </Letterhead>
    );
}
