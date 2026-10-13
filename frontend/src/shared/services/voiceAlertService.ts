export interface WorkflowStageAlert {
  flow: string;
  role: string;
  department: string;
  stageKey: string;
  stageTitle: string;
  pendingCount: number;
  voiceText: string;
}

export const ALERT_ROLES = [
  { key: 'ALL', label: 'Barcha xizmatlar (Umumiy navbatchilik)' },
  { key: 'Security', label: 'Qo‘riqlash xizmati' },
  { key: 'Permit', label: 'Ruxsatnoma byurosi' },
  { key: 'Dispatching', label: 'ICHDX smena boshlig‘i' },
  { key: 'Scale', label: 'Tarozi operatori' },
  { key: 'Railway', label: 'Temir yo‘l sexi' },
  { key: 'Warehouse', label: 'TM va XA sexi' },
  { key: 'Economist', label: 'ICHDX iqtisodchisi' },
];

let audioCtx: AudioContext | null = null;
let lastAnnouncedTimes: Record<string, number> = {};
const ANNOUNCE_COOLDOWN_MS = 3 * 60 * 1000; // 3 daqiqa qayta takrorlanish oralig'i

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Foydalanuvchi ekranga har qanday bosganida audio autoplay ruxsatini ochish
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    getAudioContext();
  };
  window.addEventListener('click', unlockAudio, { once: false, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: false, passive: true });
}

/** 2-tonli yoqimli, jarangdor signal (Ding-Dong / Chime) */
export function playChime(volume = 1.0): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ctx = getAudioContext();
      if (!ctx) {
        resolve();
        return;
      }

      const now = ctx.currentTime;
      const gainNode = ctx.createGain();
      gainNode.connect(ctx.destination);
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(Math.min(1.0, Math.max(0.1, volume * 0.45)), now + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

      // 1-ton (E5 - 659.25 Hz)
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      osc1.connect(gainNode);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // 2-ton (A5 - 880 Hz)
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.0, now + 0.18);
      osc2.connect(gainNode);
      osc2.start(now + 0.18);
      osc2.stop(now + 0.7);

      setTimeout(() => resolve(), 600);
    } catch {
      resolve();
    }
  });
}

/** Ovozli nutqni (Text-To-Speech) o'qish */
export function speakText(text: string, volume = 1.0): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel();

      // Fonetikani yaxshilash: "ICHDX" -> "I-Che-De-X", "TM va XA" -> "Te-Em va Xa-A"
      const cleanText = text
        .replace(/ICHDX/g, 'I-Che-De-Iks')
        .replace(/TM va XA/g, 'Te-Em va Xa-A')
        .replace(/E-Transport/g, 'E Transport');

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 0.95; // Qulay va aniq tezlik
      utterance.pitch = 1.0;
      utterance.volume = Math.min(1.0, Math.max(0.1, volume));

      // Eng mos ovozni tanlash (uz-UZ yoki tr-TR - turk tili o'zbekcha so'zlarni a'lo darajada o'qiydi)
      const voices = window.speechSynthesis.getVoices();
      const uzVoice = voices.find(v => v.lang.startsWith('uz'));
      const trVoice = voices.find(v => v.lang.startsWith('tr'));
      if (uzVoice) {
        utterance.voice = uzVoice;
        utterance.lang = 'uz-UZ';
      } else if (trVoice) {
        utterance.voice = trVoice;
        utterance.lang = 'tr-TR';
      } else {
        utterance.lang = 'uz-UZ';
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);

      // 8 soniyadan ortiq kutilmasin
      setTimeout(() => resolve(), 8000);
    } catch {
      resolve();
    }
  });
}

/** Chime signal + O'zbekcha nutq */
export async function announceAlert(text: string, volume = 1.0): Promise<void> {
  await playChime(volume);
  await speakText(text, volume);
}

/** Sozlamalarni olish va saqlash */
export function getSavedVoiceSettings(): { enabled: boolean; role: string; volume: number } {
  try {
    const enabled = localStorage.getItem('etransport_voice_enabled') !== 'false';
    const role = localStorage.getItem('etransport_voice_role') || 'ALL';
    const volStr = localStorage.getItem('etransport_voice_volume');
    const volume = volStr ? parseFloat(volStr) : 1.0;
    return { enabled, role, volume };
  } catch {
    return { enabled: true, role: 'ALL', volume: 1.0 };
  }
}

export function saveVoiceSettings(enabled: boolean, role: string, volume: number) {
  try {
    localStorage.setItem('etransport_voice_enabled', enabled ? 'true' : 'false');
    localStorage.setItem('etransport_voice_role', role);
    localStorage.setItem('etransport_voice_volume', volume.toString());
  } catch {}
}

/** Rol mosligini tekshirish */
export function isRoleMatching(selectedRole: string, alertRole: string): boolean {
  if (selectedRole === 'ALL') return true;
  if (selectedRole === alertRole) return true;
  // DispatchSupervisor va Dispatching ikkalasi ham ICHDX
  if ((selectedRole === 'DispatchSupervisor' || selectedRole === 'Dispatching') &&
      (alertRole === 'DispatchSupervisor' || alertRole === 'Dispatching')) {
    return true;
  }
  return false;
}

/** Serverdan navbatlarni tekshirib, ovoz chiqarish */
export async function checkAndAnnouncePendingAlerts(customRole?: string): Promise<WorkflowStageAlert[]> {
  const settings = getSavedVoiceSettings();
  if (!settings.enabled) return [];

  const targetRole = customRole || settings.role;

  try {
    const res = await fetch('/api/public/workflow-alerts');
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return [];

    const alerts: WorkflowStageAlert[] = json.data;
    const matchingAlerts = alerts.filter(a => isRoleMatching(targetRole, a.role));

    const now = Date.now();
    for (const alert of matchingAlerts) {
      const alertKey = `${alert.flow}:${alert.stageKey}:${alert.role}`;
      const lastTime = lastAnnouncedTimes[alertKey] || 0;

      // Agar oldin e'lon qilinmagan bo'lsa yoki 3 daqiqa o'tgan bo'lsa
      if (now - lastTime > ANNOUNCE_COOLDOWN_MS) {
        lastAnnouncedTimes[alertKey] = now;
        await announceAlert(alert.voiceText, settings.volume);
        break; // Bir vaqtda bir nechta ovoz aralashib ketmasligi uchun navbat bilan bittasini aytadi
      }
    }

    return matchingAlerts;
  } catch {
    return [];
  }
}

/** Sinov ovozini chiqarish */
export async function testVoiceForRole(roleKey: string): Promise<void> {
  const roleObj = ALERT_ROLES.find(r => r.key === roleKey) || ALERT_ROLES[0];
  const deptName = roleKey === 'ALL' ? 'Barcha mas’ul xizmatlar' : roleObj.label;
  const testText = `Diqqat! Kirish va chiqish jarayoni: ${deptName}, siz E-Transport tizimiga kirib o‘z bosqichingizni tugating!`;
  const settings = getSavedVoiceSettings();
  await announceAlert(testText, settings.volume);
}
