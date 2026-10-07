import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Globe,
  HardDrive,
  MemoryStick,
  Network,
  Server,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { ServerServiceStatus, ServerStatus } from '../../../shared/types';

type HubTone = 'blue' | 'emerald' | 'violet' | 'amber' | 'cyan' | 'rose' | 'indigo' | 'sky';
type HealthLevel = 'normal' | 'warning' | 'critical';

const SERVICE_META: Record<string, { icon: LucideIcon; tone: HubTone }> = {
  api: { icon: Server, tone: 'blue' },
  postgres: { icon: Database, tone: 'indigo' },
  redis: { icon: Activity, tone: 'rose' },
  minio: { icon: Box, tone: 'amber' },
  frontend: { icon: Globe, tone: 'violet' },
  nginx: { icon: Globe, tone: 'emerald' },
};

function formatPercent(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function formatGb(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(1)} GB`;
}

function formatMb(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(1)} MB`;
}

function formatUptimeUz(value?: string | null) {
  if (!value || value.trim() === '' || value === '—') return '—';
  const str = value.trim();

  // Pattern: "10k 0s", "10k 2s" -> "10 kun, 0 soat" / "10 kun, 2 soat"
  const dayHourMatch = str.match(/^(\d+)\s*k\s*(\d+)\s*s$/i);
  if (dayHourMatch) {
    return `${dayHourMatch[1]} kun, ${dayHourMatch[2]} soat`;
  }

  // Pattern: "10k" -> "10 kun"
  const dayMatch = str.match(/^(\d+)\s*k$/i);
  if (dayMatch) {
    return `${dayMatch[1]} kun`;
  }

  // Pattern: "2s 15d" -> "2 soat, 15 daqiqa"
  const hourMinMatch = str.match(/^(\d+)\s*s\s*(\d+)\s*d$/i);
  if (hourMinMatch) {
    return `${hourMinMatch[1]} soat, ${hourMinMatch[2]} daqiqa`;
  }

  // Pattern: "2s" -> "2 soat"
  const hourMatch = str.match(/^(\d+)\s*s$/i);
  if (hourMatch) {
    return `${hourMatch[1]} soat`;
  }

  // Pattern: "15d" -> "15 daqiqa"
  const minMatch = str.match(/^(\d+)\s*d$/i);
  if (minMatch) {
    return `${minMatch[1]} daqiqa`;
  }

  return str;
}

function getHealthLevel(percent?: number | null, warningThreshold = 75, criticalThreshold = 85): HealthLevel {
  if (percent == null || Number.isNaN(percent)) return 'normal';
  if (percent >= criticalThreshold) return 'critical';
  if (percent >= warningThreshold) return 'warning';
  return 'normal';
}

