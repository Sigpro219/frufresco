const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../src/app/admin/orders/loading/page.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

// 1. Add currentTime state and useEffect for real-time timer
const targetStateAnchor = "const [cutoffHourState, setCutoffHourState] = useState(20);";
const stateCode = `const [cutoffHourState, setCutoffHourState] = useState(20);
    const [currentTime, setCurrentTime] = useState(() => getColombiaTime());

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(getColombiaTime());
        }, 1000);
        return () => clearInterval(timer);
    }, []);`;

if (!content.includes('const [currentTime, setCurrentTime] = useState')) {
    content = content.replace(targetStateAnchor, stateCode);
}

// 2. Wrap tabs in flex container with Countdown Telemetry
const targetTabsStart = `{/* TABS FOR ORDERS VS EMAILS (PILL / SEGMENTED CONTROL CORPORATIVO) */}
                    <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center',
                        gap: '6px', 
                        backgroundColor: '#E2E8F0',
                        padding: '4px',
                        borderRadius: '10px',
                        marginBottom: activeTab === 'orders' ? '0.6rem' : '0', 
                        border: '1px solid #CBD5E1'
                    }}>`;

const newTabsStart = `{/* TOP BAR: TABS (LEFT) + REAL-TIME CUTOFF TELEMETRY / COUNTDOWN (RIGHT) */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px',
                        marginBottom: activeTab === 'orders' ? '0.6rem' : '0'
                    }}>
                        {/* TABS FOR ORDERS VS EMAILS (PILL / SEGMENTED CONTROL CORPORATIVO) */}
                        <div style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center',
                            gap: '6px', 
                            backgroundColor: '#E2E8F0',
                            padding: '4px',
                            borderRadius: '10px',
                            border: '1px solid #CBD5E1'
                        }}>`;

const targetTabsEnd = `                        </button>
                    </div>

                    {activeTab === 'orders' && (`;

const countdownWidgetCode = `                        </button>
                        </div>

                        {/* COUNTDOWN WIDGET / TELEMETRÍA EN VIVO DE CORTE OPERATIVO */}
                        {(() => {
                            const bogotaNow = currentTime;
                            const targetCutoff = new Date(bogotaNow);
                            targetCutoff.setHours(cutoffHourState, 0, 0, 0);

                            const diffMs = targetCutoff.getTime() - bogotaNow.getTime();
                            const cutoffLabel = cutoffHourState > 12 ? \`\${cutoffHourState - 12}:00 PM\` : \`\${cutoffHourState}:00 AM\`;

                            if (!cutoffRulesActive) {
                                return (
                                    <div 
                                        title="Las reglas de corte están desactivadas en Ajustes (/admin/settings). El equipo puede radicar y modificar pedidos para mañana a cualquier hora."
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '5px 14px',
                                            borderRadius: '8px',
                                            backgroundColor: '#ECFDF5',
                                            border: '1px solid #A7F3D0',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                            cursor: 'default'
                                        }}
                                    >
                                        <span style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            backgroundColor: '#10B981',
                                            boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.25)'
                                        }} />
                                        <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#065F46', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                                            Horario Flexible Activo
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#047857', fontWeight: '600' }}>
                                            • Sin Límite de Corte (Sugerido {cutoffLabel})
                                        </span>
                                    </div>
                                );
                            }

                            if (diffMs <= 0) {
                                return (
                                    <div 
                                        title="La hora de corte para despacho de mañana ya finalizó. Pedidos nuevos o extemporáneos se programan automáticamente para D+2 salvo bypass administrativo."
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '5px 14px',
                                            borderRadius: '8px',
                                            backgroundColor: '#F1F5F9',
                                            border: '1px solid #CBD5E1',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                            cursor: 'default'
                                        }}
                                    >
                                        <Lock size={14} style={{ color: '#475569' }} />
                                        <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                            Corte Finalizado ({cutoffLabel})
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '600' }}>
                                            • Nuevos pedidos pasan a D+2
                                        </span>
                                    </div>
                                );
                            }

                            const totalSeconds = Math.floor(diffMs / 1000);
                            const hours = Math.floor(totalSeconds / 3600);
                            const minutes = Math.floor((totalSeconds % 3600) / 60);
                            const seconds = totalSeconds % 60;
                            const pad = (n: number) => String(n).padStart(2, '0');

                            const isImminent = totalSeconds < 15 * 60;
                            const isWarning = totalSeconds < 60 * 60;

                            const bg = isImminent ? '#FEF2F2' : isWarning ? '#FFFBEB' : '#F0FDF4';
                            const border = isImminent ? '#FCA5A5' : isWarning ? '#FDE68A' : '#BBF7D0';
                            const textMain = isImminent ? '#991B1B' : isWarning ? '#92400E' : '#166534';

                            return (
                                <div 
                                    title={\`Corte de operaciones programado hoy a las \${cutoffLabel}. A partir de esa hora no se pueden recibir pedidos para entrega mañana.\`}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '5px 14px',
                                        borderRadius: '8px',
                                        backgroundColor: bg,
                                        border: \`1px solid \${border}\`,
                                        boxShadow: isImminent ? '0 0 10px rgba(239, 68, 68, 0.25)' : '0 1px 3px rgba(0,0,0,0.04)',
                                        cursor: 'default',
                                        transition: 'all 0.3s ease'
                                    }}
                                >
                                    <Clock size={15} style={{ color: textMain }} />
                                    <span style={{ fontSize: '0.72rem', fontWeight: '800', color: textMain, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                        {isImminent ? '⚠️ Cierre Inminente:' : 'Cierre de Operación:'}
                                    </span>
                                    <span style={{ 
                                        fontFamily: 'monospace, monospace', 
                                        fontSize: '0.88rem', 
                                        fontWeight: '900', 
                                        color: textMain,
                                        backgroundColor: 'rgba(255,255,255,0.85)',
                                        padding: '2px 7px',
                                        borderRadius: '5px',
                                        border: \`1px solid \${border}\`,
                                        letterSpacing: '0.05em'
                                    }}>
                                        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
                                    </span>
                                    <span style={{ fontSize: '0.71rem', color: textMain, opacity: 0.9, fontWeight: '700' }}>
                                        ({cutoffLabel})
                                    </span>
                                </div>
                            );
                        })()}
                    </div>

                    {activeTab === 'orders' && (`;

if (content.includes(targetTabsStart)) {
    content = content.replace(targetTabsStart, newTabsStart);
} else {
    console.error('Target tabs start not found!');
}

if (content.includes(targetTabsEnd)) {
    content = content.replace(targetTabsEnd, countdownWidgetCode);
} else {
    console.error('Target tabs end not found!');
}

fs.writeFileSync(targetPath, content, 'utf8');
console.log('Successfully patched orders loading page with countdown telemetry!');
