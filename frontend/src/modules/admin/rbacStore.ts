import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../../shared/services/api';
import { useAuth } from '../../shared/contexts/AuthContext';
import { notifyOrdersChanged, subscribeOrdersChanged } from '../../shared/utils/realtimeSync';
import {
  ALL_MENU_ITEMS,
  RBAC_ACTIONS,
  RBAC_MODULES,
  RBAC_RESOURCES,
  RBAC_ROLES,
  ROLE_MENUS,
  ROLE_MODULES,
  slugifyRoleCode,
  type CrudFlag,
  type RbacActionDef,
  type RbacResourceDef,
  type RbacRoleDef,
  type RbacTone,
  type RbacWorkflowAction,
} from './rbacCatalog';

const STORAGE_KEY = 'etransport_rbac_v15';

export interface RbacState {
  roles: RbacRoleDef[];
  menusByRole: Record<string, string[]>;
  modulesByRole: Record<string, string[]>;
  resources: RbacResourceDef[];
  actions: RbacActionDef[];
}

function buildDefaultState(): RbacState {
  return {
    roles: RBAC_ROLES.map(r => ({ ...r, isSystem: r.isSystem ?? true })),
    menusByRole: { ...ROLE_MENUS },
    modulesByRole: Object.fromEntries(
      Object.entries(ROLE_MODULES).map(([k, v]) => [k, [...v]]),
    ),
    resources: RBAC_RESOURCES.map(res => ({
      ...res,
      crudRoles: {
        C: [...res.crudRoles.C],
        R: [...res.crudRoles.R],
        U: [...res.crudRoles.U],
        D: [...res.crudRoles.D],
      },
      workflowActions: (res.workflowActions || []).map(w => ({ ...w, roles: [...w.roles] })),
    })),
    actions: RBAC_ACTIONS.map(a => ({ ...a, roles: [...a.roles], flags: [...a.flags] })),
  };
}

function mergeLoadedState(parsed: Partial<RbacState> | null | undefined): RbacState {
  const defaults = buildDefaultState();
  if (!parsed || typeof parsed !== 'object') return defaults;

  // Ensure all default system roles exist in the roles list even if loaded from older config
  const loadedRoles = Array.isArray(parsed.roles) ? parsed.roles : [];
  const roleMap = new Map<string, RbacRoleDef>();
  defaults.roles.forEach(r => roleMap.set(r.key, r));
  loadedRoles.forEach(r => {
    const existing = roleMap.get(r.key);
    roleMap.set(r.key, existing ? { ...existing, ...r } : r);
  });
  const mergedRoles = Array.from(roleMap.values());

  const defaultActionMap = new Map(defaults.actions.map(def => [def.key, def]));

  const loadedActions = Array.isArray(parsed.actions)
    ? parsed.actions.filter(Boolean).map(a => {
      const def = defaultActionMap.get(a.key);
      const safeFlags: CrudFlag[] = (Array.isArray(a?.flags) && a.flags.length > 0 ? a.flags : (def?.flags && def.flags.length > 0 ? def.flags : (
        a.key.endsWith('.create') ? ['C'] :
        a.key.endsWith('.read') || a.key.endsWith('.view') ? ['R'] :
        a.key.endsWith('.update') || a.key.endsWith('.edit') ? ['U'] :
        a.key.endsWith('.delete') || a.key.endsWith('.remove') ? ['D'] : ['A']
      ))) as CrudFlag[];
      const safeRoles = Array.isArray(a?.roles) ? a.roles : (def?.roles || []);
      return {
        ...def,
        ...a,
        label: a.label || def?.label || a.key,
        description: a.description || def?.description || '',
        module: a.module || def?.module || 'admin',
        order: a.order ?? def?.order,
        roles: safeRoles,
        flags: safeFlags,
      };
    })
    : [];
  const mergedActions = (loadedActions.length
    ? [
      ...loadedActions,
      ...defaults.actions.filter(def => !loadedActions.some(saved => saved?.key === def.key)),
    ]
    : defaults.actions).map(a => {
      const def = defaultActionMap.get(a.key);
      const safeFlags: CrudFlag[] = (Array.isArray(a?.flags) && a.flags.length > 0 ? a.flags : (def?.flags && def.flags.length > 0 ? def.flags : ['A'])) as CrudFlag[];
      return {
        ...def,
        ...a,
        roles: Array.isArray(a?.roles) ? a.roles : [],
        flags: safeFlags,
      };
    });

  const loadedResources = Array.isArray(parsed.resources) ? parsed.resources : [];
  const resMap = new Map<string, RbacResourceDef>();
  defaults.resources.forEach(r => resMap.set(r.key, r));
  loadedResources.forEach(r => {
    const existing = resMap.get(r.key);
    resMap.set(r.key, existing ? { ...existing, ...r } : r);
  });
  const mergedResources = Array.from(resMap.values());

  const mergedMenusByRole: Record<string, string[]> = { ...defaults.menusByRole };
  if (parsed.menusByRole && typeof parsed.menusByRole === 'object') {
    Object.entries(parsed.menusByRole).forEach(([k, v]) => {
      if (Array.isArray(v)) mergedMenusByRole[k] = v;
    });
  }

  const mergedModulesByRole: Record<string, string[]> = { ...defaults.modulesByRole };
  if (parsed.modulesByRole && typeof parsed.modulesByRole === 'object') {
    Object.entries(parsed.modulesByRole).forEach(([k, v]) => {
      if (Array.isArray(v)) mergedModulesByRole[k] = v;
    });
  }

  return {
    roles: mergedRoles,
    menusByRole: mergedMenusByRole,
    modulesByRole: mergedModulesByRole,
    resources: mergedResources,
    actions: mergedActions,
  };
}

