const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../src/components/PQRFloatingWidget.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

// 1. Add isHovered state
const stateAnchor = "const [isOpen, setIsOpen] = useState(false);";
const stateCode = `const [isOpen, setIsOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);`;

if (!content.includes('const [isHovered, setIsHovered] = useState(false);')) {
    content = content.replace(stateAnchor, stateCode);
}

// 2. Replace the trigger button
const oldTriggerCode = `    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    borderRadius: '999px',
                    padding: '10px 18px 10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    boxShadow: '0 12px 28px -6px rgba(15, 23, 42, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                    border: '1px solid #1E293B',
                    cursor: 'pointer',
                    zIndex: 9999,
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    fontFamily: 'var(--font-inter), sans-serif'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.backgroundColor = '#1E293B';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.backgroundColor = '#0F172A';
                }}
                title="Radicar PQR Comercial o Novedad Interna de Planta"
            >
                <div style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    backgroundColor: '#0D7A57',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)'
                }}>
                    <MessageSquarePlus size={16} color="#FFFFFF" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '-0.01em' }}>Radicar PQR / Novedad</span>
                    <span style={{ fontSize: '0.63rem', color: '#94A3B8', fontWeight: 600 }}>Clientes • Planta • RRHH</span>
                </div>
            </button>
        );
    }`;

const newTriggerCode = `    if (!isOpen) {
        return (
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                style={{
                    position: 'fixed',
                    top: '52%',
                    right: 0,
                    transform: 'translateY(-50%)',
                    zIndex: 40,
                    backgroundColor: isHovered ? '#064E3B' : '#0F172A',
                    color: '#FFFFFF',
                    borderTopLeftRadius: '14px',
                    borderBottomLeftRadius: '14px',
                    borderTopRightRadius: 0,
                    borderBottomRightRadius: 0,
                    border: '1px solid #1E293B',
                    borderRight: 'none',
                    padding: isHovered ? '10px 18px 10px 14px' : '10px 12px 10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: isHovered ? '10px' : '8px',
                    boxShadow: isHovered 
                        ? '-6px 12px 28px rgba(13, 122, 87, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15)' 
                        : '-3px 6px 16px rgba(15, 23, 42, 0.35)',
                    cursor: 'pointer',
                    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    fontFamily: 'var(--font-inter), sans-serif',
                    outline: 'none'
                }}
                title="Radicar PQR Comercial o Novedad Interna de Planta"
            >
                {/* Indicador pulsante de servicio activo */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        backgroundColor: isHovered ? '#0D7A57' : '#1E293B',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 0 10px rgba(16, 185, 129, 0.3)'
                    }}>
                        <MessageSquarePlus size={16} color="#FFFFFF" />
                    </div>
                    {/* Pulsing Beacon Dot */}
                    <span style={{
                        position: 'absolute',
                        top: '-3px',
                        right: '-3px',
                        display: 'flex',
                        height: '9px',
                        width: '9px'
                    }}>
                        <span className="animate-ping" style={{
                            position: 'absolute',
                            display: 'inline-flex',
                            height: '100%',
                            width: '100%',
                            borderRadius: '50%',
                            backgroundColor: '#34D399',
                            opacity: 0.75
                        }} />
                        <span style={{
                            position: 'relative',
                            display: 'inline-flex',
                            borderRadius: '50%',
                            height: '9px',
                            width: '9px',
                            backgroundColor: '#10B981',
                            boxShadow: '0 0 6px #10B981'
                        }} />
                    </span>
                </div>

                {/* Contenido expandible al hover */}
                {isHovered ? (
                    <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'flex-start', 
                        lineHeight: 1.15
                    }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                            Radicar PQR / Novedad
                        </span>
                        <span style={{ fontSize: '0.63rem', color: '#A7F3D0', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Clientes • Planta • RRHH
                        </span>
                    </div>
                ) : (
                    <span style={{ 
                        fontSize: '0.72rem', 
                        fontWeight: 900, 
                        letterSpacing: '0.05em', 
                        color: '#F8FAFC',
                        textTransform: 'uppercase'
                    }}>
                        PQR
                    </span>
                )}
            </button>
        );
    }`;

// Normalize line endings for replacement
const normalize = str => str.replace(/\r\n/g, '\n');
const normalizedContent = normalize(content);
const normalizedOld = normalize(oldTriggerCode);
const normalizedNew = normalize(newTriggerCode);

if (normalizedContent.includes(normalizedOld)) {
    content = normalizedContent.replace(normalizedOld, normalizedNew);
    fs.writeFileSync(targetPath, content, 'utf8');
    console.log('Successfully patched PQRFloatingWidget with pulsing retractable side tab!');
} else {
    console.error('Old trigger code not found!');
}
