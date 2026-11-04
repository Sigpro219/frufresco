const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../src/components/PQRFloatingWidget.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

const oldTriggerStart = "    if (!isOpen) {";
const oldTriggerEnd = "    return (\n        <div style={{\n            position: 'fixed',\n            bottom: '20px',";
const oldTriggerEndCRLF = "    return (\r\n        <div style={{\r\n            position: 'fixed',\r\n            bottom: '20px',";

const newTriggerBlock = `    if (!isOpen) {
        return (
            <div
                style={{
                    position: 'fixed',
                    top: '52%',
                    right: 0,
                    transform: 'translateY(-50%)',
                    zIndex: 40,
                    display: 'flex',
                    alignItems: 'center',
                    fontFamily: 'var(--font-inter), sans-serif'
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Tooltip flotante hacia la izquierda en hover */}
                {isHovered && (
                    <div style={{
                        position: 'absolute',
                        right: '30px',
                        backgroundColor: '#0F172A',
                        color: '#FFFFFF',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                        border: '1px solid #334155',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        pointerEvents: 'none'
                    }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#FFFFFF' }}>
                            Radicar PQR / Novedad
                        </span>
                        <span style={{ fontSize: '0.62rem', color: '#34D399', fontWeight: 600 }}>
                            Clientes • Planta • RRHH (Clic para abrir)
                        </span>
                    </div>
                )}

                {/* Tirador Vertical Ultra-Delgado */}
                <button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    style={{
                        width: '24px',
                        minHeight: '88px',
                        backgroundColor: isHovered ? '#064E3B' : '#0F172A',
                        color: '#FFFFFF',
                        borderTopLeftRadius: '8px',
                        borderBottomLeftRadius: '8px',
                        borderTopRightRadius: 0,
                        borderBottomRightRadius: 0,
                        border: '1px solid #1E293B',
                        borderRight: 'none',
                        padding: '8px 2px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: isHovered 
                            ? '-4px 8px 20px rgba(13, 122, 87, 0.4)' 
                            : '-2px 4px 10px rgba(15, 23, 42, 0.3)',
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                        transform: isHovered ? 'translateX(-3px)' : 'translateX(0)',
                        outline: 'none'
                    }}
                    title="Radicar PQR Comercial o Novedad Interna de Planta"
                >
                    {/* Pulsing Beacon Dot */}
                    <span style={{
                        display: 'flex',
                        position: 'relative',
                        height: '7px',
                        width: '7px',
                        marginTop: '2px'
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
                            height: '7px',
                            width: '7px',
                            backgroundColor: '#10B981',
                            boxShadow: '0 0 6px #10B981'
                        }} />
                    </span>

                    {/* Icon */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '4px 0'
                    }}>
                        <MessageSquarePlus size={13} color={isHovered ? '#34D399' : '#CBD5E1'} />
                    </div>

                    {/* Vertical Letters: P - Q - R */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        fontSize: '0.62rem',
                        fontWeight: 900,
                        letterSpacing: '0.04em',
                        color: isHovered ? '#FFFFFF' : '#94A3B8',
                        lineHeight: 1.05,
                        marginBottom: '2px'
                    }}>
                        <span>P</span>
                        <span>Q</span>
                        <span>R</span>
                    </div>
                </button>
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',`;

const normalize = str => str.replace(/\r\n/g, '\n');
const normalizedContent = normalize(content);

const startIndex = normalizedContent.indexOf(oldTriggerStart);
const endIndex = normalizedContent.indexOf("    return (\n        <div style={{\n            position: 'fixed',\n            bottom: '20px',", startIndex);

if (startIndex !== -1 && endIndex !== -1) {
    const updatedContent = normalizedContent.substring(0, startIndex) + newTriggerBlock + normalizedContent.substring(endIndex + "    return (\n        <div style={{\n            position: 'fixed',\n            bottom: '20px',".length);
    fs.writeFileSync(targetPath, updatedContent, 'utf8');
    console.log('Successfully patched PQRFloatingWidget to ultra-slim vertical ribbon!');
} else {
    console.error('Could not find slice boundaries for trigger button:', { startIndex, endIndex });
}
