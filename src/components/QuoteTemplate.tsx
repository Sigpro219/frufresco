'use client';

import React from 'react';
import Letterhead from './Letterhead';

interface QuoteItem {
    description: string;
    quantity: number;
    unitPrice: number;
    ivaRate?: number;
    ivaAmount?: number;
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
    const iva = items.reduce((acc, item) => {
        if (item.ivaAmount !== undefined) return acc + item.ivaAmount;
        const rate = item.ivaRate !== undefined ? item.ivaRate : 19;
        return acc + (item.quantity * item.unitPrice * (rate / 100));
    }, 0);
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
                    margin-bottom: 0.85rem;
                }
                .quote-table th {
                    background-color: #0F172A;
                    color: white;
                    text-align: left;
                    padding: 3.5px 6px;
                    font-size: 0.64rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .quote-table td {
                    padding: 3px 6px;
                    border-bottom: 1px solid #E2E8F0;
                    font-size: 0.70rem;
                }
                .text-right {
                    text-align: right;
                }

                .summary-section {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 1rem;
                }
                .summary-table {
                    width: 230px;
                    background-color: #F8FAFC;
                    padding: 6px 10px;
                    border-radius: 5px;
                    border: 1px solid #E2E8F0;
                }
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 2px 0;
                    font-size: 0.72rem;
                }
                .summary-row.total {
                    border-top: 1.5px solid #0F172A;
                    margin-top: 3px;
                    padding-top: 4px;
                    font-weight: 900;
                    font-size: 0.90rem;
                }

                .conditions-box {
                    background-color: #F8FAFC;
                    border: 1px solid #E2E8F0;
                    border-radius: 6px;
                    padding: 8px 12px;
                    margin-top: 0.85rem;
                    font-size: 0.68rem;
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
                        <span>Impuestos (IVA)</span>
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
