import { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Search,
  RefreshCw,
  X,
  Copy,
  Check,
  ChevronDown,
  Download,
  Clock,
  User,
  Zap,
  Package,
  FileCode,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import { OrderPeriodPicker } from '../../../shared/components/OrderPeriodPicker';
import { TablePagination } from '../../../shared/components/TablePagination';
import type { AuditLogItem, AuditStats, AuditFilterParams } from '../../../shared/types';

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return dateStr;
  }
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  } catch {
    return dateStr;
  }
}

function resolveActionDisplay(action: string, status?: string): { text: string; dotColor: string } {
  const isFailed = status?.toLowerCase() === 'failed';
  if (isFailed) {
    if (action === 'LoginFailed') return { text: 'Kirish rad etildi', dotColor: 'bg-rose-500' };
    if (action === 'PasswordChangeFailed') return { text: 'Parol xatosi', dotColor: 'bg-rose-500' };
    return { text: `${action} (rad etildi)`, dotColor: 'bg-rose-500' };
  }
  if (action === 'VoiceAlertAnnounced' || action.includes('VoiceAlert')) {
    return { text: 'Ovoz eshittirildi', dotColor: 'bg-emerald-500' };
  }
  switch (action) {
    // 1. Tizim va Xavfsizlik
    case 'LoginSuccess': return { text: 'Tizimga kirish', dotColor: 'bg-emerald-500' };
    case 'LoginFailed': return { text: 'Kirish rad etildi', dotColor: 'bg-rose-500' };
    case 'PasswordChanged': return { text: 'Parol almashtirildi', dotColor: 'bg-blue-500' };
    case 'PasswordChangeFailed': return { text: 'Parol xatosi', dotColor: 'bg-rose-500' };
    case 'UserCreated': return { text: 'Xodim yaratildi', dotColor: 'bg-blue-500' };
    case 'UserUpdated': return { text: 'Xodim yangilandi', dotColor: 'bg-amber-500' };
    case 'UserDeleted': return { text: 'Xodim o‘chirildi', dotColor: 'bg-rose-500' };
    case 'UserPasswordReset': return { text: 'Parol yangilandi', dotColor: 'bg-amber-500' };
    case 'Sync': return { text: 'HR sinxronlash', dotColor: 'bg-blue-500' };

    // 2. Buyurtma jarayoni
    case 'OrderCreated': return { text: 'Buyurtma yaratildi', dotColor: 'bg-blue-500' };
    case 'OrderEdited': return { text: 'Buyurtma tahrirlandi', dotColor: 'bg-amber-500' };
    case 'OrderAgreed': return { text: 'Buyurtma kelishildi', dotColor: 'bg-indigo-500' };
    case 'OrderApproved': return { text: 'Buyurtma tasdiqlandi', dotColor: 'bg-emerald-500' };
    case 'OrderCancelled': return { text: 'Buyurtma bekor qilindi', dotColor: 'bg-rose-500' };

    // 3. Vagonlarni kiritish (1-4 bosqich)
    case 'IntakeNoticeCreated': return { text: 'Kiritish xati tuzildi', dotColor: 'bg-blue-500' };
    case 'IntakeNoticeApproved': return { text: 'Xizmat xati tasdiqlandi', dotColor: 'bg-emerald-500' };
    case 'WagonsBroughtIn': return { text: 'Vagonlar kiritildi', dotColor: 'bg-sky-500' };
    case 'PermitChecked': return { text: 'Ruxsatnoma tekshirildi', dotColor: 'bg-purple-500' };
    case 'SecurityChecked': return { text: 'Qo‘riqlash tekshirildi', dotColor: 'bg-purple-500' };

    // 4. Yuklash va Tarozi (5-8 bosqich)
    case 'TareWeighed': return { text: 'Tara og‘irligi tortildi', dotColor: 'bg-teal-500' };
    case 'ProductLoadingStarted': return { text: 'Yuklash boshlandi', dotColor: 'bg-cyan-500' };
    case 'ProductLoaded': return { text: 'Mahsulot yuklandi', dotColor: 'bg-cyan-500' };
    case 'GrossWeighed': return { text: 'Brutto og‘irligi tortildi', dotColor: 'bg-teal-500' };
    case 'SealInstalled': return { text: 'Plomba o‘rnatildi', dotColor: 'bg-violet-500' };
    case 'SealConfirmed': return { text: 'Plomba tasdiqlandi', dotColor: 'bg-violet-500' };
    case 'LoadingWagonEdited': return { text: 'Yuklash tahrirlandi', dotColor: 'bg-amber-500' };

    // 5. Chiqish va Yuk xatlari (9-12 bosqich)
    case 'YukXatiCreated': return { text: 'Yuk xati shakllantirildi', dotColor: 'bg-blue-500' };
    case 'YukXatiSigned': return { text: 'Yuk xati tasdiqlandi', dotColor: 'bg-emerald-500' };
    case 'YukXatiAgreed': return { text: 'Yuk xati kelishildi', dotColor: 'bg-indigo-500' };
    case 'ExitInspected': return { text: 'Chiqish tekshirildi', dotColor: 'bg-purple-500' };
    case 'WagonsDispatched': return { text: 'Vagonlar jo‘natildi', dotColor: 'bg-emerald-500' };
    case 'YukXatiRegistered': return { text: 'Yuk xati ro‘yxatdan o‘tdi', dotColor: 'bg-emerald-500' };

    // 6. Vagonlar va Dalolatnomalar
    case 'EmptyWagonIntake': return { text: 'Bo‘sh vagon qabul qilindi', dotColor: 'bg-sky-500' };
    case 'DefectActCreated': return { text: 'Nosozlik dalolatnomasi', dotColor: 'bg-rose-500' };
    case 'WagonReturned': return { text: 'Vagon qaytarildi', dotColor: 'bg-rose-500' };
    case 'ActApproved': return { text: 'Dalolatnoma tasdiqlandi', dotColor: 'bg-amber-500' };
    case 'WagonReplaced': return { text: 'Vagon almashtirildi', dotColor: 'bg-amber-500' };

    default:
      if (action.includes('Sync')) return { text: 'HR sinxronlash', dotColor: 'bg-blue-500' };
      if (action.includes('Update') || action.includes('Edit')) return { text: 'Yangilandi', dotColor: 'bg-amber-500' };
      if (action.includes('Create') || action.includes('Add')) return { text: 'Yaratildi', dotColor: 'bg-blue-500' };
      return { text: action, dotColor: 'bg-emerald-500' };
  }
}

