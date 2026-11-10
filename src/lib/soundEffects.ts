/**
 * Utilidad ligera para sintetizar sonidos de notificación nativos sin dependencias externas
 * Utiliza Web Audio API (OscillatorNode + GainNode) con soporte para desbloqueo de Autoplay
 */

let audioCtx: AudioContext | null = null;
let lastPingTimestamp = 0;
const PING_COOLDOWN_MS = 3500; // Cooldown anti-ráfaga: si entran 5 correos en 1 segundo, suena solo 1 vez

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      // Intento de reanudación silencioso
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch (err) {
    console.warn('[WebAudio] No se pudo inicializar AudioContext:', err);
    return null;
  }
}

/**
 * Desbloquea proactivamente el AudioContext mediante un gesto de usuario (click/toggle)
 */
export function unlockAudioContext(): boolean {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      return true;
    }
    return !!ctx;
  } catch {
    return false;
  }
}

/**
 * Emite el sonido tipo 'Ping' característico de BlackBerry:
 * Dos tonos sinusoidales puros de alta frecuencia con caída exponencial rápida (decay)
 */
export function playBlackberryPing(force: boolean = false): boolean {
  if (typeof window === 'undefined') return false;

  const now = Date.now();
  if (!force && (now - lastPingTimestamp < PING_COOLDOWN_MS)) {
    return false; // Silenciado por cooldown
  }

  const ctx = getAudioContext();
  if (!ctx || ctx.state === 'suspended') return false;

  try {
    const startTime = ctx.currentTime;

    // Primer tono: ~1046 Hz (C6) muy breve (40ms)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1046.5, startTime);
    gain1.gain.setValueAtTime(0.12, startTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(startTime);
    osc1.stop(startTime + 0.05);

    // Segundo tono principal ("Ping" brillante): ~1568 Hz (G6) con caída cristalina (180ms)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1567.98, startTime + 0.04);
    gain2.gain.setValueAtTime(0.22, startTime + 0.04);
    gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(startTime + 0.04);
    osc2.stop(startTime + 0.22);

    lastPingTimestamp = now;
    return true;
  } catch (err) {
    console.warn('[WebAudio] Error al reproducir Ping:', err);
    return false;
  }
}
