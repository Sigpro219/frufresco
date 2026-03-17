'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';
import { isInsidePolygon, Point } from '../lib/geoUtils';
import { APIProvider, Map, Marker, MapMouseEvent } from '@vis.gl/react-google-maps';
import { User } from 'lucide-react';

type Message = {
    id: number;
    text: string;
    sender: 'bot' | 'user';
    options?: string[]; // Para mostrar botones de respuesta rápida
};

type LeadData = {
    company_name: string;
    business_type: string;
    business_size: string; 
    contact_name: string;
    phone: string;
    email: string;
    address: string;
    municipality: string;
    latitude: number | null;
    longitude: number | null;
};

export default function LeadGenBotV2() {
    const [messages, setMessages] = useState<Message[]>([
        { id: 1, text: 'Bienvenido. Soy el asistente de servicios corporativos de Logistics Pro.', sender: 'bot' },
        { id: 2, text: 'Me encantaría acompañarte en el proceso de activación de tu cuenta institucional con precios de origen.', sender: 'bot' },
        { id: 3, text: 'Para comenzar, ¿cuál es el nombre de tu empresa o negocio?', sender: 'bot' }
    ]);
    const [currentStep, setCurrentStep] = useState<number>(0); // 0: Co, 1: Typ, 2: Siz, 3: Address, 4: LocationConfirm, 5: Name, 6: Phone, 7: Email, 8: Done
    const [inputValue, setInputValue] = useState('');
    const [leadData, setLeadData] = useState<LeadData>({ 
        company_name: '', business_type: '', business_size: '', 
        contact_name: '', phone: '', email: '', 
        address: '', municipality: '', latitude: null, longitude: null 
    });
    // Multi-step sync: use Ref to avoid stale closure during the conversation flow
    const leadDataRef = useRef<LeadData>(leadData);
    
    // Sync ref when state changes (for UI consistency), 
    // but handleInput will primarily use/update the Ref.
    useEffect(() => {
        leadDataRef.current = leadData;
    }, [leadData]);

    const [isTyping, setIsTyping] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [quoteShown, setQuoteShown] = useState(false);
    const [isTerminated, setIsTerminated] = useState(false);
    const [b2bGeofence, setB2bGeofence] = useState<Point[]>([]);
    const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

    useEffect(() => {
        async function fetchB2BGeofence() {
            const { data } = await supabase.from('app_settings')
                .select('value')
                .eq('key', 'geofence_b2b_poly')
                .single();
            if (data) setB2bGeofence(JSON.parse(data.value));
        }
        fetchB2BGeofence();
    }, []);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleInput = async (e?: React.FormEvent, textOverride?: string, dataUpdate?: Partial<LeadData>) => {
        if (e) e.preventDefault();
        const userText = textOverride || inputValue;
        if (!userText && !dataUpdate) return;

        // Use the Ref value for the latest data, merging any new updates
        const updatedLeadData = { ...leadDataRef.current, ...dataUpdate };
        if (currentStep === 3) { // Address
            if (userText.length < 5) {
                setError('Por favor ingresa una dirección más completa.');
                return;
            }
        }
        if (currentStep === 5) { // Name
            if (userText.length < 2) {
                setError('Por favor ingresa un nombre válido');
                return;
            }
        }
        if (currentStep === 6) { // Phone
            if (userText.length < 7) {
                setError('Por favor ingresa un número válido');
                return;
            }
        }
        if (currentStep === 7) { // Email
            if (!userText.toLowerCase().includes('no') && !userText.includes('@')) {
                setError('Formato de correo inválido');
                return;
            }
        }
        setError('');

        const newMsg: Message = { id: Date.now(), text: userText, sender: 'user' };
        setMessages(prev => [...prev, newMsg]);
        setInputValue('');
        setIsTyping(true);

        let nextBotMessages: Message[] = [];

        if (currentStep === 0) { // Captured Company
            updatedLeadData.company_name = userText;
            nextBotMessages = [{ 
                id: Date.now() + 1, 
                text: `Excelente. ¿Qué tipo de operación maneja ${userText}?`, 
                sender: 'bot',
                options: ['Restaurante', 'Hotel', 'Colegio', 'Casino/Catering', 'Otro']
            }];
        } else if (currentStep === 1) { // Captured Type
            updatedLeadData.business_type = userText;
            let sizeOptions = ['Pequeño', 'Mediano', 'Grande'];
            let sizeQuestion = '¿Cuál es el tamaño aproximado de tu operación?';

            if (userText === 'Restaurante') {
                sizeQuestion = '¿Cuántas mesas o sedes manejas actualmente?';
                sizeOptions = ['Boutique (< 10 mesas)', 'Estándar (10-30 mesas)', 'Gran Formato / Cadena'];
            } else if (userText === 'Colegio') {
                sizeQuestion = '¿Qué tipo de institución atiendes?';
                sizeOptions = ['Jardín / Preescolar', 'Colegio (Primaria/Bach)', 'Universidad / Instituto'];
            } else if (userText === 'Hotel') {
                sizeQuestion = '¿Cuántas habitaciones o huéspedes manejas?';
                sizeOptions = ['Hotel Boutique (< 20 hab)', 'Mediano (20-80 hab)', 'Gran Hotel / Resort'];
            }

            nextBotMessages = [{ 
                id: Date.now() + 1, 
                text: sizeQuestion, 
                sender: 'bot',
                options: sizeOptions
            }];
        } else if (currentStep === 2) { // Captured Size
            updatedLeadData.business_size = userText;
            nextBotMessages = [
                { id: Date.now() + 1, text: 'Entendido. Esta información es clave para priorizar tu atención.', sender: 'bot' },
                { id: Date.now() + 2, text: '¿Podrías indicarnos la dirección para verificar la logística de entrega?', sender: 'bot' }
            ];
        } else if (currentStep === 3) { // Captured Address
            updatedLeadData.address = userText;
            nextBotMessages = [
                { id: Date.now() + 1, text: 'Por favor, confirma tu ubicación exacta en el mapa para habilitar los beneficios mayoristas.', sender: 'bot' }
            ];
            // We'll show a map after this message is displayed
        } else if (currentStep === 4) { // Location confirmed
            nextBotMessages = [
                { id: Date.now() + 1, text: 'Ubicación verificada. Contamos con cobertura total en tu zona.', sender: 'bot' },
                { id: Date.now() + 2, text: '¿Con quién tenemos el gusto de hablar?', sender: 'bot' }
            ];
        } else if (currentStep === 5) { // Captured Name
            updatedLeadData.contact_name = userText;
            nextBotMessages = [
                { id: Date.now() + 1, text: `Un gusto, ${userText}.`, sender: 'bot' },
                { id: Date.now() + 2, text: '¿A qué número de WhatsApp podemos enviarte el catálogo?', sender: 'bot' }
            ];
        } else if (currentStep === 6) { // Captured Phone
            updatedLeadData.phone = userText;
            nextBotMessages = [
                { id: Date.now() + 1, text: 'Perfecto.', sender: 'bot' },
                { id: Date.now() + 2, text: 'Por último, ¿tu correo electrónico? (O escribe "no" para saltar)', sender: 'bot' }
            ];
        } else if (currentStep === 7) { // Captured Email
            updatedLeadData.email = userText.toLowerCase().includes('no') ? '' : userText;
            leadDataRef.current = updatedLeadData;
            setLeadData(updatedLeadData);
            await submitLead(updatedLeadData);
            return;
        }

        // Final state and Ref sync
        leadDataRef.current = updatedLeadData;
        setLeadData(updatedLeadData);
        setCurrentStep(prev => prev + 1);

        let delay = 0;
        nextBotMessages.forEach((msg, index) => {
            delay += 1000 + (index * 800);
            setTimeout(() => {
                if (index === nextBotMessages.length - 1) setIsTyping(false);
                setMessages(prev => [...prev, msg]);
            }, delay);
        });
    };
    
    const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
        try {
            const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${MAPS_KEY}`);
            const data = await response.json();
            if (data.status === 'OK' && data.results.length > 0) {
                // Find municipality/city in address components
                const components = data.results[0].address_components;
                const city = components.find((c: any) => 
                    c.types.includes('locality') || 
                    c.types.includes('administrative_area_level_2')
                );
                return city ? city.long_name : 'Desconocido';
            }
        } catch (error) {
            console.error('Error in reverse geocoding:', error);
        }
        return 'Desconocido';
    };

    const submitLead = async (finalData: LeadData) => {
        setIsTyping(true);
        setIsSubmitting(true);
        try {
            // Construct notes from partial data if needed
            const { error } = await supabase
                .from('leads')
                .insert([{
                    company_name: finalData.company_name,
                    contact_name: finalData.contact_name,
                    phone: finalData.phone,
                    email: finalData.email,
                    business_type: finalData.business_type,
                    business_size: finalData.business_size,
                    latitude: finalData.latitude,
                    longitude: finalData.longitude,
                    notes: `📍 GPS: ${finalData.latitude},${finalData.longitude} | MUN: ${finalData.municipality || 'Desconocido'} | ORIG: ${finalData.address} | BOT_V2.1 🤖`
                }]);

            if (error) throw error;

            setTimeout(() => {
                setIsTyping(false);
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    text: 'Registro completado. Hemos recibido tus datos con éxito. Un Gerente de Cuenta se pondrá en contacto contigo a la brevedad.',
                    sender: 'bot'
                }]);
                setIsSubmitting(false); 
                setQuoteShown(true); // Activamos la visualización de cotizaciones sugeridas
            }, 1000);

        } catch (error) {
            console.error(error);
            setIsTyping(false);
            setMessages(prev => [...prev, { id: Date.now(), text: 'Ups, tuve un problema guardando tus datos. Por favor intenta de nuevo o usa el botón de WhatsApp.', sender: 'bot' }]);
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{
            backgroundColor: 'white',
            borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '600px', // Fixed height for chat container
            maxHeight: '80vh'
        }}>
            {/* Header - Premium Concierge Style */}
            <div style={{ 
                backgroundColor: 'var(--primary)', 
                padding: '20px 25px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '15px', 
                color: 'white',
                boxShadow: '0 4px 20px rgba(26, 77, 46, 0.15)',
                zIndex: 10
            }}>
                <div style={{ 
                    width: '48px', 
                    height: '48px', 
                    backgroundColor: 'rgba(255,255,255,0.2)', 
                    borderRadius: 'var(--radius-md)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.3)'
                }}>
                    <User size={24} strokeWidth={2} />
                </div>
                <div>
                    <h3 style={{ 
                        margin: 0, 
                        fontSize: '1.2rem', 
                        fontWeight: '900', 
                        fontFamily: 'var(--font-outfit), sans-serif',
                        letterSpacing: '-0.02em' 
                    }}>Asistente Personal B2B</h3>
                    <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4ADE80', boxShadow: '0 0 10px #4ADE80' }}></div>
                        Conectado · Respuesta Inmediata
                    </span>
                </div>
            </div>

            {/* Messages Area */}
            <div 
                ref={messagesContainerRef}
                style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.2rem', backgroundColor: '#F9FAFB' }}
            >
                {messages.map((msg) => (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                        <div style={{
                            backgroundColor: msg.sender === 'user' ? 'var(--primary)' : 'white',
                            color: msg.sender === 'user' ? 'white' : 'var(--text-main)',
                            padding: '1.1rem 1.4rem',
                            borderRadius: msg.sender === 'user' ? '24px 24px 4px 24px' : '4px 24px 24px 24px',
                            boxShadow: msg.sender === 'user' ? '0 10px 20px rgba(26, 77, 46, 0.2)' : '0 4px 15px rgba(0,0,0,0.03)',
                            fontSize: '0.95rem',
                            fontWeight: '500',
                            lineHeight: '1.5',
                            border: msg.sender === 'user' ? 'none' : '1px solid var(--border)',
                            fontFamily: 'var(--font-inter), sans-serif'
                        }}>
                            {msg.text}
                        </div>
                        
                        {msg.sender === 'bot' && msg.options && (currentStep === 1 || currentStep === 2) && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                                {msg.options.map(opt => (
                                    <button 
                                        key={opt}
                                        onClick={() => handleInput(undefined, opt)}
                                        className="btn-premium"
                                        style={{
                                            padding: '10px 20px',
                                            borderRadius: 'var(--radius-full)',
                                            border: '1px solid var(--primary)',
                                            backgroundColor: 'white',
                                            color: 'var(--primary)',
                                            fontWeight: '800',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(26, 77, 46, 0.08)',
                                            letterSpacing: '0.02em'
                                        }}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {currentStep === 4 && (
                    <div style={{ width: '100%', minHeight: '300px', height: '300px', borderRadius: '16px', overflow: 'hidden', border: '3px solid var(--primary)', marginTop: '1rem', marginBottom: '1rem', flexShrink: 0 }}>
                        <APIProvider apiKey={MAPS_KEY}>
                            <Map
                                defaultCenter={{ lat: 4.67, lng: -74.06 }}
                                defaultZoom={11}
                                gestureHandling={'greedy'}
                                onClick={(e: MapMouseEvent) => {
                                    const lat = e.detail?.latLng?.lat;
                                    const lng = e.detail?.latLng?.lng;
                                    if (lat && lng) {
                                        const inside = isInsidePolygon({ lat, lng }, b2bGeofence);
                                        if (inside) {
                                            setIsTerminated(false);
                                            setError('');
                                            // Get municipality before proceeding
                                            reverseGeocode(lat, lng).then(mun => {
                                                const gpsUpdate = { latitude: lat, longitude: lng, municipality: mun };
                                                handleInput(undefined, '📍 Ubicación confirmada', gpsUpdate);
                                            });
                                        } else {
                                            setIsTerminated(true);
                                            setIsTyping(true);
                                            setTimeout(() => {
                                                setIsTyping(false);
                                                setMessages(prev => [...prev, {
                                                    id: Date.now(),
                                                    text: 'Lo sentimos, por el momento Logistics Pro solo opera en Bogotá, Girardot, Melgar y Anapoima. No podemos habilitar el registro para tu ubicación actual.',
                                                    sender: 'bot'
                                                }]);
                                                setMessages(prev => [...prev, {
                                                    id: Date.now() + 1,
                                                    text: 'Guardaremos tu contacto para avisarte apenas abramos cobertura en tu zona. ¡Muchas gracias!',
                                                    sender: 'bot'
                                                }]);
                                            }, 1000);
                                        }
                                    }
                                }}
                            >
                                {leadData.latitude && leadData.longitude && (
                                    <Marker position={{ lat: leadData.latitude, lng: leadData.longitude }} />
                                )}
                            </Map>
                        </APIProvider>
                    </div>
                )}
                {isTyping && (
                    <div style={{ alignSelf: 'flex-start', backgroundColor: '#E5E7EB', padding: '0.6rem 1rem', borderRadius: '4px 20px 20px 20px', fontSize: '0.8rem', color: '#4B5563', fontWeight: '500' }}>
                        Logistics Pro está escribiendo...
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            
            {/* Input Area */}
            {(currentStep <= 7 && !isSubmitting && !isTerminated) ? (
                <form onSubmit={handleInput} style={{ padding: '1.2rem', backgroundColor: 'white', borderTop: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {error && <p style={{ color: '#DC2626', fontSize: '0.75rem', margin: '0 0 5px 10px', fontWeight: 'bold' }}>{error}</p>}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {currentStep === 4 ? (
                            <div style={{ flex: 1, padding: '1rem', backgroundColor: '#F0FDF4', color: '#166534', borderRadius: '99px', fontSize: '0.9rem', fontWeight: '700', textAlign: 'center', border: '1px dashed #166534' }}>
                                👆 Haz clic arriba en el mapa
                            </div>
                        ) : (
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => { setInputValue(e.target.value); setError(''); }}
                                placeholder={currentStep === 5 ? "Tu nombre o cargo" : currentStep === 6 ? "Ej: 3001234567" : currentStep === 7 ? "tu@correo.com" : "Escribe aquí..."}
                                autoFocus
                                style={{
                                    flex: 1,
                                    padding: '1rem 1.25rem',
                                    borderRadius: '99px',
                                    border: error ? '2px solid #DC2626' : '1px solid #D1D5DB',
                                    backgroundColor: '#F9FAFB',
                                    fontSize: '1rem',
                                    outline: 'none',
                                    transition: 'all 0.2s'
                                }}
                            />
                        )}
                        <button type="submit" disabled={currentStep === 4} style={{
                            backgroundColor: currentStep === 4 ? '#E5E7EB' : 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '54px',
                            height: '54px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.5rem',
                            cursor: currentStep === 4 ? 'default' : 'pointer',
                            transition: 'transform 0.1s'
                        }}>
                            ➤
                        </button>
                    </div>
                </form>
            ) : (
                <div style={{ padding: '1.5rem', textAlign: 'center', backgroundColor: '#F0FDF4', borderTop: '1px solid #BBF7D0' }}>
                    {isTerminated ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center', backgroundColor: '#FEF2F2', borderTop: '1px solid #FECACA' }}>
                        <p style={{ color: '#991B1B', fontWeight: '800', marginBottom: '1rem', fontSize: '1rem' }}>📍 Zona sin cobertura</p>
                        <p style={{ color: '#991B1B', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Lamentamos no poder atenderte hoy. Tu contacto ha sido registrado para futuras expansiones.</p>
                        <Link href="/" style={{ color: '#DC2626', textDecoration: 'underline', fontWeight: '700' }}>Volver al inicio</Link>
                    </div>
                ) : quoteShown ? (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <p style={{ color: '#166534', fontWeight: '800', marginBottom: '1rem', fontSize: '1.1rem' }}>📋 Planes sugeridos para ti:</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {leadData.business_type === 'Restaurante' && (
                                    <>
                                        <button className="btn" style={{ backgroundColor: 'white', border: '1px solid var(--primary)', color: 'var(--primary)', fontSize: '0.9rem', padding: '12px' }}>📦 Plan Basic: Surtido Diario AM</button>
                                        <button className="btn" style={{ backgroundColor: 'var(--primary)', color: 'white', fontSize: '0.9rem', padding: '12px' }}>🔥 Plan Pro: Todo Incluido + Mise en Place</button>
                                    </>
                                )}
                                {leadData.business_type === 'Colegio' && (
                                    <>
                                        <button className="btn" style={{ backgroundColor: 'white', border: '1px solid var(--primary)', color: 'var(--primary)', fontSize: '0.9rem', padding: '12px' }}>🍎 Menú Saludable: Fruta Seleccionada</button>
                                        <button className="btn" style={{ backgroundColor: 'var(--primary)', color: 'white', fontSize: '0.9rem', padding: '12px' }}>🏢 Plan Institucional: Trazabilidad Total</button>
                                    </>
                                )}
                                {(leadData.business_type !== 'Restaurante' && leadData.business_type !== 'Colegio') && (
                                    <button className="btn" style={{ backgroundColor: 'var(--primary)', color: 'white', fontSize: '0.9rem', padding: '12px' }}>💎 Plan Premium: Selección de Origen</button>
                                )}
                            </div>
                        </div>
                    ) : (
                         <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                            <p style={{ color: '#166534', fontWeight: '600', marginBottom: '1rem' }}>¡Conversación Finalizada!</p>
                            <Link href="/" style={{ color: 'var(--primary)', textDecoration: 'underline', fontWeight: '700' }}>Volver al inicio</Link>
                         </div>
                    )}
                </div>
            )}
        </div>
    );
}