function resolveModuleDisplay(category?: string, action?: string): { text: string; bg: string; textCol: string } {
  const cat = (category || '').toLowerCase();
  const act = (action || '').toLowerCase();

  if (cat === 'voicealert' || act.includes('voice') || act.includes('ovoz')) {
    return { text: 'Ovozli xabar', bg: 'bg-emerald-50 dark:bg-emerald-950/60', textCol: 'text-emerald-700 dark:text-emerald-400' };
  }
  if (cat === 'auth' || act.includes('login') || act.includes('password')) {
    return { text: 'Kirish', bg: 'bg-blue-50 dark:bg-blue-950/60', textCol: 'text-blue-600 dark:text-blue-400' };
  }
  if (cat === 'integration' || act.includes('sync') || act.includes('1c')) {
    return { text: 'Integratsiya', bg: 'bg-amber-50 dark:bg-amber-950/60', textCol: 'text-amber-700 dark:text-amber-400' };
  }
  if (cat === 'order' || act.includes('order')) {
    return { text: 'Buyurtma', bg: 'bg-indigo-50 dark:bg-indigo-950/60', textCol: 'text-indigo-600 dark:text-indigo-400' };
  }
  if (cat === 'weighing' || act.includes('weigh') || act.includes('tara') || act.includes('gross')) {
    return { text: 'Tarozi', bg: 'bg-teal-50 dark:bg-teal-950/60', textCol: 'text-teal-700 dark:text-teal-400' };
  }
  if (cat === 'documents' || act.includes('yukxati') || act.includes('waybill') || act.includes('document')) {
    return { text: 'Yuk xati', bg: 'bg-sky-50 dark:bg-sky-950/60', textCol: 'text-sky-700 dark:text-sky-400' };
  }
  if (cat === 'security' || act.includes('permit') || act.includes('seal') || act.includes('security') || act.includes('exit')) {
    return { text: 'Xavfsizlik', bg: 'bg-purple-50 dark:bg-purple-950/60', textCol: 'text-purple-700 dark:text-purple-400' };
  }
  if (cat === 'dispatching' || act.includes('intake')) {
    return { text: 'Kiritish', bg: 'bg-sky-50 dark:bg-sky-950/60', textCol: 'text-sky-700 dark:text-sky-400' };
  }
  if (cat === 'warehouse' || act.includes('loading') || cat === 'operations' || act.includes('dispatch') || act.includes('wagon')) {
    return { text: 'Yuklash', bg: 'bg-cyan-50 dark:bg-cyan-950/60', textCol: 'text-cyan-700 dark:text-cyan-400' };
  }
  if (cat === 'usermanagement' || act.includes('user')) {
    return { text: 'Xodimlar', bg: 'bg-slate-100 dark:bg-slate-800', textCol: 'text-slate-700 dark:text-slate-300' };
  }
  return { text: 'Umumiy', bg: 'bg-slate-100 dark:bg-slate-800', textCol: 'text-slate-700 dark:text-slate-300' };
}

