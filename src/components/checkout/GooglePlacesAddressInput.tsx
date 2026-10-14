'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2, CheckCircle2, AlertTriangle, Compass, X } from 'lucide-react';

interface GooglePlacesAddressInputProps {
    address: string;
    onAddressChange: (address: string) => void;
    latitude: number | null;
    longitude: number | null;
    onCoordinatesResolved: (lat: number, lng: number, formattedAddress: string) => void;
    onOpenMapPicker: () => void;
    placeholder?: string;
    locale?: 'es' | 'en';
    isOutOfZone?: boolean;
    label?: string;
    required?: boolean;
}

export default function GooglePlacesAddressInput({
    address,
    onAddressChange,
    latitude,
    longitude,
    onCoordinatesResolved,
    onOpenMapPicker,
    placeholder = 'Ej: Calle 140 # 19-35, Bogotá',
    locale = 'es',
    isOutOfZone = false,
    label,
    required = true
}: GooglePlacesAddressInputProps) {
    const [predictions, setPredictions] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const autocompleteServiceRef = useRef<any>(null);
    const geocoderRef = useRef<any>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Initialize Google services when available
    useEffect(() => {
        if (typeof window !== 'undefined' && (window as any).google?.maps) {
            if ((window as any).google.maps.places?.AutocompleteService) {
                autocompleteServiceRef.current = new (window as any).google.maps.places.AutocompleteService();
            }
            if ((window as any).google.maps.Geocoder) {
                geocoderRef.current = new (window as any).google.maps.Geocoder();
            }
        }
    }, []);

    const fetchPredictions = (query: string) => {
        if (!query || query.trim().length < 3) {
            setPredictions([]);
            setShowDropdown(false);
            return;
        }

        if (!autocompleteServiceRef.current && typeof window !== 'undefined' && (window as any).google?.maps?.places?.AutocompleteService) {
            autocompleteServiceRef.current = new (window as any).google.maps.places.AutocompleteService();
        }

        if (autocompleteServiceRef.current) {
            setIsSearching(true);
            autocompleteServiceRef.current.getPlacePredictions(
                {
                    input: query,
                    componentRestrictions: { country: 'co' },
                    locationBias: {
                        center: { lat: 4.6097, lng: -74.0817 }, // Bogotá
                        radius: 35000 // 35km
                    }
                },
                (results: any[], status: string) => {
                    setIsSearching(false);
                    if (status === 'OK' && results && results.length > 0) {
                        setPredictions(results);
                        setShowDropdown(true);
                    } else {
                        setPredictions([]);
                        setShowDropdown(false);
                    }
                }
            );
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        onAddressChange(val);
        fetchPredictions(val);
    };

    const handleSelectPrediction = (item: any) => {
        const cleanAddress = item.description
            .replace(/, Colombia.*$/i, '')
            .replace(/, Bogotá.*$/i, '')
            .replace(/, Cundinamarca.*$/i, '')
            .trim();

        onAddressChange(cleanAddress);
        setShowDropdown(false);
        setPredictions([]);

        // Resolve Lat / Lng with Geocoder
        if (!geocoderRef.current && typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
            geocoderRef.current = new (window as any).google.maps.Geocoder();
        }

        if (geocoderRef.current) {
            setIsSearching(true);
            geocoderRef.current.geocode(
                { placeId: item.place_id },
                (results: any[], status: string) => {
                    setIsSearching(false);
                    if (status === 'OK' && results && results[0]) {
                        const loc = results[0].geometry.location;
                        const lat = loc.lat();
                        const lng = loc.lng();
                        onCoordinatesResolved(lat, lng, cleanAddress);
                    }
                }
            );
        }
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            {label && (
                <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.4rem',
                    fontWeight: '800',
                    fontSize: '0.74rem',
                    color: '#334155',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontFamily: 'var(--font-outfit), sans-serif'
                }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={15} color="var(--primary)" />
                        {label} {required && <span style={{ color: '#059669' }}>*</span>}
                    </span>
                    {latitude && (
                        <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={12} />
                            {locale === 'es' ? 'GPS Exacto' : 'Exact GPS'}
                        </span>
                    )}
                </label>
            )}

            {/* Input with MapPin & Search indicator */}
            <div style={{ position: 'relative', width: '100%' }}>
                <div style={{
                    position: 'absolute',
                    left: '12px',
                    top: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    color: latitude ? '#059669' : '#64748B',
                    pointerEvents: 'none'
                }}>
                    <MapPin size={16} />
                </div>

                <input
                    type="text"
                    value={address}
                    onChange={handleInputChange}
                    onFocus={() => {
                        if (predictions.length > 0) setShowDropdown(true);
                    }}
                    placeholder={placeholder}
                    autoComplete="off"
                    style={{
                        width: '100%',
                        padding: '0.65rem 2.4rem 0.65rem 2.4rem',
                        borderRadius: '12px',
                        border: latitude 
                            ? '1.5px solid #10B981' 
                            : '1.5px solid #CBD5E1',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        color: '#0F172A',
                        backgroundColor: '#FFFFFF',
                        outline: 'none',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        fontFamily: 'var(--font-outfit), sans-serif',
                        transition: 'all 0.2s ease'
                    }}
                />

                <div style={{
                    position: 'absolute',
                    right: '12px',
                    top: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}>
                    {isSearching && (
                        <Loader2 size={15} color="#059669" className="animate-spin" />
                    )}
                    {address && (
                        <button
                            type="button"
                            onClick={() => {
                                onAddressChange('');
                                setPredictions([]);
                                setShowDropdown(false);
                            }}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#94A3B8',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Custom Google Places Dropdown */}
            {showDropdown && predictions.length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 12px 28px -4px rgba(15, 23, 42, 0.15)',
                    zIndex: 9999,
                    overflow: 'hidden',
                    maxHeight: '260px',
                    overflowY: 'auto'
                }}>
                    <div style={{
                        padding: '6px 12px',
                        backgroundColor: '#F8FAFC',
                        borderBottom: '1px solid #F1F5F9',
                        fontSize: '0.68rem',
                        fontWeight: '800',
                        color: '#64748B',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                    }}>
                        {locale === 'es' ? 'Direcciones sugeridas por Google Maps' : 'Google Maps Suggestions'}
                    </div>

                    {predictions.map((p, idx) => (
                        <div
                            key={p.place_id || idx}
                            onClick={() => handleSelectPrediction(p)}
                            style={{
                                padding: '0.7rem 1rem',
                                borderBottom: idx < predictions.length - 1 ? '1px solid #F8FAFC' : 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                transition: 'background-color 0.15s ease'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F0FDF4')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                        >
                            <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '8px',
                                backgroundColor: '#ECFDF5',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#059669',
                                flexShrink: 0
                            }}>
                                <MapPin size={14} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {p.structured_formatting?.main_text || p.description}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {p.structured_formatting?.secondary_text || p.description}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Micro-Radar Pill: Satellite status & Gate adjustment */}
            {latitude && (
                <div style={{
                    marginTop: '0.45rem',
                    padding: '0.45rem 0.85rem',
                    backgroundColor: isOutOfZone ? '#FEFCE8' : '#F0FDF4',
                    border: `1px solid ${isOutOfZone ? '#FDE68A' : '#A7F3D0'}`,
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-outfit), sans-serif'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                        <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: isOutOfZone ? '#D97706' : '#10B981',
                            boxShadow: isOutOfZone ? '0 0 6px #F59E0B' : '0 0 6px #10B981',
                            flexShrink: 0
                        }} />
                        <span style={{ 
                            color: isOutOfZone ? '#92400E' : '#065F46', 
                            fontWeight: '700',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {isOutOfZone
                                ? (locale === 'es' ? 'Ubicación fuera de cobertura activa' : 'Location out of delivery zone')
                                : (locale === 'es' ? 'Ubicación confirmada para tu entrega' : 'Delivery location verified')
                            }
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={onOpenMapPicker}
                        style={{
                            background: 'white',
                            border: `1px solid ${isOutOfZone ? '#FCD34D' : '#A7F3D0'}`,
                            color: isOutOfZone ? '#92400E' : '#047857',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            fontWeight: '800',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            flexShrink: 0
                        }}
                    >
                        <Compass size={11} />
                        <span>{locale === 'es' ? 'Ajustar punto en el mapa' : 'Adjust pin on map'}</span>
                    </button>
                </div>
            )}
        </div>
    );
}