function MetricCard({
  title,
  subtitle,
  percent,
  defaultTone,
  icon: Icon,
  details,
  warningThreshold = 75,
  criticalThreshold = 85,
}: {
  title: string;
  subtitle: string;
  percent?: number | null;
  defaultTone: HubTone;
  icon: LucideIcon;
  details: { label: string; value: string }[];
  warningThreshold?: number;
  criticalThreshold?: number;
}) {
  const width = Math.max(0, Math.min(100, percent ?? 0));
  const level = getHealthLevel(percent, warningThreshold, criticalThreshold);
  const activeTone: HubTone = level === 'critical' ? 'rose' : level === 'warning' ? 'amber' : defaultTone;

  const cardBorderClass =
    level === 'critical'
      ? 'border-rose-300 dark:border-rose-700/80 bg-rose-50/20 dark:bg-rose-950/20 ring-2 ring-rose-500/25 shadow-lg shadow-rose-500/10'
      : level === 'warning'
        ? 'border-amber-300 dark:border-amber-700/70 bg-amber-50/20 dark:bg-amber-950/20 ring-1 ring-amber-500/20'
        : 'border-gray-200 dark:border-slate-800';

  const percentColorClass =
    level === 'critical'
      ? 'text-rose-600 dark:text-rose-400'
      : level === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-gray-900 dark:text-slate-100';

  return (
    <div className={`ui-card p-5 space-y-4 transition-all duration-300 ${cardBorderClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`admin-hub-icon admin-hub-icon--md admin-hub-icon--${activeTone} ${level === 'critical' ? 'animate-pulse' : ''}`}>
            <Icon className="w-5 h-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">{subtitle}</p>
          </div>
        </div>

        {level === 'critical' ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-xs animate-pulse shrink-0">
            <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
            Kritik
          </span>
        ) : level === 'warning' ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shrink-0">
            <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            Diqqat
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 shrink-0">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            Barqaror
          </span>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className={`text-2xl font-black tabular-nums transition-colors duration-300 ${percentColorClass}`}>
            {formatPercent(percent)}
          </p>
          <span className={`text-xs font-semibold ${level === 'critical' ? 'text-rose-500 font-bold' : level === 'warning' ? 'text-amber-500 font-bold' : 'text-gray-400 dark:text-slate-500'}`}>
            {level === 'critical' ? 'Kritik me’yor' : level === 'warning' ? 'Yuqori yuklama' : 'band'}
          </span>
        </div>
        <div className="server-metric-bar mt-2">
          <div
            className={`server-metric-bar__fill server-metric-bar__fill--${activeTone} ${level === 'critical' ? 'animate-pulse' : ''}`}
            style={{ width: `${width}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {details.map(item => (
          <div key={item.label} className="server-metric-chip">
            <p className="server-metric-chip__label">{item.label}</p>
            <p className="server-metric-chip__value">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceCard({ service }: { service: ServerServiceStatus }) {
  const meta = SERVICE_META[service.key] ?? { icon: Server, tone: 'blue' as HubTone };
  const Icon = meta.icon;

  return (
    <div className="ui-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`admin-hub-icon admin-hub-icon--md admin-hub-icon--${meta.tone}`}>
            <Icon className="w-4 h-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{service.label}</p>
            {service.version ? (
              <p className="text-xs text-gray-500 dark:text-slate-400 truncate mt-0.5">{service.version}</p>
            ) : null}
          </div>
        </div>
        <span className={`admin-role-badge admin-role-badge--${service.isHealthy ? 'emerald' : 'rose'} shrink-0`}>
          {service.isHealthy ? 'Yaxshi' : 'Muammo'}
        </span>
      </div>

      <p className="text-sm text-gray-600 dark:text-slate-300 leading-snug">
        {service.message || (service.isHealthy ? 'Xizmat faol' : 'Xizmat javob bermadi')}
      </p>

      {service.details && service.details.length > 0 ? (
        <div className="mt-auto space-y-1.5 border-t border-gray-100 dark:border-slate-800 pt-3">
          {service.details.map(item => (
            <div key={`${item.key}-${item.value}`} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-gray-400 dark:text-slate-500 truncate">{item.key}</span>
              <span className="font-medium tabular-nums text-gray-800 dark:text-slate-200 truncate text-right">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ServerStatusPage() {
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!serverStatus) setLoading(true);

    api.getServerStatus()
      .then(res => {
        if (res.data) {
          setServerStatus(res.data);
          setLastUpdated(new Date());
          setError('');
        }
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Server holatini yuklab bo\'lmadi');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [serverStatus]);

  useEffect(() => {
    load();
    const id = window.setInterval(() => load(), 10000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial + interval only
  }, []);

  const services = serverStatus?.services ?? [];
  const metrics = serverStatus?.metrics;
  const sys = serverStatus?.systemInfo;

  const healthyCount = useMemo(() => services.filter(s => s.isHealthy).length, [services]);
  const allHealthy = services.length > 0 && healthyCount === services.length;

  const alerts = useMemo(() => {
    const list: { level: 'critical' | 'warning'; title: string; desc: string; key: string }[] = [];
    if (metrics) {
      if (metrics.diskPercent != null && metrics.diskPercent >= 85) {
        list.push({
          key: 'disk-crit',
          level: 'critical',
          title: `Tizim diski kritik darajada to‘lgan (${formatPercent(metrics.diskPercent)})`,
          desc: `Asosiy diskning ${formatGb(metrics.diskUsedGb)} joyi band (bo‘sh: ${formatGb(metrics.diskFreeGb)}). Server to‘xtab qolmasligi uchun Docker keshlarini tozalash yoki keraksiz fayllarni o‘chirish tavsiya etiladi.`,
        });
      } else if (metrics.diskPercent != null && metrics.diskPercent >= 75) {
        list.push({
          key: 'disk-warn',
          level: 'warning',
          title: `Tizim diski to‘lib bormoqda (${formatPercent(metrics.diskPercent)})`,
          desc: `Asosiy diskning ${formatGb(metrics.diskUsedGb)} joyi band (bo‘sh: ${formatGb(metrics.diskFreeGb)}). Server xotirasini nazorat qilib boring.`,
        });
      }

      if (metrics.ramPercent != null && metrics.ramPercent >= 85) {
        list.push({
          key: 'ram-crit',
          level: 'critical',
          title: `Operativ xotira (RAM) kritik darajada band (${formatPercent(metrics.ramPercent)})`,
          desc: `${formatGb(metrics.ramUsedGb)} / ${formatGb(metrics.ramTotalGb)} RAM band. Katta resurs talab qiluvchi jarayonlarni tekshiring.`,
        });
      } else if (metrics.ramPercent != null && metrics.ramPercent >= 75) {
        list.push({
          key: 'ram-warn',
          level: 'warning',
          title: `Operativ xotira (RAM) yuqori yuklamada (${formatPercent(metrics.ramPercent)})`,
          desc: `RAM xotirasi me’yordan oshmoqda (${formatGb(metrics.ramUsedGb)} band).`,
        });
      }

      if (metrics.cpuPercent != null && metrics.cpuPercent >= 85) {
        list.push({
          key: 'cpu-crit',
          level: 'critical',
          title: `Protsessor (CPU) kritik yuklamada (${formatPercent(metrics.cpuPercent)})`,
          desc: `Protsessor barcha yadrolari to‘liq quvvatda ishlamoqda (${formatPercent(metrics.cpuPercent)}).`,
        });
      }
    }
    return list;
  }, [metrics]);

  const hasCriticalResource = (metrics?.diskPercent ?? 0) >= 85 || (metrics?.ramPercent ?? 0) >= 85 || (metrics?.cpuPercent ?? 0) >= 85;
  const hasWarningResource = (metrics?.diskPercent ?? 0) >= 75 || (metrics?.ramPercent ?? 0) >= 75 || (metrics?.cpuPercent ?? 0) >= 75;

  return (
    <div className="space-y-5">
      <header className="marketing-product-hub-header">
        <div className="marketing-product-hub-header__intro">
          <div className="admin-page-title-row">
            <span className="admin-page-title-icon">
              <Server className="w-5 h-5" strokeWidth={1.75} />
            </span>
            <h1 className="marketing-product-hub-header__title">Server holati</h1>
          </div>
          <p className="marketing-product-hub-header__desc">
            Xizmatlar, protsessor, xotira, disk va tarmoq ko‘rsatkichlari — real vaqtda.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="btn-secondary text-sm inline-flex items-center gap-1.5"
          >
            <Activity className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            Yangilash
          </button>
          {lastUpdated ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
              <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
              {lastUpdated.toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      </header>

      {/* Alert Notices / Xabarnomalar */}
      {alerts.length > 0 ? (
        <div className="space-y-3" role="alert">
          {alerts.map(a => (
            <div
              key={a.key}
              className={`p-4 rounded-xl border flex items-start gap-3.5 shadow-sm transition-all ${
                a.level === 'critical'
                  ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100 ring-2 ring-rose-500/20'
                  : 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'
              }`}
            >
              <span className={`p-2 rounded-lg shrink-0 ${a.level === 'critical' ? 'bg-rose-100 dark:bg-rose-900/80 text-rose-600 dark:text-rose-300' : 'bg-amber-100 dark:bg-amber-900/80 text-amber-600 dark:text-amber-300'}`}>
                {a.level === 'critical' ? <AlertTriangle className="w-5 h-5 animate-pulse" /> : <AlertCircle className="w-5 h-5" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold leading-tight">{a.title}</h4>
                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${a.level === 'critical' ? 'bg-rose-600 text-white' : 'bg-amber-600 text-white'}`}>
                    {a.level === 'critical' ? 'Kritik xabar' : 'Ogohlantirish'}
                  </span>
                </div>
                <p className="text-xs sm:text-sm mt-1 opacity-90 leading-relaxed">{a.desc}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="admin-alert-card admin-alert-card--warning">
          <Activity className="w-5 h-5 shrink-0" strokeWidth={1.75} />
          <div>
            <p className="font-semibold">Holatni olishda xatolik</p>
            <p className="text-sm mt-0.5 opacity-90">{error}</p>
          </div>
        </div>
      ) : null}

      {loading && !serverStatus ? (
        <div className="space-y-4">
          <div className="h-28 bg-gray-200 dark:skeleton rounded-xl animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-44 bg-gray-200 dark:skeleton rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <section className="ui-card p-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="space-y-3 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`admin-role-badge admin-role-badge--${hasCriticalResource ? 'rose' : hasWarningResource ? 'amber' : allHealthy ? 'emerald' : 'blue'}`}>
                    {hasCriticalResource
                      ? '⚠️ Serverda kritik yuklama mavjud'
                      : hasWarningResource
                        ? 'Diqqat: Yuqori yuklama'
                        : services.length === 0
                          ? 'Ma\'lumot yo\'q'
                          : allHealthy
                            ? `Barcha ${healthyCount} ta xizmat barqaror`
                            : `${healthyCount}/${services.length} xizmat barqaror`}
                  </span>
                  {sys?.hostname ? (
                    <span className="admin-role-badge admin-role-badge--sky">{sys.hostname}</span>
                  ) : null}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">E-Transport serveri</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sys?.osDescription ? (
                      <span className="admin-role-badge admin-role-badge--blue">{sys.osDescription}</span>
                    ) : null}
                    {sys?.dotnetVersion ? (
                      <span className="admin-role-badge admin-role-badge--indigo">{sys.dotnetVersion}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
                <div className="server-uptime-chip">
                  <p className="server-uptime-chip__label">
                    <Clock className="w-3.5 h-3.5 text-blue-500" strokeWidth={1.75} />
                    API uptime
                  </p>
                  <p className="server-uptime-chip__value">{formatUptimeUz(sys?.apiUptime)}</p>
                </div>
                <div className="server-uptime-chip">
                  <p className="server-uptime-chip__label">
                    <Server className="w-3.5 h-3.5 text-emerald-500" strokeWidth={1.75} />
                    Server uptime
                  </p>
                  <p className="server-uptime-chip__value">{formatUptimeUz(sys?.systemUptime)}</p>
                </div>
                <div className="server-uptime-chip">
                  <p className="server-uptime-chip__label">
                    <ShieldCheck className="w-3.5 h-3.5 text-violet-500" strokeWidth={1.75} />
                    SSL / domen
                  </p>
                  <p className={`server-uptime-chip__value${sys?.sslCertExpire ? '' : ' text-rose-600 dark:text-rose-400'}`}>
                    {sys?.sslCertExpire || 'SSL faol emas'}
                  </p>
                  {sys?.domain ? (
                    <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 truncate">{sys.domain}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="admin-dash-section-title">Resurslar</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard
                title="CPU"
                subtitle="Protsessor yuklamasi"
                percent={metrics?.cpuPercent}
                defaultTone="amber"
                icon={Cpu}
                warningThreshold={75}
                criticalThreshold={85}
                details={[
                  { label: 'Yadrolar', value: metrics?.cpuCores != null ? `${metrics.cpuCores} ta` : '—' },
                  { label: "O'rtacha", value: formatPercent(metrics?.cpuAvgLoad) },
                ]}
              />
              <MetricCard
                title="Xotira"
                subtitle="Operativ xotira (RAM)"
                percent={metrics?.ramPercent}
                defaultTone="blue"
                icon={MemoryStick}
                warningThreshold={75}
                criticalThreshold={85}
                details={[
                  { label: 'Jami', value: formatGb(metrics?.ramTotalGb) },
                  { label: 'Band', value: formatGb(metrics?.ramUsedGb) },
                  { label: "Bo'sh", value: formatGb(metrics?.ramFreeGb) },
                ]}
              />
              <MetricCard
                title="Tizim diski"
                subtitle="Asosiy disk maydoni"
                percent={metrics?.diskPercent}
                defaultTone="emerald"
                icon={HardDrive}
                warningThreshold={75}
                criticalThreshold={85}
                details={[
                  { label: "Bo'sh", value: formatGb(metrics?.diskFreeGb) },
                  { label: 'Band', value: formatGb(metrics?.diskUsedGb) },
                  { label: 'Jami', value: formatGb(metrics?.diskTotalGb) },
                ]}
              />
              <MetricCard
                title="Tarmoq"
                subtitle="Kiruvchi va chiquvchi trafik"
                percent={metrics?.trafficPercent}
                defaultTone="violet"
                icon={Network}
                warningThreshold={80}
                criticalThreshold={95}
                details={[
                  { label: 'Kiruvchi', value: formatMb(metrics?.trafficIncomingMb) },
                  { label: 'Chiquvchi', value: formatMb(metrics?.trafficOutgoingMb) },
                ]}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="admin-dash-section-title">Xizmatlar holati</h2>
            {services.length === 0 ? (
              <div className="ui-card p-8 text-center text-sm text-gray-500 dark:text-slate-400">
                Xizmatlar holati hali yuklanmadi.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                {services.map(service => (
                  <ServiceCard key={service.key} service={service} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