function resolveObjectDisplay(item: AuditLogItem): string {
  let parsed: any = null;
  if (item.details && item.details.startsWith('{')) {
    try { parsed = JSON.parse(item.details); } catch { /* ignore */ }
  }

  if (item.action.includes('Login') || item.category === 'Auth') {
    return item.username ? `@${item.username}` : (item.entityId ? `@${item.entityId}` : '—');
  }
  if (item.action.includes('Sync')) return 'HR';
  if (item.entityType === 'MonthlyOrder') {
    return parsed?.orderNumber ? `Buyurtma ${parsed.orderNumber}` : (item.entityId ? `Buyurtma #${item.entityId.slice(0, 8)}` : 'Buyurtma');
  }
  if (item.entityType === 'EmptyWagonArrival') {
    return parsed?.arrivalNumber ? `Partiya ${parsed.arrivalNumber}` : (item.entityId ? `Partiya #${item.entityId.slice(0, 8)}` : 'Partiya');
  }
  if (item.entityType === 'EmptyWagonUnit') {
    return parsed?.wagonNumber ? `Vagon ${parsed.wagonNumber}` : (item.entityId ? `Vagon #${item.entityId.slice(0, 8)}` : 'Vagon');
  }
  if (item.entityType === 'LoadingRegistry' || item.entityType === 'YukXati') {
    return parsed?.registryNumber ? `Yuk xati ${parsed.registryNumber}` : (item.entityId ? `Yuk xati #${item.entityId.slice(0, 8)}` : 'Yuk xati');
  }
  if (item.entityType === 'DefectAct') {
    return parsed?.actNumber ? `Dalolatnoma ${parsed.actNumber}` : (item.entityId ? `Dalolatnoma #${item.entityId.slice(0, 8)}` : 'Dalolatnoma');
  }
  if (item.entityType && item.entityId) {
    return `${item.entityType} #${item.entityId.slice(0, 8)}`;
  }
  return item.entityType || item.entityId || 'Umumiy sozlamalar';
}

function resolveResultBadge(status?: string): { text: string; bg: string; textCol: string } {
  const s = (status || '').toLowerCase();
  if (s === 'failed') {
    return { text: 'Xatolik', bg: 'bg-rose-50 dark:bg-rose-950/60', textCol: 'text-rose-600 dark:text-rose-400' };
  }
  if (s === 'warning') {
    return { text: 'Ogohlantirish', bg: 'bg-amber-50 dark:bg-amber-950/60', textCol: 'text-amber-600 dark:text-amber-400' };
  }
  if (s === 'info') {
    return { text: 'Ma‘lumot', bg: 'bg-blue-50 dark:bg-blue-950/60', textCol: 'text-blue-600 dark:text-blue-400' };
  }
  return { text: 'Muvaffaqiyatli', bg: 'bg-emerald-50 dark:bg-emerald-950/60', textCol: 'text-emerald-600 dark:text-emerald-400' };
}

