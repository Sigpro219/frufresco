
export const getFriendlyOrderId = (order: { created_at: string; sequence_id?: number; id?: string }) => {
    if (!order) return '...';
    
    // Format: DDMM_XXXX
    const date = new Date(order.created_at);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    
    // Use 4 digits for sequence as requested
    const seq = (order.sequence_id || 0).toString().padStart(4, '0');
    
    return `${day}${month}_${seq}`;
};
