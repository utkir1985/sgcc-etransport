import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import {
  ArrowDown,
  ArrowUp,
  BriefcaseBusiness,
  Building2,
  Calculator,
  ChevronDown,
  ChevronsUpDown,
  Crown,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  LockKeyhole,
  Megaphone,
  Pencil,
  Plus,
  Scale,
  Search,
  Shield,
  TrainFront,
  Trash2,
  Truck,
  UserPlus,
  UserRound,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { AdminUserProfile } from '../../../shared/types';
import { ROLE_LABELS } from '../../../shared/types';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { TablePagination } from '../../../shared/components/TablePagination';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';

type UserAction = 'create' | 'edit' | 'block' | 'reset' | null;
type SortField = 'username' | 'fullName' | 'role' | 'department';
type SortOrder = 'asc' | 'desc';

function FilterSelect({
  value,
  options,
  allLabel,
  getLabel = option => option,
  onChange,
}: {
  value: string;
  options: string[];
  allLabel: string;
  getLabel?: (option: string) => string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const display = value ? getLabel(value) : allLabel;

  return (
    <div ref={ref}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`users-toolbar__control flex w-full sm:w-[260px] items-center justify-between gap-2 text-left ${
            open ? 'users-toolbar__control--open' : ''
          }`}
        >
          <span className="line-clamp-1 text-sm text-slate-800 dark:text-slate-100 break-words flex-1">
            {display}
          </span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180 text-blue-500' : ''}`}
            strokeWidth={1.75}
          />
        </button>

        {open && (
          <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-full sm:w-[290px] max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-850">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                !value
                  ? 'bg-blue-50 font-semibold text-blue-600 dark:bg-blue-500/15 dark:text-blue-300'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {allLabel}
            </button>
            {options.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] leading-snug break-words transition-colors ${
                  value === option
                    ? 'bg-blue-50 font-semibold text-blue-600 dark:bg-blue-500/15 dark:text-blue-300'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {getLabel(option)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PortalDropdown({
  isOpen,
  onClose,
  triggerRef,
  children,
  className = '',
}: {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  className?: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number; width: number }>({
    left: 0,
    width: 0,
  });

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updateCoords = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;

      if (openUp) {
        setCoords({
          bottom: window.innerHeight - rect.top + 6,
          left: Math.max(8, rect.left),
          width: rect.width,
        });
      } else {
        setCoords({
          top: rect.bottom + 6,
          left: Math.max(8, rect.left),
          width: rect.width,
        });
      }
    };

    updateCoords();
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [isOpen, triggerRef]);

  useEffect(() => {
    if (!isOpen) return;
    const handleDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: `${coords.left}px`,
        width: `${coords.width}px`,
        ...(coords.top !== undefined ? { top: `${coords.top}px` } : {}),
        ...(coords.bottom !== undefined ? { bottom: `${coords.bottom}px` } : {}),
        zIndex: 99999,
      }}
      className={`max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </div>,
    document.body
  );
}

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  middleName: '',
  username: '',
  password: '123456',
  mustChangePassword: true,
  role: '',
  department: '',
  position: '',
};


const ROLE_DEPARTMENT: Record<string, string> = {
  Admin: 'Axborot texnologiyalari bo‘limi',
  Marketing: 'Mahsulotlarni sotish va marketing xizmati',
  Dispatching: 'Ishlab chiqarish dispetcherlik xizmati',
  DispatchSupervisor: 'Ishlab chiqarish dispetcherlik xizmati',
  Accounting: 'Buxgalteriya bo‘limi',
  Railway: 'Temir yo‘l sexi',
  Road: 'Avtotransport sexi',
  Warehouse: 'Tayyor mahsulotlar va xom ashyo sexi',
  Scale: 'Temir yo‘l sexi',
  Permit: 'Ruxsatnoma byurosi',
  Security: 'Qo‘riqlash xizmati',
  Economist: 'Ishlab chiqarish dispetcherlik xizmati',
  Management: 'Rahbariyat',
  DeputyDirector: 'Bosh direktorning ishlab chiqarish bo‘yicha o‘rinbosari',
};

const DEPARTMENT_POSITIONS: Record<string, string[]> = {
  'Axborot texnologiyalari bo‘limi': [
    'Administrator',
    'Tizim administratori',
    'Yetakchi dasturchi',
    'Dasturchi',
    'IT mutaxassis',
  ],
  'Mahsulotlarni sotish va marketing xizmati': [
    'Xizmat boshlig‘i',
    'Yetakchi mutaxassis (barcha mahsulotlarni sotish bo‘yicha)',
    'Mutaxassis (tayyor mahsulotlar bo‘yicha)',
    'Texnik',
  ],
  'Ishlab chiqarish dispetcherlik xizmati': [
    'IChDX boshlig‘i',
    'Smena boshlig‘i',
    'Muhandis-texnik (mahsulotlarni jo‘natishga tayyorlash bo‘yicha)',
  ],
  'Buxgalteriya bo‘limi': [
    'Bosh buxgalter',
    'Bosh buxgalter o‘rinbosari',
    'Buxgalter',
    'Yetakchi hisobchi',
    'Hisobchi',
  ],
  'Temir yo‘l sexi': [
    'TYTTX boshlig’i',
    'Xizmat boshligʻi oʻrinbosari',
    'Katta dispecher',
    'Dispetcher',
    'Vagon qabul qilib topshiruvchi',
    'Kontrolyor hisob- kitob yurituvchi (tarozibon)',
  ],
  'Avtotransport sexi': [
    'Sex boshlig‘i',
    'Avtotransport dispetcheri',
    'Mexanik',
    'Katta dispetcher',
    'Haydovchi',
  ],
  'Tayyor mahsulotlar va xom ashyo sexi': [
    'Sex boshlig‘i',
    'Yetakchi texnolog',
    'Smena muhandisi',
  ],
  'Ruxsatnoma byurosi': [
    'X va MIB boshlig‘i-bosh mutaxassis',
    'Toifalangan obyektlar bo‘yicha yetakchi mutaxassis',
    'Obyektlarni qo‘riqlash xizmati boshlig‘i',
    'Ruxsatnoma byurosi mutaxassisi',
  ],
  'Qo‘riqlash xizmati': [
    '2-AB 1-otryad komandiri, mayor',
    '2-AB 1-otryad komandiri o‘rinbosari, leytenant',
    '2-AB 1-otryad guruh komandiri, kapitan',
    '2-AB 2-otryad komandiri, katta leytenant',
    '2-AB 2-otryad komandiri o‘rinbosari, kapitan',
    '2-AB 2-otryad guruh komandiri, leytenant',
  ],
  'Rahbariyat': [
    'Bosh direktor',
  ],
  'Bosh direktorning ishlab chiqarish bo‘yicha o‘rinbosari': [
    'Bosh direktor o‘rinbosari',
  ],
};

const AVATAR_TONES = ['emerald', 'violet', 'sky', 'amber', 'rose', 'indigo', 'cyan', 'blue'] as const;

const ROLE_META: Record<string, { tone: typeof AVATAR_TONES[number]; icon: LucideIcon }> = {
  Admin: { tone: 'blue', icon: Crown },
  Marketing: { tone: 'sky', icon: Megaphone },
  Dispatching: { tone: 'indigo', icon: Truck },
  DispatchSupervisor: { tone: 'indigo', icon: Crown },
  Accounting: { tone: 'violet', icon: Calculator },
  Railway: { tone: 'amber', icon: TrainFront },
  Road: { tone: 'cyan', icon: Truck },
  Warehouse: { tone: 'emerald', icon: Warehouse },
  Scale: { tone: 'rose', icon: Scale },
  Permit: { tone: 'violet', icon: Shield },
  Security: { tone: 'emerald', icon: Shield },
  Economist: { tone: 'amber', icon: Calculator },
  Management: { tone: 'blue', icon: Crown },
  DeputyDirector: { tone: 'blue', icon: Crown },
};

function hashTone(value: string): typeof AVATAR_TONES[number] {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash + value.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length;
  }
  return AVATAR_TONES[hash];
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    lastName: parts[0] || '',
    firstName: parts[1] || '',
    middleName: parts.slice(2).join(' '),
  };
}

function loginPart(value: string): string {
  return value
    .toLocaleLowerCase('uz')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function loginFromName(lastName: string, firstName: string, middleName?: string): string {
  const l = loginPart(lastName);
  const f = loginPart(firstName).charAt(0);
  const m = middleName ? loginPart(middleName).charAt(0) : '';
  return `${l}${f}${m}`;
}

function SortHeader({
  field,
  label,
  activeField,
  order,
  onSort,
}: {
  field: SortField;
  label: string;
  activeField: SortField | null;
  order: SortOrder;
  onSort: (field: SortField) => void;
}) {
  const isActive = activeField === field;
  return (
    <th className="users-table__sortable" onClick={() => onSort(field)} title={`${label} bo‘yicha tartiblash`}>
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className={`inline-flex shrink-0 ${isActive ? 'text-blue-600 dark:text-sky-400' : 'text-slate-400'}`}>
          {isActive ? (
            order === 'asc' ? <ArrowUp className="w-3.5 h-3.5" strokeWidth={2.2} /> : <ArrowDown className="w-3.5 h-3.5" strokeWidth={2.2} />
          ) : (
            <ChevronsUpDown className="w-3.5 h-3.5" strokeWidth={2} />
          )}
        </span>
      </div>
    </th>
  );
}

export default function UsersPage() {
  const { canUsersCreate, canUsersRead, canUsersUpdate, canUsersDelete } = useRbacPermission();
  const [users, setUsers] = useState<AdminUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<UserAction>(null);
  const [selected, setSelected] = useState<AdminUserProfile | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isCustomPosition, setIsCustomPosition] = useState(false);
  const [isPositionOpen, setIsPositionOpen] = useState(false);
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const positionButtonRef = useRef<HTMLButtonElement>(null);
  const roleButtonRef = useRef<HTMLButtonElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        setSortField(null);
        setSortOrder('asc');
      }
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const load = () => {
    setLoading(true);
    api.getUsers()
      .then(res => setUsers(res.data ?? []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const roleOptions = useMemo(() => Object.keys(ROLE_LABELS), []);

  const positionOptions = useMemo(() => {
    if (!form.department) return [];
    const list = [...(DEPARTMENT_POSITIONS[form.department] ?? [])];
    if (form.position && !list.includes(form.position)) {
      list.push(form.position);
    }
    return list;
  }, [form.department, form.position]);

  const sortedUsers = useMemo(() => {
    if (!sortField) return users;
    return [...users].sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortField === 'username') {
        valA = a.username || '';
        valB = b.username || '';
      } else if (sortField === 'fullName') {
        valA = a.fullName || '';
        valB = b.fullName || '';
      } else if (sortField === 'role') {
        valA = ROLE_LABELS[a.role] ?? a.role ?? '';
        valB = ROLE_LABELS[b.role] ?? b.role ?? '';
      } else if (sortField === 'department') {
        valA = a.department || '';
        valB = b.department || '';
      }

      const cmp = valA.localeCompare(valB, 'uz', { sensitivity: 'base' });
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [users, sortField, sortOrder]);

  const [departmentFilter, setDepartmentFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');

  const departmentOptions = useMemo(() => {
    const list = users.map(u => u.department).filter(Boolean);
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b, 'uz'));
  }, [users]);

  const filterRoleOptions = useMemo(() => {
    const present = new Set(users.map(u => u.role));
    return roleOptions.filter(role => present.has(role));
  }, [users, roleOptions]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('uz');
    return sortedUsers.filter(u => {
      if (departmentFilter && u.department !== departmentFilter) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (!query) return true;
      return [u.fullName, u.username, ROLE_LABELS[u.role] ?? u.role]
        .some(value => (value || '').toLocaleLowerCase('uz').includes(query));
    });
  }, [sortedUsers, departmentFilter, roleFilter, search]);

  const handleExportExcel = () => {
    const listToExport = filteredUsers;

    const rows = [
      ['№', 'Bo‘lim', 'F.I.O.', 'Lavozim', 'Login', 'Parol'],
      ...listToExport.map((user, idx) => [
        idx + 1,
        user.department || '—',
        user.fullName || '—',
        user.position || '—',
        user.username || '—',
        '123456',
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 38 },
      { wch: 36 },
      { wch: 45 },
      { wch: 20 },
      { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    const sheetName = departmentFilter ? departmentFilter.slice(0, 31) : 'Foydalanuvchilar';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const safeFilterName = departmentFilter
      ? `_${departmentFilter.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20)}`
      : '';
    const filename = `foydalanuvchilar${safeFilterName}.xlsx`;

    XLSX.writeFile(wb, filename);
  };

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [pageSize, sortField, sortOrder, departmentFilter, roleFilter, search]);

  const closeDialog = () => {
    setAction(null);
    setSelected(null);
    setIsCustomPosition(false);
    setIsPositionOpen(false);
    setIsRoleOpen(false);
    setShowPassword(false);
    setMessage('');
  };

  const openEdit = (user: AdminUserProfile) => {
    const name = splitFullName(user.fullName);
    const dept = user.department || ROLE_DEPARTMENT[user.role] || '';
    const pos = user.position || user.departmentShortName || '';
    const deptPositions = DEPARTMENT_POSITIONS[dept] ?? [];
    const isCustom = Boolean(pos && !deptPositions.includes(pos));

    setSelected(user);
    setIsCustomPosition(isCustom);
    setIsPositionOpen(false);
    setIsRoleOpen(false);
    setForm({
      ...name,
      username: user.username,
      password: '',
      mustChangePassword: Boolean(user.mustChangePassword),
      role: user.role,
      department: dept,
      position: pos,
    });
    setShowPassword(false);
    setMessage('');
    setAction('edit');
  };

  const updateNameField = (field: 'firstName' | 'lastName' | 'middleName', value: string) => {
    setForm(current => {
      const next = { ...current, [field]: value };
      return {
        ...next,
        username: action === 'create'
          ? loginFromName(next.lastName, next.firstName, next.middleName)
          : next.username,
      };
    });
  };

  const handleRoleSelect = (role: string) => {
    const autoDept = ROLE_DEPARTMENT[role] || '';
    setForm(f => ({
      ...f,
      role,
      department: autoDept,
      position: '',
    }));
    setIsCustomPosition(false);
    setIsPositionOpen(false);
    setIsRoleOpen(false);
  };

  const openBlock = (user: AdminUserProfile) => {
    setSelected(user);
    setMessage('');
    setAction('block');
  };

  const openReset = (user: AdminUserProfile) => {
    setSelected(user);
    setMessage('');
    setAction('reset');
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    if (!form.role) {
      setMessage('Iltimos, rolni tanlang');
      return;
    }
    if (!form.position.trim()) {
      setMessage('Iltimos, lavozimni tanlang yoki kiriting');
      return;
    }
    const fullName = [form.lastName, form.firstName, form.middleName].map(value => value.trim()).filter(Boolean).join(' ');
    try {
      if (action === 'create') {
        const res = await api.createUser({
          username: form.username,
          fullName,
          role: form.role,
          department: form.department,
          position: form.position.trim(),
          password: form.password || '123456',
          mustChangePassword: form.mustChangePassword,
        });
        if (res.data) {
          setUsers(prev => [res.data, ...prev]);
          closeDialog();
        } else {
          setMessage(res.message || 'Yaratishda xatolik');
        }
      } else if (action === 'edit' && selected) {
        const res = await api.updateUser(selected.id, {
          username: form.username,
          fullName,
          role: form.role,
          department: form.department,
          position: form.position,
          password: form.password || undefined,
          mustChangePassword: form.mustChangePassword,
        });
        if (res.data) {
          setUsers(prev => prev.map(u => (u.id === selected.id ? res.data : u)));
          closeDialog();
        } else {
          setMessage(res.message || 'Saqlashda xatolik');
        }
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Xatolik yuz berdi');
    }
  };

  const handleResetPassword = async () => {
    if (!selected) return;
    try {
      const res = await api.resetUserPassword(selected.id);
      if (res.success) {
        closeDialog();
      } else {
        setMessage(res.message || 'Parolni tiklashda xatolik');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Xatolik yuz berdi');
    }
  };

  const handleDeleteUser = async () => {
    if (!selected) return;
    try {
      const res = await api.deleteUser(selected.id);
      if (res.success) {
        setUsers(prev => prev.filter(u => u.id !== selected.id));
        closeDialog();
      } else {
        setMessage(res.message || "O'chirishda xatolik");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Xatolik yuz berdi');
    }
  };

  if (!canUsersRead) {
    return (
      <div className="ui-card p-8 text-center">
        <Shield className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Ruxsat cheklangan</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Sizning rolingizda foydalanuvchilar ro‘yxatini ko‘rish huquqi mavjud emas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="ui-card users-toolbar">
        <div className="users-toolbar__filters">
          <label className="users-toolbar__search">
            <Search aria-hidden className="w-4 h-4" strokeWidth={2} />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ism, login yoki rol bo‘yicha qidirish..."
            />
          </label>
          <FilterSelect
            value={roleFilter}
            options={filterRoleOptions}
            allLabel="Barcha rollar"
            getLabel={role => ROLE_LABELS[role] ?? role}
            onChange={setRoleFilter}
          />
          <FilterSelect
            value={departmentFilter}
            options={departmentOptions}
            allLabel="Barcha bo‘limlar"
            onChange={setDepartmentFilter}
          />
        </div>

        <div className="users-toolbar__actions">
          <button
            type="button"
            className="users-toolbar__excel"
            onClick={handleExportExcel}
            title="Ko‘rinib turgan ro‘yxatni Excel formatida yuklab olish"
          >
            <FileSpreadsheet className="w-4 h-4" strokeWidth={2} />
            <span>Excel</span>
          </button>

          {canUsersCreate && (
            <button
              type="button"
              className="btn-primary users-toolbar__primary"
              onClick={() => {
                setSelected(null);
                setForm(EMPTY_FORM);
                setIsCustomPosition(false);
                setIsPositionOpen(false);
                setIsRoleOpen(false);
                setShowPassword(false);
                setMessage('');
                setAction('create');
              }}
            >
              <Plus className="w-4 h-4" strokeWidth={2.2} />
              <span>Yangi foydalanuvchi</span>
            </button>
          )}
        </div>
      </div>

      <div className="ui-card admin-users-card overflow-hidden">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="admin-table__col-num">T/r</th>
                <SortHeader field="fullName" label="F.I.O" activeField={sortField} order={sortOrder} onSort={handleSort} />
                <SortHeader field="role" label="Rol" activeField={sortField} order={sortOrder} onSort={handleSort} />
                <SortHeader field="department" label="Bo‘lim / yo‘nalish" activeField={sortField} order={sortOrder} onSort={handleSort} />
                <th>Lavozim</th>
                <th className="admin-table__actions">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="admin-table__empty">Yuklanmoqda...</td>
                </tr>
              ) : pageUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-table__empty">Foydalanuvchilar topilmadi</td>
                </tr>
              ) : (
                pageUsers.map((user, index) => {
                  const roleMeta = ROLE_META[user.role] ?? { tone: hashTone(user.role), icon: Shield };
                  const rowNumber = (currentPage - 1) * pageSize + index + 1;

                  return (
                    <tr key={user.id}>
                      <td className="admin-table__col-num">{rowNumber}</td>
                      <td>
                        <div className="users-table__person">
                          <span className="users-table__name">{user.fullName || user.username}</span>
                          {user.fullName && <span className="users-table__login">{user.username}</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`users-role-pill users-role-pill--${roleMeta.tone}`}>
                          {ROLE_LABELS[user.role] ?? user.role}
                        </span>
                      </td>
                      <td className="users-table__department">{user.department || '—'}</td>
                      <td className="admin-user-position">{user.position || '—'}</td>
                      <td>
                        <div className="users-table__actions">
                          {canUsersUpdate && (
                            <button
                              type="button"
                              className="users-action-btn users-action-btn--blue"
                              title="Tahrirlash"
                              onClick={() => openEdit(user)}
                            >
                              <Pencil className="w-4 h-4" strokeWidth={2} />
                            </button>
                          )}
                          {canUsersUpdate && (
                            <button
                              type="button"
                              className="users-action-btn users-action-btn--amber"
                              title="Parolni tiklash"
                              onClick={() => openReset(user)}
                            >
                              <KeyRound className="w-4 h-4" strokeWidth={2} />
                            </button>
                          )}
                          {canUsersDelete && (
                            <button
                              type="button"
                              className="users-action-btn users-action-btn--rose"
                              title="O‘chirish"
                              onClick={() => openBlock(user)}
                            >
                              <Trash2 className="w-4 h-4" strokeWidth={2} />
                            </button>
                          )}
                          {!canUsersUpdate && !canUsersDelete && (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          total={filteredUsers.length}
          page={currentPage}
          pageSize={pageSize}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          unitLabel="foydalanuvchi"
          pageSizeOptions={[5, 10, 20]}
        />
      </div>

      {(action === 'create' || action === 'edit') && (
        <div className="confirm-dialog-root" role="presentation">
          <button type="button" className="confirm-dialog-backdrop" aria-label="Yopish" onClick={closeDialog} />
          <div className="confirm-dialog admin-user-dialog" role="dialog" aria-modal="true">
            <button type="button" className="confirm-dialog__close" aria-label="Yopish" onClick={closeDialog}>
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
            <div className="confirm-dialog__header">
              <div className="confirm-dialog__icon">
                <UserPlus className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <h2 className="confirm-dialog__title">
                {action === 'create' ? 'Foydalanuvchi yaratish' : 'Foydalanuvchini tahrirlash'}
              </h2>
            </div>

            <form className="admin-user-form" onSubmit={submitForm}>
              <section className="admin-user-section">
                <div className="admin-user-section__title">
                  <strong>Shaxsiy ma’lumotlar</strong>
                  <span aria-hidden />
                </div>
                <div className="admin-user-section__grid admin-user-section__grid--identity">
                  <label className="admin-field">
                    <span>Familiya</span>
                    <div className="admin-field-control">
                      <UserRound aria-hidden />
                      <input
                        value={form.lastName}
                        onChange={e => updateNameField('lastName', e.target.value)}
                        placeholder="Masalan: Karimov"
                      />
                    </div>
                  </label>
                  <label className="admin-field">
                    <span>Ism</span>
                    <div className="admin-field-control">
                      <UserRound aria-hidden />
                      <input
                        value={form.firstName}
                        onChange={e => updateNameField('firstName', e.target.value)}
                        placeholder="Masalan: Ali"
                      />
                    </div>
                  </label>
                  <label className="admin-field">
                    <span>Otasining ismi</span>
                    <div className="admin-field-control">
                      <UserRound aria-hidden />
                      <input
                        value={form.middleName}
                        onChange={e => updateNameField('middleName', e.target.value)}
                        placeholder="Masalan: Anvarovich"
                      />
                    </div>
                  </label>
                </div>
              </section>

              <section className="admin-user-section">
                <div className="admin-user-section__title">
                  <strong>Tizim ma’lumotlari</strong>
                  <span aria-hidden />
                </div>
                <div className="admin-user-section__grid admin-user-section__grid--system">
                  <label className="admin-field">
                    <span>Login <em>*</em></span>
                    <div className="admin-field-control">
                      <UserRound aria-hidden />
                      <input
                        required
                        autoComplete="off"
                        value={form.username}
                        onChange={e => setForm(f => ({ ...f, username: loginPart(e.target.value) }))}
                        placeholder="Masalan: karimovaa"
                      />
                    </div>
                  </label>
                  <label className="admin-field">
                    <span>{action === 'create' ? 'Parol' : 'Yangi parol'} {action === 'create' ? <em>*</em> : null}</span>
                    <div className="admin-field-control admin-field-control--password">
                      <LockKeyhole aria-hidden />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required={action === 'create'}
                        autoComplete="new-password"
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        placeholder={action === 'create' ? 'Parol kiriting' : 'O‘zgartirilmasa bo‘sh qoldiring'}
                      />
                      <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}>
                        {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                      </button>
                    </div>
                    <label className="flex items-center gap-2 pt-1.5 pb-0.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.mustChangePassword}
                        onChange={e => setForm(f => ({ ...f, mustChangePassword: e.target.checked }))}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        Birinchi kirishda parolni almashtirish majburiy
                      </span>
                    </label>
                  </label>
                  <label className="admin-field">
                    <span>Rol <em>*</em></span>
                    <div className="relative">
                      <button
                        ref={roleButtonRef}
                        type="button"
                        onClick={() => {
                          setIsRoleOpen(prev => !prev);
                          setIsPositionOpen(false);
                        }}
                        className={`admin-field-control w-full min-h-[3.15rem] h-auto py-2 px-3 flex items-center justify-between gap-2 text-left bg-white dark:bg-slate-950 hover:border-blue-400 cursor-pointer transition-colors ${
                          isRoleOpen ? 'border-blue-500 ring-2 ring-blue-500/15' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {(() => {
                            const SelectedRoleIcon = (form.role && ROLE_META[form.role]?.icon) || UserPlus;
                            return <SelectedRoleIcon aria-hidden className="w-4 h-4 text-slate-500 shrink-0" />;
                          })()}
                          <span
                            className={`text-sm leading-snug break-words flex-1 ${
                              form.role
                                ? 'text-slate-800 dark:text-slate-100 font-medium'
                                : 'text-slate-400 font-normal'
                            }`}
                          >
                            {ROLE_LABELS[form.role] || 'Rolni tanlang'}
                          </span>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                            isRoleOpen ? 'rotate-180 text-blue-500' : ''
                          }`}
                        />
                      </button>

                      <PortalDropdown
                        isOpen={isRoleOpen}
                        onClose={() => setIsRoleOpen(false)}
                        triggerRef={roleButtonRef}
                      >
                        {roleOptions.map(role => {
                          const RoleIcon = ROLE_META[role]?.icon || UserPlus;
                          const isSelected = form.role === role;
                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() => handleRoleSelect(role)}
                              className={`w-full rounded-lg px-3 py-2 text-left text-sm leading-snug break-words transition flex items-center gap-2.5 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300 ${
                                isSelected
                                  ? 'bg-blue-50 text-blue-700 font-semibold dark:bg-blue-950/80 dark:text-blue-200'
                                  : 'text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <RoleIcon className="w-4 h-4 shrink-0 opacity-75" />
                              <span>{ROLE_LABELS[role]}</span>
                            </button>
                          );
                        })}
                      </PortalDropdown>
                    </div>
                  </label>
                </div>
              </section>

              <section className="admin-user-section">
                <div className="admin-user-section__title">
                  <strong>Ish ma’lumotlari</strong>
                  <span aria-hidden />
                </div>
                <div className="admin-user-section__grid admin-user-section__grid--work">
                  <label className="admin-field">
                    <span>Bo‘limning to‘liq nomi <em>*</em></span>
                    <div className="admin-field-control bg-slate-50 dark:bg-slate-900/60 min-h-[3.25rem] h-auto py-2 px-3 flex items-center gap-2.5">
                      <Building2 aria-hidden className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className={`text-sm leading-snug break-words flex-1 select-none ${
                        form.department ? 'font-medium text-slate-700 dark:text-slate-200' : 'font-normal text-slate-400'
                      }`}>
                        {form.department || 'Avval rolni tanlang'}
                      </span>
                    </div>
                  </label>
                  <label className="admin-field">
                    <div className="flex items-center justify-between">
                      <span>Lavozimi / mutaxassisligi <em>*</em></span>
                      {form.department && (
                        <button
                          type="button"
                          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline font-normal cursor-pointer"
                          onClick={() => {
                            setIsCustomPosition(prev => !prev);
                            setIsPositionOpen(false);
                            if (isCustomPosition) {
                              setForm(f => ({ ...f, position: '' }));
                            }
                          }}
                        >
                          {isCustomPosition ? 'Ro‘yxatdan tanlash' : 'Qo‘lda kiritish'}
                        </button>
                      )}
                    </div>
                    {isCustomPosition ? (
                      <div className="admin-field-control min-h-[3.25rem] h-auto py-2 px-3 flex items-center gap-2.5">
                        <BriefcaseBusiness aria-hidden className="w-4 h-4 text-slate-400 shrink-0" />
                        <textarea
                          rows={form.position.length > 30 ? 2 : 1}
                          required
                          value={form.position}
                          onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                          placeholder="Lavozimni kiriting"
                          className="w-full min-w-0 resize-none border-0 !p-0 text-sm bg-transparent outline-none text-slate-800 dark:text-slate-100 leading-snug"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div className="relative">
                        <button
                          ref={positionButtonRef}
                          type="button"
                          disabled={!form.department}
                          onClick={() => {
                            setIsPositionOpen(prev => !prev);
                            setIsRoleOpen(false);
                          }}
                          className={`admin-field-control w-full min-h-[3.25rem] h-auto py-2 px-3 flex items-center justify-between gap-2 text-left transition-colors ${
                            !form.department
                              ? 'opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-900/40'
                              : 'bg-white dark:bg-slate-950 hover:border-blue-400 cursor-pointer'
                          } ${isPositionOpen ? 'border-blue-500 ring-2 ring-blue-500/15' : ''}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <BriefcaseBusiness aria-hidden className="w-4 h-4 text-slate-400 shrink-0" />
                            <span
                              className={`text-sm leading-snug break-words flex-1 ${
                                form.position
                                  ? 'text-slate-800 dark:text-slate-100 font-medium'
                                  : 'text-slate-400 font-normal'
                              }`}
                            >
                              {form.position || (form.department ? 'Lavozimni tanlang' : 'Avval bo‘limni tanlang')}
                            </span>
                          </div>
                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                              isPositionOpen ? 'rotate-180 text-blue-500' : ''
                            }`}
                          />
                        </button>

                        <PortalDropdown
                          isOpen={isPositionOpen && Boolean(form.department)}
                          onClose={() => setIsPositionOpen(false)}
                          triggerRef={positionButtonRef}
                        >
                          {positionOptions.map(pos => (
                            <button
                              key={pos}
                              type="button"
                              onClick={() => {
                                setForm(f => ({ ...f, position: pos }));
                                setIsPositionOpen(false);
                              }}
                              className={`w-full rounded-lg px-3 py-2 text-left text-sm leading-snug break-words transition hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300 ${
                                form.position === pos
                                  ? 'bg-blue-50 text-blue-700 font-semibold dark:bg-blue-950/80 dark:text-blue-200'
                                  : 'text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {pos}
                            </button>
                          ))}
                          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomPosition(true);
                              setForm(f => ({ ...f, position: '' }));
                              setIsPositionOpen(false);
                            }}
                            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/60 flex items-center gap-1.5"
                          >
                            <span>✏️ Boshqa (qo‘lda kiritish)...</span>
                          </button>
                        </PortalDropdown>
                      </div>
                    )}
                  </label>
                </div>
              </section>

              {message && <p className="confirm-dialog__error">{message}</p>}

              <div className="confirm-dialog__actions">
                <button type="button" className="btn-secondary confirm-dialog__btn" onClick={closeDialog}>
                  Bekor qilish
                </button>
                <button type="submit" className="btn-primary confirm-dialog__btn">
                  {action === 'create' ? 'Yaratish' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={action === 'block'}
        title="Foydalanuvchini o'chirish"
        message={selected ? `${selected.fullName} (${selected.username}) o'chirilsinmi?` : ''}
        confirmLabel="O'chirish"
        variant="danger"
        error={message || undefined}
        onConfirm={handleDeleteUser}
        onCancel={closeDialog}
      />

      <ConfirmDialog
        open={action === 'reset'}
        title="Parolni tiklash"
        message={selected ? `${selected.fullName} uchun parol tiklansinmi?` : ''}
        confirmLabel="Tiklash"
        error={message || undefined}
        onConfirm={handleResetPassword}
        onCancel={closeDialog}
      />
    </div>
  );
}
