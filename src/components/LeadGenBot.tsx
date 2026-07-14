'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';
import { isInsidePolygon, Point } from '../lib/geoUtils';
import { Map, Marker, MapMouseEvent } from '@vis.gl/react-google-maps';
import { User } from 'lucide-react';
import { translations, Locale } from '../lib/translations';
import { Polygon } from './admin/GeofencingManager';

const mapMinimalistStyles = [
  {
    "elementType": "geometry",
    "stylers": [{ "color": "#f5f5f5" }]
  },
  {
    "elementType": "labels.icon",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#616161" }]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [{ "color": "#f5f5f5" }]
  },
  {
    "featureType": "poi",
    "elementType": "geometry",
    "stylers": [{ "color": "#eeeeee" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [{ "color": "#ffffff" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [{ "color": "#dadada" }]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [{ "color": "#c9c9c9" }]
  }
];

type Message = {
    id: number;
    text: string;
    sender: 'bot' | 'user';
    options?: string[]; // Para mostrar botones de respuesta rápida
};

type LeadData = {
    is_out_of_coverage: boolean;
    company_name: string;
    nit: string;
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

export default function LeadGenBotV2({ lang = 'es' }: { lang?: string }) {
    const locale = (lang === 'en' ? 'en' : 'es') as Locale;
    const t = translations[locale];

    const [messages, setMessages] = useState<Message[]>([
        { id: 1, text: t.b2b.bot.welcome, sender: 'bot' },
        { id: 2, text: t.b2b.bot.intro, sender: 'bot' },
        { id: 3, text: t.b2b.bot.qCompany, sender: 'bot' }
    ]);
    const [currentStep, setCurrentStep] = useState<number>(0); 
    const [inputValue, setInputValue] = useState('');
    const [leadData, setLeadData] = useState<LeadData>({ 
        is_out_of_coverage: false,
        company_name: '', nit: '', business_type: '', business_size: '', 
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
    const [isCompleted, setIsCompleted] = useState(false);
    const [b2bGeofence, setB2bGeofence] = useState<Point[]>([]);
    const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 4.67, lng: -74.06 });
    const [mapZoom, setMapZoom] = useState<number>(11);
    const [mapExpanded, setMapExpanded] = useState<boolean>(false);
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
        if (currentStep === 1) { // Contact Name
            if (userText.length < 2) {
                setError(locale === 'en' ? 'Please enter a valid name.' : 'Por favor ingresa un nombre válido');
                return;
            }
        }
        if (currentStep === 2) { // Address
            if (userText.length < 5) {
                setError(locale === 'en' ? 'Please enter a more complete address.' : 'Por favor ingresa una dirección más completa.');
                return;
            }
        }
        if ((!updatedLeadData.is_out_of_coverage && currentStep === 7) || (updatedLeadData.is_out_of_coverage && currentStep === 4)) { // Phone
            if (userText.length < 7) {
                setError(locale === 'en' ? 'Please enter a valid number.' : 'Por favor ingresa un número válido');
                return;
            }
        }
        if ((!updatedLeadData.is_out_of_coverage && currentStep === 8) || (updatedLeadData.is_out_of_coverage && currentStep === 5)) { // Email
            if (!userText.toLowerCase().includes('no') && !userText.includes('@')) {
                setError(locale === 'en' ? 'Invalid email format' : 'Formato de correo inválido');
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
                text: t.b2b.bot.qName, 
                sender: 'bot'
            }];
        } else if (currentStep === 1) { // Captured Contact Name
            updatedLeadData.contact_name = userText;
            nextBotMessages = [{ 
                id: Date.now() + 1, 
                text: t.b2b.bot.qAddress, 
                sender: 'bot'
            }];
        } else if (currentStep === 2) { // Captured Address
            updatedLeadData.address = userText;
            
            // Geocode the address using Google Maps Geocoder API
            try {
                const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(userText)}`);
                const geoData = await geoRes.json();
                if (geoData.status === 'OK' && geoData.results && geoData.results.length > 0) {
                    const loc = geoData.results[0].geometry.location;
                    const lat = loc.lat;
                    const lng = loc.lng;
                    updatedLeadData.latitude = lat;
                    updatedLeadData.longitude = lng;
                    
                    // Center and zoom map to this location
                    setMapCenter({ lat, lng });
                    setMapZoom(15);
                    
                    // Extract municipality
                    const components = geoData.results[0].address_components;
                    const city = components.find((c: any) => 
                        c.types.includes('locality') || 
                        c.types.includes('administrative_area_level_2')
                    );
                    updatedLeadData.municipality = city ? city.long_name : 'Desconocido';
                }
            } catch (err) {
                console.error('Error geocoding address:', err);
            }

            nextBotMessages = [
                { id: Date.now() + 1, text: t.b2b.bot.qLocation, sender: 'bot' }
            ];
        } else if (currentStep === 3) { // Location confirmed (via map, click triggers step 4 next messages)
            nextBotMessages = [{ 
                id: Date.now() + 1, 
                text: t.b2b.bot.qType.replace('{name}', updatedLeadData.company_name), 
                sender: 'bot',
                options: locale === 'en' ? ['Restaurant', 'Hotel', 'School', 'Casino/Catering', 'Other'] : ['Restaurante', 'Hotel', 'Colegio', 'Casino/Catering', 'Otro']
            }];
        } else if (!updatedLeadData.is_out_of_coverage) {
            // IN COVERAGE Normal B2B Flow
            if (currentStep === 4) { // Captured Type
                updatedLeadData.business_type = userText;
                let sizeOptions = locale === 'en' ? ['Small', 'Medium', 'Large'] : ['Pequeño', 'Mediano', 'Grande'];
                let sizeQuestion = t.b2b.bot.qSize;

                if (userText === 'Restaurante' || userText === 'Restaurant') {
                    sizeQuestion = locale === 'en' ? 'How many tables or locations do you currently manage?' : '¿Cuántas mesas o sedes manejas actualmente?';
                    sizeOptions = locale === 'en' ? ['Boutique (< 10 tables)', 'Standard (10-30 tables)', 'Chain / Large Format'] : ['Boutique (< 10 mesas)', 'Estándar (10-30 mesas)', 'Gran Formato / Cadena'];
                } else if (userText === 'Colegio' || userText === 'School') {
                    sizeQuestion = locale === 'en' ? 'What type of institution do you serve?' : '¿Qué tipo de institución atiendes?';
                    sizeOptions = locale === 'en' ? ['Preschool', 'K-12 School', 'University / Institute'] : ['Jardín / Preescolar', 'Colegio (Primaria/Bach)', 'Universidad / Instituto'];
                } else if (userText === 'Hotel') {
                    sizeQuestion = locale === 'en' ? 'How many rooms or guests do you manage?' : '¿Cuántas habitaciones o huéspedes manejas?';
                    sizeOptions = locale === 'en' ? ['Boutique (< 20 rooms)', 'Medium (20-80 rooms)', 'Resort / Large Hotel'] : ['Hotel Boutique (< 20 hab)', 'Mediano (20-80 hab)', 'Gran Hotel / Resort'];
                }

                nextBotMessages = [{ 
                    id: Date.now() + 1, 
                    text: sizeQuestion, 
                    sender: 'bot',
                    options: sizeOptions
                }];
            } else if (currentStep === 5) { // Captured Size
                updatedLeadData.business_size = userText;
                nextBotMessages = [
                    { id: Date.now() + 1, text: locale === 'en' ? 'Understood. This information is key to prioritizing your care.' : 'Entendido. Esta información es clave para priorizar tu atención.', sender: 'bot' },
                    { id: Date.now() + 2, text: t.b2b.bot.qNit, sender: 'bot' }
                ];
            } else if (currentStep === 6) { // Captured NIT
                updatedLeadData.nit = userText.toLowerCase().includes('no') ? '' : userText.replace(/[^0-9-]/g, '');
                nextBotMessages = [{ 
                    id: Date.now() + 1, 
                    text: t.b2b.bot.qPhone, 
                    sender: 'bot'
                }];
            } else if (currentStep === 7) { // Captured Phone
                updatedLeadData.phone = userText;
                nextBotMessages = [{ 
                    id: Date.now() + 1, 
                    text: t.b2b.bot.qEmail, 
                    sender: 'bot'
                }];
            } else if (currentStep === 8) { // Captured Email
                updatedLeadData.email = userText.toLowerCase().includes('no') ? '' : userText;
                leadDataRef.current = updatedLeadData;
                setLeadData(updatedLeadData);
                await submitLead(updatedLeadData);
                return;
            }
        } else {
            // OUT OF COVERAGE Waitlist Flow
            if (currentStep === 4) { // Captured Phone for Waitlist
                updatedLeadData.phone = userText;
                nextBotMessages = [{ 
                    id: Date.now() + 1, 
                    text: (t.b2b.bot as any).outOfZoneEmail, 
                    sender: 'bot'
                }];
            } else if (currentStep === 5) { // Captured Email for Waitlist
                updatedLeadData.email = userText.toLowerCase().includes('no') ? '' : userText;
                leadDataRef.current = updatedLeadData;
                setLeadData(updatedLeadData);
                await submitLead(updatedLeadData);
                return;
            }
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
            console.log('--- 🛰️ REVERSE GEOCODING VÍA PROXY ---');
            const response = await fetch(`/api/geocode?latlng=${lat},${lng}`);
            const data = await response.json();
            
            if (data.status === 'OK' && data.results && data.results.length > 0) {
                // Find municipality/city in address components
                const components = data.results[0].address_components;
                const city = components.find((c: any) => 
                    c.types.includes('locality') || 
                    c.types.includes('administrative_area_level_2')
                );
                return city ? city.long_name : 'Desconocido';
            }
        } catch (error) {
            console.error('Error in reverse geocoding proxy:', error);
        }
        return 'Desconocido';
    };

    const submitLead = async (finalData: LeadData) => {
        setIsTyping(true);
        setIsSubmitting(true);
        try {
            const notesTag = finalData.is_out_of_coverage ? ' | [ZONA SIN COBERTURA]' : '';
            const statusValue = finalData.is_out_of_coverage ? 'rejected' : 'new';
            // Construct notes from partial data if needed
            const { error } = await supabase
                .from('leads')
                .insert([{
                    company_name: finalData.company_name,
                    nit: finalData.nit && !isNaN(parseInt(finalData.nit.replace(/[^0-9]/g, ''))) ? parseInt(finalData.nit.replace(/[^0-9]/g, '')) : null,
                    contact_name: finalData.contact_name,
                    phone: finalData.phone,
                    email: finalData.email,
                    business_type: finalData.business_type || 'No especificado',
                    business_size: finalData.business_size || 'No especificado',
                    latitude: finalData.latitude,
                    longitude: finalData.longitude,
                    address: finalData.address,
                    municipality: finalData.municipality || 'Desconocido',
                    status: statusValue,
                    notes: `📍 GPS: ${finalData.latitude},${finalData.longitude} | MUN: ${finalData.municipality || 'Desconocido'} | ORIG: ${finalData.address}${notesTag} | BOT_V2.2 🤖`
                }]);

            if (error) throw error;

            setTimeout(() => {
                setIsTyping(false);
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    text: finalData.is_out_of_coverage ? (t.b2b.bot as any).outOfZoneSuccess : t.b2b.bot.success,
                    sender: 'bot'
                }]);
                setIsSubmitting(false); 
                if (!finalData.is_out_of_coverage) {
                    setIsCompleted(true);
                    setQuoteShown(true); // Activamos la visualización de cotizaciones sugeridas
                } else {
                    setIsTerminated(true);
                }
            }, 1000);

        } catch (error) {
            console.error(error);
            setIsTyping(false);
            setMessages(prev => [...prev, { id: Date.now(), text: t.b2b.bot.error, sender: 'bot' }]);
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
                    width: '52px', 
                    height: '52px', 
                    backgroundColor: 'rgba(255,255,255,0.2)', 
                    borderRadius: '50%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    backdropFilter: 'blur(10px)',
                    border: '2px solid rgba(255,255,255,0.4)',
                    overflow: 'hidden'
                }}>
                    <img src="/assistant_avatar.png" alt="Asistente" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div>
                    <h3 style={{ 
                        margin: 0, 
                        fontSize: '1.2rem', 
                        fontWeight: '900', 
                        fontFamily: 'var(--font-outfit), sans-serif',
                        letterSpacing: '-0.02em' 
                    }}>Asistente Clientes Institucionales</h3>
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
                        
                        {msg.sender === 'bot' && msg.options && (currentStep === 4 || currentStep === 5) && (
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

                {currentStep === 3 && (
                    <div style={{ 
                        width: '100%', 
                        minHeight: mapExpanded ? '480px' : '300px', 
                        height: mapExpanded ? '480px' : '300px', 
                        borderRadius: '16px', 
                        overflow: 'hidden', 
                        border: '3px solid var(--primary)', 
                        marginTop: '1rem', 
                        marginBottom: '1rem', 
                        flexShrink: 0,
                        transition: 'all 0.3s ease-in-out',
                        position: 'relative'
                    }}>
                        <button 
                            type="button"
                            onClick={() => setMapExpanded(!mapExpanded)}
                            style={{
                                position: 'absolute',
                                top: '10px',
                                right: '10px',
                                zIndex: 1000,
                                backgroundColor: 'white',
                                border: '1px solid #D1D5DB',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                                fontWeight: 'bold',
                                color: '#374151',
                                cursor: 'pointer',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontFamily: 'var(--font-inter), sans-serif'
                            }}
                        >
                            {mapExpanded ? '🔍 Contraer Mapa' : '🔍 Expandir Mapa'}
                        </button>
                        <Map
                                center={mapCenter}
                                zoom={mapZoom}
                                onCameraChanged={(ev) => {
                                    setMapCenter(ev.detail.center);
                                    setMapZoom(ev.detail.zoom);
                                }}
                                gestureHandling={'greedy'}
                                styles={mapMinimalistStyles}
                                onClick={(e: MapMouseEvent) => {
                                    const lat = e.detail?.latLng?.lat;
                                    const lng = e.detail?.latLng?.lng;
                                    if (lat && lng) {
                                        const inside = isInsidePolygon({ lat, lng }, b2bGeofence);
                                        reverseGeocode(lat, lng).then(mun => {
                                            if (inside) {
                                                setIsTerminated(false);
                                                setError('');
                                                const gpsUpdate = { latitude: lat, longitude: lng, municipality: mun, is_out_of_coverage: false };
                                                handleInput(undefined, '📍 Ubicación confirmada', gpsUpdate);
                                            } else {
                                                const gpsUpdate = { latitude: lat, longitude: lng, municipality: mun, is_out_of_coverage: true };
                                                setLeadData(prev => ({ ...prev, ...gpsUpdate }));
                                                leadDataRef.current = { ...leadDataRef.current, ...gpsUpdate };
                                                setIsTyping(true);
                                                setTimeout(() => {
                                                    setIsTyping(false);
                                                    setMessages(prev => [...prev, 
                                                        { id: Date.now(), text: t.b2b.bot.outOfZone, sender: 'bot' },
                                                        { id: Date.now() + 1, text: (t.b2b.bot as any).outOfZoneWaitlist, sender: 'bot' }
                                                    ]);
                                                    setCurrentStep(4); // Advance directly to waitlist phone step
                                                }, 1000);
                                            }
                                        });
                                    }
                                }}
                            >
                                {b2bGeofence && b2bGeofence.length > 0 && (
                                    <Polygon 
                                        paths={b2bGeofence}
                                        fillColor="#10B981"
                                        fillOpacity={0.12}
                                        strokeColor="#10B981"
                                        strokeWeight={1.5}
                                        clickable={false}
                                    />
                                )}
                                {leadData.latitude && leadData.longitude && (
                                    <Marker position={{ lat: leadData.latitude, lng: leadData.longitude }} />
                                )}
                            </Map>
                    </div>
                )}
                {isTyping && (
                    <div style={{ alignSelf: 'flex-start', backgroundColor: '#E5E7EB', padding: '0.6rem 1rem', borderRadius: '4px 20px 20px 20px', fontSize: '0.8rem', color: '#4B5563', fontWeight: '500' }}>
                        {t.b2b.bot.typing}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            
            {/* Input Area */}
            {(!isCompleted && !isSubmitting && !isTerminated) ? (
                <form onSubmit={handleInput} style={{ padding: '1.2rem', backgroundColor: 'white', borderTop: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {error && <p style={{ color: '#DC2626', fontSize: '0.75rem', margin: '0 0 5px 10px', fontWeight: 'bold' }}>{error}</p>}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {currentStep === 3 ? (
                            leadData.latitude && leadData.longitude ? (
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        const lat = leadData.latitude!;
                                        const lng = leadData.longitude!;
                                        const inside = isInsidePolygon({ lat, lng }, b2bGeofence);
                                        if (inside) {
                                            const gpsUpdate = { is_out_of_coverage: false };
                                            handleInput(undefined, '📍 Ubicación confirmada', gpsUpdate);
                                        } else {
                                            const gpsUpdate = { is_out_of_coverage: true };
                                            setLeadData(prev => ({ ...prev, ...gpsUpdate }));
                                            leadDataRef.current = { ...leadDataRef.current, ...gpsUpdate };
                                            setIsTyping(true);
                                            setTimeout(() => {
                                                setIsTyping(false);
                                                setMessages(prev => [...prev, 
                                                    { id: Date.now(), text: t.b2b.bot.outOfZone, sender: 'bot' },
                                                    { id: Date.now() + 1, text: (t.b2b.bot as any).outOfZoneWaitlist, sender: 'bot' }
                                                ]);
                                                setCurrentStep(4);
                                            }, 1000);
                                        }
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: '1rem',
                                        backgroundColor: '#10B981',
                                        color: 'white',
                                        borderRadius: '99px',
                                        fontSize: '1rem',
                                        fontWeight: '700',
                                        textAlign: 'center',
                                        border: 'none',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    ✅ Confirmar Ubicación Actual
                                </button>
                            ) : (
                                <div style={{ flex: 1, padding: '1rem', backgroundColor: '#F0FDF4', color: '#166534', borderRadius: '99px', fontSize: '0.9rem', fontWeight: '700', textAlign: 'center', border: '1px dashed #166534' }}>
                                    👆 Haz clic arriba en el mapa
                                </div>
                            )
                        ) : (
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => { setInputValue(e.target.value); setError(''); }}
                                placeholder={
                                    currentStep === 6 && !leadData.is_out_of_coverage ? (locale === 'en' ? "E.g. 901234567-1 (Optional)" : "Ej: 901234567-1 (Opcional)") :
                                    currentStep === 1 ? (locale === 'en' ? "Your name or position" : "Tu nombre o cargo") : 
                                    ((!leadData.is_out_of_coverage && currentStep === 7) || (leadData.is_out_of_coverage && currentStep === 4)) ? (locale === 'en' ? "E.g. 3001234567" : "Ej: 3001234567") : 
                                    ((!leadData.is_out_of_coverage && currentStep === 8) || (leadData.is_out_of_coverage && currentStep === 5)) ? "you@email.com" : 
                                    t.b2b.bot.placeholder
                                }
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
                        <button type="submit" disabled={currentStep === 3} style={{
                            backgroundColor: currentStep === 3 ? '#E5E7EB' : 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '54px',
                            height: '54px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.5rem',
                            cursor: currentStep === 3 ? 'default' : 'pointer',
                            transition: 'transform 0.1s'
                        }}>
                            ➤
                        </button>
                    </div>
                </form>
            ) : (
                <div style={{ padding: '1.5rem', backgroundColor: '#F0FDF4', borderTop: '1px solid #BBF7D0', textAlign: 'center' }}>
                    {isTerminated ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', backgroundColor: '#FEF2F2', borderTop: '1px solid #FECACA', borderRadius: '16px' }}>
                            <p style={{ color: '#991B1B', fontWeight: '800', marginBottom: '1rem', fontSize: '1.1rem' }}>📍 {locale === 'en' ? 'Out of coverage zone' : 'Zona sin cobertura'}</p>
                            <p style={{ color: '#991B1B', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                                {locale === 'en' 
                                    ? `Thank you for your interest, ${leadData.contact_name}. We have successfully registered ${leadData.company_name} on our waitlist. We will notify you at ${leadData.phone} or ${leadData.email} as soon as we expand to ${leadData.municipality || 'your area'}.` 
                                    : `Gracias por tu interés, ${leadData.contact_name}. Hemos registrado con éxito a ${leadData.company_name} en nuestra lista de espera. Te avisaremos al WhatsApp ${leadData.phone} o al correo ${leadData.email} apenas abramos cobertura en ${leadData.municipality || 'tu zona'}.`}
                            </p>
                            <Link href="/" style={{
                                backgroundColor: 'white',
                                color: '#991B1B',
                                border: '1px solid #FECACA',
                                textDecoration: 'none',
                                fontWeight: '700',
                                padding: '10px 20px',
                                borderRadius: '99px',
                                fontSize: '0.9rem',
                                display: 'inline-block'
                            }}>
                                {locale === 'en' ? 'Back to home' : 'Volver al inicio'}
                            </Link>
                        </div>
                    ) : isCompleted ? (
                        <div>
                            <p style={{ color: '#166534', fontWeight: '800', marginBottom: '0.8rem', fontSize: '1.1rem' }}>🎉 ¡Registro B2B Exitoso!</p>
                            <p style={{ color: '#166534', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                                Hola <strong>{leadData.contact_name}</strong>, hemos recibido los datos de <strong>{leadData.company_name}</strong>.<br />
                                Un asesor comercial se comunicará contigo al WhatsApp <strong>{leadData.phone}</strong> en menos de 2 horas para formalizar tu tarifa especial y activar tu cuenta.
                            </p>
                            {quoteShown && (
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <p style={{ color: '#166534', fontWeight: '800', marginBottom: '1rem', fontSize: '1rem' }}>📋 Planes sugeridos para tu negocio:</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {leadData.business_type === 'Restaurante' && (
                                            <>
                                                <button className="btn" style={{ backgroundColor: 'white', border: '1px solid var(--primary)', color: 'var(--primary)', fontSize: '0.9rem', padding: '12px', borderRadius: '12px', fontWeight: 'bold' }}>📦 Plan Basic: Surtido Diario AM</button>
                                                <button className="btn" style={{ backgroundColor: 'var(--primary)', color: 'white', fontSize: '0.9rem', padding: '12px', borderRadius: '12px', fontWeight: 'bold' }}>🔥 Plan Pro: Todo Incluido + Mise en Place</button>
                                            </>
                                        )}
                                        {leadData.business_type === 'Colegio' && (
                                            <>
                                                <button className="btn" style={{ backgroundColor: 'white', border: '1px solid var(--primary)', color: 'var(--primary)', fontSize: '0.9rem', padding: '12px', borderRadius: '12px', fontWeight: 'bold' }}>🍎 Menú Saludable: Fruta Seleccionada</button>
                                                <button className="btn" style={{ backgroundColor: 'var(--primary)', color: 'white', fontSize: '0.9rem', padding: '12px', borderRadius: '12px', fontWeight: 'bold' }}>🏢 Plan Institucional: Trazabilidad Total</button>
                                            </>
                                        )}
                                        {(leadData.business_type !== 'Restaurante' && leadData.business_type !== 'Colegio') && (
                                            <button className="btn" style={{ backgroundColor: 'var(--primary)', color: 'white', fontSize: '0.9rem', padding: '12px', borderRadius: '12px', fontWeight: 'bold' }}>💎 Plan Premium: Selección de Origen</button>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '1rem' }}>
                                <a href={`https://wa.me/57${leadData.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{
                                    backgroundColor: '#25D366',
                                    color: 'white',
                                    textDecoration: 'none',
                                    fontWeight: '700',
                                    padding: '10px 20px',
                                    borderRadius: '99px',
                                    fontSize: '0.9rem',
                                    boxShadow: '0 4px 12px rgba(37, 211, 102, 0.2)'
                                }}>
                                    💬 Chatear por WhatsApp
                                </a>
                                <Link href="/" style={{
                                    backgroundColor: 'white',
                                    color: 'var(--text-main)',
                                    border: '1px solid #D1D5DB',
                                    textDecoration: 'none',
                                    fontWeight: '700',
                                    padding: '10px 20px',
                                    borderRadius: '99px',
                                    fontSize: '0.9rem'
                                }}>
                                    Volver al inicio
                                </Link>
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