function resolveDescription(item: AuditLogItem) {
  const name = item.userFullName || (item.username === 'admin' ? 'Super Admin' : (item.username || 'Foydalanuvchi'));
  if (item.action === 'LoginSuccess') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-emerald-600 dark:text-emerald-400 font-semibold">tizimga kirdi</span>
      </span>
    );
  }
  if (item.action === 'LoginFailed') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-rose-600 dark:text-rose-400 font-semibold">tizimga kirish rad etildi (parol xato)</span>
      </span>
    );
  }
  if (item.action === 'OrderCreated') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-blue-600 dark:text-blue-400 font-semibold">yangi buyurtma yaratdi</span>
      </span>
    );
  }
  if (item.action === 'OrderEdited') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-amber-600 dark:text-amber-400 font-semibold">buyurtmani tahrirladi</span>
      </span>
    );
  }
  if (item.action === 'OrderAgreed') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-indigo-600 dark:text-indigo-400 font-semibold">buyurtmani kelishdi</span>
      </span>
    );
  }
  if (item.action === 'OrderApproved') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-emerald-600 dark:text-emerald-400 font-semibold">buyurtmani tasdiqladi</span>
      </span>
    );
  }
  if (item.action === 'OrderCancelled') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-rose-600 dark:text-rose-400 font-semibold">buyurtmani bekor qildi</span>
      </span>
    );
  }
  if (item.action === 'IntakeNoticeCreated') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-blue-600 dark:text-blue-400 font-semibold">vagonlarni kiritish uchun xizmat xati tuzdi</span>
      </span>
    );
  }
  if (item.action === 'IntakeNoticeApproved') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-emerald-600 dark:text-emerald-400 font-semibold">xizmat xatini tasdiqlab ijroga yo‘naltirdi</span>
      </span>
    );
  }
  if (item.action === 'WagonsBroughtIn') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-sky-600 dark:text-sky-400 font-semibold">vagonlarni korxona hududiga kiritdi</span>
      </span>
    );
  }
  if (item.action === 'PermitChecked') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-purple-600 dark:text-purple-400 font-semibold">ruxsatnoma byurosi tekshiruvini tasdiqladi</span>
      </span>
    );
  }
  if (item.action === 'SecurityChecked') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-purple-600 dark:text-purple-400 font-semibold">qo‘riqlash xizmati tekshiruvini tasdiqladi</span>
      </span>
    );
  }
  if (item.action === 'TareWeighed') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-teal-600 dark:text-teal-400 font-semibold">tara og‘irligini tortdi va qayd etdi</span>
      </span>
    );
  }
  if (item.action === 'ProductLoadingStarted') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-cyan-600 dark:text-cyan-400 font-semibold">vagon(lar)ni yuklashni boshladi</span>
      </span>
    );
  }
  if (item.action === 'ProductLoaded') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-cyan-600 dark:text-cyan-400 font-semibold">mahsulot yuklash jarayonini yakunladi</span>
      </span>
    );
  }
  if (item.action === 'GrossWeighed') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-teal-600 dark:text-teal-400 font-semibold">brutto og‘irligini tortdi va qayd etdi</span>
      </span>
    );
  }
  if (item.action === 'SealInstalled') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-violet-600 dark:text-violet-400 font-semibold">plomba o‘rnatilganini tasdiqladi</span>
      </span>
    );
  }
  if (item.action === 'SealConfirmed') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-violet-600 dark:text-violet-400 font-semibold">vagon plombalarini tasdiqladi</span>
      </span>
    );
  }
  if (item.action === 'LoadingWagonEdited') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-amber-600 dark:text-amber-400 font-semibold">vagon yuklash ma'lumotlarini tahrirladi</span>
      </span>
    );
  }
  if (item.action === 'VoiceAlertAnnounced' || item.action.includes('VoiceAlert')) {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> ga <span className="text-emerald-600 dark:text-emerald-400 font-semibold">ovozli ogohlantirish eshittirildi</span>
        {item.details ? <span className="text-slate-500 dark:text-slate-400 text-[12px] block mt-0.5">{item.details}</span> : null}
      </span>
    );
  }
  if (item.action === 'YukXatiCreated') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-blue-600 dark:text-blue-400 font-semibold">yuk xatini shakllantirdi</span>
      </span>
    );
  }
  if (item.action === 'YukXatiSigned') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-emerald-600 dark:text-emerald-400 font-semibold">yuk xatini imzoladi va tasdiqladi</span>
      </span>
    );
  }
  if (item.action === 'YukXatiAgreed') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-indigo-600 dark:text-indigo-400 font-semibold">yuk xatini kelishdi</span>
      </span>
    );
  }
  if (item.action === 'ExitInspected') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-purple-600 dark:text-purple-400 font-semibold">chiqish tekshiruvidan o‘tkazib ruxsat berdi</span>
      </span>
    );
  }
  if (item.action === 'WagonsDispatched') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-emerald-600 dark:text-emerald-400 font-semibold">vagonlarni stansiyaga jo‘natdi</span>
      </span>
    );
  }
  if (item.action === 'YukXatiRegistered') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-emerald-600 dark:text-emerald-400 font-semibold">yuk xatini ro‘yxatdan o‘tkazdi</span>
      </span>
    );
  }
  if (item.action === 'EmptyWagonIntake') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-sky-600 dark:text-sky-400 font-semibold">bo‘sh vagon qabulini qayd etdi</span>
      </span>
    );
  }
  if (item.action === 'DefectActCreated') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-rose-600 dark:text-rose-400 font-semibold">nosozlik dalolatnomasi (GU-23) tuzdi</span>
      </span>
    );
  }
  if (item.action === 'ActApproved') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-amber-600 dark:text-amber-400 font-semibold">dalolatnomani tasdiqladi</span>
      </span>
    );
  }
  if (item.action === 'WagonReplaced') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-amber-600 dark:text-amber-400 font-semibold">vagonni almashtirdi</span>
      </span>
    );
  }
  if (item.action === 'WagonReturned') {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-rose-600 dark:text-rose-400 font-semibold">vagonni ortga (bo‘sh parkga) qaytardi</span>
      </span>
    );
  }
  if (item.action.includes('Sync')) {
    return (
      <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
        <strong>{name}</strong> <span className="text-blue-600 dark:text-blue-400 font-semibold">HR sinxronlash amalini bajardi</span>
      </span>
    );
  }
  return (
    <span className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed">
      <strong>{name}</strong> <span className="text-slate-600 dark:text-slate-300 font-semibold">{item.action}</span>
    </span>
  );
}

