import React, { useEffect, useState, useRef } from 'react';
import { Volume2, VolumeX, Play, Bell, Shield, ChevronDown, Check } from 'lucide-react';
import {
  ALERT_ROLES,
  getSavedVoiceSettings,
  saveVoiceSettings,
  checkAndAnnouncePendingAlerts,
  testVoiceForRole,
  type WorkflowStageAlert,
} from '../services/voiceAlertService';

interface VoiceAlertWidgetProps {
  currentRole?: string; // Agar login qilingan bo'lsa
  variant?: 'login' | 'header';
}

export const VoiceAlertWidget: React.FC<VoiceAlertWidgetProps> = ({ currentRole, variant = 'login' }) => {
  const [enabled, setEnabled] = useState(true);
  const [selectedRole, setSelectedRole] = useState('ALL');
  const [volume, setVolume] = useState(1.0);
  const [isOpen, setIsOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState<WorkflowStageAlert[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = getSavedVoiceSettings();
    setEnabled(saved.enabled);
    setVolume(saved.volume);
    if (currentRole) {
      setSelectedRole(currentRole);
      saveVoiceSettings(saved.enabled, currentRole, saved.volume);
    } else {
      setSelectedRole(saved.role || 'ALL');
    }
  }, [currentRole]);

  // Har 15 soniyada yangi navbatlarni tekshirish
  useEffect(() => {
    let isMounted = true;

    const runCheck = async () => {
      const alerts = await checkAndAnnouncePendingAlerts(currentRole || selectedRole);
      if (isMounted) {
        setActiveAlerts(alerts);
      }
    };

    // Ilk tekshiruv 2 soniyadan so'ng
    const initialTimer = setTimeout(() => {
      void runCheck();
    }, 2000);

    const interval = setInterval(() => {
      void runCheck();
    }, 15000);

    return () => {
      isMounted = false;
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [currentRole, selectedRole, enabled]);

  // Dropdown tashqarisiga bosilganda yopish
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleEnabled = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !enabled;
    setEnabled(next);
    saveVoiceSettings(next, selectedRole, volume);
  };

  const handleSelectRole = (roleKey: string) => {
    setSelectedRole(roleKey);
    saveVoiceSettings(enabled, roleKey, volume);
    setIsOpen(false);
  };

  const handleTest = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTesting(true);
    try {
      await testVoiceForRole(selectedRole);
    } finally {
      setIsTesting(false);
    }
  };

  const currentRoleObj = ALERT_ROLES.find(r => r.key === selectedRole) || ALERT_ROLES[0];

  if (variant === 'header') {
    return (
      <div className="relative inline-flex items-center" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`relative p-2 rounded-xl transition-all flex items-center gap-1.5 text-xs font-medium border ${
            enabled
              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25 hover:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30'
              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
          }`}
          title={enabled ? "Ovozli ogohlantirish yoqilgan" : "Ovozli ogohlantirish o'chirilgan"}
        >
          {enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          <span className="hidden md:inline">{enabled ? 'Ovoz: Faol' : 'Ovoz: O‘chirilgan'}</span>
          {activeAlerts.length > 0 && enabled && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          )}
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-3 z-50">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Ovozli ogohlantirish</span>
              <button
                type="button"
                onClick={handleToggleEnabled}
                className={`text-xs px-2 py-0.5 rounded-lg font-medium transition-colors ${
                  enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {enabled ? 'Yoqilgan' : 'O‘chirilgan'}
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
              Sizning bosqichingizga vagon yetib kelganda o‘zbek tilida karnaydan ovoz yangraydi.
            </p>

            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:hover:bg-sky-900/50 dark:text-sky-300 text-xs font-medium transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {isTesting ? 'Ovoz yangramoqda...' : 'Ovozni sinab ko‘rish'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Login sahifasi uchun Glassmorphic vidjet
  return (
    <div className="w-full max-w-sm mx-auto mt-4" ref={dropdownRef}>
      <div className="rounded-2xl border border-white/20 bg-slate-900/60 backdrop-blur-md p-3 text-white shadow-lg transition-all hover:border-white/30">
        <div className="flex items-center justify-between gap-2">
          {/* Chap: Ovoz holati */}
          <button
            type="button"
            onClick={handleToggleEnabled}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              enabled
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                : 'bg-white/10 text-slate-300 border border-white/10 hover:bg-white/15'
            }`}
            title="Ovozni yoqish / o'chirish"
          >
            {enabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
            <span>{enabled ? 'Ovozli e’lon: Yoqilgan' : 'Ovoz: O‘chirilgan'}</span>
          </button>

          {/* O'ng: Sinov tugmasi */}
          <button
            type="button"
            onClick={handleTest}
            disabled={isTesting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 transition-all active:scale-95"
            title="Karnay ovozini tekshirish"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{isTesting ? 'Eshitilmoqda...' : 'Sinash'}</span>
          </button>
        </div>

        {/* Xizmatni tanlash bo'limi */}
        <div className="mt-2.5 pt-2.5 border-t border-white/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
            <Shield className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Kompyuter:</span>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white border border-white/15 transition-all"
            >
              <span className="truncate max-w-[140px]">{currentRoleObj.label}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            </button>

            {isOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-64 max-h-60 overflow-y-auto rounded-xl bg-slate-900 border border-white/20 shadow-2xl p-1.5 z-50">
                <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Ushbu kompyuter xizmati:
                </div>
                {ALERT_ROLES.map(r => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => handleSelectRole(r.key)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left ${
                      selectedRole === r.key
                        ? 'bg-sky-600 text-white font-medium'
                        : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <span className="truncate">{r.label}</span>
                    {selectedRole === r.key && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Agar ayni damda kutayotgan vagonlar bo'lsa bildirishnoma */}
        {activeAlerts.length > 0 && enabled && (
          <div className="mt-2.5 p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center gap-2 text-amber-200 text-xs">
            <Bell className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
            <span className="truncate font-medium">
              {activeAlerts[0].flow}: {activeAlerts[0].department} ({activeAlerts[0].pendingCount} ta vagon kutmoqda)
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