function loadLocalState(): RbacState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaultState();
    return mergeLoadedState(JSON.parse(raw) as Partial<RbacState>);
  } catch {
    return buildDefaultState();
  }
}

function persistLocal(state: RbacState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const TONES: RbacTone[] = ['blue', 'emerald', 'violet', 'amber', 'cyan', 'rose', 'indigo', 'sky'];

type RbacStoreValue = ReturnType<typeof useRbacStoreState>;

const RbacContext = createContext<RbacStoreValue | null>(null);

function useRbacStoreState() {
  const { user } = useAuth();
  const [state, setState] = useState<RbacState>(() => loadLocalState());
  const [dirty, setDirty] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const skipNextPersist = useRef(false);

  // Serverdan yuklash — barcha foydalanuvchilar uchun bir xil manba
  const reloadFromServer = useCallback(() => {
    if (!user) return;
    setSyncing(true);
    setSyncError('');

    api.getRbac()
      .then(res => {
        if (res.data) {
          const next = mergeLoadedState(res.data as Partial<RbacState>);
          skipNextPersist.current = true;
          setState(next);
          persistLocal(next);
          setDirty(false);
        }
      })
      .catch(() => {
        setSyncError('RBAC sozlamalarini yuklab bo\'lmadi');
      })
      .finally(() => {
        setHydrated(true);
        setSyncing(false);
      });
  }, [user]);

  useEffect(() => {
    reloadFromServer();
    return subscribeOrdersChanged(() => {
      // Boshqa oynada yoki admin tomonidan o'zgartirilganda yangilash
      const local = loadLocalState();
      setState(local);
    });
  }, [reloadFromServer, user?.username, user?.role]);

  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    persistLocal(state);
  }, [state]);

  // Admin o'zgarishlarini serverga darhol yozish
  const saveStateToServer = useCallback((nextState: RbacState) => {
    const isAdmin = user?.role === 'Admin' || user?.role?.toLowerCase() === 'admin' || user?.role === 'Administrator';
    if (!isAdmin) return;
    setSyncing(true);
    setSyncError('');
    api.saveRbac(nextState)
      .then(() => {
        setDirty(false);
        setSyncError('');
        notifyOrdersChanged();
      })
      .catch(err => {
        setSyncError(err instanceof Error ? err.message : 'RBAC saqlanmadi');
      })
      .finally(() => setSyncing(false));
  }, [user?.role]);

  const update = useCallback((updater: (prev: RbacState) => RbacState) => {
    setState(prev => {
      const next = updater(prev);
      persistLocal(next);
      saveStateToServer(next);
      return next;
    });
    setDirty(true);
  }, [saveStateToServer]);

  const createRole = useCallback((input: {
    label: string;
    seedUser?: string;
    code?: string;
    department?: string;
    description: string;
    tone?: RbacTone;
    iconName?: string;
  }) => {
    const code = (input.code?.trim() || input.seedUser?.trim() || slugifyRoleCode(input.label)).replace(/\s+/g, '');
    const exists = state.roles.some(r => r.key.toLowerCase() === code.toLowerCase());
    if (exists) throw new Error('Bu kod/login bilan rol allaqachon mavjud');

    const role: RbacRoleDef = {
      key: code,
      label: input.label.trim(),
      department: input.department?.trim() || '',
      description: input.description.trim(),
      tone: input.tone ?? TONES[state.roles.length % TONES.length],
      seedUser: input.seedUser?.trim() || code.toLowerCase(),
      isSystem: false,
      iconName: input.iconName || 'shield',
    };

    setState(prev => ({
      ...prev,
      roles: [...prev.roles, role],
      menusByRole: { ...prev.menusByRole, [code]: ['dashboard'] },
      modulesByRole: { ...prev.modulesByRole, [code]: [] },
    }));
    setDirty(true);
    return code;
  }, [state.roles]);

  const deleteRole = useCallback((key: string) => {
    const role = state.roles.find(r => r.key === key);
    if (!role || role.isSystem) {
      throw new Error('Tizim rolini o\'chirib bo\'lmaydi');
    }
    setState(prev => {
      const { [key]: _m, ...menusByRole } = prev.menusByRole;
      const { [key]: _mod, ...modulesByRole } = prev.modulesByRole;
      return {
        ...prev,
        roles: prev.roles.filter(r => r.key !== key),
        menusByRole,
        modulesByRole,
        actions: prev.actions.map(a => ({
          ...a,
          roles: a.roles.filter(r => r !== key),
        })),
      };
    });
    setDirty(true);
  }, [state.roles]);

  const updateRole = useCallback((key: string, patch: Partial<Pick<RbacRoleDef, 'key' | 'label' | 'seedUser' | 'department' | 'description' | 'tone' | 'iconName'>>, newKey?: string) => {
    update(prev => {
      const targetKey = newKey && newKey.trim() && newKey.trim() !== key ? newKey.trim() : (patch.key || key);
      let nextMenus = { ...prev.menusByRole };
      let nextModules = { ...prev.modulesByRole };
      let nextActions = prev.actions;
      if (targetKey !== key) {
        if (nextMenus[key]) {
          nextMenus[targetKey] = nextMenus[key];
          delete nextMenus[key];
        }
        if (nextModules[key]) {
          nextModules[targetKey] = nextModules[key];
          delete nextModules[key];
        }
        nextActions = prev.actions.map(a => ({
          ...a,
          roles: a.roles.map(r => (r === key ? targetKey : r)),
        }));
      }
      return {
        ...prev,
        roles: prev.roles.map(r => (r.key === key ? { ...r, ...patch, key: targetKey } : r)),
        menusByRole: nextMenus,
        modulesByRole: nextModules,
        actions: nextActions,
      };
    });
  }, [update]);

  const setRoleMenus = useCallback((roleKey: string, menuKeys: string[]) => {
    update(prev => ({
      ...prev,
      menusByRole: { ...prev.menusByRole, [roleKey]: menuKeys },
    }));
  }, [update]);

  const toggleRoleMenu = useCallback((roleKey: string, menuKey: string) => {
    update(prev => {
      const current = prev.menusByRole[roleKey] ?? [];
      const next = current.includes(menuKey)
        ? current.filter(k => k !== menuKey)
        : [...current, menuKey];
      return {
        ...prev,
        menusByRole: { ...prev.menusByRole, [roleKey]: next },
      };
    });
  }, [update]);

  const toggleRoleModule = useCallback((roleKey: string, moduleKey: string) => {
    update(prev => {
      const current = prev.modulesByRole[roleKey] ?? [];
      const next = current.includes(moduleKey)
        ? current.filter(k => k !== moduleKey)
        : [...current, moduleKey];
      return {
        ...prev,
        modulesByRole: { ...prev.modulesByRole, [roleKey]: next },
      };
    });
  }, [update]);

  const toggleActionRole = useCallback((actionKey: string, roleKey: string) => {
    update(prev => ({
      ...prev,
      actions: (prev.actions ?? []).map(a => {
        if (a.key !== actionKey) return a;
        const currentRoles = Array.isArray(a.roles) ? a.roles : [];
        const has = currentRoles.includes(roleKey);
        return {
          ...a,
          roles: has ? currentRoles.filter(r => r !== roleKey) : [...currentRoles, roleKey],
        };
      }),
    }));
  }, [update]);

  // Ustun bo'yicha ommaviy tayinlash: berilgan amallar to'plamiga rolni yoqish/o'chirish
  const bulkSetActionRole = useCallback((actionKeys: string[], roleKey: string, on: boolean) => {
    const keySet = new Set(actionKeys);
    update(prev => ({
      ...prev,
      actions: (prev.actions ?? []).map(a => {
        if (!keySet.has(a.key)) return a;
        const currentRoles = Array.isArray(a.roles) ? a.roles : [];
        const has = currentRoles.includes(roleKey);
        if (on && !has) return { ...a, roles: [...currentRoles, roleKey] };
        if (!on && has) return { ...a, roles: currentRoles.filter(r => r !== roleKey) };
        return { ...a, roles: currentRoles };
      }),
    }));
  }, [update]);

  const createAction = useCallback((input: {
    label: string;
    module: string;
    description: string;
    flags: CrudFlag[];
    roles: string[];
  }) => {
    const key = `custom.${slugifyRoleCode(input.label).toLowerCase()}.${Date.now().toString(36)}`;
    update(prev => ({
      ...prev,
      actions: [
        ...prev.actions,
        {
          key,
          module: input.module,
          label: input.label.trim(),
          description: input.description.trim() || key,
          flags: input.flags.length ? input.flags : ['A'],
          roles: input.roles,
        },
      ],
    }));
  }, [update]);

  const updateAction = useCallback((key: string, patch: Partial<Pick<RbacActionDef, 'label' | 'module' | 'description' | 'flags' | 'roles'>>) => {
    update(prev => ({
      ...prev,
      actions: prev.actions.map(a => (a.key === key ? { ...a, ...patch } : a)),
    }));
  }, [update]);

  const toggleResourceCrud = useCallback((resourceKey: string, flag: 'C' | 'R' | 'U' | 'D', roleKey: string) => {
    update(prev => ({
      ...prev,
      resources: prev.resources.map(res => {
        if (res.key !== resourceKey) return res;
        const currentList = res.crudRoles[flag] ?? [];
        const nextList = currentList.includes(roleKey)
          ? currentList.filter(r => r !== roleKey)
          : [...currentList, roleKey];
        return {
          ...res,
          crudRoles: {
            ...res.crudRoles,
            [flag]: nextList,
          },
        };
      }),
    }));
  }, [update]);

  const toggleResourceWorkflow = useCallback((resourceKey: string, actionKey: string, roleKey: string) => {
    update(prev => ({
      ...prev,
      resources: prev.resources.map(res => {
        if (res.key !== resourceKey) return res;
        const nextWorkflow = (res.workflowActions || []).map(w => {
          if (w.key !== actionKey) return w;
          const has = w.roles.includes(roleKey);
          return {
            ...w,
            roles: has ? w.roles.filter(r => r !== roleKey) : [...w.roles, roleKey],
          };
        });
        return {
          ...res,
          workflowActions: nextWorkflow,
        };
      }),
    }));
  }, [update]);

  const createResource = useCallback((input: {
    label: string;
    module: string;
    description: string;
    apiPath?: string;
    crudRoles?: { C: string[]; R: string[]; U: string[]; D: string[] };
    workflowActions?: RbacWorkflowAction[];
  }) => {
    const key = `res_${slugifyRoleCode(input.label).toLowerCase()}_${Date.now().toString(36)}`;
    const newRes: RbacResourceDef = {
      key,
      module: input.module,
      label: input.label.trim(),
      description: input.description.trim() || key,
      apiPath: input.apiPath?.trim() || `/api/${key}`,
      crudRoles: input.crudRoles ?? { C: [], R: [], U: [], D: [] },
      workflowActions: input.workflowActions ?? [],
    };
    update(prev => ({
      ...prev,
      resources: [...prev.resources, newRes],
    }));
  }, [update]);

  const updateResource = useCallback((key: string, patch: Partial<RbacResourceDef>) => {
    update(prev => ({
      ...prev,
      resources: prev.resources.map(res => (res.key === key ? { ...res, ...patch } : res)),
    }));
  }, [update]);

  const deleteResource = useCallback((key: string) => {
    update(prev => ({
      ...prev,
      resources: prev.resources.filter(res => res.key !== key),
    }));
  }, [update]);

  const deleteAction = useCallback((key: string) => {
    update(prev => ({
      ...prev,
      actions: prev.actions.filter(a => a.key !== key),
    }));
  }, [update]);

  const resetToDefaults = useCallback(() => {
    const next = buildDefaultState();
    setState(next);
    persistLocal(next);
    setDirty(true);
  }, []);

  const markSaved = useCallback(() => setDirty(false), []);

  const allMenus = useMemo(() => ALL_MENU_ITEMS, []);
  const allModules = useMemo(() => RBAC_MODULES, []);

  return {
    state,
    dirty,
    hydrated,
    syncing,
    syncError,
    allMenus,
    allModules,
    createRole,
    updateRole,
    deleteRole,
    setRoleMenus,
    toggleRoleMenu,
    toggleRoleModule,
    toggleActionRole,
    bulkSetActionRole,
    createAction,
    updateAction,
    deleteAction,
    toggleResourceCrud,
    toggleResourceWorkflow,
    createResource,
    updateResource,
    deleteResource,
    resetToDefaults,
    markSaved,
  };
}

export function RbacProvider({ children }: { children: ReactNode }) {
  const value = useRbacStoreState();
  return createElement(RbacContext.Provider, { value }, children);
}

export function useRbacStore() {
  const ctx = useContext(RbacContext);
  if (!ctx) {
    throw new Error('useRbacStore must be used within RbacProvider');
  }
  return ctx;
}
