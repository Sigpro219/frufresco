'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';
import { isInsidePolygon, Point, getDistanceToPolygon } from '../lib/geoUtils';
import { Map, Marker, MapMouseEvent } from '@vis.gl/react-google-maps';
import { User, CheckCircle2, MapPin, Building2, Phone, Mail, ArrowRight, Rocket, Sparkles, FileText, Bot, Check, Plus, LayoutGrid, TrendingUp, Circle, ShoppingBag, Download, MessageSquare } from 'lucide-react';
import { translations, Locale } from '../lib/translations';
import { Polygon } from './admin/GeofencingManager';
import { normalizeCityName } from '../lib/locationNorm';

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
    options?: string[];
};

const ALL_CATEGORIES = [
  'Verduras',
  'Frutas',
  'Hortalizas',
  'Tubérculos',
  'Despensa',
  'Lácteos',
  'Congelados',
  'Procesados'
];

const BUSINESS_TYPES = ['Restaurante', 'Hotel', 'Colegio', 'Casino/Catering', 'Otro'];

const BUSINESS_SIZES = [
  'Menos de $10M COP (Pequeño)',
  'Entre $10M y $30M COP (Mediano)',
  '> $30M COP (Grande)'
];

type LeadData = {
    is_out_of_coverage: boolean;
    is_near_coverage?: boolean;
    distance_to_coverage?: number;
    wants_coverage_call?: boolean;
    company_name: string;
    nit: string;
    business_type: string;
    business_size: string; 
    selected_categories: string[];
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

    const [currentStep, setCurrentStep] = useState<number>(1); // 1: Necesidad, 2: Cobertura, 3: Contacto
    const [messages, setMessages] = useState<Message[]>([
        { id: 1, text: "¡Bienvenido! Pre-cotiza tu cuenta institucional en 3 simples pasos con precios de origen.", sender: 'bot' },
        { id: 2, text: "Paso 1 de 3: Configura el perfil y necesidades de tu operación:", sender: 'bot' }
    ]);
    
    // Step 1 Form State
    const [selectedType, setSelectedType] = useState<string>('Restaurante');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedSize, setSelectedSize] = useState<string>('');

    // Step 2 Form State
    const [addressInput, setAddressInput] = useState<string>('');
    
    // Step 3 Form State
    const [nameInput, setNameInput] = useState<string>('');
    const [phoneInput, setPhoneInput] = useState<string>('');
    const [emailInput, setEmailInput] = useState<string>('');

    const [leadData, setLeadData] = useState<LeadData>({ 
        is_out_of_coverage: false,
        is_near_coverage: false,
        distance_to_coverage: 0,
        wants_coverage_call: false,
        company_name: '', nit: '', business_type: 'Restaurante', business_size: '', 
        selected_categories: [],
        contact_name: '', phone: '', email: '', 
        address: '', municipality: '', latitude: null, longitude: null 
    });
    
    const leadDataRef = useRef<LeadData>(leadData);

    useEffect(() => {
        leadDataRef.current = leadData;
    }, [leadData]);

    const [isTyping, setIsTyping] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [quoteShown, setQuoteShown] = useState(false);
    const [isTerminated, setIsTerminated] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const [quoteId, setQuoteId] = useState<string | null>(null);
    const [b2bGeofence, setB2bGeofence] = useState<Point[]>([]);
    const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 4.67, lng: -74.06 });
    const [mapZoom, setMapZoom] = useState<number>(11);

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
        if (currentStep === 1 && messages.length <= 2) {
            if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = 0;
            }
        } else {
            scrollToBottom();
        }
    }, [messages, currentStep, isTyping]);

    // Handle Step 1 Submission -> Move to Step 2
    const handleStep1Submit = () => {
        const isAll = selectedCategories.includes('Todas') || selectedCategories.length === 0;
        const cats = isAll ? ALL_CATEGORIES : selectedCategories;
        const updatedData = {
            ...leadDataRef.current,
            business_type: selectedType,
            business_size: selectedSize,
            selected_categories: isAll ? ['Todas'] : cats
        };
        leadDataRef.current = updatedData;
        setLeadData(updatedData);

        const catsText = isAll ? 'Todas las Categorías (Catálogo Completo)' : cats.join(', ');
        setMessages(prev => [
            ...prev,
            { 
                id: Date.now(), 
                text: `Paso 1 completado: Operación ${selectedType} | Categorías: ${catsText} | Volumen: ${selectedSize}`, 
                sender: 'user' 
            }
        ]);

        setIsTyping(true);
        setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [
                ...prev,
                { 
                    id: Date.now() + 1, 
                    text: `¡Excelente elección! Tenemos tarifas especiales para tu volumen. Paso 2 de 3: Ingresa tu dirección para validar la cobertura logística en tiempo real:`, 
                    sender: 'bot' 
                }
            ]);
            setCurrentStep(2);
        }, 800);
    };

    // Handle Geocode in Step 2
    const handleGeocodeAddress = async () => {
        if (!addressInput || addressInput.trim().length < 5) {
            setError('Por favor ingresa una dirección de entrega más completa.');
            return;
        }
        setError('');
        setIsTyping(true);

        try {
            const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(addressInput)}`);
            const geoData = await geoRes.json();
            if (geoData.status === 'OK' && geoData.results && geoData.results.length > 0) {
                const loc = geoData.results[0].geometry.location;
                const lat = loc.lat;
                const lng = loc.lng;
                
                setMapCenter({ lat, lng });
                setMapZoom(15);

                const components = geoData.results[0].address_components;
                const city = components.find((c: any) => 
                    c.types.includes('locality') || 
                    c.types.includes('administrative_area_level_2')
                );
                const rawMun = city ? city.long_name : 'Bogotá';
                const mun = normalizeCityName(rawMun);

                const updatedData = {
                    ...leadDataRef.current,
                    address: addressInput,
                    latitude: lat,
                    longitude: lng,
                    municipality: mun
                };
                leadDataRef.current = updatedData;
                setLeadData(updatedData);
            }
        } catch (err) {
            console.error('Error geocoding:', err);
        } finally {
            setIsTyping(false);
        }
    };

    // Confirm Location in Step 2 -> Move to Step 3
    const handleConfirmLocation = () => {
        const lat = leadData.latitude || mapCenter.lat;
        const lng = leadData.longitude || mapCenter.lng;
        const inside = isInsidePolygon({ lat, lng }, b2bGeofence);

        if (inside) {
            const updatedData = {
                ...leadDataRef.current,
                latitude: lat,
                longitude: lng,
                is_out_of_coverage: false
            };
            leadDataRef.current = updatedData;
            setLeadData(updatedData);

            setMessages(prev => [
                ...prev,
                { id: Date.now(), text: `📍 Ubicación confirmada: ${addressInput || 'Bogotá'}`, sender: 'user' }
            ]);

            setIsTyping(true);
            setTimeout(() => {
                setIsTyping(false);
                setMessages(prev => [
                    ...prev,
                    { 
                        id: Date.now() + 1, 
                        text: `📍 ¡Ubicación confirmada en zona de cobertura activa! Paso 3 de 3: ¿A dónde enviamos tu pre-cotización en PDF y propuesta de precios?`, 
                        sender: 'bot' 
                    }
                ]);
                setCurrentStep(3);
            }, 800);
        } else {
            const distance = getDistanceToPolygon({ lat, lng }, b2bGeofence);
            const isNear = distance <= 2000;
            const updatedData = {
                ...leadDataRef.current,
                latitude: lat,
                longitude: lng,
                is_out_of_coverage: true,
                is_near_coverage: isNear,
                distance_to_coverage: distance
            };
            leadDataRef.current = updatedData;
            setLeadData(updatedData);

            setMessages(prev => [
                ...prev,
                { id: Date.now(), text: `📍 Ubicación verificada fuera de zona principal.`, sender: 'user' }
            ]);

            setIsTyping(true);
            setTimeout(() => {
                setIsTyping(false);
                if (isNear) {
                    setMessages(prev => [
                        ...prev,
                        { 
                            id: Date.now() + 1, 
                            text: `¡Estás muy cerca! Tu ubicación está a unos ${Math.round(distance)}m de nuestra zona activa. Paso 3 de 3: Déjanos tu contacto para agendar la activación especial de tu ruta:`, 
                            sender: 'bot' 
                        }
                    ]);
                    setCurrentStep(3);
                } else {
                    setMessages(prev => [
                        ...prev,
                        { id: Date.now() + 1, text: "Por el momento tu sector no está en nuestra ruta principal. Déjanos tu contacto para avisarte apenas abramos cobertura.", sender: 'bot' }
                    ]);
                    setCurrentStep(3);
                }
            }, 800);
        }
    };

    // Handle Final Step 3 Submission
    const handleStep3Submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        if (!nameInput || nameInput.trim().length < 2) {
            setError('Por favor ingresa tu nombre o el de tu empresa.');
            return;
        }
        if (!phoneInput || phoneInput.trim().length < 7) {
            setError('Por favor ingresa un número de WhatsApp válido.');
            return;
        }

        setError('');
        const finalData = {
            ...leadDataRef.current,
            company_name: nameInput.trim(),
            contact_name: nameInput.trim(),
            phone: phoneInput.trim(),
            email: emailInput.trim()
        };

        leadDataRef.current = finalData;
        setLeadData(finalData);

        setMessages(prev => [
            ...prev,
            { id: Date.now(), text: `Contacto: ${nameInput} | WA: ${phoneInput}`, sender: 'user' }
        ]);

        await submitLead(finalData);
    };

    const submitLead = async (finalData: LeadData) => {
        setIsTyping(true);
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/b2b/quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_name: finalData.company_name,
                    contact_name: finalData.contact_name,
                    phone: finalData.phone,
                    email: finalData.email,
                    business_type: finalData.business_type,
                    business_size: finalData.business_size,
                    selected_categories: finalData.selected_categories,
                    latitude: finalData.latitude,
                    longitude: finalData.longitude,
                    address: finalData.address || addressInput,
                    municipality: finalData.municipality,
                    is_out_of_coverage: finalData.is_out_of_coverage,
                    is_near_coverage: finalData.is_near_coverage,
                    distance_to_coverage: finalData.distance_to_coverage,
                    wants_coverage_call: finalData.wants_coverage_call
                })
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                throw new Error(data.error || 'Error al procesar la pre-cotización');
            }

            if (data.quoteId) {
                setQuoteId(data.quoteId);
            }

            const statusValue = data.status || 'new';

            setTimeout(() => {
                setIsTyping(false);
                const isSuccess = statusValue === 'new';
                let successMsg = isSuccess 
                    ? "¡Pre-Cotización personalizada generada con éxito! Hemos cargado la lista de productos de tus categorías con nuestras tarifas mayoristas de origen."
                    : "Hemos guardado tus datos en nuestra lista prioritaria de expansión.";
                
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    text: successMsg,
                    sender: 'bot'
                }]);
                setIsSubmitting(false);

                setIsCompleted(true);
                setQuoteShown(true);
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
            backgroundColor: '#FAFAFA',
            borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.05)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '660px',
            maxHeight: '88vh'
        }}>
            {/* Header */}
            <div style={{ 
                background: 'linear-gradient(135deg, #064E3B 0%, #047857 50%, #065F46 100%)',
                padding: '20px 24px', 
                display: 'flex', 
                flexDirection: 'column',
                gap: '16px',
                color: 'white',
                boxShadow: '0 8px 32px rgba(6, 78, 59, 0.3)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(12px)',
                position: 'relative',
                overflow: 'hidden',
                zIndex: 10
            }}>
                {/* Subtle Inner Glow Overlay */}
                <div style={{
                    position: 'absolute',
                    top: '-50%',
                    right: '-20%',
                    width: '300px',
                    height: '300px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(74, 222, 128, 0.2) 0%, rgba(0, 0, 0, 0) 70%)',
                    pointerEvents: 'none'
                }} />

                {/* Top Row: Icon, Title & Subtitle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ 
                            width: '46px', 
                            height: '46px', 
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)', 
                            borderRadius: '14px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)'
                        }}>
                            <Building2 size={24} color="#4ADE80" />
                        </div>
                        <div>
                            <h3 style={{ 
                                margin: 0, 
                                fontSize: '1.15rem', 
                                fontWeight: '800', 
                                fontFamily: 'var(--font-outfit), sans-serif',
                                letterSpacing: '-0.02em',
                                color: '#FFFFFF',
                                textShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}>Cotizador Institucional HORECA</h3>
                            <span style={{ fontSize: '0.78rem', fontWeight: '600', color: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                <Sparkles size={13} color="#4ADE80" />
                                Pre-Cotización Guiada en 3 Pasos
                            </span>
                        </div>
                    </div>
                </div>

                {/* Bottom Row: Spacious 3-Step Progress Bar */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    gap: '8px', 
                    padding: '8px 12px',
                    backgroundColor: 'rgba(0, 0, 0, 0.22)',
                    borderRadius: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 1
                }}>
                    {/* Step 1 Pill */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        borderRadius: '12px',
                        fontSize: '0.78rem',
                        fontWeight: '800',
                        backgroundColor: currentStep === 1 ? '#4ADE80' : currentStep > 1 ? 'rgba(74, 222, 128, 0.18)' : 'rgba(255, 255, 255, 0.08)',
                        color: currentStep === 1 ? '#064E3B' : currentStep > 1 ? '#4ADE80' : 'rgba(255, 255, 255, 0.65)',
                        boxShadow: currentStep === 1 ? '0 0 10px rgba(74,222,128,0.3)' : 'none',
                        border: currentStep === 1 ? '1px solid #86EFAC' : currentStep > 1 ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid transparent',
                        transition: 'all 0.3s ease'
                    }}>
                        <div style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: currentStep === 1 ? '#064E3B' : currentStep > 1 ? '#4ADE80' : 'rgba(255, 255, 255, 0.2)',
                            color: currentStep === 1 ? '#4ADE80' : currentStep > 1 ? '#064E3B' : 'rgba(255, 255, 255, 0.6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.72rem',
                            fontWeight: '900'
                        }}>
                            {currentStep > 1 ? <Check size={13} strokeWidth={3} /> : '1'}
                        </div>
                        <span>1. Necesidad</span>
                    </div>

                    <div style={{ width: '20px', height: '2px', backgroundColor: currentStep > 1 ? '#4ADE80' : 'rgba(255, 255, 255, 0.2)', borderRadius: '2px' }} />

                    {/* Step 2 Pill */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        borderRadius: '12px',
                        fontSize: '0.78rem',
                        fontWeight: '800',
                        backgroundColor: currentStep === 2 ? '#4ADE80' : currentStep > 2 ? 'rgba(74, 222, 128, 0.18)' : 'rgba(255, 255, 255, 0.08)',
                        color: currentStep === 2 ? '#064E3B' : currentStep > 2 ? '#4ADE80' : 'rgba(255, 255, 255, 0.65)',
                        boxShadow: currentStep === 2 ? '0 0 10px rgba(74,222,128,0.3)' : 'none',
                        border: currentStep === 2 ? '1px solid #86EFAC' : currentStep > 2 ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid transparent',
                        transition: 'all 0.3s ease'
                    }}>
                        <div style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: currentStep === 2 ? '#064E3B' : currentStep > 2 ? '#4ADE80' : 'rgba(255, 255, 255, 0.2)',
                            color: currentStep === 2 ? '#4ADE80' : currentStep > 2 ? '#064E3B' : 'rgba(255, 255, 255, 0.6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.72rem',
                            fontWeight: '900'
                        }}>
                            {currentStep > 2 ? <Check size={13} strokeWidth={3} /> : '2'}
                        </div>
                        <span>2. Cobertura</span>
                    </div>

                    <div style={{ width: '20px', height: '2px', backgroundColor: currentStep > 2 ? '#4ADE80' : 'rgba(255, 255, 255, 0.2)', borderRadius: '2px' }} />

                    {/* Step 3 Pill */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        borderRadius: '12px',
                        fontSize: '0.78rem',
                        fontWeight: '800',
                        backgroundColor: currentStep === 3 ? '#4ADE80' : 'rgba(255, 255, 255, 0.08)',
                        color: currentStep === 3 ? '#064E3B' : 'rgba(255, 255, 255, 0.65)',
                        boxShadow: currentStep === 3 ? '0 0 10px rgba(74,222,128,0.3)' : 'none',
                        border: currentStep === 3 ? '1px solid #86EFAC' : '1px solid transparent',
                        transition: 'all 0.3s ease'
                    }}>
                        <div style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: currentStep === 3 ? '#064E3B' : 'rgba(255, 255, 255, 0.2)',
                            color: currentStep === 3 ? '#4ADE80' : 'rgba(255, 255, 255, 0.6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.72rem',
                            fontWeight: '900'
                        }}>
                            3
                        </div>
                        <span>3. Cotización</span>
                    </div>
                </div>
            </div>

            {/* Messages Area */}
            <div 
                ref={messagesContainerRef}
                style={{ flex: 1, padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.1rem', backgroundColor: '#F8FAFC' }}
            >
                {messages.map((msg) => (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
                        <div style={{
                            background: msg.sender === 'user' ? 'linear-gradient(135deg, #064E3B 0%, #047857 100%)' : '#FFFFFF',
                            color: msg.sender === 'user' ? '#FFFFFF' : '#1E293B',
                            padding: '0.95rem 1.3rem',
                            borderRadius: msg.sender === 'user' ? '22px 22px 4px 22px' : '4px 22px 22px 22px',
                            boxShadow: msg.sender === 'user' ? '0 6px 18px rgba(6, 78, 59, 0.25)' : '0 4px 15px rgba(0, 0, 0, 0.04)',
                            fontSize: '0.9rem',
                            fontWeight: '500',
                            lineHeight: '1.55',
                            border: msg.sender === 'user' ? 'none' : '1px solid #E2E8F0',
                            fontFamily: 'var(--font-inter), sans-serif'
                        }}>
                            {msg.text}
                        </div>
                    </div>
                ))}

                {/* PASO 1 CARD: Tu Necesidad */}
                {!isCompleted && currentStep === 1 && (
                    <div style={{
                        width: '100%',
                        backgroundColor: '#FFFFFF',
                        borderRadius: '20px',
                        padding: '1.4rem',
                        border: '1.5px solid #10B981',
                        boxShadow: '0 10px 30px rgba(16, 185, 129, 0.08), 0 4px 12px rgba(0, 0, 0, 0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.1rem',
                        margin: '0.5rem 0',
                        flexShrink: 0
                    }}>
                        <div style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Sparkles size={18} color="#10B981" />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: '#064E3B', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                Paso 1: Configura tu Necesidad de Compra
                            </h4>
                        </div>

                        {/* 1. Tipo de Operacion */}
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>
                                <Building2 size={16} style={{ color: '#10B981', flexShrink: 0 }} />
                                <span>Tipo de Operación:</span>
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {BUSINESS_TYPES.map(type => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => setSelectedType(type)}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: '99px',
                                            border: selectedType === type ? '1.5px solid #10B981' : '1.5px solid #E2E8F0',
                                            backgroundColor: selectedType === type ? '#ECFDF5' : '#F8FAFC',
                                            color: selectedType === type ? '#065F46' : '#475569',
                                            fontWeight: selectedType === type ? '800' : '600',
                                            fontSize: '0.82rem',
                                            cursor: 'pointer',
                                            boxShadow: selectedType === type ? '0 2px 8px rgba(16, 185, 129, 0.15)' : 'none',
                                            transition: 'all 0.2s ease',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        {selectedType === type && <Check size={14} color="#10B981" strokeWidth={3} />}
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2. Categorias del Catalogo */}
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>
                                <LayoutGrid size={16} style={{ color: '#10B981', flexShrink: 0 }} />
                                <span>Categorías a Cotizar (Selecciona varias o Todas):</span>
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {/* Botón 'Todas' */}
                                {(() => {
                                    const isAll = selectedCategories.includes('Todas') || (selectedCategories.length === ALL_CATEGORIES.length && ALL_CATEGORIES.every(c => selectedCategories.includes(c)));
                                    return (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (isAll) {
                                                    setSelectedCategories([]);
                                                } else {
                                                    setSelectedCategories(['Todas']);
                                                }
                                            }}
                                            style={{
                                                padding: '7px 15px',
                                                borderRadius: '99px',
                                                border: isAll ? '1.5px solid #10B981' : '1.5px solid #CBD5E1',
                                                backgroundColor: isAll ? '#10B981' : '#F1F5F9',
                                                color: isAll ? '#FFFFFF' : '#334155',
                                                fontWeight: '800',
                                                fontSize: '0.82rem',
                                                cursor: 'pointer',
                                                boxShadow: isAll ? '0 2px 10px rgba(16, 185, 129, 0.3)' : 'none',
                                                transition: 'all 0.2s ease',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            {isAll ? (
                                                <CheckCircle2 size={15} color="#FFFFFF" strokeWidth={2.5} />
                                            ) : (
                                                <Sparkles size={15} style={{ color: '#10B981' }} />
                                            )}
                                            <span>Todas</span>
                                        </button>
                                    );
                                })()}

                                {ALL_CATEGORIES.map(cat => {
                                    const isAll = selectedCategories.includes('Todas');
                                    const isSel = isAll || selectedCategories.includes(cat);
                                    return (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => {
                                                if (isAll) {
                                                    setSelectedCategories(ALL_CATEGORIES.filter(c => c !== cat));
                                                } else {
                                                    setSelectedCategories(prev => {
                                                        const clean = prev.filter(c => c !== 'Todas');
                                                        return clean.includes(cat) ? clean.filter(c => c !== cat) : [...clean, cat];
                                                    });
                                                }
                                            }}
                                            style={{
                                                padding: '7px 14px',
                                                borderRadius: '99px',
                                                border: isSel ? '1.5px solid #10B981' : '1.5px solid #E2E8F0',
                                                backgroundColor: isSel ? '#ECFDF5' : '#FFFFFF',
                                                color: isSel ? '#065F46' : '#64748B',
                                                fontWeight: isSel ? '800' : '600',
                                                fontSize: '0.8rem',
                                                cursor: 'pointer',
                                                boxShadow: isSel ? '0 2px 8px rgba(16, 185, 129, 0.15)' : 'none',
                                                transition: 'all 0.2s ease',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            {isSel ? (
                                                <CheckCircle2 size={15} style={{ color: '#10B981' }} />
                                            ) : (
                                                <Plus size={15} style={{ color: '#94A3B8' }} />
                                            )}
                                            <span>{cat}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 3. Volumen de Compras */}
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>
                                <TrendingUp size={16} style={{ color: '#10B981', flexShrink: 0 }} />
                                <span>Volumen de Compras Mensual Estimado (COP):</span>
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {BUSINESS_SIZES.map(size => (
                                    <button
                                        key={size}
                                        type="button"
                                        onClick={() => setSelectedSize(size)}
                                        style={{
                                            padding: '10px 16px',
                                            borderRadius: '14px',
                                            border: selectedSize === size ? '1.5px solid #10B981' : '1.5px solid #E2E8F0',
                                            backgroundColor: selectedSize === size ? '#ECFDF5' : '#FFFFFF',
                                            color: selectedSize === size ? '#065F46' : '#334155',
                                            fontWeight: selectedSize === size ? '800' : '600',
                                            fontSize: '0.84rem',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            boxShadow: selectedSize === size ? '0 3px 10px rgba(16, 185, 129, 0.12)' : 'none',
                                            transition: 'all 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px'
                                        }}
                                    >
                                        {selectedSize === size ? (
                                            <CheckCircle2 size={18} color="#10B981" style={{ flexShrink: 0 }} />
                                        ) : (
                                            <Circle size={18} color="#CBD5E1" style={{ flexShrink: 0 }} />
                                        )}
                                        <span>{size}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleStep1Submit}
                            style={{
                                padding: '14px 20px',
                                borderRadius: '99px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                color: 'white',
                                fontWeight: '800',
                                fontSize: '0.92rem',
                                letterSpacing: '-0.01em',
                                cursor: 'pointer',
                                boxShadow: '0 6px 20px rgba(16, 185, 129, 0.35)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                marginTop: '6px',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <span>Siguiente: Validar Cobertura (Paso 2/3)</span>
                            <ArrowRight size={18} />
                        </button>
                    </div>
                )}

                {/* PASO 2 CARD: Cobertura Logistica */}
                {!isCompleted && currentStep === 2 && (
                    <div style={{
                        width: '100%',
                        backgroundColor: '#FFFFFF',
                        borderRadius: '20px',
                        padding: '1.4rem',
                        border: '1.5px solid #10B981',
                        boxShadow: '0 10px 30px rgba(16, 185, 129, 0.08), 0 4px 12px rgba(0, 0, 0, 0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.1rem',
                        margin: '0.5rem 0',
                        flexShrink: 0
                    }}>
                        <div style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <MapPin size={18} color="#10B981" />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: '#064E3B', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                Paso 2: Ubicación & Cobertura Logística
                            </h4>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={addressInput}
                                onChange={(e) => setAddressInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleGeocodeAddress();
                                    }
                                }}
                                placeholder="Ej: Carrera 7 # 12-50, Ibagué / Villavicencio / Bogotá..."
                                style={{
                                    flex: 1,
                                    padding: '11px 16px',
                                    borderRadius: '14px',
                                    border: '1.5px solid #CBD5E1',
                                    fontSize: '0.88rem',
                                    outline: 'none',
                                    backgroundColor: '#F8FAFC',
                                    transition: 'border-color 0.2s'
                                }}
                            />
                            <button
                                type="button"
                                onClick={handleGeocodeAddress}
                                style={{
                                    padding: '11px 18px',
                                    backgroundColor: '#0F172A',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '14px',
                                    fontSize: '0.82rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)'
                                }}
                            >
                                Ubicar
                            </button>
                        </div>

                        {error && <p style={{ color: '#DC2626', fontSize: '0.78rem', margin: 0, fontWeight: 'bold' }}>{error}</p>}

                        {/* Interactive Google Map */}
                        <div style={{
                            width: '100%',
                            height: '240px',
                            borderRadius: '16px',
                            overflow: 'hidden',
                            border: '1.5px solid #E2E8F0',
                            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.05)',
                            position: 'relative'
                        }}>
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
                                        setLeadData(prev => ({ ...prev, latitude: lat, longitude: lng }));
                                        leadDataRef.current = { ...leadDataRef.current, latitude: lat, longitude: lng };
                                    }
                                }}
                            >
                                {b2bGeofence && b2bGeofence.length > 0 && (
                                    <Polygon 
                                        paths={b2bGeofence}
                                        fillColor="#10B981"
                                        fillOpacity={0.15}
                                        strokeColor="#10B981"
                                        strokeWeight={1.5}
                                        clickable={false}
                                    />
                                )}
                                {(leadData.latitude || mapCenter.lat) && (
                                    <Marker position={{ lat: leadData.latitude || mapCenter.lat, lng: leadData.longitude || mapCenter.lng }} />
                                )}
                            </Map>
                        </div>

                        <button
                            type="button"
                            onClick={handleConfirmLocation}
                            style={{
                                padding: '14px 20px',
                                borderRadius: '99px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                color: 'white',
                                fontWeight: '800',
                                fontSize: '0.92rem',
                                letterSpacing: '-0.01em',
                                cursor: 'pointer',
                                boxShadow: '0 6px 20px rgba(16, 185, 129, 0.35)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <CheckCircle2 size={18} />
                            <span>Confirmar Ubicación y Cobertura (Paso 3/3)</span>
                            <ArrowRight size={18} />
                        </button>
                    </div>
                )}

                {/* PASO 3 CARD: Contacto y Envio */}
                {!isCompleted && currentStep === 3 && (
                    <form onSubmit={handleStep3Submit} style={{
                        width: '100%',
                        backgroundColor: '#FFFFFF',
                        borderRadius: '20px',
                        padding: '1.4rem',
                        border: '1.5px solid #10B981',
                        boxShadow: '0 10px 30px rgba(16, 185, 129, 0.08), 0 4px 12px rgba(0, 0, 0, 0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.1rem',
                        margin: '0.5rem 0',
                        flexShrink: 0
                    }}>
                        <div style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileText size={18} color="#10B981" />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: '#064E3B', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                Paso 3: Datos de Contacto y Envío de Pre-Cotización
                            </h4>
                        </div>

                        {error && <p style={{ color: '#DC2626', fontSize: '0.78rem', margin: 0, fontWeight: 'bold' }}>{error}</p>}

                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                                <User size={15} style={{ color: '#10B981', flexShrink: 0 }} />
                                <span>Nombre o Razón Social de tu Empresa: *</span>
                            </label>
                            <input
                                type="text"
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                                placeholder="Ej: Diana Rincón / Restaurante Gourmet"
                                required
                                style={{
                                    width: '100%',
                                    padding: '11px 16px',
                                    borderRadius: '14px',
                                    border: '1.5px solid #CBD5E1',
                                    fontSize: '0.88rem',
                                    outline: 'none',
                                    backgroundColor: '#F8FAFC'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                                <Phone size={15} style={{ color: '#10B981', flexShrink: 0 }} />
                                <span>WhatsApp Directo (para envío de propuesta PDF): *</span>
                            </label>
                            <input
                                type="tel"
                                value={phoneInput}
                                onChange={(e) => setPhoneInput(e.target.value)}
                                placeholder="Ej: 3001234567"
                                required
                                style={{
                                    width: '100%',
                                    padding: '11px 16px',
                                    borderRadius: '14px',
                                    border: '1.5px solid #CBD5E1',
                                    fontSize: '0.88rem',
                                    outline: 'none',
                                    backgroundColor: '#F8FAFC'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                                <Mail size={15} style={{ color: '#10B981', flexShrink: 0 }} />
                                <span>Correo Electrónico (Opcional):</span>
                            </label>
                            <input
                                type="email"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                placeholder="ejemplo@empresa.com"
                                style={{
                                    width: '100%',
                                    padding: '11px 16px',
                                    borderRadius: '14px',
                                    border: '1.5px solid #CBD5E1',
                                    fontSize: '0.88rem',
                                    outline: 'none',
                                    backgroundColor: '#F8FAFC'
                                }}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            style={{
                                padding: '15px 20px',
                                borderRadius: '99px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                color: 'white',
                                fontWeight: '900',
                                fontSize: '0.95rem',
                                letterSpacing: '-0.01em',
                                cursor: 'pointer',
                                boxShadow: '0 6px 20px rgba(16, 185, 129, 0.35)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                marginTop: '6px',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <FileText size={20} />
                            <span>Generar mi Pre-Cotización PDF al Instante</span>
                        </button>
                    </form>
                )}

                {isTyping && (
                    <div style={{ alignSelf: 'flex-start', backgroundColor: '#E2E8F0', padding: '0.7rem 1.1rem', borderRadius: '4px 20px 20px 20px', fontSize: '0.82rem', color: '#334155', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={14} className="animate-spin" color="#10B981" />
                        <span>FruFresco está verificando tarifas...</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Success & PDF Download Screen */}
            {isCompleted && (
                <div style={{ padding: '1.25rem 1.5rem', backgroundColor: '#ECFDF5', borderTop: '2px solid #A7F3D0', textAlign: 'center', flexShrink: 0, fontFamily: 'var(--font-outfit), sans-serif' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '0.4rem' }}>
                        <CheckCircle2 size={22} color="#059669" />
                        <h4 style={{ color: '#065F46', fontWeight: '900', margin: 0, fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
                            ¡Pre-Cotización Generada con Éxito!
                        </h4>
                    </div>
                    <p style={{ color: '#047857', fontSize: '0.82rem', marginBottom: '1rem', lineHeight: '1.45', fontWeight: '500' }}>
                        Hola <strong>{leadData.contact_name}</strong>, hemos procesado la pre-cotización para <strong>{leadData.company_name}</strong> con tarifas institucionales.
                    </p>

                    {quoteId && (
                        <div style={{ marginBottom: '1rem', padding: '0.85rem 1.1rem', backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1.5px solid #A7F3D0', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}>
                                <FileText size={18} color="#059669" />
                                <span style={{ color: '#065F46', fontWeight: '800', fontSize: '0.84rem' }}>
                                    Documento Oficial PDF
                                </span>
                            </div>
                            <a 
                                href={`/quotes/${quoteId}/print`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={{
                                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                    color: 'white',
                                    textDecoration: 'none',
                                    fontWeight: '800',
                                    padding: '7px 16px',
                                    borderRadius: '12px',
                                    fontSize: '0.82rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 3px 10px rgba(16, 185, 129, 0.25)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <Download size={15} />
                                <span>Descargar PDF</span>
                            </a>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                        {(() => {
                            const waText = encodeURIComponent(
                                `Hola FruFresco, soy ${leadData.contact_name || nameInput || 'Cliente B2B'} de ${leadData.company_name || nameInput || 'nuestra empresa'}.\n\n` +
                                `Acabo de generar la Pre-Cotización HORECA en su portal web.\n` +
                                `Operación: ${selectedType || 'HORECA'}\n` +
                                `Ubicación: ${leadData.address || addressInput}\n` +
                                `Volumen Estimado: ${selectedSize || 'Por definir'}\n\n` +
                                `Me gustaría coordinar con un Asesor Comercial la activación de mi cuenta y condiciones de despacho.`
                            );
                            const cleanPhone = (phoneInput || leadData.phone || '').replace(/[^0-9]/g, '');
                            const waTarget = cleanPhone.length === 10 ? `57${cleanPhone}` : '573101234567';
                            return (
                                <a 
                                    href={`https://wa.me/${waTarget}?text=${waText}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    style={{
                                        backgroundColor: '#059669',
                                        color: 'white',
                                        textDecoration: 'none',
                                        fontWeight: '800',
                                        padding: '7px 15px',
                                        borderRadius: '12px',
                                        fontSize: '0.8rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 3px 10px rgba(5, 150, 105, 0.2)'
                                    }}
                                >
                                    <MessageSquare size={15} />
                                    <span>Coordinar por WhatsApp</span>
                                </a>
                            );
                        })()}
                        <Link 
                            href="/" 
                            style={{
                                backgroundColor: 'white',
                                color: '#475569',
                                border: '1.5px solid #CBD5E1',
                                textDecoration: 'none',
                                fontWeight: '700',
                                padding: '7px 15px',
                                borderRadius: '12px',
                                fontSize: '0.8rem'
                            }}
                        >
                            Volver al inicio
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