export default function AuditPage() {
  // State
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected Log (Barqaror 2 ustunli ko'rinish: Jadval hech qachon siljimaydi)
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.getAuditStats();
      if (res.success && res.data) {
        setStats(res.data);
      }
    } catch {
      // fallback
    }
  }, []);

  // Fetch Logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: AuditFilterParams = {
        page,
        pageSize,
        action: actionFilter !== 'all' ? actionFilter : undefined,
        search: search.trim() || undefined,
        status: resultFilter !== 'all' ? resultFilter : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      };

      const res = await api.getAuditLogs(params);
      if (res.success && res.data) {
        const rows = res.data.items || [];
        setItems(rows);
        setTotalCount(res.data.totalCount || 0);
        setTotalPages(res.data.totalPages || 1);

        // Faqat foydalanuvchi qatorni bosgandagina panel ochiladi, aks holda faqat jadval ko'rinadi
        setSelectedLog(current => {
          if (current) {
            const found = rows.find(r => r.id === current.id);
            if (found) return found;
          }
          return null;
        });
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, actionFilter, search, resultFilter, startDate, endDate]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const copyDetailsToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = async () => {
    try {
      const blob = await api.exportAuditLogs({
        action: actionFilter !== 'all' ? actionFilter : undefined,
        search: search.trim() || undefined,
        status: resultFilter !== 'all' ? resultFilter : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Eksport qilishda xatolik yuz berdi.');
    }
  };

  return (
    <div className="thub reestr thub-history space-y-4">
      {/* 2-RASMDAGI 4 TA HOLAT/BUTTON KARTALARI (Jami loglar, Muvaffaqiyatli, Ogohlantirishlar, Xatoliklar) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Jami loglar */}
        <button
          type="button"
          onClick={() => {
            setResultFilter('all');
            setPage(1);
          }}
          className={`audit-stat-card p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3.5 ${
            resultFilter === 'all'
              ? 'bg-white dark:bg-[#161c2b] border-blue-500 dark:border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
              : 'bg-white dark:bg-[#161c2b] border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
          }`}
          title="Barcha audit loglarini ko‘rish"
        >
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-500 dark:text-blue-400 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-2xl font-bold text-slate-900 dark:text-white leading-tight block">
              {stats?.totalLogs ?? totalCount}
            </span>
            <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Jami loglar
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center text-[11px] font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/50 px-1.5 py-0.5 rounded-md">
                ↘ {stats?.totalTrend ?? '-75%'}
              </span>
              <span className="text-[11px] text-slate-400">so‘nggi 7 kun</span>
            </div>
          </div>
        </button>

        {/* 2. Muvaffaqiyatli amallar */}
        <button
          type="button"
          onClick={() => {
            setResultFilter(resultFilter === 'Success' ? 'all' : 'Success');
            setPage(1);
          }}
          className={`audit-stat-card p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3.5 ${
            resultFilter === 'Success'
              ? 'bg-white dark:bg-[#161c2b] border-emerald-500 dark:border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
              : 'bg-white dark:bg-[#161c2b] border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
          }`}
          title="Muvaffaqiyatli amallarni filtrlash"
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-500 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-2xl font-bold text-slate-900 dark:text-white leading-tight block">
              {stats?.successCount ?? items.filter(x => x.status === 'Success').length}
            </span>
            <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Muvaffaqiyatli amallar
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center text-[11px] font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/50 px-1.5 py-0.5 rounded-md">
                ↘ {stats?.successTrend ?? '-75%'}
              </span>
              <span className="text-[11px] text-slate-400">so‘nggi 7 kun</span>
            </div>
          </div>
        </button>

        {/* 3. Ogohlantirishlar */}
        <button
          type="button"
          onClick={() => {
            setResultFilter(resultFilter === 'Warning' ? 'all' : 'Warning');
            setPage(1);
          }}
          className={`audit-stat-card p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3.5 ${
            resultFilter === 'Warning'
              ? 'bg-white dark:bg-[#161c2b] border-amber-500 dark:border-amber-500 ring-2 ring-amber-500/20 shadow-sm'
              : 'bg-white dark:bg-[#161c2b] border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
          }`}
          title="Ogohlantirishlarni filtrlash"
        >
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-2xl font-bold text-slate-900 dark:text-white leading-tight block">
              {stats?.warningCount ?? items.filter(x => x.status === 'Warning').length}
            </span>
            <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Ogohlantirishlar
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded-md">
                ↗ {stats?.warningTrend ?? '+0%'}
              </span>
              <span className="text-[11px] text-slate-400">so‘nggi 7 kun</span>
            </div>
          </div>
        </button>

        {/* 4. Xatoliklar */}
        <button
          type="button"
          onClick={() => {
            setResultFilter(resultFilter === 'Failed' ? 'all' : 'Failed');
            setPage(1);
          }}
          className={`audit-stat-card p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3.5 ${
            resultFilter === 'Failed'
              ? 'bg-white dark:bg-[#161c2b] border-rose-500 dark:border-rose-500 ring-2 ring-rose-500/20 shadow-sm'
              : 'bg-white dark:bg-[#161c2b] border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
          }`}
          title="Xatoliklarni filtrlash"
        >
          <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-500 dark:text-rose-400 flex items-center justify-center shrink-0">
            <XCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-2xl font-bold text-slate-900 dark:text-white leading-tight block">
              {stats?.failedCount ?? items.filter(x => x.status === 'Failed' || x.action === 'LoginFailed').length}
            </span>
            <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Xatoliklar
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded-md">
                ↗ {stats?.failedTrend ?? '+0%'}
              </span>
              <span className="text-[11px] text-slate-400">so‘nggi 7 kun</span>
            </div>
          </div>
        </button>
      </div>

      {/* ASOSIY QISM: BARQAROR 2 USTUNLI MASTER-DETAIL KO'RINISHI */}
      {/* Jadval hech qachon sakramaydi, toraymaydi yoki siljimaydi! */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* 1. CHAP TARAF: FILTRLAR VA JADVAL (Doimiy barqaror maydon) */}
        <div className="w-full lg:flex-1 min-w-0 docs-panel">
          {/* FILTR VA BOSHQARUV TOOLBARI (Skrinshotdagidek faqat jadval ustida) */}
          <div className="thub__toolbar reestr-toolbar flex flex-wrap items-center justify-between gap-2.5 p-2.5 bg-white dark:bg-[#161c2b] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
              {/* Qidiruv */}
              <label className="thub-search relative min-w-[160px] max-w-[240px] flex-1">
                <Search className="thub-search__ico w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Qidirish..."
                  className="w-full h-10 pl-9 pr-8 text-[14px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-xs"
                />
                {search ? (
                  <button
                    type="button"
                    className="thub-search__x absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    onClick={() => {
                      setSearch('');
                      setPage(1);
                    }}
                    aria-label="Tozalash"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </label>

              {/* Amal turi dropdown - Placeholder ko‘rinishi va to‘liq jarayonlar */}
              <div className="relative">
                <select
                  value={actionFilter}
                  onChange={e => {
                    setActionFilter(e.target.value);
                    setPage(1);
                  }}
                  className={`h-10 appearance-none pl-3.5 pr-9 text-[14px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer shadow-xs transition-colors ${
                    actionFilter === 'all'
                      ? 'text-slate-400 dark:text-slate-500 font-normal'
                      : 'text-slate-800 dark:text-slate-100 font-medium'
                  }`}
                >
                  <option value="all" className="text-slate-400 dark:text-slate-500">
                    Barcha amallar
                  </option>
                  <optgroup label="Tizim va Xavfsizlik">
                    <option value="LoginSuccess">Tizimga kirish</option>
                    <option value="LoginFailed">Kirish rad etildi</option>
                    <option value="PasswordChanged">Parol almashtirildi</option>
                    <option value="PasswordChangeFailed">Parol xatosi</option>
                    <option value="UserCreated">Xodim yaratildi</option>
                    <option value="UserUpdated">Xodim yangilandi</option>
                    <option value="UserDeleted">Xodim o‘chirildi</option>
                    <option value="UserPasswordReset">Parol yangilandi</option>
                    <option value="Sync">HR sinxronlash</option>
                  </optgroup>
                  <optgroup label="Buyurtma jarayoni">
                    <option value="OrderCreated">Buyurtma yaratildi</option>
                    <option value="OrderEdited">Buyurtma tahrirlandi</option>
                    <option value="OrderAgreed">Buyurtma kelishildi</option>
                    <option value="OrderApproved">Buyurtma tasdiqlandi</option>
                    <option value="OrderCancelled">Buyurtma bekor qilindi</option>
                  </optgroup>
                  <optgroup label="Kiritish (1–4-bosqich)">
                    <option value="EmptyWagonIntake">Bo‘sh vagon qabul qilindi</option>
                    <option value="IntakeNoticeApproved">Xizmat xati tasdiqlandi</option>
                    <option value="PermitChecked">Ruxsatnoma tekshirildi</option>
                    <option value="SecurityChecked">Qo‘riqlash tekshirildi</option>
                  </optgroup>
                  <optgroup label="Yuklash & Tarozi (5–8-bosqich)">
                    <option value="TareWeighed">Tara og‘irligi tortildi</option>
                    <option value="ProductLoadingStarted">Yuklash boshlandi</option>
                    <option value="ProductLoaded">Mahsulot yuklandi</option>
                    <option value="GrossWeighed">Brutto og‘irligi tortildi</option>
                    <option value="SealInstalled">Plomba o‘rnatildi</option>
                    <option value="SealConfirmed">Plomba tasdiqlandi</option>
                    <option value="LoadingWagonEdited">Yuklash tahrirlandi</option>
                  </optgroup>
                  <optgroup label="Chiqish & Hujjatlar (9–12-bosqich)">
                    <option value="YukXatiCreated">Yuk xati shakllantirildi</option>
                    <option value="YukXatiSigned">Yuk xati tasdiqlandi</option>
                    <option value="YukXatiAgreed">Yuk xati kelishildi</option>
                    <option value="YukXatiRegistered">Yuk xati ro‘yxatdan o‘tdi</option>
                    <option value="WagonsDispatched">Vagonlar jo‘natildi</option>
                  </optgroup>
                  <optgroup label="Nosozliklar va Qaytarish">
                    <option value="DefectActCreated">Nosozlik dalolatnomasi</option>
                    <option value="WagonReturned">Vagon qaytarildi</option>
                  </optgroup>
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Natija dropdown - Placeholder ko‘rinishi */}
              <div className="relative">
                <select
                  value={resultFilter}
                  onChange={e => {
                    setResultFilter(e.target.value);
                    setPage(1);
                  }}
                  className={`h-10 appearance-none pl-3.5 pr-9 text-[14px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer shadow-xs transition-colors ${
                    resultFilter === 'all'
                      ? 'text-slate-400 dark:text-slate-500 font-normal'
                      : 'text-slate-800 dark:text-slate-100 font-medium'
                  }`}
                >
                  <option value="all" className="text-slate-400 dark:text-slate-500">
                    Natija
                  </option>
                  <option value="Success" className="text-slate-900 dark:text-slate-100">
                    Muvaffaqiyatli
                  </option>
                  <option value="Warning" className="text-slate-900 dark:text-slate-100">
                    Ogohlantirish
                  </option>
                  <option value="Failed" className="text-slate-900 dark:text-slate-100">
                    Xatolik
                  </option>
                  <option value="Info" className="text-slate-900 dark:text-slate-100">
                    Ma'lumot
                  </option>
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Sana filtri: Buyurtmadagi kabi Dan / Gacha */}
              <OrderPeriodPicker
                variant="embedded"
                from={startDate}
                to={endDate}
                onFromChange={val => {
                  setStartDate(val);
                  setPage(1);
                }}
                onToChange={val => {
                  setEndDate(val);
                  setPage(1);
                }}
              />
            </div>

            {/* O'ng tugmalar: Eksport va Yangilash */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleExport}
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-xs transition-colors cursor-pointer shrink-0"
                title="CSV formatida eksport qilish"
              >
                <Download className="w-4 h-4 text-slate-500" />
              </button>

              <button
                type="button"
                onClick={() => {
                  void fetchLogs();
                  void fetchStats();
                }}
                disabled={loading}
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-xs transition-colors cursor-pointer shrink-0"
                title="Yangilash"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
              </button>
            </div>
          </div>

          {/* JADVAL KARTASI */}
          <div className="ui-card reestr-card overflow-hidden bg-white dark:bg-[#161c2b] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="thub-table-wrap reestr-table-wrap overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1020px] [&_th]:border-x-0 [&_td]:border-x-0 [&_th]:border-t-0 [&_td]:border-t-0">
                <thead>
                  <tr className="border-b border-[#cbd5e1] dark:border-slate-700 text-[12px] font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider bg-[#dcecf8] dark:bg-slate-800">
                    <th className="py-2.5 px-3.5 w-[170px]">Vaqt</th>
                    <th className="py-2.5 px-3.5 w-[200px]">Foydalanuvchi</th>
                    <th className="py-2.5 px-3.5 w-[160px]">Amal</th>
                    <th className="py-2.5 px-3.5 w-[100px]">Modul</th>
                    <th className="py-2.5 px-3.5 w-[150px]">Obyekt</th>
                    <th className="py-2.5 px-3.5 w-[130px]">Natija</th>
                    <th className="py-2.5 px-3.5 w-[120px] text-right">IP Manzil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-500 mb-2" />
                        <span className="text-[13px] font-medium">Yuklanmoqda...</span>
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 text-[13px]">
                        Hech qanday audit log topilmadi.
                      </td>
                    </tr>
                  ) : (
                    items.map(item => {
                      const actionMeta = resolveActionDisplay(item.action, item.status);
                      const moduleMeta = resolveModuleDisplay(item.category, item.action);
                      const objectStr = resolveObjectDisplay(item);
                      const resultMeta = resolveResultBadge(item.status);
                      const cleanIp = (item.ipAddress || '—').replace('::ffff:', '');
                      const displayName = item.userFullName || (item.username === 'admin' ? 'Super Admin' : (item.username || 'Noma‘lum'));
                      const isSelected = selectedLog?.id === item.id;

                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedLog(item)}
                          className={`transition-colors cursor-pointer group ${
                            isSelected
                              ? 'bg-blue-50/80 dark:bg-blue-950/40'
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          {/* 1. VAQT (Faqat kun oy yil BOLD, vaqt oddiy) - 14px */}
                          <td className="py-2 px-3.5 whitespace-nowrap">
                            <span className="text-[14px] text-slate-900 dark:text-slate-100 font-mono">
                              <strong className="font-bold">{formatDate(item.createdAt)}</strong>{' '}
                              <span className="font-normal text-slate-500 dark:text-slate-400">{formatTime(item.createdAt)}</span>
                            </span>
                          </td>

                          {/* 2. FOYDALANUVCHI (Faqat to‘liq ism, 14px, login ko‘rsatilmaydi) */}
                          <td className="py-2 px-3.5 min-w-[190px]">
                            <p className="text-[14px] font-normal text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              {displayName}
                            </p>
                          </td>

                          {/* 3. AMAL (Oddiy shrift 14px + status nuqtasi) */}
                          <td className="py-2 px-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${actionMeta.dotColor}`} />
                              <span className="text-[14px] font-normal text-slate-800 dark:text-slate-200">
                                {actionMeta.text}
                              </span>
                            </div>
                          </td>

                          {/* 4. MODUL (Button/badge ichi 13px) */}
                          <td className="py-2 px-3.5 whitespace-nowrap">
                            <span className={`inline-block px-2.5 py-0.5 rounded-md text-[13px] font-normal ${moduleMeta.bg} ${moduleMeta.textCol}`}>
                              {moduleMeta.text}
                            </span>
                          </td>

                          {/* 5. OBYEKT (14px font-mono) */}
                          <td className="py-2 px-3.5 whitespace-nowrap">
                            <span className="text-[14px] font-mono font-normal text-slate-700 dark:text-slate-300 truncate block max-w-[150px]" title={objectStr}>
                              {objectStr}
                            </span>
                          </td>

                          {/* 6. NATIJA (Button/badge ichi 13px) */}
                          <td className="py-2 px-3.5 whitespace-nowrap">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[13px] font-normal ${resultMeta.bg} ${resultMeta.textCol}`}>
                              {resultMeta.text}
                            </span>
                          </td>

                          {/* 7. IP MANZIL (14px font-mono) */}
                          <td className="py-2 px-3.5 whitespace-nowrap text-right">
                            <span className="text-[14px] font-mono font-normal text-slate-600 dark:text-slate-400">
                              {cleanIp}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* SAHIFALASH (Foydalanuvchilar andozasi) */}
            <TablePagination
              total={totalCount}
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              unitLabel="yozuv"
              pageSizeOptions={[10, 20, 25, 50, 100]}
              className="kpi-pagination--in-card"
            />
          </div>
        </div>

        {/* 2. O'NG TARAF: FAQAT BOSGANDA CHIQADIGAN TAFSILOTLAR PANELI */}
        {selectedLog && (
          <div className="w-full lg:w-[360px] xl:w-[380px] shrink-0">
            <div className="bg-white dark:bg-[#161c2b] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 space-y-5 sticky top-4">
              {/* Header: Log tafsilotlari + ID + Deselect */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">
                  Log tafsilotlari
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                    ID: {selectedLog.id.slice(0, 8).toUpperCase()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedLog(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Yopish"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 1. ASOSIY MA'LUMOTLAR */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Asosiy ma‘lumotlar
                </h4>

                <div className="space-y-2.5 text-[13px]">
                  {/* Vaqt */}
                  <div className="flex items-center justify-between gap-2 border-b border-dashed border-slate-100 dark:border-slate-800/80 pb-2">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Vaqt</span>
                    </div>
                    <span className="font-mono text-slate-900 dark:text-slate-100">
                      <strong className="font-bold">{formatDate(selectedLog.createdAt)}</strong>{' '}
                      <span className="font-normal text-slate-500 dark:text-slate-400">{formatTime(selectedLog.createdAt)}</span>
                    </span>
                  </div>

                  {/* Foydalanuvchi */}
                  <div className="flex items-center justify-between gap-2 border-b border-dashed border-slate-100 dark:border-slate-800/80 pb-2">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <User className="w-3.5 h-3.5" />
                      <span>Foydalanuvchi</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {selectedLog.userFullName || (selectedLog.username === 'admin' ? 'Super Admin' : selectedLog.username)}
                      </span>
                      {selectedLog.username && (
                        <span className="text-slate-400 text-xs font-mono ml-1">
                          @{selectedLog.username}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amal */}
                  <div className="flex items-center justify-between gap-2 border-b border-dashed border-slate-100 dark:border-slate-800/80 pb-2">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Amal</span>
                    </div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {resolveActionDisplay(selectedLog.action, selectedLog.status).text}
                    </span>
                  </div>

                  {/* Modul */}
                  <div className="flex items-center justify-between gap-2 border-b border-dashed border-slate-100 dark:border-slate-800/80 pb-2">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <Package className="w-3.5 h-3.5" />
                      <span>Modul</span>
                    </div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {resolveModuleDisplay(selectedLog.category, selectedLog.action).text}
                    </span>
                  </div>

                  {/* Obyekt */}
                  <div className="flex items-center justify-between gap-2 border-b border-dashed border-slate-100 dark:border-slate-800/80 pb-2">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <FileCode className="w-3.5 h-3.5" />
                      <span>Obyekt</span>
                    </div>
                    <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                      {resolveObjectDisplay(selectedLog)}
                    </span>
                  </div>

                  {/* Natija */}
                  <div className="flex items-center justify-between gap-2 border-b border-dashed border-slate-100 dark:border-slate-800/80 pb-2">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Natija</span>
                    </div>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${resolveResultBadge(selectedLog.status).bg} ${resolveResultBadge(selectedLog.status).textCol}`}>
                      {resolveResultBadge(selectedLog.status).text}
                    </span>
                  </div>

                  {/* IP manzil */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <Globe className="w-3.5 h-3.5" />
                      <span>IP manzil</span>
                    </div>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {(selectedLog.ipAddress || '—').replace('::ffff:', '')}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. TAVSIF */}
              <div className="space-y-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Tavsif
                </h4>
                <p className="text-[13px] leading-relaxed font-medium">
                  {resolveDescription(selectedLog)}
                </p>
              </div>

              {/* 3. QO'SHIMCHA MA'LUMOTLAR */}
              <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Qo‘shimcha ma‘lumotlar
                </h4>

                <div className="space-y-2 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Rol</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {selectedLog.userRole || (selectedLog.username === 'admin' ? 'Super Admin' : 'Foydalanuvchi')}
                    </span>
                  </div>

                  {selectedLog.userPosition && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">Lavozim</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {selectedLog.userPosition}
                      </span>
                    </div>
                  )}

                  {selectedLog.userDepartment && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">Bo‘lim</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {selectedLog.userDepartment}
                      </span>
                    </div>
                  )}

                  {/* Tafsilotlar JSON bloki */}
                  {selectedLog.details && (
                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-slate-400 uppercase">Tafsilot (JSON)</span>
                        <button
                          type="button"
                          onClick={() => copyDetailsToClipboard(selectedLog.details)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copied ? 'Nusxalandi' : 'Nusxa'}</span>
                        </button>
                      </div>
                      <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
                        {selectedLog.details}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
